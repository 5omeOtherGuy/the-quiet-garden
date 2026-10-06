// The insides of the wood (owner: wood worker): the badgers' sett, the hollow of the ancient oak, and the grotto behind
// the frozen waterfall. Each is one painting (a view of the wood's manifest) with painted creatures and code light.
// The engine wraps only top-level painted places, so each inside opens its own painting here, draws it still, and
// frees it a few seconds after the child has gone.
import { TAU, clamp, lerp, near, voice, stepAt } from './util.js';

/** A painted inside: opens view `name` of the wood's paintings; `make(engine, S)` returns the room's own play. */
function inside(name, def, make) {
  return {
    ...def,
    create(engine) {
      const fx = engine.art.fx, S = voice(engine);
      let p = null, opening = null, here = false, gen = 0, freeT = null;
      const room = make(engine, S, fx);
      const open = () => {
        if (p || opening || !engine.art.painted) return;
        const my = ++gen;
        opening = engine.art.painted.open('wood', { view: name, pixelHeight: Math.round((engine.pxPerUnit || 1.6) * 1000) }).then((pl) => {
          opening = null; if (my !== gen) { pl.free(); return; }
          p = pl; p.flat = true; room.setup(p);
        }).catch((e) => { opening = null; console.warn(`wood ${name}:`, e); });
      };
      const close = () => { gen++; if (!p) return; const pl = p; p = null; if (room.closed) room.closed(); pl.free(); };
      const ix = (k) => { const c = engine.art.compositor; if (c && 'interior' in c) c.interior = k; };
      return {
        ownWeather: true,
        settled: () => !!p && p.settled,
        build() { open(); },
        enter() { here = true; if (freeT) { freeT(); freeT = null; } open(); ix(1); if (room.enter) room.enter(); },
        leave() { here = false; ix(0); if (freeT) freeT(); freeT = engine.after(3, () => { freeT = null; if (!here) close(); }); },
        resume() { ix(1); },
        free() { close(); },
        update(dt, env) { if (p && room.update) room.update(dt, env, p); },
        draw(g, env, view) {
          if (!p) { open(); g.fillStyle = '#3a2c22'; g.fillRect(view.x, view.y, view.w, view.h); return; }
          p.flat = !view.solo; const t = engine.now();
          p.draw(g, env, view, t);
          if (room.draw) room.draw(g, env, view, p, t);
          fx.draw(g, env, view, t);
        },
        stroke(s) {
          if (!p) return false;
          for (let i = 0; i < s.n; i++) fx.trail(s.points[i].x, s.points[i].y, s.id);
          if (s.phase === 'end') { fx.release(s.id); if (room.strokeEnd) room.strokeEnd(s); return false; }
          return room.stroke ? room.stroke(s, p) : false;
        },
        tap(pt) { if (!p) return false; pt.thing = p.hit(pt.x, pt.y); return room.tap ? room.tap(pt, p) : false; },
        hold(pt) { return false; },
      };
    },
  };
}

// ======================================================================================== the sett
// Badgers asleep in their bed by day and all winter (they stir and snore when touched); in spring two cubs tumble
// about; the hanging roots play the harp under a finger; a deeper tunnel on the right leads on Under the Ground.
export const sett = inside('sett', {
  name: 'The Badgers’ Sett', music: { preset: 'burrow' },
  exits: [
    { poly: [[250, 20], [640, 20], [640, 330], [250, 330]], out: true },          // the tunnel up to the daylight
    // the dark tunnel, deeper, led under the ground: that place is not in the painted V1 (BRIEF 36), so it leads nowhere
  ],
}, (engine, S, fx) => {
  const R = () => engine.random(); let P = null, A = [], cubs = [];
  const BED = { x: 1010, y: 640 };
  return {
    setup(p) {
      P = p; A = []; cubs = [];
      A.push(p.add('badger', { x: BED.x - 130, y: BED.y, pose: 'sleep', scale: 1.15 }).breathe(0.035, 0.6));
      A.push(p.add('badger', { x: BED.x + 110, y: BED.y + 18, pose: 'sleep', scale: 1.05, flip: true }).breathe(0.03, 0.7));
      for (const b of A) b.data = { stir: 0 };
      for (let i = 0; i < 2; i++) cubs.push(p.add('badger', { x: 700 + i * 560, y: 880, scale: 0.55, seasons: ['spring', 'summer'], pose: 'walk1' })
        .life({ home: [700 + i * 560, 880], roam: 220, idle: ['sniff', 'walk1'], walk: ['walk1', 'walk2', 'walk3', 'walk4'], step: 10, speed: 70, alert: 'sniff', hop: null, away: (s) => [clamp(s.x + (R() - 0.5) * 500, 500, 1500), 850 + R() * 80], wait: [1, 3] }));
    },
    closed() { P = null; },
    update(dt, env) {
      const awake = (env.time === 'night' || env.time === 'dusk') && env.season !== 'winter';     // out in the glade
      for (const b of A) { b.alpha += ((awake ? 0 : 1) - b.alpha) * Math.min(1, dt * 2); b.touchable = b.alpha > 0.5; if (b.data.stir > 0) { b.data.stir -= dt; if (b.data.stir <= 0) b.setPose('sleep'); } }
      for (const c of cubs) { c.alpha += ((awake ? 0 : 1) - c.alpha) * Math.min(1, dt * 2); c.touchable = c.alpha > 0.5; }
      if (!awake && env.season === 'winter' && R() < dt * 0.08) S.sfx('snore', { vol: 0.18 });
    },
    tap(pt, p) {
      const s = pt.thing;
      if (s && A.includes(s)) {
        const a = engine.again('sett-badger', 20); s.poke(0.6);
        if (a > 1.5 && engine.env.season !== 'winter') { s.setPose('sniff'); s.data.stir = 2.5; S.sfx('sniff', { vol: 0.35 }); }
        else { S.sfx('snore', { vol: 0.35 }); fx.burst(s.x, s.y - 60, { n: 3, power: 0.2, rgb: '255,236,200' }); }
        return true;
      }
      if (s && cubs.includes(s)) { s.startle(); s.hopTo(s.x + (R() - 0.5) * 120, s.y, { height: 34, time: 0.4 }); S.sfx('squeak', { vol: 0.3, size: 0.3 }); return true; }
      if (pt.y < 300 && !(pt.x > 250 && pt.x < 640)) { fx.burst(pt.x, pt.y, { n: 6, power: 0.3, rgb: '200,170,120' }); S.note(stepAt(pt.x, 5, 8), { instrument: 'harp', vol: 0.2 }); return true; }  // roots and earth crumbs
      if (near(pt, BED.x, BED.y, 260)) { S.sfx('rustle', { vol: 0.3 }); fx.burst(pt.x, pt.y, { n: 6, power: 0.4, rgb: '230,200,120' }); return true; }
      fx.burst(pt.x, pt.y, { n: 4, power: 0.3, rgb: '210,180,130' }); S.note(stepAt(pt.x, 0, 8), { instrument: 'marimba', vol: 0.2 }); return true;
    },
    stroke(s) {
      if (s.y < 300) { if (S.gate('roots', 0.09)) S.note(stepAt(s.x, 5, 9), { instrument: 'harp', vol: 0.16 }); return true; }      // a harp of roots
      if (S.gate('earth', 0.14)) { S.note(stepAt(s.x, 0, 8), { instrument: 'marimba', vol: 0.14 }); fx.burst(s.x, s.y, { n: 1, power: 0.2, rgb: '200,170,120' }); }
      for (const c of cubs) if (c.alpha > 0.5 && near(s, c.x, c.y - 30, 80)) c.startle();
      return true;
    },
  };
});

// ======================================================================================== the hollow
// By day the owl sleeps here (one eye opens when touched); the dormouse sleeps in its nest by day and all winter, and
// is awake in the night; a nut rolls out of the store when touched; the sunbeam glitters where a finger passes.
export const hollow = inside('hollow', {
  name: 'Inside the Old Oak', music: { preset: 'hollow' },
  exits: [{ poly: [[460, 10], [740, 10], [740, 240], [460, 240]], out: true }],                 // the hole, up to the light
}, (engine, S, fx) => {
  const R = () => engine.random(); let owl = null, mouse = null, nuts = [], beam = null;
  const NEST = { x: 1530, y: 425 }, STORE = { x: 1590, y: 730 }, LEDGE = [1220, 1660];
  return {
    setup(p) {
      owl = p.add('owl', { x: 760, y: 925, pose: 'sleep', scale: 1.1 }).breathe(0.025, 0.5); owl.data = { wake: 0 };
      mouse = p.add('dormouse', { x: NEST.x, y: NEST.y, pose: 'sleep', scale: 1.4 }).breathe(0.04, 0.8); mouse.data = { t: 0 };
      nuts = [];
      for (let i = 0; i < 3; i++) { const n = p.add(i === 1 ? 'acorn' : 'hazelnut', { x: STORE.x + (i - 1) * 34, y: STORE.y, scale: 0.9, z: 5 }); n.data = { home: [n.x, n.y], st: 'rest', vy: 0, vx: 0, t: 0 }; nuts.push(n); }
      beam = { x0: 600, y0: 200, x1: 980, y1: 900 };
    },
    closed() { owl = mouse = null; nuts = []; },
    update(dt, env) {
      const night = env.time === 'night' || env.time === 'dusk';
      owl.alpha += ((night ? 0 : 1) - owl.alpha) * Math.min(1, dt * 2); owl.touchable = owl.alpha > 0.5;          // out hunting at night
      if (owl.data.wake > 0) { owl.data.wake -= dt; if (owl.data.wake <= 0) owl.setPose('sleep'); }
      const awake = night && env.season !== 'winter', m = mouse; m.data.t += dt;
      if (!awake) { m.setPose('sleep'); if (Math.hypot(m.x - NEST.x, m.y - NEST.y) > 2) { m.x = NEST.x; m.y = NEST.y; } }
      else if (!m._mover && m.data.t > 2.5 + R() * 3) { m.data.t = 0; m.setPose('awake'); m.hopTo(lerp(LEDGE[0], LEDGE[1], R()), NEST.y + 4, { height: 22, time: 0.35 }); }
      else if (!m._mover) m.setPose('awake');
      if (!awake && env.season === 'winter' && R() < dt * 0.06) S.sfx('snore', { vol: 0.08, pitch: 2 });
      for (const n of nuts) {
        const d = n.data; d.t += dt;
        if (d.st === 'fall') { d.vy += 900 * dt; n.x += d.vx * dt; n.y += d.vy * dt; if (n.y >= 945) { n.y = 945; if (d.vy > 150) { d.vy *= -0.35; S.note(2 + ((R() * 4) | 0), { instrument: 'marimba', vol: 0.18 }); } else { d.st = 'lie'; d.t = 0; } } }
        else if (d.st === 'lie' && d.t > 8) { n.alpha = Math.max(0, 1 - (d.t - 8) / 2); if (n.alpha <= 0) { d.st = 'back'; d.t = 0; [n.x, n.y] = d.home; } }
        else if (d.st === 'back') { n.alpha = Math.min(1, d.t / 1.5); if (n.alpha >= 1) d.st = 'rest'; }
      }
    },
    draw(g, env, view, p, t) {                                                                       // dust glitters in the sunbeam
      const nk = engine.art.nightness ? engine.art.nightness(env) : (env.time === 'night' ? 1 : 0);
      if (nk > 0.02) {                                                  // one painting (by day): at night a blue dusk veils it, the hole shows moonlight
        g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(70,82,130,${(0.62 * nk).toFixed(3)})`;
        g.fillRect(view.x, view.y, view.w, view.h); g.restore();
        engine.art.light(g, 600, 120, 260, [0.7, 0.8, 1], 0.5 * nk, { core: 10 });
      }
      if (env.time === 'night') return;
      for (let i = 0; i < 14; i++) {
        const k = ((i * 0.071 + t * 0.012 * (1 + (i % 3))) % 1), x = lerp(beam.x0, beam.x1, k) + Math.sin(t * 0.5 + i * 2.1) * 60, y = lerp(beam.y0, beam.y1, k) + Math.cos(t * 0.4 + i) * 30;
        engine.art.light(g, x, y, 14, [1, 0.92, 0.7], 0.35 + 0.25 * Math.sin(t * 1.7 + i), { core: 1.6 });
      }
    },
    tap(pt, p) {
      const s = pt.thing;
      if (s === owl) { owl.setPose('front'); owl.data.wake = 1.6; owl.poke(0.4); S.sfx('hoot', { vol: 0.2 }); return true; }
      if (s === mouse) {
        if (mouse.pose === 0 || mouse.def.names[mouse.pose] === 'sleep') { mouse.poke(0.5); S.sfx('snore', { vol: 0.15, pitch: 2 }); }
        else { mouse.hopTo(lerp(LEDGE[0], LEDGE[1], R()), NEST.y + 4, { height: 30, time: 0.35 }); S.sfx('squeak', { vol: 0.3, size: 0.15 }); }
        return true;
      }
      if (s && nuts.includes(s) && s.data.st === 'rest') { s.data.st = 'fall'; s.data.vy = -120; s.data.vx = -60 - R() * 80; S.sfx('tok', { vol: 0.25 }); return true; }
      if (near(pt, STORE.x, STORE.y, 120)) { const n = nuts.find((q) => q.data.st === 'rest'); if (n) { n.data.st = 'fall'; n.data.vy = -120; n.data.vx = -60 - R() * 80; S.sfx('tok', { vol: 0.25 }); return true; } }
      fx.burst(pt.x, pt.y, { n: 6, power: 0.35, rgb: '255,230,170' }); S.note(stepAt(pt.x, 3, 8), { instrument: 'harp', vol: 0.18 }); return true;
    },
    stroke(s) {
      // through the sunbeam: the dust glitters and celesta notes ring
      const inBeam = Math.abs((s.x - beam.x0) / (beam.x1 - beam.x0) - (s.y - beam.y0) / (beam.y1 - beam.y0)) < 0.18;
      if (inBeam && engine.env.time !== 'night') { if (S.gate('beam', 0.1)) { S.note(stepAt(s.x, 6, 7), { instrument: 'celesta', vol: 0.14 }); fx.burst(s.x, s.y, { n: 2, power: 0.25, rgb: '255,236,180' }); } return true; }
      if (S.gate('wood', 0.13)) S.note(stepAt(s.x, 2, 8), { instrument: 'harp', vol: 0.12 });
      return true;
    },
  };
});

// ======================================================================================== the grotto
// Behind the frozen waterfall: glow-worms on the ceiling that brighten and sing under a finger, a still pool that rings,
// drops that fall from the roof now and then, and bats asleep for the winter (touched, one stretches a wing).
export const grotto = inside('grotto', {
  name: 'The Grotto behind the Waterfall', music: { preset: 'cave', key: 'D' },
  exits: [{ poly: [[200, 160], [900, 160], [900, 630], [200, 630]], out: true }],                 // the icicle curtain, out
}, (engine, S, fx) => {
  const R = () => engine.random(); let worms = [], bats = [], drip = 2;
  const POOL = { x: 1050, y: 800, rx: 700, ry: 125 };
  return {
    setup(p) {
      worms = [];
      for (let i = 0; i < 70; i++) { const x = 920 + R() * 1000, y = 30 + R() * 360 * (0.3 + 0.7 * R()); worms.push({ x, y, k: 0, ph: R() * TAU, b: 0.5 + R() * 0.5 }); }
      bats = [[1120, 120], [1460, 95], [1660, 170]].map(([x, y], i) => { const b = p.add('bat', { x, y, pose: 'sleep', scale: 0.9 - i * 0.1, flip: i === 1 }).breathe(0.03, 0.5); b.data = { st: 0 }; return b; });
    },
    closed() { worms = []; bats = []; },
    update(dt) {
      for (const w of worms) w.k = Math.max(0, w.k - dt * 0.35);
      for (const b of bats) if (b.data.st > 0) { b.data.st -= dt; if (b.data.st <= 0) b.setPose('sleep'); }
      drip -= dt;
      if (drip <= 0) { drip = 3 + R() * 5; const x = POOL.x + (R() - 0.5) * POOL.rx * 1.2, y = POOL.y + (R() - 0.5) * POOL.ry; fx.ripple(x, y, { r: 50, n: 2 }); S.note(stepAt(x, 4, 8), { instrument: 'water', vol: 0.18 }); }
    },
    draw(g, env, view, p, t) {
      for (const w of worms) {
        const b = w.b * (0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.6 + w.ph), 2)) + w.k;
        engine.art.light(g, w.x, w.y, 22 + 18 * w.k, [0.55, 0.95, 1], 0.7 * b, { core: 1.8 + w.k });
        // and their light in the pool
        if (w.x > POOL.x - POOL.rx && w.x < POOL.x + POOL.rx) engine.art.light(g, w.x, POOL.y + (POOL.y - w.y) * 0.12, 14, [0.55, 0.95, 1], 0.25 * b, { core: 1 });
      }
    },
    tap(pt) {
      const s = pt.thing;
      if (s && bats.includes(s)) { s.setPose('stretch'); s.data.st = 2; s.poke(0.4); S.sfx('squeak', { vol: 0.15, size: 0.05 }); return true; }
      if (Math.hypot((pt.x - POOL.x) / POOL.rx, (pt.y - POOL.y) / POOL.ry) < 1.1) { fx.ripple(pt.x, pt.y, { r: 80, n: 3 }); S.sfx('plop', { vol: 0.3 }); S.note(stepAt(pt.x, 2, 8), { instrument: 'water', vol: 0.22 }); return true; }
      let hit = 0; for (const w of worms) if (Math.hypot(w.x - pt.x, w.y - pt.y) < 120) { w.k = 1; hit++; }
      if (hit) { S.chord([7, 9, 11].map((q) => q + stepAt(pt.x, 0, 3)), { instrument: 'glass', vol: 0.14, strum: 0.07 }); return true; }
      fx.burst(pt.x, pt.y, { n: 5, power: 0.3, rgb: '190,230,255' }); S.note(stepAt(pt.x, 4, 8), { instrument: 'glass', vol: 0.16 }); return true;
    },
    stroke(s) {
      if (Math.hypot((s.x - POOL.x) / POOL.rx, (s.y - POOL.y) / POOL.ry) < 1.1) { if (S.gate('pool', 0.16)) { fx.ripple(s.x, s.y, { r: 50 }); S.note(stepAt(s.x, 2, 8), { instrument: 'water', vol: 0.18 }); } return true; }
      for (const w of worms) if (Math.hypot(w.x - s.x, w.y - s.y) < 80) { if (w.k < 0.3 && S.gate('worm', 0.07)) S.note(stepAt(w.x, 6, 8), { instrument: 'glass', vol: 0.12 }); w.k = 1; }
      return true;
    },
  };
});
