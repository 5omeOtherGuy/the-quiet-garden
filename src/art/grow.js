// Things grown and shed under a child's hand, from small painted pieces (place.json "sets", packed into an atlas).
//   Field: flowers that come up where a finger travels over a region: a stem grows from the ground, the head opens
//          with a little spring, then they sway, lean away from a passing finger, live a while and wilt, so the
//          picture never fills up and never stays the same. Many variants of heads and stems, mirrored, scaled
//          and leaned, so nothing looks stamped.
//   Shed:  pieces that let go where a hand brushes (leaves of an autumn crown, petals, snow), fall with a flutter,
//          settle on the ground below and fade after a while.
// Both take stroke points as plain data ({ x, y, id } in world units, as the engine's stroke stream delivers them)
// and are drawn by place.draw() in depth order with the sprites. Make them with place.field(o) / place.shed(o).
import { clamp, lerp, hash2, TAU } from './rng.js';
import { noise1 } from './noise.js';
import { nightImage } from './painted.js';

const backOut = (t) => { const c = 1.9; t = clamp(t, 0, 1) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
let serial = 1;

function poseOf(place, name) { const d = place.man.sprites[name]; if (!d) throw new Error(`art.grow: no piece "${name}"`); return d.poses[0]; }

export class Field {
  /**
   * o: { view, region: 'meadow', spacing: 34 (world units of finger path per flower, at the front),
   *      max: 120   the most that stand at once; when it is passed the oldest wilts,
   *      keep: 20   the number that stays: at or below it no flower dies of age or is thinned out,
   *      rest: 30   seconds without a stroke or tap in the field before it starts to thin,
   *      thin: 3    seconds between two flowers wilting while it thins (down to `keep`); crowded and older ones
   *                 go first, so what stays is spread over the view; a new stroke stops the thinning at once,
   *      minY: 0 (nothing grows above), life: [70, 160] s, wild: 0 (how many it keeps growing by itself; at most `keep`),
   *      kinds: [{ heads: [piece names], stems: [piece names], h: [min, max] stem height at the front (world units),
   *                head: height of the head (world units), weight: 1, seasons: [...] | null, lean: 0.12 }],
   *      onBloom: (item) => {}   called when a head opens (the place plays its note there) }
   */
  constructor(place, o = {}) {
    this.place = place; this.view = o.view ?? place.viewName; this.region = o.region || 'meadow';
    this.max = o.max ?? 120; this.keep = o.keep ?? 20; this.rest = o.rest ?? 30; this.thin = o.thin ?? 3; this._idle = 0; this._thinT = 0; this._alive = 0;
    this.spacing = o.spacing ?? 34; this.minY = o.minY ?? 0; this.life = o.life || [70, 160]; this.wild = o.wild ?? 0;
    this.onBloom = o.onBloom || null; this.items = []; this._last = new Map(); this._wildT = 0; this.stats = { n: 0 };
    this.setKinds(o.kinds || []);
  }
  setKinds(kinds) {
    this.kinds = kinds.map((k) => ({ ...k, _heads: k.heads.map((n) => poseOf(this.place, n)), _stems: (k.stems || []).map((n) => poseOf(this.place, n)), weight: k.weight ?? 1 }));
    return this;
  }
  _pick(season, r, prefer) {
    const ok = this.kinds.filter((k) => !k.seasons || k.seasons.includes(season)); if (!ok.length) return null;
    if (prefer && ok.includes(prefer) && r < 0.7) return prefer;
    let sum = 0; for (const k of ok) sum += k.weight; let q = hash2(r * 977, serial, 5) * sum;
    for (const k of ok) { q -= k.weight; if (q <= 0) return k; } return ok[ok.length - 1];
  }
  /** One flower at a world point (a tap; also used by stroke). Returns the item or null when nothing grows there. */
  bloomAt(x, y, o = {}) {
    const pl = this.place; if (y < this.minY || !pl.inRegion(this.region, x, y)) return null;
    if (!o.quiet) this._idle = 0;                                                    // a touch: the field stops thinning
    const season = pl.seasonAt ? pl.seasonAt(x, y) : 'summer', id = serial++, r = hash2(id, 1, 77), kind = o.kind || this._pick(season, r, o.prefer); if (!kind) return null;
    const sc = pl.scaleAt(y), near = 15 * sc; let lo = this._find(y - near), crowd = 0;
    for (let i = lo; i < this.items.length && this.items[i].y <= y + near; i++) if (Math.abs(this.items[i].x - x) < near && !this.items[i].die) crowd++;
    if (crowd >= (o.crowd ?? 2)) return null;
    const head = kind._heads[Math.floor(hash2(id, 2, 77) * kind._heads.length)], stem = kind._stems.length ? kind._stems[Math.floor(hash2(id, 3, 77) * kind._stems.length)] : null;
    const it = {
      id, x, y, kind, head, stem, sc, flip: hash2(id, 4, 77) < 0.5 ? -1 : 1, lean: (hash2(id, 5, 77) - 0.5) * 2 * (kind.lean ?? 0.12),
      h: lerp(kind.h[0], kind.h[1], hash2(id, 6, 77)), hs: 0.85 + 0.3 * hash2(id, 7, 77), age: o.age ?? 0, life: lerp(this.life[0], this.life[1], hash2(id, 8, 77)),
      seed: r * 100, push: 0, die: 0, open: false, tx: x, ty: y,
    };
    this.items.splice(this._find(y), 0, it);
    if (this.items.length > this.max) { let old = null; for (const q of this.items) if (!q.die && (!old || q.id < old.id)) old = q; if (old) old.die = 0.001; }
    return it;
  }
  /** Empty the field at once (before a restore, or when the place is set up anew); strokes in progress end. */
  clear() { this.items.length = 0; this._last.clear(); this._alive = 0; this._idle = 0; this._thinT = 0; this.stats.n = 0; return this; }
  _find(y) { let lo = 0, hi = this.items.length; while (lo < hi) { const m = (lo + hi) >> 1; if (this.items[m].y < y) lo = m + 1; else hi = m; } return lo; }
  /**
   * A finger moved: flowers come up along its way. p: { x, y, id } or an array of them (world units). Flowers that
   * already stand near the finger lean away from it. Returns the number of flowers started.
   */
  stroke(p) {
    if (Array.isArray(p)) { let n = 0; for (const q of p) n += this.stroke(q); return n; }
    const id = p.id ?? 0, L = this._last.get(id); let n = 0;
    if (this.place.inRegion(this.region, p.x, p.y)) this._idle = 0;
    if (!L) { this._last.set(id, { x: p.x, y: p.y, carry: this.spacing * 0.6, kind: null }); return 0; }
    const dx = p.x - L.x, dy = p.y - L.y, d = Math.hypot(dx, dy); if (d < 0.5) return 0;
    const sc = this.place.scaleAt(p.y), step = Math.max(8, this.spacing * sc); L.carry += d;
    while (L.carry >= step) {
      L.carry -= step; const k = clamp(1 - L.carry / d, 0, 1), s = serial;
      const x = L.x + dx * k + (hash2(s, 1, 78) - 0.5) * 34 * sc, y = L.y + dy * k + (hash2(s, 2, 78) - 0.3) * 26 * sc;
      const it = this.bloomAt(x, y, { prefer: L.kind }); if (it) { L.kind = it.kind; n++; }
    }
    // the hand passes: what stands near bends away
    const r = 70 * sc; for (let i = this._find(p.y - r * 0.4); i < this.items.length && this.items[i].y <= p.y + r; i++) { const it = this.items[i], ex = it.x - p.x; if (Math.abs(ex) < r) it.push += (ex >= 0 ? 1 : -1) * 0.5 * (1 - Math.abs(ex) / r) * Math.min(1, d / 20); }
    L.x = p.x; L.y = p.y; return n;
  }
  /** The finger left. */
  end(id = 0) { this._last.delete(id); }
  /** Grow n flowers by itself, scattered over the region (what already stands when the place is entered). */
  seed(n, rnd = Math.random, grown = true, crowd = 1) {
    const W = this.place.width; let made = 0;
    for (let i = 0; i < n * 30 && made < n; i++) { const y = lerp(Math.max(this.minY, 520), 1000, Math.pow(rnd(), 0.7)), it = this.bloomAt(rnd() * W, y, { age: grown ? 5 + rnd() * 40 : 0, crowd, quiet: true }); if (it) { made++; if (grown) it.open = true; } }
    return made;
  }
  /** The top of a flower (where a bee lands): { x, y } in world units. */
  headOf(it) { const hh = it.h * it.sc * Math.min(1, it.age / 0.5); return { x: it.x + Math.sin(it.lean) * hh, y: it.y - Math.cos(it.lean) * hh }; }
  /** A standing, open flower chosen at random (or null): for bees and butterflies. filter(it) -> bool. */
  any(rnd = Math.random, filter = null) { const ok = this.items.filter((it) => it.open && !it.die && (!filter || filter(it))); return ok.length ? ok[Math.floor(rnd() * ok.length)] : null; }
  /** What grows here as plain data, for the engine's save: [[x, y, kindIndex], ...]; load() grows them again. */
  dump() { return this.items.filter((it) => !it.die).map((it) => [Math.round(it.x), Math.round(it.y), this.kinds.indexOf(it.kind)]); }
  /** load(list): grow them in addition; load(list, { replace: true }): empty the field first (a restore). */
  load(list, o = {}) { if (o.replace) this.clear(); for (const [x, y, k] of list) { const it = this.bloomAt(x, y, { kind: this.kinds[k], age: 30, crowd: 9, quiet: true }); if (it) it.open = true; } }

  update(dt, env, t, seasonAt) {
    const items = this.items, many = this._alive > this.keep; let alive = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]; it.age += dt; it.push *= Math.exp(-3.2 * dt);
      if (!it.open && it.age > 0.42) { it.open = true; if (this.onBloom) this.onBloom(it); }
      if (!it.die && ((many && it.age > it.life) || (it.kind.seasons && !it.kind.seasons.includes(seasonAt(it.x, it.y)) && hash2(it.id, Math.floor(t * 2), 79) < 0.35))) it.die = 0.001;
      if (it.die) { it.die += dt / 2.4; if (it.die >= 1) { items.splice(i, 1); continue; } } else alive++;
    }
    this._alive = alive; this._idle += dt;
    // left alone, the field thins slowly back to what stays
    if (this._idle > this.rest && alive > this.keep) { this._thinT -= dt; if (this._thinT <= 0) { this._thinT = this.thin * (0.7 + 0.6 * Math.random()); this._thinOne(); } }
    else this._thinT = 0;
    // the meadow keeps a few flowers of its own
    if (this.wild > 0 && dt > 0) { this._wildT -= dt; if (this._wildT <= 0 && alive < Math.min(this.wild, this.keep)) { this._wildT = 1.2 + Math.random() * 2.5; this.seed(1, Math.random, false); } }
    this.stats.n = items.length;
  }

  // One flower goes: the one that stands closest to another and is older, with some chance in it, so that the
  // field does not empty like a queue and what stays is spread over the view, not one clump.
  _thinOne() {
    const live = this.items.filter((it) => !it.die); let worst = null, top = -1, oldest = 1;
    for (const it of live) oldest = Math.max(oldest, it.age);
    for (const a of live) {
      let near = 1e9;
      for (const b of live) { if (a === b) continue; const d = Math.hypot(a.x - b.x, (a.y - b.y) * 2.5) / (a.sc + b.sc) * 2; if (d < near) near = d; }
      const score = 1 / (1 + near / 50) + 0.45 * (a.age / oldest) + 0.4 * Math.random();
      if (score > top) { top = score; worst = a; }
    }
    if (worst) worst.die = 0.001;
  }

  /** Draw the items whose foot lies in [y0, y1) (called by place.draw between the sprites, far to near). */
  drawRange(g, nightK, y0, y1, t, env) {
    const items = this.items; let i = this._find(y0); if (i >= items.length || items[i].y >= y1) return;
    const M = g.getTransform(), ma = M.a, md = M.d, me = M.e, mf = M.f, P = this.place, storm = (env.stormy ?? 0) > 0.3 ? 1 : 0;
    const day = nightK < 0.99, night = nightK > 0.02;
    for (; i < items.length; i++) {
      const it = items[i]; if (it.y >= y1) break;
      const up = backOut(it.age / 0.55), wilt = it.die ? it.die : 0, s = it.sc * up * (1 - 0.35 * wilt), alpha = 1 - wilt * wilt;
      // it sways as the painting under it moves (place.motionAt: the wind's fronts and what a finger has stirred), and leans with the wind
      const mk = Math.min(1.6, P.motionAt(it.x, it.y) / 0.63), wk = Math.min(1.6, P._wind / 0.63);
      const sway = (Math.sin(t * 1.3 + it.seed) * 0.6 + Math.sin(t * 0.73 + it.seed * 1.7) * 0.4) * 0.05 * (1 + 2.4 * mk) + wk * 0.07 + storm * Math.sin(t * 6 + it.seed) * 0.03;
      const rot = it.lean + sway + it.push + wilt * 0.5 * it.flip, cs = Math.cos(rot), sn = Math.sin(rot), fl = it.flip;
      // world matrix of the plant: translate(x, y) rotate(rot) scale(s * fl, s)
      const a = cs * s * fl, b = sn * s * fl, c = -sn * s, d = cs * s;
      let hx = 0, hy = -it.h;                                                        // where the head sits, in plant units
      if (it.stem) {
        const p = it.stem, k = it.h / p.h, w = p.w * k, dx = -p.anchor[0] * w, dy = -p.anchor[1] * it.h;
        g.setTransform(ma * a, md * b, ma * c, md * d, ma * it.x + me, md * it.y + mf);
        if (day) { g.globalAlpha = alpha; g.drawImage(p.img, p.x, p.y, p.w, p.h, dx, dy, w, it.h); }
        if (night) { g.globalAlpha = day ? alpha * nightK : alpha; g.drawImage(nightImage(p), p.x, p.y, p.w, p.h, dx, dy, w, it.h); }
        if (p.top) { hx = (p.top[0] - p.anchor[0]) * w; hy = (p.top[1] - p.anchor[1]) * it.h; }
      }
      const o = it.age < 0.3 ? 0 : backOut((it.age - 0.3) / 0.6) * (1 - 0.25 * wilt); if (o <= 0.01) continue;
      const p = it.head, hh = it.kind.head * it.hs * o, k = hh / p.h, w = p.w * k, r2 = sway * 1.5 + it.push * 0.6 + wilt * 0.9, c2 = Math.cos(r2), s2 = Math.sin(r2);
      // head matrix: plant * translate(hx, hy) * rotate(r2)   (the head is not scaled by the plant's growth twice)
      const ex = a * hx + c * hy + it.x, ey = b * hx + d * hy + it.y, q = it.sc * (1 - 0.35 * wilt), cr = Math.cos(rot), sr = Math.sin(rot);
      const ha = (cr * c2 - sr * s2) * q * fl, hb = (sr * c2 + cr * s2) * q * fl, hc = -(sr * c2 + cr * s2) * q, hd = (cr * c2 - sr * s2) * q;
      g.setTransform(ma * ha, md * hb, ma * hc, md * hd, ma * ex + me, md * ey + mf);
      const dx = -p.anchor[0] * w, dy = -p.anchor[1] * hh;
      if (day) { g.globalAlpha = alpha; g.drawImage(p.img, p.x, p.y, p.w, p.h, dx, dy, w, hh); }
      if (night) { g.globalAlpha = day ? alpha * nightK : alpha; g.drawImage(nightImage(p), p.x, p.y, p.w, p.h, dx, dy, w, hh); }
    }
    g.setTransform(M); g.globalAlpha = 1;
  }
}

export class Shed {
  /**
   * o: { view, region: 'crown' (where a brushing hand loosens pieces), ground: 'meadow' (the region they land on),
   *      pieces: [piece names], size: [22, 40] (world units, at the front), max: 500, per: 18 (world units of finger
   *      path per piece), fall: [90, 150] units/s, lie: [40, 90] s before a lying piece fades, seasons: [...] | null,
   *      spin: 1, onLand: (piece) => {}, onLoose: (piece) => {} }
   */
  constructor(place, o = {}) {
    this.place = place; this.view = o.view ?? place.viewName; this.region = o.region || 'crown'; this.ground = o.ground || 'meadow';
    this.poses = (o.pieces || []).map((n) => poseOf(place, n)); this.size = o.size || [22, 40]; this.max = o.max ?? 500; this.per = o.per ?? 18;
    this.fallV = o.fall || [90, 150]; this.lie = o.lie || [40, 90]; this.seasons = o.seasons || null; this.spin = o.spin ?? 1;
    this.onLand = o.onLand || null; this.onLoose = o.onLoose || null; this.air = []; this.lying = []; this._last = new Map(); this.stats = { n: 0 };
  }
  /** Let one piece go at a world point with a first push (vx, vy). */
  loose(x, y, vx = 0, vy = 0) {
    if (!this.poses.length) return null;
    const id = serial++, pl = this.place, gy0 = pl.below(this.ground, x, y + 40), gy = gy0 === null ? 960 : Math.min(990, gy0 + 20 + hash2(id, 1, 81) * (1000 - gy0) * 0.75);
    const it = { id, x, y, vx, vy, gy, pose: this.poses[Math.floor(hash2(id, 2, 81) * this.poses.length)], size: lerp(this.size[0], this.size[1], hash2(id, 3, 81)), rot: hash2(id, 4, 81) * TAU, vr: (hash2(id, 5, 81) - 0.5) * 5 * this.spin,
      seed: hash2(id, 6, 81) * 100, fall: lerp(this.fallV[0], this.fallV[1], hash2(id, 7, 81)), flip: hash2(id, 8, 81) < 0.5 ? -1 : 1, age: 0, life: lerp(this.lie[0], this.lie[1], hash2(id, 9, 81)), flat: 1 };
    this.air.push(it); if (this.onLoose) this.onLoose(it);
    if (this.air.length + this.lying.length > this.max) { if (this.lying.length) this.lying.shift(); else this.air.shift(); }
    return it;
  }
  /** A finger brushes through: pieces let go along its way where it is over the region. p: { x, y, id } or an array. */
  stroke(p) {
    if (Array.isArray(p)) { let n = 0; for (const q of p) n += this.stroke(q); return n; }
    const id = p.id ?? 0, L = this._last.get(id); let n = 0;
    if (!L) { this._last.set(id, { x: p.x, y: p.y, carry: this.per * 0.5 }); return 0; }
    const dx = p.x - L.x, dy = p.y - L.y, d = Math.hypot(dx, dy); if (d < 0.5) return 0;
    const season = this.place.seasonAt ? this.place.seasonAt(p.x, p.y) : null;
    if (!this.seasons || !season || this.seasons.includes(season)) {
      L.carry += d;
      while (L.carry >= this.per) {
        L.carry -= this.per; const k = clamp(1 - L.carry / d, 0, 1), s = serial, x = L.x + dx * k + (hash2(s, 1, 82) - 0.5) * 50, y = L.y + dy * k + (hash2(s, 2, 82) - 0.5) * 50;
        if (this.place.inRegion(this.region, x, y) && this.loose(x, y, dx * 1.5 + (hash2(s, 3, 82) - 0.5) * 60, dy * 0.6 - 20)) n++;
      }
    }
    L.x = p.x; L.y = p.y; return n;
  }
  end(id = 0) { this._last.delete(id); }
  /** Pieces let go by themselves: n pieces from random points of the region (a gust, a season turning). */
  scatter(n, rnd = Math.random) { const W = this.place.width; let made = 0; for (let i = 0; i < n * 40 && made < n; i++) { const x = rnd() * W, y = rnd() * 700; if (this.place.inRegion(this.region, x, y) && this.loose(x, y, (rnd() - 0.5) * 40, 0)) made++; } return made; }

  update(dt, env, t, seasonAt) {
    const wind = (env.windy ?? 0) * 150 + (env.stormy ?? 0) * 120;
    for (let i = this.air.length - 1; i >= 0; i--) {
      const it = this.air[i]; it.age += dt;
      const flut = Math.sin(t * 2.3 + it.seed) * 60 + Math.sin(t * 3.7 + it.seed * 2) * 30;
      it.vx += ((flut + wind * (0.6 + 0.4 * noise1(t * 0.6 + it.seed, 3))) - it.vx) * Math.min(1, dt * 2.2);
      it.vy += (it.fall * (0.75 + 0.25 * Math.cos(t * 2.3 + it.seed)) - it.vy) * Math.min(1, dt * 2.5);
      it.x += it.vx * dt; it.y += it.vy * dt; it.rot += (it.vr + it.vx * 0.012) * dt; it.flat = 0.55 + 0.45 * Math.cos(t * 3.1 + it.seed);
      if (it.y >= it.gy) { it.y = it.gy; it.age = 0; it.flat = 0.5; it.rot = (hash2(it.id, 1, 83) - 0.5) * 0.9; this.air.splice(i, 1); this.lying.push(it); if (this.onLand) this.onLand(it); }
    }
    for (let i = this.lying.length - 1; i >= 0; i--) {
      const it = this.lying[i]; it.age += dt;
      if (wind > 60 && hash2(it.id, Math.floor(t * 3), 84) < dt * 0.25) { this.lying.splice(i, 1); it.vy = -60; it.vx = wind; it.gy = Math.min(990, it.gy + (hash2(it.id, 2, 84) - 0.4) * 30); it.y -= 4; this.air.push(it); continue; }  // the wind picks it up again
      if (it.age > it.life + 3 || (this.seasons && !this.seasons.includes(seasonAt(it.x, it.y)) && it.age > 2)) this.lying.splice(i, 1);
    }
    this.stats.n = this.air.length + this.lying.length;
  }
  _draw(g, list, nightK, lying) {
    if (!list.length) return;
    const M = g.getTransform(), ma = M.a, md = M.d, me = M.e, mf = M.f, day = nightK < 0.99, night = nightK > 0.02, pl = this.place;
    for (const it of list) {
      const p = it.pose, sc = Math.max(0.5, pl.scaleAt(it.gy)), big = p.w >= p.h ? it.size / p.w : it.size / p.h, w = p.w * big * sc, h = p.h * big * sc;
      const alpha = lying ? clamp(Math.min(it.age * 4 + 0.6, (it.life + 3 - it.age) / 3), 0, 1) : Math.min(1, it.age * 6);
      const cs = Math.cos(it.rot), sn = Math.sin(it.rot), fy = lying ? 0.55 : Math.max(0.2, Math.abs(it.flat)) * (it.flat < 0 ? -1 : 1);
      // translate(x, y) scale(1, lying ? 0.55 : 1) rotate(rot) scale(flip, flat)
      const ky = lying ? 0.55 : 1, fl = it.flip, f2 = lying ? 1 : fy;
      g.setTransform(ma * cs * fl, md * sn * fl * ky, ma * -sn * f2, md * cs * f2 * ky, ma * it.x + me, md * it.y + mf);
      if (day) { g.globalAlpha = alpha; g.drawImage(p.img, p.x, p.y, p.w, p.h, -w / 2, -h / 2, w, h); }
      if (night) { g.globalAlpha = day ? alpha * nightK : alpha; g.drawImage(nightImage(p), p.x, p.y, p.w, p.h, -w / 2, -h / 2, w, h); }
    }
    g.setTransform(M); g.globalAlpha = 1;
  }
  drawGround(g, nightK) { this._draw(g, this.lying, nightK, true); }
  drawAir(g, nightK) { this._draw(g, this.air, nightK, false); }
}
