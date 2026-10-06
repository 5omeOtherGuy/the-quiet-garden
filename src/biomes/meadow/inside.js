// The meadow's instances are painted views of the meadow's own manifest (web/assets/art/meadow: oakroom, hive, burrow,
// glow). The engine wraps only top-level painted places (docs/requests/meadow-to-engine.md), so this small helper
// does for an instance what core/painted.js does for a place: open its painting when it is shown, free it a few
// seconds after the child has left, draw it (moving where it can), feed every finger to the painting's motion and
// to its grown things, and tell taps which painted thing and region are under the finger.
//
//   export default inside({ name, view: 'hive', width: 2000, music, exits, interior: 1, create(engine) -> scene })
//   scene: setup(p), update(dt, env, t, p), draw(g, env, view, p), stroke(s, p), tap(pt, p), hold(pt, p), closed(),
//          enter(), leave(), pause(), resume(), onEnv(next, prev)  (all optional)

const FREE_AFTER = 3;

export function inside(def) {
  const W = def.width || 2000;
  return {
    name: def.name, music: def.music, exits: def.exits || [],
    world: { w: W, h: 1000 },
    views: { main: { x: 0, y: 0, w: W, h: 1000, safe: def.safe || { x: (W - 1600) / 2, y: 0, w: 1600, h: 1000 }, anchorY: 0.6 } },
    instances: def.instances,
    create(engine) {
      const sc = def.create(engine) || {}, art = engine.art, comp = art && art.compositor;
      let p = null, opening = null, gen = 0, here = false, cancelFree = null;
      const fed = { x: 0, y: 0, id: 0 };
      const interior = (k) => { if (comp && 'interior' in comp) comp.interior = k; };

      function open() {
        if (p || opening || !art || !art.painted) return;
        const my = ++gen;
        opening = art.painted.open('meadow', { view: def.view, pixelHeight: Math.max(600, Math.round(1000 * (engine.pxPerUnit || 1))) }).then((pl) => {
          opening = null;
          if (my !== gen) { pl.free(); return; }
          p = pl; pl.show(def.view);
          if (sc.setup) sc.setup(pl);
        }).catch((e) => { opening = null; console.warn('meadow inside', def.view, e); });
      }
      function close() {
        gen++; if (!p) return;
        const pl = p; p = null;
        if (sc.closed) sc.closed();
        pl.free();
      }
      const call = (fn, ...a) => (typeof sc[fn] === 'function' ? sc[fn](...a) : undefined);

      return {
        ownWeather: true,
        instances: sc.instances || def.instances,
        settled: () => !!p && p.settled,
        regionAt: (x, y) => (p ? p.region(x, y) || '' : ''),
        build() { open(); },
        free() { close(); },
        enter(...a) { here = true; if (cancelFree) { cancelFree(); cancelFree = null; } open(); interior(def.interior ?? 1); return call('enter', ...a); },
        leave(...a) {
          here = false; interior(0);
          if (cancelFree) cancelFree();
          cancelFree = engine.after(FREE_AFTER, () => { cancelFree = null; if (!here) close(); });
          return call('leave', ...a);
        },
        pause(...a) { return call('pause', ...a); },
        resume(...a) { interior(def.interior ?? 1); return call('resume', ...a); },
        onEnv(...a) { return call('onEnv', ...a); },
        update(dt, env, t) { if (p) call('update', dt, env, t, p); },
        draw(g, env, view) {
          if (!p) { open(); g.fillStyle = '#3a2a20'; g.fillRect(view.x, view.y, view.w, view.h); return; }
          p.flat = !view.solo;
          art.light(g, -1e6, -1e6, 1, [0, 0, 0], 0);   // flush stale lights (see index.js draw)
          p.draw(g, env, view, engine.now());
          call('draw', g, env, view, p);
          if (art.fx) art.fx.draw(g, env, view, engine.now());
        },
        stroke(s) {
          if (p) {
            fed.id = s.id;
            for (let i = 0; i < s.n; i++) {
              fed.x = s.points[i].x; fed.y = s.points[i].y;
              p.gust(fed);
              for (const f of p.grown) if (f.view === p.viewName && f.stroke) f.stroke(fed);
            }
            if (s.phase === 'end') { p.gustEnd(s.id); for (const f of p.grown) if (f.end) f.end(s.id); }
          }
          return call('stroke', s, p);
        },
        tap(pt) { pt.thing = p ? p.hit(pt.x, pt.y) : null; return call('tap', pt, p); },
        hold(pt) { pt.thing = p ? p.hit(pt.x, pt.y) : null; return call('hold', pt, p); },
      };
    },
  };
}
