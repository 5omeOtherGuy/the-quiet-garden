// Small shared helpers for the engine (owner: engine). No allocation in the hot helpers.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (k) => k * k * (3 - 2 * k);
export const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeOut = (k) => 1 - Math.pow(1 - k, 3);
/** Frame-rate independent approach: move `a` toward `b` with time constant `tau` seconds. */
export const approach = (a, b, dt, tau) => b + (a - b) * Math.exp(-dt / tau);

/** Hash a string or number to a 32-bit unsigned int (FNV-1a over the string form). */
export function hash(seed) {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic RNG (mulberry32). Returns a function () => [0, 1) with helpers attached. */
export function rng(seed) {
  let a = typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : hash(seed);
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Read URL parameters once. */
export const params = (() => {
  const q = new URLSearchParams(location.search);
  const get = (k) => q.get(k);
  return {
    get,
    has: (k) => q.has(k),
    flag: (k) => q.has(k) && q.get(k) !== '0' && q.get(k) !== 'false',
    num: (k, d) => (q.has(k) && q.get(k) !== '' && Number.isFinite(+q.get(k)) ? +q.get(k) : d),
  };
})();

export const reducedMotion = (() => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
})();

/** Rate-limited console.error so a broken place cannot flood the log. */
const errT = new Map();
export function report(where, err) {
  const now = performance.now();
  if (now - (errT.get(where) || -1e9) < 3000) return;
  errT.set(where, now);
  console.error(`[quiet-garden] ${where}:`, err);
}

export function safe(where, fn, ...args) {
  try { return fn(...args); } catch (e) { report(where, e); return undefined; }
}
