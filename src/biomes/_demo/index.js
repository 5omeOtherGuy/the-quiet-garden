// _demo (engine): a small test place that touches every engine seam. Reachable only with ?place=_demo.
// It paints with plain Canvas 2D on purpose (the art library is built in parallel); the place workers paint for real.
//
// Seams shown: two still views joined by exits (the meadow and the pond), an instance with a nested instance
// (tree hollow -> cellar) with their ways out, strokes (flowers bloom along a finger over the meadow; leaves let go
// where a finger brushes the autumn crown; ripples sing on the water), taps and holds, regions, two grow layers
// (thousands of flowers and fallen leaves, remembered, fading by themselves), engine.sky (the sun and moon, a cloud
// that rains, a vane that calls the wind), engine.gestures.on, engine.after (the apple grows back, the rabbit comes
// back) and engine.again (the rabbit bolts the first time, later only lifts its ears).

const TAU = Math.PI * 2;
const W = 4000, H = 1000, GROUND = 830;
const GROUND_COL = { spring: '#9cbf68', summer: '#7fa650', autumn: '#c2a05a', winter: '#e3e9ea' };
const CROWN = { spring: '#a9cf78', summer: '#5f8f45', autumn: '#d98c3f', winter: null };
const SKY = { dawn: ['#b9a8d0', '#f4cda8'], day: ['#9cc3dc', '#e4eee8'], dusk: ['#6e5f8c', '#ef9f72'], night: ['#151d33', '#33405f'] };
const PETALS = {
  spring: ['#f3b6c2', '#ffffff', '#f6d36b', '#c7a2d6'], summer: ['#e8604c', '#f2d06b', '#ffffff', '#8fb3e8'],
  autumn: ['#d98c3f', '#c45b39', '#e8c070', '#9a6a9e'], winter: ['#ffffff', '#f4f6fb', '#e6eef7', '#ffffff'],
};
const LEAF = ['#d98c3f', '#c45b39', '#e3b34d', '#a8532f'];
const TREE = { x: 560, y: 330, r: 230 }, HOLLOW = { x: 565, y: 795 }, BURROW = { x: 1530, y: 905 };
const POND = { x: 3000, y: 885, rx: 540, ry: 92 };
const near = (p, x, y, r) => Math.hypot(p.x - x, p.y - y) < r;
const glowAt = (engine, g, x, y, r, col, k, core) => { const a = engine.art; if (a && typeof a.light === 'function') a.light(g, x, y, r, col, k, { core }); };
const sfx = (engine, name, o) => { const a = engine.audio; if (a && a.sfx && a.sfx.play) a.sfx.play(name, o || {}); };
const note = (engine, step, o) => { const a = engine.audio; if (a && typeof a.note === 'function') a.note(step, o || {}); };

// ---- the cellar (nested inside the hollow) ----------------------------------------------------------
const cellar = {
  name: 'The Cellar under the Tree', world: { w: 2000, h: 1000 }, music: { preset: 'cave' },
  exits: [{ x: 1480, y: 120, w: 240, h: 560, out: true }], // the ladder up
  create(engine) {
    let glow = 0, hum = 0;
    const R = engine.rand('cellar');
    const roots = Array.from({ length: 14 }, () => ({ x: R() * 2000, len: 120 + R() * 260, bend: (R() - 0.5) * 120 }));
    return {
      ownWeather: true,
      draw(g, env, view) {
        const gr = g.createLinearGradient(0, 0, 0, 1000);
        gr.addColorStop(0, '#4b392b'); gr.addColorStop(1, '#2c2119');
        g.fillStyle = gr; g.fillRect(0, 0, 2000, 1000);
        g.strokeStyle = '#6b5340'; g.lineCap = 'round';
        for (const r of roots) { g.lineWidth = 9; g.beginPath(); g.moveTo(r.x, 0); g.quadraticCurveTo(r.x + r.bend, r.len * 0.6, r.x + r.bend * 0.5, r.len); g.stroke(); }
        g.fillStyle = '#3a2c22'; g.beginPath(); g.ellipse(1000, 900, 1100, 140, 0, 0, TAU); g.fill();
        // the ladder up and the light at the top
        g.fillStyle = 'rgba(255,236,190,.25)'; g.beginPath(); g.ellipse(1600, 120, 120, 50, 0, 0, TAU); g.fill();
        g.strokeStyle = '#a07c58'; g.lineWidth = 12;
        g.beginPath(); g.moveTo(1550, 130); g.lineTo(1540, 880); g.moveTo(1660, 130); g.lineTo(1670, 880); g.stroke();
        for (let y = 180; y < 880; y += 70) { g.beginPath(); g.moveTo(1545, y); g.lineTo(1665, y); g.stroke(); }
        const k = 0.6 + 0.4 * Math.sin(engine.now() * 1.7) + glow;
        const cg = g.createRadialGradient(900, 700, 0, 900, 700, 260);
        cg.addColorStop(0, `rgba(170,220,255,${0.45 * Math.min(1.5, k)})`); cg.addColorStop(1, 'rgba(170,220,255,0)');
        g.fillStyle = cg; g.fillRect(600, 400, 600, 600);
        glowAt(engine, g, 900, 700, 240, '#aadcff', 0.5 + 0.5 * k, 40);
        g.fillStyle = '#bfe3f7'; g.beginPath(); g.moveTo(900, 560); g.lineTo(960, 700); g.lineTo(900, 820); g.lineTo(840, 700); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(900, 560); g.lineTo(930, 700); g.lineTo(900, 820); g.closePath(); g.fill();
      },
      update(dt) { glow = Math.max(0, glow - dt * 0.8); hum = Math.max(0, hum - dt); },
      tap(p) {
        if (near(p, 900, 690, 130)) {
          glow = 1.2; engine.sparkle(900, 690, 14, 1.4);
          const c = engine.again('crystal', 20);
          sfx(engine, c < 1 ? 'wonder' : 'chime', { vol: 0.5, count: 2 + (c | 0) });
          return true;
        }
        return false;
      },
      stroke(s) {
        if (Math.hypot(s.x - 900, s.y - 690) < 160 && hum <= 0) { hum = 0.2; glow = Math.min(1.4, glow + 0.3); note(engine, 7 + Math.floor(engine.random() * 5), { instrument: 'glass', vol: 0.2 }); return true; }
        return false;
      },
    };
  },
};

// ---- the hollow inside the tree -----------------------------------------------------------------------
const hollow = {
  name: 'Inside the Hollow Tree', world: { w: 2000, h: 1000 }, music: { preset: 'hollow' },
  exits: [
    { x: 250, y: 560, w: 240, h: 380, out: true },   // the round doorway back out to the meadow
    { x: 1250, y: 820, w: 320, h: 160, inst: 'cellar' }, // the hole with the ladder down
  ],
  create(engine) {
    let jar = 0;
    const flies = Array.from({ length: 9 }, (_, i) => ({ a: i * 0.7, r: 10 + i * 3 }));
    return {
      ownWeather: true,
      instances: { cellar },
      draw(g, env, view) {
        g.fillStyle = '#7a5537'; g.fillRect(0, 0, 2000, 1000);
        g.strokeStyle = 'rgba(60,38,22,.35)'; g.lineWidth = 6;
        for (let r = 120; r < 1600; r += 70) { g.beginPath(); g.ellipse(1000, 420, r * 1.3, r * 0.8, 0, 0, TAU); g.stroke(); }
        // the doorway out: the meadow's light and weather seen through it
        const sky = SKY[env.time];
        const sg = g.createLinearGradient(0, 560, 0, 940);
        sg.addColorStop(0, sky[0]); sg.addColorStop(1, GROUND_COL[env.season]);
        g.save(); g.beginPath(); g.ellipse(370, 760, 110, 180, 0, 0, TAU); g.clip();
        g.fillStyle = sg; g.fillRect(250, 560, 240, 400);
        if (env.wet > 0.2) { g.strokeStyle = `rgba(200,220,240,${env.wet * 0.7})`; g.lineWidth = 3; for (let i = 0; i < 16; i++) { const x = 260 + ((i * 37 + engine.now() * 260) % 220), y = 580 + ((i * 71 + engine.now() * 600) % 360); g.beginPath(); g.moveTo(x, y); g.lineTo(x - 6, y + 22); g.stroke(); } }
        if (env.snowy > 0.2) { g.fillStyle = `rgba(255,255,255,${env.snowy})`; for (let i = 0; i < 18; i++) { const x = 260 + ((i * 53 + Math.sin(engine.now() + i) * 20) % 220), y = 580 + ((i * 41 + engine.now() * 50) % 360); g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); } }
        g.restore();
        g.strokeStyle = '#4a3322'; g.lineWidth = 18; g.beginPath(); g.ellipse(370, 760, 110, 180, 0, 0, TAU); g.stroke();
        // floor, shelf and the firefly jar
        g.fillStyle = '#5c3f29'; g.fillRect(0, 880, 2000, 120);
        g.fillRect(800, 520, 420, 22);
        const k = 0.5 + 0.5 * Math.sin(engine.now() * 2) + jar;
        const jg = g.createRadialGradient(1000, 470, 0, 1000, 470, 150);
        jg.addColorStop(0, `rgba(255,236,150,${0.35 * Math.min(1.6, k)})`); jg.addColorStop(1, 'rgba(255,236,150,0)');
        g.fillStyle = jg; g.fillRect(850, 320, 300, 300);
        glowAt(engine, g, 1000, 470, 160, '#fff0a0', 0.4 + 0.4 * k, 20);
        g.fillStyle = 'rgba(220,235,240,.45)'; g.fillRect(960, 420, 80, 100);
        g.strokeStyle = '#4a3b2c'; g.lineWidth = 4; g.strokeRect(960, 420, 80, 100);
        g.fillStyle = '#fff2a8';
        for (const f of flies) { const t = engine.now() * (1 + jar) + f.a; g.beginPath(); g.arc(1000 + Math.cos(t) * f.r * (1 + jar), 470 + Math.sin(t * 1.3) * f.r, 4, 0, TAU); g.fill(); }
        // the hole down to the cellar, with a ladder
        g.fillStyle = '#1e140d'; g.beginPath(); g.ellipse(1410, 900, 150, 50, 0, 0, TAU); g.fill();
        g.strokeStyle = '#a07c58'; g.lineWidth = 10;
        g.beginPath(); g.moveTo(1360, 760); g.lineTo(1370, 930); g.moveTo(1460, 760); g.lineTo(1450, 930); g.stroke();
        for (let y = 790; y < 930; y += 40) { g.beginPath(); g.moveTo(1365, y); g.lineTo(1455, y); g.stroke(); }
      },
      update(dt) { jar = Math.max(0, jar - dt * 0.6); },
      tap(p) {
        if (near(p, 1000, 470, 100)) { jar = 1.5; engine.sparkle(1000, 470, 10, 1.2); sfx(engine, 'twinkle', { vol: 0.5 }); return true; }
        return false;
      },
    };
  },
};

// ---- sprite painters for the grow layers ------------------------------------------------------------------
function flowerPainter(env) {
  return (g, w, h, v) => {
    const cols = PETALS[env.season] || PETALS.summer;
    const kind = v % 4, col = cols[v % cols.length];
    g.lineCap = 'round';
    g.strokeStyle = env.season === 'winter' ? '#8fa08a' : '#5f8a45'; g.lineWidth = 2.2;
    const bend = (v % 3 - 1) * 5;
    g.beginPath(); g.moveTo(w / 2, h); g.quadraticCurveTo(w / 2 + bend, h * 0.6, w / 2 + bend * 0.6, h * 0.35); g.stroke();
    g.fillStyle = '#6f9a4c'; g.beginPath(); g.ellipse(w / 2 - 5, h * 0.72, 6, 2.6, -0.6, 0, TAU); g.fill();
    const cx = w / 2 + bend * 0.6, cy = h * 0.32;
    g.fillStyle = col;
    if (kind === 0) { for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; g.beginPath(); g.ellipse(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 5.5, 3, a, 0, TAU); g.fill(); } g.fillStyle = '#f2c94c'; g.beginPath(); g.arc(cx, cy, 3.4, 0, TAU); g.fill(); }
    else if (kind === 1) { g.beginPath(); g.arc(cx, cy, 8, 0, TAU); g.fill(); g.fillStyle = 'rgba(60,30,30,.6)'; g.beginPath(); g.arc(cx, cy, 2.6, 0, TAU); g.fill(); }
    else if (kind === 2) { g.beginPath(); g.moveTo(cx - 6, cy - 4); g.quadraticCurveTo(cx, cy + 12, cx + 6, cy - 4); g.quadraticCurveTo(cx, cy - 1, cx - 6, cy - 4); g.fill(); }
    else { for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(cx + (i - 2) * 3, cy - Math.abs(i - 2) * 2, 3.2, 0, TAU); g.fill(); } }
  };
}
function leafPainter(g, w, h, v) {
  g.fillStyle = LEAF[v % 4];
  g.beginPath(); g.moveTo(w / 2, 1); g.quadraticCurveTo(w, h / 2, w / 2, h - 1); g.quadraticCurveTo(0, h / 2, w / 2, 1); g.fill();
  g.strokeStyle = 'rgba(90,50,20,.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(w / 2, 2); g.lineTo(w / 2, h - 2); g.stroke();
}

// ---- the place ---------------------------------------------------------------------------------------------
export default {
  id: '_demo',
  name: 'The Demo Garden',
  color: '#b58fc4',
  world: { w: W, h: H },
  views: {
    meadow: { x: 0, y: 0, w: 2000, h: 1000 },
    pond: { x: 2000, y: 0, w: 2000, h: 1000 },
  },
  exits: [
    { in: 'meadow', poly: [[1600, 840], [1800, 820], [1820, 1000], [1560, 1000]], view: 'pond' }, // the path on
    { in: 'pond', poly: [[2200, 820], [2400, 840], [2440, 1000], [2180, 1000]], view: 'meadow' }, // and back
    { in: 'pond', x: 3600, y: 780, w: 200, h: 220, to: '_painted', view: 'oak', mode: 'slide', dir: 1 }, // on to the painted meadow
    { in: 'meadow', x: HOLLOW.x - 60, y: HOLLOW.y - 75, w: 120, h: 150, inst: 'hollow' },         // the hollow
  ],
  regions: [
    { name: 'sky', x: 0, y: 0, w: W, h: 700 },
    { name: 'meadow', poly: [[0, 815], [2000, 805], [2000, 1000], [0, 1000]], view: 'meadow' },
    { name: 'bank', poly: [[2000, 805], [4000, 815], [4000, 1000], [2000, 1000]], view: 'pond' },
    { name: 'trunk', x: 460, y: 460, w: 220, h: 400 },
    { name: 'crown', x: TREE.x, y: TREE.y, r: TREE.r + 20 },
  ],
  music: { preset: 'meadow' },
  create(engine) {
    const R = engine.rand('demo');
    let land = null, landScale = 1;
    const lamp = { on: engine.save.get('lamp', false), k: 0 };
    let vaneSpin = 0, starWink = 0, moonflower = 0, cloudRain = 0, ripple = [];
    // the water is a region too (an ellipse as a polygon)
    engine.regions.add('water', { poly: Array.from({ length: 24 }, (_, i) => [POND.x + Math.cos((i / 24) * TAU) * POND.rx, POND.y + Math.sin((i / 24) * TAU) * POND.ry]) }, { view: 'pond' });

    // flowers along the strokes, remembered; the owner's rule thins them by itself (docs/ENGINE.md "Grow layers")
    const bloom = engine.grow({
      max: 120, keep: 20, remember: 'bloom', life: [180, 420], grow: 0.42, wilt: 2.6,
      kinds: { flower: { w: 30, h: 52, ax: 0.5, ay: 1, variants: 8, scale: 1.5, paint: (g, w, h, v) => flowerPainter(engine.env)(g, w, h, v) } },
    });
    // leaves that let go of the autumn crown, fall, lie on the grass and fade
    const leaves = engine.grow({
      max: 120, keep: 20, remember: 'leaves', life: [90, 200], grow: 0.01, wilt: 3,
      kinds: { leaf: { w: 18, h: 26, ax: 0.5, ay: 0.5, variants: 4, scale: 1.3, paint: leafPainter } },
      look: () => 'leaf',
    });
    const fingers = new Map(); // per finger: distance since the last bloom, the next note
    let noteT = 0;

    // the apple: tap it and it falls; after a while it fades and a new one grows on the tree
    const apple = { state: engine.save.get('apple', 'hang'), x: 650, y: 400, vy: 0, grow: 1, lie: 0 };
    if (apple.state !== 'hang') { apple.state = 'grow'; apple.grow = 0; }

    // the rabbit lives its own life: grazes, hops, hides from rain, sleeps at night
    const rabbit = { x: 1100, y: 900, tx: 1100, dir: 1, hop: 0, state: 'graze', t: 2, ears: 0, look: 0, away: false };
    // the duck paddles on the pond
    const duck = { x: 2700, dir: 1, speed: 26, dive: 0, quack: 0 };
    let frogJump = 0;

    // a swirl over the pond view makes ripples run (the engine still makes its wind)
    engine.gestures.on('swirl', (e) => { if (engine.view === 'pond' && e.phase === 'move' && Math.random() < 0.15) ripple.push({ x: POND.x + (engine.random() - 0.5) * POND.rx, y: POND.y + (engine.random() - 0.5) * POND.ry * 0.8, t: 0, k: 0.5 }); });

    function paintLand(env) {
      const s = Math.min(0.8, engine.pxPerUnit * 0.75);
      if (!land) land = document.createElement('canvas');
      land.width = Math.ceil(W * s); land.height = Math.ceil(H * s); landScale = s;
      const g = land.getContext('2d');
      g.setTransform(s, 0, 0, s, 0, 0);
      const night = env.time === 'night';
      const hills = (base, amp, col, alpha, seed) => {
        const r = engine.rand(seed), ph = [r() * TAU, r() * TAU, r() * TAU];
        g.globalAlpha = alpha; g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
        for (let x = 0; x <= W; x += 30) g.lineTo(x, base - amp * (Math.sin(x / 520 + ph[0]) * 0.5 + Math.sin(x / 230 + ph[1]) * 0.3 + Math.sin(x / 90 + ph[2]) * 0.08));
        g.lineTo(W, H); g.closePath(); g.fill(); g.globalAlpha = 1;
      };
      hills(640, 110, night ? '#2c3650' : '#9fb4c0', 0.7, 'h1');
      hills(730, 70, night ? '#2b3a3a' : env.season === 'winter' ? '#cfd8dc' : '#88a777', 0.85, 'h2');
      hills(GROUND, 26, GROUND_COL[env.season], 1, 'h3');
      g.fillStyle = GROUND_COL[env.season]; g.fillRect(0, GROUND, W, H - GROUND);
      // the path between the views
      g.fillStyle = 'rgba(190,160,112,.55)';
      g.beginPath(); g.moveTo(1560, 1000); g.quadraticCurveTo(1700, 900, 2000, 850); g.quadraticCurveTo(2300, 900, 2440, 1000); g.closePath(); g.fill();
      // the hollow tree
      g.fillStyle = '#6e4e34'; g.beginPath(); g.moveTo(470, 840); g.quadraticCurveTo(500, 640, 510, 470); g.lineTo(620, 470); g.quadraticCurveTo(630, 640, 670, 840); g.closePath(); g.fill();
      if (CROWN[env.season]) {
        g.fillStyle = CROWN[env.season];
        for (const [x, y, r] of [[560, 360, 200], [440, 420, 130], [690, 420, 140], [560, 250, 140]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      } else {
        g.strokeStyle = '#5b4632'; g.lineWidth = 16; g.lineCap = 'round';
        for (const [x, y] of [[400, 250], [720, 240], [560, 180], [460, 340], [660, 330]]) { g.beginPath(); g.moveTo(560, 490); g.quadraticCurveTo((560 + x) / 2, (490 + y) / 2 - 30, x, y); g.stroke(); }
      }
      g.fillStyle = '#2d1d12'; g.beginPath(); g.ellipse(HOLLOW.x, HOLLOW.y, 46, 60, 0, 0, TAU); g.fill();
      g.strokeStyle = '#a07c58'; g.lineWidth = 8; g.beginPath(); g.ellipse(HOLLOW.x, HOLLOW.y, 50, 64, 0, Math.PI, TAU); g.stroke();
      // the rabbit's burrow
      g.fillStyle = '#3a2a1c'; g.beginPath(); g.ellipse(BURROW.x, BURROW.y, 44, 20, 0, 0, TAU); g.fill();
      // the pond, its lily pads and reeds
      g.fillStyle = env.season === 'winter' ? '#d3e4ec' : '#7fb0c0'; g.beginPath(); g.ellipse(POND.x, POND.y, POND.rx, POND.ry, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(POND.x - 120, POND.y - 30, POND.rx * 0.6, 18, 0, 0, TAU); g.fill();
      if (env.season !== 'winter') { g.fillStyle = '#6f9a4c'; for (const [x, y] of [[2750, 875], [3180, 900], [3320, 868]]) { g.beginPath(); g.ellipse(x, y, 34, 11, 0, 0.3, TAU - 0.1); g.fill(); } }
      g.strokeStyle = env.season === 'winter' ? '#a39a7e' : '#5f7f3e'; g.lineWidth = 5; g.lineCap = 'round';
      for (let i = 0; i < 26; i++) { const x = 3470 + i * 9 + R() * 6, hh = 70 + R() * 70; g.beginPath(); g.moveTo(x, 900); g.quadraticCurveTo(x + 6, 900 - hh * 0.6, x + (R() - 0.5) * 20, 900 - hh); g.stroke(); }
    }

    function bloomAt(x, y, s, f) {
      if (bloom.near(x, y, 16) > 2) return false;
      const sc = 0.75 + Math.min(0.6, 240 / (s.speed + 200)) * 0.8 + engine.random() * 0.2; // slow fingers grow bigger flowers
      bloom.add('flower', x + (engine.random() - 0.5) * 26, y + (engine.random() - 0.3) * 18, { scale: sc, delay: engine.random() * 0.08 });
      if (engine.now() - f.noteT > 0.09) { // the trail sings as it blooms
        f.noteT = engine.now(); f.step = (f.step + (s.dx > 0 ? 1 : -1) + 15) % 15;
        note(engine, f.step - 3, { instrument: engine.env.season === 'winter' ? 'glass' : 'kalimba', vol: 0.11, x });
      }
      return true;
    }

    return {
      instances: { hollow },
      build(env) { paintLand(env); },
      free() { if (land) { land.width = land.height = 0; land = null; } },
      onEnv(next, prev) {
        if (next.weather === 'storm' && prev.weather !== 'storm') engine.camera.shake(6);
        if (next.season === 'winter' && prev.season !== 'winter') bloom.wiltAll(0.7); // the first frost
      },
      update(dt, env, t) {
        vaneSpin = Math.max(0, vaneSpin - dt * 1.5); starWink = Math.max(0, starWink - dt); moonflower = Math.max(0, moonflower - dt * 0.5);
        frogJump = Math.max(0, frogJump - dt * 2); cloudRain = Math.max(0, cloudRain - dt);
        lamp.k += ((lamp.on ? 1 : 0) - lamp.k) * Math.min(1, dt * 4);
        for (let i = ripple.length - 1; i >= 0; i--) { ripple[i].t += dt; if (ripple[i].t > 2.2) ripple.splice(i, 1); }
        // the apple
        if (apple.state === 'fall') {
          apple.vy += 1400 * dt; apple.y += apple.vy * dt; apple.x += 40 * dt;
          if (apple.y > 900) { apple.y = 900; apple.vy *= -0.35; if (Math.abs(apple.vy) < 60) { apple.state = 'lie'; apple.lie = 0; sfx(engine, 'tok', { vol: 0.4, count: 1 }); } }
        } else if (apple.state === 'lie') {
          apple.lie += dt;
          if (apple.lie > 34) { apple.state = 'grow'; apple.grow = 0; apple.x = 650; apple.y = 400; apple.vy = 0; } // a new one grows
        } else if (apple.state === 'grow') {
          apple.grow = Math.min(1, apple.grow + dt / 6);
          if (apple.grow >= 1) { apple.state = 'hang'; engine.save.set('apple', 'hang'); }
        }
        // the rabbit's own life
        const rb = rabbit;
        rb.t -= dt; rb.ears = Math.max(0, rb.ears - dt * 2); rb.look = Math.max(0, rb.look - dt);
        const wantHide = env.wet > 0.45 || env.snowy > 0.6;
        if (!rb.away) {
          if (wantHide && rb.state !== 'home') { rb.state = 'run'; rb.tx = BURROW.x; }
          else if (env.time === 'night' && rb.state !== 'sleep' && rb.state !== 'run' && rb.state !== 'home') { rb.state = 'run'; rb.tx = BURROW.x - 60; rb.toSleep = true; }
          if (rb.state === 'graze' && rb.t <= 0) { rb.state = 'hop'; rb.tx = 820 + engine.random() * 640; rb.t = 0; }
          if (rb.state === 'hop' || rb.state === 'run') {
            const sp = rb.state === 'run' ? 420 : 120, d = rb.tx - rb.x;
            rb.dir = d > 0 ? 1 : -1; rb.hop += dt * (rb.state === 'run' ? 9 : 5);
            if (Math.abs(d) < sp * dt) {
              rb.x = rb.tx; rb.hop = 0;
              if (rb.state === 'run' && (wantHide || rb.bolting)) { rb.state = 'home'; rb.away = true; rb.bolting = false; engine.after(10 + engine.random() * 12, () => { rabbit.away = false; rabbit.state = 'graze'; rabbit.t = 1; rabbit.x = BURROW.x; }); }
              else if (rb.toSleep) { rb.state = 'sleep'; rb.toSleep = false; }
              else { rb.state = 'graze'; rb.t = 2 + engine.random() * 4; }
            } else rb.x += rb.dir * sp * dt;
          }
          if (rb.state === 'sleep' && env.time !== 'night') { rb.state = 'graze'; rb.t = 1; }
        }
        // the duck
        duck.quack = Math.max(0, duck.quack - dt);
        if (duck.dive > 0) { duck.dive -= dt; if (duck.dive <= 0) { duck.x = POND.x + (engine.random() - 0.5) * POND.rx; sfx(engine, 'bubble', { vol: 0.4, count: 3 }); } }
        else { duck.x += duck.dir * duck.speed * dt; duck.speed += (26 - duck.speed) * dt * 0.5; if (duck.x > POND.x + POND.rx * 0.7) duck.dir = -1; if (duck.x < POND.x - POND.rx * 0.7) duck.dir = 1; }
      },
      draw(g, env, view) {
        const t = engine.now();
        // sky, stars, the moon and the sun (where engine.sky keeps them), a cloud
        const sky = SKY[env.time];
        const gr = g.createLinearGradient(0, view.y, 0, view.y + view.h * 0.7);
        gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]);
        g.fillStyle = gr; g.fillRect(view.x, view.y, view.w, view.h);
        if (env.light < 0.4) {
          g.fillStyle = '#fff6d8';
          const a = Math.min(1, (0.4 - env.light) * 4);
          for (let i = 0; i < 70; i++) { const x = view.x + ((i * 397) % 1000) / 1000 * view.w, y = view.y + ((i * 613) % 1000) / 1000 * 560; g.globalAlpha = a * (0.4 + 0.5 * Math.abs(Math.sin(t * 0.7 + i))); g.fillRect(x, y, 2.4, 2.4); }
          g.globalAlpha = 1;
        }
        const m = engine.sky.moon(view);
        if (m.up > -0.1) { g.fillStyle = '#f4ecc8'; g.beginPath(); g.arc(m.x, m.y, m.r, 0, TAU); g.fill(); glowAt(engine, g, m.x, m.y, m.r * 3, '#f4ecc8', 0.35, m.r); }
        const sn = engine.sky.sun(view);
        if (sn.up > -0.1) { g.globalAlpha = 1 - 0.75 * Math.max(env.wet, env.foggy, env.snowy); g.fillStyle = '#f6d36b'; g.beginPath(); g.arc(sn.x, sn.y, sn.r, 0, TAU); g.fill(); g.globalAlpha = 1; }
        const cx = 1300 + Math.sin(t * 0.05) * 160, night = env.time === 'night';
        g.fillStyle = night ? 'rgba(120,130,160,.85)' : `rgba(255,255,255,${0.9 - cloudRain * 0.2})`;
        for (const [x, y, r] of [[-90, 150, 80], [-10, 120, 100], [80, 150, 80], [0, 175, 90]]) { g.beginPath(); g.arc(cx + x, y + cloudRain * 6, r, 0, TAU); g.fill(); }
        if (night) {
          const sk = Math.min(1, 0.5 + 0.4 * Math.sin(t * 3) + starWink);
          g.fillStyle = `rgba(242,201,76,${sk})`; g.beginPath();
          for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, r = (i % 2 ? 12 : 28) * (1 + starWink * 0.5); g.lineTo(cx + Math.cos(a) * r, 92 + Math.sin(a) * r); }
          g.fill(); if (starWink > 0) glowAt(engine, g, cx, 92, 90, '#f2c94c', starWink, 20);
        }
        if (land) g.drawImage(land, 0, 0, W, H);
        // what was grown, and leaves on the grass
        leaves.draw(g, view);
        bloom.draw(g, view);
        // the apple
        if (CROWN[env.season] && env.season !== 'autumn' || apple.state !== 'hang') {
          const k = apple.state === 'grow' ? apple.grow : 1, a = apple.state === 'lie' ? Math.max(0, 1 - Math.max(0, apple.lie - 30) / 4) : 1;
          g.globalAlpha = a;
          g.fillStyle = k < 0.5 ? '#f6e1e6' : '#c8463a';
          g.beginPath(); g.arc(apple.x, apple.y, 9 + 11 * k, 0, TAU); g.fill();
          g.globalAlpha = 1;
        }
        // the rabbit
        if (!rabbit.away) {
          const rb = rabbit, hy = -Math.abs(Math.sin(rb.hop * Math.PI)) * (rb.state === 'run' ? 36 : 18), sleep = rb.state === 'sleep';
          g.fillStyle = '#b5a08a';
          g.beginPath(); g.ellipse(rb.x, rb.y - 18 + hy, 30, sleep ? 16 : 20, 0, 0, TAU); g.fill();
          g.beginPath(); g.arc(rb.x + rb.dir * 24, rb.y - 34 + hy + (sleep ? 12 : 0), 14, 0, TAU); g.fill();
          const ear = (rb.ears > 0 ? Math.sin(rb.ears * 30) * 0.3 : 0) + (rb.look > 0 ? -0.35 : 0) + (sleep ? 1.1 : 0);
          for (const e of [0, 1]) { g.save(); g.translate(rb.x + rb.dir * (20 + e * 6), rb.y - 44 + hy + (sleep ? 12 : 0)); g.rotate((-0.2 - e * 0.15 + ear) * rb.dir); g.beginPath(); g.ellipse(0, -16, 5, 17, 0, 0, TAU); g.fill(); g.restore(); }
          g.fillStyle = '#fff'; g.beginPath(); g.arc(rb.x - rb.dir * 28, rb.y - 20 + hy, 7, 0, TAU); g.fill();
          if (!sleep) { g.fillStyle = '#2a2018'; g.beginPath(); g.arc(rb.x + rb.dir * 30, rb.y - 37 + hy, 2.4, 0, TAU); g.fill(); }
        }
        // the lantern post
        g.fillStyle = '#4a3b2c'; g.fillRect(1174, 650, 12, 230); g.fillRect(1150, 640, 60, 10);
        if (lamp.k > 0.01) {
          const k = lamp.k * (0.5 + 0.5 * (1 - env.light));
          const lg = g.createRadialGradient(1180, 680, 0, 1180, 680, 260);
          lg.addColorStop(0, `rgba(255,220,140,${0.7 * k})`); lg.addColorStop(1, 'rgba(255,220,140,0)');
          g.fillStyle = lg; g.fillRect(920, 420, 520, 520);
          glowAt(engine, g, 1180, 680, 300, '#ffd88a', lamp.k * (0.4 + 1.0 * (1 - env.light)), 34);
        }
        g.fillStyle = lamp.on ? '#ffe7a3' : 'rgba(220,230,235,.6)'; g.fillRect(1160, 655, 40, 50);
        g.strokeStyle = '#4a3b2c'; g.lineWidth = 4; g.strokeRect(1160, 655, 40, 50);
        // the moonflower opens in the dark
        const open = Math.max(0, Math.min(1, (0.35 - env.light) * 3)) * (1 + moonflower * 0.3);
        g.strokeStyle = '#5f8a45'; g.lineWidth = 6; g.beginPath(); g.moveTo(1420, 880); g.quadraticCurveTo(1410, 820, 1420, 780); g.stroke();
        g.fillStyle = '#f6f1ff';
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3 + moonflower; g.beginPath(); g.ellipse(1420 + Math.cos(a) * 18 * open, 770 + Math.sin(a) * 18 * open, 8 + 14 * open, 7, a, 0, TAU); g.fill(); }
        if (open > 0.1) glowAt(engine, g, 1420, 770, 90 + moonflower * 60, '#f4eeff', open * 0.7 + moonflower, 14);
        // the weather vane: tap it and the wind comes
        g.strokeStyle = '#4a3b2c'; g.lineWidth = 8; g.beginPath(); g.moveTo(300, 880); g.lineTo(300, 600); g.stroke();
        const va = vaneSpin * 14 + Math.sin(t * 0.8) * (0.1 + env.windy * 0.8) + (env.windy > 0.4 ? t * env.windy * 3 : 0);
        g.save(); g.translate(300, 600); g.scale(Math.cos(va), 1);
        g.fillStyle = '#b8483e'; g.beginPath(); g.moveTo(-70, -10); g.lineTo(50, -10); g.lineTo(70, 0); g.lineTo(50, 10); g.lineTo(-70, 10); g.lineTo(-55, 0); g.closePath(); g.fill();
        g.restore();
        // the pond view: ripples, the frog in the rain, the duck, the snowman in winter
        if (view.x + view.w > 2000) {
          g.strokeStyle = 'rgba(255,255,255,.7)';
          for (const r of ripple) { const k = r.t / 2.2; g.globalAlpha = (1 - k) * 0.8 * r.k + 0.1; g.lineWidth = 2.5; g.beginPath(); g.ellipse(r.x, r.y, 10 + k * 90 * (0.6 + r.k), (10 + k * 90 * (0.6 + r.k)) * 0.3, 0, 0, TAU); g.stroke(); }
          g.globalAlpha = 1;
          if (env.wet > 0.4 && env.season !== 'winter') {
            const y = 870 - Math.sin(frogJump * Math.PI) * 80;
            g.globalAlpha = Math.min(1, (env.wet - 0.4) * 3);
            g.fillStyle = '#6fa04e'; g.beginPath(); g.ellipse(2750, y, 36, 22, 0, 0, TAU); g.fill();
            g.beginPath(); g.arc(2736, y - 20, 9, 0, TAU); g.arc(2764, y - 20, 9, 0, TAU); g.fill();
            g.fillStyle = '#222'; g.beginPath(); g.arc(2736, y - 21, 3.5, 0, TAU); g.arc(2764, y - 21, 3.5, 0, TAU); g.fill();
            g.globalAlpha = 1;
          }
          if (duck.dive <= 0 && env.season !== 'winter') {
            const bob = Math.sin(t * 2.4) * 3;
            g.fillStyle = '#f2f0e8'; g.beginPath(); g.ellipse(duck.x, 868 + bob, 34, 16, 0, 0, TAU); g.fill();
            g.beginPath(); g.arc(duck.x + duck.dir * 26, 848 + bob - duck.quack * 8, 12, 0, TAU); g.fill();
            g.fillStyle = '#e8a43a'; g.beginPath(); g.moveTo(duck.x + duck.dir * 36, 846 + bob - duck.quack * 8); g.lineTo(duck.x + duck.dir * (50 + duck.quack * 6), 850 + bob - duck.quack * 8); g.lineTo(duck.x + duck.dir * 36, 853 + bob - duck.quack * 8); g.fill();
          }
          if (env.season === 'winter') {
            g.fillStyle = '#fbfbf8';
            g.beginPath(); g.arc(3600, 860, 55, 0, TAU); g.fill(); g.beginPath(); g.arc(3600, 780, 38, 0, TAU); g.fill();
            g.fillStyle = '#e07a3a'; g.beginPath(); g.moveTo(3600, 780); g.lineTo(3630, 786); g.lineTo(3600, 790); g.fill();
            g.fillStyle = '#333'; g.beginPath(); g.arc(3590, 770, 4, 0, TAU); g.arc(3610, 770, 4, 0, TAU); g.fill();
          }
        }
        // snow settles and melts with env.snowy
        if (env.snowy > 0.02) { g.globalAlpha = env.snowy * 0.75; g.fillStyle = '#f7f9fa'; g.fillRect(view.x, GROUND - 4, view.w, H - GROUND + 4); g.globalAlpha = 1; }
      },
      tap(p) {
        const env = engine.env;
        if (apple.state === 'hang' && CROWN[env.season] && env.season !== 'autumn' && near(p, apple.x, apple.y, 60)) {
          apple.state = 'fall'; apple.vy = 0; engine.save.set('apple', 'fallen'); sfx(engine, 'rustle', { vol: 0.5, count: 4 });
          return true;
        }
        if (near(p, 1180, 680, 70)) {
          lamp.on = !lamp.on; engine.save.set('lamp', lamp.on);
          engine.sparkle(1180, 680, lamp.on ? 10 : 3); sfx(engine, lamp.on ? 'twinkle' : 'tok', { vol: 0.5, count: 1 });
          return true;
        }
        if (!rabbit.away && Math.abs(p.x - rabbit.x) < 70 && Math.abs(p.y - (rabbit.y - 25)) < 60) {
          const rb = rabbit;
          if (rb.state === 'sleep') { sfx(engine, 'snore', { vol: 0.4 }); rb.ears = 0.4; return true; }
          const c = engine.again('rabbit', 45) + engine.random() * 0.4; // the same touch never plays back the same way
          if (c < 0.6) { rb.state = 'run'; rb.bolting = true; rb.tx = BURROW.x; sfx(engine, 'startle', { vol: 0.4 }); }
          else if (c < 1.8) { rb.look = 1.2; rb.state = 'graze'; rb.t = 2; sfx(engine, 'sniff', { vol: 0.4 }); }
          else { rb.ears = 0.5; sfx(engine, 'squeak', { vol: 0.25, pitch: 1.3 }); }
          return true;
        }
        if (near(p, 300, 600, 110)) { vaneSpin = 1; engine.sky.wind(0.6, { x: 300, y: 600 }); sfx(engine, 'creak', { vol: 0.4 }); return true; }
        if (near(p, 1300 + Math.sin(engine.now() * 0.05) * 160, 150, 150)) {
          if (env.time === 'night' && near(p, 1300 + Math.sin(engine.now() * 0.05) * 160, 92, 60)) { starWink = 1; engine.sparkle(p.x, 92, 12); sfx(engine, 'sparkle', { vol: 0.5 }); return true; }
          cloudRain = 1; engine.sky.rain(0.18, { x: p.x, y: p.y }); sfx(engine, 'drip', { vol: 0.6, count: 3 });
          return true;
        }
        if (env.light < 0.35 && near(p, 1420, 775, 80)) { moonflower = 1; engine.sparkle(1420, 770, 10); sfx(engine, 'chime', { vol: 0.5 }); return true; }
        // the pond view
        if (env.wet > 0.4 && env.season !== 'winter' && near(p, 2750, 870, 70)) { frogJump = 1; sfx(engine, 'ribbit', { vol: 0.6 }); return true; }
        if (duck.dive <= 0 && env.season !== 'winter' && near(p, duck.x, 860, 60)) {
          const c = engine.again('duck', 30);
          if (c < 1.2) { duck.dir *= -1; duck.speed = 160; duck.quack = 0.5; sfx(engine, 'quack', { vol: 0.6 }); }
          else { duck.dive = 2.5 + engine.random() * 2; sfx(engine, 'splash', { vol: 0.4 }); ripple.push({ x: duck.x, y: 870, t: 0, k: 1 }); }
          return true;
        }
        if (env.season === 'winter' && near(p, 3600, 830, 90)) { engine.sparkle(3600, 800, 8); sfx(engine, 'crunch', { vol: 0.5 }); return true; }
        if (p.over === 'water') {
          ripple.push({ x: p.x, y: p.y, t: 0, k: 1 });
          sfx(engine, env.season === 'winter' ? 'tok' : 'plop', { vol: 0.5, count: 1 });
          return true;
        }
        if (p.over === 'meadow' || p.over === 'bank') { // one tap, one flower
          bloom.add('flower', p.x, p.y + 6, { scale: 1.2 + engine.random() * 0.3 });
          note(engine, Math.floor(engine.random() * 8), { instrument: 'kalimba', vol: 0.14, x: p.x });
          return true;
        }
        return false;
      },
      hold(p) {
        if (p.over === 'meadow' || p.over === 'bank') { // a resting finger: a little ring of flowers opens around it
          for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + engine.random(); bloom.add('flower', p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 12, { scale: 1, delay: i * 0.07 }); }
          engine.audio && engine.audio.chord && engine.audio.chord([0, 2, 4], { instrument: 'kalimba', vol: 0.18 });
          return true;
        }
        return false;
      },
      stroke(s) {
        const env = engine.env;
        let f = fingers.get(s.id);
        if (!f || s.phase === 'begin') { f = { acc: 0, lx: s.points[0] ? s.points[0].x : s.x, ly: s.points[0] ? s.points[0].y : s.y, noteT: 0, step: 4 }; fingers.set(s.id, f); }
        if (s.phase === 'end') { fingers.delete(s.id); return false; }
        let answered = false;
        for (let i = 0; i < s.n; i++) {
          const q = s.points[i], d = Math.hypot(q.x - f.lx, q.y - f.ly);
          const over = engine.regions.at(q.x, q.y);
          if (over === 'meadow' || over === 'bank') {
            f.acc += d; answered = true;
            while (f.acc > 24) { f.acc -= 24; bloomAt(q.x, q.y, s, f); }
          } else if (over === 'crown' && env.season === 'autumn') {
            answered = true; f.acc += d;
            if (f.acc > 30) {
              f.acc = 0;
              leaves.add('leaf', q.x + (engine.random() - 0.5) * 30, q.y, { fall: { to: 860 + engine.random() * 120, vx: s.dx * 60 }, scale: 0.8 + engine.random() * 0.5 });
              if (engine.now() - f.noteT > 0.12) { f.noteT = engine.now(); sfx(engine, 'rustle', { vol: 0.35, count: 2 }); note(engine, 5 + Math.floor(engine.random() * 6), { instrument: 'pluck', vol: 0.08 }); }
            }
          } else if (over === 'crown') {
            answered = true;
            if (engine.now() - f.noteT > 0.2) { f.noteT = engine.now(); sfx(engine, 'rustle', { vol: 0.3, count: 3 }); }
          } else if (over === 'water') {
            answered = true; f.acc += d;
            if (f.acc > 70) { f.acc = 0; ripple.push({ x: q.x, y: q.y, t: 0, k: Math.min(1, s.speed / 900) }); if (ripple.length > 40) ripple.shift(); if (engine.now() - f.noteT > 0.14) { f.noteT = engine.now(); note(engine, 4 + Math.floor((q.x - POND.x + POND.rx) / (POND.rx * 2) * 8), { instrument: env.season === 'winter' ? 'glass' : 'water', vol: 0.16, x: q.x }); } }
          }
          f.lx = q.x; f.ly = q.y;
        }
        return answered;
      },
    };
  },
};
