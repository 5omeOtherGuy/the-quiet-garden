// The shared environment: season x time of day x weather (owner: engine). See docs/ENGINE.md "Environment".
// One object, mutated in place, so places may keep a reference. Read-only for everyone but the engine;
// places change it with env.set({...}) or through engine.sky (rain, wind, fog, clear).
//
// Weather is made of three energies the child's gestures pour in and that ebb away by themselves:
//   rain 0..1.2   (patter; above 0.2 it rains, above 0.72 it storms; in winter it snows instead)
//   wind 0..1     (swirl; above 0.4 it is windy; dies down within seconds when left alone)
//   fog  0..1     (a whole hand held still; lingers, lifts slowly, wind blows it away)
// The continuous values art and audio read (wet, windy, foggy, stormy, snowy) follow the energies every frame, so a
// gesture shows within the frame. The discrete env.weather follows them with hysteresis and fires onEnv like before.
//
// Time of day is a wheel: env.hour 0..24 turns the sun and the moon (opposite each other) along one arc across the
// sky. orb() gives their positions; a finger on the sun or the moon turns the wheel (input.js). While the wheel is
// turned by hand, env.time is the nearest of dawn/day/dusk/night and env.prev/env.blend carry the in-between, so
// art's grading follows the finger continuously. Let go, and the sun settles on the nearest of the four times.

import { clamp, smooth, approach, lerp } from './util.js';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const TIMES = ['dawn', 'day', 'dusk', 'night'];
export const WEATHERS = ['clear', 'rain', 'wind', 'fog', 'storm', 'snow'];
export const CONT = ['light', 'wet', 'windy', 'foggy', 'stormy', 'snowy', 'cold'];

/** The hour each time of day stands for (the sun just above the horizon at dawn and dusk). */
export const HOURS = { night: 0, dawn: 6.3, day: 12, dusk: 17.8 };
const WHEEL = [0, 6.3, 12, 17.8, 24];
const WHEEL_T = ['night', 'dawn', 'day', 'dusk', 'night'];
const LIGHT = { dawn: 0.55, day: 1, dusk: 0.42, night: 0.06 };
const COLD = { spring: 0.25, summer: 0, autumn: 0.4, winter: 0.85 };

/** Energy levels a discrete weather stands for (env.set and the saved state). */
const LEVEL = {
  clear: [0, 0, 0], rain: [0.45, 0.12, 0], storm: [0.95, 0.5, 0], wind: [0, 0.85, 0], fog: [0, 0, 0.85], snow: [0.45, 0.08, 0],
};

const wrap24 = (h) => ((h % 24) + 24) % 24;

/** Where the wheel puts its bracket: index i with WHEEL[i] <= h < WHEEL[i+1], and the fraction between. */
function bracket(h) {
  let i = 0;
  while (i < 3 && h >= WHEEL[i + 1]) i++;
  return { i, f: (h - WHEEL[i]) / (WHEEL[i + 1] - WHEEL[i]) };
}

/** Daylight 0..1 at an hour: the four canonical values, smoothly between. */
export function lightAt(h) {
  const { i, f } = bracket(wrap24(h));
  return lerp(LIGHT[WHEEL_T[i]], LIGHT[WHEEL_T[i + 1]], smooth(f));
}

/**
 * The sun (moon = false) or the moon (moon = true) at an hour, in world units for a view {x, y, w, h}.
 * Screen-fixed (it does not pan with the picture). Writes into `out` = {x, y, r, up}: up is the elevation -1..1
 * (above 0 = over the horizon line, which sits at 64% of the screen height). Returns out.
 */
export function orb(hour, view, moon, out) {
  const a = ((hour + (moon ? 12 : 0) - 6) / 12) * Math.PI;
  const s = Math.sin(a), c = Math.cos(a);
  out.x = view.x + view.w * (0.5 - 0.4 * c);
  out.y = view.y + view.h * (0.64 - 0.5 * s);
  out.r = view.h * (moon ? 0.045 : 0.055);
  out.up = s;
  return out;
}
/** Wheel angle (radians) of the sun at an hour, and back. */
export const angleOf = (hour) => ((hour - 6) / 12) * Math.PI;
export const hourOf = (a) => wrap24((a / Math.PI) * 12 + 6);

export function createEnv({ duration = 4 } = {}) {
  const listeners = [];
  const E = { rain: 0, wind: 0, fog: 0 };       // weather energies
  const grace = { rain: 0, wind: 0, fog: 0 };   // seconds before each energy starts to ebb
  let hold = false;                             // tests: keep the weather until the next change
  let snowMode = false;                         // explicit snow outside winter
  let lastFrom = null;                          // screen point of the last gesture (for the wash)
  let hourMode = 'rest';                        // 'rest' | 'clock' (animating to a set time) | 'hand' | 'settle'
  let hFrom = 12, hTo = 12;
  let coldFrom = 0.25, coldTo = 0.25;

  const env = {
    season: 'spring', time: 'day', weather: 'clear',
    light: 1, wet: 0, windy: 0.08, foggy: 0, stormy: 0, snowy: 0, cold: 0.25,
    hour: 12,
    blend: 1,
    prev: { season: 'spring', time: 'day', weather: 'clear' },
    /** increments on every change start; handy as a cache key */
    version: 0,
    /** "season-time-weather", handy as a cache key */
    key: 'spring-day-clear',
    /** seconds a change of season or time takes */
    duration,
    /**
     * Ask for a change. Unknown values are ignored. Returns true if anything changed.
     * opts.instant: jump without animation. opts.from: {sx, sy} screen point (0..1) the wash starts from.
     * opts.hold: the weather stays until the next change (otherwise it ebbs away by itself after a while).
     */
    set(next = {}, opts = {}) {
      const s = SEASONS.includes(next.season) ? next.season : env.season;
      const ti = TIMES.includes(next.time) ? next.time : env.time;
      const w = WEATHERS.includes(next.weather) ? next.weather : env.weather;
      if (WEATHERS.includes(next.weather)) {
        const L = LEVEL[w];
        E.rain = L[0]; E.wind = L[1]; E.fog = L[2];
        grace.rain = grace.fog = 40; grace.wind = w === 'wind' ? 20 : 2;
        snowMode = w === 'snow' && s !== 'winter';
        hold = !!opts.hold;
        if (w === 'storm' && s === 'winter') E.rain = 0.95; // a winter storm is a blizzard of snow
      }
      if (s === env.season && ti === env.time && w === env.weather) {
        if (opts.instant) finish();
        return false;
      }
      if (ti !== env.time) {
        // the wheel turns the short way round to the new time
        hFrom = env.hour;
        let to = HOURS[ti];
        while (to - hFrom > 12) to -= 24;
        while (hFrom - to > 12) to += 24;
        hTo = to; hourMode = 'clock';
      }
      change({ season: s, time: ti, weather: w }, opts);
      if (opts.instant) finish();
      return true;
    },
    /** A plain copy of the discrete state. */
    state() { return { season: env.season, time: env.time, weather: env.weather }; },
  };

  function coldTarget() {
    let c = COLD[env.season] + (env.time === 'night' ? 0.1 : env.time === 'dawn' ? 0.05 : 0);
    return clamp(c, 0, 1);
  }

  /** Start a discrete change: fire listeners. */
  function change(nextState, opts) {
    const prev = { season: env.season, time: env.time, weather: env.weather };
    env.season = nextState.season; env.time = nextState.time; env.weather = nextState.weather;
    env.prev = prev;
    env.key = `${env.season}-${env.time}-${env.weather}`;
    env.version++;
    if (hourMode !== 'hand' && hourMode !== 'settle') env.blend = 0;
    coldFrom = env.cold - 0.1 * env.wet; coldTo = coldTarget();
    const st = { season: env.season, time: env.time, weather: env.weather };
    for (const fn of listeners.slice()) fn(st, prev, opts);
  }

  /** The discrete weather the energies stand for (with hysteresis around the current one). */
  function derived() {
    const cur = env.weather, wet = cur === 'rain' || cur === 'storm' || cur === 'snow';
    const snowy = env.season === 'winter' || snowMode;
    if (E.rain > (cur === 'storm' || (cur === 'snow' && E.rain > 0.6) ? 0.6 : 0.72)) return snowy ? 'snow' : 'storm';
    if (E.rain > (wet ? 0.12 : 0.2)) return snowy ? 'snow' : 'rain';
    if (E.fog > (cur === 'fog' ? 0.28 : 0.4)) return 'fog';
    if (E.wind > (cur === 'wind' ? 0.25 : 0.4)) return 'wind';
    return 'clear';
  }

  /** Continuous targets from the energies, eased toward each frame (tau seconds; 0 snaps). */
  function follow(dt, tau) {
    const winter = env.season === 'winter' || snowMode;
    const rk = clamp(E.rain / 0.45, 0, 1), sk = clamp((E.rain - 0.6) / 0.3, 0, 1);
    const fk = clamp(E.fog, 0, 1);
    const wet = winter ? 0 : Math.max(rk, 0.3 * fk);           // snow is not wet: art would draw rain flicks into it
    const snowyT = winter ? rk : 0;
    const stormyT = winter ? 0 : sk;
    const windyT = clamp(Math.max(0.08, E.wind, 0.85 * stormyT, 0.25 * wet, winter ? 0.2 * rk + 0.6 * sk : 0), 0, 1);
    const foggyT = clamp(Math.max(fk, 0.15 * rk, winter ? 0.25 * sk : 0), 0, 1);
    const go = (k, v) => { env[k] = tau > 0 ? approach(env[k], v, dt, tau) : v; };
    go('wet', wet); go('snowy', snowyT); go('stormy', stormyT); go('windy', windyT); go('foggy', foggyT);
  }

  /** While the wheel is turned by hand: nearest time, and prev/blend carry the in-between for the grading. */
  function timeFromHour(opts) {
    const { i, f } = bracket(wrap24(env.hour));
    const n0 = WHEEL_T[i], n1 = WHEEL_T[i + 1];
    let near = f < 0.5 ? n0 : n1;
    if (env.time === n0 && f < 0.56) near = n0; else if (env.time === n1 && f > 0.44) near = n1;
    const other = near === n0 ? n1 : n0;
    if (near !== env.time) change({ season: env.season, time: near, weather: env.weather }, opts);
    env.prev = env.prev && env.prev.season === env.season && env.prev.weather === env.weather ? env.prev : { season: env.season, time: other, weather: env.weather };
    env.prev.time = other;
    env.blend = near === n1 ? f : 1 - f;
    if (env.blend > 0.999) env.blend = 1;
  }

  function finish() {
    env.blend = 1;
    if (hourMode === 'clock' || hourMode === 'settle') { env.hour = wrap24(hTo); hourMode = 'rest'; }
    env.light = lightAt(env.hour);
    env.cold = clamp(coldTarget() + 0.1 * env.wet, 0, 1);
    follow(0, 0);
    env.cold = clamp(coldTarget() + 0.1 * env.wet, 0, 1);
  }
  env.hour = HOURS[env.time];
  finish();

  const ctl = {
    env,
    onChange(fn) { listeners.push(fn); },
    /** Advance changes, ebb the weather, follow the energies; dt in seconds. */
    tick(dt) {
      if (dt <= 0) return;
      // the clock-driven blend of a season or time change
      if (env.blend < 1 && hourMode !== 'hand' && hourMode !== 'settle') {
        env.blend = Math.min(1, env.blend + dt / env.duration);
        if (hourMode === 'clock') {
          env.hour = wrap24(hFrom + (hTo - hFrom) * smooth(env.blend));
          if (env.blend >= 1) { env.hour = wrap24(hTo); hourMode = 'rest'; }
        }
      } else if (hourMode === 'clock') { env.hour = wrap24(hTo); hourMode = 'rest'; }
      if (hourMode === 'settle') {
        hFrom = approach(hFrom, hTo, dt, 0.35); env.hour = wrap24(hFrom);
        if (Math.abs(hFrom - hTo) < 0.01) { env.hour = wrap24(hTo); hourMode = 'rest'; env.blend = 1; env.prev.time = env.time; }
        else timeFromHour({});
      }
      env.light = lightAt(env.hour);
      // the weather ebbs by itself
      if (!hold) {
        if ((grace.rain -= dt) <= 0) E.rain = Math.max(0, E.rain - (E.rain > 0.6 ? 0.02 : 0.008) * dt);
        if ((grace.wind -= dt) <= 0) E.wind *= Math.exp(-dt / 3.2);
        if ((grace.fog -= dt) <= 0) E.fog = Math.max(0, E.fog - 0.02 * dt);
      }
      if (E.wind > 0.3) E.fog = Math.max(0, E.fog - (E.wind - 0.2) * 0.5 * dt); // wind blows the fog away
      if (E.wind < 0.004) E.wind = 0;
      follow(dt, 0.35);
      const k = smooth(clamp(env.blend, 0, 1));
      env.cold = clamp(lerp(coldFrom, coldTo, k) + 0.1 * env.wet, 0, 1);
      const w = derived();
      if (w !== env.weather) {
        if (w !== 'snow') snowMode = false;
        hold = false;
        change({ season: env.season, time: env.time, weather: w }, { from: lastFrom, source: 'weather' });
      }
    },
    finish,
    /** The live weather energies (read-only copy semantics: do not keep). */
    energy: E,
    /**
     * Pour energy in: kind 'rain' | 'wind' | 'fog', amount added (negative takes away), from = {sx, sy} for the wash.
     * Each addition restarts the ebb's grace time (longer for more rain).
     */
    add(kind, amount, from) {
      if (!(kind in E) || !Number.isFinite(amount)) return;
      const cap = kind === 'rain' ? 1.2 : 1;
      E[kind] = clamp(E[kind] + amount, 0, cap);
      if (amount > 0) {
        if (kind === 'rain') grace.rain = Math.max(grace.rain, 6 + 22 * E.rain);
        else if (kind === 'wind') grace.wind = Math.max(grace.wind, 1.2);
        else grace.fog = Math.max(grace.fog, 25);
      }
      hold = false;
      if (from) lastFrom = from;
    },
    /** Wipe the sky clear by k (0..1 of what is there). */
    clear(k = 1, from) {
      k = clamp(k, 0, 1);
      E.rain *= 1 - k; E.fog *= 1 - k; E.wind *= 1 - 0.5 * k;
      if (E.rain < 0.02) E.rain = 0;
      if (E.fog < 0.02) E.fog = 0;
      hold = false;
      if (from) lastFrom = from;
    },
    /** The time wheel by hand: begin, set the hour, let go. */
    hand: {
      begin() { hourMode = 'hand'; },
      set(hour, from) { hourMode = 'hand'; env.hour = wrap24(hour); env.light = lightAt(env.hour); timeFromHour({ from, source: 'sun' }); },
      end() {
        if (hourMode !== 'hand') return;
        // settle on the nearest of the four times, the short way
        hFrom = env.hour; let to = HOURS[env.time];
        while (to - hFrom > 12) to -= 24;
        while (hFrom - to > 12) to += 24;
        hTo = to; hourMode = 'settle';
      },
      get active() { return hourMode === 'hand'; },
    },
  };
  return ctl;
}
