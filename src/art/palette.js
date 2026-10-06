// A limited, harmonious palette per picture, from env (season x time x weather), plus the grading
// parameters the compositor uses. Places paint with palette(env); the compositor tints the whole sheet.
import { PIGMENTS as P, mix, dilute, deepen, lerpRgb, PAPER, saturate } from './color.js';
import { lerp, clamp } from './rng.js';

const pg = (n) => P[n].rgb;

const SEASON = {
  spring: {
    skyTop: dilute(mix(pg('cerulean'), pg('cobalt'), 0.3), 0.15), skyHorizon: dilute(mix(pg('lemon'), pg('cerulean'), 0.55), 0.6),
    far: dilute(mix(pg('lavender'), pg('cobalt'), 0.3), 0.45), mid: dilute(mix(pg('sap'), pg('lemon'), 0.45), 0.25),
    near: mix(pg('sap'), pg('lemon'), 0.3), ground: dilute(mix(pg('ochre'), pg('sap'), 0.5), 0.2),
    foliage: [mix(pg('sap'), pg('lemon'), 0.55), pg('sap'), mix(pg('sap'), pg('viridian'), 0.4), mix(pg('hookers'), pg('indigo'), 0.25)],
    blossom: pg('roseMadder'), accent: pg('cadYellow'), accent2: mix(pg('roseMadder'), pg('white'), 0.4),
    trunk: mix(pg('burntUmber'), pg('paynes'), 0.3), rock: dilute(mix(pg('paynes'), pg('ochre'), 0.3), 0.3),
    waterDeep: mix(pg('cobalt'), pg('viridian'), 0.3), waterShallow: dilute(mix(pg('cerulean'), pg('sap'), 0.3), 0.4),
    snow: 0, bare: 0.15, grassHeight: 0.8,
  },
  summer: {
    skyTop: dilute(pg('cobalt'), 0.3), skyHorizon: dilute(mix(pg('cerulean'), pg('lemon'), 0.12), 0.62),
    far: dilute(mix(pg('cobalt'), pg('viridian'), 0.35), 0.45), mid: dilute(mix(pg('sap'), pg('hookers'), 0.35), 0.2),
    near: mix(pg('sap'), pg('hookers'), 0.3), ground: dilute(mix(pg('ochre'), pg('sap'), 0.35), 0.15),
    foliage: [mix(pg('sap'), pg('cadYellow'), 0.35), pg('sap'), mix(pg('hookers'), pg('sap'), 0.5), mix(pg('hookers'), pg('indigo'), 0.3)],
    blossom: pg('cadRed'), accent: pg('cadYellow'), accent2: pg('violet'),
    trunk: pg('burntUmber'), rock: dilute(mix(pg('paynes'), pg('rawSienna'), 0.35), 0.3),
    waterDeep: mix(pg('cobalt'), pg('ultramarine'), 0.4), waterShallow: dilute(mix(pg('cerulean'), pg('viridian'), 0.3), 0.4),
    snow: 0, bare: 0, grassHeight: 1,
  },
  autumn: {
    skyTop: mix(pg('cobalt'), pg('ochre'), 0.2), skyHorizon: dilute(mix(pg('ochre'), pg('roseMadder'), 0.3), 0.6),
    far: dilute(mix(pg('violet'), pg('ochre'), 0.35), 0.45), mid: dilute(mix(pg('olive'), pg('ochre'), 0.5), 0.2),
    near: mix(pg('olive'), pg('rawSienna'), 0.4), ground: dilute(mix(pg('rawSienna'), pg('burntSienna'), 0.3), 0.15),
    foliage: [pg('cadYellow'), mix(pg('ochre'), pg('cadOrange'), 0.5), pg('burntSienna'), mix(pg('alizarin'), pg('burntUmber'), 0.5)],
    blossom: pg('alizarin'), accent: pg('cadOrange'), accent2: pg('violet'),
    trunk: mix(pg('burntUmber'), pg('sepia'), 0.4), rock: dilute(mix(pg('paynes'), pg('burntUmber'), 0.3), 0.3),
    waterDeep: mix(pg('paynes'), pg('viridian'), 0.4), waterShallow: dilute(mix(pg('ochre'), pg('cerulean'), 0.5), 0.4),
    snow: 0, bare: 0.4, grassHeight: 0.9,
  },
  winter: {
    skyTop: mix(pg('paynes'), pg('cobalt'), 0.4), skyHorizon: dilute(mix(pg('lavender'), pg('ochre'), 0.25), 0.6),
    far: dilute(mix(pg('paynes'), pg('lavender'), 0.5), 0.5), mid: dilute(mix(pg('lavender'), pg('cobalt'), 0.4), 0.7),
    near: dilute(mix(pg('cobalt'), pg('lavender'), 0.5), 0.6), ground: dilute(mix(pg('cobalt'), pg('lavender'), 0.4), 0.75),
    foliage: [dilute(pg('viridian'), 0.3), mix(pg('viridian'), pg('paynes'), 0.5), mix(pg('hookers'), pg('paynes'), 0.5), mix(pg('indigo'), pg('viridian'), 0.4)],
    blossom: pg('cadRed'), accent: pg('cadRed'), accent2: pg('burntSienna'),
    trunk: mix(pg('sepia'), pg('paynes'), 0.4), rock: dilute(mix(pg('paynes'), pg('indigo'), 0.3), 0.35),
    waterDeep: mix(pg('indigo'), pg('paynes'), 0.5), waterShallow: dilute(mix(pg('cobalt'), pg('lavender'), 0.3), 0.5),
    snow: 1, bare: 1, grassHeight: 0.4,
  },
};

const TIME = {
  dawn:  { skyTop: mix(pg('cobalt'), pg('lavender'), 0.5), skyHorizon: dilute(mix(pg('roseMadder'), pg('cadYellow'), 0.4), 0.4), skyMix: 0.7, warm: pg('roseMadder'), warmK: 0.12, light: 0.85, sun: dilute(pg('cadYellow'), 0.3) },
  day:   { skyMix: 0, warmK: 0, light: 1, sun: dilute(pg('lemon'), 0.5) },
  dusk:  { skyTop: mix(pg('violet'), pg('indigo'), 0.5), skyHorizon: dilute(mix(pg('cadOrange'), pg('alizarin'), 0.3), 0.3), skyMix: 0.8, warm: pg('cadOrange'), warmK: 0.18, light: 0.7, sun: pg('cadOrange') },
  night: { skyTop: deepen(pg('indigo'), 0.3), skyHorizon: mix(pg('indigo'), pg('paynes'), 0.6), skyMix: 1, warm: pg('indigo'), warmK: 0.35, light: 0.25, sun: dilute(pg('lemon'), 0.7) },
};

/** The picture's palette for an env. Pure function of the discrete state (season, time, weather). */
export function palette(env = {}) {
  const s = SEASON[env.season] || SEASON.summer, t = TIME[env.time] || TIME.day, w = env.weather || 'clear';
  const p = { ...s, season: env.season || 'summer', time: env.time || 'day', weather: w, paper: PAPER };
  if (t.skyMix) { p.skyTop = lerpRgb(s.skyTop, t.skyTop, t.skyMix); p.skyHorizon = lerpRgb(s.skyHorizon, t.skyHorizon, t.skyMix); }
  if (t.warmK) for (const k of ['far', 'mid', 'near', 'ground', 'rock', 'trunk', 'waterDeep', 'waterShallow']) p[k] = mix(p[k], t.warm, t.warmK);
  if (t.warmK) p.foliage = p.foliage.map((c) => mix(c, t.warm, t.warmK * 0.8));
  p.sun = t.sun; p.light = t.light;
  const grey = pg('paynes');
  if (w === 'rain' || w === 'storm') {
    const k = w === 'storm' ? 0.75 : 0.5;
    p.skyTop = mix(p.skyTop, grey, k); p.skyHorizon = mix(p.skyHorizon, dilute(grey, 0.5), k * 0.8);
    p.far = mix(p.far, grey, 0.35); p.mid = mix(p.mid, grey, 0.2);
  } else if (w === 'fog') {
    const f = dilute(mix(grey, pg('lavender'), 0.4), 0.7);
    p.skyTop = lerpRgb(p.skyTop, f, 0.6); p.skyHorizon = lerpRgb(p.skyHorizon, f, 0.8); p.far = lerpRgb(p.far, f, 0.75); p.mid = lerpRgb(p.mid, f, 0.4);
  } else if (w === 'snow') {
    p.skyTop = lerpRgb(p.skyTop, dilute(mix(grey, pg('lavender'), 0.5), 0.5), 0.5); p.skyHorizon = lerpRgb(p.skyHorizon, dilute(pg('lavender'), 0.7), 0.5);
  }
  p.ink = env.time === 'night' ? mix(pg('ink'), pg('indigo'), 0.35) : mix(pg('ink'), pg('sepia'), 0.3);
  p.shadow = env.time === 'night' ? pg('indigo') : mix(pg('ultramarine'), pg('violet'), 0.4);
  p.lamp = dilute(pg('cadYellow'), 0.35);
  p.lampGlow = pg('cadOrange');
  p.fog = dilute(mix(grey, pg('lavender'), 0.5), 0.8);
  p.snowShade = dilute(mix(pg('cobalt'), pg('lavender'), 0.5), 0.6);
  p.snowK = Math.max(s.snow, w === 'snow' ? 0.85 : 0);
  p.cloudLight = PAPER; p.cloudShade = dilute(mix(grey, env.time === 'dusk' ? pg('roseMadder') : pg('lavender'), 0.5), 0.38);
  return p;
}

// ------------------------------------------------------------ grading for the compositor

const TIME_GRADE = {
  dawn:  { mul: [1.0, 0.95, 0.9], add: [0.03, 0.0, 0.02], sat: 0.95, contrast: 0.96, warmKeep: 0.2 },
  day:   { mul: [1, 1, 1], add: [0, 0, 0], sat: 1, contrast: 1, warmKeep: 0 },
  dusk:  { mul: [1.0, 0.88, 0.76], add: [0.04, 0.0, 0.03], sat: 1.05, contrast: 1.0, warmKeep: 0.4 },
  night: { mul: [0.30, 0.36, 0.58], add: [0.0, 0.01, 0.05], sat: 0.55, contrast: 1.06, warmKeep: 1.0 },
};
const SEASON_GRADE = {
  spring: { mul: [1, 1, 0.98], add: [0.01, 0.01, 0] }, summer: { mul: [1, 1, 1], add: [0, 0, 0] },
  autumn: { mul: [1, 0.96, 0.9], add: [0.01, 0, 0] }, winter: { mul: [0.96, 0.98, 1], add: [0, 0, 0.01] },
};

function lerpGrade(a, b, t) {
  return { mul: lerpRgb(a.mul, b.mul, t), add: lerpRgb(a.add, b.add, t), sat: lerp(a.sat, b.sat, t), contrast: lerp(a.contrast, b.contrast, t), warmKeep: lerp(a.warmKeep, b.warmKeep, t) };
}

/** How much night there is, 0..1 (dawn and dusk lie between), continuous through env.blend/env.prev. */
const NIGHT_K = { dawn: 0.22, day: 0, dusk: 0.42, night: 1 };
export function nightness(env = {}) {
  let m = NIGHT_K[env.time] ?? 0;
  if (env.prev && env.blend !== undefined && env.blend < 1) m = lerp(NIGHT_K[env.prev.time] ?? m, m, clamp(env.blend, 0, 1));
  return m;
}

/**
 * Grading parameters for the whole sheet. Continuous in env.* and in env.blend/env.prev.
 * env.look (set by a painted place through compositor.look): { time: 0..1, tooth: 0..1 }. A painting already carries its
 * season, its paper and, where a night painting exists, its night: the paper and edge passes are off, the season
 * glaze is off, the time-of-day glaze is scaled by look.time, and weather grades lightly (the painted clouds, rain
 * and mist of weather.draw do the rest), so night and storm stay luminous.
 */
export function grade(env = {}) {
  const look = env.look || null;
  let tg = TIME_GRADE[env.time] || TIME_GRADE.day, sg = SEASON_GRADE[env.season] || SEASON_GRADE.summer;
  if (env.prev && env.blend !== undefined && env.blend < 1) {
    const pt = TIME_GRADE[env.prev.time] || tg, ps = SEASON_GRADE[env.prev.season] || sg, k = clamp(env.blend, 0, 1);
    tg = lerpGrade(pt, tg, k); sg = { mul: lerpRgb(ps.mul, sg.mul, k), add: lerpRgb(ps.add, sg.add, k) };
  }
  const wet = env.wet ?? 0, foggy = env.foggy ?? 0, stormy = env.stormy ?? 0, snowy = env.snowy ?? 0, cold = env.cold ?? 0;
  if (look) {
    tg = lerpGrade(TIME_GRADE.day, tg, clamp(look.time ?? 1, 0, 1));
    const night = nightness(env), rain = Math.max(0, wet - stormy);
    // rain: a cool, slightly deeper sheet; storm: a blue-violet dusk, never grey; snow and fog: lifted and pale
    const mul = [tg.mul[0] * (1 - 0.1 * rain - 0.24 * stormy), tg.mul[1] * (1 - 0.07 * rain - 0.2 * stormy), tg.mul[2] * (1 - 0.02 * rain - 0.08 * stormy)];
    const add = [tg.add[0] + 0.01 * stormy, tg.add[1] + 0.012 * snowy, tg.add[2] + 0.02 * stormy + 0.02 * snowy];
    const g = {
      mul, add,
      sat: tg.sat * (1 - 0.06 * rain) * (1 - 0.08 * stormy) * (1 - 0.1 * snowy) * (1 - 0.18 * foggy),
      contrast: tg.contrast * (1 + 0.03 * stormy) * (1 - 0.1 * foggy) * (1 - 0.04 * snowy),
      warmKeep: Math.max(tg.warmKeep, 0.6 * stormy),
      fog: lerpRgb([0.93, 0.92, 0.9], [0.2, 0.25, 0.42], night),
      fogAmt: 0.2 * foggy + 0.05 * snowy,
      vignette: 0.1 + 0.1 * stormy + 0.06 * night,
      paper: 0.03 * (look.tooth ?? 0), edge: 0,
    };
    const interior = clamp(env.interior ?? 0, 0, 1);
    if (interior > 0) { g.mul = lerpRgb(g.mul, [1, 1, 1], interior); g.add = lerpRgb(g.add, [0, 0, 0], interior); g.sat = lerp(g.sat, 1, interior); g.fogAmt *= 1 - interior; }
    return g;
  }
  const mul = [tg.mul[0] * sg.mul[0], tg.mul[1] * sg.mul[1], tg.mul[2] * sg.mul[2]];
  const add = [tg.add[0] + sg.add[0], tg.add[1] + sg.add[1], tg.add[2] + sg.add[2]];
  // weather
  const wetK = 1 - 0.08 * wet - 0.3 * stormy;
  mul[0] *= wetK * (1 - 0.05 * cold); mul[1] *= wetK; mul[2] *= Math.min(1.02, wetK + 0.06 * wet + 0.1 * stormy + 0.03 * cold);
  add[2] += 0.015 * snowy + 0.01 * cold;
  const g = {
    mul, add,
    sat: tg.sat * (1 + 0.08 * wet) * (1 - 0.1 * snowy) * (1 - 0.25 * foggy) * (1 - 0.12 * stormy),
    contrast: tg.contrast * (1 + 0.05 * wet) * (1 - 0.18 * foggy) * (1 + 0.04 * stormy),
    warmKeep: tg.warmKeep,
    fog: lerpRgb(dilute(mix(pg('paynes'), pg('lavender'), 0.5), 0.8), [0.12, 0.13, 0.2], env.time === 'night' ? 0.8 : 0),
    fogAmt: 0.35 * foggy + 0.08 * snowy,
    vignette: 0.22 + 0.1 * stormy + 0.1 * (env.time === 'night' ? 1 : 0),
    paper: 0.025, edge: 0.1 + 0.08 * wet,
  };
  // interior (a burrow, a hive, a cave): no sun, so day and night differ little; a place sets art.compositor.interior
  const interior = clamp(env.interior ?? 0, 0, 1);
  if (interior > 0) {
    g.mul = lerpRgb(g.mul, [0.82, 0.8, 0.8], interior); g.add = lerpRgb(g.add, [0, 0, 0], interior);
    g.sat = lerp(g.sat, 0.95, interior); g.fogAmt *= 1 - interior; g.vignette = lerp(g.vignette, 0.45, interior); g.warmKeep = Math.max(g.warmKeep, interior);
  }
  return g;
}
