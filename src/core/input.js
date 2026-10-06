// Input: every finger on its own, a stream for the place, no modes to learn (owner: engine; docs/ENGINE.md "Touch").
// One finger never moves the picture.
//
//   Touch and lift            -> a tap: a way on (exit) walks there; else scene.tap(p); else on a cloud rain; else
//                                one soft note.
//   Touch and rest on a cloud -> (scene.hold(p) did not answer) rain growing to a storm while the finger rests.
//   The cloud icon (clouds.js) -> a button: a tap rains, a rest brings a storm; the place and the gestures never see it.
//   Touch and move            -> a stroke: scene.stroke(s) at input rate (coalesced events), begin / move / end.
//   Touch and rest            -> after 0.26 s scene.hold(p) once, and the stroke begins (speed 0) if it had not.
//   scene.press(p) -> true    -> the scene owns that finger: drag(p) on moves, release(p) on lift, no stroke; it still
//                                takes part in the world gestures (a circle still calls the wind).
//   scene.press(p) -> 'mine'  -> the same, and the finger is kept out of the world gestures too (dragging a thing).
//   A finger on the sun/moon  -> it turns the wheel of the day (gestures.js); the scene does not see it.
// World gestures (gestures.js) are recognised on top of the same fingers without taking them from the place.
// Default touch magic: every finger sheds rising sparks; a stroke or rest the place does not answer (stroke and hold
// return nothing truthy for a moment) sings soft notes through audio.paint, so stroking empty sky still plays.
//
// Objects handed to scenes are reused per finger; copy what you keep.
//   p = {id, x, y, sx, sy, t0, over}            world units; sx, sy 0..1 of the screen; over = region name
//   s = {id, phase, x, y, sx, sy, t, dx, dy, speed, length, points, n, over, fingers, held}
//       points[0..n-1] = {x, y, t}: every input sample since the last call (the newest last); dx, dy = unit direction;
//       speed in world units per second; length = distance so far; fingers = how many are down; held = resting

import { safe, clamp } from './util.js';
import { SPARK } from './fx.js';

export const HOLD = 0.26;          // seconds still before a touch counts as resting
const SLOP_FRAC = 0.012;           // movement (fraction of screen height) that turns a touch into a stroke
const ANSWER_GAP = 0.3;            // seconds without an answer from the place before the soft notes sing
const NPTS = 96;

export function createInput(c) {
  // c: {canvas, stage, camera, node(), blocked(), audio(), fx, gestures, now(), regionAt(x, y), skyHit(cx, cy),
  //     exitTap(p), onActivity(), onDown(), sound(name, opts), clouds (core/clouds.js),
  //     hushed() -> the place shown is quiet (def.quiet / scene.quiet: no soft notes, no world gestures, no sparks)}
  const ptrs = new Map();
  const list = [];           // active finger records (fx draws hold rings from it; no allocation per frame)
  const pool = [];
  const G = c.gestures;

  function slop() { return Math.max(6, c.stage.cssH * SLOP_FRAC); }
  function worldOf(cssX, cssY, out) {
    const v = c.camera.view, st = c.stage;
    out.x = v.x + (cssX / st.cssW) * v.w;
    out.y = v.y + (cssY / st.cssH) * v.h;
    return out;
  }
  function toWorld(r) {
    worldOf(r.cssX, r.cssY, r);
    const p = r.p, st = c.stage;
    p.x = r.x; p.y = r.y; p.sx = r.cssX / st.cssW; p.sy = r.cssY / st.cssH;
  }
  function rec(e) {
    let r = pool.pop();
    if (!r) {
      r = { p: { id: 0, x: 0, y: 0, sx: 0, sy: 0, t0: 0, over: '' }, s: null };
      const pts = []; for (let i = 0; i < NPTS; i++) pts.push({ x: 0, y: 0, t: 0 });
      r.s = { id: 0, phase: '', x: 0, y: 0, sx: 0, sy: 0, t: 0, dx: 1, dy: 0, speed: 0, length: 0, points: pts, n: 0, over: '', fingers: 1, held: false };
    }
    r.id = e.pointerId; r.touch = e.pointerType === 'touch'; r.mode = 'pending'; r.mine = false; r.cloud = false; r.gest = false; r.sky = null; r.others = 0; r.held = false; r.singing = false; r.answeredT = -1e9;
    r.cssX = r.startX = e.clientX; r.cssY = r.startY = e.clientY;
    r.t0 = c.now(); r.evT = r.downT = performance.now(); r.moved = 0; r.holdK = 0; r.trail = 0;
    r.vx = 0; r.vy = 0; r.wx = 0; r.wy = 0;
    r.p.id = e.pointerId; r.p.t0 = r.t0;
    toWorld(r);
    r.p.over = c.regionAt(r.x, r.y);
    const s = r.s;
    s.id = r.id; s.length = 0; s.speed = 0; s.dx = 1; s.dy = 0; s.n = 0; s.held = false;
    s.x = r.x; s.y = r.y;
    pushPoint(r, r.x, r.y, r.t0);
    return r;
  }
  function pushPoint(r, x, y, t) {
    const s = r.s;
    if (s.n >= NPTS) { for (let i = 1; i < NPTS; i++) { const a = s.points[i - 1], b = s.points[i]; a.x = b.x; a.y = b.y; a.t = b.t; } s.n = NPTS - 1; }
    const q = s.points[s.n++]; q.x = x; q.y = y; q.t = t;
  }
  function scene() { const n = c.node(); return n && n.scene; }
  function call(fn, a, b) {
    const sc = scene(); if (!sc || typeof sc[fn] !== 'function') return undefined;
    try { return sc[fn](a, b); } catch (e) { safe(`scene.${fn}`, () => { throw e; }); return undefined; }
  }
  // audio.paint signatures (docs/AUDIO.md): start(p, view, id), move(p, id), end(id), tap(p, view)
  function audioPaint(fn, p, view) {
    const au = c.audio(); const pa = au && au.paint;
    if (!pa) return;
    safe(`audio.paint.${fn}`, () => {
      if (fn === 'start') pa.start && pa.start(p, view, p.id);
      else if (fn === 'move') pa.move && pa.move(p, p.id);
      else if (fn === 'end') pa.end && pa.end(p.id);
      else if (fn === 'tap') {
        if (typeof pa.tap === 'function') pa.tap(p, view);
        else if (pa.start && pa.end) { pa.start(p, view, 'tap'); pa.end('tap'); }
      }
    });
  }

  /** Hand the stroke to the place; sing the soft notes where it does not answer. */
  function deliver(r, phase) {
    const s = r.s, st = c.stage;
    s.phase = phase; s.x = r.x; s.y = r.y; s.sx = r.cssX / st.cssW; s.sy = r.cssY / st.cssH; s.t = c.now();
    s.fingers = list.length; s.speed = Math.hypot(r.vx, r.vy) * (c.camera.view.h / st.cssH);
    s.held = r.holdK >= 1;
    s.over = r.p.over;
    const took = call('stroke', s) === true;
    s.n = 0;
    const now = c.now();
    if (took) r.answeredT = now;
    if (phase === 'end') { if (r.singing) { audioPaint('end', r.p); r.singing = false; } return; }
    // soft notes: not in a quiet place (def.quiet), and not for fingers making a hand gesture (gestures.js marks `gest`)
    const quiet = now - r.answeredT > ANSWER_GAP && !c.hushed() && !r.gest;
    if (quiet && !r.singing) { r.singing = true; audioPaint('start', r.p, c.camera.view); }
    else if (!quiet && r.singing) { r.singing = false; audioPaint('end', r.p); }
    else if (r.singing && phase === 'move') audioPaint('move', r.p);
  }

  /** The answer to a quick tap. Returns true if something in the picture took it. */
  function tapAnswer(p, patter) {
    p.over = c.regionAt(p.x, p.y);
    if (patter) { // quick taps of several fingers: the place still answers (a flower may grow), a cloud still rains,
      // but no way on is walked by accident and the taps themselves make no weather (owner, BRIEF 24)
      if (call('tap', p) === true) c.fx.sparkle(p.x, p.y, 5);
      else c.clouds.tap(p);
      return true;
    }
    if (c.exitTap(p)) return true;
    if (call('tap', p) === true) { c.fx.sparkle(p.x, p.y, 7); return true; }
    if (c.clouds.tap(p)) return true;   // a cloud the place did not answer: rain (core/clouds.js)
    if (!c.hushed()) audioPaint('tap', p, c.camera.view);
    c.fx.sparkle(p.x, p.y, 4, 0.6);
    return false;
  }

  function finish(r, cancelled) {
    const nowMs = performance.now();
    const tapped = !cancelled && r.mode === 'pending' && r.moved < slop();
    const patter = G.up(r, list, tapped, nowMs);
    if (r.mode === 'stroke') deliver(r, 'end');
    else if (r.mode === 'scene') call('release', r.p);
    else if (r.mode === 'cloud') { if (!cancelled && !r.held && r.moved < slop()) { toWorld(r); c.clouds.tap(r.p); } c.clouds.release(); }
    else if (tapped) tapAnswer(r.p, patter);
    ptrs.delete(r.id);
    const i = list.indexOf(r); if (i >= 0) list.splice(i, 1);
    r.mode = 'done';
    pool.push(r);
  }

  function down(e) {
    c.onActivity();
    if (e.button > 0) return;
    if (c.blocked()) return;
    if (ptrs.has(e.pointerId)) finish(ptrs.get(e.pointerId), true);
    // a first finger (isPrimary) means no other finger is on the glass: a touch still listed lost its lift, and would
    // otherwise rest and sing its soft notes until the next place (BRIEF 32); end it now
    if (e.isPrimary && e.pointerType === 'touch') for (let i = list.length - 1; i >= 0; i--) if (list[i].touch) finish(list[i], true);
    try { c.canvas.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    const r = rec(e);
    ptrs.set(r.id, r); list.push(r);
    c.onDown();
    c.fx.ring(r.x, r.y, 0.8);
    c.fx.sparkle(r.x, r.y, 3, 0.45, 0.8, 0.8);
    const sky = c.skyHit(r.cssX, r.cssY);
    if (sky) { r.mode = 'sky'; r.sky = sky; }
    else if (c.clouds.icon(r.p)) r.mode = 'cloud';   // the cloud icon is a button: tap it for rain, hold it for a storm
    else { const pr = call('press', r.p); if (pr === true || pr === 'mine') { r.mode = 'scene'; r.mine = pr === 'mine'; } }
    if (!c.hushed()) G.down(r, list);   // a quiet place has no world gestures
  }

  function sampleTo(r, ev, nowMs) {
    const dtEv = Math.max(0.001, (ev.timeStamp && ev.timeStamp > r.evT - 1000 ? ev.timeStamp - r.evT : nowMs - r.evT) / 1000);
    const dxCss = ev.clientX - r.cssX, dyCss = ev.clientY - r.cssY;
    if (dxCss === 0 && dyCss === 0) return 0;
    r.cssX = ev.clientX; r.cssY = ev.clientY; r.evT = ev.timeStamp || nowMs;
    const kv = clamp(dtEv / 0.05, 0, 1);
    r.vx += (dxCss / dtEv - r.vx) * kv; r.vy += (dyCss / dtEv - r.vy) * kv;
    r.moved = Math.max(r.moved, Math.hypot(r.cssX - r.startX, r.cssY - r.startY));
    const ox = r.x, oy = r.y;
    toWorld(r);
    const d = Math.hypot(r.x - ox, r.y - oy);
    const s = r.s;
    if (d > 0) { s.dx = (r.x - ox) / d; s.dy = (r.y - oy) / d; s.length += d; }
    pushPoint(r, r.x, r.y, c.now() - Math.max(0, nowMs - (ev.timeStamp || nowMs)) / 1000);
    r.trail += Math.hypot(dxCss, dyCss);
    return d;
  }

  function move(e) {
    const r = ptrs.get(e.pointerId); if (!r) return;
    const nowMs = performance.now();
    let evs = null;
    try { evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null; } catch (_) { evs = null; }
    if (evs && evs.length) { for (let i = 0; i < evs.length; i++) sampleTo(r, evs[i], nowMs); }
    else sampleTo(r, e, nowMs);
    r.p.over = r.mode === 'sky' ? '' : c.regionAt(r.x, r.y);
    if (r.mode === 'pending' && r.moved > slop()) { r.mode = 'stroke'; deliver(r, 'begin'); }
    else if (r.mode === 'stroke') deliver(r, 'move');
    else if (r.mode === 'scene') { r.s.n = 0; call('drag', r.p); }
    else r.s.n = 0;
    if (!c.hushed()) G.move(r, list, nowMs);
    // touch magic: sparks shed along the finger's way, more for a quick finger, gold where the soft notes sing
    const step = c.stage.cssH * 0.011;
    if (r.trail > step && r.mode !== 'sky') {
      const sp = Math.hypot(r.vx, r.vy) / c.stage.cssH, k = c.camera.view.h / c.stage.cssH;
      const kk = clamp(sp / 1.4, 0, 1) * (r.mode === 'scene' ? 0.4 : 1);
      if (r.trail > step * 4) r.trail = step * 4; // a very fast finger: do not flood
      while (r.trail > step) {
        r.trail -= step;
        c.fx.trail(r.x, r.y, r.vx * k, r.vy * k, r.singing ? 0.85 : kk, r.singing ? SPARK.GOLD : -1);
      }
    }
  }
  function up(e) { const r = ptrs.get(e.pointerId); if (r) finish(r, false); }
  function cancel(e) { const r = ptrs.get(e.pointerId); if (r) finish(r, true); }

  const cv = c.canvas;
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', cancel);
  cv.addEventListener('lostpointercapture', cancel);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  addEventListener('blur', () => input.endAll());

  const input = {
    list,
    /** per frame: rests, the soft notes of a resting finger, world gestures */
    tick(dt) {
      const nowMs = performance.now();
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        r.others = list.length - 1;
        if (r.mode === 'cloud') {   // a finger resting on the cloud icon: rain growing to a storm while it stays there
          if ((nowMs - r.downT) / 1000 >= HOLD) { r.held = true; toWorld(r); c.clouds.hold(r, dt); }
          continue;
        }
        if (r.mode !== 'pending' && r.mode !== 'stroke') continue;
        if (r.gest && r.singing) { r.singing = false; audioPaint('end', r.p); }   // joined a hand gesture: no more soft notes
        if (nowMs - r.evT > 45) { r.vx *= 0.5; r.vy *= 0.5; } // a finger that stopped has no speed
        r.holdK = (nowMs - r.evT) / 1000 / HOLD; // real time since the finger last moved
        if (r.mode === 'pending') r.holdK = (nowMs - r.downT) / 1000 / HOLD;
        if (r.holdK >= 1 && !r.held) {
          r.held = true;
          toWorld(r); r.p.over = c.regionAt(r.x, r.y);
          if (call('hold', r.p) === true) { r.answeredT = c.now(); c.fx.sparkle(r.x, r.y, 6); }
          else if (c.clouds.at(r.p)) { r.cloud = true; r.answeredT = c.now(); }   // a finger resting on a place's cloud: a storm
          if (r.mode === 'pending') { r.mode = 'stroke'; deliver(r, 'begin'); }
        } else if (r.mode === 'stroke' && r.holdK >= 1 && r.singing === false && c.now() - r.answeredT > ANSWER_GAP) {
          deliver(r, 'move'); // a resting finger the place does not answer starts to sing
        }
        if (r.held && r.cloud) { toWorld(r); if (c.clouds.hold(r, dt)) r.answeredT = c.now(); }
        if (r.holdK < 1) { r.held = false; r.cloud = false; } // moving again: the next rest is a new hold
      }
      if (!c.hushed()) G.tick(dt, list);
      // a safety net: with no finger down nothing may go on painting music (a painted finger left behind would play its
      // arpeggio until the next place; BRIEF 32)
      if (!list.length) { const au = c.audio(), pa = au && au.paint; if (pa && pa.active) safe('audio.paint.end', () => pa.end()); }
    },
    /** end every finger (page hidden, travel) */
    endAll() {
      for (let i = list.length - 1; i >= 0; i--) finish(list[i], true);
    },
    /** scripted tap at world (x, y), same routing as a finger (QG.tap) */
    tapAt(x, y) {
      const n = c.node(); if (!n) return false;
      const v = c.camera.view;
      const p = { id: -1, x, y, sx: (x - v.x) / v.w, sy: (y - v.y) / v.h, t0: c.now(), over: '' };
      c.fx.ring(x, y, 0.8);
      return tapAnswer(p, false);
    },
    get active() { return list.length > 0; },
  };
  return input;
}
