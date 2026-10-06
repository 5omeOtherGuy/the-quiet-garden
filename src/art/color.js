// Colour as pigment. Colours are [r,g,b] in 0..1 (sRGB). Mixing is subtractive-ish (geometric mean in
// linear light), so ultramarine + cadmium yellow gives a green and not a grey, like real paint.
import { clamp, lerp } from './rng.js';

export const PAPER = [0.975, 0.955, 0.905]; // warm cold-press white

// A watercolourist's limited box. gran = granulation strength, stain = how much it sinks in (edge darkening).
export const PIGMENTS = {
  ultramarine:    { rgb: [0.18, 0.26, 0.62], gran: 0.9, stain: 0.3 },
  cobalt:         { rgb: [0.24, 0.42, 0.74], gran: 0.7, stain: 0.3 },
  cerulean:       { rgb: [0.36, 0.62, 0.80], gran: 0.8, stain: 0.2 },
  indigo:         { rgb: [0.12, 0.16, 0.30], gran: 0.3, stain: 0.7 },
  paynes:         { rgb: [0.28, 0.33, 0.42], gran: 0.4, stain: 0.5 },
  viridian:       { rgb: [0.12, 0.46, 0.40], gran: 0.3, stain: 0.6 },
  sap:            { rgb: [0.36, 0.50, 0.18], gran: 0.2, stain: 0.7 },
  olive:          { rgb: [0.46, 0.48, 0.22], gran: 0.3, stain: 0.5 },
  hookers:        { rgb: [0.22, 0.38, 0.22], gran: 0.3, stain: 0.6 },
  cadYellow:      { rgb: [0.96, 0.78, 0.12], gran: 0.1, stain: 0.5 },
  lemon:          { rgb: [0.97, 0.90, 0.40], gran: 0.1, stain: 0.3 },
  ochre:          { rgb: [0.80, 0.62, 0.28], gran: 0.6, stain: 0.4 },
  rawSienna:      { rgb: [0.74, 0.52, 0.22], gran: 0.6, stain: 0.5 },
  burntSienna:    { rgb: [0.60, 0.32, 0.17], gran: 0.4, stain: 0.6 },
  burntUmber:     { rgb: [0.38, 0.26, 0.17], gran: 0.5, stain: 0.6 },
  sepia:          { rgb: [0.30, 0.22, 0.15], gran: 0.3, stain: 0.8 },
  cadOrange:      { rgb: [0.95, 0.52, 0.14], gran: 0.1, stain: 0.6 },
  cadRed:         { rgb: [0.84, 0.20, 0.14], gran: 0.2, stain: 0.6 },
  alizarin:       { rgb: [0.62, 0.12, 0.22], gran: 0.1, stain: 0.9 },
  roseMadder:     { rgb: [0.86, 0.42, 0.52], gran: 0.2, stain: 0.5 },
  violet:         { rgb: [0.42, 0.30, 0.58], gran: 0.6, stain: 0.5 },
  lavender:       { rgb: [0.66, 0.60, 0.80], gran: 0.4, stain: 0.3 },
  neutralTint:    { rgb: [0.36, 0.34, 0.38], gran: 0.3, stain: 0.6 },
  ink:            { rgb: [0.20, 0.16, 0.14], gran: 0.0, stain: 1.0 },
  white:          { rgb: [0.99, 0.98, 0.96], gran: 0.0, stain: 0.0 },
};

export const pig = (name) => PIGMENTS[name].rgb;

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** subtractive pigment mix: geometric mean in linear light, t = share of b */
export function mix(a, b, t = 0.5) {
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const la = Math.max(1e-4, toLin(a[i])), lb = Math.max(1e-4, toLin(b[i]));
    out[i] = toSrgb(Math.exp(Math.log(la) * (1 - t) + Math.log(lb) * t));
  }
  return out;
}
/** plain additive lerp (light, not paint) */
export const lerpRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/** dilute with water: toward paper */
export const dilute = (c, t) => lerpRgb(c, PAPER, t);
/** thicker: toward its own dark */
export const deepen = (c, t) => [c[0] * (1 - t * 0.7), c[1] * (1 - t * 0.75), c[2] * (1 - t * 0.6)];
export const warm = (c, t) => mix(c, PIGMENTS.cadOrange.rgb, t * 0.5);
export const cool = (c, t) => mix(c, PIGMENTS.cobalt.rgb, t * 0.5);

export function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}
export function rgb2hsl(c) {
  const [r, g, b] = c, max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function shiftHue(c, deg) { const [h, s, l] = rgb2hsl(c); return hsl2rgb(h + deg, s, l); }
export function saturate(c, k) { const [h, s, l] = rgb2hsl(c); return hsl2rgb(h, clamp(s * k, 0, 1), l); }
export function lum(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }

export function css(c, a = 1) {
  if (typeof c === 'string') return c;
  return `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a})`;
}
export function parse(c) {
  if (Array.isArray(c)) return c;
  if (typeof c !== 'string') return [0.5, 0.5, 0.5];
  if (c[0] === '#') {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  const m = c.match(/[\d.]+/g);
  return m ? [+m[0] / 255, +m[1] / 255, +m[2] / 255] : [0.5, 0.5, 0.5];
}
