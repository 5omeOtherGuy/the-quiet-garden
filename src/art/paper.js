// Paper: cold-press tooth, granulation and mottle tiles, generated once and reused as patterns.
// All tiles are seamless: the noise is sampled on a torus (4 blended lookups) and the grain is per pixel.
import { gfbm2 } from './noise.js';
import { rng as mkRng } from './rng.js';
import { css, PAPER } from './color.js';

const cache = new Map();
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** gradient fbm on a torus so a tile repeats without seams. u, v in 0..1 */
function torus(u, v, f, oct, seed) {
  return gfbm2(u * f, v * f, oct, seed) * (1 - u) * (1 - v) + gfbm2((u + 1) * f, v * f, oct, seed) * u * (1 - v)
    + gfbm2(u * f, (v + 1) * f, oct, seed) * (1 - u) * v + gfbm2((u + 1) * f, (v + 1) * f, oct, seed) * u * v;
}

/** Wrapped box blur of a float field (radius 1), used to turn white noise into paper tooth. */
function blurWrap(src, size, passes) {
  let a = src, b = new Float32Array(size * size);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      const ym = ((y - 1 + size) % size) * size, y0 = y * size, yp = ((y + 1) % size) * size;
      for (let x = 0; x < size; x++) {
        const xm = (x - 1 + size) % size, xp = (x + 1) % size;
        b[y0 + x] = (a[ym + xm] + a[ym + x] + a[ym + xp] + a[y0 + xm] + a[y0 + x] + a[y0 + xp] + a[yp + xm] + a[yp + x] + a[yp + xp]) / 9;
      }
    }
    const t = a; a = b; b = t;
  }
  return a;
}

/** Height field of the paper tooth, 0..1 (0.5 flat), shared by the tiles. */
function toothField(size, seed) {
  const key = `tooth${size}_${seed}`;
  if (cache.has(key)) return cache.get(key);
  const r = mkRng(seed), inv = 1 / size;
  // the tooth itself: filtered white noise at two scales (no lattice anywhere)
  const w1 = new Float32Array(size * size), w2 = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) { w1[i] = r() - 0.5; w2[i] = r() - 0.5; }
  const fine = blurWrap(w1, size, 1), soft = blurWrap(w2, size, 4);
  const f = new Float32Array(size * size);
  // fibres: short pale hairs, wrapped
  for (let i = 0; i < size * 0.7; i++) {
    const x0 = r() * size, y0 = r() * size, a = r() * 6.28, l = 6 + r() * 20, s = 0.15 + r() * 0.25, dx = Math.cos(a), dy = Math.sin(a);
    for (let t = 0; t < l; t += 0.7) { const x = (((x0 + dx * t) % size) + size) % size | 0, y = (((y0 + dy * t) % size) + size) % size | 0; f[y * size + x] += s * (1 - t / l); }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const coarse = torus(x * inv, y * inv, 5, 3, seed) - 0.5;   // gentle cold-press undulation
    f[i] = 0.5 + coarse * 0.2 + fine[i] * 0.8 + soft[i] * 1.5 + (r() - 0.5) * 0.06 + f[i] * 0.4;
  }
  cache.set(key, f);
  return f;
}

/** Grey tooth tile: 128 = flat paper, lighter = ridges, darker = valleys. */
export function paperTile(size = 512, seed = 7) {
  const key = `paper${size}_${seed}`;
  if (cache.has(key)) return cache.get(key);
  const f = toothField(size, seed), c = makeCanvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) { const v = Math.max(0, Math.min(1, f[i])) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}

/** Granulation tile: transparent with pigment specks settling into the tooth valleys. */
export function granTile(size = 512, seed = 7) {
  const key = `gran${size}_${seed}`;
  if (cache.has(key)) return cache.get(key);
  const f = toothField(size, seed), c = makeCanvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data, r = mkRng(seed + 3);
  for (let i = 0; i < size * size; i++) {
    const valley = Math.max(0, 0.5 - f[i]) * 3.2;            // 0 on ridges .. ~1 in deep valleys
    const speck = r() < 0.1 ? r() * 0.5 : 0;
    const a = Math.min(0.7, valley * valley * 0.6 + speck * (0.2 + valley));
    d[i * 4] = 50; d[i * 4 + 1] = 38; d[i * 4 + 2] = 34; d[i * 4 + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}

/** Soft blotch tile for wet-in-wet mottling: pale alpha clouds. */
export function mottleTile(size = 256, seed = 23) {
  const key = `mottle${size}_${seed}`;
  if (cache.has(key)) return cache.get(key);
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data, inv = 1 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = torus(x * inv, y * inv, 5, 3, seed), i = (y * size + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.max(0, (n - 0.45) * 2.2) * 255;
  }
  g.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}

export function deviceScale(g) { const m = g.getTransform(); return Math.hypot(m.a, m.b) || 1; }

const patCache = new WeakMap();
/** A repeating pattern of a tile, scaled so one tile pixel is `px` device pixels regardless of the world transform. */
export function pattern(g, tile, px = 1) {
  let m = patCache.get(g);
  if (!m) { m = new Map(); patCache.set(g, m); }
  let p = m.get(tile);
  if (!p) { p = g.createPattern(tile, 'repeat'); m.set(tile, p); }
  const k = px / deviceScale(g);
  p.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
  return p;
}

/** Fill a world rect with warm paper white (the compositor adds the tooth). */
export function fill(g, x, y, w, h, tint = PAPER) {
  g.save();
  g.fillStyle = css(tint);
  g.fillRect(x, y, w, h);
  g.restore();
}
