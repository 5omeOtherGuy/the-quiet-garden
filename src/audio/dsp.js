// Offline DSP: everything that is synthesised into AudioBuffers at load time (no sample files).
// Reverb impulses, noise colours, Karplus-Strong plucks, and the textured loops behind rain, crickets and streams.

import { mulberry32 } from './theory.js';

/** Reverb rooms. seconds = tail length, decay = how fast it falls, damp = how fast highs die, early = early reflections. */
export const ROOMS = {
  garden: { seconds: 2.2, rt: 1.7, damp: 0.55, early: 4, pre: 0.012, width: 0.9 },
  open: { seconds: 1.6, rt: 1.1, damp: 0.5, early: 2, pre: 0.008, width: 0.8 },
  wood: { seconds: 2.6, rt: 2.0, damp: 0.65, early: 6, pre: 0.018, width: 1 },
  hall: { seconds: 2.8, rt: 2.3, damp: 0.6, early: 5, pre: 0.03, width: 1 },     // mountains: a wide valley
  cave: { seconds: 2.8, rt: 2.2, damp: 0.75, early: 10, pre: 0.02, width: 1 },
  burrow: { seconds: 1.4, rt: 0.9, damp: 0.85, early: 8, pre: 0.004, width: 0.6 }, // small, earthy, close
  sea: { seconds: 3.0, rt: 2.4, damp: 0.9, early: 3, pre: 0.025, width: 1 },     // underwater: long and dark
  nook: { seconds: 2.6, rt: 2.1, damp: 0.7, early: 6, pre: 0.015, width: 0.9 },
  falls: { seconds: 2.0, rt: 1.5, damp: 0.6, early: 3, pre: 0.01, width: 1 },    // open air in a glade, rock behind the water
  water: { seconds: 1.9, rt: 1.4, damp: 0.85, early: 4, pre: 0.014, width: 1 },  // the soft dark room every drop and splash tails off into
};

/**
 * A plucked string over a jawari bridge (sitar, tanpura), rendered additively once per pitch into a mono buffer at
 * 16 kHz (nothing above about 4 kHz is made, so 16 kHz loses nothing and saves memory and render time).
 * The wide, gently curved bridge lets the string graze it: energy moves into a band of harmonics that drifts slowly
 * up through the spectrum while the note rings (the "jiva" buzz), and upper harmonics die sooner than low ones.
 * o: seconds, maxHz (top harmonic), tilt (amplitude ~ 1/n^tilt), tau (fundamental decay time constant, s),
 *    hiDecay (how much faster each higher harmonic decays), attack (s), sweep {from, to, time, width, gain} (the buzz
 *    band, in harmonic numbers), shimmer (Hz: the string's two planes of motion beating slowly), pluck (a soft
 *    plectrum tick, 0..1), lowCut (Hz: a gentle roll-off of low fundamentals, steeper under 120 Hz), soften ({harmonic:
 *    factor}, e.g. the 7th, which sits between the raga's notes), sym (sympathetic strings:
 *    [[harmonic, amp, rise s, tau s]] that swell after the pluck and ring on), seed.
 */
export function makeJawari(ctx, freq, o = {}) {
  const SR = 16000, seconds = o.seconds ?? 3.5, len = Math.floor(SR * seconds);
  let buf;
  try { buf = ctx.createBuffer(1, len, SR); } catch (_) { return makeJawariAt(ctx, freq, o, ctx.sampleRate); }
  fillJawari(buf.getChannelData(0), SR, freq, o);
  return buf;
}
function makeJawariAt(ctx, freq, o, sr) {
  const buf = ctx.createBuffer(1, Math.floor(sr * (o.seconds ?? 3.5)), sr);
  fillJawari(buf.getChannelData(0), sr, freq, o); return buf;
}
function fillJawari(d, sr, freq, o) {
  const len = d.length, rnd = mulberry32((o.seed ?? 5) + Math.round(freq));
  const maxHz = o.maxHz ?? 3800, tilt = o.tilt ?? 1, tau = o.tau ?? 1.6, hi = o.hiDecay ?? 0.1, att = o.attack ?? 0.004;
  const sw = o.sweep || { from: 3, to: 10, time: 1, width: 2.5, gain: 1.5 }, lc = o.lowCut ?? 0, inh = o.inharm ?? 0.00004;
  const BLK = 32, nBlk = Math.ceil(len / BLK) + 1;
  const parts = [];
  const N = Math.max(1, Math.min(40, Math.floor(maxHz / freq)));
  for (let n = 1; n <= N; n++) {
    const fn = freq * n * (1 + inh * n * n);
    let lowK = lc ? fn / Math.sqrt(fn * fn + lc * lc) : 1; if (lc && fn < 120) lowK *= lowK; // steeper under 120 Hz: no low hum
    if (o.soften && o.soften[n]) lowK *= o.soften[n];
    const top = n * freq > maxHz * 0.7 ? Math.max(0, (maxHz - n * freq) / (maxHz * 0.3)) : 1; // soft top: nothing sharp
    parts.push({ f: fn, a: lowK * top / Math.pow(n, tilt), tau: tau / (1 + hi * (n - 1)), n, ph: rnd() * Math.PI * 2 });
    if (o.shimmer && n <= 8) parts.push({ f: fn + o.shimmer * (0.6 + 0.4 * rnd()), a: 0.3 * lowK * top / Math.pow(n, tilt), tau: tau * 0.8 / (1 + hi * (n - 1)), n, ph: rnd() * Math.PI * 2 });
  }
  for (const [h, amp, rise, tau2] of o.sym || []) { // sympathetic strings tuned to the note's harmonics, a hair off
    const fn = freq * h * (1 + (rnd() < 0.5 ? -1 : 1) * 0.0009);
    if (fn < maxHz) parts.push({ f: fn, a: amp, tau: tau2, rise, n: h, ph: rnd() * Math.PI * 2, sym: true });
  }
  const env = new Float32Array(nBlk), floor = 2e-4 * Math.max(...parts.map((p) => p.a)); // -74 dB: stop a partial there
  for (const p of parts) {
    for (let b = 0; b < nBlk; b++) { // envelope per block of 32 samples
      const t = (b * BLK) / sr;
      let e;
      if (p.sym) e = (1 - Math.exp(-t / p.rise)) * Math.exp(-t / p.tau);
      else {
        const c = sw.from + (sw.to - sw.from) * (1 - Math.exp(-t / sw.time)), z = (p.n - c) / sw.width;
        e = Math.min(1, t / att) * Math.exp(-t / p.tau) * (1 + sw.gain * Math.exp(-z * z) * Math.min(1, t / 0.08));
      }
      env[b] = p.a * e;
    }
    let last = nBlk - 1; while (last > 0 && env[last] < floor) last--;
    const stop = Math.min(len, (last + 1) * BLK);
    const w = (2 * Math.PI * p.f) / sr, cw = Math.cos(w), sn = Math.sin(w);
    let x = Math.cos(p.ph), y = Math.sin(p.ph);
    for (let b = 0, i = 0; i < len; b++) {
      if (i >= stop) break;
      const e0 = env[b], de = (env[b + 1] - e0) / BLK, end = Math.min(len, i + BLK);
      let e = e0;
      for (; i < end; i++) { const nx = x * cw - y * sn; y = x * sn + y * cw; x = nx; d[i] += y * e; e += de; }
      const r = 1 / Math.sqrt(x * x + y * y); x *= r; y *= r; // keep the rotation on the unit circle
    }
  }
  if (o.pluck) { // a soft plectrum tick: a few ms of rounded noise
    const n = Math.floor(sr * 0.012); let lp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) { lp += 0.25 * ((rnd() * 2 - 1) - lp); lp2 += 0.35 * (lp - lp2); d[i] += lp2 * o.pluck * 6 * Math.exp(-i / (sr * 0.003)); }
  }
  let peak = 0; for (let i = 0; i < len; i++) if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]);
  const g = 0.9 / (peak || 1), fo = Math.floor(sr * 0.3);
  for (let i = 0; i < len; i++) d[i] *= g * (i > len - fo ? (len - i) / fo : 1);
}

export function makeImpulse(ctx, room, seed = 7) {
  const R = ROOMS[room] || ROOMS.garden, sr = ctx.sampleRate, len = Math.floor(sr * R.seconds);
  const buf = ctx.createBuffer(2, len, sr), rnd = mulberry32(seed);
  const k = 6.91 / R.rt; // -60 dB at rt seconds
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let y = 0, y2 = 0;
    const pre = Math.floor(R.pre * sr * (ch ? 1.13 : 1));
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr, x = rnd() * 2 - 1;
      // high frequencies die sooner: a one-pole lowpass that closes as the tail goes on
      const a = Math.min(0.97, 0.08 + R.damp * (t / R.rt) * 1.1);
      y += (1 - a) * (x - y); y2 += (1 - a * 0.6) * (y - y2);
      const fadeIn = Math.min(1, t / 0.006), fadeOut = Math.min(1, (len - i) / (sr * 0.25));
      d[i] = y2 * Math.exp(-k * t) * fadeIn * fadeOut;
    }
    // early reflections: a few distinct soft taps
    for (let e = 0; e < R.early; e++) {
      const at = pre + Math.floor(sr * (0.006 + rnd() * 0.07 * (1 + e * 0.15)));
      if (at < len) d[at] += (rnd() < 0.5 ? -1 : 1) * (0.5 - e * 0.03) * (0.5 + rnd() * 0.5);
    }
  }
  if (R.width < 1) { // narrower rooms: blend the right channel towards the left
    const l = buf.getChannelData(0), r = buf.getChannelData(1);
    for (let i = 0; i < len; i++) r[i] = R.width * r[i] + (1 - R.width) * l[i];
  }
  return buf;
}

/** Stereo noise loops: white, pink (Kellet filter) and brown (leaky integrator). */
export function makeNoise(ctx, color = 'white', seconds = 4, seed = 11) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds), buf = ctx.createBuffer(2, len, sr), rnd = mulberry32(seed);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2 - 1; let v;
      if (color === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      } else if (color === 'brown') { br = (br + 0.02 * w) / 1.02; v = br; }
      else v = w;
      d[i] = v; if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    // seamless loop: crossfade the last 50 ms into the start, then normalise
    const xf = Math.floor(sr * 0.05);
    for (let i = 0; i < xf; i++) { const a = i / xf; d[i] = d[i] * a + d[len - xf + i] * (1 - a); }
    const g = 0.9 / (peak || 1); for (let i = 0; i < len - xf; i++) d[i] *= g;
  }
  return trimLoop(buf, ctx, Math.floor(sr * 0.05));
}

function trimLoop(buf, ctx, cut) {
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length - cut, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) out.getChannelData(ch).set(buf.getChannelData(ch).subarray(0, buf.length - cut));
  return out;
}

/**
 * Karplus-Strong plucked string, rendered once per pitch and cached. Returns {buffer, rate}: play the buffer at
 * playbackRate = rate to land exactly on the wanted frequency (the delay line is a whole number of samples).
 * bright 0..1 colours the pluck; sustain 0..1 sets how long the string rings.
 */
export function makePluck(ctx, freq, { bright = 0.5, sustain = 0.5, seconds = 2.2, seed = 3, body = 0 } = {}) {
  const sr = ctx.sampleRate, N = Math.max(2, Math.floor(sr / freq)), rate = freq / (sr / N);
  const len = Math.floor(sr * seconds), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0), rnd = mulberry32(seed + N);
  const line = new Float32Array(N);
  // excitation: noise softened by a lowpass (dark pluck) mixed with a triangle (finger-like)
  let lp = 0; const a = 0.15 + 0.8 * (1 - bright);
  for (let i = 0; i < N; i++) { lp += (1 - a) * ((rnd() * 2 - 1) - lp); const tri = 1 - 2 * Math.abs((i / N) * 2 - 1); line[i] = lp * 0.75 + tri * 0.35; }
  let mean = 0; for (let i = 0; i < N; i++) mean += line[i]; mean /= N; for (let i = 0; i < N; i++) line[i] -= mean;
  // loss per period chosen so higher strings do not ring forever and low strings do not die instantly
  const ringSeconds = 0.5 + 3.2 * sustain * Math.min(1, 220 / freq + 0.35);
  const loss = Math.pow(0.001, 1 / (ringSeconds * (sr / N)));
  const s = 0.5 + 0.12 * bright; // averaging weight, brighter = less smoothing
  let idx = 0, prev = 0, peak = 0;
  for (let i = 0; i < len; i++) {
    const cur = line[idx], v = (s * cur + (1 - s) * prev) * loss;
    prev = cur; line[idx] = v; idx = idx + 1 === N ? 0 : idx + 1;
    d[i] = cur; if (Math.abs(cur) > peak) peak = Math.abs(cur);
  }
  if (body) { // a gentle wooden body resonance (two-pole) for the 'pluck' guitar-ish voice
    let z1 = 0, z2 = 0; const f = 2 * Math.cos((2 * Math.PI * 210) / sr), r = 0.995;
    for (let i = 0; i < len; i++) { const y = d[i] * 0.08 + f * r * z1 - r * r * z2; z2 = z1; z1 = y; d[i] += y * body; }
    peak = 0; for (let i = 0; i < len; i++) if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]);
  }
  const g = 0.95 / (peak || 1), fo = Math.floor(sr * 0.08);
  for (let i = 0; i < len; i++) d[i] *= g * (i > len - fo ? (len - i) / fo : 1);
  return { buffer: buf, rate };
}

/** Rain on leaves and soft ground, calm (BRIEF point 21: the first version was too hectic and too high): many soft,
 *  low taps with rounded onsets, fewer fuller drops with body, as a seamless stereo loop. The bed adds a soft wash. */
export function makeRainLoop(ctx, seconds = 3.7, seed = 21) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds), buf = ctx.createBuffer(2, len, sr), rnd = mulberry32(seed);
  const add = (ch, at, f, dec, amp, rise) => { // a damped tone with a rounded (raised-cosine) onset: no click
    const d = buf.getChannelData(ch), n = Math.floor(dec * sr * 5), w = (2 * Math.PI * f) / sr, r = Math.max(1, Math.floor(rise * sr));
    for (let i = 0; i < n; i++) { const j = (at + i) % len, on = i < r ? 0.5 - 0.5 * Math.cos((Math.PI * i) / r) : 1; d[j] += amp * on * Math.sin(w * i) * Math.exp(-i / (dec * sr)); }
  };
  for (let i = 0; i < seconds * 240; i++) { // patter: soft and low
    const at = Math.floor(rnd() * len), amp = 0.05 + 0.18 * Math.pow(rnd(), 2), f = 500 + Math.pow(rnd(), 1.5) * 1700, ch = rnd() < 0.5 ? 0 : 1;
    add(ch, at, f, 0.004 + rnd() * 0.005, amp, 0.0015); add(1 - ch, at + 9, f * 0.98, 0.004, amp * 0.4, 0.0015);
  }
  for (let i = 0; i < seconds * 16; i++) { // fuller drops on leaves and earth: the body of the rain
    const at = Math.floor(rnd() * len), f = 160 + rnd() * 380, ch = rnd() < 0.5 ? 0 : 1, amp = 0.3 + rnd() * 0.35;
    add(ch, at, f, 0.018 + rnd() * 0.022, amp, 0.004); add(1 - ch, at + 13, f * 1.02, 0.016, amp * 0.5, 0.004);
  }
  return normalise(buf, 0.9);
}

/** Crickets: a few insects chirping at slightly different pitches and rates, panned apart, looping. */
export function makeCricketLoop(ctx, seconds = 4.2, seed = 31) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds), buf = ctx.createBuffer(2, len, sr), rnd = mulberry32(seed);
  const bugs = [
    { f: 4350, period: 0.62, pulses: 3, pan: 0.2 }, { f: 4720, period: 0.84, pulses: 4, pan: 0.8 },
    { f: 4100, period: 1.05, pulses: 3, pan: 0.5 }, { f: 5020, period: 0.53, pulses: 2, pan: 0.35 },
  ];
  for (const b of bugs) {
    const per = seconds / Math.round(seconds / b.period); // integer chirps per loop keeps it seamless
    for (let t0 = rnd() * per; t0 < seconds; t0 += per) {
      const amp = 0.55 + rnd() * 0.45;
      for (let p = 0; p < b.pulses; p++) {
        const at = Math.floor((t0 + p * 0.042) * sr), n = Math.floor(0.022 * sr), w = (2 * Math.PI * b.f) / sr;
        for (let i = 0; i < n; i++) {
          const e = Math.sin((Math.PI * i) / n) ** 2 * amp, v = Math.sin(w * i) * e, j = (at + i) % len;
          buf.getChannelData(0)[j] += v * (1 - b.pan); buf.getChannelData(1)[j] += v * b.pan;
        }
      }
    }
  }
  return normalise(buf, 0.85);
}

/** Stream babble, calm: fewer, lower, rounder bubble resonances (slowly rising sine blips) over a soft bed. */
export function makeStreamLoop(ctx, seconds = 4.6, seed = 41) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds), buf = ctx.createBuffer(2, len, sr), rnd = mulberry32(seed);
  for (let k = 0; k < seconds * 42; k++) {
    const at = Math.floor(rnd() * len), f0 = 170 + Math.pow(rnd(), 1.8) * 650, dec = 0.02 + rnd() * 0.045, amp = 0.15 + rnd() * 0.45;
    const ch = rnd() < 0.5 ? 0 : 1, n = Math.floor(dec * sr * 4), r = Math.floor(sr * 0.004); let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, f = f0 * (1 + t * 3); ph += (2 * Math.PI * f) / sr;
      const v = Math.sin(ph) * amp * Math.exp(-t / dec) * (i < r ? 0.5 - 0.5 * Math.cos((Math.PI * i) / r) : 1), j = (at + i) % len;
      buf.getChannelData(ch)[j] += v; buf.getChannelData(1 - ch)[j] += v * 0.45;
    }
  }
  return normalise(buf, 0.85);
}

function normalise(buf, target) {
  let peak = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]); }
  const g = target / (peak || 1);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] *= g; }
  return buf;
}

/** Soft-knee ceiling for the WaveShaper at the end of the chain. Input is pre-scaled by 0.5 (range +-2). */
export function makeCeilingCurve(ceiling = 0.86, knee = 0.6, points = 4097) {
  const c = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const s = ((i / (points - 1)) * 2 - 1) * 2, a = Math.abs(s);
    const y = a < knee ? a : knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee));
    c[i] = Math.sign(s) * Math.min(y, ceiling);
  }
  return c;
}
