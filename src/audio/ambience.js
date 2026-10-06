// Soundscapes and the quiet generative music bed.
// Beds are continuous loops (wind, rain, crickets, stream...) that crossfade to levels computed from the place's
// `ambience` weights and the environment. Events are sparse sounds (birds, owls, thunder, drips...) scheduled at random
// with rates from the same inputs. Weather beds are heard through an "outdoor" filter: inside a burrow, cave or under
// the sea the rain is muffled. The generative bed plays a soft pad, a sparse melody and the place's motif.

import { makeRainLoop, makeCricketLoop, makeStreamLoop } from './dsp.js';
import { playNote, warmJawari } from './instruments.js';
import { stepToFreq } from './theory.js';
import { LIMITS } from './core.js';

export function features(env = {}, M = {}) {
  const time = env.time || 'day', w = env.weather || 'clear', s = env.season || 'summer';
  const pick = (map, k, d = 0) => (k in map ? map[k] : d);
  return {
    night: time === 'night' ? 1 : time === 'dusk' ? 0.3 : 0, dawn: +(time === 'dawn'), dusk: +(time === 'dusk'), day: +(time === 'day'),
    daylight: pick({ day: 1, dawn: 0.6, dusk: 0.45, night: 0 }, time),
    rain: w === 'rain' || w === 'storm' ? 1 : 0, rainK: w === 'storm' ? 1 : w === 'rain' ? 0.55 : 0, storm: +(w === 'storm'), wind: w === 'wind' ? 1 : w === 'storm' ? 0.8 : 0,
    snow: +(w === 'snow'), fog: +(w === 'fog'), clear: +(w === 'clear'),
    warm: pick({ spring: 0.6, summer: 1, autumn: 0.45, winter: 0 }, s), green: pick({ spring: 1, summer: 0.9, autumn: 0.6, winter: 0.25 }, s),
    spring: +(s === 'spring'), summer: +(s === 'summer'), autumn: +(s === 'autumn'), winter: +(s === 'winter'),
    shelter: M.shelter || 0, underwater: !!M.underwater,
  };
}

// ---------------------------------------------------------------- bed levels (linear gain into the ambience bus)
const BED_LEVEL = {
  breeze: (F, A) => 0.28 * Math.min(1, (A.wind ?? 0) * (1 - F.wind) + F.wind * 0.9 + F.storm * 0.25) * (1 - 0.5 * F.snow),
  rain: (F) => 0.03 * F.rain * (0.75 + 0.3 * F.storm),   // water beds sit under the music (BRIEF point 21)
  rumble: (F) => 0.1 * F.storm,
  hush: (F) => 0.04 * F.snow,
  mist: (F) => 0.035 * F.fog,
  crickets: (F, A) => 0.09 * (A.crickets ?? 0) * (F.night >= 1 ? 1 : F.night * 0.6) * Math.min(1, F.warm * 1.4) * (1 - 0.85 * F.rain) * (1 - F.snow),
  bees: (F, A) => 0.12 * (A.bees ?? 0) * (F.day ? 1 : F.daylight * 0.4) * Math.max(0, F.warm * 1.1 - 0.1) * (1 - F.rain) * (1 - 0.5 * F.wind) * (1 - F.snow),
  stream: (F, A) => 0.035 * (A.stream ?? 0) * (1 + 0.3 * F.rain) * (F.winter ? 0.55 : 1),
  waterfall: (F, A) => 0.032 * (A.waterfall ?? 0) * (1 + 0.25 * F.rain) * (F.winter ? 0.7 : 1),
  underwater: (F, A) => 0.15 * (A.underwater ?? 0),
  roomtone: (F, A) => 0.1 * (A.roomtone ?? 0),
  hive: (F, A) => 0.14 * (A.hive ?? 0) * (F.winter ? 0.6 : 1) * (F.night >= 1 ? 0.6 : 1),
  surf: (F, A) => 0.12 * (A.waves ?? 0) * (0.6 + 0.5 * F.wind + 0.5 * F.storm),
  hearth: (F, A) => 0.08 * (A.hearth ?? 0) * (F.winter ? 1.3 : 1) * (F.night >= 1 ? 1.2 : 1),
};
const OUTDOOR_BEDS = new Set(['breeze', 'rain', 'rumble', 'hush', 'mist', 'crickets', 'bees', 'surf']);
const WEATHER_BEDS = ['breeze', 'rain', 'rumble', 'hush', 'mist', 'surf'];
// water beds: a soft send into the water room, and a gentle cut above 3 kHz on recorded loops (they stay as calm as the synthesis)
const WATER_BEDS = { rain: 0.25, stream: 0.2, waterfall: 0.15, surf: 0.15, underwater: 0 };
const WATER_FILE_TRIM = 3.3; // recorded water loops against the calm synthesis (measured: audio-water-done.md)

/** The engine's live env carries continuous weather (0..1) that follows the child's gestures; lay it over F. */
export function overlay(F, live) {
  if (!live || typeof live.wet !== 'number') return F;
  const c = (v) => Math.max(0, Math.min(1, +v || 0));
  const wet = c(live.wet), stormy = c(live.stormy), windy = c(live.windy);
  return { ...F, rain: Math.min(1, wet * 1.6), rainK: wet, storm: stormy, wind: Math.max(windy, 0.8 * stormy), snow: c(live.snowy), fog: c(live.foggy), live: true };
}

// Recorded loops (web/assets/audio/manifest.json "beds") behind each bed, with weights that follow the weather.
const tri = (x, a, b, c) => (x <= a || x >= c ? 0 : x < b ? (x - a) / (b - a) : (c - x) / (c - b));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const FILE_LAYERS = {
  rain: [['rain-light', (F) => tri(F.rainK, -0.01, 0.15, 0.55)], ['rain-steady', (F) => tri(F.rainK, 0.3, 0.6, 0.92)], ['rain-heavy', (F) => clamp01((F.rainK - 0.65) / 0.3)]],
  breeze: [['wind-breeze', (F) => 1 - 0.7 * F.wind], ['wind-strong', (F) => F.wind]],
  rumble: [['storm-far', () => 1]],
  hush: [['snow-hush', () => 1]],
  crickets: [['night-crickets', () => 1]],
  bees: [['bees', () => 1]],
  hive: [['hive', () => 1]],
  stream: [['stream', () => 1]],
  waterfall: [['waterfall-soft', () => 1]],
  underwater: [['underwater', () => 1]],
  roomtone: [['cave-air', () => 1]],
  surf: [['waves', () => 1], ['waves-big', (F) => clamp01(0.5 * F.wind + F.storm)]],
  hearth: [['hearth', () => 1]],
};
const FILE_LEVEL = 3.2; // a loop normalised to -26 dBFS RMS sits level with the synthesised bed it replaces (measured: synth beds run 16 dB hotter at the source)

export function createAmbience(E, C, kit) {
  const ctx = E.ctx, M = E.master, S = kit.S;
  // outdoor bus: weather and outdoor nature through a shelter filter
  M.outdoor = { in: ctx.createGain() };
  const shelterLp = ctx.createBiquadFilter(); shelterLp.type = 'lowpass'; shelterLp.frequency.value = 18000; shelterLp.Q.value = 0.5;
  const shelterG = ctx.createGain();
  M.outdoor.in.connect(shelterLp); shelterLp.connect(shelterG); shelterG.connect(M.amb.in);
  E.voices.outdoor = E.voices.amb; LIMITS.outdoor = LIMITS.amb;
  // generative music bus (ducked while painting)
  M.bed = ctx.createGain(); M.bed.gain.value = 1; M.bedMix = ctx.createGain(); M.bed.connect(M.bedMix); M.bedMix.connect(M.musicIn);

  const beds = {};
  let F = features(), A = {}, Mus = null, P = null;

  // ---------------------------------------------------------------- bed builders
  const loopSrc = (buffer, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.playbackRate.value = rate; s.start(E.now(), E.rand(0, buffer.duration)); return s; };
  const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const lfo = (rate, depth, param) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); return o; };
  const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };
  let rainBuf, cricketBuf, streamBuf;
  const BUILD = {
    breeze(out) {
      const n = loopSrc(E.noise('pink'), 1), bp = filt('bandpass', 520, 0.9), g = ctx.createGain(); g.gain.value = 0.7;
      const w = loopSrc(E.noise('white'), 0.9), wb = filt('bandpass', 1300, 7), wg = ctx.createGain(); wg.gain.value = 0.05;
      chain(n, bp, g, out); chain(w, wb, wg, out);
      return [n, w, lfo(0.07, 260, bp.frequency), lfo(0.11, 0.3, g.gain), lfo(0.05, 300, wb.frequency)];
    },
    rain(out) { // calm: soft low patter, a warm wash with body (80-400 Hz), nothing hissy above 3 kHz
      rainBuf = rainBuf || makeRainLoop(ctx);
      const p = loopSrc(rainBuf), hp = filt('highpass', 90), lp = filt('lowpass', 2800, 0.5), pg = ctx.createGain(); pg.gain.value = 0.9;
      const p2 = loopSrc(rainBuf, 0.83), pg2 = ctx.createGain(); pg2.gain.value = 0.45; // second layer hides the loop
      const w = loopSrc(E.noise('pink')), wb = filt('bandpass', 900, 0.5), wg = ctx.createGain(); wg.gain.value = 0.1;   // the wash of rain
      const b = loopSrc(E.noise('brown')), bh = filt('highpass', 90, 0.5), bl = filt('lowpass', 380, 0.5), bg = ctx.createGain(); bg.gain.value = 0.35; // body
      chain(p, hp, lp, pg, out); chain(p2, pg2, hp); chain(w, wb, wg, out); chain(b, bh, bl, bg, out);
      return [p, p2, w, b, lfo(0.09, 0.08, wg.gain)];
    },
    rumble(out) { // far-away weather: a soft, airy roll, highpassed so there is no deep drone and no slow swell
      const n = loopSrc(E.noise('brown')), hp = filt('highpass', 120, 0.5), lp = filt('lowpass', 480, 0.5), g = ctx.createGain(); g.gain.value = 0.8;
      chain(n, hp, lp, g, out); return [n, lfo(0.31, 0.15, g.gain)];
    },
    hush(out) { const n = loopSrc(E.noise('pink')), hp = filt('highpass', 300, 0.5), lp = filt('lowpass', 1600, 0.4); chain(n, hp, lp, out); return [n]; },
    mist(out) { const n = loopSrc(E.noise('pink')), bp = filt('bandpass', 1800, 0.5); chain(n, bp, out); return [n]; }, // a soft high hush, no low swell
    crickets(out) {
      cricketBuf = cricketBuf || makeCricketLoop(ctx);
      const a = loopSrc(cricketBuf, 1), b = loopSrc(cricketBuf, 0.94), hp = filt('highpass', 2500), gb = ctx.createGain(); gb.gain.value = 0.6;
      chain(a, hp, out); chain(b, gb, hp); return [a, b];
    },
    bees(out) { return beeChoir(out, 3, 0.75); },
    stream(out) {
      streamBuf = streamBuf || makeStreamLoop(ctx);
      const a = loopSrc(streamBuf, 1), b = loopSrc(streamBuf, 0.89), bp = filt('bandpass', 600, 0.5), lp2 = filt('lowpass', 2400, 0.5), gb = ctx.createGain(); gb.gain.value = 0.6;
      const n = loopSrc(E.noise('pink')), hp = filt('highpass', 90, 0.5), lp = filt('lowpass', 500, 0.5), ng = ctx.createGain(); ng.gain.value = 0.45; // body
      chain(a, bp, lp2, out); chain(b, gb, bp); chain(n, hp, lp, ng, out); return [a, b, n];
    },
    waterfall(out) { // a soft steady fall of water: broad and even, a dip around 800 Hz leaves room for the music, no low roar
      streamBuf = streamBuf || makeStreamLoop(ctx);
      const n = loopSrc(E.noise('pink')), hp = filt('highpass', 90, 0.5), lp = filt('lowpass', 2200, 0.5), dip = filt('peaking', 800, 0.8), g = ctx.createGain();
      dip.gain.value = -5; g.gain.value = 0.8;
      const sp = loopSrc(E.noise('brown')), sb = filt('bandpass', 260, 0.6), sg = ctx.createGain(); sg.gain.value = 0.5;   // the weight of falling water (body)
      const a = loopSrc(streamBuf, 0.82), ab = filt('bandpass', 650, 0.6), ag = ctx.createGain(); ag.gain.value = 0.35;          // splashes in the pool
      chain(n, hp, dip, lp, g, out); chain(sp, sb, sg, out); chain(a, ab, ag, out);
      return [n, sp, a, lfo(0.37, 0.05, g.gain)];
    },
    underwater(out) { // muffled and gentle, kept above 90 Hz, its movement quicker than a breath
      const n = loopSrc(E.noise('pink')), hp = filt('highpass', 140, 0.5), lp = filt('lowpass', 700, 0.7), g = ctx.createGain(); g.gain.value = 0.5;
      chain(n, hp, lp, g, out); return [n, lfo(0.23, 90, lp.frequency), lfo(0.29, 0.15, g.gain)];
    },
    roomtone(out) { const n = loopSrc(E.noise('pink')), hp = filt('highpass', 160, 0.5), lp = filt('lowpass', 900, 0.5); chain(n, hp, lp, out); return [n]; }, // air in a room, not a rumble
    hive(out) { return beeChoir(out, 5, 1); },
    hiveOld(out) { // the first version, kept only so the lab can compare (a dissonant saw cluster: it sounded like a horror film)
      const bp = filt('bandpass', 420, 0.9), am = ctx.createGain(); am.gain.value = 0.7; chain(bp, am, out);
      const s = [205, 214, 222, 231, 246, 262].map((f) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const gg = ctx.createGain(); gg.gain.value = 0.16; chain(o, gg, bp); o.start(); return o; });
      s.forEach((o, i) => s.push(lfo(0.3 + i * 0.11, 5, o.frequency)));
      s.push(lfo(0.23, 0.25, am.gain)); return s;
    },
    surf(out) { const n = loopSrc(E.noise('pink')), bp = filt('bandpass', 700, 0.5), lp = filt('lowpass', 2400, 0.5), g = ctx.createGain(); g.gain.value = 0.7; chain(n, bp, lp, g, out); return [n, lfo(0.12, 0.35, g.gain)]; },
    hearth(out) { const n = loopSrc(E.noise('brown')), hp = filt('highpass', 160, 0.5), lp = filt('lowpass', 700, 0.6); chain(n, hp, lp, out); return [n]; },
  };

  /** A sunny hive or a meadow of bees: a few bees on consonant pitches (root, fifth, octave, twelfth of the place's key),
   *  bright and close, each with its own quick wing flutter and coming and going (0.4-1 Hz), nothing under 180 Hz. */
  function beeChoir(out, n, level) {
    const k = C.profile(); let f0 = 440 * Math.pow(2, (k.root - 69) / 12); while (f0 < 220) f0 *= 2; while (f0 >= 330) f0 /= 2;
    const ratios = [1, 1.5, 2, 1.5, 3, 2].slice(0, n);
    const hp = filt('highpass', 180, 0.5), lp = filt('lowpass', 2400, 0.5), bus = ctx.createGain(); bus.gain.value = level;
    chain(hp, lp, bus, out);
    const srcs = [];
    ratios.forEach((r, i) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f0 * r * (1 + (i - n / 2) * 0.0012);
      const tri = ctx.createOscillator(); tri.type = 'triangle'; tri.frequency.value = o.frequency.value;
      const og = ctx.createGain(); og.gain.value = 0.05 / Math.sqrt(r); const tg = ctx.createGain(); tg.gain.value = 0.12 / Math.sqrt(r);
      const amp = ctx.createGain(); amp.gain.value = 0.55;
      o.connect(og); tri.connect(tg); og.connect(amp); tg.connect(amp); amp.connect(hp); o.start(); tri.start();
      const wing = 0.006 * f0 * r;              // wing flutter: a quick, light vibrato
      srcs.push(o, tri, lfo(7.5 + i * 1.3, wing, o.frequency), lfo(7.5 + i * 1.3, wing, tri.frequency),
        lfo(0.43 + i * 0.17, 0.4, amp.gain));   // a bee coming close and drifting off
    });
    const n2 = loopSrc(E.noise('pink')), wb = filt('bandpass', 3200, 0.8), wg = ctx.createGain(); wg.gain.value = 0.05; // wing air
    chain(n2, wb, wg, hp); srcs.push(n2);
    return srcs;
  }

  const SM = C.samples;
  function fileLayers(name) { return SM ? (FILE_LAYERS[name] || []).filter(([n]) => SM.hasBed(n)) : []; }
  function buildFile(name, g) { // returns layers, or null when no take is decoded yet
    const layers = [];
    for (const [n, w] of fileLayers(name)) {
      const bufs = SM.bedBuffers(n); if (!bufs) continue;
      const lg = ctx.createGain(); lg.gain.value = 0;
      if (name in WATER_BEDS) { const a = filt('lowpass', 2500, 0.5), b = filt('lowpass', 2500, 0.6); chain(lg, a, b, g); } else lg.connect(g); // 24 dB/oct above 2.5 kHz: recorded water stays calm
      const sources = bufs.slice(0, 2).map((buf, i) => {
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        const tg = ctx.createGain(); tg.gain.value = bufs.length > 1 ? 0.71 : 1; src.connect(tg); tg.connect(lg);
        src.start(E.now(), (buf.duration * (i * 0.5 + E.rng() * 0.25)) % buf.duration); return src; // takes offset: a longer cycle
      });
      layers.push({ name: n, w, g: lg, sources, trim: SM.bedGain(n) });
    }
    return layers.length ? layers : null;
  }
  function weigh(b, tc) { if (b.layers) for (const L of b.layers) E.param(L.g.gain, FILE_LEVEL * L.trim * (b.name in WATER_BEDS ? WATER_FILE_TRIM : 1) * clamp01(L.w(F)), E.now(), tc); }
  function stopBed(b, at) { for (const s of b.sources) try { s.stop(at); } catch (_) {} if (b.layers) for (const L of b.layers) for (const s of L.sources) try { s.stop(at); } catch (_) {} }
  function setBed(name, level, tc = 1.2) {
    let b = beds[name];
    if (b && !b.layers && (name === 'bees' || name === 'hive') && b.root !== C.profile().root && level >= 0.002) { // retune the bees to a new key
      E.param(b.g.gain, 0, E.now(), 0.5); stopBed(b, E.now() + 3); const old = b; setTimeout(() => { try { old.g.disconnect(); } catch (_) {} }, 3500);
      delete beds[name]; b = null;
    }
    if (!b) {
      if (level < 0.002) return;
      const g = ctx.createGain(); g.gain.value = 0; g.connect(OUTDOOR_BEDS.has(name) ? M.outdoor.in : M.amb.in); E.wetSend(g, WATER_BEDS[name]);
      const layers = fileLayers(name).length ? buildFile(name, g) : null;
      b = beds[name] = { g, name, sources: layers ? [] : BUILD[name](g), layers, level: 0, zeroAt: 0, root: C.profile().root };
    }
    b.level = level; E.param(b.g.gain, level, E.now(), tc);
    b.zeroAt = level < 0.002 ? E.now() : 0;
    weigh(b, tc);
  }
  // when a take finishes decoding, a synthesised bed crossfades to the recording (and missing layers join in)
  if (SM) SM.onLoad(() => {
    for (const k in beds) {
      const b = beds[k]; if (b.zeroAt || !fileLayers(k).length) continue;
      const have = b.layers ? b.layers.map((L) => L.name).join() : '', want = fileLayers(k).filter(([n]) => SM.bedBuffers(n)).map(([n]) => n).join();
      if (have === want) continue;
      const g = ctx.createGain(); g.gain.value = 0; g.connect(OUTDOOR_BEDS.has(k) ? M.outdoor.in : M.amb.in); E.wetSend(g, WATER_BEDS[k]);
      const layers = buildFile(k, g); if (!layers) { g.disconnect(); continue; }
      const nb = { g, name: k, sources: [], layers, level: b.level, zeroAt: 0 };
      weigh(nb, 0.05); E.param(g.gain, b.level, E.now(), 0.8);
      E.param(b.g.gain, 0, E.now(), 0.8); stopBed(b, E.now() + 4); setTimeout(() => { try { b.g.disconnect(); } catch (_) {} }, 4500);
      beds[k] = nb;
    }
  });
  function reapBeds() { // stop beds that have been silent a while (saves CPU on phones)
    const t = E.now();
    for (const k in beds) {
      const b = beds[k];
      if (b.zeroAt && t - b.zeroAt > 6) { stopBed(b); try { b.g.disconnect(); } catch (_) {} delete beds[k]; }
    }
  }

  // ---------------------------------------------------------------- events
  const out = (o) => ({ bus: 'outdoor', ...o });
  const amb = (o) => ({ bus: 'amb', ...o });
  const pan = () => E.rand(-0.8, 0.8);
  const keyNote = (step, inst, vol, t, o = {}) => { const k = C.profile(); playNote(E, { freq: stepToFreq(step, k.root, k.scale), instrument: inst, vol, time: t, pan: o.pan ?? pan(), bus: o.bus || 'amb', dur: o.dur, wet: o.wet }); };
  const EVENTS = {
    birds: { rate: (F, A) => 0.22 * (A.birds ?? 0) * (1 - Math.min(1, F.night * 1.5)) * (F.dawn ? 2.2 : F.dusk ? 0.6 : 1) * (0.4 + 0.6 * F.green) * (1 - 0.75 * F.rain) * (1 - 0.6 * F.snow) * (1 - 0.4 * F.fog),
      play: (t) => { const r = E.rng(), o = out({ time: t, pan: pan(), size: E.rand(0.2, 0.6), vol: E.rand(0.5, 1) });
        if (r < 0.45) S.chirp(o); else if (r < 0.75) S.warble(o); else if (r < 0.88) S.peep(o); else S.trill(o); } },
    owls: { rate: (F, A) => ((A.owls ?? 0) * (F.night >= 1 ? 1 : 0.2 * F.night) * (1 - F.storm)) / 22, play: (t) => S.hoot(out({ time: t, pan: pan(), vol: 0.6, size: E.rand(0.4, 0.7) })) },
    frogs: { rate: (F, A) => (0.18 * (A.frogs ?? 0) * (F.night * 0.9 + F.dusk * 0.5 + F.rain * 0.6 + 0.08) * Math.min(1, F.warm * 1.6) * (1 - F.snow)),
      play: (t) => { const n = 1 + Math.floor(E.rand(0, 3)); for (let i = 0; i < n; i++) (E.rng() < 0.75 ? S.ribbit : S.croak)(out({ time: t + i * E.rand(0.25, 0.6), pan: pan(), vol: E.rand(0.3, 0.6), size: E.rand(0.2, 0.8) })); } },
    woodpecker: { rate: (F, A) => ((A.woodpecker ?? 0) * F.daylight * (1 - F.rain)) / 28, play: (t) => S.tok(out({ time: t, count: 6 + Math.floor(E.rand(0, 6)), speed: 1.7, vol: 0.5, pan: pan() })) },
    gulls: { rate: (F, A) => ((A.gulls ?? 0) * (0.3 + 0.7 * F.daylight) * (1 - F.storm) * (1 - 0.5 * F.fog)) / 9, play: (t) => S.gull(out({ time: t, pan: pan(), vol: E.rand(0.4, 0.8), size: E.rand(0.3, 0.6) })) },
    waves: { rate: (F, A) => (A.waves ?? 0) / (7.5 - 2 * F.wind - 2 * F.storm), play: (t) => S.wave(amb({ time: t, size: Math.min(1, E.rand(0.2, 0.45) + 0.3 * F.wind + 0.4 * F.storm), pan: E.rand(-0.4, 0.4), vol: 0.9 })) },
    thunder: { rate: (F) => F.storm / 16, play: (t) => S.thunder(out({ time: t, near: E.rand(0.1, 0.45), pan: pan(), vol: 0.55 })) },
    gusts: { rate: (F, A) => (F.wind + 0.6 * F.storm + 0.25 * (A.wind ?? 0)) / 9, play: (t) => S.gust(out({ time: t, amp: E.rand(0.4, 0.9), pan: pan() * 0.5, vol: 0.9 })) },
    rainNotes: { rate: (F) => 0.18 * F.rain * (1 - F.storm * 0.6), play: (t) => keyNote(4 + Math.floor(E.rand(0, 6)), 'water', 0.045, t, { bus: 'outdoor', wet: 0.5 }) },
    snowSparkle: { rate: (F) => 0.12 * F.snow, play: (t) => keyNote(12 + Math.floor(E.rand(0, 5)), 'celesta', 0.035, t, { bus: 'outdoor' }) },
    chimes: { rate: (F, A) => ((A.chimes ?? 0) * (0.1 + F.wind + 0.5 * F.storm)) / 6, play: (t) => S.chime(out({ time: t, count: 2 + Math.floor(E.rand(0, 3)), vol: 0.45, pan: pan() })) },
    leaves: { rate: (F, A) => ((A.leaves ?? 0) * (F.autumn ? 1 : 0.3) * (0.2 + F.wind)) / 5, play: (t) => S.rustle(out({ time: t, count: 5 + Math.floor(E.rand(0, 6)), vol: 0.6, pan: pan() })) },
    drips: { rate: (F, A) => ((A.drips ?? 0) * (1 + 0.6 * F.rain)) / 5, play: (t) => { if (E.rng() < 0.6) keyNote(4 + Math.floor(E.rand(0, 6)), E.rng() < 0.5 ? 'water' : 'kalimba', 0.03, t, { wet: 0.6 }); else S.drip(amb({ time: t, vol: 0.32, pan: pan(), size: E.rand(0.3, 0.9) })); } },
    bubbles: { rate: (F, A) => (A.bubbles ?? 0) / 4.5, play: (t) => S.bubble(amb({ time: t, count: 1 + Math.floor(E.rand(0, 3)), vol: 0.4, pan: pan(), size: E.rand(0.4, 0.9) })) },
    whale: { rate: (F, A) => (A.whale ?? 0) / 50, play: (t) => S.whale(amb({ time: t, vol: 0.8, pan: pan() * 0.5 })) },
    dig: { rate: (F, A) => (A.dig ?? 0) / 12, play: (t) => S.dig(amb({ time: t, count: 2 + Math.floor(E.rand(0, 4)), vol: 0.35, pan: pan() })) },
    ants: { rate: (F, A) => (A.ants ?? 0) / 1.6, play: (t) => S.tok(amb({ time: t, pitch: E.rand(2.5, 3.5), size: 0.2, vol: 0.12, count: 1 + Math.floor(E.rand(0, 3)), speed: 2.5, pan: pan() })) },
    town: { rate: (F, A) => ((A.town ?? 0) * (F.dawn || F.dusk ? 2 : 1)) / 70, play: (t) => { const n = 3 + Math.floor(E.rand(0, 3)); for (let i = 0; i < n; i++) keyNote(0, 'bell', 0.09, t + i * 1.4, { pan: -0.3, dur: 3 }); } },
    pigeons: { rate: (F, A) => ((A.pigeons ?? 0) * F.daylight * (1 - 0.7 * F.rain)) / 15, play: (t) => S.coo(out({ time: t, vol: 0.6, pan: pan(), size: E.rand(0.4, 0.6) })) },
    cats: { rate: (F, A) => ((A.cats ?? 0) * (F.night >= 1 ? 1 : 0)) / 40, play: (t) => S.meow(out({ time: t, vol: 0.5, pan: pan() })) },
    eagle: { rate: (F, A) => ((A.eagle ?? 0) * F.daylight * (1 - F.storm) * (1 - F.fog)) / 35, play: (t) => S.cry(out({ time: t, vol: 0.5, pan: pan() })) },
    marmots: { rate: (F, A) => ((A.marmots ?? 0) * F.daylight * (F.winter ? 0 : 1)) / 30, play: (t) => S.whistle(out({ time: t, vol: 0.5, pan: pan() })) },
    goatbells: { rate: (F, A) => ((A.goatbells ?? 0) * F.daylight * (1 - F.storm)) / 14, play: (t) => S.bells(out({ time: t, count: 2 + Math.floor(E.rand(0, 3)), vol: 0.45, pan: pan() })) },
    ducks: { rate: (F, A) => ((A.ducks ?? 0) * F.daylight * (F.winter ? 0.3 : 1)) / 25, play: (t) => S.quack(out({ time: t, vol: 0.5, pan: pan() })) },
    fish: { rate: (F, A) => ((A.fish ?? 0) * (F.winter ? 0.3 : 1)) / 18, play: (t) => S.plop(out({ time: t, vol: 0.3, pan: pan(), size: E.rand(0.5, 0.9) })) },
    insects: { rate: (F, A) => ((A.insects ?? 0) * F.daylight * F.warm * (1 - F.rain) * (1 - F.snow)) / 8, play: (t) => (E.rng() < 0.6 ? S.buzz : S.hum)(out({ time: t, vol: 0.5, pan: pan(), size: E.rand(0.1, 0.7), dur: E.rand(0.6, 1.4) })) },
    clock: { rate: (F, A) => (A.clock ? 1 : 0), regular: true, play: (t, i) => S.tok(amb({ time: t, vol: 0.18, pitch: i % 2 ? 0.8 : 1, size: 0.5 })) },
    crackle: { rate: (F, A) => (A.hearth ?? 0) / 0.8, play: (t) => S.crackle(amb({ time: t, count: 2 + Math.floor(E.rand(0, 3)), vol: 0.5, pan: E.rand(-0.3, 0.3) })) },
    snores: { rate: (F, A) => ((A.snores ?? 0) * (F.winter ? 1.5 : 1) * (F.night >= 1 ? 1.4 : 0.6)) / 18, play: (t) => S.snore(amb({ time: t, vol: 0.4, pan: pan() })) },
  };
  const nextAt = {}, counts = {};
  const scale = () => (C.duckAmb ? 0.7 : 1);

  // ---------------------------------------------------------------- the generative bed
  // One generator per place. On a place change with a `fade` (music.fade on either side, seconds) the old generator
  // keeps playing in its own key while its output fades away, and the new one rises under it; without a fade the old
  // one stops at once (its sustained pads released), as before.
  function makeGen(music, profile, t, fadeIn = 0) {
    const out = ctx.createGain(); out.connect(M.bed);
    if (fadeIn > 0.5) { out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(1, t + fadeIn); } else out.gain.value = 1;
    const B = profile.bed || {};
    return { Mus: music, P: profile, out, nextQ: t + 0.3, beatN: 0, chordN: -1, walk: 7, pads: [], motifAt: t + E.rand(6, 14), motifQuiet: 0, chord: [0, 2, 4],
      fading: false, endAt: 0, alapAt: t + Math.max(B.firstPhrase ?? 9, 0.8 * fadeIn) + E.rand(0, 4), alapN: 0 };
  }
  let gen = null; const fadingGens = [];
  const G = {}; // housekeeping: reap counter, live-weather timing
  function endGen(g, t, fade) {
    if (!g) return;
    if (fade > 0.5) {
      g.fading = true; g.endAt = t + fade * 1.15;
      g.out.gain.cancelScheduledValues(t); g.out.gain.setValueAtTime(Math.max(0.0001, g.out.gain.value), t); g.out.gain.linearRampToValueAtTime(0.0001, t + fade);
      fadingGens.push(g);
      while (fadingGens.length > 2) dropGen(fadingGens.shift(), t, 0.4); // a child hopping back and forth: never more than three beds at once
    } else dropGen(g, t, 0);
  }
  function dropGen(g, t, tc) {
    for (const v of g.pads) v.release(t + 0.1);
    g.pads = []; g.dead = true;
    if (g.drone) { E.param(g.drone.g.gain, 0, t, 0.3); try { g.drone.src.stop(t + 2); } catch (_) {} }
    if (tc) E.param(g.out.gain, 0, t, tc);
    const out = g.out; if (!E.offline) setTimeout(() => { try { out.disconnect(); } catch (_) {} }, 9000);
  }

  // Bhupali alap: sa re ga pa dha as scale steps 0..4 of the major pentatonic (-1 = dha below, 5 = sa above).
  // [step, beats, slide-from step]. Phrases open out slowly: low and narrow first, the upper sa only later.
  const ALAP = [
    [[0, 3], [-1, 1.5], [0, 4, -1]],                                             // sa, dha below, slide home to sa
    [[0, 1.5], [1, 1], [2, 3, 1], [1, 1.5], [0, 4]],                             // sa re ga (slide), re, sa
    [[-1, 2], [0, 1.5], [1, 1], [2, 2.5, 1], [1, 1.5], [0, 5]],                  // from dha below up to ga and home
    [[2, 2], [1, 1], [0, 1.5], [-1, 1.5], [0, 1], [1, 1], [2, 4, 1]],            // the Bhupali turn: ga re sa dha sa re ga
    [[2, 1.5], [3, 2, 2], [4, 3, 3], [3, 1.5], [2, 4]],                          // ga, slide to pa, slide to dha, pa, ga
    [[2, 4], [3, 1.5, 2], [2, 2], [1, 1], [0, 4]],                               // a long ga, touch pa, settle
    [[3, 1.5], [4, 1.5], [5, 4, 4], [4, 1.5], [3, 1.5], [2, 2], [1, 1], [0, 5]], // up to the high sa and all the way down
    [[4, 2], [5, 3, 4], [4, 1.5], [3, 2, 4], [2, 3], [1, 1], [0, 5]],            // dha sa', and down by slides
  ];
  function alapPhrase(g, t) {
    const P = g.P, B = P.bed, vol = (B.vol ?? 0.5) * P.vol, unit = (B.unit ?? 0.75) * (P.beatMul || 1);
    const open = Math.min(ALAP.length, 2 + Math.floor(g.alapN / 2));           // the range widens phrase by phrase
    let k = Math.floor(E.rng() * open); if (k === g.lastAlap) k = (k + 1) % open; g.lastAlap = k;
    const inst = B.instrument || 'sitar', f = (s) => { let x = stepToFreq(s, P.root, P.scale); while (x < 115) x *= 2; return x; };
    let at = t;
    ALAP[k].forEach(([s, beats, fromStep], i) => {
      const len = beats * unit * E.rand(0.88, 1.18);                            // free time: no beat, a breathing rubato
      playNote(E, { freq: f(s), instrument: inst, vol: 0.16 * vol * (i ? E.rand(0.75, 0.95) : 1), time: at, dur: Math.max(2.4, len + 1.2),
        from: fromStep !== undefined ? f(fromStep) : undefined, glide: Math.min(0.6, 0.45 * len), hold: 0.08, slide: false,
        dest: g.out, prio: -1, pan: E.rand(-0.15, 0.15), bright: P.bright });
      at += len;
    });
    g.alapN++;
    const rest = B.rest || [12, 26];
    g.alapAt = at + E.rand(rest[0], rest[1]);
    return at;
  }

  // A recorded drone loop (manifest bed `tanpura-drone`, or bed.droneFile) replaces the synthesised plucks; it rises over
  // a few seconds while the last plucks ring out. Until the file exists or has decoded, the synthesis plays.
  const DRONE_FILE_LEVEL = 1.0; // a loop normalised to -26 dBFS RMS against the synthesised tanpura rounds (see audio-sitar-done.md)
  function droneLoop(g, B, vol) {
    const name = B.droneFile || (B.drone === 'tanpura' ? 'tanpura-drone' : null);
    if (!name || !SM || !SM.hasBed(name)) return false;
    const level = DRONE_FILE_LEVEL * SM.bedGain(name) * vol / 0.7;
    if (!g.drone) {
      const bufs = SM.bedBuffers(name); if (!bufs) return false;
      const src = ctx.createBufferSource(), dg = ctx.createGain(); src.buffer = bufs[0]; src.loop = true;
      dg.gain.value = 0; src.connect(dg); dg.connect(g.out); src.start(E.now(), E.rng() * bufs[0].duration);
      g.drone = { src, g: dg };
    }
    E.param(g.drone.g.gain, level, E.now(), 1.2);
    return true;
  }
  function bedQuarter(g, t) {
    const P = g.P; if (!P) return;
    const B = P.bed, bar = Math.floor(g.beatN / 4), bb = g.beatN % 4, prog = B.progression || [[0, 2, 4]];
    const vol = (B.vol ?? 0.5) * P.vol;
    if (B.style === 'alap') { // a drone and free-time phrases: no chords, no beat
      const strings = B.strings || [-5, 0, 0, -12, null];                      // tanpura: pa, sa, sa, low sa, a breath
      const semi = strings[g.beatN % strings.length];
      const loop = B.drone && droneLoop(g, B, vol);                              // a recorded tanpura, once it exists and has decoded
      if (B.drone && !loop && semi !== null && semi !== undefined) {
        const i = g.beatN % strings.length;
        playNote(E, { freq: 440 * Math.pow(2, (P.root + semi - 69) / 12), instrument: B.drone, vol: 0.1 * vol * (i === 0 ? 1 : 0.85), dur: 6.2, every: 99,
          time: t + E.rand(0, 0.06), dest: g.out, prio: -1, pan: [-0.25, -0.08, 0.08, 0.25, 0][i % 5], bright: Math.min(1, P.bright * 1.1) });
      }
      if (B.instrument && !g.fading && t >= g.alapAt) { if (C.painting()) g.alapAt = t + 6; else alapPhrase(g, t); }
      g.beatN++;
      return;
    }
    if (bb === 0 && bar % (B.barsPerChord || 2) === 0) { // chord change
      g.chordN++; g.chord = prog[g.chordN % prog.length];
      for (const v of g.pads) v.release(t + 0.2);
      g.pads = [];
      const hold = (B.barsPerChord || 2) * 4 * P.quarter + 1.5;
      if (B.pad) for (const s of g.chord) {
        let f = stepToFreq(s, P.root, P.scale); while (f > 520) f /= 2; while (f < 130) f *= 2;
        const v = playNote(E, { freq: f, instrument: B.pad, vol: 0.075 * vol, dur: hold, time: t, attack: 1.4, bright: P.bright * 0.9, dest: g.out, prio: -1, pan: E.rand(-0.3, 0.3) });
        if (v) g.pads.push(v);
      }
      if (B.bass) { let f = stepToFreq(g.chord[0] - P.scale.length, P.root, P.scale); while (f < 70) f *= 2; playNote(E, { freq: f, instrument: B.bass, vol: 0.14 * vol, time: t, dest: g.out, prio: -1 }); }
    }
    // the motif: now and then, at a bar start, when nobody is painting (never while this bed fades away)
    if (P.motif && bb === 0 && t >= g.motifAt && !C.painting() && !g.fading) {
      if (g.motifAt) {
        let at = t;
        for (const [s, beats] of P.motif) { playNote(E, { freq: stepToFreq(s, P.root, P.scale), instrument: P.bed.instrument, vol: 0.14 * vol, time: at, dest: g.out, prio: -1, bright: P.bright }); at += beats * P.quarter; }
        g.motifQuiet = at;
      }
      g.motifAt = t + E.rand(45, 90);
    }
    // the sparse melody
    if (t > (g.motifQuiet || 0)) {
      const accent = [1, 0.35, 0.65, 0.35][bb];
      if (E.rng() < B.density * accent * (C.painting() ? 0.3 : 1) * (g.fading ? 0.5 : 1)) {
        g.walk += E.pick([-2, -1, -1, 1, 1, 2, 0]);
        if (E.rng() < 0.5) { // lean towards a chord tone
          const tones = g.chord.flatMap((s) => [s + 5, s + 10]);
          g.walk = tones.reduce((a, b) => (Math.abs(b - g.walk) < Math.abs(a - g.walk) ? b : a), tones[0]);
        }
        g.walk = Math.max(4, Math.min(13, g.walk));
        playNote(E, { freq: stepToFreq(g.walk, P.root, P.scale), instrument: P.bed.instrument, vol: 0.11 * vol * E.rand(0.7, 1), time: t + (E.rng() < 0.15 ? P.quarter / 2 : 0), dest: g.out, prio: -1, bright: P.bright, pan: E.rand(-0.4, 0.4) });
      }
    }
    g.beatN++;
  }
  function runGen(g, t0, t1) {
    if (!g || g.dead || !g.P) return;
    if (g.nextQ < t0 - g.P.quarter) g.nextQ = t0;
    while (g.nextQ < t1) { bedQuarter(g, Math.max(g.nextQ, E.now())); g.nextQ += g.P.quarter; }
  }

  E.tasks.add((t0, t1) => {
    // events
    for (const name in EVENTS) {
      const ev = EVENTS[name], r = ev.rate(F, A) * (ev.regular ? 1 : scale());
      if (!(r > 0)) { nextAt[name] = undefined; continue; }
      // fresh, or after a suspended page: start a new wait (no burst of missed events)
      if (nextAt[name] === undefined || nextAt[name] < t0 - 1) nextAt[name] = t0 + (ev.regular ? 1 / r : -Math.log(1 - E.rng()) / r);
      while (nextAt[name] < t1) {
        counts[name] = (counts[name] || 0) + 1;
        ev.play(Math.max(nextAt[name], E.now()), counts[name]);
        nextAt[name] += ev.regular ? 1 / r : Math.max(0.15, -Math.log(1 - E.rng()) / r);
      }
    }
    // generative beds: the current one and any still fading out
    runGen(gen, t0, t1);
    for (let i = fadingGens.length - 1; i >= 0; i--) { const g = fadingGens[i]; if (t0 > g.endAt) { dropGen(g, t0, 0); fadingGens.splice(i, 1); } else runGen(g, t0, t1); }
    if ((G.reap = (G.reap || 0) + 1) % 50 === 0) reapBeds();
    // follow the engine's continuous weather a few times a second (rain swells and ebbs with the child's patter)
    if (t1 - (G.liveAt || 0) > 0.25 && Mus) {
      G.liveAt = t1;
      const live = C.envLive && C.envLive();
      if (live && typeof live.wet === 'number') {
        const key = [live.wet, live.windy, live.stormy, live.snowy, live.foggy].map((v) => Math.round((+v || 0) * 50)).join();
        if (key !== G.liveKey) {
          G.liveKey = key; F = overlay(F, live);
          for (const name of WEATHER_BEDS) setBed(name, BED_LEVEL[name](F, A), 0.25);
        }
      }
    }
  });

  return {
    /** Re-aim everything at a new place music/profile and env. fade = crossfade seconds. */
    retarget(music, profile, env, fade = 2) {
      const Mus0 = Mus, placeChanged = music !== Mus, genFade = placeChanged ? Math.max(+music.fade || 0, +(Mus && Mus.fade) || 0) : 0;
      Mus = music; P = profile; A = profile.ambience || music.ambience || {}; F = overlay(features(env, music), C.envLive && C.envLive()); G.liveKey = null;
      for (const name in BED_LEVEL) setBed(name, BED_LEVEL[name](F, A), fade / 2.5);
      const sh = F.underwater ? 1 : F.shelter, t = E.now();
      E.param(shelterLp.frequency, F.underwater ? 380 : 400 + 17600 * Math.pow(1 - sh, 3), t, fade / 3);
      E.param(shelterG.gain, F.underwater ? 0.5 : 1 - 0.7 * sh, t, fade / 3);
      const samePlace = gen && genFade > 0 && Mus0 && music.id === Mus0.id && music.key === Mus0.key && String(music.scale) === String(Mus0.scale);
      if (placeChanged && samePlace) { gen.Mus = music; gen.P = profile; for (const k in nextAt) nextAt[k] = undefined; } // set again: keep playing
      else if (placeChanged) {
        endGen(gen, t, genFade);
        gen = makeGen(music, profile, t, genFade);
        if (profile.bed && profile.bed.style === 'alap' && profile.bed.drone === 'tanpura') warmJawari(E, (profile.bed.strings || [-5, 0, -12]).filter((x) => x !== null).map((x) => 440 * Math.pow(2, (profile.root + x - 69) / 12)), ['tanpura']);
        if (profile.bed && profile.bed.style === 'alap') warmJawari(E, [...new Set([...Array(21)].map((_, i) => { let x = stepToFreq(i - 5, profile.root, profile.scale); while (x < 110) x *= 2; return x; }))], ['sitar']); // the alap first, then what painting reaches
        for (const k in nextAt) nextAt[k] = undefined;
      } else if (gen) gen.P = profile;
    },
    /** Lab: play one bed alone at a level (others silent); name may be 'hiveOld'. */
    solo(name, level = 1) { for (const k in beds) if (k !== name) setBed(k, 0, 0.2); if (!BED_LEVEL[name]) BED_LEVEL[name] = () => 0; setBed(name, level, 0.2); },
    duck(on) { E.param(M.bed.gain, on ? 0.45 : 1, E.now(), on ? 0.15 : 1.2); },
    levels() { const o = {}; for (const k in beds) o[k] = +beds[k].level.toFixed(3) + (beds[k].layers ? ' file' : ''); return o; },
    rates() { const o = {}; for (const k in EVENTS) { const r = EVENTS[k].rate(F, A); if (r > 0) o[k] = +r.toFixed(3); } return o; },
    features: () => F,
    stopAll() { for (const k in beds) setBed(k, 0, 0.3); for (const g of [gen, ...fadingGens]) if (g) { for (const v of g.pads) v.release(); g.pads = []; } },
    /** Lab: play an alap phrase now (in a place whose bed is an alap). */
    alap() { if (gen && gen.P && gen.P.bed.style === 'alap') return alapPhrase(gen, E.now() + 0.1); return 0; },
    /** Lab and tests: how the generative beds stand (current and fading). */
    gens() { return [gen, ...fadingGens].filter(Boolean).map((g) => ({ id: g.Mus && g.Mus.id, fading: g.fading, gain: +g.out.gain.value.toFixed(3), alapAt: g.P.bed.style === 'alap' ? +g.alapAt.toFixed(1) : null, phrases: g.alapN })); },
  };
}
