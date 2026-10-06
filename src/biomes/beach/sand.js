// Drawing in the sand: a finger leaves a soft groove that sings as it goes; the next wave that runs over it smooths it
// away (and a great one smooths everything it reaches). Kept in one offscreen canvas per view, in world units, drawn
// as a ground layer of art's painted place (under the creatures).
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** cfg: { view, top(x) -> the highest y a groove may be drawn at, onStep(x, y, n) every `step` units of groove } */
export function createSand(engine, p, cfg) {
  const RES = 0.75;                                          // canvas pixels per world unit
  const W = Math.round((p.width || 2000) * RES), H = Math.round(1000 * RES);
  // two layers of opaque paint drawn translucent, so overlapping samples never pile up into beads:
  // the trough's shadow (light comes from the upper left, so the far wall is in shade) and the lit lower lip
  let cv = null, g2 = null, cl = null, gl = null;
  const last = new Map();                                    // finger id -> {x, y, d}
  let dirty = false, any = false, washT = 0;

  function ctx() {
    if (!cv) {
      cv = document.createElement('canvas'); cv.width = W; cv.height = H; g2 = cv.getContext('2d');
      cl = document.createElement('canvas'); cl.width = W; cl.height = H; gl = cl.getContext('2d');
      for (const g of [g2, gl]) { g.lineCap = 'round'; g.lineJoin = 'round'; }
    }
    return g2;
  }
  function line(g, x0, y0, x1, y1, w, dy) { g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0 + dy); g.lineTo(x1, y1 + dy); g.stroke(); }
  function seg(x0, y0, x1, y1) {
    ctx(); const s = p.scaleAt((y0 + y1) / 2), k = RES;
    x0 *= k; y0 *= k; x1 *= k; y1 *= k;
    g2.strokeStyle = 'rgb(150,118,78)'; line(g2, x0, y0, x1, y1, 15 * s * k, 0);
    g2.strokeStyle = 'rgb(118,90,58)'; line(g2, x0, y0, x1, y1, 7 * s * k, -1.5 * s * k);
    gl.strokeStyle = 'rgb(255,247,226)'; line(gl, x0, y0, x1, y1, 4 * s * k, 6 * s * k);
    dirty = true; any = true;
  }

  /** a stroke point over the sand; returns true when it drew */
  function stroke(pt, phase) {
    const top = cfg.top ? cfg.top(pt.x) : 0;
    let L = last.get(pt.id);
    if (phase === 'end') { last.delete(pt.id); return false; }
    if (pt.y < top) { last.delete(pt.id); return false; }
    if (!L) { L = { x: pt.x, y: pt.y, d: 0, n: 0 }; last.set(pt.id, L); seg(pt.x, pt.y, pt.x + 0.1, pt.y); return true; }
    const d = Math.hypot(pt.x - L.x, pt.y - L.y);
    if (d < 2) return true;
    seg(L.x, L.y, pt.x, pt.y);
    L.d += d; L.x = pt.x; L.y = pt.y;
    const step = 46 * p.scaleAt(pt.y);
    while (L.d > step) { L.d -= step; L.n++; if (cfg.onStep) cfg.onStep(pt.x, pt.y, L.n); }
    return true;
  }

  /** water ran over the sand from y0 to y1 across [x - span, x + span]: smooth the grooves there (soft-edged) */
  function wash(x, span, y0, y1, k = 1) {
    if (!any) return false;
    const g = ctx(), r = RES;
    g.save(); g.globalCompositeOperation = 'destination-out';
    g.translate(x * r, (y0 - 30) * r); g.scale(span * r, Math.max(10, y1 - y0 + 30) * r);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, `rgba(0,0,0,${0.9 * k})`); gr.addColorStop(0.75, `rgba(0,0,0,${0.8 * k})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI); g.fill();
    g.restore();
    gl.save(); gl.globalCompositeOperation = 'destination-out'; gl.setTransform(g.getTransform()); gl.translate(x * r, (y0 - 30) * r); gl.scale(span * r, Math.max(10, y1 - y0 + 30) * r);
    gl.fillStyle = gr; gl.beginPath(); gl.arc(0, 0, 1, 0, Math.PI); gl.fill(); gl.restore();
    washT = engine.now(); dirty = true;
    return true;
  }
  /** wind and time fade the drawings slowly (dry sand blows over them) */
  function fade(k) { if (!any) return; ctx(); for (const g of [g2, gl]) { g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = `rgba(0,0,0,${k})`; g.fillRect(0, 0, W, H); g.restore(); } }

  let fadeAcc = 0;
  return {
    view: cfg.view, stroke, wash, fade,
    clear() { if (cv) { g2.clearRect(0, 0, W, H); gl.clearRect(0, 0, W, H); } any = false; },
    get drawn() { return any; },
    layer: {
      view: cfg.view, stats: { n: 0 },
      update(dt, env) {
        // still air keeps a drawing for minutes; wind, rain and snow soften it within a minute or so
        const k = 0.0006 + 0.01 * (env.windy || 0) + 0.006 * (env.wet || 0) + 0.006 * (env.snowy || 0);
        fadeAcc += dt * k; if (fadeAcc > 0.02) { fade(fadeAcc); fadeAcc = 0; }
      },
      drawGround(g, nightK) {
        if (!any || !cv) return;
        const a = clamp(1 - nightK * 0.35, 0, 1);
        g.globalAlpha = 0.26 * a; g.drawImage(cv, 0, 0, W, H, 0, 0, W / RES, H / RES);
        g.globalAlpha = 0.34 * a * (1 - nightK * 0.6); g.drawImage(cl, 0, 0, W, H, 0, 0, W / RES, H / RES);
        g.globalAlpha = 1;
      },
    },
  };
}
