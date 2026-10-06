// Water: still pond, river, sea, under the sea. Reflections are smeared vertical glazes.
import { TAU, clamp, lerp, rng as mkRng } from './rng.js';
import { fbm1, noise1 } from './noise.js';
import { css, mix, dilute, deepen, lerpRgb, PAPER, PIGMENTS } from './color.js';
import { blob, wash, glaze, granulate, softFill, lift, dryBrush, ink, stroke, scumble, spatter, smoothClosed, smoothOpen, jitter, whiteInk, glow } from './brush.js';

const fallback = mkRng(13);
const R = (o) => o.rng || fallback;
const pg = (n) => PIGMENTS[n].rgb;

export const water = {
  /** Still water in a (wobbly) polygon or rect. o: {rng, rect:[x,y,w,h] | pts, sky (colour reflected at the far side), ripples=1, sparkle} */
  still(g, pal, o = {}) {
    const r = R(o);
    let pts = o.pts; let b;
    if (!pts) { const [x, y, w, h] = o.rect; pts = blob(x + w / 2, y + h / 2, w / 2, h / 2, { rng: r, wobble: 0.08, n: 28 }); }
    b = bboxOf(pts);
    const far = o.sky ? lerpRgb(dilute(pal.waterShallow, 0.2), o.sky, 0.6) : dilute(pal.waterShallow, 0.2), near = dilute(pal.waterDeep, 0.38);
    // the bank: a wet dark rim of soil just outside the water
    softFill(g, pts.map((p) => [p[0], p[1] + 3]), mix(pal.ground, pal.waterDeep, 0.3), 0.35, 5);
    g.save(); smoothClosed(g, pts); g.clip();
    const gr = g.createLinearGradient(0, b.y, 0, b.y + b.h);
    gr.addColorStop(0, css(far, 0.5)); gr.addColorStop(0.5, css(mix(far, near, 0.5), 0.5)); gr.addColorStop(1, css(near, 0.6));
    g.fillStyle = gr; g.fillRect(b.x, b.y, b.w, b.h);
    // wet-in-wet drifts and lifted light
    for (let i = 0; i < 4; i++) softFill(g, blob(b.x + r() * b.w, b.y + b.h * (0.4 + 0.6 * r()), b.w * (0.15 + 0.2 * r()), b.h * 0.08, { rng: r, wobble: 0.3 }), deepen(near, 0.2), 0.2, 10);
    for (let i = 0; i < 5; i++) lift(g, b.x + r() * b.w, b.y + b.h * (0.1 + 0.5 * r()), b.w * (0.08 + 0.15 * r()), b.h * 0.025, { a: 0.3, rng: r, wobble: 0.3 });
    granulate(g, pts, 0.3, 1.8);
    // horizontal dry strokes: the surface
    const n = Math.floor(b.h / 14);
    for (let i = 0; i < n; i++) {
      const y = b.y + b.h * (0.15 + 0.85 * Math.pow(r(), 0.8)), L = b.w * (0.15 + 0.4 * r()), x = b.x + r() * (b.w - L);
      dryBrush(g, [[x, y], [x + L, y + (r() - 0.5) * 2]], r() < 0.6 ? deepen(near, 0.25) : dilute(far, 0.5), { w: 2 + 3 * r(), a: 0.25, n: 3, rng: r });
    }
    // ripple rings
    if ((o.ripples ?? 1) > 0) for (let i = 0; i < 3 * (o.ripples ?? 1); i++) {
      const x = b.x + r() * b.w, y = b.y + b.h * (0.3 + 0.6 * r());
      for (let k = 1; k <= 2; k++) { g.strokeStyle = css(k === 1 ? dilute(far, 0.5) : deepen(near, 0.2), 0.3); g.lineWidth = 0.9; g.beginPath(); g.ellipse(x, y, 10 * k + r() * 8, (10 * k) * 0.22, 0, 0.2, Math.PI * 1.6); g.stroke(); }
    }
    if (o.sparkle !== false && pal.time !== 'night') whiteInk(g, b.x + b.w * 0.5, b.y + b.h * 0.3, b.w * 0.3, { n: Math.floor(b.w / 40), size: 0.9, a: 0.7, rng: r });
    g.restore();
    // a pooled edge where water meets bank
    g.save(); g.strokeStyle = css(deepen(near, 0.4), 0.3); g.lineWidth = 1.6; g.lineCap = 'round'; g.setLineDash([30, 12, 50, 8]); smoothClosed(g, pts); g.stroke(); g.restore();
    return pts;
  },

  /** Reflection of something at (x, yWater) of width w, height h (above the water), colour c. */
  reflect(g, x, yWater, w, h, c, o = {}) {
    const r = R(o), a = o.a ?? 0.25, n = 4 + Math.floor(w / 12);
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const px = x - w / 2 + (i + 0.5) * (w / n) + (r() - 0.5) * 3, len = h * (0.55 + 0.6 * r()) * (o.k ?? 1);
      g.strokeStyle = css(mix(c, pg('cobalt'), 0.25), a * (0.5 + 0.5 * r())); g.lineWidth = (w / n) * 1.2;
      g.setLineDash([4 + r() * 10, 3 + r() * 6]); g.lineDashOffset = r() * 20;
      g.beginPath(); g.moveTo(px, yWater); g.lineTo(px + (r() - 0.5) * 4, yWater + len); g.stroke();
    }
    g.restore();
  },

  /** A river along a centre polyline. o: {rng, w (number or fn(t)), foam=1} */
  river(g, line, w, pal, o = {}) {
    const r = R(o), L = [], Rt = [];
    for (let i = 0; i < line.length; i++) {
      const p = line[i], q = line[Math.min(line.length - 1, i + 1)], pr = line[Math.max(0, i - 1)];
      let nx = -(q[1] - pr[1]), ny = q[0] - pr[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const hw = (typeof w === 'function' ? w(i / (line.length - 1)) : w) * 0.5 * (0.9 + 0.2 * fbm1(i * 0.4, 2, 5));
      L.push([p[0] + nx * hw, p[1] + ny * hw]); Rt.push([p[0] - nx * hw, p[1] - ny * hw]);
    }
    const poly = L.concat(Rt.slice().reverse());
    wash(g, poly, pal.waterDeep, { a: 0.42, rng: r, layers: 2, edge: 0.5, gran: 0.4, jitter: 0.01, mottle: 0.25 });
    g.save(); smoothClosed(g, poly); g.clip();
    glaze(g, L.concat(line.slice().reverse()), dilute(pal.waterShallow, 0.3), 0.25);
    for (let k = -2; k <= 2; k++) {
      const off = line.map((p, i) => { const a = L[i], b = Rt[i]; const t = 0.5 + k * 0.17 + (r() - 0.5) * 0.08; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; });
      dryBrush(g, off, k % 2 ? deepen(pal.waterDeep, 0.3) : dilute(pal.waterShallow, 0.6), { w: 3, a: 0.3, n: 3, rng: r });
    }
    g.restore();
    if ((o.foam ?? 1) > 0) for (let i = 0; i < line.length; i += 2) if (r() < 0.5) whiteInk(g, line[i][0] + (r() - 0.5) * 20, line[i][1] + (r() - 0.5) * 10, 8, { n: 4, size: 0.9, a: 0.7, rng: r });
    return poly;
  },

  /** Open sea filling rect from the horizon y down. o: {rng, waves 0..1, foam 0..1} */
  sea(g, x, y, w, h, pal, o = {}) {
    const r = R(o), waves = o.waves ?? 0.3, deep = pal.waterDeep, shallow = pal.waterShallow;
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, css(deepen(deep, 0.1))); gr.addColorStop(0.35, css(deep)); gr.addColorStop(1, css(mix(shallow, pg('viridian'), 0.2)));
    g.save(); g.fillStyle = gr; g.fillRect(x, y, w, h);
    const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    granulate(g, pts, 0.35, 1.8);
    for (let i = 0; i < 6; i++) lift(g, x + r() * w, y + h * (0.05 + 0.3 * r()), w * 0.1 * (0.5 + r()), 4, { a: 0.35, rng: r, wobble: 0.3 });
    // wave bands, denser toward the viewer
    const rows = 10 + Math.floor(h / 40);
    for (let i = 0; i < rows; i++) {
      const t = Math.pow(i / rows, 1.6), yy = y + 8 + t * (h - 8), amp = (2 + 10 * waves) * (0.3 + t), len = w * (0.08 + 0.25 * r()), xx = x + r() * (w - len);
      const line = []; for (let k = 0; k <= 8; k++) line.push([xx + (len * k) / 8, yy + Math.sin(k * 1.1 + i) * amp * 0.5]);
      dryBrush(g, line, r() < 0.5 ? deepen(deep, 0.35) : dilute(shallow, 0.5), { w: 2 + t * 5, a: 0.3, n: 3, rng: r });
      if (waves > 0.2 && r() < waves * 0.8 && t > 0.2) { // breaking crest: lifted paper + white ink
        const cx = xx + len * (0.3 + 0.4 * r());
        lift(g, cx, yy - amp * 0.3, len * 0.25, amp * 0.5 + 2, { a: 0.5, rng: r });
        whiteInk(g, cx, yy - amp * 0.4, len * 0.25, { n: 6 + 10 * waves, size: 1 + t, a: 0.85, rng: r });
      }
    }
    if (pal.time !== 'night') whiteInk(g, x + w * 0.5, y + h * 0.2, w * 0.4, { n: Math.floor(w / 25), size: 0.8, a: 0.6, rng: r });
    g.restore();
    // horizon: a pooled dark line
    g.save(); g.strokeStyle = css(deepen(deep, 0.5), 0.35); g.lineWidth = 1.5; g.setLineDash([80, 20, 140, 10]); g.beginPath(); g.moveTo(x, y + 0.5); g.lineTo(x + w, y + 0.5); g.stroke(); g.restore();
  },

  /** Under the sea: filling rect, light shafts from the top, caustics, drifting motes. o: {rng, shafts, depth 0..1} */
  underwater(g, x, y, w, h, pal, o = {}) {
    const r = R(o), top = mix(pal.waterShallow, pg('lemon'), 0.2), bot = deepen(mix(pal.waterDeep, pg('indigo'), 0.5), 0.2);
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, css(top)); gr.addColorStop(0.4, css(mix(pal.waterDeep, pg('viridian'), 0.3))); gr.addColorStop(1, css(bot));
    g.save(); g.fillStyle = gr; g.fillRect(x, y, w, h);
    const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    for (let i = 0; i < 8; i++) softFill(g, blob(x + r() * w, y + r() * h, w * 0.15 * (0.5 + r()), h * 0.1 * (0.5 + r()), { rng: r, wobble: 0.35 }), r() < 0.5 ? pg('viridian') : pg('ultramarine'), 0.15, 20);
    granulate(g, pts, 0.4, 2);
    // light shafts
    const shafts = o.shafts ?? 5;
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < shafts; i++) {
      const sx = x + w * (0.1 + 0.8 * r()), sw = 20 + 60 * r(), lean = (r() - 0.5) * 0.5;
      softFill(g, [[sx - sw * 0.3, y - 10], [sx + sw * 0.3, y - 10], [sx + sw + lean * h, y + h * 0.9], [sx - sw * 0.2 + lean * h, y + h * 0.9]], [0, 0, 0], 0.22, 18);
    }
    g.globalCompositeOperation = 'source-over';
    // caustics near the surface
    g.strokeStyle = css(dilute(pg('lemon'), 0.5), 0.35); g.lineWidth = 1.2; g.lineCap = 'round';
    for (let i = 0; i < w / 14; i++) { const cx = x + r() * w, cy = y + r() * h * 0.3; g.beginPath(); g.ellipse(cx, cy, 6 + r() * 14, 2 + r() * 5, r() * 1, 0.3, 2.6); g.stroke(); }
    // motes and bubbles
    spatter(g, x + w / 2, y + h / 2, Math.max(w, h) * 0.6, PAPER, { n: Math.floor(w * h / 12000), size: 1.2, a: 0.35, rng: r });
    g.strokeStyle = css(PAPER, 0.5); g.lineWidth = 0.8;
    for (let i = 0; i < w / 60; i++) { const bx = x + r() * w, by = y + h * (0.3 + 0.7 * r()), br = 2 + r() * 5; g.beginPath(); g.arc(bx, by, br, 0, TAU); g.stroke(); g.beginPath(); g.arc(bx - br * 0.3, by - br * 0.3, br * 0.25, 0, TAU); g.fillStyle = css(PAPER, 0.6); g.fill(); }
    g.restore();
  },
};

function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
