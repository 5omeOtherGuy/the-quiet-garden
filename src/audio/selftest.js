// Offline measurements for the audio system: renders scenarios with OfflineAudioContext and reports levels.
// Used by web/audio-lab.html (button "Measure") and by the headless check (window.runAudioTests()).
// Channels 0-1 of each render are the final output; channels 2-3 are the mix before the compressor and limiter,
// which shows how hard the dynamics are working.

import { createAudio } from './index.js';
import { INSTRUMENT_NAMES } from './instruments.js';
import { VOICE_INFO } from './voices.js';
import { PRESET_NAMES, PRESETS } from './places.js';
import { matches } from './theory.js';

const SR = 44100;
const VIEW = { x: 0, y: 0, w: 1778, h: 1000 };
const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const r1 = (v) => (isFinite(v) ? Math.round(v * 10) / 10 : v);

export async function render(name, seconds, setup, step, opts = {}) {
  const ctx = new OfflineAudioContext({ numberOfChannels: 4, length: Math.ceil(SR * seconds), sampleRate: SR });
  const merger = ctx.createChannelMerger(4); merger.connect(ctx.destination);
  const out = ctx.createGain(); out.channelCount = 2; out.channelCountMode = 'explicit';
  const so = ctx.createChannelSplitter(2); out.connect(so); so.connect(merger, 0, 0); so.connect(merger, 1, 1);
  const api = createAudio(ctx, { offline: true, seed: opts.seed ?? 99, destination: out, ...(opts.manifest !== undefined ? { manifest: opts.manifest } : {}) });
  if (opts.preload && api.samples) await api.samples.preloadAll(opts.preload === true ? undefined : opts.preload);
  const sp = ctx.createChannelSplitter(2); api.engine.master.air.connect(sp); sp.connect(merger, 0, 2); sp.connect(merger, 1, 3);
  const info = { voicesMax: 0, notes: 0, phrases: [] };
  api.paint.onNote(() => info.notes++);
  api.paint.onPhrase((p) => info.phrases.push(p));
  if (setup) setup(api, info);
  api.pump();
  const dt = 0.05;
  for (let t = dt; t < seconds - 0.01; t += dt) {
    const tt = Math.round(t * 1000) / 1000;
    ctx.suspend(tt).then(() => {
      try { if (step) step(api, tt, info); api.pump(); info.voicesMax = Math.max(info.voicesMax, api.engine.activeVoices()); }
      catch (e) { info.error = String(e); }
      ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  const m = measure(name, buf, seconds, info, api);
  if (opts.spectrum) Object.assign(m, analyse(buf, opts.skip ?? 1));
  return m;
}

// ---------------------------------------------------------------- "would it frighten a small child?" numbers
function fft(re, im) { // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
/** Spectrum and envelope numbers: share of energy under 120 Hz, centroid, slow swells, and tonal clashes
 *  (strong spectral peaks a semitone or a tritone apart, octaves folded). */
export function analyse(buf, skip = 1) {
  const L = buf.getChannelData(0), R = buf.getChannelData(1), N = 16384, start = Math.floor(SR * skip);
  const pow = new Float64Array(N / 2); let frames = 0;
  for (let o = start; o + N <= L.length; o += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = ((L[o + i] + R[o + i]) / 2) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    fft(re, im); for (let k = 0; k < N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k]; frames++;
  }
  const hz = SR / N; let tot = 0, low = 0, cen = 0, high = 0, body = 0;
  for (let k = 1; k < N / 2; k++) { tot += pow[k]; cen += pow[k] * k * hz; if (k * hz < 120) low += pow[k]; if (k * hz > 3000) high += pow[k]; if (k * hz >= 80 && k * hz <= 400) body += pow[k]; }
  // tonal peaks: local maxima 12 dB above the median of their neighbourhood, 80 Hz .. 4 kHz, strongest 8
  const db = Array.from(pow, (p) => 10 * Math.log10(p + 1e-20)), peaks = [];
  for (let k = Math.ceil(80 / hz); k < 4000 / hz; k++) {
    if (db[k] < db[k - 1] || db[k] < db[k + 1]) continue;
    const nb = db.slice(k - 40, k + 40).sort((a, b) => a - b), med = nb[40];
    if (db[k] - med > 12) peaks.push({ f: k * hz, d: db[k] });
  }
  peaks.sort((a, b) => b.d - a.d);
  const kept = []; for (const p of peaks) if (!kept.some((q) => Math.abs(q.f - p.f) < 16 && q.d - p.d > 6)) kept.push(p); // drop weak vibrato sidebands next to a stronger tone
  const top = kept.slice(0, 8).filter((p) => p.d > kept[0]?.d - 20);
  const clashes = [];
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
    const c = Math.abs(1200 * Math.log2(top[i].f / top[j].f)) % 1200, cc = Math.min(c, 1200 - c);
    if (cc > 30 && (Math.abs(cc - 100) < 40 || Math.abs(cc - 600) < 30)) clashes.push(`${Math.round(top[i].f)}/${Math.round(top[j].f)} Hz`);
  }
  // envelope: 100 ms RMS in dB; slow part = 4 s moving average; its range shows slow swells
  const hop = Math.floor(SR * 0.1), env = [];
  for (let o = start; o + hop <= L.length; o += hop) { let e = 0; for (let i = o; i < o + hop; i++) e += L[i] * L[i] + R[i] * R[i]; env.push(e / (2 * hop)); }
  const slow = env.map((_, i) => { const a = env.slice(Math.max(0, i - 20), i + 20); return a.reduce((x, y) => x + y, 0) / a.length; }).slice(20, -20);
  const sdb = slow.map((v) => 10 * Math.log10(v + 1e-20));
  // onsets: the largest rise between successive 2.5 ms frames (dB), only where the sound is within 40 dB of its loudest
  const fr = Math.floor(SR * 0.0025), fe = [];
  for (let o = start; o + fr <= L.length; o += fr) { let e = 0; for (let i = o; i < o + fr; i++) e += L[i] * L[i] + R[i] * R[i]; fe.push(10 * Math.log10(e / (2 * fr) + 1e-20)); }
  const fmax = Math.max(...fe); let sharp = 0; for (let i = 1; i < fe.length; i++) if (fe[i] > fmax - 40) sharp = Math.max(sharp, fe[i] - Math.max(fe[i - 1], fmax - 60));
  return { lowShare: +(low / (tot || 1)).toFixed(3), highShare: +(high / (tot || 1)).toFixed(3), bodyShare: +(body / (tot || 1)).toFixed(3), onsetDb: r1(sharp), centroidHz: Math.round(cen / (tot || 1)), slowSwellDb: sdb.length ? r1(Math.max(...sdb) - Math.min(...sdb)) : 0,
    peaksHz: top.map((p) => Math.round(p.f)), clashes };
}

function perSecond(L, R) { const out = []; for (let o = 0; o + SR <= L.length; o += SR) { let e = 0; for (let i = o; i < o + SR; i++) e += (L[i] * L[i] + R[i] * R[i]) / 2; out.push(r1(10 * Math.log10(e / SR || 1e-12))); } return out; }
function measure(name, buf, seconds, info, api) {
  let peak = 0, peakPre = 0, sum = 0, nan = 0, dc = 0, maxWin = 0;
  const L = buf.getChannelData(0), R = buf.getChannelData(1), PL = buf.getChannelData(2), PR = buf.getChannelData(3);
  const win = Math.floor(SR * 0.4); let ws = 0;
  for (let i = 0; i < L.length; i++) {
    const l = L[i], r = R[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) { nan++; continue; }
    const a = Math.max(Math.abs(l), Math.abs(r)); if (a > peak) peak = a;
    const b = Math.max(Math.abs(PL[i]), Math.abs(PR[i])); if (b > peakPre) peakPre = b;
    const e = (l * l + r * r) / 2; sum += e; dc += (l + r) / 2; ws += e;
    if (i >= win) { const lo = L[i - win], ro = R[i - win]; if (Number.isFinite(lo) && Number.isFinite(ro)) ws -= (lo * lo + ro * ro) / 2; }
    if (i >= win && ws / win > maxWin) maxWin = ws / win;
  }
  const n = L.length;
  return {
    name, seconds, peakDb: r1(db(peak)), rmsDb: r1(10 * Math.log10(sum / n || 1e-12)), loudestDb: r1(10 * Math.log10(maxWin || 1e-12)),
    prePeakDb: r1(db(peakPre)), nan, dc: +(dc / n).toFixed(5), voicesMax: info.voicesMax, stolen: api.engine.stolen,
    notes: info.notes, phrases: info.phrases.length, error: info.error || null, ...(info.matchCheck ? { match: info.matchCheck } : {}),
    ...(info.gens ? { gens: info.gens } : {}), ...(info.perSecond ? { perSecondDb: perSecond(L, R) } : {}),
  };
}

// ---------------------------------------------------------------- scenarios
export const ENVS = {
  'spring dawn clear': { season: 'spring', time: 'dawn', weather: 'clear' },
  'summer day clear': { season: 'summer', time: 'day', weather: 'clear' },
  'summer night clear': { season: 'summer', time: 'night', weather: 'clear' },
  'autumn dusk rain': { season: 'autumn', time: 'dusk', weather: 'rain' },
  'autumn day wind': { season: 'autumn', time: 'day', weather: 'wind' },
  'winter day snow': { season: 'winter', time: 'day', weather: 'snow' },
  'spring day fog': { season: 'spring', time: 'day', weather: 'fog' },
  'summer night storm': { season: 'summer', time: 'night', weather: 'storm' },
};

/** A child painting: one finger sweeps the ground, a second joins in the sky, then the first holds still (bloom). */
export function childPaints(api, t, info) {
  const f1 = { x: 200 + 1300 * (0.5 + 0.5 * Math.sin(t * 0.9)), y: 700 + 80 * Math.sin(t * 2.3) };
  if (t === 0.3) api.paint.start(f1, VIEW, 1);
  else if (t > 0.3 && t < 5.5) api.paint.move(f1, 1);
  else if (t > 5.5 && t < 8.2) api.paint.move({ x: info.hx ?? (info.hx = f1.x), y: 700 }, 1);
  else if (t === 8.2) api.paint.end(1);
  const f2 = { x: 900 + 600 * Math.sin(t * 1.4), y: 150 };
  if (t === 2) api.paint.start(f2, VIEW, 2);
  else if (t > 2 && t < 4.5) api.paint.move(f2, 2);
  else if (t === 4.5) api.paint.end(2);
}

export const SUITES = {
  async instruments(log) {
    const out = [];
    for (const inst of INSTRUMENT_NAMES) {
      out.push(await render('instrument ' + inst, 6, (api) => {
        api.mix({ ambience: 0, bed: 0 });
        for (let s = 0; s <= 10; s++) api.note(s, { instrument: inst, vol: 0.34, delay: 0.05 + s * 0.3 });
        api.chord([5, 7, 9], { instrument: inst, vol: 0.34, delay: 3.6 });
      }));
      log && log(out[out.length - 1]);
    }
    return out;
  },
  async voices(log) {
    const out = [];
    for (const v of Object.keys(VOICE_INFO)) {
      out.push(await render('voice ' + v, 3.5, (api) => { api.mix({ ambience: 0, bed: 0 }); api.sfx[v]({ delay: 0.05 }); }));
      log && log(out[out.length - 1]);
    }
    return out;
  },
  async ambience(log, places = PRESET_NAMES.slice(0, 11), envs = Object.keys(ENVS)) {
    const out = [];
    for (const p of places) for (const e of envs) {
      out.push(await render(`soundscape ${p} / ${e}`, 10, (api) => { api.mix({ bed: 0 }); api.setPlace({ preset: p }, ENVS[e]); }, null, { seed: p.length * 31 + e.length }));
      log && log(out[out.length - 1]);
    }
    return out;
  },
  async bed(log, places = PRESET_NAMES.slice(0, 11), envs = ['summer day clear', 'summer night clear']) {
    const out = [];
    for (const p of places) for (const e of envs) {
      out.push(await render(`music bed ${p} / ${e}`, 16, (api) => { api.mix({ ambience: 0 }); api.setPlace({ preset: p }, ENVS[e]); }, null, { seed: p.length * 7 }));
      log && log(out[out.length - 1]);
    }
    return out;
  },
  async rooms(log, places = ['underground', 'riverbank', 'undersea', 'cave', 'burrow', 'hive', 'nest', 'hollow', 'grotto', 'house'], envs = ['summer day clear', 'summer night storm']) {
    const out = [];
    for (const p of places) for (const e of envs) {
      out.push(await render(`soundscape ${p} / ${e}`, 10, (api) => { api.mix({ bed: 0 }); api.setPlace({ preset: 'meadow' }, ENVS[e]); api.setPlace({ preset: p }, ENVS[e]); }, null, { seed: p.length * 31 + e.length }));
      log && log(out[out.length - 1]);
    }
    return out;
  },
  async fright(log) { // every bed alone, the old hive for comparison, and the voices most likely to sound scary
    const out = [], beds = (log && log.beds) || ['hive', 'hiveOld', 'bees', 'breeze', 'rain', 'rumble', 'hush', 'mist', 'crickets', 'stream', 'underwater', 'roomtone', 'surf', 'hearth'];
    for (const b of beds) {
      out.push(await render('bed ' + b, 12, (api) => { api.mix({ bed: 0 }); api.setPlace({ preset: 'meadow', ambience: {} }, ENVS['summer day clear']); api.debug.amb.solo(b, 0.3); }, null, { spectrum: true, skip: 2 }));
      log && log(out[out.length - 1]);
    }
    for (const v of (log && log.voices) || ['snore', 'creak', 'croak', 'hoot', 'thunder', 'whale', 'hum', 'buzz', 'purr', 'squelch', 'mist', 'swirl']) {
      out.push(await render('voice ' + v, 4, (api) => { api.mix({ ambience: 0, bed: 0 }); api.sfx[v]({ delay: 0.05 }); }, null, { spectrum: true, skip: 0 }));
      log && log(out[out.length - 1]);
    }
    return out;
  },
  async falls(log) { // the waterfall glade: sitar and tanpura alone, the alap bed, the soundscape, painting, and the slow fades
    const out = [], add = (r) => { out.push(r); log && log(r); };
    const day = ENVS['summer day clear'];
    add(await render('falls: sitar notes sa re ga pa dha sa (one slide)', 12, (api) => { api.mix({ ambience: 0, bed: 0 }); api.setPlace({ preset: 'falls' }, day);
      [0, 1, 2, 3, 4, 5].forEach((s, i) => api.note(s, { instrument: 'sitar', vol: 0.34, delay: 0.2 + i * 1.6 })); api.play({ freq: 185.0, from: 164.81, glide: 0.4, instrument: 'sitar', vol: 0.34, delay: 10 }); }, null, { spectrum: true, skip: 0 }));
    add(await render('falls: one tanpura string (sa)', 8, (api) => { api.mix({ ambience: 0, bed: 0 }); api.setPlace({ preset: 'falls' }, day); api.play({ midi: 50, instrument: 'tanpura', vol: 0.34, dur: 7, every: 99, delay: 0.1 }); }, null, { spectrum: true, skip: 0 }));
    for (const e of ['summer day clear', 'summer night clear', 'autumn dusk rain', 'winter day snow', 'summer night storm']) {
      add(await render(`falls: music bed / ${e}`, 40, (api) => { api.mix({ ambience: 0 }); api.setPlace({ preset: 'falls' }, ENVS[e]); }, (api, t, info) => { if (t === 39.5) info.gens = api.debug.amb.gens(); }, { spectrum: true, skip: 2, seed: 5 }));
      add(await render(`falls: soundscape / ${e}`, 12, (api) => { api.mix({ bed: 0 }); api.setPlace({ preset: 'falls' }, ENVS[e]); }, null, { spectrum: true, skip: 2, seed: 6 }));
    }
    add(await render('falls: painting / summer day clear', 10, (api) => { api.setPlace({ preset: 'falls' }, day); }, childPaints));
    // the way in and the way back: the wood fades out under a rising tanpura; the first sitar phrase comes later
    for (const [a, b] of [['wood', 'falls'], ['falls', 'wood']]) {
      add(await render(`fade: ${a} -> ${b}`, 34, (api, info) => { info.perSecond = true; api.mix({ ambience: 0 }); api.setPlace({ preset: a }, day); },
        (api, t, info) => { if (t === 6) api.setPlace({ preset: b }, day); if ([6.5, 9, 12, 16, 20, 26, 33].includes(t)) (info.gens ||= []).push({ t, beds: api.debug.amb.gens() }); }, { seed: 8 }));
    }
    return out;
  },
  async water(log) { // BRIEF points 21 and 22: every rain and water sound, and the grass stroke, alone and in their places
    const out = [], add = (r, extra = {}) => { Object.assign(r, extra); out.push(r); log && log(r); };
    // a place's own ambience merges with the one given, so silence every known weight first (only weather beds remain)
    const SILENT = Object.fromEntries([...new Set(Object.values(PRESETS).flatMap((p) => Object.keys(p.ambience || {})))].map((k) => [k, 0]));
    const day = ENVS['summer day clear'], quiet = (api) => { api.mix({ bed: 0 }); api.setPlace({ preset: 'meadow', ambience: SILENT }, day); };
    const one = { drop: {}, drip: {}, plop: {}, bubble: { count: 3 }, splash: {}, wave: { size: 0.5 }, grass: {}, rustle: {} };
    for (const [v, o] of Object.entries(one))
      add(await render('voice ' + v, 3.5, (api) => { quiet(api); api.sfx[v]({ ...o, delay: 0.1 }); }, null, { spectrum: true, skip: 0, manifest: null }));
    for (const v of ['grass', 'rustle']) // a finger stroking for 2 s: the meadow calls the voice every 0.22 s with count 2
      for (const [tag, mo] of [['synth', { manifest: null }], ['recorded take', { preload: [v] }]])
        add(await render(`stroke ${v}, ${tag} (every 0.22 s for 2 s)`, 4, (api) => { quiet(api); for (let t = 0.1; t < 2.1; t += 0.22) api.sfx[v]({ count: 2, vol: 0.25, delay: t }); }, null, { spectrum: true, skip: 0, ...mo }));
    const live = (wet, stormy = 0) => ({ season: 'summer', time: 'day', weather: stormy ? 'storm' : 'rain', wet, windy: 0, stormy, snowy: 0, foggy: 0 });
    const scapes = [
      ['rain light (wet 0.2)', 'meadow', { ambience: SILENT }, live(0.2)], ['rain steady (wet 0.55)', 'meadow', { ambience: SILENT }, live(0.55)],
      ['rain heavy (wet 1)', 'meadow', { ambience: SILENT }, live(1)], ['rain in a storm (wet 1, stormy 1; with wind and thunder)', 'meadow', { ambience: SILENT }, live(1, 1)],
      ['creek (riverbank stream)', 'riverbank', { ambience: { ...SILENT, stream: 1 } }, day], ['waterfall (falls)', 'falls', { ambience: { ...SILENT, waterfall: 1 } }, day],
      ['sea (beach waves)', 'beach', { ambience: { ...SILENT, waves: 1 } }, day], ['undersea', 'undersea', { ambience: { ...SILENT, underwater: 1, bubbles: 1 } }, day],
      ['cave drips', 'cave', { ambience: { ...SILENT, drips: 1 } }, day], ['pond (fish plops)', 'pond', { ambience: { ...SILENT, fish: 1 } }, day],
    ];
    for (const [name, preset, mus, env] of scapes) {
      let rates = null;
      const r = await render('water ' + name, 12, (api) => { api.mix({ bed: 0 }); api.setPlace({ preset, ...mus }, env, preset); rates = api.debug.amb.rates(); }, null, { spectrum: true, skip: 2, seed: 4, manifest: null });
      add(r, { eventsPerS: rates });
      if (name.startsWith('rain')) add(await render('water ' + name + ', recorded loops', 12, (api) => { api.mix({ bed: 0 }); api.setPlace({ preset, ...mus }, env, preset); }, null, { spectrum: true, skip: 2, seed: 4, preload: true }));
    }
    // under the music? the same place and weather: music bed alone against the soundscape alone (rms over 12 s)
    for (const [preset, env] of [['meadow', live(0.55)], ['riverbank', day], ['falls', day], ['pond', ENVS['autumn dusk rain']]]) {
      const m = await render(`music bed ${preset} / ${env.weather}`, 12, (api) => { api.mix({ ambience: 0 }); api.setPlace({ preset }, env, preset); }, null, { seed: 4, manifest: null });
      const a = await render(`soundscape ${preset} / ${env.weather}`, 12, (api) => { api.mix({ bed: 0 }); api.setPlace({ preset }, env, preset); }, null, { spectrum: true, skip: 2, seed: 4, preload: true });
      add(m); add(a, { underMusicDb: r1(a.rmsDb - m.rmsDb) });
    }
    return out;
  },
  async painting(log, places = PRESET_NAMES.slice(0, 11), envs = ['summer day clear', 'summer night clear', 'winter day snow', 'summer night storm']) {
    const out = [];
    for (const p of places) for (const e of envs) {
      out.push(await render(`painting ${p} / ${e}`, 10, (api) => { api.setPlace({ preset: p }, ENVS[e]); }, childPaints));
      log && log(out[out.length - 1]);
    }
    return out;
  },
  async stress(log) {
    const out = [];
    // four fingers at once in a storm, every voice fired, then a burst of 80 notes
    out.push(await render('stress: 4 fingers + storm + all voices + 80 notes', 12, (api) => {
      api.setPlace({ preset: 'beach' }, ENVS['summer night storm']);
    }, (api, t) => {
      for (let k = 0; k < 4; k++) {
        const p = { x: 200 + 1400 * (0.5 + 0.5 * Math.sin(t * (0.7 + k * 0.3) + k)), y: 120 + k * 240 };
        if (t === 0.2 + k * 0.1) api.paint.start(p, VIEW, k); else if (t > 0.2 && t < 9) api.paint.move(p, k); else if (t === 9) api.paint.end(k);
      }
      if (t === 1) for (const v of Object.keys(VOICE_INFO)) api.sfx[v]({ vol: 1.5 });
      if (t === 5) for (let i = 0; i < 80; i++) api.note(i % 15, { instrument: 'bell', vol: 1.2 });
    }));
    log && log(out[out.length - 1]);
    // phrase listening: paint an ascending line, check onPhrase and matches()
    const r = await render('listening: rising phrase', 6, (api, info) => {
      api.setPlace({ preset: 'meadow' }, ENVS['summer day clear']);
      info.matchCheck = [];
      api.paint.onPhrase((ph) => {
        info.matchCheck.push({ steps: ph.steps.join(','), rising: matches(ph, 'uuu'), triad: matches(ph, [0, 1, 2]), wrong: matches(ph, [4, 2, 0]) });
      });
    }, (api, t) => {
      const x = 80 + (t - 0.3) * 600;
      if (t === 0.3) api.paint.start({ x: 80, y: 700 }, VIEW); else if (t > 0.3 && t < 2.8) api.paint.move({ x, y: 700 }); else if (t === 2.8) api.paint.end();
    });
    log && log(r);
    out.push(r);
    return out;
  },
};

export async function runAll(log, which = Object.keys(SUITES)) {
  const res = {};
  for (const k of which) res[k] = await SUITES[k](log);
  return res;
}
