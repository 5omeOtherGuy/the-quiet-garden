// Music theory helpers for The Quiet Garden: scales, keys, steps, chords and phrase matching.
// Every scale here has no two neighbouring notes a semitone apart, so any notes played together stay consonant.

export const SCALES = {
  majorPentatonic: [0, 2, 4, 7, 9],     // the original garden scale (C D E G A)
  minorPentatonic: [0, 3, 5, 7, 10],    // darker, used for storms and some night moods
  suspended: [0, 2, 5, 7, 10],          // open, alpine, "egyptian" pentatonic
  lydianPentatonic: [0, 2, 4, 6, 9],    // a touch of magic (raised fourth)
  ritusen: [0, 2, 5, 7, 9],             // warm folk pentatonic (the "yo" scale)
  manGong: [0, 3, 5, 8, 10],            // gentle, wistful minor pentatonic
  wholeTone: [0, 2, 4, 6, 8, 10],       // dream-like, for very special moments only
};

const NAMES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

/** 'C' -> 60, 'D4' -> 62, 'Bb3' -> 58, 62 -> 62. A bare name means octave 4. */
export function keyToMidi(key) {
  if (typeof key === 'number' && isFinite(key)) return key;
  const m = /^([A-G](?:#|b)?)(-?\d)?$/.exec(String(key || 'C').trim());
  if (!m) return 60;
  const oct = m[2] === undefined ? 4 : +m[2];
  return 12 * (oct + 1) + NAMES[m[1]];
}

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);

export function scaleOf(s) {
  if (Array.isArray(s) && s.length) return s;
  return SCALES[s] || SCALES.majorPentatonic;
}

/** Absolute scale step (0 = root of the key, 5 = root an octave up in a 5-note scale, -1 = one below root). */
export function stepToMidi(step, rootMidi, scale) {
  const n = scale.length, o = Math.floor(step / n), d = ((step % n) + n) % n;
  return rootMidi + 12 * o + scale[d];
}
export const stepToFreq = (step, rootMidi, scale) => midiToFreq(stepToMidi(step, rootMidi, scale));

/** Nearest scale step for a midi number (used to snap foreign notes into the key). */
export function midiToStep(midi, rootMidi, scale) {
  const n = scale.length; let best = 0, bd = 1e9;
  const approx = Math.round(((midi - rootMidi) / 12) * n);
  for (let s = approx - n; s <= approx + n; s++) {
    const d = Math.abs(stepToMidi(s, rootMidi, scale) - midi);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/** A soft chord on a scale step: stacked every other scale note (always consonant in these scales). */
export const chordSteps = (step, size = 3) => Array.from({ length: size }, (_, i) => step + 2 * i);

// ---------------------------------------------------------------- phrases (the listening hook)

/** Collapse repeats: [3,3,5,5,5,4] -> [3,5,4]. Accepts note objects ({step}) or numbers. */
export function melodySteps(notes) {
  const out = [];
  for (const n of notes) { const s = typeof n === 'number' ? n : n.step; if (out[out.length - 1] !== s) out.push(s); }
  return out;
}

/** Contour of a phrase: array of -1 (down), 1 (up) between distinct melody notes. */
export function contour(notes) {
  const m = melodySteps(notes), c = [];
  for (let i = 1; i < m.length; i++) c.push(Math.sign(m[i] - m[i - 1]));
  return c;
}

/**
 * Does a phrase contain a pattern? notes: a phrase from paint.onPhrase (its melody .steps are used), or an array
 * of notes ({step}) or of scale steps.
 * pattern: array of scale steps, e.g. [0, 2, 4] (do-mi-sol style in steps) or a string of 'u'/'d' for a contour ('uuu').
 * opts.transpose (default true): match the shape anywhere in the scale; false: exact steps (octave-free if opts.octaveFree).
 * opts.contiguous (default true): notes must follow each other; false: allows other notes in between.
 * Repeated notes are collapsed first, so holding still on a note never breaks a match.
 */
export function matches(notes, pattern, opts = {}) {
  if (notes && !Array.isArray(notes) && Array.isArray(notes.steps)) notes = notes.steps; // a whole phrase from onPhrase
  const m = melodySteps(notes);
  if (typeof pattern === 'string') {
    const want = [...pattern].map((ch) => (ch === 'u' ? 1 : ch === 'd' ? -1 : 0));
    const c = contour(m);
    return subseq(c, want, opts.contiguous !== false, (a, b) => a === b);
  }
  const p = melodySteps(pattern);
  if (p.length === 0) return true;
  if (m.length < p.length) return false;
  const transpose = opts.transpose !== false, n = opts.scaleLength || 5;
  if (!transpose) {
    const eq = opts.octaveFree ? (a, b) => (((a - b) % n) + n) % n === 0 : (a, b) => a === b;
    return subseq(m, p, opts.contiguous !== false, eq);
  }
  const di = (a) => a.slice(1).map((v, i) => v - a[i]);
  if (p.length === 1) return true;
  return subseq(di(m), di(p), opts.contiguous !== false, (a, b) => a === b);
}

function subseq(hay, needle, contiguous, eq) {
  if (!needle.length) return true;
  if (contiguous) {
    outer: for (let i = 0; i + needle.length <= hay.length; i++) {
      for (let j = 0; j < needle.length; j++) if (!eq(hay[i + j], needle[j])) continue outer;
      return true;
    }
    return false;
  }
  let j = 0;
  for (let i = 0; i < hay.length && j < needle.length; i++) if (eq(hay[i], needle[j])) j++;
  return j === needle.length;
}

// ---------------------------------------------------------------- deterministic randomness
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
