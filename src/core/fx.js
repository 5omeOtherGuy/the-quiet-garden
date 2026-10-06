// Touch magic in world units (owner: engine): sparks that rise and trail where fingers move, rings where a finger
// lands, rain splashes, mist puffs under a still hand, the hold ring and the glow under a singing finger.
// Fixed pools, no allocation per frame. Painted through skin.fx so art can restyle it (art may export ui.fx).

import { skin } from './ui/skin.js';
import { TAU } from './util.js';

const NS = 360, NR = 32, NP = 28;

// spark colours (skin.fx.COLORS): 0-4 warm mixed, 5 gold (singing), 6 rain white-blue, 7 leaf gold-green
export const SPARK = { MIXED: -1, GOLD: 5, RAIN: 6, LEAF: 7 };

export function createFx() {
  const sx = new Float32Array(NS), sy = new Float32Array(NS), svx = new Float32Array(NS), svy = new Float32Array(NS);
  const sage = new Float32Array(NS), slife = new Float32Array(NS), sr = new Float32Array(NS), srot = new Float32Array(NS);
  const sbuoy = new Float32Array(NS), sci = new Uint8Array(NS);
  let sNext = 0;
  const rx = new Float32Array(NR), ry = new Float32Array(NR), rage = new Float32Array(NR).fill(9), rsize = new Float32Array(NR), rkind = new Uint8Array(NR);
  let rNext = 0;
  const px = new Float32Array(NP), py = new Float32Array(NP), page = new Float32Array(NP).fill(9), psize = new Float32Array(NP), pvx = new Float32Array(NP);
  let pNext = 0;
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  function spawn(x, y, vx, vy, size, life, ci, buoy) {
    const k = sNext; sNext = (sNext + 1) % NS;
    sx[k] = x; sy[k] = y; svx[k] = vx; svy[k] = vy;
    sage[k] = 0; slife[k] = life; sr[k] = size; srot[k] = rnd() * TAU; sci[k] = ci < 0 ? (rnd() * 5) | 0 : ci; sbuoy[k] = buoy;
  }

  const fx = {
    reduce: false,
    /** art's touch magic (art.fx) while a painted place is shown: the touch sparks go there; rings, swirls, mist stay here */
    art: null,
    /** n little sparkles bursting at world (x, y). spread: speed scale, size, life: scales; ci: colour (SPARK) */
    sparkle(x, y, n = 6, spread = 1, size = 1, life = 1, ci = -1) {
      if (fx.reduce) n = Math.ceil(n / 2);
      if (fx.art && ci < 0) { fx.art.burst(x, y, { n: Math.max(2, Math.round(n * 0.8)), power: 0.25 + 0.3 * spread }); return; }
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, sp = (14 + rnd() * 70) * spread;
        spawn(x + Math.cos(a) * rnd() * 10, y + Math.sin(a) * rnd() * 10, Math.cos(a) * sp, Math.sin(a) * sp - 26,
          (2.6 + rnd() * 3.2) * size, (0.7 + rnd() * 0.6) * life, ci, 18);
      }
    },
    /**
     * Sparks shed by a moving finger: they keep a little of the finger's motion (vx, vy world units/s) and rise.
     * k 0..1 scales how many and how bright (speed of the finger, a swirl, a singing finger).
     */
    trail(x, y, vx, vy, k = 0.5, ci = -1) {
      if (fx.art) return; // a painted place: art's sparks follow every finger point (core/painted.js)
      const n = (fx.reduce ? 0.5 : 1) * (0.6 + k * 1.8);
      let m = Math.floor(n); if (rnd() < n - m) m++;
      for (let i = 0; i < m; i++) {
        const a = rnd() * TAU, sp = 8 + rnd() * 26;
        spawn(x + (rnd() - 0.5) * 12, y + (rnd() - 0.5) * 12, vx * 0.18 + Math.cos(a) * sp, vy * 0.18 + Math.sin(a) * sp - 20,
          (1.8 + rnd() * 2.8) * (0.8 + 0.5 * k), 0.7 + rnd() * 0.7 + 0.4 * k, ci, -46);
      }
    },
    /** A swirl's sparks: thrown along the circle (tangent tx, ty, unit) and drifting outward. */
    whirl(x, y, tx, ty, k = 0.5) {
      const n = 1 + Math.round(k * 2);
      for (let i = 0; i < n; i++) {
        const sp = 60 + rnd() * 120 * (0.5 + k);
        spawn(x + (rnd() - 0.5) * 16, y + (rnd() - 0.5) * 16, tx * sp + (rnd() - 0.5) * 30, ty * sp + (rnd() - 0.5) * 30 - 10,
          (2 + rnd() * 3) * (0.8 + 0.4 * k), 0.8 + rnd() * 0.8, -1, -30);
      }
    },
    /** kind 0: a finger lands; 1: a raindrop splash; 2: a bigger soft wave (a gesture took hold) */
    ring(x, y, size = 1, kind = 0) {
      const k = rNext; rNext = (rNext + 1) % NR;
      rx[k] = x; ry[k] = y; rage[k] = 0; rsize[k] = size; rkind[k] = kind;
    },
    /** a mist puff under a still hand; drift: sideways world units/s */
    puff(x, y, size = 1, drift = 0) {
      const k = pNext; pNext = (pNext + 1) % NP;
      px[k] = x + (rnd() - 0.5) * 40; py[k] = y + (rnd() - 0.5) * 30; page[k] = 0; psize[k] = size * (0.8 + rnd() * 0.5); pvx[k] = drift + (rnd() - 0.5) * 20;
    },
    clear() { sage.fill(99); slife.fill(1); rage.fill(9); page.fill(9); },
    update(dt) {
      if (dt <= 0) return;
      const drag = Math.exp(-dt * 2.2);
      for (let k = 0; k < NS; k++) {
        if (sage[k] >= slife[k]) continue;
        sage[k] += dt;
        svx[k] *= drag; svy[k] = svy[k] * drag + sbuoy[k] * dt;
        sx[k] += svx[k] * dt; sy[k] += svy[k] * dt; srot[k] += dt * 2;
      }
      for (let k = 0; k < NR; k++) if (rage[k] < 1) rage[k] += dt / (rkind[k] === 1 ? 0.55 : rkind[k] === 2 ? 1.3 : 0.9);
      for (let k = 0; k < NP; k++) if (page[k] < 1) { page[k] += dt / 2.6; px[k] += pvx[k] * dt; py[k] -= 6 * dt; }
    },
    /** Draw in the world-transformed context. holds: pointer list from input. */
    draw(g, t, holds) {
      const F = skin.fx;
      g.save();
      g.globalCompositeOperation = 'source-over';
      for (let k = 0; k < NP; k++) {
        const a = page[k]; if (a >= 1) continue;
        F.puff(g, px[k], py[k], (60 + a * 90) * psize[k], 0.32 * Math.sin(Math.PI * Math.min(1, a * 1.4 + 0.05)) * (1 - a * 0.5));
      }
      for (let k = 0; k < NR; k++) {
        const a = rage[k]; if (a >= 1) continue;
        const kind = rkind[k];
        if (kind === 1) F.drop(g, rx[k], ry[k], (6 + a * 30) * rsize[k], 0.6 * (1 - a));
        else F.ring(g, rx[k], ry[k], (kind === 2 ? 30 + a * 160 : 10 + a * 46) * rsize[k], (kind === 2 ? 0.35 : 0.55) * (1 - a));
      }
      if (holds) for (let i = 0; i < holds.length; i++) {
        const p = holds[i];
        if (p.mode === 'pending' && p.holdK > 0.15 && p.others === 0) F.hold(g, p.x, p.y, p.holdK);
        else if (p.mode === 'paint') F.painting(g, p.x, p.y, t);
      }
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < NS; k++) {
        const age = sage[k], life = slife[k]; if (age >= life) continue;
        const q = age / life, a = q < 0.12 ? q / 0.12 : 1 - (q - 0.12) / 0.88;
        F.spark(g, sx[k], sy[k], sr[k] * (1 - q * 0.4), a * 0.85, sci[k], srot[k]);
      }
      g.restore();
    },
  };
  fx.clear();
  return fx;
}
