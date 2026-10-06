// The sea of the shore view at the water's edge. The waves themselves are the painting moving (its motion map; a storm
// map is blended in by art when it lands): no wave picture comes at the child (owner, 2026-10-03). What code adds is
// small and at the edge only: the lace of foam that runs up the sand and slips back, a little spray where a swell
// breaks, the wet sheen it leaves. Swells are timing only (invisible): they arrive, break at the waterline, and wash.
//   tap the water        the sea answers at the edge: the next swell there comes at once and runs a little further
//   storm                swells come often and run far up the beach, taking things and bringing others
// It is one ground layer of art's painted place (drawn under the creatures, in depth order before them).
import { blit } from '../../art/painted.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

/**
 * cfg: { farY, shore(x) -> waterline y, x0, x1, bank: {x, y, w}, onBreak(wave), onWash(wave, yRun), onGrow(wave) }
 */
export function createSea(engine, p, cfg) {
  const R = engine.random || Math.random;
  // each piece once with soft ends and a soft foot, so it melts into the painted water instead of sitting on it
  const soft = (pc, foot = 0.3, ends = 0.12, top = 0) => {
    if (!pc || !pc.img) return pc;
    const c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h; const g = c.getContext('2d');
    g.drawImage(pc.img, pc.x || 0, pc.y || 0, pc.w, pc.h, 0, 0, pc.w, pc.h);
    g.globalCompositeOperation = 'destination-in';
    let gr = g.createLinearGradient(0, 0, 0, pc.h); gr.addColorStop(0, top ? 'rgba(0,0,0,0)' : '#000'); if (top) gr.addColorStop(top, '#000'); gr.addColorStop(1 - foot, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, pc.w, pc.h);
    gr = g.createLinearGradient(0, 0, pc.w, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(ends, '#000'); gr.addColorStop(1 - ends, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, pc.w, pc.h);
    return { img: c, x: 0, y: 0, w: pc.w, h: pc.h, anchor: pc.anchor };
  };
  const pose = (n, foot, ends, top) => (p.man.sprites[n] ? soft(p.man.sprites[n].poses[0], foot, ends, top) : null);
  const laces = ['foam-1', 'foam-2', 'foam-3'].map((n) => pose(n, 0.1, 0.22, 0.45)).filter(Boolean);
  const sprays = ['spray-1', 'spray-2', 'spray-3'].map((n) => pose(n, 0.25, 0.02)).filter(Boolean);
  const waves = [], sprayList = [], sheens = [];
  let nextIn = 2, serial = 1;

  function spawn(x, d = 0, size = null) {
    const env = engine.env, st = env.stormy || 0, wi = env.windy || 0;
    const base = size ?? (0.55 + 0.35 * R() + 0.45 * wi + 1.6 * st);   // a storm's swells run far up the beach
    const w = {
      id: serial++, x: x ?? lerp(cfg.x0, cfg.x1, R()), span: 260 + 260 * R(), d, size: base, target: base,
      state: 'roll', t: 0, speed: 0.11 + 0.04 * R() + 0.05 * st, k: 0, seed: R() * 100, run: 0, yRun: 0,
      lace: laces[Math.floor(R() * laces.length)], flip: R() < 0.5,
    };
    waves.push(w); if (waves.length > 7) waves.shift();
    return w;
  }
  for (const d0 of [0.15, 0.5, 0.82]) spawn(null, d0);                  // the sea is already moving when the child arrives
  const sc = (y) => p.scaleAt(y);

  /** A touch at (x, y) over the sea: the swell nearest along the shore hurries in (or one starts close to the edge);
   *  each touch lets it run a little further up the sand. Returns the swell. */
  function touch(x, y, k = 1) {
    let best = null, bd = 1e9;
    for (const w of waves) {
      if (w.state !== 'roll') continue;
      const dx = Math.abs(x - w.x) - w.span * 0.6;
      if (dx < 120 && dx < bd) { bd = dx; best = w; }
    }
    const env = engine.env, cap = 1.2 + 0.5 * (env.windy || 0) + 1.6 * (env.stormy || 0);
    if (!best) { best = spawn(x, 0.72, 0.6 + 0.6 * (env.stormy || 0)); best.span = 220 + 120 * R(); }
    best.target = Math.min(cap, best.target + 0.3 * k);
    best.d = Math.max(best.d, 0.72);                   // it comes now: the answer is at the edge within a breath
    best.speed = Math.max(best.speed, 0.2);
    if (cfg.onGrow) cfg.onGrow(best);
    return best;
  }

  function update(dt) {
    const env = engine.env, st = env.stormy || 0, wi = env.windy || 0;
    nextIn -= dt;
    if (nextIn <= 0) { spawn(); nextIn = lerp(6.5, 2.6, clamp(st + 0.5 * wi, 0, 1)) * (0.7 + 0.6 * R()); }
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i]; w.t += dt;
      w.size += (w.target - w.size) * Math.min(1, dt * 3);
      if (w.state === 'roll') {
        w.k = Math.min(1, w.k + dt * 0.8);
        w.d += dt * w.speed * (1 + 0.25 * w.d);
        if (w.d >= 1) {
          w.state = 'wash'; w.t = 0; w.k = 1;
          w.yRun = Math.min(985, cfg.shore(w.x) + 40 + 125 * Math.pow(w.size, 1.35));
          w.dur = 2.6 + 0.9 * w.size;
          const y = cfg.shore(w.x) - 10;
          for (let j = 0; j < 1 + Math.round(w.size * 1.5); j++) sprayList.push({ x: w.x + (R() - 0.5) * w.span * sc(y) * 1.4, y: y - 10, t: 0, life: 0.9 + 0.5 * R() + 0.2 * w.size, s: (0.5 + 0.5 * R()) * (0.6 + 0.5 * Math.min(w.size, 1.2)), piece: sprays[Math.floor(R() * sprays.length)], flip: R() < 0.5 });
          if (cfg.onBreak) cfg.onBreak(w);
        }
      } else {
        // the swash: up the beach, a breath at the top, back down, fading; a wet sheen stays a while
        const u = w.t / w.dur;
        const up = u < 0.42 ? ease(u / 0.42) : u < 0.55 ? 1 : 1 - ease((u - 0.55) / 0.45) * 0.85;
        const y0 = cfg.shore(w.x);
        w.run = lerp(y0, w.yRun, up);
        if (!w.washed && u > 0.36) { w.washed = true; if (cfg.onWash) cfg.onWash(w, w.yRun); sheens.push({ x: w.x, span: w.span * 1.1, y0, y1: w.yRun, t: 0, life: 9 + 3 * w.size }); if (sheens.length > 8) sheens.shift(); }
        w.k = u < 0.55 ? 1 : clamp(1 - (u - 0.55) / 0.45, 0, 1);
        if (u >= 1) waves.splice(i, 1);
      }
    }
    for (let i = sprayList.length - 1; i >= 0; i--) { const s = sprayList[i]; s.t += dt; if (s.t > s.life) sprayList.splice(i, 1); }
    for (let i = sheens.length - 1; i >= 0; i--) { const s = sheens[i]; s.t += dt; if (s.t > s.life) sheens.splice(i, 1); }
  }

  /** a soft half-ellipse of colour below (x, y): a radial gradient squashed to the ellipse, no visible rim */
  function softEllipse(g, x, y, rx, ry, c0, c1) {
    g.save(); g.translate(x, y); g.scale(rx, ry);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, c0); gr.addColorStop(0.55, c0); gr.addColorStop(1, c1);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI); g.fill(); g.restore();
  }
  function drawPiece(g, pc, nightK, alpha, cx, by, w, hk = 1, flip = false) {
    if (!pc) return;
    const h = (w * pc.h / pc.w) * hk;
    if (flip) { g.save(); g.translate(cx, 0); g.scale(-1, 1); blit(g, pc, nightK, alpha, -w / 2, by - h, w, h); g.restore(); }
    else blit(g, pc, nightK, alpha, cx - w / 2, by - h, w, h);
  }

  /** drawn under the creatures: wet sheens, swashes, spray at the edge */
  function draw(g, nightK) {
    const t = engine.now();
    // wet sand that mirrors the sky after a wave went back
    for (const s of sheens) {
      const a = 0.14 * (1 - s.t / s.life) * (1 - nightK * 0.5), k = sc(s.y1), hw = s.span * k * 1.3, hh = Math.max(4, s.y1 - s.y0);
      softEllipse(g, s.x, s.y0, hw, hh, `rgba(150,175,190,${a})`, 'rgba(150,175,190,0)');
    }
    g.globalAlpha = 1;
    // the swells themselves are the painting moving; here only their wash on the sand
    const list = waves.slice().sort((a, b) => a.x - b.x);
    for (const w of list) {
      if (w.state !== 'wash') continue;
      const y0 = cfg.shore(w.x), s = sc(w.run), wid = w.span * 2.2 * s * (0.85 + 0.2 * w.size);
      // clear water under the lace, then the lace at the running edge (in pieces across a wide wave)
      softEllipse(g, w.x, y0 - 10, wid * 0.5, Math.max(6, w.run - y0 + 10), `rgba(185,222,220,${0.26 * w.k})`, 'rgba(200,230,225,0)');
      const n = Math.max(1, Math.round(wid / 520)), pw = (wid / n) * 1.25;
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0 : i / (n - 1) - 0.5, px = w.x + u * (wid - pw * 0.8), lift = (u * u) * (w.run - y0) * 0.9;
        drawPiece(g, laces[(w.id + i) % laces.length] || w.lace, nightK, 0.95 * w.k, px, w.run + 8 * s - lift, pw, 0.8, (w.id + i) % 2 === 0);
      }
    }
    for (const sp of sprayList) {
      const u = sp.t / sp.life, s = sc(sp.y) * sp.s, wid = 220 * s;
      drawPiece(g, sp.piece, nightK, 0.85 * (1 - u) * Math.min(1, u * 8), sp.x, sp.y - u * 60 * s, wid * (0.8 + 0.4 * u), 1, sp.flip);
    }
    g.globalAlpha = 1;
  }

  return {
    view: cfg.view, waves,
    touch, spawn,
    /** the swash line (how far up the sand the water is now) at x, or null */
    runAt(x) { let r = null; for (const w of waves) if (w.state === 'wash' && Math.abs(x - w.x) < w.span * 1.1) r = Math.max(r ?? 0, w.run); return r; },
    // the duck-typed ground layer art's place draws (art/grow.js: update, drawGround)
    layer: { view: cfg.view, stats: { n: 0 }, update: (dt) => update(dt), drawGround: (g, nightK) => draw(g, nightK) },
  };
}
