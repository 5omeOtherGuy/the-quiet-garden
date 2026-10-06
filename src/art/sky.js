// Skies: graded washes, lifted clouds with shaded undersides, sun, moon and stars.
import { TAU, clamp, rng as mkRng } from './rng.js';
import { noise1 } from './noise.js';
import { css, mix, dilute, deepen, lerpRgb, PAPER, PIGMENTS } from './color.js';
import { blob, lift, glaze, granulate, softFill, edge, whiteInk, glow, wash, smoothClosed, jitter, blot, ink, sheet } from './brush.js';

const fallback = mkRng(3);
const R = (o) => o.rng || fallback;
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

export const sky = {
  /**
   * Graded sky wash over rect, laid in long horizontal strokes: deeper at the top, thinning to almost bare paper
   * at the horizon, with the streaks and tide marks of a loaded brush. o: {rng, bands=true, horizonGlow (0..1 warm band near the horizon)}
   */
  paint(g, x, y, w, h, pal, o = {}) {
    const r = R(o), top = pal.skyTop, hor = pal.skyHorizon, night = pal.time === 'night';
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, css(top)); gr.addColorStop(0.4, css(lerpRgb(top, hor, 0.55))); gr.addColorStop(0.8, css(hor)); gr.addColorStop(1, css(lerpRgb(hor, PAPER, night ? 0.1 : 0.45)));
    g.save(); g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    if (o.bands !== false) {
      // the brush went across in bands: some carried more pigment, some more water
      for (let i = 0; i < 6; i++) {
        const py = y + h * (0.05 + 0.75 * r()), px = x + r() * w, light = r() < 0.6;
        blot(g, px, py, w * (0.3 + 0.4 * r()), h * (0.06 + 0.08 * r()), light ? PAPER : deepen(top, 0.1), light ? 0.1 + 0.08 * r() : 0.09, (r() - 0.5) * 0.05);
      }
    }
    if (o.horizonGlow) {
      const hg = g.createLinearGradient(0, y + h * 0.5, 0, y + h);
      const warmC = pal.time === 'dusk' ? mix(PIGMENTS.cadOrange.rgb, PIGMENTS.roseMadder.rgb, 0.35) : mix(PIGMENTS.cadYellow.rgb, PIGMENTS.roseMadder.rgb, 0.4);
      hg.addColorStop(0, css(warmC, 0)); hg.addColorStop(1, css(warmC, 0.3 * o.horizonGlow));
      g.fillStyle = hg; g.fillRect(x, y + h * 0.5, w, h * 0.5);
      for (let i = 0; i < 3; i++) blot(g, x + r() * w, y + h * (0.7 + 0.2 * r()), w * (0.2 + 0.2 * r()), h * 0.03, warmC, 0.16, 0);
    }
    if (night) granulate(g, rect(x, y, w, h * 0.6), 0.1, 2);
    // pooled top edge: the first stroke of the wash dried darker
    g.fillStyle = css(deepen(top, 0.25), 0.1); g.fillRect(x, y, w, 4 + r() * 3);
    g.restore();
  },

  /**
   * Cumulus clouds, each {x, y, s}: y is the flat base, s the width. A cloud is a pile of puffs left white,
   * painted from the top down: every puff turns from a crisp lit top to a wet grey underside, so each bright top
   * stands against the shade of the puff behind. Shadow gathers along the flat base, and the base dissolves
   * into the sky. o: {rng, shade=1 (2 = storm), lit [dx,dy] (where the light comes from)}
   */
  cumulus(g, list, pal, o = {}) {
    const r = R(o), sh = o.shade ?? 1, l0 = o.lit || [-0.5, -0.85], ll = Math.hypot(l0[0], l0[1]) || 1, lx = l0[0] / ll, ly = l0[1] / ll;
    const warm = pal.time === 'dusk' || pal.time === 'dawn', shadeC = sh > 1.4 ? deepen(pal.cloudShade, 0.3) : pal.cloudShade, rim = deepen(pal.skyTop, 0.2);
    const white = lerpRgb(lerpRgb(PAPER, [1, 1, 1], 0.6), shadeC, sh > 1.4 ? 0.25 : 0), al = Math.min(0.92, 0.62 * sh);
    for (const c of list) {
      const s = c.s, n = 4 + Math.floor(s / 100), puffs = [];
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5 + (r() - 0.5) * 0.1, rad = s * (0.07 + 0.1 * Math.cos(t * 2.5) * (0.65 + 0.6 * r()));
        puffs.push({ x: c.x + t * s * 0.88 + lx * s * 0.04, y: c.y - rad * 0.7 - s * 0.17 * Math.max(0, Math.cos(t * 2.8)) * (0.35 + 0.65 * r()), r: rad });
      }
      for (let i = 0; i < 1 + Math.floor(s / 170); i++) puffs.push({ x: c.x + (r() - 0.5) * s * 0.36 + lx * s * 0.08, y: c.y - s * (0.25 + 0.13 * r()), r: s * (0.09 + 0.07 * r()) });
      puffs.sort((p, q) => p.y - q.y);
      const shapes = puffs.map((p) => blob(p.x, p.y, p.r * (1.08 + 0.3 * r()), p.r, { rng: r, wobble: 0.17, n: 20, freq: 3.4, rot: (r() - 0.5) * 0.3 }));
      // where the sky wash stopped against the cloud it dried to a slightly darker line
      g.save(); g.beginPath(); g.rect(c.x - s, c.y - s, s * 2, s - s * 0.1); g.clip();
      g.lineJoin = 'round'; g.strokeStyle = css(rim, 0.2); g.lineWidth = 2.4;
      for (const pl of shapes) { smoothClosed(g, pl); g.stroke(); }
      g.restore();
      sheet(g, c.x - s * 0.66, c.y - s * 0.62, s * 1.32, s * 0.74, (q) => {
        for (let i = 0; i < shapes.length; i++) {
          const p = puffs[i];
          q.save(); smoothClosed(q, shapes[i]); q.fillStyle = css(white); q.fill(); q.clip();
          const gr = q.createLinearGradient(p.x + lx * p.r, p.y + ly * p.r, p.x - lx * p.r * 1.2, p.y - ly * p.r * 1.2);
          gr.addColorStop(0, css(shadeC, 0)); gr.addColorStop(0.3 + 0.1 * r(), css(shadeC, 0)); gr.addColorStop(0.62, css(shadeC, al * 0.6)); gr.addColorStop(1, css(shadeC, al));
          q.fillStyle = gr; q.fillRect(p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
          if (r() < 0.6) blot(q, p.x - lx * p.r * 0.7 + (r() - 0.5) * p.r, p.y - ly * p.r * 0.8, p.r * 0.7, p.r * 0.4, mix(shadeC, warm ? PIGMENTS.roseMadder.rgb : PIGMENTS.cobalt.rgb, 0.4), al * 0.45, 0);
          if (warm) blot(q, p.x + lx * p.r * 0.5, p.y + ly * p.r * 0.5, p.r * 0.9, p.r * 0.6, pal.time === 'dusk' ? PIGMENTS.cadOrange.rgb : PIGMENTS.cadYellow.rgb, 0.22, 0);
          q.restore();
        }
        // shadow gathers along the flat base
        q.globalCompositeOperation = 'source-atop';
        const bg = q.createLinearGradient(0, c.y - s * 0.17, 0, c.y);
        bg.addColorStop(0, css(shadeC, 0)); bg.addColorStop(1, css(mix(shadeC, PIGMENTS.cobalt.rgb, 0.2), al * 0.9));
        q.fillStyle = bg; q.fillRect(c.x - s, c.y - s * 0.17, s * 2, s * 0.3);
        // and the base dissolves into the sky
        q.globalCompositeOperation = 'destination-in';
        const mg = q.createLinearGradient(0, c.y - s * 0.085, 0, c.y + s * 0.012);
        mg.addColorStop(0, 'rgba(0,0,0,1)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
        q.fillStyle = mg; q.fillRect(c.x - s, c.y - s, s * 2, s * 2);
      });
    }
  },

  /** Thin high clouds: streaks of paper left in the wash. list of {x, y, w} */
  wisps(g, list, pal, o = {}) {
    const r = R(o);
    for (const c of list) for (let i = 0; i < 4; i++) blot(g, c.x + (r() - 0.5) * c.w * 0.3, c.y + i * 6 + (r() - 0.5) * 6, c.w * (0.25 + 0.3 * r()), 3 + 4 * r(), PAPER, 0.55, (r() - 0.5) * 0.08);
  },

  /** Sun: lifted disc with a warm glow. */
  sun(g, x, y, rad, pal, o = {}) {
    const r = R(o), warmC = pal.sun || dilute(PIGMENTS.lemon.rgb, 0.5);
    const low = pal.time === 'dawn' || pal.time === 'dusk';
    glow(g, x, y, rad * (low ? 7 : 5), low ? PIGMENTS.cadOrange.rgb : dilute(PIGMENTS.lemon.rgb, 0.5), low ? 0.45 : 0.3);
    g.save(); smoothClosed(g, blob(x, y, rad, rad, { rng: r, wobble: 0.05, n: 24 })); g.fillStyle = css(PAPER, 0.92); g.fill(); g.restore();
    glaze(g, blob(x, y, rad, rad, { rng: r, wobble: 0.05, n: 24 }), warmC, low ? 0.75 : 0.35);
    if (low) edge(g, blob(x, y, rad * 1.02, rad * 1.02, { rng: r, wobble: 0.06 }), PIGMENTS.cadOrange.rgb, { a: 0.35, rng: r, gravity: false });
  },

  /** Moon with a soft halo and faint seas. phase: 0 full .. 1 thin crescent (shadow from the right). */
  moon(g, x, y, rad, pal, o = {}) {
    const r = R(o);
    glow(g, x, y, rad * 6, dilute(PIGMENTS.lavender.rgb, 0.4), 0.28);
    glow(g, x, y, rad * 2.2, PAPER, 0.35);
    g.save(); smoothClosed(g, blob(x, y, rad, rad, { rng: r, wobble: 0.03, n: 28 })); g.fillStyle = css(PAPER, 0.95); g.fill(); g.restore();
    glaze(g, blob(x, y, rad, rad, { rng: r, wobble: 0.03, n: 28 }), dilute(PIGMENTS.lemon.rgb, 0.75), 0.55);
    for (let i = 0; i < 5; i++) glaze(g, blob(x + (r() - 0.5) * rad * 1.1, y + (r() - 0.5) * rad * 1.1, rad * (0.12 + 0.18 * r()), rad * (0.1 + 0.15 * r()), { rng: r, wobble: 0.3 }), PIGMENTS.lavender.rgb, 0.14);
    const ph = o.phase ?? 0.35;
    if (ph > 0.02) {
      const sx = x + rad * (1.6 - ph * 1.1), p = blob(sx, y, rad * 1.1, rad * 1.1, { rng: r, wobble: 0.03, n: 28 });
      g.save(); smoothClosed(g, blob(x, y, rad * 1.02, rad * 1.02, { rng: r, wobble: 0.03, n: 28 })); g.clip();
      smoothClosed(g, p); g.fillStyle = css(pal.skyTop, 0.9); g.fill(); g.restore();
    }
  },

  /** Stars over a rect; density per 100k units^2. */
  stars(g, x, y, w, h, o = {}) {
    const r = R(o), n = Math.floor((w * h) / 100000 * (o.density ?? 14));
    g.save();
    for (let i = 0; i < n; i++) {
      const px = x + r() * w, py = y + Math.pow(r(), 1.4) * h, big = r() < 0.08;
      g.globalAlpha = 0.35 + 0.6 * r();
      g.fillStyle = css(big ? dilute(PIGMENTS.lemon.rgb, 0.6) : PAPER);
      g.beginPath(); g.arc(px, py, big ? 1.6 + r() * 1.4 : 0.7 + r() * 0.9, 0, TAU); g.fill();
      if (big) { g.strokeStyle = css(PAPER, 0.5); g.lineWidth = 0.6; g.beginPath(); g.moveTo(px - 5, py); g.lineTo(px + 5, py); g.moveTo(px, py - 5); g.lineTo(px, py + 5); g.stroke(); }
    }
    g.restore();
  },
};
