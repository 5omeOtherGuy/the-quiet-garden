// The lighthouse lamp: it wakes at dusk, at night, in fog and in storms; its beam turns slowly over the sea. Seen from
// the side, a beam pointing along the coast is a long shaft, one pointing at us a bright flash. A touch makes it
// flash toward the child; a finger dragged from the lamp across the sky leads the beam (the child is the light).
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createLamp(engine, o) {
  // o: { x, y (lamp, world units), len (beam length), r (lamp size) }
  const L = { x: o.x, y: o.y, len: o.len || 900, r: o.r || 14, a: Math.random() * 6.28, spin: 0.55, flash: 0, lead: null, k: 0 };
  /** how awake the lamp is: 0 by day in clear weather .. 1 at night */
  L.want = (env) => clamp(engine.art.nightness(env) * 1.3 + (env.foggy || 0) * 0.9 + (env.stormy || 0) * 0.8 + (env.wet || 0) * 0.25, 0, 1);
  L.update = (dt, env) => {
    L.k += (L.want(env) - L.k) * Math.min(1, dt * 0.8);
    if (L.lead) { const want = L.lead; let d = ((want - L.a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; L.a += d * Math.min(1, dt * 6); }
    else L.a += dt * L.spin * (1 + 0.6 * (env.stormy || 0));
    L.flash = Math.max(0, L.flash - dt * 0.9);
  };
  /** draw the beam and the lamp (lights are screened on by the compositor) */
  L.draw = (g, env) => {
    const k = Math.max(L.k, L.flash * 0.9); if (k < 0.02) return;
    const art = engine.art, c = Math.cos(L.a), s = Math.sin(L.a), toward = Math.pow(Math.max(0, s), 6), fog = env.foggy || 0;
    const dir = c >= 0 ? 1 : -1, reach = Math.abs(c) * L.len * (0.7 + 0.5 * fog);
    // the shaft: a soft wedge of light (stronger in fog and rain, where there is something to light)
    if (reach > 20) {
      const vis = k * (0.10 + 0.22 * fog + 0.1 * (env.wet || 0) + 0.06 * engine.art.nightness(env));
      const gr = g.createLinearGradient(L.x, 0, L.x + dir * reach, 0);
      gr.addColorStop(0, `rgba(255,236,180,${vis})`); gr.addColorStop(1, 'rgba(255,236,180,0)');
      g.fillStyle = gr; g.beginPath();
      g.moveTo(L.x, L.y - L.r * 0.5); g.lineTo(L.x + dir * reach, L.y - L.r * 0.5 - reach * 0.09); g.lineTo(L.x + dir * reach, L.y + reach * 0.07); g.lineTo(L.x, L.y + L.r * 0.5); g.closePath(); g.fill();
      for (let i = 1; i <= 6; i++) { const u = i / 6.5; art.light(g, L.x + dir * reach * u, L.y - reach * 0.01 * u, 12 + 70 * u, [1, 0.9, 0.62], k * 0.22 * (1 - u) * (0.6 + fog), {}); }
    }
    art.light(g, L.x, L.y, L.r * (4 + 10 * toward + 8 * L.flash), [1, 0.88, 0.55], k * (0.7 + 1.1 * toward) + L.flash, { core: L.r * 0.5 });
  };
  /** a touch on the lamp: it turns to the child and flashes */
  L.poke = () => { L.flash = 1; L.a = Math.PI / 2; };
  return L;
}
