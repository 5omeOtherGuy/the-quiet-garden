// Camera: still views (owner: engine; docs/ENGINE.md "Views"). One finger never moves the picture.
// A place (or instance) is a set of views; each view is a painting about 2:1 that fills the screen (cover fit):
// tablets crop its sides, wide phones its top and bottom, and the view's safe area (the middle 16:10 by default)
// always shows. The camera only frames the current view, glides between views of one place, and shakes.
//
// node.views: { id: {id, x, y, w, h, safe: {x, y, w, h}} } in the node's world units, node.viewId, node.frame:
// the visible rect {x, y, w, h} (its aspect is always the screen's).

import { clamp, easeInOut } from './util.js';

const SAFE_W = 1600; // default safe area: 16:10 of a 1000-high view

/** Normalise a place's view declarations (object map or array). Without any: one view over the whole world. */
export function normaliseViews(def, scene, world) {
  const src = (scene && scene.views) || def.views;
  const out = {};
  const list = Array.isArray(src) ? src : src && typeof src === 'object' ? Object.keys(src).map((k) => ({ id: k, ...src[k] })) : [];
  for (const v of list) {
    if (!v || !v.id) continue;
    const w = Math.max(200, +v.w || 2000), h = Math.max(200, +v.h || 1000);
    const x = +v.x || 0, y = +v.y || 0;
    const sw = Math.min(w, (v.safe && +v.safe.w) || Math.min(SAFE_W * (h / 1000), w));
    const sh = Math.min(h, (v.safe && +v.safe.h) || h);
    const sx = v.safe && Number.isFinite(+v.safe.x) ? +v.safe.x : x + (w - sw) / 2;
    const sy = v.safe && Number.isFinite(+v.safe.y) ? +v.safe.y : y + (h - sh) / 2;
    out[v.id] = { ...v, id: v.id, x, y, w, h, safe: { x: sx, y: sy, w: sw, h: sh } };
  }
  if (!Object.keys(out).length) {
    const w = world.w, h = world.h, sw = Math.min(w, SAFE_W * (h / 1000));
    out.main = { id: 'main', x: 0, y: 0, w, h, safe: { x: (w - sw) / 2, y: 0, w: sw, h } };
  }
  return out;
}

export function createCamera(stage) {
  const view = { x: 0, y: 0, w: 1333, h: 1000 };
  const st = { node: null, glide: null, shake: 0, shakeX: 0, shakeY: 0, t: 0 };

  const cam = {
    view,
    /** The visible rect of view v on this screen, into out. */
    frameOf(v, out = { x: 0, y: 0, w: 0, h: 0 }) {
      const A = stage.W / Math.max(1, stage.H);
      let w, h;
      if (v.w / v.h >= A) { h = v.h; w = h * A; } else { w = v.w; h = w / A; }
      const cx = v.safe.x + v.safe.w / 2, cy = v.safe.y + v.safe.h / 2;
      out.x = clamp(cx - w / 2, v.x, v.x + v.w - w);
      out.y = v.anchorY != null && h < v.h ? v.y + (v.h - h) * v.anchorY : clamp(cy - h / 2, v.y, v.y + v.h - h);
      out.w = w; out.h = h;
      return out;
    },
    /** Frame a node on its current view, now. */
    place(n) {
      const v = n.views[n.viewId] || n.views[Object.keys(n.views)[0]];
      n.viewId = v.id;
      n.frame = cam.frameOf(v, n.frame || { x: 0, y: 0, w: 0, h: 0 });
    },
    attach(n) {
      // framing a node now ends a glide still under way: it arrives at once (its done() ends the world's transition;
      // a resize during a glide used to drop it and leave world.trans set, so every touch stayed blocked)
      const g = st.glide;
      st.node = n; st.glide = null;
      cam.place(n);
      cam.sync();
      if (g && g.done) { const d = g.done; g.done = null; d(); }
    },
    /** Walk the attached node's camera to another of its views. Returns the glide or null. */
    glide(n, viewId, dur = 1.15) {
      const v = n.views[viewId]; if (!v) return null;
      const a = { ...n.frame }, b = cam.frameOf(v);
      n.viewId = viewId;
      st.glide = { n, a, b, t: 0, dur };
      return st.glide;
    },
    get gliding() { return !!st.glide; },
    /** The world rect shown (also the scale: stage.scale = backing px per unit). */
    sync() {
      const n = st.node; if (!n) return;
      view.x = n.frame.x; view.y = n.frame.y; view.w = n.frame.w; view.h = n.frame.h;
      stage.scale = stage.W / view.w; stage.vw = view.w; stage.vh = view.h;
    },
    shake(amount = 8) { st.shake = Math.min(40, Math.max(st.shake, amount)); },
    tick(dt, still) {
      st.t += dt;
      const g = st.glide;
      if (g) {
        g.t = Math.min(1, g.t + dt / g.dur);
        const k = easeInOut(g.t), f = g.n.frame;
        f.x = g.a.x + (g.b.x - g.a.x) * k; f.y = g.a.y + (g.b.y - g.a.y) * k;
        f.w = g.a.w + (g.b.w - g.a.w) * k; f.h = g.a.h + (g.b.h - g.a.h) * k;
        if (g.t >= 1) { st.glide = null; if (g.done) g.done(); }
      }
      if (st.shake > 0.05 && !still) {
        st.shake *= Math.exp(-dt / 0.22);
        st.shakeX = st.shake * Math.sin(st.t * 61.3) * Math.cos(st.t * 23.1);
        st.shakeY = st.shake * Math.sin(st.t * 47.9 + 1.3) * 0.7;
      } else { st.shake = 0; st.shakeX = st.shakeY = 0; }
      cam.sync();
    },
    isMoving: () => !!st.glide,
    get shakeX() { return st.shakeX; },
    get shakeY() { return st.shakeY; },
    get node() { return st.node; },
  };
  return cam;
}
