// What grows under the child's finger on the meadow, by season (pieces from art-src/meadow, sets in place.json).
// Heads and stems are painted pieces; code combines, scales, leans and sways them (web/src/art/grow.js Field).
export function flowerKinds(p) {
  const stems = (a, b) => [`stem-${a}`, `stem-${b}`];
  const has = (n) => !!p.man.sprites[n];
  const k = [
    { heads: p.set('head-poppy'), stems: stems(1, 6), h: [95, 150], head: 50, weight: 3, seasons: ['summer'] },
    { heads: p.set('head-daisy'), stems: stems(3, 8), h: [80, 130], head: 42, weight: 3, seasons: ['summer', 'spring'] },
    { heads: p.set('head-cornflower'), stems: stems(2, 7), h: [90, 140], head: 42, weight: 2, seasons: ['summer'] },
    { heads: p.set('head-buttercup'), stems: stems(4, 9), h: [70, 120], head: 32, weight: 2, seasons: ['summer', 'spring'] },
    { heads: p.set('head-clover'), stems: stems(5, 10), h: [50, 85], head: 34, weight: 1.5, seasons: ['summer'] },
    { heads: ['bud-1', 'bud-2'], stems: stems(1, 6), h: [80, 120], head: 46, weight: 0.8, seasons: ['summer'] },
    { heads: p.set('blades'), h: [0, 0], head: 62, weight: 1.6, seasons: ['spring', 'summer'] },
    { heads: p.set('snowdrop'), h: [0, 0], head: 70, weight: 3, seasons: ['spring', 'winter'] },
    { heads: p.set('crocus'), h: [0, 0], head: 62, weight: 3, seasons: ['spring'] },
    { heads: p.set('primrose-head'), stems: stems(3, 8), h: [30, 52], head: 30, weight: 2, seasons: ['spring'] },
    { heads: ['mushroom'], h: [0, 0], head: 62, weight: 1, seasons: ['autumn'], lean: 0.05 },
    { heads: ['drygrass'], h: [0, 0], head: 105, weight: 2, seasons: ['autumn'] },
    { heads: ['teasel-dry'], h: [0, 0], head: 150, weight: 0.7, seasons: ['autumn'], lean: 0.06 },
    { heads: ['rosehip'], h: [0, 0], head: 100, weight: 0.6, seasons: ['autumn'] },
    { heads: ['snowgrass'], h: [0, 0], head: 80, weight: 1.2, seasons: ['winter'], lean: 0.04 },
    { heads: ['berrytwig'], h: [0, 0], head: 82, weight: 1, seasons: ['winter'], lean: 0.05 },
    { heads: ['teasel-snow'], h: [0, 0], head: 150, weight: 0.5, seasons: ['winter'], lean: 0.05 },
  ];
  if (has('dandelion-flower')) k.push({ heads: ['dandelion-flower'], h: [0, 0], head: 90, weight: 1.2, seasons: ['spring', 'summer'], lean: 0.05 });
  return k.filter((x) => x.heads.length && x.heads.every(has));
}
