// The creature and object voice kit. Every voice takes one options object:
//   vol (relative loudness, default 1), pitch (frequency multiplier, default 1), size (0 tiny .. 1 big, default .5;
//   bigger = lower and slower), pan (-1..1) or x (world x; panned against the last view), delay (s), time (absolute ctx
//   time, for schedulers), count (repeats where it makes sense), speed (tempo multiplier), bus ('sfx' default, 'amb').
// Melodic voices (chime, warble, sparkle, wonder, tada...) always sing in the current place's key.

import { playNote } from './instruments.js';
import { stepToFreq } from './theory.js';

const MELODIC = new Set(['warble', 'chime', 'bells', 'twinkle', 'sparkle', 'wonder', 'tada', 'jarIn', 'release', 'discover', 'enter', 'leave', 'tap', 'swirl', 'sun', 'season']);
const TRIM = { chirp: 1.17, peep: 1.45, trill: 2.45, warble: 1.41, coo: 0.42, caw: 1.62, hoot: 0.34, quack: 1.16, honk: 2.45, gull: 2.06, cry: 1.12, flutter: 2.45, ribbit: 0.41, croak: 1.07, plop: 0.70, bubble: 1.90, splash: 0.86, drip: 1.16, wave: 0.53, whale: 0.45, buzz: 2.13, hum: 1.31, cricket: 2.45, squeak: 2.34, chitter: 1.38, sniff: 2.45, snore: 1.26, purr: 0.56, meow: 2.45, woof: 2.37, bleat: 2.45, whistle: 1.35, dig: 1.70, crunch: 2.45, rustle: 1.90, snap: 1.35, tok: 1.34, knock: 0.47, step: 1.20, creak: 2.45, squelch: 1.06, pop: 1.10, boing: 0.85, whoosh: 0.95, gust: 2.45, thunder: 0.52, crackle: 1.73, chime: 0.65, bells: 0.92, twinkle: 0.66, sparkle: 0.59, wonder: 0.41, tada: 0.41, hmm: 0.55, startle: 0.85, jarIn: 0.69, release: 0.34, discover: 0.38, enter: 0.70, leave: 0.65, travel: 1.97, tap: 1.78 };

export function createVoices(E, K, SM) {
  // ---------------------------------------------------------------- primitives
  const T = (o) => Math.max(E.now(), o.time ?? E.now()) + (o.delay || 0);
  const sizeMul = (o) => (o.pitch ?? 1) * Math.pow(2, (0.5 - (o.size ?? 0.5)) * 1.4);
  const durMul = (o) => Math.pow(2, ((o.size ?? 0.5) - 0.5) * 0.8) / (o.speed ?? 1);
  const panOf = (o) => (o.pan ?? (o.x !== undefined ? K.panFor(o.x) : 0));
  const busOf = (o) => o.bus || 'sfx';
  const V = (o) => (o.vol ?? 1) * (o._v ?? 1);

  /** Raw oscillator blip with optional sweep, filter and vibrato (the original tone(), extended). */
  function tone(o) {
    const ctx = E.ctx, t = T(o), dur = o.dur || 0.2, bus = busOf(o);
    const out = E.out(E.master[bus].in, panOf(o)); E.wetSend(out, o.wet);
    const osc = E.osc(o.type || 'sine', o.f0, t, t + dur + 0.05);
    if (o.f1) {
      const sw = o.sweep || dur;
      if (o.lin) osc.frequency.linearRampToValueAtTime(o.f1, t + sw); else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + sw);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + dur);
    }
    let node = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q ?? 0.7; node.connect(f); node = f; }
    if (o.bp) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.bp; f.Q.value = o.q ?? 2; node.connect(f); node = f; }
    node.connect(out);
    const srcs = [osc];
    if (o.vib) { const l = E.osc('sine', o.vib, t, t + dur + 0.05), lg = ctx.createGain(); lg.gain.value = o.va || 8; l.connect(lg); lg.connect(osc.frequency); srcs.push(l); }
    if (o.am) { const l = E.osc('sine', o.am, t, t + dur + 0.05), lg = ctx.createGain(), ag = ctx.createGain(); lg.gain.value = o.ad ?? 0.5; ag.gain.value = 1 - (o.ad ?? 0.5);
      node.disconnect(); node.connect(ag); ag.connect(out); l.connect(lg); lg.connect(ag.gain); srcs.push(l); }
    const v = (o.vol ?? 0.3), at = o.at || 0.01;
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(v, t + at); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    E.addVoice(bus, { out, sources: srcs, end: t + dur + 0.05, start: t });
  }
  /** Filtered noise burst (the original whoosh(), extended): sweep f0 -> f1 -> f2, shaped envelope. */
  function noise(o) {
    const ctx = E.ctx, t = T(o), dur = o.dur || 0.3, bus = busOf(o);
    const out = E.out(E.master[bus].in, panOf(o)); E.wetSend(out, o.wet);
    const src = E.noiseSrc(o.color || 'white', t, t + dur + 0.05, o.rate || 1);
    const f = ctx.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.f0 || 800, t);
    if (o.f1) f.frequency.linearRampToValueAtTime(o.f1, t + dur * (o.peak ?? 0.45));
    if (o.f2) f.frequency.linearRampToValueAtTime(o.f2, t + dur);
    src.connect(f); let node = f; const srcs = [src];
    if (o.am) { const l = E.osc('sine', o.am, t, t + dur + 0.05), lg = ctx.createGain(), ag = ctx.createGain(); lg.gain.value = o.ad ?? 0.5; ag.gain.value = 1 - (o.ad ?? 0.5);
      node.connect(ag); node = ag; l.connect(lg); lg.connect(ag.gain); srcs.push(l); }
    node.connect(out);
    const v = o.vol ?? 0.12, pk = o.peak ?? 0.4;
    out.gain.setValueAtTime(0, t);
    if (o.sharp) { out.gain.linearRampToValueAtTime(v, t + 0.004); out.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
    else { out.gain.linearRampToValueAtTime(v, t + dur * pk); out.gain.linearRampToValueAtTime(0, t + dur); }
    E.addVoice(bus, { out, sources: srcs, end: t + dur + 0.05, start: t });
  }
  /** A note in the current key: step = scale step (0 = key root), octave shifts by octaves. */
  function keyNote(step, o, inst, vol, dur, delay = 0) {
    const k = K.key(), f = stepToFreq(step + (o.octave ?? 0) * k.scale.length, k.root, k.scale) * (o.pitch ?? 1);
    playNote(E, { freq: f, instrument: o.instrument || inst, vol: vol * V(o), dur, time: T(o) + delay, pan: panOf(o), bus: busOf(o) });
  }
  const R = E.rand;

  // ---------------------------------------------------------------- the kit
  const S = {
    // birds
    chirp(o = {}) { const m = sizeMul(o), n = o.count ?? 3, d = durMul(o); for (let i = 0; i < n; i++) tone({ ...o, f0: (2300 + R(0, 500)) * m, f1: (3100 + R(0, 400)) * m, dur: 0.09 * d, sweep: 0.07 * d, vol: 0.07 * V(o), delay: (o.delay || 0) + i * 0.11 * d }); },
    peep(o = {}) { const m = sizeMul(o), d = durMul(o); tone({ ...o, f0: 2000 * m, f1: 2600 * m, dur: 0.08 * d, vol: 0.07 * V(o) }); if ((o.count ?? 2) > 1) tone({ ...o, f0: 2100 * m, f1: 2700 * m, dur: 0.08 * d, vol: 0.06 * V(o), delay: (o.delay || 0) + 0.12 * d }); },
    trill(o = {}) { const m = sizeMul(o), d = durMul(o); tone({ ...o, f0: 3200 * m, f1: 2700 * m, dur: 0.5 * d, vol: 0.05 * V(o), am: 26 / d, ad: 0.9, lin: true }); },
    warble(o = {}) { // a little song in key, high and quick (robins, blackbirds, songbirds)
      const n = o.count ?? 5 + Math.floor(R(0, 4)), d = durMul(o); let s = 10 + Math.floor(R(0, 4)), at = 0;
      const k = K.key();
      for (let i = 0; i < n; i++) {
        s += E.pick([-2, -1, 1, 1, 2]); const f = stepToFreq(s, k.root, k.scale) * (o.pitch ?? 1) * 2;
        const g = 0.06 + R(0, 0.1);
        tone({ ...o, f0: f, f1: f * (R() < 0.5 ? 1.08 : 0.94), dur: g * d, vol: 0.05 * V(o), delay: (o.delay || 0) + at, at: 0.008 });
        at += (g + 0.03 + R(0, 0.05)) * d;
      }
    },
    coo(o = {}) { const m = sizeMul(o), d = durMul(o); [[330, 400, 0.22], [400, 360, 0.42], [360, 300, 0.3]].forEach(([a, b, l], i) => tone({ ...o, f0: a * m, f1: b * m, dur: l * d, vol: 0.12 * V(o), at: 0.06, lp: 900, delay: (o.delay || 0) + [0, 0.27, 0.78][i] * d })); },
    caw(o = {}) { const n = Math.min(4, o.count ?? 1), m = sizeMul(o); for (let i = 0; i < n; i++) tone({ ...o, f0: (420 + R(0, 60)) * m, f1: 300 * m, type: 'sawtooth', dur: 0.22, vol: 0.1 * V(o), lp: 1100, delay: (o.delay || 0) + i * 0.3, vib: 30, va: 25 }); },
    hoot(o = {}) { const m = sizeMul(o), d = durMul(o); [[0, 0.32], [0.62, 0.16], [0.86, 0.38]].forEach(([at, l]) => { tone({ ...o, f0: 400 * m, f1: 370 * m, dur: l * d, vol: 0.14 * V(o), at: 0.06, lp: 800, delay: (o.delay || 0) + at * d }); noise({ ...o, color: 'pink', f0: 420 * m, q: 6, dur: l * d, vol: 0.03 * V(o), delay: (o.delay || 0) + at * d }); }); },
    quack(o = {}) { const m = sizeMul(o), n = o.count ?? 2; for (let i = 0; i < n; i++) tone({ ...o, f0: (420 - i * 20) * m, f1: (300 - i * 20) * m, type: 'sawtooth', dur: 0.16 + i * 0.02, vol: (0.09 - i * 0.01) * V(o), lp: 1100, delay: (o.delay || 0) + i * 0.2 }); },
    honk(o = {}) { const m = sizeMul(o); tone({ ...o, f0: 330 * m, f1: 290 * m, type: 'sawtooth', dur: 0.28, vol: 0.08 * V(o), bp: 700, q: 3, vib: 9, va: 6 }); },
    gull(o = {}) { const m = sizeMul(o), n = o.count ?? 2 + Math.floor(R(0, 2)); for (let i = 0; i < n; i++) tone({ ...o, f0: 1150 * m, f1: 1450 * m, f2: 850 * m, sweep: 0.08, type: 'sawtooth', dur: 0.32, vol: 0.045 * V(o), lp: 2400, delay: (o.delay || 0) + i * 0.38 }); },
    cry(o = {}) { const m = sizeMul(o); tone({ ...o, f0: 1800 * m, f1: 1200 * m, dur: 0.5 * durMul(o), vol: 0.08 * V(o), vib: 12, va: 60 }); }, // eagle, hawk
    flutter(o = {}) { const d = durMul(o); noise({ ...o, color: 'pink', f0: 900 * sizeMul(o), q: 0.7, dur: 0.45 * d, vol: 0.09 * V(o), am: 16 / d, ad: 0.9, peak: 0.2 }); },
    // pond, river and sea
    ribbit(o = {}) { const m = sizeMul(o); tone({ ...o, f0: 190 * m, f1: 150 * m, type: 'triangle', dur: 0.14, vol: 0.26 * V(o), lp: 900, vib: 40, va: 30 }); tone({ ...o, f0: 170 * m, f1: 130 * m, type: 'triangle', dur: 0.16, vol: 0.24 * V(o), lp: 900, vib: 40, va: 30, delay: (o.delay || 0) + 0.18 }); },
    croak(o = {}) { const m = sizeMul(o), d = durMul(o); tone({ ...o, f0: 130 * m, f1: 112 * m, type: 'sawtooth', dur: 0.4 * d, vol: 0.16 * V(o), lp: 500, am: 22, ad: 0.8 }); },
    // water (BRIEF point 21): lower, rounder, softer onsets, a little body, and a soft room (wet) so each one tails off
    plop(o = {}) { const m = sizeMul(o); tone({ ...o, f0: 620 * m, f1: 170 * m, dur: 0.24, at: 0.018, vol: 0.15 * V(o), sweep: 0.15, wet: 0.55 }); tone({ ...o, f0: 150 * m, f1: 110 * m, type: 'triangle', lp: 500, dur: 0.13, at: 0.02, vol: 0.045 * V(o), wet: 0.3 }); },
    bubble(o = {}) { const n = o.count ?? 1, m = sizeMul(o); let d = o.delay || 0; for (let i = 0; i < n; i++) { tone({ ...o, f0: (300 + R(0, 220)) * m, f1: 640 * m, dur: 0.14, at: 0.018, vol: 0.04 * V(o), sweep: 0.11, delay: d, wet: 0.5 }); d += R(0.12, 0.28); } },
    splash(o = {}) { const d = durMul(o); noise({ ...o, color: 'pink', filter: 'lowpass', f0: 1500, f1: 700, f2: 350, q: 0.5, dur: 0.8 * d, vol: 0.08 * V(o), peak: 0.06, wet: 0.6 }); noise({ ...o, color: 'brown', filter: 'lowpass', f0: 320, q: 0.5, dur: 0.45 * d, vol: 0.08 * V(o), peak: 0.1, wet: 0.4 }); S.bubble({ ...o, count: 3, delay: (o.delay || 0) + 0.12 }); },
    drip(o = {}) { const m = sizeMul(o); tone({ ...o, f0: 560 * m, f1: 820 * m, dur: 0.22, at: 0.018, vol: 0.07 * V(o), sweep: 0.07, wet: 0.65 }); },
    wave(o = {}) { const s = o.size ?? 0.5, d = (3 + s * 3) / (o.speed ?? 1); // a single wave: swell, break, hiss away
      noise({ ...o, color: 'pink', filter: 'lowpass', f0: 250, f1: 600 + s * 700, f2: 300, q: 0.3, dur: d, vol: (0.1 + s * 0.16) * V(o), peak: 0.5, wet: 0.3 });
      noise({ ...o, color: 'pink', filter: 'bandpass', f0: 1200, f1: 1700, f2: 900, q: 0.5, dur: d * 0.6, vol: (0.02 + s * 0.03) * V(o), delay: (o.delay || 0) + d * 0.45, peak: 0.3, wet: 0.3 }); },
    whale(o = {}) { const m = sizeMul(o); [0, 1].forEach((i) => tone({ ...o, f0: 220 * m, f1: 160 * m, dur: 2.5, vol: 0.08 * V(o), at: 0.8, delay: (o.delay || 0) + i * 1.8, vib: 3, va: 6 })); },
    // small animals
    buzz(o = {}) { const m = sizeMul(o), d = durMul(o); tone({ ...o, f0: 230 * m, f1: 262 * m, type: 'sawtooth', dur: (o.dur || 0.5) * d, vol: 0.06 * V(o), lp: 700, vib: 28, va: 12 }); },
    hum(o = {}) { const m = sizeMul(o), d = durMul(o); tone({ ...o, f0: 175 * m, f1: 196 * m, type: 'triangle', dur: (o.dur || 1) * d, vol: 0.06 * V(o), lp: 500, am: 34, ad: 0.6, at: 0.15 }); },
    cricket(o = {}) { const m = sizeMul(o); for (let i = 0; i < (o.count ?? 3); i++) tone({ ...o, f0: 4400 * m, dur: 0.022, vol: 0.03 * V(o), at: 0.008, delay: (o.delay || 0) + i * 0.042 }); },
    squeak(o = {}) { const m = sizeMul(o); for (let i = 0; i < (o.count ?? 1); i++) tone({ ...o, f0: 2600 * m, f1: 3400 * m, f2: 2900 * m, sweep: 0.04, dur: 0.09, vol: 0.06 * V(o), delay: (o.delay || 0) + i * 0.13 }); },
    chitter(o = {}) { const m = sizeMul(o); for (let i = 0; i < (o.count ?? 5); i++) tone({ ...o, f0: (1600 + R(0, 400)) * m, f1: 1300 * m, dur: 0.05, vol: 0.06 * V(o), delay: (o.delay || 0) + i * 0.06 }); },
    sniff(o = {}) { for (let i = 0; i < (o.count ?? 3); i++) noise({ ...o, f0: 2200 * sizeMul(o), q: 1.2, dur: 0.07, vol: 0.05 * V(o), delay: (o.delay || 0) + i * 0.11, peak: 0.3 }); },
    snore(o = {}) { const m = sizeMul(o), d = durMul(o); noise({ ...o, color: 'pink', f0: 500 * m, f1: 700 * m, q: 2, dur: 1.4 * d, vol: 0.05 * V(o), peak: 0.6 }); tone({ ...o, f0: 150 * m, f1: 125 * m, type: 'triangle', dur: 1.3 * d, vol: 0.025 * V(o), lp: 500, at: 0.6 }); }, // a soft sleepy breath, no growl
    purr(o = {}) { const d = durMul(o); noise({ ...o, color: 'brown', filter: 'lowpass', f0: 300, q: 0.5, dur: (o.dur || 1.6) * d, vol: 0.22 * V(o), am: 24, ad: 0.9, peak: 0.3 }); },
    meow(o = {}) { const m = sizeMul(o); tone({ ...o, f0: 600 * m, f1: 900 * m, f2: 520 * m, sweep: 0.2, type: 'sawtooth', dur: 0.55, vol: 0.05 * V(o), bp: 1200, q: 1.5, at: 0.05 }); },
    woof(o = {}) { const m = sizeMul(o); for (let i = 0; i < (o.count ?? 1); i++) { tone({ ...o, f0: 320 * m, f1: 210 * m, type: 'sawtooth', dur: 0.14, vol: 0.07 * V(o), lp: 800, delay: (o.delay || 0) + i * 0.25 }); noise({ ...o, f0: 600, q: 1, dur: 0.1, vol: 0.04 * V(o), sharp: true, delay: (o.delay || 0) + i * 0.25 }); } },
    bleat(o = {}) { const m = sizeMul(o); tone({ ...o, f0: 520 * m, f1: 470 * m, type: 'sawtooth', dur: 0.6, vol: 0.05 * V(o), bp: 1000, q: 1.4, vib: 7, va: 40, at: 0.04 }); },
    whistle(o = {}) { const m = sizeMul(o); tone({ ...o, f0: 2200 * m, f1: 2700 * m, dur: 0.3, vol: 0.06 * V(o) }); tone({ ...o, f0: 2200 * m, f1: 2800 * m, dur: 0.3, vol: 0.06 * V(o), delay: (o.delay || 0) + 0.42 }); }, // marmot alarm
    // ground, wood and things
    dig(o = {}) { for (let i = 0; i < (o.count ?? 4); i++) noise({ ...o, color: 'brown', filter: 'bandpass', f0: 500 * sizeMul(o), f1: 900 * sizeMul(o), q: 0.9, dur: 0.12, vol: 0.2 * V(o), peak: 0.2, delay: (o.delay || 0) + i * R(0.13, 0.2) }); },
    crunch(o = {}) { noise({ ...o, f0: 300, f1: 700, dur: 0.25, vol: 0.08 * V(o) }); },
    // leaves and grass (BRIEF point 22): a soft, airy, low brush; no hiss, no sharp onset; repeated calls overlap into one swell
    rustle(o = {}) { noise({ ...o, color: 'pink', f0: 700, f1: 950, f2: 600, q: 0.6, dur: 0.42, vol: 0.03 * V(o), peak: 0.4 });
      for (let i = 0; i < Math.min(6, o.count ?? 6); i++) noise({ ...o, color: 'pink', f0: 900 + R(0, 700), q: 0.7, dur: R(0.1, 0.2), vol: R(0.015, 0.035) * V(o), peak: 0.35, delay: (o.delay || 0) + 0.04 + i * R(0.05, 0.12) }); },
    snap(o = {}) { noise({ ...o, f0: 3000, q: 1.5, dur: 0.05, vol: 0.18 * V(o), sharp: true }); tone({ ...o, f0: 700, f1: 300, dur: 0.06, vol: 0.06 * V(o) }); },
    tok(o = {}) { for (let i = 0; i < (o.count ?? 1); i++) tone({ ...o, f0: 900 * sizeMul(o), f1: 600 * sizeMul(o), type: 'triangle', dur: 0.06, vol: 0.12 * V(o), lp: 1800, delay: (o.delay || 0) + i * 0.11 / (o.speed ?? 1) }); },
    knock(o = {}) { for (let i = 0; i < (o.count ?? 2); i++) { tone({ ...o, f0: 180 * sizeMul(o), f1: 120 * sizeMul(o), type: 'triangle', dur: 0.1, vol: 0.2 * V(o), lp: 700, delay: (o.delay || 0) + i * 0.2 }); noise({ ...o, f0: 1200, q: 1, dur: 0.03, vol: 0.05 * V(o), sharp: true, delay: (o.delay || 0) + i * 0.2 }); } },
    step(o = {}) { tone({ ...o, f0: 110 * sizeMul(o), f1: 80 * sizeMul(o), type: 'triangle', dur: 0.16, vol: 0.14 * V(o), lp: 400 }); },
    creak(o = {}) { const m = sizeMul(o), d = durMul(o); tone({ ...o, f0: 340 * m, f1: 420 * m, f2: 380 * m, sweep: 0.35 * d, type: 'triangle', dur: 0.6 * d, vol: 0.05 * V(o), bp: 900, q: 2, at: 0.06, am: 22, ad: 0.35 }); }, // a friendly wooden squeak, not a horror door
    squelch(o = {}) { noise({ ...o, color: 'brown', filter: 'lowpass', f0: 600, f1: 250, q: 2, dur: 0.25, vol: 0.25 * V(o), sharp: true }); tone({ ...o, f0: 300, f1: 140, dur: 0.18, vol: 0.06 * V(o) }); },
    pop(o = {}) { tone({ ...o, f0: 600 * sizeMul(o), f1: 1500 * sizeMul(o), dur: 0.06, vol: 0.14 * V(o), sweep: 0.04 }); },
    boing(o = {}) { const m = sizeMul(o); tone({ ...o, f0: 220 * m, f1: 330 * m, f2: 260 * m, sweep: 0.1, dur: 0.6, vol: 0.12 * V(o), vib: 11, va: 40, type: 'triangle', lp: 1400 }); },
    whoosh(o = {}) { noise({ ...o, f0: o.f0 ?? 300, f1: o.f1 ?? 900, f2: (o.f0 ?? 300) * 0.8, dur: o.dur ?? 1.8, vol: 0.12 * V(o) }); },
    gust(o = {}) { const a = o.amp ?? 0.7; noise({ ...o, color: 'pink', f0: 300, f1: 900 + a * 500, f2: 260, q: 0.8, dur: (4 + a * 2) * 0.8, vol: 0.1 * a * V(o), peak: 0.4 }); },
    thunder(o = {}) { // distant and soft: rolling low swells, never a sharp crack (gentle for a small child)
      const near = Math.min(1, o.near ?? 0.3), d = 3 + R(0, 2.5);
      noise({ ...o, color: 'brown', filter: 'lowpass', f0: 140 + near * 250, f1: 260 + near * 400, f2: 90, q: 0.4, dur: d, vol: (0.14 + near * 0.12) * V(o), peak: 0.12 + R(0, 0.1) });
      noise({ ...o, color: 'brown', filter: 'lowpass', f0: 110, f1: 180, f2: 70, q: 0.5, dur: d * 0.8, vol: 0.1 * V(o), peak: 0.4, delay: (o.delay || 0) + 0.6 + R(0, 0.6) });
    },
    crackle(o = {}) { for (let i = 0; i < (o.count ?? 4); i++) noise({ ...o, filter: 'highpass', f0: 1500 + R(0, 3000), q: 0.7, dur: R(0.01, 0.03), vol: R(0.03, 0.1) * V(o), sharp: true, delay: (o.delay || 0) + R(0, 0.5) }); },
    // musical moments (always in key)
    chime(o = {}) { const n = o.count ?? 3; for (let i = 0; i < n; i++) keyNote(10 + Math.floor(R(0, 6)), o, 'bell', 0.12, 2.4, i * R(0.12, 0.35)); },
    bells(o = {}) { const n = o.count ?? 3; for (let i = 0; i < n; i++) keyNote(Math.floor(R(5, 10)), o, 'bell', 0.1, 1.6, i * R(0.25, 0.5)); }, // alpine goat bells
    twinkle(o = {}) { [12, 13, 15].forEach((s, i) => keyNote(s, o, 'bell', 0.12, 1, i * 0.08)); },
    sparkle(o = {}) { [10, 11, 12, 13, 14, 15].forEach((s, i) => keyNote(s, o, 'celesta', 0.08, 0.9, i * 0.05)); },
    wonder(o = {}) { [5, 7, 8, 10].forEach((s, i) => keyNote(s, o, 'bell', 0.16, 2, i * 0.12)); },
    tada(o = {}) { [0, 2, 3, 5].forEach((s, i) => keyNote(s, o, 'kalimba', 0.18, 1.2, i * 0.12)); },
    hmm(o = {}) { tone({ ...o, f0: 220, f1: 260, type: 'triangle', dur: 0.3, vol: 0.16 * V(o), lp: 800 }); tone({ ...o, f0: 260, f1: 330, type: 'triangle', dur: 0.35, vol: 0.16 * V(o), lp: 800, delay: (o.delay || 0) + 0.35 }); },
    startle(o = {}) { tone({ ...o, f0: 300, f1: 900, dur: 0.18, vol: 0.18 * V(o), sweep: 0.12 }); tone({ ...o, f0: 1200, f1: 1500, dur: 0.1, vol: 0.08 * V(o), delay: (o.delay || 0) + 0.12 }); },
    jarIn(o = {}) { keyNote(12, o, 'bell', 0.18, 1.2); keyNote(14, o, 'bell', 0.12, 1.2, 0.08); },
    release(o = {}) { [5, 7, 8, 10, 12].forEach((s, i) => keyNote(s, o, 'bell', 0.2, 1.6, i * 0.09)); },
    discover(o = {}) { // the reveal: a rising sparkle that settles on a soft chord
      [5, 7, 9, 10, 12].forEach((s, i) => keyNote(s, o, 'celesta', 0.14, 1.6, i * 0.09));
      [0, 2, 4].forEach((s) => keyNote(s + 5, o, 'pad', 0.18, 2.2, 0.45));
      keyNote(15, o, 'bell', 0.1, 2.4, 0.5);
    },
    enter(o = {}) { noise({ ...o, f0: 900, f1: 400, f2: 250, dur: 0.9, vol: 0.07 * V(o) }); [9, 7, 5].forEach((s, i) => keyNote(s, o, 'kalimba', 0.1, 1, 0.1 + i * 0.1)); },
    leave(o = {}) { noise({ ...o, f0: 300, f1: 900, f2: 1200, dur: 0.9, vol: 0.07 * V(o) }); [5, 7, 9].forEach((s, i) => keyNote(s, o, 'kalimba', 0.1, 1, 0.1 + i * 0.1)); },
    travel(o = {}) { noise({ ...o, f0: 400, f1: 900, f2: 320, dur: 0.9, vol: 0.07 * V(o) }); },
    // plants and small things (recorded takes expected; these are the synthesised stand-ins)
    grass(o = {}) { noise({ ...o, color: 'pink', f0: 600 + R(0, 250), f1: 900 + R(0, 300), f2: 550, q: 0.55, dur: R(0.38, 0.55), vol: 0.05 * V(o), peak: 0.45 }); // a hand through soft grass
      for (let i = 1; i < Math.min(3, o.count ?? 3); i++) noise({ ...o, color: 'pink', f0: 1100 + R(0, 400), q: 0.9, dur: R(0.15, 0.25), vol: 0.015 * V(o), peak: 0.4, delay: (o.delay || 0) + R(0.05, 0.25) }); },
    bloom(o = {}) { noise({ ...o, color: 'pink', f0: 900, f1: 2600, f2: 1800, q: 1, dur: 0.5, vol: 0.05 * V(o), peak: 0.5 }); tone({ ...o, f0: 500 * sizeMul(o), f1: 900 * sizeMul(o), dur: 0.12, vol: 0.06 * V(o), sweep: 0.1, delay: (o.delay || 0) + 0.2 }); },
    apple(o = {}) { const m = sizeMul(o); tone({ ...o, f0: 220 * m, f1: 130 * m, type: 'triangle', dur: 0.14, vol: 0.2 * V(o), lp: 700 }); noise({ ...o, color: 'pink', filter: 'lowpass', f0: 900, q: 0.6, dur: 0.08, vol: 0.06 * V(o), sharp: true }); tone({ ...o, f0: 200 * m, f1: 140 * m, type: 'triangle', dur: 0.08, vol: 0.07 * V(o), lp: 700, delay: (o.delay || 0) + 0.18 }); },
    seal(o = {}) { const m = sizeMul(o); for (let i = 0; i < (o.count ?? 2); i++) tone({ ...o, f0: 480 * m, f1: 360 * m, type: 'sawtooth', dur: 0.2, vol: 0.06 * V(o), bp: 900, q: 1.5, at: 0.02, delay: (o.delay || 0) + i * 0.3 }); },
    thump(o = {}) { const m = sizeMul(o); tone({ ...o, f0: 170 * m, f1: 120 * m, type: 'triangle', dur: 0.1, vol: 0.18 * V(o), lp: 600 }); },
    // world gestures (docs/requests/engine-to-audio.md Ask 2)
    swirl(o = {}) { noise({ ...o, color: 'pink', f0: 350, f1: 1300, f2: 700, q: 0.9, dur: 1.4, vol: 0.09 * V(o), peak: 0.35 }); [9, 11, 12].forEach((s, i) => keyNote(s, o, 'celesta', 0.06, 0.9, 0.12 + i * 0.07)); },
    drop(o = {}) { const m = (o.pitch ?? 1) * E.rand(0.85, 1.2); tone({ ...o, f0: 720 * m, f1: 1000 * m, dur: 0.17, at: 0.016, vol: 0.09 * V(o), sweep: 0.06, wet: 0.55 }); noise({ ...o, color: 'pink', filter: 'lowpass', f0: 1200, q: 0.6, dur: 0.05, vol: 0.04 * V(o), peak: 0.2 }); tone({ ...o, f0: 210 * m, f1: 150 * m, type: 'triangle', lp: 600, dur: 0.08, at: 0.016, vol: 0.05 * V(o) }); },
    wipe(o = {}) { noise({ ...o, color: 'pink', f0: 500, f1: 1400, f2: 900, q: 0.6, dur: 0.9, vol: 0.08 * V(o), peak: 0.4 }); },
    mist(o = {}) { noise({ ...o, color: 'pink', f0: 380, f1: 900, f2: 500, q: 0.5, dur: 2.6, vol: 0.05 * V(o), peak: 0.5 }); keyNote(12, o, 'glass', 0.04, 2.4, 0.4); },
    sun(o = {}) { [7, 9].forEach((s, i) => keyNote(s, o, 'bell', 0.1, 1.8, i * 0.15)); keyNote(5, o, 'pad', 0.08, 1.6, 0.05); },
    season(o = {}) { [5, 7, 9, 10, 12, 14].forEach((s, i) => keyNote(s, o, 'celesta', 0.09, 1.4, i * 0.08)); keyNote(17, o, 'bell', 0.07, 2.2, 0.5); },
    tap(o = {}) { keyNote(Math.floor(R(7, 12)), o, 'musicbox', 0.1, 0.8); }, // a soft confirmation for a tap that did something small
  };
  // loudness trims measured offline (docs/status/audio-done.md) so every voice sits at a similar level at vol 1
  // a voice with recorded takes in web/assets/audio plays one of them; melodic voices stay synthesised (they sing in key)
  const outFor = (o) => E.out(E.master[o.bus || 'sfx'].in, panOf(o));
  for (const k of Object.keys(S)) {
    const f = S[k], g = TRIM[k] ?? 1, tuned = MELODIC.has(k);
    S[k] = (o = {}) => { if (!tuned && !o.synth && SM && SM.playVoice(k, o, outFor)) return; f({ ...o, _v: g }); };
  }
  return { S, tone, noise, keyNote };
}

/** Names of all voices with a one-line description (for the lab page and docs). */
export const VOICE_INFO = {
  chirp: 'small bird, rising chirps', peep: 'chick or nestling', trill: 'wren trill', warble: 'songbird phrase in key',
  coo: 'pigeon or dove', caw: 'raven or crow (count 1..4)', hoot: 'owl hoo hoo-hoo', quack: 'duck', honk: 'goose',
  gull: 'seagull', cry: 'eagle or hawk', flutter: 'wing flaps', ribbit: 'frog', croak: 'big toad', plop: 'something drops in water',
  bubble: 'bubbles (count)', splash: 'splash', drip: 'water drip', wave: 'one sea wave (size = height)', whale: 'whale song',
  buzz: 'bee', hum: 'beetle or dragonfly hum', cricket: 'one cricket chirp', squeak: 'mouse', chitter: 'squirrel',
  sniff: 'hedgehog or mole sniffing', snore: 'sleeping animal', purr: 'cat purr', meow: 'cat', woof: 'soft puppy',
  bleat: 'goat', whistle: 'marmot alarm', dig: 'digging paws', crunch: 'crunch', rustle: 'leaves', snap: 'twig snap',
  tok: 'wood knock (woodpecker with count)', knock: 'door knock', step: 'footstep', creak: 'door or branch creak',
  squelch: 'mud', pop: 'pop', boing: 'springy bounce', whoosh: 'air swoosh', gust: 'wind gust', thunder: 'distant thunder (near 0..1)',
  crackle: 'fire crackle', chime: 'wind chimes in key', bells: 'goat bells in key', twinkle: 'three bell notes', sparkle: 'celesta run',
  wonder: 'wonder chord', tada: 'little fanfare', hmm: 'curious hmm', startle: 'startled', jarIn: 'firefly into jar',
  release: 'release arpeggio', discover: 'discovery reveal', enter: 'entering an instance', leave: 'leaving an instance',
  travel: 'travel whoosh', tap: 'soft tap confirmation',
  grass: 'fingers through grass', bloom: 'a flower opening', apple: 'an apple dropping on grass', seal: 'a young seal', thump: 'a rabbit foot thump',
  swirl: 'a soft magical wind starting', drop: 'one raindrop on a roof or leaf', wipe: 'a hand wiping the sky clear', mist: 'a hand resting in fog',
  sun: 'the sun or moon held (in key)', season: 'the season turning (in key)',
};
