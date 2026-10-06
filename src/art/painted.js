// Painted places: generated paintings brought to life. A place is a few still views; each view is one painting per
// season (and, where painted, per season at night) that fills the screen, with named regions a finger can be over
// (meadow, crown, water, sky ...). On top live painted cut-out sprites moved by code, and things grown from small
// painted pieces (grow.js). The painting itself moves under them where the compositor can do it (a "live" frame):
// displaced by the view's motion source times a strength per pixel (weather level in gust fronts + what fingers stir).
// Assets and manifest come from tools/paint/cutout.py export; docs/STYLE.md says how the
// paintings are made.
import { clamp, lerp, hash2, TAU } from './rng.js';
import { noise1 } from './noise.js';
import { light } from './lights.js';
import { compositor } from './compositor.js';
import { nightness } from './palette.js';
import { Field, Shed } from './grow.js';

const BASE = new URL('../../assets/art/', import.meta.url);
const GRADE_K = { dawn: 0.75, day: 0, dusk: 0.8, night: 0.12 };        // how much of the compositor's time glaze a painted night still wants
const NIGHT_TINT = 'rgb(84,100,160)';                                 // glaze for day-painted sprites in front of a night painting
const LAMP = [1, 0.78, 0.42];
/**
 * Moving backgrounds: live knobs. Strength 1 = as far as the view's clip moves.
 * level = still + wind * env.windy^1.3 + storm * env.stormy (engine: calm 0.05, breeze 0.2, wind 0.6, storm 1.4);
 * touch: strength under a finger; rest: seconds until stirred grass has nearly come to rest; rate: loop speed =
 * rate[0] + rate[1] * windy + rate[2] * stormy; cell: world units per cell of the stroke map;
 * gains: how much of each region moves in a season (default 1): snow lies still, bare boughs move less.
 */
export const MOTION = { still: 0.03, wind: 0.6, storm: 0.9, touch: 0.95, rest: 2.6, rate: [0.8, 0.35, 0.5], cell: 12.5, gains: { winter: { crown: 0.55, meadow: 0.08, water: 0 } } };
const REGION_CH = ['crown', 'meadow', 'water', 'sky'];                 // the channels of the region texture: what can move
// The gust fronts: wind travels left to right in waves; between them the picture rests. The compositor's shader has
// the same formula (gustAt), so the foreground sways with the grass under it: keep the two in step. wx, wy in sheet heights.
function gustAt(wx, wy, t) {
  const f = 0.5 + 0.2 * Math.sin(wx * 2.9 - t * 0.5 + wy * 1.7) + 0.16 * Math.sin(wx * 5.3 - t * 0.83 - wy * 2.9 + 1.3) + 0.14 * Math.sin(wx * 1.3 - t * 0.21 + wy * 4.1 + 4.0);
  const k = clamp((f - 0.25) / 0.55, 0, 1); return 0.45 + 1.1 * k * k * (3 - 2 * k);
}
let current = null;                                                   // the place drawn last (art.motion.at asks it)

async function loadBitmap(url, raw) {
  const res = await fetch(url); if (!res.ok) throw new Error(`art.painted: ${url} -> ${res.status}`);
  const blob = await res.blob();
  if (typeof createImageBitmap === 'function') return raw ? createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }) : createImageBitmap(blob);
  return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = URL.createObjectURL(blob); });
}
const close = (b) => { if (b && b.close) b.close(); };
const ease = (t) => t * t * (3 - 2 * t);

let shadowTex = null;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(38,40,70,0.85)'); gr.addColorStop(0.55, 'rgba(38,40,70,0.4)'); gr.addColorStop(1, 'rgba(38,40,70,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (shadowTex = c);
}

function unpack(b64) { const bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }

function tinted(img, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = NIGHT_TINT; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0, w, h);
  return c;
}
/** The night version of a pose's image (the whole atlas for atlas poses): made once, on first use. */
export function nightImage(p) {
  if (p.atlas) return p.atlas.night || (p.atlas.night = tinted(p.atlas.img, p.atlas.w, p.atlas.h));
  return p.night || (p.night = tinted(p.img, p.w, p.h));
}
/** Draw a pose into the rect (dx, dy, dw, dh) of the current transform, crossfaded towards its night version. */
export function blit(g, p, nightK, alpha, dx, dy, dw, dh) {
  if (nightK < 0.99) { g.globalAlpha = alpha; g.drawImage(p.img, p.x, p.y, p.w, p.h, dx, dy, dw, dh); }
  if (nightK > 0.02) { g.globalAlpha = nightK < 0.99 ? alpha * nightK : alpha; g.drawImage(nightImage(p), p.x, p.y, p.w, p.h, dx, dy, dw, dh); }
}

// ------------------------------------------------------------------------------------------------ sprites

class Sprite {
  constructor(place, name, o = {}) {
    const def = place.man.sprites[name]; if (!def) throw new Error(`art.painted: no sprite "${name}" in ${place.name}`);
    this.place = place; this.name = name; this.def = def; this.view = o.view ?? place.viewName;
    this.x = o.x ?? 0; this.y = o.y ?? 0; this.scale = o.scale ?? 1; this.flip = !!o.flip; this.rot = 0; this._rot = 0; this.z = o.z ?? 0;   // rot: the place's own turn (kept); _rot: the mover's (per frame)
    this.alpha = o.alpha ?? 1; this.pose = 0; this.seasons = o.seasons ?? def.seasons ?? null; this.times = o.times ?? null;
    this.shadow = o.shadow ?? def.shadow ?? 0; this.depth = !!o.depth; this.touchable = o.touchable ?? true; this.data = o.data ?? null;
    this.vis = 0; this._seed = hash2(this.x * 0.37, this.y * 0.71, 5) * 100; this._ox = 0; this._oy = 0; this._sx = 1; this._sy = 1; this._bend = 0; this._poke = 0; this._pokeV = 0; this._lift = 0;
    this._sway = null; this._breathe = null; this._mover = null;
    if (o.pose !== undefined) this.setPose(o.pose);
  }
  /** Show a painted pose, by number or by its name from place.json ("names"). */
  setPose(p) { this.pose = typeof p === 'string' ? Math.max(0, (this.def.names || []).indexOf(p)) : p; return this; }
  /** Bend in the wind from the anchor up (plants). amp: lean of the top as a fraction of the height. */
  sway(amp = 0.05, speed = 1) { this._sway = { amp, speed }; return this; }
  /** Slow swelling about the anchor (resting animals). */
  breathe(amp = 0.022, speed = 1) { this._breathe = { amp, speed }; return this; }
  /**
   * Walk along a path [[x,y],...]: the painted poses are shown in turn every `step` units of ground covered (a walk
   * cycle on twos, as in drawn animation), the body bobs, faces its direction, and rests at the ends.
   * o: {poses: [names or numbers] (default: all), speed=36 units/s, step=13, loop:'pingpong'|'loop'|'once', rest=[1.5,4] s, bob=1.6, creep (snail: stretch instead of bob)}
   */
  walk(path, o = {}) {
    const len = [0]; for (let i = 1; i < path.length; i++) len.push(len[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    this._mover = { kind: 'walk', path, len, d: o.start ?? 0, dir: 1, travelled: 0, rest: 0, speed: o.speed ?? 36, step: o.step ?? 13, loop: o.loop ?? 'pingpong', restT: o.rest ?? [1.5, 4], bob: o.bob ?? 1.6, creep: !!o.creep, poses: this._poses(o.poses) };
    return this;
  }
  /**
   * Fly from target to target (bees, butterflies). next() returns {x, y, stay (s)} each time one is reached.
   * o: {speed=120, flutter=14 poses/s, wobble=10}
   */
  fly(next, o = {}) { this._mover = { kind: 'fly', next, target: null, stay: 0, vx: 0, vy: 0, speed: o.speed ?? 120, flutter: o.flutter ?? 14, wobble: o.wobble ?? 10 }; return this; }
  /** One hop to (x, y): an arc with a squash on landing. o: {height=40, time=0.5} */
  hopTo(x, y, o = {}) { this._mover = { kind: 'hop', x0: this.x, y0: this.y, x1: x, y1: y, t: 0, time: o.time ?? 0.5, height: o.height ?? 40, then: this._mover && this._mover.kind !== 'hop' ? this._mover : null }; return this; }
  /**
   * A life of its own, from a small set of painted poses of the same individual: it idles at home (rest and
   * graze poses in turn, breathing, now and then a few hops to a new spot nearby), and when startled it looks up
   * (alert pose), moves away, waits, and comes back. Never used up: it can be startled again and again.
   * o: { home: [x, y], roam: 120 (how far it wanders by itself), idle: ['rest', 'graze'], alert: 'alert',
   *      hop: ['crouch', 'leap', 'land'] (one hop shows them in turn) | walk: [poses] with step,
   *      hopLen: 95, hopTime: 0.46, hopHeight: 34, speed: 60 (walkers), away: 520 (distance) | (s) => [x, y],
   *      look: 0.7 s, wait: [3, 6] s, ground: (x, y) => bool  (where it may go) }
   */
  life(o = {}) {
    this._mover = { kind: 'life', o, home: o.home || [this.x, this.y], phase: 'idle', until: 0, idlePose: 0, to: null, hop: null, t: 0, d: 0 };
    return this;
  }
  /** Something touched it or came near: look up, move away, come back later. True if it was at ease before. */
  startle() {
    const m = this._mover; if (!m || m.kind !== 'life' || m.phase === 'alert') return false;
    if (m.phase === 'move' && m.then === 'wait') return false;
    m.phase = 'alert'; m.until = m.t + (m.o.look ?? 0.7); m.hop = null; this._pokeV -= 2; return true;
  }
  /** The answer to a touch: a soft squash and bounce. */
  poke(k = 1) { this._pokeV -= 5 * k; return this; }

  _poses(list) { return list ? list.map((p) => (typeof p === 'string' ? Math.max(0, (this.def.names || []).indexOf(p)) : p)) : this.def.poses.map((_, i) => i); }
  _face(right) { this.flip = (this.def.faces === 'left') === right; }
  get p() { return this.def.poses[this.pose % this.def.poses.length]; }
  get size() { const p = this.p, s = this.scale * (this.depth ? this.place.scaleAt(this.y) : 1), k = this.def.h / this.def.poses[0].h; return { w: p.w * k * s, h: p.h * k * s, s }; }

  _life(m, dt) {
    const o = m.o, P = (n) => Math.max(0, (this.def.names || []).indexOf(n)), idle = o.idle || ['rest'], wait = o.wait || [3, 6]; m.t += dt;
    const go = (x, y, then) => { m.to = [x, y]; m.then = then; m.phase = 'move'; m.hop = null; m.d = 0; };
    const arrive = () => { m.phase = m.then; m.until = m.t + (m.then === 'wait' ? lerp(wait[0], wait[1], hash2(m.t, 2, 2)) : 1.5); this.pose = P(idle[0]); };
    const sc = this.depth ? this.place.scaleAt(this.y) : 1;
    if (m.phase === 'idle') {
      if (m.t > m.until) {
        const r = hash2(Math.floor(m.t * 7), this._seed, 3);
        if (r < 0.3 && (o.roam ?? 120) > 0) {                                        // a few steps to a new spot near home
          const a = hash2(m.t, 4, 8) * TAU, d = (o.roam ?? 120) * (0.3 + 0.7 * hash2(m.t, 5, 8)), x = m.home[0] + Math.cos(a) * d, y = m.home[1] + Math.sin(a) * d * 0.25;
          if (!o.ground || o.ground(x, y)) { go(x, y, 'idle'); return true; }
        }
        m.idlePose = (m.idlePose + 1) % idle.length; this.pose = P(idle[m.idlePose]); m.until = m.t + 2.5 + 5 * r; this._pokeV -= 0.6;
      }
    } else if (m.phase === 'alert') {
      this.pose = P(o.alert || 'alert');
      if (m.t > m.until) {
        let to = typeof o.away === 'function' ? o.away(this) : null;
        if (!to) { const d = o.away ?? 520, dir = this.x > this.place.width / 2 ? 1 : -1; to = [this.x + dir * d, this.y - 20]; }
        go(to[0], to[1], 'wait');
      }
    } else if (m.phase === 'wait') {
      this.pose = P(idle[0]);
      if (m.t > m.until) go(m.home[0], m.home[1], 'idle');
    } else if (m.phase === 'move') {
      const dx = m.to[0] - this.x, dy = m.to[1] - this.y, dist = Math.hypot(dx, dy);
      if (o.hop) {
        if (!m.hop) {
          if (dist < 6) { arrive(); return false; }
          const L = Math.min(dist, (o.hopLen ?? 95) * sc); this._face(dx > 0);
          m.hop = { x0: this.x, y0: this.y, x1: this.x + (dx / dist) * L, y1: this.y + (dy / dist) * L, k: 0 };
        }
        const h = m.hop; h.k += dt / (o.hopTime ?? 0.46); const k = clamp(h.k, 0, 1), air = clamp((k - 0.12) / 0.7, 0, 1);
        this.x = lerp(h.x0, h.x1, ease(air)); this.y = lerp(h.y0, h.y1, ease(air));
        this._lift = Math.sin(air * Math.PI) * (o.hopHeight ?? 34) * sc; this._oy = -this._lift;
        this.pose = P(o.hop[k < 0.12 ? 0 : k < 0.8 ? 1 : Math.min(2, o.hop.length - 1)]);
        if (h.k >= 1.12) m.hop = null;                                               // a breath on the ground between hops
      } else {
        if (dist < 4) { arrive(); return false; }
        if (Math.abs(dx) > 2) this._face(dx > 0);
        const v = (o.speed ?? 60) * sc * dt; this.x += (dx / dist) * Math.min(v, dist); this.y += (dy / dist) * Math.min(v, dist); m.d += v / sc;
        const w = this._poses(o.walk), ph = m.d / (o.step ?? 13); this.pose = w[Math.floor(ph) % w.length]; this._lift = Math.abs(Math.sin(ph * Math.PI)) * 1.6; this._oy = -this._lift;
      }
      return true;
    }
    return false;
  }

  update(dt, env, t) {
    const m = this._mover; this._ox = 0; this._oy = 0; this._sx = 1; this._sy = 1; this._lift = 0; this._rot = 0; this._bend = 0;
    let moving = false;
    if (m && m.kind === 'life') moving = this._life(m, dt);
    else if (m && m.kind === 'walk') {
      if (m.rest > 0) { m.rest -= dt; this.pose = m.poses[0]; }
      else {
        moving = !m.creep;
        const total = m.len[m.len.length - 1], pulse = m.creep ? 0.35 + 0.65 * Math.pow(Math.sin(t * 1.6 + this._seed) * 0.5 + 0.5, 2) : 1, v = m.speed * pulse * dt;
        m.d += v * m.dir; m.travelled += v;
        if (m.d >= total || m.d <= 0) {
          m.d = clamp(m.d, 0, total);
          if (m.loop === 'loop') m.d = 0; else if (m.loop === 'pingpong') m.dir = -m.dir;
          if (m.loop !== 'loop') m.rest = lerp(m.restT[0], m.restT[1], hash2(m.travelled, 3, 9));
        }
        let i = 1; while (i < m.len.length - 1 && m.len[i] < m.d) i++;
        const a = m.path[i - 1], b = m.path[i], k = (m.d - m.len[i - 1]) / ((m.len[i] - m.len[i - 1]) || 1);
        this.x = lerp(a[0], b[0], k); this.y = lerp(a[1], b[1], k);
        this._face((b[0] - a[0]) * m.dir >= 0);
        const ph = m.travelled / m.step;
        if (m.creep) { const q = Math.sin(t * 1.6 + this._seed); this._sx = 1 + 0.06 * q; this._sy = 1 - 0.04 * q; }
        else { this.pose = m.poses[Math.floor(ph) % m.poses.length]; this._lift = Math.abs(Math.sin(ph * Math.PI)) * m.bob; this._oy = -this._lift; }
      }
    } else if (m && m.kind === 'fly') {
      this.pose = Math.floor(t * m.flutter + this._seed) % this.def.poses.length;
      if (!m.target) m.target = m.next(this) || { x: this.x, y: this.y, stay: 1 };
      const dx = m.target.x - this.x, dy = m.target.y - this.y, dist = Math.hypot(dx, dy);
      if (m.stay > 0) { m.stay -= dt; this._ox = Math.sin(t * 5 + this._seed) * 1.5; this._oy = Math.sin(t * 7.3 + this._seed) * 1.5; if (m.stay <= 0) m.target = null; }
      else if (dist < 5) { m.stay = m.target.stay ?? 1; m.vx = m.vy = 0; }
      else {
        const sp = Math.min(m.speed, 30 + dist * 2), w = (noise1(t * 1.7, this._seed) - 0.5) * 2 * m.wobble * Math.min(1, dist / 60);
        const tx = (dx / dist) * sp - (dy / dist) * w * 6, ty = (dy / dist) * sp + (dx / dist) * w * 6, k = Math.min(1, dt * 4);
        m.vx += (tx - m.vx) * k; m.vy += (ty - m.vy) * k; this.x += m.vx * dt; this.y += m.vy * dt;
        if (Math.abs(m.vx) > 4) this._face(m.vx > 0);
        this._rot = clamp(m.vy / 200, -0.5, 0.5) * (this.flip ? -1 : 1);
      }
    } else if (m && m.kind === 'hop') {
      m.t += dt / m.time; const k = clamp(m.t, 0, 1);
      this.x = lerp(m.x0, m.x1, k); this.y = lerp(m.y0, m.y1, k); this._lift = Math.sin(k * Math.PI) * m.height; this._oy = -this._lift;
      this._sy = 1 + 0.12 * Math.sin(k * Math.PI); this._sx = 1 / this._sy;
      if (m.x1 !== m.x0) this._face(m.x1 > m.x0);
      if (m.t >= 1) { this._mover = m.then; this._pokeV -= 3; }
    }
    if (this._breathe && !moving) { const q = Math.sin(t * 1.9 * this._breathe.speed + this._seed) * this._breathe.amp; this._sy *= 1 + q; this._sx *= 1 - q * 0.5; }
    if (this._sway) {
      // it moves as the picture under it moves: the wind's fronts and what a finger stirs (place.motionAt)
      const s = this._sway, k = Math.min(1.6, this.place.motionAt(this.x, this.y) / 0.63), w = Math.min(1.6, this.place._wind / 0.63);
      this._bend = s.amp * ((Math.sin(t * 1.3 * s.speed + this._seed) * 0.6 + Math.sin(t * 0.73 * s.speed + this._seed * 1.7) * 0.4) * (1 + 2.2 * k) + w * 1.3 + ((env.stormy ?? 0) > 0.3 ? Math.sin(t * 6 + this._seed) * 0.5 : 0));
    }
    // the squash and bounce of a poke: a damped spring on the height
    if (this._poke !== 0 || this._pokeV !== 0) {
      this._pokeV += (-this._poke * 180 - this._pokeV * 9) * dt; this._poke += this._pokeV * dt;
      if (Math.abs(this._poke) < 0.001 && Math.abs(this._pokeV) < 0.01) this._poke = this._pokeV = 0;
      this._sy *= 1 + this._poke; this._sx *= 1 - this._poke * 0.6; this._bend += this._poke * 0.12;
    }
  }

  draw(g, nightK) {
    const a = this.alpha * this.vis; if (a <= 0.003) return;
    const p = this.p; if (!p.img) return;
    const { w, h } = this.size, grow = 0.75 + 0.25 * ease(this.vis);
    if (this.shadow > 0) {
      const k = 1 / (1 + this._lift * 0.03), rx = w * 0.46 * this.shadow * k, ry = rx * 0.2;
      g.globalAlpha = a * 0.5 * k; g.globalCompositeOperation = 'multiply';
      g.drawImage(shadowTexture(), this.x - rx + w * 0.04, this.y - ry * 0.75, rx * 2, ry * 2);
      g.globalCompositeOperation = 'source-over';
    }
    g.save();
    g.translate(this.x + this._ox, this.y + this._oy); const rot = this.rot + this._rot; if (rot) g.rotate(rot);
    g.scale((this.flip ? -1 : 1) * this._sx * grow, this._sy * grow);
    const x0 = -p.anchor[0] * w, y0 = -p.anchor[1] * h;
    if (!this._bend) blit(g, p, nightK, a, x0, y0, w, h);
    else {
      // a bend from the anchor up: strips, each sheared so that the edges meet (no steps in a stem)
      const n = 5, top = p.anchor[1] * h, fl = this.flip ? -1 : 1, off = (hh) => this._bend * fl * h * Math.pow(Math.max(0, hh) / h, 2) * 1.6;
      if (!p.atlas && nightK > 0.02) nightImage(p);
      for (let i = 0; i < n; i++) {
        const r0 = i / n, r1 = (i + 1) / n, ya = y0 + r0 * h, yb = y0 + r1 * h, da = off(top - r0 * h), db = off(top - r1 * h), k = (db - da) / (yb - ya);
        g.save(); g.transform(1, 0, k, 1, da - k * ya, 0);
        const strip = { img: p.img, atlas: p.atlas, night: p.night, x: p.x, y: p.y + r0 * p.h, w: p.w, h: (r1 - r0) * p.h + (i < n - 1 ? 1 : 0) };
        blit(g, strip, nightK, a, x0, ya, w, yb - ya + (i < n - 1 ? h / p.h : 0));
        g.restore();
      }
    }
    g.restore(); g.globalAlpha = 1;
  }

  /** Is the world point on the painted pixels of this sprite? (alpha-precise, from the manifest's hit mask) */
  contains(px, py) {
    const p = this.p, { w, h } = this.size;
    let lx = (px - this.x - this._ox) / (this._sx || 1), ly = (py - this.y - this._oy) / (this._sy || 1); if (this.flip) lx = -lx;
    const u = lx / w + p.anchor[0], v = ly / h + p.anchor[1];
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
    const m = p.hit; if (!m) return true;
    if (!m.rows) m.rows = unpack(m.bits);
    const i = Math.floor(v * m.h) * m.w + Math.floor(u * m.w);
    return (m.rows[i >> 3] & (128 >> (i & 7))) !== 0;
  }
}

// ------------------------------------------------------------------------------------------------ place

class Place {
  constructor(name, man, pixelHeight) {
    this.name = name; this.man = man; this.height = 1000; this.pixelHeight = pixelHeight;
    this.sprites = []; this.grown = []; this._t = null; this._freed = false; this._states = {};
    this.fade = 3.2;      // seconds a season's wash takes to cross a view
    this.tooth = 0;       // 0..1 paper grain added by the compositor (for soft, enlarged backgrounds)
    this.washFrom = null; // [x, y]: where the next season wash starts (the place sets it from the gesture); else mid-view
    this.motion = 'auto'; // the moving background: 'auto' (the view's flow, else invented wind) | 'wind' | 'clip' (lab comparison) | 'off'
    this.stormMix = null; // lab only: force how far the storm map is blended in (0..1); null = the engine's env.stormy
    this.water = true;    // false: the view's water clip stays off (the water moves by the field alone)
    this.flat = false;    // true: always draw the paintings into the scene canvas (no moving background)
    this.wind = null;     // a number overrides the weather's motion level (see MOTION)
    this.live = false;    // was the last frame's background drawn by the compositor (moving)?
    this._lv = 0; this._wind = 0; this._phase = 0; this._phase2 = 0; this._tm = 0;
    this.show(Object.keys(man.views)[0]);
  }

  // ---- views
  /** Show another view of the place. The old view's paintings are freed; the new one's load lazily in draw(). */
  show(viewName) {
    if (!this.man.views[viewName]) throw new Error(`art.painted: no view "${viewName}" in ${this.name}`);
    if (this.v && this.v.name !== viewName) { this._freeState(this.v.cur); if (this.v.tr) this._freeState(this.v.tr.next); this.v.cur = this.v.tr = null; this.v.loading = null; if (this.v.mo && this.v.mo.clip) this.v.mo.clip.pause(); }
    this.viewName = viewName;
    this.v = this._states[viewName] || (this._states[viewName] = { name: viewName, def: this.man.views[viewName], cur: null, tr: null, loading: null, regions: null });
    this.width = this.v.def.width; this.safe = this.v.def.safe;
    return this;
  }
  /**
   * The part of the view a screen of the given aspect shows (cover fit: the painting always fills the screen and the
   * view's safe area stays inside): { x, y, w, h } in world units. Tablets crop the sides, wide phones top and bottom.
   */
  frame(aspect) {
    const W = this.width, H = 1000, sc = (this.safe[0] + this.safe[1]) / 2;
    if (W / H >= aspect) { const w = H * aspect; return { x: clamp(sc - w / 2, 0, W - w), y: 0, w, h: H }; }
    const h = W / aspect; return { x: 0, y: (H - h) * 0.85, w: W, h };                // the ground, where the child plays, stays; the sky gives
  }

  // ---- regions (what a finger is over): masks from the manifest, 8 world units per cell
  _regions() {
    const v = this.v; if (v.regions) return v.regions; const R = v.def.regions;
    v.regions = R ? { cell: R.cell, w: R.w, h: R.h, names: Object.keys(R.bits), bits: Object.fromEntries(Object.entries(R.bits).map(([n, b]) => [n, unpack(b)])) } : { cell: 8, w: 0, h: 0, names: [], bits: {} };
    // a 'cloud' region (the painted clouds, for the engine's rain: place.region says 'cloud' there) is sky for the
    // moving background and the storm veil
    const b = v.regions.bits; v.regions.sky = b.cloud && b.sky ? b.sky.map((x, i) => x | b.cloud[i]) : b.sky || b.cloud || null;
    return v.regions;
  }
  /** Is the world point inside the named region of the current view? */
  inRegion(name, x, y) {
    const R = this._regions(), bits = R.bits[name]; if (!bits) return false;
    const cx = Math.floor(x / R.cell), cy = Math.floor(y / R.cell); if (cx < 0 || cy < 0 || cx >= R.w || cy >= R.h) return false;
    const i = cy * R.w + cx; return (bits[i >> 3] & (128 >> (i & 7))) !== 0;
  }
  /** The region under a world point (the last one declared wins where they overlap), or null. */
  region(x, y) { const R = this._regions(); for (let i = R.names.length - 1; i >= 0; i--) if (this.inRegion(R.names[i], x, y)) return R.names[i]; return null; }
  /** The first y at or below (x, y) that lies in the region (where a falling thing lands), or null. */
  below(name, x, y) { const R = this._regions(); for (let yy = Math.max(0, y); yy < 1000; yy += R.cell) if (this.inRegion(name, x, yy)) return yy; return null; }

  // ---- backgrounds
  _level(key) {
    const lv = this.v.def.backgrounds[key].levels; let best = lv[0];
    for (const l of lv) if (l.h >= this.pixelHeight * 0.9 && l.h < best.h) best = l;
    return best;
  }
  async _load(key) {
    const l = this._level(key), dir = new URL(this.name + '/', BASE);
    const tiles = await Promise.all(l.tiles.map(async (t) => ({ img: await loadBitmap(new URL(t.f, dir)), x: t.x, w: t.w })));
    return { key, k: 1000 / l.h, w: l.w, h: l.h, tiles };
  }
  _has(season, night) { return !!this.v.def.backgrounds[night ? season + '@night' : season]; }
  async _loadSeason(season, needNight) {
    const s = this._has(season) ? season : Object.keys(this.v.def.backgrounds).find((k) => !k.includes('@'));
    const st = { season, key: s, day: null, night: null };
    const jobs = [this._load(s).then((b) => { st.day = b; })];
    if (needNight && this._has(s, true)) jobs.push(this._load(s + '@night').then((b) => { st.night = b; }));
    await Promise.all(jobs); return st;
  }
  _freeState(st) { if (!st) return; for (const b of [st.day, st.night]) if (b) this._freeSet(b); st.day = st.night = null; }
  _freeSet(b) { compositor.release(b); for (const t of b.tiles) close(t.img); }

  /** Where the painted sun (and moon) of the current view stands: { x, y, r } in world units from place.json (views.<v>.sun), or null. */
  get sun() { return this.v.def.sun || null; }

  /** True when every painting the current env needs has arrived (a season wash may still be spreading). */
  get settled() { const v = this.v; return !!v.cur && !v.loading && !v.cur._nl && (this._needNight ? !this._has(v.cur.key, true) || !!v.cur.night : true); }

  /** Free every bitmap. Call from the place's leave(). */
  free() {
    this._freed = true;
    for (const v of Object.values(this._states)) { this._freeState(v.cur); if (v.tr) this._freeState(v.tr.next); v.cur = v.tr = null; }
    for (const s of Object.values(this.man.sprites)) for (const p of s.poses) { if (!p.atlas) close(p.img); p.img = null; p.night = null; }
    for (const a of Object.values(this.man.atlases || {})) { close(a.img); a.img = null; a.night = null; }
    for (const v of Object.values(this._states)) {
      if (v.regionTex) compositor.release(v.regionTex);
      if (v.wa) { const W = v.wa; if (W.base) { compositor.release(W.base); close(W.base.img); W.base.img = null; } compositor.release(W); for (const el of W.all) { el.pause(); el.removeAttribute('src'); el.load(); } v.wa = null; }
      if (v.mo) { for (const F of [v.mo.flow, v.mo.storm]) if (F) { compositor.release(F); close(F.img); F.img = null; } if (v.mo.clip) { v.mo.clip.pause(); v.mo.clip.removeAttribute('src'); v.mo.clip.load(); } v.mo = null; }
    }
    if (current === this) current = null;
    compositor.look = null;
  }

  // ---- things
  /** Add a sprite instance to the current view (or o.view). o: {x, y, scale, flip, z, depth, seasons, times, shadow, touchable, pose, data} */
  add(name, o) { const s = new Sprite(this, name, o); this.sprites.push(s); return s; }
  remove(s) { const i = this.sprites.indexOf(s); if (i >= 0) this.sprites.splice(i, 1); }
  /** A pooled layer of things grown from small painted pieces under a finger (flowers on a meadow). See grow.js. */
  field(o) { const f = new Field(this, o); this.grown.push(f); return f; }
  /** A pooled layer of small painted pieces that let go, fall and settle (leaves, petals, apples). See grow.js. */
  shed(o) { const f = new Shed(this, o); this.grown.push(f); return f; }
  /** The names of a set of pieces (place.json "sets"), e.g. place.set('head-poppy') -> ['head-poppy-1', ...]. */
  set(name) { return (this.man.sets || {})[name] || []; }
  /** Scale of things standing at height y (perspective), from the view's ground line; 1 at the front. */
  scaleAt(y) { const gd = this.v.def.ground; if (!gd) return 1; return clamp(lerp(gd.farScale, 1, (y - gd.farY) / (gd.nearY - gd.farY)), gd.farScale * 0.6, 1.3); }
  /** The topmost touchable sprite under a world point, or null. A sprite that is not shown (alpha x vis at or under
   *  0.5: hidden by the place, fading, or out of season) answers no touch. */
  hit(x, y) { const list = this._sorted || []; for (let i = list.length - 1; i >= 0; i--) { const s = list[i]; if (s.touchable && s.alpha * s.vis > 0.5 && s.contains(x, y)) return s; } return null; }

  _nightMix(env) {
    let gk = GRADE_K[env.time] ?? 0;
    if (env.prev && env.blend !== undefined && env.blend < 1) gk = lerp(GRADE_K[env.prev.time] ?? gk, gk, clamp(env.blend, 0, 1));
    return [nightness(env), gk];
  }

  // ---- the moving background
  _mo() {
    const v = this.v; if (v.mo) return v.mo;
    const tw = Math.ceil(this.width / MOTION.cell), th = Math.ceil(1000 / MOTION.cell), M = v.def.motion;
    const mo = (v.mo = { touch: { w: tw, h: th, f: new Float32Array(tw * th), data: new Uint8Array(tw * th), gen: 0, live: false }, last: new Map(), flow: null, storm: null, clip: null });
    // the view's motion source: a flow atlas (tools/motion/flow.py); optionally a second one measured from a storm clip
    // of the same painting (motion.storm), which the shader blends in by the storm level
    for (const key of ['flow', 'storm']) {
      if (!M || !M[key]) continue;
      const F = { ...M[key], img: null }, dir = new URL(this.name + '/', BASE);
      loadBitmap(new URL(F.f, dir), true).then((b) => { if (this._freed) close(b); else { F.img = b; mo[key] = F; } }).catch((e) => console.warn(String(e)));
    }
    return mo;
  }
  /**
   * Something stirs the picture at a point: a finger's stroke, a creature landing. The painting moves there, and only
   * there, and comes to rest in about MOTION.rest seconds; grown things and swaying sprites near it move with it.
   * p: { x, y, id, k } or an array of them, world units; id (the finger) makes fast strokes stir more than slow ones;
   * k scales the strength (default 1). Plain data, any number of fingers. Call gustEnd(id) when the finger lifts.
   */
  gust(p) {
    if (Array.isArray(p)) { for (const q of p) this.gust(q); return; }
    const mo = this._mo(), tm = mo.touch, last = p.id !== undefined ? mo.last.get(p.id) : null;
    const add = (p.k ?? 1) * (last ? Math.min(0.5, 0.1 + Math.hypot(p.x - last[0], p.y - last[1]) * 0.007) : 0.35);
    if (p.id !== undefined) mo.last.set(p.id, [p.x, p.y]);
    // a soft patch, wider than high, smaller far off (the grass there is smaller)
    const c = MOTION.cell, cx = p.x / c - 0.5, cy = p.y / c - 0.5, r = 7 * (0.45 + 0.55 * this.scaleAt(p.y)), f = tm.f;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(tm.h - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r * 1.3)); x <= Math.min(tm.w - 1, Math.ceil(cx + r * 1.3)); x++) {
      const dx = (x - cx) / 1.3, dy = y - cy, i = y * tm.w + x; f[i] = Math.min(1, f[i] + add * Math.exp(-(dx * dx + dy * dy) / (r * r * 0.28)));
    }
    tm.live = true;
  }
  gustEnd(id) { if (this.v.mo) this.v.mo.last.delete(id); }
  /**
   * How strongly the picture moves at a world point right now: the weather's level in its gust fronts plus what
   * fingers have stirred there (0 = at rest, about 0.6 = wind, above 1.4 = storm; under a finger up to +0.95).
   * A place uses it to make its own things feel the same wind as the painting under them.
   */
  motionAt(x, y) {
    const wind = (this._wind = this._lv * gustAt(x / 1000, y / 1000, this._tm)), mo = this.v.mo; if (!mo || !mo.touch.live) return wind;
    const tm = mo.touch, c = MOTION.cell, cx = clamp(Math.floor(x / c), 0, tm.w - 1), cy = clamp(Math.floor(y / c), 0, tm.h - 1);
    return wind + tm.f[cy * tm.w + cx] * MOTION.touch;
  }
  // the regions as a texture for the compositor: r crown, g meadow, b water, a sky; edges softened so nothing tears
  _regionTex() {
    const v = this.v; if (v.regionTex) return v.regionTex;
    const R = this._regions(), w = Math.max(1, R.w), h = Math.max(1, R.h), n = w * h, data = new Uint8Array(n * 4), m = new Float32Array(n), q = new Float32Array(n);
    REGION_CH.forEach((name, ch) => {
      const b = name === 'sky' ? R.sky : R.bits[name]; if (!b) return;
      for (let i = 0; i < n; i++) m[i] = (b[i >> 3] & (128 >> (i & 7))) ? 1 : 0;
      for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; q[i] = (m[x > 0 ? i - 1 : i] + 2 * m[i] + m[x < w - 1 ? i + 1 : i]) / 4; }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; m[i] = (q[y > 0 ? i - w : i] + 2 * q[i] + q[y < h - 1 ? i + w : i]) / 4; }
      }
      for (let i = 0; i < n; i++) data[i * 4 + ch] = Math.round(m[i] * 255);
    });
    return (v.regionTex = { data, w, h });
  }
  _gains(season) { const g = { ...(MOTION.gains[season] || {}), ...(((this.v.def.motion || {}).gains || {})[season] || {}) }; return REGION_CH.map((n) => g[n] ?? 1); }
  // the plain clip of a view, for comparison in the lab (place.motion = 'clip'): a muted looping video that pauses with the page
  _clip(mo) {
    const C = (this.v.def.motion || {}).clip; if (!C) return null;
    if (!mo.clip) {
      const el = (mo.clip = document.createElement('video')); el.muted = true; el.loop = true; el.playsInline = true; el.setAttribute('playsinline', ''); el.preload = 'auto';
      el.src = new URL(C.f, new URL(this.name + '/', BASE)).href;
      document.addEventListener('visibilitychange', () => { if (!mo.clip) return; if (document.hidden) el.pause(); else if (this.motion === 'clip' && this.v.mo === mo) el.play().catch(() => {}); });
    }
    if (mo.clip.paused && !document.hidden) mo.clip.play().catch(() => {});
    return mo.clip;
  }

  // Water that really flows (manifest views.<v>.water, from a clip of the view's water, see cutout.py water): a muted
  // looping video shown by the backdrop pass inside the water region over the still painting, its change against
  // the still it was made from carried onto every season and night variant. Nothing answers a touch there; the
  // weather swells it a little (playback rate). Returns what the pass needs, or null until the first frame is there.
  // Each clip is two copies that take turns (lead 2026-10-03, the owner: "it makes a visible jump before it restarts"):
  // the WebView's own loop seeks back at the end and held the last frame about 100 ms at every restart (tablet,
  // measured). Here the shown copy plays to its end and hands over to the other, which waits at its first frame and
  // starts within one frame (27-50 ms, measured); the finished copy rewinds out of sight. W.video / W.storm are the
  // copies that show now.
  _water(env, live) {
    const v = this.v, D = v.def.water; if (!D || this.motion === 'off' || this.water === false) return null;
    let W = v.wa;
    if (!W) {
      const dir = new URL(this.name + '/', BASE);
      const mk = (f) => {
        const el = document.createElement('video'); el.muted = true; el.loop = false; el.playsInline = true; el.setAttribute('playsinline', ''); el.preload = 'auto'; el.src = new URL(f, dir).href;
        // count the frames the video presents: the backdrop pass uploads a new one only then (24 a second), not at every
        // screen frame its currentTime moved (120 a second on the tablet: the water views ran at 57-72 fps, 2026-10-03)
        if ('requestVideoFrameCallback' in el) { el.qgFrames = 0; const cb = () => { el.qgFrames++; el.requestVideoFrameCallback(cb); }; el.requestVideoFrameCallback(cb); }
        return el;
      };
      const pair = (f) => ({ els: [mk(f), mk(f)], i: 0 });
      // the calm clip and, if the view has one, the storm's (blended in by the storm level, each looping on its own);
      // the base carries the mask in its alpha when the export made one (the surf band), else the region decides
      const vp = pair(D.f), sp = D.storm ? pair(D.storm.f) : null;
      W = v.wa = { vp, sp, video: vp.els[0], storm: sp ? sp.els[0] : null, all: [...vp.els, ...(sp ? sp.els : [])], base: null, mask: !!D.mask, box: D.box, ch: REGION_CH.map((n) => (n === (D.region || 'water') ? 1 : 0)), seconds: D.seconds, rate: 1, mix: 0 };
      loadBitmap(new URL(D.base, dir), true).then((b) => { if (this._freed || v.wa !== W) close(b); else W.base = { img: b, rgba: W.mask }; }).catch((e) => console.warn(String(e)));
      document.addEventListener('visibilitychange', () => { if (v.wa !== W) return; if (document.hidden) for (const el of W.all) el.pause(); });
    }
    const ready = (el) => el && el.readyState >= 2, mix = W.storm ? (this.stormMix ?? clamp(env.stormy ?? 0, 0, 1)) : 0;
    W.mix = W.storm && ready(W.storm) ? mix : 0;                                   // until the storm clip is there, the calm one shows
    // each clip plays only while it shows (its weight above 0), in live frames of a visible page; at its end the
    // shown copy hands over to the waiting one
    const turn = (P, on) => {
      if (!P) return null;
      const A = P.els[P.i], B = P.els[1 - P.i];
      if (!on || !live || document.hidden) { for (const el of P.els) if (!el.paused) el.pause(); return A; }
      const d = A.duration;
      if (d > 0 && (A.ended || A.currentTime >= d - 0.002)) {
        if (ready(B) && B.currentTime === 0 && !B.seeking) {
          P.i = 1 - P.i; try { B.playbackRate = A.playbackRate; } catch (e) { /* not every browser lets it */ }
          B.play().catch(() => {}); A.pause(); A.currentTime = 0; return B;
        }
        A.currentTime = 0;                                                         // the other copy is not ready: a plain restart
      }
      if (A.paused) A.play().catch(() => {});
      return A;
    };
    W.video = turn(W.vp, mix < 0.995); W.storm = turn(W.sp, mix > 0.005);
    if (!live) return null;
    const rate = 1 + 0.2 * (env.wet ?? 0) + 0.3 * (env.stormy ?? 0);
    if (Math.abs(rate - W.rate) > 0.02) { W.rate = rate; for (const el of W.all) { try { el.playbackRate = rate; } catch (e) { /* not every browser lets it */ } } }
    return W.base && (W.mix > 0.995 || ready(W.video)) ? W : null;
  }

  // Rain, storm and snow cloud painted into the sky only (the view's 'sky' region), wet in wet: the sun or moon goes
  // behind it, the land keeps its light. Drawn small and enlarged, so every edge is soft.
  _veil(g, env, t, night) {
    const stormy = env.stormy ?? 0, k = Math.max((env.wet ?? 0) * 0.72, stormy, (env.snowy ?? 0) * 0.5, (env.foggy ?? 0) * 0.35); if (k < 0.02) return false;
    const R = this._regions(), v = this.v; if (!R.sky) return false;
    const cw = Math.ceil(this.width / 5), ch = 200;
    if (!v.skyMask) {
      const m = document.createElement('canvas'); m.width = R.w; m.height = R.h; const mg = m.getContext('2d'), im = mg.createImageData(R.w, R.h), b = R.sky;
      const cr = R.bits.crown;                                                      // crowns stand before the sky: a third of the cloud lies over them, so their gaps do not shine
      for (let i = 0; i < R.w * R.h; i++) im.data[i * 4 + 3] = (b[i >> 3] & (128 >> (i & 7))) ? 255 : cr && (cr[i >> 3] & (128 >> (i & 7))) ? 84 : 0;
      mg.putImageData(im, 0, 0);
      // widened a little and blurred: the cloud creeps over the edges of crowns and hills instead of leaving a bright rim
      const w = document.createElement('canvas'); w.width = cw; w.height = ch; const wg = w.getContext('2d'); wg.imageSmoothingQuality = 'high';
      if ('filter' in wg) wg.filter = 'blur(2px)';
      for (const [ox, oy] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) wg.drawImage(m, ox, oy, cw, ch);
      v.skyMask = w;
    }
    const c = this._veilC || (this._veilC = document.createElement('canvas'));
    const day = stormy > 0.5 ? [72, 76, 108] : (env.snowy ?? 0) > (env.wet ?? 0) ? [196, 200, 216] : [150, 156, 182], col = day.map((x, i) => Math.round(lerp(x, [30, 36, 70][i], night * 0.85)));
    // the cloud drifts slowly: it is painted afresh six times a second, not every frame (no gradients per frame)
    const vk = `${v.name}|${col}|${Math.floor(t * 6)}`;
    if (this._veilKey !== vk || c.width !== cw) {
      this._veilKey = vk; if (c.width !== cw) { c.width = cw; c.height = ch; }
      const cg = c.getContext('2d'); cg.globalCompositeOperation = 'source-over'; cg.globalAlpha = 1; cg.clearRect(0, 0, cw, ch);
      const gr = cg.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0, `rgba(${col},0.8)`); gr.addColorStop(0.35, `rgba(${col},0.55)`); gr.addColorStop(0.6, `rgba(${col},0.16)`); gr.addColorStop(1, `rgba(${col},0.12)`);
      cg.fillStyle = gr; cg.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 14; i++) {                                                 // heavier and lighter billows, drifting
        const h = hash2(i, 1, 63), h2 = hash2(i, 2, 63), dark = i % 3 !== 0, rx = (60 + 110 * h2) * (cw / 400), ry = 16 + 30 * h, span = cw + 2 * rx;
        const x = ((h * span + t * (1.2 + 2.2 * h2) * (1 + stormy)) % span) - rx, y = ch * (0.04 + 0.4 * h2 * h2 + 0.14 * h);
        const q = dark ? 0.72 : 1.3, cc = col.map((u) => Math.min(255, Math.round(u * q)));
        const rg = cg.createRadialGradient(x, y, 0, x, y, rx); rg.addColorStop(0, `rgba(${cc},0.42)`); rg.addColorStop(1, `rgba(${cc},0)`);
        cg.save(); cg.translate(x, y); cg.scale(1, ry / rx); cg.translate(-x, -y); cg.fillStyle = rg; cg.beginPath(); cg.arc(x, y, rx, 0, TAU); cg.fill(); cg.restore();
      }
      cg.globalCompositeOperation = 'destination-in'; cg.imageSmoothingEnabled = true; cg.imageSmoothingQuality = 'high'; cg.drawImage(v.skyMask, 0, 0, cw, ch);
    }
    g.globalAlpha = Math.min(1, k * 0.95); g.drawImage(c, 0, 0, this.width, 1000); g.globalAlpha = 1;
    return true;
  }

  _bg(g, st, view, nm) {
    const drawSet = (b, alpha) => {
      if (!b) return; g.globalAlpha = alpha;
      for (const t of b.tiles) { const x = t.x * b.k, w = t.w * b.k; if (x > view.x + view.w || x + w < view.x) continue; g.drawImage(t.img, x, 0, w + 0.6, 1000); }
      g.globalAlpha = 1;
    };
    if (st.night && nm > 0.99) drawSet(st.night, 1);
    else { drawSet(st.day, 1); if (st.night && nm > 0.01) drawSet(st.night, nm); }
  }

  /**
   * Draw the current view: background (crossfading to the night painting by time of day; a season change spreads as
   * a wash from place.washFrom or the middle of the view), things lying on the ground, sprites and grown things in
   * depth order with contact shadows, falling things, lights. Call once per frame with the engine's env and the
   * visible rect in world units; t in seconds. Loading is lazy: until a new season has arrived the old one stays.
   */
  draw(g, env, view, t = 0) {
    if (this._freed) return;
    const v = this.v, dt = this._t === null ? 0 : clamp(t - this._t, 0, 0.05); this._t = t; current = this;
    // the moving background: this frame's motion level from the weather, the loop's phase, the stroke map coming to rest
    const windy = env.windy ?? 0, stormy = env.stormy ?? 0, mo = this._mo(), tm = mo.touch;
    this._lv = this.motion === 'off' ? 0 : this.wind ?? (MOTION.still + MOTION.wind * Math.pow(windy, 1.3) + MOTION.storm * stormy);
    const rate = MOTION.rate[0] + MOTION.rate[1] * windy + MOTION.rate[2] * stormy;
    this._phase = (this._phase + dt * rate / ((mo.flow && mo.flow.seconds) || 5)) % 1; this._tm = t % 3600;
    this._phase2 = (this._phase2 + dt * rate / ((mo.storm && mo.storm.seconds) || 5)) % 1;   // the storm map's loop, with its own length
    if (tm.live) {
      const fade = Math.exp(-dt / (MOTION.rest / 3)), f = tm.f, d = tm.data; let any = false;
      for (let i = 0; i < f.length; i++) { const x = f[i] * fade; f[i] = x; d[i] = x * 255; if (x > 0.004) any = true; }
      if (!any) { f.fill(0); d.fill(0); } tm.live = any; tm.gen++;
    }
    const season = env.season || 'summer', [nm, gk] = this._nightMix(env), nightPainted = !!v.cur && this._has(v.cur.key, true);
    // what should be loaded
    const target = v.tr ? v.tr.next.season : v.cur ? v.cur.season : null, needNight = nm > 0.01; this._needNight = needNight;
    if (season !== target && v.loading !== season) {
      v.loading = season;
      this._loadSeason(season, needNight).then((st) => {
        if (this._freed || v.loading !== season || this.v !== v) { this._freeState(st); if (v.loading === season) v.loading = null; return; }
        v.loading = null;
        if (!v.cur) { v.cur = st; return; }
        if (v.tr) { this._freeState(v.cur); v.cur = v.tr.next; }
        const o = this.washFrom || [view.x + view.w * 0.5, 620];
        v.tr = { next: st, p: 0, x: o[0], y: o[1], seed: Math.floor(hash2(t, 1, 3) * 1000) };
      }).catch((e) => { v.loading = null; console.warn(String(e)); });
    }
    // the night painting arrives lazily when the light goes, and leaves when it is day again
    for (const st of [v.cur, v.tr && v.tr.next]) {
      if (!st) continue;
      if (needNight && !st.night && !st._nl && this._has(st.key, true)) { st._nl = true; this._load(st.key + '@night').then((b) => { if (this._freed || st.day === null) { for (const q of b.tiles) close(q.img); } else st.night = b; st._nl = false; }).catch(() => { st._nl = false; }); }
      if (!needNight && st.night && nm === 0) { this._freeSet(st.night); st.night = null; }
    }
    const look = (compositor.look = { time: nightPainted ? gk : 1, tooth: this.tooth, veil: false });
    this.live = false;
    if (!v.cur) return;
    // a live frame: the compositor draws the paintings under this (now transparent) scene, moving; else they are drawn here, still
    const live = (this.live = !this.flat && !!g.canvas && compositor.canBackdrop(g.canvas, v.cur.day.w) && (!g.getContextAttributes || g.getContextAttributes().alpha !== false));
    const M = g.getTransform(), cw = live ? g.canvas.width : 1, ch = live ? g.canvas.height : 1;
    if (live) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch); g.restore(); }
    else { this._bg(g, v.cur, view, nm); if (v.wa) this._water(env, false); }
    let front = null, wash = null, gains = this._gains(v.cur.season);
    if (v.tr && live) {
      const tr = v.tr; tr.p += dt / this.fade;
      const R = ease(clamp(tr.p, 0, 1)) * (Math.max(tr.x, this.width - tr.x) + 700), gb = this._gains(tr.next.season), k = clamp(tr.p, 0, 1);
      wash = { x: tr.x, y: tr.y, r: R, seed: tr.seed % 89, fade: 1 - clamp((tr.p - 0.75) / 0.25, 0, 1), next: tr.next }; gains = gains.map((a, i) => lerp(a, gb[i], k));
      front = { x: tr.x, y: tr.y, R, season: tr.next.season };
      if (tr.p >= 1) { this._freeState(v.cur); v.cur = tr.next; v.tr = null; front = wash = null; }
    } else if (v.tr) {
      const tr = v.tr; tr.p += dt / this.fade;
      const R = ease(clamp(tr.p, 0, 1)) * (Math.max(tr.x, this.width - tr.x) + 700), pts = [];
      for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU, k = 1 + 0.16 * (noise1(Math.cos(a) * 1.6 + 5, tr.seed) + noise1(Math.sin(a) * 1.6 + 9, tr.seed + 3) - 1) + 0.05 * (noise1(a * 5 + tr.p * 4, tr.seed + 7) - 0.5); pts.push([tr.x + Math.cos(a) * R * k, tr.y + Math.sin(a) * R * k * 0.8]); }
      const path = () => { g.beginPath(); g.moveTo((pts[39][0] + pts[0][0]) / 2, (pts[39][1] + pts[0][1]) / 2); for (let i = 0; i < 40; i++) { const p = pts[i], q = pts[(i + 1) % 40]; g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); } g.closePath(); };
      g.save(); path(); g.clip(); this._bg(g, tr.next, view, nm);
      // the wet front: water pushes a pale bloom ahead of a darker rim of pigment
      const fa = 1 - clamp((tr.p - 0.75) / 0.25, 0, 1);
      g.lineJoin = 'round'; path(); g.strokeStyle = `rgba(255,252,240,${0.3 * fa})`; g.lineWidth = 46; g.stroke();
      path(); g.strokeStyle = `rgba(60,70,100,${0.16 * fa})`; g.lineWidth = 9; g.stroke();
      g.restore();
      front = { x: tr.x, y: tr.y, R, season: tr.next.season };
      if (tr.p >= 1) { this._freeState(v.cur); v.cur = tr.next; v.tr = null; front = null; }
    }
    if (live) {
      const cur = v.cur, clipDef = (v.def.motion || {}).clip;
      const clip = this.motion === 'clip' && clipDef && (clipDef.seasons || ['summer']).includes(cur.season) && nm < 0.01 ? this._clip(mo) : null;
      if (!clip && mo.clip && !mo.clip.paused) mo.clip.pause();
      compositor.backdrop = {
        fit: [(-M.e / M.a) / this.width, (-M.f / M.d) / 1000, (cw / M.a) / this.width, (ch / M.d) / 1000], size: [this.width, 1000],
        a: { day: cur.day, night: nm > 0.004 && this._has(cur.key, true) ? cur.night : null }, b: wash ? { day: wash.next.day, night: this._has(wash.next.key, true) ? wash.next.night : null } : null,
        night: nm, wash, regions: this._regionTex(), gains,
        mode: this.motion === 'off' ? 3 : clip ? 2 : this.motion !== 'wind' && mo.flow ? 0 : 1, flow: mo.flow, clip,
        storm: mo.storm, stormMix: this.stormMix ?? clamp(stormy, 0, 1), phase2: this._phase2,   // the storm map, blended in by the storm level
        water: this._water(env, true),                                                             // the clip of the water inside its region
        level: this._lv, time: this._tm, phase: this._phase, touch: tm, touchGain: MOTION.touch,
        fallback: (g2, W) => { const k = W / cw; g2.setTransform(M.a * k, 0, 0, M.d * k, M.e * k, M.f * k); this._bg(g2, cur, view, nm); },
      };
    }
    look.veil = this._veil(g, env, t, nm);
    // each thing belongs to the season on its side of the wash front
    const curSeason = v.cur.season, nightK = nightPainted ? nm : 0;
    const seasonAt = (x, y) => (front && Math.hypot(x - front.x, (y - front.y) / 0.8) < front.R ? front.season : curSeason);
    this.seasonAt = seasonAt;
    const list = [];
    for (const s of this.sprites) {
      if (s.view !== v.name) continue;
      const on = (!s.seasons || s.seasons.includes(seasonAt(s.x, s.y))) && (!s.times || s.times.includes(env.time));
      s.vis = clamp(s.vis + (on ? 1 : -1) * (dt > 0 ? dt * 1.8 : 1), 0, 1);
      s.update(dt, env, t); list.push(s);
    }
    list.sort((a, b) => (a.y + a.z) - (b.y + b.z)); this._sorted = list;
    const grown = this.grown.filter((f) => f.view === v.name);
    for (const f of grown) f.update(dt, env, t, seasonAt);
    for (const f of grown) if (f.drawGround) f.drawGround(g, nightK);
    // sprites and grown things together, far to near
    const fields = grown.filter((f) => f.drawRange); let lastY = -1e9;
    for (const s of list) {
      const y = s.y + s.z; for (const f of fields) f.drawRange(g, nightK, lastY, y, t, env); lastY = y;
      if (s.x + 400 > view.x && s.x - 400 < view.x + view.w) s.draw(g, nightK);
    }
    for (const f of fields) f.drawRange(g, nightK, lastY, 1e9, t, env);
    for (const f of grown) if (f.drawAir) f.drawAir(g, nightK);
    g.globalAlpha = 1;
    // lights: the view's anchors (windows, lanterns) and the sprites' own
    const dark = clamp(nm * 1.4 + (env.stormy ?? 0) * 0.5, 0, 1);
    if (dark > 0.03) {
      for (const L of v.def.lights || []) {
        if (L.seasons && !L.seasons.includes(curSeason)) continue;
        const fl = 1 - (L.flicker ?? 0.08) * (0.5 + 0.5 * Math.sin(t * 5.3 + L.x));
        light(g, L.x, L.y, L.r ?? 60, L.color || LAMP, (L.strength ?? 1) * dark * fl, { core: L.core });
      }
      for (const s of list) if (s.def.lights && s.vis > 0.5) { const { w, h } = s.size, p = s.def.poses[0]; for (const L of s.def.lights) light(g, s.x + (L.u - p.anchor[0]) * w * (s.flip ? -1 : 1), s.y + (L.v - p.anchor[1]) * h, (L.r ?? 0.5) * h, L.color || LAMP, (L.strength ?? 1) * dark, { core: L.core ? L.core * h : undefined }); }
    }
  }
}

export const painted = {
  /**
   * Open a painted place: reads web/assets/art/<name>/manifest.json and loads its sprite images and atlases.
   * Backgrounds load lazily in draw(). o: {view: the view to show first, pixelHeight: canvas height in device pixels}
   */
  async open(name, o = {}) {
    const dir = new URL(name + '/', BASE), res = await fetch(new URL('manifest.json', dir));
    if (!res.ok) throw new Error(`art.painted: no manifest for ${name}`);
    const man = await res.json(), jobs = [];
    for (const a of Object.values(man.atlases || {})) jobs.push(loadBitmap(new URL(a.f, dir)).then((b) => { a.img = b; }));
    await Promise.all(jobs); jobs.length = 0;
    for (const s of Object.values(man.sprites)) for (const p of s.poses) {
      if (p.a) { p.atlas = man.atlases[p.a]; p.img = p.atlas.img; }
      else { p.x = 0; p.y = 0; jobs.push(loadBitmap(new URL(p.f, dir)).then((b) => { p.img = b; })); }
    }
    await Promise.all(jobs);
    const place = new Place(name, man, o.pixelHeight || 1600);
    if (o.view) place.show(o.view);
    return place;
  },
  LAMP,
};

/** The moving background, for places: art.motion.at(x, y) is the strength at a world point of the place drawn last (see Place.motionAt); art.motion.K are the live knobs. */
export const motion = { at: (x, y) => (current ? current.motionAt(x, y) : 0), K: MOTION };
