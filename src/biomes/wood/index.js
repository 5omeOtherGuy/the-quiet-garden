// The Wood (painted edition; owner: wood worker). docs/biomes/wood.md has the whole table for the lead.
//
// Three still views joined by paths: the glade (a sunlit clearing under a huge old beech with a badger's sett between
// its roots), the creek (a little waterfall, a pool and stepping stones) and the wood's edge (an ancient hollow oak,
// a wide clearing where the stag grazes). Insides: the sett, the hollow of the oak, and a grotto behind the waterfall
// that shows only when the waterfall freezes in winter (insides.js).
//
// The child is the wind and the weather in the trees:
//   stroke the forest floor   the season's plants come up along the finger, each with its own note
//   brush a crown             autumn leaves let go, spring blossom drifts, summer leaves shiver, winter snow dusts down
//   stroke or tap the water   rings and water notes; autumn leaves that land on the creek float away downstream
//   tap a trunk a few times   the woodpecker answers with the same number of knocks (at night the owl hoots back)
//   roll the old log          woodlice, a beetle and a worm live under it; the log rolls back by itself later
//   swirl in autumn           the leaves whirl up around the finger
//   touch a creature          it answers its own way and comes back later; the same touch is never the same twice
// Hidden (for the lead): the grotto (winter: the frozen waterfall), the white stag (winter nights at the edge), the
// fairy ring (autumn, at the edge, in rain, at dusk or at night), the way from the sett to Under the Ground.
import { TAU, clamp, lerp, near, voice, stepAt, drawFiltered, holdRot } from './util.js';
import { sett, hollow, grotto } from './insides.js';

const VIEWS = ['glade', 'creek', 'edge'];
const WOODLICE = 3;

export default {
  id: 'wood',
  name: 'The Wood',
  painted: 'wood',
  view: 'glade',
  music: { preset: 'wood' },

  create(engine) {
    const fx = engine.art.fx, S = voice(engine), R = () => engine.random(), env = engine.env;
    const V = {};                                  // per view: field, sheds, creatures
    let place = null;
    const knocks = { n: 0, t: 0, x: 0, y: 0 };     // taps on trunks, for the woodpecker's (or the owl's) answer

    // ---- the ways: paths in the pictures, the sett, the owl hole; the grotto only while the waterfall is frozen
    const X = engine.exits;
    X.add({ in: 'glade', poly: [[590, 575], [810, 570], [830, 655], [610, 665]], view: 'edge' });          // the left path, deeper in
    X.add({ in: 'glade', poly: [[1330, 548], [1560, 545], [1580, 668], [1350, 678]], view: 'creek' });      // the right path, to the water
    X.add({ in: 'glade', x: 406, y: 702, r: 72, inst: 'sett' });                                          // the sett between the roots
    X.add({ in: 'creek', poly: [[205, 790], [470, 830], [500, 1000], [205, 1000]], view: 'glade' });       // the path back
    X.add({ in: 'edge', x: 428, y: 322, r: 60, inst: 'hollow' });                                         // the owl hole
    X.add({ in: 'edge', poly: [[985, 655], [1140, 650], [1150, 745], [975, 750]], to: 'meadow' });         // out over the clearing
    X.add({ in: 'edge', poly: [[880, 915], [1190, 915], [1210, 1000], [860, 1000]], view: 'glade' });      // back into the wood
    const caveExit = { in: 'creek', x: 866, y: 498, r: 58, inst: 'grotto' };
    // hidden: follow the creek upstream with a finger, up to the waterfall, and for a while a way opens in the light
    // above it, up along the water to the falls (another place; owner's decision 2026-10-02 21:16)
    const FALLS = { x: 870, y: 292 }, fallsExit = { in: 'creek', x: FALLS.x, y: FALLS.y, r: 62, to: 'falls' };
    const falls = { open: 0, k: 0 };
    function openFalls() {
      if (falls.open <= 0) { X.add(fallsExit); S.phrase([[2, 0.5], [4, 0.5], [6, 0.5], [9, 1.5]], { instrument: 'harp', vol: 0.2 }); S.sfx('wonder', { vol: 0.22 }); }
      falls.open = 28; for (let i = 0; i < 3; i++) engine.after(i * 0.3, () => fx.burst(FALLS.x + (R() - 0.5) * 80, FALLS.y + 40 - R() * 80, { n: 6, power: 0.4, rgb: '255,244,214' }));
    }
    let caveOpen = false;
    const cave = (open) => { if (open === caveOpen) return; caveOpen = open; if (open) X.add(caveExit); else X.remove(caveExit); };

    // ---- what grows under the finger, season by season (whole small plants, cut from the sheets)
    const kinds = (p) => [
      { heads: p.set('bluebell'), h: [0, 0], head: 76, weight: 3, seasons: ['spring'] },
      { heads: p.set('anemone'), h: [0, 0], head: 50, weight: 3, seasons: ['spring'] },
      { heads: p.set('fiddlehead'), h: [0, 0], head: 70, weight: 1.4, seasons: ['spring', 'summer'] },
      { heads: p.set('sorrel'), h: [0, 0], head: 38, weight: 1.6, seasons: ['spring', 'summer'] },
      { heads: p.set('frond'), h: [0, 0], head: 120, weight: 2.4, seasons: ['summer'] },
      { heads: p.set('foxglove'), h: [0, 0], head: 185, weight: 1.3, seasons: ['summer'], lean: 0.06 },
      { heads: p.set('agaric'), h: [0, 0], head: 62, weight: 2, seasons: ['autumn'], lean: 0.04 },
      { heads: p.set('brownshroom'), h: [0, 0], head: 46, weight: 2, seasons: ['autumn'], lean: 0.04 },
      { heads: p.set('porcini'), h: [0, 0], head: 66, weight: 1.2, seasons: ['autumn'], lean: 0.03 },
      { heads: p.set('bracken'), h: [0, 0], head: 96, weight: 1.6, seasons: ['autumn'] },
      { heads: p.set('snowdrop'), h: [0, 0], head: 62, weight: 3, seasons: ['winter', 'spring'] },
      { heads: p.set('holly'), h: [0, 0], head: 74, weight: 1.4, seasons: ['winter'], lean: 0.04 },
      { heads: p.set('frosttuft'), h: [0, 0], head: 60, weight: 1.6, seasons: ['winter'] },
    ].filter((k) => k.heads.length);
    // every plant sings as it opens: harp in spring and summer, woody marimba for autumn's mushrooms, winter's glass
    const BLOOM_VOICE = { spring: 'harp', summer: 'harp', autumn: 'marimba', winter: 'celesta' };
    function bloomNote(it) {
      if (!S.gate('bloom', 0.085)) return;
      const season = place && place.seasonAt ? place.seasonAt(it.x, it.y) : env.season;
      S.note(stepAt(it.x, 3, 8, place ? place.width : 2000) + (it.y < 760 ? 2 : 0), { instrument: BLOOM_VOICE[season] || 'harp', vol: 0.16, x: it.x });
    }

    function setupView(p, view) {
      p.show(view);
      const v = (V[view] = { view, sheds: [], floating: [], creatures: {} });
      v.field = p.field({ region: 'meadow', minY: view === 'edge' ? 760 : view === 'creek' ? 650 : 640, max: 120, spacing: 40, wild: view === 'glade' ? 18 : 12,
        life: [80, 170], kinds: kinds(p), onBloom: (it) => { const h = v.field.headOf(it); fx.burst(h.x, h.y, { n: 2, power: 0.28 }); bloomNote(it); } });
      const onLoose = (it) => { if (S.gate('leafnote', 0.13)) S.note(stepAt(it.x, 6, 7, p.width), { instrument: 'harp', vol: 0.09, x: it.x }); if (S.gate('rustle', 0.35)) S.sfx('rustle', { vol: 0.22, x: it.x }); };
      const onLand = (it) => { if (p.inRegion('water', it.x, it.gy)) v.floating.push(it); };
      v.leaves = p.shed({ region: 'crown', ground: 'meadow', pieces: [...p.set('beech'), ...p.set('oakleaf')], size: [24, 42], seasons: ['autumn'], per: 9, max: 150, lie: [25, 60], onLoose, onLand });
      v.petals = p.shed({ region: 'crown', ground: 'meadow', pieces: p.set('blossom'), size: [10, 18], seasons: ['spring'], per: 12, fall: [45, 85], spin: 2, max: 120, lie: [20, 45], onLoose });
      v.green = p.shed({ region: 'crown', ground: 'meadow', pieces: p.set('greenleaf'), size: [22, 36], seasons: ['summer'], per: 46, max: 60, lie: [20, 40], onLoose });
      v.sheds = [v.leaves, v.petals, v.green].filter((s) => s.poses.length);
      v.field.seed(view === 'glade' ? 16 : 10, () => engine.random(), true);
      // water: leaves that land on it float (the shed's ground is the bank, so on the creek view the water is ground too)
      if (view === 'creek') for (const sh of v.sheds) sh.ground = 'water';
      return v;
    }

    // ================================================================================== the glade
    function setupGlade(p) {
      const v = setupView(p, 'glade'), c = v.creatures;
      // the squirrel of the beech: by day on the roots, nibbling; touched it scolds and runs up the trunk; in rain it
      // sits on the bough under its own tail; it comes down again by itself
      c.squirrel = p.add('squirrel', { x: 650, y: 790, depth: true, pose: 'nibble', times: ['dawn', 'day', 'dusk'] }).breathe(0.025, 1.4);
      c.squirrel.data = { st: 'ground', t: 0, home: [650, 790], x0: 650 };
      // the woodpecker on the slim tree on the right, by day
      c.pecker = p.add('woodpecker', { x: 1650, y: 400, scale: 0.9, pose: 'back', times: ['dawn', 'day'], z: 600 });
      c.pecker.data = { drum: 0, n: 0 };
      // the badger: out of the sett at dusk and in the night (in winter it stays asleep inside)
      c.badger = p.add('badger', { x: 470, y: 760, depth: true, pose: 'sniff', times: ['dusk', 'night'], seasons: ['spring', 'summer', 'autumn'], shadow: 0.8 })
        .life({ home: [560, 800], roam: 260, idle: ['sniff', 'walk1'], walk: ['walk1', 'walk2', 'walk3', 'walk4'], step: 14, speed: 42, alert: 'sniff',
          away: () => [410, 712], wait: [6, 12], ground: (x, y) => p.inRegion('meadow', x, y) && y > 740 && y < 960 });
      // the fox crosses at dawn and dusk, sits by the log a while
      c.fox = p.add('fox', { x: 1250, y: 905, depth: true, pose: 'sit', times: ['dawn', 'dusk', 'night'], shadow: 0.8 })
        .life({ home: [1250, 905], roam: 380, idle: ['sit', 'sit', 'walk1'], walk: ['walk1', 'walk2', 'walk3', 'walk4'], step: 16, speed: 80, alert: 'sit',
          away: (s) => [s.x < 1000 ? -260 : 2260, 900], wait: [8, 16], ground: (x, y) => y > 840 && y < 980 });
      // the old log and what lives under it (not in winter: then it lies under the snow)
      const L = (v.log = { x: 1130, y: 880, roll: 0, to: 0, t: 0 });
      v.patch = p.add('patch', { x: L.x, y: L.y + 6, depth: true, seasons: ['spring', 'summer', 'autumn'], touchable: false, z: -30 });
      v.bugs = [];
      for (let i = 0; i < WOODLICE; i++) v.bugs.push(holdRot(p.add('woodlouse', { x: L.x + (i - 1) * 50, y: L.y - 8 + (i % 2) * 14, depth: true, seasons: ['spring', 'summer', 'autumn'], z: -20 })));
      v.bugs.push(holdRot(p.add('beetle', { x: L.x + 20, y: L.y - 4, depth: true, seasons: ['spring', 'summer', 'autumn'], z: -20 })));
      v.bugs.push(holdRot(p.add('worm', { x: L.x - 30, y: L.y + 2, depth: true, seasons: ['spring', 'summer', 'autumn'], z: -21 })));
      for (const b of v.bugs) { b.data = { h: R() * TAU, curl: 0, fast: 0, ox: b.x - L.x, oy: b.y - L.y }; b.alpha = 0; }
      v.logS = holdRot(p.add('log', { x: L.x, y: L.y, depth: true, seasons: ['spring', 'summer', 'autumn'], shadow: 0.9 }));
      // glow-worms in the summer night grass
      v.glow = []; for (let i = 0; i < 400 && v.glow.length < 26; i++) { const x = 250 + R() * 1500, y = 720 + R() * 270; if (p.inRegion('meadow', x, y)) v.glow.push({ x, y, k: 0, ph: R() * TAU }); }
    }

    // ================================================================================== the creek
    const STONES = [[981, 692], [1150, 676], [1319, 659], [1426, 638], [1505, 670]];
    function setupCreek(p) {
      const v = setupView(p, 'creek'), c = v.creatures;
      c.frog = p.add('frog', { x: STONES[1][0], y: STONES[1][1], pose: 'sit', depth: true, seasons: ['spring', 'summer', 'autumn'], times: ['dawn', 'day', 'dusk', 'night'], shadow: 0.6 }).breathe(0.04, 2.2);
      c.frog.data = { at: 1, leap: 0 };
      c.frog2 = p.add('frog', { x: STONES[3][0], y: STONES[3][1], pose: 'sit', depth: true, seasons: ['spring', 'summer'], shadow: 0.6, scale: 0.85 }).breathe(0.04, 2.6);
      c.frog2.data = { at: 3, leap: 0, rainOnly: true };
      v.drops = 0;
    }

    // ================================================================================== the edge
    function setupEdge(p) {
      const v = setupView(p, 'edge'), c = v.creatures;
      // the stag in the clearing: in winter by day; in the other seasons at dawn and dusk, and when fog lets it come near
      c.stag = p.add('stag', { x: 1350, y: 660, depth: true, pose: 'graze', shadow: 0.7 })
        .life({ home: [1350, 660], roam: 160, idle: ['graze', 'rest', 'graze'], alert: 'alert', hop: ['crouch', 'leap', 'land'], hopLen: 520, hopTime: 0.5, hopHeight: 60,
          away: (s) => [2500, s.y - 30], wait: [10, 18], ground: (x, y) => y > 610 && y < 760 });
      c.stag.data = { flick: 0 };
      // the white stag: only on winter nights, far out in the snow; touched, it fades into light and comes back another time
      c.white = p.add('stag', { x: 1520, y: 640, depth: true, pose: 'rest', seasons: ['winter'], times: ['night'], touchable: true, shadow: 0 }).breathe(0.012, 0.7);
      c.white.data = { fade: 1, gone: 0 };
      // the owl: at dusk and in the night on the oak's bough or in the mouth of its hole
      const PERCH = (v.perches = [[640, 182], [430, 352]]);
      c.owl = p.add('owl', { x: PERCH[0][0], y: PERCH[0][1], pose: 'front', scale: 0.62, times: ['dusk', 'night'], z: 700 }).breathe(0.02, 0.9);
      c.owl.data = { at: 0, fly: null };
      c.owlFly = p.add('owl-fly', { x: PERCH[0][0], y: PERCH[0][1], scale: 0.62, touchable: false, z: 710 });
      c.owlFly.alpha = 0;
      // the fairy ring: autumn, in rain or at dusk and night; each mushroom sings one step of the scale when touched
      v.ring = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + 0.3, x = 1430 + Math.cos(a) * 165, y = 860 + Math.sin(a) * 46;
        const s = p.add(i % 3 === 0 ? 'ring-agaric' : 'ring-shroom', { x, y, depth: true, seasons: ['autumn'], scale: 0.9 + 0.2 * R(), flip: R() < 0.5 });
        s.data = { i, glow: 0 }; s.alpha = 0; v.ring.push(s);
      }
      v.ringLift = [];
    }

    // ---- the place's own answers to strokes (the engine already fed the field, the sheds and the painting's motion)
    const strokeMem = new Map();
    function stroke(s, p) {
      if (!p || s.phase === 'end') { strokeMem.delete(s.id); return; }
      const v = V[engine.view]; if (!v) return;
      let m = strokeMem.get(s.id); if (!m) strokeMem.set(s.id, (m = { d: 0, x: s.x, y: s.y, up: 0 }));
      const step = Math.hypot(s.x - m.x, s.y - m.y), ux = s.x - m.x, uy = s.y - m.y; m.d += step; m.x = s.x; m.y = s.y;
      if (engine.view === 'creek') {                                                         // upstream: against the flow (down and to the right)
        const against = step > 0 ? -(ux * 0.94 + uy * 0.34) / step : 0;
        if (s.over === 'water' || (s.y < 600 && s.x > 700 && s.x < 1050)) m.up = Math.max(0, m.up + (against > 0.3 ? step : -step * 0.5));
        if (m.up > 520 && s.x > 720 && s.x < 1010 && s.y < 560) { m.up = 0; openFalls(); }
      }
      const season = env.season, over = s.over;
      // creatures feel a passing hand
      for (const c of Object.values(v.creatures)) if (c && c.vis > 0.5 && c.startle && near(s, c.x, c.y - 40, 90) && c._mover && c._mover.kind === 'life') touchCreature(c, v, true);
      if (v.log && !logGone() && near(s, v.log.x, v.log.y - 30, 150) && Math.abs(s.dx) > 0.6 && s.speed > 250) rollLog(v, s.dx > 0 ? 1 : -1);
      if (over === 'water') {
        if (m.d > 44) {
          m.d = 0; const frozen = season === 'winter';
          if (frozen) { fx.burst(s.x, s.y, { n: 3, power: 0.25, rgb: '230,240,255' }); S.note(stepAt(s.x, 5, 8, p.width), { instrument: 'glass', vol: 0.16, x: s.x }); }
          else { fx.ripple(s.x, s.y, { r: 60 }); S.note(stepAt(s.x, 2, 8, p.width), { instrument: 'water', vol: 0.2, x: s.x }); }
        }
        return true;
      }
      if (over === 'crown') {
        if (m.d > 38) {
          m.d = 0;
          if (season === 'winter') { fx.burst(s.x, s.y, { n: 4, power: 0.22, rgb: '255,255,255' }); S.note(stepAt(s.x, 7, 6, p.width), { instrument: 'celesta', vol: 0.12, x: s.x }); }
          else if (season === 'summer' && S.gate('shiver', 0.3)) S.sfx('rustle', { vol: 0.3, x: s.x });
        }
        return true;
      }
      if (over === 'meadow') return true;            // the plants that come up sing (bloomNote)
      return false;                                  // the far wood, trunks and stones: the engine's soft notes
    }

    // ---- taps
    function tap(pt, p) {
      if (!p) return;
      const v = V[engine.view]; if (!v) return;
      const s = pt.thing, season = env.season;
      if (s) return tapThing(s, v, pt, p);
      // small or far creatures: a touch near them counts (a child's finger is wide)
      let best = null, bd = 1e9;
      for (const c of Object.values(v.creatures)) {
        if (!c || !c.touchable || c.vis < 0.5 || (c.alpha < 0.5 && c !== v.creatures.white) || c === v.creatures.owlFly) continue;
        const z = c.size, d = Math.hypot(pt.x - c.x, pt.y - (c.y - z.h * 0.5)); if (d < Math.max(60, z.h * 0.7) && d < bd) { bd = d; best = c; }
      }
      if (best) return tapThing(best, v, pt, p);
      // under the log: the bugs are small; find the nearest within reach
      if (v.bugs && v.log.roll > 0.6) for (const b of v.bugs) if (b.alpha > 0.5 && near(pt, b.x, b.y - 6, 34)) return tapThing(b, v, pt, p);
      if (v.log && !logGone() && near(pt, v.log.x + v.log.roll * 250, v.log.y - 30, 120)) { rollLog(v, v.log.roll > 0.5 ? -1 : 1); return true; }
      if (pt.over === 'meadow') {
        const sc = p.scaleAt(pt.y); let n = 0;
        for (let i = 0; i < 3; i++) if (v.field.bloomAt(pt.x + (i ? (R() - 0.5) * 70 * sc : 0), pt.y + (i ? (R() - 0.3) * 30 * sc : 0), { crowd: 4 })) n++;
        fx.bloom(pt.x, pt.y, { r: 70 * sc + 30 });
        if (!n) S.note(stepAt(pt.x, 3, 8, p.width), { instrument: 'harp', vol: 0.14, x: pt.x });
        return true;
      }
      if (pt.over === 'water') {
        if (season === 'winter') { fx.burst(pt.x, pt.y, { n: 6, power: 0.4, rgb: '220,235,255' }); S.note(stepAt(pt.x, 6, 7, p.width), { instrument: 'glass', vol: 0.22, x: pt.x }); S.sfx('tok', { vol: 0.1, pitch: 2 }); }
        else { fx.ripple(pt.x, pt.y, { r: 90, n: 3 }); S.sfx('plop', { vol: 0.35, x: pt.x }); S.note(stepAt(pt.x, 2, 8, p.width), { instrument: 'water', vol: 0.22, x: pt.x }); }
        return true;
      }
      if (pt.over === 'crown') {
        const sheds = v.sheds.filter((sh) => !sh.seasons || sh.seasons.includes(season));
        for (const sh of sheds) for (let i = 0; i < (sh === v.green ? 2 : 5); i++) sh.loose(pt.x + (R() - 0.5) * 70, pt.y + (R() - 0.5) * 50, (R() - 0.5) * 70, -10);
        if (season === 'winter') { fx.burst(pt.x, pt.y, { n: 10, power: 0.45, rgb: '255,255,255' }); S.chord([7, 9, 11], { instrument: 'celesta', vol: 0.12, strum: 0.05 }); }
        else S.sfx('rustle', { vol: 0.35, x: pt.x });
        fx.burst(pt.x, pt.y, { n: 4, power: 0.35 });
        return true;
      }
      if (!pt.over && pt.y < 820) {                  // a trunk, a root, a rock: it knocks, and the wood may answer
        S.sfx('tok', { vol: 0.28, count: 1, x: pt.x }); fx.burst(pt.x, pt.y, { n: 3, power: 0.25, rgb: '255,236,200' });
        knocks.n = Math.min(9, knocks.n + 1); knocks.t = engine.now(); knocks.x = pt.x; knocks.y = pt.y;
        return true;
      }
      return false;
    }

    function tapThing(s, v, pt, p) {
      const c = v.creatures, again = (k, m) => engine.again(k, m);
      fx.burst(pt.x, pt.y, { n: 5, power: 0.45 });
      if (s === c.squirrel) { squirrelFlee(s); return true; }
      if (s === c.pecker) { s.data.drum = 0.9; s.data.n = 3 + ((R() * 4) | 0); S.sfx('tok', { count: s.data.n, speed: 1.4, vol: 0.4, x: s.x }); return true; }
      if (s === c.badger) { s.startle(); S.sfx(again('badger', 25) > 1 ? 'snore' : 'sniff', { vol: 0.4, x: s.x }); return true; }
      if (s === c.fox) { s.startle(); S.sfx(again('fox', 30) > 1 ? 'sniff' : 'startle', { vol: 0.35, x: s.x }); return true; }
      if (s === c.frog || s === c.frog2) { frogLeap(s); return true; }
      if (s === c.stag) { stagTouch(s); return true; }
      if (s === c.white) { whiteTouch(s, v); return true; }
      if (s === c.owl) { owlTouch(s, v); return true; }
      if (v.ring && v.ring.includes(s)) { ringTouch(s, v); return true; }
      if (s === v.logS) { rollLog(v, v.log.roll > 0.5 ? -1 : 1); return true; }
      if (v.bugs && v.bugs.includes(s)) {
        const d = s.data;
        if (s.name === 'woodlouse') { d.curl = 3 + R() * 2; s.poke(0.8); S.note(9 + ((R() * 3) | 0), { instrument: 'kalimba', vol: 0.18 }); }
        else if (s.name === 'beetle') { d.fast = 1.6; S.sfx('chitter', { vol: 0.15, size: 0.1 }); }
        else { d.fast = 1.2; s.poke(1); S.sfx('squelch', { vol: 0.2 }); }
        return true;
      }
      s.poke(); S.sfx('tap', { vol: 0.3 });
      return true;
    }

    function touchCreature(c, v, passing) {
      if (c === v.creatures.stag) { if (!passing) stagTouch(c); else if (c._mover.phase === 'idle') c.startle(); return; }
      if (c.startle()) S.sfx('rustle', { vol: 0.2, x: c.x });
    }

    // ---- the squirrel
    function squirrelFlee(s) {
      const d = s.data, a = engine.again('squirrel', 30);
      S.sfx('chitter', { vol: 0.42, size: 0.25, x: s.x });
      if (d.st === 'ground' && a < 2) { d.st = 'run'; d.t = 0; s._mover = null; }
      else if (d.st === 'perch') { s.poke(0.8); s.setPose(s.pose === 1 ? 'tail' : 'alert'); }
      else { s.hopTo(s.x + (R() - 0.5) * 90, s.y + (R() - 0.5) * 20, { height: 30, time: 0.4 }); s.setPose('bound'); }
    }
    const TRUNK = { x: 522, y0: 770, y1: 250, perch: [650, 186] };
    function squirrelLife(s, dt, e) {
      const d = s.data; d.t += dt;
      const rain = (e.wet ?? 0) > 0.35 || (e.stormy ?? 0) > 0.3;
      if (d.st === 'ground') {
        if (rain && d.t > 1) { d.st = 'run'; d.t = 0; s._mover = null; return; }
        if (!s._mover && d.t > 3 + R() * 4) {                                         // a few hops about, then nibbles
          d.t = 0; const x = clamp(d.home[0] + (R() - 0.5) * 260, 600, 900), y = d.home[1] + (R() - 0.5) * 40;
          s.setPose('bound'); s.hopTo(x, y, { height: 26, time: 0.38 });
        } else if (!s._mover || s._mover.kind !== 'hop') s.setPose(d.t % 6 < 3 ? 'nibble' : 'alert');
      } else if (d.st === 'run') {                                                     // to the foot of the trunk
        s.setPose(Math.floor(d.t * 10) % 2 ? 'run' : 'bound');
        const dx = TRUNK.x - s.x, dy = TRUNK.y0 - s.y, L = Math.hypot(dx, dy);
        if (L < 8) { d.st = 'up'; d.t = 0; } else { s.x += (dx / L) * Math.min(L, 320 * dt); s.y += (dy / L) * Math.min(L, 320 * dt); s.flip = dx < 0; }
      } else if (d.st === 'up') {
        s.setPose('climb'); s.flip = false; s.depth = false; s.scale = place.scaleAt(TRUNK.y0);
        s.y -= 260 * dt; if (s.y <= TRUNK.y1) { s.y = TRUNK.y1; d.st = 'bough'; d.t = 0; }
      } else if (d.st === 'bough') {
        s.setPose('run'); const [px, py] = TRUNK.perch; s.x += (px - s.x) * Math.min(1, dt * 4); s.y += (py - s.y) * Math.min(1, dt * 4);
        if (Math.hypot(px - s.x, py - s.y) < 4) { d.st = 'perch'; d.t = 0; s.flip = true; }
      } else if (d.st === 'perch') {
        s.setPose(rain ? 'tail' : (Math.floor(d.t / 3) % 2 ? 'nibble' : 'alert'));
        if (!rain && d.t > 9 + R() * 6) { d.st = 'down'; d.t = 0; }
      } else if (d.st === 'down') {
        s.setPose('climb'); s.x += (TRUNK.x - s.x) * Math.min(1, dt * 5); s.y += 230 * dt * (Math.abs(TRUNK.x - s.x) < 6 ? 1 : 0);
        if (s.y >= TRUNK.y0) { s.y = TRUNK.y0; s.depth = true; s.scale = 1; d.st = 'ground'; d.t = 0; s.setPose('bound'); s.hopTo(d.home[0], d.home[1], { height: 28, time: 0.45 }); }
      }
    }

    // ---- the log: rolled aside it shows who lives under it; later it rolls back
    const logGone = () => env.season === 'winter';
    function rollLog(v, dir) {
      const L = v.log, to = dir > 0 ? 1 : 0; if (L.to === to) return;
      L.to = to; L.t = 0; S.sfx('creak', { vol: 0.3, x: L.x }); S.sfx('rustle', { vol: 0.3, x: L.x });
      if (to) { S.phrase([[4, 0.5], [6, 0.5], [8, 1]], { instrument: 'marimba', vol: 0.2 }); fx.burst(L.x, L.y - 20, { n: 8, power: 0.5, rgb: '230,210,170' }); }
    }
    function logLife(v, dt) {
      const L = v.log; L.t += dt;
      if (L.to === 1 && L.t > 16 + R() * 0.1) { L.to = 0; L.t = 0; S.sfx('creak', { vol: 0.2, x: L.x }); }
      const k = Math.min(1, dt * 2.2), was = L.roll; L.roll += (L.to - L.roll) * k;
      const s = v.logS, sc = place.scaleAt(L.y);
      s.x = L.x + L.roll * 250 * sc; s.y = L.y - Math.sin(L.roll * Math.PI) * 10;
      s.spin = (L.roll - was) * 6 + Math.sin(L.roll * Math.PI) * 0.03;
      const show = clamp((L.roll - 0.45) / 0.35, 0, 1);
      for (const b of v.bugs) {
        const d = b.data; b.alpha = show; b.touchable = show > 0.5; if (show <= 0) { b.x = L.x + d.ox * sc; b.y = L.y + d.oy; continue; }
        if (d.curl > 0) { d.curl -= dt; b.scale = 0.7; continue; } b.scale = 1;
        const sp = (d.fast > 0 ? 70 : 9) * sc; d.fast = Math.max(0, d.fast - dt); d.h += Math.sin(engine.now() * 0.9 + d.ox) * dt * 1.6;
        b.x += Math.cos(d.h) * sp * dt; b.y += Math.sin(d.h) * sp * 0.4 * dt;
        if (Math.abs(b.x - L.x) > 120 * sc || Math.abs(b.y - L.y) > 22) { d.h += Math.PI; b.x = clamp(b.x, L.x - 120 * sc, L.x + 120 * sc); b.y = clamp(b.y, L.y - 22, L.y + 22); }
        b.spin = Math.atan2(Math.sin(d.h) * 0.4, Math.cos(d.h)) + Math.PI / 2 + (b.name === 'worm' ? Math.sin(engine.now() * (d.fast > 0 ? 9 : 3)) * 0.25 : 0);
      }
    }

    // ---- the frog on the stepping stones
    function frogLeap(s) {
      const d = s.data; if (d.leap > 0) return;
      const next = clamp(d.at + (R() < 0.5 ? -1 : 1) * (1 + ((R() * 1.4) | 0)), 0, STONES.length - 1), to = STONES[next === d.at ? (d.at + 1) % STONES.length : next];
      d.at = STONES.indexOf(to); d.leap = 0.5; s.setPose('leap'); s.hopTo(to[0], to[1], { height: 46, time: 0.5 });
      S.sfx('ribbit', { size: 0.4 + R() * 0.3, x: s.x }); S.note(stepAt(to[0], 2, 8), { instrument: 'water', vol: 0.18, delay: 0.5 });
      engine.after(0.5, () => { s.setPose('sit'); fx.ripple(to[0], to[1] + 6, { r: 40, n: 2 }); S.sfx('plop', { vol: 0.25, x: to[0] }); });
    }

    // ---- the stag: the first touch, it looks up and bolts; touched again soon after, it only lifts its head
    function stagTouch(s) {
      const a = engine.again('stag', 40);
      if (a < 1 || (s._mover.phase !== 'idle')) { if (s.startle()) { S.sfx('startle', { vol: 0.25, x: s.x }); engine.after(0.7, () => S.sfx('step', { vol: 0.2, count: 4, x: s.x })); } }
      else { s.setPose('alert'); s.poke(0.25); s.data.flick = 1.4; S.sfx('sniff', { vol: 0.2, x: s.x }); }
    }
    function whiteTouch(s, v) {
      if (s.data.gone > 0) return;
      s.data.gone = 30 + R() * 30; S.phrase([[9, 0.5], [7, 0.5], [11, 0.5], [9, 2]], { instrument: 'choir', vol: 0.18 }); S.sfx('wonder', { vol: 0.3 });
      for (let i = 0; i < 4; i++) engine.after(i * 0.25, () => fx.burst(s.x + (R() - 0.5) * 60, s.y - 60 - R() * 80, { n: 8, power: 0.5, rgb: '230,240,255' }));
    }

    // ---- the owl: a touch, it turns its head and hoots; again, it flies to its other perch
    function owlTouch(s, v) {
      const d = s.data; if (d.fly) return;
      const a = engine.again('owl', 20);
      if (a < 1.5) { s.setPose(s.pose === 1 ? 'front' : 'side'); s.poke(0.4); S.sfx('hoot', { vol: 0.35, x: s.x, count: 1 + (a > 0.5 ? 1 : 0) }); }
      else owlFly(s, v);
    }
    function owlFly(s, v) {
      const d = s.data, to = v.perches[1 - d.at]; d.fly = { t: 0, x0: s.x, y0: s.y, x1: to[0], y1: to[1] }; d.at = 1 - d.at;
      s.alpha = 0; v.creatures.owlFly.alpha = 1; S.sfx('flutter', { vol: 0.3, x: s.x });
    }
    function owlLife(s, v, dt, t) {
      const d = s.data, f = v.creatures.owlFly; f.vis = s.vis;
      if (!d.fly) { if (s.pose === 1 && R() < dt * 0.15) s.setPose('front'); return; }
      const F = d.fly; F.t += dt / 1.6; const k = clamp(F.t, 0, 1), e = k * k * (3 - 2 * k);
      f.x = lerp(F.x0, F.x1, e); f.y = lerp(F.y0, F.y1, e) - Math.sin(k * Math.PI) * 90; f.flip = F.x1 < F.x0; f.setPose(k > 0.85 ? 'glide' : Math.floor(t * 7) % 2 ? 'up' : 'down');
      if (k >= 1) { s.x = F.x1; s.y = F.y1; s.alpha = 1; f.alpha = 0; d.fly = null; s.setPose('front'); s.poke(0.5); }
    }

    // ---- the fairy ring
    function ringTouch(s, v) {
      s.data.glow = 1; s.poke(0.7);
      S.note(s.data.i + 2, { instrument: 'celesta', vol: 0.22, x: s.x }); fx.burst(s.x, s.y - 20, { n: 5, power: 0.35, rgb: '230,240,200' });
      if (v.ring.every((r) => r.data.glow > 0.25)) {                                     // all of them aglow at once: little lights rise into the wood
        S.chord([2, 4, 6, 9], { instrument: 'harp', vol: 0.2, strum: 0.09 }); S.sfx('wonder', { vol: 0.25 });
        for (let i = 0; i < 14; i++) v.ringLift.push({ x: 1430 + (R() - 0.5) * 300, y: 860 + (R() - 0.5) * 60, vy: -30 - R() * 40, ph: R() * TAU, t: 0, life: 6 + R() * 5 });
      }
    }
    const ringOn = () => env.season === 'autumn' && ((env.wet ?? 0) > 0.2 || env.time === 'dusk' || env.time === 'night');

    // ---- the woodpecker (by day) or the owl (at night) answers the child's knocks
    function knockAnswer(t) {
      if (!knocks.n || t - knocks.t < 0.9) return;
      const n = knocks.n; knocks.n = 0;
      const night = env.time === 'night' || env.time === 'dusk';
      if (night) { S.sfx('hoot', { vol: 0.3, count: Math.min(n, 5), delay: 0.3 }); return; }
      const v = V[engine.view], pk = v && v.creatures.pecker;
      if (pk && pk.vis > 0.5) { pk.data.drum = 0.25 + n * 0.12; pk.data.n = n; S.sfx('tok', { count: n, speed: 1.2, vol: 0.4, x: pk.x, delay: 0.25 }); }
      else S.sfx('tok', { count: n, speed: 1.2, vol: 0.18, delay: 0.35, x: knocks.x > 1000 ? 300 : 1700 });   // a woodpecker far off in the wood
    }

    // ---- swirl in autumn: the leaves whirl up around the finger
    let swirlT = 0;
    engine.gestures.on('swirl', (info) => {
      const v = V[engine.view]; if (!v || !place || env.season !== 'autumn' || info.phase !== 'move') return false;
      const t = engine.now(); if (t - swirlT < 0.08) return false; swirlT = t;
      const sh = v.leaves;
      for (let i = 0; i < 3; i++) { const a = R() * TAU, r = 60 + R() * 140, x = info.x + Math.cos(a) * r, y = info.y + Math.sin(a) * r * 0.6; if (place.inRegion('crown', x, y)) sh.loose(x, y, -Math.sin(a) * 160, Math.cos(a) * 80); }
      for (let i = sh.lying.length - 1; i >= 0 && i > sh.lying.length - 40; i--) {
        const it = sh.lying[i], dx = it.x - info.x, dy = it.y - info.y; if (dx * dx + dy * dy > 260 * 260) continue;
        sh.lying.splice(i, 1); it.vy = -160 - R() * 120; it.vx = -dy * 1.5 + (R() - 0.5) * 60; it.y -= 6; it.age = 0; sh.air.push(it);
      }
      return false;                                                                       // the wind rises as everywhere
    });

    // ---- per frame: lives of their own
    let t0 = 0;
    function update(dt, e) {
      if (!place) return;
      const t = engine.now(), view = engine.view, v = V[view]; if (!v) return;
      cave(view === 'creek' && e.season === 'winter');
      if (falls.open > 0) { falls.open -= dt; if (falls.open <= 0 || view !== 'creek') { falls.open = 0; X.remove(fallsExit); } }
      if (falls.open > 0 && R() < dt * 1.6 && engine.sparkle) engine.sparkle(FALLS.x + (R() - 0.5) * 80, FALLS.y + (R() - 0.5) * 50, 4, 0.8);   // a soft glitter at the top of the falls, seen by day too
      falls.k += ((falls.open > 0 ? 1 : 0) - falls.k) * Math.min(1, dt * 1.2);
      knockAnswer(t);
      const c = v.creatures; if (!v.leaves) return;
      // the season's own small events: leaves let go by themselves, blossom drifts, more in wind
      const windy = e.windy ?? 0, stormy = e.stormy ?? 0;
      if (e.season === 'autumn' && R() < dt * (0.45 + 4 * windy + 6 * stormy)) v.leaves.scatter(1);
      if (e.season === 'spring' && R() < dt * (0.25 + 3 * windy)) v.petals.scatter(1);
      if (e.season === 'summer' && R() < dt * 2 * stormy) v.green.scatter(1);
      // rain makes mushrooms come up by themselves in autumn
      v.field.wild = (view === 'glade' ? 18 : 12) + ((e.wet ?? 0) > 0.3 && e.season === 'autumn' ? 30 : 0);
      // leaves on the water float downstream and fade
      for (let i = v.floating.length - 1; i >= 0; i--) {
        const it = v.floating[i];
        if (!place.inRegion('water', it.x, it.y) && it.age > 0.5) { v.floating.splice(i, 1); continue; }
        if (e.season === 'winter') continue;
        const flow = 26 + 40 * ((e.wet ?? 0) + stormy); it.x += flow * dt; it.y += flow * 0.34 * dt; it.gy = it.y; it.rot += dt * 0.3 * Math.sin(t + it.seed);
        it.age = Math.min(it.age, it.life - 4);                                           // floating leaves do not fade until they leave the water
        if (it.x > 2050) { const sh = v.sheds.find((q) => q.lying.includes(it)); if (sh) sh.lying.splice(sh.lying.indexOf(it), 1); v.floating.splice(i, 1); }
      }
      if (view === 'glade') {
        squirrelLife(c.squirrel, dt, e);
        const pk = c.pecker; if (pk.data.drum > 0) { pk.data.drum -= dt; pk.setPose(Math.floor(t * 16) % 2 ? 'knock' : 'back'); } else { pk.setPose('back'); if (R() < dt * 0.04 && pk.vis > 0.5) { pk.data.drum = 0.7; S.sfx('tok', { count: 6, speed: 1.6, vol: 0.2, x: pk.x }); } }
        // storms send the fox and the badger home
        if (stormy > 0.4) { if (c.fox._mover.phase === 'idle') c.fox.startle(); if (c.badger._mover.phase === 'idle') c.badger.startle(); }
        // the badger disappears into the sett when it waits at its mouth
        const bd = c.badger, home = bd._mover.phase === 'wait' && Math.hypot(bd.x - 410, bd.y - 712) < 30; bd.alpha += ((home ? 0 : 1) - bd.alpha) * Math.min(1, dt * 3);
        logLife(v, dt);
      } else if (view === 'creek') {
        const wet = e.wet ?? 0;
        c.frog2.alpha += ((wet > 0.25 || e.time === 'night' ? 1 : 0) - c.frog2.alpha) * Math.min(1, dt * 2);
        for (const f of [c.frog, c.frog2]) { if (f.data.leap > 0) f.data.leap -= dt; else if (f.vis > 0.5 && f.alpha > 0.5 && R() < dt * 0.05) frogLeap(f); }
        if (wet > 0.15 && e.season !== 'winter' && R() < dt * 6 * wet) { const x = 800 + R() * 1150, y = 600 + R() * 380; if (place.inRegion('water', x, y)) fx.ripple(x, y, { r: 26 + R() * 20, n: 1 }); }
        if (e.season === 'spring' && e.time === 'dawn' && R() < dt * 0.03) S.motif({ instrument: 'flute', vol: 0.2 });   // the cuckoo, far off
      } else if (view === 'edge') {
        const st = c.stag, wd = st._mover;
        // where the stag is: winter days; other seasons at dawn and dusk, or in fog; it comes nearer in fog
        const fog = e.foggy ?? 0, here = !(stormy > 0.4) && ((e.season === 'winter' && e.time !== 'night') || e.time === 'dawn' || e.time === 'dusk' || fog > 0.3);
        st.alpha += ((here ? 1 : 0) - st.alpha) * Math.min(1, dt * 1.5); st.touchable = st.alpha > 0.5;
        wd.home[1] = fog > 0.3 ? 760 : 660; wd.home[0] = fog > 0.3 ? 1250 : 1350;
        if (st.data.flick > 0) { st.data.flick -= dt; if (st.data.flick <= 0) st.setPose('graze'); }
        const w = c.white; w.data.gone = Math.max(0, w.data.gone - dt);
        w.data.fade += ((w.data.gone > 0 ? 0 : 1) - w.data.fade) * Math.min(1, dt * (w.data.gone > 0 ? 0.8 : 0.3)); w.alpha = 0; w.touchable = w.data.fade > 0.6;
        owlLife(c.owl, v, dt, t);
        const on = ringOn();
        for (const r of v.ring) { r.alpha += ((on ? 1 : 0) - r.alpha) * Math.min(1, dt * 0.8); r.touchable = r.alpha > 0.5; r.data.glow = Math.max(0, r.data.glow - dt * 0.12); }
        for (let i = v.ringLift.length - 1; i >= 0; i--) { const l = v.ringLift[i]; l.t += dt; l.y += l.vy * dt; l.x += Math.sin(t * 1.3 + l.ph) * 20 * dt; if (l.t > l.life) v.ringLift.splice(i, 1); }
      }
    }

    // ---- drawn over the painting and its things: lights of the night, the white stag
    function draw(g, e, view, p) {
      const v = V[engine.view]; if (!v) return;
      const t = engine.now(), night = engine.art.nightness(e);
      if (engine.view === 'glade' && (e.season === 'summer' || e.season === 'spring') && night > 0.45) {
        const a = clamp((night - 0.45) / 0.4, 0, 1);
        for (const w of v.glow) {
          w.k = Math.max(0, w.k - 0.016);
          const b = (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.7 + w.ph), 2)) * a + w.k, sc = p.scaleAt(w.y);
          engine.art.light(g, w.x, w.y, 30 * sc + 10, [0.75, 1, 0.55], 0.9 * b, { core: 2.4 * sc + 1 });
        }
      }
      if (engine.view === 'creek' && falls.k > 0.01) {
        const k = falls.k * (0.8 + 0.2 * Math.sin(t * 1.6));
        engine.art.light(g, FALLS.x, FALLS.y, 180, [1, 0.95, 0.8], 0.9 * k, { core: 10 });
        for (let i = 0; i < 7; i++) { const q = (t * 0.25 + i / 7) % 1; engine.art.light(g, FALLS.x + Math.sin(i * 2.3 + t) * 40, FALLS.y + 70 - q * 160, 16, [1, 0.96, 0.82], Math.sin(q * Math.PI) * k, { core: 1.6 }); }
        // by day the lights barely show: a soft haze and rising motes painted into the scene itself
        const day = k * (1 - night * 0.7);
        g.save(); g.globalCompositeOperation = 'screen';
        const gr = g.createRadialGradient(FALLS.x, FALLS.y, 0, FALLS.x, FALLS.y, 140);
        gr.addColorStop(0, `rgba(255,247,222,${(0.6 * day).toFixed(3)})`); gr.addColorStop(0.45, `rgba(255,240,205,${(0.25 * day).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,240,205,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(FALLS.x, FALLS.y, 140, 0, TAU); g.fill();
        for (let i = 0; i < 9; i++) {
          const q = (t * 0.22 + i / 9) % 1, a = Math.sin(q * Math.PI) * day;
          g.fillStyle = `rgba(255,252,236,${(0.85 * a).toFixed(3)})`; g.beginPath(); g.arc(FALLS.x + Math.sin(i * 2.1 + t * 0.8) * 55, FALLS.y + 80 - q * 190, 3 + 2 * Math.sin(i * 1.7), 0, TAU); g.fill();
        }
        g.restore();
      }
      if (engine.view === 'edge') {
        const w = v.creatures.white;
        if (w.vis > 0.02 && w.data.fade > 0.02) {
          const k = w.data.fade * w.vis, sz = w.size;
          const pulse = 0.85 + 0.15 * Math.sin(t * 1.3), cy = w.y - sz.h * 0.5, hr = sz.h * 0.95;
          g.save(); g.globalCompositeOperation = 'screen';                                    // a pale halo in the snow
          const hg = g.createRadialGradient(w.x, cy, 0, w.x, cy, hr);
          hg.addColorStop(0, `rgba(225,236,255,${(0.42 * k * pulse).toFixed(3)})`); hg.addColorStop(0.5, `rgba(210,226,255,${(0.16 * k * pulse).toFixed(3)})`); hg.addColorStop(1, 'rgba(210,226,255,0)');
          g.fillStyle = hg; g.beginPath(); g.arc(w.x, cy, hr, 0, TAU); g.fill(); g.restore();
          drawFiltered(g, w, 'grayscale(1) brightness(2.05) contrast(0.75)', 0.94 * k);
          engine.art.light(g, w.x, cy, sz.h * 1.2, [0.85, 0.92, 1], 0.9 * k * pulse);
        }
        for (const r of v.ring) if (r.data.glow > 0.01 && r.alpha > 0.1) engine.art.light(g, r.x, r.y - 24, 70, [0.85, 1, 0.7], r.data.glow * r.alpha, { core: 4 });
        for (const l of v.ringLift) engine.art.light(g, l.x, l.y, 26, [0.9, 1, 0.65], Math.sin(Math.min(1, l.t / l.life) * Math.PI) * 0.9, { core: 2.5 });
      }
    }

    // glow-worms brighten under a passing finger
    function glowTouch(x, y) { const v = V.glade; if (!v || engine.view !== 'glade') return; for (const w of v.glow) if (Math.hypot(w.x - x, w.y - y) < 90) { if (w.k < 0.3 && S.gate('glow', 0.12)) S.note(stepAt(w.x, 7, 6), { instrument: 'glass', vol: 0.12, x: w.x }); w.k = 1; } }

    return {
      instances: { sett, hollow, grotto },
      setup(p) {
        place = p;
        for (const f of [setupGlade, setupCreek, setupEdge]) { try { f(p); } catch (e) { console.warn('wood setup:', e); } }
        p.show(engine.view || 'glade');
      },
      closed() { place = null; },
      stroke(s, p) {
        if (p && s.phase !== 'end' && engine.view === 'glade' && engine.art.nightness(env) > 0.45) glowTouch(s.x, s.y);
        return stroke(s, p);
      },
      tap(pt, p) {
        if (p && engine.view === 'glade' && engine.art.nightness(env) > 0.45) glowTouch(pt.x, pt.y);
        return tap(pt, p);
      },
      hold(pt, p) { return false; },
      update(dt, e) { update(dt, e); },
      draw,
      view(id) { cave(id === 'creek' && env.season === 'winter'); },
    };
  },
};
