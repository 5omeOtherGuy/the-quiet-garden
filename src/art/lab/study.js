// Study sheet: single kit elements on bare paper, to judge the drawing itself. ?plate=study&page=trees|sky|land|small
export function study(art, env, world, seed = 7) {
  const { palette, sky, terrain, water, plants, buildings, creatures, brush, color, layers, rng } = art;
  const pal = palette(env), W = world.w, H = world.h, r = rng(seed), page = new URLSearchParams(location.search).get('page') || 'trees';
  layers.maxPixels = 4.6e6;
  const L = [layers.bake({ x: 0, y: 0, w: W, h: H }, world.scale, (g) => {
    const rr = r.fork(1);
    if (page === 'trees') {
      plants.tree(g, W * 0.2, 640, 560, pal, { rng: rr, kind: 'round' });
      plants.tree(g, W * 0.56, 620, 400, pal, { rng: rr, kind: 'apple' });
      plants.tree(g, W * 0.85, 630, 500, pal, { rng: rr, kind: 'birch' });
      plants.tree(g, W * 0.08, 960, 110, pal, { rng: rr, kind: 'round' });
      plants.tree(g, W * 0.17, 960, 60, pal, { rng: rr, kind: 'round' });
      plants.tree(g, W * 0.24, 960, 80, pal, { rng: rr, kind: 'tall' });
      plants.tree(g, W * 0.4, 965, 240, pal, { rng: rr, kind: 'round' });
      plants.shrub(g, W * 0.56, 960, 90, pal, { rng: rr, berries: true });
      plants.conifer(g, W * 0.7, 965, 260, pal, { rng: rr });
      plants.conifer(g, W * 0.8, 960, 120, pal, { rng: rr });
    } else if (page === 'trees2') {
      plants.tree(g, W * 0.16, 640, 520, pal, { rng: rr, kind: 'tall' });
      plants.tree(g, W * 0.5, 640, 480, pal, { rng: rr, kind: 'willow' });
      plants.tree(g, W * 0.84, 640, 440, pal, { rng: rr, kind: 'round', bare: 1 });
      plants.tree(g, W * 0.2, 970, 280, pal, { rng: rr, kind: 'apple', blossom: 1 });
      plants.tree(g, W * 0.5, 970, 280, pal, { rng: rr, kind: 'apple', fruit: true });
      plants.tree(g, W * 0.8, 970, 280, pal, { rng: rr, kind: 'round', bare: 1, snow: 1 });
    } else if (page === 'sky') {
      sky.paint(g, 0, 0, W, 700, pal, { rng: rr, horizonGlow: env.time === 'dawn' || env.time === 'dusk' ? 1 : 0 });
      sky.cumulus(g, [{ x: W * 0.28, y: 300, s: 520 }, { x: W * 0.72, y: 210, s: 360 }, { x: W * 0.6, y: 470, s: 200 }], pal, { rng: rr });
      terrain.hills(g, -20, W + 20, 1010, { base: 760, amp: 40, freq: 0.004, phase: 1, seed: 3 }, pal, { rng: rr, depth: 0.2, sky: pal.skyHorizon });
    } else if (page === 'land') {
      sky.paint(g, 0, 0, W, 420, pal, { rng: rr });
      terrain.hills(g, -20, W + 20, 700, { base: 300, amp: 30, freq: 0.0042, phase: 1.2, seed: 3 }, pal, { rng: rr, depth: 0.12, sky: pal.skyHorizon });
      terrain.hills(g, -20, W + 20, 800, { base: 380, amp: 40, freq: 0.0056, phase: 3.1, seed: 5 }, pal, { rng: rr, depth: 0.3, sky: pal.skyHorizon, story: { fields: 7 } });
      terrain.hills(g, -20, W + 20, 1010, { base: 520, amp: 60, freq: 0.0046, phase: 0.6, seed: 9 }, pal, { rng: rr, depth: 0.6, story: { fields: 5, sheep: 5, hay: 3, gate: true } });
      terrain.hills(g, -20, W + 20, 1010, { base: 800, amp: 46, freq: 0.0031, phase: 2.2, seed: 11 }, pal, { rng: rr, depth: 0.9 });
      plants.meadow(g, 0, W, (x) => 880 + rr() * 40, pal, { rng: rr, depth: 0.75 });
      plants.meadow(g, 0, W, (x) => 985 + rr() * 20, pal, { rng: rr, depth: 1, s: 50 });
    } else {
      buildings.cottage(g, W * 0.25, 520, 380, 150, pal, { rng: rr, roof: 'thatch', door: 'left', windows: 2, smoke: true, ivy: true });
      buildings.fence(g, W * 0.42, W * 0.6, () => 520, pal, { rng: rr, gap: 50, h: 44 });
      terrain.rock(g, W * 0.68, 520, 160, 100, pal, { rng: rr, moss: 1 });
      terrain.rock(g, W * 0.78, 520, 70, 46, pal, { rng: rr });
      water.still(g, pal, { rng: rr, rect: [W * 0.05, 620, W * 0.4, 130], sky: pal.skyHorizon });
      plants.reeds(g, W * 0.08, 700, 80, pal, { rng: rr, n: 7 });
      let x = W * 0.5; for (const k of ['daisy', 'poppy', 'bluebell', 'buttercup', 'cornflower', 'dandelion', 'thistle', 'tulip', 'primrose', 'foxglove', 'snowdrop']) { plants.flower(g, x, 800, 22, pal, { rng: rr, kind: k }); x += W * 0.042; }
      plants.meadow(g, W * 0.03, W * 0.97, () => 960 + rr() * 20, pal, { rng: rr, depth: 1, s: 46 });
      plants.mushroom(g, W * 0.9, 560, 60, pal, { rng: rr }); plants.fern(g, W * 0.86, 560, 120, pal, { rng: rr });
      terrain.sheep(g, W * 0.9, 700, 60, pal, { rng: rr }); terrain.haystack(g, W * 0.82, 700, 40, pal, { rng: rr }); terrain.gate(g, W * 0.72, 700, 40, pal, { rng: rr });
    }
  })];
  return { layers: L, ownWeather: true, draw(g, env, view) { for (const l of L) layers.blit(g, l, view); } };
}
