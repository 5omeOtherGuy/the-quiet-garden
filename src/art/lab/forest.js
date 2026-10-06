// Reference plate: the edge of the wood. Proves the kit covers a second, different place.
// The dark wood on the left, a path and a stream, the sunlit fields beyond on the right.
export function forest(art, env, world, seed = 11) {
  const { palette, sky, terrain, water, plants, buildings, creatures, brush, color, layers, rng } = art;
  const pal = palette(env), W = world.w, H = world.h, r = rng(seed), pg = color.pig;
  const night = env.time === 'night', snow = pal.snowK, wind = env.windy || 0, wx = env.weather;
  layers.maxPixels = 4.6e6;
  const L = [], T = pal.foliage, woodX = W * 0.56;       // the wood ends about here
  const groundY = (x) => 800 + Math.sin(x * 0.004) * 14 - Math.max(0, x - woodX) * 0.03;

  // ---------------------------------------------------------------- far: sky and the open country to the right
  L.push(layers.bake({ x: 0, y: 0, w: W, h: 820 }, world.scale, (g) => {
    const rr = r.fork(1);
    sky.paint(g, 0, 0, W, 640, pal, { rng: rr, horizonGlow: env.time === 'dawn' || env.time === 'dusk' ? 1 : 0 });
    if (night) { sky.stars(g, W * 0.4, 0, W * 0.6, 420, { rng: rr, density: 16 }); sky.moon(g, W * 0.82, 150, 28, pal, { rng: rr }); }
    else if (wx === 'clear' || wx === 'wind') sky.sun(g, W * 0.86, env.time === 'day' ? 130 : 470, 26, pal, { rng: rr });
    if (wx !== 'fog') sky.cumulus(g, [{ x: W * 0.7, y: 250, s: 330 }, { x: W * 0.93, y: 380, s: 220 }], pal, { rng: rr, shade: wx === 'rain' || wx === 'storm' ? 1.8 : 1 });
    terrain.hills(g, woodX - 200, W + 20, 800, { base: 560, amp: 34, freq: 0.005, phase: 0.4, seed: 2 }, pal, { rng: rr, depth: 0.15, soft: 4, snow, texture: 0, ridge: 0.3, sky: pal.skyHorizon });
    terrain.hills(g, woodX - 260, W + 20, 820, { base: 640, amp: 40, freq: 0.0045, phase: 2.0, seed: 4 }, pal, { rng: rr, depth: 0.5, snow, texture: 1, ridge: 0.8, story: { fields: 4, sheep: snow ? 0 : 4, hay: env.season === 'summer' || env.season === 'autumn' ? 2 : 0, gate: true } });
  }));

  // ---------------------------------------------------------------- the wood: depth by layers of trunks
  L.push(layers.bake({ x: 0, y: 0, w: W, h: H }, world.scale, (g) => {
    const rr = r.fork(2);
    // the dark heart of the wood: soft deep greens and indigo, lighter toward the edge
    const deep = color.mix(T[3], pg('indigo'), 0.45);
    brush.softFill(g, [[-40, -40], [woodX + 60, -40], [woodX - 40, 420], [woodX + 30, 840], [-40, 840]], deep, 0.78, 26);
    brush.softFill(g, brush.blob(woodX * 0.4, 430, woodX * 0.5, 330, { rng: rr, wobble: 0.3 }), color.mix(deep, pg('viridian'), 0.4), 0.4, 60);
    for (let i = 0; i < 9; i++) brush.softFill(g, brush.blob(rr() * woodX, 200 + rr() * 500, 50 + 90 * rr(), 60 + 120 * rr(), { rng: rr, wobble: 0.35 }), rr() < 0.5 ? color.mix(T[2], pg('lemon'), 0.2) : color.deepen(deep, 0.2), 0.22, 26);
    // shafts of light slanting in from the open side
    if (!night && wx !== 'rain' && wx !== 'storm') { g.save(); g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 4; i++) { const sx = woodX * (0.25 + 0.2 * i); brush.softFill(g, [[sx + 150, 80], [sx + 210, 80], [sx - 40, 800], [sx - 130, 800]], [0, 0, 0], 0.16, 22); } g.restore(); }
    // far trunks: pale, soft, no line
    for (let i = 0; i < 16; i++) { const x = rr() * woodX * 0.95, w = 6 + rr() * 9, y0 = 730 + rr() * 50; brush.softFill(g, [[x - w * 0.5, y0], [x - w * 0.35 + (rr() - 0.5) * 20, 60], [x + w * 0.35 + (rr() - 0.5) * 20, 60], [x + w * 0.5, y0]], color.mix(deep, pal.skyHorizon, 0.45), 0.5, 3); }
    // the forest floor under the trees
    const floor = []; for (let x = -20; x <= W + 20; x += 20) floor.push([x, groundY(x) - 30 + (rr() - 0.5) * 8]);
    const floorPoly = floor.concat([[W + 20, H + 20], [-20, H + 20]]);
    brush.wash(g, floorPoly, snow > 0.5 ? color.dilute(pal.snowShade, 0.5) : color.mix(pal.ground, T[2], 0.35), { a: 0.5, rng: rr, layers: 2, edge: 0, jitter: 0.01 });
    brush.softFill(g, [[-20, 760], [woodX, 760], [woodX - 60, H + 20], [-20, H + 20]], snow > 0.5 ? pal.snowShade : color.mix(pg('burntUmber'), T[3], 0.5), 0.35, 30);
    if (!night && !snow) for (let i = 0; i < 12; i++) brush.lift(g, rr() * woodX, 800 + rr() * 150, 20 + 40 * rr(), 6 + 8 * rr(), { a: 0.35, rng: rr, wobble: 0.4 });   // dappled light
    // middle trunks with line: birches and oaks, small to large
    const mids = []; for (let i = 0; i < 7; i++) mids.push({ x: W * (0.03 + 0.5 * rr()), s: 520 + rr() * 260, kind: rr() < 0.45 ? 'birch' : 'tall' });
    mids.sort((a, b) => a.s - b.s);
    for (const m of mids) plants.tree(g, m.x, groundY(m.x) - 26 + (m.s - 520) * 0.05, m.s, pal, { rng: rr, kind: m.kind, snow });
  }));

  // ---------------------------------------------------------------- near: path, stream, the great oak, the small things
  L.push(layers.bake({ x: 0, y: 0, w: W, h: H }, world.scale, (g) => {
    const rr = r.fork(3);
    // the stream comes down from the fields and runs out at the bottom right
    const stream = [[W * 0.98, 690], [W * 0.86, 740], [W * 0.8, 800], [W * 0.84, 870], [W * 0.78, 930], [W * 0.82, 1010]];
    const sc = brush.resample(stream, 30);
    water.river(g, sc, (t) => 26 + t * 60, pal, { rng: rr });
    // the path: out of the wood, over the stream, off to the fields
    const path = [[W * 0.18, 700], [W * 0.3, 790], [W * 0.46, 850], [W * 0.62, 880], [W * 0.8, 868], [W * 0.92, 800], [W * 1.02, 770]];
    terrain.path(g, brush.resample(path, 40), (t) => 20 + Math.sin(t * Math.PI) * 26, pal, { rng: rr, color: snow > 0.5 ? color.dilute(pal.snowShade, 0.3) : undefined });
    // a plank bridge with a handrail
    const bx = W * 0.805, by = 866;
    brush.groundShadow(g, bx, by + 14, 80, 12, 0.3, pal.shadow);
    for (let i = -3; i <= 3; i++) { const px = bx + i * 17; brush.lineAndWash(g, [[px - 8, by - 9], [px + 8, by - 10], [px + 9, by + 9], [px - 7, by + 10]], color.mix(pal.trunk, pg('ochre'), 0.45), { a: 0.6, rng: rr, ink: 0.6, inkColor: pal.ink, w: 1.1, offset: 0.08 }); }
    for (const e of [-1, 1]) brush.ink(g, [[bx + e * 62, by - 8], [bx + e * 64, by - 52]], { w: 4, a: 0.8, color: pal.trunk, rng: rr, taper: [0, 0.1] });
    brush.ink(g, [[bx - 70, by - 46], [bx, by - 54], [bx + 70, by - 47]], { w: 3, a: 0.75, color: pal.trunk, rng: rr, wobble: 0.5, taper: [0.02, 0.02] });
    // the great oak at the left edge, cutting the frame, with a hollow
    const ox = W * 0.085, oy = 905;
    const oak = plants.tree(g, ox, oy, 980, pal, { rng: rr, kind: 'round', snow });
    const hollow = brush.blob(ox + 8, oy - 210, 30, 44, { rng: rr, wobble: 0.12, n: 14 });
    brush.wash(g, hollow, color.mix(pg('sepia'), pg('indigo'), 0.4), { a: 0.9, rng: rr, layers: 2, edge: 1 });
    brush.ink(g, hollow, { w: 1.8, a: 0.7, color: pal.ink, rng: rr, closed: true, broken: 0.2, wobble: 0.6 });
    creatures.owl(g, ox + 8, oy - 176, 62, pal, { rng: rr, sleep: !night });
    // a fallen log with moss, and a snail on it
    const lx = W * 0.4, ly = 925;
    brush.groundShadow(g, lx, ly + 6, 150, 16, 0.28, pal.shadow);
    const log = [[lx - 140, ly - 14], [lx - 60, ly - 40], [lx + 120, ly - 34], [lx + 150, ly - 8], [lx + 120, ly + 6], [lx - 110, ly + 10]];
    brush.lineAndWash(g, log, pal.trunk, { a: 0.55, rng: rr, shade: [0.1, 0.7], ink: 0.7, inkColor: pal.ink, w: 1.8, offset: 0.02 });
    g.save(); brush.smoothClosed(g, log); g.clip(); for (let i = 0; i < 6; i++) brush.dryBrush(g, [[lx - 130, ly - 24 + i * 6], [lx + 140, ly - 30 + i * 6]], color.deepen(pal.trunk, 0.4), { w: 4, a: 0.3, n: 3, rng: rr }); for (let i = 0; i < 9; i++) brush.dab(g, lx - 100 + rr() * 200, ly - 34 + rr() * 8, 10 + rr() * 12, 5 + rr() * 4, snow > 0.5 ? color.PAPER : color.mix(pg('sap'), pg('lemon'), 0.3), { rng: rr, a: 0.6, edge: 0.7 }); g.restore();
    const end = brush.blob(lx + 138, ly - 14, 14, 24, { rng: rr, wobble: 0.08, n: 12 }); brush.lineAndWash(g, end, color.dilute(pg('ochre'), 0.35), { a: 0.7, rng: rr, ink: 0.7, inkColor: pal.ink, w: 1.3 }); for (const k of [0.4, 0.7]) brush.ink(g, brush.blob(lx + 138, ly - 14, 14 * k, 24 * k, { rng: rr, n: 10 }), { w: 0.9, a: 0.4, color: pal.ink, rng: rr, closed: true, broken: 0.3 });
    creatures.snail(g, lx - 30, ly - 38, 26, pal, { rng: rr, dir: -1 });
    // rocks by the stream, the signpost at the bridge
    terrain.rock(g, W * 0.735, 905, 64, 40, pal, { rng: rr, moss: 1, snow });
    terrain.rock(g, W * 0.9, 945, 90, 52, pal, { rng: rr, moss: 1, snow });
    buildings.signpost(g, W * 0.705, 868, 110, pal, { rng: rr, arms: 2 });
    creatures.robin(g, W * 0.705 + 2, 868 - 110, 28, pal, { rng: rr, dir: 1 });
    // undergrowth: ferns, foxgloves, mushrooms, brambles, litter
    if (snow < 0.5) {
      for (let i = 0; i < 9; i++) { const x = W * (0.12 + 0.4 * rr()); plants.fern(g, x, groundY(x) + 40 + rr() * 110, 70 + rr() * 60, pal, { rng: rr }); }
      if (env.season === 'summer' || env.season === 'spring') for (const fx of [0.2, 0.235, 0.33, 0.5, 0.53]) plants.flower(g, W * fx, groundY(W * fx) + 60 + rr() * 60, 15 + rr() * 5, pal, { rng: rr, kind: 'foxglove', stemK: 6 });
      plants.shrub(g, W * 0.56, 800, 90, pal, { rng: rr, berries: env.season !== 'spring' });
      plants.litter(g, 0, 880, woodX, 110, pal, { rng: rr, n: env.season === 'autumn' ? 120 : 30 });
    }
    for (const [mx, my, ms] of [[0.27, 960, 44], [0.295, 972, 26], [0.47, 968, 34], [0.15, 990, 30]]) plants.mushroom(g, W * mx, my, ms, pal, { rng: rr, color: rr() < 0.5 ? pg('cadRed') : color.mix(pg('ochre'), pg('burntSienna'), 0.5) });
    // who lives here
    creatures.fox(g, W * 0.345, 842, 120, pal, { rng: rr, dir: 1 });
    creatures.hedgehog(g, W * 0.6, 905, 52, pal, { rng: rr, dir: 1 });
    creatures.rabbit(g, W * 0.94, 842, 54, pal, { rng: rr, dir: -1 });
    // the sunlit bank on the right and the front edge of grasses
    plants.meadow(g, woodX, W + 20, (x) => 800 + rr() * 60, pal, { rng: rr, depth: 0.7, density: 0.8, flowers: 1, wind, drawn: 2 });
    plants.reeds(g, W * 0.83, 935, 60, pal, { rng: rr, n: 7, wind });
    plants.meadow(g, -20, W + 20, (x) => 1000 + rr() * 22, pal, { rng: rr, depth: 1, density: 0.8, flowers: x_flowers(env), s: 56, wind, drawn: 3 });
    if (snow) terrain.snowOn(g, [[-20, 985], [W * 0.3, 978], [W * 0.6, 986], [W + 20, 980]], 1010, pal, { rng: rr, k: snow, depth: 1 });
  }));

  // the canopy overhead: a separate front layer of leaf masses hanging into the picture
  if (pal.bare < 0.9) L.push(layers.bake({ x: 0, y: 0, w: W, h: 360 }, world.scale, (g) => {
    const rr = r.fork(4), tips = [];
    for (let i = 0; i < 26; i++) tips.push({ x: rr() * woodX * 1.05, y: -20 + rr() * 150 * (1 - 0.4 * rr()), depth: 2, L: 40, a: 1.5 });
    plants.crown(g, tips, pal, { rng: rr, s: 620, keep: 1 - pal.bare * 0.8, shade: [-0.3, 0.8] });
  }));

  function x_flowers(e) { return e.season === 'winter' ? 0.3 : 0.7; }
  const lit = night || env.time === 'dusk';
  return {
    layers: L,
    draw(g, env, view, t = 0) {
      for (const l of L) layers.blit(g, l, view);
      if (lit) { const k = 0.9 + 0.1 * Math.sin(t * 5); art.light(g, W * 0.705 + 30, 868 - 96, 120, pal.lampGlow, 0.8 * k, { core: 7 }); }   // a lantern on the signpost
      if (night) for (const e of [-1, 1]) art.light(g, W * 0.085 + 8 + e * 7.5, 905 - 176 - 46, 10, color.pig('cadYellow'), 0.9, { core: 3 });   // the owl is awake
      if (night && wx === 'clear' && env.season !== 'winter') for (let i = 0; i < 12; i++) {
        const h = art.hash2(i, 1, 91), h2 = art.hash2(i, 2, 91), on = Math.max(0, Math.sin(t * (1.2 + h) + h2 * 9));
        art.light(g, W * (0.1 + 0.5 * h) + Math.sin(t * 0.6 + i) * 22, 640 + h2 * 260 + Math.cos(t * 0.45 + i * 2) * 14, 16, color.pig('lemon'), on * 0.8, { core: 1.6 });
      }
    },
  };
}
