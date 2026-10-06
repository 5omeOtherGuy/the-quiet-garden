// Hit regions (owner: engine; docs/ENGINE.md "Regions"): named areas of a place's world, so a place can ask what a
// stroke or a tap is passing over ("meadow", "crown", "water", "sky"). Every stroke and tap point the engine hands a
// place carries `over`, the name of the topmost region under it ('' if none).
//
//   engine.regions.add(name, shape, opts)    shape: {poly: [[x, y], ...]} | {x, y, r} | {x, y, w, h}
//                                             | {mask: (g) => paint in world units, x, y, w, h, res}
//      opts.view: only in that view. Later regions lie on top of earlier ones. Returns the region (to remove it).
//      A mask is painted once into a small alpha canvas (res world units per pixel, default 6); anything painted
//      with alpha above one half counts. Repaint with region.repaint() if the shape grows or changes.
//   engine.regions.at(x, y) -> name   .is(name, x, y) -> bool   .remove(region)   .clear()
// A place may also declare `regions: [{name, ...shape, view?}]` on its definition or scene.

import { inPoly } from './exits.js';
import { makeCanvas, report } from './util.js';

function paintMask(rg) {
  const s = rg.mask, res = Math.max(1, +s.res || 6);
  const w = Math.max(1, Math.ceil(s.w / res)), h = Math.max(1, Math.ceil(s.h / res));
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.setTransform(1 / res, 0, 0, 1 / res, -s.x / res, -s.y / res);
  g.fillStyle = '#000'; g.strokeStyle = '#000';
  try { s.mask(g); } catch (e) { report(`region mask ${rg.name}`, e); }
  const d = g.getImageData(0, 0, w, h).data;
  const bits = new Uint8Array(w * h);
  for (let i = 0; i < bits.length; i++) bits[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  rg.bits = bits; rg.bw = w; rg.bh = h; rg.res = res;
  c.width = c.height = 0;
}

function test(rg, x, y) {
  const s = rg.shape;
  if (s.poly) {
    if (x < rg.x0 || x > rg.x1 || y < rg.y0 || y > rg.y1) return false;
    return inPoly(s.poly, x, y);
  }
  if (s.mask) {
    const i = Math.floor((x - s.x) / rg.res), j = Math.floor((y - s.y) / rg.res);
    if (i < 0 || j < 0 || i >= rg.bw || j >= rg.bh) return false;
    return rg.bits[j * rg.bw + i] === 1;
  }
  if (Number.isFinite(s.r)) { const dx = x - s.x, dy = y - s.y; return dx * dx + dy * dy <= s.r * s.r; }
  if (Number.isFinite(s.w)) return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  return false;
}

export function createRegions(n) {
  const list = [];
  function add(name, shape, opts = {}) {
    if (!shape || typeof shape !== 'object') return null;
    const rg = { name: String(name), shape, view: opts.view || shape.view || null, mask: shape.mask ? shape : null };
    if (shape.poly) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of shape.poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      Object.assign(rg, { x0, y0, x1, y1 });
    }
    if (rg.mask) paintMask(rg);
    rg.repaint = () => { if (rg.mask) paintMask(rg); };
    list.push(rg);
    return rg;
  }
  let declaredDone = false;
  function declared() {
    if (declaredDone) return;
    declaredDone = true;
    for (const src of [n.def.regions, n.scene && n.scene.regions]) {
      if (Array.isArray(src)) for (const r of src) if (r && r.name) add(r.name, r, { view: r.view });
    }
  }
  return {
    add(name, shape, opts) { declared(); return add(name, shape, opts); },
    remove(rg) { const i = list.indexOf(rg); if (i >= 0) list.splice(i, 1); },
    clear() { list.length = 0; declaredDone = true; },
    at(x, y) {
      declared();
      for (let i = list.length - 1; i >= 0; i--) {
        const rg = list[i];
        if (rg.view && rg.view !== n.viewId) continue;
        if (test(rg, x, y)) return rg.name;
      }
      return '';
    },
    is(name, x, y) {
      declared();
      for (let i = list.length - 1; i >= 0; i--) {
        const rg = list[i];
        if (rg.name !== name || (rg.view && rg.view !== n.viewId)) continue;
        if (test(rg, x, y)) return true;
      }
      return false;
    },
    get list() { declared(); return list.map((r) => r.name); },
  };
}
