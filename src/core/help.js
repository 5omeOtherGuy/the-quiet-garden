// Help for the grown-up who plays along (owner: engine; BRIEF point 18). On in the simple edition (edition.js HELP),
// off in the painted edition; ?help=1 / ?help=0 switch it for a session (tests).
//   1. Marked ways: every exit to another main place (`to:` one of ORDER) or to another view (`view:`) gets a soft
//      breathing mark in the picture: small footprints walking to a glow in the colour of where the way leads.
//      Never marked: `inst:` and `out:` exits, the way to the secret place, hidden places, `mark: false`.
//      A place forces a mark with `mark: true` and moves it with `markAt: {x, y}` (world units).
//      (The seasons: the main way shown is a finger resting on the sun or the moon; the twist is the second line.)
//   2. A faint "?" in the top right corner. A tap does nothing special (the touch goes to the world as always); a finger
//      held still on it for about a second (lifted after it, or resting a little longer) opens one calm card: each
//      gesture as a small moving hand and one line.
//      A touch anywhere closes the card.
//   3. First visit only (per save): after the opening the same hints appear once, one after the other, near where each
//      gesture works, each fading after a few seconds or when the gesture was done. They never take a touch.

import { skin } from './ui/skin.js';
import { clamp } from './util.js';

// the colour of each main place, for the glow of a way that leads there (a place's def.color wins)
const TINT = {
  meadow: '#9cc25a', antnest: '#c0814a', underground: '#8a6a4a', wood: '#4f8a4a', pond: '#5fa0c8',
  riverbank: '#4fa59a', beach: '#e2c27a', undersea: '#3f6fb0', mountains: '#9a92b8', town: '#c8735a',
};
const HOLD_MS = 1000, CORNER = 76;           // css px of the corner that the "?" lives in
const HINT_SEC = 6.5, HINT_GAP = 1.2, HINT_DELAY = 2.2;

// ---- the small moving hands (inline SVG, SMIL animations; 96 x 72) ------------------------------------------------
const INKC = '#4a3b2c', TIP = '#e0a46a';
const hand = (tips) => {
  // a soft hand whose fingertips are at the given points (relative to the hand's origin at 0,0)
  let s = `<ellipse cx="14" cy="34" rx="15" ry="13" fill="${INKC}" fill-opacity=".22"/>`;
  for (const [x, y] of tips) s += `<line x1="${x}" y1="${y}" x2="${x * 0.4 + 10}" y2="26" stroke="${INKC}" stroke-opacity=".22" stroke-width="8" stroke-linecap="round"/>`;
  for (const [x, y] of tips) s += `<circle cx="${x}" cy="${y}" r="4.6" fill="${TIP}"/>`;
  return s;
};
const svg = (body) => `<svg viewBox="0 0 96 72" width="96" height="72" aria-hidden="true" fill="none">${body}</svg>`;
const PICS = {
  way: svg(`<g transform="translate(18 52)">${[0, 1, 2].map((i) => `<ellipse cx="${i * 14}" cy="${(i % 2) * 7 - i * 4}" rx="3.4" ry="5" fill="${INKC}" fill-opacity=".45" transform="rotate(70 ${i * 14} ${(i % 2) * 7 - i * 4})"/>`).join('')}</g>
    <circle cx="66" cy="36" r="14" fill="#ffe9b8" fill-opacity=".8"><animate attributeName="r" values="11;15;11" dur="2.4s" repeatCount="indefinite"/></circle>
    <circle cx="66" cy="36" r="5" fill="#9cc25a"/>
    <g><animateTransform attributeName="transform" type="translate" values="66 22;66 30;66 22" keyTimes="0;.5;1" dur="1.4s" repeatCount="indefinite"/>${hand([[0, 0]])}</g>`),
  wind: svg(`<path d="M10 22 q14 -6 28 0 t28 0" stroke="${INKC}" stroke-opacity=".3" stroke-width="2" stroke-linecap="round"><animate attributeName="stroke-dashoffset" values="0;-40" dur="1.6s" repeatCount="indefinite"/></path>
    <path d="M16 54 q14 -6 28 0 t28 0" stroke="${INKC}" stroke-opacity=".2" stroke-width="2" stroke-dasharray="10 8"><animate attributeName="stroke-dashoffset" values="0;-36" dur="1.2s" repeatCount="indefinite"/></path>
    <g><animateMotion dur="1.4s" repeatCount="indefinite" path="M48 22 a14 12 0 1 1 -0.1 0"/>${hand([[0, 0]])}</g>`),
  rain: svg(`<g>
      <path d="M22 26 a10 10 0 0 1 14 -12 a13 13 0 0 1 24 2 a9 9 0 0 1 12 10 z" fill="#c9ced8" stroke="${INKC}" stroke-opacity=".3" stroke-width="1.5"><animate attributeName="fill" values="#eef0f2;#9aa2b0;#eef0f2" dur="2.7s" repeatCount="indefinite"/></path></g>
    ${[0, 1, 2, 3].map((i) => `<line x1="${28 + i * 12}" y1="32" x2="${25 + i * 12}" y2="42" stroke="#6f8fb8" stroke-width="2" stroke-linecap="round" opacity="0"><animate attributeName="opacity" values="0;1;0" dur=".9s" begin="${i * 0.2}s" repeatCount="indefinite"/></line>`).join('')}
    <g><animateTransform attributeName="transform" type="translate" values="48 24;48 30;48 24" keyTimes="0;.4;1" dur=".9s" repeatCount="indefinite"/>${hand([[0, 0]])}</g>`),
  wipe: svg(`<rect x="8" y="8" width="80" height="22" rx="6" fill="#9fb4c8" fill-opacity=".35"/>
    <g><animateTransform attributeName="transform" type="translate" values="22 20;54 20;22 20" dur="1.1s" repeatCount="indefinite"/>${hand([[0, 0], [10, -3]])}</g>`),
  mist: svg(`<ellipse cx="48" cy="22" rx="30" ry="10" fill="#cfd6dc"><animate attributeName="rx" values="18;34;18" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values=".2;.8;.2" dur="3s" repeatCount="indefinite"/></ellipse>
    <g transform="translate(34 34)">${hand([[0, 0], [11, -4], [22, 0]])}</g>`),
  sun: svg(`<path d="M10 58 Q48 -6 86 58" stroke="${INKC}" stroke-opacity=".18" stroke-width="1.5" stroke-dasharray="3 4"/>
    <g><animateMotion dur="2.6s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.8;1" calcMode="linear" path="M48 15 Q70 22 82 50"/>
      <circle cx="0" cy="0" r="9" fill="#f2c14e"/><g transform="translate(2 4)">${hand([[0, 0]])}</g></g>`),
  slide: svg(`<rect x="8" y="6" width="80" height="60" rx="6" fill="#2a3352"><animate attributeName="fill-opacity" values=".05;.4;.05" dur="2.4s" repeatCount="indefinite"/></rect>
    <g><animateTransform attributeName="transform" type="translate" values="36 12;36 34;36 12" dur="2.4s" repeatCount="indefinite"/>${hand([[0, 0], [12, -3]])}</g>`),
  season: svg(`<circle cx="40" cy="30" r="13" fill="#f2c14e"/>
    <circle cx="40" cy="30" r="14" stroke="${TIP}" stroke-width="2" fill="none"><animate attributeName="r" values="14;30" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0" dur="2s" repeatCount="indefinite"/></circle>
    <g transform="translate(42 33)">${hand([[0, 0]])}</g>
    <path d="M76 18 q8 6 0 16 q-8 -6 0 -16z"><animate attributeName="fill" values="#8fbf5a;#8fbf5a;#d98c3a;#d98c3a;#e8eef2;#e8eef2;#f2b6c6;#f2b6c6;#8fbf5a" dur="8s" repeatCount="indefinite"/></path>`),
  twist: svg(`<path d="M30 20 A22 22 0 0 1 70 24" stroke="${INKC}" stroke-opacity=".3" stroke-width="2" marker-end="url(#a)"/>
    <defs><marker id="a" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6z" fill="${INKC}" fill-opacity=".4"/></marker></defs>
    <g><animateTransform attributeName="transform" type="rotate" values="-30 48 38;40 48 38;-30 48 38" dur="2.2s" repeatCount="indefinite"/>
      <circle cx="30" cy="38" r="5" fill="${TIP}"/><circle cx="66" cy="38" r="5" fill="${TIP}"/><line x1="30" y1="38" x2="66" y2="38" stroke="${INKC}" stroke-opacity=".15" stroke-width="10" stroke-linecap="round"/></g>`),
};
// one short line each (wording after docs/ENGINE.md "World gestures", in the opening note's voice)
const LINES = [
  ['way', 'Tap the little footprints: walk on to another place.'],
  ['wind', 'Circle a finger: the wind rises.'],
  ['rain', 'Tap a cloud: rain; hold it: storm (in winter, snow).', 'Rub with two fingers: clear sky.'],
  ['mist', 'Rest three fingers still: mist.'],
  ['sun', 'Drag the sun or the moon: the time of day.'],
  ['slide', 'Two fingers down or up: darker or lighter.'],
  ['season', 'Rest a finger still on the sun or the moon: the next season.', 'Or turn two fingers.'],
];

const CSS = `
#qg-sign { position: fixed; top: calc(10px + env(safe-area-inset-top, 0px)); right: calc(12px + env(safe-area-inset-right, 0px));
  z-index: 8; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; pointer-events: none;
  font: italic 19px/1 var(--display, Georgia, serif); color: #4a3b2c; opacity: .22; border: 1px solid rgba(74,59,44,.35);
  transition: opacity .25s ease, transform .25s ease; }
#qg-sign.holding { opacity: .85; transform: scale(1.25); transition: opacity 1s linear, transform 1s ease; }
#qg-help { position: fixed; inset: 0; z-index: 12; display: grid; place-items: center; touch-action: none;
  background: radial-gradient(ellipse at 50% 50%, rgba(245,237,220,.95) 0%, rgba(245,237,220,.88) 55%, rgba(245,237,220,.6) 100%);
  opacity: 0; transition: opacity .5s ease; color: #4a3b2c; font-family: var(--display, Georgia, serif); }
#qg-help.on { opacity: 1; }
#qg-help .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 24em)); gap: 4px 28px; padding: 16px; max-width: calc(100vw - 32px); }
#qg-help .row { display: flex; align-items: center; gap: 10px; font-size: clamp(13px, 2.1vmin, 19px); line-height: 1.25; }
#qg-help .row svg { flex: none; width: clamp(72px, 12vmin, 120px); height: auto; }
#qg-help .row small { font-size: .85em; opacity: .75; font-style: italic; }
#qg-hint small { font-size: .85em; opacity: .75; font-style: italic; }
#qg-help .close { grid-column: 1 / -1; text-align: center; font-style: italic; opacity: .6; font-size: clamp(11px, 1.6vmin, 15px); margin-top: 6px; }
@media (max-width: 700px) { #qg-help .grid { grid-template-columns: 1fr; } }
#qg-hint { position: fixed; z-index: 7; pointer-events: none; display: flex; align-items: center; gap: 8px; max-width: min(22em, 46vw);
  padding: 6px 12px 6px 6px; border-radius: 14px; background: rgba(245,237,220,.82); box-shadow: 0 2px 14px rgba(60,45,30,.15);
  color: #4a3b2c; font: clamp(12px, 1.9vmin, 17px)/1.25 var(--display, Georgia, serif); opacity: 0; transition: opacity .8s ease; }
#qg-hint.on { opacity: 1; }
#qg-hint svg { flex: none; width: clamp(64px, 11vmin, 104px); height: auto; }
@media (prefers-reduced-motion: reduce) { #qg-help, #qg-hint, #qg-sign { transition: none; } }
`;

/**
 * c = { world, exits, stage, env, save, gestures, input, defs, ORDER, SECRET, sun(): {sx, sy, sr, frame} | null,
 *       cloud(): the engine's cloud icon {sx, sy, w} | null, rain(): the rain energy now,
 *       onCloud(cssX, cssY): is that point on the cloud icon's touch square (the "?" hold leaves it alone),
 *       frame(): frame number, on: bool, hints: bool (force the first-visit hints) }
 */
export function createHelp(c) {
  const H = {
    on: !!c.on,
    cardOpen: false,
    hint: null,           // the hint shown: { key, t, done }
    marks: [],            // the marks drawn last frame: { x, y, sx, sy, e }
  };
  if (!H.on) {
    H.drawMarks = () => {}; H.tick = () => {}; H.begin = () => {}; H.blocking = () => false; H.open = () => false; H.close = () => false;
    return H;
  }

  // ---- DOM: style, the "?" sign, the card, the hint bubble ----------------------------------------------------------
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const sign = document.createElement('div'); sign.id = 'qg-sign'; sign.textContent = '?'; sign.setAttribute('aria-hidden', 'true');
  document.body.appendChild(sign);
  let card = null, hintEl = null;

  function open() {
    if (H.cardOpen) return false;
    c.input.endAll();
    card = document.createElement('div'); card.id = 'qg-help';
    card.innerHTML = `<div class="grid">${LINES.map(([k, t, t2]) => `<div class="row">${PICS[k]}<span>${t}${t2 ? `<br><small>${t2}</small>` : ''}</span></div>`).join('')}<div class="close">Touch anywhere to close.</div></div>`;
    card.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); close(); });
    document.body.appendChild(card);
    requestAnimationFrame(() => card && card.classList.add('on'));
    H.cardOpen = true;
    endHint(true);
    return true;
  }
  function close() {
    if (!H.cardOpen || !card) return false;
    const el = card; card = null; el.classList.remove('on');
    setTimeout(() => el.remove(), 500);
    setTimeout(() => { H.cardOpen = false; }, 120);   // the closing touch must not reach the world
    return true;
  }

  // ---- the corner: a finger held still for a second opens the card; the touch still goes to the world -----------
  // The card opens when the finger lifts after at least HOLD_MS (event times, so a busy frame cannot turn a tap into a
  // hold), or by itself while the finger still rests there a little longer. That second way is checked per frame, not
  // by a timer: the browser hands queued touches over before a frame, so a lift held up by a busy page (the first
  // touch also wakes the sound) is always seen first and a tap never opens the card.
  let hold = null;
  const openNow = () => { if (!hold) return; hold = null; sign.classList.remove('holding'); open(); };
  addEventListener('pointerdown', (e) => {
    if (H.cardOpen || hold) return;
    const W = innerWidth;
    if (e.clientX < W - CORNER || e.clientY > CORNER) return;
    if (c.onCloud && c.onCloud(e.clientX, e.clientY)) return;   // the cloud icon just left of the "?" is not the "?"
    hold = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, at: performance.now() };
    sign.classList.add('holding');
  }, { capture: true });
  const endHold = (e) => {
    if (!hold || e.pointerId !== hold.id) return;
    if (e.type === 'pointermove' && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) < 14) return;
    if (e.type === 'pointerup' && e.timeStamp - hold.t >= HOLD_MS) { openNow(); return; }
    hold = null; sign.classList.remove('holding');
  };
  addEventListener('pointermove', endHold, { capture: true });
  addEventListener('pointerup', endHold, { capture: true });
  addEventListener('pointercancel', endHold, { capture: true });

  // ---- marks in the picture ---------------------------------------------------------------------------------------
  const MAIN = new Set(c.ORDER);
  function marked(e) {
    if (e.mark === false) return false;
    if (e.mark === true) return true;
    if (e.inst || e.out) return false;
    if (e.to) return e.to !== c.SECRET && MAIN.has(e.to);
    return !!e.view;
  }
  function centre(e) {
    if (e.markAt) return e.markAt;
    if (Number.isFinite(e.r)) return { x: e.x, y: e.y };
    if (Number.isFinite(e.w) && Number.isFinite(e.h)) return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
    if (Array.isArray(e.poly) && e.poly.length) { let x = 0, y = 0; for (const p of e.poly) { x += p[0]; y += p[1]; } return { x: x / e.poly.length, y: y / e.poly.length }; }
    return null;
  }
  const tintOf = (n, e) => {
    const id = e.to || n.placeId, d = c.defs[id];
    return (d && d.color) || TINT[id] || '#d9b36a';
  };
  /** Draw the marks of node n in world units (g maps world units; view is the visible rect). */
  H.drawMarks = function (g, n, view, t, isTop) {
    if (isTop) H.marks.length = 0;
    const list = c.exits.api(n).list;
    for (const e of list) {
      if ((e.in && e.in !== n.viewId) || !marked(e)) continue;
      const p = centre(e); if (!p) continue;
      const cx = view.x + view.w / 2, dx = p.x - cx, dy = p.y - (view.y + view.h * 1.1), d = Math.hypot(dx, dy) || 1;
      skin.wayMark(g, p.x, p.y, view.h / 1000, tintOf(n, e), t, dx / d, dy / d);
      if (isTop) H.marks.push({ x: p.x, y: p.y, sx: (p.x - view.x) / view.w, sy: (p.y - view.y) / view.h, e });
    }
  };

  // ---- first-visit hints --------------------------------------------------------------------------------------------
  let queue = null, wait = 0, base = null;
  H.begin = function () {
    if (queue || (c.save.data.helpSeen && !c.hints)) return;
    queue = LINES.map(([k]) => k); wait = HINT_DELAY;
    c.save.set('helpSeen', true);
  };
  function where(key) {
    const top = c.world.top;
    if (key === 'way') { const m = H.marks.find((q) => q.sx > 0.04 && q.sx < 0.96 && q.sy > 0.04 && q.sy < 0.98); return m ? { sx: m.sx, sy: m.sy - 0.12 } : null; }
    if (key === 'season') { const s = c.sun(); return s ? { sx: s.sx + (s.sx > 0.6 ? -0.06 : 0.06), sy: s.sy + 0.14, side: s.sx > 0.6 ? 'left' : 'right' } : { sx: 0.5, sy: 0.5 }; }
    if (key === 'sun') { const s = c.sun(); return s ? { sx: s.sx + (s.sx > 0.6 ? -0.06 : 0.06), sy: s.sy + 0.02, side: s.sx > 0.6 ? 'left' : 'right' } : null; }
    if (key === 'rain') { const k = c.cloud && c.cloud(); if (k) return { sx: k.sx + (k.sx > 0.6 ? -0.08 : 0.08), sy: k.sy + 0.04, side: k.sx > 0.6 ? 'left' : 'right' }; }
    return { wind: { sx: 0.3, sy: 0.22 }, rain: { sx: 0.58, sy: 0.2 }, wipe: { sx: 0.45, sy: 0.3 }, mist: { sx: 0.5, sy: 0.55 },
      slide: { sx: 0.8, sy: 0.45 } }[key] || (top ? { sx: 0.5, sy: 0.4 } : null);
  }
  function showHint(key) {
    const at = where(key); if (!at) return false;
    const [, line, line2] = LINES.find((l) => l[0] === key);
    hintEl = document.createElement('div'); hintEl.id = 'qg-hint';
    hintEl.innerHTML = `${PICS[key]}<span>${line}${line2 ? `<br><small>${line2}</small>` : ''}</span>`;
    document.body.appendChild(hintEl);
    const W = innerWidth, Hh = innerHeight, r = hintEl.getBoundingClientRect();
    let x = at.sx * W - (at.side === 'left' ? r.width : at.side === 'right' ? 0 : r.width / 2), y = at.sy * Hh - r.height / 2;
    x = clamp(x, 10, W - r.width - 10); y = clamp(y, 10, Hh - r.height - 10);
    hintEl.style.left = `${x}px`; hintEl.style.top = `${y}px`;
    requestAnimationFrame(() => hintEl && hintEl.classList.add('on'));
    const top = c.world.top;
    base = { hour: c.env.hour, season: c.env.season, rain: c.rain ? c.rain() : 0, place: top && top.placeId, view: top && top.viewId, path: top && top.path };
    H.hint = { key, t: 0, done: false };
    return true;
  }
  function endHint(now) {
    if (!hintEl) { H.hint = null; return; }
    const el = hintEl; hintEl = null; H.hint = null; el.classList.remove('on');
    setTimeout(() => el.remove(), now ? 0 : 800);
  }
  function did(key) {
    const L = c.gestures.level, top = c.world.top;
    switch (key) {
      case 'way': return !!top && (top.placeId !== base.place || top.viewId !== base.view || top.path !== base.path);
      case 'wind': return L.swirl > 0.15;
      case 'rain': return (c.rain ? c.rain() > base.rain + 0.1 : false) || L.wipe > 0.2;
      case 'wipe': return L.wipe > 0.2;
      case 'mist': return L.hand > 0.15;
      case 'sun': case 'slide': return Math.abs(c.env.hour - base.hour) > 1;
      case 'season': return c.env.season !== base.season;
      default: return false;
    }
  }
  /** per frame, engine clock */
  H.tick = function (dt) {
    if (hold && performance.now() - hold.at >= HOLD_MS * 1.6) openNow();   // still resting on the corner: open
    if (!queue || H.cardOpen) return;
    if (H.hint) {
      H.hint.t += dt;
      if (H.hint.t > HINT_SEC || did(H.hint.key)) { endHint(false); wait = HINT_GAP; }
      return;
    }
    if ((wait -= dt) > 0) return;
    while (queue.length && !showHint(queue.shift())) { /* no place for this one here (no sun, no way): skip it */ }
    if (!H.hint && !queue.length) queue = null;
  };

  H.blocking = () => H.cardOpen;
  H.open = open;
  H.close = close;
  return H;
}
