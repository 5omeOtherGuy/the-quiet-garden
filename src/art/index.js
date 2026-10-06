// The Quiet Garden: art public API (owner: art). How pictures are made: docs/STYLE.md. Lab: web/art-lab.html?plate=painted.
//
// Every picture is a painting made with tools/paint/paint.sh, cut out and exported with tools/paint/cutout.py to
// web/assets/art/<place>/ (WebP + manifest.json). This module brings the paintings to life.
//
// PAINTED PLACES (still views; the worked example is lab/painted.js, the place data art-src/meadow/place.json)
//   const place = await painted.open('meadow', { view: 'oak', pixelHeight })   manifest, sprite images, piece atlas
//   place.show(view)                  another view of the place (the old view's paintings are freed)
//   place.width, place.safe           the view in world units (1000 high, about 2000 wide), its safe x-range
//   place.frame(aspect) -> {x,y,w,h}  the part a screen of that aspect shows (cover fit around the safe area)
//   place.draw(g, env, view, t)       once per frame: the painting of env.season (a change of season spreads as a
//                                     wash from place.washFrom = [x, y], else from mid-view; the old season's
//                                     bitmaps are freed when the wash has passed), the night painting faded in by
//                                     time of day (dawn and dusk are blends), things on the ground, sprites and
//                                     grown things in depth order, falling things, light anchors. Paintings load
//                                     lazily; place.settled says when nothing is pending. Sets compositor.look.
//   place.free()                      in the place's leave(): closes every bitmap and clears compositor.look
//   MOVING BACKGROUND (the painting itself moves under the living foreground; compositor.js has the pass)
//       Motion source per view: a flow atlas made from one animated clip of the view (tools/motion/flow.py, manifest
//       views.<v>.motion.flow); the STILL painting of the current season and time is displaced by flow x strength, so
//       one clip serves all variants. Views without a clip get invented wind. Strength per pixel = weather level
//       (from env.windy and env.stormy, in gust fronts that cross the picture) + the stroke map, by region (crown,
//       meadow, water, sky move; everything else is held; MOTION.gains per season: snow lies still).
//       A second atlas measured from a storm clip of the same view (manifest views.<v>.motion.storm) is blended in
//       by env.stormy (0: the calm map, 1: the storm map), so a sea moves differently in a storm, not just more,
//       and the change comes with the weather. place.stormMix = 0..1 forces the blend (lab); null = env.stormy.
//       Water that really flows: a clip of the view's water (manifest views.<v>.water, made by cutout.py from the
//       clip's json) is shown inside the water region over the still painting, its change against the still it was
//       made from carried onto the variant shown. place.water = false turns it off. It plays only in live frames.
//       A storm clip beside it (views.<v>.water.storm) is blended in by env.stormy (place.stormMix forces it); the
//       mask is the base's alpha when the export built one (water plus the surf band), else the water region.
//   place.gust({ x, y, id, k } | [...])   something stirs the picture there: it moves there and only there and comes
//                                     to rest in about 2.6 s. Feed it the same stroke points as field.stroke.
//   place.gustEnd(id)                 the finger lifted
//   place.motionAt(x, y) -> strength  (0 at rest, 0.6 wind, 1.4 storm, +0.95 under a finger); also motion.at(x, y)
//                                     for the place drawn last. Swaying sprites and grown things use it already.
//   place.motion = 'auto' | 'wind' | 'clip' | 'off'; place.wind = <level> overrides the weather; place.flat = true
//       keeps the paintings in the scene canvas (no motion). place.live: was the last frame moving? A frame is live
//       when the canvas the place draws into is the one the compositor presented last with WebGL; otherwise the
//       place draws its paintings itself, still, and everything else works as before. motion.K: the live knobs.
//   REGIONS (what a finger is over; masks made from a painted region map, docs/STYLE.md section 5)
//   place.region(x, y) -> 'meadow' | 'crown' | 'water' | 'sky' | ... | null     place.inRegion(name, x, y)
//   place.below(name, x, y) -> the first y at or below the point inside the region (where a falling thing lands)
//   SPRITES (single painted things and creatures)
//   const s = place.add(name, { x, y, scale, flip, z, depth, seasons, times, shadow, touchable, pose, data })
//       x, y: where the sprite's anchor (its foot) stands. depth: scale with distance (place.scaleAt(y)).
//       seasons / times: when it shows; it grows in and fades out by itself, and at a season change it changes
//       when the wash front passes it.
//   motion (chainable):  s.sway(amp, speed)       plants: bend from the foot in the wind (env.windy, env.stormy)
//                        s.breathe(amp, speed)    resting animals
//                        s.walk(path, { poses, speed, step, loop, rest, bob, creep })   painted poses in turn per
//                                                 step of ground covered; faces its way; rests at the ends
//                        s.fly(next, { speed, flutter, wobble })   next(s) -> { x, y, stay } each time it arrives
//                        s.hopTo(x, y, { height, time })   one hop with a squash on landing
//                        s.life({ home, roam, idle: [poses], alert, hop: [crouch, leap, land] | walk: [poses],
//                                 away, look, wait, ground })      a life of its own from a pose set of one individual:
//                                                 idles and moves about; s.startle() -> looks up, moves away, waits,
//                                                 comes back. Never used up.
//                        s.setPose(name | n), s.poke(k) (squash and bounce: the answer to a touch)
//       fields: s.x s.y s.scale s.flip s.pose s.alpha s.rot (the place's own turn, kept across frames) s.vis (0..1
//       shown) s.size -> { w, h } in world units. A sprite answers place.hit only while shown (alpha x vis over 0.5).
//   place.hit(x, y) -> the topmost touchable sprite whose painted pixels are under the point (alpha mask), or null
//   place.remove(s), place.scaleAt(y), place.sprites, place.set(name) -> the piece names of a set
//   art.cloud(g, x, y, width, darkness, bump)   a small painted cloud (soft puffs, stamps only) for the engine's rain
//                                     cloud where a view has no 'cloud' region (core/clouds.js drawCloud's signature).
//   Regions named 'cloud' (the painted clouds, for the engine's rain) count as sky for the moving background and
//                                     the storm veil; place.region(x, y) says 'cloud' there.
//   place.sun -> { x, y, r } in world units: where the painted sun (at night the moon) of the view shown stands,
//       from place.json (views.<v>.sun); null when the view has none. For the engine's sun drag.
//   GROWN AND SHED THINGS (grow.js; pooled, drawn from one atlas; stroke points are plain { x, y, id } in world units)
//   const field = place.field({ region, kinds: [{ heads, stems, h, head, weight, seasons, lean }], max, keep, rest, thin, spacing, minY, life, wild, onBloom })
//       field.stroke(p | [p...])   flowers come up along the finger's way; standing ones lean away from it
//       field.end(id)  field.bloomAt(x, y)  field.seed(n, rnd)  field.any(rnd, filter) + field.headOf(item) (for bees)
//       field.dump() / field.load(list)   plain data for the engine's save. field.load(list, { replace: true })
//       empties the field first (a restore); field.clear() empties it at once.
//       The field never fills up: max 120 stand at once (the oldest wilts when it is passed); left alone for `rest`
//       30 s it thins by one flower every `thin` 3 s down to `keep` 20, which stay (spread over the view); `wild`
//       keeps a few growing by themselves. All four are options of place.field and fields of the Field.
//   const shed = place.shed({ region, ground, pieces, size, per, fall, lie, seasons, onLoose, onLand })
//       shed.stroke(p)   pieces let go where the finger brushes the region, fall with a flutter, settle on the
//       ground region below, lie a while, are picked up again by the wind, fade. shed.loose(x, y, vx, vy), shed.scatter(n).
//   State changes (a thing appears, falls, opens): each state is a painted piece or pose (docs/STYLE.md section 7);
//   code switches and moves them; cover the moment with fx.
//
// TOUCH MAGIC      fx.trail(x, y, id) on pointer move (sparks rise and follow), fx.release(id), fx.burst(x, y, {n, power, rgb}),
//                  fx.ripple(x, y, {r, flat, rgb}), fx.bloom(x, y, {r, rgb, life}); fx.draw(g, env, view, t) once per
//                  frame after the place and before the weather.
//
// SEAMS (docs/CONTRACT.md)
//   compositor.present(sceneCanvas, env, frameInfo)   frameInfo = { target: <visible canvas or its 2D ctx>, t, dt }
//       Grades the sheet by env (season, time, weather, env.blend/env.prev) and screens the lights on after the grade.
//       WebGL single pass; Canvas 2D fallback. Without frameInfo.target the scene canvas is graded in place (2D).
//       compositor.mode = 'auto'|'gl'|'2d'; compositor.stats = { ms (smoothed), mode, frames, lights, backdrop, motion }.
//       compositor.backdrop: set by a painted place for one frame (its paintings, drawn by the compositor under the
//       scene, moving). The scene canvas must then be presented in the same frame; nothing to do for the engine.
//       compositor.interior = 0..1: a place sets it in enter()/leave() of a burrow/hive/cave to damp the night grade.
//       compositor.look = { time, tooth } | null: set by a painted place (see grade() in palette.js): paper and edge
//       passes off, season glaze off, time glaze scaled by look.time (a painted night needs almost none), weather
//       graded lightly so night and storm stay luminous. tooth 0..1 adds a little paper grain (soft, enlarged paintings).
//   weather.draw(g, env, view, t)                     painted weather: soft round snow specks, fine rain flicks with spatter
//       and rings, drifting mist, a wet-in-wet cloud lid for rain and storm, lightning inside the cloud, pollen specks
//       in still clear air, blown leaves and petals. Stateless (every particle is a function of t). weather.stats.ms.
//   light(g, x, y, r, color, strength = 1, {core, falloff})   call while drawing (world units): a glow that the
//       compositor screens on AFTER the grade, so lamps, windows, fireflies and sparks stay warm and bright.
//   nightness(env) -> 0..1 (dawn 0.22, dusk 0.42, night 1; continuous through env.blend/env.prev)
//
// PALETTE
//   palette(env) -> named colours for the season, time and weather (for code-drawn details that must match)
//   grade(env)   -> the compositor's grading parameters (for anyone who wants to match them).
//   color: PIGMENTS, pig(name), mix(a,b,t) (subtractive), dilute, deepen, warm, cool, lerpRgb, shiftHue, saturate, css, parse, PAPER
//
// LEGACY (code-drawn round 1 and 2; kept loadable for the places that still use them, not developed further):
//   brush.*, sky, terrain, water, plants, buildings, creatures, layers, paper. See docs/status/art-round2-paused.md.
// RNG:    rng(seed) -> r(), r.range, r.int, r.pick, r.chance, r.gauss, r.fork(k); noise: noise1, noise2, fbm1, fbm2, ridged2

export { painted, motion } from './painted.js';
export { cloud } from './weather.js';
export { fx } from './fx.js';
export { compositor } from './compositor.js';
export { weather } from './weather.js';
export { light, lights } from './lights.js';
export { palette, grade, nightness } from './palette.js';
export * as color from './color.js';
export * as brush from './brush.js';
export * as paper from './paper.js';
export { sky } from './sky.js';
export { terrain } from './terrain.js';
export { water } from './water.js';
export { plants } from './plants.js';
export { buildings } from './buildings.js';
export { creatures } from './creatures.js';
export { layers } from './layers.js';
export { rng, hash2, TAU, clamp, lerp, smoothstep } from './rng.js';
export * as noise from './noise.js';
