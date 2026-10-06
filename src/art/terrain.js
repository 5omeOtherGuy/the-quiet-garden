// Terrain: hills with atmospheric depth, ground, rocks, paths, snow, cave and soil cross-sections.
import { TAU, clamp, lerp, rng as mkRng } from './rng.js';
import { fbm1, noise2, ridged2 } from './noise.js';
import { css, mix, dilute, deepen, lerpRgb, PAPER, PIGMENTS } from './color.js';
import { blob, wash, glaze, granulate, softFill, edge, lift, dryBrush, ink, pencil, scumble, spatter, smoothClosed, smoothOpen, jitter, bbox, hatch, gouache, groundShadow, dab, lineAndWash, stroke, paperFill, blot, marks, scallop, contour, resample } from './brush.js';

const fallback = mkRng(5);
const R = (o) => o.rng || fallback;
const pg = (n) => PIGMENTS[n].rgb;

/** A hill profile y(x). p: {base, amp, freq, phase, seed} */
export function profile(p) {
  const { base, amp, freq, phase = 0, seed = 0 } = p;
  return (x) => base + amp * (Math.sin(x * freq + phase) + 0.45 * Math.sin(x * freq * 2.3 + phase * 1.7) + 0.2 * Math.sin(x * freq * 5.1 + phase * 0.3))
    + (fbm1(x * freq * 4 + seed, 3, seed) - 0.5) * amp * 0.5;
}

export const terrain = {
  profile,

  /**
   * A range of hills from x0..x1 whose ridge follows profile(p), filled down to `bottom`. Bare paper under one
   * graded wash (warm where the land faces the light, cool in the dips, thinning into valley mist on far ranges),
   * a hard-edged second wash on the flanks turned from the light, and the pen: a broken ridge line, form strokes
   * that follow the fall of the land, grass breaking the near silhouettes.
   * o: {rng, color, a, depth 0 far..1 near, snow 0..1, texture=1 (pen form strokes), ridge=1 (ridge line), sky (for aerial dilution),
   *     light [dx,dy], story: {fields, hedges, gate, sheep, hay, farm} (see story())}
   * Returns the profile function.
   */
  hills(g, x0, x1, bottom, p, pal, o = {}) {
    const r = R(o), f = profile(p), depth = o.depth ?? 0.5, lt = o.light || [-0.6, -0.8], snowy = (o.snow ?? 0) > 0.5;
    let color = o.color || lerpRgb(pal.far, pal.near, depth);
    if (o.sky) color = lerpRgb(color, o.sky, (1 - depth) * 0.45);
    if (snowy) color = lerpRgb(dilute(pal.snowShade, 0.55), o.sky || pal.skyHorizon, (1 - depth) * 0.3);
    const step = depth < 0.3 ? 12 : 8, ridge = [];
    for (let x = x0; x <= x1; x += step) ridge.push([x, f(x)]);
    ridge.push([x1, f(x1)]);
    const pts = ridge.concat([[x1, bottom], [x0, bottom]]); pts.sharp = true;
    let top = Infinity; for (const q of ridge) top = Math.min(top, q[1]);
    const a = o.a ?? (snowy ? 0.4 : lerp(0.62, 0.86, depth)), sgn = lt[0] < 0 ? 1 : -1;
    const away = (x) => ((f(x + 30) - f(x - 30)) / 60) * sgn;      // > 0 where the land turns from the light
    paperFill(g, pts);
    g.save(); smoothClosed(g, pts); g.clip();
    const gr = g.createLinearGradient(0, top, 0, top + 80 + 260 * depth);
    gr.addColorStop(0, css(color, a)); gr.addColorStop(1, css(mix(color, pg('cobalt'), 0.08), a * (depth < 0.4 ? 0.6 : 0.95)));
    g.fillStyle = gr; g.fillRect(x0, top - 2, x1 - x0, bottom - top + 4);
    const warmC = snowy ? PAPER : mix(color, pg('lemon'), 0.2 + 0.2 * depth), coolC = snowy ? pal.snowShade : mix(color, pal.shadow, 0.35);
    const D = lerp(14, 70, depth);
    // wet-in-wet form: shade hugs the ridge where the flank turns from the light, warm light lies on the crowns
    for (let x = x0; x < x1; x += 22 + 14 * r()) {
      const aw = away(x), sl = (f(x + 8) - f(x - 8)) / 16;
      if (aw > 0.04) blot(g, x + D * 0.25, f(x) + D * (0.35 + 0.3 * r()), D * 1.3 + 16, D * (0.55 + 0.4 * r()), coolC, Math.min(0.34, aw * 1.5 + 0.08) * (snowy ? 1.3 : 1), Math.atan(sl));
      else if (aw < -0.03 && r() < 0.7) blot(g, x, f(x) + D * (0.5 + 0.5 * r()), D * 1.5 + 20, D * (0.5 + 0.4 * r()), warmC, snowy ? 0.5 : 0.34, Math.atan(sl));
    }
    for (let x = x0; x < x1; x += 110 + 120 * r()) blot(g, x, f(x) + D * (2 + 3 * r()), 90 + 110 * r(), (20 + 26 * r()) * lerp(0.6, 1, depth), r() < 0.5 ? warmC : mix(color, pg('cobalt'), 0.15), a * 0.3, (r() - 0.5) * 0.2);
    // dry brush dragged along the lie of the land: the paper's tooth shows in the turf
    if (depth > 0.45 && (o.texture ?? 1) > 0) for (let i = 0; i < ((x1 - x0) / 130) * depth; i++) {
      const xa = x0 + r() * (x1 - x0), len = 80 + 200 * r(), d = D * (0.6 + 4.5 * r()), line = [];
      for (let x = xa; x <= xa + len; x += 16) line.push([x, lerp(f(x), top + 60, Math.min(1, d / 300)) + d + Math.sin(x * 0.03) * 2]);
      if (line.length > 1) dryBrush(g, line, r() < 0.5 ? deepen(color, 0.3) : (snowy ? pal.snowShade : mix(color, pg('lemon'), 0.4)), { w: 3 + 5 * r(), a: 0.16, n: 4, rng: r, taper: 1 });
    }
    g.restore();
    const inkC = lerpRgb(o.sky ? mix(pal.ink, o.sky, 0.45) : pal.ink, pal.ink, depth), penW = lerp(0.7, 1.4, depth), penA = lerp(0.3, 0.72, depth);
    // the pen follows the fall of the land: little groups of strokes, mostly on the shaded flanks
    if ((o.texture ?? 1) > 0 && depth > 0.3) {
      const list = [], n = Math.floor(((x1 - x0) / 90) * (o.texture ?? 1) * lerp(0.5, 1.2, depth));
      for (let i = 0; i < n; i++) {
        const x = x0 + r() * (x1 - x0), aw = away(x); if (aw < 0.02 && r() < 0.7) continue;
        const sl = aw * sgn, y0 = f(x) + D * (0.3 + 1.6 * r()), m = 3 + Math.floor(r() * 4), len = (10 + 16 * r()) * lerp(0.5, 1, depth);
        for (let k = 0; k < m; k++) { const xx = x + k * 2.5 * sgn, yy = y0 + k * 4.5 * lerp(0.6, 1, depth), l2 = len * (0.6 + 0.6 * r()); list.push([xx, yy, xx + l2 * 0.5, yy + sl * l2 * 0.5 + 1.2, xx + l2, yy + sl * l2 + (r() - 0.5) * 2]); }
      }
      marks(g, list, { w: penW * 0.7, a: penA * 0.45, color: snowy ? mix(inkC, pal.snowShade, 0.5) : inkC });
    }
    if (o.story) this.story(g, f, x0, x1, bottom, pal, { rng: r, depth, snow: o.snow, ...o.story });
    // the ridge: a broken pen line, surer where the land turns from the light
    if ((o.ridge ?? 1) > 0) {
      for (let i = 0; i < ridge.length - 1;) {
        const m = 5 + Math.floor(r() * 9), run = ridge.slice(i, i + m + 1); i += m;
        if (run.length < 2 || r() < 0.14) continue;
        const k = clamp(0.75 + away(run[run.length >> 1][0]) * 2.2, 0.5, 1.4);
        ink(g, run, { w: penW * k, a: penA * (o.ridge ?? 1) * (0.6 + 0.4 * Math.min(1, k)), color: inkC, rng: r, wobble: 0.5, taper: [0.12, 0.2] });
      }
      if (depth > 0.6 && !snowy) { // grass breaks the near silhouettes
        const list = [];
        for (let x = x0; x < x1; x += 14 + 50 * r()) { const m = 2 + Math.floor(r() * 5); for (let k = 0; k < m; k++) { const xx = x + k * 2.2 + r() * 2, h = (4 + 7 * r()) * depth, ln = (r() - 0.4) * 5; list.push([xx, f(xx) + 1, xx + ln * 0.3, f(xx) - h * 0.6, xx + ln, f(xx) - h]); } }
        marks(g, list, { w: penW * 0.75, a: 0.5, color: mix(deepen(color, 0.5), pal.ink, 0.4) });
      }
    }
    return f;
  },

  /** Snow lying on a ridge polyline: bare paper with cool shadow below. o: {k, rng, depth} */
  snowOn(g, ridge, bottom, pal, o = {}) {
    const r = R(o), k = o.k ?? 1, depth = o.depth ?? 0.5, thick = 60 + depth * 160;
    const top = ridge.map((q) => [q[0], q[1] - 1]);
    const under = ridge.map((q, i) => [q[0], q[1] + thick * (0.6 + 0.4 * fbm1(i * 0.3, 2, 9)) * (1 + (r() - 0.5) * 0.1)]);
    const pts = top.concat(under.reverse());
    paperFill(g, pts, 0.92 * k);
    g.save(); smoothClosed(g, pts); g.clip();
    for (let i = 0; i < top.length; i++) blot(g, top[i][0] + (r() - 0.5) * 60, top[i][1] + thick * (0.3 + 0.5 * r()), 60 + 80 * r(), 10 + 14 * r(), pal.snowShade, 0.3 * k, 0);
    g.restore();
  },

  /**
   * What people did to the hill: a patchwork of fields over the whole face, thin and far under the ridge, bigger
   * toward the viewer. Most fields are glazes over the hill's own green (pasture, a yellower meadow, a bluer crop);
   * a few are painted in their own colour on bare paper (corn, plough, mown hay) with furrows and rows. Hedgerows
   * with hedge trees run on the boundaries; then a gate, sheep, haystacks, a far farmhouse.
   * f is the hill's profile. o: {rng, depth, fields=4 (columns), hedges=1, gate, sheep (count), hay (count), farm, snow, reach (how far down, world units)}
   */
  story(g, f, x0, x1, bottom, pal, o = {}) {
    const r = R(o), depth = o.depth ?? 0.5, k = lerp(0.4, 1, depth), nf = o.fields ?? 4, snow = (o.snow ?? 0) > 0.5, W = x1 - x0, bounds = [];
    let bx = x0 - W * 0.02, top = Infinity, mean = 0;
    for (let i = 0; i <= 20; i++) { const y = f(x0 + (W * i) / 20); top = Math.min(top, y); mean += y / 21; }
    const reach = o.reach ?? Math.min(bottom - top, 330 * k + 60);
    for (let i = 0; i <= nf + 1; i++) { bounds.push({ x: bx, slant: (r() - 0.5) * 0.7 + ((bx - (x0 + W / 2)) / W) * 0.5 }); bx += ((W * 1.04) / nf) * (0.6 + 0.8 * r()); }
    // a point of the field net: q across the column, d units below the ridge; the relief flattens toward the foot
    const P = (i, q, d) => { const a = bounds[i], b = bounds[i + 1], x = lerp(a.x, b.x, q), sl = lerp(a.slant, b.slant, q), fl = Math.min(1, d / 260); return [x + sl * d + Math.sin(d * 0.03 + i * 2.1 + q * 3) * 5 * k * (q < 0.01 || q > 0.99 ? 1 : 0.3), lerp(f(x), mean, fl * 0.7) + 2 + d + Math.sin(x * 0.045 + d * 0.02) * 2.5 * k]; };
    const T = pal.foliage, autumn = pal.season === 'autumn', winter = pal.season === 'winter';
    const paint = { corn: mix(pg('ochre'), pg('cadYellow'), autumn ? 0.15 : 0.45), plough: mix(pg('rawSienna'), pg('burntUmber'), 0.45), hay: dilute(mix(pg('cadYellow'), pg('ochre'), 0.4), 0.3) };
    const glaze = { meadow: pg('lemon'), crop: mix(pg('cobalt'), pg('viridian'), 0.5), deep: mix(T[2], pg('hookers'), 0.4), dry: pg('ochre') };
    const kinds = winter ? ['plough', 'pasture', 'pasture', 'dry', 'pasture', 'deep'] : autumn ? ['corn', 'plough', 'pasture', 'dry', 'plough', 'hay', 'pasture', 'deep'] : ['pasture', 'pasture', 'meadow', 'meadow', 'crop', 'deep', 'corn', 'hay', 'plough'];
    const cells = [], hedges = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const cuts = [0]; let d = 0, h = (20 + 22 * r()) * k;
      while (d + h < reach) { d += h; cuts.push(d); h *= 1.45 + 0.5 * r(); }
      cuts.push(reach + 30);
      for (let c = 0; c < cuts.length - 1; c++) {
        const da = cuts[c], db = cuts[c + 1], poly = [], rel = da / reach, kk = k * lerp(0.85, 1.5, rel);
        for (let q = 0; q <= 1.001; q += 0.125) poly.push(P(i, q, da));
        poly.push(P(i, 1, lerp(da, db, 0.5)));
        for (let q = 1; q >= -0.001; q -= 0.125) poly.push(P(i, q, db));
        poly.push(P(i, 0, lerp(da, db, 0.5)));
        poly.sharp = true;
        const kind = kinds[Math.floor(r() * kinds.length)], cell = { i, da, db, kind, kk }; cells.push(cell);
        const rows = (tone, a, m, along) => { const list = []; for (let u = 1; u < m; u++) { const v = u / m; if (along) list.push([...P(i, 0.03, lerp(da, db, v)), ...P(i, 0.5, lerp(da, db, v)), ...P(i, 0.97, lerp(da, db, v))]); else list.push([...P(i, v, lerp(da, db, 0.06)), ...P(i, v, lerp(da, db, 0.5)), ...P(i, v, lerp(da, db, 0.94))]); } marks(g, list, { w: Math.max(0.6, 0.9 * kk), a, color: tone }); };
        const m = Math.max(3, Math.round(((db - da) / (7 * kk)) * (0.7 + 0.6 * r()))), mAcross = Math.max(4, Math.round((bounds[i + 1].x - bounds[i].x) / (9 * kk)));
        if (snow) { if (kind === 'plough' && r() < 0.7) rows(mix(pal.snowShade, pal.ink, 0.35), 0.35, r() < 0.5 ? m : mAcross, r() < 0.5); }
        else if (paint[kind]) {
          const tone = paint[kind];
          paperFill(g, poly, 0.5 + 0.45 * depth);
          wash(g, poly, tone, { a: 0.26 + 0.42 * depth, rng: r, layers: 1, edge: 0.6, bloom: 0.35, pool: 0.5 });
          if (kind === 'plough') rows(deepen(tone, 0.5), 0.5, r() < 0.5 ? m : mAcross, r() < 0.5);
          else if (r() < 0.7) rows(deepen(tone, 0.4), 0.3, r() < 0.5 ? m : mAcross, r() < 0.5);
        } else if (glaze[kind]) {
          wash(g, poly, glaze[kind], { a: kind === 'deep' ? 0.3 : 0.26, rng: r, layers: 1, edge: 0.5, bloom: 0, pool: 0.4, multiply: true });
          if (kind === 'crop' && r() < 0.8) rows(mix(T[3], pal.ink, 0.3), 0.3, r() < 0.5 ? m : mAcross, r() < 0.5);
        }
        if (c > 0) { const hl = []; for (let q = 0; q <= 1.001; q += 0.1) hl.push(P(i, q, da)); hedges.push({ hl, kk }); }
      }
      if (i > 0) { const hl = []; for (let t = 0; t <= 1.001; t += 0.1) hl.push(P(i, 0, t * t * reach)); hedges.push({ hl, kk: k * 1.1, grow: true }); }
    }
    if ((o.hedges ?? 1) > 0) for (const h of hedges) this.hedge(g, h.hl, pal, { rng: r, k: h.kk, snow, depth, grow: h.grow });
    const cellOf = (want) => { const c = cells.filter((q) => want.includes(q.kind) && q.db - q.da > 26 * k && q.da < reach * 0.6); return c.length ? c[Math.floor(r() * c.length)] : cells[Math.floor(r() * cells.length)]; };
    const spot = (c) => P(c.i, 0.2 + 0.6 * r(), lerp(c.da, c.db, 0.3 + 0.5 * r()));
    if (o.gate && hedges.length) { const h = hedges[Math.floor(r() * hedges.length)], q = h.hl[5]; paperFill(g, blob(q[0], q[1] - 5 * h.kk, 15 * h.kk, 9 * h.kk, { rng: r, n: 10 }), 0.9); this.gate(g, q[0], q[1] + 2 * h.kk, 13 * h.kk, pal, { rng: r }); }
    if (o.farm) { const c = cellOf(['pasture', 'meadow']), q = spot(c); this.farm(g, q[0], q[1], 24 * c.kk, pal, { rng: r, snow }); }
    if (o.sheep) { const c = cellOf(['pasture', 'meadow']), q = spot(c); for (let i = 0; i < o.sheep; i++) this.sheep(g, q[0] + r.gauss() * 22 * c.kk, q[1] + r.gauss() * 7 * c.kk, 10 * c.kk, pal, { rng: r, dir: r.sign() }); }
    if (o.hay) { const c = cellOf(['hay', 'corn']); for (let i = 0; i < o.hay; i++) { const q = spot(c); this.haystack(g, q[0], q[1], 11 * c.kk, pal, { rng: r, snow }); } }
    return bounds;
  },

  /** A hedgerow along a polyline: a lumpy dark line with a lit top, bushes, here and there a hedge tree. o: {rng, k (scale), snow, depth} */
  hedge(g, line, pal, o = {}) {
    const r = R(o), k = o.k ?? 1, T = pal.foliage, snow = o.snow, dark = snow ? mix(T[3], pg('paynes'), 0.55) : mix(T[3], pg('indigo'), 0.2), bare = pal.bare > 0.6;
    ink(g, line, { w: 3.6 * k, a: 0.85, color: dark, rng: r, wobble: 1.4 * k, taper: [0.04, 0.04], steady: 0.1, pressure: o.grow ? (t) => 0.55 + 1.1 * t : undefined });
    if (!snow && !bare) ink(g, line.map((q) => [q[0] - 0.6 * k, q[1] - 1.4 * k]), { w: 1.8 * k, a: 0.6, color: mix(T[1], pg('lemon'), 0.2), rng: r, wobble: k, broken: 0.5, taper: [0.1, 0.1] });
    const pts = resample(line, 9 * k), arcs = [];
    for (const q of pts) {
      if (r() < 0.45) { const rx = (3 + 2.5 * r()) * k, ry = (2.6 + 2 * r()) * k, cx = q[0] + (r() - 0.5) * 3 * k, cy = q[1] - 1.8 * k; dab(g, cx, cy, rx, ry, snow ? dark : bare ? mix(pal.trunk, pg('paynes'), 0.4) : T[2], { rng: r, a: 0.8, edge: 0.7 }); if (snow) dab(g, cx, cy - ry * 0.6, rx * 0.8, ry * 0.45, PAPER, { rng: r, a: 0.95, edge: 0 }); arcs.push([cx - rx, cy, cx, cy - ry * 1.5, cx + rx, cy]); }
      else if (r() < 0.14) { // a hedge tree
        const h = (11 + 8 * r()) * k, tx = q[0], ty = q[1] - 2 * k;
        marks(g, [[tx, ty, tx + (r() - 0.5) * k, ty - h * 0.6]], { w: Math.max(0.8, 1.3 * k), a: 0.8, color: pal.ink });
        if (bare) { const tw = []; for (let j = 0; j < 5; j++) { const a = -Math.PI / 2 + (j - 2) * 0.45 + (r() - 0.5) * 0.3; tw.push([tx, ty - h * 0.45, tx + Math.cos(a) * h * 0.3, ty - h * 0.5 + Math.sin(a) * h * 0.3, tx + Math.cos(a) * h * 0.55, ty - h * 0.5 + Math.sin(a) * h * 0.6]); } marks(g, tw, { w: Math.max(0.6, 0.8 * k), a: 0.7, color: pal.ink }); if (snow) dab(g, tx, ty - h * 0.95, h * 0.25, h * 0.08, PAPER, { rng: r, a: 0.9, edge: 0 }); }
        else { const c = scallop(tx, ty - h * 0.72, h * 0.42, h * 0.4, { rng: r, bump: Math.max(2, h * 0.22), depth: 0.5 }); paperFill(g, c); wash(g, c, mix(T[1], T[2], r()), { a: 0.75, rng: r, layers: 1, edge: 0.6, vary: T[3], varyAngle: 0.9, bloom: 0, pool: 0 }); if (k > 0.55) contour(g, c, { rng: r, w: Math.max(0.6, 0.9 * k), a: 0.6, color: pal.ink, broken: 0.35 }); }
      }
    }
    if (k > 0.55) marks(g, arcs.filter(() => r() < 0.6), { w: Math.max(0.6, 0.8 * k), a: 0.45, color: pal.ink });
  },

  /** A far farmhouse with a barn: small, for hillsides. s = width of the house. o: {rng, snow} */
  farm(g, x, y, s, pal, o = {}) {
    const r = R(o), wall = dilute(pg('ochre'), 0.75), roof = o.snow ? PAPER : mix(pg('burntSienna'), pg('cadRed'), 0.35), w = Math.max(0.6, s * 0.035);
    const house = (hx, hw, hh, rf) => {
      const walls = [[hx - hw / 2, y], [hx - hw / 2, y - hh], [hx + hw / 2, y - hh], [hx + hw / 2, y]], top = [[hx - hw * 0.58, y - hh + 1], [hx - hw * 0.3, y - hh - hw * 0.42], [hx + hw * 0.3, y - hh - hw * 0.42], [hx + hw * 0.58, y - hh + 1]];
      walls.sharp = true; top.sharp = true;
      lineAndWash(g, walls, wall, { a: 0.5, rng: r, shade: [0.8, 0], w, inkColor: pal.ink, offset: 0.03, bloom: 0 });
      lineAndWash(g, top, rf, { a: 0.7, rng: r, w, inkColor: pal.ink, offset: 0.03, bloom: 0 });
      marks(g, [[hx - hw * 0.2, y - hh * 0.55, hx - hw * 0.2, y - hh * 0.25], [hx + hw * 0.18, y - hh * 0.55, hx + hw * 0.18, y - hh * 0.3]], { w: w * 2.2, a: 0.7, color: pal.ink });
    };
    house(x + s * 0.85, s * 0.9, s * 0.42, o.snow ? PAPER : mix(pal.trunk, pg('paynes'), 0.4));
    house(x, s, s * 0.5, roof);
    marks(g, [[x + s * 0.2, y - s * 0.86, x + s * 0.2, y - s * 1.06]], { w: w * 2.6, a: 0.8, color: pal.ink });
    for (let i = 0; i < 3; i++) blot(g, x + s * (0.26 + i * 0.12), y - s * (1.16 + i * 0.16), s * (0.12 + i * 0.05), s * (0.07 + i * 0.03), PAPER, 0.7, 0);
    for (const d of [-0.75, 1.5]) { const c = scallop(x + d * s, y - s * 0.34, s * 0.3, s * 0.34, { rng: r, bump: Math.max(2, s * 0.14) }); paperFill(g, c); wash(g, c, pal.bare > 0.6 ? mix(pal.trunk, pg('paynes'), 0.4) : pal.foliage[2], { a: 0.75, rng: r, layers: 1, edge: 0.6, vary: pal.foliage[3], bloom: 0, pool: 0 }); contour(g, c, { rng: r, w, a: 0.6, color: pal.ink, broken: 0.3 }); }
  },

  /** A sheep, small: for hillsides. s = body length. */
  sheep(g, x, y, s, pal, o = {}) {
    const r = R(o), d = o.dir ?? 1;
    groundShadow(g, x, y, s * 0.7, s * 0.14, 0.2, pal.shadow);
    for (const lx of [-0.3, -0.1, 0.2, 0.35]) stroke(g, [[x + lx * s, y - s * 0.3], [x + lx * s + (r() - 0.5), y]], { w: Math.max(0.8, s * 0.07), a: 0.8, color: pal.ink, rng: r });
    const body = blob(x, y - s * 0.5, s * 0.6, s * 0.38, { rng: r, wobble: 0.16, n: 12, freq: 4 });
    gouache(g, body, dilute(pg('ochre'), 0.85), { a: 0.95, rng: r, texture: 0 });
    g.save(); smoothClosed(g, body); g.clip(); softFill(g, body.map((q) => [q[0], q[1] + s * 0.3]), pal.shadow, 0.25, s * 0.1); g.restore();
    ink(g, body, { w: Math.max(0.7, s * 0.05), a: 0.5, color: pal.ink, rng: r, closed: true, broken: 0.45, wobble: 0.8 });
    dab(g, x + d * s * 0.6, y - s * 0.62, s * 0.2, s * 0.16, mix(pg('sepia'), pg('indigo'), 0.3), { rng: r, a: 0.85, edge: 0.3, rot: d * 0.4 });
  },

  /** A five-bar field gate, s = half width. */
  gate(g, x, y, s, pal, o = {}) {
    const r = R(o), c = mix(pal.trunk, pg('ochre'), 0.3);
    for (const d of [-1, 1]) ink(g, [[x + d * s, y + 1], [x + d * s + (r() - 0.5) * 2, y - s * 1.1]], { w: s * 0.16, a: 0.8, color: c, rng: r, taper: [0, 0.1] });
    for (let i = 0; i < 4; i++) ink(g, [[x - s, y - s * (0.2 + i * 0.24)], [x + s, y - s * (0.22 + i * 0.24) + (r() - 0.5) * 1.5]], { w: s * 0.09, a: 0.75, color: c, rng: r, wobble: 0.3, taper: [0.02, 0.02] });
    ink(g, [[x - s, y - s * 0.2], [x + s, y - s * 0.95]], { w: s * 0.08, a: 0.7, color: c, rng: r, taper: [0.02, 0.02] });
  },

  /** A haystack, s = half width. */
  haystack(g, x, y, s, pal, o = {}) {
    const r = R(o), c = mix(pg('ochre'), pg('cadYellow'), 0.3);
    groundShadow(g, x + s * 0.2, y, s * 0.9, s * 0.18, 0.2, pal.shadow);
    const p = [[x - s * 0.75, y], [x - s * 0.7, y - s * 0.6], [x - s * 0.3, y - s * 1.15], [x, y - s * 1.3], [x + s * 0.3, y - s * 1.15], [x + s * 0.7, y - s * 0.6], [x + s * 0.75, y]];
    lineAndWash(g, p, c, { a: 0.55, rng: r, shade: [0.6, 0.3], ink: 0.55, inkColor: pal.ink, w: Math.max(0.8, s * 0.06) });
    g.save(); smoothClosed(g, p); g.clip(); for (let i = 0; i < 7; i++) { const sx = x + (r() - 0.5) * s * 1.3; dryBrush(g, [[sx * 0.3 + x * 0.7, y - s * 1.2], [sx, y]], deepen(c, 0.4), { w: s * 0.12, a: 0.3, n: 2, rng: r }); } g.restore();
    if (o.snow > 0.5) dab(g, x, y - s * 1.2, s * 0.45, s * 0.2, PAPER, { rng: r, a: 0.9, edge: 0 });
  },

  /** A dry-stone wall along a polyline. o: {rng, h=10} */
  wall(g, line, pal, o = {}) {
    const r = R(o), h = o.h ?? 10;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / (h * 0.9)));
      for (let k = 0; k < n; k++) for (let row = 0; row < 2; row++) {
        const t = (k + (row ? 0.5 : 0) + r() * 0.2) / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t - row * h * 0.45 - h * 0.25;
        dab(g, x, y, h * (0.4 + 0.25 * r()), h * (0.22 + 0.1 * r()), r() < 0.5 ? pal.rock : mix(pal.rock, pg('ochre'), 0.3), { rng: r, a: 0.6, edge: 0.9, n: 7, rot: (r() - 0.5) * 0.4 });
      }
    }
    ink(g, line.map((q) => [q[0], q[1] - h * 0.95]), { w: 1.1, a: 0.5, color: pal.ink, rng: r, broken: 0.4, wobble: 0.8 });
    ink(g, line, { w: 1.2, a: 0.45, color: pal.ink, rng: r, broken: 0.5, wobble: 0.6 });
  },

  /** Near ground band: soil and grass base. o: {rng, color, a} */
  ground(g, x, y, w, h, pal, o = {}) {
    const r = R(o), c = o.color || pal.ground;
    const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const top = []; for (let xx = x; xx <= x + w; xx += 10) top.push([xx, y + (fbm1(xx * 0.01, 2, 3) - 0.5) * 12]);
    const poly = top.concat([[x + w, y + h], [x, y + h]]);
    wash(g, poly, c, { a: o.a ?? 0.4, rng: r, layers: 2, edge: 0, gran: 0.5, jitter: 0.01 });
    const n = Math.floor((w * h) / 30000);
    for (let i = 0; i < n; i++) {
      const px = x + r() * w, py = y + r() * h;
      if (r() < 0.5) softFill(g, blob(px, py, 30 + 50 * r(), 8 + 10 * r(), { rng: r, wobble: 0.3 }), r() < 0.5 ? deepen(c, 0.25) : mix(c, pg('sap'), 0.3), 0.14, 6);
      else lift(g, px, py, 25 + 40 * r(), 6 + 8 * r(), { a: 0.18, rng: r });
    }
    scumble(g, poly, deepen(c, 0.4), { a: 0.12, rng: r, angle: 0.05, len: 14, w: 1, density: 0.35 });
    spatter(g, x + w / 2, y + h / 2, Math.max(w, h) * 0.5, deepen(c, 0.5), { n: Math.floor(n * 2), size: 1.2, a: 0.3, rng: r });
    return poly;
  },

  /** A boulder. o: {rng, color, moss, s (facets), lit [dx,dy]} */
  rock(g, x, y, w, h, pal, o = {}) {
    const r = R(o), c = o.color || pal.rock;
    const pts = blob(x, y - h * 0.45, w * 0.5, h * 0.5, { rng: r, wobble: 0.22, n: 12 + Math.floor(w / 12), freq: 2.4 });
    // flatten the bottom
    for (const p of pts) if (p[1] > y - h * 0.1) p[1] = y - h * 0.1 + (p[1] - (y - h * 0.1)) * 0.25;
    groundShadow(g, x + w * 0.1, y - 2, w * 0.6, h * 0.14, 0.22, pal.shadow);
    wash(g, pts, c, { a: 0.45, rng: r, layers: 2, edge: 0.9, gran: 0.85, mottle: 0.15, jitter: 0.04 });
    // shadow side (right-down by default)
    const lit = o.lit || [-0.6, -0.8];
    const sh = pts.map((p) => [p[0] - lit[0] * w * 0.18, p[1] - lit[1] * h * 0.15]);
    g.save(); smoothClosed(g, pts); g.clip(); softFill(g, sh, mix(c, pal.shadow, 0.5), 0.32, 5); granulate(g, sh, 0.4); g.restore();
    lift(g, x + lit[0] * w * 0.2, y - h * 0.7 + lit[1] * h * 0.1, w * 0.22, h * 0.14, { a: 0.4, rng: r, clip: pts });
    scumble(g, pts, deepen(c, 0.5), { a: 0.22, rng: r, angle: 0.5, len: Math.max(5, w * 0.12), w: 1.1, density: 0.5 });
    // ink: a broken contour and a few facet creases
    const seg = Math.floor(pts.length * 0.6), start = Math.floor(r() * pts.length);
    const contour = []; for (let i = 0; i < seg; i++) contour.push(pts[(start + i) % pts.length]);
    ink(g, contour, { w: 1.6 + w * 0.01, a: 0.55, broken: 0.4, rng: r, color: pal.ink, wobble: 0.6 });
    const nf = o.s ?? 2;
    for (let i = 0; i < nf; i++) {
      const a = pts[Math.floor(r() * pts.length)], b = [x + (r() - 0.5) * w * 0.3, y - h * (0.3 + 0.4 * r())];
      ink(g, [a, [(a[0] + b[0]) / 2 + (r() - 0.5) * 8, (a[1] + b[1]) / 2 + (r() - 0.5) * 8], b], { w: 1, a: 0.35, broken: 0.5, rng: r, color: pal.ink });
    }
    if (o.moss) for (let i = 0; i < 3 + o.moss * 4; i++) glaze(g, blob(x + (r() - 0.5) * w * 0.6, y - h * (0.25 + 0.5 * r()), 4 + 8 * r(), 3 + 5 * r(), { rng: r, wobble: 0.3 }), mix(pg('sap'), pg('ochre'), 0.3), 0.35);
    if (o.snow) gouache(g, pts.filter((p) => p[1] < y - h * 0.55).concat([[x + w * 0.45, y - h * 0.5], [x - w * 0.45, y - h * 0.5]]), PAPER, { a: 0.8 * o.snow, rng: r, texture: 0 });
    return pts;
  },

  /** A dirt path along a centre polyline; width w. o: {rng, color, pebbles} */
  path(g, line, w, pal, o = {}) {
    const r = R(o), c = o.color || mix(pal.ground, pg('rawSienna'), 0.4);
    const L = [], Rt = [];
    for (let i = 0; i < line.length; i++) {
      const p = line[i], q = line[Math.min(line.length - 1, i + 1)], pr = line[Math.max(0, i - 1)];
      let nx = -(q[1] - pr[1]), ny = q[0] - pr[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const hw = (typeof w === 'function' ? w(i / (line.length - 1)) : w) * (0.45 + 0.1 * fbm1(i * 0.5, 2, 2));
      L.push([p[0] + nx * hw, p[1] + ny * hw]); Rt.push([p[0] - nx * hw, p[1] - ny * hw]);
    }
    const poly = L.concat(Rt.reverse());
    softFill(g, poly, c, 0.42, 6); granulate(g, poly, 0.5);
    glaze(g, jitter(poly, r, 0.03, 0.9), dilute(c, 0.3), 0.2);
    dryBrush(g, line, deepen(c, 0.3), { w: 5, a: 0.2, n: 4, rng: r });
    if (o.pebbles !== false) { g.save(); g.fillStyle = css(deepen(c, 0.45), 0.45); for (let i = 0; i < poly.length; i++) if (r() < 0.5) { g.beginPath(); g.ellipse(poly[i][0] + (r() - 0.5) * 6, poly[i][1] + (r() - 0.5) * 4, 1.5 + r() * 2, 1 + r(), r() * 3, 0, TAU); g.fill(); } g.restore(); }
    return poly;
  },

  /** Cave or burrow wall over rect: dark earth with strata, ridged texture and roots. o: {rng, color, strata, roots, warm} */
  cave(g, x, y, w, h, pal, o = {}) {
    const r = R(o), c = o.color || mix(pg('burntUmber'), pg('indigo'), 0.35);
    const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, css(deepen(c, 0.35))); gr.addColorStop(0.5, css(c)); gr.addColorStop(1, css(mix(c, pg('sepia'), 0.4)));
    g.save(); g.fillStyle = gr; g.fillRect(x, y, w, h); g.restore();
    // uneven earth: soft blotches warm and cool
    const n = Math.floor((w * h) / 25000);
    for (let i = 0; i < n; i++) {
      const px = x + r() * w, py = y + r() * h, warmish = r() < 0.5;
      softFill(g, blob(px, py, 40 + 90 * r(), 20 + 50 * r(), { rng: r, wobble: 0.35 }), warmish ? mix(c, pg('rawSienna'), 0.45) : mix(c, pg('indigo'), 0.4), 0.18, 12);
    }
    // strata: wobbly darker bands
    const ns = o.strata ?? 5;
    for (let i = 0; i < ns; i++) {
      const by = y + h * (0.1 + 0.85 * (i + r() * 0.5) / ns), band = [];
      for (let xx = x; xx <= x + w; xx += 20) band.push([xx, by + (fbm1(xx * 0.006 + i * 7, 3, i) - 0.5) * 40]);
      const poly = band.concat(band.map((p) => [p[0], p[1] + 8 + 14 * fbm1(p[0] * 0.01, 2, i + 3)]).reverse());
      wash(g, poly, deepen(c, 0.35), { a: 0.38, rng: r, edge: 0.8, gran: 0.6, layers: 1 });
      dryBrush(g, band, deepen(c, 0.5), { w: 4, a: 0.3, n: 3, rng: r });
    }
    // ridged texture (pebbles, grit) by scumble and spatter
    scumble(g, pts, deepen(c, 0.5), { a: 0.2, rng: r, angle: 0.1, len: 12, w: 1.2, density: 0.6 });
    scumble(g, pts, mix(c, pg('ochre'), 0.5), { a: 0.16, rng: r, angle: -0.2, len: 8, w: 1, density: 0.45 });
    spatter(g, x + w / 2, y + h / 2, Math.max(w, h) * 0.6, deepen(c, 0.5), { n: n * 6, size: 1.5, a: 0.35, rng: r });
    granulate(g, pts, 0.45, 1.6);
    // embedded stones
    const stones = o.stones ?? n;
    for (let i = 0; i < stones; i++) {
      const sx = x + r() * w, sy = y + r() * h, sw = 8 + 22 * r(), p = blob(sx, sy, sw, sw * (0.5 + 0.4 * r()), { rng: r, wobble: 0.25, n: 10, rot: r() * 3 });
      softFill(g, p.map((q) => [q[0] + 2, q[1] + 3]), deepen(c, 0.5), 0.5, 3);
      wash(g, p, deepen(mix(pal.rock, c, 0.75), 0.2), { a: 0.6, rng: r, edge: 0.9, gran: 0.6, layers: 1 });
      glaze(g, blob(sx - sw * 0.2, sy - sw * 0.2, sw * 0.3, sw * 0.15, { rng: r, n: 8 }), dilute(pal.rock, 0.2), 0.18);
    }
    // roots coming through the ceiling
    const roots = o.roots ?? Math.floor(w / 250);
    for (let i = 0; i < roots; i++) this.root(g, x + r() * w, y - 2, 60 + 160 * r(), pal, { rng: r, dir: 1, color: mix(pg('sepia'), pg('ochre'), 0.3) });
    return pts;
  },

  /** A root (or a bare twig) wandering from (x,y) a length L. dir: +1 down, -1 up. */
  root(g, x, y, L, pal, o = {}) {
    const r = R(o), dir = o.dir ?? 1, depth = o.depth ?? 0, w = o.w ?? Math.max(1.5, L * 0.045), c = o.color || pal.trunk;
    const pts = [[x, y]]; let a = Math.PI / 2 * dir + (r() - 0.5) * 0.6, cx = x, cy = y;
    const n = 6 + Math.floor(L / 25);
    for (let i = 1; i <= n; i++) { a += (r() - 0.5) * 0.7; cx += Math.cos(a) * (L / n); cy += Math.sin(a) * (L / n); pts.push([cx, cy]); }
    ink(g, pts, { w, a: 0.75, rng: r, color: c, taper: [0.05, 0.6], wobble: 0.4 });
    if (depth < 3 && L > 40) for (let i = 0; i < 2; i++) if (r() < 0.7) { const k = 1 + Math.floor(r() * (n - 2)); this.root(g, pts[k][0], pts[k][1], L * (0.35 + 0.3 * r()), pal, { ...o, depth: depth + 1, w: w * 0.6 }); }
    return pts;
  },

  /** Soil cross-section (for underground scenes): layered earth with stones and roots. */
  soil(g, x, y, w, h, pal, o = {}) {
    const r = R(o), layers = o.layers ?? 4;
    const cols = [mix(pg('rawSienna'), pg('burntUmber'), 0.3), mix(pg('burntUmber'), pg('ochre'), 0.3), mix(pg('burntUmber'), pg('sepia'), 0.4), mix(pg('sepia'), pg('indigo'), 0.3)];
    for (let i = 0; i < layers; i++) {
      const y0 = y + (h * i) / layers, band = [];
      for (let xx = x; xx <= x + w; xx += 16) band.push([xx, y0 + (fbm1(xx * 0.005 + i * 5, 3, i) - 0.5) * (h / layers) * 0.5]);
      const poly = band.concat([[x + w, y + h + 10], [x, y + h + 10]]);
      wash(g, poly, cols[i % cols.length], { a: 0.5, rng: r, edge: 0.5, gran: 0.7, layers: 2, jitter: 0.01 });
    }
    const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    scumble(g, pts, pg('sepia'), { a: 0.12, rng: r, angle: 0.05, len: 10, w: 1, density: 0.4 });
    spatter(g, x + w / 2, y + h / 2, Math.max(w, h) * 0.6, pg('sepia'), { n: Math.floor(w * h / 4000), size: 1.3, a: 0.3, rng: r });
    const stones = Math.floor((w * h) / 20000);
    for (let i = 0; i < stones; i++) { const sw = 6 + 16 * r(), sx = x + r() * w, sy = y + r() * h; wash(g, blob(sx, sy, sw, sw * 0.6, { rng: r, wobble: 0.3, n: 9, rot: r() * 3 }), pal.rock, { a: 0.5, rng: r, edge: 0.6, gran: 0.5, layers: 1 }); }
    return pts;
  },
};
