// Ways on to the next place, painted edition (owner: engine; BRIEF 35, docs/requests/lead-to-engine-ways.md,
// docs/ENGINE.md "Exits"). The simple edition keeps its own marks (core/help.js); this module is off there.
//
// Which ways: exits of a place (not of an instance) with `to:` a main place (ORDER). Never the secret place, never a
// hidden place, never `inst:`, `out:` or `view:` ways, and nothing at all in a quiet place. Per exit `mark: false`
// hides it, `mark: true` forces it, `markAt: {x, y}` moves it (default: the centre of the exit's shape).
// How it looks (skin.wayLight): a soft warm light that breathes slowly at the mouth of the way, and a few motes,
// petals or leaves in the colour of the place it leads to, floating along the path into it and fading there.
// When: it comes up after the child arrives in a view, stays clear for about 8 s, then turns faint; after about 25 s
// without a touch it swells again, gently, and a touch lets it settle back. No sound, nothing fast.
// Where: inside the visible frame on every screen; an exit whose mark point lies outside the frame gets its mark at
// the nearest visible point of its shape. Drawn over the weather (so fog and rain never hide it), a little dimmer
// in weather and at night. Per mark one glow and two to four small sprites per frame; no allocation per frame.

import { skin } from './ui/skin.js';
import { clamp, approach, hash, smooth } from './util.js';

// the colour of each main place (the colour of what floats along a way that leads there; a place's def.color wins)
const TINT = {
  meadow: '#9cc25a', antnest: '#c0814a', underground: '#8a6a4a', wood: '#4f8a4a', pond: '#5fa0c8',
  riverbank: '#4fa59a', beach: '#e2c27a', undersea: '#3f6fb0', mountains: '#9a92b8', town: '#c8735a',
};
// what floats along a way that leads there: petals to the flower meadow, leaves to the wood, light motes elsewhere
const KIND = { meadow: 'petal', wood: 'leaf', riverbank: 'leaf' };

const IN = 1.6;          // s: the light comes up after arriving
const CLEAR = 8;         // s: clearly visible after arriving
const FADE = 3;          // s: then it settles to faint over this
const FAINT = 0.3;       // the faint level (of 1)
const IDLE = 25;         // s without a touch: it swells again
const SWELL = 5;         // s: how slowly it swells
const SWELL_TO = 0.85;
const MARGIN = 55;       // world units: a mark keeps this far inside the visible frame
const ROUND = 14;        // corners of a round exit's shape

/**
 * c = { on, world, exits, env, art, defs, ORDER, SECRET, HIDDEN, now(), still, reduce, quiet(n), touching() }
 */
export function createWays(c) {
  const W = {
    on: !!c.on,
    level: 0,            // 0..1, how strongly the marks of the view shown are drawn now
    marks: [],           // the placement records drawn last frame (tests: QG.ways)
  };
  if (!W.on) {
    W.draw = () => {}; W.tick = () => {}; W.arrive = () => {}; W.touched = () => {}; W.list = () => [];
    return W;
  }
  const MAIN = new Set(c.ORDER), HIDDEN = new Set(c.HIDDEN || []);
  let since = 0, idle = 0;                      // seconds since arriving in this view / since the last touch
  const cache = new WeakMap();                  // exit -> placement record (kept while the frame stays the same)

  function marked(e, n) {
    if (e.mark === false) return false;
    if (e.mark === true) return true;
    if (n.kind !== 'place' || e.inst || e.out || !e.to) return false;   // ways inside instances stay their own secret
    return MAIN.has(e.to) && e.to !== c.SECRET && !HIDDEN.has(e.to);
  }

  // ---- placement (computed when the frame or the view changes, never per frame) -------------------------------------
  function polyOf(e) {
    if (Number.isFinite(e.r)) {
      const out = [];
      for (let i = 0; i < ROUND; i++) { const a = (i / ROUND) * Math.PI * 2; out.push([e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r]); }
      return out;
    }
    if (Number.isFinite(e.w) && Number.isFinite(e.h)) return [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]];
    if (Array.isArray(e.poly) && e.poly.length > 2) return e.poly.map((p) => [p[0], p[1]]);
    return null;
  }
  function centreOf(e, poly) {
    if (e.markAt && Number.isFinite(e.markAt.x)) return { x: e.markAt.x, y: e.markAt.y };
    if (Number.isFinite(e.r)) return { x: e.x, y: e.y };
    let x = 0, y = 0; for (const p of poly) { x += p[0]; y += p[1]; }
    return { x: x / poly.length, y: y / poly.length };
  }
  /** the part of polygon P inside the rect [x0, x1] x [y0, y1] (Sutherland-Hodgman) */
  function clip(P, x0, y0, x1, y1) {
    let out = P;
    const edge = (inside, cut) => {
      const src = out; out = [];
      for (let i = 0; i < src.length; i++) {
        const a = src[i], b = src[(i + 1) % src.length], ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) out.push(cut(a, b));
      }
    };
    const atX = (X) => (a, b) => [X, a[1] + ((b[1] - a[1]) * (X - a[0])) / (b[0] - a[0] || 1e-9)];
    const atY = (Y) => (a, b) => [a[0] + ((b[0] - a[0]) * (Y - a[1])) / (b[1] - a[1] || 1e-9), Y];
    edge((p) => p[0] >= x0, atX(x0)); if (out.length) edge((p) => p[0] <= x1, atX(x1));
    if (out.length) edge((p) => p[1] >= y0, atY(y0)); if (out.length) edge((p) => p[1] <= y1, atY(y1));
    return out;
  }
  function area(P) { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s / 2); }
  function nearestOn(P, x, y) {
    let bx = P[0][0], by = P[0][1], bd = Infinity;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1e-9;
      const k = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / L, 0, 1), px = a[0] + dx * k, py = a[1] + dy * k, d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) { bd = d; bx = px; by = py; }
    }
    return { x: bx, y: by };
  }
  function place(r, n) {
    const f = n.frame;
    r.fx = f.x; r.fy = f.y; r.fw = f.w; r.fh = f.h; r.view = n.viewId;
    r.ok = false; r.moved = false; r.visible = 0;
    if (!r.poly) return;
    const P = clip(r.poly, f.x, f.y, f.x + f.w, f.y + f.h);
    r.visible = P.length > 2 ? area(P) / (area(r.poly) || 1) : 0;
    const m = MARGIN * (f.h / 1000), x0 = f.x + m, y0 = f.y + m, x1 = f.x + f.w - m, y1 = f.y + f.h - m;
    const ctr = centreOf(r.e, r.poly);
    if (ctr.x >= x0 && ctr.x <= x1 && ctr.y >= y0 && ctr.y <= y1) { r.x = ctr.x; r.y = ctr.y; r.ok = true; }
    else {
      // the mark point is off screen (or at its very edge): the nearest visible point of the exit's shape, a little in
      let Q = clip(r.poly, x0, y0, x1, y1);
      if (Q.length < 3) Q = P;
      if (Q.length >= 3) {
        const q = nearestOn(Q, ctr.x, ctr.y);
        let qx = 0, qy = 0; for (const p of Q) { qx += p[0]; qy += p[1]; } qx /= Q.length; qy /= Q.length;
        const d = Math.hypot(qx - q.x, qy - q.y) || 1, s = Math.min(28, d * 0.5) / d;
        r.x = q.x + (qx - q.x) * s; r.y = q.y + (qy - q.y) * s; r.ok = true; r.moved = true;
      }
    }
    // the motes come along the path towards the mark: from the viewer (below the middle of the frame) into the way
    const dx = r.x - (f.x + f.w / 2), dy = r.y - (f.y + f.h * 1.1), d = Math.hypot(dx, dy) || 1;
    r.ux = dx / d; r.uy = dy / d;
  }
  function rec(e, n) {
    let r = cache.get(e);
    if (!r) {
      const id = e.to || '', d = c.defs[id];
      r = { e, poly: polyOf(e), to: id, color: (d && d.color) || TINT[id] || '#d9b36a', kind: KIND[id] || 'mote',
        seed: (hash(`${n.placeId}:${e.in || ''}:${id}:${e.x || (e.poly && e.poly[0] && e.poly[0][0]) || 0}`) % 1000) / 1000,
        x: 0, y: 0, ux: 0, uy: -1, ok: false, moved: false, visible: 0, fx: NaN, fy: NaN, fw: NaN, fh: NaN, view: '' };
      cache.set(e, r);
    }
    const f = n.frame;
    if (r.fx !== f.x || r.fy !== f.y || r.fw !== f.w || r.fh !== f.h || r.view !== n.viewId) place(r, n);
    return r;
  }

  // ---- when -------------------------------------------------------------------------------------------------------
  /** the child arrived in a view (a walk, a travel, back out of an instance, the opening) */
  W.arrive = function () { since = 0; };
  /** a finger touched the glass */
  W.touched = function () { idle = 0; };
  W.tick = function (dt) {
    since += dt; idle += dt;
    if (c.touching()) idle = 0;
    let target;
    if (c.world.trans) target = 0;
    else if (c.still) target = 1;
    else {
      const arrived = since < CLEAR ? smooth(clamp(since / IN, 0, 1)) : 1 - (1 - FAINT) * smooth(clamp((since - CLEAR) / FADE, 0, 1));
      const swell = idle > IDLE ? FAINT + (SWELL_TO - FAINT) * smooth(clamp((idle - IDLE) / SWELL, 0, 1)) : FAINT;
      target = Math.max(arrived, swell);
    }
    if (c.still) W.level = target;
    else W.level = approach(W.level, target, dt, target < W.level ? (target === 0 ? 0.25 : 1.1) : 0.5);
  };

  // ---- drawing (per frame; nothing allocated) ------------------------------------------------------------------------
  /** Draw the marks of node n (the top of the picture); g maps world units. */
  W.draw = function (g, n) {
    W.marks.length = 0;
    if (W.level < 0.004 || !n || !n.frame || c.quiet(n)) return;
    const list = c.exits.of(n);
    let dim = -1;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if ((e.in && e.in !== n.viewId) || !marked(e, n)) continue;
      const r = rec(e, n);
      if (!r.ok) continue;
      if (dim < 0) {
        // findable through any weather and at night (drawn over both), a little dimmer there
        const env = c.env, wx = Math.max(env.wet || 0, env.foggy || 0, env.stormy || 0, env.snowy || 0);
        const nk = c.art && typeof c.art.nightness === 'function' ? c.art.nightness(env) : 0;
        dim = 1 - 0.18 * clamp(wx, 0, 1) - 0.12 * clamp(nk, 0, 1);
      }
      skin.wayLight(g, r.x, r.y, n.frame.h / 1000, r.color, r.kind, c.now(), r.ux, r.uy, W.level * dim, r.seed, W.level, c.reduce);
      W.marks.push(r);
    }
  };

  /** tests and the done note: every exit of the top node with whether it is marked and where (allocates; not per frame) */
  W.list = function () {
    const n = c.world.top; if (!n) return [];
    return c.exits.of(n).filter((e) => !e.in || e.in === n.viewId).map((e) => {
      const r = rec(e, n), m = marked(e, n) && !c.quiet(n);
      return { to: e.to || '', view: e.view || '', inst: e.inst || '', out: !!e.out, marked: m, x: Math.round(r.x), y: Math.round(r.y),
        shown: m && r.ok, moved: r.moved, visible: +r.visible.toFixed(2) };
    });
  };
  return W;
}
