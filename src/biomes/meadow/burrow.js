// The rabbit burrow under the meadow (painted view `burrow`). Somewhat hidden: its hole in the grass by the bushes
// stands open only while the rabbit is inside (rain, storm, after a fright) and at dusk and night.
//   the rabbits       sleep in the nest (the mother whenever she is not out on the meadow, the kits always);
//                     touched they twitch an ear, stretch, sigh; never woken for long
//   the meadow above  a stroke along the roots under the grass makes the flowers above stir and earth trickle down
//   the deep tunnel   on the right: by day only cool dark; when it is dark outside a faint glow shows far in it, and
//                     a tap there goes on down to the glow-worm hollow (hidden)
//   the way up        the bright tunnel on the left, back to the meadow
import { inside } from './inside.js';
import glow from './glow.js';

export const DEN = {
  up: { x: 192, y: 214, r: 150, poly: [[60, 90], [330, 90], [420, 300], [600, 700], [350, 760], [60, 700]] },   // the tunnel up to the daylight (left)
  deep: { x: 1804, y: 654, r: 130, poly: [[1560, 500], [2000, 470], [2000, 800], [1560, 800]] },                  // the tunnel down (right)
  nest: { x: 1048, y: 712 },
  top: 150,                                     // the meadow above ends here (y)
};

export default inside({
  name: 'The Rabbit Burrow',
  view: 'burrow',
  music: { preset: 'burrow', ambience: { roomtone: 0.5, dig: 0.2, drips: 0.15 } },
  exits: [{ poly: DEN.up.poly, out: true }],
  safe: { x: 120, y: 0, w: 1760, h: 1000 },
  interior: 1,
  instances: { glow },
  create(engine) {
    const art = engine.art, fx = art.fx, A = engine.audio || {};
    const R = () => engine.random();
    const note = (s, o) => { if (A.note) A.note(s, o || {}); };
    const sfx = (n, o) => { if (A.sfx && A.sfx.play) A.sfx.play(n, o || {}); };
    const env = engine.env;
    let P = null, last = 0, deepOn = false;
    const sleepers = [];
    const deepExit = { poly: DEN.deep.poly, inst: 'glow' };
    const dark = () => art.nightness(env) > 0.35;
    const has = (n) => !!(P && P.man.sprites[n]);

    return {
      setup(p) {
        P = p; p.show('burrow'); sleepers.length = 0;
        const name = has('rabbit-sleep') ? 'rabbit-sleep' : 'rabbit';
        const mum = p.add(name, { x: DEN.nest.x - 40, y: DEN.nest.y, pose: name === 'rabbit' ? 'rest' : 0, scale: 1 }).breathe(0.03, 0.5); mum.data = { mum: true };
        sleepers.push(mum);
        // the den keeps the day's warmth: the sleepers take only a little of art's night glaze (a white rabbit under the
        // full glaze is a flat blue shape on the night painting)
        const warm = (sp) => { const d = sp.draw.bind(sp); sp.draw = (g, nk) => d(g, nk * 0.3); return sp; };
        warm(mum);
        for (let i = 0; i < 3; i++) { const k = p.add(has('kit-sleep') ? 'kit-sleep' : name, { x: DEN.nest.x + 90 + i * 50, y: DEN.nest.y + 12 - (i % 2) * 14, scale: has('kit-sleep') ? 1 : 0.5, flip: i === 1, pose: i % 3 }).breathe(0.045, 0.7 + i * 0.1); k.data = { kit: true }; sleepers.push(warm(k)); }
      },
      closed() { P = null; sleepers.length = 0; },
      tap(pt) {
        const s = pt.thing;
        if (s && sleepers.includes(s)) {
          const c = engine.again('sleeper', 30) + R() * 0.5;
          s.poke(c < 1 ? 0.9 : 0.4); sfx(c < 1.5 ? 'snore' : 'squeak', { vol: 0.2, pitch: s.data.kit ? 1.6 : 1.1 });
          if (s.def.names && s.def.names.includes('stir')) { s.setPose('stir'); engine.after(1.4, () => s.setPose(0)); }
          else if (s.def.names && s.def.names.includes('yawn')) { const was = s.pose; s.setPose('yawn'); engine.after(1.2, () => s.setPose(was)); }
          fx.burst(pt.x, pt.y - 20, { n: 4, power: 0.25 }); return true;
        }
        if (pt.y < DEN.top) { fx.burst(pt.x, DEN.top, { n: 6, power: 0.3, rgb: '150,110,70' }); note(Math.floor(pt.x / 250) + 3, { instrument: 'marimba', vol: 0.12 }); sfx('dig', { vol: 0.2 }); return true; }
        if (pt.x > 1560 && pt.y > 480 && pt.y < 820) { sfx('drip', { vol: 0.3 }); fx.bloom(DEN.deep.x, DEN.deep.y, { r: 90, rgb: '170,200,255' }); return true; }
        note(Math.floor(pt.x / 300), { instrument: 'marimba', vol: 0.1, octave: -1 }); fx.bloom(pt.x, pt.y, { r: 70, rgb: '240,220,190' });
        return true;
      },
      stroke(s) {
        if (s.phase === 'end') return true;
        const t = engine.now(); if (t - last < 0.12) return true; last = t;
        if (s.y < DEN.top + 120) { fx.burst(s.x, DEN.top + 20, { n: 2, power: 0.2, rgb: '140,100,60' }); note(Math.floor(s.x / 220) + 4, { instrument: 'marimba', vol: 0.08 }); }
        else note(Math.floor(s.x / 260), { instrument: 'kalimba', vol: 0.06, octave: -1 });
        return true;
      },
      hold(pt) { if (A.chord) A.chord([0, 2, 4], { instrument: 'marimba', vol: 0.1, strum: 0.1 }); for (const s of sleepers) s.poke(0.2); return true; },
      update(dt) {
        const want = dark();
        if (want !== deepOn) { if (want) engine.exits.add(deepExit); else engine.exits.remove(deepExit); deepOn = want; }
        if (R() < dt * 0.1) sfx('drip', { vol: 0.08 });
      },
      draw(g, env, view) {
        const t = engine.now(), nk = art.nightness(env);
        // daylight down the tunnel by day; at night only a little moonlight
        art.light(g, DEN.up.x, DEN.up.y, 420, nk > 0.5 ? [0.6, 0.7, 1] : [1, 0.95, 0.75], 0.55 * (1 - nk) + 0.12, { core: 40 });
        // the deep tunnel's glow, only when it is dark outside
        if (deepOn) for (let i = 0; i < 6; i++) { const k = 0.5 + 0.5 * Math.sin(t * (0.6 + i * 0.13) + i * 2); art.light(g, DEN.deep.x - 40 + (i % 3) * 40, DEN.deep.y - 30 + Math.floor(i / 3) * 30, 40, [0.6, 1, 0.7], 0.5 * k * nk, { core: 2 }); }
      },
    };
  },
});
