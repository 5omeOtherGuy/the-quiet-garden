// The rocks view: the foot of the headland. The big rock pool (enter it), a seal on its flat rock (a white pup beside
// it in winter), a cormorant drying its wings on the stack, waves throwing spray on the outer rocks, the lighthouse
// close above: tap its lamp and it flashes; when it is lit, a finger pressed on it leads the beam across the sky.
import { createLamp } from './lighthouse.js';
import { blit } from '../../art/painted.js';
import { ROCKS as C } from './coords.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function rocksView(B) {
  const { engine, fx, note, sfx } = B, R = engine.random || Math.random;
  let p = null, seal = null, head = null, pup = null, corm = null, gull = null, crab = null, leading = null;
  const lamp = createLamp(engine, { x: C.lamp.x, y: C.lamp.y, len: 1300, r: 16 });
  const spray = [];
  let sprayPieces = [], nextSpray = 1;

  function setup(pl) {
    p = pl; spray.length = 0;
    sprayPieces = ['spray-1', 'spray-2', 'spray-3'].map((n) => p.man.sprites[n] && p.man.sprites[n].poses[0]).filter(Boolean);
    const S = (n, o) => (p.man.sprites[n] ? p.add(n, { view: 'rocks', ...o }) : null);
    seal = S('seal', { x: C.seal[0], y: C.seal[1], pose: 'rest', depth: true });
    if (seal) { seal.breathe(0.02, 0.4); seal.data = { st: 'rest', t: 0 }; }
    head = S('sealhead', { x: C.sealSwim[0], y: C.sealSwim[1], depth: true, touchable: true });
    if (head) { head.alpha = 0; head.data = { t: 0 }; }
    pup = S('pup', { x: C.pup[0], y: C.pup[1], pose: 'lie', depth: true, seasons: ['winter'] });
    if (pup) { pup.breathe(0.03, 0.6); pup.data = { t: 0 }; }
    corm = S('cormorant', { x: C.corm[0], y: C.corm[1], pose: 'spread', depth: true, times: ['dawn', 'day', 'dusk'] });
    if (corm) corm.data = { st: 'stand', t: 0 };
    gull = S('gull', { x: C.gull[0], y: C.gull[1], pose: 'stand', depth: true, times: ['dawn', 'day', 'dusk'] });
    if (gull) gull.breathe(0.012, 0.8);
    crab = S('crab', { x: C.crab[0], y: C.crab[1], pose: 'walk', depth: true, seasons: ['spring', 'summer', 'autumn'] });
    if (crab) crab.walk([C.crab, [C.crab[0] + 140, C.crab[1] + 10]], { speed: 14, step: 6, rest: [2, 6], poses: ['walk'] });
  }
  function burst(x, y, k) {
    const pc = sprayPieces[Math.floor(R() * sprayPieces.length)]; if (!pc) return;
    spray.push({ x, y, k, t: 0, life: 1 + 0.6 * k, pc, flip: R() < 0.5 });
    sfx('wave', { size: clamp(0.3 * k, 0.1, 1), vol: 0.12 + 0.12 * k, x });
  }
  function dive(s, then) { fx.ripple(s.x, s.y + 10, { r: 50, n: 2 }); sfx('splash', { vol: 0.35, x: s.x }); s.data.st = 'away'; s.data.t = 0; if (then) then(); }

  function stroke(s) {
    if (!p || s.phase === 'end') return;
    if (s.over === 'pool' || s.over === 'water') {
      if (s.length % 80 < 16) { fx.ripple(s.x, s.y, { r: 55, n: 1 }); note(4 + Math.floor((s.x / 2000) * 8), { instrument: 'water', vol: 0.22, x: s.x }); }
      if (B.nightGlow() > 0.3) for (let i = 0; i < s.n; i++) if (R() < 0.5) engine.art.fx.burst(s.points[i].x, s.points[i].y, { n: 1, power: 0.1, rgb: '140,255,230' });
      return true;
    }
    if (s.over === 'rock' && s.length % 60 < 14) { sfx('tok', { vol: 0.08, speed: 3, count: 2 }); fx.burst(s.x, s.y, { n: 2, power: 0.3, rgb: '235,245,255' }); note(6 + Math.floor(R() * 4), { instrument: 'marimba', vol: 0.12 }); return true; }   // barnacles close, mussels squirt
  }
  function tap(pt) {
    if (!p) return;
    const s = pt.thing, env = engine.env;
    if (s && s === seal && seal.data.st !== 'away') {
      const d = seal.data;
      if (d.st === 'rest') { d.st = 'look'; d.t = 0; seal.setPose('look'); sfx('snore', { vol: 0.15 }); }
      else { dive(seal); seal.hopTo(C.sealDive[0], C.sealDive[1], { height: 30, time: 0.7 }); }
      return true;
    }
    if (s && s === head) { head.data.t = 99; fx.ripple(head.x, head.y, { r: 40, n: 2 }); sfx('plop', { vol: 0.3 }); return true; }
    if (s && s === pup) { pup.setPose('call'); pup.data.t = 2; sfx('cry', { vol: 0.25, size: 0.2, x: pup.x }); if (seal && seal.data.st === 'rest') { seal.setPose('look'); seal.data.st = 'look'; seal.data.t = 0; } return true; }
    if (s && s === corm) { if (corm.data.st === 'stand') { dive(corm); corm.hopTo(C.corm[0] - 60, C.corm[1] + 120, { height: 50, time: 0.6 }); } return true; }
    if (s && s === gull) { gull.setPose('call'); gull.poke(0.6); sfx('gull', { vol: 0.35, x: gull.x }); engine.after(1.5, () => gull && gull.setPose('stand')); return true; }
    if (s) { s.poke(); return true; }
    if (Math.hypot(pt.x - C.door[0], pt.y - C.door[1]) < 40) { sfx('knock', { count: 3, vol: 0.3 }); lamp.poke(); note(0, { instrument: 'bell', vol: 0.25, delay: 0.5 }); return true; }
    if (Math.hypot(pt.x - C.lamp.x, pt.y - C.lamp.y - 60) < 110) {
      lamp.poke(); fx.burst(C.lamp.x, C.lamp.y, { n: 10, power: 0.5, rgb: '255,240,200' });
      if ((env.foggy || 0) > 0.3) note(0, { instrument: 'drone', octave: -2, dur: 4, vol: 0.45 }); else note(9, { instrument: 'bell', vol: 0.3 });
      return true;
    }
    for (const b of C.breakers) if (Math.hypot(pt.x - b[0], pt.y - b[1]) < 130) { burst(b[0], b[1], 1.4 + 1.6 * (env.stormy || 0)); return true; }
    if (pt.over === 'water') { fx.ripple(pt.x, pt.y, { r: 70, n: 2 }); burst(pt.x, pt.y + 10, 0.5); return true; }
    if (pt.over === 'rock') { sfx('knock', { vol: 0.15 }); note(Math.floor(pt.x / 220), { instrument: 'marimba', vol: 0.25 }); fx.burst(pt.x, pt.y, { n: 4, power: 0.3, rgb: '235,245,255' }); return true; }
  }
  // the lit lamp can be led: press on it, then the beam follows the finger
  function press(pt) { if (lamp.k > 0.3 && Math.hypot(pt.x - C.lamp.x, pt.y - C.lamp.y) < 120) { leading = { n: 0 }; lamp.flash = 0.6; note(7, { instrument: 'bell', vol: 0.25 }); return true; } return false; }
  function drag(pt) { if (!leading) return; const c = clamp((pt.x - C.lamp.x) / 700, -1, 1); lamp.lead = Math.acos(c); lamp.flash = Math.max(lamp.flash, 0.3 * (1 - Math.abs(c))); const st = Math.floor((c + 1) * 4.5); if (st !== leading.n) { leading.n = st; note(st + 3, { instrument: 'glass', vol: 0.2 }); } }
  function release() { leading = null; lamp.lead = null; }

  function update(dt, env) {
    if (!p) return;
    const t = engine.now(), st = env.stormy || 0;
    lamp.update(dt, env);
    if (seal) {
      const d = seal.data; d.t += dt;
      if (d.st === 'look' && d.t > 4) { d.st = 'rest'; seal.setPose('rest'); }
      if (d.st === 'away') {
        seal.alpha = Math.max(0, 1 - d.t * 2);
        if (head) { head.alpha = clamp((d.t - 1.5) * 0.8, 0, 1) * clamp((14 - d.t) * 0.8, 0, 1); head.x = C.sealSwim[0] + Math.sin(d.t * 0.25) * 160; head.y = C.sealSwim[1] + Math.sin(d.t * 0.7) * 6; }
        if (d.t > 15) { d.st = 'rest'; seal.x = C.seal[0]; seal.y = C.seal[1]; seal._mover = null; seal.setPose('look'); seal.alpha = 1; seal.poke(0.6); fx.ripple(C.seal[0], C.seal[1], { r: 60, n: 2 }); engine.after(2, () => seal && seal.data.st === 'rest' && seal.setPose('rest')); }
      }
    }
    if (head && head.data.t > 50) { head.data.t = 0; if (seal) seal.data.t = Math.max(seal.data.t, 13.5); }
    if (pup && pup.data.t > 0) { pup.data.t -= dt; if (pup.data.t <= 0) pup.setPose('lie'); }
    if (corm) {
      const d = corm.data; d.t += dt;
      if (d.st === 'away') { corm.alpha = Math.max(0, 1 - d.t * 2); if (d.t > 7) { d.st = 'stand'; d.t = 0; corm.x = C.corm[0]; corm.y = C.corm[1]; corm._mover = null; corm.alpha = 1; corm.poke(1); fx.burst(corm.x, corm.y - 60, { n: 8, power: 0.4, rgb: '220,240,255' }); } }
      else corm.setPose(env.weather === 'clear' || env.weather === 'wind' ? 'spread' : 'folded');
    }
    // the sea throws spray on the outer rocks: now and then in calm, often and high in a storm
    nextSpray -= dt * (0.25 + 0.6 * (env.windy || 0) + 1.6 * st);
    if (nextSpray <= 0) { nextSpray = 1 + R() * 2; const b = C.breakers[Math.floor(R() * C.breakers.length)]; burst(b[0] + (R() - 0.5) * 60, b[1], 0.5 + 1.8 * st + 0.4 * R()); }
    for (let i = spray.length - 1; i >= 0; i--) { const q = spray[i]; q.t += dt; if (q.t > q.life) spray.splice(i, 1); }
  }
  function draw(g, env) {
    if (!p) return;
    lamp.draw(g, env);
    const nk = engine.art.nightness(env);
    for (const q of spray) {
      const u = q.t / q.life, s = p.scaleAt(q.y) * (0.5 + 0.6 * q.k), w = 300 * s, h = w * q.pc.h / q.pc.w * (0.7 + 0.8 * Math.min(1, u * 3));
      g.save(); g.translate(q.x, q.y); if (q.flip) g.scale(-1, 1);
      blit(g, q.pc, nk, 0.9 * (1 - u) * Math.min(1, u * 8), -w / 2, -h, w, h); g.restore(); g.globalAlpha = 1;
    }
  }
  return { setup, stroke, tap, press, drag, release, update, draw, closed() { p = null; seal = head = pup = corm = gull = crab = null; }, lamp };
}
