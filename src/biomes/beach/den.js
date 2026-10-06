// The den under the upturned boat in the dunes: a fox family's home.
//   by day the vixen and her cubs sleep in the nest (in winter the vixen alone); a touched cub wakes, sits up,
//   pounces, and curls up again; the vixen lifts her head and settles; at dusk the cubs play; at night the den is
//   empty but for one sleepy cub (the others are out on the dunes); in rain everyone is home and drips fall through
//   the planks. Strokes through the stripes of light make the dust glitter.
import { paintedInside } from './inside.js';
import { DEN as C } from './coords.js';

export const den = {
  name: 'Under the Old Boat',
  view: 'den', world: { w: 2000, h: 1000 },
  views: { den: { x: 0, y: 0, w: 2000, h: 1000, safe: { x: 200, y: 0, w: 1600, h: 1000 }, anchorY: 0.7 } },
  music: { preset: 'burrow', ambience: { snores: 0.5, wind: 0.2, waves: 0.2 } },
  exits: C.out.map((e) => ({ ...e, out: true })),
  create(engine) {
    const fx = engine.art.fx, R = engine.random || Math.random;
    const note = (s, o) => engine.audio && engine.audio.note && engine.audio.note(s, o || {});
    const sfx = (n, o) => engine.audio && engine.audio.sfx && engine.audio.sfx.play(n, o || {});
    let p = null, vixen = null; const cubs = [], drips = [];
    const home = (env) => env.weather === 'rain' || env.weather === 'storm' || env.weather === 'snow' || env.time === 'day' || env.time === 'dawn';

    function setup(pl) {
      p = pl; cubs.length = 0;
      if (!p.man.sprites.fox) return;
      vixen = p.add('fox', { view: 'den', x: C.nest[0] + 60, y: C.nest[1] - 10, pose: 'curl', scale: 2.6 }).breathe(0.025, 0.5);
      vixen.data = { st: 'sleep', t: 0 };
      for (let i = 0; i < 2; i++) {
        const s = p.add('cub', { view: 'den', x: C.nest[0] - 200 + i * 470, y: C.nest[1] + 40 - i * 10, pose: 'curl', scale: 2.4, seasons: ['spring', 'summer', 'autumn'], flip: i === 1 }).breathe(0.03, 0.7);
        s.data = { st: 'sleep', t: 0, home: [s.x, s.y], i }; cubs.push(s);
      }
    }
    function wake(c) { const d = c.data; if (d.st !== 'sleep') return; d.st = 'sit'; d.t = 0; c.setPose('sit'); c.poke(0.5); sfx('squeak', { vol: 0.2, size: 0.2, x: c.x }); note(7 + d.i * 2, { instrument: 'marimba', vol: 0.25 }); }

    const scene = {
      ownWeather: true,
      setup,
      closed() { p = null; vixen = null; cubs.length = 0; },
      stroke(s) {
        if (!p || s.phase === 'end') return;
        if (s.length % 70 < 14) { fx.burst(s.x, s.y, { n: 3, power: 0.25, rgb: '255,230,170' }); note(4 + Math.floor(s.x / 250), { instrument: 'harp', vol: 0.16, x: s.x }); }
        for (const c of cubs) if (Math.hypot(c.x - s.x, c.y - 80 - s.y) < 160) wake(c);
        return true;
      },
      tap(pt) {
        if (!p) return;
        const s = pt.thing;
        if (s && cubs.includes(s)) { if (s.data.st === 'sleep') wake(s); else { s.data.st = 'pounce'; s.data.t = 0; s.setPose('pounce'); sfx('boing', { vol: 0.15 }); } return true; }
        if (s && s === vixen) { const d = vixen.data; d.st = 'look'; d.t = 0; vixen.setPose('sit'); vixen.poke(0.3); sfx('sniff', { vol: 0.25 }); return true; }
        if (Math.hypot(pt.x - C.float[0], pt.y - C.float[1]) < 90) { fx.bloom(C.float[0], C.float[1] - 30, { r: 80, rgb: '190,255,210' }); note(9, { instrument: 'glass', vol: 0.3 }); return true; }
        fx.burst(pt.x, pt.y, { n: 5, power: 0.3, rgb: '255,232,180' }); sfx('rustle', { vol: 0.2 }); note(2 + Math.floor(pt.x / 300), { instrument: 'marimba', vol: 0.2 });
        return true;
      },
      update(dt, env) {
        if (!p || !vixen) return;
        const t = engine.now(), athome = home(env), dusk = env.time === 'dusk';
        // who is in: the vixen by day and in bad weather; at night only one cub stays
        vixen.alpha += ((athome ? 1 : 0) - vixen.alpha) * Math.min(1, dt);
        cubs.forEach((c, i) => {
          const d = c.data; d.t += dt;
          c.alpha += ((athome || dusk || i === 0 ? 1 : 0) - c.alpha) * Math.min(1, dt);
          if (dusk && d.st === 'sleep' && R() < dt * 0.1) wake(c);                      // at dusk the cubs play by themselves
          if (d.st === 'sit' && d.t > 2.5) { d.st = 'pounce'; d.t = 0; c.setPose('pounce'); c.hopTo(d.home[0] + (R() - 0.5) * 260, d.home[1], { height: 90, time: 0.5 }); }
          else if (d.st === 'pounce' && d.t > 1.6) { d.st = dusk ? 'sit' : 'curl'; d.t = 0; c.setPose(dusk ? 'sit' : 'curl'); }
          else if (d.st === 'curl' && d.t > 1) { d.st = 'sleep'; d.t = 0; c.x = d.home[0]; c.y = d.home[1]; sfx('snore', { vol: 0.08 }); }
        });
        const v = vixen.data; v.t += dt; if (v.st === 'look' && v.t > 3) { v.st = 'sleep'; vixen.setPose('curl'); }
        if ((env.wet || 0) > 0.2 && R() < dt * 2 * env.wet) drips.push({ x: 300 + R() * 1400, y: 120 + R() * 80, vy: 0, t: 0 });
        for (let i = drips.length - 1; i >= 0; i--) { const q = drips[i]; q.vy += 900 * dt; q.y += q.vy * dt; if (q.y > 860) { fx.ripple(q.x, 860, { r: 16, n: 1, flat: 0.3 }); if (R() < 0.3) note(8 + Math.floor(R() * 4), { instrument: 'water', vol: 0.08 }); drips.splice(i, 1); } }
      },
      draw(g) {
        g.fillStyle = 'rgba(210,230,255,0.7)';
        for (const q of drips) { g.beginPath(); g.ellipse(q.x, q.y, 2.5, 6, 0, 0, 6.28); g.fill(); }
      },
    };
    return paintedInside(engine, 'den', scene);
  },
};
