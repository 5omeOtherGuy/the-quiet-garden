// Painted places on the engine (owner: engine). A place with `painted: '<name>'` in its definition gets its views,
// regions, grown things and moving painting from art's painted place (web/src/art/painted.js, manifest in
// web/assets/art/<name>/). The engine wraps the place's scene so the place itself only says what lives there.
// The worked example is web/src/biomes/_painted/index.js; the guide is docs/ENGINE.md "A painted place".
//
// What the wrapper does, so places do not have to:
//   open the paintings when the place is first shown, free them a few seconds after the child has left (and open them
//   again on return); call setup(painting) after each open; keep what grew (field.dump/load) in the place's save;
//   show() the view a walk arrives in; draw painting -> art.fx; feed every stroke point to the painting's motion
//   (gust), to the fields and sheds of the view shown, and to art's sparks; tell taps which painted thing is under
//   the finger (p.thing) and every touch which painted region it is over (s.over, p.over). A stroke over a field's or
//   shed's region counts as answered (no soft notes from the engine) unless the place's stroke returns false.

import { report, safe } from './util.js';

const BASE = new URL('../../assets/art/', import.meta.url);
const FREE_AFTER = 3; // seconds after leaving (longer than any transition)

/** Read a painted place's manifest and turn its views into engine views (all at x 0, 1000 high). */
export async function paintedViews(name) {
  const res = await fetch(new URL(name + '/manifest.json', BASE));
  if (!res.ok) throw new Error(`no painted manifest for ${name}`);
  const man = await res.json(), out = {};
  for (const [id, v] of Object.entries(man.views || {})) {
    const w = +v.width || 2000, s = Array.isArray(v.safe) ? v.safe : [0, w];
    // anchorY: on a screen wider than 2:1 the ground stays and the sky gives (as art's place.frame does)
    out[id] = { x: 0, y: 0, w, h: 1000, safe: { x: s[0], y: 0, w: s[1] - s[0], h: 1000 }, anchorY: 0.85 };
  }
  return out;
}

/**
 * Wrap scene `sc` of node n. c = { art, env, stage, now, store (engine.save of the place), after(sec, fn), onFlush(fn) }.
 * Returns the scene the engine uses.
 */
export function wrapPainted(n, sc, c) {
  const name = n.def.painted;
  let p = null, opening = null, here = false, freeTimer = null, gen = 0;
  const fed = { x: 0, y: 0, id: 0 };

  function remember() {
    if (!p) return;
    const keep = {};
    for (const view of Object.keys(n.views || {})) {
      const list = p.grown.filter((f) => f.view === view && typeof f.dump === 'function');
      if (list.length) keep[view] = list.map((f) => f.dump());
    }
    c.store.put('_grown', keep);
  }
  c.onFlush(remember);

  function open() {
    if (p || opening || !c.art || !c.art.painted) return;
    const my = ++gen;
    opening = c.art.painted.open(name, { view: n.viewId, pixelHeight: c.stage.H }).then((pl) => {
      opening = null;
      if (my !== gen) { pl.free(); return; }
      p = pl; n.painting = pl;
      pl.seasonAt = () => c.env.season;               // until its first draw, things made in setup take the season now
      if (typeof sc.setup === 'function') safe(`setup ${n.placeId}`, () => sc.setup(pl));
      // what grew last time comes back (fields in the order the place made them, per view)
      const keep = c.store.get('_grown', null);
      if (keep) for (const view of Object.keys(keep)) {
        const list = pl.grown.filter((f) => f.view === view && typeof f.load === 'function');
        keep[view].forEach((d, i) => { const f = list[i]; if (f && Array.isArray(d) && d.length) { if (Array.isArray(f.items)) f.items.length = 0; safe('field.load', () => f.load(d)); } });
      }
      pl.show(n.viewId);
    }).catch((e) => { opening = null; report(`painted ${name}`, e); });
  }
  function close() {
    gen++;
    if (!p) return;
    remember();
    const pl = p; p = null; n.painting = null;
    if (typeof sc.closed === 'function') safe(`closed ${n.placeId}`, () => sc.closed());
    safe('painting.free', () => pl.free());
  }

  /** every finger point goes to the painting: it stirs, flowers grow, leaves fall, sparks rise.
   *  True if a point lay in a field's or shed's region (the painting answered: no soft notes from the engine). */
  function feed(s) {
    if (!p) return false;
    const hushed = !!(sc.quiet || n.def.quiet || (c.quiet && c.quiet(n)));   // a quiet place: no sparks, no stirring under the finger
    const fxa = hushed ? null : c.art.fx, view = p.viewName, season = c.env.season;
    let answered = false;
    fed.id = s.id;
    for (let i = 0; i < s.n; i++) {
      fed.x = s.points[i].x; fed.y = s.points[i].y;
      if (!hushed) p.gust(fed);
      for (const f of p.grown) {
        if (f.view !== view || !f.stroke) continue;
        f.stroke(fed);
        if (!answered && (!f.seasons || f.seasons.includes(season)) && p.inRegion(f.region, fed.x, fed.y)) answered = true;
      }
      if (fxa) fxa.trail(fed.x, fed.y, s.id);
    }
    if (s.phase === 'end') {
      if (!hushed) p.gustEnd(s.id);
      for (const f of p.grown) if (f.end) f.end(s.id);
      if (fxa) fxa.release(s.id);
    }
    return answered;
  }

  const w = Object.create(sc);
  Object.assign(w, {
    painted: true,
    /** true when the paintings the place needs now are loaded (transitions wait for it) */
    settled: () => !!p && p.settled,
    build(env) { open(); if (typeof sc.build === 'function') sc.build(env); },
    free() { close(); if (typeof sc.free === 'function') sc.free(); },
    enter(...a) {
      here = true; if (freeTimer) { freeTimer(); freeTimer = null; }
      open();
      if (typeof sc.enter === 'function') return sc.enter(...a);
    },
    leave(...a) {
      here = false;
      if (freeTimer) freeTimer();
      freeTimer = c.after(FREE_AFTER, () => { freeTimer = null; if (!here) close(); });
      if (typeof sc.leave === 'function') return sc.leave(...a);
    },
    view(id) { if (p) p.show(id); if (typeof sc.view === 'function') return sc.view(id); },
    draw(g, env, view) {
      if (!p) { open(); return; }
      if (p.viewName !== n.viewId) p.show(n.viewId);
      const t = c.now();
      p.flat = !view.solo;                   // during a transition the painting is drawn still into its layer
      if (typeof sc.drawUnder === 'function') sc.drawUnder(g, env, view, p);   // runs before the painting: only for things the painting may clear
      p.draw(g, env, view, t);
      if (typeof sc.draw === 'function') sc.draw(g, env, view, p);
      if (c.art.fx) c.art.fx.draw(g, env, view, t);
    },
    stroke(s) {
      const fedAnswer = feed(s);
      const r = typeof sc.stroke === 'function' ? sc.stroke(s, p) : undefined;
      return r === undefined ? fedAnswer : r;   // undefined: the painting's answer counts (give it sound with onBloom / onLoose)
    },
    tap(pt) {
      pt.thing = p ? p.hit(pt.x, pt.y) : null;
      return typeof sc.tap === 'function' ? sc.tap(pt, p) : undefined;
    },
    hold(pt) {
      pt.thing = p ? p.hit(pt.x, pt.y) : null;
      return typeof sc.hold === 'function' ? sc.hold(pt, p) : undefined;
    },
    /** the painted region under a world point ('' if none) */
    regionAt: (x, y) => (p ? p.region(x, y) || '' : ''),
  });
  return w;
}
