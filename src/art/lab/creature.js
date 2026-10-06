// Reference plate: a creature close-up. A hedgehog and a mouse meet among the tall flowers.
export function creature(art, env, world, seed = 7) {
  const { palette, terrain, plants, creatures, brush, color, layers, rng } = art;
  const pal = palette(env), W = world.w, H = world.h, r = rng(seed), pg = color.pig;
  layers.maxPixels = 4.6e6;
  const L = [];
  L.push(layers.bake({ x: 0, y: 0, w: W, h: H }, world.scale, (g) => {
    const rr = r.fork(1);
    // background: out-of-focus meadow and sky, big wet washes
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, color.css(color.dilute(pal.skyTop, 0.3))); gr.addColorStop(0.3, color.css(color.dilute(pal.skyHorizon, 0.2))); gr.addColorStop(0.6, color.css(color.dilute(color.mix(pal.foliage[0], pg('lemon'), 0.3), 0.25))); gr.addColorStop(1, color.css(pal.foliage[1]));
    g.save(); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
    for (let i = 0; i < 14; i++) brush.softFill(g, brush.blob(rr() * W, H * (0.3 + 0.65 * rr()), 90 + 180 * rr(), 60 + 100 * rr(), { rng: rr, wobble: 0.3 }), color.mix(pal.foliage[Math.floor(rr() * 4)], pg('lemon'), 0.2), 0.4, 40);
    for (let i = 0; i < 5; i++) brush.lift(g, rr() * W, H * (0.1 + 0.45 * rr()), 30 + 50 * rr(), 30 + 50 * rr(), { a: 0.4, rng: rr, wobble: 0.1 });
    for (let i = 0; i < 8; i++) brush.softFill(g, brush.blob(rr() * W, H * (0.2 + 0.45 * rr()), 18 + 30 * rr(), 18 + 30 * rr(), { rng: rr, wobble: 0.1 }), i % 2 ? pal.blossom : pal.accent, 0.3, 14);
    brush.granulate(g, [[0, 0], [W, 0], [W, H], [0, H]], 0.12, 2);
    // blurred mid-ground stems
    for (let i = 0; i < 30; i++) { const x = rr() * W, h = 200 + 380 * rr(); brush.softFill(g, [[x - 6, H], [x - 3 + (rr() - 0.5) * 60, H - h], [x + 3 + (rr() - 0.5) * 60, H - h], [x + 6, H]], pal.foliage[1 + Math.floor(rr() * 3)], 0.35, 14); }
    // ground
    terrain.ground(g, -10, H * 0.84, W + 20, H * 0.2, pal, { rng: rr, a: 0.35 });
    // sharp things: flowers behind the creatures, big
    const back = [['poppy', 0.1, 0.9, 90], ['daisy', 0.22, 0.86, 70], ['cornflower', 0.9, 0.9, 80], ['daisy', 0.8, 0.84, 60], ['buttercup', 0.33, 0.88, 50], ['poppy', 0.95, 0.86, 70]];
    for (const [k, tx, ty, s] of back) plants.flower(g, W * tx, H * ty, s * 0.42, pal, { rng: rr, kind: k, stemK: 5 });
    plants.fern(g, W * 0.06, H * 0.95, 240, pal, { rng: rr, dir: 1 });
    // the meeting
    creatures.hedgehog(g, W * 0.42, H * 0.86, 330, pal, { rng: rr, dir: 1 });
    creatures.mouse(g, W * 0.74, H * 0.87, 200, pal, { rng: rr, dir: -1 });
    creatures.snail(g, W * 0.16, H * 0.89, 70, pal, { rng: rr, dir: 1 });
    plants.mushroom(g, W * 0.9, H * 0.95, 110, pal, { rng: rr });
    plants.mushroom(g, W * 0.86, H * 0.96, 60, pal, { rng: rr });
    creatures.bee(g, W * 0.6, H * 0.4, 46, pal, { rng: rr, dir: -1 });
    creatures.butterfly(g, W * 0.3, H * 0.33, 90, pal, { rng: rr, color: pg('cadOrange'), color2: pg('lemon') });
    // foreground grass and a few big flower heads cutting the frame
    plants.meadow(g, -20, W + 20, () => H * 0.97 + rr() * 30, pal, { rng: rr, depth: 1, density: 0.9, flowers: 0.6, s: 110 });
    plants.meadow(g, -20, W + 20, () => H * 1.03 + rr() * 30, pal, { rng: rr, depth: 1, density: 0.6, flowers: 0.4, s: 170 });
    plants.flower(g, W * 0.05, H * 1.02, 60, pal, { rng: rr, kind: 'daisy', stemK: 3 });
    plants.flower(g, W * 0.62, H * 1.03, 70, pal, { rng: rr, kind: 'poppy', stemK: 3 });
    // a little pollen in the air
    brush.whiteInk(g, W * 0.5, H * 0.45, W * 0.45, { n: 50, size: 1.6, a: 0.5, rng: rr, color: color.dilute(pg('lemon'), 0.4) });
  }));
  return { layers: L, draw(g, env, view) { for (const l of L) layers.blit(g, l, view); } };
}
