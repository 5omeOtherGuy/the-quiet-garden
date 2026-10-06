// Synthesised instruments. Every one is built from oscillators, shared noise or a cached Karplus-Strong buffer.
// play(E, opts) schedules one note and registers it as a voice (voice limits steal the oldest when full).

const TAU = Math.PI * 2;

// gain = loudness trim so every instrument sits at a similar level; dur = default note length in seconds.
export const INSTRUMENTS = {
  box:      { gain: 1.0, dur: 1.7, label: 'music box (the original)' },
  musicbox: { gain: 1.0, dur: 2.0, label: 'music box' },
  kalimba:  { gain: 1.0, dur: 1.6, label: 'kalimba' },
  celesta:  { gain: 0.95, dur: 2.4, label: 'celesta' },
  bell:     { gain: 0.8, dur: 2.2, label: 'bells' },
  glass:    { gain: 0.8, dur: 2.8, label: 'glass (winter)' },
  marimba:  { gain: 1.3, dur: 0.9, label: 'marimba' },
  flute:    { gain: 0.45, dur: 1.1, label: 'soft flute', sustained: true },
  pluck:    { gain: 1.15, dur: 2.0, label: 'plucked string' },
  harp:     { gain: 1.9, dur: 2.6, label: 'harp' },
  water:    { gain: 1.0, dur: 1.7, label: 'water drop (the original)' },
  pet:      { gain: 1.0, dur: 1.7, label: 'soft hum (the original raven pet)' },
  choir:    { gain: 0.7, dur: 2.4, label: 'soft choir "ooh"', sustained: true },
  drone:    { gain: 0.65, dur: 3.0, label: 'bowed drone', sustained: true },
  pad:      { gain: 0.4, dur: 4.0, label: 'warm pad', sustained: true },
  sitar:    { gain: 0.9, dur: 2.4, label: 'sitar (buzzing bridge, slides, sympathetic strings)' },
  tanpura:  { gain: 0.8, dur: 6.5, label: 'tanpura (one drone string; the falls bed plays all four)', sustained: true },
};

// The two Indian strings, as jawari renders (web/src/audio/dsp.js makeJawari). Soft on purpose: a rounded plectrum,
// nothing rendered above about 3.8 kHz, and a lowpass on the way out.
const SITAR = { seconds: 4.2, maxHz: 3800, tilt: 0.85, tau: 2.0, hiDecay: 0.13, attack: 0.004, pluck: 0.05, shimmer: 0.35, soften: { 7: 0.5, 14: 0.6 },
  sweep: { from: 2.5, to: 9, time: 0.8, width: 2.4, gain: 1.6 },
  sym: [[2, 0.05, 0.25, 2.2], [3, 0.035, 0.3, 2.0], [4, 0.025, 0.35, 1.8]] }; // taraf strings ring on after the note
const TANPURA = { seconds: 7, maxHz: 3200, tilt: 1.05, tau: 2.8, hiDecay: 0.035, attack: 0.03, shimmer: 0.25, lowCut: 110, soften: { 7: 0.4, 14: 0.5, 21: 0.6 },
  sweep: { from: 4, to: 15, time: 2.4, width: 3.5, gain: 2.2 } }; // the slow swirl rising through the harmonics
export const INSTRUMENT_NAMES = Object.keys(INSTRUMENTS);

/** Ring a set of sine partials [ratio, amp, decay fraction of dur] into out. */
function partials(E, out, f, t, d, list, attack = 0.004, detune = 0) {
  const ctx = E.ctx, srcs = [];
  for (const [r, a, df = 1] of list) {
    const fr = f * r; if (fr > 15000 || a <= 0) continue;
    const o = E.osc('sine', fr, t, t + d * df + 0.05);
    if (detune) o.detune.value = detune * (r % 2 ? 1 : -1);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0, t); pg.gain.linearRampToValueAtTime(a, t + attack); pg.gain.exponentialRampToValueAtTime(0.0001, t + d * df);
    o.connect(pg); pg.connect(out); srcs.push(o);
  }
  return srcs;
}

/** A short noise click (mallet or tine) filtered around freq. */
function click(E, out, t, freq, q, amp, len = 0.012, color = 'white') {
  const s = E.noiseSrc(color, t, t + len + 0.02), bp = E.ctx.createBiquadFilter(), cg = E.ctx.createGain();
  bp.type = 'bandpass'; bp.frequency.value = Math.min(12000, freq); bp.Q.value = q;
  cg.gain.setValueAtTime(amp, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(bp); bp.connect(cg); cg.connect(out); return s;
}

const BUILD = {
  box(E, out, f, t, d) { // the original voice, exactly
    return partials(E, out, f, t, d, [[1, 1], [3, 0.07], [4.1, 0.025]], 0.01);
  },
  musicbox(E, out, f, t, d) {
    return [...partials(E, out, f, t, d, [[1, 1, 1], [2, 0.05, 0.4], [3, 0.09, 0.35], [4.1, 0.035, 0.22]], 0.003),
      click(E, out, t, f * 6, 4, 0.12, 0.006)];
  },
  kalimba(E, out, f, t, d) {
    return [...partials(E, out, f, t, d, [[1, 1, 1], [2.0, 0.05, 0.3], [5.6, 0.16, 0.1], [11.8, 0.04, 0.05]], 0.002),
      click(E, out, t, f * 3, 2, 0.16, 0.01, 'pink')];
  },
  celesta(E, out, f, t, d) {
    return [...partials(E, out, f, t, d, [[1, 1, 1], [2, 0.22, 0.4], [3, 0.1, 0.2], [4, 0.05, 0.12], [0.5, 0.06, 0.6]], 0.004, 2),
      click(E, out, t, f * 4, 3, 0.05, 0.01)];
  },
  bell(E, out, f, t, d) { // the original bell partials plus a soft hum and a high shimmer
    return partials(E, out, f, t, d, [[1, 1, 1], [2.76, 0.16, 0.55], [5.4, 0.05, 0.3], [8.93, 0.018, 0.15], [0.5, f < 700 ? 0.08 : 0, 0.8]], 0.003);
  },
  glass(E, out, f, t, d) {
    const srcs = partials(E, out, f, t, d, [[1, 0.8, 1], [2, 0.14, 0.7], [3, 0.05, 0.5]], 0.05);
    srcs.push(...partials(E, out, f * 1.0035, t, d, [[1, 0.5, 0.9]], 0.08)); // slow beating shimmer
    return srcs;
  },
  marimba(E, out, f, t, d) {
    const lp = E.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(9000, f * 10); lp.connect(out);
    return [...partials(E, lp, f, t, d, [[1, 1, 1], [3.9, 0.14, 0.28], [9.2, 0.03, 0.1]], 0.002),
      click(E, lp, t, f * 2, 1.5, 0.12, 0.008, 'pink')];
  },
  flute(E, out, f, t, d, o) {
    const ctx = E.ctx, wave = E.wave('flute', [1, 0.12, 0.04]);
    const osc = E.osc(wave, f, t, t + d + 0.1);
    const lfo = E.osc('sine', 4.8 + E.rand(-0.3, 0.3), t, t + d + 0.1), lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.5, d * 0.4));
    lfo.connect(lg); lg.connect(osc.frequency);
    const env = ctx.createGain(), a = o.attack ?? 0.08;
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(1, t + a);
    env.gain.setTargetAtTime(0.7, t + a, d * 0.3); env.gain.setTargetAtTime(0, t + d * 0.75, d * 0.1);
    osc.connect(env); env.connect(out);
    // breath: noise around the pitch, louder at the start (the chiff), then a soft airy bed
    const n = E.noiseSrc('pink', t, t + d + 0.1), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = Math.min(9000, f * 2); bp.Q.value = 1.5;
    ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.22 * (o.breath ?? 1), t + 0.03);
    ng.gain.setTargetAtTime(0.06 * (o.breath ?? 1), t + 0.05, 0.08); ng.gain.setTargetAtTime(0, t + d * 0.75, d * 0.1);
    n.connect(bp); bp.connect(ng); ng.connect(out);
    return [osc, lfo, n];
  },
  pluck(E, out, f, t, d, o) { return ks(E, out, f, t, d, { bright: 0.35 + 0.3 * (o.bright ?? 1), sustain: 0.45, body: 0.6 }); },
  harp(E, out, f, t, d, o) { return ks(E, out, f, t, d, { bright: 0.55 + 0.35 * (o.bright ?? 1), sustain: 0.8, body: 0 }); },
  water(E, out, f, t, d) { // the original drop: a glide up by 12 % over 80 ms
    const srcs = partials(E, out, f, t, d, [[1, 1], [2, 0.1]], 0.01);
    for (const [i, o] of srcs.entries()) o.frequency.exponentialRampToValueAtTime(f * (i + 1) * 1.12, t + 0.08);
    return srcs;
  },
  pet(E, out, f, t, d) { return partials(E, out, f, t, d, [[1, 1], [2, 0.06]], 0.08); },
  choir(E, out, f, t, d, o) { // two saws through vowel formants: a soft "ooh"
    const ctx = E.ctx, mix = ctx.createGain(), env = ctx.createGain(), a = o.attack ?? 0.25;
    const s1 = E.osc('sawtooth', f, t, t + d + 0.6), s2 = E.osc('sawtooth', f, t, t + d + 0.6); s2.detune.value = 9; s1.detune.value = -6;
    const vib = E.osc('sine', 5.2, t, t + d + 0.6), vg = ctx.createGain(); vg.gain.value = f * 0.004; vib.connect(vg); vg.connect(s1.frequency); vg.connect(s2.frequency);
    s1.connect(mix); s2.connect(mix); mix.gain.value = 0.5;
    for (const [ff, q, amp] of [[320, 6, 1], [800, 8, 0.35], [2500, 10, 0.06]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = q;
      const fg = ctx.createGain(); fg.gain.value = amp * 2.2; mix.connect(bp); bp.connect(fg); fg.connect(env);
    }
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(1, t + a); env.gain.setTargetAtTime(0, t + d, 0.25);
    env.connect(out); return [s1, s2, vib];
  },
  drone(E, out, f, t, d, o) { // bowed: saws, slowly breathing lowpass, slow bow attack
    const ctx = E.ctx, lp = ctx.createBiquadFilter(), env = ctx.createGain(), a = o.attack ?? 0.6;
    lp.type = 'lowpass'; lp.Q.value = 0.7; lp.frequency.value = f * (2.2 + 1.5 * (o.bright ?? 1));
    const s1 = E.osc('sawtooth', f, t, t + d + 1.2), s2 = E.osc('sawtooth', f * 1.003, t, t + d + 1.2), sub = E.osc('sine', f / 2, t, t + d + 1.2);
    const sg = ctx.createGain(); sg.gain.value = f >= 220 ? 0.35 : 0; sub.connect(sg); sg.connect(env); // no sub-bass drone under low notes
    const lfo = E.osc('sine', 0.13 + E.rand(0, 0.1), t, t + d + 1.2), lg = ctx.createGain(); lg.gain.value = f * 0.8; lfo.connect(lg); lg.connect(lp.frequency);
    s1.connect(lp); s2.connect(lp); lp.connect(env);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.32, t + a); env.gain.setTargetAtTime(0, t + d, 0.4);
    env.connect(out); return [s1, s2, sub, lfo];
  },
  pad(E, out, f, t, d, o) { // warm: detuned triangles and a saw, low cutoff, long attack and release
    const ctx = E.ctx, lp = ctx.createBiquadFilter(), env = ctx.createGain(), a = o.attack ?? 1.2;
    lp.type = 'lowpass'; lp.frequency.value = Math.min(2400, 500 + f * 1.2) * (0.6 + 0.6 * (o.bright ?? 1)); lp.Q.value = 0.4;
    const s = [E.osc('triangle', f, t, t + d + 2.5), E.osc('triangle', f, t, t + d + 2.5), E.osc('sawtooth', f, t, t + d + 2.5)];
    s[0].detune.value = -7; s[1].detune.value = 7; s[2].detune.value = 2;
    const sg = ctx.createGain(); sg.gain.value = 0.25; s[2].connect(sg); sg.connect(lp); s[0].connect(lp); s[1].connect(lp);
    lp.connect(env);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.55, t + a); env.gain.setTargetAtTime(0, t + d, 0.7);
    env.connect(out); return s;
  },
  sitar(E, out, f, t, d, o) {
    // o.from: a frequency to slide (meend) from into f; o.glide: slide seconds; o.hold: seconds on `from` first.
    // Painted notes a small step from the last sitar note sometimes slide into place by themselves.
    const ctx = E.ctx, buf = E.jawari('sitar', f, SITAR);
    let from = o.from, glide = o.glide ?? 0.35, hold = o.hold ?? 0.06;
    const last = E._sitar;
    if (!from && o.slide !== false && last && t - last.t < 0.7 && t > last.t) {
      const r = f / last.f; if (r > 1.04 && r < 1.27 || (r < 0.96 && r > 0.79)) { if (E.rng() < 0.35) { from = last.f; glide = 0.13; hold = 0.02; } }
    }
    E._sitar = { f, t };
    const s = ctx.createBufferSource(); s.buffer = buf;
    if (from > 0 && Math.abs(from / f - 1) > 0.01) {
      const r0 = Math.max(0.5, Math.min(2, from / f));
      s.playbackRate.setValueAtTime(r0, t); s.playbackRate.setValueAtTime(r0, t + hold);
      s.playbackRate.exponentialRampToValueAtTime(1, t + hold + glide);
    }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.5;
    const env = ctx.createGain(); env.gain.setValueAtTime(1, t); env.gain.setTargetAtTime(0, t + d, 0.3);
    s.connect(lp); lp.connect(env); env.connect(out);
    s.start(t); s.stop(t + Math.min(buf.duration, d + 1.4));
    return [s];
  },
  tanpura(E, out, f, t, d, o) { // one string; a long note is plucked again every few seconds, as a player does
    const ctx = E.ctx, buf = E.jawari('tanpura', f, TANPURA), every = o.every ?? 4.5, srcs = [];
    const env = ctx.createGain(), a = o.attack ?? 0.03;
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(1, t + Math.min(a, 3)); env.gain.setTargetAtTime(0, t + d, 0.9);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.Q.value = 0.4;
    lp.connect(env); env.connect(out);
    for (let at = t, k = 0; at < t + Math.max(0.01, d) && k < 12; at += every * (0.95 + 0.1 * E.rng()), k++) {
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(lp); s.start(at); s.stop(Math.min(at + buf.duration, t + d + 4)); srcs.push(s);
    }
    return srcs;
  },
};

/** Render the sitar and tanpura notes of a key ahead of time, a few per idle slice, so the first notes do not stall. */
export function warmJawari(E, freqs, kinds = ['sitar']) {
  const todo = []; for (const k of kinds) for (const f of freqs) todo.push([k, f]);
  const step = () => { if (todo.length) { const [k, f] = todo.shift(); E.jawari(k, f, k === 'sitar' ? SITAR : TANPURA); } if (todo.length) later(step); };
  const later = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 40));
  if (E.offline) { while (todo.length) { const [k, f] = todo.shift(); E.jawari(k, f, k === 'sitar' ? SITAR : TANPURA); } } else later(step);
}

function ks(E, out, f, t, d, o) {
  const { buffer, rate } = E.pluck(Math.max(40, Math.min(3000, f)), { bright: Math.round(o.bright * 10) / 10, sustain: o.sustain, body: o.body, seconds: 2.4 });
  const s = E.ctx.createBufferSource(); s.buffer = buffer; s.playbackRate.value = rate * (f > 3000 ? f / 3000 : 1);
  const env = E.ctx.createGain(); env.gain.setValueAtTime(1, t); env.gain.setTargetAtTime(0, t + d, 0.12);
  s.connect(env); env.connect(out); s.start(t); s.stop(t + Math.min(buffer.duration / s.playbackRate.value, d + 0.8));
  return [s];
}

/**
 * Play one note. o: {freq, instrument, vol 0..1 (default .35), dur, time (absolute ctx time), delay, pan -1..1,
 * bright 0..1, attack, breath, bus: 'music'|'sfx'|'amb', dest (AudioNode), prio}
 * Returns the voice handle {out, end, release(t?)} or null if the instrument is unknown.
 */
export function playNote(E, o) {
  const name = INSTRUMENTS[o.instrument] ? o.instrument : 'musicbox', def = INSTRUMENTS[name];
  const f = o.freq; if (!(f > 0) || !isFinite(f)) return null;
  const t = Math.max(E.now(), o.time ?? E.now()) + (o.delay || 0), d = o.dur || def.dur;
  const busName = o.bus || 'music', dest = o.dest || (busName === 'music' ? E.master.musicIn : E.master[busName].in);
  const out = E.out(dest, o.pan || 0);
  if (o.wet) E.wetSend(out, o.wet);
  const vol = Math.max(0, Math.min(1.5, o.vol ?? 0.35)) * def.gain;
  // brightness: a gentle per-voice lowpass when the env darkens things (night, storm, fog)
  let into = out;
  if ((o.bright ?? 1) < 0.98) {
    const lp = E.ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 900 + 9000 * Math.pow(o.bright, 1.5); lp.Q.value = 0.3; lp.connect(out); into = lp;
  }
  out.gain.setValueAtTime(vol, t);
  const sources = BUILD[name](E, into, f, t, d, o);
  const tail = def.sustained ? (name === 'pad' ? 3.2 : name === 'drone' ? 2 : 1) : 0.1;
  const v = E.addVoice(busName, { out, sources, end: t + d + tail, start: t, prio: o.prio || 0, instrument: name, freq: f });
  v.release = (when = E.now()) => {
    if (v.end < when) return;
    try { out.gain.cancelScheduledValues(when); out.gain.setValueAtTime(out.gain.value, when); out.gain.setTargetAtTime(0, when, def.sustained ? 0.5 : 0.1); } catch (_) {}
    for (const s of sources) try { s.stop(when + 3); } catch (_) {}
    v.end = Math.min(v.end, when + 3);
  };
  return v;
}

export { TAU };
