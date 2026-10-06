// The dunes view: behind the beach. Sea flowers and grasses come up under the finger; dry sand stroked down a slope
// slides and sings (the singing sands); the fence hums in the wind; the old upturned boat hides a den (the fox
// slips in there at dusk); sand martins fly in and out of their holes in the bank (spring, summer); a skylark rises
// singing; natterjack toads sing on spring nights and in warm rain; snow buntings visit in winter.
import { DUNES as C } from './coords.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function dunesView(B) {
  const { engine, fx, note, sfx } = B, R = engine.random || Math.random;
  let p = null, field = null, fox = null, lark = null, moths = null;
  const martins = [], toads = [], buntings = [], slides = [], strokeD = new Map();

  function setup(pl) {
    p = pl; martins.length = toads.length = buntings.length = 0;
    const S = (n, o) => (p.man.sprites[n] ? p.add(n, { view: 'dunes', ...o }) : null);
    field = p.field({ region: 'meadow', max: 120, spacing: 28, wild: 18, kinds: B.dunePlants(p),
      onBloom: (it) => { const h = field.headOf(it); fx.burst(h.x, h.y, { n: 2, power: 0.3 }); note(3 + Math.floor(R() * 6), { instrument: 'pluck', vol: 0.18, x: it.x }); } });
    field.seed(18, R, true);
    fox = S('fox', { x: C.foxPath[0][0], y: C.foxPath[0][1], pose: 'stand', depth: true });
    if (fox) fox.data = { st: 'walk', t: 0, i: 0, k: 0 };
    lark = S('lark', { x: C.lark[0], y: C.lark[1], pose: 'sit', depth: true, seasons: ['spring', 'summer'], times: ['dawn', 'day'] });
    if (lark) lark.data = { st: 'sit', t: 0, y0: C.lark[1] };
    for (let i = 0; i < 4; i++) { const m = S('martin', { x: C.holes[i % C.holes.length][0], y: C.holes[i % C.holes.length][1], seasons: ['spring', 'summer'], times: ['dawn', 'day', 'dusk'], touchable: false, z: 400, scale: 0.9 }); if (!m) break; m.fly(() => { const h = C.holes[Math.floor(R() * C.holes.length)]; return R() < 0.4 ? { x: h[0], y: h[1], stay: 1 + R() * 3 } : { x: 600 + R() * 1200, y: 120 + R() * 300, stay: 0.1 }; }, { speed: 260, flutter: 9, wobble: 22 }); martins.push(m); }
    C.toads.forEach(([x, y]) => { const s = S('toad', { x, y, depth: true, seasons: ['spring', 'summer'] }); if (s) { s.breathe(0.05, 2.2); s.data = { t: R() * 3 }; toads.push(s); } });
    for (let i = 0; i < 3; i++) { const s = S('bunting', { x: C.buntings[0] + i * 70, y: C.buntings[1] + (i % 2) * 20, pose: 'stand', depth: true, seasons: ['winter'], times: ['dawn', 'day', 'dusk'] }); if (s) { s.data = { st: 'stand', t: 0, from: null, to: null }; buntings.push(s); } }
    moths = S('moths', { x: C.moths[0], y: C.moths[1], depth: true, seasons: ['summer', 'autumn'], times: ['dusk', 'night'] });
  }

  function foxOut(env) { return env.time === 'dusk' || env.time === 'night' || env.season === 'winter'; }
  function stroke(s) {
    if (!p) return;
    if (s.phase === 'end') { strokeD.delete(s.id); return; }
    const env = engine.env;
    let d = (strokeD.get(s.id) || 0) + s.speed * 0.016 + 3;
    if (fox && fox.data.st !== 'gone' && Math.hypot(fox.x - s.x, fox.y - 50 - s.y) < 110) startle();
    if (s.over === 'sand') {
      // the singing sands: dry sand stroked down a slope slides and hums
      const dry = (env.wet || 0) < 0.3 && (env.snowy || 0) < 0.3 && env.season !== 'winter';
      if (d > 34) {
        d = 0;
        if (dry && s.dy > 0.2) { slides.push({ x: s.x, y: s.y, t: 0, life: 1.6 }); if (engine.again('hum', 1.5) < 2) note(Math.floor((s.x / 2000) * 6), { instrument: 'drone', octave: -1, dur: 2.2, vol: 0.22, x: s.x }); fx.burst(s.x, s.y, { n: 3, power: 0.25, rgb: '238,220,180' }); }
        else { fx.ripple(s.x, s.y, { r: 24, n: 1, flat: 0.3, rgb: '240,226,196' }); note(Math.floor((s.x / 2000) * 10), { instrument: 'kalimba', vol: 0.22, x: s.x }); }
      }
      strokeD.set(s.id, d); return true;
    }
    if (s.over === 'fence' && d > 40) { d = 0; note(2 + Math.floor((s.x / 2000) * 8), { instrument: 'pluck', vol: 0.3, x: s.x }); }
    if (s.over === 'meadow' && env.season === 'winter' && d > 40) { d = 0; fx.burst(s.x, s.y, { n: 3, power: 0.25, rgb: '255,255,255' }); }
    strokeD.set(s.id, d);
  }
  function startle() {
    const d = fox.data; if (d.st === 'look' || d.st === 'home') return;
    d.st = 'look'; d.t = 0; fox.setPose('sit'); sfx('sniff', { vol: 0.2, x: fox.x });
  }
  function tap(pt) {
    if (!p) return;
    const s = pt.thing;
    if (s && s === fox) { startle(); return true; }
    if (s && s === lark) { if (lark.data.st === 'sit') { lark.data.st = 'rise'; lark.data.t = 0; sfx('warble', { vol: 0.35, x: lark.x }); } return true; }
    if (s && toads.includes(s)) { s.hopTo(s.x + (R() - 0.5) * 120, s.y + (R() - 0.5) * 20, { height: 24, time: 0.4 }); sfx('ribbit', { size: 0.4, vol: 0.3, x: s.x }); return true; }
    if (s && buntings.includes(s)) { for (const b of buntings) flyBunting(b); return true; }
    if (s && s === moths) { fx.burst(s.x, s.y - 50, { n: 10, power: 0.35, rgb: '240,235,220' }); sfx('flutter', { vol: 0.2 }); note(10, { instrument: 'celesta', vol: 0.2 }); s.poke(); return true; }
    if (s) { s.poke(); return true; }
    for (const h of C.holes) if (Math.hypot(pt.x - h[0], pt.y - h[1]) < 40) {
      const m = martins.find((q) => q.vis > 0.5); if (m) { m.x = h[0]; m.y = h[1]; m._mover.target = { x: h[0] + (R() - 0.5) * 500, y: 150 + R() * 200, stay: 0.1 }; m._mover.stay = 0; sfx('chirp', { size: 0.2, vol: 0.3 }); }
      else { sfx('dig', { vol: 0.15 }); fx.burst(h[0], h[1], { n: 3, power: 0.2, rgb: '238,220,180' }); }
      return true;
    }
    if (pt.over === 'fence') { note(2 + Math.floor((pt.x / 2000) * 8), { instrument: 'pluck', vol: 0.35 }); sfx('creak', { vol: 0.1 }); return true; }
    if (pt.over === 'meadow') { const sc = p.scaleAt(pt.y); for (let i = 0; i < 3; i++) field.bloomAt(pt.x + (i ? (R() - 0.5) * 60 * sc : 0), pt.y + (i ? (R() - 0.3) * 30 * sc : 0), { crowd: 4 }); fx.bloom(pt.x, pt.y, { r: 60 * sc + 30 }); return true; }
    if (pt.over === 'sand') { fx.ripple(pt.x, pt.y, { r: 30, n: 1, flat: 0.3, rgb: '240,226,196' }); note(Math.floor((pt.x / 2000) * 10), { instrument: 'kalimba', vol: 0.3 }); return true; }
    // the sky answers softly (a note and a bloom); weather comes only from the weather cloud (BRIEF 24, 31)
    if (pt.over === 'sky' && pt.y < 350) { note(9 + Math.floor((pt.x / 2000) * 5), { instrument: 'celesta', vol: 0.25, x: pt.x }); fx.bloom(pt.x, pt.y, { r: 120, rgb: '235,240,250' }); return true; }
  }
  function flyBunting(b) { const d = b.data; if (d.st === 'fly') return; d.st = 'fly'; d.t = 0; d.from = [b.x, b.y]; d.to = [clamp(b.x + (R() - 0.5) * 600, 400, 1600), C.buntings[1] + (R() - 0.5) * 60]; sfx('chirp', { size: 0.15, vol: 0.2, x: b.x }); }

  function update(dt, env) {
    if (!p) return;
    const t = engine.now();
    if (fox) {
      const d = fox.data, out = foxOut(env); d.t += dt;
      fox.alpha += ((out && d.st !== 'gone' ? 1 : 0) - fox.alpha) * Math.min(1, dt * 1.2);
      if (d.st === 'walk') {
        const P = C.foxPath, a = P[d.i], b = P[(d.i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        d.k += (46 * p.scaleAt(fox.y) * dt) / L;
        if (d.k >= 1) { d.k = 0; d.i = (d.i + 1) % P.length; if (R() < 0.3) { d.st = 'sitting'; d.t = 0; fox.setPose('sit'); } }
        fox.x = lerp(a[0], b[0], d.k); fox.y = lerp(a[1], b[1], d.k); fox.flip = b[0] < a[0];
        fox.setPose(Math.floor(t * 5) % 2 ? 'trot1' : 'trot2');
      } else if (d.st === 'sitting' && d.t > 3 + R()) { d.st = 'walk'; }
      else if (d.st === 'look' && d.t > 1.2) { d.st = 'home'; d.t = 0; d.from = [fox.x, fox.y]; }
      else if (d.st === 'home') {   // it slips away into the gap under the old boat
        const k = clamp(d.t / 2.4, 0, 1); fox.x = lerp(d.from[0], C.boatGap[0], k); fox.y = lerp(d.from[1], C.boatGap[1], k); fox.flip = C.boatGap[0] < d.from[0]; fox.setPose(Math.floor(t * 6) % 2 ? 'trot1' : 'trot2');
        if (k >= 1) { d.st = 'gone'; d.t = 0; }
      } else if (d.st === 'gone' && d.t > 20) { d.st = 'walk'; d.i = 0; d.k = 0; }
    }
    if (lark) {
      const d = lark.data; d.t += dt;
      if (d.st === 'sit' && env.weather === 'clear' && R() < dt * 0.02) { d.st = 'rise'; d.t = 0; }
      if (d.st === 'rise') { lark.setPose('fly'); lark.y = lerp(d.y0, C.larkHigh, clamp(d.t / 5, 0, 1)); lark.x = C.lark[0] + Math.sin(d.t * 0.8) * 30; lark._oy = Math.sin(t * 14) * 2; if (Math.floor(d.t * 2) !== Math.floor((d.t - dt) * 2)) sfx('trill', { vol: 0.12, x: lark.x }); if (d.t > 10) { d.st = 'fall'; d.t = 0; } }
      if (d.st === 'fall') { lark.y = lerp(C.larkHigh, d.y0, clamp(d.t / 2.5, 0, 1)); if (d.t > 2.5) { d.st = 'sit'; lark.setPose('sit'); lark.x = C.lark[0]; } }
    }
    // natterjacks sing in chorus on spring and summer nights and in warm rain
    const sing = (engine.art.nightness(env) > 0.6 && env.season === 'spring') || ((env.wet || 0) > 0.4 && env.season !== 'winter');
    for (const s of toads) { s.alpha += ((sing ? 1 : 0) - s.alpha) * Math.min(1, dt); s.data.t -= dt; if (sing && s.data.t < 0) { s.data.t = 2 + R() * 3; sfx('ribbit', { size: 0.35, vol: 0.12, x: s.x }); s.poke(0.4); } }
    for (const b of buntings) {
      const d = b.data; if (d.st !== 'fly') continue; d.t += dt; const k = clamp(d.t / 1.6, 0, 1);
      b.x = lerp(d.from[0], d.to[0], k); b.y = lerp(d.from[1], d.to[1], k) - Math.sin(k * Math.PI) * 120; b.flip = d.to[0] < d.from[0]; b.setPose(k < 1 ? 'fly' : 'stand');
      if (k >= 1) d.st = 'stand';
    }
    for (let i = slides.length - 1; i >= 0; i--) { const q = slides[i]; q.t += dt; q.y += dt * 30; if (q.t > q.life) slides.splice(i, 1); }
    // the fence hums when the wind blows
    if ((env.windy || 0) > 0.4 && R() < dt * 0.3) note(Math.floor(R() * 5), { instrument: 'pad', octave: -1, dur: 3, vol: 0.06 * env.windy });
  }
  function draw(g) {
    for (const q of slides) { const u = q.t / q.life; g.fillStyle = `rgba(240,222,180,${0.35 * (1 - u)})`; g.beginPath(); g.ellipse(q.x, q.y, 40 * (1 + u), 7, 0, 0, 6.28); g.fill(); }
  }
  return { setup, stroke, tap, update, draw, closed() { p = null; fox = lark = moths = null; martins.length = toads.length = buntings.length = 0; } };
}
