// Lights: things that glow at night. A place calls light() while drawing (world units, any transform);
// the light lands in a per-frame device-space buffer that the compositor screens onto the picture AFTER
// grading, so lamps, windows, fireflies and crystals stay warm and bright under the night glaze.
// The buffer is opaque black with additive light (no alpha), at reduced resolution: lights are soft.
import { css, parse, PAPER } from './color.js';

export const LIGHT_SCALE = 0.25;   // buffer pixels per device pixel
const buf = { canvas: null, g: null, w: 0, h: 0, W: 0, H: 0, count: 0, dirty: false, pending: true };

function ensure(W, H) {
  if (!buf.canvas) { buf.canvas = document.createElement('canvas'); buf.g = buf.canvas.getContext('2d'); }
  const w = Math.max(1, Math.round(W * LIGHT_SCALE)), h = Math.max(1, Math.round(H * LIGHT_SCALE));
  if (buf.w !== w || buf.h !== h) { buf.canvas.width = w; buf.canvas.height = h; buf.w = w; buf.h = h; buf.W = W; buf.H = H; buf.pending = true; }
  return buf;
}
function clear() {
  const g = buf.g; g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.fillStyle = '#000'; g.fillRect(0, 0, buf.w, buf.h); buf.pending = false; buf.dirty = false; buf.count = 0;
}

/**
 * light(g, x, y, r, color, strength = 1, o = {})
 *   g: the world-unit context you are drawing with (its transform is read). r: radius in world units.
 *   color: [r,g,b] or CSS. strength 0..~2. o.core: radius (world units) of a bright centre (the lamp itself).
 *   o.falloff: 1 soft (default) .. 3 tight.
 * Also draws a faint glow into the scene so the 2D fallback and screenshots without the compositor still show it.
 */
export function light(g, x, y, r, color, strength = 1, o = {}) {
  const m = g.getTransform();
  const W = g.canvas.width, H = g.canvas.height;
  const b = ensure(W, H);
  if (b.pending) clear();
  const k = LIGHT_SCALE;
  const sx = (m.a * x + m.c * y + m.e) * k, sy = (m.b * x + m.d * y + m.f) * k;
  const sc = (Math.hypot(m.a, m.b) || 1) * k, rr = r * sc;
  if (sx + rr < 0 || sy + rr < 0 || sx - rr > b.w || sy - rr > b.h || rr < 0.5) return;
  const c = parse(color), fo = o.falloff ?? 1, st = Math.max(0, strength);
  const lg = b.g;
  lg.globalCompositeOperation = 'lighter';
  const gr = lg.createRadialGradient(sx, sy, 0, sx, sy, rr);
  const a0 = Math.min(1, 0.55 * st);
  gr.addColorStop(0, css(c, a0)); gr.addColorStop(Math.min(0.9, 0.25 * fo), css(c, a0 * 0.5)); gr.addColorStop(Math.min(0.95, 0.6 * fo), css(c, a0 * 0.14)); gr.addColorStop(1, css(c, 0));
  lg.fillStyle = gr; lg.beginPath(); lg.arc(sx, sy, rr, 0, 6.2831853); lg.fill();
  if (o.core) {
    const cr = Math.max(1, o.core * sc), cg = lg.createRadialGradient(sx, sy, 0, sx, sy, cr);
    cg.addColorStop(0, css(PAPER, Math.min(1, 0.9 * st))); cg.addColorStop(0.6, css(c, Math.min(1, 0.6 * st))); cg.addColorStop(1, css(c, 0));
    lg.fillStyle = cg; lg.beginPath(); lg.arc(sx, sy, cr, 0, 6.2831853); lg.fill();
  }
  b.count++; b.dirty = true;
  // a hint of the glow in the scene itself (for the 2D fallback and for daylight, where it is barely visible)
  g.save(); g.globalCompositeOperation = 'screen';
  const sg = g.createRadialGradient(x, y, 0, x, y, r);
  sg.addColorStop(0, css(c, 0.18 * st)); sg.addColorStop(1, css(c, 0));
  g.fillStyle = sg; g.beginPath(); g.arc(x, y, r, 0, 6.2831853); g.fill(); g.restore();
}

/** Used by the compositor once per frame: the buffer if any light was drawn since the last take (else null). The
 *  take consumes the frame's lights: the buffer is marked for clearing at the next light() call, and a frame that
 *  draws no light gets null, so nothing accumulates and no old glow stays over a new picture. */
export const lights = {
  take() { const c = buf.dirty ? buf.canvas : null; buf.dirty = false; buf.count = 0; buf.pending = true; return c; },
  get count() { return buf.count; },
  get scale() { return LIGHT_SCALE; },
};
