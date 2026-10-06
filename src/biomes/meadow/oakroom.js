// Inside the old oak: the dormouse's round room (painted view `oakroom`). Plain to find: the round door in the oak.
//   the dormouse      sleeps by day (and all winter, curled up, snoring softly); awake at dusk and night, nibbling a
//                     hazelnut; touched it stirs, sits up and squeaks, or only twitches an ear
//   the lantern       a touch lights it or puts it out; it glows warm and sways a little
//   the acorn cups    on the fungus shelf: each sings its own note when touched, a little xylophone
//   the window        shows the weather and the time outside (drops in the rain, flakes in the snow, stars at night)
//   strokes           over the walls the wood hums low; over the nest thistledown rises
//   the door          back out to the meadow
import { inside } from './inside.js';

const TAU = Math.PI * 2;
// spots in the painting (world units, 2000 x 1000); set from the painting (docs/status/meadow-STATE.md)
export const ROOM = {
  door: { x: 609, y: 520, r: 200 },
  window: { x: 1110, y: 192, r: 105 },
  lantern: { x: 1610, y: 350, r: 75 },
  cups: [[989, 360], [1038, 360], [1086, 360], [1150, 362], [1235, 352]],   // three acorns, the thimble, the jar
  nest: { x: 1353, y: 722, rx: 260, ry: 100 },
  mouse: { x: 1353, y: 735 },
};

export default inside({
  name: 'Inside the Old Oak',
  view: 'oakroom',
  music: { preset: 'hollow', ambience: { roomtone: 0.4, crickets: 0.3 } },
  exits: [{ x: ROOM.door.x, y: ROOM.door.y, r: ROOM.door.r, out: true }],
  interior: 0.8,
  create(engine) {
    const art = engine.art, fx = art.fx, A = engine.audio || {};
    const R = () => engine.random();
    const note = (s, o) => { if (A.note) A.note(s, o || {}); };
    const sfx = (n, o) => { if (A.sfx && A.sfx.play) A.sfx.play(n, o || {}); };
    let P = null, mouse = null, lamp = { on: engine.save.get('lamp', true), k: 0, swing: 0 }, cupK = [0, 0, 0, 0, 0], last = 0;
    const drops = [];
    const has = (n) => !!(P && P.man.sprites[n]);
    const awake = () => art.nightness(engine.env) > 0.35 && engine.env.season !== 'winter';

    return {
      setup(p) {
        P = p; p.show('oakroom');
        if (has('dormouse')) {
          mouse = p.add('dormouse', { x: ROOM.mouse.x, y: ROOM.mouse.y, pose: awake() ? 'nibble' : 'sleep', scale: 1 }).breathe(0.035, 0.6);
          mouse.data = { t: 0 };
        }
      },
      closed() { P = null; mouse = null; },
      tap(pt) {
        if (mouse && pt.thing === mouse) {
          const c = engine.again('dormouse', 40) + R() * 0.5;
          if (!awake()) { mouse.poke(0.5); sfx('snore', { vol: 0.25 }); if (c > 1.2) { mouse.setPose('stir'); engine.after(1.6, () => mouse && mouse.setPose('sleep')); } }
          else if (c < 1) { mouse.setPose('up'); mouse.poke(0.8); sfx('squeak', { vol: 0.25, pitch: 1.4 }); engine.after(2, () => mouse && mouse.setPose('nibble')); }
          else { mouse.poke(0.4); sfx('squeak', { vol: 0.15, pitch: 1.7 }); }
          fx.burst(pt.x, pt.y - 20, { n: 4, power: 0.3 }); return true;
        }
        if (Math.hypot(pt.x - ROOM.lantern.x, pt.y - ROOM.lantern.y) < ROOM.lantern.r) {
          lamp.on = !lamp.on; lamp.swing = 1; engine.save.set('lamp', lamp.on);
          fx.burst(ROOM.lantern.x, ROOM.lantern.y, { n: lamp.on ? 10 : 4, power: 0.4, rgb: '255,220,150' }); sfx(lamp.on ? 'twinkle' : 'tok', { vol: 0.35, count: 1 });
          return true;
        }
        for (let i = 0; i < ROOM.cups.length; i++) {
          const [x, y] = ROOM.cups[i];
          if (Math.hypot(pt.x - x, pt.y - y) < 34) { cupK[i] = 1; note([4, 5, 6, 8, 7][i] + (engine.env.season === 'winter' ? 5 : 0), { instrument: i === 3 ? 'glass' : i === 4 ? 'kalimba' : 'marimba', vol: 0.18 }); fx.burst(x, y - 10, { n: 4, power: 0.25 }); return true; }
        }
        if (Math.hypot(pt.x - ROOM.window.x, pt.y - ROOM.window.y) < ROOM.window.r) {
          fx.burst(pt.x, pt.y, { n: 8, power: 0.3, rgb: '220,235,255' }); sfx(art.nightness(engine.env) > 0.5 ? 'twinkle' : 'chime', { vol: 0.25 }); return true;
        }
        // the floor and the walls: a soft knock in the wood
        note(Math.floor(pt.x / 250), { instrument: 'marimba', vol: 0.1, octave: -1 }); fx.bloom(pt.x, pt.y, { r: 80, rgb: '255,230,190' });
        return true;
      },
      stroke(s) {
        if (s.phase === 'end') return true;
        const t = engine.now(); if (t - last < 0.14) return true; last = t;
        const n = ROOM.nest;
        if (((s.x - n.x) / n.rx) ** 2 + ((s.y - n.y) / n.ry) ** 2 < 1) { fx.burst(s.x, s.y, { n: 3, power: 0.25, rgb: '250,248,240' }); sfx('rustle', { vol: 0.2 }); if (mouse && !awake()) mouse.poke(0.2); }
        else note(Math.floor(s.x / 220) + (s.y < 400 ? 5 : 0), { instrument: 'harp', vol: 0.07 });
        return true;
      },
      hold(pt) { if (A.chord) A.chord([0, 2, 4, 7], { instrument: 'harp', vol: 0.12, strum: 0.12 }); fx.bloom(pt.x, pt.y, { r: 140, rgb: '255,230,190' }); return true; },
      update(dt, env) {
        lamp.k += ((lamp.on ? 1 : 0) - lamp.k) * Math.min(1, dt * 3); lamp.swing *= Math.exp(-dt * 0.8);
        for (let i = 0; i < cupK.length; i++) cupK[i] *= Math.exp(-dt * 3);
        if (mouse) {
          const d = mouse.data; d.t += dt;
          if (!awake() && mouse.pose !== 0 && d.t > 2) { mouse.setPose('sleep'); d.t = 0; }
          if (awake() && mouse.pose === 0 && d.t > 3) { mouse.setPose('nibble'); d.t = 0; }
          if (awake() && d.t > 4 + R() * 3) { d.t = 0; mouse.setPose(mouse.pose === 2 ? 'up' : 'nibble'); if (R() < 0.4) sfx('crunch', { vol: 0.08 }); }
        }
        // drops on the window in the rain
        if ((env.wet ?? 0) > 0.2 && R() < dt * 6 * env.wet) drops.push({ x: ROOM.window.x + (R() - 0.5) * 120, y: ROOM.window.y - 70 + R() * 40, t: 0 });
        for (let i = drops.length - 1; i >= 0; i--) { const q = drops[i]; q.t += dt; q.y += dt * 30; if (q.t > 2.5) drops.splice(i, 1); }
      },
      draw(g, env, view, p) {
        const t = engine.now(), nk = art.nightness(env), W = ROOM.window;
        // the window: the light outside (day sky, dusk, the moon at night), rain drops, snow
        const dayLight = 1 - nk;
        art.light(g, W.x, W.y, W.r * 2.2, nk > 0.5 ? [0.55, 0.65, 1] : [1, 0.95, 0.85], 0.35 + 0.4 * dayLight, { core: W.r * 0.4 });
        if (nk > 0.5) for (let i = 0; i < 5; i++) { const a = i * 2.4, x = W.x + Math.cos(a) * 50, y = W.y + Math.sin(a * 1.3) * 45; art.light(g, x, y, 10, [1, 1, 1], 0.6 * (0.6 + 0.4 * Math.sin(t * 2 + i)) * nk, { core: 1.5 }); }
        for (const q of drops) art.light(g, q.x, q.y, 8, [0.8, 0.9, 1], 0.6 * (1 - q.t / 2.5), { core: 1.4 });
        if ((env.snowy ?? 0) > 0.2) for (let i = 0; i < 10; i++) { const x = W.x + ((i * 37 + t * 12) % 160) - 80, y = W.y - 80 + ((i * 53 + t * 25) % 160); if (Math.hypot(x - W.x, y - W.y) < W.r * 0.85) art.light(g, x, y, 7, [1, 1, 1], 0.7 * env.snowy, { core: 1.6 }); }
        // the lantern
        if (lamp.k > 0.01) { const sw = Math.sin(t * 2.2) * 10 * lamp.swing, fl = 0.92 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 3.1); art.light(g, ROOM.lantern.x + sw, ROOM.lantern.y + 14, 420, [1, 0.78, 0.45], 1.1 * lamp.k * fl, { core: 12 }); }
        // acorn cups ring
        for (let i = 0; i < cupK.length; i++) if (cupK[i] > 0.02) art.light(g, ROOM.cups[i][0], ROOM.cups[i][1] - 6, 50, [1, 0.9, 0.6], cupK[i] * 0.8, { core: 4 });
      },
    };
  },
});
