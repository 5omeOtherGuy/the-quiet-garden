// The Beach (painted edition). Paintings: art-src/beach (prompts, place.json) -> web/assets/art/beach. Intentions and
// the full list of what can be done here (and what is hidden): docs/biomes/beach.md.
// Views: shore (the cove, the sea), rocks (the headland's foot, the rock pool), dunes (behind the beach, the old boat).
// Instances: pool (the rock pool), grotto (the shell grotto, hidden under the sandbank until storm waves wash it away),
// den (under the upturned boat in the dunes).
import { shoreView } from './shore.js';
import { rocksView } from './rocks.js';
import { dunesView } from './dunes.js';
import { pool } from './pool.js';
import { grotto } from './grotto.js';
import { den } from './den.js';
import { EXITS } from './exits.js';

const VIEW = (x0, x1) => ({ x: 0, y: 0, w: 2000, h: 1000, safe: { x: x0, y: 0, w: x1 - x0, h: 1000 }, anchorY: 0.85 });

/** dune plants by season, from art-src/beach/dune-plants.png (shared by the shore's dunes and the dunes view) */
function dunePlants(p) {
  const has = (n) => !!p.man.sprites[n];
  const k = (names, head, weight, seasons, lean = 0.06) => ({ heads: names.filter(has), h: [0, 0], head, weight, seasons, lean });
  return [
    k(['thrift-1', 'thrift-2', 'thrift-3'], 52, 3, ['spring', 'summer']),
    k(['marram-1', 'marram-2'], 80, 2, ['spring', 'summer']),
    k(['holly-1', 'holly-2'], 70, 2, ['summer']),
    k(['poppy-1', 'poppy-2'], 74, 2, ['summer']),
    k(['bindweed'], 36, 1, ['summer']),
    k(['drygrass-1', 'drygrass-2'], 86, 3, ['autumn']),
    k(['buckthorn-1', 'buckthorn-2'], 84, 2, ['autumn']),
    k(['holly-dry'], 64, 1, ['autumn', 'winter']),
    k(['snowtuft-1', 'snowtuft-2', 'snowtuft-3'], 62, 3, ['winter']),
    k(['snowmound-1', 'snowmound-2'], 44, 1.5, ['winter']),
  ].filter((q) => q.heads.length);
}

export default {
  id: 'beach',
  name: 'The Beach',
  painted: 'beach',
  view: 'shore',
  views: { shore: VIEW(120, 1720), rocks: VIEW(100, 1700), dunes: VIEW(250, 1850) },
  music: {
    preset: 'beach',
    ambience: { waves: 1, gulls: 0.8, wind: 0.4, crickets: 0.25 },
    env: { night: { ambience: { gulls: 0, crickets: 0.5 } }, winter: { ambience: { crickets: 0 } } },
  },
  instances: { pool, grotto, den },

  create(engine) {
    const fx = engine.art.fx, R = engine.random || Math.random;
    const audio = () => engine.audio || {};
    const note = (step, o) => { const a = audio(); if (a.note) a.note(step, o || {}); };
    const sfx = (name, o) => { const a = audio(); if (a.sfx && a.sfx.play) a.sfx.play(name, o || {}); };
    const tune = [];
    const B = {
      engine, fx, note, sfx, R, dunePlants,
      /** the last notes the child drew in the sand (the bottle sings them back) */
      remember: (st) => { if (tune[tune.length - 1] !== st) tune.push(st); if (tune.length > 16) tune.shift(); },
      tune: () => tune,
      /** how much the sea glows under a finger: summer and autumn nights (the sea's own light) */
      nightGlow: () => { const e = engine.env; return (e.season === 'summer' || e.season === 'autumn') ? Math.max(0, engine.art.nightness(e) - 0.35) / 0.65 : 0; },
    };
    const views = { shore: shoreView(B), rocks: rocksView(B), dunes: dunesView(B) };
    for (const e of EXITS) engine.exits.add(e);
    const cur = () => views[engine.view];
    let place = null;
    return {
      instances: { pool, grotto, den },
      get viewScenes() { return views; },   // for tests (QG.engine.world.top.scene.viewScenes); not `views`: the engine reads scene.views as the view frames (camera.js normaliseViews)
      setup(p) {
        place = p;
        for (const id of Object.keys(views)) if (p.man.views[id]) { p.show(id); views[id].setup(p); }
        p.show(engine.view || 'shore');
      },
      closed() { place = null; for (const v of Object.values(views)) v.closed(); },
      stroke(s, p) { const v = cur(); return v && p ? v.stroke(s, p) : undefined; },
      tap(pt, p) { const v = cur(); return v && p ? v.tap(pt, p) : undefined; },
      hold(pt, p) { const v = cur(); return v && p && v.hold ? v.hold(pt, p) : undefined; },
      press(pt) { const v = cur(); return v && place && v.press ? v.press(pt) : false; },
      drag(pt) { const v = cur(); if (v && v.drag) v.drag(pt); },
      release(pt) { const v = cur(); if (v && v.release) v.release(pt); },
      update(dt, env) { if (!place) return; const v = cur(); if (v) v.update(dt, env); },
      draw(g, env, view, p) { const v = cur(); if (v) v.draw(g, env, view, p); },
      onEnv(next, prev) { for (const v of Object.values(views)) if (v.onEnv) v.onEnv(next, prev); },
    };
  },
};
