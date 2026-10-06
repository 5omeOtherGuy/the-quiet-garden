// Stage: the visible canvas, the offscreen scene canvases, backing-store cap, and the watercolour
// blob masks used by transitions and environment washes (owner: engine).

import { makeCanvas, TAU, rng } from './util.js';

const MAX_PIXELS = 2.4e6;   // backing-store cap for the main canvas (CONTRACT)
const MASK_DIV = 4;         // blob masks are painted at 1/4 resolution and upscaled: soft edges for free
const PAPER = '#efe5d0';

export function createStage(canvas) {
  const st = {
    canvas,
    cssW: 0, cssH: 0, W: 0, H: 0, dpr: 1,
    scale: 1,        // backing pixels per world unit (H / 1000)
    vw: 1333,        // visible world width
    A: makeCanvas(1, 1), B: makeCanvas(1, 1), G: makeCanvas(1, 1), M: makeCanvas(1, 1),
    a: null, b: null, gg: null, m: null,
    sizeKey: '',
  };
  st.a = st.A.getContext('2d');
  st.b = st.B.getContext('2d');
  st.gg = st.G.getContext('2d');
  st.m = st.M.getContext('2d');

  /** Measure the window and size every canvas. Returns true if the backing size changed. */
  st.resize = function () {
    const cssW = Math.max(1, innerWidth), cssH = Math.max(1, innerHeight);
    let dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (cssW * cssH * dpr * dpr > MAX_PIXELS) dpr = Math.sqrt(MAX_PIXELS / (cssW * cssH));
    const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    const key = `${W}x${H}`;
    st.cssW = cssW; st.cssH = cssH; st.dpr = dpr;
    if (key === st.sizeKey) return false;
    st.sizeKey = key; st.W = W; st.H = H;
    st.scale = H / 1000;
    st.vw = W / st.scale;
    canvas.width = W; canvas.height = H;
    for (const c of [st.A, st.B, st.G]) { c.width = W; c.height = H; }
    st.M.width = Math.ceil(W / MASK_DIV); st.M.height = Math.ceil(H / MASK_DIV);
    return true;
  };

  /** Clear a scene canvas to paper (what you see past the world's edge). */
  st.clearTo = function (g) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = PAPER;
    g.fillRect(0, 0, st.W, st.H);
  };

  // ---- watercolour blob ------------------------------------------------------------------------
  const N = 72;
  const blob = { r: new Float32Array(N), seed: 1 };
  /** Reshape the blob for a new transition (wobbly edge, a few lobes like a bloom of water). */
  st.newBlob = function (seed) {
    const r = rng(seed);
    const p1 = r() * TAU, p2 = r() * TAU, p3 = r() * TAU, p4 = r() * TAU;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      blob.r[i] = 1 + 0.07 * Math.sin(3 * a + p1) + 0.05 * Math.sin(5 * a + p2) + 0.03 * Math.sin(9 * a + p3) + 0.018 * Math.sin(17 * a + p4);
    }
    blob.seed = seed;
  };
  st.newBlob(7);

  function blobPath(g, cx, cy, R, wob) {
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const j = i % N, a = (j / N) * TAU;
      const rr = R * (1 + (blob.r[j] - 1) * wob);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
  }

  /** Paint the mask for a blob of radius R (backing px) centred at (cx, cy) backing px. */
  st.paintMask = function (cx, cy, R) {
    const m = st.m, d = MASK_DIV;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, st.M.width, st.M.height);
    if (R <= 0) return;
    m.setTransform(1 / d, 0, 0, 1 / d, 0, 0);
    m.fillStyle = '#fff';
    // soft feathered edge: a few nested wobbly fills, the outer ones faint (a wet edge)
    m.globalAlpha = 0.35; blobPath(m, cx, cy, R * 1.035, 1.2); m.fill();
    m.globalAlpha = 0.6; blobPath(m, cx, cy, R * 1.0, 1.0); m.fill();
    m.globalAlpha = 1; blobPath(m, cx, cy, R * 0.955, 0.9); m.fill();
    m.globalAlpha = 1;
  };

  /** Keep only the inside (mode 'destination-in') or cut out the inside ('destination-out') of g. */
  st.applyMask = function (g, mode) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = mode;
    g.imageSmoothingEnabled = true;
    g.drawImage(st.M, 0, 0, st.W, st.H);
    g.globalCompositeOperation = 'source-over';
  };

  /** A faint pigment tide line where a wash dried: drawn on the composed scene. */
  st.tideLine = function (g, cx, cy, R, alpha) {
    if (R <= 2 || alpha <= 0.01) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.lineJoin = 'round';
    g.globalAlpha = alpha;
    g.strokeStyle = 'rgb(150,118,86)';
    g.lineWidth = Math.max(1, st.scale * 2.2);
    blobPath(g, cx, cy, R * 0.99, 1.0); g.stroke();
    g.globalAlpha = alpha * 0.45;
    g.lineWidth = Math.max(1, st.scale * 5);
    blobPath(g, cx, cy, R * 0.965, 0.9); g.stroke();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  };

  /** Radius that covers the whole screen from (cx, cy). */
  st.coverRadius = function (cx, cy) {
    const dx = Math.max(cx, st.W - cx), dy = Math.max(cy, st.H - cy);
    return Math.hypot(dx, dy) * 1.18;
  };

  return st;
}
