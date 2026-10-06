// The shell grotto (hidden: under the sandbank at the foot of the headland; storm waves the child makes bigger wash
// the sand away). A round cave whose walls are set with shells.
//   stroke the walls        the shells light up along the finger and sing like glass; the cave sings it back softly
//   tap the pool            rings of light; hold a finger in the pool: little lights rise and circle round it
//   the old turtle          rests in the pool; a touch makes it lift its head and blink, then it swims a slow round
import { paintedInside } from './inside.js';
import { GROTTO as C } from './coords.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const PEARL = [[1, 0.86, 0.92], [0.85, 0.95, 1], [1, 0.95, 0.8], [0.9, 1, 0.95]];

export const grotto = {
  name: 'The Shell Grotto',
  view: 'grotto', world: { w: 2000, h: 1000 },
  views: { grotto: { x: 0, y: 0, w: 2000, h: 1000, safe: { x: 200, y: 0, w: 1600, h: 1000 }, anchorY: 0.6 } },
  music: { preset: 'grotto', echo: { time: 0.52, feedback: 0.45 } },
  exits: C.out.map((e) => ({ ...e, out: true })),
  create(engine) {
    const fx = engine.art.fx, R = engine.random || Math.random;
    const note = (s, o) => engine.audio && engine.audio.note && engine.audio.note(s, o || {});
    const sfx = (n, o) => engine.audio && engine.audio.sfx && engine.audio.sfx.play(n, o || {});
    const sing = (s, o = {}) => { note(s, o); note(s, { ...o, vol: (o.vol || 0.3) * 0.45, delay: 0.7 }); note(s + 2, { ...o, vol: (o.vol || 0.3) * 0.25, delay: 1.4 }); };   // the cave answers
    let p = null, turtle = null;
    const L = { shells: [], motes: [], rest: null, last: new Map() };

    function setup(pl) {
      p = pl;
      turtle = p.man.sprites.turtle ? p.add('turtle', { view: 'grotto', x: C.turtle[0], y: C.turtle[1], pose: 'rest', scale: 1 }).breathe(0.015, 0.5) : null;
      if (turtle) turtle.data = { st: 'rest', t: 0, a: 0 };
    }
    function lightShell(x, y) { L.shells.push({ x, y, t: 0, life: 2.2 + R() * 1.5, c: PEARL[Math.floor(R() * PEARL.length)], r: 16 + R() * 18 }); if (L.shells.length > 140) L.shells.shift(); }
    const inPool = (x, y) => ((x - C.pool.x) / C.pool.rx) ** 2 + ((y - C.pool.y) / C.pool.ry) ** 2 < 1;

    const scene = {
      ownWeather: true,
      setup,
      closed() { p = null; turtle = null; },
      enter() { engine.art.compositor && (engine.art.compositor.interior = 0.7); },
      leave() { engine.art.compositor && (engine.art.compositor.interior = 0); },
      stroke(s) {
        if (!p) return;
        if (s.phase === 'end') { L.last.delete(s.id); L.rest = null; return; }
        const over = s.over;
        if (inPool(s.x, s.y)) { if (s.length % 80 < 16) { fx.ripple(s.x, s.y, { r: 60, n: 1 }); sing(4 + Math.floor(R() * 5), { instrument: 'glass', vol: 0.2 }); } return true; }
        if (over === 'wall' || over === 'crown' || over === 'meadow') {
          let d = (L.last.get(s.id) || 0) + s.speed * 0.016 + 3;
          for (let i = 0; i < s.n; i++) if (R() < 0.5) lightShell(s.points[i].x + (R() - 0.5) * 30, s.points[i].y + (R() - 0.5) * 30);
          if (d > 55) { d = 0; const st = Math.floor(clamp(1 - s.y / 1000, 0, 0.99) * 10) + 2; sing(st, { instrument: 'glass', vol: 0.28, x: s.x }); }
          L.last.set(s.id, d);
          return true;
        }
      },
      tap(pt) {
        if (!p) return;
        if (pt.thing && pt.thing === turtle) {
          const d = turtle.data;
          if (d.st === 'rest') { d.st = 'look'; d.t = 0; turtle.setPose('look'); turtle.poke(0.3); sing(0, { instrument: 'choir', octave: -1, vol: 0.25, dur: 3 }); }
          else if (d.st === 'look') { d.st = 'swim'; d.t = 0; d.a = 0; turtle.setPose('swim'); sfx('bubble', { vol: 0.3 }); }
          return true;
        }
        if (inPool(pt.x, pt.y)) { fx.ripple(pt.x, pt.y, { r: 110, n: 3, rgb: '200,255,245' }); fx.bloom(pt.x, pt.y, { r: 90, rgb: '170,240,235' }); sing(5 + Math.floor(R() * 5), { instrument: 'water', vol: 0.3 }); sfx('bubble', { vol: 0.25 }); return true; }
        for (let i = 0; i < 8; i++) lightShell(pt.x + (R() - 0.5) * 120, pt.y + (R() - 0.5) * 90);
        sing(3 + Math.floor(R() * 7), { instrument: 'celesta', vol: 0.3, x: pt.x });
        return true;
      },
      hold(pt) { if (inPool(pt.x, pt.y)) { L.rest = { x: pt.x, y: pt.y }; return true; } return false; },
      update(dt, env) {
        if (!p) return;
        const t = engine.now();
        // little lights rise from the pool and circle a resting finger; a few drift by themselves
        if ((L.rest && R() < dt * 9) || R() < dt * 0.8) { const a = R() * 6.28; L.motes.push({ x: C.pool.x + Math.cos(a) * C.pool.rx * 0.7 * R(), y: C.pool.y + Math.sin(a) * C.pool.ry * 0.6, t: 0, life: 5 + R() * 4, ph: R() * 6, k: L.rest ? 1 : 0.5 }); }
        for (let i = L.motes.length - 1; i >= 0; i--) {
          const m = L.motes[i]; m.t += dt;
          if (L.rest) { const a = t * 0.9 + m.ph, tx = L.rest.x + Math.cos(a) * 80, ty = L.rest.y - 40 + Math.sin(a) * 50; m.x += (tx - m.x) * dt * 1.2; m.y += (ty - m.y) * dt * 1.2; }
          else { m.y -= dt * 22; m.x += Math.sin(t + m.ph) * dt * 12; }
          if (m.t > m.life) L.motes.splice(i, 1);
        }
        for (let i = L.shells.length - 1; i >= 0; i--) { const q = L.shells[i]; q.t += dt; if (q.t > q.life) L.shells.splice(i, 1); }
        if (turtle) {
          const d = turtle.data; d.t += dt;
          if (d.st === 'look' && d.t > 5) { d.st = 'rest'; turtle.setPose('rest'); }
          if (d.st === 'swim') {
            d.a += dt * 0.45;
            turtle.x = C.pool.x + Math.sin(d.a) * C.pool.rx * 0.6; turtle.y = C.pool.y + (1 - Math.cos(d.a)) * C.pool.ry * -0.25;
            turtle.flip = Math.cos(d.a) < 0;
            if (d.a > Math.PI * 2) { d.st = 'rest'; turtle.setPose('rest'); turtle.x = C.turtle[0]; turtle.y = C.turtle[1]; turtle.flip = false; }
          }
        }
      },
      draw(g) {
        const art = engine.art, t = engine.now();
        art.light(g, C.pool.x, C.pool.y, C.pool.rx * 0.9, [0.45, 0.95, 0.9], 0.35 + 0.08 * Math.sin(t * 0.7), {});
        for (const q of L.shells) { const u = q.t / q.life; art.light(g, q.x, q.y, q.r * 3, q.c, Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u) * 1.1, { core: 3 }); }
        for (const m of L.motes) { const u = m.t / m.life; art.light(g, m.x, m.y, 26, [0.6, 1, 0.92], Math.sin(Math.PI * u) * 0.8 * m.k + 0.1, { core: 2.4 }); }
      },
    };
    return paintedInside(engine, 'grotto', scene);
  },
};
