// Grow layers (owner: engine; docs/ENGINE.md "Grow layers"): thousands of small grown things (flowers along a
// stroke, fallen leaves, shells, footprints in snow) that stay at 120 fps, are quietly remembered, and fade away by
// themselves after a while so the picture never fills up and can always be grown again.
//
//   const bloom = engine.grow({
//     max: 120, keep: 20, rest: 30, thin: 3,        // the owner's rule (BRIEF 15, 20): at most `max` things (the oldest
//                                                   // wilts to make room); `rest` s after the last add, one wilts every
//                                                   // `thin` s, oldest first, down to `keep`. Ceiling: max 150, keep 30.
//     patch: Infinity,                              // `rest` counts from the last add within `patch` world units of a
//                                                   // thing (Infinity: any add anywhere in the layer). Edition defaults
//                                                   // (BRIEF 23): simple keep 10, rest 15, thin 0.7, patch 300.
//     kinds: { daisy: { w: 36, h: 54, ax: 0.5, ay: 1, variants: 4, paint(g, w, h, v, env) {...} } },
//     life: [240, 600],                             // upper bound: seconds a thing stays at most (random in range)
//     grow: 0.45, wilt: 2.4,                        // seconds to grow in and to wilt away
//     remember: 'meadow',                           // save key (per place), or null; comes back with at most `keep`
//     look: (env) => env.season,                    // when this changes, every sprite is painted again
//   });
//   bloom.add('daisy', x, y, { scale, variant, delay, fall: { to: groundY, vx }, life }) -> index or -1
//   bloom.draw(g, view)        call from scene.draw where the things belong (world-transformed context)
//   bloom.near(x, y, r)        how many things are within r (to keep a trail from piling up)
//   bloom.wilt(x, y, r)        let things within r wilt now (frost, a stamping foot); bloom.wiltAll(fraction)
//   bloom.count, bloom.clear(), bloom.free() (the engine calls it when the place is put away; canvases go, things stay)
//
// Why the ceiling: the owner saw the screen flicker and lose its other things when a view was full of grown things
// (BRIEF 20). Few things also keep every redraw cheap: the whole bake is rebuilt within one frame (BUDGET) and resting
// things never wait for the bake (LIVE_CAP), so nothing blinks.
// How it stays fast: each kind is painted once per scale into a small atlas; a thing is drawn live only while it
// grows, falls or wilts; once it rests it is stamped into a baked canvas of the view, so resting things cost nothing
// per frame. Wilted things leave the bake through a progressive rebuild spread over a few frames.

import { clamp, rng, makeCanvas, report } from './util.js';

const FREE = 0, WAIT = 1, GROW = 2, FALL = 3, REST = 4, DOOMED = 5, WILT = 6;
const BUDGET = 260;       // things stamped into the back bake per frame while rebuilding
const LIVE_CAP = 700;     // resting things not yet baked drawn live per frame at most (they show once baked)

const MAX_CEIL = 150, KEEP_CEIL = 30;   // what a place may ask for at most, per layer
const HEADROOM = 96;                     // pool slots for things that are wilting away while new ones grow

const backOut = (k) => { const c = 1.9; const t = k - 1; return 1 + (c + 1) * t * t * t + c * t * t; };

export function createGrowLayer(o, ctx) {
  // ctx: {now(), stage, env, target() -> the frame (world rect) of the view being shown, store (engine.save), onFlush(fn),
  //       defaults: the edition's {max, keep, rest, thin, patch}}
  const D = { max: 120, keep: 20, rest: 30, thin: 3, patch: Infinity, ...(ctx.defaults || {}) };
  const limit = clamp(Math.floor(o.max ?? D.max), 1, MAX_CEIL);         // things standing at once
  const keepN = Math.min(limit, clamp(Math.floor(o.keep ?? D.keep), 0, KEEP_CEIL));
  const restS = Math.max(1, o.rest ?? D.rest), thinS = Math.max(0.2, o.thin ?? D.thin);
  const patchR = Math.max(1, o.patch ?? D.patch), patch2 = patchR * patchR, everywhere = !Number.isFinite(patchR);
  const max = limit + HEADROOM;                                            // pool size
  let lastAdd = -1e9, nextThin = -1e9;
  const kindNames = Object.keys(o.kinds || {});
  const kinds = kindNames.map((k) => ({ name: k, w: 40, h: 40, ax: 0.5, ay: 1, variants: 1, scale: 1.4, ...o.kinds[k] }));
  const kindIndex = Object.fromEntries(kindNames.map((k, i) => [k, i]));
  const life0 = Array.isArray(o.life) ? o.life[0] : Number.isFinite(o.life) ? o.life : 300;
  const life1 = Array.isArray(o.life) ? o.life[1] : life0;
  const growT = o.grow ?? 0.45, wiltT = o.wilt ?? 2.4;
  const look = typeof o.look === 'function' ? o.look : (env) => env.season;
  const R = rng(o.seed || o.remember || 'grow');

  const X = new Float32Array(max), Y = new Float32Array(max), S = new Float32Array(max), Kd = new Uint8Array(max), V = new Uint8Array(max);
  const B = new Float64Array(max), L = new Float32Array(max), ST = new Uint8Array(max), T0 = new Float64Array(max), G = new Int32Array(max).fill(-1);
  const FY = new Float32Array(max), VX = new Float32Array(max), VY = new Float32Array(max), ROT = new Float32Array(max);
  const PA = new Float64Array(max);   // the last add within `patch` of each thing (its patch's rest counts from here)
  const freeList = new Int32Array(max); let nFree = max;
  for (let i = 0; i < max; i++) freeList[i] = max - 1 - i;
  let live = 0, doomed = 0, lastT = -1, scanAt = 0, changed = false;

  // atlases
  let atlasKey = '', atlasScale = 0;
  const atlas = kinds.map(() => ({ c: null, cw: 0, ch: 0 }));
  function paintAtlas(scale) {
    for (let k = 0; k < kinds.length; k++) {
      const kd = kinds[k], A = atlas[k];
      const s = scale * kd.scale;
      A.cw = Math.max(2, Math.ceil(kd.w * s) + 2); A.ch = Math.max(2, Math.ceil(kd.h * s) + 2);
      A.c = A.c || makeCanvas(1, 1);
      A.c.width = A.cw * kd.variants; A.c.height = A.ch;
      const g = A.c.getContext('2d');
      for (let v = 0; v < kd.variants; v++) {
        g.setTransform(s, 0, 0, s, v * A.cw + 1, 1);
        g.save();
        try { kd.paint(g, kd.w, kd.h, v, ctx.env); } catch (e) { report(`grow paint ${kd.name}`, e); }
        g.restore();
      }
    }
    atlasScale = scale;
  }

  // bakes
  const mk = () => ({ c: makeCanvas(1, 1), g: null, x: 0, y: 0, w: 0, h: 0, s: 0, gen: -1, ok: false });
  let front = mk(), back = mk();
  front.g = front.c.getContext('2d'); back.g = back.c.getContext('2d');
  let gen = 0, building = false, order = null, cursor = 0, wantKey = '', frontKey = '', buildKey = '', lastRebuild = -9;

  function sizeBake(b, f, scale) {
    const m = 0.04;
    b.x = f.x - f.w * m; b.y = f.y - f.h * m; b.w = f.w * (1 + 2 * m); b.h = f.h * (1 + 2 * m);
    const cap = Math.sqrt((ctx.stage.W * ctx.stage.H * 1.2) / Math.max(1, b.w * b.h * scale * scale));
    b.s = scale * Math.min(1, cap);
    const W = Math.ceil(b.w * b.s), H = Math.ceil(b.h * b.s);
    if (b.c.width !== W || b.c.height !== H) { b.c.width = W; b.c.height = H; } else { b.g.setTransform(1, 0, 0, 1, 0, 0); b.g.clearRect(0, 0, W, H); }
    b.g.setTransform(b.s, 0, 0, b.s, -b.x * b.s, -b.y * b.s);
  }
  const inBake = (b, i) => X[i] >= b.x && X[i] <= b.x + b.w && Y[i] >= b.y - 200 && Y[i] <= b.y + b.h + 200;
  function stamp(b, i) {
    const kd = kinds[Kd[i]], A = atlas[Kd[i]], sc = S[i];
    const dw = kd.w * sc, dh = kd.h * sc;
    b.g.drawImage(A.c, V[i] * A.cw, 0, A.cw, A.ch, X[i] - kd.ax * dw, Y[i] - kd.ay * dh, A.cw * sc / (atlasScale * kd.scale), A.ch * sc / (atlasScale * kd.scale));
  }
  function startBuild(f, scale) {
    building = true; gen++; back.gen = gen; cursor = 0; buildKey = wantKey;
    sizeBake(back, f, scale);
    const idx = [];
    for (let i = 0; i < max; i++) if (ST[i] === REST && inBake(back, i)) idx.push(i);
    idx.sort((a, b) => Y[a] - Y[b]);
    order = idx;
  }
  function stepBuild() {
    const end = Math.min(order.length, cursor + BUDGET);
    for (; cursor < end; cursor++) { const i = order[cursor]; if (ST[i] === REST) { stamp(back, order[cursor]); G[i] = back.gen; } }
    if (cursor >= order.length) {
      const t = front; front = back; back = t; front.ok = true; building = false; order = null; frontKey = buildKey;
      const now = ctx.now();
      if (doomed) for (let i = 0; i < max; i++) if (ST[i] === DOOMED) { ST[i] = WILT; T0[i] = now; doomed--; }
      lastRebuild = now;
    }
  }

  function alloc() {
    if (standing() >= limit) wiltOldest();   // full: the oldest makes room
    if (nFree === 0) return -1;
    return freeList[--nFree];
  }
  /** things that stand (not wilting, not already doomed) */
  function standing() { let n = 0; for (let i = 0; i < max; i++) { const s = ST[i]; if (s !== FREE && s !== WILT && s !== DOOMED) n++; } return n; }
  /** the oldest standing thing begins to wilt (softly, as when its life is over) */
  function wiltOldest() {
    let j = -1;
    for (let i = 0; i < max; i++) { const s = ST[i]; if (s === FREE || s === WILT || s === DOOMED) continue; if (j < 0 || B[i] < B[j]) j = i; }
    if (j < 0) return;
    if (ST[j] === REST && G[j] === front.gen && front.ok) { ST[j] = DOOMED; doomed++; } else { ST[j] = WILT; T0[j] = ctx.now(); }
    changed = true;
  }
  /** the oldest standing thing whose patch has rested since time t, or -1 */
  function oldestRested(t) {
    let j = -1;
    for (let i = 0; i < max; i++) {
      const s = ST[i]; if (s === FREE || s === WILT || s === DOOMED) continue;
      if ((everywhere ? lastAdd : PA[i]) + restS > t) continue;
      if (j < 0 || B[i] < B[j]) j = i;
    }
    return j;
  }
  /** when the first standing thing's patch is rested (Infinity: none stands) */
  function firstRest() {
    if (everywhere) return lastAdd + restS;
    let m = Infinity;
    for (let i = 0; i < max; i++) { const s = ST[i]; if (s !== FREE && s !== WILT && s !== DOOMED && PA[i] < m) m = PA[i]; }
    return m + restS;
  }
  function thinTo(now) {
    if (standing() <= keepN) { nextThin = -1e9; return; }
    const first = Math.max(firstRest(), now - thinS * (max + 1));
    if (first > now) return;
    if (nextThin < first) nextThin = first;
    while (nextThin <= now && standing() > keepN) {
      const j = oldestRested(nextThin);
      if (j < 0) { const f = firstRest(); if (f <= nextThin) break; nextThin = f; continue; }
      wiltAt(j); nextThin += thinS;
    }
  }
  function wiltAt(j) {
    if (ST[j] === REST && G[j] === front.gen && front.ok) { ST[j] = DOOMED; doomed++; } else { ST[j] = WILT; T0[j] = ctx.now(); }
    changed = true;
  }
  function release(i) { ST[i] = FREE; G[i] = -1; freeList[nFree++] = i; live--; changed = true; }
  // memory
  const store = ctx.store, key = o.remember ? `grow:${o.remember}` : null;
  function encode() {
    const now = ctx.now(), out = [], idx = [];
    for (let i = 0; i < max; i++) { const s = ST[i]; if (s !== FREE && s !== WILT && s !== DOOMED) idx.push(i); }
    idx.sort((a, b) => B[b] - B[a]);                 // the youngest `keep` are remembered
    for (const i of idx.slice(0, keepN)) {
      const s = ST[i];
      out.push(Kd[i] * 64 + V[i], Math.round(X[i]), Math.round(s === FALL ? FY[i] : Y[i]), Math.round(S[i] * 100), Math.round(Math.max(0, now - B[i])), Math.round(L[i]));
    }
    return { at: Math.round(Date.now() / 1000), names: kindNames, d: out };
  }
  function decode(m) {
    if (!m || !Array.isArray(m.d)) return;
    const gap = Math.max(0, Date.now() / 1000 - (+m.at || 0)), now = ctx.now();
    const map = (m.names || []).map((nm) => (nm in kindIndex ? kindIndex[nm] : -1));
    let n = 0;
    for (let j = 0; j + 5 < m.d.length && n < keepN; j += 6) {
      const kv = m.d[j], k = map[Math.floor(kv / 64)];
      if (k === undefined || k < 0) continue;
      const age = m.d[j + 4] + gap, life = m.d[j + 5];
      if (age >= life) continue;
      const i = alloc(); if (i < 0) return;
      X[i] = m.d[j + 1]; Y[i] = m.d[j + 2]; S[i] = m.d[j + 3] / 100; Kd[i] = k; V[i] = Math.min(kinds[k].variants - 1, kv % 64);
      B[i] = now - age; L[i] = life; ST[i] = REST; T0[i] = now; G[i] = -1; PA[i] = now; live++; n++;
    }
    lastAdd = now;
  }
  if (key && store) {
    try { decode(store.get(key, null)); } catch (e) { report('grow memory', e); }
    if (ctx.onFlush) ctx.onFlush(() => { if (changed) { store.put(key, encode()); changed = false; } });
  }

  const layer = {
    /** things standing now (growing, falling or resting; not the ones wilting away) */
    get count() { return standing(); },
    add(kind, x, y, opts = {}) {
      const k = typeof kind === 'number' ? kind : kindIndex[kind];
      if (k === undefined || !kinds[k]) return -1;
      const i = alloc(); if (i < 0) return -1;
      const now = ctx.now(), kd = kinds[k];
      X[i] = x; Y[i] = y; S[i] = clamp(opts.scale ?? 1, 0.1, kd.scale); Kd[i] = k;
      V[i] = Number.isFinite(opts.variant) ? clamp(opts.variant | 0, 0, kd.variants - 1) : Math.floor(R() * kd.variants);
      B[i] = now; L[i] = opts.life ?? life0 + R() * (life1 - life0); G[i] = -1; ROT[i] = 0; lastAdd = now; PA[i] = now;
      if (!everywhere) for (let j = 0; j < max; j++) { const dx = X[j] - x, dy = Y[j] - y; if (ST[j] !== FREE && dx * dx + dy * dy < patch2) PA[j] = now; }
      if (opts.fall) {
        ST[i] = FALL; FY[i] = opts.fall.to ?? y + 300; VX[i] = opts.fall.vx ?? 0; VY[i] = opts.fall.vy ?? 0; ROT[i] = R() * 6;
      } else { ST[i] = (opts.delay || 0) > 0 ? WAIT : GROW; }
      T0[i] = now + (opts.delay || 0);
      live++; changed = true;
      return i;
    },
    near(x, y, r) {
      let n = 0; const r2 = r * r;
      for (let i = 0; i < max; i++) { const s = ST[i]; if (s === FREE || s === WILT) continue; const dx = X[i] - x, dy = Y[i] - y; if (dx * dx + dy * dy < r2) n++; }
      return n;
    },
    wilt(x, y, r) {
      const r2 = r * r, now = ctx.now(); let n = 0;
      for (let i = 0; i < max; i++) {
        const s = ST[i]; if (s === FREE || s === WILT || s === DOOMED) continue;
        const dx = X[i] - x, dy = Y[i] - y; if (dx * dx + dy * dy >= r2) continue;
        if (s === REST && G[i] === front.gen && front.ok) { ST[i] = DOOMED; doomed++; } else { ST[i] = WILT; T0[i] = now; }
        n++;
      }
      return n;
    },
    wiltAll(fraction = 1) {
      const now = ctx.now();
      for (let i = 0; i < max; i++) {
        const s = ST[i]; if (s === FREE || s === WILT || s === DOOMED || R() > fraction) continue;
        if (s === REST && G[i] === front.gen && front.ok) { ST[i] = DOOMED; doomed++; } else { ST[i] = WILT; T0[i] = now; }
      }
    },
    clear() { for (let i = 0; i < max; i++) if (ST[i] !== FREE) release(i); doomed = 0; front.ok = false; frontKey = ''; },
    /** the place was put away (world.js evicts it): let the sprite atlases and the bakes go; what grew stays and
     *  everything is painted again on the next draw */
    free() {
      for (const A of atlas) if (A.c) { A.c.width = 1; A.c.height = 1; }
      atlasKey = '';
      for (const b of [front, back]) { b.c.width = 1; b.c.height = 1; b.ok = false; b.gen = -1; }
      building = false; order = null; frontKey = '';
      for (let i = 0; i < max; i++) {
        if (ST[i] === DOOMED) { ST[i] = WILT; T0[i] = ctx.now(); }   // was waiting to leave a bake that is gone
        G[i] = -1;
      }
      doomed = 0;
    },
    /** draw in the world-transformed context of scene.draw */
    draw(g, view) {
      const now = ctx.now(), dt = lastT < 0 ? 0 : clamp(now - lastT, 0, 0.1); lastT = now;
      const stage = ctx.stage, scale = stage.scale;
      // sprites and the bake follow the scale, the look (season) and the view shown
      const lk = look(ctx.env) + '|' + scale.toFixed(4);
      if (lk !== atlasKey) { atlasKey = lk; paintAtlas(scale); front.ok = false; frontKey = ''; building = false; }
      const f = ctx.target();
      wantKey = `${f.x | 0},${f.y | 0},${f.w | 0},${stage.W}x${stage.H}|${lk}`;
      // thinning: `rest` s after the last growth near a thing, one thing every `thin` seconds wilts, the oldest of the
      // rested ones first, down to `keep` (it catches up when the place was not drawn for a while, and in tests that
      // step the clock). With `patch` Infinity every add counts for every thing: the whole layer rests together.
      thinTo(now);
      if (!building && (wantKey !== frontKey || (doomed > 0 && now - lastRebuild > 0.4))) startBuild(f, scale);
      if (building) stepBuild();
      // ages: a slice per frame
      const slice = Math.ceil(max / 90);
      for (let j = 0; j < slice; j++) {
        const i = scanAt; scanAt = (scanAt + 1) % max;
        if (ST[i] === REST && now - B[i] > L[i]) {
          if (G[i] === front.gen && front.ok) { ST[i] = DOOMED; doomed++; } else { ST[i] = WILT; T0[i] = now; }
        }
      }
      if (front.ok) g.drawImage(front.c, front.x, front.y, front.w, front.h);
      // live things
      const vx0 = view.x - 80, vx1 = view.x + view.w + 80, vy0 = view.y - 120, vy1 = view.y + view.h + 200;
      let cap = LIVE_CAP;
      const wind = ctx.env.windy || 0;
      for (let i = 0; i < max; i++) {
        let s = ST[i];
        if (s === FREE || s === DOOMED) continue;
        if (s === REST && (G[i] === front.gen && front.ok)) continue;
        if (s === WAIT) { if (now >= T0[i]) { ST[i] = s = GROW; } else continue; }
        const kd = kinds[Kd[i]], A = atlas[Kd[i]];
        let sc = S[i], a = 1, ox = 0, oy = 0, rot = 0;
        if (s === GROW) {
          const k = clamp((now - T0[i]) / growT, 0, 1);
          sc *= Math.max(0.01, backOut(k)); a = Math.min(1, k * 3);
          if (k >= 1) { ST[i] = REST; G[i] = -1; settle(i); }
        } else if (s === FALL) {
          VY[i] = Math.min(VY[i] + 260 * dt, 160 + 60 * wind);
          VX[i] += (Math.sin(now * 2.3 + i) * 40 + wind * 90 - VX[i] * 0.8) * dt;
          X[i] += VX[i] * dt; Y[i] += VY[i] * dt;
          ROT[i] += dt * (1.5 + wind * 2) * (i % 2 ? 1 : -1);
          rot = Math.sin(ROT[i]) * 0.9;
          if (Y[i] >= FY[i]) { Y[i] = FY[i]; ST[i] = REST; G[i] = -1; rot = 0; settle(i); }
        } else if (s === WILT) {
          const k = clamp((now - T0[i]) / wiltT, 0, 1);
          sc *= 1 - 0.35 * k; a = 1 - k; oy = 8 * k;
          if (k >= 1) { release(i); continue; }
        } else if (s === REST) {
          if (--cap < 0) continue;
        }
        const x = X[i] + ox, y = Y[i] + oy;
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        const dw = A.cw * sc / (atlasScale * kd.scale), dh = A.ch * sc / (atlasScale * kd.scale);
        g.globalAlpha = a;
        if (rot) {
          g.save(); g.translate(x, y); g.rotate(rot);
          g.drawImage(A.c, V[i] * A.cw, 0, A.cw, A.ch, -kd.ax * kd.w * sc, -kd.ay * kd.h * sc, dw, dh);
          g.restore();
        } else g.drawImage(A.c, V[i] * A.cw, 0, A.cw, A.ch, x - kd.ax * kd.w * sc, y - kd.ay * kd.h * sc, dw, dh);
      }
      g.globalAlpha = 1;
    },
  };
  /** A thing came to rest: stamp it into the bake(s) that cover it. */
  function settle(i) {
    changed = true;
    if (front.ok && inBake(front, i)) { stamp(front, i); G[i] = front.gen; }
    if (building && inBake(back, i)) { stamp(back, i); G[i] = back.gen; }
  }
  return layer;
}
