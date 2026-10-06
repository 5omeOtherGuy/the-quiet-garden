/**
 * The Quiet Garden: audio public API (Web Audio only, everything synthesised, works offline).
 * Full guide with examples: docs/AUDIO.md. Test page: web/audio-lab.html.
 *
 * import * as audio from '../audio/index.js';   (or: import audio from '../audio/index.js')
 *
 * LIFECYCLE (engine)
 *   audio.init()                       call inside the first user gesture; safe to call on every gesture (resumes).
 *   audio.setPlace(music, env, id?)    on travel or enter/leave. music = placeDef.music (shape below); id = place id,
 *                                      used as the preset when music has none. Crossfades soundscape and music.
 *   audio.setEnv(env)                  when a change starts (CONTRACT env). Reads env.season/time/weather (the target).
 *   audio.setView(view)                optional: the visible world rect, so sounds given {x} pan left/right.
 *   audio.setVolume(0..1), audio.setMuted(bool), audio.isMuted(), audio.mix({music, sfx, ambience, bed}) (0..1 each)
 *   audio.suspend(), audio.resume()    the module also suspends itself when the page is hidden.
 *
 * MUSIC PAINTING (engine reports the hold-then-drag gesture; world units)
 *   audio.paint.start(p, view, id?)    p = {x, y}; view = {x, y, w, h}; id = pointer id for multi-touch (default 0)
 *   audio.paint.move(p, id?)           audio.paint.end(id?)   (end() without id ends every finger)
 *   audio.paint.tap(p, view)           a quick tap on empty ground: one note (in the sky also a soft gust and chime)
 *   audio.paint.onNote(cb) -> unsub    cb({step, base, midi, freq, instrument, zone, still, finger, time, x, y})
 *   audio.paint.onPhrase(cb) -> unsub  cb({notes, steps, duration, start, key, place, env}) after the fingers lift
 *   audio.paint.recent(n)              last n painted notes; audio.paint.active -> bool
 *   audio.theory.matches(phrase.notes, [0, 2, 4])   shape match anywhere in the scale; 'uuu' = three rising steps
 *
 * PLAYING MUSIC FROM A PLACE (always in the current key)
 *   audio.note(step, {instrument, octave, vol, dur, delay, pan, x})   step = scale step (0 = key root)
 *   audio.chord([0, 2, 4], opts)      audio.phrase([0, 2, [4, 2], 2], {instrument, beat, vol, onDone})
 *   audio.play({freq | midi, instrument, vol, dur, delay, pan})      a raw note
 *   audio.motif(opts)                 the place's signature tune
 *
 * UI SOUNDS: audio.ui(name), name in begin (the original opening chord), open, close, page, travel, enter, leave,
 *   discover, select, sticker, edge.
 *
 * VOICES (creatures and objects): audio.sfx.<name>(opts) or audio.sfx.play(name, opts)
 *   opts: vol, pitch, size (0 tiny .. 1 big), pan or x, delay, count, speed. Names: audio.VOICES.
 *   Primitives for anything new: audio.tone({f0, f1, type, dur, vol, lp, vib, ...}), audio.noise({f0, f1, dur, ...})
 *
 * DATA: audio.INSTRUMENTS, audio.VOICES, audio.PRESETS, audio.SCALES, audio.state() (debug)
 *
 * PLACE MUSIC SHAPE (placeDef.music; every field optional; see docs/AUDIO.md)
 *   { preset: 'meadow'|'antnest'|'underground'|'wood'|'pond'|'riverbank'|'beach'|'undersea'|'mountains'|'town'|
 *             'ravensnook'|'falls'|'cave'|'burrow'|'hive'|'nest'|'hollow'|'grotto'|'house',
 *     key: 'C'|'Bb3'|60, scale: 'majorPentatonic'|'minorPentatonic'|'suspended'|'ritusen'|'manGong'|'lydianPentatonic'|[semitones],
 *     instrument, zones: [{y0, y1 | fy0, fy1, x0, x1, instrument, octave, vol, name}] or (p, view, env) => zone,
 *     span: 10, arp: [0, 2, 4, 2], tempo: 75, beat, harmony: 'none'|'thirds'|'sixths'|'octave'|'low', bloom: instrument|null,
 *     bed: {instrument, pad, density, vol, progression: [[steps]], bass, barsPerChord}, motif: [[step, beats]],
 *       or bed: {style: 'alap', drone: 'tanpura', instrument: 'sitar', rest: [min, max] s between phrases, unit, firstPhrase}
 *     fade: seconds   a slow crossfade into and out of this place (falls: 10); the old music keeps playing as it fades
 *     room: 'garden'|'open'|'wood'|'hall'|'cave'|'burrow'|'sea'|'nook'|'falls', echo: {time, feedback}, tone: Hz,
 *     ambience: {birds, bees, insects, crickets, owls, frogs, leaves, woodpecker, stream, waves, gulls, wind, underwater,
 *                bubbles, whale, roomtone, drips, dig, ants, hive, hearth, clock, snores, town, pigeons, cats, chimes, waterfall,
 *                eagle, marmots, goatbells, ducks, fish}  (weights 0..1),
 *     shelter: 0..1, underwater: bool, stormScale: bool, swap: {instrument: instrument},
 *     env: {night: {...}, winter: {...}, storm: {...}}  overrides merged when that time/season/weather is active }
 */

import { createCore, BUS_LEVEL } from './core.js';
import { playNote, INSTRUMENTS, INSTRUMENT_NAMES } from './instruments.js';
import { createVoices, VOICE_INFO } from './voices.js';
import { createPainter } from './painter.js';
import { createAmbience, FILE_LAYERS } from './ambience.js';
import { createSamples } from './samples.js';
import { resolveMusic, shape, PRESETS, PRESET_NAMES } from './places.js';
import * as T from './theory.js';

const DEFAULT_ENV = { season: 'summer', time: 'day', weather: 'clear' };

/** Build an audio API around a context. Used by the module singleton (live) and by tests (OfflineAudioContext). */
export function createAudio(ctx, opts = {}) {
  const E = createCore(ctx, opts);
  const st = { music: resolveMusic(null), env: { ...DEFAULT_ENV }, envLive: null, placeId: null, P: null, view: null, volume: opts.volume ?? 1, muted: false, mix: { music: 1, sfx: 1, ambience: 1, bed: 1 } };
  st.P = shape(st.music, st.env);
  const C = {
    profile: () => st.P,
    get view() { return st.view; }, set view(v) { st.view = v; },
    painting: () => painter.active,
    onDuck: (on) => amb.duck(on),
    panFor: (x) => { const v = st.view; if (!v || !(v.w > 0)) return 0; return Math.max(-0.9, Math.min(0.9, ((x - v.x) / v.w - 0.5) * 1.3)); },
    key: () => ({ root: st.P.root, scale: st.P.scale }),
    envLive: () => st.envLive,
    sky: (p) => { kit.S.gust({ amp: 0.4, vol: 0.6, x: p.x }); kit.S.chime({ count: 2, vol: 0.35, x: p.x }); },
  };
  const samples = opts.manifest === null ? null : createSamples(E, { manifest: opts.manifest });
  C.samples = samples;
  const kit = createVoices(E, C, samples);
  const painter = createPainter(E, C);
  const amb = createAmbience(E, C, kit);
  const M = E.master;

  function applyMaster(fade = 2) {
    const P = st.P, mu = st.music, t = E.now();
    E.param(M.tone.frequency, P.tone, t, fade / 3);
    E.param(M.music.rev.gain, 0.34 * P.reverb, t, fade / 3);
    E.param(M.sfx.rev.gain, 0.2 * P.reverb, t, fade / 3);
    E.param(M.amb.rev.gain, 0.1 * P.reverb, t, fade / 3);
    const echo = mu.echo || { time: 0.31, feedback: 0.3 };
    E.param(M.delay.delayTime, echo.time, t, 0.3);
    E.param(M.fb.gain, Math.min(0.6, echo.feedback), t, 0.3);
  }
  function applyMix() {
    const t = E.now(), m = st.mix;
    E.param(M.music.in.gain, BUS_LEVEL.music * m.music, t, 0.1); E.param(M.sfx.in.gain, BUS_LEVEL.sfx * m.sfx, t, 0.1); E.param(M.amb.in.gain, BUS_LEVEL.amb * m.ambience, t, 0.1);
    E.param(M.bedMix.gain, m.bed, t, 0.1);
    E.param(M.volume.gain, st.muted ? 0 : st.volume, t, 0.05);
  }
  const keyFreq = (step, o = {}) => T.stepToFreq(step + (o.octave ?? 0) * st.P.scale.length, st.P.root, st.P.scale);
  const at = (o) => E.now() + (o.delay || 0);
  const panOf = (o) => o.pan ?? (o.x !== undefined ? C.panFor(o.x) : 0);

  const api = {
    context: ctx, engine: E, samples, debug: { amb },
    setPlace(music, env, id) {
      const m = music && !music.preset && id && PRESETS[id] ? { preset: id, ...music } : (!music && id && PRESETS[id] ? { preset: id } : music);
      const prev = st.music;
      st.music = resolveMusic(m, st.music);
      if (env) { st.env = { season: env.season || st.env.season, time: env.time || st.env.time, weather: env.weather || st.env.weather }; st.envLive = env; }
      st.P = shape(st.music, st.env);
      st.placeId = id || st.music.id;
      if (samples) samples.setPlace(st.placeId, Object.keys(amb.levels()).flatMap((k) => (FILE_LAYERS[k] || []).map((l) => l[0])));
      painter._cancelAll();
      E.setRoom(st.music.room);
      const fade = Math.max(3, +st.music.fade || 0, +(prev && prev.fade) || 0); // a place's `fade` slows the crossfade both ways
      applyMaster(fade); amb.retarget(st.music, st.P, st.env, fade);
      return st.music;
    },
    setEnv(env) {
      if (!env) return;
      st.envLive = env; // the engine's live object: continuous weather is read from it a few times a second
      const next = { season: env.season || st.env.season, time: env.time || st.env.time, weather: env.weather || st.env.weather };
      if (next.season === st.env.season && next.time === st.env.time && next.weather === st.env.weather && st.P) return;
      st.env = next; st.P = shape(st.music, st.env);
      applyMaster(4); amb.retarget(st.music, st.P, st.env, 4);
    },
    setView(view) { if (view) st.view = view; },
    setVolume(v) { st.volume = Math.max(0, Math.min(1, +v || 0)); applyMix(); },
    setMuted(b) { st.muted = !!b; applyMix(); },
    isMuted: () => st.muted,
    mix(m = {}) { Object.assign(st.mix, m); applyMix(); },
    paint: painter,
    note(step, o = {}) {
      return playNote(E, { freq: keyFreq(step, o), instrument: o.instrument || st.P.swap[st.P.instrument] || st.P.instrument, vol: o.vol ?? 0.3, dur: o.dur, time: at(o), pan: panOf(o), bright: st.P.bright, bus: o.bus || 'music' });
    },
    chord(steps, o = {}) { return steps.map((s, i) => api.note(s, { ...o, vol: (o.vol ?? 0.3) * 0.7, delay: (o.delay || 0) + i * (o.strum ?? 0.03) })); },
    phrase(notes, o = {}) {
      const beat = o.beat ?? st.P.beat * 2; let t = 0;
      for (const n of notes) {
        const step = Array.isArray(n) ? n[0] : typeof n === 'number' ? n : n.step, beats = Array.isArray(n) ? n[1] : 1;
        api.note(step + (o.transpose || 0), { ...o, delay: (o.delay || 0) + t });
        t += beats * beat;
      }
      if (o.onDone) { if (E.offline) o.onDone(); else setTimeout(o.onDone, ((o.delay || 0) + t) * 1000); }
      return t;
    },
    motif(o = {}) { return st.P.motif ? api.phrase(st.P.motif, { beat: st.P.quarter, instrument: st.P.bed.instrument, vol: 0.24, ...o }) : 0; },
    play(o = {}) {
      const freq = o.freq ?? (o.midi !== undefined ? T.midiToFreq(o.midi) : keyFreq(o.step ?? 0, o));
      return playNote(E, { ...o, freq, time: at(o), pan: panOf(o), instrument: o.instrument || 'musicbox', bus: o.bus || 'music' });
    },
    ui(name) { // gentle interface sounds for the engine
      const S = kit.S;
      switch (name) {
        case 'begin': [392, 523.25, 659.25, 783.99].forEach((f, i) => playNote(E, { freq: f, instrument: 'box', vol: 0.32, dur: 2, time: E.now() + i * 0.16, bus: 'sfx' })); break; // the original opening chord
        case 'open': S.flutter({ vol: 0.5, size: 0.3 }); api.note(7, { instrument: 'kalimba', vol: 0.12, bus: 'sfx' }); break;
        case 'close': S.flutter({ vol: 0.4, size: 0.4 }); api.note(5, { instrument: 'kalimba', vol: 0.1, bus: 'sfx' }); break;
        case 'page': S.rustle({ count: 3, vol: 0.5 }); break;
        case 'travel': S.travel(); break;
        case 'enter': S.enter(); break;
        case 'leave': S.leave(); break;
        case 'discover': S.discover(); break;
        case 'select': api.note(8 + Math.floor(E.rand(0, 3)), { instrument: 'celesta', vol: 0.14, bus: 'sfx' }); break;
        case 'sticker': S.twinkle({ vol: 0.7 }); break;
        case 'edge': S.boing({ vol: 0.4, size: 0.6 }); break;
        default: S.tap({ vol: 0.6 });
      }
    },
    sfx: Object.assign(Object.create(null), kit.S, { play(name, o) { const f = kit.S[name]; if (f) f(o || {}); else console.warn('audio: no voice', name); } }),
    tone: (o) => kit.tone(o), noise: (o) => kit.noise(o),
    pump: () => E.pump(),
    suspend() { painter._cancelAll(); E.stopClock(); try { if (ctx.state === 'running' && ctx.suspend) return ctx.suspend(); } catch (_) {} },
    resume() { E.horizon = 0; E.startClock(); try { if (ctx.state !== 'running' && ctx.resume) return ctx.resume(); } catch (_) {} },
    state() {
      return { ctx: ctx.state, time: +E.now().toFixed(2), place: st.music.id, env: { ...st.env }, key: st.music.key, scale: st.P.scale, voices: E.activeVoices(), stolen: E.stolen,
        beds: amb.levels(), events: amb.rates(), room: E.room, painting: painter.active, muted: st.muted,
        zones: Array.isArray(st.P.zones) ? [{ name: 'ground', instrument: st.P.instrument, octave: 0 }, ...st.P.zones].map((z) => ({ ...z })) : null };
    },
  };
  applyMaster(0.1); amb.retarget(st.music, st.P, st.env, 0.5); applyMix();
  E.startClock();
  return api;
}

// ---------------------------------------------------------------- the module singleton (what the game uses)
let A = null, listening = false;
const pending = { place: null, env: null, view: null, volume: 1, muted: false };
const queue = (fn) => (...args) => (A ? fn(A, ...args) : undefined);

export function init(opts = {}) {
  try { if (typeof navigator !== 'undefined' && navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) {}
  if (A) { if (!pending.muted && A.context.state !== 'running') A.resume(); return true; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    const ctx = new AC({ latencyHint: 'interactive' });
    A = createAudio(ctx, opts);
    if (pending.env) A.setEnv(pending.env);
    if (pending.place) A.setPlace(...pending.place);
    if (pending.view) A.setView(pending.view);
    A.setVolume(pending.volume); A.setMuted(pending.muted);
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (!listening && typeof document !== 'undefined') {
      listening = true;
      const hide = () => { if (A) A.suspend(); };
      document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); else if (A && !pending.muted) A.resume(); });
      window.addEventListener('pagehide', hide);
    }
    return true;
  } catch (e) { console.warn('audio init failed', e); A = null; return false; }
}
export const ready = () => !!A && A.context.state === 'running';
export function setPlace(music, env, id) { pending.place = [music, env, id]; return A ? A.setPlace(music, env, id) : undefined; }
export function setEnv(env) { pending.env = env; if (A) A.setEnv(env); }
export function setView(view) { pending.view = view; if (A) A.setView(view); }
export function setVolume(v) { pending.volume = v; if (A) A.setVolume(v); }
export function setMuted(b) { pending.muted = !!b; if (A) { A.setMuted(b); if (b) setTimeout(() => pending.muted && A.suspend(), 300); else A.resume(); } }
export const isMuted = () => pending.muted;
export const mix = queue((a, m) => a.mix(m));
export const suspend = queue((a) => a.suspend());
export const resume = queue((a) => a.resume());
export const note = queue((a, s, o) => a.note(s, o));
export const chord = queue((a, s, o) => a.chord(s, o));
export const phrase = queue((a, n, o) => a.phrase(n, o));
export const motif = queue((a, o) => a.motif(o));
export const play = queue((a, o) => a.play(o));
export const ui = queue((a, name) => a.ui(name));
export const tone = queue((a, o) => a.tone(o));
export const noise = queue((a, o) => a.noise(o));
export const state = () => (A ? A.state() : { ctx: 'none' });

// painting: listeners can subscribe before init; they are attached when the context exists
const noteCbs = new Set(), phraseCbs = new Set();
let wired = false;
function wire() { if (wired || !A) return; wired = true; A.paint.onNote((n) => noteCbs.forEach((cb) => cb(n))); A.paint.onPhrase((p) => phraseCbs.forEach((cb) => cb(p))); }
export const paint = {
  start(p, view, id) { if (!A) return null; wire(); if (view) A.setView(view); return A.paint.start(p, view, id); },
  move(p, id) { if (A) A.paint.move(p, id); },
  end(id) { if (A) A.paint.end(id); },
  tap(p, view) { if (!A) return null; wire(); if (view) A.setView(view); return A.paint.tap(p, view); },
  onNote(cb) { noteCbs.add(cb); wire(); return () => noteCbs.delete(cb); },
  onPhrase(cb) { phraseCbs.add(cb); wire(); return () => phraseCbs.delete(cb); },
  recent: (n) => (A ? A.paint.recent(n) : []),
  get active() { return !!A && A.paint.active; },
};

// voices: callable before init (silently ignored), so places never need to check
export const VOICES = VOICE_INFO;
export const sfx = Object.create(null);
for (const name of Object.keys(VOICE_INFO)) sfx[name] = (o) => { if (A) A.sfx[name](o || {}); };
sfx.play = (name, o) => { if (A) A.sfx.play(name, o); };

export const INSTRUMENTS_INFO = INSTRUMENTS;
export { INSTRUMENT_NAMES as INSTRUMENTS, PRESETS, PRESET_NAMES };
export const SCALES = T.SCALES;
export const theory = { matches: T.matches, contour: T.contour, melodySteps: T.melodySteps, stepToFreq: T.stepToFreq, stepToMidi: T.stepToMidi, keyToMidi: T.keyToMidi, midiToFreq: T.midiToFreq, SCALES: T.SCALES };

const audio = { init, ready, setPlace, setEnv, setView, setVolume, setMuted, isMuted, mix, suspend, resume, paint, note, chord, phrase, motif, play, ui, sfx, tone, noise, state, theory,
  VOICES, INSTRUMENTS: INSTRUMENT_NAMES, INSTRUMENTS_INFO, PRESETS, PRESET_NAMES, SCALES, createAudio };
export default audio;
