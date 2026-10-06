// Musical identities: a preset for each of the eleven places and for common instance kinds, how a place's
// `music` object is resolved, and how the environment (season x time x weather) shapes the music.

import { keyToMidi, scaleOf, SCALES } from './theory.js';

// Zones use fy0/fy1 (fractions of the visible height, 0 = top) until a place worker gives world y (y0/y1).
const SKY = (o = {}) => ({ name: 'sky', fy1: 0.3, instrument: 'bell', octave: 1, ...o });

// Chords are lists of scale steps. Every note of these scales is consonant with every other, so any chord is safe.
const PROG = {
  home: [[0, 2, 3], [-1, 0, 2], [1, 3, 4], [0, 2, 4]],      // I - vi - sus - I6 (in a major pentatonic)
  still: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [-1, 1, 3]],
  float: [[0, 2, 4], [2, 4, 6], [1, 3, 5], [0, 2, 4]],
  wander: [[0, 2, 3], [3, 5, 7], [1, 3, 4], [-1, 0, 2]],
};

export const DEFAULT_MUSIC = {
  key: 'C', scale: 'majorPentatonic', instrument: 'musicbox', zones: [SKY()], span: 10, arp: [0, 2, 4, 2], tempo: 75,
  harmony: 'none', bloom: 'pad', mood: 'calm', room: 'garden', echo: { time: 0.31, feedback: 0.3 }, tone: 6500,
  bed: { instrument: null, pad: 'pad', density: 0.3, vol: 0.7, progression: PROG.home, bass: null, barsPerChord: 2 },
  motif: null, ambience: { wind: 0.12, birds: 0.4, crickets: 0.5 }, shelter: 0, underwater: false, env: {},
};

export const PRESETS = {
  // ---------------------------------------------------------------- the ten places and the secret one
  meadow: { // the original: music box on the ground, bells in the sky, C major pentatonic
    key: 'C', scale: 'majorPentatonic', instrument: 'musicbox', zones: [SKY({ fy1: 0.32 })], tempo: 75, mood: 'bright',
    bed: { instrument: 'musicbox', pad: 'pad', density: 0.3, progression: PROG.home },
    motif: [[3, 1], [5, 1], [7, 1], [8, 3]], // the opening chord of the original game, as a tune
    ambience: { wind: 0.12, birds: 1, bees: 1, insects: 0.6, crickets: 1, owls: 0.25, leaves: 0.4, chimes: 0.15 },
    env: { winter: { bed: { instrument: 'celesta' } } },
  },
  antnest: { // busy and playful: marimba tunnels, bells above ground
    key: 'F', scale: 'majorPentatonic', instrument: 'marimba', tempo: 84, mood: 'playful', arp: [0, 2, 1, 3],
    zones: [SKY({ fy1: 0.28 }), { name: 'deep', fy0: 0.68, instrument: 'marimba', octave: -1 }],
    bed: { instrument: 'kalimba', pad: 'pad', density: 0.4, progression: PROG.wander, bass: 'marimba' },
    motif: [[5, 0.5], [6, 0.5], [7, 0.5], [9, 0.5], [7, 2]],
    room: 'burrow', shelter: 0.35, ambience: { wind: 0.06, ants: 1, dig: 0.3, insects: 0.5, birds: 0.4, crickets: 0.8 },
  },
  underground: { // cosy and earthy: low marimba and kalimba, a warm folk scale
    key: 'G3', scale: 'ritusen', instrument: 'marimba', tempo: 66, mood: 'deep', harmony: 'sixths',
    zones: [SKY({ fy1: 0.22, instrument: 'kalimba' }), { name: 'soil', fy1: 0.6, instrument: 'kalimba', octave: 1 }, { name: 'deep', instrument: 'marimba', octave: 0 }],
    bed: { instrument: 'marimba', pad: 'pad', density: 0.22, progression: PROG.still, bass: 'pluck' },
    motif: [[5, 1], [7, 1], [6, 1], [5, 2]],
    room: 'burrow', shelter: 0.65, tone: 5200, ambience: { roomtone: 0.6, dig: 0.5, drips: 0.25, crickets: 0.35 },
  },
  wood: { // the original flute among the trees; a cuckoo motif; bowed drone underneath
    key: 'D', scale: 'minorPentatonic', instrument: 'flute', tempo: 70, mood: 'mysterious', harmony: 'sixths', bloom: 'drone',
    zones: [SKY({ fy1: 0.17 }), { name: 'canopy', fy1: 0.4, instrument: 'flute', octave: 1 }, { name: 'floor', instrument: 'flute', octave: 0 }],
    bed: { instrument: 'harp', pad: 'drone', density: 0.28, progression: PROG.wander },
    motif: [[8, 1], [6, 2], [8, 1], [6, 2]], // cuckoo
    room: 'wood', ambience: { wind: 0.12, birds: 1, woodpecker: 1, owls: 1, leaves: 1, crickets: 0.7 },
  },
  pond: { // water drops (the original), frogs and dragonflies
    key: 'Bb3', scale: 'majorPentatonic', instrument: 'water', tempo: 70, mood: 'calm', harmony: 'thirds',
    zones: [SKY({ fy1: 0.35 }), { name: 'deep', fy0: 0.75, instrument: 'water', octave: -1 }],
    bed: { instrument: 'kalimba', pad: 'pad', density: 0.3, progression: PROG.float },
    motif: [[5, 1], [9, 1], [7, 2]],
    ambience: { wind: 0.1, frogs: 1, insects: 0.8, birds: 0.6, ducks: 0.5, fish: 0.5, crickets: 0.8 },
  },
  riverbank: { // a folk guitar by running water
    key: 'G', scale: 'majorPentatonic', instrument: 'pluck', tempo: 80, mood: 'playful',
    zones: [SKY({ fy1: 0.3 }), { name: 'river', fy0: 0.55, fy1: 0.8, instrument: 'water', octave: 0 }],
    bed: { instrument: 'pluck', pad: 'pad', density: 0.35, progression: PROG.home, bass: 'pluck' },
    motif: [[0, 0.5], [2, 0.5], [4, 0.5], [5, 1.5]],
    ambience: { wind: 0.12, stream: 1, birds: 0.8, frogs: 0.5, insects: 0.5, fish: 0.4, crickets: 0.7 },
  },
  beach: { // kalimba on the sand, water in the waves, bells over the sea
    key: 'A3', scale: 'majorPentatonic', instrument: 'kalimba', tempo: 70, mood: 'bright', harmony: 'sixths',
    zones: [SKY({ fy1: 0.3 }), { name: 'sea', fy0: 0.3, fy1: 0.55, instrument: 'water', octave: 1 }],
    bed: { instrument: 'kalimba', pad: 'pad', density: 0.25, progression: PROG.float },
    motif: [[7, 1], [9, 1], [10, 2], [9, 1], [7, 3]],
    room: 'open', ambience: { wind: 0.35, waves: 1, gulls: 1, crickets: 0.3 },
  },
  undersea: { // slow and floating: water low, glass high, a choir bloom
    key: 'E3', scale: 'suspended', instrument: 'water', tempo: 56, mood: 'dreamy', bloom: 'choir', harmony: 'octave',
    zones: [{ name: 'light', fy1: 0.4, instrument: 'glass', octave: 1 }, { name: 'deep', instrument: 'water', octave: 0 }],
    bed: { instrument: 'glass', pad: 'choir', density: 0.2, progression: PROG.float },
    motif: [[5, 2], [7, 2], [9, 4]],
    room: 'sea', shelter: 1, underwater: true, tone: 2600, echo: { time: 0.42, feedback: 0.35 },
    ambience: { underwater: 1, bubbles: 1, whale: 0.6 },
  },
  mountains: { // the original flute and bells, an open scale, and a valley echo
    key: 'D', scale: 'suspended', instrument: 'flute', tempo: 72, mood: 'bright', harmony: 'octave', bloom: 'drone',
    zones: [SKY({ fy1: 0.35 })],
    bed: { instrument: 'flute', pad: 'drone', density: 0.18, progression: PROG.still },
    motif: [[0, 1], [2, 1], [3, 2], [2, 1], [0, 3]], // an alphorn call
    room: 'hall', echo: { time: 0.48, feedback: 0.42 },
    ambience: { wind: 0.4, eagle: 0.6, marmots: 0.5, goatbells: 0.6, birds: 0.3, crickets: 0.25 },
  },
  town: { // celesta in the lanes, bells over the roofs, a clock-tower motif
    key: 'F', scale: 'majorPentatonic', instrument: 'celesta', tempo: 80, mood: 'playful', harmony: 'thirds',
    zones: [SKY({ fy1: 0.3 })],
    bed: { instrument: 'celesta', pad: 'pad', density: 0.3, progression: PROG.home, bass: 'pluck' },
    motif: [[7, 1], [6, 1], [5, 1], [3, 2], [3, 1], [5, 1], [6, 1], [7, 2]],
    ambience: { wind: 0.1, town: 1, pigeons: 1, chimes: 0.5, birds: 0.5, crickets: 0.5, owls: 0.4, cats: 0.4 },
  },
  ravensnook: { // the secret: a touch of magic (lydian), harp and bells, a choir bloom
    key: 'Bb3', scale: 'lydianPentatonic', instrument: 'harp', tempo: 64, mood: 'dreamy', bloom: 'choir', harmony: 'thirds',
    zones: [SKY({ fy1: 0.4 })],
    bed: { instrument: 'glass', pad: 'choir', density: 0.25, progression: [[0, 2, 4], [-1, 1, 4], [0, 2, 4], [4, 6, 7]] }, // no tritone in a chord
    motif: [[5, 1], [6, 1], [8, 1], [9, 1], [10, 3]],
    room: 'nook', ambience: { wind: 0.15, birds: 0.3, owls: 0.5, crickets: 0.4, chimes: 0.4 },
  },
  falls: { // the hidden waterfall glade, for the owner's aunt: tanpura drone and a sitar in free time, raga Bhupali
    // (sa re ga pa dha = D E F# A B on sa = D3, a calm evening raga). No beat, no chords: an alap. Slow fade in and out.
    key: 'D3', scale: 'majorPentatonic', instrument: 'sitar', tempo: 48, mood: 'calm', harmony: 'none', bloom: 'tanpura', fade: 10,
    zones: [{ name: 'sky', fy1: 0.3, instrument: 'sitar', octave: 1, vol: 0.8 }],
    bed: { style: 'alap', drone: 'tanpura', instrument: 'sitar', pad: null, vol: 0.7, unit: 0.75, rest: [12, 26], firstPhrase: 9, progression: [[0]] },
    motif: null, room: 'falls', echo: { time: 0.37, feedback: 0.16 }, tone: 5000, stormScale: false, // the raga stays in a storm
    ambience: { waterfall: 1, birds: 0.35, leaves: 0.4, wind: 0.06, crickets: 0.5, owls: 0.2 },
    env: { // night, rain and winter thin the sitar out; the tanpura carries on
      night: { bed: { rest: [22, 44] } }, rain: { bed: { rest: [24, 46] } }, storm: { bed: { rest: [40, 80] } },
      winter: { bed: { rest: [26, 50] } }, snow: { bed: { rest: [30, 60] } },
    },
  },
  // ---------------------------------------------------------------- instance kinds (keep the parent's key unless given)
  cave: { instrument: 'kalimba', room: 'cave', shelter: 1, tone: 4800, bloom: 'pad', mood: 'calm',
    bed: { instrument: 'kalimba', pad: 'pad', density: 0.18 }, ambience: { roomtone: 1, drips: 1 } },
  burrow: { instrument: 'marimba', room: 'burrow', shelter: 0.9, mood: 'deep',
    bed: { instrument: 'marimba', pad: 'pad', density: 0.2 }, ambience: { roomtone: 0.7, dig: 0.2, snores: 0.3 } },
  hive: { instrument: 'celesta', room: 'burrow', shelter: 0.9, harmony: 'thirds', mood: 'playful',
    bed: { instrument: 'celesta', pad: 'pad', density: 0.3 }, ambience: { hive: 1 } },
  nest: { instrument: 'marimba', room: 'burrow', shelter: 0.8, mood: 'playful',
    bed: { instrument: 'kalimba', pad: 'pad', density: 0.3 }, ambience: { roomtone: 0.5, ants: 0.8 } },
  hollow: { instrument: 'harp', room: 'wood', shelter: 0.8, mood: 'calm',
    bed: { instrument: 'harp', pad: 'pad', density: 0.2 }, ambience: { roomtone: 0.4, owls: 0.4, leaves: 0.3 } },
  grotto: { instrument: 'glass', room: 'cave', shelter: 1, underwater: true, tone: 3000, bloom: 'choir', mood: 'dreamy',
    bed: { instrument: 'glass', pad: 'choir', density: 0.15 }, ambience: { underwater: 0.7, drips: 0.5, bubbles: 0.6 } },
  house: { instrument: 'celesta', room: 'burrow', shelter: 1, mood: 'calm', harmony: 'thirds',
    bed: { instrument: 'celesta', pad: 'pad', density: 0.25 }, ambience: { hearth: 1, clock: 1 } },
};
export const PRESET_NAMES = Object.keys(PRESETS);
const INSTANCE_KINDS = new Set(['cave', 'burrow', 'hive', 'nest', 'hollow', 'grotto', 'house']);

const merge = (a, b) => {
  const o = { ...a };
  for (const k in b || {}) {
    const v = b[k];
    o[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof v !== 'function' && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) && k !== 'ambience' ? merge(a[k], v) : v;
  }
  return o;
};

// Places that give only a mood (no preset) get a matching character.
const MOODS = {
  bright: {}, calm: { harmony: 'thirds' }, playful: { instrument: 'marimba', tempo: 84, arp: [0, 2, 1, 3] },
  cosy: { instrument: 'kalimba', harmony: 'thirds', room: 'burrow' }, cozy: { instrument: 'kalimba', harmony: 'thirds', room: 'burrow' },
  deep: { instrument: 'marimba', room: 'burrow', tempo: 66, bed: { pad: 'drone' } },
  mysterious: { scale: 'minorPentatonic', instrument: 'flute', room: 'wood', bloom: 'drone' },
  dreamy: { instrument: 'glass', bloom: 'choir', room: 'nook', tempo: 60, bed: { pad: 'choir', instrument: 'glass' } },
};
const camel = (v) => (typeof v === 'string' ? v.replace(/[-_ ]+([a-z])/g, (_, c) => c.toUpperCase()) : v);

/** Accept loose hints from stubs and place workers: 'major-pentatonic', instruments: ['musicbox'], mood only. */
function tidy(m) {
  const o = { ...m };
  if (o.scale) o.scale = camel(o.scale);
  if (!o.instrument && Array.isArray(o.instruments) && o.instruments.length) o.instrument = o.instruments[0];
  if (o.instrument) o.instrument = camel(o.instrument);
  if (o.mood && !o.preset && MOODS[o.mood]) return merge(merge({}, MOODS[o.mood]), o);
  return o;
}

/** placeDef.music -> a complete music description. prev (the music being left) lends its key to instance presets. */
export function resolveMusic(music, prev) {
  const m = tidy(music || {});
  const preset = PRESETS[m.preset] || (m.id && PRESETS[m.id]) || null;
  let base = DEFAULT_MUSIC;
  if (prev && (!preset || INSTANCE_KINDS.has(m.preset)) && !m.key) base = merge(base, { key: prev.key, scale: prev.scale, tempo: prev.tempo, motif: prev.motif });
  let r = merge(base, preset || {});
  r = merge(r, m);
  if (preset && m.ambience) r.ambience = { ...preset.ambience, ...m.ambience };
  r.id = m.preset || m.id || (prev && prev.id) || 'place';
  return r;
}

/**
 * Shape the music by the environment. Returns the live profile the painter and the bed read:
 * {root, scale, instrument, zones, span, arp, beat, harmony, bloom, swap, vol, bright, groundShift, skyShift,
 *  rainDrops, shimmer, tone, reverb, bed, ...}
 */
const WINTER_SWAP = { box: 'celesta', musicbox: 'celesta', kalimba: 'glass', marimba: 'kalimba', pluck: 'harp', water: 'glass', bell: 'bell', flute: 'flute' };
export function shape(M, env = {}) {
  const season = env.season || 'summer', time = env.time || 'day', weather = env.weather || 'clear';
  const o = M.env || {};
  let m = M;
  for (const k of [season, time, weather]) if (o[k]) m = merge(m, o[k]);
  const P = {
    id: M.id, env: { season, time, weather }, root: keyToMidi(m.key), scale: scaleOf(m.scale), instrument: m.instrument,
    zones: m.zones, span: m.span, arp: m.arp, harmony: m.harmony, bloom: m.bloom, swap: { ...(m.swap || {}) },
    vol: 1, bright: 1, groundShift: 0, skyShift: 0, rainDrops: 0, shimmer: 0, beatMul: 1,
    tone: m.tone, reverb: 1, bed: { ...DEFAULT_MUSIC.bed, ...m.bed }, motif: m.motif, tempo: m.tempo,
    ambience: { ...(M.ambience || {}), ...[season, time, weather].reduce((acc, k) => ({ ...acc, ...((o[k] && o[k].ambience) || {}) }), {}) },
  };
  // time of day
  if (time === 'dawn') { P.bright = 0.95; P.vol = 0.9; if (P.harmony === 'none') P.harmony = 'thirds'; P.tone *= 0.95; }
  if (time === 'dusk') { P.bright = 0.75; P.vol = 0.85; P.beatMul = 1.1; if (P.harmony === 'none') P.harmony = 'sixths'; P.tone *= 0.85; P.reverb = 1.1; }
  if (time === 'night') { P.bright = 0.55; P.vol = 0.68; P.beatMul = 1.25; P.groundShift = -1; P.bloom = P.bloom || 'pad'; P.tone *= 0.68; P.reverb = 1.25; P.bed.density *= 0.6; }
  // seasons
  if (season === 'winter') { Object.assign(P.swap, WINTER_SWAP, m.swap || {}); P.shimmer = 0.35; P.reverb *= 1.2; P.skyShift = 0; P.bed.density *= 0.8; }
  if (season === 'autumn') { P.bright *= 0.88; if (P.harmony === 'none') P.harmony = 'sixths'; }
  if (season === 'spring') { P.bright = Math.min(1, P.bright * 1.05); P.bed.density *= 1.1; }
  // weather
  if (weather === 'rain') { P.rainDrops = 0.35; P.bright *= 0.85; P.tone *= 0.85; }
  if (weather === 'fog') { P.bright *= 0.65; P.vol *= 0.9; P.reverb *= 1.6; P.bloom = 'pad'; P.tone *= 0.6; } // a warm pad, not a ghostly choir, in fog
  if (weather === 'snow') { Object.assign(P.swap, WINTER_SWAP, m.swap || {}); P.shimmer = 0.45; P.bright *= 0.85; P.reverb *= 1.4; P.tone *= 0.72; }
  if (weather === 'wind') { P.beatMul *= 0.92; P.bed.density *= 1.1; }
  if (weather === 'storm') {
    if (M.stormScale !== false && (P.scale === SCALES.majorPentatonic || P.scale === SCALES.lydianPentatonic)) P.scale = SCALES.minorPentatonic;
    P.bright *= 0.55; P.vol *= 0.85; if (M.stormScale !== false) P.harmony = 'low'; P.beatMul *= 1.1; P.tone *= 0.55; P.reverb *= 1.15; P.bed.density *= 0.7;
  }
  P.beat = (m.beat ?? 15 / (m.tempo || 75)) * P.beatMul;
  P.quarter = (60 / (m.tempo || 75)) * P.beatMul;
  P.bed.instrument = P.swap[P.bed.instrument || m.instrument] || P.bed.instrument || m.instrument;
  P.tone = Math.max(900, Math.min(12000, P.tone));
  return P;
}
