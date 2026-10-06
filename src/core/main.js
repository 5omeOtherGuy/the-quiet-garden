// The Quiet Garden: engine entry (owner: engine). Boot, the frame loop, rendering through the art compositor,
// the opening, the services places get, and the test hooks. The API places use is documented in docs/ENGINE.md.
// There is nothing on top of the picture: no buttons, no panels, no map. Everything happens by touching the world.

import { params, reducedMotion, report, safe, easeInOut, clamp } from './util.js';
import { createEnv, orb } from './env.js';
import { createSave } from './save.js';
import { createStage } from './stage.js';
import { createCamera } from './camera.js';
import { createFx } from './fx.js';
import { createInput } from './input.js';
import { createGestures } from './gestures.js';
import { createWorld } from './world.js';
import { createExits } from './exits.js';
import { createRegions } from './regions.js';
import { createGrowLayer } from './grow.js';
import { paintedViews, wrapPainted } from './painted.js';
import { skin } from './ui/skin.js';
import { EDITION, ORDER, SECRET, HIDDEN, EXTRA, LOADERS, HELP, QUIET } from './edition.js';
// grown things in the simple edition thin sooner, faster and per patch (owner, BRIEF 23); painted keeps BRIEF 15/20
const GROW_DEFAULTS = EDITION === 'simple' ? { keep: 10, rest: 15, thin: 0.7, patch: 300 } : null;
import { createHelp } from './help.js';
import { createClouds } from './clouds.js';
import { createWays } from './ways.js';

const STILL = params.flag('still');
const MANUAL = params.flag('manual'); // tests: the clock moves only with QG.advance(), transitions still play
const DEBUG = params.flag('debug');
const SKIP_INTRO = params.flag('skipintro') || STILL;
const SEED = params.num('seed', (Math.random() * 1e9) >>> 0);

async function loadModule(path, what) {
  try { return await import(path); } catch (e) { report(`load ${what}`, e); return {}; }
}

async function loadPlaces() {
  // every place of this edition that has a loader, once (SECRET is optional: null in the painted edition)
  const ids = [...new Set([...ORDER, SECRET, ...HIDDEN, ...EXTRA])].filter((id) => {
    if (!id) return false;
    if (typeof LOADERS[id] !== 'function') { report('registry', new Error(`no loader for place "${id}"`)); return false; }
    return true;
  });
  const res = await Promise.allSettled(ids.map((id) => LOADERS[id]()));
  const defs = {};
  res.forEach((r, i) => {
    const id = ids[i];
    let def = r.status === 'fulfilled' ? r.value && r.value.default : null;
    if (r.status === 'rejected') report(`load place ${id}`, r.reason);
    if (!def || typeof def.create !== 'function') {
      def = { id, name: id, world: { w: 2000, h: 1000 }, music: {}, create: () => ({ draw() {} }) };
    }
    if (!def.id) def.id = id;
    defs[id] = def;
  });
  // painted places take their views from art's manifest (docs/ENGINE.md "A painted place")
  await Promise.all(Object.values(defs).filter((d) => d.painted && !d.views).map((d) =>
    paintedViews(d.painted).then((v) => { d.views = v; }, (e) => report(`painted views ${d.id}`, e))));
  return defs;
}

// UI sounds go through audio.ui(name); everything else is an audio.sfx voice, kept from crowding (min gap, seconds)
const UI_NAMES = new Set(['begin', 'travel', 'enter', 'leave', 'edge', 'select']);
const GAP = { rustle: 0.3, gust: 0.45, whoosh: 0.35, drip: 0.02, chime: 0.25, twinkle: 0.3, sparkle: 0.3, wonder: 0.6 };

async function boot() {
  const canvas = document.getElementById('view');
  const stage = createStage(canvas);
  stage.resize();

  const [art, audio, defs] = await Promise.all([
    loadModule('../art/index.js', 'art'),
    loadModule('../audio/index.js', 'audio'),
    loadPlaces(),
  ]);
  skin.art = art;
  if (art.ui) safe('skin.adopt', () => skin.adopt(art.ui));

  const save = createSave();
  const envCtl = createEnv();
  const env = envCtl.env;
  {
    const s = save.data.env || {};
    const want = { season: params.get('season') || s.season, time: params.get('time') || s.time, weather: params.get('weather') || s.weather };
    env.set(want, { instant: true, hold: params.has('weather') });
  }

  const camera = createCamera(stage);
  const fx = createFx();
  fx.reduce = reducedMotion;

  let T = 0;                    // engine clock, seconds (frozen by ?still=1 after the first paint)
  const now = () => T;
  const lastSound = Object.create(null);
  const sound = (name, opts) => {
    if (!audio) return;
    if (UI_NAMES.has(name)) {
      if (typeof audio.ui === 'function') safe('audio.ui', () => audio.ui(name));
      return;
    }
    const t = performance.now() / 1000, gap = GAP[name] ?? 0.06;
    if (t - (lastSound[name] || 0) < gap) return;
    lastSound[name] = t;
    const sx = audio.sfx;
    if (sx && typeof sx.play === 'function') safe('audio.sfx', () => sx.play(name, opts || {}));
  };

  // ---- ghost: the old picture washing away when the environment changes ---------------------
  const ghost = { on: false, t: 0, dur: 1.9, fx: 0, fy: 0, fw: 1, cx: 0, cy: 0, node: null };
  let cardUp = false;
  let frameNo = 0;
  const shown = { sun: { sx: 0, sy: 0, sr: 0, frame: -9 }, moon: { sx: 0, sy: 0, sr: 0, frame: -9 } };

  // ---- the services every place gets on top of world.js's (docs/ENGINE.md) ------------------------
  function services(n) {
    const sunO = { x: 0, y: 0, r: 0, up: 0 }, moonO = { x: 0, y: 0, r: 0, up: 0 };
    const tmpFrame = { x: 0, y: 0, w: 0, h: 0 };
    const atScreen = (p) => {
      if (!p) return null;
      const f = n.frame || camera.view;
      return { sx: clamp((p.x - f.x) / f.w, 0, 1), sy: clamp((p.y - f.y) / f.h, 0, 1) };
    };
    const orbOf = (moon, view) => {
      const v = view || n.frame || camera.view, o = orb(env.hour, v, moon, moon ? moonO : sunO);
      if (world.top === n && !world.trans) {
        const s = moon ? shown.moon : shown.sun;
        s.sx = (o.x - v.x) / v.w; s.sy = (o.y - v.y) / v.h; s.sr = o.r / v.h; s.frame = o.up > -0.05 ? frameNo : -9;
      }
      return o;
    };
    let regions = null;
    return {
      gestures: {
        /** listen to a world gesture while this place is shown; cb(info) -> true: the place answered it itself */
        on(name, cb) {
          const l = n.listeners[name] || (n.listeners[name] = []);
          l.push(cb);
          return () => { const i = l.indexOf(cb); if (i >= 0) l.splice(i, 1); };
        },
        /** live intensities 0..1: swirl, patter, wipe, hand */
        get level() { return gestures.level; },
      },
      sky: {
        /** where the sun is (draw it there between your sky and your hills): {x, y, r, up}; up > 0: above the horizon */
        sun: (view) => orbOf(false, view),
        moon: (view) => orbOf(true, view),
        /** the place's own things change the weather: amounts like a few raindrops (0.1) to a downpour (0.5) */
        rain: (k = 0.3, at) => envCtl.add('rain', k, atScreen(at)),
        wind: (k = 0.4, at) => envCtl.add('wind', k, atScreen(at)),
        fog: (k = 0.4, at) => envCtl.add('fog', k, atScreen(at)),
        clear: (at) => envCtl.clear(1, atScreen(at)),
        /** the live weather energies {rain, wind, fog} (read only) */
        get level() { return envCtl.energy; },
        get hour() { return env.hour; },
      },
      exits: exits.api(n),
      get regions() { return regions || (regions = n.regions || (n.regions = createRegions(n))); },
      /** a pooled layer for thousands of small grown things (grow.js) */
      grow(opts) {
        const layer = createGrowLayer(opts || {}, {
          now, stage, env, store: save.place(n.placeId), onFlush: (fn) => save.beforeFlush(fn), defaults: GROW_DEFAULTS,
          target: () => camera.frameOf(n.views[n.viewId] || n.views[Object.keys(n.views)[0]], tmpFrame),
        });
        (n.growLayers ||= []).push(layer);
        return layer;
      },
    };
  }

  const world = createWorld({
    defs, secret: SECRET, stage, camera, env, save, art, audio, fx,
    now, still: STILL, seed: SEED, reduce: reducedMotion, sound: (nm) => sound(nm), services,
    wrapScene: (n, sc) => (n.def.painted && !n.parent ? wrapPainted(n, sc, {
      art, env, stage, now, store: save.place(n.placeId), after: n.engine.after, onFlush: (fn) => save.beforeFlush(fn),
      quiet: (m) => QUIET.includes(m.placeId),
    }) : sc),
    hooks: {
      before() { input.endAll(); exits.cancel(); fx.clear(); if (art.fx && art.fx.clear) safe('art.fx.clear', () => art.fx.clear()); ghost.on = false; },
      stackChanged() {},
      arrive(node) {
        if (node.kind === 'place' && !EXTRA.includes(node.placeId)) save.set('at', { place: node.placeId, view: node.viewId });
        updateFrameInfo();
        ways.arrive(node);
      },
    },
  });

  const exits = createExits({ world, fx, sound });
  const gestures = createGestures({
    stage, camera, env, envCtl, fx, sound,
    node: () => world.top,
    listeners: (name) => { const t = world.top; return t ? t.listeners[name] : null; },
    frame: () => frameNo,
  });

  // the region under a world point of the top place (declared regions count even before the place asks for them)
  const regionAt = (x, y) => {
    const t = world.top; if (!t) return '';
    if (t.scene.regionAt) return t.scene.regionAt(x, y);
    if (!t.regions && (Array.isArray(t.def.regions) || Array.isArray(t.scene.regions))) t.regions = createRegions(t);
    return t.regions ? t.regions.at(x, y) : '';
  };
  // ---- clouds: rain and storm come from the cloud icon or a place's clouds (owner, BRIEF 24, 31; core/clouds.js) ----
  const HELP_ON = params.has('help') ? params.flag('help') : HELP;
  // a quiet place (`quiet: true` on its definition or scene; the falls glade): nothing answers a touch but the place
  // itself and its ways: no touch sparks, no soft notes, no world gestures, no cloud icon (falls-to-engine.md)
  const quietNode = (n) => !!n && !!(n.def.quiet || (n.scene && n.scene.quiet) || QUIET.includes(n.placeId));
  const clouds = createClouds({
    env, envCtl, fx, sound, stage, now, shown, frame: () => frameNo, regionAt, top: () => world.top, beside: HELP_ON, quiet: quietNode,
  });

  // ---- input ------------------------------------------------------------------------------------
  const input = createInput({
    canvas, stage, camera, fx, gestures, now, sound,
    node: () => world.top,
    blocked: () => !!world.trans || cardUp || help.blocking(),
    audio: () => audio,
    regionAt, clouds, hushed: () => quietNode(world.top),
    skyHit: (cx, cy) => (world.trans ? null : gestures.skyHit(cx, cy, shown)),
    exitTap: (p) => exits.tap(p),
    onDown: () => exits.cancel(),
    onActivity() { ways.touched(); },
  });

  // ---- help for the grown-up: marked ways, the "?" card, first-visit hints (simple edition; core/help.js) -------------
  const help = createHelp({
    on: HELP_ON, hints: params.flag('hints'), onCloud: (x, y) => clouds.onIcon(x, y),
    world, exits, stage, env, save, gestures, input, defs, ORDER, SECRET,
    sun: () => { const s = shown.sun.frame >= frameNo - 2 ? shown.sun : shown.moon.frame >= frameNo - 2 ? shown.moon : null; return s && s.sy < 0.9 ? s : null; },
    cloud: () => clouds.own, rain: () => envCtl.energy.rain,
  });

  // ---- the ways on to the next place, painted edition (BRIEF 35; core/ways.js): a soft light at the mouth of every way to
  // another main place, petals, leaves or motes floating into it. Off where help marks the ways (the simple edition).
  // ?ways=0 turns it off for a session (tests).
  const ways = createWays({
    on: EDITION === 'painted' && !HELP_ON && (params.has('ways') ? params.flag('ways') : true),
    world, exits, env, art, defs, ORDER, SECRET, HIDDEN, now, still: STILL, reduce: reducedMotion, quiet: quietNode,
    touching: () => input.list.length > 0,
  });

  /** Android back, Escape, QG.back(): leave an instance. True if handled; at a place's top level the app may close. */
  function back() {
    if (cardUp) return false;
    if (world.trans) return true;
    if (world.stack.length > 1) { world.leave(); return true; }
    return false;
  }

  // ---- audio unlock on the first gesture ---------------------------------------------------------
  let audioOn = false;
  function initAudio() {
    safe('audio.init', () => audio.init && audio.init()); // safe on every gesture: it also resumes a suspended context
    if (audioOn) return;
    audioOn = true;
    if (typeof audio.setMuted === 'function') safe('audio.setMuted', () => audio.setMuted(false));
    const top = world.top;
    if (top && typeof audio.setPlace === 'function') safe('audio.setPlace', () => audio.setPlace(top.music || {}, env, top.placeId));
    if (typeof audio.setView === 'function') safe('audio.setView', () => audio.setView(camera.view));
    if (typeof audio.setEnv === 'function') safe('audio.setEnv', () => audio.setEnv(env));
  }
  addEventListener('pointerdown', initAudio, { capture: true });
  addEventListener('keydown', initAudio, { capture: true });

  // ---- environment changes -------------------------------------------------------------------------
  envCtl.onChange((next, prev, opts) => {
    world.onEnv(next, prev);
    if (typeof audio.setEnv === 'function') safe('audio.setEnv', () => audio.setEnv(env));
    save.set('env', next);
    const top = world.top;
    if (top && top.painting && opts.from && top.frame) {      // a painted place: the new season spreads from the gesture
      const f = top.frame; top.painting.washFrom = [f.x + opts.from.sx * f.w, f.y + opts.from.sy * f.h];
    }
    if (!STILL && !opts.instant && !world.trans && top && painted && !top.scene.painted) {
      const g = stage.gg;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'copy';
      g.drawImage(stage.A, 0, 0); g.globalCompositeOperation = 'source-over';
      ghost.on = true; ghost.t = 0; ghost.node = top; ghost.fx = top.frame.x; ghost.fy = top.frame.y; ghost.fw = top.frame.w;
      const at = opts.from || { sx: 0.5, sy: 0.4 };
      ghost.cx = at.sx * stage.W; ghost.cy = at.sy * stage.H;
      ghost.dur = opts.source === 'sun' ? 1.2 : 1.9;
      stage.newBlob((env.version * 7919) >>> 0);
    }
  });

  // ---- rendering -------------------------------------------------------------------------------------
  const vA = { x: 0, y: 0, w: 1, h: 1 }, vB = { x: 0, y: 0, w: 1, h: 1 };
  const frameInfo = { target: canvas, canvas, dpr: 1, t: 0, dt: 0, view: camera.view, scale: 1, width: 1, height: 1, place: '', inst: '', still: STILL, transition: -1, frame: 0 };
  let ctx2d = null;
  function updateFrameInfo() {
    const top = world.top;
    frameInfo.place = top ? top.placeId : ''; frameInfo.inst = top ? top.path : '';
  }

  /** Draw node n showing world rect `frame` into g. zoom about screen point (zx, zy); offX shifts; clip to [x0, x1]. */
  function drawNode(g, n, frame, view, zoom, zx, zy, offX, isTop, clipX0, clipX1) {
    world.ensureBuilt(n);
    const W = stage.W, H = stage.H;
    const s = (W / frame.w) * zoom;
    const shx = isTop ? camera.shakeX * s : 0, shy = isTop ? camera.shakeY * s : 0;
    const tx = -frame.x * s + zx * (1 - zoom) + offX + shx, ty = -frame.y * s + zy * (1 - zoom) + shy;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const clipped = clipX0 > 0 || clipX1 < W;
    g.save();
    if (clipped) { g.beginPath(); g.rect(clipX0, 0, clipX1 - clipX0, H); g.clip(); }
    g.fillStyle = skin.PAPER; g.fillRect(clipX0, 0, clipX1 - clipX0, H);
    g.setTransform(s, 0, 0, s, tx, ty);
    view.x = -tx / s; view.y = -ty / s; view.w = W / s; view.h = H / s;
    view.solo = isTop && clipX0 <= 0 && clipX1 >= W && (!world.trans || world.trans.type === 'glide' || world.trans.type === 'veil');
    g.save();
    try { n.scene.draw(g, env, view); } catch (e) { report('draw ' + n.label.slice(7), e); }
    g.restore();
    if (!n.scene.ownWeather && art.weather && typeof art.weather.draw === 'function') {
      g.save();
      try { art.weather.draw(g, env, view, T); } catch (e) { report('art.weather.draw', e); }
      g.restore();
    }
    if (help.on) help.drawMarks(g, n, view, T, isTop);   // simple edition: the marked ways (over the weather, so fog never hides them)
    else if (isTop) ways.draw(g, n);                      // painted edition: the ways on to the next place (over the weather too)
    if (isTop && !quietNode(n)) fx.draw(g, T, input.list);
    g.restore();
  }

  function render(e, dt) {
    const tr = world.trans, A = stage.a, B = stage.b, W = stage.W, H = stage.H;
    const top0 = world.top;
    fx.art = top0 && top0.painting && art.fx ? art.fx : null;   // a painted place: touch sparks are art's
    if (tr && tr.type === 'veil') {
      // paper washes over from the touch (0..0.5), the view changes, the paper dries away (0.5..1)
      drawNode(A, tr.a, tr.a.frame, vA, 1, 0, 0, 0, true, 0, W);
      const k = e < 0.5 ? easeInOut(e / 0.5) : 1, a = e < 0.5 ? 1 : 1 - easeInOut((e - 0.5) / 0.5);
      const R = k * stage.coverRadius(tr.cx, tr.cy);
      B.setTransform(1, 0, 0, 1, 0, 0); B.globalAlpha = 1; B.globalCompositeOperation = 'copy';
      B.fillStyle = skin.PAPER; B.fillRect(0, 0, W, H); B.globalCompositeOperation = 'source-over';
      stage.paintMask(tr.cx, tr.cy, R);
      stage.applyMask(B, 'destination-in');
      A.setTransform(1, 0, 0, 1, 0, 0); A.globalAlpha = a; A.drawImage(stage.B, 0, 0); A.globalAlpha = 1;
      if (e < 0.5) stage.tideLine(A, tr.cx, tr.cy, R, 0.4 * Math.sin(Math.PI * k));
    } else if (!tr || tr.type === 'glide') {
      const top = world.top;
      if (top) drawNode(A, top, top.frame, vA, 1, 0, 0, 0, true, 0, W);
      if (ghost.on && ghost.node === top && top) {
        ghost.t += dt;
        const k = clamp(ghost.t / ghost.dur, 0, 1);
        if (k >= 1) ghost.on = false;
        else {
          const R = easeInOut(k) * stage.coverRadius(ghost.cx, ghost.cy), sc = W / top.frame.w;
          B.setTransform(1, 0, 0, 1, 0, 0); B.globalAlpha = 1; B.globalCompositeOperation = 'copy';
          B.drawImage(stage.G, (ghost.fx - top.frame.x) * sc, (ghost.fy - top.frame.y) * sc);
          B.globalCompositeOperation = 'source-over';
          stage.paintMask(ghost.cx, ghost.cy, R);
          stage.applyMask(B, 'destination-out');
          A.setTransform(1, 0, 0, 1, 0, 0); A.drawImage(stage.B, 0, 0);
          stage.tideLine(A, ghost.cx, ghost.cy, R, 0.4 * (1 - k));
        }
      }
    } else if (tr.type === 'slide') {
      const off = tr.dir * e * W;
      const ax = -off, bx = tr.dir * W - off;
      drawNode(A, tr.a, tr.fa, vA, 1, 0, 0, ax, true, Math.max(0, ax), Math.min(W, ax + W));
      drawNode(A, tr.b, tr.fb, vB, 1, 0, 0, bx, false, Math.max(0, bx), Math.min(W, bx + W));
      const sx = tr.dir > 0 ? bx : ax, sw = 30 * (W / tr.fa.w);
      A.setTransform(1, 0, 0, 1, 0, 0);
      const gr = A.createLinearGradient(sx - sw, 0, sx + sw, 0);
      gr.addColorStop(0, 'rgba(90,65,40,0)'); gr.addColorStop(0.5, 'rgba(90,65,40,.22)'); gr.addColorStop(1, 'rgba(90,65,40,0)');
      A.fillStyle = gr; A.fillRect(sx - sw, 0, sw * 2, H);
    } else {
      const entering = tr.type !== 'leave';
      const bg = entering ? tr.a : tr.b, fg = entering ? tr.b : tr.a;
      const fbg = entering ? tr.fa : tr.fb, ffg = entering ? tr.fb : tr.fa;
      const zBg = entering ? 1 + (tr.zoom - 1) * e : tr.zoom - (tr.zoom - 1) * e;
      const zFg = entering ? 1.35 - 0.35 * e : 1 + 0.35 * e; // never below 1: no paper past the world's edge shows
      const k = entering ? e : 1 - e;
      drawNode(A, bg, fbg, vA, zBg, tr.cx, tr.cy, 0, true, 0, W);
      drawNode(B, fg, ffg, vB, tr.type === 'fade' ? 1 : zFg, tr.cx, tr.cy, 0, false, 0, W);
      A.setTransform(1, 0, 0, 1, 0, 0);
      if (tr.type === 'fade') {
        A.globalAlpha = k; A.drawImage(stage.B, 0, 0); A.globalAlpha = 1;
      } else {
        const R = k * stage.coverRadius(tr.cx, tr.cy);
        stage.paintMask(tr.cx, tr.cy, R);
        stage.applyMask(B, 'destination-in');
        A.drawImage(stage.B, 0, 0);
        stage.tideLine(A, tr.cx, tr.cy, R, 0.45 * Math.sin(Math.PI * k));
      }
    }
    // present through the art compositor
    frameInfo.dpr = stage.dpr; frameInfo.t = T; frameInfo.dt = dt; frameInfo.scale = stage.scale;
    frameInfo.width = W; frameInfo.height = H; frameInfo.transition = tr && tr.type !== 'glide' ? e : -1; frameInfo.frame++;
    frameInfo.view = camera.view;
    let ok = false;
    if (art.compositor && typeof art.compositor.present === 'function') {
      try { art.compositor.present(stage.A, env, frameInfo); ok = true; } catch (err) { report('art.compositor.present', err); }
    }
    if (!ok) {
      if (!ctx2d) ctx2d = canvas.getContext('2d');
      if (ctx2d) { ctx2d.setTransform(1, 0, 0, 1, 0, 0); ctx2d.drawImage(stage.A, 0, 0); }
    }
    frameNo++;
  }

  // ---- debug meter -------------------------------------------------------------------------------------
  const dbg = DEBUG ? document.getElementById('debug') : null;
  if (dbg) dbg.hidden = false;
  let mN = 0, mSum = 0, mMax = 0, mT = 0, mFrames = 0;
  function meter(ms, dt) {
    mN++; mSum += ms; if (ms > mMax) mMax = ms; mT += dt; mFrames++;
    if (mT < 0.5) return;
    const top = world.top, E = envCtl.energy;
    dbg.textContent = `${(mFrames / mT).toFixed(0)} fps  work ${(mSum / mN).toFixed(1)} ms (max ${mMax.toFixed(1)})  ` +
      `${stage.W}x${stage.H}  ${top ? top.placeId + (top.path ? '/' + top.path : '') + ':' + top.viewId : '-'}  ${env.key} h${env.hour.toFixed(1)}  ` +
      `rain ${E.rain.toFixed(2)} wind ${E.wind.toFixed(2)} fog ${E.fog.toFixed(2)}`;
    mN = 0; mSum = 0; mMax = 0; mT = 0; mFrames = 0;
  }

  // ---- the loop ---------------------------------------------------------------------------------------------
  let raf = 0, last = 0, painted = false;
  function step(dt, draw = true) {
    T += dt;
    envCtl.tick(dt);
    input.tick(dt);
    exits.tick(dt);
    camera.tick(dt, STILL);
    fx.update(dt);
    const e = world.tickTrans(dt);
    world.update(dt, T);
    help.tick(dt);
    ways.tick(dt);
    clouds.tick(dt);
    if (draw) render(e < 0 && world.trans ? 0 : e, dt);
    else if (ghost.on) { ghost.t += dt; if (ghost.t >= ghost.dur) ghost.on = false; }
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const t0 = performance.now();
    const tsec = ts / 1000;
    let dt = last ? Math.min(0.05, Math.max(0, tsec - last)) : 1 / 60;
    last = tsec;
    if ((STILL && painted) || MANUAL) dt = 0;
    try { step(dt); } catch (err) { report('frame', err); }
    painted = true;
    if (dbg) meter(performance.now() - t0, dt || 1 / 60);
  }
  function startLoop() { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopLoop(); input.endAll(); save.flush(); } else startLoop();
  });

  // ---- resize ------------------------------------------------------------------------------------------------
  function relayout() {
    if (stage.resize()) {
      ghost.on = false;
      for (const n of world.stack) camera.place(n);
      if (world.top) camera.attach(world.top);
    }
  }
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(relayout, 120); });

  // ---- keyboard (desktop and tests; the game itself needs none) ---------------------------------------------
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack') { if (back()) e.preventDefault(); return; }
    if (cardUp && (e.key === 'Enter' || e.key === ' ')) { begin(); e.preventDefault(); }
  });

  // ---- fonts, then start ----------------------------------------------------------------------------------------
  try {
    await Promise.race([
      Promise.all([document.fonts.load('20px "IM Fell English"'), document.fonts.load('italic 20px "IM Fell English"')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch (_) { /* system serif it is */ }

  // where to start: ?place= (any place of this edition, test places too), else the saved place, else ORDER[0]. A save or
  // a query that names a place this edition does not have (a placeholder of an earlier build: 'pond', 'town') starts at
  // ORDER[0] quietly, and the query's view and instance (meant for that other place) are dropped with it.
  const at = save.data.at || {};
  const home = ORDER.find((id) => defs[id]) || Object.keys(defs)[0];
  const asked = params.get('place'), askedOk = !!(asked && defs[asked]), queryOk = !asked || askedOk;
  const startPlace = askedOk ? asked : (at.place && defs[at.place] && !EXTRA.includes(at.place) ? at.place : home);
  const startView = (queryOk && params.get('view')) || (startPlace === at.place ? at.view : '') || '';
  cardUp = !SKIP_INTRO;
  world.jump(startPlace, (queryOk && params.get('inst')) || '', startView);
  if (params.has('fill')) {   // tests: ?fill=<n> grows n things at once into every grow layer of the first view (a full meadow)
    const nF = params.num('fill', 300), t = world.top, f = t && t.frame;
    if (f) for (const L of t.growLayers || []) for (let i = 0; i < nF; i++) L.add(0, f.x + 60 + Math.random() * (f.w - 120), f.y + f.h * (0.78 + 0.2 * Math.random()), { delay: Math.random() * 1.5 });
  }

  // ---- the opening: the title, and one touch anywhere goes in (it also wakes the sound) -------------------------
  const card = document.getElementById('card');
  function begin() {
    if (!cardUp) return;
    initAudio(); sound('begin');
    card.classList.add('gone'); setTimeout(() => { card.hidden = true; }, 1100);
    cardUp = false;
    help.begin();                                   // first visit: the hints, once
    ways.arrive(world.top);                         // the ways come up now, not under the title
  }
  if (!SKIP_INTRO) {
    card.hidden = false;
    card.addEventListener('pointerdown', (e) => {
      const W = stage.cssW, H = stage.cssH, f = world.top && world.top.frame;
      if (f) { const x = f.x + (e.clientX / W) * f.w, y = f.y + (e.clientY / H) * f.h; fx.ring(x, y, 1.4, 2); fx.sparkle(x, y, 14, 1.2); }
      begin();
    });
  } else { card.hidden = true; if (params.flag('hints')) help.begin(); }

  // ---- test hooks ---------------------------------------------------------------------------------------------------
  const QG = {
    /** "painted" (index.html) or "simple" (simple.html) */
    edition: EDITION,
    engine: { env, envCtl, world, camera, stage, save, art, audio, skin, fx, input, gestures, exits, ways, defs, ORDER, SECRET, get t() { return T; } },
    /** jump straight to a place (instance path "a/b", view id), no transition */
    go(place, inst, view) { return world.jump(place, inst || '', view || ''); },
    /** set the environment; instant unless opts.animate; the weather holds until changed (tests) */
    env(state, opts = {}) { return env.set(state || {}, { instant: !opts.animate, hold: opts.hold !== false }); },
    /** a tap at world (x, y) in the current scene, routed like a finger */
    tap(x, y) { return input.tapAt(x, y); },
    back,
    /** walk to another view of the place shown */
    walk(viewId, opts) { return world.walk(viewId, opts || {}); },
    /** run the clock forward by `sec` seconds in 1/60 s steps (useful with ?manual=1 or ?still=1) */
    advance(sec = 1) { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) { try { step(1 / 60, i === n - 1); } catch (err) { report('advance', err); } } },
    /** there are no panels any more; kept so older tools still run */
    open() { return false },
    close() { return back(); },
    begin,
    /** help (simple edition): open() / close() the card, the hint shown, the marks drawn last frame */
    /** the ways on to the next place (painted edition): on, the level now (0..1), the marks drawn last frame, and list():
     *  every exit of the view shown with whether it is marked, where its mark stands and how much of it the screen shows */
    ways: { get on() { return ways.on; }, get level() { return ways.level; }, get marks() { return ways.marks.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y), to: m.to, moved: m.moved })); }, list: () => ways.list() },
    help: { open: () => help.open(), close: () => help.close(), get on() { return help.on; }, get card() { return help.cardOpen; }, get hint() { return help.hint && help.hint.key; }, get marks() { return help.marks.map((m) => ({ x: m.x, y: m.y, to: m.e.to || '', view: m.e.view || '' })); } },
    get view() { return { ...camera.view }; },
    get place() { const t = world.top; return t ? { place: t.placeId, inst: t.path, view: t.viewId } : null; },
    /** how many grown things each grow layer of the scene shown holds */
    get grown() { const t = world.top; return t && t.growLayers ? t.growLayers.map((l) => l.count) : t && t.painting ? t.painting.grown.filter((f) => f.view === t.viewId).map((f) => f.stats.n) : []; },
    /** false while a painted place's paintings are still loading (wait for it before a screenshot) */
    get settled() { const t = world.top; return !world.trans && !!t && (!t.scene.settled || t.scene.settled()); },
    /** where the sun and moon were drawn ({sx, sy, sr} screen fractions; fresh: drawn in the last frames) */
    /** the engine's cloud icon ({sx, sy} its screen centre 0..1, w css px) or null (not shown here) */
    get cloud() { return clouds.own; },
    get orbs() { const f = (o) => ({ sx: o.sx, sy: o.sy, sr: o.sr, fresh: o.frame >= frameNo - 3 }); return { sun: f(shown.sun), moon: f(shown.moon) }; },
    get sky() { return { hour: env.hour, time: env.time, weather: env.weather, season: env.season, ...envCtl.energy, windy: env.windy, wet: env.wet, snowy: env.snowy, foggy: env.foggy }; },
  };
  Object.defineProperty(window, 'QG', { value: QG, configurable: true });

  startLoop();
}

boot().catch((e) => { report('boot', e); });
