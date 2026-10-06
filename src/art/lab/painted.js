// The painted proof: the meadow as two still views cut from one painting per season and night, with a living
// foreground made of painted pieces. It is also the worked example for place workers (docs/STYLE.md):
//   stroke the meadow          -> flowers of the season come up along the finger's way
//   brush the oak's crown      -> autumn leaves let go, fall and settle (spring: petals from the small tree; winter: snow dust)
//   touch the water            -> rings
//   any stroke                 -> the painting itself stirs under the finger (grass, boughs, water), and comes to rest
//   touch the rabbit           -> it looks up, hops away, waits, comes back; by itself it grazes and moves about
//   touch the snail            -> it draws in, and comes out again later
//   touch an apple (autumn)    -> it drops, lies, and a new one grows
// Everything here is plain data in and out: stroke points { x, y, id } in world units, regions by name.
import { rng, hash2, clamp, lerp, smoothstep, TAU } from '../rng.js';

export function paintedPlate(art, env, world, seed, lab) {
  const R = rng(seed), q = lab.q, fx = art.fx;
  let place = null, ready = false;
  const placeName = q.get('place') || 'meadow';   // ?place=falls&view=glade: another place's views, bare (its own page has the life)
  const V = {};                                  // per view: { field, sheds: [...], rabbit, apples ... }
  const strokes = new Map();                     // finger id -> { x, y, water }

  const scene = {
    chips: true, warm: 150, views: placeName === 'meadow' ? ['oak', 'pond'] : [], view: q.get('view') || (placeName === 'meadow' ? 'oak' : ''),
    settled: () => ready && place.settled,
    frame: (aspect) => (place ? place.frame(aspect) : { x: 0, y: 0, w: 1000 * aspect, h: 1000 }),
    show(v) { scene.view = v; place.show(v); },
    motions: ['auto', 'wind', 'clip', 'off'], motion: q.get('motion') || 'auto',
    setMotion(m) { scene.motion = m; if (place) { place.motion = m; place.flat = m === 'flat'; } },   // ?motion=flat: the old path (paintings in the scene canvas), to compare
    count: () => (place ? { live: place.live, water: art.compositor.stats.water, flowers: cur() ? cur().field.stats.n : 0, loose: cur() ? cur().sheds.reduce((n, s) => n + s.stats.n, 0) : 0, fx: fx.count } : null),
  };
  const cur = () => V[scene.view];

  function kinds(p) {
    const stems = (a, b) => [`stem-${a}`, `stem-${b}`];
    return [
      { heads: p.set('head-poppy'), stems: stems(1, 6), h: [95, 150], head: 50, weight: 3, seasons: ['summer'] },
      { heads: p.set('head-daisy'), stems: stems(3, 8), h: [80, 130], head: 42, weight: 3, seasons: ['summer', 'spring'] },
      { heads: p.set('head-cornflower'), stems: stems(2, 7), h: [90, 140], head: 42, weight: 2, seasons: ['summer'] },
      { heads: p.set('head-buttercup'), stems: stems(4, 9), h: [70, 120], head: 32, weight: 2, seasons: ['summer', 'spring'] },
      { heads: p.set('head-clover'), stems: stems(5, 10), h: [50, 85], head: 34, weight: 1.5, seasons: ['summer'] },
      { heads: ['bud-1', 'bud-2'], stems: stems(1, 6), h: [80, 120], head: 46, weight: 0.8, seasons: ['summer'] },
      { heads: p.set('blades'), h: [0, 0], head: 62, weight: 1.6, seasons: ['spring', 'summer'] },
      { heads: p.set('snowdrop'), h: [0, 0], head: 70, weight: 3, seasons: ['spring', 'winter'] },
      { heads: p.set('crocus'), h: [0, 0], head: 62, weight: 3, seasons: ['spring'] },
      { heads: p.set('primrose-head'), stems: stems(3, 8), h: [30, 52], head: 30, weight: 2, seasons: ['spring'] },
      { heads: ['mushroom'], h: [0, 0], head: 62, weight: 1, seasons: ['autumn'], lean: 0.05 },
      { heads: ['drygrass'], h: [0, 0], head: 105, weight: 2, seasons: ['autumn'] },
      { heads: ['teasel-dry'], h: [0, 0], head: 150, weight: 0.7, seasons: ['autumn'], lean: 0.06 },
      { heads: ['rosehip'], h: [0, 0], head: 100, weight: 0.6, seasons: ['autumn'] },
      { heads: ['snowgrass'], h: [0, 0], head: 80, weight: 1.2, seasons: ['winter'], lean: 0.04 },
      { heads: ['berrytwig'], h: [0, 0], head: 82, weight: 1, seasons: ['winter'], lean: 0.05 },
      { heads: ['teasel-snow'], h: [0, 0], head: 150, weight: 0.5, seasons: ['winter'], lean: 0.05 },
    ];
  }

  function setup(p) {
    p.seasonAt = () => env.season;
    for (const view of scene.views) {
      p.show(view);
      const v = (V[view] = { sheds: [], bees: [], flies: [], apples: [] });
      v.field = p.field({ region: 'meadow', minY: 648, wild: 14, kinds: kinds(p), onBloom: (it) => { const h = v.field.headOf(it); fx.burst(h.x, h.y, { n: 2, power: 0.3 }); } });
      v.leaves = p.shed({ region: 'crown', ground: 'meadow', pieces: p.set('leaf'), size: [26, 46], seasons: ['autumn'], per: 9 });
      v.petals = p.shed({ region: 'crown', ground: 'meadow', pieces: p.set('petal'), size: [9, 15], seasons: ['spring'], per: 12, fall: [50, 90], spin: 2 });
      v.sheds = [v.leaves, v.petals];
      // two butterflies that visit what the child has grown
      for (let i = 0; i < 2; i++) v.flies.push(p.add('butterfly', { x: 600 + i * 500, y: 700, seasons: ['spring', 'summer'], times: ['dawn', 'day', 'dusk'], touchable: false, z: 500 })
        .fly((s) => { const it = v.field.any(Math.random); const h = it ? v.field.headOf(it) : { x: 300 + Math.random() * 1400, y: 600 + Math.random() * 200 }; s.scale = it ? clamp(it.sc * 1.2, 0.4, 1) : 0.7; return { x: h.x, y: h.y - 6, stay: 1 + Math.random() * 2.5 }; }, { speed: 90, flutter: 7, wobble: 16 }));
      v.snail = p.add('snail', { x: 900, y: 962, seasons: ['spring', 'summer', 'autumn'], pose: 'out' }).walk(view === 'oak' ? [[880, 964], [1320, 955]] : [[500, 968], [860, 960]], { speed: 5, creep: true, rest: [3, 7], poses: ['out'] });
    }
    // ---- the oak view: hedgehog on its round, the rabbit, the robin in winter
    p.show('oak');
    const o = V.oak;
    p.add('hedgehog', { x: 520, y: 905, seasons: ['spring', 'summer', 'autumn'], depth: true }).walk([[520, 902], [1000, 884], [1480, 910]], { speed: 34, step: 12, rest: [2, 5] });
    window.__place = p; window.__rabbit = o.rabbit = p.add('rabbit', { x: 1180, y: 800, depth: true, pose: 'rest' }).breathe(0.02)
      .life({ home: [1180, 800], roam: 150, idle: ['rest', 'graze'], alert: 'alert', hop: ['crouch', 'leap', 'land'], away: (s) => [s.x < 1000 ? 1650 : 620, 730], ground: (x, y) => p.inRegion('meadow', x, y) && y > 700 });
    o.robin = p.add('robin', { x: 470, y: 742, seasons: ['winter'], depth: true, scale: 1.4 }).breathe(0.03, 1.6);
    // ---- the pond view: bees between the flowers and the hive, apples in autumn
    p.show('pond');
    const d = V.pond, hive = { x: 1782, y: 606 };
    for (let i = 0; i < 5; i++) d.bees.push(p.add('bee', { x: hive.x, y: hive.y, seasons: ['spring', 'summer'], times: ['dawn', 'day', 'dusk'], touchable: false, z: 500, scale: 0.5 })
      .fly((s) => { s.data = !s.data; const it = s.data ? d.field.any(Math.random, (f) => f.x > 900 && f.kind.stems) : null; if (!it) return { x: hive.x + (Math.random() - 0.5) * 20, y: hive.y + (Math.random() - 0.5) * 10, stay: 0.6 + Math.random() }; const h = d.field.headOf(it); return { x: h.x, y: h.y - 4, stay: 1.2 + Math.random() * 2 }; }, { speed: 150, flutter: 16, wobble: 12 }));
    const spots = []; for (let i = 0; i < 400 && spots.length < 6; i++) { const x = 1580 + R() * 400, y = 130 + R() * 300; if (p.inRegion('crown', x, y) && spots.every((s) => Math.hypot(s[0] - x, s[1] - y) > 60)) spots.push([x, y]); }
    spots.forEach(([x, y], i) => { const s = p.add(`apple-${1 + (i % 6)}`, { x, y, seasons: ['autumn'], scale: 0.8, z: 600 }); s.data = { home: [x, y], state: 'hang', t: 0, vy: 0, gy: 0 }; d.apples.push(s); });
    p.show(scene.view);
    const stress = +(q.get('stress') || 0);                                          // ?stress=120: a meadow with that many grown things (max and keep are set to it), for timing
    for (const view of scene.views) { p.show(view); if (stress) { V[view].field.max = V[view].field.keep = stress; } V[view].field.seed(stress || 20, R, true, stress ? 99 : 1); }
    for (const k of ['max', 'keep', 'rest', 'thin']) if (q.get(k)) for (const view of scene.views) V[view].field[k] = +q.get(k);   // ?max= &keep= &rest= &thin=: the field's numbers, to try
    p.show(scene.view);
  }

  // ?storm=<0..1> forces how far the view's storm map is blended in; ?stormmap=still|inverted makes a test storm map
  // from the view's own flow atlas (still: no motion at all; inverted: the motion reversed and twice as far), for
  // checking the blend on a view that has no storm map yet
  function testStormMap(p, kind) {
    const mo = p._mo(), F = mo.flow; if (!F || !F.img) { setTimeout(() => testStormMap(p, kind), 200); return; }
    const c = document.createElement('canvas'); c.width = F.img.width; c.height = F.img.height; const g = c.getContext('2d'); g.drawImage(F.img, 0, 0);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) { if (kind === 'still') { d[i] = 128; d[i + 1] = 128; } else { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; } }
    g.putImageData(im, 0, 0); createImageBitmap(c).then((b) => { mo.storm = { ...F, img: b, range: kind === 'still' ? F.range : F.range.map((x) => x * 2) }; });
  }
  // ?bare=1 shows the painting alone (to judge its motion); ?wind=<level> overrides the weather's motion level
  scene.ready = art.painted.open(placeName, { view: scene.view || undefined, pixelHeight: lab.H }).then((p) => { place = p; window.__place = p; if (q.get('tooth')) p.tooth = +q.get('tooth'); place = p; scene.setMotion(scene.motion); if (q.get('wind')) p.wind = +q.get('wind'); if (q.get('storm')) p.stormMix = +q.get('storm'); if (q.get('stormmap')) testStormMap(p, q.get('stormmap')); if (q.get('water') === '0') p.water = false;
    if (placeName === 'meadow') setup(p); else { scene.views = Object.keys(p.man.views); if (!scene.view) { scene.view = scene.views[0]; p.show(scene.view); } } if (q.get('bare')) { p.sprites.length = 0; p.grown.length = 0; } ready = true; });

  // ---- the child's hand
  scene.pointer = (kind, x, y, id) => {
    if (!ready) return; const v = cur(), p = { x, y, id };
    if (kind === 'down') { strokes.set(id, { x, y, d: 0 }); fx.trail(x, y, id); place.gust(p); return; }
    if (!v) { if (kind === 'up') { fx.release(id); place.gustEnd(id); } else { fx.trail(x, y, id); place.gust(p); } return; }   // a bare place: only the painting answers
    if (kind === 'up') { strokes.delete(id); fx.release(id); place.gustEnd(id); v.field.end(id); for (const s of v.sheds) s.end(id); return; }
    const region = place.region(x, y);
    if (kind === 'move') {
      const st = strokes.get(id); if (!st) return; const dist = Math.hypot(x - st.x, y - st.y); st.d += dist; st.x = x; st.y = y;
      fx.trail(x, y, id); place.gust(p);                              // the painting stirs where the finger goes
      v.field.stroke(p); for (const s of v.sheds) s.stroke(p);        // each asks the regions itself: flowers only on the meadow, leaves only from the crown
      if (region === 'crown' && env.season === 'winter' && st.d > 26) { st.d = 0; fx.burst(x, y, { n: 3, power: 0.25, rgb: '255,255,255' }); }
      if (region === 'water' && st.d > 46) { st.d = 0; fx.ripple(x, y, { r: 60 }); }
      if (v.rabbit && Math.hypot(v.rabbit.x - x, v.rabbit.y - 40 - y) < 90) v.rabbit.startle();
      return;
    }
    if (kind === 'tap') {
      const s = place.hit(x, y);
      if (s) {
        fx.burst(x, y, { n: 6, power: 0.5 });
        if (s === v.rabbit) s.startle();
        else if (s === v.snail) { s.setPose('in'); s._mover.rest = 5; s._mover.poses = [1]; s.data = { out: 5 }; s.poke(0.6); }
        else if (s === V.oak.robin) s.hopTo(clamp(s.x + (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 80), 380, 900), s.y + (Math.random() - 0.5) * 20, { height: 26, time: 0.36 });
        else if (s.data && s.data.state === 'hang') { s.data.state = 'fall'; s.data.vy = 0; s.data.gy = (place.below('meadow', s.x, s.y + 60) ?? 800) + 60 + Math.random() * 60; }
        else s.poke();
        return;
      }
      if (region === 'meadow') { const sc = place.scaleAt(y); for (let i = 0; i < 3; i++) v.field.bloomAt(x + (i ? (Math.random() - 0.5) * 60 * sc : 0), y + (i ? (Math.random() - 0.3) * 30 * sc : 0), { crowd: 4 }); fx.bloom(x, y, { r: 70 * sc + 30 }); }
      else if (region === 'water') fx.ripple(x, y, { r: 90, n: 3 });
      else if (region === 'crown') { for (const sh of v.sheds) if (!sh.seasons || sh.seasons.includes(env.season)) for (let i = 0; i < 4; i++) sh.loose(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 60, -10); fx.burst(x, y, { n: 4, power: 0.4 }); }
      else { fx.bloom(x, y, { r: 110 }); fx.burst(x, y, { n: 8, power: 0.7 }); }
    }
  };

  // ---- a scripted hand for still pictures (?demo=1): a stroke over the meadow, one through the crown, a touch
  scene.demo = (t, dt) => {
    if (!ready) return; const k = t / 2.2;
    if (k <= 1) {
      const oak = scene.view === 'oak', x = oak ? lerp(380, 1560, k) : lerp(260, 1250, k), y = (oak ? 850 : 880) + Math.sin(k * 7) * 55 - 60 * k;
      scene.pointer(k === 0 || !strokes.has(91) ? 'down' : 'move', x, y, 91);
      const x2 = oak ? lerp(220, 1080, k) : lerp(1620, 1960, k), y2 = oak ? 150 + Math.sin(k * 9) * 70 : 240 + Math.sin(k * 9) * 90;
      scene.pointer(!strokes.has(92) ? 'down' : 'move', x2, y2, 92);
    } else if (strokes.has(91)) { scene.pointer('up', 0, 0, 91); scene.pointer('up', 0, 0, 92); if (!oak()) scene.pointer('tap', 1650, 760, 93); }
    if (V.oak.rabbit && t > 3.2 && t < 3.3) V.oak.rabbit.startle();
  };
  const oak = () => scene.view === 'oak';

  function fireflies(g, t, night, view) {
    const n = 26, a = clamp((night - 0.45) / 0.4, 0, 1); if (a <= 0 || env.season === 'winter') return;
    for (let i = 0; i < n; i++) {
      const h = hash2(i, 1, 55), h2 = hash2(i, 2, 55), h3 = hash2(i, 3, 55);
      const x = view.x + ((h * view.w * 1.2 + Math.sin(t * (0.21 + 0.2 * h3) + i) * 90 + t * 6 * (h2 - 0.5)) % view.w + view.w) % view.w, y = 620 + 340 * h2 + Math.sin(t * (0.33 + 0.3 * h) + i * 2) * 46;
      const blink = Math.pow(0.5 + 0.5 * Math.sin(t * (1.1 + h3) + h * 30), 3) * a, sc = place.scaleAt(y + 60); if (blink < 0.03) continue;
      art.light(g, x, y, 46 * sc + 12, [0.9, 1, 0.5], 1.1 * blink, { core: 3.4 * sc + 1.2 });
    }
  }

  scene.draw = (g, e, view, t) => {
    if (!ready) return;
    const v = cur(), dt = scene._t === undefined ? 0 : clamp(t - scene._t, 0, 0.05); scene._t = t;
    if (!v) { place.draw(g, e, view, t); fx.draw(g, e, view, t); return; }                     // a bare place
    // small lives that are the place's own business
    if (e.season === 'autumn' && Math.random() < dt * 0.5) v.leaves.scatter(1);
    if (e.season === 'spring' && Math.random() < dt * 0.35 * (1 + 4 * (e.windy ?? 0))) v.petals.scatter(1);
    for (const b of v.bees) { b.scale = lerp(0.42, 1, smoothstep(620, 840, b.y)); b.alpha = clamp(1 - 2.5 * Math.max(e.wet ?? 0, e.snowy ?? 0), 0, 1); }   // bees stay in when it rains
    if (v.snail && v.snail.data && (v.snail.data.out -= dt) < 0) { v.snail.data = null; v.snail._mover.poses = [0]; v.snail.setPose('out'); v.snail.poke(0.4); }
    for (const s of v.apples) {
      const d = s.data; d.t += dt;
      if (d.state === 'fall') { d.vy += 900 * dt; s.y += d.vy * dt; s.rot = 0; if (s.y >= d.gy) { s.y = d.gy; if (d.vy > 120) { d.vy = -d.vy * 0.32; fx.ripple(s.x, s.y + 6, { r: 26, flat: 0.3, n: 1 }); } else { d.state = 'lie'; d.t = 0; s.z = 0; } } }
      else if (d.state === 'lie' && d.t > 9) { s.alpha = Math.max(0, 1 - (d.t - 9) / 2); if (s.alpha <= 0) { d.state = 'grow'; d.t = 0; s.x = d.home[0]; s.y = d.home[1]; s.z = 600; s.scale = 0.1; s.alpha = 1; } }
      else if (d.state === 'grow') { s.scale = Math.min(0.8, 0.1 + d.t * 0.12); if (s.scale >= 0.8) d.state = 'hang'; }
    }
    place.draw(g, e, view, t);
    fireflies(g, t, art.nightness(e), view);
    fx.draw(g, e, view, t);
  };
  return scene;
}
