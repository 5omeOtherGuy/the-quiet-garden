// The Waterfall Glade (painted edition, hidden place; owner: falls worker). docs/biomes/falls.md has the whole intent;
// the owner's decisions are docs/status/falls-DECISIONS.md.
//
// A real place that is very special to the owner: a glade in an ancient wood, a wide mossy tufa waterfall falling in
// many thin veils into a clear pool under a high canopy of spring leaves, the old ivy tree, and his aunt sitting on its
// root, watching the water: the only person in the game. Everything here is perfect as it is:
//   one unchanging late-spring day     the world's season, time and weather stay outside; no gesture changes anything
//   the picture lives by itself        the water falls, the pool glints, leaves and light stir, at one calm level
//   she                                sits and watches the water, breathing quietly (owner 2026-10-03: "Let her just
//                                      sit there like this. It is beautiful as it is there now.")
//   a touch anywhere, on her too       nothing: no turn, no notes, no stirring
//   the footpath at the lower left     back to the wood's creek (the only thing that answers a tap)
//
// She is a painted overlay of one patch of the picture (art-src/falls/aunt/rest.png, built by art-src/falls/
// build_aunt.py) so that she can breathe; the plate under her is the painting with her resting. The poses of the
// turn and the smile painted for an earlier plan stay unused in art-src/falls/.

const MOTION_LEVEL = 0.3;                         // one calm, fixed level for the moving painting (art's MOTION: still 0.03, wind 0.6)
const GESTURES = ['swirl', 'patter', 'wipe', 'hand', 'twist', 'slide', 'sun', 'moon'];

// One unchanging late-spring day: what this place is drawn, graded and heard with, whatever the world outside does.
const DAY = {
  season: 'spring', time: 'day', weather: 'clear', hour: 13, light: 1,
  wet: 0, windy: 0, foggy: 0, stormy: 0, snowy: 0, cold: 0, blend: 1, prev: null,
  key: 'spring-day-clear', version: 1,
};

// Where her overlay stands (world units of the 2:1 view, 1000 high): the box of panel 4 of the painting (art-src/falls/
// panels/glade-summer-panels.json: guide x 975 .. 1566.3 of 1774). The overlay is anchored at her seat on the cut
// line (build_aunt.py writes it into place.json); the sprite stands at the same point in the world.
const BOX = { x: 975 * 2000 / 1774, w: (887 * 1024 / 1536) * 2000 / 1774 };   // 1099.2, 666.7
const WAY = [[180, 760], [520, 760], [560, 1000], [150, 1000]];   // the footpath along the brook, lower left

export default {
  id: 'falls',
  name: 'The Waterfall Glade',
  painted: 'falls',
  view: 'glade',
  music: { preset: 'falls' },

  create(engine) {
    let here = false;

    engine.exits.add({ in: 'glade', poly: WAY, to: 'wood', view: 'creek' });

    // every world gesture is heard and answered with nothing: the world keeps its own state outside
    for (const g of GESTURES) engine.gestures.on(g, () => true);

    // ---- the fixed day (until docs/requests/falls-to-engine.md lands as an engine seam)
    const art = engine.art, fx = art.fx;
    let fxTrail = null;
    function quietOn() {
      if (fx && !fxTrail && typeof fx.trail === 'function') { fxTrail = fx.trail; fx.trail = () => {}; }   // no sparks along a finger here
      sendDay();
    }
    function quietOff() {
      if (fx && fxTrail) { fx.trail = fxTrail; fxTrail = null; }
      if (art.compositor) art.compositor.interior = 0;
      const a = engine.audio; if (a && a.setEnv) a.setEnv(engine.env);
    }
    function sendDay() { engine.after(0.05, () => { if (!here) return; const a = engine.audio; if (a && a.setEnv) a.setEnv(DAY); }); }

    function fixPainting(p) {
      if (p._fallsFixed) return; p._fallsFixed = true;
      const draw = p.draw.bind(p);
      p.draw = (g, env, view, t) => draw(g, DAY, view, t);         // the painting of the day, always
      p.gust = () => {}; p.gustEnd = () => {};                         // a finger never stirs the picture
      p.wind = MOTION_LEVEL;                                           // the water and the leaves at one calm level
    }

    return {
      ownWeather: true,                              // no rain, snow or mist is drawn over this picture
      setup(p) {
        fixPainting(p); p.show('glade');
        const a = p.man.sprites.aunt.poses[0].anchor, x = BOX.x + a[0] * BOX.w, y = a[1] * 1000;
        p.add('aunt', { x, y, pose: 'rest', z: 500, touchable: false }).breathe(0.0035, 0.42);   // she sits and breathes
      },
      enter() { here = true; quietOn(); },
      leave() { here = false; quietOff(); },
      onEnv() { if (here) sendDay(); },
      draw() {
        // graded as the day it is, whatever the world's hour (art's painted place set compositor.look this frame)
        const c = art.compositor; if (!c || !here) return;   // once she is left behind, the world's own light again
        if (c.look) c.look.time = 0;
        c.interior = 1;
      },
      tap() { return true; },        // true everywhere, on her too: nothing answers here, not even a soft note
      stroke() { return true; },
      hold() { return true; },
      press() { return false; },
    };
  },
};
