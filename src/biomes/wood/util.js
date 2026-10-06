// Small helpers shared by the wood and its insides (owner: wood worker).

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const near = (p, x, y, r) => Math.hypot(p.x - x, p.y - y) < r;

/** Sound helpers bound to the engine; quiet when audio is missing. A short gate keeps a fast finger from piling notes. */
export function voice(engine) {
  const gates = new Map();
  const a = () => engine.audio;
  const v = {
    note(step, o) { const A = a(); if (A && A.note) A.note(step, o || {}); },
    chord(steps, o) { const A = a(); if (A && A.chord) A.chord(steps, o || {}); },
    phrase(list, o) { const A = a(); if (A && A.phrase) A.phrase(list, o || {}); },
    sfx(name, o) { const A = a(); if (A && A.sfx && A.sfx.play) A.sfx.play(name, o || {}); },
    motif(o) { const A = a(); if (A && A.motif) A.motif(o || {}); },
    /** true at most every `sec` seconds per key */
    gate(key, sec) { const t = engine.now(), l = gates.get(key) ?? -1e9; if (t - l < sec) return false; gates.set(key, t); return true; },
  };
  return v;
}

/** A scale step from a world x across a view (left low, right high), like the original garden's keyboard. */
export const stepAt = (x, base = 0, span = 9, width = 2000) => base + clamp(Math.floor((x / width) * span), 0, span);

/** Draw a sprite once more through a canvas filter (the white stag): the sprite itself stays hidden (alpha 0). */
export function drawFiltered(g, s, filter, alpha) {
  const a0 = s.alpha; s.alpha = alpha; g.save(); g.filter = filter; s.draw(g, 0); g.restore(); s.alpha = a0;
}

/** Keep a sprite's rotation through art's per-frame reset (a rolling log). */
export function holdRot(s) {
  const up = s.update.bind(s); s.spin = 0;
  s.update = (dt, env, t) => { up(dt, env, t); s.rot = s.spin; };
  return s;
}
