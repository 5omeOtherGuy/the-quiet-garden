// Touch magic: what the picture answers when a finger touches it. Sparks that are born under a moving finger,
// rise and swirl like specks of light flicked from a brush; rings that spread where water or ground is touched;
// a pale bloom of water that opens and dries. All soft and round, like the specks in the paintings.
// The engine calls trail/burst/ripple/bloom from its gestures and fx.draw(g, env, view, t) once per frame, after
// the place and before the weather.
import { TAU, hash2, clamp } from './rng.js';
import { noise1 } from './noise.js';
import { light } from './lights.js';
import { nightness } from './palette.js';

const MAX = 220, HUES = ['255,236,170', '255,250,232', '255,214,150', '255,226,214', '220,236,255'];
const sprites = new Map();
function speck(rgb) {
  let c = sprites.get(rgb); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 48; const g = c.getContext('2d');
  const gr = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  gr.addColorStop(0, 'rgba(255,255,250,1)'); gr.addColorStop(0.22, `rgba(${rgb},0.95)`); gr.addColorStop(0.5, `rgba(${rgb},0.35)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 48, 48); sprites.set(rgb, c); return c;
}

const sparks = [];            // {x,y,vx,vy,age,life,size,hue,seed}
const rings = [];             // {x,y,age,life,r,flat,rgb}
const blooms = [];            // {x,y,age,life,r,rgb,seed}
const last = new Map();       // pointer id -> {x,y,carry}
let clock = null, born = 0;

function spark(x, y, vx, vy, big, rgb) {
  if (sparks.length >= MAX) sparks.shift();
  const h = hash2(born++, 3, 91);
  sparks.push({ x, y, vx, vy, age: 0, life: 0.9 + 1.3 * h, size: (big ? 7 : 4) + 7 * hash2(born, 4, 91) ** 2, hue: rgb || HUES[born % HUES.length], seed: h * 100 });
}

export const fx = {
  /**
   * A finger is at world point (x, y): sparks are born along its way and rise. Call on every pointer move.
   * moved = [dx, dy] (world units) says how far the finger went when the view moved under it (a pan).
   */
  trail(x, y, id = 0, moved = null) {
    const p = last.get(id);
    if (!p) { last.set(id, { x, y, carry: 0 }); return; }
    const dx = moved ? moved[0] : x - p.x, dy = moved ? moved[1] : y - p.y, d = Math.hypot(dx, dy); p.carry += d;
    while (p.carry > 16) {
      p.carry -= 16; const k = hash2(born, 1, 92), a = hash2(born, 2, 92) * TAU;
      spark(x - dx * k + Math.cos(a) * 6, y - dy * k + Math.sin(a) * 6, dx * 1.2 + Math.cos(a) * 22, dy * 1.2 + Math.sin(a) * 22 - 26, false);
    }
    p.x = x; p.y = y;
  },
  /** The finger left. */
  release(id = 0) { last.delete(id); },
  /** A puff of sparks (a tap, a thing that answers). o: {n=10, power=1, rgb: '255,255,255' (one colour, e.g. snow dust)} */
  burst(x, y, o = {}) {
    const n = o.n ?? 10, pw = o.power ?? 1;
    for (let i = 0; i < n; i++) { const a = hash2(born, 5, 93) * TAU, v = (40 + 110 * hash2(born, 6, 93)) * pw; spark(x, y, Math.cos(a) * v, Math.sin(a) * v - 40 * pw, true, o.rgb); }
  },
  /** Rings spreading from a point. o: {r=70, flat=0.32 (1 = circles, small = lying on water), rgb='255,255,250', n=2} */
  ripple(x, y, o = {}) {
    for (let i = 0; i < (o.n ?? 2); i++) rings.push({ x, y, age: -i * 0.28, life: 1.5, r: o.r ?? 70, flat: o.flat ?? 0.32, rgb: o.rgb || '255,255,250' });
    if (rings.length > 40) rings.splice(0, rings.length - 40);
  },
  /** A pale bloom of clear water that opens and dries (a touch on the picture, a small wonder). o: {r=150, rgb, life=1.6} */
  bloom(x, y, o = {}) {
    blooms.push({ x, y, age: 0, life: o.life ?? 1.6, r: o.r ?? 150, rgb: o.rgb || '255,252,238', seed: hash2(x, y, 94) * 100 });
    if (blooms.length > 12) blooms.shift();
  },
  get count() { return sparks.length + rings.length + blooms.length; },
  clear() { sparks.length = rings.length = blooms.length = 0; last.clear(); },

  draw(g, env = {}, view, t = 0) {
    const dt = clock === null ? 0 : clamp(t - clock, 0, 0.05); clock = t;
    const night = nightness(env);
    g.save();
    // blooms: a wobbly pale disc with a rim of pushed pigment
    for (let i = blooms.length - 1; i >= 0; i--) {
      const b = blooms[i]; b.age += dt; const k = b.age / b.life; if (k >= 1) { blooms.splice(i, 1); continue; }
      const R = b.r * (1 - (1 - k) ** 3), a = (1 - k) ** 1.5;
      g.beginPath();
      for (let j = 0; j <= 28; j++) { const an = (j / 28) * TAU, rr = R * (1 + 0.12 * (noise1(Math.cos(an) * 1.5 + 4, b.seed) + noise1(Math.sin(an) * 1.5 + 8, b.seed + 2) - 1)); const px = b.x + Math.cos(an) * rr, py = b.y + Math.sin(an) * rr * 0.8; if (j) g.lineTo(px, py); else g.moveTo(px, py); }
      g.closePath();
      g.fillStyle = `rgba(${b.rgb},${0.22 * a})`; g.fill();
      g.strokeStyle = `rgba(${b.rgb},${0.5 * a})`; g.lineWidth = 5; g.stroke();
      g.strokeStyle = `rgba(70,80,120,${0.12 * a})`; g.lineWidth = 1.5; g.stroke();
    }
    // rings
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.age += dt; if (r.age < 0) continue; const k = r.age / r.life; if (k >= 1) { rings.splice(i, 1); continue; }
      const R = r.r * (1 - (1 - k) ** 2);
      g.strokeStyle = `rgba(${r.rgb},${0.7 * (1 - k) ** 1.4})`; g.lineWidth = 3.2 * (1 - k) + 0.6;
      g.beginPath(); g.ellipse(r.x, r.y, R, R * r.flat, 0, 0, TAU); g.stroke();
    }
    // sparks
    let lit = 0;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.age += dt; const k = s.age / s.life; if (k >= 1) { sparks.splice(i, 1); continue; }
      const sw = (noise1(t * 1.3 + s.seed, 4) - 0.5) * 2;
      s.vx += (sw * 60 - s.vx * 1.6) * dt; s.vy += (-46 - s.vy * 1.4) * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      const tw = 0.7 + 0.3 * Math.sin(t * 9 + s.seed), a = Math.min(1, k * 8) * (1 - k) ** 0.8, sz = s.size * (0.5 + 0.5 * (1 - k)) * tw;
      g.globalAlpha = a; g.drawImage(speck(s.hue), s.x - sz, s.y - sz, sz * 2, sz * 2);
      if (night > 0.2 && lit < 18 && (i & 1) === 0) { light(g, s.x, s.y, sz * 5, [1, 0.86, 0.55], 0.55 * a * night); lit++; }
    }
    g.restore();
  },
};
