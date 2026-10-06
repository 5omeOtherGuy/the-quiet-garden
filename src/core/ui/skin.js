// The engine's paint (owner: engine; the art worker may restyle it). There is no interface on top of the picture:
// the engine paints only touch magic (skin.fx, per frame, world units) and the marks of the ways on (skin.wayMark in
// the simple edition, skin.wayLight in the painted one).
//
// Restyling: art may export `ui` from web/src/art/index.js with any of these painters (same signature); main.js
// calls skin.adopt(art.ui) at boot. `ui.fx` entries replace single fx painters. skin.art is the art API.

import { TAU, clamp } from '../util.js';

export const INK = '#4a3b2c';
export const PAPER = '#efe5d0';
export const FONT = '"IM Fell English", "Iowan Old Style", Georgia, serif';

const glows = new Map();
function glowSprite(color) {
  let c = glows.get(color); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d'), gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  gr.addColorStop(0, 'rgba(255,250,228,1)'); gr.addColorStop(0.28, 'rgba(255,246,214,.9)'); gr.addColorStop(0.5, color); gr.addColorStop(1, 'rgba(255,248,220,0)');
  g.globalAlpha = 0.9; g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
  glows.set(color, c); return c;
}

// ---- the painted edition's ways (skin.wayLight): sprites made once per colour ----------------------------------------
const smoothK = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const WARM = [255, 244, 220];
const rgbOf = (hex) => { const v = parseInt(String(hex).replace('#', ''), 16) || 0xd9b36a; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const mixTo = (c, k) => [0, 1, 2].map((i) => Math.round(c[i] + (WARM[i] - c[i]) * k));
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const wayGlows = new Map(), wayMotes = new Map();   // keyed by colour (no string built per frame)
function wayGlow(color) {
  let c = wayGlows.get(color); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 128;
  // late sun lying on the ground: a small pale core, a wide golden light, the colour of where the way leads at its rim
  const g = c.getContext('2d'), t = mixTo(rgbOf(color), 0.45), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,246,218,.95)'); gr.addColorStop(0.18, 'rgba(255,230,165,.85)'); gr.addColorStop(0.42, 'rgba(255,212,128,.5)');
  gr.addColorStop(0.7, rgba(t, 0.17)); gr.addColorStop(1, rgba(t, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  wayGlows.set(color, c); return c;
}
function wayMote(color, kind) {
  let set = wayMotes.get(color); if (!set) wayMotes.set(color, set = {});
  let c = set[kind]; if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), base = rgbOf(color);
  const halo = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  halo.addColorStop(0, 'rgba(255,238,190,.85)'); halo.addColorStop(0.42, 'rgba(255,220,150,.38)'); halo.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = halo; g.fillRect(0, 0, 64, 64);
  g.translate(32, 32);
  if (kind === 'leaf') {
    const f = mixTo(base, 0.34);
    g.fillStyle = rgba(f, 0.95); g.beginPath(); g.moveTo(0, -19); g.quadraticCurveTo(13, -5, 0, 19); g.quadraticCurveTo(-13, -5, 0, -19); g.fill();
    g.strokeStyle = rgba(base, 0.55); g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, -15); g.quadraticCurveTo(1.5, 2, 0, 18); g.stroke();
    g.fillStyle = 'rgba(255,250,232,.35)'; g.beginPath(); g.ellipse(-3, -5, 3, 7, 0.2, 0, TAU); g.fill();
  } else if (kind === 'petal') {
    const f = mixTo(base, 0.4);
    g.fillStyle = rgba(f, 0.95); g.beginPath(); g.moveTo(0, -17); g.bezierCurveTo(12, -12, 11, 10, 0, 17); g.bezierCurveTo(-11, 10, -12, -12, 0, -17); g.fill();
    g.strokeStyle = rgba(base, 0.4); g.lineWidth = 1.2; g.stroke();
    g.fillStyle = 'rgba(255,252,240,.5)'; g.beginPath(); g.ellipse(-2, -4, 3.5, 7, 0.15, 0, TAU); g.fill();
  } else {
    const f = mixTo(base, 0.45), core = g.createRadialGradient(0, 0, 0, 0, 0, 15);
    core.addColorStop(0, 'rgba(255,251,238,1)'); core.addColorStop(0.35, rgba(f, 0.85)); core.addColorStop(1, rgba(f, 0));
    g.fillStyle = core; g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.fill();
  }
  set[kind] = c; return c;
}

export const skin = {
  art: null,
  INK, PAPER, FONT,

  /** Replace any painter with one from art.ui (same name and signature). */
  adopt(ui) {
    if (!ui || typeof ui !== 'object') return;
    for (const k of Object.keys(ui)) {
      if (k === 'fx' && ui.fx) Object.assign(skin.fx, ui.fx);
      else if (typeof ui[k] === 'function') skin[k] = ui[k];
    }
  },

  // ------------------------------------------------------------------------------------------
  // touch magic, per frame, in world units (no allocation)
  /**
   * A marked way (simple edition, core/help.js): small footprints walking towards a soft breathing glow in the colour of
   * where the way leads. World units; (x, y) the glow, k a size factor (1 for a 1000-high view), (ux, uy) the unit
   * direction the footprints walk in. Drawn every frame over the place, under the weather.
   */
  wayMark(g, x, y, k, color, t, ux = 1, uy = 0) {
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.7);
    g.save();
    g.globalAlpha = 0.75 + 0.25 * breathe;
    const R = (58 + 12 * breathe) * k;
    g.drawImage(glowSprite(color), x - R, y - R, R * 2, R * 2);
    g.globalAlpha = 1;
    g.fillStyle = color; g.strokeStyle = 'rgba(255,250,236,.95)'; g.lineWidth = 3.5 * k;
    g.beginPath(); g.arc(x, y, 12 * k, 0, TAU); g.fill(); g.stroke();
    // footprints: three steps coming in, each one lighting up in turn as if someone walked to the glow
    const px = -uy, py = ux, ang = Math.atan2(uy, ux) + Math.PI / 2;
    g.fillStyle = '#5a4532';
    for (let i = 0; i < 4; i++) {
      const d = (46 + i * 30) * k, side = i % 2 ? 1 : -1;
      const fx = x - ux * d + px * side * 10 * k, fy = y - uy * d + py * side * 10 * k;
      const wave = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 0.9);
      g.globalAlpha = (0.3 + 0.4 * wave) * (1 - i * 0.15);
      g.beginPath(); g.ellipse(fx, fy, 7 * k, 11 * k, ang, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(fx + ux * 11 * k, fy + uy * 11 * k, 4.5 * k, 5 * k, ang, 0, TAU); g.fill();
    }
    g.restore();
  },

  /**
   * A way on to another place, painted edition (core/ways.js; BRIEF 35): part of the painting, not a symbol. A soft warm
   * light breathing slowly (5 s) at the mouth of the way, and a few petals, leaves or motes in the colour of where it
   * leads, floating along the path into it and fading there. World units; (x, y) the mouth, k a size factor (1 for a
   * 1000-high view), kind 'petal' | 'leaf' | 'mote', (ux, uy) the unit direction the path runs into the picture,
   * a the alpha (0..1), seed 0..1 (so two ways never move in step), level 0..1 (when faint, only two motes),
   * still: no motes (reduced motion). Drawn every frame over the weather: one glow and two to four small sprites.
   */
  wayLight(g, x, y, k, color, kind, t, ux, uy, a, seed = 0, level = 1, still = false) {
    if (a < 0.004) return;
    const breathe = 0.5 + 0.5 * Math.sin((t / 5 + seed) * TAU);
    g.save();
    // the light at the mouth: a low, wide glow, as if the sun lay on the ground there
    const R = (84 + 12 * breathe) * k;
    g.globalAlpha = clamp(a * (0.62 + 0.24 * breathe), 0, 1);
    g.drawImage(wayGlow(color), x - R, y - R * 0.74, R * 2, R * 1.48);
    if (!still) {
      // what floats along the path towards the mouth: comes up from nothing, drifts in, fades into the light
      const spr = wayMote(color, kind), px = -uy, py = ux, L = 240 * k;
      for (let i = 0; i < 4; i++) {
        const more = i < 2 ? 1 : smoothK((level - 0.4) / 0.35);
        if (more <= 0.01) continue;
        const P = 6.2 + i * 0.9, u = (t / P + i / 4 + seed * 0.7) % 1;
        const fade = smoothK(u / 0.22) * (1 - smoothK((u - 0.62) / 0.38));
        const ma = a * 0.9 * fade * more;
        if (ma < 0.01) continue;
        const go = 1 - u * (2 - u);                       // eases into the mouth
        const sway = Math.sin(u * TAU * 1.2 + i * 2.1 + seed * 6) * 26 * k * (0.35 + 0.65 * go);
        const mx = x - ux * L * go + px * sway, my = y - uy * L * go + py * sway - 16 * k * Math.sin(Math.PI * u);
        const s = (23 + 7 * ((i * 0.37 + seed) % 1)) * k * (1 - 0.35 * u);
        g.globalAlpha = clamp(ma, 0, 1);
        if (kind === 'mote') { g.drawImage(spr, mx - s, my - s, s * 2, s * 2); continue; }
        g.save();
        g.translate(mx, my); g.rotate(u * 2.4 + i * 1.7 + seed * 5); g.scale(0.35 + 0.65 * Math.abs(Math.cos(u * 5 + i)), 1);   // tumbling
        g.drawImage(spr, -s, -s, s * 2, s * 2);
        g.restore();
      }
    }
    g.restore();
  },

  fx: {
    // 0-4 warm mixed, 5 gold (a singing finger), 6 rain white-blue, 7 leaf gold-green
    COLORS: ['rgb(255,236,170)', 'rgb(255,214,214)', 'rgb(214,236,255)', 'rgb(255,250,236)', 'rgb(220,245,200)',
      'rgb(255,222,130)', 'rgb(205,228,255)', 'rgb(232,226,140)'],
    spark(g, x, y, r, a, ci, rot) {
      const c = skin.fx.COLORS[ci % 8];
      g.globalAlpha = a * 0.16; g.fillStyle = c;
      g.beginPath(); g.arc(x, y, r * 1.8, 0, TAU); g.fill();
      g.globalAlpha = a;
      const cs = Math.cos(rot) * r * 1.7, sn = Math.sin(rot) * r * 1.7, cs2 = Math.cos(rot) * r * 0.35, sn2 = Math.sin(rot) * r * 0.35;
      g.beginPath();
      g.moveTo(x + cs, y + sn); g.lineTo(x - sn2, y + cs2); g.lineTo(x - cs, y - sn); g.lineTo(x + sn2, y - cs2); g.closePath();
      g.moveTo(x - sn, y + cs); g.lineTo(x - cs2, y - sn2); g.lineTo(x + sn, y - cs); g.lineTo(x + cs2, y + sn2); g.closePath();
      g.fill();
    },
    ring(g, x, y, rad, a) {
      g.globalAlpha = a; g.strokeStyle = 'rgb(252,246,230)'; g.lineWidth = 2.2 * a + 0.8;
      g.beginPath(); g.arc(x, y, rad, 0, TAU); g.stroke();
    },
    /** a raindrop's splash: a flat ring */
    drop(g, x, y, rad, a) {
      g.globalAlpha = a; g.strokeStyle = 'rgb(226,238,250)'; g.lineWidth = 1.6 + 1.6 * a;
      g.beginPath(); g.ellipse(x, y, rad, rad * 0.42, 0, 0, TAU); g.stroke();
    },
    /** a soft mist puff */
    puff(g, x, y, rad, a) {
      if (a <= 0.003) return;
      g.globalAlpha = clamp(a, 0, 1); g.fillStyle = 'rgba(246,246,242,.55)';
      g.beginPath(); g.ellipse(x, y, rad, rad * 0.62, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(x + rad * 0.3, y - rad * 0.12, rad * 0.62, rad * 0.4, 0, 0, TAU); g.fill();
    },
    /** k 0..1: one finger is held still; the ring fills as music is about to start */
    hold(g, x, y, k) {
      g.globalAlpha = 0.25 + 0.35 * k; g.strokeStyle = 'rgb(255,246,226)'; g.lineWidth = 3.2;
      g.lineCap = 'round';
      g.beginPath(); g.arc(x, y, 34 - 8 * k, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(k, 0, 1)); g.stroke();
      g.globalAlpha = 0.15 * k; g.fillStyle = 'rgb(255,240,200)'; g.beginPath(); g.arc(x, y, 26, 0, TAU); g.fill();
    },
    /** a gentle glow under a singing finger */
    painting(g, x, y, t) {
      const p = 0.5 + 0.5 * Math.sin(t * 9);
      g.globalAlpha = 0.18 + 0.1 * p; g.fillStyle = 'rgb(255,240,200)';
      g.beginPath(); g.arc(x, y, 30 + 6 * p, 0, TAU); g.fill();
    },
  },
};
