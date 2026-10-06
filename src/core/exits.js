// Ways on (owner: engine; docs/ENGINE.md "Exits"). There is no map and no scrolling: views, places and instances
// are joined by things in the picture (a path, a gate, a door, a hole, the water's edge), and a tap on one walks there.
//
// A place or instance declares exits in its definition, on its scene, or with engine.exits.add(e):
//   { x, y, r }  or  { x, y, w, h }  or  { poly: [[x, y], ...] }    the region in world units
//   in: 'meadow'                       only while this view is shown (optional; default: any view)
//   view: 'brook'                      walk to another view of this place
//   to: 'pond', view: 'shore'          walk to a place (and arrive in that view; default its first view)
//   inst: 'cave', view: 'deep'         enter an instance of this node (from the exit's centre)
//   out: true                          the way out of this instance, back to its parent
//   mode: 'glide' | 'bloom' | 'slide', dir: -1 | 1    optional transition; by default views side by side glide and
//                                      everything else washes over from the touch
// Exits are tried before scene.tap. A tap that turns out to be part of a patter (a second finger lands within
// 0.2 s) does not travel.

import { clamp } from './util.js';

const DELAY = 0.2;

export function createExits(o) {
  // o: {world, fx, sound(name)}
  const { world, fx } = o;
  let pending = null;

  function declared(n) {
    const out = n.exitList || (n.exitList = []);
    out.length = 0;
    const add = (a) => { if (Array.isArray(a)) for (const e of a) if (e && typeof e === 'object') out.push(e); };
    add(n.def.exits); add(n.scene && n.scene.exits); add(n.extraExits);
    return out;
  }
  function inside(e, x, y) {
    if (Number.isFinite(e.r)) return Math.hypot(x - e.x, y - e.y) <= e.r;
    if (Number.isFinite(e.w) && Number.isFinite(e.h)) return x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h;
    if (Array.isArray(e.poly)) return inPoly(e.poly, x, y);
    return false;
  }
  function centre(e, p) {
    if (Number.isFinite(e.r)) return { x: e.x, y: e.y };
    if (Number.isFinite(e.w)) return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
    return { x: p.x, y: p.y };
  }

  function go(e, at) {
    const n = world.top; if (!n || world.trans) return false;
    if (e.out) return world.leave();
    if (e.inst) return world.enter(e.inst, { from: centre(e, at), view: e.view });
    if (e.to) return world.travel(e.to, { mode: e.mode === 'glide' ? 'bloom' : e.mode || 'bloom', dir: e.dir, view: e.view, at: { sx: at.sx, sy: at.sy } });
    if (e.view) return world.walk(e.view, { mode: e.mode, at: { sx: at.sx, sy: at.sy } });
    return false;
  }

  const X = {
    /** A tap at p. True if it was a way on (the walk starts after a breath, unless a patter begins). */
    tap(p) {
      const n = world.top; if (!n || world.trans) return false;
      const ex = declared(n);
      let hit = null;
      for (let i = ex.length - 1; i >= 0 && !hit; i--) {
        const e = ex[i];
        if (e.in && e.in !== n.viewId) continue;
        if (inside(e, p.x, p.y)) hit = e;
      }
      if (!hit) return false;
      fx.ring(p.x, p.y, 1.2, 2);
      fx.sparkle(p.x, p.y, 10, 1);
      o.sound(hit.out || hit.inst ? (hit.out ? 'leave' : 'enter') : 'travel');
      pending = { exit: hit, at: { x: p.x, y: p.y, sx: clamp(p.sx, 0, 1), sy: clamp(p.sy, 0, 1) }, t: DELAY };
      return true;
    },
    /** Another finger landed: a tap that was part of a patter does not travel. */
    cancel() { pending = null; },
    /** every exit declared for node n, in a reused array (per frame, no allocation; do not keep it) */
    of(n) { return declared(n); },
    tick(dt) {
      if (!pending) return;
      pending.t -= dt;
      if (pending.t <= 0) { const p = pending; pending = null; go(p.exit, p.at); }
    },
    /** engine.exits for node n */
    api(n) {
      return {
        add(e) { (n.extraExits ||= []).push(e); return e; },
        remove(e) { const a = n.extraExits || []; const i = a.indexOf(e); if (i >= 0) a.splice(i, 1); },
        clear() { n.extraExits = []; },
        /** walk through an exit now, as if it were tapped at its centre */
        go(e) { const c = centre(e, { x: 0, y: 0 }); const f = n.frame; return go(e, { ...c, sx: (c.x - f.x) / f.w, sy: (c.y - f.y) / f.h }); },
        /** the exit at a world point in the view shown, or null */
        at(x, y) { const ex = declared(n); for (let i = ex.length - 1; i >= 0; i--) { const e = ex[i]; if ((!e.in || e.in === n.viewId) && inside(e, x, y)) return e; } return null; },
        get list() { return declared(n).slice(); },
      };
    },
  };
  return X;
}

/** Point in polygon (even-odd), pts = [[x, y], ...]. */
export function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) c = !c;
  }
  return c;
}
