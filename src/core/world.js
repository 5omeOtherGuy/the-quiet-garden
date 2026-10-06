// World: places, their still views and instances as a stack of scene nodes; walking between views, places and
// instances with gentle transitions; and the `engine` services object each scene receives (owner: engine).
// See docs/ENGINE.md.

import { rng, safe, report, easeInOut, clamp, hash } from './util.js';
import { normaliseViews } from './camera.js';

const WAIT = 3; // seconds a transition waits at most for a painted place's paintings
const KEEP_BUILT = 4; // places whose static paint stays in memory (the most recent ones)

export function createWorld(o) {
  // o: {defs, secret, stage, camera, env, save, art, audio, fx, now, still, seed, reduce, sound(name),
  //     services(node) -> extra engine fields, hooks: {arrive(node, how), stackChanged(), before()}}
  const { stage, camera, env, save, fx } = o;
  const nodes = new Map(); // place id -> node
  const recent = [];
  const sessionRand = rng(o.seed);
  const timers = [];       // engine.after: {t, fn, node}, on the engine clock, kept while a node is off screen

  const W = {
    stack: [],
    trans: null,
    get top() { return W.stack[W.stack.length - 1] || null; },
    get place() { return W.stack[0] || null; },
  };

  // ------------------------------------------------------------------------------------------
  // nodes and their engine services

  function makeNode(def, placeId, parent, instId) {
    const n = {
      kind: parent ? 'inst' : 'place',
      id: instId || def.id, def, placeId, parent,
      path: parent ? (parent.path ? parent.path + '/' : '') + instId : '',
      world: { w: Math.max(400, +(def.world && def.world.w) || 2000), h: Math.max(400, +(def.world && def.world.h) || 1000) },
      views: null, viewId: '', frame: null,
      from: null, children: {}, scene: null, builtKey: null, errors: 0, engine: null, listeners: Object.create(null),
      music: def.music || (parent ? parent.music : null),
      again: new Map(),
    };
    n.label = `update ${placeId}${n.path ? '/' + n.path : ''}`;
    n.engine = makeEngine(n);
    try {
      n.scene = def.create(n.engine) || {};
    } catch (e) {
      report(`create ${placeId}${n.path ? '/' + n.path : ''}`, e);
      n.scene = restingScene(def);
    }
    if (o.wrapScene) n.scene = o.wrapScene(n, n.scene) || n.scene;
    if (typeof n.scene.draw !== 'function') n.scene.draw = restingScene(def).draw;
    n.views = normaliseViews(def, n.scene, n.world);
    const first = def.view || n.scene.view;
    n.viewId = n.views[first] ? first : Object.keys(n.views)[0];
    camera.place(n);
    return n;
  }

  function makeEngine(n) {
    const eng = {
      env,
      art: o.art,
      audio: o.audio,
      save: save.place(n.placeId),
      enter: (instId, opts) => W.enter(instId, opts, n),
      leave: () => (W.top === n ? W.leave() : false),
      camera: {
        shake(a) { if (W.top === n) camera.shake(a); },
        get view() { return n.frame || camera.view; },
      },
      /** the id of the view shown; engine.walk(viewId) goes to another view of this place */
      get view() { return n.viewId; },
      walk: (viewId, opts) => W.walk(viewId, opts, n),
      rand: (seed) => rng(seed),
      random: sessionRand,
      seed: o.seed,
      now: o.now,
      travel: (id, opts = {}) => W.travel(id, { mode: 'bloom', ...opts }),
      sparkle: (x, y, count = 6, spread = 1) => { if (W.top === n) fx.sparkle(x, y, count, spread); },
      /**
       * Call fn after `sec` seconds of the engine clock, even if this place is not on screen by then (renewal:
       * the apple grows back while the child is elsewhere). Returns a cancel function.
       */
      after(sec, fn) {
        const t = { t: o.now() + Math.max(0, +sec || 0), fn, node: n };
        timers.push(t);
        return () => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); };
      },
      /**
       * How many times `key` was touched before, fading with `memory` seconds (0 = fresh, 1 = just touched once...).
       * Counts this touch too, so a creature can answer differently each time: first it bolts, later it flicks an ear.
       */
      again(key, memory = 30) {
        const now = o.now(), m = n.again.get(key);
        let c = 0;
        if (m) c = m.c * Math.exp(-(now - m.t) / Math.max(1, memory));
        n.again.set(key, { c: c + 1, t: now });
        return c;
      },
      get place() { return n.placeId; },
      get id() { return n.id; },
      get path() { return n.path; },
      get pxPerUnit() { return stage.scale; },
      get active() { return W.top === n && !W.trans; },
      get still() { return o.still; },
      get reducedMotion() { return o.reduce; },
      /** the child has been in the secret Raven's Nook before (for the mountains; never shown anywhere) */
      get secretKnown() { return !!save.data.secretKnown; },
    };
    if (o.services) Object.defineProperties(eng, Object.getOwnPropertyDescriptors(o.services(n)));
    return eng;
  }

  /** A calm placeholder when a place fails to load or create. */
  function restingScene(def) {
    return {
      draw(g, env, view) {
        const gr = g.createLinearGradient(0, view.y, 0, view.y + view.h);
        gr.addColorStop(0, env.light > 0.3 ? '#dfe7e4' : '#3a4560'); gr.addColorStop(1, '#efe5d0');
        g.fillStyle = gr; g.fillRect(view.x, view.y, view.w, view.h);
      },
    };
  }

  W.placeNode = function (id) {
    let n = nodes.get(id);
    if (!n) {
      const def = o.defs[id];
      if (!def) return null;
      n = makeNode(def, id, null, null);
      nodes.set(id, n);
    }
    return n;
  };

  function childNode(parent, instId) {
    if (parent.children[instId]) return parent.children[instId];
    const insts = parent.scene && parent.scene.instances;
    const def = insts && insts[instId];
    if (!def || typeof def.create !== 'function') { report('enter', new Error(`no instance "${instId}" in ${parent.placeId}${parent.path ? '/' + parent.path : ''}`)); return null; }
    if (!def.id) def.id = instId;
    const n = makeNode(def, parent.placeId, parent, instId);
    parent.children[instId] = n;
    return n;
  }

  W.ensureBuilt = function (n) {
    const key = stage.sizeKey + '@' + stage.scale.toFixed(4);
    if (n.builtKey === key && n.builtVer === env.version) return;
    n.builtKey = key; n.builtVer = env.version;
    if (typeof n.scene.build === 'function') safe(`build ${n.placeId}${n.path ? '/' + n.path : ''}`, () => n.scene.build(env));
  };

  function freeNode(n) {
    for (const k in n.children) freeNode(n.children[k]);
    if (n.builtKey && typeof n.scene.free === 'function') safe('free', () => n.scene.free());
    if (n.growLayers) for (const l of n.growLayers) safe('grow free', () => l.free());   // their canvases go too; what grew stays
    n.builtKey = null;
  }
  function touchRecent(id) {
    const i = recent.indexOf(id); if (i >= 0) recent.splice(i, 1);
    recent.unshift(id);
    while (recent.length > KEEP_BUILT) {
      const old = recent.pop(), n = nodes.get(old);
      if (n && !W.stack.includes(n) && !(W.trans && (W.trans.a === n || W.trans.b === n))) freeNode(n);
    }
  }

  function call(n, fn, ...a) {
    if (n && n.scene && typeof n.scene[fn] === 'function') safe(`${fn} ${n.placeId}${n.path ? '/' + n.path : ''}`, () => n.scene[fn](...a));
  }
  function setAudioPlace(n) {
    const au = o.audio;
    if (au && typeof au.setPlace === 'function') safe('audio.setPlace', () => au.setPlace(n.music || {}, env, n.placeId));
  }
  function setView(n, viewId) {
    if (viewId && n.views[viewId]) n.viewId = viewId;
    camera.place(n);
  }

  // ------------------------------------------------------------------------------------------
  // walking around

  function screenOf(frame, x, y) {
    return { cx: ((x - frame.x) / frame.w) * stage.W, cy: ((y - frame.y) / frame.h) * stage.H };
  }
  function seedOf(s) { return (hash(s) + Math.floor(o.now() * 10)) >>> 0; }

  /**
   * Walk to another view of node n (the top). opts.at = {sx, sy} screen point the walk starts from.
   * Views side by side glide like a few steps; views far apart wash over from the touch.
   */
  W.walk = function (viewId, opts = {}, n = W.top) {
    if (W.trans || !n || n !== W.top || !n.views[viewId] || viewId === n.viewId) return false;
    o.hooks.before();
    const a = { ...n.frame }, b = camera.frameOf(n.views[viewId]);
    const far = Math.abs(b.x - a.x) > a.w * 1.6 || Math.abs(b.y - a.y) > a.h * 1.6 || Math.abs(b.w - a.w) > a.w * 0.3;
    if (o.still || opts.instant) { setView(n, viewId); camera.attach(n); call(n, 'view', viewId); o.hooks.arrive(n, 'view'); return true; }
    const at = opts.at || { sx: 0.5, sy: 0.6 };
    if (n.scene.painted) {
      // a painted place holds one view's paintings at a time: paper washes over, the view changes, the paper dries away
      W.trans = {
        type: 'veil', a: n, b: n, t: 0, dur: 1.2, cx: at.sx * stage.W, cy: at.sy * stage.H, mid: false, waited: 0,
        swap() { setView(n, viewId); camera.attach(n); call(n, 'view', viewId); },
        done() { o.hooks.stackChanged(); o.hooks.arrive(n, 'view'); },
      };
      stage.newBlob(seedOf(viewId));
      o.hooks.stackChanged();
      return true;
    }
    if (!far && !o.reduce && opts.mode !== 'bloom') {
      const gl = camera.glide(n, viewId, opts.dur || 1.15);
      W.trans = { type: 'glide', a: n, b: n, t: 0, dur: 99, done() {} };
      gl.done = () => { W.trans = null; camera.attach(n); call(n, 'view', viewId); o.hooks.stackChanged(); o.hooks.arrive(n, 'view'); };
      o.hooks.stackChanged();
      return true;
    }
    n.viewId = viewId;
    W.trans = {
      type: o.reduce ? 'fade' : 'bloom', a: n, b: n, fa: a, fb: b, t: 0, dur: o.reduce ? 0.7 : 1.25,
      cx: at.sx * stage.W, cy: at.sy * stage.H, zoom: 1.12,
      done() { setView(n, viewId); camera.attach(n); call(n, 'view', viewId); o.hooks.stackChanged(); o.hooks.arrive(n, 'view'); },
    };
    stage.newBlob(seedOf(viewId));
    o.hooks.stackChanged();
    return true;
  };

  /**
   * Travel to a place. opts.view: the view to arrive in; opts.mode: 'bloom' (from opts.at = {sx, sy} 0..1),
   * 'slide' (opts.dir -1|1, as if walking off one side) or 'instant'. False if a transition runs or the place is unknown.
   */
  W.travel = function (id, opts = {}) {
    if (W.trans) return false;
    const cur = W.place;
    const b = W.placeNode(id);
    if (!b) return false;
    if (cur === b && W.stack.length === 1) return opts.view ? W.walk(opts.view, opts, b) : false;
    o.hooks.before();
    const a = W.top;
    let mode = opts.mode || 'bloom';
    if (!a || o.still || mode === 'instant') mode = 'instant';
    else if (o.reduce) mode = 'fade';
    setView(b, opts.view || b.viewId);
    for (let i = W.stack.length - 1; i >= 0; i--) call(W.stack[i], 'leave');
    if (o.secret && id === o.secret && !save.data.secretKnown) save.set('secretKnown', true);   // no secret place: never
    touchRecent(id);
    const fa = a ? { ...a.frame } : null;
    camera.place(b);
    W.ensureBuilt(b);
    call(b, 'enter');
    setAudioPlace(b);
    if (mode === 'instant') {
      W.stack = [b]; camera.attach(b); o.hooks.stackChanged(); o.hooks.arrive(b, 'travel');
      return true;
    }
    const at = opts.at || { sx: 0.5, sy: 0.5 };
    W.trans = {
      type: mode === 'slide' ? 'slide' : mode === 'fade' ? 'fade' : 'bloom',
      a, b, fa, fb: { ...b.frame }, t: 0, dur: mode === 'slide' ? 1.15 : mode === 'fade' ? 0.7 : 1.3, dir: opts.dir || 1,
      cx: at.sx * stage.W, cy: at.sy * stage.H, zoom: 1.2,
      done() { W.stack = [b]; camera.attach(b); o.hooks.stackChanged(); o.hooks.arrive(b, 'travel'); },
    };
    stage.newBlob(seedOf(id));
    o.hooks.stackChanged();
    return true;
  };

  /** Enter an instance of node `from` (must be the top). opts.from = {x, y} world point in the parent; opts.view. */
  W.enter = function (instId, opts = {}, from = W.top) {
    if (W.trans || !from || from !== W.top) return false;
    const b = childNode(from, instId);
    if (!b) return false;
    o.hooks.before();
    const f = from.frame;
    const p = opts.from || { x: f.x + f.w / 2, y: f.y + f.h / 2 };
    b.from = { x: p.x, y: p.y };
    setView(b, opts.view || b.viewId);
    if (o.sound) o.sound('enter');
    W.ensureBuilt(b);
    call(from, 'pause');
    call(b, 'enter');
    setAudioPlace(b);
    if (o.still || opts.instant) {
      W.stack.push(b); camera.attach(b); o.hooks.stackChanged(); o.hooks.arrive(b, 'enter');
      return true;
    }
    const s = screenOf(f, p.x, p.y);
    W.trans = {
      type: o.reduce ? 'fade' : 'enter', a: from, b, fa: { ...f }, fb: { ...b.frame }, t: 0, dur: o.reduce ? 0.6 : 1.2, dir: 1,
      cx: s.cx, cy: s.cy, zoom: 1.9,
      done() { W.stack.push(b); camera.attach(b); o.hooks.stackChanged(); o.hooks.arrive(b, 'enter'); },
    };
    stage.newBlob(seedOf(instId));
    o.hooks.stackChanged();
    return true;
  };

  /** Leave the current instance back to its parent. Returns false at a place's top level. */
  W.leave = function (opts = {}) {
    if (W.trans || W.stack.length < 2) return false;
    o.hooks.before();
    const a = W.top, b = W.stack[W.stack.length - 2];
    if (o.sound) o.sound('leave');
    call(a, 'leave');
    call(b, 'resume');
    setAudioPlace(b);
    camera.place(b);
    W.ensureBuilt(b);
    if (o.still || opts.instant) {
      W.stack.pop(); camera.attach(b); o.hooks.stackChanged(); o.hooks.arrive(b, 'leave');
      return true;
    }
    const f = a.from || { x: b.frame.x + b.frame.w / 2, y: b.frame.y + b.frame.h / 2 };
    const s = screenOf(b.frame, f.x, f.y);
    W.trans = {
      type: o.reduce ? 'fade' : 'leave', a, b, fa: { ...a.frame }, fb: { ...b.frame }, t: 0, dur: o.reduce ? 0.6 : 1.0, dir: -1,
      cx: s.cx, cy: s.cy, zoom: 1.9,
      done() { W.stack.pop(); camera.attach(b); o.hooks.stackChanged(); o.hooks.arrive(b, 'leave'); },
    };
    stage.newBlob(seedOf(a.id));
    o.hooks.stackChanged();
    return true;
  };

  /** Build a stack directly (URL params and QG.go): place, instance path "a/b", and the view of the top. */
  W.jump = function (placeId, instPath, viewId) {
    if (W.trans) { const t = W.trans; W.trans = null; t.done(); }
    const b = W.placeNode(placeId);
    if (!b) return false;
    for (let i = W.stack.length - 1; i >= 0; i--) call(W.stack[i], 'leave');
    touchRecent(placeId);
    W.ensureBuilt(b);
    call(b, 'enter');
    W.stack = [b];
    let top = b;
    if (instPath) {
      for (const id of String(instPath).split('/').filter(Boolean)) {
        const c = childNode(top, id);
        if (!c) break;
        c.from = { x: top.frame.x + top.frame.w / 2, y: top.frame.y + top.frame.h / 2 };
        W.ensureBuilt(c);
        call(top, 'pause');
        call(c, 'enter');
        W.stack.push(c); top = c;
      }
    }
    if (viewId) setView(top, viewId);
    camera.attach(top);
    setAudioPlace(top);
    o.hooks.stackChanged();
    o.hooks.arrive(top, 'jump');
    return true;
  };

  /** Advance a running transition. Returns eased progress, or -1 if none. */
  W.tickTrans = function (dt) {
    const tr = W.trans; if (!tr) return -1;
    if (tr.type === 'glide') return -1; // the camera runs it
    // a painted scene being arrived in may still be loading its paintings: wait for them (at most WAIT seconds)
    const to = tr.type === 'veil' ? (tr.mid ? tr.b : null) : tr.b;
    const hold = to && to.scene.settled && !to.scene.settled() && (tr.waited || 0) < WAIT;
    if (tr.type === 'veil') {
      if (!tr.mid && tr.t + dt / tr.dur >= 0.5) { tr.t = 0.5; tr.mid = true; tr.swap(); return 0.5; }
      if (tr.mid && tr.t <= 0.5 && hold) { tr.waited = (tr.waited || 0) + dt; return 0.5; }
    } else if (tr.t === 0 && hold) { tr.waited = (tr.waited || 0) + dt; return 0; }
    tr.t = clamp(tr.t + dt / tr.dur, 0, 1);
    if (tr.t >= 1) { W.trans = null; tr.done(); return -1; }
    return tr.type === 'veil' ? tr.t : easeInOut(tr.t);
  };

  // hot path: no closures or rest arrays per frame
  function updateNode(n, dt, t) {
    const sc = n && n.scene;
    if (!sc || typeof sc.update !== 'function') return;
    try { sc.update(dt, env, t); } catch (e) { report(n.label, e); }
  }
  W.update = function (dt, t) {
    const tr = W.trans;
    if (tr && tr.a !== tr.b) { updateNode(tr.a, dt, t); updateNode(tr.b, dt, t); } else updateNode(W.top, dt, t);
    // timers on the engine clock
    for (let i = timers.length - 1; i >= 0; i--) {
      const tm = timers[i];
      if (t >= tm.t) { timers.splice(i, 1); safe(`after ${tm.node.placeId}`, tm.fn); }
    }
  };

  /** env change started: tell every live scene, rebuild lazily. */
  W.onEnv = function (next, prev) {
    const seen = new Set();
    const tell = (n) => { if (n && !seen.has(n)) { seen.add(n); call(n, 'onEnv', next, prev); } };
    W.stack.forEach(tell);
    if (W.trans) { tell(W.trans.a); tell(W.trans.b); }
  };

  W.nodes = nodes;
  return W;
}
