// The rock pool (instance of the rocks view, plain to see): a small world under clear water, seen from above.
//   anemones close when touched or brushed and open again; the starfish turns an arm; the prawn flicks away from a
//   finger; the gobies dart off, and gather curiously round a finger that rests still (hold); a periwinkle creeps;
//   a stroke rings the water and sings; at night the water glows where it is stirred; rain rings the surface.
import { paintedInside } from './inside.js';
import { POOL as C } from './coords.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const pool = {
  name: 'The Rock Pool',
  view: 'pool', world: { w: 2000, h: 1000 },
  views: { pool: { x: 0, y: 0, w: 2000, h: 1000, safe: { x: 200, y: 0, w: 1600, h: 1000 }, anchorY: 0.5 } },
  music: { preset: 'grotto', room: 'sea', instrument: 'water', shelter: 0.3, underwater: false, ambience: { bubbles: 0.5, waves: 0.4 } },
  exits: C.out.map((e) => ({ ...e, out: true })),
  create(engine) {
    const fx = engine.art.fx, R = engine.random || Math.random;
    const note = (s, o) => engine.audio && engine.audio.note && engine.audio.note(s, o || {});
    const sfx = (n, o) => engine.audio && engine.audio.sfx && engine.audio.sfx.play(n, o || {});
    let p = null;
    const L = { anem: [], fish: [], prawns: [], snails: [], stars: [], glows: [], rest: null };

    function setup(pl) {
      p = pl; L.anem = []; L.fish = []; L.prawns = []; L.snails = []; L.stars = [];
      C.anemones.forEach(([x, y, k], i) => { const s = p.add(k ? 'snakelocks' : 'beadlet', { view: 'pool', x, y, scale: 1.25 + R() * 0.4, pose: 'open', touchable: true }); s.data = { shut: 0 }; s.sway(0.035, 0.6); L.anem.push(s); });
      C.stars.forEach(([x, y]) => { const s = p.add('seastar', { view: 'pool', x, y, scale: 1.3 + R() * 0.3, flip: R() < 0.5 }); s.data = { spin: 0 }; s.rot = R() * 6; L.stars.push(s); });
      for (let i = 0; i < 4; i++) { const s = p.add('goby', { view: 'pool', x: 500 + R() * 1000, y: 450 + R() * 400, scale: 1.1 + R() * 0.4, pose: 'still', z: 200 }); s.data = { tx: s.x, ty: s.y, t: 0, flee: 0 }; L.fish.push(s); }
      for (let i = 0; i < 2; i++) { const s = p.add('prawn', { view: 'pool', x: 700 + i * 600, y: 520 + R() * 200, scale: 1.25, z: 150 }); s.data = { tx: s.x, ty: s.y, t: 0, flee: 0 }; s.alpha = 0.92; L.prawns.push(s); }
      C.snails.forEach(([x, y]) => { const s = p.add('periwinkle', { view: 'pool', x, y, scale: 1.3 }).walk([[x, y], [x + 160, y + 30], [x + 60, y + 90]], { speed: 4, creep: true, rest: [4, 9], loop: 'loop' }); L.snails.push(s); });
      const hermit = p.add('hermit', { view: 'pool', x: C.hermit[0], y: C.hermit[1], pose: 'out', scale: 1.4 }).walk([C.hermit, [C.hermit[0] + 260, C.hermit[1] - 40]], { speed: 10, step: 6, rest: [3, 8] });
      L.hermit = hermit;
    }
    function shut(a, k = 1) { if (a.data.shut <= 0) { sfx('bubble', { vol: 0.2, x: a.x }); note(2 + Math.floor(R() * 5), { instrument: 'marimba', vol: 0.18, x: a.x }); } a.data.shut = 3 + 3 * k + R() * 2; a.setPose('closed'); a.poke(0.5); }
    function flee(s, x, y) { const d = s.data; d.flee = 1.2; const a = Math.atan2(s.y - y, s.x - x) + (R() - 0.5); d.tx = clamp(s.x + Math.cos(a) * 320, C.box[0], C.box[2]); d.ty = clamp(s.y + Math.sin(a) * 200, C.box[1], C.box[3]); }
    function glow(x, y) { L.glows.push({ x, y, t: 0, life: 1.4 + R(), r: 10 + R() * 12 }); if (L.glows.length > 120) L.glows.shift(); }
    const night = () => engine.art.nightness(engine.env);

    const scene = {
      ownWeather: true,
      setup,
      closed() { p = null; },
      stroke(s) {
        if (!p || s.phase === 'end') { L.rest = null; return; }
        for (const a of L.anem) if (Math.hypot(a.x - s.x, a.y - 30 - s.y) < 70) shut(a, 0.5);
        for (const f of [...L.fish, ...L.prawns]) if (Math.hypot(f.x - s.x, f.y - s.y) < 170) flee(f, s.x, s.y);
        if (night() > 0.4) for (let i = 0; i < s.n; i++) if (R() < 0.5) glow(s.points[i].x, s.points[i].y);
        if (s.length % 90 < 16) { fx.ripple(s.x, s.y, { r: 70, flat: 0.9, n: 1 }); note(3 + Math.floor((s.x / 2000) * 9), { instrument: 'water', vol: 0.25, x: s.x }); }
        return true;
      },
      tap(pt) {
        if (!p) return;
        const s = pt.thing;
        if (s && L.anem.includes(s)) { shut(s); return true; }
        if (s && L.stars.includes(s)) { s.data.spin = 0.8; note(7 + Math.floor(R() * 4), { instrument: 'harp', vol: 0.3 }); fx.burst(s.x, s.y, { n: 5, power: 0.3, rgb: '255,200,150' }); return true; }
        if (s && (L.fish.includes(s) || L.prawns.includes(s))) { flee(s, pt.x, pt.y); sfx('plop', { vol: 0.2 }); return true; }
        if (s === L.hermit) { s.setPose(s.pose === 0 ? 'in' : 'out'); s.poke(0.6); sfx('tok', { vol: 0.2 }); return true; }
        if (s) { s.poke(); note(5, { instrument: 'glass', vol: 0.2 }); return true; }
        fx.ripple(pt.x, pt.y, { r: 90, flat: 0.9, n: 3 }); sfx('drip', { vol: 0.3 }); note(4 + Math.floor((pt.x / 2000) * 8), { instrument: 'water', vol: 0.3 });
        for (const f of L.fish) if (Math.hypot(f.x - pt.x, f.y - pt.y) < 200) flee(f, pt.x, pt.y);
        if (night() > 0.4) for (let i = 0; i < 10; i++) glow(pt.x + (R() - 0.5) * 80, pt.y + (R() - 0.5) * 60);
        return true;
      },
      hold(pt) { L.rest = { x: pt.x, y: pt.y, t: 0 }; note(9, { instrument: 'glass', vol: 0.18 }); return true; },
      update(dt, env) {
        if (!p) return;
        const t = engine.now();
        for (const a of L.anem) { const d = a.data; if (d.shut > 0) { d.shut -= dt * (env.time === 'night' ? 1.4 : 1); if (d.shut <= 0) { a.setPose('open'); a.poke(0.3); } } }
        for (const s of L.stars) if (s.data.spin) { s.rot += dt * s.data.spin; s.data.spin = Math.max(0, s.data.spin - dt * 0.4); }
        // the little fish: wander, flee, and come to a finger that rests still in the water
        for (const f of [...L.fish, ...L.prawns]) {
          const d = f.data, prawn = L.prawns.includes(f); d.t -= dt; d.flee = Math.max(0, d.flee - dt);
          if (L.rest && d.flee <= 0 && !prawn) { d.tx = L.rest.x + Math.cos(t * 0.8 + f._seed) * 70; d.ty = L.rest.y + Math.sin(t * 0.9 + f._seed) * 40; }
          else if (d.t < 0 && d.flee <= 0) { d.tx = clamp(f.x + (R() - 0.5) * 400, C.box[0], C.box[2]); d.ty = clamp(f.y + (R() - 0.5) * 250, C.box[1], C.box[3]); d.t = 2 + R() * 4; }
          const dx = d.tx - f.x, dy = d.ty - f.y, m = Math.hypot(dx, dy), sp = d.flee > 0 ? 520 : 60;
          if (m > 3) { f.x += (dx / m) * Math.min(m, sp * dt); f.y += (dy / m) * Math.min(m, sp * dt); if (Math.abs(dx) > 3) f.flip = prawn ? dx > 0 : dx < 0; }
          if (!prawn) f.setPose(m > 8 && Math.floor(t * 6 + f._seed) % 2 ? 'swim' : 'still');
          f.rot = Math.sin(t * 2 + f._seed) * 0.05;
          f.alpha = 1 - 0.6 * clamp(((env.stormy || 0) - 0.3) * 2, 0, 1);       // in a storm they keep to the weed
        }
        if (L.rest) L.rest.t += dt;
        if ((env.wet || 0) > 0.2 && R() < dt * 6 * env.wet) fx.ripple(300 + R() * 1400, 200 + R() * 700, { r: 30 + R() * 30, flat: 0.95, n: 1 });
        if (env.weather === 'snow' && R() < dt * 2) fx.burst(300 + R() * 1400, 200 + R() * 700, { n: 1, power: 0.1, rgb: '255,255,255' });
        for (let i = L.glows.length - 1; i >= 0; i--) { const q = L.glows[i]; q.t += dt; if (q.t > q.life) L.glows.splice(i, 1); }
      },
      draw(g, env) {
        for (const q of L.glows) { const u = q.t / q.life; engine.art.light(g, q.x, q.y, q.r * 3, [0.45, 1, 0.9], 0.9 * Math.sin(Math.PI * u), { core: 2 }); }
      },
    };
    return paintedInside(engine, 'pool', scene);
  },
};
