// Which edition runs (owner: engine). Both editions share the whole engine; they differ only in their place list
// (and so in the places' art). The entry page names the edition on <html data-edition="...">:
//   index.html  -> "painted" (default)  places from web/src/biomes/registry.js
//   simple.html -> "simple"             places from web/src/simple/registry.js
// Both registries have the same shape: ORDER, EXTRA, LOADERS, and optionally SECRET, HIDDEN, QUIET (see
// web/src/biomes/registry.js). The painted edition has no secret place (V1, BRIEF 36): SECRET is then null.

const named = (typeof document !== 'undefined' && document.documentElement.dataset.edition) || 'painted';

/** "painted" or "simple" */
export const EDITION = named === 'simple' ? 'simple' : 'painted';

const reg = EDITION === 'simple' ? await import('../simple/registry.js') : await import('../biomes/registry.js');

export const { ORDER, EXTRA, LOADERS } = reg;

/** The secret place (optional in a registry): its id, or null when the edition has none (the painted edition). */
export const SECRET = reg.SECRET || null;

/** More hidden places (optional in a registry): loaded and saved like any place, listed nowhere. */
export const HIDDEN = reg.HIDDEN || [];

/** Quiet places (optional in a registry): no touch magic, no world gestures, no cloud icon (docs/ENGINE.md `quiet`). */
export const QUIET = reg.QUIET || [];

/** Help for the grown-up (marked ways, the "?" card, first-visit hints; core/help.js): the simple edition only for now.
 *  One flag: set it true for the painted edition too when the owner asks. ?help=1 / ?help=0 override it per session. */
export const HELP = EDITION === 'simple';

/** localStorage key of this edition's save; the painted key is the one earlier builds used, so saves carry over. */
export const SAVE_KEY = EDITION === 'simple' ? 'quietgarden.simple.save.v1' : 'quietgarden.save.v1';
