// Music painting: hold a finger down and drag. Left to right walks up the place's scale (the screen is the keyboard,
// as in the original: ten steps across the view). Holding still plays a gentle arpeggio around the note; moving plays
// the note under the finger on every beat. Height picks the instrument zone (sky bells, ground music box, water drops).
// Several fingers paint together on one shared beat grid. Every note is in key, so nothing can sound wrong.
// Holding very still for a while blooms a soft sustained note under the arpeggio.

import { playNote } from './instruments.js';
import { stepToFreq, stepToMidi, melodySteps } from './theory.js';

const STILL = 8;          // world units moved within a beat that still count as "holding still"
const PHRASE_GAP = 0.9;   // seconds after the last finger lifts before a phrase is reported
const MAX_PHRASE = 64;    // notes kept per phrase
const RECENT = 24;        // notes kept in the recent buffer

export function createPainter(E, C) {
  // C (controller) gives: C.profile() -> current shaped music profile, C.view, C.onDuck(on)
  const fingers = new Map();
  const noteCbs = new Set(), phraseCbs = new Set();
  const recent = [];
  let phrase = null, closeAt = 0, grid0 = 0;

  function zoneAt(P, p, view) {
    const zs = P.zones;
    if (typeof zs === 'function') { try { const z = zs(p, view, P.env); if (z) return z; } catch (_) {} }
    else if (Array.isArray(zs)) {
      for (const z of zs) {
        const y0 = z.y0 ?? (z.fy0 !== undefined ? view.y + z.fy0 * view.h : -Infinity);
        const y1 = z.y1 ?? (z.fy1 !== undefined ? view.y + z.fy1 * view.h : Infinity);
        const x0 = z.x0 ?? -Infinity, x1 = z.x1 ?? Infinity;
        if (p.y >= y0 && p.y < y1 && p.x >= x0 && p.x < x1) return z;
      }
    }
    return { instrument: P.instrument, octave: 0 };
  }

  function noteFor(P, f, still) {
    const view = f.view, z = zoneAt(P, f, view);
    const frac = Math.max(0, Math.min(0.999, (f.x - view.x) / (view.w || 1)));
    const base = Math.floor(frac * P.span);
    const arp = P.arp;
    const off = still ? arp[f.arp % arp.length] : 0;
    let local = Math.min(P.span, base + off);
    const sky = (z.octave ?? 0) > 0;
    const oct = (z.octave ?? 0) + (sky ? P.skyShift : P.groundShift);
    const step = local + oct * P.scale.length;
    let freq = stepToFreq(step, P.root, P.scale);
    while (freq < 110) freq *= 2; // never mumble below the speakers
    const inst = P.swap[z.instrument] || z.instrument || P.instrument;
    const vol = (still ? 0.26 : 0.34) * (z.vol ?? 1) * P.vol * (inst === 'bell' ? 0.7 : 1);
    return { step, base: base + oct * P.scale.length, freq, instrument: inst, vol, pan: (frac - 0.5) * 0.7, zone: z.name || (sky ? 'sky' : 'ground'), still };
  }

  function playFor(f, t, still) {
    const P = C.profile(), n = noteFor(P, f, still);
    playNote(E, { freq: n.freq, instrument: n.instrument, vol: n.vol, time: t, pan: n.pan, bright: P.bright, prio: 1 });
    // harmony: a soft voice that moves with the melody (only on moving beats, so arpeggios stay clean)
    if (!still && P.harmony !== 'none' && fingers.size === 1) {
      const h = P.harmony === 'thirds' ? -2 : P.harmony === 'sixths' ? -3 : P.harmony === 'octave' ? P.scale.length : P.harmony === 'low' ? -P.scale.length : 0;
      if (h) {
        let hf = stepToFreq(n.step + h, P.root, P.scale); while (hf < 110) hf *= 2;
        playNote(E, { freq: hf, instrument: n.instrument, vol: n.vol * (P.harmony === 'octave' ? 0.22 : 0.38), time: t + 0.012, pan: -n.pan * 0.5, bright: P.bright * 0.9, prio: 0 });
      }
    }
    // weather colour: rain answers with a tiny water drop, snow with a glassy shimmer
    if (P.rainDrops && E.rng() < P.rainDrops) playNote(E, { freq: stepToFreq(n.step + 2, P.root, P.scale), instrument: 'water', vol: n.vol * 0.2, time: t + 0.12 + E.rand(0, 0.1), pan: n.pan + E.rand(-0.3, 0.3), prio: 0, wet: 0.5 }); // a soft drop answers, not above the tune
    if (P.shimmer && !still && E.rng() < P.shimmer) playNote(E, { freq: n.freq * 2, instrument: 'glass', vol: n.vol * 0.18, time: t + 0.03, pan: -n.pan, prio: 0 });
    // listening
    const note = { step: n.step, base: n.base, midi: stepToMidi(n.step, P.root, P.scale), freq: n.freq, instrument: n.instrument, zone: n.zone, still, finger: f.id, time: t, x: f.x, y: f.y };
    record(note);
    return note;
  }

  function record(note) {
    recent.push(note); if (recent.length > RECENT) recent.shift();
    if (!phrase) phrase = { start: note.time, notes: [] };
    if (phrase.notes.length < MAX_PHRASE) phrase.notes.push({ ...note, t: note.time - phrase.start });
    for (const cb of noteCbs) { try { cb(note); } catch (e) { console.warn('onNote', e); } }
  }

  function closePhrase() {
    if (!phrase || !phrase.notes.length) { phrase = null; return; }
    const P = C.profile(), ph = phrase; phrase = null;
    const out = {
      notes: ph.notes, steps: melodySteps(ph.notes.filter((n) => !n.still || n === ph.notes[0]).map((n) => n.base)),
      duration: ph.notes[ph.notes.length - 1].t, start: ph.start, key: { root: P.root, scale: P.scale.slice() }, place: P.id, env: P.env,
    };
    for (const cb of phraseCbs) { try { cb(out); } catch (e) { console.warn('onPhrase', e); } }
  }

  // the beat task: runs from the core scheduler
  E.tasks.add((t0, t1) => {
    const P = C.profile(), beat = P.beat;
    for (const f of fingers.values()) {
      if (f.next < E.now() - beat) f.next = E.now(); // after a pause or a suspended context: no burst of old beats
      while (f.next < t1) {
        const t = Math.max(f.next, E.now());
        const still = f.since < STILL; f.since = 0;
        f.arp = still ? f.arp + 1 : 0;
        if (still) { if (!f.stillAt) f.stillAt = t; } else { f.stillAt = 0; if (f.bloom) { f.bloom.release(t); f.bloom = null; } }
        playFor(f, t, still);
        if (still && f.stillAt && t - f.stillAt > 1.6 && !f.bloom && P.bloom) {
          const n = noteFor(P, { ...f, arp: 0 }, false);
          let bf = stepToFreq(n.base - P.scale.length, P.root, P.scale); while (bf < 130) bf *= 2;
          f.bloom = playNote(E, { freq: bf, instrument: P.bloom, vol: 0.16 * P.vol, dur: 30, time: t, attack: 1.2, bright: P.bright * 0.8, prio: 2 });
        }
        f.next += beat;
      }
    }
    if (!fingers.size && phrase && E.now() >= closeAt) closePhrase();
  });

  const view0 = { x: 0, y: 0, w: 1778, h: 1000 };
  return {
    /** Finger down. p = {x, y} world units, view = visible world rect, id = pointer id (default 0). Returns the note. */
    start(p, view, id = 0) {
      if (!p) return null;
      const old = fingers.get(id); if (old && old.bloom) old.bloom.release();
      const now = E.now(), P = C.profile();
      if (view) C.view = view;
      if (!fingers.size) grid0 = now; // a lone finger sets the beat; others join its grid
      const k = Math.ceil((now + P.beat * 0.6 - grid0) / P.beat);
      const f = { id, x: p.x, y: p.y, view: view || C.view || view0, since: 0, arp: 0, next: grid0 + k * P.beat, stillAt: 0, bloom: null };
      fingers.set(id, f); C.onDuck(true);
      return playFor(f, now + 0.005, false);
    },
    /** A quick tap on empty ground: one note (it joins the phrase, so tapped tunes count too). In the sky it also
     *  stirs a soft gust and a chime, as a quick tap did in the original. */
    tap(p, view) {
      if (!p) return null;
      if (view) C.view = view;
      const f = { id: 'tap', x: p.x, y: p.y, view: view || C.view || view0, arp: 0 };
      const note = playFor(f, E.now() + 0.005, false);
      if (note && note.zone === 'sky' && C.sky) C.sky(p);
      if (!fingers.size) closeAt = E.now() + PHRASE_GAP + 0.6;
      return note;
    },
    /** Finger moves (world units). */
    move(p, id = 0) {
      const f = fingers.get(id) ?? (id === 0 && fingers.size === 1 ? fingers.values().next().value : null);
      if (!f || !p) return;
      f.since += Math.hypot(p.x - f.x, p.y - f.y); f.x = p.x; f.y = p.y;
      if (!E.offline) E.pump();
    },
    /** Finger up. Without an id every finger ends (the engine's single-gesture form). */
    end(id) {
      const ids = id === undefined ? [...fingers.keys()] : [id];
      for (const k of ids) { const f = fingers.get(k); if (!f) continue; if (f.bloom) f.bloom.release(); fingers.delete(k); }
      if (!fingers.size) { closeAt = E.now() + PHRASE_GAP; C.onDuck(false); }
    },
    /** Is anyone painting right now? */
    get active() { return fingers.size > 0; },
    /** Subscribe to every painted note: cb({step, base, midi, freq, instrument, zone, still, finger, time, x, y}). Returns unsubscribe. */
    onNote(cb) { noteCbs.add(cb); return () => noteCbs.delete(cb); },
    /** Subscribe to finished phrases: cb({notes, steps, duration, start, key, place, env}). Returns unsubscribe. */
    onPhrase(cb) { phraseCbs.add(cb); return () => phraseCbs.delete(cb); },
    /** The last n painted notes (newest last), e.g. for a bird that sings the child's tune back. */
    recent(n = 8) { return recent.slice(-n); },
    _cancelAll() { for (const f of fingers.values()) if (f.bloom) f.bloom.release(); fingers.clear(); },
  };
}
