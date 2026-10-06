// The meadow's small things that are not creatures: what a stroke, a tap or a hold does to the meadow, the crowns,
// the water and the sky in each season, time and weather, and the code-lit wonders (stars a finger leaves in the
// night sky, fireflies that follow the hand, a glow where a night flower opens), dandelion clocks that give their
// seeds to the wind and grow again where the seeds land, apples that drop and grow back, cobwebs that hold the dew on
// foggy mornings, a rainbow after the rain. Nothing here is counted or kept; everything renews.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createThings(engine, V) {
  const art = engine.art, fx = art.fx, A = engine.audio || {};
  const R = () => engine.random();
  const note = (step, o) => { if (A.note) A.note(step, o || {}); };
  const sfx = (name, o) => { if (A.sfx && A.sfx.play) A.sfx.play(name, o || {}); };
  const env = engine.env;
  const nightK = () => art.nightness(env);
  let P = null;

  const stars = [];             // {x, y, t0, life, r}  a finger's trail in the night sky
  const glows = [];             // {x, y, t0}           a night flower opening
  const flies = [];             // fireflies: {x, y, vx, vy, ph, k, view}
  const fingers = new Map();    // per finger: {d (distance since last answer), x, y, t}
  let lastSound = 0, rainbowK = 0, rainbowWant = 0, wasWet = 0, ice = 0, rained = 0;
  const ring = { x: 930, y: 905, k: 0, on: false, exit: { in: 'oak', x: 930, y: 895, r: 70, inst: 'glow' } };
  const has = (n) => !!(P && P.man.sprites[n]);

  // ---------------------------------------------------------------------------------------------- setup
  function setup(p) {
    P = p;
    // fireflies live in both views; they only show on warm nights
    flies.length = 0;
    for (let i = 0; i < 34; i++) flies.push({ x: 200 + R() * 1600, y: 650 + R() * 320, vx: 0, vy: 0, ph: R() * TAU, k: 0, view: i % 2 ? 'oak' : 'pond', follow: 0 });
    // dandelion clocks: they stand in the summer meadow, give their seeds to a finger or the wind, and grow again
    for (const view of ['oak', 'pond']) {
      p.show(view); const v = V[view];
      v.seeds = has('seed-1') ? p.shed({ region: 'meadow', ground: 'meadow', pieces: p.set('seed'), size: [16, 24], fall: [10, 22], lie: [6, 14], spin: 0.4, seasons: ['spring', 'summer'], per: 1e9,
        onLand: (it) => { if (engine.view === view && R() < 0.22) engine.after(4 + R() * 6, () => { if (v.field && P) v.field.bloomAt(it.x, it.y + 4, { kind: v.field.kinds.find((k) => k.heads[0] === 'dandelion-flower'), crowd: 3 }); }); } }) : null;
      v.clocks = [];
      if (has('clock')) {
        const spots = view === 'oak' ? [[760, 880], [1010, 940], [560, 975], [1290, 860], [880, 760]] : [[700, 900], [980, 960], [1220, 870], [560, 980]];
        for (const [x, y] of spots) {
          const s = p.add('clock', { x, y, depth: true, seasons: ['spring', 'summer'], pose: 'clock' }).sway(0.06);
          s.data = { kind: 'clock', seeds: 1, t: 0 };
          v.clocks.push(s);
        }
      }
      // cobwebs between stalks: only seen when fog hangs dew on them (dawn and day, not in winter)
      v.webs = [];
      if (has('cobweb')) for (const [x, y, sc] of (view === 'oak' ? [[355, 640, 0.9], [1250, 735, 0.6]] : [[1260, 700, 0.75], [1985, 800, 0.9]])) {
        const s = p.add('cobweb', { x, y, scale: sc, seasons: ['spring', 'summer', 'autumn'], alpha: 0 }); s.data = { kind: 'web' }; s.sway(0.02, 0.6); v.webs.push(s);
      }
      // the fairy ring: autumn nights after rain a ring of mushrooms comes up in the oak view; its middle leads down
      if (view === 'oak' && has('mushroom')) {
        v.ring = []; ring.x = 930; ring.y = 905;
        for (let i = 0; i < 11; i++) { const a = (i / 11) * TAU + 0.2; const s = p.add('mushroom', { x: ring.x + Math.cos(a) * 150, y: ring.y + Math.sin(a) * 42, depth: true, seasons: ['autumn'], scale: 0.95 + 0.25 * Math.sin(i * 2.1), alpha: 0 }); s.data = { kind: 'ring' }; v.ring.push(s); }
      }
      v.rainbow = has('rainbow') ? p.add('rainbow', { x: view === 'oak' ? 1250 : 1150, y: 640, z: -2000, touchable: false, alpha: 0 }) : null;
    }
    // apples in the pond view's young tree (autumn): tap one and it drops; a new one grows on the branch
    p.show('pond');
    const v = V.pond; v.apples = [];
    for (let i = 0, n = 0; i < 600 && n < 7; i++) {
      const x = 1580 + R() * 400, y = 130 + R() * 300;
      if (!p.inRegion('crown', x, y) || v.apples.some((s) => Math.hypot(s.x - x, s.y - y) < 60)) continue;
      const s = p.add(`apple-${1 + (n++ % 6)}`, { x, y, seasons: ['autumn'], scale: 0.8, z: 600 });
      s.data = { kind: 'apple', home: [x, y], state: 'hang', t: 0, vy: 0, gy: 0 }; v.apples.push(s);
    }
  }
  function closed() { P = null; if (ring.on) { engine.exits.remove(ring.exit); ring.on = false; } }

  // ---------------------------------------------------------------------------------------------- strokes
  function finger(s) {
    let f = fingers.get(s.id);
    if (!f || s.phase === 'begin') { f = { d: 0, x: s.x, y: s.y, sky: 0, water: 0, crown: 0 }; fingers.set(s.id, f); }
    return f;
  }
  function strokeMeadow(x, y, s) {
    const v = V[engine.view], f = finger(s), d = Math.hypot(x - f.x, y - f.y); f.d += d; f.x = x; f.y = y;
    // dandelion clocks let their seeds go where the hand passes
    if (v.clocks) for (const c of v.clocks) if (c.data.seeds > 0.05 && c.vis > 0.5 && Math.hypot(c.x - x, c.y - 70 * c.size.s - y) < 90 * c.size.s + 20) blow(c, Math.min(0.5, 0.1 + s.speed / 3000), s.dx * 160, -40);
    // winter: the finger brushes the snow and it glitters; a robin may come to look
    if (env.season === 'winter' && f.d > 40) { f.d = 0; fx.burst(x, y, { n: 2, power: 0.2, rgb: '255,255,255' }); }
    // at night the hand wakes fireflies in the grass
    if (nightK() > 0.5 && f.d > 60) { f.d = 0; wakeFly(x, y); }
  }
  function strokeCrown(x, y, s) {
    const f = finger(s), d = Math.hypot(x - f.x, y - f.y); f.crown += d; f.x = x; f.y = y;
    if (f.crown < 34) return; f.crown = 0;
    const se = env.season, t = engine.now();
    if (se === 'winter') { fx.burst(x, y, { n: 3, power: 0.25, rgb: '255,255,255' }); if (t - lastSound > 0.18) { lastSound = t; note(7 + Math.floor(R() * 5), { instrument: 'glass', vol: 0.06, x }); } }
    else if (se === 'summer') { if (t - lastSound > 0.22) { lastSound = t; sfx('rustle', { vol: 0.25, count: 2 }); if (R() < 0.3) sfx('chirp', { size: 0.3, vol: 0.2 }); } }
    else if (t - lastSound > 0.3) { lastSound = t; sfx('rustle', { vol: 0.22, count: 2 }); }
  }
  function strokeWater(x, y, s) {
    const f = finger(s), d = Math.hypot(x - f.x, y - f.y); f.water += d; f.x = x; f.y = y;
    if (f.water < (ice > 0.5 ? 30 : 50)) return; f.water = 0;
    if (ice > 0.5) {                                                   // the frozen pond: the finger skates and the ice sings
      fx.burst(x, y, { n: 2, power: 0.15, rgb: '230,240,255' });
      note(Math.floor(((x - 1300) / 700) * 8) + 4, { instrument: 'glass', vol: 0.08, x });
    } else {
      fx.ripple(x, y, { r: 55 + Math.min(40, s.speed / 30), flat: 0.3 });
      note(Math.floor(((x - 1300) / 700) * 8) + 2, { instrument: 'water', vol: 0.1, x });
    }
  }
  function strokeSky(x, y, s) {
    const nk = nightK(); if (nk < 0.55 || (env.wet ?? 0) > 0.4) return false;
    const f = finger(s), d = Math.hypot(x - f.x, y - f.y); f.sky += d; f.x = x; f.y = y;
    if (f.sky < 46) return true; f.sky = 0;
    stars.push({ x: x + (R() - 0.5) * 20, y: y + (R() - 0.5) * 20, t0: engine.now(), life: 6 + R() * 6, r: 0.7 + R() * 0.7 });
    if (stars.length > 140) stars.shift();
    const t = engine.now(); if (t - lastSound > 0.1) { lastSound = t; note(9 + Math.floor((1 - y / 600) * 5) + Math.floor(R() * 2), { instrument: 'celesta', vol: 0.07, x }); }
    return true;
  }
  function strokeEnd(s) {
    const f = fingers.get(s.id); fingers.delete(s.id);
    // a long trail of stars that comes back near where it began closes into a ring: a shooting star answers
    if (f && stars.length > 8) {
      const mine = stars.filter((q) => engine.now() - q.t0 < 4); if (mine.length > 10) {
        const a = mine[0], b = mine[mine.length - 1];
        if (Math.hypot(a.x - b.x, a.y - b.y) < 120) shooting = { x: b.x, y: b.y, t: 0 };
      }
    }
  }
  let shooting = null;

  // ---------------------------------------------------------------------------------------------- taps
  function tapThing(s, pt) {
    const d = s.data; if (!d) return false;
    if (d.kind === 'apple' && d.state === 'hang') {
      d.state = 'fall'; d.vy = 0; d.gy = (P.below('meadow', s.x, s.y + 60) ?? 800) + 60 + R() * 60; sfx('rustle', { vol: 0.35, count: 3 });
      fx.burst(pt.x, pt.y, { n: 5, power: 0.4 }); return true;
    }
    if (d.kind === 'apple') { s.poke(0.8); note(4 + Math.floor(R() * 4), { instrument: 'marimba', vol: 0.12 }); return true; }
    if (d.kind === 'clock') {
      if (d.seeds > 0.05) { blow(s, 1, (R() - 0.3) * 120, -60); sfx('whoosh', { vol: 0.2 }); }
      else { s.poke(0.8); note(2, { instrument: 'kalimba', vol: 0.1 }); }
      return true;
    }
    if (d.kind === 'ring') { s.poke(0.8); note(5 + Math.floor(R() * 5), { instrument: 'glass', vol: 0.1 }); fx.burst(s.x, s.y - 20, { n: 5, power: 0.3, rgb: '190,255,200' }); return true; }
    if (d.kind === 'web') {
      if (s.alpha < 0.2) return false;
      s.poke(0.5); fx.burst(s.x, s.y - 60 * s.size.s, { n: 10, power: 0.35, rgb: '235,245,255' });
      if (A.chord) A.chord([4, 6, 8, 11], { instrument: 'glass', vol: 0.09, strum: 0.09 }); return true;
    }
    return false;
  }
  function tapNear(pt) {
    // a rainbow, when there is one, sings its colours up the scale wherever it is touched
    const v = V[engine.view];
    if (v && v.rainbow && rainbowK > 0.3 && pt.over === 'sky') {
      const dx = pt.x - v.rainbow.x, dy = pt.y - v.rainbow.y, r = Math.hypot(dx, dy / 0.9);
      if (r > 380 && r < 760) { if (A.phrase) A.phrase([[5, 0.5], [6, 0.5], [7, 0.5], [9, 0.5], [10, 1]], { instrument: 'celesta', vol: 0.1 }); fx.burst(pt.x, pt.y, { n: 12, power: 0.5 }); rainbowWant = Math.max(rainbowWant, 30); return true; }
    }
    // a shooting star's trail, a star: a twinkle
    for (const q of stars) if (Math.hypot(q.x - pt.x, q.y - pt.y) < 40) { q.t0 = engine.now(); q.r = 1.6; sfx('twinkle', { vol: 0.3 }); return true; }
    return false;
  }
  function tapWater(pt) {
    if (ice > 0.5) { fx.ripple(pt.x, pt.y, { r: 50, n: 1, rgb: '230,240,255' }); sfx('tok', { vol: 0.35, count: 1 }); note(8 + Math.floor(R() * 4), { instrument: 'glass', vol: 0.1 }); return true; }
    fx.ripple(pt.x, pt.y, { r: 90, n: 3 }); sfx('plop', { vol: 0.4 }); note(3 + Math.floor(R() * 5), { instrument: 'water', vol: 0.12 });
    return true;
  }
  function tapCrown(pt) {
    const v = V[engine.view], se = env.season;
    if (se === 'autumn' || se === 'spring') { const sh = se === 'autumn' ? v.leaves : v.petals; for (let i = 0; i < 5; i++) sh.loose(pt.x + (R() - 0.5) * 70, pt.y + (R() - 0.5) * 40, (R() - 0.5) * 60, -10); sfx('rustle', { vol: 0.35, count: 3 }); }
    else if (se === 'winter') { fx.burst(pt.x, pt.y, { n: 14, power: 0.45, rgb: '255,255,255' }); sfx('sparkle', { vol: 0.2 }); }
    else { fx.burst(pt.x, pt.y, { n: 6, power: 0.35, rgb: '190,230,150' }); sfx('rustle', { vol: 0.3, count: 3 }); if (R() < 0.6) sfx('warble', { vol: 0.18 }); }
    return true;
  }
  function tapSky(pt) {
    // the sky answers softly: a bloom of light and a high note where it was touched; at night a new star.
    // Weather comes only from the weather cloud (BRIEF 24, 31), never from a tap on the sky.
    if (nightK() > 0.6 && (env.wet ?? 0) < 0.2) { stars.push({ x: pt.x, y: pt.y, t0: engine.now(), life: 12, r: 1.8 }); sfx('twinkle', { vol: 0.35 }); return true; }
    fx.bloom(pt.x, pt.y, { r: 110, rgb: '240,244,255' }); fx.burst(pt.x, pt.y, { n: 5, power: 0.25, rgb: '235,240,250' });
    note(9 + Math.floor((pt.x / 2000) * 5), { instrument: env.season === 'winter' ? 'glass' : 'celesta', vol: 0.07, x: pt.x });
    return true;
  }
  function hold(pt) {
    if (pt.over === 'water' && ice < 0.5) { for (let i = 0; i < 3; i++) fx.ripple(pt.x, pt.y, { r: 60 + i * 50, n: 1 }); if (A.chord) A.chord([0, 4, 7], { instrument: 'water', vol: 0.12, strum: 0.15 }); return true; }
    if (pt.over === 'sky' && nightK() > 0.6) { for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; stars.push({ x: pt.x + Math.cos(a) * 60, y: pt.y + Math.sin(a) * 60, t0: engine.now() + i * 0.08, life: 8, r: 1 }); } if (A.chord) A.chord([7, 9, 11, 14], { instrument: 'celesta', vol: 0.1, strum: 0.08 }); return true; }
    return false;
  }

  // ---------------------------------------------------------------------------------------------- living bits
  function blow(c, part, vx, vy) {
    const d = c.data, v = V[engine.view]; const n = Math.round(8 * part * d.seeds) + 1; d.seeds = Math.max(0, d.seeds - part); d.t = 0;
    const h = c.size.h;
    if (v.seeds) for (let i = 0; i < n; i++) v.seeds.loose(c.x + (R() - 0.5) * 24 * c.size.s, c.y - h * 0.85 + (R() - 0.5) * 20 * c.size.s, vx + (R() - 0.5) * 80, vy - R() * 40);
    else fx.burst(c.x, c.y - h * 0.85, { n: 8, power: 0.4, rgb: '250,250,245' });
    if (d.seeds <= 0.05) c.setPose('bare');
    c.poke(0.4);
    note(7 + Math.floor(R() * 4), { instrument: 'celesta', vol: 0.06 });
  }
  function wakeFly(x, y) {
    if (env.season === 'winter') return;
    let best = null, bd = 1e9; for (const f of flies) { if (f.view !== engine.view) continue; const d = Math.hypot(f.x - x, f.y - y); if (d < bd) { bd = d; best = f; } }
    if (best) { best.follow = 3; best.tx = x; best.ty = y; }
    // and they follow the hand
    for (const f of flies) if (f.view === engine.view && Math.hypot(f.x - x, f.y - y) < 260) { f.follow = Math.max(f.follow, 2); f.tx = x; f.ty = y; }
  }
  function nightBloom(x, y) { if (nightK() > 0.55) { glows.push({ x, y, t0: engine.now() }); if (glows.length > 60) glows.shift(); } }

  function onEnv(next, prev) {
    // rain begins: the dandelion clocks close (their seeds are kept); a rainbow comes when it ends
    if (prev && (prev.weather === 'rain' || prev.weather === 'storm') && next.weather !== 'rain' && next.weather !== 'storm' && next.time !== 'night') rainbowWant = 26;
  }

  function update(dt, env, t, p) {
    const v = V[engine.view]; if (!v) return;
    const nk = nightK(), wet = env.wet ?? 0, windy = env.windy ?? 0;
    // a rainbow after the rain, when the sun is up (also when rain ebbs by itself)
    if (wasWet > 0.35 && wet < 0.2 && nk < 0.5 && env.season !== 'winter') rainbowWant = Math.max(rainbowWant, 24);
    wasWet = wet;
    rainbowWant = Math.max(0, rainbowWant - dt);
    rainbowK += ((rainbowWant > 0 && wet < 0.3 && nk < 0.5 ? 1 : 0) - rainbowK) * Math.min(1, dt * 0.35);
    for (const view of ['oak', 'pond']) { const rb = V[view] && V[view].rainbow; if (rb) rb.alpha = rainbowK * 0.75; }
    // the fairy ring: after rain in autumn, when it is dark
    if (env.season === 'autumn' && wet > 0.3) rained = 300; else rained = Math.max(0, rained - dt);
    const ringWant = env.season === 'autumn' && nk > 0.45 && rained > 0 ? 1 : 0;
    ring.k += (ringWant - ring.k) * Math.min(1, dt * 0.5);
    if (V.oak && V.oak.ring) V.oak.ring.forEach((s, i) => { s.alpha = clamp(ring.k * 11 - i, 0, 1); });
    const ringOn = ring.k > 0.8;
    if (ringOn !== ring.on) { if (ringOn) engine.exits.add(ring.exit); else engine.exits.remove(ring.exit); ring.on = ringOn; }
    // ice on the pond in winter
    ice = env.season === 'winter' ? 1 : 0;
    // dew on cobwebs: fog, or dawn, shows them
    const webK = clamp(Math.max(env.foggy ?? 0, env.time === 'dawn' ? 0.7 : 0, wet * 0.4) * (env.season === 'winter' ? 0 : 1), 0, 1);
    for (const s of v.webs || []) s.alpha += (webK - s.alpha) * Math.min(1, dt * 0.8);
    // dandelion clocks grow their seeds again (bare stem -> clock); the wind takes a few
    for (const c of v.clocks || []) {
      const d = c.data; d.t += dt;
      if (d.seeds < 1 && d.t > 25 && wet < 0.3) { d.seeds = Math.min(1, d.seeds + dt / 14); if (d.seeds > 0.3 && c.pose !== 0) { c.setPose('clock'); c.poke(0.3); } }
      if (windy > 0.35 && d.seeds > 0.2 && R() < dt * windy * 0.8) blow(c, 0.12, 120 + windy * 200, -30);
    }
    // apples: fall, bounce, lie, fade; a new one grows on the branch
    for (const s of v.apples || []) {
      const d = s.data; d.t += dt;
      if (d.state === 'fall') { d.vy += 900 * dt; s.y += d.vy * dt; if (s.y >= d.gy) { s.y = d.gy; if (d.vy > 120) { d.vy = -d.vy * 0.32; sfx('tok', { vol: 0.25, count: 1 }); note(1 + Math.floor(R() * 3), { instrument: 'marimba', vol: 0.12 }); } else { d.state = 'lie'; d.t = 0; s.z = 0; } } }
      else if (d.state === 'lie' && d.t > (env.season === 'autumn' && nk > 0.3 ? 40 : 14)) { s.alpha = Math.max(0, 1 - (d.t - 14) / 2); if (s.alpha <= 0) { d.state = 'grow'; d.t = 0; [s.x, s.y] = d.home; s.z = 600; s.scale = 0.1; s.alpha = 1; } }
      else if (d.state === 'grow') { s.scale = Math.min(0.8, 0.1 + d.t * 0.06); if (s.scale >= 0.8) d.state = 'hang'; }
      else if (d.state === 'hang' && (env.stormy ?? 0) > 0.6 && R() < dt * 0.04) { d.state = 'fall'; d.vy = 0; d.gy = (p.below('meadow', s.x, s.y + 60) ?? 800) + 60 + R() * 60; }   // a storm shakes one down now and then
    }
    // leaves and petals let go by themselves, more in the wind
    if (env.season === 'autumn' && R() < dt * (0.4 + 3 * windy)) v.leaves.scatter(1);
    if (env.season === 'spring' && R() < dt * 0.3 * (1 + 4 * windy)) v.petals.scatter(1);
    // fireflies
    const fk = clamp((nk - 0.45) / 0.4, 0, 1) * (env.season === 'summer' ? 1 : env.season === 'spring' || env.season === 'autumn' ? 0.35 : 0) * (1 - clamp(wet * 2, 0, 1));
    for (const f of flies) {
      if (f.view !== engine.view) continue;
      f.k += ((fk > 0 && (f.follow > 0 || R() < 0.9) ? fk : 0) - f.k) * Math.min(1, dt * 0.6);
      f.ph += dt;
      let ax = Math.sin(f.ph * 0.7 + f.x * 0.01) * 14, ay = Math.cos(f.ph * 0.9) * 10;
      if (f.follow > 0) { f.follow -= dt; const dx = f.tx - f.x, dy = f.ty - 30 - f.y, d = Math.hypot(dx, dy) || 1; ax += (dx / d) * 90 + Math.cos(f.ph * 3) * 40; ay += (dy / d) * 90 + Math.sin(f.ph * 3) * 40; }
      else ay += (800 - f.y) * 0.08;
      f.vx += (ax - f.vx) * Math.min(1, dt * 1.5); f.vy += (ay - f.vy) * Math.min(1, dt * 1.5);
      f.x = clamp(f.x + f.vx * dt, 20, 1980); f.y = clamp(f.y + f.vy * dt, 380, 990);
    }
    if (shooting) { shooting.t += dt; if (shooting.t > 2.2) shooting = null; else if (shooting.t < dt * 1.5) { sfx('wonder', { vol: 0.3 }); } }
  }

  function draw(g, envv, view, p) {
    const t = engine.now(), nk = nightK();
    // stars a finger left in the night sky
    for (let i = stars.length - 1; i >= 0; i--) {
      const q = stars[i], age = t - q.t0; if (age < 0) continue; if (age > q.life || nk < 0.3) { stars.splice(i, 1); continue; }
      const k = Math.min(1, age * 3) * Math.min(1, (q.life - age) / 2) * (0.65 + 0.35 * Math.sin(t * 3 + q.x));
      art.light(g, q.x, q.y, 44 * q.r, [0.95, 0.95, 1], 1.1 * k * nk, { core: 3.6 * q.r });
    }
    // each mushroom of the ring glows faintly from below its cap, so the ring reads as a ring in the dark
    if (engine.view === 'oak' && ring.k > 0.3 && V.oak && V.oak.ring) V.oak.ring.forEach((m, i) => art.light(g, m.x, m.y - 24 * m.size.s, 46, [0.55, 1, 0.65], 0.45 * m.alpha * (0.75 + 0.25 * Math.sin(t * 1.3 + i)), { core: 3 }));
    if (engine.view === 'oak' && ring.k > 0.3) for (let i = 0; i < 5; i++) { const a = t * 0.4 + (i / 5) * TAU; art.light(g, ring.x + Math.cos(a) * 110, ring.y - 30 + Math.sin(a) * 30 - 20 * Math.sin(t + i), 26, [0.6, 1, 0.7], 0.5 * ring.k * (0.6 + 0.4 * Math.sin(t * 2 + i)), { core: 2 }); }
    if (shooting) { const k = shooting.t / 2.2, x = shooting.x - 900 * k, y = shooting.y - 300 * k + 500 * k * k; for (let i = 0; i < 8; i++) art.light(g, x + i * 22, y - i * 6, 40 - i * 4, [1, 0.95, 0.8], (1 - k) * (1 - i / 8), { core: 3 }); }
    // a night flower's glow as it opens
    for (let i = glows.length - 1; i >= 0; i--) { const q = glows[i], a = t - q.t0; if (a > 3.5) { glows.splice(i, 1); continue; } const k = Math.sin(Math.min(1, a / 3.5) * Math.PI); art.light(g, q.x, q.y, 40 * p.scaleAt(q.y + 60) + 14, [1, 0.94, 0.7], 0.7 * k * nk, { core: 2 }); }
    // fireflies
    for (const f of flies) {
      if (f.view !== engine.view || f.k < 0.02) continue;
      const blink = Math.pow(0.5 + 0.5 * Math.sin(t * (1.3 + (f.ph % 1)) + f.x * 0.05), 3) * f.k * (f.follow > 0 ? 1.4 : 1), sc = p.scaleAt(f.y + 60);
      if (blink > 0.03) art.light(g, f.x, f.y, 46 * sc + 12, [0.9, 1, 0.5], 1.1 * blink, { core: 3.4 * sc + 1.2 });
    }
  }

  return { setup, closed, strokeMeadow, strokeCrown, strokeWater, strokeSky, strokeEnd, tapThing, tapNear, tapWater, tapCrown, tapSky, hold, nightBloom, onEnv, update, draw, get ice() { return ice; } };
}
