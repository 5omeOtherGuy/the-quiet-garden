// Weather, painted the way the picture is painted: soft round specks of snow (small opaque dots far off, large
// pale out-of-focus discs close by), rain as fine pale flicks with spatter and rings where it lands, mist as soft
// drifting washes, a dark wet-in-wet lid of cloud for rain and storm, pollen specks in still, clear air.
// Drawn after the scene in world units. Stateless: every particle is a function of (index, t), so a frozen clock
// gives a stable picture and nothing is allocated per frame.
//
// Cost rule (tablet, 120 fps): nothing here builds a path or a gradient per frame. Everything is a stamp (drawImage)
// of a small picture made once (a dot, a disc, a ring, a sweep, a strip of gradient) or of a rain sheet made once
// and scrolled, so the GPU gets a few batches of textured quads and no path to rasterise, and the page makes few
// calls (a storm: about 210 stamps a frame).
import { TAU, hash2 } from './rng.js';
import { noise1 } from './noise.js';
import { css, PAPER, PIGMENTS, dilute, lerpRgb } from './color.js';
import { nightness } from './palette.js';
import { light } from './lights.js';
import { compositor } from './compositor.js';

const LEAF = [PIGMENTS.ochre.rgb, PIGMENTS.burntSienna.rgb, PIGMENTS.cadOrange.rgb, PIGMENTS.olive.rgb];
const PETAL = [PIGMENTS.roseMadder.rgb, dilute(PIGMENTS.roseMadder.rgb, 0.5), PAPER];

// ---- small pictures, made once per colour and kind and kept as bitmaps that never change (so the GPU keeps each as
// one texture); the cache is emptied at the start of a frame when it has grown: colours drift with the dusk
const made = new Map(), OFF = typeof OffscreenCanvas !== 'undefined' && !!OffscreenCanvas.prototype.transferToImageBitmap;
function picture(w, h, color, paint) {
  let c; if (OFF) c = new OffscreenCanvas(w, h); else { c = document.createElement('canvas'); c.width = w; c.height = h; }
  paint(c.getContext('2d'), (a) => `rgba(${color},${a})`);
  return OFF ? c.transferToImageBitmap() : c;
}
const drop = (c) => { if (c.close) c.close(); else c.width = 0; };
function sprite(kind, color, w, h, paint) {
  const k = kind + '|' + color; let c = made.get(k);
  if (!c) made.set(k, c = picture(w, h, color, paint));
  return c;
}
// the "out of focus" speck and the wet blot (hard: a brighter heart)
const disc = (color, hard = 0) => sprite(hard ? 'hard' : 'soft', color, 64, 64, (g, rgba) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (hard) { gr.addColorStop(0, rgba(1)); gr.addColorStop(0.62, rgba(0.95)); gr.addColorStop(0.8, rgba(0.35)); gr.addColorStop(1, rgba(0)); }
  else { gr.addColorStop(0, rgba(0.9)); gr.addColorStop(0.45, rgba(0.5)); gr.addColorStop(0.8, rgba(0.12)); gr.addColorStop(1, rgba(0)); }
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
// one fine flick of the brush (a rain drop on its way): an upright line with round ends, stretched to its length
const flick = (color) => sprite('flick', color, 4, 64, (g, rgba) => { g.strokeStyle = rgba(1); g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(2, 2); g.lineTo(2, 62); g.stroke(); });
// a small opaque round dot of gouache (far snow, rain spatter)
// (two sizes, so that a small one is not shrunk from a large picture: stamp it 2.42 times its radius wide)
const dot = (color, small) => sprite(small ? 'dot8' : 'dot', color, small ? 8 : 16, small ? 8 : 16, (g, rgba) => { const c = small ? 4 : 8; g.fillStyle = rgba(1); g.beginPath(); g.arc(c, c, c * 0.825, 0, TAU); g.fill(); });
// the ring a drop leaves where it lands, seen flat: the line keeps its width while the ring widens, so there are
// three pictures, from the young ring (nearly a blot) to the wide thin one. The outer edge is 30 px from the middle.
const RING = [0.34, 0.16, 0.08];                                 // line width as a part of the radius
const ring = (color, i) => sprite('ring' + i, color, 64, 24, (g, rgba) => {
  const rx = 30 / (1 + RING[i] / 2); g.strokeStyle = rgba(1); g.lineWidth = RING[i] * rx; g.beginPath(); g.ellipse(32, 12, rx, rx * 0.35, 0, 0, TAU); g.stroke();
});
// one broad, faint sweep of a damp brush (wind): tapered at both ends, soft across
const sweep = (color) => sprite('sweep', color, 256, 32, (g, rgba) => {
  const across = g.createLinearGradient(0, 0, 0, 32); across.addColorStop(0, rgba(0)); across.addColorStop(0.5, rgba(1)); across.addColorStop(1, rgba(0));
  g.fillStyle = across; g.fillRect(0, 0, 256, 32);
  const along = g.createLinearGradient(0, 0, 256, 0); along.addColorStop(0, 'rgba(0,0,0,0)'); along.addColorStop(0.3, 'rgba(0,0,0,1)'); along.addColorStop(0.7, 'rgba(0,0,0,1)'); along.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-in'; g.fillStyle = along; g.fillRect(0, 0, 256, 32);
});
// a blown leaf or petal: a small flat oval
const fleck = (color) => sprite('fleck', color, 32, 18, (g, rgba) => { g.fillStyle = rgba(1); g.beginPath(); g.ellipse(16, 9, 15, 8, 0, 0, TAU); g.fill(); });
// a vertical strip of gradient, stretched over the sheet: stops [[position 0..1, alpha], ...]
const strip = (name, color, stops) => sprite(name, color, 2, 128, (g, rgba) => {
  const gr = g.createLinearGradient(0, 0, 0, 128); for (const [p, a] of stops) gr.addColorStop(p, rgba(a)); g.fillStyle = gr; g.fillRect(0, 0, 2, 128);
});
const key = (c) => `${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)}`;
const step = (x, n) => Math.round(x * n) / n;                   // colours follow the night in a few steps, so the pictures can be kept

// ---- the rain sheet: fine pale flicks in loose bands, painted once on a sheet that repeats, then scrolled: few
// stamps per frame (the page's own time is the scarce thing on the tablet), but two sheets that each cover the view.
// depth 0: far (thin, short, faint); depth 1: near (broader, longer). storm: denser and longer.
// Only the sheets of the colour and scale in use are kept (at most four).
const TW = 512, TH = 768;                                         // one sheet in world units
const sheets = { key: '', list: [] };
function rainSheet(color, depth, storm, sc) {
  const key = color + '@' + sc, i = depth * 2 + storm;
  if (sheets.key !== key) { for (const c of sheets.list) if (c) drop(c); sheets.key = key; sheets.list = []; }
  return sheets.list[i] || (sheets.list[i] = picture(Math.round(TW * sc), Math.round(TH * sc), color, (g, rgba) => {
    g.scale(g.canvas.width / TW, g.canvas.height / TH); g.lineCap = 'round'; g.lineWidth = [0.9, 1.7][depth];
    const n = storm ? 84 : 44, base = (storm ? 64 : 42) * (0.7 + 0.5 * depth), seed = 11 + depth * 7 + storm * 3;
    for (let i = 0; i < n; i++) {
      const h = hash2(i, seed, 11), h2 = hash2(i, seed, 12), h3 = hash2(i, seed, 14);
      if (noise1(h * 16 + depth, 5 + storm) < 0.3) continue;                        // rain falls in bands, not evenly
      const x = 2 + h * (TW - 4), y = h2 * TH, len = base * (0.4 + 1.2 * h3);
      g.strokeStyle = rgba([0.3, 0.4][depth] * (0.65 + 0.35 * hash2(i, seed, 15)));
      for (const yy of y + len > TH ? [y, y - TH] : [y]) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x, yy + len); g.stroke(); }
    }
  }));
}

// A small painted cloud for the engine's rain cloud where a view has no 'cloud' region (core/clouds.js drawCloud):
// soft round puffs of paper white over a warm grey, a blue-grey underside; darkness 0..1 greys it for rain; bump
// squashes it when tapped. Stamps only (no gradient per frame).
const PUFFS = [[-0.32, 0.06, 0.2], [-0.12, -0.1, 0.27], [0.14, -0.05, 0.25], [0.34, 0.08, 0.19], [0.02, 0.1, 0.23]];
export function cloud(g, x, y, w, dk = 0, bump = 1) {
  const lit = key(lerpRgb([0.996, 0.988, 0.968], [0.69, 0.7, 0.74], dk)), mid = key(lerpRgb([0.92, 0.9, 0.87], [0.54, 0.55, 0.6], dk)), shade = key(lerpRgb([0.77, 0.75, 0.73], [0.36, 0.37, 0.43], dk));
  const M = g.getTransform(); g.translate(x, y); g.scale(bump, 1 / bump);
  g.globalAlpha = 0.45; g.drawImage(disc(shade), -w * 0.62, w * 0.08 - w * 0.2, w * 1.24, w * 0.4);   // the flat underside
  for (const [px, py, pr] of PUFFS) {
    const cx = px * w, cy = py * w, r = pr * w;
    g.globalAlpha = 0.92; g.drawImage(disc(mid, 1), cx - r * 1.05, cy - r * 1.05, r * 2.1, r * 2.1);   // the firmer disc: a puff with an edge
    g.globalAlpha = 0.85; g.drawImage(disc(lit, 1), cx - r * 0.3 - r * 0.72, cy - r * 0.4 - r * 0.72, r * 1.44, r * 1.44);
  }
  g.globalAlpha = 1; g.setTransform(M);
}

export const weather = {
  stats: { ms: 0 },
  /** Parts left out, for measuring what each costs: a string of names out of "lid fog lightning rain spatter rings snow wind motes". */
  skip: '',
  /** Rain as two scrolled sheets (true) or as single flick stamps (false: about 700 more stamps in a storm, but
   *  nothing that covers the view). Sheets are the default; the switch is for comparing the two on a device. */
  sheets: true,
  /** g: world-unit context; env; view {x,y,w,h}; t seconds */
  draw(g, env = {}, view, t = 0) {
    const t0 = performance.now(), on = (part) => !this.skip || !this.skip.includes(part);
    if (made.size > 96) { for (const c of made.values()) drop(c); made.clear(); }
    const wet = env.wet ?? 0, snowy = env.snowy ?? 0, windy = env.windy ?? 0, foggy = env.foggy ?? 0, stormy = env.stormy ?? 0;
    const W = view.w, H = view.h, X = view.x, Y = view.y, dark = nightness(env), night = step(dark, 24);
    const gust = 0.6 + 0.4 * noise1(t * 0.35, 3);
    const wind = (0.25 + windy * 1.2 + stormy * 0.8) * gust; // horizontal drift factor
    g.save();
    const lid = Math.max(wet * 0.8, stormy, snowy * 0.35);
    // a painted place paints the cloud into its sky itself (place.draw); then the lid is only the shade under it
    const veiled = compositor.look && compositor.look.veil;
    if (lid > 0.01 && on('lid')) this._lid(g, X, Y, W, H, t, veiled ? lid * 0.5 : lid, stormy, night, veiled);
    if (foggy > 0.01 && on('fog')) this._fog(g, X, Y, W, H, t, foggy, night);
    if (stormy > 0.3 && on('lightning')) this._lightning(g, X, Y, W, H, t, stormy);
    if (wet > 0.01) this._rain(g, X, Y, W, H, t, wet, stormy, wind, night, on);
    if (snowy > 0.01 && on('snow')) this._snow(g, X, Y, W, H, t, snowy, wind, night);
    if (windy > 0.12 && on('wind')) this._wind(g, X, Y, W, H, t, windy, env, night);
    const still = 1 - Math.max(wet, snowy, foggy, stormy, windy);
    if (still > 0.05 && dark < 0.6 && env.season !== 'winter' && on('motes')) this._motes(g, X, Y, W, H, t, still * (1 - dark / 0.6));
    g.restore();
    this.stats.ms += (performance.now() - t0 - this.stats.ms) * 0.1;
  },

  // the cloud lid: a dark wash let in from the top edge, with slow soft-edged shapes, as if painted wet in wet
  _lid(g, X, Y, W, H, t, k, stormy, night, flat) {
    const c = lerpRgb(lerpRgb([0.5, 0.55, 0.68], [0.3, 0.32, 0.47], step(stormy, 8)), [0.2, 0.22, 0.4], night * 0.5);
    // Over a moving background the scene is a transparent sheet (compositor.backdrop) that a multiply glaze cannot
    // reach: there the same shade is laid as a dark veil of the matching depth.
    const over = !!compositor.backdrop, lo = Math.min(c[0], c[1], c[2]), q = over ? 1 - lo : 1, cc = over ? c.map((x) => 0.7 * (x - lo) / (1 - lo)) : c;
    g.globalCompositeOperation = over ? 'source-over' : 'multiply';
    g.globalAlpha = Math.min(1, k * q); g.drawImage(strip('lid', key(cc), [[0, 0.86], [0.4, 0.6], [0.75, 0.22], [1, 0]]), X, Y, W, H * 0.8);
    const d = flat ? null : disc(key(cc));
    for (let i = 0; i < (flat ? 0 : 9); i++) {
      const h = hash2(i, 1, 61), h2 = hash2(i, 2, 61), span = W + 1400, rx = 380 + 420 * h2, ry = 110 + 150 * h;
      const x = X - 700 + ((h * span + t * (5 + 9 * h2) * (1 + stormy)) % span), y = Y + H * (0.02 + 0.3 * h2 * h2) + Math.sin(t * 0.1 + i) * 14;
      g.globalAlpha = (0.3 + 0.35 * h) * k * q; g.drawImage(d, x - rx, y - ry, rx * 2, ry * 2);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  },

  _rain(g, X, Y, W, H, t, k, stormy, wind, night, on) {
    const col = lerpRgb([0.9, 0.94, 1], [0.6, 0.7, 0.95], step(night, 4) * 0.7), ck = key(col), a = Math.min(1, k * 1.5);
    // fine pale flicks of the brush, in loose bands; two depths. The whole fall is sheared with the wind, so every
    // flick leans the way it travels and drifts sideways as it drops.
    const M = g.getTransform(), slant = wind * 0.32, x0 = X - slant * H, span = W + slant * H;
    g.transform(1, 0, slant, 1, -slant * Y, 0);                      // x' = x + slant * (y - Y)
    if (!on('rain')) { /* left out */ } else if (this.sheets) this._sheets(g, x0, Y, span, H, t, a, stormy, ck, M);
    else {
      const fl = flick(ck), n = Math.floor((110 + 300 * k + 380 * stormy) * (W / 1600) / 2), speed = 1250 + 700 * stormy;
      for (let layer = 0; layer < 2; layer++) {
        const lw = [0.9, 1.7][layer], base = (16 + 26 * k + 22 * stormy) * (0.7 + 0.5 * layer); g.globalAlpha = [0.3, 0.4][layer] * a;
        for (let i = 0; i < n; i++) {
          const h2 = hash2(i, layer, 12), len = base * (0.4 + 1.2 * hash2(i, layer, 14)), fall = h2 * H + t * speed * (0.75 + 0.5 * h2);
          const cyc = Math.floor(fall / (H + len)), xf = hash2(i, layer + 2 * (cyc & 255), 11);   // a new place for every fall
          if (noise1(xf * 40 + layer, 5) < 0.3) continue;                           // rain falls in bands, not evenly
          g.drawImage(fl, x0 + xf * span - lw, Y + fall - cyc * (H + len) - len, lw * 2, len);
        }
      }
    }
    g.setTransform(M);
    // spatter: round drops flicked across the sheet, each seen for a moment
    const d = dot(ck), m = on('spatter') ? Math.floor((30 + 50 * k + 40 * stormy) * (W / 1600)) : 0; g.globalAlpha = 0.5 * Math.min(1, k * 1.3);
    for (let i = 0; i < m; i++) {
      const cell = Math.floor(t * 7 + hash2(i, 3, 15) * 7), h = hash2(i, cell, 16), h2 = hash2(i, cell, 17), r = (1 + 2.4 * hash2(i, cell, 18) ** 2) * 1.21;
      g.drawImage(d, X + h * W - r, Y + h2 * H - r, r * 2, r * 2);
    }
    // where it lands: small pale rings low in the picture
    const rgs = [ring(ck, 0), ring(ck, 1), ring(ck, 2)], q = on('rings') ? Math.floor(46 * k * (W / 1600)) : 0;
    for (let i = 0; i < q; i++) {
      const h = hash2(i, 7, 13), per = 0.9 + h * 0.5, ph = ((t + h * 10) % per) / per, cyc = Math.floor((t + h * 10) / per);
      const x = X + hash2(i, cyc, 13) * W, y = Y + H * (0.72 + 0.27 * hash2(i, cyc, 19)), s = 3 + ph * 13, u = (s + 0.55) / 30;
      g.globalAlpha = 0.5 * k * (1 - ph); g.drawImage(rgs[s < 5 ? 0 : s < 9.5 ? 1 : 2], x - 32 * u, y - 12 * u, 64 * u, 24 * u);
    }
    g.globalAlpha = 1;
  },

  // the rain as two scrolled sheets, far and near (x0, span: the sheared strip that covers the view); in a storm the
  // denser, longer sheets fade in over the rain's
  _sheets(g, x0, Y, span, H, t, a, stormy, ck, M) {
    const sc = Math.min(1.6, Math.max(0.5, step(Math.hypot(M.a, M.b), 10))), cols = Math.ceil(span / TW) + 1;
    for (let storm = 0; storm < 2; storm++) {
      const fade = storm ? stormy : 1 - stormy; if (fade < 0.03) continue;
      for (let depth = 0; depth < 2; depth++) {
        const sheet = rainSheet(ck, depth, storm, sc), speed = (1250 + 700 * stormy) * [0.8, 1.15][depth], oy = (t * speed) % TH;
        g.globalAlpha = a * fade;
        const c0 = Math.floor((x0 + depth * 190) / TW);                              // the near sheet is set off sideways against the far one
        for (let i = 0; i < cols; i++) {
          const x = (c0 + i) * TW - depth * 190, shift = ((oy + (c0 + i) * 0.37 * TH) % TH + TH) % TH;   // neighbours are not copies side by side
          for (let y = Y - TH + shift; y < Y + H; y += TH) g.drawImage(sheet, x, y, TW + 0.5, TH + 0.5);
        }
      }
    }
  },

  _snow(g, X, Y, W, H, t, k, wind, night) {
    const col = lerpRgb([1, 1, 1], [0.74, 0.8, 0.97], step(night, 8) * 0.75), ck = key(col);
    // far and middle: small opaque round dots of gouache
    for (let layer = 0; layer < 2; layer++) {
      const n = Math.floor([150, 80][layer] * (0.35 + 0.65 * k) * (W / 1600));
      const size = [1.5, 3.2][layer] * 1.21, speed = [42, 68][layer], drift = [14, 26][layer], d = dot(ck, layer === 0);
      g.globalAlpha = [0.7, 0.9][layer] * Math.min(1, k * 1.5);
      for (let i = 0; i < n; i++) {
        const h = hash2(i, layer, 21), h2 = hash2(i, layer, 22), h3 = hash2(i, layer, 23);
        const y = Y + (h2 * (H + 40) + t * speed * (0.8 + 0.4 * h3)) % (H + 40) - 20;
        const x = X + ((h * W * 1.3 + t * speed * wind * 0.5 + Math.sin(t * (0.6 + h3) + h * 9) * drift) % (W * 1.3) + W * 1.3) % (W * 1.3) - W * 0.15;
        const s = size * (0.6 + 0.9 * h3); g.drawImage(d, x - s, y - s, s * 2, s * 2);
      }
    }
    // near: large soft discs, pale and out of focus, a few with a brighter heart
    const n = Math.floor(26 * (0.3 + 0.7 * k) * (W / 1600)), soft = disc(ck), hard = disc(ck, 1);
    for (let i = 0; i < n; i++) {
      const h = hash2(i, 5, 21), h2 = hash2(i, 5, 22), h3 = hash2(i, 5, 23), speed = 95 + 50 * h3;
      const y = Y + (h2 * (H + 120) + t * speed) % (H + 120) - 60;
      const x = X + ((h * W * 1.3 + t * speed * wind * 0.6 + Math.sin(t * (0.5 + h3) + h * 9) * 46) % (W * 1.3) + W * 1.3) % (W * 1.3) - W * 0.15;
      const s = 7 + 17 * h3 * h3;
      g.globalAlpha = (0.3 + 0.4 * h) * Math.min(1, k * 1.5); g.drawImage(h > 0.6 ? hard : soft, x - s, y - s, s * 2, s * 2);
    }
    g.globalAlpha = 1;
  },

  _wind(g, X, Y, W, H, t, k, env, night) {
    // pale sweeping streaks: broad, faint sweeps of a damp brush, not hairlines
    night = step(night, 8);
    const sw = sweep(key(lerpRgb(PAPER, [0.7, 0.76, 0.95], night * 0.7))), n = Math.floor(6 + 14 * k), M = g.getTransform();
    for (let i = 0; i < n; i++) {
      const h = hash2(i, 1, 31), h2 = hash2(i, 2, 31), period = 3 + h2 * 3, ph = ((t + h * 20) % period) / period;
      const x0 = X - 200 + ph * (W + 400) * 1.2 - 200, y0 = Y + h2 * H * 0.9, L = 120 + h * 220, wd = (5 + h * 9) * 2.2;
      g.globalAlpha = 0.1 * k * Math.sin(ph * Math.PI);
      g.setTransform(M); g.translate(x0, y0); g.rotate((h - 0.5) * 0.24); g.drawImage(sw, 0, -wd / 2, L, wd);
    }
    g.setTransform(M);
    // blown leaves (autumn) or petals (spring) or snow-dust (winter)
    const kind = env.season === 'autumn' ? LEAF : env.season === 'spring' ? PETAL : env.season === 'winter' ? [PAPER] : null;
    if (!kind) { g.globalAlpha = 1; return; }
    const m = Math.floor(10 + 30 * k), flecks = kind.map((c) => fleck(key(lerpRgb(c, [0.3, 0.36, 0.6], night * 0.6))));
    for (let i = 0; i < m; i++) {
      const h = hash2(i, 3, 32), h2 = hash2(i, 4, 32), h3 = hash2(i, 5, 32), period = 4 + h2 * 4, ph = ((t * (0.7 + h3 * 0.6) + h * 20) % period) / period;
      const x = X - 100 + ph * (W + 200), y = Y + H * (0.15 + 0.75 * h2) + Math.sin(ph * 12 + h * 7) * 35 * (0.5 + h3), s = 3 + h3 * 4;
      g.globalAlpha = 0.85 * k * Math.sin(ph * Math.PI);
      g.setTransform(M); g.translate(x, y); g.rotate(ph * 20 + h * 6); g.drawImage(flecks[i % flecks.length], -s * 1.6, -s * 0.9, s * 3.2, s * 1.8);
    }
    g.setTransform(M); g.globalAlpha = 1;
  },

  // mist: a veil that thickens towards the ground, and slow soft washes drifting through it
  _fog(g, X, Y, W, H, t, k, night) {
    const c = lerpRgb([0.95, 0.94, 0.92], [0.3, 0.37, 0.58], night), ck = key(c), d = disc(ck);
    g.globalAlpha = k; g.drawImage(strip('fog', ck, [[0, 0], [0.5, 0.34], [1, 0.22]]), X, Y + H * 0.15, W, H * 0.85);
    for (let i = 0; i < 12; i++) {
      const h = hash2(i, 1, 41), h2 = hash2(i, 2, 41), span = W + 1600, rx = 420 + 520 * h, ry = 60 + 110 * h2;
      const x = X - 800 + ((h2 * span + t * (7 + 16 * h)) % span), y = Y + H * (0.36 + 0.6 * hash2(i, 3, 41)) + Math.sin(t * 0.13 + i * 2) * 12;
      g.globalAlpha = (0.3 + 0.4 * h2) * k; g.drawImage(d, x - rx, y - ry, rx * 2, ry * 2);
    }
    g.globalAlpha = 1;
  },

  // pollen and light: a few soft round specks adrift in still, clear air
  _motes(g, X, Y, W, H, t, k) {
    const d = disc('255,246,214'), n = Math.floor(30 * (W / 1600));
    for (let i = 0; i < n; i++) {
      const h = hash2(i, 1, 71), h2 = hash2(i, 2, 71), h3 = hash2(i, 3, 71);
      const x = X + ((h * W * 1.2 + t * (6 + 10 * h3) + Math.sin(t * 0.4 + h * 20) * 30) % (W * 1.2)) - W * 0.1;
      const y = Y + H * (0.25 + 0.7 * h2) + Math.sin(t * (0.3 + 0.3 * h3) + h2 * 20) * 26, s = 2.5 + 8 * h3 * h3;
      g.globalAlpha = k * (0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * (0.8 + h) + h * 30))) * (h3 > 0.7 ? 0.6 : 1);
      g.drawImage(d, x - s, y - s, s * 2, s * 2);
    }
    g.globalAlpha = 1;
  },

  // lightning: the cloud lights up from inside (a cold glow that the grade does not dim) and the sheet pales
  _lightning(g, X, Y, W, H, t, k) {
    const period = 5.5, cell = Math.floor(t / period), h = hash2(cell, 0, 51);
    if (h > 0.5 * k) return;
    const ph = (t % period) / 0.42;
    if (ph > 1) return;
    const flash = Math.max(0, Math.sin(ph * Math.PI)) * (ph < 0.25 ? 1 : ph < 0.4 ? 0.25 : 0.7);
    light(g, X + W * (0.15 + 0.7 * hash2(cell, 1, 51)), Y + H * 0.12, W * 0.55, [0.82, 0.85, 1], 0.95 * flash);
    g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.16 * flash;
    g.fillStyle = css(dilute(PIGMENTS.lavender.rgb, 0.8)); g.fillRect(X, Y, W, H);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  },
};
