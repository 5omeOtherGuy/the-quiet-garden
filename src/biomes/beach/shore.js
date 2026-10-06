// The shore view: the cove. The sea breathes in and out; the child grows its waves, draws in the wet sand, finds what
// the sea leaves, wakes the lighthouse, and on a summer night helps the turtle hatchlings to the moon's path.
import { createSea } from './sea.js';
import { createSand } from './sand.js';
import { createLamp } from './lighthouse.js';
import { SHORE as C } from './coords.js';
import { blit } from '../../art/painted.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b, x, y) => Math.hypot(a - x, b - y);

// what the sea leaves on the sand: piece name -> how it answers a touch
const FINDS = [
  ['shell-1', 'shell', 5], ['shell-2', 'shell', 5], ['shell-3', 'shell', 4], ['shell-4', 'whelk', 3], ['shell-5', 'shell', 3], ['shell-6', 'shell', 3],
  ['shell-7', 'shell', 3], ['shell-8', 'shell', 3], ['shell-9', 'shell', 2], ['shell-10', 'shell', 3], ['shell-11', 'shell', 3], ['shell-12', 'whelk', 2],
  ['pebble-1', 'pebble', 3], ['pebble-2', 'pebble', 3], ['pebble-3', 'pebble', 3], ['glass-1', 'glass', 2], ['glass-2', 'glass', 2], ['glass-3', 'glass', 2],
  ['weed-1', 'weed', 3], ['weed-2', 'weed', 2], ['driftwood', 'wood', 1.5], ['feather', 'feather', 2], ['starfish', 'star', 1.5],
];
const GLASS_RGB = { 'glass-1': [0.6, 1, 0.75], 'glass-2': [0.6, 0.85, 1], 'glass-3': [1, 0.8, 0.45] };

export function shoreView(B) {
  const { engine, fx, note, sfx } = B, R = engine.random || Math.random;
  const V = { finds: [], gulls: [], waders: [], crabs: [], hatch: [], glows: [], ribbons: [] };
  let p = null, sea = null, sand = null, field = null;
  const lamp = createLamp(engine, { x: C.lamp.x, y: C.lamp.y, len: 1100, r: 12 });
  const nest = { x: C.nest.x, y: C.nest.y, ready: true, wake: 0, glint: 0 };
  const bank = { wear: 0, k: 0, open: false, sprite: null, exit: null, foam: [], savedAt: 0, step: 0, burstT: 0 };
  let bottle = null;

  // ---------------------------------------------------------------------------------------------- the sea's gifts
  function pickFind(big) {
    if (big && !bottle && R() < 0.35) return ['bottle', 'bottle'];
    let sum = 0; for (const f of FINDS) sum += f[2]; let q = R() * sum;
    for (const f of FINDS) { q -= f[2]; if (q <= 0) return f; } return FINDS[0];
  }
  function lay(x, y, f, o = {}) {
    if (!p.man.sprites[f[0]]) return null;
    const s = p.add(f[0], { view: 'shore', x, y, depth: true, scale: 0.85 + 0.3 * R(), flip: R() < 0.5, data: { kind: f[1], t: 0, state: 'lie' } });
    s.rot = 0; s.vis = o.vis ?? 0; s.alpha = 1;
    if (f[1] === 'bottle') bottle = s;
    V.finds.push(s);
    if (V.finds.length > 11) take(V.finds.find((q) => q.data.state === 'lie'), 0);
    return s;
  }
  function take(s, toward) {
    if (!s || s.data.state !== 'lie') return;
    s.data.state = 'go'; s.data.t = 0; s.data.to = toward ?? (C.shore(s.x) - 10);
  }
  function seaGifts(w, yRun) {
    // what lay where the water ran is taken; a few other things are left at the high mark
    for (const s of V.finds) if (s.data.state === 'lie' && Math.abs(s.x - w.x) < w.span * 1.1 && s.y < yRun - 10 && R() < 0.35 + 0.25 * w.size) take(s);
    const n = w.size > 2.2 ? 3 : w.size > 1.3 ? (R() < 0.7 ? 2 : 1) : R() < 0.45 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const x = clamp(w.x + (R() - 0.5) * w.span * 1.6, C.sand.x0, C.sand.x1), y = clamp(yRun - 15 - R() * 50, C.shore(x) + 25, 985);
      if (p.region(x, y) === 'sand') lay(x, y, pickFind(w.size > 2.2), { vis: 0 });
    }
  }

  // ---------------------------------------------------------------------------------------------- creatures
  function gull(x, y) {
    const s = p.add('gull', { view: 'shore', x, y, depth: true, pose: 'stand', times: ['dawn', 'day', 'dusk'], flip: R() < 0.5 });
    s.data = { st: 'stand', t: 2 + R() * 4, from: [x, y], to: null, k: 0, hover: null };
    s.breathe(0.012, 0.8); V.gulls.push(s); return s;
  }
  function liftGull(s, away = true) {
    const d = s.data; if (d.st === 'fly') return;
    const spots = C.gullSpots.filter((q) => dist(q[0], q[1], s.x, s.y) > 300);
    const to = away ? spots[Math.floor(R() * spots.length)] : [s.x + (R() - 0.5) * 200, s.y];
    d.st = 'fly'; d.k = 0; d.from = [s.x, s.y]; d.to = to; d.dur = 3.5 + R() * 2; d.high = 200 + R() * 200;
    sfx('gull', { vol: 0.35, x: s.x }); sfx('flutter', { vol: 0.25, x: s.x });
  }
  function updateGull(s, dt, env, t) {
    const d = s.data; d.t -= dt;
    const storm = (env.stormy || 0) > 0.45;
    if (storm && d.st !== 'hover') { d.st = 'hover'; d.hover = [C.hover[0] + (R() - 0.5) * 500, C.hover[1] + (R() - 0.5) * 120]; d.k = 0; d.from = [s.x, s.y]; }
    if (!storm && d.st === 'hover') liftGull(s);
    if (d.st === 'stand') {
      if (d.t < 0) { s.setPose(s.pose === 0 && R() < 0.4 ? 'call' : 'stand'); if (s.pose === 1) sfx('gull', { vol: 0.12, x: s.x, size: 0.5 }); d.t = 2 + R() * 5; if (R() < 0.12) liftGull(s); }
    } else if (d.st === 'fly') {
      d.k += dt / d.dur; const k = clamp(d.k, 0, 1);
      s.x = lerp(d.from[0], d.to[0], k); s.y = lerp(d.from[1], d.to[1], k) - Math.sin(k * Math.PI) * d.high;
      s.flip = d.to[0] < d.from[0];
      s.setPose(k < 0.12 || k > 0.9 ? 'lift' : Math.sin(t * 9) > 0.55 && k < 0.5 ? 'lift' : 'glide'); s.rot = (k - 0.5) * 0.25 * (s.flip ? 1 : -1);
      if (k >= 1) { d.st = 'stand'; s.rot = 0; s.setPose('stand'); d.t = 3 + R() * 5; s.poke(0.4); }
    } else if (d.st === 'hover') {
      // hanging in the storm wind, nearly still, rocking
      d.k = Math.min(1, d.k + dt * 0.5);
      const hx = d.hover[0] + Math.sin(t * 0.7 + s._seed) * 40, hy = d.hover[1] + Math.sin(t * 1.3 + s._seed) * 25;
      s.x = lerp(d.from[0], hx, d.k); s.y = lerp(d.from[1], hy, d.k); s.setPose('glide'); s.flip = true; s.rot = Math.sin(t * 2.1 + s._seed) * 0.12;
    }
  }
  function wader(i) {
    const x = C.waders[0] + i * 46 + R() * 30;
    const s = p.add('sanderling', { view: 'shore', x, y: C.shore(x) + 40, depth: true, pose: 'run1', seasons: ['spring', 'autumn', 'winter'], times: ['dawn', 'day', 'dusk'] });
    s.data = { tx: x, ty: s.y, home: x, t: R() * 2, flee: 0 }; V.waders.push(s); return s;
  }
  function updateWader(s, dt, env, t) {
    const d = s.data; d.t -= dt; d.flee = Math.max(0, d.flee - dt);
    const run = sea.runAt(s.x), edge = C.shore(s.x) + 22;
    // they follow the edge of the water: up the beach before a wave, down after it, pecking where it was
    d.ty = run !== null ? run + 26 : edge + 18 + Math.sin(t * 0.4 + s._seed) * 10;
    if (d.flee <= 0 && d.t < 0) { d.tx = clamp(d.home + (R() - 0.5) * 260, C.sand.x0 + 100, C.sand.x1 - 100); d.t = 3 + R() * 4; }
    const dx = d.tx - s.x, dy = d.ty - s.y, m = Math.hypot(dx, dy), sp = (d.flee > 0 ? 260 : 120) * p.scaleAt(s.y);
    if (m > 3) {
      s.x += (dx / m) * Math.min(m, sp * dt); s.y += (dy / m) * Math.min(m, sp * dt * 1.3);
      if (Math.abs(dx) > 2) s.flip = dx < 0;
      s.setPose(Math.floor(t * 12 + s._seed) % 2 ? 'run1' : 'run2');
    } else s.setPose(Math.sin(t * 3 + s._seed * 3) > 0.2 ? 'peck' : 'run1');
    s.alpha = 1 - clamp(((env.stormy || 0) - 0.4) * 3, 0, 1);
  }
  function crab(x, y, wet = 0) {
    const s = p.add('crab', { view: 'shore', x, y, depth: true, pose: 'walk', seasons: ['spring', 'summer', 'autumn'] });
    s.data = { home: [x, y], dir: 1, st: 'walk', t: 0, wet, a: 0 }; if (wet) s.alpha = 0; V.crabs.push(s); return s;
  }
  function updateCrab(s, dt, env, t) {
    const d = s.data; d.t += dt;
    const want = d.wet ? clamp(((env.wet || 0) - 0.25) * 3 + engine.art.nightness(env) * 0.6 - 0.3, 0, 1) : 1;
    if (d.st === 'walk') {
      s.x += d.dir * 26 * p.scaleAt(s.y) * dt * (0.6 + 0.4 * Math.sin(t * 2 + s._seed));
      s.y = d.home[1] + Math.sin((s.x - d.home[0]) * 0.01) * 12;
      if (Math.abs(s.x - d.home[0]) > 170) d.dir = -Math.sign(s.x - d.home[0]);
      s._oy = -Math.abs(Math.sin(t * 14)) * 1.5; s.setPose('walk');
      s.alpha += (want - s.alpha) * Math.min(1, dt * 1.5);
    } else if (d.st === 'claws') { s.setPose('claws'); if (d.t > 0.8) { d.st = 'dig'; d.t = 0; fx.burst(s.x, s.y - 4, { n: 6, power: 0.35, rgb: '226,204,160' }); sfx('dig', { vol: 0.25, x: s.x }); } }
    else if (d.st === 'dig') { s.alpha = Math.max(0, 1 - d.t * 1.6); s._oy = d.t * 10; if (d.t > 4 + 3 * R()) { d.st = 'peek'; d.t = 0; } }
    else if (d.st === 'peek') { s.alpha = Math.min(want, d.t * 0.8); s.setPose(d.t < 1.2 ? 'claws' : 'walk'); if (d.t > 1.2) { d.st = 'walk'; d.t = 0; } }
  }
  function hatch() {
    if (!nest.ready) return;
    nest.ready = false; nest.wake = 0;
    sfx('tok', { count: 3, speed: 2.2, vol: 0.3, x: nest.x });
    fx.burst(nest.x, nest.y - 6, { n: 10, power: 0.4, rgb: '220,200,160' });
    const n = 6 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) engine.after(0.6 + i * 0.35 + R() * 0.3, () => {
      if (!p) return;
      const s = p.add('hatchling', { view: 'shore', x: nest.x + (R() - 0.5) * 50, y: nest.y + (R() - 0.5) * 12, depth: true, scale: 0.9 + R() * 0.2 });
      s.data = { sp: 34 + R() * 16, ph: R() * 6, st: 'crawl' }; s.vis = 0.2; V.hatch.push(s);
      fx.burst(s.x, s.y - 4, { n: 3, power: 0.25, rgb: '230,214,176' }); note(5 + i % 5, { instrument: 'kalimba', vol: 0.22, x: s.x });
    });
    engine.after(70 + R() * 40, () => { nest.ready = true; });
  }
  function updateHatch(s, dt, env, t) {
    const d = s.data;
    // toward the brightest water: the moon's path at night, the sun's by day
    const tx = C.moonPath + (s.x - C.moonPath) * 0.6, ty = C.shore(s.x) - 6;
    if (d.st === 'crawl') {
      const dx = tx - s.x, dy = ty - s.y, m = Math.hypot(dx, dy) || 1, sp = d.sp * p.scaleAt(s.y);
      s.x += (dx / m) * sp * dt + Math.sin(t * 3 + d.ph) * 6 * dt; s.y += (dy / m) * sp * dt;
      s.rot = Math.sin(t * 7 + d.ph) * 0.18 + Math.atan2(dx, -dy) * 0.3; s.flip = dx < 0;
      const run = sea.runAt(s.x);
      if ((run !== null && s.y < run + 6) || m < 10) { d.st = 'swim'; d.t = 0; fx.ripple(s.x, s.y, { r: 22, n: 1 }); note(9 + Math.floor(R() * 4), { instrument: 'glass', vol: 0.18, x: s.x }); }
    } else { d.t += dt; s.alpha = Math.max(0, 1 - d.t * 1.2); s.y -= 20 * dt; if (s.alpha <= 0) { p.remove(s); V.hatch.splice(V.hatch.indexOf(s), 1); } }
  }

  // ---------------------------------------------------------------------------------------------- the sandbank and the grotto
  // A storm wears the sandbank away by itself: foam creeps up its foot and the sand washes out over the seconds (about
  // a minute of full storm; the child stirring the sea near it in the storm makes it go faster). When it is gone the
  // round cave mouth shows. Out of a storm the sand drifts slowly back; once open it stays about 40 minutes (saved).
  function bankK() { return bank.open ? 1 : bank.wear * 0.75; }
  function setBank(wear, quiet) {
    bank.wear = clamp(wear, 0, 1); const was = bank.open; bank.open = bank.wear >= 1;
    if (bank.open && !bank.exit) { bank.exit = { in: 'shore', x: C.grotto.x, y: C.grotto.y, r: C.grotto.r, inst: 'grotto' }; engine.exits.add(bank.exit); }
    if (!bank.open && bank.exit) { engine.exits.remove(bank.exit); bank.exit = null; }
    if (bank.open && !was && !quiet) { note(0, { instrument: 'drone', octave: -1, dur: 4, vol: 0.32 }); sfx('wonder', { vol: 0.4, x: C.grotto.x }); fx.burst(C.grotto.x, C.grotto.y + 30, { n: 22, power: 0.7, rgb: '232,214,176' }); }
    if (!quiet) { bank.savedAt = engine.now(); engine.save.set('bank', { wear: bank.wear, at: Date.now() }); }
  }
  function wearBank(d) {
    if (bank.open || d <= 0) return;
    bank.wear = Math.min(1, bank.wear + d);
    const st = Math.floor(bank.wear * 4);
    if (st > bank.step && bank.wear < 1) { bank.step = st; note(st * 2, { instrument: 'drone', octave: -1, dur: 2.5, vol: 0.22 }); }
    if (bank.wear >= 1) setBank(1, false); else if (engine.now() - bank.savedAt > 5) setBank(bank.wear, false);
  }
  function updateBank(dt, env) {
    const st = env.stormy || 0;
    if (!bank.open) {
      if (st > 0.35) wearBank(dt * (st - 0.3) / 45);
      else if (bank.wear > 0) { bank.wear = Math.max(0, bank.wear - dt / 400); bank.step = Math.floor(bank.wear * 4); }
    }
    // foam creeping up the foot of the bank in a storm, higher as the sand goes
    if (st > 0.35 && !bank.open && bank.foam.length < 14 && R() < dt * 5 * st) {
      bank.foam.push({ x: C.bank.x + (R() - 0.6) * C.bank.r * 1.8, y: C.bankFoot - R() * 20, rise: (25 + 70 * bank.wear) * (0.6 + 0.4 * R()), t: 0, life: 2.2 + R() * 1.2, w: 70 + R() * 60, flip: R() < 0.5, piece: R() * 3 | 0 });
    }
    for (let i = bank.foam.length - 1; i >= 0; i--) { const f = bank.foam[i]; f.t += dt; if (f.t > f.life) bank.foam.splice(i, 1); }
    bank.burstT -= dt;
    if (st > 0.35 && !bank.open && bank.burstT < 0) { bank.burstT = 1.2 + R() * 1.5; fx.burst(C.bank.x + (R() - 0.5) * C.bank.r, C.bankFoot - 20 - 60 * bank.wear, { n: 5 + Math.round(8 * bank.wear), power: 0.4, rgb: '232,214,176' }); }
  }
  function drawBankFoam(g, nightK) {
    for (const f of bank.foam) {
      const pc = (p.man.sprites['foam-' + (f.piece + 1)] || {}).poses; if (!pc) continue;
      const u = f.t / f.life, up = Math.sin(Math.PI * Math.min(1, u * 1.2)), s = p.scaleAt(f.y), w = f.w * s * 2, h = w * pc[0].h / pc[0].w * 0.7;
      const y = f.y - up * f.rise * s;
      g.save(); if (f.flip) { g.translate(f.x, 0); g.scale(-1, 1); g.translate(-f.x, 0); }
      blit(g, pc[0], nightK, 0.75 * up, f.x - w / 2, y - h, w, h); g.restore();
    }
  }

  // ---------------------------------------------------------------------------------------------- setup
  function setup(pl) {
    p = pl; V.finds.length = V.gulls.length = V.waders.length = V.crabs.length = V.hatch.length = 0; bottle = null;
    p.show('shore');
    sea = createSea(engine, p, {
      view: 'shore', farY: C.farY, shore: C.shore, x0: C.sea.x0, x1: C.sea.x1,
      onGrow: (w) => { note(Math.round(clamp(w.target * 3, 0, 9)), { instrument: 'water', octave: 1, vol: 0.4, x: w.x }); if ((engine.env.stormy || 0) > 0.35 && Math.abs(w.x - C.bank.x) < w.span + C.bank.r) wearBank(0.03 * engine.env.stormy); },
      onBreak: (w) => { sfx('wave', { size: clamp(w.size / 3, 0.15, 1), vol: 0.18 + 0.15 * Math.min(w.size, 2.5), x: w.x }); if (B.nightGlow() > 0.3) for (let i = 0; i < 6; i++) glow(w.x + (R() - 0.5) * w.span * 1.6, C.shore(w.x) - 10 + R() * 20, 0.8); },
      onWash: (w, yRun) => {
        if (sand.wash(w.x, w.span * 1.15 * p.scaleAt(yRun), C.shore(w.x), yRun, 1)) { if (engine.again('sandwash', 2) < 1) sfx('whoosh', { vol: 0.15, x: w.x }); }
        seaGifts(w, yRun);
        if ((engine.env.stormy || 0) > 0.35 && Math.abs(w.x - C.bank.x) < w.span + C.bank.r) wearBank(0.02 * w.size * engine.env.stormy);
        for (const s of V.crabs) if (s.data.st === 'walk' && Math.abs(s.x - w.x) < w.span && s.y < yRun) { s.data.st = 'claws'; s.data.t = 0; }
      },
    });
    sand = createSand(engine, p, {
      view: 'shore', top: (x) => C.shore(x) + 12,
      onStep: (x, y, n) => { const st = Math.floor(clamp((x - C.sand.x0) / (C.sand.x1 - C.sand.x0), 0, 0.999) * 10); note(st, { instrument: 'kalimba', vol: 0.36, x }); B.remember(st); if (n % 3 === 0) fx.burst(x, y, { n: 2, power: 0.2, rgb: '240,226,190' }); },
    });
    p.grown.push(sand.layer, sea.layer, { view: 'shore', stats: { n: 0 }, update() {}, drawGround: (g, nightK) => drawBankFoam(g, nightK) });
    field = p.field({ region: 'meadow', max: 90, keep: 14, spacing: 30, wild: 10, kinds: B.dunePlants(p),
      onBloom: (it) => { const h = field.headOf(it); fx.burst(h.x, h.y, { n: 2, power: 0.3 }); note(3 + Math.floor(R() * 6), { instrument: 'pluck', vol: 0.18, x: it.x }); } });
    field.seed(10, R, true);
    for (let i = 0; i < 5; i++) { const x = lerp(C.sand.x0 + 80, C.sand.x1 - 80, R()), y = lerp(C.shore(x) + 60, 960, R()); if (p.region(x, y) === 'sand') lay(x, y, pickFind(false), { vis: 1 }); }
    gull(C.gullSpots[0][0], C.gullSpots[0][1]); gull(C.gullSpots[2][0], C.gullSpots[2][1]);
    for (let i = 0; i < 5; i++) wader(i);
    crab(C.crab[0], C.crab[1]); crab(C.crab[0] - 380, C.crab[1] + 70, 1); crab(C.crab[0] + 320, C.crab[1] + 40, 1);
    const hermit = p.add('hermit', { view: 'shore', x: C.hermit[0], y: C.hermit[1], depth: true, pose: 'in', seasons: ['spring', 'summer', 'autumn'] });
    hermit.data = { st: 'in', t: 0, home: [...C.hermit] }; V.hermit = hermit;
    bank.sprite = p.man.sprites['grotto-open'] ? p.add('grotto-open', { view: 'shore', x: C.bankSprite.x, y: C.bankSprite.y, touchable: false, z: -400 }) : null;
    if (bank.sprite) { bank.sprite.data = { bank: true }; bank.sprite.alpha = 0; }
    const sv = engine.save.get('bank', null);
    if (sv && Date.now() - sv.at < 40 * 60 * 1000) setBank(sv.wear ?? (sv.hits || 0) / 3, true); else setBank(0, true);
    bank.step = Math.floor(bank.wear * 4); bank.foam.length = 0;
    bank.k = bankK();
    // a ship from long ago that sails along the horizon only in fog
    V.ship = p.man.sprites.ship ? p.add('ship', { view: 'shore', x: 300, y: C.shipY, z: -600, touchable: true }) : null;
    if (V.ship) { V.ship.alpha = 0; V.ship.data = { on: false, k: 0, x0: 300, fade: 1 }; }
  }

  // ---------------------------------------------------------------------------------------------- touch
  function glow(x, y, k = 1) { V.glows.push({ x, y, t: 0, life: 1.6 + R() * 1.2, k, r: 10 + R() * 14 }); if (V.glows.length > 160) V.glows.shift(); }
  const strokeD = new Map();
  function stroke(s) {
    if (!p) return;
    const env = engine.env, over = s.over;
    if (s.phase === 'end') { sand.stroke({ id: s.id }, 'end'); strokeD.delete(s.id); return; }
    let d = strokeD.get(s.id) || 0; d += s.speed * 0.016 + 4; strokeD.set(s.id, d);
    // creatures notice a finger coming near
    for (const w of V.waders) if (dist(w.x, w.y, s.x, s.y) < 120) scare(w);
    for (const g of V.gulls) if (g.data.st === 'stand' && dist(g.x, g.y - 40, s.x, s.y) < 80) liftGull(g);
    if (over === 'sand') {
      let drew = false;
      for (let i = 0; i < s.n; i++) drew = sand.stroke({ x: s.points[i].x, y: s.points[i].y, id: s.id }, s.phase) || drew;
      return drew || undefined;
    }
    sand.stroke({ id: s.id }, 'end');
    if (over === 'water') {
      const night = B.nightGlow();
      if (night > 0.3) { for (let i = 0; i < s.n; i++) if (R() < 0.6) glow(s.points[i].x + (R() - 0.5) * 20, s.points[i].y + (R() - 0.5) * 10, night); }
      if (d > 70) {
        strokeD.set(s.id, 0);
        const nearMoon = Math.abs(s.x - C.moonPath) < 140 * (1 + (s.y - C.farY) / 300);
        if (night > 0.3) note(5 + Math.floor((s.x / 2000) * 8), { instrument: nearMoon ? 'bell' : 'glass', vol: 0.2, x: s.x });
        else { fx.ripple(s.x, s.y, { r: 50, flat: 0.25, n: 1 }); note(4 + Math.floor((s.x / 2000) * 8), { instrument: 'water', vol: 0.25, x: s.x }); }
        if (nearMoon || (!night && Math.abs(s.x - C.moonPath) < 120)) fx.burst(s.x, s.y, { n: 3, power: 0.3, rgb: night > 0.3 ? '230,240,255' : '255,250,220' });
      }
      return true;
    }
    if (over === 'meadow' && env.season === 'winter' && d > 40) { strokeD.set(s.id, 0); fx.burst(s.x, s.y, { n: 3, power: 0.25, rgb: '255,255,255' }); }
    return undefined;
  }
  function scare(w) { if (w.data.flee > 0) return; w.data.flee = 1.6; w.data.tx = clamp(w.x + (w.x < 1000 ? 1 : -1) * (250 + R() * 150), C.sand.x0 + 60, C.sand.x1 - 60); w.data.home = w.data.tx; sfx('peep', { vol: 0.2, x: w.x, count: 3 }); }

  function tap(pt) {
    if (!p) return;
    const env = engine.env, s = pt.thing, again = (k) => engine.again(k, 20);
    if (s) {
      if (V.gulls.includes(s)) {
        if (s.data.st === 'hover') { s.data.hover[0] += 160; s.data.k = 0.4; s.data.from = [s.x, s.y]; sfx('gull', { vol: 0.3, x: s.x }); }
        else if (s.data.st === 'stand' && again('gull') > 1 && R() < 0.5) { s.setPose('call'); sfx('gull', { vol: 0.35, x: s.x }); s.poke(0.6); }
        else liftGull(s);
        return true;
      }
      if (V.waders.includes(s)) { for (const w of V.waders) scare(w); return true; }
      if (V.crabs.includes(s)) { if (s.data.st === 'walk') { s.data.st = 'claws'; s.data.t = 0; sfx('chitter', { vol: 0.3, x: s.x }); } return true; }
      if (s === V.hermit) { const d = s.data; if (d.st === 'in') { d.st = 'out'; d.t = 0; s.setPose('out'); sfx('squeak', { vol: 0.2, x: s.x }); } else { d.st = 'in'; d.t = 0; s.setPose('in'); s.poke(0.8); sfx('tok', { vol: 0.25 }); } return true; }
      if (V.hatch.includes(s)) { s.poke(0.5); note(10, { instrument: 'glass', vol: 0.2 }); return true; }
      if (V.finds.includes(s)) { touchFind(s, pt); return true; }
      if (s === V.ship) { sfx('bells', { vol: 0.12 }); note(0, { instrument: 'choir', octave: -1, dur: 4, vol: 0.18 }); s.data.fade = 0.3; return true; }
    }
    if (bank.open && dist(pt.x, pt.y, C.grotto.x, C.grotto.y) < C.grotto.r) return false;   // the exit takes it
    if (dist(pt.x, pt.y, C.lamp.x, C.lamp.y + 60) < 90) {
      lamp.poke(); fx.burst(C.lamp.x, C.lamp.y, { n: 8, power: 0.4, rgb: '255,240,200' });
      if ((env.foggy || 0) > 0.3) note(0, { instrument: 'drone', octave: -2, dur: 3.5, vol: 0.4 }); else note(7, { instrument: 'bell', vol: 0.3 });
      return true;
    }
    if (pt.over === 'water') {
      const w = sea.touch(pt.x, pt.y, 1);
      fx.ripple(pt.x, pt.y, { r: 60 + 20 * w.target, n: 2, flat: 0.25 });
      if (B.nightGlow() > 0.3) for (let i = 0; i < 8; i++) glow(pt.x + (R() - 0.5) * 60, pt.y + (R() - 0.5) * 20, 1);
      return true;
    }
    if (pt.over === 'sand') {
      // the turtles' nest (summer): by day eggs tick inside; at night the hatchlings come out
      if (env.season === 'summer' && dist(pt.x, pt.y, nest.x, nest.y) < 70) {
        if (engine.art.nightness(env) > 0.5 && nest.ready) hatch();
        else { sfx('tok', { count: 2, speed: 2, vol: 0.2, x: nest.x }); fx.burst(nest.x, nest.y, { n: 4, power: 0.25, rgb: '230,214,176' }); }
        return true;
      }
      // a dimple, and now and then the sand gives up something small
      fx.ripple(pt.x, pt.y, { r: 26, flat: 0.3, n: 1, rgb: '240,226,196' }); note(Math.floor(clamp((pt.x - C.sand.x0) / (C.sand.x1 - C.sand.x0), 0, 0.999) * 10), { instrument: 'kalimba', vol: 0.3, x: pt.x });
      if (R() < 0.22) { const f = lay(pt.x, pt.y + 4, pickFind(false)); if (f) { f.vis = 0.2; fx.burst(pt.x, pt.y, { n: 5, power: 0.3, rgb: '236,220,186' }); } }
      return true;
    }
    if (pt.over === 'meadow') { const sc = p.scaleAt(pt.y); for (let i = 0; i < 3; i++) field.bloomAt(pt.x + (i ? (R() - 0.5) * 60 * sc : 0), pt.y + (i ? (R() - 0.3) * 30 * sc : 0), { crowd: 4 }); fx.bloom(pt.x, pt.y, { r: 60 * sc + 30 }); return true; }
    // the sky answers softly (a note and a bloom); weather comes only from the weather cloud (BRIEF 24, 31)
    if (pt.over === 'sky' && pt.y < C.farY - 120) { note(9 + Math.floor(clamp(pt.x / 2000, 0, 0.999) * 5), { instrument: 'celesta', vol: 0.25, x: pt.x }); fx.bloom(pt.x, pt.y, { r: 120, rgb: '235,240,250' }); return true; }
    return undefined;
  }
  function touchFind(s, pt) {
    const d = s.data, k = d.kind; s.poke(0.7);
    const step = 3 + Math.floor(R() * 7);
    if (k === 'shell') { note(step, { instrument: 'celesta', vol: 0.3, x: s.x }); fx.burst(s.x, s.y - 8, { n: 5, power: 0.3, rgb: '255,236,230' }); }
    else if (k === 'whelk') { note(0, { instrument: 'choir', octave: 0, dur: 2.4, vol: 0.18 }); sfx('wave', { size: 0.2, vol: 0.15 }); fx.bloom(s.x, s.y - 10, { r: 50, rgb: '230,245,255' }); }   // the sea inside the shell
    else if (k === 'pebble') { note(step, { instrument: 'marimba', vol: 0.3, x: s.x }); sfx('knock', { vol: 0.15 }); s.x += (R() - 0.5) * 30; }
    else if (k === 'glass') { d.glow = 2.5; note(step + 3, { instrument: 'glass', vol: 0.3, x: s.x }); }
    else if (k === 'weed') { sfx('pop', { vol: 0.3, x: s.x, count: 2 + Math.floor(R() * 3) }); }                                                // bladderwrack pops
    else if (k === 'wood') { sfx('tok', { count: 2, vol: 0.3, x: s.x }); note(step, { instrument: 'marimba', octave: -1, vol: 0.3 }); }
    else if (k === 'feather') { d.state = 'fly'; d.t = 0; d.vx = 60 + 80 * (engine.env.windy || 0.3); sfx('whoosh', { vol: 0.12 }); }
    else if (k === 'star') { d.spin = 1; note(step, { instrument: 'harp', vol: 0.3 }); }
    else if (k === 'bottle') { singBack(s); }
  }
  function singBack(s) {
    // the sea kept the tune the child drew in the sand; the bottle sings it back
    const tune = B.tune().slice(-8); const steps = tune.length >= 3 ? tune : [4, 5, 7, 9, 7];
    engine.audio.phrase && engine.audio.phrase(steps.map((q) => [q, 1]), { instrument: 'glass', vol: 0.3 });
    s.data.glow = 4; fx.bloom(s.x, s.y - 10, { r: 70, rgb: '220,240,255' });
  }

  // ---------------------------------------------------------------------------------------------- living
  function update(dt, env) {
    if (!p) return;
    const t = engine.now();
    lamp.update(dt, env);
    for (const g of V.gulls) updateGull(g, dt, env, t);
    for (const w of V.waders) updateWader(w, dt, env, t);
    for (const c of V.crabs) updateCrab(c, dt, env, t);
    for (let i = V.hatch.length - 1; i >= 0; i--) updateHatch(V.hatch[i], dt, env, t);
    const h = V.hermit;
    if (h) { const d = h.data; d.t += dt; if (d.st === 'out') { h.x += 18 * dt * (h.flip ? -1 : 1); h._oy = -Math.abs(Math.sin(t * 9)); if (d.t > 3.5) { d.st = 'in'; d.t = 0; h.setPose('in'); } if (Math.abs(h.x - d.home[0]) > 220) h.flip = h.x > d.home[0]; } else if (d.t > 25 + R() * 20) { d.st = 'out'; d.t = 0; h.setPose('out'); } }
    for (let i = V.finds.length - 1; i >= 0; i--) {
      const s = V.finds[i], d = s.data; d.t += dt;
      if (d.state === 'go') { s.y += (d.to - s.y) * Math.min(1, dt * 2); s.alpha = Math.max(0, 1 - d.t / 1.4); if (s.alpha <= 0) { p.remove(s); V.finds.splice(i, 1); if (s === bottle) bottle = null; } }
      else if (d.state === 'fly') { s.x += d.vx * dt; s.y -= (40 - d.t * 10) * dt; s.rot = Math.sin(d.t * 3) * 0.6; s.alpha = Math.max(0, 1 - d.t / 5); if (s.alpha <= 0) { p.remove(s); V.finds.splice(i, 1); } }
      if (d.spin) { s.rot += dt * d.spin; d.spin = Math.max(0, d.spin - dt * 0.5); }
      if (d.glow) d.glow = Math.max(0, d.glow - dt);
    }
    // the turtles' nest shimmers faintly on summer nights (the only hint)
    if (env.season === 'summer' && nest.ready && engine.art.nightness(env) > 0.5) { nest.glint -= dt; if (nest.glint < 0) { nest.glint = 3 + R() * 4; fx.burst(nest.x + (R() - 0.5) * 30, nest.y - 4, { n: 1, power: 0.15, rgb: '255,250,230' }); } }
    const sh = V.ship;
    if (sh) {
      const d = sh.data, fog = env.foggy || 0;
      if (!d.on && fog > 0.45 && R() < dt * 0.03) { d.on = true; d.k = 0; d.fade = 1; }
      if (d.on) { d.k += dt / 80; sh.x = lerp(C.shipX[0], C.shipX[1], d.k); d.fade = Math.min(1, d.fade + dt * 0.05); sh.alpha = clamp(fog * 1.4 - 0.4, 0, 0.75) * Math.sin(Math.PI * clamp(d.k, 0, 1)) * d.fade; if (d.k >= 1) { d.on = false; sh.alpha = 0; } }
    }
    // the bank: the uncovered arch shows as the sand goes
    updateBank(dt, env);
    const bk = bankK(); bank.k += (bk - bank.k) * Math.min(1, dt * 0.7);
    if (bank.sprite) bank.sprite.alpha = bank.k;
    // wind lifts ribbons of dry sand
    const wi = env.windy || 0;
    if (wi > 0.25 && V.ribbons.length < 26 && R() < dt * 8 * wi) V.ribbons.push({ x: C.sand.x0 - 100, y: lerp(C.shore(1000) + 120, 990, R()), v: 160 + 220 * wi, t: 0, life: 4 + R() * 3, w: 60 + R() * 90, seed: R() * 9 });
    for (let i = V.ribbons.length - 1; i >= 0; i--) { const r = V.ribbons[i]; r.t += dt; r.x += r.v * dt; if (r.t > r.life) V.ribbons.splice(i, 1); }
    for (let i = V.glows.length - 1; i >= 0; i--) { const q = V.glows[i]; q.t += dt; if (q.t > q.life) V.glows.splice(i, 1); }
  }

  function draw(g, env, view) {
    if (!p) return;
    const t = engine.now(), art = engine.art;
    lamp.draw(g, env);
    for (const r of V.ribbons) {
      const a = Math.sin(Math.PI * r.t / r.life) * 0.22, s = p.scaleAt(r.y);
      g.fillStyle = `rgba(246,232,200,${a})`; g.beginPath(); g.ellipse(r.x, r.y + Math.sin(t * 2 + r.seed) * 4, r.w * s, 2.2 * s, 0, 0, Math.PI * 2); g.fill();
    }
    for (const q of V.glows) { const u = q.t / q.life, a = Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u); art.light(g, q.x, q.y, q.r * 3, [0.45, 1, 0.9], 0.9 * a * q.k, { core: 2.2 }); }
    for (const s of V.finds) if (s.data.glow) { const rgb = s.data.kind === 'bottle' ? [0.7, 0.9, 1] : GLASS_RGB[s.name] || [1, 1, 1]; art.light(g, s.x, s.y - 8, 50, rgb, Math.min(1, s.data.glow) * 0.8, { core: 4 }); }
    if (bank.open) { const k = 0.25 + 0.15 * Math.sin(t * 1.1); art.light(g, C.grotto.x, C.grotto.y, 70, [0.55, 0.85, 1], k * bank.k, { core: 6 }); }
  }

  function onEnv(next) { if (next.weather === 'storm' && sea) for (let i = 0; i < 2; i++) sea.spawn(null, R() * 0.4); }

  return { setup, stroke, tap, update, draw, onEnv, closed() { p = null; sea = null; sand = null; }, get sea() { return sea; }, get bank() { return bank; }, setBank, lamp, V };
}
