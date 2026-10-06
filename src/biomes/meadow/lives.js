// The meadow's creatures and their own lives. Season decides who lives here, time of day who is awake, weather who
// hides; a touch only nudges a life, never the same way twice (engine.again), and nothing is ever used up.
//   rabbit     grazes by the oak, hops about; hides in its hole from rain, storm and night (the hole is then a way in)
//   kits       in spring two young rabbits keep close to their mother
//   hedgehog   walks its round at dusk, at night and at dawn; curls up when touched; in autumn carries off an apple
//   snails     creep; more come out in the rain; touched they draw in and come out again
//   bees       fly between the hive and the flowers the child grew (warm, dry days)
//   butterflies visit flowers by day in spring and summer
//   robin      winter: hops after the child's hand in the snow
//   owl        sleeps in the oak by day, wakes at dusk; touched it turns its head, hoots, and once in a while flies
//              a round over the meadow under the moon
//   buck       winter mornings, days and evenings (autumn dawn and dusk) on the far hill: the first touch, it looks up
//              and bounds away over the hill and comes back later; later touches, it only looks round
//   frog       at the pond in the rain; touched it leaps into the water and climbs out again
import { HOLE } from './spots.js';

const TAU = Math.PI * 2;
const HOG2 = [[1250, 950], [1600, 925], [1900, 955]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;

export function createLives(engine, V, things) {
  const art = engine.art, fx = art.fx, A = engine.audio || {};
  const R = () => engine.random();
  const note = (step, o) => { if (A.note) A.note(step, o || {}); };
  const sfx = (name, o) => { if (A.sfx && A.sfx.play) A.sfx.play(name, o || {}); };
  const env = engine.env;
  let P = null, holeExit = null, holeOn = false;
  const L = {};                                    // the creatures (sprites), rebuilt on every opening
  const has = (n) => !!(P && P.man.sprites[n]);

  function setup(p, hx) {
    P = p; holeExit = hx;
    for (const k of Object.keys(L)) delete L[k];
    // ---------------------------------------------------------------- oak view
    p.show('oak');
    if (has('burrow-hole')) { L.hole = p.add('burrow-hole', { x: HOLE.x, y: HOLE.y, depth: true, z: -40 }); L.hole.data = { kind: 'hole' }; }
    L.rabbit = p.add('rabbit', { x: 1180, y: 800, depth: true, pose: 'rest' }).breathe(0.02)
      .life({ home: [1180, 800], roam: 160, idle: ['rest', 'graze'], alert: 'alert', hop: ['crouch', 'leap', 'land'], wait: [6, 12],
        away: () => [HOLE.x, HOLE.y + 6], ground: (x, y) => p.inRegion('meadow', x, y) && y > 720 });
    L.rabbit.data = { kind: 'rabbit', state: 'out', t: 0 };
    L.kits = [];
    for (let i = 0; i < 2; i++) {
      const k = p.add('rabbit', { x: 1120 + i * 120, y: 830 + i * 20, depth: true, scale: 0.55, seasons: ['spring'], pose: 'graze' }).breathe(0.03, 1.4)
        .life({ home: [1120 + i * 120, 830], roam: 60, idle: ['graze', 'rest'], alert: 'alert', hop: ['crouch', 'leap', 'land'], hopLen: 55, hopHeight: 22, wait: [5, 9],
          away: () => [HOLE.x + (i - 0.5) * 30, HOLE.y + 10], ground: (x, y) => p.inRegion('meadow', x, y) && y > 720 });
      k.data = { kind: 'kit', i }; L.kits.push(k);
    }
    L.hedgehog = p.add('hedgehog', { x: 520, y: 905, seasons: ['spring', 'summer', 'autumn'], times: ['dusk', 'night', 'dawn'], depth: true })
      .walk([[520, 902], [1000, 884], [1480, 910]], { speed: 34, step: 12, rest: [2, 5] });
    L.hedgehog.data = { kind: 'hedgehog', curl: 0 };
    if (has('hedgehog-curl')) { L.curl = p.add('hedgehog-curl', { x: 600, y: 610, depth: true, seasons: ['spring', 'summer', 'autumn'], times: ['day'], scale: 0.9 }).breathe(0.025, 0.7); L.curl.data = { kind: 'sleeper' }; }
    L.robin = p.add('robin', { x: 470, y: 760, seasons: ['winter'], depth: true, scale: 1.4 }).breathe(0.03, 1.6); L.robin.data = { kind: 'robin', to: null };
    if (has('owl')) {
      L.owl = p.add('owl', { x: 520, y: 172, scale: 1.15, z: 900, pose: art.nightness(env) > 0.35 ? 'perch' : 'sleep', touchable: true });
      L.owl.data = { kind: 'owl', home: [520, 172], fly: null, t: 0 }; L.owl.breathe(0.02, 0.6);
    }
    snails(p, 'oak', [[880, 964], [1320, 955]], [[300, 985], [640, 975]]);
    flutter(p, 'oak');
    // ---------------------------------------------------------------- pond view
    p.show('pond');
    snails(p, 'pond', [[700, 968], [1060, 960]], [[1150, 990], [1400, 985]]);
    flutter(p, 'pond');
    const v = V.pond, hive = { x: 1787, y: 606 };
    v.bees = [];
    for (let i = 0; i < 6; i++) {
      const b = p.add('bee', { x: hive.x, y: hive.y, seasons: ['spring', 'summer'], times: ['dawn', 'day', 'dusk'], touchable: false, z: 500, scale: 0.5 })
        .fly((s) => {
          s.data = !s.data; const it = s.data ? v.field.any(Math.random, (f) => f.kind.stems) : null;
          if (!it) return { x: hive.x + (Math.random() - 0.5) * 20, y: hive.y + (Math.random() - 0.5) * 10, stay: 0.6 + Math.random() };
          const h = v.field.headOf(it); return { x: h.x, y: h.y - 4, stay: 1.2 + Math.random() * 2 };
        }, { speed: 150, flutter: 16, wobble: 12 });
      v.bees.push(b);
    }
    // a second hedgehog lives under the apple tree; in autumn it carries off a fallen apple on its spines
    L.hog2 = p.add('hedgehog', { x: 1350, y: 945, seasons: ['spring', 'summer', 'autumn'], times: ['dusk', 'night', 'dawn'], depth: true })
      .walk(HOG2, { speed: 30, step: 12, rest: [3, 6] });
    L.hog2.data = { kind: 'hedgehog', curl: 0, carry: null, goal: null };
    if (has('buck')) {
      L.buck = p.add('buck', { x: 760, y: 606, depth: false, scale: 0.33, pose: 'graze', seasons: ['winter', 'autumn'] }).breathe(0.012)
        .life({ home: [760, 606], roam: 70, idle: ['graze', 'stand', 'graze'], alert: 'alert', hop: ['gather', 'stretch', 'gather'], hopLen: 70, hopTime: 0.5, hopHeight: 16, look: 1.1, wait: [16, 28],
          away: () => [-120, 590], ground: (x, y) => y > 585 && y < 640 && x > 560 && x < 980 });
      L.buck.data = { kind: 'buck', look: 0 };
    }
    if (has('frog')) { L.frog = p.add('frog', { x: 1420, y: 838, depth: true, pose: 'sit', seasons: ['spring', 'summer', 'autumn'] }).breathe(0.05, 1.3); L.frog.data = { kind: 'frog', hop: null, t: 0, home: [1420, 838] }; L.frog.alpha = 0; }
    holeOn = false;
  }
  function closed() { P = null; for (const k of Object.keys(L)) delete L[k]; if (holeOn) { engine.exits.remove(holeExit); holeOn = false; } }

  function snails(p, view, path, rainPath) {
    const v = V[view]; v.snails = [];
    const a = p.add('snail', { x: path[0][0], y: path[0][1], seasons: ['spring', 'summer', 'autumn'], pose: 'out' }).walk(path, { speed: 5, creep: true, rest: [3, 7], poses: ['out'] });
    a.data = { kind: 'snail', out: 0 }; v.snails.push(a);
    for (let i = 0; i < 2; i++) {                                     // these two only come out when it rains
      const b = p.add('snail', { x: rainPath[i][0], y: rainPath[i][1], seasons: ['spring', 'summer', 'autumn'], pose: 'out', scale: 0.85 + i * 0.2 })
        .walk(i ? [...rainPath].reverse() : rainPath, { speed: 6, creep: true, rest: [2, 5], poses: ['out'] });
      b.data = { kind: 'snail', out: 0, rain: true }; b.alpha = 0; v.snails.push(b);
    }
  }
  function flutter(p, view) {
    const v = V[view]; v.flies = [];
    for (let i = 0; i < 2; i++) {
      const b = p.add('butterfly', { x: 600 + i * 500, y: 700, seasons: ['spring', 'summer'], times: ['dawn', 'day', 'dusk'], touchable: true, z: 500 })
        .fly((s) => { const it = v.field.any(Math.random); const h = it ? v.field.headOf(it) : { x: 300 + Math.random() * 1400, y: 600 + Math.random() * 200 }; s.scale = it ? clamp(it.sc * 1.2, 0.4, 1) : 0.7; return { x: h.x, y: h.y - 6, stay: 1 + Math.random() * 2.5 }; }, { speed: 90, flutter: 7, wobble: 16 });
      b.data = { kind: 'butterfly' }; v.flies.push(b);
    }
  }

  // ---------------------------------------------------------------------------------------------- touch
  function tap(s, pt) {
    const d = s.data; if (!d) return false;
    if (d.kind === 'rabbit' || d.kind === 'kit') {
      const c = engine.again(d.kind, 40) + R() * 0.5;
      if (c < 0.8) { s.startle(); sfx('startle', { vol: 0.3 }); }
      else if (c < 2) { s.setPose('alert'); s.poke(0.6); sfx('sniff', { vol: 0.35 }); }
      else { s.poke(0.9); sfx('squeak', { vol: 0.2, pitch: d.kind === 'kit' ? 1.5 : 1.2 }); }
      fx.burst(pt.x, pt.y, { n: 5, power: 0.4 }); return true;
    }
    if (d.kind === 'hedgehog') { d.curl = 3 + R() * 2; s.poke(1.2); sfx('sniff', { vol: 0.35 }); fx.burst(pt.x, pt.y, { n: 4, power: 0.3 }); return true; }
    if (d.kind === 'sleeper') { s.poke(0.5); sfx('snore', { vol: 0.25 }); return true; }
    if (d.kind === 'snail') { s.setPose('in'); s._mover.rest = 5; s._mover.poses = [1]; d.out = 5 + R() * 3; s.poke(0.6); sfx('tok', { vol: 0.25, count: 1 }); note(1, { instrument: 'marimba', vol: 0.1 }); return true; }
    if (d.kind === 'butterfly') { const m = s._mover; if (m) { m.target = { x: s.x + (R() - 0.5) * 400, y: clamp(s.y - 100 - R() * 150, 300, 900), stay: 0.3 }; m.stay = 0; } fx.burst(pt.x, pt.y, { n: 6, power: 0.4, rgb: '255,240,170' }); note(9 + Math.floor(R() * 3), { instrument: 'celesta', vol: 0.08 }); return true; }
    if (d.kind === 'robin') { s.hopTo(clamp(s.x + (R() < 0.5 ? -1 : 1) * (60 + R() * 80), 300, 1450), clamp(s.y + (R() - 0.5) * 30, 720, 960), { height: 26, time: 0.36 }); sfx('chirp', { size: 0.25, vol: 0.3 }); return true; }
    if (d.kind === 'owl') { owlTouched(s); return true; }
    if (d.kind === 'buck') {
      const c = engine.again('buck', 90);
      if (c < 0.5 && s.startle()) { sfx('startle', { vol: 0.25 }); engine.after(1, () => sfx('step', { vol: 0.2, count: 4 })); }
      else { d.look = 2.2; s.setPose('look'); s.poke(0.3); sfx('sniff', { vol: 0.15 }); }
      return true;
    }
    if (d.kind === 'frog') { frogLeap(s); return true; }
    if (d.kind === 'hole') return false;
    return false;
  }
  function owlTouched(s) {
    const d = s.data, awake = art.nightness(env) > 0.35;
    if (d.fly) return;
    if (!awake) { s.setPose('look'); s.poke(0.4); engine.after(1.4, () => { if (L.owl === s && !d.fly) s.setPose('sleep'); }); sfx('hoot', { vol: 0.15, size: 0.8 }); return; }
    const c = engine.again('owl', 60) + R() * 0.6;
    if (c < 1.2) { s.setPose('look'); s.poke(0.4); sfx('hoot', { vol: 0.3 }); engine.after(1.6, () => { if (L.owl === s && !d.fly) s.setPose('perch'); }); }
    else { d.fly = { t: 0, dur: 9 }; sfx('flutter', { vol: 0.3 }); engine.after(2.5, () => sfx('hoot', { vol: 0.25 })); }
  }
  function frogLeap(s) {
    const d = s.data; if (d.hop) return;
    d.hop = { t: 0, x0: s.x, y0: s.y, x1: s.x + 120, y1: s.y - 60 }; s.setPose('leap'); sfx('ribbit', { vol: 0.4, x: s.x });
  }

  /** a finger passing near: the rabbit, kits and buck look up; the robin comes after the hand in winter */
  function near(x, y, s) {
    let any = false;
    const r = L.rabbit; if (r && engine.view === 'oak' && r.vis > 0.5 && Math.hypot(r.x - x, r.y - 40 - y) < 100 && s.speed > 400) { r.startle(); any = true; }
    return any;
  }
  function strokeEnd(s) {
    const rb = L.robin; if (!rb || engine.view !== 'oak' || env.season !== 'winter' || !P) return;
    if (P.inRegion('meadow', s.x, s.y) && s.y > 700) rb.data.to = [clamp(s.x, 300, 1450), clamp(s.y, 720, 960)];
  }
  function call(pt) {                                                     // a resting hand: the robin and butterflies come
    if (L.robin && env.season === 'winter' && engine.view === 'oak') L.robin.data.to = [clamp(pt.x + 60, 300, 1450), clamp(pt.y, 720, 960)];
    const v = V[engine.view]; for (const b of (v && v.flies) || []) if (b._mover) { b._mover.target = { x: pt.x + (R() - 0.5) * 60, y: pt.y - 60 - R() * 40, stay: 3 }; b._mover.stay = 0; }
  }
  function arrive() {}

  // ---------------------------------------------------------------------------------------------- the day goes on
  function onEnv(next, prev) {
    if (L.owl && next.time !== prev.time) L.owl.setPose(next.time === 'night' || next.time === 'dusk' ? 'perch' : 'sleep');
  }
  function update(dt, env, t, p) {
    const wet = env.wet ?? 0, stormy = env.stormy ?? 0, nk = art.nightness(env), view = engine.view;
    // ---- the rabbit (and kits) go home to the hole from rain, storm and night, and come out again
    const rb = L.rabbit;
    if (rb) {
      const d = rb.data, m = rb._mover, hide = wet > 0.45 || stormy > 0.3 || (env.snowy ?? 0) > 0.6 || nk > 0.7;
      if (hide && d.state === 'out') { d.state = 'going'; m.to = [HOLE.x, HOLE.y + 6]; m.then = 'wait'; m.phase = 'move'; m.hop = null; }
      if (d.state === 'going' && Math.hypot(rb.x - HOLE.x, rb.y - HOLE.y - 6) < 30) { d.state = 'in'; d.t = 0; }
      if (m.phase === 'wait' && Math.hypot(rb.x - HOLE.x, rb.y - HOLE.y - 6) < 30 && d.state === 'out') { d.state = 'peek'; d.t = 0; }   // a startled rabbit waits in its hole for a while
      if (d.state === 'in' || d.state === 'peek') {
        d.t += dt; rb.alpha = Math.max(0, rb.alpha - dt * 2.5); rb.touchable = false; m.phase = 'wait'; m.until = m.t + 5;
        if (d.state === 'in' ? !hide && d.t > 3 : d.t > 7 + R() * 0.1) { d.state = 'out'; rb.alpha = 1; rb.touchable = true; m.to = [...m.home]; m.then = 'idle'; m.phase = 'move'; m.hop = null; sfx('rustle', { vol: 0.15 }); }
      } else if (rb.alpha < 1) { rb.alpha = Math.min(1, rb.alpha + dt * 3); rb.touchable = true; }
      // kits keep near their mother and go home with her
      for (const k of L.kits) {
        const km = k._mover; if (!km) continue;
        if (d.state !== 'out') { k.alpha = Math.max(0, k.alpha - dt * 2); if (km.phase !== 'move' && Math.hypot(k.x - HOLE.x, k.y - HOLE.y) > 40) { km.to = [HOLE.x, HOLE.y + 10]; km.then = 'wait'; km.phase = 'move'; km.hop = null; } km.until = km.t + 4; }
        else { k.alpha = Math.min(1, k.alpha + dt * 2); km.home = [rb.x - 70 - k.data.i * 70, clamp(rb.y + 25, 730, 980)]; }
      }
    }
    // the hole is a way in while it stands open in the grass: whenever the rabbit is in it, and at dusk and night
    const open = !!rb && (rb.data.state !== 'out' || nk > 0.35);
    if (open !== holeOn) { if (open) engine.exits.add(holeExit); else engine.exits.remove(holeExit); holeOn = open; }
    if (L.hole) L.hole.alpha += ((open ? 1 : 0.0) - L.hole.alpha) * Math.min(1, dt * 1.5);
    // ---- the hedgehog curls up when touched, and stays home in the rain
    const hh = L.hedgehog;
    if (hh) {
      const d = hh.data, m = hh._mover;
      if (d.curl > 0) { d.curl -= dt; if (m) m.rest = Math.max(m.rest, 0.2); }
      hh.alpha = 1 - clamp((wet - 0.5) * 3, 0, 1);
    }
    // ---- the apple hedgehog (pond view, autumn): to a fallen apple, onto its spines, away; the apple grows again
    const h2 = L.hog2;
    if (h2 && view === 'pond' && h2.vis > 0.5) {
      const d = h2.data, apples = (V.pond && V.pond.apples) || [];
      if (!d.carry && !d.goal && env.season === 'autumn') {
        const a = apples.find((q) => q.data.state === 'lie' && q.data.t > 1.5 && q.y > 820 && Math.abs(q.x - h2.x) < 700);
        if (a) { d.goal = a; a.data.t = 0; a.data.wait = true; h2.walk([[h2.x, h2.y], [a.x - 10, a.y + 4]], { speed: 34, step: 12, loop: 'once', rest: [0.5, 0.5] }); }
      }
      if (d.goal && !d.carry) {
        const a = d.goal; a.data.t = Math.min(a.data.t, 2);
        if (Math.hypot(h2.x - a.x + 10, h2.y - a.y - 4) < 14) { d.carry = a; d.goal = null; a.data.state = 'carried'; sfx('sniff', { vol: 0.25 }); h2.poke(0.6); h2.walk([[h2.x, h2.y], [2160, 965]], { speed: 30, step: 12, loop: 'once', rest: [0.8, 0.8] }); }
        else if (a.data.state !== 'lie') d.goal = null;
      }
      if (d.carry) {
        const a = d.carry, sz = h2.size; a.x = h2.x - (h2.flip ? -1 : 1) * sz.w * 0.06; a.y = h2.y - sz.h * 0.62; a.z = 2; a.scale = 0.7;
        if (h2.x > 2120) { a.data.state = 'grow'; a.data.t = 0; [a.x, a.y] = a.data.home; a.z = 600; a.scale = 0.1; a.alpha = 1; d.carry = null; h2.walk([[-90, 962], ...HOG2.map((q) => [...q])], { speed: 30, step: 12, rest: [3, 6] }); }
      }
    }
    // ---- snails: the rain brings more out; touched they stay in a while
    for (const vv of [V.oak, V.pond]) for (const s of (vv && vv.snails) || []) {
      const d = s.data; if (d.rain) s.alpha += (clamp((wet - 0.2) * 3, 0, 1) - s.alpha) * Math.min(1, dt);
      if (d.out > 0 && (d.out -= dt) <= 0) { s._mover.poses = [0]; s.setPose('out'); s.poke(0.4); }
      if (s._mover) s._mover.speed = wet > 0.3 ? 9 : 5;
    }
    // ---- bees stay in when it rains or snows
    for (const b of (V.pond && V.pond.bees) || []) { b.scale = lerp(0.42, 1, clamp((b.y - 620) / 220, 0, 1)); b.alpha = clamp(1 - 2.5 * Math.max(wet, env.snowy ?? 0, env.windy > 0.7 ? 0.6 : 0), 0, 1); }
    for (const vv of [V.oak, V.pond]) for (const b of (vv && vv.flies) || []) b.alpha = clamp(1 - 3 * wet, 0, 1);
    // ---- robin follows the hand in the snow
    const ro = L.robin;
    if (ro && ro.data.to && !(ro._mover && ro._mover.kind === 'hop')) {
      const [tx, ty] = ro.data.to, dx = tx - ro.x, dy = ty - ro.y, dd = Math.hypot(dx, dy);
      if (dd < 30) { ro.data.to = null; sfx('chirp', { size: 0.25, vol: 0.2 }); ro.poke(0.5); }
      else { const st = Math.min(dd, 70); ro.hopTo(ro.x + (dx / dd) * st, ro.y + (dy / dd) * st, { height: 18, time: 0.3 }); }
    }
    // ---- the owl: awake from dusk to dawn; now and then a round under the moon
    const ow = L.owl;
    if (ow) {
      const d = ow.data;
      if (d.fly) {
        const f = d.fly; f.t += dt; const k = f.t / f.dur;
        if (k >= 1) { d.fly = null; ow.x = d.home[0]; ow.y = d.home[1]; ow.rot = 0; ow.setPose(nk > 0.35 ? 'perch' : 'sleep'); ow.poke(0.5); }
        else {
          // out to the right, a wide loop over the meadow, back to the bough
          const a = k * TAU, x = d.home[0] + Math.sin(a) * 780 + k * (1 - k) * 600, y = d.home[1] + (1 - Math.cos(a)) * 120 - Math.sin(a * 2) * 40;
          ow.flip = Math.cos(a) < 0; ow.x = x; ow.y = y;
          const wing = Math.floor(f.t * 3.2) % 3; ow.setPose(k > 0.92 ? 'look' : ['up', 'down', 'glide'][wing]);
        }
      } else if (nk > 0.35) {
        if (ow.pose === 1) ow.setPose('perch');
        d.t += dt; if (d.t > 7 + R() * 5) { d.t = 0; ow.setPose(R() < 0.5 ? 'look' : 'perch'); }
        if (env.time === 'night' && R() < dt * 0.006 && view === 'oak') { d.fly = { t: 0, dur: 9 }; }
      } else if (ow.pose !== 1 && ow.pose !== 2) ow.setPose('sleep');
    }
    // ---- the buck: who it is depends on the season and time
    const bk = L.buck;
    if (bk) {
      bk.times = env.season === 'winter' ? ['dawn', 'day', 'dusk'] : env.season === 'autumn' ? ['dawn', 'dusk'] : [];
      if (bk.data.look > 0 && (bk.data.look -= dt) <= 0) bk.setPose('graze');
      if (bk._mover && bk._mover.phase === 'idle' && bk.data.look > 0) bk.setPose('look');
    }
    // ---- the frog at the pond in the rain
    const fr = L.frog;
    if (fr) {
      const d = fr.data, want = wet > 0.3 || (nk > 0.6 && env.season === 'summer') ? 1 : 0;
      if (!d.hop) fr.alpha += (want - fr.alpha) * Math.min(1, dt * 0.8);
      if (d.hop) {
        const h = d.hop; h.t += dt / 0.6; const k = Math.min(1, h.t);
        fr.x = lerp(h.x0, h.x1, k); fr.y = lerp(h.y0, h.y1, k) - Math.sin(k * Math.PI) * 60;
        if (k >= 1 && !h.splash) { h.splash = true; fx.ripple(fr.x, fr.y, { r: 70, n: 3 }); sfx('splash', { vol: 0.3 }); fr.alpha = 0; fr.setPose('sit'); }
        if (h.t > 6) { d.hop = null; fr.x = d.home[0]; fr.y = d.home[1]; }
      } else if (fr.alpha > 0.8 && R() < dt * 0.05) { sfx('ribbit', { vol: 0.2, size: 0.6 }); fr.setPose('sing'); fr.poke(0.5); engine.after(0.9, () => { if (L.frog === fr && !fr.data.hop) fr.setPose('sit'); }); }
    }
  }
  function draw() {}

  return { setup, closed, tap, near, strokeEnd, call, arrive, onEnv, update, draw };
}
