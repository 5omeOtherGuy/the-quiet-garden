// Vegetation by species and season: grasses, flowers, meadows, shrubs, trees, conifers, litter, extras.
import { TAU, clamp, lerp, rng as mkRng } from './rng.js';
import { fbm1, noise1 } from './noise.js';
import { css, mix, dilute, deepen, lerpRgb, PAPER, PIGMENTS } from './color.js';
import { blob, wash, glaze, granulate, softFill, lift, dryBrush, ink, stroke, scumble, spatter, smoothClosed, jitter, gouache, whiteInk, groundShadow, curve, edge, unionPath, dab, lineAndWash, bbox, scallop, contour, marks, paperFill, blot } from './brush.js';

const fallback = mkRng(9);
const R = (o) => o.rng || fallback;
const pg = (n) => PIGMENTS[n].rgb;

/** Grass tones for a season: [light, mid, dark, dry] */
function grassTones(pal) {
  const f = pal.foliage;
  if (pal.season === 'winter') return [dilute(pg('ochre'), 0.4), mix(pg('ochre'), pg('paynes'), 0.3), mix(pg('burntUmber'), pg('paynes'), 0.4), dilute(pg('rawSienna'), 0.5)];
  if (pal.season === 'autumn') return [mix(pg('ochre'), pg('lemon'), 0.4), mix(pg('olive'), pg('ochre'), 0.4), mix(pg('olive'), pg('burntUmber'), 0.4), pg('rawSienna')];
  return [mix(f[0], pg('lemon'), 0.2), f[1], f[2], mix(pg('ochre'), f[1], 0.5)];
}

const FLOWER_COLOR = {
  daisy: () => lerpRgb(PAPER, [1, 1, 1], 0.5), snowdrop: () => PAPER, poppy: () => pg('cadRed'), tulip: (pal) => (pal.blossom || pg('cadRed')),
  bluebell: () => mix(pg('cobalt'), pg('violet'), 0.45), cornflower: () => mix(pg('cobalt'), pg('ultramarine'), 0.5),
  buttercup: () => pg('cadYellow'), primrose: () => dilute(pg('lemon'), 0.2), dandelion: () => dilute(pg('cadYellow'), 0.2), thistle: () => pg('violet'),
};

export const plants = {
  /** A tuft of grass at (x, y) base, s = blade height: brushed blades, a dark root, a few pen lines. o: {rng, wind 0..1, n, tones, dry, pen (false: no pen lines)} */
  tuft(g, x, y, s, pal, o = {}) {
    const r = R(o), tones = o.tones || grassTones(pal), n = o.n ?? 5 + Math.floor(r() * 6), wind = o.wind ?? 0, pen = [];
    if (s > 14) dab(g, x, y - s * 0.04, s * 0.2, s * 0.07, mix(tones[2], pg('indigo'), 0.25), { rng: r, a: 0.4, edge: 0, n: 7 });
    for (let i = 0; i < n; i++) {
      const h = s * (0.45 + 0.65 * r()), lean = (r() - 0.5) * 1.0 + wind * 0.8, cx = x + (r() - 0.5) * s * 0.3;
      const tip = [cx + lean * h * 0.55 + wind * h * 0.3, y - h * (1 - Math.abs(lean) * 0.3)], mid = [cx + lean * h * 0.12, y - h * 0.55];
      const tone = o.dry ? tones[3] : tones[r() < 0.3 ? 0 : r() < 0.7 ? 1 : 2];
      ink(g, curve([[cx, y], mid, tip], 7), { w: s * 0.06 * (0.7 + 0.6 * r()), a: 0.78, color: tone, taper: [0, 0.75], rng: r, wobble: 0.2, steady: 0.5 });
      if (o.pen !== false && s > 12 && r() < 0.4) pen.push([cx + s * 0.02, y, mid[0] + s * 0.025, mid[1], tip[0], tip[1]]);
    }
    marks(g, pen, { w: clamp(s * 0.022, 0.6, 1.1), a: 0.45, color: pal.ink });
    if (r() < 0.25) { // a seed head
      const h = s * 1.1, lean = (r() - 0.5) * 0.6 + wind * 0.6, cx = x + (r() - 0.5) * s * 0.2;
      const pts = curve([[cx, y], [cx + lean * h * 0.2, y - h * 0.6], [cx + lean * h * 0.6, y - h]], 6);
      stroke(g, pts, { w: s * 0.03, a: 0.6, color: tones[3], rng: r });
      const e = pts[pts.length - 1];
      g.save(); g.fillStyle = css(deepen(tones[3], 0.2), 0.7); g.beginPath(); g.ellipse(e[0], e[1], s * 0.045, s * 0.14, lean * 0.6, 0, TAU); g.fill(); g.restore();
    }
  },

  /**
   * A flower. kind: daisy | poppy | bluebell | buttercup | cornflower | dandelion | thistle | tulip | primrose | snowdrop.
   * s = head size (world units). o: {rng, color, stem=true, lean}
   */
  flower(g, x, y, s, pal, o = {}) {
    const r = R(o), kind = o.kind || 'daisy', lean = o.lean ?? (r() - 0.5) * 0.5;
    const stemH = s * (o.stemK ?? 3.2), hx = x + lean * stemH * 0.3, hy = y - stemH, stemC = mix(pal.foliage[1], pal.foliage[2], 0.5);
    if (o.stem !== false) {
      ink(g, curve([[x, y], [x + lean * stemH * 0.1, y - stemH * 0.5], [hx, hy + s * 0.3]], 6), { w: Math.max(0.9, s * 0.09), a: 0.7, color: stemC, taper: [0, 0.2], rng: r, wobble: 0.25 });
      const nl = s >= 8 ? 1 + Math.floor(r() * 2.5) : r() < 0.6 ? 1 : 0;
      for (let i = 0; i < nl; i++) { // leaves on the stem: a wash, and from a certain size the pen with a midrib
        const ly = y - stemH * (0.08 + 0.4 * r()), d = i % 2 ? 1 : -1, L = s * (1.1 + 0.9 * r()), bx = x + lean * (y - ly) * 0.1;
        const lf = [[bx, ly], [bx + d * L * 0.35, ly - L * 0.42], [bx + d * L, ly - L * (0.3 + 0.3 * r())], [bx + d * L * 0.55, ly - L * 0.02]];
        wash(g, lf, mix(pal.foliage[1], pal.foliage[2], r()), { a: 0.6, rng: r, edge: 0.6, layers: 1, bloom: 0, pool: 0 });
        if (s >= 8) { ink(g, [lf[0], [bx + d * L * 0.5, ly - L * 0.25], lf[2]], { w: Math.max(0.6, s * 0.035), a: 0.5, color: pal.ink, rng: r, taper: [0.1, 0.3] }); ink(g, [lf[0], lf[1], lf[2]], { w: Math.max(0.6, s * 0.03), a: 0.4, color: pal.ink, rng: r, taper: [0.1, 0.3], broken: 0.3 }); }
      }
    }
    // open flowers are seen at an angle: the head is squashed and turned, never a face-on icon
    const flat = !['bluebell', 'thistle', 'tulip', 'foxglove', 'snowdrop'].includes(kind), sq = flat ? (o.squash ?? 0.5 + 0.45 * r()) : 1;
    g.save();
    if (flat) { g.translate(hx, hy); g.rotate(lean * 0.9 + (r() - 0.5) * 0.5); g.scale(1, sq); g.translate(-hx, -hy); }
    const petal = (cx, cy, rad, ang, len, wid, c, a, ed = 0.5) => {
      const px = cx + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad;
      const p = blob(px + Math.cos(ang) * len * 0.5, py + Math.sin(ang) * len * 0.5, len * 0.5, wid * 0.5, { rng: r, wobble: 0.15, n: 10, rot: ang });
      wash(g, p, c, { a, rng: r, edge: ed, gran: 0.15, layers: 1, jitter: 0.03 });
      if (s >= 8 && o.ink !== false) ink(g, p, { w: Math.max(0.7, s * 0.04), a: 0.4, color: pal.ink, rng: r, closed: true, broken: 0.4, wobble: 0.3 });
      return p;
    };
    switch (kind) {
      case 'daisy': {
        const n = 9 + Math.floor(r() * 4);
        for (let i = 0; i < n; i++) { const a = (i / n) * TAU + r() * 0.3; const p = blob(hx + Math.cos(a) * s * 0.55, hy + Math.sin(a) * s * 0.55, s * 0.5, s * 0.17, { rng: r, wobble: 0.12, n: 9, rot: a }); gouache(g, p, lerpRgb(PAPER, [1, 1, 1], 0.5), { a: 0.9, rng: r, texture: 0 }); glaze(g, p, pg('lavender'), 0.12 * r()); if (s >= 8 && o.ink !== false && i % 2 === 0) ink(g, p, { w: Math.max(0.6, s * 0.03), a: 0.35, color: pal.ink, rng: r, closed: true, broken: 0.5, wobble: 0.3 }); }
        wash(g, blob(hx, hy, s * 0.3, s * 0.26, { rng: r, wobble: 0.1 }), pg('cadYellow'), { a: 0.75, rng: r, edge: 1, gran: 0.3, dark: pg('ochre') });
        break;
      }
      case 'poppy': {
        const c = o.color || pg('cadRed');
        for (let i = 0; i < 4; i++) petal(hx, hy, s * 0.2, (i / 4) * TAU + 0.6 + r() * 0.4, s * 0.9, s * 0.8, c, 0.55, 0.9);
        glaze(g, blob(hx, hy, s * 0.5, s * 0.4, { rng: r }), pg('alizarin'), 0.25);
        g.save(); g.fillStyle = css(pg('indigo'), 0.85); g.beginPath(); g.arc(hx, hy, s * 0.16, 0, TAU); g.fill(); g.restore();
        spatter(g, hx, hy, s * 0.35, pg('indigo'), { n: 6, size: s * 0.05, a: 0.7, rng: r });
        break;
      }
      case 'bluebell': {
        const c = o.color || mix(pg('cobalt'), pg('violet'), 0.45);
        for (let i = 0; i < 4; i++) { const t = i / 4, bx = hx + (t - 0.5) * s * 0.3 + i * s * 0.25, by = hy + s * 0.3 + t * s * 1.6; const p = blob(bx, by, s * 0.22, s * 0.32, { rng: r, wobble: 0.12, n: 8 }); wash(g, p, c, { a: 0.55, rng: r, edge: 0.8, gran: 0.3, layers: 1 }); ink(g, [[bx - s * 0.2, by + s * 0.3], [bx, by + s * 0.42], [bx + s * 0.2, by + s * 0.3]], { w: s * 0.06, a: 0.5, color: deepen(c, 0.3), rng: r }); }
        break;
      }
      case 'buttercup': {
        for (let i = 0; i < 5; i++) petal(hx, hy, s * 0.2, (i / 5) * TAU + r() * 0.3, s * 0.55, s * 0.5, pg('cadYellow'), 0.65, 0.8);
        glaze(g, blob(hx, hy, s * 0.2, s * 0.2, { rng: r }), pg('ochre'), 0.5);
        break;
      }
      case 'cornflower': {
        const c = o.color || mix(pg('cobalt'), pg('ultramarine'), 0.5);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + r() * 0.3; ink(g, [[hx + Math.cos(a) * s * 0.15, hy + Math.sin(a) * s * 0.15], [hx + Math.cos(a) * s * 0.75, hy + Math.sin(a) * s * 0.75]], { w: s * 0.3, a: 0.6, color: c, taper: [0.1, 0.1], rng: r, pressure: (t) => 0.5 + t }); }
        glaze(g, blob(hx, hy, s * 0.22, s * 0.22, { rng: r }), pg('violet'), 0.6);
        break;
      }
      case 'dandelion': {
        whiteInk(g, hx, hy, s * 0.7, { n: 26, size: 0.9, a: 0.75, rng: r, color: dilute(pg('ochre'), 0.6) });
        g.save(); g.strokeStyle = css(dilute(pg('ochre'), 0.4), 0.5); g.lineWidth = 0.6;
        for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU + r() * 0.2; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + Math.cos(a) * s * 0.65, hy + Math.sin(a) * s * 0.65); g.stroke(); }
        g.restore();
        break;
      }
      case 'thistle': {
        wash(g, blob(hx, hy + s * 0.3, s * 0.3, s * 0.4, { rng: r, wobble: 0.15 }), mix(pg('olive'), pg('burntUmber'), 0.4), { a: 0.55, rng: r, edge: 0.8, gran: 0.4, layers: 1 });
        for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 1.6; ink(g, [[hx, hy], [hx + Math.cos(a) * s * 0.7, hy + Math.sin(a) * s * 0.7]], { w: s * 0.07, a: 0.7, color: o.color || pg('violet'), taper: [0, 0.3], rng: r }); }
        break;
      }
      case 'tulip': {
        const c = o.color || pg('cadRed');
        const p = [[hx - s * 0.5, hy - s * 0.5], [hx - s * 0.45, hy + s * 0.4], [hx, hy + s * 0.6], [hx + s * 0.45, hy + s * 0.4], [hx + s * 0.5, hy - s * 0.5], [hx + s * 0.2, hy - s * 0.25], [hx, hy - s * 0.55], [hx - s * 0.2, hy - s * 0.25]];
        wash(g, p, c, { a: 0.55, rng: r, edge: 0.9, gran: 0.2, layers: 2, jitter: 0.02 });
        ink(g, [[hx, hy + s * 0.5], [hx - s * 0.05, hy - s * 0.1], [hx + s * 0.1, hy - s * 0.4]], { w: s * 0.05, a: 0.35, color: deepen(c, 0.4), rng: r });
        break;
      }
      case 'primrose': {
        for (let i = 0; i < 5; i++) petal(hx, hy, s * 0.15, (i / 5) * TAU + r() * 0.2, s * 0.55, s * 0.55, dilute(pg('lemon'), 0.25), 0.7, 0.6);
        glaze(g, blob(hx, hy, s * 0.18, s * 0.18, { rng: r }), pg('cadOrange'), 0.55);
        break;
      }
      case 'foxglove': {
        const c = o.color || mix(pg('roseMadder'), pg('violet'), 0.35), n = 6 + Math.floor(r() * 4), side = r.sign();
        for (let i = 0; i < n; i++) { const t = i / n, by = hy + t * stemH * 0.55, bx = hx + (x - hx) * t * 0.55 + side * s * (0.25 + 0.2 * t), bs = s * (0.28 + 0.3 * t);
          const p = blob(bx, by, bs * 0.55, bs * 0.8, { rng: r, wobble: 0.12, n: 8, rot: side * 0.5 }); wash(g, p, c, { a: 0.6, rng: r, edge: 0.9, layers: 1 });
          dab(g, bx + side * bs * 0.15, by + bs * 0.5, bs * 0.25, bs * 0.15, PAPER, { rng: r, a: 0.7, edge: 0, n: 6 });
          if (s >= 7) ink(g, [[bx - bs * 0.4, by + bs * 0.6], [bx + side * bs * 0.1, by + bs * 0.85], [bx + bs * 0.45, by + bs * 0.6]], { w: Math.max(0.7, s * 0.05), a: 0.45, color: pal.ink, rng: r }); }
        break;
      }
      case 'snowdrop': {
        const bx = hx + s * 0.3, by = hy + s * 0.5;
        ink(g, [[hx, hy + s * 0.2], [hx + s * 0.2, hy + s * 0.15], [bx, by - s * 0.3]], { w: s * 0.06, a: 0.6, color: stemC, rng: r });
        for (let i = -1; i <= 1; i++) { const p = blob(bx + i * s * 0.18, by + s * 0.15, s * 0.14, s * 0.4, { rng: r, wobble: 0.1, n: 8, rot: i * 0.35 }); gouache(g, p, PAPER, { a: 0.9, rng: r, texture: 0 }); glaze(g, p, pg('lavender'), 0.15); }
        glaze(g, blob(bx, by - s * 0.2, s * 0.1, s * 0.1, { rng: r }), pg('sap'), 0.6);
        break;
      }
    }
    g.restore();
  },

  /** Flower kinds that bloom in a season, weighted. */
  seasonFlowers(season) {
    return {
      spring: [['daisy', 3], ['bluebell', 3], ['primrose', 2], ['tulip', 1.5], ['dandelion', 1], ['snowdrop', 1]],
      summer: [['poppy', 3], ['daisy', 3], ['cornflower', 2.5], ['buttercup', 3], ['dandelion', 1]],
      autumn: [['thistle', 2], ['dandelion', 2], ['daisy', 0.6]],
      winter: [['thistle', 1]],
    }[season] || [];
  },

  /**
   * Grass and flowers along x0..x1 standing on yOf(x). Grass grows in clumps with pen ticks between them; most
   * flowers are suggested (drifts of small dabs of one colour); only a few, in front, are drawn properly, and small.
   * o: {rng, density=1, s=28 blade height, flowers=1, wind, depth (0 far..1 near: scales size and detail),
   *   kinds (override), drawn (drawn flowers per 1000 units), ticks=1}
   */
  meadow(g, x0, x1, yOf, pal, o = {}) {
    const r = R(o), depth = o.depth ?? 1, s = (o.s ?? 28) * lerp(0.35, 1, depth), density = o.density ?? 1, wind = o.wind ?? 0;
    const tones = grassTones(pal), kinds = o.kinds || this.seasonFlowers(pal.season), tot = kinds.reduce((a, k) => a + k[1], 0), W = x1 - x0;
    const pickKind = () => { let q = r() * tot; for (const k of kinds) { q -= k[1]; if (q <= 0) return k[0]; } return kinds[0][0]; };
    const items = [];
    // pen ticks: the grass between the tufts, just suggested
    const ticks = [], nt = Math.floor((W / 9) * density * (o.ticks ?? 1));
    for (let i = 0; i < nt; i++) { const x = x0 + r() * W, y = yOf(x) + (r() - 0.6) * s * 0.9, h = s * (0.12 + 0.16 * r()), ln = (r() - 0.5) * h + wind * h; ticks.push([x, y, x + ln * 0.3, y - h * 0.6, x + ln, y - h]); if (r() < 0.5) ticks.push([x + h * 0.25, y, x + h * 0.3 + ln * 0.4, y - h * 0.5, x + h * 0.5 + ln, y - h * 0.8]); }
    marks(g, ticks, { w: clamp(s * 0.03, 0.6, 1.1), a: 0.4, color: mix(tones[2], pal.ink, 0.45) });
    // grass grows in clumps; every tuft has its own size
    const n = Math.floor((W / s) * 1.5 * density), clumps = []; for (let i = 0; i < Math.max(2, n / 5); i++) clumps.push(x0 + r() * W);
    for (let i = 0; i < n; i++) { const x = r() < 0.75 ? clamp(clumps[Math.floor(r() * clumps.length)] + r.gauss() * s * 1.4, x0, x1) : x0 + r() * W; items.push({ x, y: yOf(x) + (r() - 0.5) * s * 0.4, kind: 'tuft', s: s * (0.4 + 0.5 * r() + 0.8 * r() * r()) }); }
    const fk = (o.flowers ?? 1) * (pal.season === 'winter' ? 0.12 : 1) * (kinds.length ? 1 : 0);
    // drifts of dabs
    const drifts = Math.floor((W / s) * 0.22 * density * fk);
    for (let i = 0; i < drifts; i++) { const kind = pickKind(), cx = x0 + r() * W, m = 4 + Math.floor(r() * 10); for (let j = 0; j < m; j++) { const x = clamp(cx + r.gauss() * s * 1.5, x0, x1); items.push({ x, y: yOf(x) + (r() - 0.5) * s * 0.6, kind: 'dab', flower: kind, s: s * (0.08 + 0.1 * r()) }); } }
    // the few drawn ones
    const drawn = fk ? Math.floor((o.drawn ?? (depth > 0.7 ? 5 : depth > 0.45 ? 1.5 : 0)) * W / 1000 * Math.min(1.5, fk)) : 0;
    for (let i = 0; i < drawn; i++) { const x = x0 + r() * W; items.push({ x, y: yOf(x) + (r() - 0.3) * s * 0.4, kind: pickKind(), s: clamp(s * (0.2 + 0.16 * r()), 5, 15) }); }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.kind === 'tuft') this.tuft(g, it.x, it.y, it.s, pal, { rng: r, tones, wind, dry: pal.season === 'winter' && r() < 0.7 });
      else if (it.kind === 'dab') {
        const c = (FLOWER_COLOR[it.flower] || (() => pal.accent))(pal), h = s * (0.3 + 0.6 * r()), white = it.flower === 'daisy' || it.flower === 'snowdrop';
        if (r() < 0.7) stroke(g, [[it.x, it.y], [it.x + (r() - 0.5) * 3 + wind * 4, it.y - h]], { w: Math.max(0.6, s * 0.025), a: 0.55, color: tones[2], rng: r });
        const rx = it.s * (0.8 + 0.5 * r()), ry = it.s * (0.45 + 0.4 * r());
        dab(g, it.x + wind * 4, it.y - h, rx, ry, c, { rng: r, a: white ? 0.95 : 0.8, rot: (r() - 0.5) * 1.2, edge: white ? 0.5 : 0.9 });
        if (white && it.s > 2) dab(g, it.x + wind * 4, it.y - h, it.s * 0.3, it.s * 0.22, pg('cadYellow'), { rng: r, a: 0.9, edge: 0.5, n: 6 });
        if (it.flower === 'poppy' && it.s > 2) dab(g, it.x + wind * 4, it.y - h, it.s * 0.25, it.s * 0.18, pg('indigo'), { rng: r, a: 0.8, edge: 0, n: 6 });
      } else this.flower(g, it.x, it.y, it.s, pal, { rng: r, kind: it.kind, lean: (r() - 0.5) * 0.7 + wind * 0.6, stemK: 2.6 + 2 * r() });
    }
  },

  /** A foliage mass. o: {rng, tones (4), shade [dx,dy] shadow direction, marks=1, holes=true, blossom, snow} */
  canopy(g, cx, cy, rx, ry, pal, o = {}) {
    const r = R(o), T = o.tones || pal.foliage, sh = o.shade || [0.45, 0.55];
    // the mass is a handful of overlapping leaf clusters, lit from the side opposite `shade`
    const k = 5 + Math.floor(rx / 22), clusters = [];
    for (let i = 0; i < k; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.62;
      clusters.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, rx: rx * (0.32 + 0.22 * r()), ry: ry * (0.3 + 0.22 * r()) });
    }
    clusters.push({ x: cx, y: cy, rx: rx * 0.55, ry: ry * 0.55 });
    clusters.sort((p, q) => p.y - q.y);
    const polys = clusters.map((c) => blob(c.x, c.y, c.rx, c.ry, { rng: r, wobble: 0.28, n: 12 + Math.floor(c.rx / 5), freq: 2.8 }));
    const sil = blob(cx, cy, rx, ry, { rng: r, wobble: 0.22, n: 18 + Math.floor(rx / 6), freq: 2.6 });
    const union = unionPath(polys);
    // 1. a wet underwash that softens the whole mass
    softFill(g, sil, T[1], 0.28, 8);
    // 2. each cluster is its own wash; tone follows the light
    for (let i = 0; i < polys.length; i++) {
      const c = clusters[i], lit = -((c.x - cx) / rx * sh[0] + (c.y - cy) / ry * sh[1]); // +1 lit side .. -1 shade
      const tone = lit > 0.25 ? mix(T[0], T[1], 0.5) : lit > -0.2 ? T[1] : lit > -0.5 ? T[2] : T[3];
      wash(g, polys[i], tone, { a: 0.36 + 0.1 * (lit < 0 ? 1 : 0), rng: r, layers: 2, edge: 0.7, gran: 0.3, jitter: 0.06, mottle: 0.2, bloom: lit > 0 ? 0.5 : 0 });
    }
    // 3. the shadowed underside and core, wet-in-wet, plus the sunlit crown
    g.save(); g.clip(union);
    for (let i = 0; i < 3 + Math.floor(rx / 30); i++) {
      const px = cx + sh[0] * rx * 0.35 + (r() - 0.5) * rx * 0.8, py = cy + sh[1] * ry * 0.4 + (r() - 0.5) * ry * 0.6;
      softFill(g, blob(px, py, rx * (0.2 + 0.2 * r()), ry * (0.16 + 0.18 * r()), { rng: r, wobble: 0.3 }), r() < 0.5 ? T[3] : T[2], 0.32, 5);
    }
    softFill(g, sil.map((p) => [p[0] + sh[0] * rx * 0.25, p[1] + sh[1] * ry * 0.45]), deepen(T[3], 0.2), 0.22, 10);
    // sunlit crown: a broad soft warm glaze, then many small leaf-sized lifts and lemon flecks
    softFill(g, blob(cx - sh[0] * rx * 0.35, cy - sh[1] * ry * 0.4, rx * 0.55, ry * 0.45, { rng: r, wobble: 0.3 }), mix(T[0], pg('lemon'), 0.4), 0.28, 12);
    for (let i = 0; i < 5 + Math.floor(rx / 16); i++) {
      const px = cx - sh[0] * rx * 0.4 + (r() - 0.5) * rx * 0.9, py = cy - sh[1] * ry * 0.45 + (r() - 0.5) * ry * 0.7;
      if (r() < 0.5) lift(g, px, py, rx * (0.03 + 0.05 * r()), ry * (0.025 + 0.04 * r()), { a: 0.22, rng: r, wobble: 0.4 });
      else softFill(g, blob(px, py, rx * (0.04 + 0.07 * r()), ry * (0.03 + 0.06 * r()), { rng: r, wobble: 0.3, n: 8 }), mix(T[0], pg('lemon'), 0.45), 0.3, 2);
    }
    granulate(g, sil, 0.2);
    // sky holes
    if (o.holes !== false) for (let i = 0; i < 2 + Math.floor(rx / 45); i++) lift(g, cx + (r() - 0.5) * rx * 1.1, cy + (r() - 0.5) * ry, rx * 0.05 + r() * rx * 0.06, ry * 0.04 + r() * ry * 0.05, { a: 0.9, rng: r, wobble: 0.45 });
    g.restore();
    // 4. leaf marks along cluster edges: dark ticks in the shade, pale flecks in the light
    const marks = Math.floor(rx * (o.marks ?? 1) * 0.5);
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < marks; i++) {
      const pl = polys[Math.floor(r() * polys.length)], p = pl[Math.floor(r() * pl.length)], c = clusters[polys.indexOf(pl)];
      const lit = -((p[0] - cx) / rx * sh[0] + (p[1] - cy) / ry * sh[1]);
      const dark = lit < 0.1 || r() < 0.3, ang = Math.atan2(p[1] - c.y, p[0] - c.x) + (r() - 0.5) * 1.4, L = 2.5 + r() * 4;
      g.strokeStyle = css(dark ? deepen(T[3], 0.25) : mix(T[0], pg('lemon'), 0.3), dark ? 0.6 : 0.85); g.lineWidth = 0.9 + r() * 1.3;
      const px = p[0] + (r() - 0.5) * 4, py = p[1] + (r() - 0.5) * 4;
      g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + Math.cos(ang) * L * 0.5 + (r() - 0.5) * 2, py + Math.sin(ang) * L * 0.5, px + Math.cos(ang) * L, py + Math.sin(ang) * L); g.stroke();
    }
    g.restore();
    if (o.blossom) for (let i = 0; i < rx * 0.6 * o.blossom; i++) { const a = r() * TAU, d = Math.sqrt(r()); g.save(); g.fillStyle = css(r() < 0.5 ? dilute(pal.blossom, 0.5) : PAPER, 0.85); g.beginPath(); g.arc(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 1.5 + r() * 2, 0, TAU); g.fill(); g.restore(); }
    if (o.fruit) for (let i = 0; i < rx * 0.08; i++) { const a = r() * TAU, d = Math.sqrt(r()); const p = blob(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 3 + r() * 2, 3 + r() * 2, { rng: r, n: 8 }); wash(g, p, o.fruit === true ? pg('cadRed') : o.fruit, { a: 0.7, rng: r, edge: 0.6, gran: 0, layers: 1 }); }
    if (o.snow) this.snowOnCanopy(g, sil, pal, { rng: r, k: o.snow });
    return sil;
  },

  snowOnCanopy(g, sil, pal, o = {}) {
    const r = R(o), k = o.k ?? 1;
    for (const p of sil) if (r() < 0.6) { const pp = blob(p[0], p[1] - 2, 6 + 10 * r(), 3 + 3 * r(), { rng: r, wobble: 0.3, n: 8 }); gouache(g, pp, PAPER, { a: 0.8 * k, rng: r, texture: 0 }); glaze(g, pp, pal.snowShade, 0.2); }
  },

  /** A leaf mark: one small pointed leaf, two curves of the brush. */
  leaf(g, x, y, ang, len, color, a = 0.8) {
    const c = Math.cos(ang), s = Math.sin(ang), w = len * 0.32;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + c * len * 0.5 - s * w, y + s * len * 0.5 + c * w, x + c * len, y + s * len);
    g.quadraticCurveTo(x + c * len * 0.5 + s * w, y + s * len * 0.5 - c * w, x, y);
    g.fillStyle = css(color, a); g.fill();
  },

  /**
   * Branches by rule: each limb wanders and tapers; children are 0.6-0.72 of the parent in length and width and leave
   * at alternating sides. Thick limbs are a wash with an ink line on the shadow side; twigs are a single line.
   * Returns tips [{x, y, depth, L, a}]. o: {rng, w, depth, maxDepth=3, spread=.7, color, inkColor, snow, droop, droopFrom (depth)}
   */
  branches(g, x, y, ang, L, pal, o = {}, tips = []) {
    const r = R(o), depth = o.depth ?? 0, w = o.w ?? Math.max(1.2, L * 0.085), c = o.color || pal.trunk, maxDepth = o.maxDepth ?? 3;
    const n = 4 + Math.floor(L / 30), pts = [[x, y]]; let a = ang, cx = x, cy = y;
    for (let i = 1; i <= n; i++) {
      a += (r() - 0.5) * 0.5; if (o.droop && depth >= (o.droopFrom ?? 0)) a += 0.09 * o.droop * (Math.cos(a) >= 0 ? 1 : -1); else if (depth >= 2) a += (-Math.PI / 2 - a) * 0.07;
      cx += Math.cos(a) * (L / n); cy += Math.sin(a) * (L / n); pts.push([cx, cy]);
    }
    const ends = !(depth < maxDepth && L > 12), tp = ends ? [0, 0.85] : [0, 0], pr = ends ? undefined : (t) => 1 - 0.32 * t;
    if (w > 3) {
      ink(g, pts, { w, a: 0.95, color: mix(c, PAPER, 0.3), taper: tp, pressure: pr, steady: 0.7, rng: r, wobble: 0.3 });
      ink(g, pts, { w: w * 0.9, a: 0.5, color: c, taper: tp, pressure: pr, steady: 0.7, rng: r, wobble: 0.3 });
      ink(g, pts.map((p, i) => [p[0] + w * 0.36 * (1 - 0.3 * i / n), p[1] + w * 0.26 * (1 - 0.3 * i / n)]), { w: Math.max(0.9, w * 0.24), a: 0.8, color: o.inkColor || pal.ink, taper: [0.03, ends ? 0.6 : 0.03], rng: r, wobble: 0.5, broken: 0.15 });
      if (w > 4) ink(g, pts.map((p, i) => [p[0] - w * 0.44 * (1 - 0.3 * i / n), p[1] - w * 0.3 * (1 - 0.3 * i / n)]), { w: 0.9, a: 0.55, color: o.inkColor || pal.ink, taper: [0.03, ends ? 0.6 : 0.03], rng: r, wobble: 0.5, broken: 0.4 });
    } else ink(g, pts, { w: Math.max(0.8, w), a: 0.8, color: o.inkColor ? mix(c, o.inkColor, 0.6) : mix(c, pal.ink, 0.6), taper: tp, pressure: pr, steady: 0.5, rng: r, wobble: 0.4 });
    if (o.snow) { // snow lies along the upper side of the flatter limbs: a white line with the dark limb left showing below
      g.save(); g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[i + 1], horiz = Math.abs(q[0] - p[0]) / (Math.hypot(q[0] - p[0], q[1] - p[1]) || 1);
        if (horiz < 0.4 || r() < 0.3) continue;
        const t = i / n, up = w * (1 - 0.6 * t) * 0.5 + 0.8, lw = Math.max(1.2, w * (1 - 0.6 * t) * 0.5 + 1);
        g.strokeStyle = css(pal.snowShade, 0.55 * o.snow); g.lineWidth = lw; g.beginPath(); g.moveTo(p[0], p[1] - up + 0.9); g.lineTo(q[0], q[1] - up + 0.9); g.stroke();
        g.strokeStyle = css(PAPER, 0.97 * o.snow); g.lineWidth = lw; g.beginPath(); g.moveTo(p[0], p[1] - up); g.lineTo(q[0], q[1] - up); g.stroke();
      }
      g.restore();
    }
    tips.push({ x: cx, y: cy, depth, L, a });
    if (depth < maxDepth && L > 12) {
      const k = depth === 0 ? 3 : 2;
      for (let i = 0; i < k; i++) {
        const last = i === k - 1, at = last ? pts[n] : pts[Math.max(1, Math.floor(n * (0.35 + 0.45 * r())))], side = i % 2 ? 1 : -1;
        const a2 = last ? a + (r() - 0.5) * 0.4 : a + side * (o.spread ?? 0.7) * (0.7 + 0.5 * r());
        this.branches(g, at[0], at[1], a2, L * (last ? 0.72 : 0.6) * (0.85 + 0.3 * r()), pal, { ...o, depth: depth + 1, w: w * (last ? 0.66 : 0.5) }, tips);
      }
    }
    return tips;
  },

  /**
   * A leaf clump: the unit a crown is built from. Bare paper, a light wash slipped away from the light (a white rim
   * stays on the lit side), a hard-edged shade on the underside, a deeper touch below, and the pen round its bumps.
   * o: {rng, tones, light [dx,dy], lit 0..1 (how much light this clump gets), bump, w, ink}
   */
  clump(g, x, y, rx, ry, pal, o = {}) {
    const r = R(o), T = o.tones || pal.foliage, lt = o.light || [-0.5, -0.8], lit = o.lit ?? 0.5, small = Math.min(rx, ry);
    const bump = o.bump ?? clamp(small * 0.5, 3, 16), penC = o.ink || pal.ink;
    const p = scallop(x, y, rx, ry, { rng: r, bump, depth: 0.6, wobble: 0.22, rot: (r() - 0.5) * 0.6 });
    paperFill(g, p);
    const base = lit > 0.62 ? mix(T[0], pg('lemon'), 0.35) : lit > 0.3 ? mix(T[0], T[1], 0.4) : mix(T[1], T[2], 0.3);
    const cool = mix(lit > 0.45 ? T[1] : T[2], pg('cobalt'), 0.12), deep = mix(T[3], pg('ultramarine'), 0.2);
    // the light wash slips a little away from the light: a thin rim of white paper stays on the lit side
    const slip = clamp(small * (0.03 + 0.07 * r()), 0.6, 2.6) * (r() < 0.2 ? 2 : 1);
    const lw = p.map((q) => [q[0] - lt[0] * slip, q[1] - lt[1] * slip]); lw.sharp = true;
    g.save(); smoothClosed(g, p); g.clip();
    wash(g, lw, base, { a: 0.66, rng: r, vary: lit > 0.5 ? T[1] : cool, varyAngle: Math.atan2(-lt[1], -lt[0]) + (r() - 0.5) * 0.8, layers: 1, edge: 0.5, bloom: 0.25 + lit * 0.5, pool: 0.5 });
    // the underside: usually one hard, leafy-edged glaze, sometimes only a soft drop of colour
    const k1 = 0.34 + 0.3 * r();
    let s1 = null;
    if (r() < 0.8 || small < 8) { s1 = scallop(x - lt[0] * rx * k1, y - lt[1] * ry * (k1 + 0.12), rx * 1.04, ry * 0.98, { rng: r, bump: bump * (0.6 + 0.4 * r()), depth: 0.65, wobble: 0.26 }); wash(g, s1, cool, { a: 0.5, rng: r, layers: 1, edge: 0.7, bloom: 0, pool: 0, multiply: true }); }
    else blot(g, x - lt[0] * rx * 0.5, y - lt[1] * ry * 0.6, rx * 0.9, ry * 0.7, cool, 0.5, 0);
    if (lit < 0.85 && small > 6 && r() < 0.8) { const k2 = k1 + 0.36 + 0.2 * r(); const s2 = scallop(x - lt[0] * rx * k2, y - lt[1] * ry * (k2 + 0.1), rx * 0.95, ry * 0.8, { rng: r, bump: bump * 0.7, depth: 0.65, wobble: 0.26 }); wash(g, s2, deep, { a: 0.5, rng: r, layers: 1, edge: 0.7, bloom: 0, pool: 0, multiply: true, gran: 0.3 }); }
    if (small > 7) {
      // the pen picks out part of the shade's leafy edge, and scribbles a few leaves into the light
      if (s1) for (const arc of s1.arcs) if (r() < 0.4) { const m = arc[arc.length >> 1]; if (Math.hypot((m[0] - x) / rx, (m[1] - y) / ry) < 0.8) ink(g, arc, { w: (o.w ?? 1.1) * 0.8, a: 0.42, color: penC, rng: r, taper: [0.15, 0.3], wobble: 0.4 }); }
      const sc = [], n = 2 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.6, px = x + Math.cos(a) * rx * d + lt[0] * rx * 0.2, py = y + Math.sin(a) * ry * d + lt[1] * ry * 0.2, q = bump * (0.3 + 0.3 * r()); sc.push([px - q, py, px - q * 0.2, py + q * 0.9, px + q, py - q * 0.1]); if (r() < 0.5) sc.push([px + q, py - q * 0.1, px + q * 1.6, py + q * 0.7, px + q * 2.2, py - q * 0.2]); }
      marks(g, sc, { w: (o.w ?? 1.1) * 0.7, a: 0.4, color: mix(deep, penC, 0.5) });
      // leaves dabbed in along the turn from light to shade, and a few bright ones in the light
      const nl = Math.floor(3 + small * 0.25);
      for (let i = 0; i < nl; i++) { const u = (r() - 0.5) * 1.7, px = x + u * rx * 0.8 - lt[0] * rx * (k1 - 0.5) * 0.5, py = y - lt[1] * ry * (k1 - 0.45) + (r() - 0.5) * ry * 0.3 - Math.abs(u) * ry * 0.1; this.leaf(g, px, py, r() * TAU, bump * (0.35 + 0.3 * r()), r() < 0.7 ? cool : deep, 0.5); }
      for (let i = 0; i < nl * 0.5; i++) this.leaf(g, x + (r() - 0.5) * rx * 1.2 + lt[0] * rx * 0.25, y + lt[1] * ry * 0.45 + (r() - 0.5) * ry * 0.5, r() * TAU, bump * (0.3 + 0.3 * r()), mix(T[0], pg('lemon'), 0.5), 0.55);
    }
    g.restore();
    contour(g, p, { rng: r, w: o.w ?? clamp(small * 0.05, 0.9, 1.6), a: 0.78, color: penC, heavy: [-lt[0], -lt[1]], broken: 0.3, light: 0.4 });
    return p;
  },

  /**
   * A crown of leaf clumps hung on the branch tips: big ones in the middle, smaller toward the outside, painted from
   * the top down so every clump's lit top sits against the shaded underside of the one above. Gaps between clumps
   * are the sky holes; the limbs show through them.
   * o: {rng, s (tree height), tones, light [dx,dy], keep 0..1 (thin the crown), massK, style: 'clump'|'spray'|'weep'}
   * Returns the clump polygons.
   */
  crown(g, tips, pal, o = {}) {
    const r = R(o), T = o.tones || pal.foliage, lt = o.light || [-0.5, -0.8], s = o.s ?? 200, keep = o.keep ?? 1, mk = o.massK ?? 1, style = o.style || 'clump';
    const src = tips.filter((t) => t.depth >= 1);
    if (!src.length) return [];
    let cx = 0, cy = 0; for (const t of src) { cx += t.x; cy += t.y; } cx /= src.length; cy /= src.length;
    let rad = 1; for (const t of src) rad = Math.max(rad, Math.hypot(t.x - cx, t.y - cy));
    const litOf = (x, y) => clamp(0.5 + 0.55 * (((x - cx) / rad) * lt[0] + ((y - cy) / rad) * lt[1]) / (Math.hypot(lt[0], lt[1]) || 1), 0, 1);
    const polys = [];
    if (style === 'spray' || style === 'weep') {
      // airy crowns (birch, willow): a pale wash behind, then sprays of single leaves along the twigs
      for (const t of src) {
        if (t.depth < 2 || r() > keep) continue;
        const n = style === 'weep' ? 3 : 2;
        for (let k = 0; k < n; k++) {
          const len = s * (style === 'weep' ? 0.2 + 0.2 * r() : 0.07 + 0.08 * r()), sway = (r() - 0.5) * s * 0.06;
          const twig = curve([[t.x + (r() - 0.5) * 6, t.y], [t.x + sway * 0.4 + Math.cos(t.a) * len * 0.3, t.y + len * 0.4], [t.x + sway, t.y + len]], 8);
          stroke(g, twig, { w: 0.8, a: 0.55, color: pal.ink, rng: r });
          for (let i = 1; i < twig.length; i++) for (let j = 0; j < 2; j++) {
            if (r() > 0.8) continue;
            const q = twig[i], lit = litOf(q[0], q[1]), tone = r() < lit ? mix(T[0], pg('lemon'), 0.3) : r() < 0.6 ? T[1] : T[2];
            this.leaf(g, q[0], q[1], Math.PI / 2 + (j ? 1 : -1) * (0.5 + 0.6 * r()), s * (0.014 + 0.012 * r()), tone, 0.85);
          }
        }
        polys.push(blob(t.x, t.y + s * 0.05, s * 0.07, s * 0.08, { rng: r, n: 8 }));
      }
      return polys;
    }
    const clumps = [];
    // the far side of the crown, seen between the clumps: dark, simple
    if (keep > 0.8) for (let i = 0; i < 2 + (s > 150 ? 2 : 0); i++) clumps.push({ x: cx + (r() - 0.5) * rad * 0.9, y: cy + (r() - 0.35) * rad * 0.6, rx: s * (0.13 + 0.06 * r()) * mk, ry: s * (0.1 + 0.04 * r()) * mk, core: 1 });
    for (const t of src) {
      if (r() > keep * (t.depth >= 3 ? 0.55 : t.depth === 2 ? 0.85 : 1)) continue;
      const k = (t.depth === 1 ? 1.35 : t.depth === 2 ? 1.1 : 0.8) * (0.75 + 0.6 * r());
      clumps.push({ x: t.x + (r() - 0.5) * s * 0.04, y: t.y - s * 0.015 + (r() - 0.5) * s * 0.04, rx: s * 0.11 * k * mk, ry: s * 0.08 * k * mk * (0.85 + 0.3 * r()), core: 0 });
    }
    clumps.sort((p, q) => q.core - p.core || p.y - q.y);
    for (const m of clumps) polys.push(this.clump(g, m.x, m.y, m.rx, m.ry, pal, { rng: r, tones: T, light: lt, lit: m.core ? 0.05 : litOf(m.x, m.y), bump: clamp(s * 0.03, 3, 15) * (0.8 + 0.5 * r()), w: clamp(s * 0.0036, 0.85, 1.6) }));
    // a few loose leaves off the silhouette
    for (let i = 0; i < clumps.length * 1.5; i++) {
      const m = clumps[Math.floor(r() * clumps.length)], a = r() * TAU, px = m.x + Math.cos(a) * m.rx * 1.05, py = m.y + Math.sin(a) * m.ry * 1.05;
      if (Math.hypot(px - cx, py - cy) < rad * 0.75) continue;
      this.leaf(g, px, py, a + (r() - 0.5), s * (0.014 + 0.012 * r()), r() < 0.5 ? T[1] : T[2], 0.8);
    }
    return polys;
  },

  /**
   * A tree standing at (x, y) with height s: flared trunk in line and wash, limbs by rule, a crown of leaf clumps.
   * o: {rng, kind: round|tall|apple|birch|willow, bare 0..1 (override season), snow, blossom, fruit, trunk, light [dx,dy]}
   */
  tree(g, x, y, s, pal, o = {}) {
    const r = R(o), kind = o.kind || 'round', bare = o.bare ?? pal.bare, snow = o.snow ?? (pal.snowK > 0.5 ? pal.snowK : 0), lt = o.light || [-0.5, -0.8];
    const trunkH = s * ({ tall: 0.4, apple: 0.26, birch: 0.46, willow: 0.34 }[kind] ?? 0.33), tw = s * ({ birch: 0.036, tall: 0.05, apple: 0.07 }[kind] ?? 0.08);
    const birch = kind === 'birch', trunkC = birch ? dilute(mix(pg('paynes'), pg('ochre'), 0.4), 0.82) : o.trunk || pal.trunk;
    const lean = (r() - 0.5) * 0.16, penW = clamp(s * 0.0045, 0.9, 1.9);
    groundShadow(g, x + s * 0.12, y + 1, s * 0.42, s * 0.05, 0.22, pal.shadow);
    const top = [x + lean * trunkH, y - trunkH];
    const line = curve([[x, y + 2], [x + lean * trunkH * 0.1 + (r() - 0.5) * tw * 1.2, y - trunkH * 0.45], top], 10);
    const Lp = [], Rp = [];
    for (let i = 0; i < line.length; i++) { const t = i / (line.length - 1), wd = tw * (1 - 0.4 * t) * (1 + 1.5 * Math.pow(1 - t, 5)) * (0.95 + 0.1 * r()); Lp.push([line[i][0] - wd * 0.5, line[i][1]]); Rp.push([line[i][0] + wd * 0.5, line[i][1]]); }
    const poly = Lp.concat(Rp.slice().reverse());
    lineAndWash(g, poly, trunkC, { a: birch ? 0.3 : 0.62, rng: r, vary: birch ? undefined : mix(trunkC, pg('ochre'), 0.4), shade: [0.75, 0], shadeColor: birch ? pg('lavender') : undefined, ink: 0, offset: 0.02, light: [-1, 0], bloom: 0.2 });
    // bark: pen strokes that follow the trunk, thick on the shadow side
    const bark = [];
    g.save(); smoothClosed(g, poly); g.clip();
    if (birch) for (let i = 0; i < 10; i++) { const k = 1 + Math.floor(r() * (line.length - 2)), p = line[k], wd = tw * 0.5; ink(g, [[p[0] - wd + r() * wd * 0.6, p[1] + (r() - 0.5) * 4], [p[0] + wd * (r() - 0.2), p[1] + (r() - 0.5) * 5]], { w: 1.5 + r() * 2.5, a: 0.8, color: pg('sepia'), rng: r, wobble: 0.3, taper: [0.1, 0.5] }); }
    else for (let i = 0; i < 10 + s / 30; i++) { const t = r(), k = Math.min(line.length - 2, Math.floor(t * (line.length - 1))), p = line[k], q = line[k + 1], side = r() < 0.65 ? 0.1 + 0.4 * r() : -0.45 * r(), L = s * (0.012 + 0.03 * r()), ox = side * tw * (1 + 1.2 * Math.pow(1 - t, 5)); bark.push([p[0] + ox, p[1], p[0] + ox + (r() - 0.5) * 1.5, p[1] - L * 0.5, p[0] + ox + (q[0] - p[0]) * 0.3, p[1] - L]); }
    marks(g, bark, { w: penW * 0.7, a: 0.5, color: pal.ink });
    g.restore();
    ink(g, Lp, { w: penW, a: 0.6, color: pal.ink, rng: r, wobble: 0.6, broken: 0.3, taper: [0.05, 0.1] });
    ink(g, Rp, { w: penW * 1.5, a: 0.8, color: pal.ink, rng: r, wobble: 0.6, broken: 0.12, taper: [0.05, 0.1] });
    for (const d of [-1, 1]) ink(g, curve([[x + d * tw * 0.75, y - trunkH * 0.04], [x + d * tw * 1.25, y], [x + d * tw * (1.7 + r()), y + 2 + r() * 2]], 5), { w: penW, a: 0.7, color: pal.ink, rng: r, taper: [0.1, 0.7] });
    // limbs
    const tips = [], mainN = kind === 'tall' ? 2 : 3, spread = kind === 'tall' ? 0.3 : kind === 'willow' ? 0.95 : birch ? 0.42 : 0.72;
    const twigs = bare > 0.5 ? 4 : 3;
    const bo = { rng: r, spread: kind === 'tall' ? 0.36 : birch ? 0.55 : 0.75, maxDepth: s < 90 ? Math.min(twigs, 2) : s < 180 ? Math.min(twigs, 3) : twigs, color: birch ? mix(trunkC, pg('sepia'), 0.4) : trunkC, inkColor: pal.ink, snow: bare > 0.5 ? snow : 0, droop: kind === 'willow' ? 1 : birch ? 0.4 : 0, droopFrom: birch ? 2 : 0 };
    for (let i = 0; i < mainN; i++) {
      const a = -Math.PI / 2 + (i - (mainN - 1) / 2) * spread * (0.85 + 0.3 * r()) + lean;
      this.branches(g, top[0], top[1] + tw * 0.4, a, s * (kind === 'tall' ? 0.36 : 0.3) * (0.85 + 0.3 * r()), pal, { ...bo, w: tw * (kind === 'willow' ? 0.45 : 0.58) }, tips);
    }
    if ((kind === 'round' || kind === 'tall') && s > 120) { const p = line[6], d = r.sign(); this.branches(g, p[0], p[1], -Math.PI / 2 + d * (kind === 'tall' ? 0.7 : 1.15), s * 0.24, pal, { ...bo, w: tw * 0.4, maxDepth: bo.maxDepth - 1 }, tips); }
    if (bare < 0.95) {
      const polys = this.crown(g, tips, pal, { rng: r, s, light: lt, keep: 1 - bare * 0.8, massK: kind === 'tall' ? 0.8 : kind === 'apple' ? 1.1 : 1, style: birch ? 'spray' : kind === 'willow' ? 'weep' : 'clump' });
      const blossom = o.blossom ?? (pal.season === 'spring' && kind === 'apple' ? 1 : 0), fruit = o.fruit ?? (pal.season === 'autumn' && kind === 'apple');
      for (const pl of polys) {
        const b = bbox(pl);
        if (blossom) for (let k = 0; k < 6 * blossom; k++) dab(g, b.cx + (r() - 0.5) * b.w * 0.85, b.cy + (r() - 0.5) * b.h * 0.85, s * (0.008 + 0.008 * r()), s * (0.007 + 0.007 * r()), r() < 0.5 ? dilute(pal.blossom, 0.5) : PAPER, { rng: r, a: 0.95, edge: 0.5, n: 6 });
        if (fruit && r() < 0.6) { const fx = b.cx + (r() - 0.5) * b.w * 0.6, fy = b.cy + (r() - 0.2) * b.h * 0.6, fs = Math.max(2, s * 0.014); dab(g, fx, fy, fs, fs, fruit === true ? pg('cadRed') : fruit, { rng: r, a: 0.9, edge: 0.8, n: 7 }); }
        if (snow && b.cy < top[1]) this.snowOnCanopy(g, pl.filter((p) => p[1] < b.cy), pal, { rng: r, k: snow });
      }
      if (pal.season === 'autumn' && !snow) this.litter(g, x - s * 0.45, y - 6, s * 0.9, 14, pal, { rng: r, n: Math.floor(s * 0.12) });
    }
    return { top, tips };
  },

  /** A conifer (fir) at (x, y), height s: tiers of drooping boughs in line and wash. o: {rng, snow, tiers, light} */
  conifer(g, x, y, s, pal, o = {}) {
    const r = R(o), T = pal.foliage, snow = o.snow ?? (pal.snowK > 0.5 ? pal.snowK : 0), tiers = o.tiers ?? 5 + Math.floor(s / 70), lt = o.light || [-0.5, -0.8];
    const dark = mix(T[3], pg('viridian'), 0.35), mid = mix(T[2], pg('viridian'), 0.35), penW = clamp(s * 0.005, 0.9, 1.7), lean = (r() - 0.5) * 0.06;
    groundShadow(g, x + s * 0.08, y, s * 0.3, s * 0.04, 0.22, pal.shadow);
    const tw = s * 0.035;
    lineAndWash(g, [[x - tw, y], [x - tw * 0.7, y - s * 0.2], [x + tw * 0.7, y - s * 0.2], [x + tw, y]], pal.trunk, { a: 0.6, rng: r, shade: [0.7, 0], w: penW, inkColor: pal.ink, light: [-1, 0] });
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers, ax = x + lean * s * (0.14 + 0.8 * t), ty = y - s * (0.14 + 0.8 * t), hw = s * 0.3 * (1 - t * 0.84) + 3, th = s * (0.3 * (1 - t * 0.5));
      const nz = Math.max(3, Math.round(hw / Math.max(5, s * 0.03))), pts = [[ax + (r() - 0.5) * 2, ty - th * 0.42]], zig = [];
      for (let k = 0; k <= nz * 2; k++) { const u = k / (nz * 2) * 2 - 1, down = k % 2 === 0; zig.push([ax + u * hw * (0.92 + 0.16 * r()), ty + th * (0.28 + 0.2 * Math.abs(u)) + (down ? th * (0.12 + 0.1 * r()) : -th * 0.04)]); }
      pts.push([ax - hw * 0.45, ty + th * 0.02]); for (const q of zig) pts.push(q); pts.push([ax + hw * 0.45, ty + th * 0.02]);
      pts.sharp = true;
      lineAndWash(g, pts, mid, { a: 0.72, rng: r, vary: mix(mid, pg('lemon'), 0.25), shade: [0.55, 0.55], shadeColor: dark, ink: 0, offset: 0.05, light: lt, bloom: 0.3 });
      if (snow) { const cap = [[ax, ty - th * 0.44], [ax - hw * 0.5, ty + th * 0.02], [ax - hw * 0.8, ty + th * 0.26], [ax - hw * 0.3, ty + th * 0.22], [ax, ty + th * 0.3], [ax + hw * 0.35, ty + th * 0.2], [ax + hw * 0.75, ty + th * 0.26], [ax + hw * 0.5, ty + th * 0.02]]; paperFill(g, cap, 0.95 * snow); g.save(); smoothClosed(g, cap); g.clip(); blot(g, ax + hw * 0.3, ty + th * 0.2, hw * 0.6, th * 0.2, pal.snowShade, 0.5); g.restore(); }
      // the pen: each bough tip its own flick, a few needle strokes inside
      for (let k = 0; k + 2 < zig.length; k += 2) if (r() < 0.85) ink(g, [zig[k + 1], zig[k + 2].map((v, j) => v + (j ? 1 : 0)), zig[Math.min(zig.length - 1, k + 3)]], { w: penW * (zig[k + 2][0] > ax ? 1.2 : 0.8), a: 0.75, color: pal.ink, rng: r, taper: [0.2, 0.3], wobble: 0.4 });
      ink(g, [pts[0], pts[1], zig[0]], { w: penW * 0.8, a: 0.55, color: pal.ink, rng: r, broken: 0.3, taper: [0.1, 0.2] });
      ink(g, [pts[0], pts[pts.length - 1], zig[zig.length - 1]], { w: penW * 1.2, a: 0.75, color: pal.ink, rng: r, broken: 0.15, taper: [0.1, 0.2] });
      const nd = []; for (let k = 0; k < 3 + hw / 8; k++) { const u = (r() - 0.5) * 1.5, px = ax + u * hw * 0.8, py = ty + th * (0.05 + 0.25 * r()); nd.push([px, py, px + u * hw * 0.12, py + th * 0.12]); }
      marks(g, nd, { w: penW * 0.7, a: 0.4, color: mix(dark, pal.ink, 0.5) });
    }
  },

  /** A shrub / bush: a few stems and a low crown. o: {rng, berries, bare} */
  shrub(g, x, y, s, pal, o = {}) {
    const r = R(o), bare = o.bare ?? pal.bare, tips = [];
    groundShadow(g, x, y, s * 0.6, s * 0.1, 0.18, pal.shadow);
    for (let i = 0; i < 4; i++) this.branches(g, x + (r() - 0.5) * s * 0.3, y, -Math.PI / 2 + (i - 1.5) * 0.5 + (r() - 0.5) * 0.3, s * 0.42, pal, { rng: r, w: Math.max(1.5, s * 0.035), maxDepth: bare > 0.6 ? 3 : 1, snow: bare > 0.6 ? pal.snowK : 0 }, tips);
    if (bare > 0.6) return;
    const polys = this.crown(g, tips.map((t) => ({ ...t, depth: Math.max(1, t.depth) })), pal, { rng: r, s: s * 1.5 });
    if (o.berries) for (const pl of polys) { const b = bbox(pl); for (let k = 0; k < 3; k++) dab(g, b.cx + (r() - 0.5) * b.w * 0.7, b.cy + (r() - 0.5) * b.h * 0.7, s * 0.03, s * 0.03, pg('cadRed'), { rng: r, a: 0.85, edge: 0.8, n: 6 }); }
    if (pal.snowK > 0.5) for (const pl of polys) this.snowOnCanopy(g, pl.filter((p, i) => i % 2 === 0), pal, { rng: r, k: pal.snowK });
  },

  /** Fallen leaves over a band. o: {rng, n, tones} */
  litter(g, x, y, w, h, pal, o = {}) {
    const r = R(o), n = o.n ?? Math.floor(w * h / 200), T = o.tones || [pg('ochre'), pg('burntSienna'), pg('cadOrange'), mix(pg('alizarin'), pg('burntUmber'), 0.5), pg('olive')];
    for (let i = 0; i < n; i++) {
      const px = x + r() * w, py = y + r() * h, L = 4 + r() * 6, a = r() * TAU, c = T[Math.floor(r() * T.length)];
      const p = blob(px, py, L, L * 0.45, { rng: r, wobble: 0.2, n: 8, rot: a });
      wash(g, p, c, { a: 0.6, rng: r, edge: 0.7, gran: 0.2, layers: 1 });
      ink(g, [[px - Math.cos(a) * L * 0.8, py - Math.sin(a) * L * 0.8], [px + Math.cos(a) * L * 0.9, py + Math.sin(a) * L * 0.9]], { w: 0.7, a: 0.4, color: deepen(c, 0.5), rng: r });
    }
  },

  /** A mushroom. o: {rng, color, spots} */
  mushroom(g, x, y, s, pal, o = {}) {
    const r = R(o), c = o.color || pg('cadRed');
    const stem = [[x - s * 0.14, y], [x - s * 0.1, y - s * 0.55], [x + s * 0.1, y - s * 0.55], [x + s * 0.16, y]];
    gouache(g, stem, dilute(pg('ochre'), 0.7), { a: 0.9, rng: r, texture: 0.2 }); glaze(g, stem.map((p) => [p[0] + s * 0.06, p[1]]), pal.shadow, 0.15);
    const cap = blob(x, y - s * 0.62, s * 0.5, s * 0.28, { rng: r, wobble: 0.1, n: 14 });
    for (const p of cap) if (p[1] > y - s * 0.6) p[1] = y - s * 0.6 + (p[1] - (y - s * 0.6)) * 0.3;
    wash(g, cap, c, { a: 0.65, rng: r, edge: 0.9, gran: 0.3, layers: 2, bloom: 0.4 });
    if (o.spots !== false) whiteInk(g, x, y - s * 0.66, s * 0.4, { n: 7, size: s * 0.045, a: 0.9, rng: r });
    ink(g, cap.slice(0, Math.floor(cap.length * 0.5)), { w: 1, a: 0.45, color: pal.ink, broken: 0.4, rng: r });
  },

  /** A fern frond from (x,y) rising to height s, leaning dir. */
  fern(g, x, y, s, pal, o = {}) {
    const r = R(o), dir = o.dir ?? r.sign(), c = o.color || mix(pal.foliage[1], pg('viridian'), 0.3);
    const spine = curve([[x, y], [x + dir * s * 0.3, y - s * 0.7], [x + dir * s * 0.75, y - s * 0.9]], 14);
    stroke(g, spine, { w: 1.4, a: 0.7, color: deepen(c, 0.3), rng: r });
    for (let i = 2; i < spine.length - 1; i++) {
      const t = i / spine.length, L = s * 0.22 * Math.sin(t * Math.PI) + 2, p = spine[i], q = spine[i + 1];
      const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
      for (const side of [-1, 1]) ink(g, [[p[0], p[1]], [p[0] + Math.cos(ang + side * 1.2) * L, p[1] + Math.sin(ang + side * 1.2) * L]], { w: 2.4, a: 0.55, color: c, taper: [0, 0.6], rng: r });
    }
  },

  /** Reeds at a water's edge. o: {rng, n, heads} */
  reeds(g, x, y, s, pal, o = {}) {
    const r = R(o), n = o.n ?? 6;
    for (let i = 0; i < n; i++) {
      const bx = x + (r() - 0.5) * s * 0.5, h = s * (0.7 + 0.5 * r()), lean = (r() - 0.5) * 0.5 + (o.wind ?? 0) * 0.5;
      const pts = curve([[bx, y], [bx + lean * h * 0.2, y - h * 0.55], [bx + lean * h * 0.7, y - h]], 8);
      ink(g, pts, { w: s * 0.03, a: 0.75, color: mix(pal.foliage[2], pg('olive'), 0.5), taper: [0, 0.3], rng: r });
      if (o.heads !== false && r() < 0.5) { const e = pts[pts.length - 2]; const p = blob(e[0], e[1], s * 0.035, s * 0.12, { rng: r, wobble: 0.1, n: 8, rot: lean * 0.5 }); wash(g, p, pg('burntUmber'), { a: 0.75, rng: r, edge: 0.6, gran: 0.2, layers: 1 }); }
    }
  },
};
