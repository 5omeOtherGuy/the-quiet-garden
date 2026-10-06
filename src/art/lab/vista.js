// Reference plate: a panoramic vista in any env state. Three baked layers: far, mid, near.
export function vista(art, env, world, seed = 7) {
  const { palette, sky, terrain, water, plants, buildings, creatures, brush, color, layers, rng } = art;
  const pal = palette(env), W = world.w, H = world.h, r = rng(seed);
  const night = env.time === 'night', low = env.time === 'dawn' || env.time === 'dusk';
  const snow = pal.snowK, wind = env.windy || 0, wet = env.wet || 0, wx = env.weather;
  const horizon = 540;
  layers.maxPixels = 4.6e6;
  const L = [];

  // ---------------------------------------------------------------- far: sky, lights, clouds, distant hills
  L.push(layers.bake({ x: 0, y: 0, w: W, h: horizon + 160 }, world.scale, (g) => {
    const rr = r.fork(1);
    sky.paint(g, 0, 0, W, horizon + 60, pal, { rng: rr, horizonGlow: low ? 1 : 0 });
    if (night) sky.stars(g, 0, 0, W, horizon * 0.85, { rng: rr, density: wx === 'clear' ? 18 : 6 });
    const sunPos = { dawn: [W * 0.2, 470], day: [W * 0.72, 140], dusk: [W * 0.78, 480] }[env.time];
    if (sunPos && wx !== 'storm' && wx !== 'rain' && wx !== 'fog') sky.sun(g, sunPos[0], sunPos[1], low ? 34 : 26, pal, { rng: rr });
    if (night && wx !== 'storm' && wx !== 'fog') sky.moon(g, W * 0.76, 165, 30, pal, { rng: rr, phase: 0.3 });
    // clouds
    const n = { clear: 3, wind: 3, rain: 6, storm: 7, fog: 2, snow: 5 }[wx] ?? 3;
    const cl = [];
    for (let i = 0; i < n; i++) cl.push({ x: W * (0.05 + 0.9 * rr()), y: 120 + 220 * Math.pow(rr(), 1.4) + (wx === 'rain' || wx === 'storm' ? 60 : 0), s: 220 + 300 * rr() });
    cl.sort((a, b) => a.y - b.y);
    if (wx !== 'fog') sky.cumulus(g, cl, pal, { rng: rr, shade: wx === 'rain' ? 1.5 : wx === 'storm' ? 2 : night ? 1.3 : 1, lit: low ? [0.5, -0.6] : [-0.4, -1] });
    if (wx === 'clear' || wx === 'wind') sky.wisps(g, [{ x: W * 0.3, y: 90, w: 300 }, { x: W * 0.62, y: 120, w: 260 }], pal, { rng: rr });
    // a loose skein of birds by day
    if (!night && (wx === 'clear' || wx === 'wind')) { g.save(); g.strokeStyle = color.css(pal.ink, 0.5); g.lineWidth = 1.2; g.lineCap = 'round'; for (let i = 0; i < 7; i++) { const bx = W * 0.4 + i * 22 + rr() * 10, by = 230 + i * 7 + rr() * 10, s = 4 + rr() * 3; g.beginPath(); g.moveTo(bx - s, by); g.quadraticCurveTo(bx - s * 0.4, by - s * 0.6, bx, by); g.quadraticCurveTo(bx + s * 0.4, by - s * 0.6, bx + s, by); g.stroke(); } g.restore(); }
    // distant ranges, paler and softer with distance
    terrain.hills(g, -20, W + 20, horizon + 140, { base: 505, amp: 32, freq: 0.0042, phase: 1.2, seed: 3 }, pal, { rng: rr, depth: 0.12, soft: 4, snow, texture: 0, ridge: 0.3, sky: pal.skyHorizon });
    terrain.hills(g, -20, W + 20, horizon + 160, { base: 548, amp: 36, freq: 0.0056, phase: 3.1, seed: 5 }, pal, { rng: rr, depth: 0.26, snow: snow * 0.9, texture: 0.4, ridge: 0.6, sky: pal.skyHorizon, story: { fields: 7, sheep: 0, hay: 0 } });
  }));

  // ---------------------------------------------------------------- mid: the farmed valley, cottage, path, fence
  const midP = { base: 648, amp: 48, freq: 0.0046, phase: 0.6, seed: 9 }, fm = terrain.profile(midP);
  L.push(layers.bake({ x: 0, y: 540, w: W, h: 300 }, world.scale, (g) => {
    const rr = r.fork(2);
    terrain.hills(g, -20, W + 20, 860, midP, pal, { rng: rr, depth: 0.55, snow, texture: 1, ridge: 0.8, story: { fields: 5, sheep: snow ? 0 : 5, hay: env.season === 'autumn' || env.season === 'summer' ? 3 : 0, gate: true } });
    // small trees on the slope
    const trees = [[0.08, 50], [0.3, 70], [0.36, 56], [0.52, 64], [0.9, 80], [0.96, 60]];
    for (const [t, s] of trees) plants.tree(g, W * t, fm(W * t) + 50, s, pal, { rng: rr, kind: rr() < 0.3 ? 'tall' : 'round', snow });
    if (snow < 0.5) plants.meadow(g, 0, W, (x) => fm(x) + 90 + rr() * 60, pal, { rng: rr, depth: 0.3, density: 0.4, flowers: 0.8, wind });
    // cottage on the slope with a path winding down to the near valley
    const cx = W * 0.7, cy = fm(cx) + 62;
    const path = [[cx - 10, cy + 2], [cx - 60, cy + 50], [cx - 40, cy + 110], [cx - 110, cy + 170], [cx - 90, cy + 230]];
    terrain.path(g, path, (t) => 8 + t * 22, pal, { rng: rr });
    buildings.cottage(g, cx, cy, 150, 60, pal, { rng: rr, roof: 'thatch', door: 'left', windows: 2, snow, smoke: env.cold > 0.3 || night, lit: night || env.time === 'dusk' || wx === 'storm', ivy: env.season !== 'winter' });
    plants.tree(g, cx + 115, cy + 6, 120, pal, { rng: rr, kind: 'apple', snow });
    buildings.fence(g, cx + 20, cx + 230, (x) => fm(x) + 66, pal, { rng: rr, gap: 30, h: 22 });
    if (snow < 0.5) plants.shrub(g, cx - 120, cy + 10, 44, pal, { rng: rr, berries: env.season === 'autumn' });
  }));

  // ---------------------------------------------------------------- near: the meadow, tree, pond, creatures
  const nearP = { base: 770, amp: 46, freq: 0.0031, phase: 2.2, seed: 11 }, fn = terrain.profile(nearP);
  L.push(layers.bake({ x: 0, y: 300, w: W, h: 700 }, world.scale, (g) => {
    const rr = r.fork(3);
    terrain.hills(g, -20, W + 20, 1010, nearP, pal, { rng: rr, depth: 0.85, snow, texture: 1, ridge: 1 });
    // the pond, lying in the dip below the big tree
    const px = W * 0.3, py = 860, pw = W * 0.3, ph = 96;
    const pond = water.still(g, pal, { rng: rr, rect: [px - pw / 2, py - ph / 2, pw, ph], sky: pal.skyHorizon, ripples: 1 + wet * 3 });
    // the big tree
    const tx = W * 0.22, ty = 775, ts = 400;
    const tree = plants.tree(g, tx, ty, ts, pal, { rng: rr, kind: env.season === 'spring' ? 'apple' : 'round', snow, blossom: env.season === 'spring' ? 1 : 0 });
    // reflection of the tree and of the sky light
    g.save(); brush.smoothClosed(g, pond); g.clip();
    water.reflect(g, tx + 30, py - ph * 0.45, ts * 0.7, ph * 0.9, color.mix(pal.foliage[2], pal.waterDeep, 0.5), { rng: rr, a: 0.22 });
    water.reflect(g, tx, py - ph * 0.45, 20, ph * 0.8, pal.trunk, { rng: rr, a: 0.3 });
    g.restore();
    plants.reeds(g, px - pw * 0.42, py + ph * 0.1, 50, pal, { rng: rr, n: 7, wind });
    plants.reeds(g, px + pw * 0.45, py + ph * 0.05, 44, pal, { rng: rr, n: 5, wind });
    // rocks and foreground path end
    terrain.rock(g, W * 0.6, 905, 70, 44, pal, { rng: rr, moss: 1, snow });
    terrain.rock(g, W * 0.64, 915, 40, 26, pal, { rng: rr, moss: 0, snow });
    // meadow bands, bigger toward the front
    plants.meadow(g, 0, W, (x) => fn(x) + 20 + rr() * 30, pal, { rng: rr, depth: 0.5, density: 0.8, flowers: 0.9, wind, drawn: 0 });
    plants.meadow(g, 0, W, (x) => fn(x) + 90 + rr() * 60, pal, { rng: rr, depth: 0.75, density: 0.7, flowers: 1, wind, drawn: 2 });
    if (env.season === 'autumn' && !snow) plants.litter(g, 0, 900, W, 90, pal, { rng: rr, n: 60 });
    // creatures
    creatures.rabbit(g, W * 0.56, 968, 96, pal, { rng: rr, dir: -1 });
    creatures.robin(g, W * 0.75 + 20, fn(W * 0.75 + 20) + 38, 30, pal, { rng: rr, dir: -1 });
    creatures.snail(g, W * 0.6 + 10, 885, 22, pal, { rng: rr, dir: 1 });
    if (env.season !== 'winter' && !night) creatures.bee(g, W * 0.46, 920, 16, pal, { rng: rr, dir: 1 });
    if (env.season === 'summer' && !night) creatures.butterfly(g, W * 0.4, 890, 26, pal, { rng: rr });
    if (env.season === 'autumn') plants.mushroom(g, W * 0.16, 985, 36, pal, { rng: rr });
    terrain.ground(g, -10, 960, W + 20, 60, pal, { rng: rr, a: 0.3 });
    plants.meadow(g, -20, W + 20, (x) => 968 + rr() * 30, pal, { rng: rr, depth: 1, density: 1.1, flowers: 1.1, s: 40, wind, drawn: 5 });
    plants.meadow(g, -20, W + 20, (x) => 1000 + rr() * 20, pal, { rng: rr, depth: 1, density: 0.8, flowers: 0.8, s: 62, wind, drawn: 4 });
    if (snow) terrain.snowOn(g, [[-20, 972], [W * 0.3, 968], [W * 0.6, 974], [W + 20, 970]], 1010, pal, { rng: rr, k: snow, depth: 1 });
  }));

  const cottage = { x: W * 0.7, y: fm(W * 0.7) + 62 };
  const lit = night || env.time === 'dusk' || wx === 'storm';
  return {
    layers: L,
    draw(g, env, view, t = 0) {
      for (const l of L) layers.blit(g, l, view);
      if (lit) { // the cottage windows and a lantern by the door glow through the night grade
        const k = 0.9 + 0.1 * Math.sin(t * 5);
        art.light(g, cottage.x - 42, cottage.y - 35, 90, pal.lampGlow, 0.9 * k, { core: 9 });
        art.light(g, cottage.x + 42, cottage.y - 35, 90, pal.lampGlow, 0.9 * k, { core: 9 });
      }
      if (night && env.season === 'summer' && wx === 'clear') for (let i = 0; i < 14; i++) { // fireflies over the meadow
        const h = art.hash2(i, 1, 77), h2 = art.hash2(i, 2, 77), on = 0.5 + 0.5 * Math.sin(t * (1.5 + h) + h2 * 9);
        art.light(g, W * (0.1 + 0.8 * h) + Math.sin(t * 0.7 + i) * 20, 860 + h2 * 120 + Math.cos(t * 0.5 + i) * 12, 22, color.pig('lemon'), on * 0.9, { core: 2.2 });
      }
    },
  };
}
