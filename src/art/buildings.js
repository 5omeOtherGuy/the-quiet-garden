// Buildings and made things: cottages, fences, bridges, lamp posts, signposts. Wobbly ink over washes.
import { TAU, clamp, lerp, rng as mkRng } from './rng.js';
import { fbm1 } from './noise.js';
import { css, mix, dilute, deepen, lerpRgb, PAPER, PIGMENTS } from './color.js';
import { blob, wash, glaze, granulate, softFill, lift, dryBrush, ink, stroke, scumble, smoothClosed, jitter, hatch, gouache, glow, groundShadow, whiteInk, curve, lineAndWash, sketch, marks, contour, paperFill, blot, dab, resample } from './brush.js';

const fallback = mkRng(17);
const R = (o) => o.rng || fallback;
const pg = (n) => PIGMENTS[n].rgb;
const wob = (r, pts, k = 2) => pts.map((p) => [p[0] + (r() - 0.5) * k, p[1] + (r() - 0.5) * k]);

export const buildings = {
  /**
   * A cottage standing on y, centred at x, width w, wall height h, in line and wash: limewashed walls with a few
   * stones showing, a thatch (or tile, slate) roof drawn stroke by stroke, a plank door with a step, shuttered
   * windows with flower boxes, a brick chimney, a climbing rose, a water butt and pots by the door.
   * o: {rng, roof: 'thatch'|'tile'|'slate', lit (windows glow), smoke, wallColor, door: 'left'|'right'|'mid', windows=2, snow, ivy, light [dx,dy]}
   */
  cottage(g, x, y, w, h, pal, o = {}) {
    const r = R(o), wallC = o.wallColor || dilute(mix(pg('ochre'), pg('roseMadder'), 0.25), 0.72), roofKind = o.roof || 'thatch', snow = o.snow ?? 0;
    const roofC = roofKind === 'thatch' ? mix(pg('ochre'), pg('burntUmber'), 0.4) : roofKind === 'tile' ? mix(pg('burntSienna'), pg('cadRed'), 0.3) : mix(pg('paynes'), pg('indigo'), 0.3);
    const x0 = x - w / 2, x1 = x + w / 2, ry = y - h, peak = ry - w * 0.4, over = w * 0.07, pen = clamp(w * 0.009, 0.8, 1.8), inkC = pal.ink, k = w / 150;
    const sharp = (pts) => { pts.sharp = true; return pts; };
    groundShadow(g, x + w * 0.16, y + 1, w * 0.62, h * 0.1, 0.24, pal.shadow);
    // walls
    const walls = sharp(wob(r, [[x0, y], [x0 + 1, ry - 4], [x1 - 1, ry - 4], [x1, y]], 2 * k));
    lineAndWash(g, walls, wallC, { a: 0.4, rng: r, vary: dilute(pg('ochre'), 0.5), shade: [0.85, 0], shadeColor: mix(wallC, pal.shadow, 0.5), ink: 0, offset: 0.02, bloom: 0.5 });
    g.save(); smoothClosed(g, walls); g.clip();
    // the eave casts a shadow with a wobbly lower edge
    const eave = [[x0 - 5, ry - 8]]; for (let i = 0; i <= 10; i++) eave.push([x0 - 5 + ((w + 10) * i) / 10, ry + h * (0.13 + 0.05 * Math.sin(i * 1.7 + 1)) + (r() - 0.5) * 2 * k]); eave.push([x1 + 5, ry - 8]);
    wash(g, eave.reverse(), mix(pg('lavender'), pal.shadow, 0.4), { a: 0.32, rng: r, layers: 1, edge: 0.6, bloom: 0, pool: 0, multiply: true });
    // stones where the limewash has worn: drawn one by one near the corners and the foot
    for (let i = 0; i < 9; i++) { const sx = r() < 0.5 ? x0 + r() * w * 0.16 : r() < 0.5 ? x1 - r() * w * 0.16 : x0 + r() * w, sy = y - r() * r() * h * 0.8, st = blob(sx, sy, (4 + 4 * r()) * k, (2.4 + 2 * r()) * k, { rng: r, wobble: 0.2, n: 8 }); wash(g, st, mix(pal.rock, pg('ochre'), 0.3 * r()), { a: 0.4, rng: r, layers: 1, edge: 0.6, bloom: 0, pool: 0 }); contour(g, st, { rng: r, w: pen * 0.7, a: 0.5, color: inkC, broken: 0.3 }); }
    g.restore();
    sketch(g, walls, { rng: r, w: pen, a: 0.7, color: inkC, skip: [1], over: 2 * k });
    // door
    const dx = o.door === 'left' ? x0 + w * 0.24 : o.door === 'right' ? x1 - w * 0.24 : x, dw = w * 0.13, dh = h * 0.66, doorC = o.doorColor || mix(pg('viridian'), pg('cobalt'), 0.35);
    const door = [[dx - dw / 2, y], [dx - dw / 2, y - dh * 0.78]].concat(curve([[dx - dw / 2, y - dh * 0.78], [dx, y - dh * 1.08], [dx + dw / 2, y - dh * 0.78]], 6), [[dx + dw / 2, y]]); door.sharp = true;
    lineAndWash(g, door, doorC, { a: 0.62, rng: r, shade: [0.7, 0], ink: 0.8, w: pen, inkColor: inkC, offset: 0.03, bloom: 0.2, broken: 0.05 });
    const dm = []; for (let i = 1; i < 4; i++) { const px = dx - dw / 2 + (dw * i) / 4; dm.push([px, y - 1, px + (r() - 0.5) * 0.6, y - dh * (0.82 + (i === 2 ? 0.14 : 0.07))]); } dm.push([dx - dw * 0.42, y - dh * 0.3, dx + dw * 0.42, y - dh * 0.3 - 0.6], [dx - dw * 0.42, y - dh * 0.68, dx + dw * 0.42, y - dh * 0.68 + 0.5]);
    marks(g, dm, { w: pen * 0.6, a: 0.5, color: inkC });
    g.save(); g.fillStyle = css(pg('ochre'), 0.95); g.beginPath(); g.arc(dx + dw * 0.3, y - dh * 0.46, 1.3 * k, 0, TAU); g.fill(); g.restore();
    const step = sharp([[dx - dw * 0.8, y + 3 * k], [dx - dw * 0.7, y - 1.5 * k], [dx + dw * 0.7, y - 1.5 * k], [dx + dw * 0.8, y + 3 * k]]);
    lineAndWash(g, step, pal.rock, { a: 0.45, rng: r, w: pen * 0.8, inkColor: inkC, offset: 0.02 });
    // windows
    const nW = o.windows ?? 2, lit = o.lit ?? (pal.time === 'night' || pal.time === 'dusk');
    for (let i = 0; i < nW; i++) {
      const side = nW === 1 ? 0 : i / (nW - 1) - 0.5; let wx = x + side * w * 0.56; if (Math.abs(wx - dx) < dw * 1.6) wx += (wx < dx ? -1 : 1) * w * 0.12;
      const wy = y - h * 0.56, ww = w * 0.13, wh = h * 0.3;
      if (Math.abs(wx - dx) < dw) continue;
      const win = sharp([[wx - ww / 2, wy - wh / 2], [wx + ww / 2, wy - wh / 2], [wx + ww / 2, wy + wh / 2], [wx - ww / 2, wy + wh / 2]]);
      if (lit) { glow(g, wx, wy, ww * 2.2, pal.lampGlow, 0.45); gouache(g, win, pal.lamp, { a: 0.97, rng: r, texture: 0 }); glaze(g, [[wx - ww / 2, wy - wh / 2], [wx + ww / 2, wy - wh / 2], [wx + ww / 2, wy]], pg('cadOrange'), 0.3); }
      else { paperFill(g, win); wash(g, win, mix(pal.skyTop, pg('paynes'), 0.45), { a: 0.6, rng: r, layers: 1, edge: 0.7, bloom: 0.8, pool: 0.4, vary: pg('indigo') }); }
      sketch(g, win, { rng: r, w: pen, a: 0.8, color: inkC, over: k });
      marks(g, [[wx, wy - wh / 2, wx + 0.4, wy + wh / 2], [wx - ww / 2, wy, wx + ww / 2, wy + 0.4]], { w: pen * 0.8, a: 0.7, color: inkC });
      // shutters, sill, flower box
      for (const d of [-1, 1]) { const sx = wx + d * (ww * 0.5 + ww * 0.24), sh = sharp([[sx - ww * 0.2, wy - wh * 0.52], [sx + ww * 0.2, wy - wh * 0.5], [sx + ww * 0.2, wy + wh * 0.5], [sx - ww * 0.2, wy + wh * 0.52]]); lineAndWash(g, sh, doorC, { a: 0.55, rng: r, ink: 0.7, w: pen * 0.8, inkColor: inkC, offset: 0.03, bloom: 0 }); marks(g, [[sx - ww * 0.14, wy - wh * 0.2, sx + ww * 0.14, wy - wh * 0.2], [sx - ww * 0.14, wy + wh * 0.2, sx + ww * 0.14, wy + wh * 0.2]], { w: pen * 0.6, a: 0.45, color: inkC }); }
      const box = sharp([[wx - ww * 0.62, wy + wh / 2 + 1 * k], [wx + ww * 0.62, wy + wh / 2 + 1 * k], [wx + ww * 0.56, wy + wh / 2 + 6 * k], [wx - ww * 0.56, wy + wh / 2 + 6 * k]]);
      lineAndWash(g, box, mix(pal.trunk, pg('ochre'), 0.4), { a: 0.6, rng: r, w: pen * 0.8, inkColor: inkC, offset: 0.02, bloom: 0 });
      if (pal.season !== 'winter') for (let q = 0; q < 9; q++) { const fx = wx - ww * 0.55 + ww * 1.1 * r(), fy = wy + wh / 2 - 1 * k - r() * 5 * k; dab(g, fx, fy, (1.6 + r()) * k, (1.4 + r()) * k, q % 3 === 0 ? pal.foliage[1] : q % 3 === 1 ? pal.blossom : pg('cadRed'), { rng: r, a: 0.85, edge: 0.6, n: 6 }); }
      else if (snow) dab(g, wx, wy + wh / 2, ww * 0.6, 2 * k, PAPER, { rng: r, a: 0.95, edge: 0 });
    }
    // roof
    const eaveY = (u) => ry + 5 * k + Math.sin(u * 9 + 1) * 1.6 * k, roof = [];
    roof.push([x0 - over, eaveY(0)], [x0 + w * 0.13, peak + 3 * k], [x - w * 0.02, peak - 1.5 * k], [x1 - w * 0.13, peak + 2 * k], [x1 + over, eaveY(1)]);
    for (let i = 9; i >= 1; i--) roof.push([x0 - over + ((w + over * 2) * i) / 10, eaveY(i / 10) + 4 * k + (r() - 0.5) * 1.5 * k]);
    roof.sharp = true;
    lineAndWash(g, roof, snow > 0.5 ? dilute(pal.snowShade, 0.5) : roofC, { a: snow > 0.5 ? 0.35 : 0.62, rng: r, vary: snow > 0.5 ? undefined : mix(roofC, pg('cadYellow'), 0.3), shade: [0.7, 0.15], shadeColor: snow > 0.5 ? pal.snowShade : mix(roofC, pal.shadow, 0.45), ink: 0, offset: 0.02, bloom: 0.4 });
    g.save(); smoothClosed(g, roof); g.clip();
    const strokes = [], rh = ry - peak;
    if (snow > 0.5) { for (let i = 0; i < 12; i++) { const u = r(), v = 0.75 + 0.25 * r(), sx = x0 - over + u * (w + over * 2), sy = peak + rh * v; strokes.push([sx, sy, sx + (u - 0.5) * 3 * k, sy + 6 * k]); } marks(g, strokes, { w: pen * 0.7, a: 0.35, color: mix(roofC, inkC, 0.4) }); }
    else if (roofKind === 'thatch') {
      for (let i = 0; i < w * 1.3; i++) { const u = r(), v = Math.pow(r(), 0.7), sx = lerp(x0 + w * 0.13, x0 - over, v) + u * lerp(w * 0.74, w + over * 2, v), sy = peak + rh * v + 4 * k, L = (5 + 8 * r()) * k, dxs = (u - 0.5) * 0.5 * L; strokes.push([sx, sy, sx + dxs, sy + L]); }
      marks(g, strokes.slice(0, strokes.length >> 1), { w: pen * 0.6, a: 0.42, color: mix(roofC, inkC, 0.6) });
      marks(g, strokes.slice(strokes.length >> 1), { w: pen * 1.1, a: 0.3, color: mix(roofC, pg('cadYellow'), 0.5) });
      // the ridge: a band of pegged, scalloped thatch
      const band = []; for (let i = 0; i <= 12; i++) { const u = i / 12; band.push([x0 + w * 0.12 + u * w * 0.76, peak + rh * 0.2 + (i % 2 ? 3.5 : -1) * k]); }
      ink(g, band, { w: pen, a: 0.6, color: inkC, rng: r, wobble: 0.3, taper: [0.03, 0.03] });
      for (let i = 0; i < 2; i++) dryBrush(g, [[x0 - over, ry - rh * (0.1 + 0.3 * i)], [x1 + over, ry - rh * (0.12 + 0.3 * i) + 2]], deepen(roofC, 0.35), { w: 3 * k, a: 0.2, n: 3, rng: r });
    } else {
      const rows = Math.max(3, Math.floor(rh / (8 * k)));
      for (let i = 1; i <= rows; i++) { const yy = peak + (i * rh) / rows + 3 * k; strokes.push([x0 - over, yy, x, yy + (r() - 0.5) * 2, x1 + over, yy + (r() - 0.5) * 2]); for (let q = 0; q < w / (9 * k); q++) if (r() < 0.75) { const sx = x0 - over + r() * (w + over * 2); strokes.push([sx, yy - rh / rows, sx + (r() - 0.5), yy]); } }
      marks(g, strokes, { w: pen * 0.6, a: 0.42, color: mix(roofC, inkC, 0.6) });
    }
    g.restore();
    if (snow > 0.5) { const cap = sharp([[x0 - over + 2, eaveY(0) - 4 * k], [x0 + w * 0.13, peak + 1 * k], [x - w * 0.02, peak - 4 * k], [x1 - w * 0.13, peak], [x1 + over - 2, eaveY(1) - 4 * k], [x + w * 0.2, ry - rh * 0.2], [x - w * 0.1, ry - rh * 0.12], [x - w * 0.3, ry - rh * 0.2]]); cap.sharp = false; paperFill(g, cap, 0.96 * snow); g.save(); smoothClosed(g, cap); g.clip(); blot(g, x + w * 0.25, ry - rh * 0.3, w * 0.3, rh * 0.3, pal.snowShade, 0.5); g.restore(); }
    sketch(g, roof.slice(0, 5), { rng: r, w: pen * 1.15, a: 0.8, color: inkC, closed: false, over: 2.5 * k });
    ink(g, roof.slice(4), { w: pen * 1.3, a: 0.8, color: inkC, rng: r, wobble: 0.6, broken: 0.12, taper: [0.04, 0.04] });
    // chimney: brick, with a pot
    const chx = x + w * 0.26, chb = peak + rh * 0.32, cht = peak - h * 0.22, cw = w * 0.05;
    const chim = sharp([[chx - cw, chb], [chx - cw, cht], [chx + cw, cht], [chx + cw, chb - cw * 0.5]]);
    lineAndWash(g, chim, snow > 0.5 ? mix(pg('burntSienna'), pal.snowShade, 0.3) : mix(pg('burntSienna'), pg('ochre'), 0.3), { a: 0.6, rng: r, shade: [0.8, 0], ink: 0, offset: 0.03, bloom: 0.2 });
    const bricks = []; for (let yy = cht + 3 * k; yy < chb - 2 * k; yy += 3.4 * k) { bricks.push([chx - cw, yy, chx + cw, yy + (r() - 0.5) * 0.6]); const offx = (Math.round(yy) % 2 ? -0.4 : 0.3) * cw; bricks.push([chx + offx, yy, chx + offx, yy + 3.4 * k]); }
    marks(g, bricks, { w: pen * 0.5, a: 0.42, color: inkC });
    sketch(g, chim, { rng: r, w: pen, a: 0.75, color: inkC, skip: [3], over: 1.5 * k });
    const pot = sharp([[chx - cw * 0.5, cht], [chx - cw * 0.4, cht - 5 * k], [chx + cw * 0.4, cht - 5 * k], [chx + cw * 0.5, cht]]);
    lineAndWash(g, pot, snow > 0.5 ? PAPER : pg('burntSienna'), { a: 0.7, rng: r, w: pen * 0.8, inkColor: inkC, offset: 0.02, bloom: 0 });
    if (o.smoke) { // smoke: pale puffs rising and thinning, with a loose pencil curl
      let sx = chx, sy = cht - 9 * k; const curl = [[sx, sy + 3 * k]];
      for (let i = 0; i < 6; i++) { const rr = (5 + i * 3.4) * k; sx += (2 + 5 * r() + i * 1.5) * k; sy -= (9 + i * 2.5) * k; blot(g, sx, sy, rr * 1.5, rr, lerpRgb(PAPER, [1, 1, 1], 0.5), 0.7 - i * 0.09, -0.4); blot(g, sx + rr * 0.3, sy + rr * 0.35, rr, rr * 0.5, pg('lavender'), 0.16, -0.4); curl.push([sx + (i % 2 ? rr : -rr) * 0.7, sy + rr * 0.2]); }
      ink(g, curl, { w: pen * 0.7, a: 0.3, color: mix(inkC, pg('lavender'), 0.5), rng: r, wobble: 0.6, broken: 0.35, taper: [0.1, 0.5] });
    }
    // a climbing rose round the door side, a water butt, pots
    if (o.ivy && pal.season !== 'winter') {
      const stem = [[x0 + 3 * k, y], [x0 + 6 * k, y - h * 0.4], [x0 + 2 * k, y - h * 0.75], [x0 + 12 * k, ry - 2 * k], [x0 + w * 0.22, ry + 3 * k]];
      ink(g, stem, { w: pen * 1.1, a: 0.7, color: mix(pal.trunk, inkC, 0.4), rng: r, wobble: 0.8, taper: [0.02, 0.5] });
      for (const q of resample(stem, 5 * k)) { for (let j = 0; j < 2; j++) dab(g, q[0] + (r() - 0.5) * 9 * k, q[1] + (r() - 0.5) * 7 * k, (2.2 + 2 * r()) * k, (1.6 + 1.2 * r()) * k, pal.foliage[1 + Math.floor(r() * 3)], { rng: r, a: 0.8, edge: 0.7, rot: r() * 3, n: 6 }); if (r() < 0.4) dab(g, q[0] + (r() - 0.5) * 9 * k, q[1] + (r() - 0.5) * 7 * k, 2.2 * k, 2 * k, r() < 0.5 ? pal.blossom : dilute(pg('roseMadder'), 0.2), { rng: r, a: 0.9, edge: 0.9, n: 7 }); }
    }
    const bx = (dx < x ? dx + dw * 1.5 : dx - dw * 1.5), butt = sharp([[bx - 6 * k, y + 1], [bx - 7 * k, y - 8 * k], [bx - 5.5 * k, y - 15 * k], [bx + 5.5 * k, y - 15 * k], [bx + 7 * k, y - 8 * k], [bx + 6 * k, y + 1]]);
    lineAndWash(g, butt, mix(pal.trunk, pg('ochre'), 0.3), { a: 0.6, rng: r, shade: [0.7, 0], w: pen * 0.9, inkColor: inkC, offset: 0.03, bloom: 0.2 });
    marks(g, [[bx - 6.8 * k, y - 4.5 * k, bx, y - 3.6 * k, bx + 6.8 * k, y - 4.5 * k], [bx - 6.6 * k, y - 11 * k, bx, y - 10.2 * k, bx + 6.6 * k, y - 11 * k], [bx - 2 * k, y, bx - 2.2 * k, y - 15 * k], [bx + 2.4 * k, y, bx + 2.2 * k, y - 15 * k]], { w: pen * 0.6, a: 0.5, color: inkC });
    for (const d of [-1, 1]) { const px = dx + d * dw * 0.95, potp = sharp([[px - 3 * k, y - 5 * k], [px + 3 * k, y - 5 * k], [px + 2.2 * k, y + 1], [px - 2.2 * k, y + 1]]); lineAndWash(g, potp, pg('burntSienna'), { a: 0.7, rng: r, w: pen * 0.7, inkColor: inkC, offset: 0.02, bloom: 0 }); if (pal.season !== 'winter') { for (let q = 0; q < 5; q++) dab(g, px + (r() - 0.5) * 6 * k, y - 7 * k - r() * 5 * k, 2 * k, 1.6 * k, q % 2 ? pal.foliage[1] : pg('cadRed'), { rng: r, a: 0.85, edge: 0.6, n: 6 }); } }
    return { door: [dx, y - dh * 0.5], chimney: [chx, cht] };
  },

  /** A post-and-rail fence from x0 to x1 standing on yOf(x). o: {rng, gap=34, h=26} */
  fence(g, x0, x1, yOf, pal, o = {}) {
    const r = R(o), gap = o.gap ?? 34, h = o.h ?? 26, c = mix(pal.trunk, pg('ochre'), 0.3);
    const posts = [];
    for (let x = x0; x <= x1; x += gap * (0.9 + 0.2 * r())) { const lean = (r() - 0.5) * 0.12, y = yOf(x); posts.push([x, y, lean]); ink(g, [[x, y + 1], [x + lean * h, y - h]], { w: 3.2, a: 0.75, color: c, rng: r, taper: [0, 0.1], wobble: 0.3 }); }
    for (const k of [0.35, 0.7]) ink(g, posts.map((p) => [p[0] + p[2] * h * k, p[1] - h * k + (r() - 0.5) * 2]), { w: 2, a: 0.65, color: c, rng: r, wobble: 0.5, taper: [0.02, 0.02] });
    if (pal.snowK > 0.5) for (const p of posts) gouache(g, blob(p[0] + p[2] * h, p[1] - h - 1, 3.5, 1.6, { rng: r, n: 7 }), PAPER, { a: 0.85, rng: r, texture: 0 });
  },

  /** A stone arch bridge from x0 to x1, deck at y, span down to yWater. o: {rng} */
  bridge(g, x0, x1, y, yWater, pal, o = {}) {
    const r = R(o), w = x1 - x0, x = (x0 + x1) / 2, c = mix(pal.rock, pg('ochre'), 0.3), arcH = (yWater - y) * 0.8;
    const outer = [[x0, yWater + 4], [x0, y - 4]].concat(curve([[x0, y + 2], [x, y - 10], [x1, y + 2]], 10), [[x1, y - 4], [x1, yWater + 4]]);
    const hole = curve([[x0 + w * 0.2, yWater + 4], [x, y + arcH * 0.15], [x1 - w * 0.2, yWater + 4]], 12);
    g.save(); smoothClosed(g, outer); smoothClosed(g, hole); g.clip('evenodd');
    wash(g, outer, c, { a: 0.5, rng: r, layers: 2, edge: 0.6, gran: 0.6 });
    softFill(g, outer.map((p) => [p[0], p[1] + 10]), mix(c, pal.shadow, 0.5), 0.3, 6);
    for (let i = 0; i < w / 6; i++) glaze(g, blob(x0 + r() * w, y + r() * (yWater - y), 5 + r() * 5, 3 + r() * 3, { rng: r, wobble: 0.3, n: 8 }), r() < 0.5 ? deepen(c, 0.3) : dilute(c, 0.3), 0.3);
    g.restore();
    ink(g, hole, { w: 1.5, a: 0.65, color: pal.ink, rng: r, wobble: 0.6, broken: 0.3 });
    ink(g, outer.slice(1, outer.length - 1), { w: 1.6, a: 0.6, color: pal.ink, rng: r, wobble: 0.6, broken: 0.3 });
    // parapet stones
    for (let i = 0; i < 6; i++) { const px = x0 + ((i + 0.5) * w) / 6; stroke(g, [[px - 2, y - 12], [px + 2, y - 2]], { w: 0.8, a: 0.4, color: pal.ink, rng: r }); }
  },

  /** A lamp post at (x, y), height s. o: {rng, lit} */
  lamp(g, x, y, s, pal, o = {}) {
    const r = R(o), lit = o.lit ?? (pal.time === 'night' || pal.time === 'dusk'), c = mix(pg('indigo'), pg('sepia'), 0.4);
    groundShadow(g, x, y, s * 0.12, s * 0.03, 0.2, pal.shadow);
    ink(g, [[x, y], [x + (r() - 0.5) * 2, y - s * 0.82]], { w: s * 0.035, a: 0.85, color: c, rng: r, taper: [0, 0], wobble: 0.3 });
    ink(g, [[x - s * 0.06, y], [x + s * 0.06, y], [x + s * 0.04, y - s * 0.08], [x - s * 0.04, y - s * 0.08]], { w: 1.5, a: 0.8, color: c, rng: r, closed: true });
    const ly = y - s * 0.9, lw = s * 0.09;
    const lantern = [[x - lw, ly + s * 0.08], [x - lw * 0.7, ly - s * 0.06], [x, ly - s * 0.1], [x + lw * 0.7, ly - s * 0.06], [x + lw, ly + s * 0.08]];
    if (lit) { glow(g, x, ly, s * 0.5, pal.lampGlow, 0.55); glow(g, x, ly, s * 0.18, pal.lamp, 0.9); gouache(g, lantern, pal.lamp, { a: 0.95, rng: r, texture: 0 }); }
    else wash(g, lantern, dilute(pal.skyTop, 0.5), { a: 0.45, rng: r, edge: 0.6, gran: 0.1, layers: 1 });
    ink(g, lantern, { w: 1.6, a: 0.85, color: c, rng: r, closed: true, wobble: 0.2 });
    ink(g, [[x, ly - s * 0.1], [x, ly - s * 0.15]], { w: 2.5, a: 0.85, color: c, rng: r });
    return [x, ly];
  },

  /** A wooden signpost with n arms. */
  signpost(g, x, y, s, pal, o = {}) {
    const r = R(o), c = mix(pal.trunk, pg('ochre'), 0.4), n = o.arms ?? 2;
    ink(g, [[x, y], [x + 1, y - s]], { w: s * 0.06, a: 0.8, color: c, rng: r, taper: [0, 0.05] });
    for (let i = 0; i < n; i++) {
      const ay = y - s * (0.85 - i * 0.22), d = i % 2 ? -1 : 1, L = s * 0.45, pts = [[x, ay - s * 0.06], [x + d * L, ay - s * 0.06], [x + d * (L + s * 0.07), ay], [x + d * L, ay + s * 0.06], [x, ay + s * 0.06]];
      gouache(g, pts, dilute(c, 0.45), { a: 0.9, rng: r, texture: 0.3 }); ink(g, pts, { w: 1.2, a: 0.7, color: pal.ink, rng: r, closed: true, wobble: 0.3 });
    }
  },
};
