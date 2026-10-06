// Brushes. Everything draws into a 2D context in world units with whatever transform is set.
// Colours: [r,g,b] 0..1 or a CSS string. Every brush takes o.rng (see rng.js) so bakes are reproducible.
import { TAU, clamp, lerp, rng as mkRng, smoothstep } from './rng.js';
import { noise1, noise2, fbm1 } from './noise.js';
import { css, parse, deepen, dilute, mix, lum, PIGMENTS, PAPER } from './color.js';
import { granTile, mottleTile, pattern, deviceScale } from './paper.js';

const INK = PIGMENTS.ink.rgb;
const fallbackRng = mkRng(1);
const R = (o) => o.rng || fallbackRng;

// ----------------------------------------------------------------------------- paths

/** Closed smooth path through midpoints (never passes through the points: always soft). Polygons marked pts.sharp keep their corners. */
export function smoothClosed(g, pts) {
  const n = pts.length; if (n < 3) return;
  if (pts.sharp) { if (g.beginPath) g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < n; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); return; }
  const sx = (pts[n - 1][0] + pts[0][0]) / 2, sy = (pts[n - 1][1] + pts[0][1]) / 2;
  if (g.beginPath) g.beginPath();
  g.moveTo(sx, sy);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  g.closePath();
}

/** Open smooth path (Catmull-Rom). */
export function smoothOpen(g, pts) {
  const n = pts.length; if (n < 2) return;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  if (n === 2) { g.lineTo(pts[1][0], pts[1][1]); return; }
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
}

/** An organic blob outline: ellipse rx,ry with hand wobble. o: {rng, wobble=.12, n, rot=0, freq=1.6, seed} */
export function blob(cx, cy, rx, ry = rx, o = {}) {
  const r = R(o), wob = o.wobble ?? 0.12, n = o.n ?? Math.max(10, Math.min(48, Math.round((rx + ry) / 6)));
  const rot = o.rot ?? 0, seed = o.seed ?? Math.floor(r() * 1e6), fr = o.freq ?? 1.6, cr = Math.cos(rot), sr = Math.sin(rot);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + wob * (fbm1(Math.cos(a) * fr + 3.1, 2, seed) + fbm1(Math.sin(a) * fr + 7.7, 2, seed + 5) - 1) * 2;
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return pts;
}

/** Jitter a polygon's points (used for layered glazes). shrink: scale toward centroid */
export function jitter(pts, r, amt, shrink = 1) {
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
  const seed = Math.floor(r() * 1e6);
  return pts.map((p, i) => {
    const dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy) || 1;
    const k = shrink * (1 + (noise1(i * 0.7, seed) - 0.5) * 2 * amt);
    return [cx + dx * k + (r() - 0.5) * amt * d * 0.3, cy + dy * k + (r() - 0.5) * amt * d * 0.3];
  });
}

/** Wobble an open polyline perpendicular to itself (hand tremor). */
export function tremor(pts, r, amt) {
  const seed = Math.floor(r() * 1e6), out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const w = (noise1(i * 0.6, seed) - 0.5) * 2 * amt;
    out.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
  }
  return out;
}

/** Resample an open polyline to roughly `step` spacing. */
export function resample(pts, step) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0].slice()]; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L === 0) continue;
    let t = step - carry;
    while (t <= L) { out.push([a[0] + (dx * t) / L, a[1] + (dy * t) / L]); t += step; }
    carry = L - (t - step);
  }
  const last = pts[pts.length - 1], o = out[out.length - 1];
  if (Math.hypot(last[0] - o[0], last[1] - o[1]) > step * 0.3) out.push(last.slice());
  return out;
}

export function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** Points along a quadratic/cubic curve given as control points [p0, c1, (c2), p1]. */
export function curve(ctrl, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    if (ctrl.length === 3) {
      const [p0, c, p1] = ctrl;
      out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
    } else {
      const [p0, c1, c2, p1] = ctrl;
      out.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
        u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1]]);
    }
  }
  return out;
}

// ----------------------------------------------------------------------------- washes

/** Granulate inside a closed path: pigment settling into the paper tooth. k = strength 0..1 */
export function granulate(g, pts, k = 0.5, px = 1.4) {
  if (k <= 0) return;
  const b = bbox(pts);
  g.save();
  smoothClosed(g, pts); g.clip();
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = Math.min(0.45, k);
  g.fillStyle = pattern(g, granTile(), px);
  g.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  g.restore();
}
/** Mottle inside a closed path: wet-in-wet cloudiness (lightens patches). */
export function mottle(g, pts, k = 0.3, px = 3) {
  if (k <= 0) return;
  const b = bbox(pts);
  g.save();
  smoothClosed(g, pts); g.clip();
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = Math.min(1, k);
  g.fillStyle = pattern(g, mottleTile(), px);
  g.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  g.restore();
}

/** Knock a shape back to bare, opaque paper, so the washes laid over it stay luminous whatever lies behind. */
export function paperFill(g, pts, a = 1) {
  g.save(); smoothClosed(g, pts); g.fillStyle = css(PAPER, a); g.fill(); g.restore();
}

/** A wet-in-wet blot: pigment dropped into a damp wash, soft all round. Cheap (one radial gradient). */
export function blot(g, x, y, rx, ry, color, a = 0.3, rot = 0) {
  const c = parse(color);
  g.save(); g.translate(x, y); if (rot) g.rotate(rot); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, css(c, a)); gr.addColorStop(0.45, css(c, a * 0.75)); gr.addColorStop(1, css(c, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
}

/**
 * Wet edge: the pigment that crept to the rim as the wash dried. Crisp at the rim, fading inward within a few
 * units, uneven around the shape. Done per wash. o: {a, rng, w, dark, clipped (the caller already clipped to pts)}
 */
export function edge(g, pts, color, o = {}) {
  const r = R(o), c = parse(color), a = o.a ?? 0.3, b = bbox(pts), size = Math.max(b.w, b.h);
  const w = o.w ?? clamp(size * 0.03, 1, 5), dark = o.dark || deepen(c, 0.4);
  g.save();
  if (!o.clipped) { smoothClosed(g, pts); g.clip(); }
  g.lineJoin = 'round'; g.lineCap = 'round';
  smoothClosed(g, pts);
  g.strokeStyle = css(dark, a * 0.2); g.lineWidth = w * 3; g.stroke();
  g.strokeStyle = css(dark, a * 0.3); g.lineWidth = w * 1.5; g.stroke();
  const d1 = size * r.range(0.1, 0.3), d2 = size * r.range(0.08, 0.3);
  g.setLineDash([d1, d2, d1 * 0.6, d2 * 1.3]); g.lineDashOffset = r() * size;
  g.strokeStyle = css(dark, a * 0.45); g.lineWidth = w * 1.1; g.stroke();
  g.setLineDash([]);
  g.strokeStyle = css(dark, a * 0.8); g.lineWidth = Math.max(0.7, w * 0.4); g.stroke();
  g.restore();
}

/**
 * A transparent watercolour wash over a closed polygon: a variegated body (pigment drifts from one tone to
 * another, thin to thick), pools and blooms inside, and its own wet edge.
 * o: { a=.35 opacity, rng, vary (second colour the wash drifts toward), layers=2 (a second, misregistered glaze),
 *      jitter=.05, edge=.8 (0 none), gran=0 (granulation: only ask for it in dark, heavy pigments), bloom=.3,
 *      pool=1, soft=0 (blur the fill edge, world units), multiply (glaze over what is there), dark: edge colour,
 *      edgeW, warmth: +/- 1 nudges the colour }
 */
export function wash(g, pts, color, o = {}) {
  const r = R(o), a = o.a ?? 0.35, layers = o.layers ?? 2, b = bbox(pts), size = Math.max(b.w, b.h, 1);
  let c = parse(color);
  if (o.warmth) c = mix(c, o.warmth > 0 ? PIGMENTS.cadOrange.rgb : PIGMENTS.ultramarine.rgb, Math.abs(o.warmth) * 0.15);
  const c2 = o.vary ? parse(o.vary) : mix(c, r.chance(0.5) ? PIGMENTS.cadOrange.rgb : PIGMENTS.cobalt.rgb, 0.06 + 0.1 * r());
  g.save();
  if (o.multiply) g.globalCompositeOperation = 'multiply';
  const ang = o.varyAngle ?? r() * TAU, dx = Math.cos(ang) * b.w * 0.5, dy = Math.sin(ang) * b.h * 0.5;
  const gr = g.createLinearGradient(b.cx - dx, b.cy - dy, b.cx + dx, b.cy + dy);
  gr.addColorStop(0, css(c, a * (0.5 + 0.25 * r()))); gr.addColorStop(0.3 + 0.4 * r(), css(mix(c, c2, 0.5), a)); gr.addColorStop(1, css(c2, a * (0.8 + 0.2 * r())));
  if (o.soft) g.filter = `blur(${Math.max(0.5, o.soft * deviceScale(g) * 0.5).toFixed(1)}px)`;
  smoothClosed(g, pts); g.fillStyle = gr; g.fill();
  if (o.soft) g.filter = 'none';
  if (layers >= 2 && size > 10) { smoothClosed(g, jitter(pts, r, o.jitter ?? 0.05, 0.97)); g.fillStyle = css(c, a * 0.28); g.fill(); }
  smoothClosed(g, pts); g.clip();
  if (size > 16) {
    const np = (o.pool ?? 1) > 0 ? 1 + (size > 70 ? 1 : 0) + (size > 240 ? 1 : 0) : 0;
    for (let i = 0; i < np; i++) blot(g, b.x + r() * b.w, b.cy + (r() - 0.25) * b.h * 0.7, size * (0.14 + 0.2 * r()), size * (0.08 + 0.14 * r()), deepen(c2, 0.22), a * 0.4 * (o.pool ?? 1), r() * 3);
    const bl = o.bloom ?? 0.3;
    if (bl > 0 && !o.multiply) blot(g, b.x + b.w * (0.2 + 0.6 * r()), b.y + b.h * (0.2 + 0.4 * r()), size * (0.16 + 0.16 * r()), size * (0.1 + 0.1 * r()), PAPER, bl * 0.55, r() * 3);
  }
  if ((o.gran ?? 0) > 0.02) { g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = Math.min(0.45, o.gran * Math.min(1, a * 2.2)); g.fillStyle = pattern(g, granTile(), o.granPx ?? 1.6); g.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4); g.restore(); }
  if ((o.edge ?? 0.8) > 0) edge(g, pts, c, { a: Math.min(1, a * (o.edge ?? 0.8) * 1.1), rng: r, dark: o.dark, w: o.edgeW, clipped: true });
  g.restore();
}

/** Fill a closed polygon with a blurred edge (canvas blur filter; blur in world units). */
export function softFill(g, pts, color, a, blur) {
  const s = deviceScale(g);
  g.save();
  g.filter = `blur(${Math.max(0.5, blur * s * 0.5).toFixed(1)}px)`;
  g.fillStyle = css(parse(color), a);
  smoothClosed(g, pts); g.fill();
  g.restore();
}

/** A quick dab: one wash stroke with a wet rim, for the hundreds of small marks (far flowers, pebbles, leaves). */
export function dab(g, x, y, rx, ry, color, o = {}) {
  const r = R(o), c = parse(color), p = blob(x, y, rx, ry, { rng: r, wobble: o.wobble ?? 0.25, n: o.n ?? 8, rot: o.rot ?? 0 });
  g.save();
  smoothClosed(g, p); g.fillStyle = css(c, o.a ?? 0.5); g.fill();
  if ((o.edge ?? 1) > 0) { g.clip(); smoothClosed(g, p); g.strokeStyle = css(deepen(c, 0.4), (o.a ?? 0.5) * 0.7 * (o.edge ?? 1)); g.lineWidth = Math.max(0.8, Math.min(rx, ry) * 0.35); g.stroke(); }
  g.restore();
  return p;
}

/**
 * A scalloped outline: bumps of about `bump` size round an ellipse. Leaf clumps, cumulus tops, wool, bushes, thatch.
 * The result is a polygon with cusps kept (pts.sharp) and its bumps listed one by one (pts.arcs), so the pen can
 * draw each bump as its own stroke. o: {rng, bump, depth=.5 (how deep the cusps), wobble=.16, rot, from, to (angles: an open run)}
 */
export function scallop(cx, cy, rx, ry = rx, o = {}) {
  const r = R(o), big = Math.max(rx, ry), bump = o.bump ?? big * 0.38, depth = o.depth ?? 0.5, wob = o.wobble ?? 0.16;
  const rot = o.rot ?? 0, cr = Math.cos(rot), sr = Math.sin(rot), seed = Math.floor(r() * 1e6);
  const from = o.from ?? 0, to = o.to ?? TAU, open = o.from !== undefined;
  const per = (Math.PI * (rx + ry) * (to - from)) / TAU, nb = Math.max(open ? 2 : 5, Math.round(per / bump));
  const cuts = [0]; for (let i = 0; i < nb; i++) cuts.push(cuts[i] + 0.6 + 0.8 * r());
  const a0 = open ? from : r() * TAU, pts = [], arcs = [];
  const at = (ang, add) => {
    const k = 1 + wob * (fbm1(Math.cos(ang) * 1.7 + 3.1, 2, seed) + fbm1(Math.sin(ang) * 1.7 + 7.7, 2, seed + 5) - 1) * 2 + add;
    const x = Math.cos(ang) * rx * k, y = Math.sin(ang) * ry * k;
    return [cx + x * cr - y * sr, cy + x * sr + y * cr];
  };
  for (let i = 0; i < nb; i++) {
    const s0 = a0 + (cuts[i] / cuts[nb]) * (to - from), s1 = a0 + (cuts[i + 1] / cuts[nb]) * (to - from), span = s1 - s0;
    const m = clamp(Math.round((span * big) / 3), 5, 12), high = span * 0.5 * depth * (0.7 + 0.6 * r()), arc = [];
    for (let k = 0; k < m; k++) { const t = k / m, p = at(s0 + span * t, Math.pow(Math.sin(t * Math.PI), 0.65) * high - high * 0.45); pts.push(p); arc.push(p); }
    arcs.push(arc);
  }
  for (let i = 0; i < nb; i++) { if (i < nb - 1 || !open) arcs[i].push(arcs[(i + 1) % nb][0]); }
  if (open) { const e = at(to, -0.0); pts.push(e); arcs[nb - 1].push(e); }
  pts.sharp = true; pts.arcs = arcs;
  return pts;
}

/**
 * The pen going round a shape: a contour in several strokes, with gaps, heavier on the shadow side.
 * For scalloped shapes each bump is its own stroke. o: {rng, w=1.3, a=.75, color, broken=.2 (chance a stroke is
 * left out), heavy [dx,dy] (the shadow side: the line is fatter and surer there), light=.45 (weight on the lit side)}
 */
export function contour(g, pts, o = {}) {
  const r = R(o), w = o.w ?? 1.3, a = o.a ?? 0.75, hv = o.heavy || [0.5, 0.8], lightK = o.light ?? 0.45, b = bbox(pts);
  const hl = Math.hypot(hv[0], hv[1]) || 1, weight = (p) => { const d = ((p[0] - b.cx) / (b.w * 0.5 + 0.01)) * hv[0] / hl + ((p[1] - b.cy) / (b.h * 0.5 + 0.01)) * hv[1] / hl; return lerp(lightK, 1.25, clamp(d * 0.6 + 0.5, 0, 1)); };
  let runs = pts.arcs;
  if (!runs) { // cut a smooth outline into a few strokes
    runs = []; const n = pts.length, len = Math.max(3, Math.round(n / (3 + Math.floor(r() * 3)))); let st = Math.floor(r() * n);
    for (let done = 0; done < n;) { const m = Math.min(n - done, Math.round(len * (0.6 + 0.8 * r()))), run = []; for (let k = 0; k <= m; k++) run.push(pts[(st + done + k) % n]); runs.push(run); done += m; }
  }
  for (const run of runs) {
    if (run.length < 2) continue;
    const k = weight(run[Math.floor(run.length / 2)]);
    if (r() < (o.broken ?? 0.2) * (k < 0.8 ? 1.8 : 0.5)) continue;
    ink(g, run, { w: w * k, a: a * (0.55 + 0.45 * Math.min(1, k)), color: o.color || INK, rng: r, wobble: o.wobble ?? 0.5, taper: pts.arcs ? [0.12, 0.3] : [0.08, 0.15], pressure: (t) => 0.75 + 0.5 * Math.sin(t * Math.PI) });
  }
}

/**
 * Line and wash. The shape is first knocked back to paper; the wash sits loosely inside it, slipped away from
 * the light so a sliver of white paper is left on the lit side; a second, hard-edged wash shades the far side;
 * then the pen describes the form with a broken contour.
 * o: {a, rng, vary, offset=.05 (slip, fraction of size), light [dx,dy] (where the light comes from), shade (0..1 or [dx,dy]),
 *     shadeColor, ink=.75 (0 none), w, inkColor, broken, paper (false: no knock-out), gran, bloom, edge, layers}
 */
export function lineAndWash(g, pts, color, o = {}) {
  const r = R(o), c = parse(color), b = bbox(pts), size = Math.max(b.w, b.h), lt = o.light || [-0.6, -0.8];
  if (o.paper !== false) paperFill(g, pts);
  const off = (o.offset ?? 0.05) * Math.min(size, 80), dx = -lt[0] * off * (0.6 + 0.8 * r()), dy = -lt[1] * off * (0.6 + 0.8 * r());
  const wp = jitter(pts, r, 0.025, 0.985).map((p) => [p[0] + dx, p[1] + dy]);
  g.save(); smoothClosed(g, pts); g.clip();
  wash(g, wp, c, { a: o.a ?? 0.5, rng: r, vary: o.vary, layers: o.layers ?? 2, edge: o.edge ?? 0.8, gran: o.gran, jitter: 0.03, bloom: o.bloom ?? 0.3, dark: o.dark });
  if (o.shade) {
    const sd = Array.isArray(o.shade) ? o.shade : [-lt[0], -lt[1]], k = Array.isArray(o.shade) ? 1 : o.shade;
    const sp = jitter(pts, r, 0.05, 1).map((p) => [p[0] + sd[0] * b.w * 0.34, p[1] + sd[1] * b.h * 0.34]);
    wash(g, sp, o.shadeColor || mix(c, PIGMENTS.indigo.rgb, 0.45), { a: 0.34 * k, rng: r, layers: 1, edge: 0.7, bloom: 0, pool: 0, multiply: true });
  }
  g.restore();
  if ((o.ink ?? 0.75) > 0) contour(g, pts, { rng: r, w: o.w ?? clamp(size * 0.02, 1, 2.2), a: o.ink ?? 0.75, color: o.inkColor || INK, broken: o.broken ?? 0.2, heavy: [-lt[0], -lt[1]] });
  return wp;
}

/**
 * The pen along the straight edges of a made thing (walls, planks, frames): one stroke per edge, a little
 * overshoot at the corners, as a draughtsman sketches. o: {rng, w=1.3, a=.75, color, over=1.5, closed=true, broken=.1, skip: [edge indexes]}
 */
export function sketch(g, pts, o = {}) {
  const r = R(o), n = pts.length, m = o.closed === false ? n - 1 : n, ov = o.over ?? 1.5;
  for (let i = 0; i < m; i++) {
    if (o.skip && o.skip.includes(i)) continue;
    if (r() < (o.broken ?? 0.1)) continue;
    const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, o1 = ov * r(), o2 = ov * r();
    ink(g, [[a[0] - ux * o1, a[1] - uy * o1], [(a[0] + b[0]) / 2 + (r() - 0.5) * L * 0.012, (a[1] + b[1]) / 2 + (r() - 0.5) * L * 0.012], [b[0] + ux * o2, b[1] + uy * o2]], { w: (o.w ?? 1.3) * (0.8 + 0.4 * r()), a: o.a ?? 0.75, color: o.color || INK, rng: r, wobble: o.wobble ?? 0.5, taper: [0.06, 0.1], steady: 0.4 });
  }
}

/** Many small pen marks in one go. list: [[x0,y0,x1,y1] | [x0,y0,cx,cy,x1,y1], ...]. o: {w=1, a=.6, color} */
export function marks(g, list, o = {}) {
  if (!list.length) return;
  g.save(); g.lineCap = 'round'; g.strokeStyle = css(parse(o.color || INK), o.a ?? 0.6); g.lineWidth = o.w ?? 1;
  g.beginPath();
  for (const m of list) { g.moveTo(m[0], m[1]); if (m.length >= 6) g.quadraticCurveTo(m[2], m[3], m[4], m[5]); else g.lineTo(m[2], m[3]); }
  g.stroke(); g.restore();
}

/**
 * Paint something on a scratch sheet at the same scale as g, finish it there (masks, erasures that must not
 * touch what is already on g), then lay it down. fn(q) gets a context in the same world units.
 */
export function sheet(g, x, y, w, h, fn) {
  const s = deviceScale(g), cw = Math.max(1, Math.ceil(w * s)), ch = Math.max(1, Math.ceil(h * s));
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(cw, ch) : Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const q = c.getContext('2d'); q.setTransform(s, 0, 0, s, -x * s, -y * s);
  fn(q);
  g.drawImage(c, x, y, cw / s, ch / s);
}

/** Union of several closed polygons as one Path2D (for clipping). */
export function unionPath(list) {
  const p = new Path2D();
  for (const pts of list) smoothClosed(p, pts);
  return p;
}

/** A single flat glaze: no edge, no grain. For layering tone. */
export function glaze(g, pts, color, a = 0.2) {
  g.save(); smoothClosed(g, pts); g.fillStyle = css(parse(color), a); g.fill(); g.restore();
}

/** Lift pigment back toward the paper: a soft pale patch. o: {a=.5, rng, wobble, clip (pts), cut (true: cut a real hole instead)} */
export function lift(g, x, y, rx, ry = rx, o = {}) {
  const r = R(o), a = o.a ?? 0.5, col = o.cut ? [0, 0, 0] : PAPER;
  g.save();
  if (o.clip) { smoothClosed(g, o.clip); g.clip(); }
  if (o.cut) g.globalCompositeOperation = 'destination-out';
  const p = blob(x, y, rx, ry, { rng: r, wobble: o.wobble ?? 0.25 });
  const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  gr.addColorStop(0, css(col, a)); gr.addColorStop(0.6, css(col, a * 0.6)); gr.addColorStop(1, css(col, 0));
  smoothClosed(g, p); g.fillStyle = gr; g.fill();
  g.restore();
}

/** Wet-in-wet bloom: a soft centre with a darker fringe where pigment was pushed. o: {a=.4, rng, wobble=.14, fringe=1} */
export function bloom(g, x, y, r0, color, o = {}) {
  const r = R(o), c = parse(color), a = o.a ?? 0.4, fr = o.fringe ?? 1;
  const p = blob(x, y, r0, r0 * (o.ry ?? 1), { rng: r, wobble: o.wobble ?? 0.14, n: 36 });
  const gr = g.createRadialGradient(x, y, 0, x, y, r0 * 1.02);
  gr.addColorStop(0, css(dilute(c, 0.25), a * 0.55));
  gr.addColorStop(0.62, css(c, a * 0.6));
  gr.addColorStop(0.9, css(deepen(c, 0.3), a * (0.6 + 0.5 * fr)));
  gr.addColorStop(1, css(deepen(c, 0.35), 0));
  g.save(); smoothClosed(g, p); g.fillStyle = gr; g.fill(); g.restore();
}

/** Backrun ("cauliflower"): water crept back into a drying wash, pushing pigment to a crinkled dark rim. */
export function backrun(g, x, y, r0, color, o = {}) {
  const r = R(o), c = parse(color), a = o.a ?? 0.4;
  const p = blob(x, y, r0, r0 * (o.ry ?? 0.85), { rng: r, wobble: 0.3, n: 44, freq: 3.2 });
  g.save();
  smoothClosed(g, p); g.fillStyle = css(dilute(c, 0.5), a * 0.35); g.fill();
  lift(g, x, y, r0 * 0.7, r0 * 0.6, { a: 0.35, rng: r, clip: p });
  g.lineJoin = 'round';
  smoothClosed(g, p);
  g.strokeStyle = css(deepen(c, 0.35), a * 0.9); g.lineWidth = Math.max(0.8, r0 * 0.07); g.stroke();
  g.setLineDash([r0 * 0.25, r0 * 0.12, r0 * 0.4, r0 * 0.2]); g.lineDashOffset = r() * r0 * 3;
  g.strokeStyle = css(deepen(c, 0.5), a * 0.6); g.lineWidth = Math.max(1.2, r0 * 0.12); g.stroke();
  g.restore();
}

/** Scumble: dry brush dragged over an area; broken marks that catch the paper tooth. o: {a, rng, angle, len, w, density, color} */
export function scumble(g, pts, color, o = {}) {
  const r = R(o), c = parse(color), a = o.a ?? 0.25, b = bbox(pts), ang = o.angle ?? 0;
  const len = o.len ?? Math.max(4, b.w * 0.12), w = o.w ?? 1.2, n = Math.ceil((b.w * b.h) / (len * 9) * (o.density ?? 1));
  const dx = Math.cos(ang), dy = Math.sin(ang);
  g.save(); smoothClosed(g, pts); g.clip();
  g.lineCap = 'round'; g.strokeStyle = css(c, 1); g.lineWidth = w;
  for (let i = 0; i < n; i++) {
    const x = b.x + r() * b.w, y = b.y + r() * b.h, l = len * (0.4 + r() * 0.9);
    g.globalAlpha = a * (0.3 + r() * 0.7);
    g.beginPath(); g.moveTo(x - dx * l * 0.5, y - dy * l * 0.5);
    g.lineTo(x + dx * l * 0.5 + (r() - 0.5) * 2, y + dy * l * 0.5 + (r() - 0.5) * 2); g.stroke();
  }
  g.restore();
}

/** Dry-brush stroke along an open path: several thin broken streaks. o: {w=6, a=.5, n=5, rng, taper=1} */
export function dryBrush(g, pts, color, o = {}) {
  const r = R(o), c = parse(color), w = o.w ?? 6, a = o.a ?? 0.5, n = o.n ?? Math.max(3, Math.round(w / 1.5));
  const path = resample(pts, Math.max(2, w * 0.5)), seed = Math.floor(r() * 1e6);
  g.save(); g.lineCap = 'round'; g.strokeStyle = css(c, 1);
  for (let k = 0; k < n; k++) {
    const off = (k / (n - 1 || 1) - 0.5) * w * r.range(0.8, 1.1), lw = (w / n) * r.range(0.6, 1.3);
    g.lineWidth = lw; g.globalAlpha = a * r.range(0.35, 1);
    g.beginPath(); let on = false;
    for (let i = 0; i < path.length; i++) {
      const p = path[i], q = path[Math.min(path.length - 1, i + 1)], pr = path[Math.max(0, i - 1)];
      let nx = -(q[1] - pr[1]), ny = q[0] - pr[0]; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
      const t = i / (path.length - 1), tap = o.taper ? Math.min(1, t * 4) * Math.min(1, (1 - t) * 3 + 0.2) : 1;
      const gap = noise1(i * 0.5 + k * 13, seed) < 0.28 + k * 0.03 || tap < 0.1;
      const x = p[0] + nx * off * tap, y = p[1] + ny * off * tap;
      if (gap) { on = false; continue; }
      if (!on) { g.moveTo(x, y); on = true; } else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.restore();
}

// ----------------------------------------------------------------------------- lines

/**
 * Ink line with a living width. pts: open polyline. o: { w=2, color, a=.85, taper=[.25,.3], wobble=.5, rng, closed,
 *   broken=0 (0..1 chance of dry gaps), pressure: fn(t)->multiplier, steady 0..1 (less swelling: limbs, planks) }
 */
export function ink(g, pts, o = {}) {
  const r = R(o), w = o.w ?? 2, c = parse(o.color || INK), a = o.a ?? 0.85, seed = Math.floor(r() * 1e6);
  const tp = o.taper ?? [0.25, 0.3], wob = o.wobble ?? 0.5;
  let path = resample(pts, Math.max(1.5, w * 1.2));
  if (o.closed) path.push(path[0]);
  if (path.length < 2) return;
  const n = path.length, L = [], Rr = [];
  for (let i = 0; i < n; i++) {
    const p = path[i], q = path[Math.min(n - 1, i + 1)], pr = path[Math.max(0, i - 1)];
    let nx = -(q[1] - pr[1]), ny = q[0] - pr[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const t = i / (n - 1);
    let k = 0.55 + 0.9 * noise1(i * 0.22, seed); if (o.steady) k = lerp(k, 1, o.steady);
    if (!o.closed) k *= smoothstep(0, Math.max(0.02, tp[0]), t) * smoothstep(0, Math.max(0.02, tp[1]), 1 - t) * 0.85 + 0.15 * (t > 0.02 && t < 0.98 ? 1 : 0);
    if (o.pressure) k *= o.pressure(t);
    if (o.broken && noise1(i * 0.4 + 50, seed) < o.broken * 0.5) k *= 0.15;
    const hw = (w * k) / 2, j = (noise1(i * 0.35 + 90, seed) - 0.5) * wob;
    L.push([p[0] + nx * (hw + j), p[1] + ny * (hw + j)]);
    Rr.push([p[0] - nx * (hw - j), p[1] - ny * (hw - j)]);
  }
  const poly = L.concat(Rr.reverse());
  g.save(); g.fillStyle = css(c, a);
  smoothClosed(g, poly); g.fill();
  g.restore();
}

/** A simple soft stroke with tremor. o: {w, color, a, rng, wobble} */
export function stroke(g, pts, o = {}) {
  const r = R(o), c = parse(o.color || INK);
  const p = o.wobble ? tremor(resample(pts, 4), r, o.wobble) : pts;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = css(c, o.a ?? 0.8); g.lineWidth = o.w ?? 1.5;
  smoothOpen(g, p); g.stroke(); g.restore();
}

/** Pencil: grainy, light, slightly doubled. o: {w=1, color, a=.5, rng} */
export function pencil(g, pts, o = {}) {
  const r = R(o), c = parse(o.color || [0.35, 0.3, 0.28]), a = o.a ?? 0.5, w = o.w ?? 1;
  const p = tremor(resample(pts, 3), r, o.wobble ?? 0.6);
  g.save(); g.lineCap = 'round'; g.strokeStyle = css(c, 1);
  g.lineWidth = w; g.globalAlpha = a * 0.6; smoothOpen(g, p); g.stroke();
  g.setLineDash([r.range(2, 6), r.range(1, 4), r.range(3, 9), r.range(0.5, 2)]); g.lineDashOffset = r() * 20;
  g.lineWidth = w * 1.4; g.globalAlpha = a * 0.5; smoothOpen(g, tremor(p, r, 0.4)); g.stroke();
  g.restore();
}

/** Pencil hatching inside a closed shape. o: {angle, spacing=4, a=.3, color, rng, cross} */
export function hatch(g, pts, o = {}) {
  const r = R(o), b = bbox(pts), ang = o.angle ?? -0.7, sp = o.spacing ?? 4, c = parse(o.color || [0.3, 0.26, 0.24]);
  const diag = Math.hypot(b.w, b.h);
  g.save(); smoothClosed(g, pts); g.clip();
  g.translate(b.cx, b.cy); g.rotate(ang);
  g.strokeStyle = css(c, 1); g.lineCap = 'round';
  for (let y = -diag / 2; y < diag / 2; y += sp * r.range(0.8, 1.2)) {
    g.globalAlpha = (o.a ?? 0.3) * r.range(0.5, 1); g.lineWidth = r.range(0.6, 1.1);
    g.beginPath(); g.moveTo(-diag / 2, y + r.range(-0.6, 0.6)); g.lineTo(diag / 2, y + r.range(-0.8, 0.8)); g.stroke();
  }
  if (o.cross) {
    g.rotate(1.3);
    for (let y = -diag / 2; y < diag / 2; y += sp * 1.3 * r.range(0.8, 1.2)) {
      g.globalAlpha = (o.a ?? 0.3) * 0.6 * r.range(0.5, 1);
      g.beginPath(); g.moveTo(-diag / 2, y); g.lineTo(diag / 2, y + r.range(-0.8, 0.8)); g.stroke();
    }
  }
  g.restore();
}

// ----------------------------------------------------------------------------- accents

/** Spatter: flicked drops. o: {n=30, size=2, a=.6, rng, dir (angle) elongates drops} */
export function spatter(g, x, y, radius, color, o = {}) {
  const r = R(o), c = parse(color), n = o.n ?? 30, sz = o.size ?? 2;
  g.save(); g.fillStyle = css(c, 1);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * radius, s = sz * (0.2 + Math.pow(r(), 2.2) * 1.6);
    g.globalAlpha = (o.a ?? 0.6) * r.range(0.4, 1);
    g.beginPath();
    if (o.dir !== undefined) g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, s * 1.8, s * 0.7, o.dir, 0, TAU);
    else g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s, 0, TAU);
    g.fill();
  }
  g.restore();
}

/** Salt: starry pale spots inside a wash with a faint dark halo. o: {n=20, size=3, rng, a=.6} */
export function salt(g, pts, o = {}) {
  const r = R(o), b = bbox(pts), n = o.n ?? 20, sz = o.size ?? 3;
  g.save(); smoothClosed(g, pts); g.clip();
  for (let i = 0; i < n; i++) {
    const x = b.x + r() * b.w, y = b.y + r() * b.h, s = sz * r.range(0.4, 1.4);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.25;
    g.fillStyle = 'rgba(60,50,45,1)'; g.beginPath(); g.arc(x, y, s * 1.5, 0, TAU); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.globalAlpha = (o.a ?? 0.6) * r.range(0.6, 1);
    const p = blob(x, y, s, s * 0.8, { rng: r, wobble: 0.45, n: 9, freq: 3 });
    smoothClosed(g, p); g.fillStyle = '#000'; g.fill();
  }
  g.restore();
}

/** Gouache: opaque, flat, a little chalky. o: {a=.92, rng, texture=.3} */
export function gouache(g, pts, color, o = {}) {
  const r = R(o), c = parse(color);
  g.save();
  smoothClosed(g, pts); g.fillStyle = css(c, o.a ?? 0.92); g.fill();
  if (o.texture !== 0) scumble(g, pts, dilute(c, 0.35), { a: (o.texture ?? 0.3) * 0.5, rng: r, angle: o.angle ?? 0.3, w: 0.8, density: 0.5 });
  g.restore();
}

/** White ink / gouache dots and ticks for sparkle. o: {n, size, a, rng, color} */
export function whiteInk(g, x, y, radius, o = {}) {
  const r = R(o), n = o.n ?? 8, sz = o.size ?? 1.2, c = parse(o.color || PIGMENTS.white.rgb);
  g.save(); g.fillStyle = css(c, 1); g.strokeStyle = css(c, 1); g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * radius, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    g.globalAlpha = (o.a ?? 0.85) * r.range(0.5, 1);
    if (r.chance(0.3)) { g.lineWidth = sz * 0.8; g.beginPath(); g.moveTo(px, py); g.lineTo(px + r.range(-3, 3), py + r.range(-3, 1)); g.stroke(); }
    else { g.beginPath(); g.arc(px, py, sz * r.range(0.5, 1.3), 0, TAU); g.fill(); }
  }
  g.restore();
}

/** Soft radial glow (additive-ish, for lamps, sun, fireflies). */
export function glow(g, x, y, r0, color, a = 0.5, o = {}) {
  const c = parse(color);
  const gr = g.createRadialGradient(x, y, 0, x, y, r0);
  gr.addColorStop(0, css(c, a)); gr.addColorStop(0.35, css(c, a * 0.45)); gr.addColorStop(1, css(c, 0));
  g.save(); g.globalCompositeOperation = o.blend || 'screen'; g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r0, 0, TAU); g.fill(); g.restore();
}

/** A cast shadow on the ground: a flat violet-grey wash with its own edge, glazed over what is there. */
export function groundShadow(g, x, y, rx, ry, a = 0.18, color = PIGMENTS.indigo.rgb) {
  const p = blob(x + rx * 0.12, y, rx, ry, { rng: mkRng((Math.abs(x * 7 + y * 13) | 0) + 1), wobble: 0.3, n: 18, freq: 2.6 });
  g.save(); g.globalCompositeOperation = 'multiply';
  smoothClosed(g, p); g.fillStyle = css(color, a * 0.6); g.fill();
  g.clip(); smoothClosed(g, p); g.strokeStyle = css(color, a * 0.35); g.lineWidth = Math.max(1, ry * 0.3); g.stroke();
  blot(g, x, y, rx * 0.6, ry * 0.7, color, a * 0.5);
  g.restore();
}
