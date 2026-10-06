// Reference plate: inside a burrow. One baked layer; a lantern glow and a sleeping mouse family.
export function burrow(art, env, world, seed = 7) {
  const { palette, terrain, plants, buildings, creatures, brush, color, layers, rng } = art;
  const pal = palette(env), W = world.w, H = world.h, r = rng(seed);
  const pg = color.pig, night = env.time === 'night';
  layers.maxPixels = 4.6e6;
  const L = [];
  L.push(layers.bake({ x: 0, y: 0, w: W, h: H }, world.scale, (g) => {
    const rr = r.fork(1);
    const earth = color.mix(pg('burntUmber'), pg('sepia'), 0.4), warmEarth = color.mix(pg('rawSienna'), pg('burntUmber'), 0.5);
    terrain.cave(g, 0, 0, W, H, pal, { rng: rr, strata: 7, roots: 0, stones: 34, color: earth });
    const floorY = H * 0.76;
    // lantern light warms the middle of the room: an irregular, soft, warm glaze
    const lx = W * 0.5, ly = H * 0.4;
    const lit = brush.blob(lx, ly + 120, W * 0.36, H * 0.4, { rng: rr, wobble: 0.3, n: 26, freq: 2.5 });
    brush.softFill(g, lit, color.mix(pg('ochre'), pg('cadOrange'), 0.3), 0.22, 60);
    brush.softFill(g, brush.blob(lx, ly + 80, W * 0.2, H * 0.22, { rng: rr, wobble: 0.3, n: 20 }), color.dilute(pg('cadYellow'), 0.3), 0.18, 40);
    // the light catches the grit of the wall: texture inside the lit patch, and uneven blotches of warmth
    brush.scumble(g, lit, color.dilute(pg('ochre'), 0.5), { a: 0.18, rng: rr, angle: 0.05, len: 10, w: 1, density: 0.5 });
    brush.granulate(g, lit, 0.3, 1.6);
    for (let i = 0; i < 10; i++) brush.softFill(g, brush.blob(lx + (rr() - 0.5) * W * 0.5, ly + 60 + (rr() - 0.5) * H * 0.5, 40 + 80 * rr(), 20 + 40 * rr(), { rng: rr, wobble: 0.35 }), rr() < 0.5 ? color.deepen(earth, 0.3) : color.mix(pg('rawSienna'), pg('cadOrange'), 0.3), 0.14, 12);
    // the floor: trodden earth, a soft dark edge where it meets the back wall
    const floor = []; for (let x = -10; x <= W + 10; x += 24) floor.push([x, floorY + Math.sin(x * 0.004) * 8 + (rr() - 0.5) * 6]);
    const floorPoly = floor.concat([[W + 10, H + 10], [-10, H + 10]]);
    brush.wash(g, floorPoly, warmEarth, { a: 0.45, rng: rr, layers: 2, edge: 0.4, gran: 0.6, jitter: 0.01, mottle: 0.2 });
    brush.softFill(g, floor.map((p) => [p[0], p[1] + 6]).concat([[W + 10, floorY + 60], [-10, floorY + 60]]), color.deepen(earth, 0.4), 0.45, 14);
    brush.scumble(g, floorPoly, pg('sepia'), { a: 0.14, rng: rr, angle: 0.03, len: 18, w: 1.2, density: 0.4 });
    brush.scumble(g, floorPoly, color.dilute(pg('ochre'), 0.4), { a: 0.12, rng: rr, angle: -0.02, len: 12, w: 1, density: 0.3 });
    brush.lift(g, lx, floorY + 90, W * 0.22, 60, { a: 0.3, rng: rr, wobble: 0.3 });
    for (let i = 0; i < 40; i++) { const px = rr() * W, py = floorY + 10 + rr() * (H - floorY - 10), sw = 3 + rr() * 7; const p = brush.blob(px, py, sw, sw * 0.6, { rng: rr, wobble: 0.3, n: 8 }); brush.wash(g, p, color.mix(pal.rock, earth, 0.5), { a: 0.5, rng: rr, edge: 0.7, gran: 0.4, layers: 1 }); brush.softFill(g, p.map((q) => [q[0] + 1, q[1] + 2]), pg('sepia'), 0.25, 2); }
    // the tunnel up to daylight (top left): an earthy rim, roots, grass hanging in, light spilling into the room
    const dx = W * 0.15, dy = H * 0.3;
    const rim = brush.blob(dx, dy, 150, 185, { rng: rr, wobble: 0.22, n: 24, rot: 0.3, freq: 3 });
    brush.wash(g, rim, color.deepen(earth, 0.35), { a: 0.6, rng: rr, layers: 2, edge: 0.9, gran: 0.6, jitter: 0.04 });
    const mouth = brush.blob(dx, dy, 112, 142, { rng: rr, wobble: 0.16, n: 22, rot: 0.3, freq: 3 });
    const dayC = night ? color.mix(pal.skyTop, pg('indigo'), 0.3) : color.dilute(pal.skyHorizon, 0.25);
    brush.lift(g, dx, dy, 125, 158, { a: 0.95, rng: rr, wobble: 0.16 });
    brush.softFill(g, mouth, dayC, 0.9, 6);
    brush.softFill(g, brush.blob(dx - 20, dy - 40, 70, 60, { rng: rr, wobble: 0.2 }), night ? pal.skyTop : color.dilute(pal.skyTop, 0.3), 0.55, 10);
    if (!night) brush.lift(g, dx + 20, dy - 20, 40, 18, { a: 0.5, rng: rr, wobble: 0.3, clip: mouth }); // a cloud
    brush.glaze(g, mouth.filter((p) => p[1] > dy + 60).concat([[dx + 115, dy + 150], [dx - 115, dy + 150]]), color.mix(pal.foliage[1], pal.foliage[0], 0.5), 0.5); // grass seen through the mouth's lower lip
    brush.edge(g, mouth, color.deepen(earth, 0.5), { a: 0.5, rng: rr, w: 3 });
    for (let i = 0; i < 7; i++) terrain.root(g, dx + (rr() - 0.5) * 240, dy - 150 + rr() * 80, 60 + rr() * 120, pal, { rng: rr, dir: 1, color: color.mix(pg('sepia'), pg('ochre'), 0.3), w: 3 });
    for (let i = 0; i < 12; i++) plants.tuft(g, dx - 120 + rr() * 240, dy - 165 + rr() * 30, 36, pal, { rng: rr, n: 4 });
    // light spilling down from the mouth
    brush.softFill(g, brush.jitter([[dx - 60, dy + 120], [dx + 90, dy + 110], [dx + 380, floorY + 30], [dx + 200, floorY + 70], [dx - 60, floorY + 60]], rr, 0.08), night ? pg('lavender') : color.dilute(pg('lemon'), 0.6), night ? 0.1 : 0.16, 90);
    brush.glow(g, dx, dy, 320, night ? pg('lavender') : color.dilute(pg('lemon'), 0.5), night ? 0.15 : 0.3);
    // a darker tunnel going on (right)
    const deeper = brush.blob(W * 0.87, H * 0.56, 95, 125, { rng: rr, wobble: 0.22, n: 20, rot: -0.4, freq: 3 });
    brush.wash(g, deeper, color.deepen(earth, 0.5), { a: 0.75, rng: rr, layers: 2, edge: 0.9, gran: 0.5 });
    brush.softFill(g, brush.blob(W * 0.88, H * 0.57, 60, 85, { rng: rr, wobble: 0.2 }), color.deepen(pg('indigo'), 0.3), 0.7, 18);
    brush.edge(g, deeper, color.deepen(earth, 0.6), { a: 0.5, rng: rr, w: 3 });
    // ceiling roots, roots creeping along the walls, and hanging things
    for (let i = 0; i < 9; i++) terrain.root(g, W * 0.3 + rr() * W * 0.6, -4, 70 + rr() * 150, pal, { rng: rr, dir: 1, color: color.mix(pg('sepia'), pg('ochre'), 0.25), w: 4 });
    for (let i = 0; i < 5; i++) terrain.root(g, rr() < 0.5 ? -4 : W + 4, H * (0.1 + 0.5 * rr()), 80 + rr() * 160, pal, { rng: rr, dir: rr() < 0.5 ? 1 : -1, color: color.mix(pg('sepia'), pg('burntUmber'), 0.5), w: 3 });
    for (let i = 0; i < 4; i++) plants.mushroom(g, W * (0.72 + 0.06 * i) + rr() * 20, floorY + 14 + rr() * 8, 14 + rr() * 12, pal, { rng: rr, color: color.dilute(pg('ochre'), 0.3), spots: false });
    for (let i = 0; i < 3; i++) { const hx = W * (0.6 + i * 0.07), hy = H * 0.3 + i * 10; brush.stroke(g, [[hx, hy - 60], [hx + 3, hy]], { w: 1, a: 0.6, color: pg('sepia'), rng: rr }); plants.flower(g, hx, hy + 48, 12, pal, { rng: rr, kind: ['thistle', 'daisy', 'dandelion'][i], stem: false, stemK: 4 }); }
    // the bed: a nest of straw with a sleeping mouse and a little one
    const bx = W * 0.3, by = H * 0.86;
    brush.groundShadow(g, bx, by + 8, 190, 44, 0.35, pal.shadow);
    const nest = brush.blob(bx, by - 14, 180, 60, { rng: rr, wobble: 0.15, n: 26 });
    brush.wash(g, nest, color.mix(pg('ochre'), pg('rawSienna'), 0.4), { a: 0.5, rng: rr, layers: 2, edge: 0.7, gran: 0.4, bloom: 0.5 });
    for (let i = 0; i < 240; i++) { const a = rr() * Math.PI * 2, d = Math.sqrt(rr()), sx = bx + Math.cos(a) * 190 * d, sy = by - 14 + Math.sin(a) * 62 * d, len = 12 + rr() * 30, ang = a + Math.PI / 2 + (rr() - 0.5) * 1.5; brush.ink(g, [[sx, sy], [sx + Math.cos(ang) * len, sy + Math.sin(ang) * len]], { w: 1.8, a: 0.55, color: rr() < 0.45 ? pg('ochre') : rr() < 0.5 ? color.dilute(pg('lemon'), 0.3) : rr() < 0.7 ? pg('rawSienna') : pg('sepia'), rng: rr, taper: [0.1, 0.4] }); }
    brush.lift(g, bx, by - 20, 110, 34, { a: 0.4, rng: rr, clip: nest });
    creatures.mouse(g, bx - 14, by - 6, 120, pal, { rng: rr, dir: 1, sleep: true });
    creatures.mouse(g, bx + 78, by + 2, 60, pal, { rng: rr, dir: -1, sleep: true, color: color.dilute(color.mix(pg('burntUmber'), pg('paynes'), 0.45), 0.5) });
    const blanket = [[bx - 80, by - 40], [bx + 10, by - 62], [bx + 58, by - 40], [bx + 38, by + 2], [bx - 66, by + 4]];
    brush.wash(g, blanket, color.mix(pg('alizarin'), pg('ochre'), 0.4), { a: 0.5, rng: rr, layers: 1, edge: 0.7, gran: 0.3 });
    brush.hatch(g, blanket, { rng: rr, angle: 0.2, spacing: 10, a: 0.3, cross: true, color: pg('indigo') });
    brush.ink(g, blanket, { w: 1.3, a: 0.5, color: pal.ink, rng: rr, closed: true, broken: 0.3, wobble: 0.5 });
    // a mushroom table with an acorn cup and a crumb of cheese
    plants.mushroom(g, W * 0.6, floorY + 46, 120, pal, { rng: rr, color: color.mix(pg('ochre'), pg('burntSienna'), 0.5), spots: false });
    const cupX = W * 0.6 - 20, cupY = floorY - 32;
    brush.wash(g, brush.blob(cupX, cupY, 10, 8, { rng: rr, n: 9 }), pg('burntUmber'), { a: 0.75, rng: rr, edge: 0.8, gran: 0.3, layers: 1 }); brush.hatch(g, brush.blob(cupX, cupY - 4, 10, 4, { rng: rr, n: 9 }), { rng: rr, spacing: 2.5, a: 0.5, cross: true });
    brush.gouache(g, [[cupX + 28, cupY + 4], [cupX + 48, cupY - 3], [cupX + 50, cupY + 6], [cupX + 30, cupY + 10]], color.dilute(pg('cadYellow'), 0.3), { rng: rr, a: 0.9 });
    // shelf on the right wall with jars
    const sx0 = W * 0.7, sy = H * 0.5;
    brush.ink(g, [[sx0, sy], [sx0 + 200, sy - 4]], { w: 8, a: 0.85, color: color.mix(pal.trunk, pg('ochre'), 0.3), rng: rr, taper: [0, 0], wobble: 0.4 });
    for (let i = 0; i < 4; i++) { const jx = sx0 + 28 + i * 46, jh = 26 + rr() * 14, jw = 18 + rr() * 8; const jar = [[jx - jw / 2, sy - 3], [jx - jw / 2, sy - jh], [jx - jw * 0.3, sy - jh - 5], [jx + jw * 0.3, sy - jh - 5], [jx + jw / 2, sy - jh], [jx + jw / 2, sy - 3]]; brush.wash(g, jar, [pg('cadRed'), pg('ochre'), pg('violet'), pg('sap')][i], { a: 0.6, rng: rr, edge: 0.8, gran: 0.3, layers: 1 }); brush.lift(g, jx - jw * 0.2, sy - jh * 0.6, jw * 0.2, jh * 0.3, { a: 0.5, rng: rr }); brush.ink(g, jar, { w: 1.1, a: 0.65, color: pal.ink, rng: rr, closed: true, wobble: 0.3 }); }
    // the lantern: a glass jar with a candle, hung from a root
    brush.stroke(g, [[lx, H * 0.14], [lx + 2, ly - 32]], { w: 2.2, a: 0.75, color: pg('sepia'), rng: rr });
    brush.glow(g, lx, ly, 460, pal.lampGlow, 0.5); brush.glow(g, lx, ly, 140, pal.lamp, 0.75);
    const jar = [[lx - 17, ly + 26], [lx - 17, ly - 24], [lx - 10, ly - 32], [lx + 10, ly - 32], [lx + 17, ly - 24], [lx + 17, ly + 26]];
    brush.glaze(g, jar, color.dilute(pg('cerulean'), 0.7), 0.3); brush.gouache(g, [[lx - 6, ly + 22], [lx - 6, ly - 2], [lx + 6, ly - 2], [lx + 6, ly + 22]], color.dilute(pg('lemon'), 0.6), { rng: rr, a: 0.95, texture: 0 });
    brush.glaze(g, brush.blob(lx, ly - 9, 4.5, 9, { rng: rr, n: 9 }), pg('cadOrange'), 0.9); brush.glaze(g, brush.blob(lx, ly - 10, 2, 4.5, { rng: rr, n: 9 }), color.dilute(pg('lemon'), 0.8), 1);
    brush.ink(g, jar, { w: 1.3, a: 0.65, color: pal.ink, rng: rr, closed: true, wobble: 0.3 });
    // a rag rug: oval rings of colour with a frayed edge
    const rx0 = W * 0.52, ry0 = floorY + 92, rings = [pg('alizarin'), pg('ochre'), pg('indigo'), pg('sap'), pg('cadRed')];
    for (let k = 0; k < 5; k++) { const t = 1 - k * 0.19; brush.wash(g, brush.blob(rx0, ry0, 130 * t, 30 * t, { rng: rr, wobble: 0.06, n: 22 }), color.mix(rings[k], pg('ochre'), 0.3), { a: 0.5, rng: rr, layers: 1, edge: 0.6, gran: 0.3 }); }
    for (let i = 0; i < 40; i++) { const a = rr() * Math.PI * 2; brush.stroke(g, [[rx0 + Math.cos(a) * 128, ry0 + Math.sin(a) * 29], [rx0 + Math.cos(a) * 140, ry0 + Math.sin(a) * 34]], { w: 1, a: 0.5, color: pg('alizarin'), rng: rr }); }
    // acorns about the floor
    for (let i = 0; i < 6; i++) { const ax = W * (0.2 + 0.6 * rr()), ay = floorY + 24 + rr() * 110; const nut = brush.blob(ax, ay, 7, 9, { rng: rr, n: 9 }); brush.wash(g, nut, color.mix(pg('burntUmber'), pg('ochre'), 0.4), { a: 0.7, rng: rr, edge: 0.8, gran: 0.2, layers: 1 }); brush.wash(g, brush.blob(ax, ay - 5, 7.5, 4, { rng: rr, n: 9 }), pg('sepia'), { a: 0.7, rng: rr, edge: 0.6, gran: 0, layers: 1 }); brush.lift(g, ax - 2, ay, 2, 3, { a: 0.5, rng: rr }); }
    // the far corners fall into darkness so the lantern reads as the light
    const vg = g.createRadialGradient(lx, ly + 120, 260, lx, ly + 120, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(20,14,30,0)'); vg.addColorStop(1, `rgba(20,14,30,${night ? 0.72 : 0.5})`);
    g.save(); g.fillStyle = vg; g.fillRect(0, 0, W, H); g.restore();
  }));
  return {
    layers: L, ownWeather: true,
    draw(g, env, view, t = 0) {
      for (const l of L) layers.blit(g, l, view);
      const k = 0.92 + 0.08 * Math.sin(t * 6.3) + 0.04 * Math.sin(t * 17);
      art.light(g, W * 0.5, H * 0.4, 230, pal.lampGlow, 0.6 * k, { core: 14 });
    },
    enter() { art.compositor.interior = 0.8; }, leave() { art.compositor.interior = 0; },
  };
}
