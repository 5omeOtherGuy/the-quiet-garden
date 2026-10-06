// The ways between the beach's views and out of the beach (world units of each view's painting).
export const EXITS = [
  // shore: the path between the dunes (left) -> dunes; the rocks at the headland's foot and at the right edge -> rocks
  // (widened 2026-10-03 by the meadow worker, review sol-painted 2: on to the right along the dune's seaward slope,
  // then over the wet sand at the dunes' foot to x 452, so it shows on 4:3 screens: their frame of the shore starts
  // at x 333 today (253 once the shore's own safe area is used); clear of the sea's open water and the other exits)
  { in: 'shore', poly: [[96, 398], [246, 396], [290, 438], [342, 508], [372, 578], [452, 622], [452, 720], [86, 720]], view: 'dunes' },
  { in: 'shore', poly: [[1388, 418], [1532, 404], [1540, 474], [1384, 482]], view: 'rocks' },
  { in: 'shore', poly: [[1790, 486], [2000, 470], [2000, 660], [1764, 646]], view: 'rocks' },
  // rocks: the sand at the bottom left -> back to the shore; the big rock pool -> into it
  { in: 'rocks', poly: [[0, 650], [210, 640], [280, 820], [0, 870]], view: 'shore' },
  { in: 'rocks', poly: [[760, 650], [1500, 640], [1560, 860], [800, 880]], inst: 'pool' },
  // dunes: the glimpse of the sea between the dunes -> back to the shore; the gap under the old boat -> the den;
  // over the dune ridge behind the boat -> inland to the meadow
  { in: 'dunes', poly: [[150, 500], [440, 500], [450, 600], [150, 610]], view: 'shore' },
  { in: 'dunes', poly: [[1200, 570], [1350, 570], [1350, 625], [1200, 625]], inst: 'den' },
  { in: 'dunes', poly: [[1000, 400], [1350, 385], [1360, 445], [1000, 470]], to: 'meadow', view: 'pond' },   // over the ridge, back to the cottage hill
];
