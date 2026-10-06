// Baking: paint expensive things once into an offscreen canvas in world units, then blit per frame.
export const layers = {
  /** Max device pixels for one baked layer (places may lower it). */
  maxPixels: 2.6e6,

  /**
   * Bake a world rect {x, y, w, h} at `scale` device px per world unit (clamped so the canvas stays under maxPixels).
   * fn(g) paints in world units. Returns {canvas, x, y, w, h, scale, ms}.
   */
  bake(rect, scale, fn) {
    const { x, y, w, h } = rect;
    const cap = Math.sqrt(this.maxPixels / (w * h));
    const s = Math.min(scale, cap);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * s)); c.height = Math.max(1, Math.ceil(h * s));
    const g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, -x * s, -y * s);
    const t0 = performance.now();
    fn(g);
    return { canvas: c, x, y, w, h, scale: s, ms: performance.now() - t0 };
  },

  /** Blit a baked layer into a world-unit context (optionally only the part inside view). */
  blit(g, layer, view, alpha = 1) {
    if (view && (layer.x > view.x + view.w || layer.x + layer.w < view.x || layer.y > view.y + view.h || layer.y + layer.h < view.y)) return;
    if (alpha !== 1) { g.save(); g.globalAlpha = alpha; }
    g.drawImage(layer.canvas, layer.x, layer.y, layer.w, layer.h);
    if (alpha !== 1) g.restore();
  },

  /** Bake in slices across several frames (progressive). jobs: [fn(g)...]; onDone(layer). Returns a cancel fn. */
  bakeProgressive(rect, scale, jobs, onDone, onStep) {
    const { x, y, w, h } = rect, cap = Math.sqrt(this.maxPixels / (w * h)), s = Math.min(scale, cap);
    const c = document.createElement('canvas'); c.width = Math.ceil(w * s); c.height = Math.ceil(h * s);
    const g = c.getContext('2d'); g.setTransform(s, 0, 0, s, -x * s, -y * s);
    const layer = { canvas: c, x, y, w, h, scale: s, ms: 0, done: false };
    let i = 0, cancelled = false;
    const step = () => {
      if (cancelled) return;
      const t0 = performance.now();
      while (i < jobs.length && performance.now() - t0 < 12) { jobs[i++](g); }
      layer.ms += performance.now() - t0;
      if (onStep) onStep(layer, i / jobs.length);
      if (i < jobs.length) requestAnimationFrame(step); else { layer.done = true; if (onDone) onDone(layer); }
    };
    requestAnimationFrame(step);
    return () => { cancelled = true; };
  },
};
