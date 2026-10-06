// The worked painted place (owner: engine; reach it with ?place=_painted). Built from art's meadow proof
// (web/assets/art/meadow: views oak and pond, 4 seasons x day/night, pieces, creatures). Place workers copy from
// here; docs/ENGINE.md "A painted place" walks through it. Paintings, regions and grown things are art's
// (web/src/art/index.js header); the engine opens and frees them, feeds them every finger and walks between views.
//   stroke the meadow        flowers of the season come up along the finger (the engine feeds the field)
//   brush the crown          autumn leaves, spring petals let go (the engine feeds the sheds); winter: snow dust
//   any stroke               the painting stirs under the finger and comes to rest
//   tap the rabbit           it looks up, hops away, waits, comes back; near a stroke it looks up too
//   tap the snail            it draws in and comes out later
//   tap an apple (autumn)    it drops, lies, fades, and a new one grows (pond view)
//   tap the water            rings          the path at the side    the other view      the oak's door   the demo
const R = Math.random, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default {
  id: '_painted',
  name: 'The Painted Meadow',
  music: { scale: 'major-pentatonic', mood: 'bright' },
  painted: 'meadow',                                     // web/assets/art/meadow: views, safe areas, regions come from it
  view: 'oak',

  create(engine) {
    const fx = engine.art.fx, V = {};
    let place = null;
    const sfx = (name, o) => { const a = engine.audio; if (a && a.sfx && a.sfx.play) a.sfx.play(name, o || {}); };
    const note = (step, o) => { const a = engine.audio; if (a && a.note) a.note(step, o || {}); };
    let noteT = 0, step = 4, rustleT = 0, touchT = -9;
    const bloomNote = (x) => {                           // the trail sings as it blooms (at most every 0.09 s)
      const t = engine.now(); if (t - touchT > 1 || t - noteT < 0.09) return; noteT = t; // only flowers a finger grew sing
      step = (step + 1 + ((x / 300) | 0) % 2) % 15;
      note(step - 3, { instrument: engine.env.season === 'winter' ? 'glass' : 'kalimba', vol: 0.1, x });
    };
    const leafSound = () => { const t = engine.now(); if (t - rustleT > 0.3) { rustleT = t; sfx('rustle', { vol: 0.3, count: 2 }); } };

    engine.exits.add({ in: 'oak', poly: [[1420, 700], [1600, 690], [1600, 1000], [1380, 1000]], view: 'pond' });  // walk on
    engine.exits.add({ in: 'pond', poly: [[400, 690], [580, 700], [620, 1000], [400, 1000]], view: 'oak' });      // and back
    engine.exits.add({ in: 'oak', x: 200, y: 540, r: 70, to: '_demo', view: 'meadow' });                         // the door

    const kinds = (p) => [
      { heads: p.set('head-poppy'), stems: ['stem-1', 'stem-6'], h: [95, 150], head: 50, weight: 3, seasons: ['summer'] },
      { heads: p.set('head-daisy'), stems: ['stem-3', 'stem-8'], h: [80, 130], head: 42, weight: 3, seasons: ['summer', 'spring'] },
      { heads: p.set('head-cornflower'), stems: ['stem-2', 'stem-7'], h: [90, 140], head: 42, weight: 2, seasons: ['summer'] },
      { heads: p.set('blades'), h: [0, 0], head: 62, weight: 1.6, seasons: ['spring', 'summer'] },
      { heads: p.set('snowdrop'), h: [0, 0], head: 70, weight: 3, seasons: ['spring', 'winter'] },
      { heads: p.set('crocus'), h: [0, 0], head: 62, weight: 3, seasons: ['spring'] },
      { heads: ['mushroom'], h: [0, 0], head: 62, weight: 1, seasons: ['autumn'], lean: 0.05 },
      { heads: ['drygrass'], h: [0, 0], head: 105, weight: 2, seasons: ['autumn'] },
      { heads: ['snowgrass'], h: [0, 0], head: 80, weight: 1.2, seasons: ['winter'], lean: 0.04 },
      { heads: ['berrytwig'], h: [0, 0], head: 82, weight: 1, seasons: ['winter'], lean: 0.05 },
    ];

    return {
      /** after each opening of the paintings (first visit, and every return after they were freed) */
      setup(p) {
        place = p;
        for (const view of ['oak', 'pond']) {
          p.show(view);
          const v = (V[view] = { apples: [] });
          v.field = p.field({ region: 'meadow', minY: 648, max: 150, wild: 30, kinds: kinds(p),   // max 150: about 116 fps while two fingers stroke (300: 96)
            onBloom: (it) => { const h = v.field.headOf(it); fx.burst(h.x, h.y, { n: 2, power: 0.3 }); bloomNote(h.x); } });
          p.shed({ region: 'crown', ground: 'meadow', pieces: p.set('leaf'), size: [26, 46], seasons: ['autumn'], per: 9, onLoose: leafSound });
          p.shed({ region: 'crown', ground: 'meadow', pieces: p.set('petal'), size: [9, 15], seasons: ['spring'], per: 12, fall: [50, 90], spin: 2, onLoose: leafSound });
          v.snail = p.add('snail', { x: 900, y: 962, seasons: ['spring', 'summer', 'autumn'], pose: 'out' })
            .walk(view === 'oak' ? [[880, 964], [1320, 955]] : [[700, 968], [1060, 960]], { speed: 5, creep: true, rest: [3, 7], poses: ['out'] });
          v.field.seed(36, R, true);
        }
        p.show('oak');
        V.oak.rabbit = p.add('rabbit', { x: 1180, y: 800, depth: true, pose: 'rest' }).breathe(0.02)
          .life({ home: [1180, 800], roam: 150, idle: ['rest', 'graze'], alert: 'alert', hop: ['crouch', 'leap', 'land'],
            away: (s) => [s.x < 1000 ? 1650 : 620, 730], ground: (x, y) => p.inRegion('meadow', x, y) && y > 700 });
        p.add('hedgehog', { x: 520, y: 905, seasons: ['spring', 'summer', 'autumn'], depth: true })
          .walk([[520, 902], [1000, 884], [1480, 910]], { speed: 34, step: 12, rest: [2, 5] });
        p.show('pond');
        for (let i = 0, n = 0; i < 400 && n < 6; i++) {                       // apples in the pond view's tree
          const x = 1580 + R() * 400, y = 130 + R() * 300;
          if (!p.inRegion('crown', x, y) || V.pond.apples.some((s) => Math.hypot(s.x - x, s.y - y) < 60)) continue;
          const s = p.add(`apple-${1 + (n++ % 6)}`, { x, y, seasons: ['autumn'], scale: 0.8, z: 600 });
          s.data = { home: [x, y], state: 'hang', t: 0, vy: 0, gy: 0 }; V.pond.apples.push(s);
        }
      },

      /** strokes: the engine already fed the painting, the field and the sheds; this is only the place's own answer */
      stroke(s, p) {
        touchT = engine.now();
        if (!p || s.phase === 'end') return;
        const v = V[engine.view], rb = v && v.rabbit;
        if (rb && Math.hypot(rb.x - s.x, rb.y - 40 - s.y) < 90) rb.startle();
        if (s.over === 'water' && Math.random() < 0.15) { fx.ripple(s.x, s.y, { r: 60 }); note(2 + ((s.x / 200) | 0) % 5, { instrument: 'glass', vol: 0.08 }); return true; }
        if (s.over === 'crown' && engine.env.season === 'winter' && Math.random() < 0.2) fx.burst(s.x, s.y, { n: 3, power: 0.25, rgb: '255,255,255' });
      },

      tap(pt, p) {
        if (!p) return;
        const v = V[engine.view], s = pt.thing;                              // pt.thing: the painted thing under the finger
        if (s) {
          if (s === v.rabbit) { s.startle(); sfx(engine.again('rabbit', 20) > 1 ? 'sniff' : 'startle'); }
          else if (s === v.snail) { s.setPose('in'); s._mover.rest = 5; s._mover.poses = [1]; s.data = { out: 5 }; s.poke(0.6); sfx('tok'); }
          else if (s.data && s.data.state === 'hang') { s.data.state = 'fall'; s.data.vy = 0; s.data.gy = (p.below('meadow', s.x, s.y + 60) ?? 800) + 60 + R() * 60; sfx('rustle'); }
          else s.poke();
          fx.burst(pt.x, pt.y, { n: 6, power: 0.5 });
          return true;
        }
        if (pt.over === 'meadow') { const sc = p.scaleAt(pt.y); for (let i = 0; i < 3; i++) v.field.bloomAt(pt.x + (i ? (R() - 0.5) * 60 * sc : 0), pt.y + (i ? (R() - 0.3) * 30 * sc : 0), { crowd: 4 }); fx.bloom(pt.x, pt.y, { r: 70 * sc + 30 }); return true; }
        if (pt.over === 'water') { fx.ripple(pt.x, pt.y, { r: 90, n: 3 }); sfx('drip'); return true; }
        if (pt.over === 'crown') { for (const sh of p.grown) if (sh.loose && sh.view === engine.view && (!sh.seasons || sh.seasons.includes(engine.env.season))) for (let i = 0; i < 4; i++) sh.loose(pt.x + (R() - 0.5) * 60, pt.y + (R() - 0.5) * 40, (R() - 0.5) * 60, -10); sfx('rustle'); return true; }
      },

      update(dt, env) {
        const v = place && V[engine.view]; if (!v) return;
        if (v.snail.data && (v.snail.data.out -= dt) < 0) { v.snail.data = null; v.snail._mover.poses = [0]; v.snail.setPose('out'); v.snail.poke(0.4); }
        for (const s of v.apples) {                                          // renewal: falls, lies, fades, grows back
          const d = s.data; d.t += dt;
          if (d.state === 'fall') { d.vy += 900 * dt; s.y += d.vy * dt; if (s.y >= d.gy) { s.y = d.gy; if (d.vy > 120) d.vy = -d.vy * 0.32; else { d.state = 'lie'; d.t = 0; s.z = 0; } } }
          else if (d.state === 'lie' && d.t > 9) { s.alpha = Math.max(0, 1 - (d.t - 9) / 2); if (s.alpha <= 0) { d.state = 'grow'; d.t = 0; [s.x, s.y] = d.home; s.z = 600; s.scale = 0.1; s.alpha = 1; } }
          else if (d.state === 'grow') { s.scale = Math.min(0.8, 0.1 + d.t * 0.12); if (s.scale >= 0.8) d.state = 'hang'; }
        }
      },

      /** drawn over the painting and its things, before art's sparks: fireflies at night */
      draw(g, env, view, p) {
        const night = engine.art.nightness(env); if (night < 0.45 || env.season === 'winter') return;
        const t = engine.now(), a = clamp((night - 0.45) / 0.4, 0, 1);
        for (let i = 0; i < 20; i++) {
          const x = view.x + ((i * 397 + Math.sin(t * 0.3 + i) * 90) % view.w), y = 640 + ((i * 131) % 320) + Math.sin(t * 0.4 + i * 2) * 40;
          const blink = Math.pow(0.5 + 0.5 * Math.sin(t * (1.1 + (i % 5) * 0.2) + i * 3), 3) * a, sc = p.scaleAt(y + 60);
          if (blink > 0.03) engine.art.light(g, x, y, 46 * sc + 12, [0.9, 1, 0.5], 1.1 * blink, { core: 3.4 * sc + 1.2 });
        }
      },

      /** the paintings were freed (the child left a while ago): drop references to them */
      closed() { place = null; },
    };
  },
};
