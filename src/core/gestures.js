// World gestures (owner: engine; the design and its reasons are in docs/ENGINE.md "World gestures").
// The same in every place, recognised from the raw fingers input.js tracks, forgiving and scaling with intensity:
//
//   swirl   a finger circling             -> wind rises with the speed and size of the circle; sparks whirl after it
//   patter  quick taps, several fingers   -> no weather any more (owner, BRIEF 24): rain comes from tapping a cloud
//                                            (core/clouds.js); patter only keeps such taps from walking a way on
//   wipe    two or more fingers rubbing   -> the sky is wiped clear (rain, snow, fog)
//   hand    three or more fingers resting -> mist breathes out under the hand (fog)
//   sun     a finger on the sun or moon   -> turns the wheel of the day: pull the sun down for evening and night,
//                                            the moon down for morning; a finger RESTING still on it for about 2 s
//                                            turns the year on by one season (again every further 2 s); a drag never does
//   slide   two fingers sliding down / up -> the same everywhere, also where no sky shows: down darker, up lighter
//   twist   two fingers turning           -> the seasons turn (clockwise onward, back the other way); the second way,
//                                            and the only one where no sun or moon shows (burrows, under the sea)
//
// Places listen with engine.gestures.on(name, cb): cb(info) gets a reused object {name, phase, k, x, y, sx, sy, dir,
// hour, id} (world units; k = live intensity 0..1; copy what you keep). Returning true from cb tells the engine the
// place answered it itself, and the engine's own weather or time change for that event is skipped.
// Every finger takes part, also one the place answers (a stroke growing flowers) or claims with press(p) -> true;
// only a finger claimed with press(p) -> 'mine' (a dragged thing), a finger on the sun or moon and a finger on the cloud
// icon stay out.

import { clamp, TAU } from './util.js';
import { SEASONS, orb, angleOf, hourOf } from './env.js';

const SUN_REST = 2; // seconds a finger rests still on the sun or the moon for the year to turn on by one season
import { SPARK } from './fx.js';

const wrapPi = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const DARKER = { dawn: 'night', day: 'dusk', dusk: 'night', night: 'night' };
const LIGHTER = { night: 'dawn', dawn: 'day', dusk: 'day', day: 'day' };

export function createGestures(c) {
  // c: {stage, camera, env, envCtl, fx, sound(name, opts) (audio.sfx voice), node(), listeners(node), frame()}
  const { stage, camera, env, envCtl, fx } = c;
  const infos = Object.create(null);
  const info = (name) => infos[name] || (infos[name] = { name, phase: '', k: 0, x: 0, y: 0, sx: 0, sy: 0, dir: 0, hour: 0, id: 0 });

  /** Tell the top place; true if it answered the event itself. */
  function emit(name, phase, k, r, extra) {
    const ls = c.listeners(name);
    const o = info(name);
    o.phase = phase; o.k = k; o.dir = 0; o.hour = env.hour; o.id = r ? r.id : 0;
    if (r) { o.x = r.x; o.y = r.y; o.sx = r.p.sx; o.sy = r.p.sy; }
    if (extra) Object.assign(o, extra);
    if (!ls || !ls.length) return false;
    let took = false;
    for (let i = 0; i < ls.length; i++) { try { if (ls[i](o) === true) took = true; } catch (e) { console.error('[quiet-garden] gesture listener', e); } }
    return took;
  }
  const H = () => stage.cssH || 1;
  const from = (r) => ({ sx: r.p.sx, sy: r.p.sy });
  const free = (r) => r.mode !== 'sky' && r.mode !== 'cloud' && r.mode !== 'done' && !r.mine;
  // fingers that make a hand gesture (twist, slide, wipe, mist) are marked `gest`: input.js stops their soft notes, so
  // a two-finger turn over a place that does not answer strokes no longer plays two loud melodies (owner, BRIEF 32)
  const hush = (list) => { for (let i = 0; i < list.length; i++) if (free(list[i])) list[i].gest = true; };

  // ---------------------------------------------------------------------------------------------
  // per-finger swirl (heading that keeps turning one way) and reversals (rubbing)
  function sample(r, nowMs) {
    const dx = r.cssX - r.sX, dy = r.cssY - r.sY, d = Math.hypot(dx, dy);
    if (d < H() * 0.016) return false;
    const dtS = Math.max(0.004, (nowMs - r.sT) / 1000);
    const hd = Math.atan2(dy, dx);
    if (r.hd !== null) {
      let dth = wrapPi(hd - r.hd);
      if (Math.abs(dth) > 2.0) { r.rev++; dth = 0; r.turn *= 0.3; } // a sharp turn back: rubbing, not circling
      r.turn = r.turn * Math.exp(-dtS / 1.3) + dth;
      r.turnAll += dth;   // the whole turn of this finger's path since the hand began (no fading)
      if (Math.abs(dth) > 0.05) r.rad = r.rad * 0.7 + 0.3 * Math.min(H(), d / Math.abs(dth));
      const v = d / dtS / H();
      r.speed = r.speed * 0.6 + 0.4 * v;
    }
    r.tx = dx / d; r.ty = dy / d;
    r.hd = hd; r.sX = r.cssX; r.sY = r.cssY; r.sT = nowMs;
    r.path += d;
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // patter
  const taps = []; // {t, x, y, multi} css, seconds (performance clock), last ~1.5 s
  let patterUntil = 0, patterRate = 0;

  // ---------------------------------------------------------------------------------------------
  // hand-level state (two or more fingers)
  const hand = { n: 0, since: 0, wipe: 0, wiping: false, misting: false, mistT: 0, twist: 0, twistNeed: 0.9, ang: null, ang0: null, dist0: 0, slideY: 0, slideX: 0, sliding: false, sun: null, gustT: 0 };

  const G = {
    /** live intensities, 0..1 (read by places through engine.gestures) */
    level: { swirl: 0, patter: 0, wipe: 0, hand: 0 },

    /** A finger landed (after input decided its mode). */
    down(r, list) {
      r.hd = null; r.turn = 0; r.turnAll = 0; r.rad = H() * 0.2; r.speed = 0; r.rev = 0; r.path = 0; r.swirl = false; r.tx = 1; r.ty = 0;
      r.sX = r.cssX; r.sY = r.cssY; r.sT = r.downT; r.multi = false; r.taken = false; r.k = 0;
      let n = 0;
      for (let i = 0; i < list.length; i++) if (list[i] !== r && free(list[i])) { n++; list[i].multi = true; }
      if (n > 0) r.multi = true;
      if (r.mode === 'sky') G.skyStart(r);
      hand.ang = null; hand.ang0 = null; hand.slideY = hand.slideX = 0; hand.sliding = false; hand.since = performance.now();
      for (let i = 0; i < list.length; i++) { list[i].rev = 0; list[i].path = 0; list[i].turnAll = 0; list[i].sx0 = list[i].cssX; list[i].sy0 = list[i].cssY; }
      hand.wipe = 0; hand.twist = 0; hand.twistNeed = 0.9;
    },

    /** A finger moved (css already updated, world point too). Returns true if it is circling (a swirl). */
    move(r, list, nowMs) {
      if (r.mode === 'sky') { G.skyMove(r); return false; }
      if (!free(r)) return false;
      if (!sample(r, nowMs)) return r.swirl;
      const on = Math.abs(r.turn) > 1.9 && r.rad < H() * 0.42;
      if (on && !r.swirl) {
        r.swirl = true; r.swirlT = nowMs;
        emit('swirl', 'start', clamp(r.speed / 1.6, 0, 1), r);
        c.sound('sparkle', { vol: 0.35 });
        fx.ring(r.x, r.y, 1, 2);
      } else if (r.swirl && Math.abs(r.turn) < 0.95) {
        r.swirl = false; emit('swirl', 'end', 0, r);
      }
      if (r.swirl) {
        const k = clamp(r.speed / 1.6, 0, 1);
        // sparks thrown along the circle, outward
        fx.whirl(r.x, r.y, r.tx * Math.sign(r.turn || 1), r.ty * Math.sign(r.turn || 1), k);
        r.k = k;
        r.taken = emit('swirl', 'move', k, r, { dir: Math.sign(r.turn) });
      }
      // two or more fingers moving together: rubbing (wipe), turning (twist) or sliding (time)
      G.handMove(list);
      return r.swirl;
    },

    /** A finger lifted. tapped: it was a quick tap that did not move. */
    up(r, list, tapped, nowMs) {
      if (r.mode === 'sky') G.skyEnd(r);
      if (r.swirl) { r.swirl = false; emit('swirl', 'end', 0, r); }
      let patter = false;
      if (tapped && free(r)) patter = G.tap(r, nowMs);
      if (hand.wiping && G.count(list, r) < 2) { hand.wiping = false; emit('wipe', 'end', 0, r); }
      if (hand.misting && G.count(list, r) < 3) { hand.misting = false; emit('hand', 'end', 0, r); }
      hand.ang = null; hand.sliding = false;
      return patter;
    },

    /** fingers taking part in world gestures, not counting `except` */
    count(list, except) {
      let n = 0;
      for (let i = 0; i < list.length; i++) if (list[i] !== except && free(list[i])) n++;
      return n;
    },

    /** A quick tap: part of a patter if another finger tapped nearby in time. Returns true if it was one. Patter
     *  makes no weather (BRIEF 24); places may still listen to it ('patter' start / drop). */
    tap(r, nowMs) {
      const t = nowMs / 1000, h = H();
      while (taps.length && t - taps[0].t > 1.5) taps.shift();
      let multi = r.multi;
      for (let i = taps.length - 1; i >= 0 && !multi; i--) {
        const q = taps[i];
        if (t - q.t > 0.45) break;
        if (Math.hypot(q.x - r.cssX, q.y - r.cssY) > h * 0.035) multi = true;
      }
      taps.push({ t, x: r.cssX, y: r.cssY, multi });
      if (!multi && t > patterUntil) return false;
      // a raindrop
      let n = 0; for (let i = 0; i < taps.length; i++) if (t - taps[i].t < 1.2) n++;
      const first = t > patterUntil;
      patterUntil = t + 0.6;
      patterRate = n / 1.2;
      const k = clamp((patterRate - 2) / 8, 0, 1);
      G.level.patter = Math.max(G.level.patter, 0.3 + 0.7 * k);
      emit('patter', first ? 'start' : 'drop', k, r);
      return true;
    },

    /** Two or more fingers: wipe, twist, slide. */
    handMove(list) {
      let n = 0, a = null, b = null, mx = 0, my = 0, rev = 0, path = 0;
      for (let i = 0; i < list.length; i++) {
        const q = list[i]; if (!free(q)) continue;
        n++; if (!a) a = q; else if (!b) b = q;
        mx += q.cssX - q.sx0; my += q.cssY - q.sy0; rev += q.rev; path += q.path;
      }
      if (n < 2) return;
      const h = H();
      mx /= n; my /= n;
      // wipe: rubbing back and forth
      if (rev >= 2 && path > h * 0.7) {
        const sky = envCtl.energy.rain + envCtl.energy.fog;
        if (!hand.wiping) { hand.wiping = true; emit('wipe', 'start', 0, a); c.sound('whoosh', { vol: 0.5, dur: 0.9, f0: 500 }); }
        hush(list);
        const dk = clamp((path - hand.wipe) / (h * 2.6), 0, 0.5);
        hand.wipe = path;
        G.level.wipe = clamp(G.level.wipe + dk * 3, 0, 1);
        for (let i = 0; i < list.length; i++) if (free(list[i]) && Math.random() < 0.6) fx.sparkle(list[i].x, list[i].y, 1, 0.6, 0.9, 0.7, SPARK.RAIN);
        if (!emit('wipe', 'move', G.level.wipe, a) && dk > 0) {
          envCtl.clear(dk, from(a));
          if (sky > 0.05 && envCtl.energy.rain + envCtl.energy.fog < 0.02) c.sound('twinkle', { vol: 0.5 });
        }
        return;
      }
      if (n !== 2) return;
      // twist: the line between two fingers turns
      const ang = Math.atan2(b.cssY - a.cssY, b.cssX - a.cssX), dist = Math.hypot(b.cssX - a.cssX, b.cssY - a.cssY);
      if (hand.ang0 === null) { hand.ang0 = ang; hand.dist0 = dist; }
      // a turn about a still middle: fingers that pass each other or slide along together are not turning
      const mdx = (a.cssX - a.sx0 + b.cssX - b.sx0) / 2, mdy = (a.cssY - a.sy0 + b.cssY - b.sy0) / 2;
      // or a turn about a still finger, the way a hand often turns (the thumb rests, the other finger circles it; BRIEF
      // 32: such a turn never counted, its middle wanders too far): the resting finger stayed near where it landed,
      // the distance held, and the moving finger's own path curved with the turn (a straight stroke past a resting
      // finger also turns the line between them, but its path does not curve)
      const da = Math.hypot(a.cssX - a.sx0, a.cssY - a.sy0), db = Math.hypot(b.cssX - b.sx0, b.cssY - b.sy0);
      const mover = da < db ? b : a, lineTurn = Math.abs(wrapPi(ang - hand.ang0));
      const pivot = Math.min(da, db) < dist * 0.3 && Math.abs(dist - hand.dist0) < hand.dist0 * 0.25 &&
        (lineTurn < 0.25 || Math.abs(mover.turnAll) > lineTurn * 0.5);
      const steady = Math.hypot(mdx, mdy) < dist * 0.45 || pivot;
      if (dist < h * 0.12 || !steady) { hand.twist *= 0.5; hand.ang = null; }
      if (hand.ang !== null) {
        hand.twist += wrapPi(ang - hand.ang);
        if (Math.abs(hand.twist) > 0.3) { a.gest = true; b.gest = true; }   // a turn under way: these fingers stop singing
        if (Math.abs(hand.twist) > hand.twistNeed) {
          const dir = hand.twist > 0 ? 1 : -1; // clockwise on screen (y down) turns the year onward
          hand.twist -= dir * hand.twistNeed; hand.twistNeed = 1.2;
          const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
          const at = { sx: (a.p.sx + b.p.sx) / 2, sy: (a.p.sy + b.p.sy) / 2 };
          for (let i = 0; i < 14; i++) { const t = (i / 14) * TAU; const rr = dist * 0.5 * c.camera.view.h / h; fx.sparkle(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr, 1, 0.5, 1.1, 1.3, SPARK.LEAF); }
          fx.ring(cx, cy, 1.2, 2);
          if (!emit('twist', 'step', 1, a, { dir, x: cx, y: cy, sx: at.sx, sy: at.sy })) {
            const i = SEASONS.indexOf(env.season);
            env.set({ season: SEASONS[(i + dir + 4) % 4] }, { from: at, source: 'twist' });
            c.sound('wonder', { vol: 0.45 });
          }
        }
      }
      if (dist >= h * 0.12 && steady) hand.ang = ang;
      // slide: both fingers down (or up) together, far enough, without rubbing or turning
      if (rev === 0 && Math.abs(hand.twist) < 0.5 && Math.abs(my) > h * 0.3 && Math.abs(mx) < Math.abs(my) * 0.6 &&
        Math.sign(a.cssY - a.sy0) === Math.sign(b.cssY - b.sy0) && Math.abs(a.cssY - a.sy0) > h * 0.18 && Math.abs(b.cssY - b.sy0) > h * 0.18) {
        const dir = my > 0 ? 1 : -1; // down: darker
        const at = { sx: (a.p.sx + b.p.sx) / 2, sy: (a.p.sy + b.p.sy) / 2 };
        for (const q of [a, b]) { q.sx0 = q.cssX; q.sy0 = q.cssY; }
        a.gest = true; b.gest = true;
        if (!emit('slide', 'step', 1, a, { dir })) {
          const next = dir > 0 ? DARKER[env.time] : LIGHTER[env.time];
          if (next !== env.time) { env.set({ time: next }, { from: at, source: 'slide' }); c.sound(dir > 0 ? 'chime' : 'twinkle', { vol: 0.4 }); }
        }
      }
    },

    // -------------------------------------------------------------------------------------------
    // the sun and the moon: a finger turns the wheel of the day
    skyStart(r) {
      const s = r.sky; // {moon, offX, offY} set by input from G.skyHit
      s.ax = r.cssX; s.ay = r.cssY; s.restT = performance.now(); s.dragged = false; s.ringed = false;
      envCtl.hand.begin();
      s.b = angleOf(env.hour) + (s.moon ? Math.PI : 0);
      emit(s.moon ? 'moon' : 'sun', 'start', 1, r);
      c.sound('chime', { vol: 0.35, count: 2 });
      fx.sparkle(r.x, r.y, 8, 0.8, 1, 1, s.moon ? SPARK.RAIN : SPARK.GOLD);
    },
    skyMove(r) {
      const s = r.sky, W = stage.cssW, h = H();
      const tx = (r.cssX - s.offX) / W, ty = (r.cssY - s.offY) / h;
      // the nearest point of the arc to the finger, searched near the current angle (keeps it continuous)
      const ar = W / h;
      let best = s.b, bd = Infinity;
      for (let i = -12; i <= 12; i++) {
        const b = s.b + i * 0.045;
        const ex = (0.5 - 0.4 * Math.cos(b) - tx) * ar, ey = 0.64 - 0.5 * Math.sin(b) - ty;
        const d = ex * ex + ey * ey;
        if (d < bd) { bd = d; best = b; }
      }
      s.b = best;
      const hour = hourOf(s.b - (s.moon ? Math.PI : 0));
      if (!emit(s.moon ? 'moon' : 'sun', 'move', 1, r, { hour })) envCtl.hand.set(hour, from(r));
      fx.trail(r.x, r.y, 0, 0, 0.8, s.moon ? SPARK.RAIN : SPARK.GOLD);
    },
    skyEnd(r) {
      const s = r.sky;
      emit(s.moon ? 'moon' : 'sun', 'end', 0, r);
      envCtl.hand.end();
    },
    /** Is (css x, y) on a sun or moon the top place drew this frame? Returns {moon, offX, offY} or null. */
    skyHit(cx, cy, shown) {
      const W = stage.cssW, h = H();
      const f = c.frame();
      for (const moon of [false, true]) {
        const o = moon ? shown.moon : shown.sun;
        if (!o || f - o.frame > 3) continue;
        const ox = o.sx * W, oy = o.sy * h, rad = Math.max(o.sr * h * 1.7, h * 0.085);
        if (Math.hypot(cx - ox, cy - oy) < rad) return { moon, offX: cx - ox, offY: cy - oy, b: 0 };
      }
      return null;
    },

    /** Per frame: swirls pour wind in, a resting hand breathes fog, a finger resting on the sun turns the year, levels ebb. */
    tick(dt, list) {
      if (dt <= 0) return;
      const nowMs = performance.now();
      // a finger resting still on the sun or the moon: every SUN_REST seconds the year turns on by one season, washing
      // out from the sun. Once the finger has dragged (the time of day) it never turns the season in that touch.
      for (let i = 0; i < list.length; i++) {
        const r = list[i], s = r.sky;
        if (r.mode !== 'sky' || !s || s.dragged) continue;
        if (Math.hypot(r.cssX - s.ax, r.cssY - s.ay) > H() * 0.025) { s.dragged = true; continue; }
        const held = (nowMs - s.restT) / 1000;
        if (!s.ringed && held > SUN_REST * 0.5) { s.ringed = true; fx.ring(r.x, r.y, 0.9, 1); }   // halfway: a soft ring says something is coming
        if (held < SUN_REST) continue;
        s.restT = nowMs; s.ringed = false;
        const W = stage.cssW, at = { sx: clamp((r.cssX - s.offX) / W, 0, 1), sy: clamp((r.cssY - s.offY) / H(), 0, 1) };
        for (let k = 0; k < 16; k++) { const t = (k / 16) * TAU; fx.sparkle(r.x + Math.cos(t) * 40, r.y + Math.sin(t) * 40, 1, 0.6, 1.1, 1.3, SPARK.LEAF); }
        fx.ring(r.x, r.y, 1.4, 2);
        if (!emit('twist', 'step', 1, r, { dir: 1, via: s.moon ? 'moon' : 'sun', sx: at.sx, sy: at.sy })) {
          const si = SEASONS.indexOf(env.season);
          env.set({ season: SEASONS[(si + 1) % 4] }, { from: at, source: 'sunrest' });
          c.sound('wonder', { vol: 0.45 });
        }
      }
      let swirlK = 0, windK = 0, windAny = false, swirlR = null, still = 0, stillR = null;
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        if (!free(r)) continue;
        if (r.swirl && nowMs - r.evT > 280) { r.swirl = false; r.turn = 0; emit('swirl', 'end', 0, r); }
        if (r.swirl) { const k = r.k || 0; swirlK += k; swirlR = r; if (!r.taken) { windK += k; windAny = true; } }
        if (r.moved < H() * 0.045) { still++; stillR = r; }
      }
      // wind from every swirling finger; gusts you can hear
      G.level.swirl = clamp(swirlK, 0, 1);
      if (swirlR) {
        if (windAny) envCtl.add('wind', (0.12 + 0.55 * clamp(windK, 0, 1.5)) * dt, from(swirlR));
        hand.gustT -= dt;
        if (hand.gustT <= 0) { hand.gustT = 1.1 - 0.5 * clamp(swirlK, 0, 1); c.sound('gust', { amp: 0.35 + 0.6 * clamp(swirlK, 0, 1), vol: 0.8, x: swirlR.x }); }
      } else hand.gustT = 0;
      // a resting hand: three or more still fingers for a moment
      const n = G.count(list, null);
      if (n >= 3 && still >= 3 && nowMs - hand.since > 600) {
        if (!hand.misting) { hand.misting = true; hand.mistT = 0; emit('hand', 'start', 0, stillR); c.sound('whoosh', { vol: 0.35, dur: 2.6, f0: 180, f1: 420 }); }
        hush(list);
        G.level.hand = clamp(G.level.hand + dt * 0.5, 0, 1);
        hand.mistT -= dt;
        if (hand.mistT <= 0) {
          hand.mistT = 0.22;
          for (let i = 0; i < list.length; i++) if (free(list[i])) fx.puff(list[i].x, list[i].y - 10, 0.7 + G.level.hand * 0.6, (Math.random() - 0.5) * 30);
        }
        if (!emit('hand', 'move', G.level.hand, stillR)) envCtl.add('fog', 0.32 * dt, from(stillR));
      } else if (hand.misting && n < 3) { hand.misting = false; emit('hand', 'end', 0, stillR); }
      if (!hand.misting) G.level.hand = Math.max(0, G.level.hand - dt);
      G.level.patter = Math.max(0, G.level.patter - dt * 0.8);
      G.level.wipe = Math.max(0, G.level.wipe - dt * 0.8);
    },
  };
  return G;
}

/** Sun and moon positions for a view, reused objects (engine.sky.sun/moon). */
export function makeOrbs() {
  const sun = { x: 0, y: 0, r: 0, up: 0 }, moon = { x: 0, y: 0, r: 0, up: 0 };
  return { sun: (hour, view) => orb(hour, view, false, sun), moon: (hour, view) => orb(hour, view, true, moon) };
}
