// Persistent save (owner: engine). localStorage, every access wrapped; survives app restarts.
// Only small states of the world (BRIEF "The spirit"): never progress, counts or lists of what a child did.
// Shape (v1): { v, places: {placeId: {key: value}}, env: {season, time, weather}, at: {place, view}, secretKnown }
//   places       small world states a place keeps (a dam that stays built), via engine.save
//   env          the season, time and weather the child left the world in
//   at           the place and view the child was in, so the app reopens there
//   secretKnown  the child has been in the secret place once (simple edition: the Raven's Nook; the mountains may keep
//                its way open; listed nowhere). The painted edition has no secret place: it stays false there.
//   helpSeen     the first-visit hints for the grown-up were shown (simple edition, core/help.js)
// ?nosave=1 keeps everything in memory only (tests).

import { params } from './util.js';
import { SAVE_KEY as KEY } from './edition.js'; // each edition keeps its own save
const KEEP = ['places', 'env', 'at', 'secretKnown', 'helpSeen']; // anything else an earlier build stored is dropped on load

export function createSave() {
  const persist = !params.flag('nosave');
  let data = { v: 1, places: {}, env: null, at: null, secretKnown: false };
  let cleaned = false;
  if (persist) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.v === 1) {
          for (const k of Object.keys(d)) if (k !== 'v' && !KEEP.includes(k)) cleaned = true;
          for (const k of KEEP) if (k in d) data[k] = d[k];
        }
      }
    } catch (_) { /* private mode or corrupt: start fresh */ }
  }
  let timer = 0;
  const beforeFlush = [];
  function flush() {
    clearTimeout(timer); timer = 0;
    for (const fn of beforeFlush) { try { fn(); } catch (_) { /* a place's store must not stop the save */ } }
    if (!persist) return;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* full or blocked: keep playing */ }
  }
  function dirty() {
    if (!timer) timer = setTimeout(flush, 400);
  }
  if (cleaned) dirty();
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  return {
    data,
    flush,
    dirty,
    /** fn runs just before every write (grow layers put their things in then) */
    beforeFlush(fn) { beforeFlush.push(fn); },
    /** Per-place store used by engine.save. Values must be JSON-safe. */
    place(ns) {
      return {
        get(key, dflt) {
          const p = data.places[ns];
          return p && Object.prototype.hasOwnProperty.call(p, key) ? p[key] : dflt;
        },
        set(key, value) {
          (data.places[ns] ||= {})[key] = value;
          dirty();
          return value;
        },
        /** set without scheduling a write (used from beforeFlush) */
        put(key, value) { (data.places[ns] ||= {})[key] = value; return value; },
      };
    },
    set(key, value) { data[key] = value; dirty(); },
    /** Forget everything (grown-up reset, not exposed in the UI). */
    reset() {
      data.places = {}; data.env = null; data.at = null; data.secretKnown = false;
      flush();
    },
  };
}
