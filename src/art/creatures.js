// Creatures with character: soft washed bodies, fur ticks, a lively broken ink contour, big gentle eyes.
// Each finished creature: (g, x, y, s, pal, o) with (x, y) the ground point under it, s its height, o.dir = +1 faces right.
import { TAU, clamp, lerp, rng as mkRng } from './rng.js';
import { css, mix, dilute, deepen, lerpRgb, PAPER, PIGMENTS } from './color.js';
import { blob, wash, glaze, granulate, softFill, lift, dryBrush, ink, stroke, scumble, smoothClosed, jitter, gouache, whiteInk, groundShadow, curve, bbox, spatter, dab, lineAndWash } from './brush.js';

const fallback = mkRng(21);
const R = (o) => o.rng || fallback;
const pg = (n) => PIGMENTS[n].rgb;

export const creatures = {
  /** A furred body part: wash + mottling + shade + fur ticks + broken contour. o: {rng, shade [dx,dy], fur=1, outline=1, inkColor} */
  body(g, pts, color, pal, o = {}) {
    const r = R(o), c = typeof color === 'string' ? color : color, sh = o.shade || [0.4, 0.6], b = bbox(pts);
    wash(g, pts, c, { a: o.a ?? 0.5, rng: r, layers: 2, edge: 0.85, gran: 0.35, jitter: 0.03, mottle: 0.2, bloom: 0.5 });
    g.save(); smoothClosed(g, pts); g.clip();
    const shade = pts.map((p) => [p[0] + sh[0] * b.w * 0.22, p[1] + sh[1] * b.h * 0.2]);
    softFill(g, shade, mix(c, pal.shadow, 0.45), 0.3, Math.max(3, b.w * 0.05));
    granulate(g, shade, 0.4);
    lift(g, b.cx - sh[0] * b.w * 0.25, b.cy - sh[1] * b.h * 0.25, b.w * 0.25, b.h * 0.2, { a: 0.3, rng: r });
    // inner fur: short strokes following the body's curve, denser toward the shade
    if ((o.fur ?? 1) > 0) {
      const n = Math.floor((b.w * b.h) / 260 * (o.fur ?? 1)), dark = deepen(c, 0.4), light = dilute(c, 0.5);
      g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const px = b.x + r() * b.w, py = b.y + r() * b.h, dx = px - b.cx, dy = py - b.cy;
        const shadeK = (dx / b.w * sh[0] + dy / b.h * sh[1]) + 0.5, L = b.h * (0.04 + 0.05 * r());
        const ang = Math.atan2(dy, dx) + 0.9 + (r() - 0.5) * 0.8;
        g.strokeStyle = css(r() < shadeK ? dark : light, 0.35 + 0.3 * r()); g.lineWidth = 0.6 + r() * 0.9;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(ang) * L, py + Math.sin(ang) * L); g.stroke();
      }
    }
    g.restore();
    if ((o.fur ?? 1) > 0) this.fur(g, pts, deepen(c, 0.4), { rng: r, k: o.fur * 1.3, len: Math.max(2.5, b.h * 0.1) });
    if ((o.outline ?? 1) > 0) this.outline(g, pts, pal, { rng: r, w: o.w ?? Math.max(1, b.h * 0.025), a: 0.6 * (o.outline ?? 1), color: o.inkColor });
  },

  /** Fur ticks around a polygon. o: {rng, k=1, len, inward} */
  fur(g, pts, color, o = {}) {
    const r = R(o), len = o.len ?? 4, n = pts.length;
    let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= n; cy /= n;
    g.save(); g.strokeStyle = css(color, 1); g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n], steps = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 4 * (o.k ?? 1)));
      for (let k = 0; k < steps; k++) {
        if (r() < 0.35) continue;
        const t = k / steps, x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t;
        let dx = x - cx, dy = y - cy; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        const a = Math.atan2(dy, dx) + (r() - 0.5) * 0.9 + 0.4, L = len * (0.5 + r());
        g.globalAlpha = 0.35 + 0.4 * r(); g.lineWidth = 0.6 + r() * 0.8;
        g.beginPath(); g.moveTo(x - dx * L * 0.3, y - dy * L * 0.3); g.lineTo(x + Math.cos(a) * L * 0.7, y + Math.sin(a) * L * 0.7); g.stroke();
      }
    }
    g.restore();
  },

  /** Broken ink contour, heavier underneath. */
  outline(g, pts, pal, o = {}) {
    const r = R(o), n = pts.length, start = Math.floor(r() * n);
    const b = bbox(pts), c = o.color || pal.ink;
    let run = [];
    const flush = () => { if (run.length > 1) ink(g, run, { w: o.w ?? 1.4, a: o.a ?? 0.6, color: c, rng: r, wobble: 0.5, pressure: (t) => 0.7 + 0.5 * Math.sin(t * Math.PI) }); run = []; };
    for (let i = 0; i <= n; i++) {
      const p = pts[(start + i) % n], low = p[1] > b.cy;
      if (r() < (low ? 0.08 : 0.22) && run.length > 2) { flush(); continue; }
      run.push(p);
    }
    flush();
  },

  /** An eye at (x, y) radius rad. o: {rng, look [dx,dy], lid 0..1 (sleepy), color} */
  eye(g, x, y, rad, o = {}) {
    const r = R(o), look = o.look || [0.1, 0.1], lid = o.lid ?? 0;
    if (rad > 2.5) { g.save(); g.fillStyle = css(PAPER, 0.95); g.beginPath(); g.ellipse(x, y, rad, rad * 0.9, 0, 0, TAU); g.fill(); g.restore(); }
    const px = x + look[0] * rad * 0.35, py = y + look[1] * rad * 0.35, pr = rad > 2.5 ? rad * 0.68 : rad;
    g.save(); g.fillStyle = css(o.color || pg('ink'), 0.95); g.beginPath(); g.ellipse(px, py, pr, pr * 1.05, 0, 0, TAU); g.fill();
    g.fillStyle = css(PAPER, 0.95); g.beginPath(); g.arc(px - pr * 0.35, py - pr * 0.38, pr * 0.3, 0, TAU); g.fill();
    g.beginPath(); g.arc(px + pr * 0.3, py + pr * 0.35, pr * 0.12, 0, TAU); g.fill();
    if (lid > 0) { g.fillStyle = css(o.skin || [0.6, 0.5, 0.42], 0.9); g.beginPath(); g.ellipse(x, y - rad * (1.1 - lid * 1.1), rad * 1.15, rad * 1.1, 0, 0, TAU); g.fill(); }
    g.restore();
    stroke(g, [[x - rad * 1.1, y - rad * 0.9], [x, y - rad * 1.25], [x + rad * 1.1, y - rad * 0.85]], { w: Math.max(0.8, rad * 0.22), a: 0.7, color: o.color || pg('ink'), rng: r });
  },

  /** A blush spot. */
  blush(g, x, y, rad, o = {}) { softFill(g, blob(x, y, rad, rad * 0.75, { rng: R(o), wobble: 0.2, n: 9 }), pg('roseMadder'), o.a ?? 0.22, rad * 0.6); },

  /** Whiskers from a muzzle point. o: {rng, dir, n=3, len} */
  whiskers(g, x, y, o = {}) {
    const r = R(o), d = o.dir ?? 1, n = o.n ?? 3, L = o.len ?? 14;
    for (let i = 0; i < n; i++) { const a = (i - (n - 1) / 2) * 0.35 + (d > 0 ? 0 : Math.PI); stroke(g, [[x, y], [x + Math.cos(a) * L * 0.5, y + Math.sin(a) * L * 0.5 - 1], [x + Math.cos(a) * L, y + Math.sin(a) * L]], { w: 0.7, a: 0.55, color: pg('ink'), rng: r, wobble: 0.3 }); }
  },

  /** A limb: tapered ink + wash. pts polyline from the body outward. o: {w, color, rng} */
  limb(g, pts, color, pal, o = {}) {
    const r = R(o), w = o.w ?? 5;
    ink(g, pts, { w: w * 1.6, a: 0.45, color, rng: r, taper: [0, 0.3], wobble: 0.3 });
    ink(g, pts, { w: w * 1.7, a: 0.4, color: pal.ink, rng: r, taper: [0.1, 0.25], wobble: 0.5, broken: 0.5, pressure: () => 0.35 });
  },

  // ----------------------------------------------------------------- finished creatures

  mouse(g, x, y, s, pal, o = {}) {
    const r = R(o), d = o.dir ?? 1, fur = o.color || dilute(mix(pg('burntUmber'), pg('paynes'), 0.45), 0.35), pink = dilute(pg('roseMadder'), 0.45);
    groundShadow(g, x, y, s * 0.7, s * 0.12, 0.2, pal.shadow);
    // tail
    ink(g, curve([[x - d * s * 0.45, y - s * 0.2], [x - d * s * 1.1, y - s * 0.1], [x - d * s * 1.2, y - s * 0.6]], 10), { w: s * 0.06, a: 0.75, color: mix(pink, fur, 0.4), rng: r, taper: [0, 0.5] });
    // body (a pear, bottom heavy) and head
    const body = blob(x - d * s * 0.1, y - s * 0.38, s * 0.58, s * 0.4, { rng: r, wobble: 0.1, n: 18 });
    this.body(g, body, fur, pal, { rng: r, fur: 1.2, shade: [-d * 0.3, 0.6] });
    const head = blob(x + d * s * 0.42, y - s * 0.55, s * 0.36, s * 0.3, { rng: r, wobble: 0.1, n: 14, rot: d * 0.25 });
    // ears first (behind) then head
    for (const [ex, ey] of [[x + d * s * 0.25, y - s * 0.86], [x + d * s * 0.55, y - s * 0.9]]) {
      const ear = blob(ex, ey, s * 0.17, s * 0.19, { rng: r, wobble: 0.08, n: 12 });
      wash(g, ear, fur, { a: 0.5, rng: r, edge: 0.8, gran: 0.2, layers: 1 }); glaze(g, blob(ex, ey + s * 0.01, s * 0.1, s * 0.12, { rng: r, n: 10 }), pink, 0.5);
      ink(g, ear, { w: s * 0.02, a: 0.55, color: pal.ink, rng: r, closed: true, broken: 0.4 });
    }
    this.body(g, head, fur, pal, { rng: r, fur: 0.8, shade: [-d * 0.3, 0.5] });
    lift(g, x + d * s * 0.5, y - s * 0.45, s * 0.2, s * 0.12, { a: 0.35, rng: r, clip: head });
    this.eye(g, x + d * s * 0.5, y - s * 0.6, s * 0.055, { rng: r, look: [d * 0.3, 0.2], lid: o.sleep ? 1 : 0, skin: fur });
    g.save(); g.fillStyle = css(pink, 0.9); g.beginPath(); g.ellipse(x + d * s * 0.77, y - s * 0.5, s * 0.04, s * 0.03, 0, 0, TAU); g.fill(); g.restore();
    this.whiskers(g, x + d * s * 0.72, y - s * 0.48, { rng: r, dir: d, len: s * 0.3 });
    this.blush(g, x + d * s * 0.56, y - s * 0.47, s * 0.07, { rng: r });
    // feet
    for (const fx of [x - d * s * 0.2, x + d * s * 0.2]) ink(g, [[fx, y - s * 0.08], [fx + d * s * 0.14, y]], { w: s * 0.06, a: 0.6, color: pink, rng: r, taper: [0, 0.3] });
    // paws holding something (a seed)
    glaze(g, blob(x + d * s * 0.5, y - s * 0.3, s * 0.07, s * 0.09, { rng: r, n: 8 }), pg('ochre'), 0.8);
  },

  hedgehog(g, x, y, s, pal, o = {}) {
    const r = R(o), d = o.dir ?? 1, dark = mix(pg('sepia'), pg('burntUmber'), 0.4), face = dilute(pg('ochre'), 0.5);
    groundShadow(g, x, y, s * 0.8, s * 0.14, 0.22, pal.shadow);
    const bx = x - d * s * 0.08, by = y - s * 0.46, brx = s * 0.7, bry = s * 0.46;
    const body = blob(bx, by, brx, bry, { rng: r, wobble: 0.07, n: 22 });
    // the belly is warm and pale; the back under the spines is dark
    wash(g, body, mix(face, pg('burntUmber'), 0.35), { a: 0.5, rng: r, layers: 2, edge: 0.7, gran: 0.35, bloom: 0.4 });
    g.save(); smoothClosed(g, body); g.clip();
    softFill(g, body.map((p) => [p[0] - d * s * 0.06, p[1] - s * 0.16]), dark, 0.75, 6);
    granulate(g, body, 0.4);
    g.restore();
    // spines: rows from the belly line up to the crown, each pointing up and back, dark with a pale tip
    g.save(); g.lineCap = 'round';
    const rows = Math.floor(s * 0.09), seedA = Math.floor(r() * 1000);
    for (let row = 0; row < rows; row++) {
      const t = row / rows, py = y - s * 0.16 - t * s * 0.78;          // from low back to crown
      const dy = (py - by) / bry; if (Math.abs(dy) > 1) continue;
      const half = brx * Math.sqrt(1 - dy * dy) * 1.02;
      const n = Math.floor((half * 2) / (s * 0.03));
      for (let i = 0; i < n; i++) {
        const px = bx - half + ((i + 0.5 + (r() - 0.5) * 0.6) / n) * half * 2;
        const u = (px - bx) / brx;                                   // -1 back .. +1 face
        if (d * u > 0.72 - t * 0.2) continue;                        // leave the face bare
        const ang = -Math.PI / 2 + d * (u * 0.9 - 0.35) + (r() - 0.5) * 0.35;  // fan: back spines lean back, front lean forward
        const L = s * (0.13 + 0.09 * r()) * (0.6 + 0.4 * t);
        g.strokeStyle = css(deepen(dark, 0.3), 0.8); g.lineWidth = s * 0.012; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(ang) * L, py + Math.sin(ang) * L); g.stroke();
        g.strokeStyle = css(dilute(pg('ochre'), 0.65), 0.85); g.lineWidth = s * 0.009; g.beginPath(); g.moveTo(px + Math.cos(ang) * L * 0.55, py + Math.sin(ang) * L * 0.55); g.lineTo(px + Math.cos(ang) * L, py + Math.sin(ang) * L); g.stroke();
      }
    }
    g.restore();
    // face: a soft rounded snout
    const head = jitter([[x + d * s * 0.28, y - s * 0.66], [x + d * s * 0.5, y - s * 0.62], [x + d * s * 0.7, y - s * 0.5], [x + d * s * 0.86, y - s * 0.3], [x + d * s * 0.8, y - s * 0.2], [x + d * s * 0.62, y - s * 0.12], [x + d * s * 0.4, y - s * 0.1], [x + d * s * 0.26, y - s * 0.3]], r, 0.04);
    this.body(g, head, face, pal, { rng: r, fur: 0.7, shade: [-d * 0.2, 0.7], a: 0.45 });
    lift(g, x + d * s * 0.5, y - s * 0.5, s * 0.14, s * 0.08, { a: 0.35, rng: r, clip: head });
    this.eye(g, x + d * s * 0.55, y - s * 0.46, s * 0.055, { rng: r, look: [d * 0.3, 0.1] });
    g.save(); g.fillStyle = css(pg('ink'), 0.92); g.beginPath(); g.ellipse(x + d * s * 0.83, y - s * 0.26, s * 0.055, s * 0.045, 0, 0, TAU); g.fill();
    g.fillStyle = css(PAPER, 0.8); g.beginPath(); g.arc(x + d * s * 0.81, y - s * 0.28, s * 0.015, 0, TAU); g.fill(); g.restore();
    stroke(g, [[x + d * s * 0.7, y - s * 0.22], [x + d * s * 0.62, y - s * 0.18]], { w: 1.2, a: 0.6, color: pal.ink, rng: r });
    this.blush(g, x + d * s * 0.58, y - s * 0.32, s * 0.07, { rng: r });
    this.whiskers(g, x + d * s * 0.74, y - s * 0.26, { rng: r, dir: d, len: s * 0.2, n: 2 });
    for (const fx of [x - d * s * 0.25, x + d * s * 0.3]) ink(g, [[fx, y - s * 0.06], [fx + d * s * 0.12, y + 1]], { w: s * 0.06, a: 0.7, color: dark, rng: r, taper: [0, 0.3] });
  },

  robin(g, x, y, s, pal, o = {}) {
    const r = R(o), d = o.dir ?? 1, back = mix(pg('burntUmber'), pg('olive'), 0.35), breast = mix(pg('cadOrange'), pg('cadRed'), 0.35), belly = dilute(pg('ochre'), 0.65);
    groundShadow(g, x, y, s * 0.4, s * 0.08, 0.2, pal.shadow);
    // tail
    ink(g, [[x - d * s * 0.3, y - s * 0.45], [x - d * s * 0.75, y - s * 0.3]], { w: s * 0.16, a: 0.75, color: back, rng: r, taper: [0, 0.1] });
    const body = blob(x, y - s * 0.5, s * 0.46, s * 0.42, { rng: r, wobble: 0.08, n: 18, rot: -d * 0.3 });
    this.body(g, body, belly, pal, { rng: r, fur: 0.7, shade: [-d * 0.3, 0.6], a: 0.45 });
    g.save(); smoothClosed(g, body); g.clip();
    softFill(g, body.map((p) => [p[0] - d * s * 0.2, p[1] - s * 0.22]), back, 0.6, 3);
    softFill(g, blob(x + d * s * 0.12, y - s * 0.52, s * 0.3, s * 0.3, { rng: r, wobble: 0.15 }), breast, 0.6, 4);
    granulate(g, body, 0.2);
    g.restore();
    // wing
    const wing = blob(x - d * s * 0.12, y - s * 0.5, s * 0.3, s * 0.17, { rng: r, wobble: 0.12, n: 12, rot: d * 0.5 });
    wash(g, wing, deepen(back, 0.15), { a: 0.5, rng: r, edge: 0.8, gran: 0.2, layers: 1 });
    for (let i = 0; i < 4; i++) stroke(g, [[x - d * s * 0.05 - d * i * s * 0.07, y - s * 0.52], [x - d * s * 0.3 - d * i * s * 0.05, y - s * 0.38 + i * 2]], { w: 0.8, a: 0.4, color: pal.ink, rng: r });
    this.eye(g, x + d * s * 0.22, y - s * 0.68, s * 0.045, { rng: r, look: [d * 0.2, 0] });
    ink(g, [[x + d * s * 0.36, y - s * 0.62], [x + d * s * 0.55, y - s * 0.58], [x + d * s * 0.36, y - s * 0.55]], { w: s * 0.04, a: 0.85, color: pg('ochre'), rng: r, closed: true });
    for (const lx of [x - d * s * 0.06, x + d * s * 0.1]) { stroke(g, [[lx, y - s * 0.1], [lx + d * 2, y]], { w: 1.3, a: 0.8, color: pal.ink, rng: r }); stroke(g, [[lx + d * 2 - 4, y], [lx + d * 2 + 4, y]], { w: 1.1, a: 0.7, color: pal.ink, rng: r }); }
  },

  bee(g, x, y, s, pal, o = {}) {
    const r = R(o), d = o.dir ?? 1, yel = pg('cadYellow'), dark = pg('sepia');
    const body = blob(x, y, s * 0.5, s * 0.33, { rng: r, wobble: 0.08, n: 14 });
    wash(g, body, yel, { a: 0.65, rng: r, edge: 0.8, gran: 0.2, layers: 1 });
    g.save(); smoothClosed(g, body); g.clip();
    for (let i = 0; i < 3; i++) { const sx = x - d * s * 0.05 - d * i * s * 0.15; softFill(g, [[sx - s * 0.05, y - s * 0.4], [sx + s * 0.05, y - s * 0.4], [sx + s * 0.05, y + s * 0.4], [sx - s * 0.05, y + s * 0.4]], dark, 0.8, s * 0.02); }
    g.restore();
    this.fur(g, body, dark, { rng: r, k: 0.8, len: s * 0.08 });
    // head
    const head = blob(x + d * s * 0.5, y - s * 0.03, s * 0.17, s * 0.17, { rng: r, wobble: 0.1, n: 10 });
    wash(g, head, dark, { a: 0.8, rng: r, edge: 0.5, gran: 0, layers: 1 });
    this.eye(g, x + d * s * 0.56, y - s * 0.06, s * 0.05, { rng: r, look: [d * 0.2, 0.2], color: PAPER });
    // wings: lifted paper with a faint lavender glaze and ink veins
    for (const [wx, wy, rot] of [[x - d * s * 0.05, y - s * 0.4, -d * 0.3], [x + d * s * 0.1, y - s * 0.42, -d * 0.6]]) {
      const w = blob(wx, wy, s * 0.3, s * 0.14, { rng: r, wobble: 0.1, n: 12, rot });
      g.save(); g.globalCompositeOperation = 'destination-out'; smoothClosed(g, w); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fill(); g.restore();
      glaze(g, w, pg('lavender'), 0.2); ink(g, w, { w: s * 0.02, a: 0.5, color: pal.ink, rng: r, closed: true, broken: 0.3 });
    }
    for (let i = 0; i < 3; i++) stroke(g, [[x - d * s * 0.1 + d * i * s * 0.15, y + s * 0.2], [x - d * s * 0.1 + d * i * s * 0.15 - d * 2, y + s * 0.42]], { w: 1, a: 0.7, color: dark, rng: r });
    stroke(g, [[x + d * s * 0.55, y - s * 0.18], [x + d * s * 0.7, y - s * 0.38]], { w: 0.9, a: 0.7, color: dark, rng: r });
  },

  snail(g, x, y, s, pal, o = {}) {
    const r = R(o), d = o.dir ?? 1, shellC = mix(pg('ochre'), pg('burntSienna'), 0.45), bodyC = dilute(mix(pg('olive'), pg('ochre'), 0.5), 0.3);
    groundShadow(g, x, y, s * 0.7, s * 0.1, 0.2, pal.shadow);
    const foot = [[x - d * s * 0.6, y], [x - d * s * 0.5, y - s * 0.12], [x + d * s * 0.3, y - s * 0.16], [x + d * s * 0.62, y - s * 0.3], [x + d * s * 0.7, y - s * 0.12], [x + d * s * 0.6, y]];
    this.body(g, foot, bodyC, pal, { rng: r, fur: 0, shade: [0, 0.6], a: 0.5, w: 1 });
    const shell = blob(x - d * s * 0.1, y - s * 0.45, s * 0.42, s * 0.36, { rng: r, wobble: 0.06, n: 18 });
    wash(g, shell, shellC, { a: 0.55, rng: r, layers: 2, edge: 0.9, gran: 0.5, bloom: 0.5 });
    g.save(); smoothClosed(g, shell); g.clip(); softFill(g, shell.map((p) => [p[0], p[1] + s * 0.15]), mix(shellC, pal.shadow, 0.5), 0.35, 4); g.restore();
    // spiral
    const sp = []; for (let t = 0; t < 5.2; t += 0.25) { const rad = s * 0.05 + t * s * 0.065; sp.push([x - d * s * 0.1 + Math.cos(t * d) * rad, y - s * 0.45 + Math.sin(t * d) * rad * 0.85]); }
    ink(g, sp, { w: s * 0.03, a: 0.7, color: deepen(shellC, 0.5), rng: r, taper: [0.05, 0.05], wobble: 0.3 });
    this.outline(g, shell, pal, { rng: r, w: 1.3, a: 0.6 });
    for (const [ex, ey] of [[x + d * s * 0.5, y - s * 0.55], [x + d * s * 0.62, y - s * 0.5]]) { stroke(g, [[x + d * s * 0.5, y - s * 0.28], [ex, ey]], { w: 1.8, a: 0.7, color: bodyC, rng: r }); this.eye(g, ex, ey, s * 0.035, { rng: r, look: [d * 0.2, -0.2] }); }
    this.blush(g, x + d * s * 0.52, y - s * 0.2, s * 0.05, { rng: r });
  },

  rabbit(g, x, y, s, pal, o = {}) {
    const r = R(o), d = o.dir ?? 1, fur = o.color || dilute(mix(pg('burntUmber'), pg('ochre'), 0.4), 0.45), pink = dilute(pg('roseMadder'), 0.45);
    groundShadow(g, x, y, s * 0.5, s * 0.1, 0.2, pal.shadow);
    for (const [ex, rot] of [[x - d * s * 0.02, -d * 0.1], [x + d * s * 0.12, d * 0.25]]) { const ear = blob(ex, y - s * 0.95, s * 0.09, s * 0.3, { rng: r, wobble: 0.06, n: 12, rot }); wash(g, ear, fur, { a: 0.5, rng: r, edge: 0.8, gran: 0.2, layers: 1 }); glaze(g, blob(ex, y - s * 0.93, s * 0.045, s * 0.22, { rng: r, n: 10, rot }), pink, 0.5); this.outline(g, ear, pal, { rng: r, w: 1.1, a: 0.55 }); }
    const body = blob(x - d * s * 0.05, y - s * 0.32, s * 0.42, s * 0.32, { rng: r, wobble: 0.1, n: 18 });
    this.body(g, body, fur, pal, { rng: r, fur: 1.1, shade: [-d * 0.3, 0.6] });
    const head = blob(x + d * s * 0.15, y - s * 0.62, s * 0.26, s * 0.22, { rng: r, wobble: 0.08, n: 14 });
    this.body(g, head, fur, pal, { rng: r, fur: 0.8, shade: [-d * 0.3, 0.5] });
    whiteInk(g, x - d * s * 0.42, y - s * 0.3, s * 0.08, { n: 10, size: s * 0.02, a: 0.9, rng: r });
    this.eye(g, x + d * s * 0.22, y - s * 0.66, s * 0.05, { rng: r, look: [d * 0.3, 0.1] });
    g.save(); g.fillStyle = css(pink, 0.9); g.beginPath(); g.ellipse(x + d * s * 0.4, y - s * 0.57, s * 0.03, s * 0.025, 0, 0, TAU); g.fill(); g.restore();
    this.whiskers(g, x + d * s * 0.38, y - s * 0.55, { rng: r, dir: d, len: s * 0.22 });
    this.blush(g, x + d * s * 0.28, y - s * 0.54, s * 0.05, { rng: r });
    ink(g, [[x + d * s * 0.05, y - s * 0.05], [x + d * s * 0.35, y]], { w: s * 0.09, a: 0.5, color: fur, rng: r, taper: [0, 0.2] });
  },

  butterfly(g, x, y, s, pal, o = {}) {
    const r = R(o), c = o.color || pg('cadOrange'), c2 = o.color2 || pg('lemon'), open = o.open ?? 0.9;
    for (const d of [-1, 1]) {
      const up = blob(x + d * s * 0.3 * open, y - s * 0.22, s * 0.32 * open, s * 0.3, { rng: r, wobble: 0.08, n: 12, rot: d * 0.4 });
      const lo = blob(x + d * s * 0.22 * open, y + s * 0.18, s * 0.22 * open, s * 0.22, { rng: r, wobble: 0.08, n: 10, rot: -d * 0.3 });
      for (const [w, cc] of [[up, c], [lo, c2]]) { wash(g, w, cc, { a: 0.6, rng: r, edge: 0.9, gran: 0.2, layers: 1, bloom: 0.5 }); ink(g, w, { w: s * 0.022, a: 0.6, color: pal.ink, rng: r, closed: true, broken: 0.2 }); }
      spatter(g, x + d * s * 0.3 * open, y - s * 0.2, s * 0.2, pg('ink'), { n: 4, size: s * 0.04, a: 0.7, rng: r });
      g.save(); g.fillStyle = css(PAPER, 0.9); g.beginPath(); g.arc(x + d * s * 0.42 * open, y - s * 0.3, s * 0.045, 0, TAU); g.fill(); g.restore();
    }
    ink(g, [[x, y - s * 0.3], [x, y + s * 0.3]], { w: s * 0.07, a: 0.85, color: pg('ink'), rng: r, taper: [0.1, 0.4] });
    for (const d of [-1, 1]) stroke(g, [[x, y - s * 0.28], [x + d * s * 0.1, y - s * 0.45]], { w: 0.8, a: 0.7, color: pg('ink'), rng: r });
  },

  /** A fox sitting, alert. s = height to ear tips. */
  fox(g, x, y, s, pal, o = {}) {
    const r = R(o), d = o.dir ?? 1, fur = o.color || mix(pg('cadOrange'), pg('burntSienna'), 0.45), white = dilute(pg('ochre'), 0.85), dark = mix(pg('sepia'), pg('indigo'), 0.3);
    groundShadow(g, x, y, s * 0.5, s * 0.08, 0.22, pal.shadow);
    // tail swept round the feet, white tip
    const tail = [[x - d * s * 0.2, y - s * 0.12], [x - d * s * 0.5, y - s * 0.22], [x - d * s * 0.62, y - s * 0.08], [x - d * s * 0.4, y + s * 0.01], [x - d * s * 0.05, y - s * 0.02]];
    this.body(g, tail, fur, pal, { rng: r, fur: 1.2, shade: [0, 0.7] });
    gouache(g, blob(x - d * s * 0.58, y - s * 0.1, s * 0.09, s * 0.08, { rng: r, wobble: 0.2, n: 9 }), white, { a: 0.92, rng: r, texture: 0 });
    // body: a tall pear; white bib
    const body = [[x - d * s * 0.22, y], [x - d * s * 0.26, y - s * 0.3], [x - d * s * 0.1, y - s * 0.56], [x + d * s * 0.1, y - s * 0.58], [x + d * s * 0.2, y - s * 0.3], [x + d * s * 0.2, y]];
    this.body(g, body, fur, pal, { rng: r, fur: 1.1, shade: [-d * 0.4, 0.5] });
    gouache(g, blob(x + d * s * 0.08, y - s * 0.34, s * 0.09, s * 0.17, { rng: r, wobble: 0.2, n: 10 }), white, { a: 0.9, rng: r, texture: 0 });
    for (const fx of [x + d * s * 0.02, x + d * s * 0.16]) ink(g, [[fx, y - s * 0.2], [fx + d * s * 0.01, y - s * 0.01]], { w: s * 0.05, a: 0.8, color: dark, rng: r, taper: [0.2, 0.1] });
    // head: wide cheeks, pointed muzzle, tall ears
    const hx = x + d * s * 0.08, hy = y - s * 0.68;
    for (const e of [-1, 1]) { const ear = [[hx + e * s * 0.06, hy - s * 0.08], [hx + e * s * 0.17, hy - s * 0.32], [hx + e * s * 0.2, hy - s * 0.04]]; lineAndWash(g, ear, fur, { a: 0.6, rng: r, ink: 0.6, inkColor: pal.ink, w: Math.max(0.8, s * 0.012) }); dab(g, hx + e * s * 0.155, hy - s * 0.16, s * 0.03, s * 0.07, dark, { rng: r, a: 0.7, edge: 0.3, rot: e * 0.2 }); }
    const head = [[hx - s * 0.2, hy - s * 0.02], [hx - s * 0.12, hy - s * 0.13], [hx + s * 0.12, hy - s * 0.13], [hx + s * 0.2, hy - s * 0.02], [hx + s * 0.08, hy + s * 0.12], [hx + d * s * 0.04, hy + s * 0.2], [hx - s * 0.08, hy + s * 0.12]];
    this.body(g, head, fur, pal, { rng: r, fur: 0.9, shade: [-d * 0.3, 0.5] });
    for (const e of [-1, 1]) gouache(g, blob(hx + e * s * 0.1, hy + s * 0.06, s * 0.075, s * 0.06, { rng: r, wobble: 0.25, n: 9, rot: e * 0.5 }), white, { a: 0.9, rng: r, texture: 0 });
    for (const e of [-1, 1]) this.eye(g, hx + e * s * 0.075, hy - s * 0.02, s * 0.028, { rng: r, look: [d * 0.3, 0.1] });
    g.save(); g.fillStyle = css(pg('ink'), 0.92); g.beginPath(); g.ellipse(hx + d * s * 0.035, hy + s * 0.17, s * 0.03, s * 0.024, 0, 0, TAU); g.fill(); g.restore();
    this.whiskers(g, hx + d * s * 0.06, hy + s * 0.14, { rng: r, dir: d, len: s * 0.14, n: 2 });
  },

  /** An owl, perched. s = height. o.sleep closes the eyes. */
  owl(g, x, y, s, pal, o = {}) {
    const r = R(o), brown = o.color || mix(pg('burntUmber'), pg('ochre'), 0.4), pale = dilute(pg('ochre'), 0.7);
    const body = blob(x, y - s * 0.48, s * 0.36, s * 0.5, { rng: r, wobble: 0.06, n: 18 });
    this.body(g, body, brown, pal, { rng: r, fur: 1.2, shade: [0.4, 0.5] });
    // breast: pale with dark flecks
    const breast = blob(x, y - s * 0.33, s * 0.22, s * 0.3, { rng: r, wobble: 0.1, n: 12 });
    gouache(g, breast, pale, { a: 0.85, rng: r, texture: 0.2 });
    g.save(); smoothClosed(g, breast); g.clip(); for (let i = 0; i < 16; i++) { const px = x + (r() - 0.5) * s * 0.36, py = y - s * 0.33 + (r() - 0.5) * s * 0.5; ink(g, [[px - s * 0.02, py], [px, py + s * 0.03], [px + s * 0.02, py]], { w: Math.max(0.8, s * 0.014), a: 0.6, color: deepen(brown, 0.3), rng: r }); } g.restore();
    // wings folded, a few feather lines
    for (const e of [-1, 1]) { const wing = blob(x + e * s * 0.27, y - s * 0.42, s * 0.11, s * 0.3, { rng: r, wobble: 0.1, n: 12, rot: e * 0.12 }); wash(g, wing, deepen(brown, 0.2), { a: 0.5, rng: r, edge: 0.8, layers: 1 }); for (let i = 0; i < 3; i++) stroke(g, [[x + e * s * 0.24, y - s * 0.55 + i * s * 0.1], [x + e * s * 0.33, y - s * 0.42 + i * s * 0.1]], { w: 0.9, a: 0.45, color: pal.ink, rng: r }); }
    // face discs, eyes, beak, ear tufts
    for (const e of [-1, 1]) { const disc = blob(x + e * s * 0.12, y - s * 0.74, s * 0.13, s * 0.13, { rng: r, wobble: 0.06, n: 12 }); gouache(g, disc, pale, { a: 0.9, rng: r, texture: 0 }); ink(g, disc, { w: Math.max(0.8, s * 0.012), a: 0.45, color: pal.ink, rng: r, closed: true, broken: 0.3 });
      if (o.sleep) stroke(g, [[x + e * s * 0.06, y - s * 0.74], [x + e * s * 0.12, y - s * 0.71], [x + e * s * 0.18, y - s * 0.74]], { w: Math.max(1, s * 0.02), a: 0.8, color: pal.ink, rng: r });
      else { g.save(); g.fillStyle = css(pg('cadYellow'), 0.95); g.beginPath(); g.arc(x + e * s * 0.12, y - s * 0.74, s * 0.075, 0, TAU); g.fill(); g.restore(); this.eye(g, x + e * s * 0.12, y - s * 0.74, s * 0.045, { rng: r, look: [0, 0.1] }); }
      ink(g, [[x + e * s * 0.16, y - s * 0.88], [x + e * s * 0.27, y - s * 1.02], [x + e * s * 0.26, y - s * 0.84]], { w: s * 0.04, a: 0.75, color: deepen(brown, 0.2), rng: r, taper: [0.1, 0.1] }); }
    ink(g, [[x - s * 0.03, y - s * 0.68], [x, y - s * 0.6], [x + s * 0.03, y - s * 0.68]], { w: s * 0.03, a: 0.9, color: pg('ochre'), rng: r, closed: true });
    for (const e of [-1, 1]) for (let i = -1; i <= 1; i++) stroke(g, [[x + e * s * 0.1, y - s * 0.02], [x + e * s * 0.1 + i * s * 0.035, y + s * 0.03]], { w: Math.max(1, s * 0.018), a: 0.8, color: pg('ochre'), rng: r });
  },
};
