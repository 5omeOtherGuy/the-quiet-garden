// Art lab: one plate through the real pipeline (scene draw -> weather -> compositor).
// ?plate=painted|vista|burrow|creature|forest|study &season= &time= &weather= &view= &still=1 &warm=<frames> &demo=1
//  &then=season:autumn&at=40 (still: change the env when <at> warm frames are left) &stress=<n> &tooth=<0..1>
//  &seed= &mode=gl|2d &debug=1 &mp= &chips=0
//  &motion=auto|wind|clip|off (the moving background of the painted plate: auto = the view's flow atlas, else invented
//  wind; clip = the plain clip, for comparison) &wind=<level> (overrides the weather's motion level) &bare=1 &gpu=1
//  &place=falls&view=glade (another place's views, bare) &water=0 (its water clip off)
//  &storm=<0..1> (how far the storm map is blended in) &stormmap=still|inverted (a test storm map from the view's own)
//  &weatherdraw=0 (the same env without art's weather layer) &skip=rain,rings (leave parts of it out: what each costs) &rain=flicks (the rain as single flick stamps instead of two scrolled sheets)
// The painted plate is the proof of the painted pipeline: still views (cover fit), strokes that grow and shed,
// creatures with a life of their own. Its tiny chips (season, time, weather, view) are a developer aid only.
import * as art from '../index.js';
import { vista } from './vista.js';
import { burrow } from './burrow.js';
import { creature } from './creature.js';
import { forest } from './forest.js';
import { study } from './study.js';
import { paintedPlate } from './painted.js';

const q = new URLSearchParams(location.search);
const plateName = q.get('plate') || 'painted';
const SEASONS = ['spring', 'summer', 'autumn', 'winter'], TIMES = ['dawn', 'day', 'dusk', 'night'], WEATHERS = ['clear', 'breeze', 'wind', 'storm', 'rain', 'snow', 'fog'];
const env = { season: q.get('season') || 'summer', time: q.get('time') || 'day', weather: q.get('weather') || 'clear', blend: 1, prev: null };
const target = {};
function weatherTargets(w) { return { wet: w === 'rain' || w === 'storm' ? 1 : 0, windy: { wind: 1, storm: 0.85, breeze: 0.4, rain: 0.25 }[w] ?? 0.08, foggy: w === 'fog' ? 1 : 0, stormy: w === 'storm' ? 1 : 0, snowy: w === 'snow' ? 1 : 0 }; }
function setEnv(key, value, instant) {
  if (key !== 'weather') { env.prev = { season: env.season, time: env.time }; env.blend = instant ? 1 : 0; }
  env[key] = value; Object.assign(target, weatherTargets(env.weather));
  if (instant) Object.assign(env, target);
  env.light = { dawn: 0.7, day: 1, dusk: 0.55, night: 0.15 }[env.time];
  env.cold = env.season === 'winter' ? 1 : env.weather === 'snow' ? 0.7 : 0;
}
setEnv('weather', env.weather, true);
if (q.get('mode')) art.compositor.mode = q.get('mode');
if (q.get('skip')) art.weather.skip = q.get('skip'); if (q.get('rain') === 'flicks') art.weather.sheets = false;   // &skip=rain,rings: leave parts of the weather layer out (lid fog lightning rain spatter rings snow wind motes), to see what each costs
if (q.get('gpu')) art.compositor.measure = true;       // &gpu=1: time the compositor's pass on the GPU (stats.gpuMs, shown in the HUD)

const cv = document.getElementById('c'), hud = document.getElementById('hud'), chipBox = document.getElementById('chips');
if (q.get('debug')) hud.style.display = 'block';
const seed = +(q.get('seed') || 7);
const still = q.get('still') === '1';

let W, H, dpr, scene, sceneCanvas, sceneG, world;
function resize() {
  const cap = +(q.get('mp') || 4.2e6); // the lab allows larger plates than the game cap
  dpr = Math.min(devicePixelRatio || 1, Math.sqrt(cap / (innerWidth * innerHeight)));
  W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
  cv.width = W; cv.height = H;
  sceneCanvas = document.createElement('canvas'); sceneCanvas.width = W; sceneCanvas.height = H;
  sceneG = sceneCanvas.getContext('2d');
  world = { h: 1000, w: 1000 * (W / H), scale: H / 1000 };
}

function chips() {
  chipBox.textContent = '';
  if (!scene.chips || q.get('chips') === '0') return;
  const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label(); b.addEventListener('click', (e) => { e.preventDefault(); fn(); b.textContent = label(); }); chipBox.appendChild(b); };
  const next = (list, v) => list[(list.indexOf(v) + 1) % list.length];
  mk(() => env.season, () => setEnv('season', next(SEASONS, env.season)));
  mk(() => env.time, () => setEnv('time', next(TIMES, env.time)));
  mk(() => env.weather, () => setEnv('weather', next(WEATHERS, env.weather)));
  if (scene.views) mk(() => scene.view, () => scene.show(next(scene.views, scene.view)));
  if (scene.motions) mk(() => scene.motion, () => scene.setMotion(next(scene.motions, scene.motion)));
}

function build() {
  const t0 = performance.now();
  const mk = { painted: paintedPlate, vista, burrow, creature, forest, study }[plateName] || vista;
  art.compositor.look = null;
  scene = mk(art, env, world, seed, { q, W, H });
  scene.bakeMs = performance.now() - t0;
  art.compositor.interior = 0; if (scene.enter) scene.enter();
  chips();
}

// the visible part of the world: a painted view tells its own (cover fit); the old plates show 0..world.w
function visible() { return scene.frame ? scene.frame(W / H) : { x: 0, y: 0, w: world.w, h: 1000 }; }
function toWorld(e) { const v = visible(), k = v.h / innerHeight; return [v.x + e.clientX * k, v.y + e.clientY * k]; }
const fingers = new Map();
cv.addEventListener('pointerdown', (e) => { if (!scene.pointer) return; cv.setPointerCapture(e.pointerId); const [x, y] = toWorld(e); fingers.set(e.pointerId, { x0: e.clientX, y0: e.clientY, t0: performance.now(), far: 0 }); scene.pointer('down', x, y, e.pointerId); });
cv.addEventListener('pointermove', (e) => {
  const f = fingers.get(e.pointerId); if (!f || !scene.pointer) return;
  f.far = Math.max(f.far, Math.hypot(e.clientX - f.x0, e.clientY - f.y0));
  for (const c of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) { const [x, y] = toWorld(c); scene.pointer('move', x, y, e.pointerId); }
});
const up = (e) => { const f = fingers.get(e.pointerId); if (!f || !scene.pointer) return; fingers.delete(e.pointerId); const [x, y] = toWorld(e); scene.pointer('up', x, y, e.pointerId); if (f.far < 10 && performance.now() - f.t0 < 350) scene.pointer('tap', x, y, e.pointerId); };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

let t = +(q.get('t') || 0), last = performance.now(), frames = 0, frameMs = 0, warm = null, done = false, fps = 0, fpsN = 0, fpsT = performance.now();
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  fpsN++; if (now - fpsT >= 1000) { fps = fpsN * 1000 / (now - fpsT); fpsN = 0; fpsT = now; }
  const ready = !scene.settled || scene.settled();
  if (still) { if (warm === null) warm = +(q.get('warm') || scene.warm || 2); dt = ready && warm > 0 ? 1 / 30 : 0; if (ready && warm > 0) { warm--; if (scene.demo && q.get('demo')) scene.demo(t, dt); if (q.get('then') && warm === +(q.get('at') || 40)) { const [k, v] = q.get('then').split(':'); setEnv(k, v); } } else if (ready) done = true; }
  t += dt;
  if (env.blend < 1) env.blend = Math.min(1, env.blend + dt / 3);
  for (const k in target) env[k] += (target[k] - env[k]) * Math.min(1, dt * 0.9);
  const f0 = performance.now();
  const g = sceneG, view = visible(), sc = H / view.h;
  g.setTransform(sc, 0, 0, sc, -view.x * sc, -view.y * sc);
  if (!scene.frame) art.paper.fill(g, 0, 0, world.w, world.h);
  scene.draw(g, env, view, t);
  if (!scene.ownWeather && q.get('weatherdraw') !== '0') art.weather.draw(g, env, view, t);   // &weatherdraw=0: the same env without art's weather layer (to see its cost)
  art.compositor.present(sceneCanvas, env, { target: cv, t, dt });
  const ms = performance.now() - f0; frameMs += (ms - frameMs) * 0.1; frames++;
  const stats = { bakeMs: scene.bakeMs, frameMs, presentMs: art.compositor.stats.ms, weatherMs: art.weather.stats.ms, mode: art.compositor.stats.mode, backdrop: art.compositor.stats.backdrop, motion: art.compositor.stats.motion, gpuMs: art.compositor.stats.gpuMs, fps, W, H, frames, layers: scene.layers, things: scene.count ? scene.count() : undefined };
  if (!still || done) window.QGART = stats;
  if (hud.style.display !== 'none') hud.textContent = `${plateName} ${env.season}/${env.time}/${env.weather} ${W}x${H}\nframe ${frameMs.toFixed(2)} ms  present ${art.compositor.stats.ms.toFixed(2)} ms [${art.compositor.stats.mode}${art.compositor.stats.backdrop ? ' moving ' + ['flow', 'wind', 'clip', 'still'][art.compositor.stats.motion] : ''}]  ${fps.toFixed(0)} fps${art.compositor.measure ? ' gpu ' + (art.compositor.stats.gpuMs || 0).toFixed(2) + ' ms' : ''}  weather ${art.weather.stats.ms.toFixed(2)} ms` + (stats.things ? `\n${JSON.stringify(stats.things)}` : '');
  if (!still || !done || frames < 2) requestAnimationFrame(frame);
}

resize(); build(); requestAnimationFrame(frame);
addEventListener('resize', () => { resize(); build(); warm = null; done = false; if (still) requestAnimationFrame(frame); });
window.QGLAB = { rebuild: build, env, setEnv, art, get scene() { return scene; } };
