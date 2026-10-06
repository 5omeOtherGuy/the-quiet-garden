// Inside the beehive (painted view `hive`): a wall of honeycomb with warm light through the wax. Plain to find:
// the hive by the pond. The comb is a honey harp: a finger across it lights the cells it passes, each with a note
// (higher up the comb, higher notes), and the light fades again. Bees crawl over the comb living their own lives.
//   tap a bee        it whirrs its wings and scurries off
//   tap the queen    a dancer near her does the waggle dance (the figure of eight that tells the others where the
//                    flowers are), humming
//   hold             the bees come to the hand and hum together
//   winter           the bees keep warm in one round cluster in the middle, hardly moving; strokes over the cluster
//                    warm it, it glows and hums deeper
//   night            the bees rest; the comb glows faintly
//   the entrance     at the bottom, the bright slit: back out to the meadow
import { inside } from './inside.js';

const TAU = Math.PI * 2;
export const COMB = {
  exit: { x: 300, y: 760, w: 480, h: 120 },
  area: { x0: 230, x1: 1790, y0: 80, y1: 760 },        // where the comb is (bees crawl here)
  entrance: { x: 540, y: 815 },
};

export default inside({
  name: 'Inside the Beehive',
  view: 'hive',
  music: { preset: 'hive' },
  exits: [{ x: COMB.exit.x, y: COMB.exit.y, w: COMB.exit.w, h: COMB.exit.h, out: true }],
  interior: 1,
  create(engine) {
    const art = engine.art, fx = art.fx, A = engine.audio || {};
    const R = () => engine.random();
    const note = (s, o) => { if (A.note) A.note(s, o || {}); };
    const sfx = (n, o) => { if (A.sfx && A.sfx.play) A.sfx.play(n, o || {}); };
    const env = engine.env;
    const cells = [];                    // lit cells {x, y, t0, k}
    const bees = [];                     // {x, y, a (heading), v, turn, rest, pose, buzz, dance}
    let P = null, queen = null, call = null, warm = 0, last = 0, dancer = null;
    const ar = COMB.area;
    const inComb = (x, y) => x > ar.x0 && x < ar.x1 && y > ar.y0 && y < ar.y1;
    const HEX = 64;                      // cell spacing (world units)
    const cellOf = (x, y) => { const r = Math.round(y / (HEX * 0.87)), cx = Math.round((x - (r & 1 ? HEX / 2 : 0)) / HEX); return [cx * HEX + (r & 1 ? HEX / 2 : 0), r * HEX * 0.87]; };

    function poseImg(name, i) { const d = P && P.man.sprites[name]; if (!d) return null; const p = d.poses[i % d.poses.length]; return p && p.img ? { p, h: d.h } : null; }
    function drawPiece(g, name, i, x, y, a, s, alpha = 1) {
      const q = poseImg(name, i); if (!q) return false; const { p } = q, k = (q.h * s) / p.h, w = p.w * k, h = p.h * k;
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); g.globalAlpha = alpha;
      g.drawImage(p.img, p.x || 0, p.y || 0, p.w, p.h, -w / 2, -h / 2, w, h); g.restore(); return true;
    }
    function light(x, y, k = 1) { const [cx, cy] = cellOf(x, y); const c = cells.find((q) => q.x === cx && q.y === cy); if (c) { c.t0 = engine.now(); c.k = Math.min(1.4, c.k + 0.3 * k); return false; } cells.push({ x: cx, y: cy, t0: engine.now(), k }); if (cells.length > 160) cells.shift(); return true; }

    return {
      setup(p) {
        P = p; p.show('hive');
        bees.length = 0;
        const w0 = env.season === 'winter';
        for (let i = 0; i < 22; i++) bees.push({ x: w0 ? 1000 + Math.cos(i * 2.4) * (60 + (i % 4) * 34) : ar.x0 + 100 + R() * (ar.x1 - ar.x0 - 200), y: w0 ? 450 + Math.sin(i * 2.4) * (60 + (i % 4) * 34) : ar.y0 + 60 + R() * (ar.y1 - ar.y0 - 120), a: R() * TAU, v: 0, turn: 0, rest: R() * 3, pose: i % 3, buzz: 0, seed: R() * 100 });
        queen = { x: 1000, y: 470, a: -1.2, v: 0, rest: 0, seed: 7 };
      },
      closed() { P = null; },
      tap(pt) {
        if (queen && Math.hypot(pt.x - queen.x, pt.y - queen.y) < 60) {
          dancer = bees.reduce((b, q) => (!b || Math.hypot(q.x - queen.x, q.y - queen.y) < Math.hypot(b.x - queen.x, b.y - queen.y) ? q : b), null);
          if (dancer) { dancer.dance = { t: 0, cx: queen.x + 120, cy: queen.y + 40, dir: R() * TAU }; }
          sfx('hum', { vol: 0.3 }); if (A.phrase) A.phrase([[5, 0.5], [7, 0.5], [5, 0.5], [9, 1]], { instrument: 'celesta', vol: 0.1 });
          fx.burst(queen.x, queen.y, { n: 8, power: 0.3, rgb: '255,210,120' }); return true;
        }
        for (const b of bees) if (Math.hypot(pt.x - b.x, pt.y - b.y) < 44) {
          b.buzz = 1.2; b.v = 160; b.a = Math.atan2(b.y - pt.y, b.x - pt.x) + (R() - 0.5); b.rest = 0;
          sfx('buzz', { vol: 0.25, size: 0.4 }); note(5 + Math.floor(R() * 5), { instrument: 'celesta', vol: 0.08 }); return true;
        }
        if (inComb(pt.x, pt.y)) { for (let i = 0; i < 4; i++) light(pt.x + Math.cos(i * 1.6) * HEX * (i ? 1 : 0), pt.y + Math.sin(i * 1.6) * HEX * (i ? 1 : 0)); note(Math.floor((1 - pt.y / 900) * 10), { instrument: 'celesta', vol: 0.12 }); return true; }
        return false;
      },
      stroke(s) {
        if (s.phase === 'end') return true;
        let any = false;
        for (let i = 0; i < s.n; i++) { const q = s.points[i]; if (inComb(q.x, q.y) && light(q.x, q.y)) any = true; }
        const t = engine.now();
        if (any && t - last > 0.08) { last = t; note(Math.floor((1 - s.y / 900) * 10) + (env.season === 'winter' ? 0 : 2), { instrument: env.season === 'winter' ? 'glass' : 'celesta', vol: 0.09, x: s.x }); }
        if (env.season === 'winter' && Math.hypot(s.x - 1000, s.y - 450) < 260) { warm = Math.min(1.5, warm + 0.02); if (t - last > 0.3) sfx('hum', { vol: 0.2 }); }
        return true;
      },
      hold(pt) { call = { x: pt.x, y: pt.y, t: 4 }; sfx('hum', { vol: 0.35 }); if (A.chord) A.chord([0, 4, 7], { instrument: 'pad', vol: 0.12 }); return true; },
      update(dt) {
        const winter = env.season === 'winter', nk = art.nightness(env), slow = winter ? 0.25 : nk > 0.6 ? 0.35 : 1;
        warm *= Math.exp(-dt * 0.15);
        if (call && (call.t -= dt) <= 0) call = null;
        for (let i = 0; i < bees.length; i++) {
          const b = bees[i];
          b.buzz = Math.max(0, b.buzz - dt);
          if (b.dance) {                                        // the waggle dance: a figure of eight with a waggling run through the middle
            const d = b.dance; d.t += dt; const k = d.t * 1.2, loop = Math.floor(k / TAU) % 2 ? -1 : 1, a = k % TAU;
            const lx = Math.sin(a) * 60 * loop, ly = (1 - Math.cos(a)) * 40 - 40;
            const cx = d.cx + Math.cos(d.dir) * ly - Math.sin(d.dir) * lx, cy = d.cy + Math.sin(d.dir) * ly + Math.cos(d.dir) * lx;
            b.a = Math.atan2(cy - b.y, cx - b.x); b.x = cx + (a < 0.6 ? Math.sin(d.t * 40) * 4 : 0); b.y = cy; b.buzz = a < 0.6 ? 0.2 : b.buzz;
            if (a < 0.05 && d.t > 0.2) note(7 + loop, { instrument: 'celesta', vol: 0.06 });
            if (d.t > 9) b.dance = null; continue;
          }
          let tx = null, ty = null;
          if (winter) { const ang = (i / bees.length) * TAU + engine.now() * 0.05, rr = 60 + (i % 4) * 34; tx = 1000 + Math.cos(ang) * rr; ty = 450 + Math.sin(ang) * rr * 0.9; }
          if (call) { tx = call.x + Math.cos(i * 2.4) * (40 + (i % 3) * 30); ty = call.y + Math.sin(i * 2.4) * (40 + (i % 3) * 30); }
          if (tx !== null) { const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy); if (d > 8) { b.a += (((Math.atan2(dy, dx) - b.a + Math.PI * 3) % TAU) - Math.PI) * Math.min(1, dt * 4); b.v = Math.min(winter && !call ? 18 : 90, d * 1.5); } else b.v = 0; }
          else if (b.rest > 0) { b.rest -= dt * slow; b.v *= Math.exp(-dt * 5); }
          else { b.turn += (R() - 0.5) * dt * 6; b.turn *= Math.exp(-dt * 2); b.a += b.turn * dt * 3; b.v += ((50 + (b.buzz > 0 ? 120 : 0)) * slow - b.v) * Math.min(1, dt * 3); if (R() < dt * 0.25) b.rest = 1 + R() * 4; }
          b.x += Math.cos(b.a) * b.v * dt; b.y += Math.sin(b.a) * b.v * dt;
          if (b.x < ar.x0 || b.x > ar.x1) { b.a = Math.PI - b.a; b.x = Math.max(ar.x0, Math.min(ar.x1, b.x)); }
          if (b.y < ar.y0 || b.y > ar.y1) { b.a = -b.a; b.y = Math.max(ar.y0, Math.min(ar.y1, b.y)); }
        }
        if (queen) { queen.a += Math.sin(engine.now() * 0.3) * dt * 0.3; queen.x = 1000 + Math.sin(engine.now() * 0.07) * 50; queen.y = 470 + Math.cos(engine.now() * 0.05) * 30; }
      },
      draw(g, env, view, p) {
        const t = engine.now(), nk = art.nightness(env), winter = env.season === 'winter';
        // the comb glows: the cells a finger lit, and the cluster's warmth in winter
        for (let i = cells.length - 1; i >= 0; i--) {
          const c = cells[i], a = t - c.t0; if (a > 7) { cells.splice(i, 1); continue; }
          const k = c.k * Math.min(1, a * 5) * (1 - a / 7);
          art.light(g, c.x, c.y, HEX * 1.4, [1, 0.72, 0.25], 0.9 * k, { core: HEX * 0.3 });
        }
        if (winter) art.light(g, 1000, 450, 360, [1, 0.7, 0.3], 0.35 + 0.4 * warm + 0.08 * Math.sin(t * 1.5), { core: 40 });
        // daylight through the entrance
        art.light(g, COMB.entrance.x, COMB.entrance.y, 300, [1, 0.95, 0.75], 0.5 * (1 - nk), { core: 30 });
        // the bees
        for (const b of bees) {
          const pose = b.buzz > 0 ? 2 + (Math.floor(t * 30) % 2) : b.v > 5 ? Math.floor(t * 8 + b.seed) % 2 : 0;
          if (!drawPiece(g, 'combbee', pose, b.x, b.y, b.a, 1)) { g.fillStyle = 'rgba(70,50,20,.8)'; g.beginPath(); g.ellipse(b.x, b.y, 14, 9, b.a, 0, TAU); g.fill(); }
        }
        if (queen && !drawPiece(g, 'queenbee', 0, queen.x, queen.y, queen.a, 1)) drawPiece(g, 'combbee', 0, queen.x, queen.y, queen.a, 1.35);
      },
    };
  },
});
