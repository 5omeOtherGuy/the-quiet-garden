// A painted instance of the beach (the rock pool, the shell grotto, the den under the boat): one view of the beach's
// painted manifest, wrapped the way the engine wraps a painted place (web/src/core/painted.js), because the engine
// wraps top-level places only (docs/requests/beach-to-engine.md). Remove this helper when instances are wrapped too.
//   paintedInside(engine, 'pool', scene) -> the scene the engine uses
// scene.setup(p) after each opening; scene.stroke(s, p), tap(pt, p), hold(pt, p), draw(g, env, view, p), closed().

const FREE_AFTER = 3;

export function paintedInside(engine, viewName, sc) {
  let p = null, opening = null, here = false, freeTimer = null, gen = 0;
  const fed = { x: 0, y: 0, id: 0 };
  const art = engine.art;

  function open() {
    if (p || opening || !art || !art.painted) return;
    const my = ++gen;
    opening = art.painted.open('beach', { view: viewName, pixelHeight: Math.round((engine.pxPerUnit || 1.6) * 1000) }).then((pl) => {
      opening = null;
      if (my !== gen) { pl.free(); return; }
      p = pl;
      try { if (sc.setup) sc.setup(pl); } catch (e) { console.warn('beach inside setup', e); }
      pl.show(viewName);
    }).catch((e) => { opening = null; console.warn('beach inside', viewName, e); });
  }
  function close() {
    gen++;
    if (!p) return;
    const pl = p; p = null;
    try { if (sc.closed) sc.closed(); } catch (e) { console.warn(e); }
    try { pl.free(); } catch (e) { console.warn(e); }
  }
  function feed(s) {
    if (!p) return;
    const fx = art.fx;
    fed.id = s.id;
    for (let i = 0; i < s.n; i++) {
      fed.x = s.points[i].x; fed.y = s.points[i].y;
      p.gust(fed);
      for (const f of p.grown) if (f.view === viewName && f.stroke) f.stroke(fed);
      if (fx) fx.trail(fed.x, fed.y, s.id);
    }
    if (s.phase === 'end') {
      p.gustEnd(s.id);
      for (const f of p.grown) if (f.end) f.end(s.id);
      if (fx) fx.release(s.id);
    }
  }
  const w = Object.create(sc);
  Object.assign(w, {
    painted: true,
    settled: () => !!p && p.settled,
    build(env) { open(); if (sc.build) sc.build(env); },
    free() { close(); if (sc.free) sc.free(); },
    enter(...a) { here = true; if (freeTimer) { freeTimer(); freeTimer = null; } open(); if (sc.enter) return sc.enter(...a); },
    leave(...a) {
      here = false; if (freeTimer) freeTimer();
      freeTimer = engine.after(FREE_AFTER, () => { freeTimer = null; if (!here) close(); });
      if (sc.leave) return sc.leave(...a);
    },
    draw(g, env, view) {
      if (!p) { open(); return; }
      const t = engine.now();
      p.flat = !view.solo;
      p.draw(g, env, view, t);
      if (sc.draw) sc.draw(g, env, view, p);
      if (art.fx) art.fx.draw(g, env, view, t);
    },
    update(dt, env, t) { if (sc.update) sc.update(dt, env, t, p); },
    stroke(s) { feed(s); return sc.stroke ? sc.stroke(s, p) : undefined; },
    tap(pt) { pt.thing = p ? p.hit(pt.x, pt.y) : null; return sc.tap ? sc.tap(pt, p) : undefined; },
    hold(pt) { pt.thing = p ? p.hit(pt.x, pt.y) : null; return sc.hold ? sc.hold(pt, p) : undefined; },
    regionAt: (x, y) => (p ? p.region(x, y) || '' : ''),
  });
  return w;
}
