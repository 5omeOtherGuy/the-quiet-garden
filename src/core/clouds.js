// Clouds (owner: engine; docs/ENGINE.md "World gestures"): rain and storm come from a cloud, not from tapping anywhere
// (owner, BRIEF 24: "a child that just taps a lot on the screen will cause rain to fall").
//
//   tap a cloud            -> rain; more taps within a few seconds -> heavier, the third or so a storm (snow in winter)
//   hold a finger on it    -> it darkens on and on: a storm
//
// Which clouds:
// - the engine's cloud icon: a small round button in the top right corner, left of the "?" (where there is no "?", in
//   the corner itself), at the "?"'s size, in both editions (owner, BRIEF 31: "The cloud for changing the weather must
//   go, make it just a small icon in the top right next to the ? symbol"). Nothing is drawn in the sky. It shows in
//   every main place but a quiet one, and in an instance only when that shows the sun, the moon or a sky. It is a
//   button: a touch on its square goes to it, not to the place under it.
// - clouds a place draws itself and declares as regions named `cloud` (per view; the shape may move with a drifting
//   cloud): they rain when tapped or held, after the place's own tap or hold had its say (return true to take it).

import { clamp } from './util.js';
import { SPARK } from './fx.js';

const TAP_WINDOW = 5;       // seconds in which taps on clouds add up
const HOLD_RAIN = 0.32;     // rain energy per second while a finger rests on a cloud (storm above 0.72: about 2 s)
const SIZE = 30;            // css px, the size of the "?" sign (help.js)
const GAP = 14;             // css px between the icon and the "?"
const HIT = 52;             // css px, the square a finger may touch the icon in

const CSS = `
#qg-cloud { position: fixed; top: calc(10px + env(safe-area-inset-top, 0px)); right: calc(var(--qg-cloud-right, 12px) + env(safe-area-inset-right, 0px));
  z-index: 8; width: ${SIZE}px; height: ${SIZE}px; border-radius: 50%; pointer-events: none; opacity: .5;
  border: 1px solid rgba(74,59,44,.35); background: rgba(245,237,220,.35); transition: opacity .25s ease, transform .25s ease; }
#qg-cloud[hidden] { display: none; }
#qg-cloud svg { display: block; width: 100%; height: 100%; overflow: visible; }
#qg-cloud.held { opacity: .9; transform: scale(1.2); }
#qg-cloud.bump { animation: qg-cloud-bump .45s ease; }
@keyframes qg-cloud-bump { 0% { transform: scale(1); } 35% { transform: scale(1.22, .9); } 70% { transform: scale(.95, 1.06); } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { #qg-cloud { transition: none; } #qg-cloud.bump { animation: none; } }
`;
// a small cloud with a flat base in a 30 x 30 box, and three short drops under it that show while it rains
const SVG = `<svg viewBox="0 0 30 30" aria-hidden="true">
  <path class="c" d="M9.2 20.2h12.1a3.7 3.7 0 0 0 .5-7.35a5.3 5.3 0 0 0-10.2-1.3a4.1 4.1 0 0 0-2.4 8.65z" fill="#fbf8f0" stroke="#4a3b2c" stroke-opacity=".6" stroke-width="1.1" stroke-linejoin="round"/>
  <g class="d" stroke="#6f8fb8" stroke-width="1.3" stroke-linecap="round" opacity="0"><path d="M11.5 22.6l-.7 2.1M15.5 22.6l-.7 2.1M19.5 22.6l-.7 2.1"/></g>
</svg>`;

export function createClouds(c) {
  // c: {env, envCtl, fx, sound(name, opts), stage, now() (engine s), shown: {sun, moon}, frame(), regionAt(x, y),
  //     top() -> the node shown, beside: bool (the "?" sign is shown: stand left of it), quiet(n) -> bool}
  const { env, envCtl, fx } = c;
  const own = { on: false, dark: 0, shownDk: -1, shownWet: -1 };
  const taps = [];
  let holdNote = 0;

  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const el = document.createElement('div'); el.id = 'qg-cloud'; el.hidden = true; el.innerHTML = SVG;
  if (c.beside) el.style.setProperty('--qg-cloud-right', `${12 + SIZE + GAP}px`);
  document.body.appendChild(el);
  const body = el.querySelector('.c'), drops = el.querySelector('.d');
  el.addEventListener('animationend', () => el.classList.remove('bump'));

  /** the icon's centre in css px, or null when it is not shown */
  function centre() {
    if (!own.on) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }
  /** is a screen point (css px) on the icon's touch square? */
  function onIcon(cx, cy) {
    const m = centre();
    return !!m && Math.abs(cx - m.x) < HIT / 2 && Math.abs(cy - m.y) < HIT / 2;
  }
  const iconAt = (p) => onIcon(p.sx * (c.stage.cssW || 1), p.sy * (c.stage.cssH || 1));

  const fresh = (o) => o.frame >= c.frame() - 3 && o.sy < 0.62;
  /** shown where there is weather to make: a main place, or an instance that shows the sun, the moon or a sky */
  function wanted(n) {
    if (!n || !n.frame || (c.quiet && c.quiet(n))) return false;   // never in a quiet place (the falls glade)
    if (!n.parent) return true;
    if (fresh(c.shown.sun) || fresh(c.shown.moon)) return true;
    const f = n.frame;
    return c.regionAt(f.x + f.w * 0.5, f.y + f.h * 0.08) === 'sky';
  }
  function rainFrom() { const m = centre(); return m ? { sx: m.x / (c.stage.cssW || 1), sy: m.y / (c.stage.cssH || 1) } : null; }
  function bump() { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function sparkleAt(p, n) { for (let i = 0; i < n; i++) fx.sparkle(p.x + (Math.random() - 0.5) * 60, p.y + 20 + Math.random() * 30, 1, 0.6, 0.9, 0.9, SPARK.RAIN); }

  const C = {
    /** the engine's cloud icon under a touch point p ({sx, sy} of the screen)? It is a button: it takes the touch. */
    icon: (p) => iconAt(p),
    /** the icon under a screen point in css px (help.js keeps its "?" hold off it) */
    onIcon,
    /** is a cloud under p ({x, y} world, {sx, sy} screen)? 'own' (the icon) | 'region' (a place's cloud) | '' */
    at(p) { return iconAt(p) ? 'own' : c.regionAt(p.x, p.y) === 'cloud' ? 'region' : ''; },
    /** the icon (screen centre {sx, sy} 0..1, size w in css px) or null; QG.cloud */
    get own() { const m = centre(); return m ? { sx: m.x / (c.stage.cssW || 1), sy: m.y / (c.stage.cssH || 1), w: SIZE } : null; },
    /** a tap on a cloud: rain (heavier with every tap). Returns true if it was a cloud. */
    tap(p) {
      const which = C.at(p); if (!which) return false;
      const t = c.now();   // engine time: a page that stalls for a moment does not forget the taps before
      while (taps.length && t - taps[0] > TAP_WINDOW) taps.shift();
      taps.push(t);
      const k = 0.24 + 0.05 * Math.min(taps.length - 1, 6);   // one tap: it rains (above 0.2); about the third: a storm (above 0.72)
      if (which === 'own') { bump(); own.dark = Math.min(1, own.dark + 0.4); envCtl.add('rain', k, rainFrom()); }
      else { envCtl.add('rain', k, { sx: p.sx, sy: p.sy }); fx.ring(p.x, p.y, 0.9 + k, 1); sparkleAt(p, 5); }
      c.sound('drip', { vol: 0.5 + k * 0.5, count: 3, x: p.x });
      return true;
    },
    /** a finger resting on a cloud: it rains harder and harder, a storm. False once the finger is off the cloud. */
    hold(r, dt) {
      const which = C.at(r.p); if (!which) { el.classList.remove('held'); return false; }
      if (which === 'own') { el.classList.add('held'); own.dark = Math.min(1, own.dark + dt * 0.6); }
      envCtl.add('rain', HOLD_RAIN * dt, which === 'own' ? rainFrom() : { sx: r.p.sx, sy: r.p.sy });
      if ((holdNote -= dt) <= 0) { holdNote = 0.45; if (which !== 'own') sparkleAt(r, 3); c.sound('drip', { vol: 0.45, count: 2, x: r.x }); }
      return true;
    },
    /** the finger that held the icon lifted */
    release() { el.classList.remove('held'); },
    /** per frame: show or hide the icon, let it grey with the rain */
    tick(dt) {
      const on = wanted(c.top());
      if (on !== own.on) { own.on = on; el.hidden = !on; if (!on) el.classList.remove('held'); }
      own.dark = Math.max(0, own.dark - dt * 0.1);
      if (!on) return;
      const dk = clamp(Math.max(own.dark, env.wet || 0, env.stormy || 0, (env.snowy || 0) * 0.6), 0, 1);
      if (Math.abs(dk - own.shownDk) > 0.03) {
        own.shownDk = dk;
        const m = (a, b) => Math.round(a + (b - a) * dk);
        body.setAttribute('fill', `rgb(${m(251, 142)},${m(248, 148)},${m(240, 162)})`);
      }
      const wet = clamp(Math.max(env.wet || 0, env.snowy || 0), 0, 1);
      if (Math.abs(wet - own.shownWet) > 0.05) { own.shownWet = wet; drops.setAttribute('opacity', (wet * 0.9).toFixed(2)); }
    },
  };
  return C;
}
