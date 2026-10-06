// The places of the painted edition (owner: engine). Each place lives in web/src/biomes/<id>/index.js and is loaded
// on its own, so one broken place cannot stop the others (it shows a calm empty page instead).
// V1 (owner 2026-10-03, BRIEF 36): the meadow, the wood and the beach, joined to each other by ways in their pictures,
// plus the hidden waterfall glade behind the wood. No placeholders and no secret place; more places may come later.
// The simple edition keeps all its places (web/src/simple/registry.js).

/** The main places, in no particular walking order (their ways join them); ORDER[0] is where a new game starts and
 *  where a save or a start query that names a place this edition does not have starts instead. */
export const ORDER = ['meadow', 'wood', 'beach'];

// No SECRET: the painted edition has no secret place for now. A registry may export one (the simple edition's Raven's
// Nook): `export const SECRET = '<id>'`, listed nowhere, reached only through an exit with `to: '<id>'`.

/** Hidden places: listed nowhere, loaded and saved like any place, reached only through an exit that another place
 * hides (falls: the waterfall glade behind the wood; owner 2026-10-02, BRIEF point 17). */
export const HIDDEN = ['falls'];

/** Quiet places (optional in a registry): nothing answers a touch there but the place itself and its ways (no touch
 * sparks, no soft notes, no world gestures, no cloud icon; docs/ENGINE.md "Lifecycle", `quiet`). A place may also say
 * `quiet: true` itself. falls: BRIEF 25, the owner's review finding 2026-10-03 (the cloud icon answered there). */
export const QUIET = ['falls'];

/** Engine-only test places, reachable only with ?place=<id>: _demo (code-drawn), _painted (art's painted meadow proof). */
export const EXTRA = ['_demo', '_painted'];

export const LOADERS = {
  meadow: () => import('./meadow/index.js'),
  wood: () => import('./wood/index.js'),
  beach: () => import('./beach/index.js'),
  falls: () => import('./falls/index.js'),
  _demo: () => import('./_demo/index.js'),
  _painted: () => import('./_painted/index.js'),
};
