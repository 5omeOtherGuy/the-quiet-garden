// The Flower Meadow, painted edition (owner: the meadow worker; intentions and the full table: docs/biomes/meadow.md).
// Two still views of one painted landscape (oak, pond: art-src/meadow, web/assets/art/meadow), four instances
// (inside the oak, the hive, the rabbit burrow, and the hidden glow-worm hollow under it). The engine wraps this place
// (docs/ENGINE.md "A painted place"): it opens and frees the paintings, feeds every finger to the painting's motion,
// to the fields and sheds, and to art's sparks. This file says what lives here and how it answers.
//
// The child is nature: strokes bloom the season's flowers, brushed crowns let leaves, petals or snow go, taps make
// flowers, rings, a soft light in the sky, a falling apple; creatures live their own lives and a touch only nudges them.
// Nothing is collected, counted or finished; everything comes back.
import { flowerKinds } from './kinds.js';
import { createThings } from './things.js';
import { createLives } from './lives.js';
import oakroom from './oakroom.js';
import hive from './hive.js';
import burrow from './burrow.js';
import glow from './glow.js';
import { DOOR, HIVE, HOLE, SUN } from './spots.js';

const VIEW = (safe0, safe1) => ({ x: 0, y: 0, w: 2000, h: 1000, safe: { x: safe0, y: 0, w: safe1 - safe0, h: 1000 }, anchorY: 0.85 });

export default {
  id: 'meadow',
  name: 'The Flower Meadow',
  color: '#a9c46c',
  painted: 'meadow',
  view: 'oak',
  // the manifest also holds the instance views; the place itself has these two
  views: { oak: VIEW(0, 1600), pond: VIEW(400, 2000) },
  music: {
    preset: 'meadow',
    ambience: { birds: 1, bees: 1, insects: 0.6, crickets: 1, owls: 0.35, leaves: 0.5, frogs: 0.25 },
    env: { night: { instrument: 'kalimba' }, winter: { ambience: { bees: 0, insects: 0, frogs: 0 } } },
  },

  create(engine) {
    const art = engine.art, fx = art.fx, A = engine.audio || {};
    const R = () => engine.random();
    const V = {};                                                    // per view: field, sheds, sprites of that view
    let P = null;                                                    // art's painted place while it is open
    let sunHand = null;                                              // a finger holding the sun or the moon
    const things = createThings(engine, V);
    const lives = createLives(engine, V, things);

    const note = (step, o) => { if (A.note) A.note(step, o || {}); };
    const sfx = (name, o) => { if (A.sfx && A.sfx.play) A.sfx.play(name, o || {}); };
    const season = () => engine.env.season;
    const night = () => art.nightness(engine.env);

    // ---- ways: the path on to the other view and back, the door, the hive, the far places
    engine.exits.add({ in: 'oak', poly: [[1400, 660], [1600, 650], [1600, 1000], [1380, 1000]], view: 'pond' });   // on along the meadow
    engine.exits.add({ in: 'pond', poly: [[400, 650], [680, 660], [700, 1000], [400, 1000]], view: 'oak' });      // back towards the oak
    engine.exits.add({ in: 'oak', x: DOOR.x, y: DOOR.y, r: DOOR.r, inst: 'oakroom' });
    engine.exits.add({ in: 'pond', x: HIVE.x, y: HIVE.y, r: HIVE.r, inst: 'hive' });
    engine.exits.add({ in: 'oak', poly: [[330, 520], [400, 330], [560, 350], [610, 520]], to: 'wood' });   // into the trees behind the oak
    engine.exits.add({ in: 'pond', x: 1083, y: 538, r: 48, to: 'beach', view: 'dunes' });                   // over the hill by the cottage, down to the sea (painted V1, BRIEF 36: no town)
    // the rabbits' hole: a way in only while the hole is open in the grass (lives.js decides; see docs/biomes/meadow.md)
    const holeExit = { in: 'oak', x: HOLE.x, y: HOLE.y - 14, r: 46, inst: 'burrow' };

    // the meadow's own notes: every bloom, leaf and ring sings, left to right up the scale, in the place's key
    let lastNote = 0;
    function sing(x, y, o = {}) {
      const t = engine.now(); if (t - lastNote < (o.gap ?? 0.07)) return; lastNote = t;
      const s = season(), nk = night();
      const step = Math.floor((x / 2000) * 9) + (y < 600 ? 5 : 0) + (o.up || 0);
      const inst = o.instrument || (s === 'winter' ? 'glass' : nk > 0.6 ? 'celesta' : s === 'autumn' ? 'kalimba' : 'musicbox');
      note(step, { instrument: inst, vol: o.vol ?? 0.09, x });
    }

    return {
      instances: { oakroom, hive, burrow, glow },

      setup(p) {
        P = p;
        for (const view of ['oak', 'pond']) {
          p.show(view);
          const v = (V[view] = { name: view, sprites: [], apples: [], snails: [] });
          v.field = p.field({ region: 'meadow', minY: 648, wild: 30, kinds: flowerKinds(p),
            onBloom: (it) => {
              const h = v.field.headOf(it); fx.burst(h.x, h.y, { n: 2, power: 0.3 });
              if (engine.view === view) { sing(h.x, h.y); things.nightBloom(h.x, h.y); }
            } });
          v.leaves = p.shed({ region: 'crown', ground: 'meadow', pieces: p.set('leaf'), size: [26, 46], seasons: ['autumn'], per: 9, max: 160,
            onLoose: (it) => { if (engine.view === view) sing(it.x, it.y, { instrument: 'pluck', gap: 0.11, vol: 0.07, up: 2 }); } });
          v.petals = p.shed({ region: 'crown', ground: 'meadow', pieces: p.set('petal'), size: [9, 15], seasons: ['spring'], per: 12, max: 160, fall: [50, 90], spin: 2,
            onLoose: (it) => { if (engine.view === view) sing(it.x, it.y, { instrument: 'celesta', gap: 0.12, vol: 0.06, up: 4 }); } });
          v.field.seed(view === 'oak' ? 22 : 18, Math.random, true);
        }
        things.setup(p);
        lives.setup(p, holeExit);
        p.show(engine.view);
      },
      closed() { P = null; things.closed(); lives.closed(); },

      enter() { lives.arrive(); },
      view() { lives.arrive(); },
      resume() { if (art.compositor && 'interior' in art.compositor) art.compositor.interior = 0; },

      onEnv(next, prev) { lives.onEnv(next, prev); things.onEnv(next, prev); },

      stroke(s, p) {
        if (!p) return false;
        const v = V[engine.view]; if (!v) return false;
        let answered = false;
        for (let i = 0; i < s.n; i++) {
          const q = s.points[i], over = p.region(q.x, q.y);
          if (lives.near(q.x, q.y, s)) answered = true;              // a creature feels the hand pass
          if (over === 'meadow') { answered = true; things.strokeMeadow(q.x, q.y, s); }
          else if (over === 'crown') { answered = true; things.strokeCrown(q.x, q.y, s); }
          else if (over === 'water') { answered = true; things.strokeWater(q.x, q.y, s); }
          else if (over === 'sky') { if (things.strokeSky(q.x, q.y, s)) answered = true; }
        }
        if (s.phase === 'end') { things.strokeEnd(s); lives.strokeEnd(s); }
        return answered;
      },

      tap(pt, p) {
        if (!p) return false;
        if (pt.thing && (lives.tap(pt.thing, pt) || things.tapThing(pt.thing, pt))) return true;
        if (things.tapNear(pt)) return true;
        const v = V[engine.view], sc = p.scaleAt(pt.y);
        if (pt.over === 'meadow') {
          for (let i = 0; i < 3; i++) v.field.bloomAt(pt.x + (i ? (R() - 0.5) * 60 * sc : 0), pt.y + (i ? (R() - 0.3) * 30 * sc : 0), { crowd: 4 });
          fx.bloom(pt.x, pt.y, { r: 70 * sc + 30 }); sing(pt.x, pt.y, { gap: 0 });
          return true;
        }
        if (pt.over === 'water') return things.tapWater(pt);
        if (pt.over === 'crown') return things.tapCrown(pt);
        if (pt.over === 'sky') return things.tapSky(pt);
        return false;
      },

      hold(pt, p) {
        if (!p) return false;
        if (pt.over === 'meadow') {                                   // a resting finger: a small ring of flowers opens around it
          const v = V[engine.view], sc = p.scaleAt(pt.y);
          for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + R(); v.field.bloomAt(pt.x + Math.cos(a) * 46 * sc, pt.y + Math.sin(a) * 18 * sc, { crowd: 5 }); }
          if (A.chord) A.chord([0, 2, 4], { instrument: season() === 'winter' ? 'glass' : 'kalimba', vol: 0.12 });
          fx.bloom(pt.x, pt.y, { r: 120 * sc + 30 });
          lives.call(pt);                                             // the creatures of the meadow come a little closer
          return true;
        }
        // a hand resting on the old oak's trunk: the oak turns the year on, and the new season spreads from the hand
        if (engine.view === 'oak' && !pt.over && pt.x < 340 && pt.y > 120 && pt.y < 660 && Math.hypot(pt.x - DOOR.x, pt.y - DOOR.y) > DOOR.r) {
          const order = ['spring', 'summer', 'autumn', 'winter'], next = order[(order.indexOf(season()) + 1) % 4];
          p.washFrom = [pt.x, pt.y]; engine.env.set({ season: next });
          if (A.chord) A.chord([0, 4, 7, 9], { instrument: 'harp', vol: 0.14, strum: 0.18 });
          fx.bloom(pt.x, pt.y, { r: 220, rgb: '255,240,200' }); fx.burst(pt.x, pt.y, { n: 14, power: 0.6 });
          return true;
        }
        return things.hold(pt);
      },

      // the painted sun (and, at night, the moon in the same place): a finger pulls it down for evening and night,
      // or, at night, pulls the moon down for morning
      press(pt) {
        if (engine.view !== 'oak' || Math.hypot(pt.x - SUN.x, pt.y - SUN.y) > SUN.r) return false;
        sunHand = { y0: pt.y, step: 0, from: engine.env.time };
        fx.burst(SUN.x, SUN.y, { n: 8, power: 0.4, rgb: '255,236,180' }); note(7, { instrument: 'bell', vol: 0.1 });
        return true;
      },
      drag(pt) {
        if (!sunHand) return;
        const k = Math.floor(Math.max(0, pt.y - sunHand.y0) / 110); if (k <= sunHand.step) return;
        sunHand.step = k;
        const day = ['dawn', 'day', 'dusk', 'night'], i = day.indexOf(sunHand.from);
        const next = day[(i + k) % 4];
        engine.env.set({ time: next }); fx.burst(pt.x, pt.y, { n: 6, power: 0.3, rgb: '255,236,180' });
        note(7 - k * 2, { instrument: 'bell', vol: 0.1 });
      },
      release() { sunHand = null; },

      update(dt, env, t) {
        if (!P || !V[engine.view]) return;
        things.update(dt, env, t, P);
        lives.update(dt, env, t, P);
      },

      draw(g, env, view, p) {
        // flush the light buffer: a frame that draws no light of its own would otherwise show the last scene's
        // lights again (art/lights.js take() never clears `dirty`; docs/requests/meadow-to-art.md)
        art.light(g, -1e6, -1e6, 1, [0, 0, 0], 0);
        things.draw(g, env, view, p);
        lives.draw(g, env, view, p);
      },
    };
  },
};
