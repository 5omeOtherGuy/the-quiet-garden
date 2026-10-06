// Value noise and fbm, 1D and 2D. Smooth, cheap, deterministic.
import { hash2 } from './rng.js';

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** 2D value noise in [0,1] */
export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const ab = a + (b - a) * u, cd = c + (d - c) * u;
  return ab + (cd - ab) * v;
}

/** 1D value noise in [0,1] */
export function noise1(x, seed = 0) { return noise2(x, 0.37, seed); }

/** fractal brownian motion in [0,1] (approximately) */
export function fbm2(x, y, oct = 4, seed = 0, lac = 2.02, gain = 0.5) {
  let s = 0, amp = 0.5, tot = 0;
  for (let i = 0; i < oct; i++) {
    s += noise2(x, y, seed + i * 101) * amp; tot += amp; amp *= gain; x *= lac; y *= lac;
  }
  return s / tot;
}

export function fbm1(x, oct = 3, seed = 0) { return fbm2(x, 0.71, oct, seed); }

/** 2D gradient (Perlin-style) noise in [0,1]: no axis-aligned lattice look, for textures. */
export function gnoise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const grad = (ix, iy, dx, dy) => { const a = hash2(ix, iy, seed) * 6.2831853; return Math.cos(a) * dx + Math.sin(a) * dy; };
  const n00 = grad(xi, yi, xf, yf), n10 = grad(xi + 1, yi, xf - 1, yf), n01 = grad(xi, yi + 1, xf, yf - 1), n11 = grad(xi + 1, yi + 1, xf - 1, yf - 1);
  const nx0 = n00 + (n10 - n00) * u, nx1 = n01 + (n11 - n01) * u;
  return 0.5 + (nx0 + (nx1 - nx0) * v) * 0.7;
}

/** gradient-noise fbm with each octave rotated, so no grid direction survives. [0,1] approx. */
export function gfbm2(x, y, oct = 4, seed = 0) {
  let s = 0, amp = 0.5, tot = 0, c = 0.8, sn = 0.6;
  for (let i = 0; i < oct; i++) {
    s += (gnoise2(x, y, seed + i * 131) - 0.5) * amp; tot += amp; amp *= 0.5;
    const nx = (x * c - y * sn) * 2.03, ny = (x * sn + y * c) * 2.03; x = nx; y = ny;
  }
  return 0.5 + s / tot;
}

/** ridged noise [0,1]: sharp creases, good for rock and bark */
export function ridged2(x, y, oct = 4, seed = 0) {
  let s = 0, amp = 0.5, tot = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(noise2(x, y, seed + i * 77) * 2 - 1);
    s += n * n * amp; tot += amp; amp *= 0.5; x *= 2.1; y *= 2.1;
  }
  return s / tot;
}
