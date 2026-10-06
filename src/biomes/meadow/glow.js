// The glow-worm hollow (painted view `glow`): hidden deep under the oak's roots. Ways in (listed nowhere in the game):
// the deep tunnel of the rabbit burrow when it is dark outside; and the fairy ring of mushrooms that comes up on the
// meadow on autumn nights after rain (tap its middle). Glow-worms hang in the roots like a sky of their own.
//   stroke the roots    the glow-worms the finger passes brighten one after another and sing high and soft; a slow
//                       stroke leaves a lasting trail like a constellation that fades after a while
//   hold                a wave of light spreads from the hand through the whole hollow, and a chord rises
//   tap the pool        rings, and the lights quiver in the water; drops fall from the roots into it by themselves
//   patter (rain)       more drops fall from the roots above
//   the passage         on the left, back up
import { inside } from './inside.js';

const TAU = Math.PI * 2;
export const HOLLOW = {
  out: { poly: [[60, 60], [380, 80], [470, 540], [100, 580]] },
  pool: { x: 1015, y: 778, rx: 700, ry: 125 },
  ceiling: { x0: 340, x1: 1900, y0: 20, y1: 540 },
};

export default inside({
  name: 'The Glow-worm Hollow',
  view: 'glow',
  music: { preset: 'cave', key: 'C', ambience: { drips: 0.6, roomtone: 0.4 } },
  exits: [{ poly: HOLLOW.out.poly, out: true }],
  interior: 1,
  create(engine) {
    const art = engine.art, fx = art.fx, A = engine.audio || {};
    const R = () => engine.random();
    const note = (s, o) => { if (A.note) A.note(s, o || {}); };
    const sfx = (n, o) => { if (A.sfx && A.sfx.play) A.sfx.play(n, o || {}); };
    const env = engine.env;
    const worms = [], drops = [];
    let P = null, wave = null, last = 0, quiver = 0;
    const C = HOLLOW.ceiling;

    return {
      setup(p) {
        P = p; p.show('glow');
        if (!worms.length) {
          const r = engine.rand('glow-worms');
          for (let i = 0; i < 130; i++) {
            const x = C.x0 + r() * (C.x1 - C.x0), y = C.y0 + Math.pow(r(), 1.4) * (C.y1 - C.y0);
            if (p.region(x, y) === 'water') continue;
            worms.push({ x, y, base: 0.4 + 0.55 * r(), ph: r() * TAU, sp: 0.2 + 0.5 * r(), k: 0, hold: 0, size: 0.7 + 0.6 * r() });
          }
        }
      },
      closed() { P = null; },
      stroke(s) {
        if (s.phase === 'end') return true;
        for (let i = 0; i < s.n; i++) {
          const q = s.points[i];
          for (const w of worms) { const d = Math.hypot(w.x - q.x, w.y - q.y); if (d < 70) { const was = w.k; w.k = Math.min(1.6, w.k + (1 - d / 70) * 0.6); if (s.speed < 500) w.hold = Math.max(w.hold, 14); if (was < 0.4 && w.k >= 0.4) { const t = engine.now(); if (t - last > 0.07) { last = t; note(7 + Math.floor((1 - w.y / 600) * 6) + Math.floor(w.x / 600), { instrument: 'glass', vol: 0.07, x: w.x }); } } } }
          if (((q.x - HOLLOW.pool.x) / HOLLOW.pool.rx) ** 2 + ((q.y - HOLLOW.pool.y) / HOLLOW.pool.ry) ** 2 < 1 && R() < 0.2) { fx.ripple(q.x, q.y, { r: 50, flat: 0.25, rgb: '180,230,255' }); quiver = 1; }
        }
        return true;
      },
      tap(pt) {
        const pl = HOLLOW.pool;
        if (((pt.x - pl.x) / pl.rx) ** 2 + ((pt.y - pl.y) / pl.ry) ** 2 < 1.2) { fx.ripple(pt.x, pt.y, { r: 110, n: 3, flat: 0.25, rgb: '180,230,255' }); quiver = 1.5; sfx('plop', { vol: 0.35 }); note(2 + Math.floor(R() * 5), { instrument: 'water', vol: 0.14 }); return true; }
        let best = null, bd = 90; for (const w of worms) { const d = Math.hypot(w.x - pt.x, w.y - pt.y); if (d < bd) { bd = d; best = w; } }
        if (best) { best.k = 1.8; best.hold = 20; note(9 + Math.floor(R() * 4), { instrument: 'celesta', vol: 0.1 }); fx.burst(best.x, best.y, { n: 5, power: 0.2, rgb: '190,255,200' }); return true; }
        drops.push({ x: pt.x, y: C.y1 - 40, vy: 0 }); return true;
      },
      hold(pt) { wave = { x: pt.x, y: pt.y, t: 0 }; if (A.chord) A.chord([0, 4, 7, 9, 11], { instrument: 'choir', vol: 0.12, strum: 0.2 }); return true; },
      update(dt) {
        for (const w of worms) { w.k *= Math.exp(-dt * (w.hold > 0 ? 0.08 : 0.6)); w.hold = Math.max(0, w.hold - dt); }
        if (wave) {
          wave.t += dt; const r0 = wave.t * 520;
          for (const w of worms) { const d = Math.hypot(w.x - wave.x, w.y - wave.y); if (Math.abs(d - r0) < 40) w.k = Math.max(w.k, 1.2); }
          if (r0 > 2400) wave = null;
        }
        // drops fall from the roots into the pool now and then (more in the rain outside)
        if (R() < dt * (0.25 + 2 * (env.wet ?? 0))) drops.push({ x: HOLLOW.pool.x + (R() - 0.5) * HOLLOW.pool.rx * 1.6, y: C.y1 - 60 - R() * 120, vy: 0 });
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i]; d.vy += 900 * dt; d.y += d.vy * dt;
          if (d.y > HOLLOW.pool.y - 10) { drops.splice(i, 1); fx.ripple(d.x, HOLLOW.pool.y - 6, { r: 40, n: 1, flat: 0.25, rgb: '180,230,255' }); note(4 + Math.floor((d.x / 2000) * 8), { instrument: 'water', vol: 0.08, x: d.x }); quiver = Math.max(quiver, 0.5); }
        }
        quiver *= Math.exp(-dt * 1.2);
      },
      draw(g, env, view) {
        const t = engine.now(), pl = HOLLOW.pool;
        for (const w of worms) {
          const k = w.base * (0.7 + 0.3 * Math.sin(t * w.sp + w.ph)) + w.k;
          art.light(g, w.x, w.y, 22 * w.size + 26 * w.k, [0.55, 1, 0.7], Math.min(1.4, k), { core: 1.6 * w.size + w.k });
          // its twin in the pool
          const ry = pl.y + (pl.y - w.y) * 0.18;
          if (k > 0.55 && Math.abs(w.x - pl.x) < pl.rx * 0.9 && w.y < 420) art.light(g, w.x + Math.sin(t * 6 + w.ph) * 6 * quiver, ry, 14 * w.size, [0.55, 1, 0.75], 0.35 * Math.min(1.2, k), { core: 1 });
        }
        for (const d of drops) art.light(g, d.x, d.y, 10, [0.8, 1, 1], 0.6, { core: 1.4 });
      },
    };
  },
});
