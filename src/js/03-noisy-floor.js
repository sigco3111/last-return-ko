// ---------------------------------------------------------------------------
// Noisy things on the floor: broken glass, a loose floor plate, a spill of empty cans.
//
// Walk or run over one and it makes a noise that carries much further than a footstep, and the Hollow comes to
// look. Crouch and you pick your way through it without a sound. In a scan they show in the warning colour,
// like the ceiling hatches: warning colour on the floor means "this is loud".
//
// The Hollow sets them off too. It does not care; you should, because then you can hear where it is.
//
// They are scattered when a station is built: about half in corridors and on the floor a step or two inside
// doors, where people have to walk, and the rest anywhere. Where they go follows from the station's seed, by
// a sequence of random numbers of its own, so adding them did not change which station a seed builds.
// The numbers are in 00-config.js under "Noisy things on the floor".
// ---------------------------------------------------------------------------

// TWEAK: the kinds. `share` is how often a kind turns up compared with the others. `hint` is what you are told the
// first time you set one off. `ownCaption` and `hollowCaption` name the captions for you and for the Hollow
// setting one off; what those say is in CAPTIONS in 00-config.js.
const NOISY_FLOOR_KINDS = {
  glass: { label: 'broken glass', share: 4.5, hint: 'Broken glass. That carried. Crouch and you can cross it without a sound.', ownCaption: 'ownGlass', hollowCaption: 'hollowOnGlass' },
  plate: { label: 'a loose floor plate', share: 3, hint: 'A loose floor plate. That carried. Crouch and you can cross it without a sound.', ownCaption: 'ownPlate', hollowCaption: 'hollowOnPlate' },
  // Cans are not a patch of floor any more: where the draw says "cans", six real cans are put out, loose objects
  // like any other (08-loose-objects.js), to be kicked or picked up. They keep their place in this table so that
  // every seed still gives glass and plates where it always did.
  cans: { label: 'empty cans', share: 2.5, isLooseObjects: true }
};

// Where the draw put cans: { x, z, index, cans: [{ x, z, isStanding, liesAlongX }] }. One tile each, like a patch.
const noisyFloorCanHeaps = [];

// The patches of this station: { x, z, index, kind }. `index` is the tile; a patch is one tile.
const noisyFloorPatches = [];
// How often each has been set off this descent, for the tests and for debug mode.
const noisyFloorCounts = { byPlayer: 0, byPlayerCrouched: 0, byHollow: 0 };

function findNoisyFloorPatchAt(x, z) {
  const tileX = Math.floor(x), tileZ = Math.floor(z);
  if (!isInsideGrid(tileX, tileZ)) return null;
  const index = tileIndexAt(tileX, tileZ);
  if ((tileFlags[index] & TILE_FLAG_DEBRIS) === 0) return null;
  for (const patch of noisyFloorPatches) if (patch.index === index) return patch;
  return null;
}

// ---- what each kind looks like ----

function addNoisyFloorProps(patch, random) {
  const options = { surfaceClass: SURFACE_HAZARD, blocksMovement: false };
  const floor = tileFloorHeight[patch.index];
  const saved = { turns: placement.turns, offsetX: placement.offsetX, offsetZ: placement.offsetZ, offsetY: placement.offsetY };
  placement.turns = 0; placement.offsetX = 0; placement.offsetZ = 0; placement.offsetY = 0;
  if (patch.kind === 'glass') {
    // A scatter of shards, most of them near the middle.
    for (let shard = 0; shard < 9; shard++) {
      const reach = 0.1 + random() * 0.32, angle = random() * TWO_PI;
      const size = 0.04 + random() * 0.08;
      addBoxProp(patch.x + Math.cos(angle) * reach, floor + 0.008, patch.z + Math.sin(angle) * reach, size, 0.008, size * (0.35 + random() * 0.5),
        Object.assign({ yaw: random() * TWO_PI }, options));
    }
  } else if (patch.kind === 'plate') {
    // One plate lying a little proud of the floor and a little askew, and the two bolts that should be holding it.
    addBoxProp(patch.x, floor + 0.02, patch.z, 0.4, 0.02, 0.4, Object.assign({ yaw: (random() - 0.5) * 0.3 }, options));
    addCylinderProp(AXIS_Y, patch.x - 0.3 + random() * 0.1, floor + 0.01, patch.z + 0.43, 0.02, 0.01, options);
    addCylinderProp(AXIS_Y, patch.x + 0.36, floor + 0.01, patch.z - 0.4 + random() * 0.1, 0.02, 0.01, options);
  } else {
    // Cans: most on their sides, one or two still standing. Only where they go is worked out here (with the
    // same draws as when they were part of the floor); the cans themselves are made as loose objects.
    patch.cans = [];
    for (let can = 0; can < 6; can++) {
      const x = patch.x + (random() - 0.5) * 0.7, z = patch.z + (random() - 0.5) * 0.7;
      if (can < 4) patch.cans.push({ x: x, z: z, isStanding: false, liesAlongX: random() < 0.5 });
      else patch.cans.push({ x: x, z: z, isStanding: true, liesAlongX: false });
    }
  }
  placement.turns = saved.turns; placement.offsetX = saved.offsetX; placement.offsetZ = saved.offsetZ; placement.offsetY = saved.offsetY;
}

// ---- putting them out. Done once for each station, after everything else is built. ----

function clearNoisyFloor() {
  noisyFloorPatches.length = 0;
  noisyFloorCanHeaps.length = 0;
  playerNoisyFloorIndex = -1; hollowNoisyFloorIndex = -1;
  playerNoisyFloorLastTime = -1000; hollowNoisyFloorLastTime = -1000;
}

// Whether a tile will do as a place for one: 0 no, 1 yes, 2 yes and it is somewhere people have to walk
// (a corridor, or the floor a step or two inside a door).
function rateNoisyFloorTile(index) {
  if (tileIsWalkable[index] === 0 || tilePropLists[index]) return 0; // nothing may already stand on it or hang over it
  if (tileFlags[index] & (TILE_FLAG_DOOR | TILE_FLAG_VENT | TILE_FLAG_PIT | TILE_FLAG_WATER | TILE_FLAG_GRATE | TILE_FLAG_HAZARD)) return 0;
  const zoneName = ZONE_NAMES[tileZone[index]] || '';
  if (zoneName === 'LIFT CAR' || zoneName === 'LIFT LOBBY' || zoneName === 'STAIRS') return 0; // not where you start, not on the stairs
  if (zoneName.indexOf('SALVAGE BAY') === 0) return 0; // a salvage bay starts empty
  const tileX = index % GRID_WIDTH, tileZ = (index - tileX) / GRID_WIDTH;
  let isNextToDoor = false, isNearDoor = false;
  for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
    for (let offsetX = -2; offsetX <= 2; offsetX++) {
      const nearX = tileX + offsetX, nearZ = tileZ + offsetZ;
      if (!isInsideGrid(nearX, nearZ)) continue;
      const nearIndex = tileIndexAt(nearX, nearZ);
      if (Math.abs(offsetX) + Math.abs(offsetZ) === 1 && tileIsOpen[nearIndex] !== 0 && Math.abs(tileFloorHeight[nearIndex] - tileFloorHeight[index]) > 0.01) return 0; // a stair
      if (tileFlags[nearIndex] & TILE_FLAG_DOOR) {
        isNearDoor = true;
        if (Math.abs(offsetX) + Math.abs(offsetZ) === 1) isNextToDoor = true;
      }
    }
  }
  if (isNextToDoor) return 0; // not on the doorstep itself: a door that opens for you is noise enough
  for (const interactable of interactables) {
    if (distanceBetweenPoints(interactable.x, interactable.z, tileX + 0.5, tileZ + 0.5) < 1.6) return 0; // not under your feet at something you have to use
  }
  return isNearDoor || zoneName.indexOf('CORRIDOR') >= 0 ? 2 : 1;
}

function placeNoisyFloor() {
  clearNoisyFloor();
  // A sequence of random numbers of its own, started from the station's seed (Kessel-9 has seed 0, so it is the same every time).
  const random = createSeededRandomGenerator(Math.imul(level.seed + 1, 2654435761) ^ 0x5eedf100);
  const wanted = Math.max(TUNING.noisyFloorFewest, Math.round((level.roomCount || 19) * TUNING.noisyFloorPerRoom));
  // Every tile that will do, in two heaps: where people have to walk, and anywhere else. Each heap is put in a
  // random order by giving every tile a drawn number and sorting on that.
  const heaps = { 2: [], 1: [] };
  for (let tileZ = level.boundsMinimumZ; tileZ < level.boundsMaximumZ; tileZ++) {
    for (let tileX = level.boundsMinimumX; tileX < level.boundsMaximumX; tileX++) {
      if (!isInsideGrid(tileX, tileZ)) continue;
      const index = tileIndexAt(tileX, tileZ);
      const rating = rateNoisyFloorTile(index);
      if (rating > 0) heaps[rating].push([random(), index]);
    }
  }
  for (const key of [2, 1]) heaps[key].sort(function (first, second) { return first[0] - second[0] || first[1] - second[1]; });
  const kindKeys = Object.keys(NOISY_FLOOR_KINDS);
  let shareTotal = 0;
  for (const key of kindKeys) shareTotal += NOISY_FLOOR_KINDS[key].share;
  // The next tile of a heap that is far enough from every patch there already is, or -1 when the heap has run out.
  const takeFrom = function (heap) {
    while (heap.length > 0) {
      const index = heap.pop()[1], x = index % GRID_WIDTH + 0.5, z = Math.floor(index / GRID_WIDTH) + 0.5;
      let isTooClose = false;
      for (const patch of noisyFloorPatches) if (distanceBetweenPoints(patch.x, patch.z, x, z) < TUNING.noisyFloorLeastMetresApart) isTooClose = true;
      for (const heap of noisyFloorCanHeaps) if (distanceBetweenPoints(heap.x, heap.z, x, z) < TUNING.noisyFloorLeastMetresApart) isTooClose = true;
      if (!isTooClose) return index;
    }
    return -1;
  };
  while (noisyFloorPatches.length + noisyFloorCanHeaps.length < wanted) {
    // About this share of them go where people have to walk; the rest, anywhere. Whichever heap is asked first,
    // the other is tried if it has nothing left.
    const first = random() < TUNING.noisyFloorShareWhereYouMustWalk ? 2 : 1;
    let index = takeFrom(heaps[first]);
    if (index < 0) index = takeFrom(heaps[3 - first]);
    if (index < 0) break; // the station has no more room for them
    let draw = random() * shareTotal, kind = kindKeys[0];
    for (const key of kindKeys) { draw -= NOISY_FLOOR_KINDS[key].share; if (draw < 0) { kind = key; break; } }
    const patch = { x: index % GRID_WIDTH + 0.5, z: Math.floor(index / GRID_WIDTH) + 0.5, index: index, kind: kind };
    addNoisyFloorProps(patch, random);
    if (NOISY_FLOOR_KINDS[kind].isLooseObjects) { noisyFloorCanHeaps.push(patch); continue; }
    tileFlags[index] |= TILE_FLAG_DEBRIS;
    noisyFloorPatches.push(patch);
  }
  level.noisyFloorCount = noisyFloorPatches.length + noisyFloorCanHeaps.length;
}

// ---- stepping on one ----

// A patch goes off the moment something walks onto it, and again with every footstep taken on it. (Going by
// footsteps alone would let a long stride, a sprint, carry you clean over a patch one tile wide.)
// These two remember which patch the player and the Hollow were on last frame, to notice the moment of stepping on.
let playerNoisyFloorIndex = -1, hollowNoisyFloorIndex = -1;
// When each of them last set one off (game.time), so that one patch cannot go off twice in the same instant.
let playerNoisyFloorLastTime = -1000, hollowNoisyFloorLastTime = -1000;

// Whether something at x, z that was on the patch of tile `index` is still not clear of it. Whoever steps on a
// patch counts as on it until they are a little way past its edge, so shuffling about on the edge of one
// (which the Hollow does a lot, turning and looking) does not set it off over and over.
function isNotYetClearOfNoisyFloorTile(index, x, z) {
  if (index < 0) return false;
  const tileX = index % GRID_WIDTH, tileZ = (index - tileX) / GRID_WIDTH, margin = TUNING.noisyFloorLeaveMetres;
  return x > tileX - margin && x < tileX + 1 + margin && z > tileZ - margin && z < tileZ + 1 + margin;
}

// Whether it is too soon after `lastTime` for a patch to go off again.
function isTooSoonForNoisyFloor(lastTime) {
  return Math.abs(game.time - lastTime) < TUNING.noisyFloorShortestGapSeconds;
}

// Called every frame the player moves. If they have just walked onto a patch, it goes off as a footstep would
// set it off, and the noise is made at once.
function updatePlayerOnNoisyFloor() {
  const patch = findNoisyFloorPatchAt(player.x, player.z);
  let index = patch ? patch.index : -1;
  if (index < 0 && isNotYetClearOfNoisyFloorTile(playerNoisyFloorIndex, player.x, player.z)) index = playerNoisyFloorIndex;
  if (index >= 0 && index !== playerNoisyFloorIndex) {
    const radius = stepPlayerOnNoisyFloor();
    if (radius > 0) emitNoise(player.x, player.z, radius);
    player.strideDistance = 0; // that was a step: the next one comes a stride later
  }
  playerNoisyFloorIndex = index;
}

// The same for the Hollow, called every frame it is on its feet.
function updateHollowOnNoisyFloor(x, z, isHunting) {
  const patch = findNoisyFloorPatchAt(x, z);
  let index = patch ? patch.index : -1;
  if (index < 0 && isNotYetClearOfNoisyFloorTile(hollowNoisyFloorIndex, x, z)) index = hollowNoisyFloorIndex;
  if (index >= 0 && index !== hollowNoisyFloorIndex) stepHollowOnNoisyFloor(x, z, isHunting);
  hollowNoisyFloorIndex = index;
}

// Called when the player walks onto a patch and for every footstep taken on one. Returns how far that carries
// (and plays the sound of it), or 0 if they are not on a patch, are crouched, or it went off only an instant ago.
function stepPlayerOnNoisyFloor() {
  const patch = findNoisyFloorPatchAt(player.x, player.z);
  if (!patch || isTooSoonForNoisyFloor(playerNoisyFloorLastTime)) return 0;
  playerNoisyFloorLastTime = game.time;
  if (player.isCrouching) {
    // Picking your way through: a small sound for you, nothing that carries.
    noisyFloorCounts.byPlayerCrouched++;
    playNoisyFloorSound(patch.kind, 0.18, null);
    return 0;
  }
  noisyFloorCounts.byPlayer++;
  playNoisyFloorSound(patch.kind, player.isSprinting ? 1 : 0.75, null);
  showCaption(NOISY_FLOOR_KINDS[patch.kind].ownCaption);
  if (!game.hasShownNoisyFloorHint) {
    game.hasShownNoisyFloorHint = true;
    showMessage(NOISY_FLOOR_KINDS[patch.kind].hint, 6, 'warning');
  }
  return player.isSprinting ? TUNING.noiseRadiusNoisyFloorSprint : TUNING.noiseRadiusNoisyFloorWalk;
}

// Called for every footstep of the Hollow. It makes the same noise, from where it is: your warning.
function stepHollowOnNoisyFloor(x, z, isHunting) {
  const patch = findNoisyFloorPatchAt(x, z);
  if (!patch || isTooSoonForNoisyFloor(hollowNoisyFloorLastTime)) return;
  hollowNoisyFloorLastTime = game.time;
  noisyFloorCounts.byHollow++;
  playNoisyFloorSound(patch.kind, isHunting ? 1.9 : 1.6, patch); // louder than yours on purpose: it is heavier, and this is your warning
  showCaption(NOISY_FLOOR_KINDS[patch.kind].hollowCaption, patch);
}

// Checks the patches of the station that is loaded. Returns a list of problems (empty when fine).
function auditNoisyFloor() {
  const problems = [];
  if (noisyFloorPatches.length + noisyFloorCanHeaps.length < TUNING.noisyFloorFewest) problems.push('only ' + (noisyFloorPatches.length + noisyFloorCanHeaps.length) + ' noisy patches of floor and heaps of cans, fewer than ' + TUNING.noisyFloorFewest);
  for (const patch of noisyFloorPatches) {
    const where = patch.kind + ' at ' + patch.x + ', ' + patch.z;
    if (tileIsWalkable[patch.index] === 0) problems.push(where + ' is on floor that cannot be walked on');
    if (tileFlags[patch.index] & (TILE_FLAG_DOOR | TILE_FLAG_VENT | TILE_FLAG_PIT | TILE_FLAG_WATER)) problems.push(where + ' is in a doorway, a vent, a pit or water');
    if ((tileFlags[patch.index] & TILE_FLAG_DEBRIS) === 0) problems.push(where + ' is not marked on the floor');
    const zoneName = ZONE_NAMES[tileZone[patch.index]] || '';
    if (zoneName === 'LIFT CAR' || zoneName === 'LIFT LOBBY') problems.push(where + ' is where the player starts');
    for (const other of noisyFloorPatches) {
      if (other !== patch && distanceBetweenPoints(other.x, other.z, patch.x, patch.z) < TUNING.noisyFloorLeastMetresApart - 0.01) problems.push(where + ' is too close to another');
    }
  }
  return problems;
}
