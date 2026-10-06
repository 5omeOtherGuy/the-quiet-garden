// Where things are in the beach's paintings (world units: each view 1000 high, 2000 wide). Measured on the summer day
// paintings (art-src/beach/*-summer.png; one painting pixel = 2000 / 1774 world units).
const curve = (pts) => (x) => {             // a polyline y(x) through [[x, y], ...]
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const a = pts[i - 1], b = pts[i], k = (x - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * k; }
  return pts[pts.length - 1][1];
};

export const SHORE = {
  farY: 485,                                         // where far waves rise out of the open sea
  shore: curve([[225, 586], [451, 618], [789, 648], [1127, 671], [1466, 671], [1747, 676]]),   // the waterline (where the swash begins)
  sea: { x0: 380, x1: 1720 },                        // waves are born across this
  sand: { x0: 120, x1: 1900 },
  lamp: { x: 1640, y: 262 },                         // the lighthouse lamp
  nest: { x: 520, y: 905 },                          // the turtles' nest (summer, hidden in the dry sand)
  moonPath: 615,                                     // x of the sun's and the moon's path on the sea
  bank: { x: 1725, y: 440, r: 160 },                  // the sandbank a storm washes away
  bankFoot: 520,                                      // where the water meets it
  grotto: { x: 1646, y: 448, r: 58 },                // the grotto's mouth, once uncovered
  bankSprite: { x: 1635, y: 519 },                   // where the uncovered-arch piece stands (its foot)
  hover: [1000, 280],
  shipY: 440, shipX: [250, 1450],                    // the ghost ship's way along the horizon (fog only)                                // where gulls hang in a storm
  gullSpots: [[880, 800], [1350, 760], [1180, 900], [640, 850], [1650, 405]],
  waders: [700],
  crab: [1150, 800],
  hermit: [760, 900],
};
export { curve };

// ---- instances (measured on art-src/beach/{pool,grotto,den}.png)
export const POOL = {
  out: [{ x: 0, y: 0, w: 2000, h: 150 }],            // the rim of the pool and the sky in its surface
  box: [300, 300, 1690, 900],                        // where the little fish swim
  anemones: [[420, 640, 0], [650, 820, 1], [1610, 540, 0], [1420, 880, 1], [560, 470, 0]],
  stars: [[1000, 880], [1250, 600]],
  snails: [[460, 880], [1500, 430]],
  hermit: [880, 620],
};
export const GROTTO = {
  out: [{ x: 1510, y: 250, w: 420, h: 330 }],         // the cave's mouth on the right
  pool: { x: 1032, y: 705, rx: 720, ry: 140 },       // the glowing pool
  turtle: [1032, 730],
  light: [372, 113],                                 // where the shaft of light comes in
};
export const DEN = {
  out: [{ x: 90, y: 140, w: 560, h: 360 }],           // the bright gap under the boat's side
  nest: [1127, 650],
  float: [1790, 470],
};

// ---- the rocks and the dunes (measured on rocks-summer.png and dunes-summer.png)
export const ROCKS = {
  lamp: { x: 1530, y: 85 }, door: [1539, 214],
  seal: [400, 470], sealDive: [330, 525], sealSwim: [470, 545], pup: [470, 474],
  corm: [738, 374], gull: [1070, 456], crab: [845, 588],
  breakers: [[338, 496], [507, 496], [981, 494], [203, 631]],
  pool: [1127, 744],
};
export const DUNES = {
  foxPath: [[340, 640], [790, 662], [1130, 640], [1500, 662], [1700, 650]],
  boatGap: [1274, 600],
  lark: [586, 590], larkHigh: 150,
  holes: [[1736, 419], [1787, 413], [1838, 404]],
  toads: [[564, 789], [902, 834], [1240, 812]],
  buntings: [800, 860],
  moths: [1750, 640],
};
