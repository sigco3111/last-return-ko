// ---------------------------------------------------------------------------
// The Hollow and locked doors.
//
// The Hollow has no keycard and cannot switch the power on. So:
//
//   - A door that opens by itself opens for it. A powered door opens for it once the mains is on.
//   - A keycard door never opens for it, and neither does the lift door. It can only go through one of those
//     while it is standing open for someone else, and a door never closes on it.
//
// That would shut it into one part of the station, so it has a way round of its own: the crawlspace above the
// ceilings. Each part of the station that locked doors close off has at least one ceiling hatch. The Hollow
// reaches up into a hatch, crawls to another, and drops out of it. That is slow, and it is loud: you hear it
// overhead all the way, and the hatch it is about to come out of rattles for a while before it does.
//
// To its path finding the crawlspace is a set of expensive short cuts between hatches, so it only goes up there
// when walking is much further, or impossible. The numbers are in 00-config.js under "The crawlspace".
// ---------------------------------------------------------------------------

// 1 for the tile of every door that is closed to the Hollow at this moment.
const tileBlocksHollow = new Uint8Array(TILE_COUNT);
// Goes up by one whenever a door opens or closes to the Hollow, so that it knows to work out its way again.
let hollowNavigationVersion = 0;

// The ceiling hatches of this station: { x, z, index, part, ceilingY }.
// `index` is the tile, `part` the number of the locked-off part of the station the hatch is in.
const hollowHatches = [];
// For every tile, the number of the part of the station it is in (0: none). Parts are what is left when every
// keycard door and the lift door is shut.
const tileHollowPart = new Int16Array(TILE_COUNT);
let hollowPartCount = 0;

const CRAWL_PHASE_CLIMBING = 0;   // under the hatch, reaching up
const CRAWL_PHASE_TRAVELLING = 1; // above the ceiling, on its way
const CRAWL_PHASE_RATTLING = 2;   // above the exit hatch, about to drop
const CRAWL_PHASE_NAMES = ['climbing in', 'crawling overhead', 'at the hatch, about to drop'];

// ---------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------

// True if this door opens for the Hollow when it walks up to it.
function canHollowOpenDoor(door) {
  if (door.kind === DOOR_KIND_AUTOMATIC) return true;
  if (door.kind === DOOR_KIND_POWERED) return game.flags.powerOn;
  return false; // a keycard door, or the lift door
}

// True if the Hollow can get through this door right now: it opens for it, or it is standing open anyway.
function isDoorPassableToHollow(door) {
  return canHollowOpenDoor(door) || door.openFraction > 0.6;
}

// Brings tileBlocksHollow up to date with the doors. Called every frame after the doors have moved; cheap.
function refreshHollowDoorBlocks() {
  let hasChanged = false;
  for (const door of doors) {
    const index = tileIndexAt(door.tileX, door.tileZ);
    const isBlocked = isDoorPassableToHollow(door) ? 0 : 1;
    if (tileBlocksHollow[index] !== isBlocked) { tileBlocksHollow[index] = isBlocked; hasChanged = true; }
  }
  if (hasChanged) hollowNavigationVersion++;
}

// True when a straight walk between two points stays on walkable tiles and goes through no door that is shut to the Hollow.
function hasClearHollowWalkingLine(fromX, fromZ, toX, toZ) {
  const distance = distanceBetweenPoints(fromX, fromZ, toX, toZ);
  const stepCount = Math.max(1, Math.ceil(distance / 0.3));
  for (let step = 0; step <= stepCount; step++) {
    const amount = step / stepCount;
    const tileX = Math.floor(fromX + (toX - fromX) * amount), tileZ = Math.floor(fromZ + (toZ - fromZ) * amount);
    if (!isWalkableAt(tileX, tileZ) || tileBlocksHollow[tileIndexAt(tileX, tileZ)] === 1) return false;
  }
  return true;
}

// True when a straight line between two points crosses no wall and no door that is shut to the Hollow.
// (Unlike the function above it does not mind furniture: it is for getting the Hollow back onto walkable
// floor when it has ended up standing where it cannot path from.)
function isOpenGroundBetween(fromX, fromZ, toX, toZ) {
  const distance = distanceBetweenPoints(fromX, fromZ, toX, toZ);
  const stepCount = Math.max(1, Math.ceil(distance / 0.3));
  for (let step = 0; step <= stepCount; step++) {
    const amount = step / stepCount;
    const tileX = Math.floor(fromX + (toX - fromX) * amount), tileZ = Math.floor(fromZ + (toZ - fromZ) * amount);
    if (!isInsideGrid(tileX, tileZ)) return false;
    const index = tileIndexAt(tileX, tileZ);
    if (tileIsOpen[index] === 0 || tileBlocksHollow[index] === 1) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Path finding for the Hollow: walking, plus the crawlspace
// ---------------------------------------------------------------------------

// What a crawl between two hatches costs, in steps of walking. See hollowCrawlFixedSteps in 00-config.js.
function getHollowCrawlSteps(firstHatch, secondHatch) {
  return Math.round(TUNING.hollowCrawlFixedSteps +
    distanceBetweenPoints(firstHatch.x, firstHatch.z, secondHatch.x, secondHatch.z) * TUNING.hollowCrawlStepsPerMetre);
}

// Spreads walking distance outward from one tile that already has its distance in `field`, lowering any tile
// it can reach more cheaply. The Hollow's rules: not through a door shut to it, not into the calibration store.
function spreadHollowDistance(field, startIndex) {
  let queueHead = 0, queueTail = 0;
  navigationQueue[queueTail++] = startIndex;
  while (queueHead < queueTail) {
    const index = navigationQueue[queueHead++];
    const nextDistance = field[index] + 1;
    const tileX = index % GRID_WIDTH, tileZ = (index - tileX) / GRID_WIDTH;
    for (let direction = 0; direction < 4; direction++) {
      const neighbourX = tileX + (direction === 0 ? 1 : direction === 1 ? -1 : 0);
      const neighbourZ = tileZ + (direction === 2 ? 1 : direction === 3 ? -1 : 0);
      if (!isInsideGrid(neighbourX, neighbourZ)) continue;
      const neighbourIndex = neighbourZ * GRID_WIDTH + neighbourX;
      if (tileIsWalkable[neighbourIndex] === 0 || field[neighbourIndex] <= nextDistance) continue;
      if (tileBlocksHollow[neighbourIndex] === 1) continue;
      if (Math.abs(tileFloorHeight[neighbourIndex] - tileFloorHeight[index]) > MAXIMUM_STEP_HEIGHT) continue;
      if (level.storeZone && tileZone[neighbourIndex] === level.storeZone) continue;
      field[neighbourIndex] = nextDistance;
      navigationQueue[queueTail++] = neighbourIndex;
    }
  }
}

// How far the Hollow has to go from every tile to reach the target tile, in steps: on foot where it can, and
// through the crawlspace where that is cheaper or the only way. `useCrawlspace` false leaves the crawlspace out
// (used to check that the locks really do stop it).
function computeHollowDistanceField(field, targetIndex, useCrawlspace) {
  field.fill(NAVIGATION_UNREACHABLE);
  if (targetIndex < 0) return;
  field[targetIndex] = 0;
  spreadHollowDistance(field, targetIndex);
  if (useCrawlspace === false) return;
  // A hatch can also be reached from any other hatch, at the price of the crawl. Each time that turns out
  // cheaper than what a hatch had, the saving is spread outward from it on foot. Repeated until nothing improves.
  for (let pass = 0; pass <= hollowHatches.length; pass++) {
    let hasImproved = false;
    for (const hatch of hollowHatches) {
      let best = field[hatch.index];
      for (const other of hollowHatches) {
        if (other === hatch || field[other.index] >= NAVIGATION_UNREACHABLE) continue;
        best = Math.min(best, field[other.index] + getHollowCrawlSteps(hatch, other));
      }
      if (best < field[hatch.index]) {
        field[hatch.index] = best;
        spreadHollowDistance(field, hatch.index);
        hasImproved = true;
      }
    }
    if (!hasImproved) break;
  }
}

function findHollowHatchAtTile(tileIndex) {
  for (const hatch of hollowHatches) if (hatch.index === tileIndex) return hatch;
  return null;
}

// Standing on a hatch tile: if the shortest way on from here is up through the hatch, returns the hatch to
// crawl to. Otherwise (walking on is as good or better) returns null.
function findHollowCrawlFrom(hatch, field) {
  const tileX = hatch.index % GRID_WIDTH, tileZ = (hatch.index - tileX) / GRID_WIDTH;
  let bestOnFoot = NAVIGATION_UNREACHABLE;
  for (const step of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (isInsideGrid(tileX + step[0], tileZ + step[1])) bestOnFoot = Math.min(bestOnFoot, field[tileIndexAt(tileX + step[0], tileZ + step[1])]);
  }
  let bestHatch = null, bestThroughCeiling = NAVIGATION_UNREACHABLE;
  for (const other of hollowHatches) {
    if (other === hatch || field[other.index] >= NAVIGATION_UNREACHABLE) continue;
    const steps = field[other.index] + getHollowCrawlSteps(hatch, other);
    if (steps < bestThroughCeiling) { bestThroughCeiling = steps; bestHatch = other; }
  }
  return bestThroughCeiling < bestOnFoot + 1 ? bestHatch : null;
}

// ---------------------------------------------------------------------------
// In the crawlspace
// ---------------------------------------------------------------------------

function isHollowInCrawlspace() {
  return hollow.crawlspace !== null;
}

// Takes the Hollow out of the crawlspace at once, wherever it was (it is being sent somewhere, or removed).
function cancelHollowCrawl() {
  hollow.crawlspace = null;
}

function beginHollowCrawl(fromHatch, toHatch) {
  const metres = distanceBetweenPoints(fromHatch.x, fromHatch.z, toHatch.x, toHatch.z);
  hollow.crawlspace = {
    from: fromHatch, to: toHatch,
    phase: CRAWL_PHASE_CLIMBING,
    timer: 0,                       // seconds spent in this phase
    travelSeconds: metres / Math.max(0.2, TUNING.hollowCrawlSpeed * game.difficulty.hollowSpeedFactor),
    soundTimer: 0
  };
  hollow.figure.x = fromHatch.x; hollow.figure.z = fromHatch.z;
  playHatchRattle(fromHatch.x, fromHatch.z, 1);
}

// One frame of the Hollow going through the crawlspace. While this runs it does nothing else: it cannot be
// scanned once it is up there, it cannot catch you, and it does not change its mind about where it comes out.
function updateHollowInCrawlspace(dt) {
  const crawl = hollow.crawlspace, figure = hollow.figure;
  figure.hitsThisFrame = 0;
  hollow.currentSpeed = 0;
  hollow.heldAmount = 0; hollow.wasInBeam = false;
  crawl.timer += dt;
  crawl.soundTimer -= dt;

  if (crawl.phase === CRAWL_PHASE_CLIMBING) {
    // Drawn up to its full height under the hatch, arms going up into it.
    const pose = figure.pose;
    const fit = fitHollowUnderCeiling(figure, getHeadroomAt(figure.x, figure.z), 1, 0.02);
    pose.stretch = approachValue(pose.stretch, fit.stretch, dt * 2.5);
    pose.stoop = approachValue(pose.stoop, 0, dt * 3);
    pose.armRaise = approachValue(pose.armRaise, 2.6, dt * 4); // straight up
    pose.elbowBend = 0.1; pose.legSwing = 0; pose.armSwing = 0; pose.lean = 0;
    updateFigureCapsules(figure);
    if (crawl.timer >= TUNING.hollowCrawlClimbSeconds) {
      crawl.phase = CRAWL_PHASE_TRAVELLING; crawl.timer = 0; crawl.soundTimer = 0;
      setFigureRaycastable(figure, false); // gone into the ceiling: nothing for a scan to find
    }
    return;
  }

  if (crawl.phase === CRAWL_PHASE_TRAVELLING) {
    const amount = crawl.travelSeconds > 0 ? Math.min(1, crawl.timer / crawl.travelSeconds) : 1;
    figure.x = interpolateLinear(crawl.from.x, crawl.to.x, amount);
    figure.z = interpolateLinear(crawl.from.z, crawl.to.z, amount);
    if (crawl.soundTimer <= 0) {
      crawl.soundTimer = 0.42 + Math.random() * 0.14;
      playHollowCeilingStep(figure.x, figure.z, hollow.state === HOLLOW_STATE_HUNT ? 1 : 0.8);
      if (hollow.turnCaptionCooldown <= 0 && distanceBetweenPoints(figure.x, figure.z, player.x, player.z) < 12) {
        showCaption('[something crawls overhead]');
        hollow.turnCaptionCooldown = 15;
      }
    }
    if (amount >= 1) { crawl.phase = CRAWL_PHASE_RATTLING; crawl.timer = 0; crawl.soundTimer = 0; }
    return;
  }

  // Above the exit hatch. It rattles: that is the warning. Then it drops.
  figure.x = crawl.to.x; figure.z = crawl.to.z;
  if (crawl.soundTimer <= 0) {
    crawl.soundTimer = 0.55;
    playHatchRattle(crawl.to.x, crawl.to.z, 0.7 + 0.3 * crawl.timer / Math.max(0.1, TUNING.hollowCrawlDropWarningSeconds));
  }
  if (crawl.timer >= TUNING.hollowCrawlDropWarningSeconds) {
    hollow.crawlspace = null;
    // Landed in a crouch; it straightens up as it moves off.
    figure.pose.stoop = 1; figure.pose.stretch = 0; figure.pose.armRaise = 0.3; figure.pose.kneeBend = 0.5;
    hollow.armRaise = 0.3;
    updateFigureCapsules(figure);
    setFigureRaycastable(figure, true);
    hollow.graceTimer = Math.max(hollow.graceTimer, TUNING.hollowCrawlLandingGraceSeconds);
    hollow.fieldTargetIndex = -1; // work out the way again from where it now is
    playHollowFootstep(figure.x, figure.z, 1.6);
    playHatchRattle(crawl.to.x, crawl.to.z, 1.2);
  }
}

// ---------------------------------------------------------------------------
// Putting the hatches in. Done once for each station, after everything else is built.
// ---------------------------------------------------------------------------

function clearHollowHatches() {
  hollowHatches.length = 0;
  tileHollowPart.fill(0);
  tileBlocksHollow.fill(0);
  hollowPartCount = 0;
  hollowNavigationVersion++;
}

// True for a door that stays shut to the Hollow whatever happens: a keycard door, the lift door.
// (A powered door does not count. The Hollow only comes once the mains is on, and from then on those open for it.)
function isLockingDoorKind(kind) {
  return kind === DOOR_KIND_KEYCARD || kind === DOOR_KIND_LIFT;
}

// A tile the Hollow may ever stand on: walkable, not in the calibration store, not in the lift car.
function isHollowGroundTile(index) {
  if (tileIsWalkable[index] === 0) return false;
  if (level.storeZone && tileZone[index] === level.storeZone) return false;
  return ZONE_NAMES[tileZone[index]] !== 'LIFT CAR';
}

// Numbers the parts of the station that are cut off from each other when every locking door is shut.
// Returns, for each part (index 0 unused), the list of its tile indexes.
function findHollowParts() {
  tileHollowPart.fill(0);
  const isLockingDoorTile = new Uint8Array(TILE_COUNT);
  for (const door of doors) if (isLockingDoorKind(door.kind)) isLockingDoorTile[tileIndexAt(door.tileX, door.tileZ)] = 1;
  const parts = [null];
  for (let startIndex = 0; startIndex < TILE_COUNT; startIndex++) {
    if (tileHollowPart[startIndex] !== 0 || isLockingDoorTile[startIndex] === 1 || !isHollowGroundTile(startIndex)) continue;
    const partNumber = parts.length, tiles = [];
    let queueHead = 0, queueTail = 0;
    navigationQueue[queueTail++] = startIndex;
    tileHollowPart[startIndex] = partNumber;
    while (queueHead < queueTail) {
      const index = navigationQueue[queueHead++];
      tiles.push(index);
      const tileX = index % GRID_WIDTH, tileZ = (index - tileX) / GRID_WIDTH;
      for (let direction = 0; direction < 4; direction++) {
        const neighbourX = tileX + (direction === 0 ? 1 : direction === 1 ? -1 : 0);
        const neighbourZ = tileZ + (direction === 2 ? 1 : direction === 3 ? -1 : 0);
        if (!isInsideGrid(neighbourX, neighbourZ)) continue;
        const neighbourIndex = neighbourZ * GRID_WIDTH + neighbourX;
        if (tileHollowPart[neighbourIndex] !== 0 || isLockingDoorTile[neighbourIndex] === 1 || !isHollowGroundTile(neighbourIndex)) continue;
        if (Math.abs(tileFloorHeight[neighbourIndex] - tileFloorHeight[index]) > MAXIMUM_STEP_HEIGHT) continue;
        tileHollowPart[neighbourIndex] = partNumber;
        navigationQueue[queueTail++] = neighbourIndex;
      }
    }
    parts.push(tiles);
  }
  hollowPartCount = parts.length - 1;
  return parts;
}

// How good a tile is as a place for a hatch, from 3 (ideal) down to 1 (it will do), or 0 (no).
//   3: level floor, a ceiling of ordinary height, nothing standing on it or hanging over it, two tiles clear
//      of every door, and not in the lift lobby
//   2: the same, but it may be next to a door or in the lobby
//   1: any level floor with standing room, even under water
function rateHollowHatchTile(index) {
  const tileX = index % GRID_WIDTH, tileZ = (index - tileX) / GRID_WIDTH;
  if (tileFlags[index] & (TILE_FLAG_DOOR | TILE_FLAG_VENT | TILE_FLAG_PIT)) return 0;
  const headroom = tileCeilingHeight[index] - tileFloorHeight[index];
  if (headroom < 1.9) return 0;
  for (const step of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nearX = tileX + step[0], nearZ = tileZ + step[1];
    if (!isInsideGrid(nearX, nearZ)) continue;
    const nearIndex = tileIndexAt(nearX, nearZ);
    if (tileIsOpen[nearIndex] !== 0 && Math.abs(tileFloorHeight[nearIndex] - tileFloorHeight[index]) > 0.01) return 0; // a stair
  }
  // Standing water, an odd ceiling or something in the way: only if the part has nothing better (a flooded sump).
  if (headroom < 2.2 || headroom > 3.4 || tilePropLists[index] || (tileFlags[index] & TILE_FLAG_WATER)) return 1;
  let isNearDoor = false;
  for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
    for (let offsetX = -2; offsetX <= 2; offsetX++) {
      const nearX = tileX + offsetX, nearZ = tileZ + offsetZ;
      if (isInsideGrid(nearX, nearZ) && (tileFlags[tileIndexAt(nearX, nearZ)] & TILE_FLAG_DOOR)) isNearDoor = true;
    }
  }
  return isNearDoor || ZONE_NAMES[tileZone[index]] === 'LIFT LOBBY' ? 2 : 3;
}

// The hatch itself: a square frame let into the ceiling, with its cover hanging down from one edge.
// In the scan it shows in the warning colour, so that you can learn what one looks like and where they are.
function addHollowHatchProps(tileX, tileZ, ceilingY) {
  const saved = { turns: placement.turns, offsetX: placement.offsetX, offsetZ: placement.offsetZ, offsetY: placement.offsetY };
  placement.turns = 0; placement.offsetX = 0; placement.offsetZ = 0; placement.offsetY = 0;
  const options = { surfaceClass: SURFACE_HAZARD, blocksMovement: false };
  const low = ceilingY - 0.07, minimumX = tileX + 0.05, maximumX = tileX + 0.95, minimumZ = tileZ + 0.05, maximumZ = tileZ + 0.95;
  addBoxBetween(minimumX, low, minimumZ, maximumX, ceilingY, minimumZ + 0.09, options);
  addBoxBetween(minimumX, low, maximumZ - 0.09, maximumX, ceilingY, maximumZ, options);
  addBoxBetween(minimumX, low, minimumZ, minimumX + 0.09, ceilingY, maximumZ, options);
  addBoxBetween(maximumX - 0.09, low, minimumZ, maximumX, ceilingY, maximumZ, options);
  // The cover, hanging open from the edge.
  addBoxBetween(maximumX - 0.12, ceilingY - 0.62, minimumZ + 0.08, maximumX - 0.09, ceilingY - 0.05, maximumZ - 0.08, options);
  placement.turns = saved.turns; placement.offsetX = saved.offsetX; placement.offsetZ = saved.offsetZ; placement.offsetY = saved.offsetY;
}

// Gives every part of the station at least one hatch, and the larger parts more, spread out.
// Nothing here is left to chance: the same station always gets the same hatches.
function placeHollowHatches() {
  clearHollowHatches();
  const parts = findHollowParts();
  // The tiles of locking doors, to find the spot in each part that is deepest inside it.
  const lockingDoors = doors.filter(function (door) { return isLockingDoorKind(door.kind); });
  for (let partNumber = 1; partNumber < parts.length; partNumber++) {
    const tiles = parts[partNumber];
    // The best-rated tiles this part has.
    let bestRating = 0;
    const ratings = tiles.map(function (index) { const rating = rateHollowHatchTile(index); bestRating = Math.max(bestRating, rating); return rating; });
    if (bestRating === 0) continue; // nowhere at all to stand under one: the audit reports this part
    const candidates = tiles.filter(function (index, position) { return ratings[position] === bestRating; });
    const wanted = clampNumber(Math.round(tiles.length / TUNING.hollowHatchTilesPerExtra), 1, TUNING.hollowHatchMostPerPart);
    const chosen = [];
    for (let count = 0; count < wanted; count++) {
      let bestIndex = -1, bestScore = -Infinity;
      for (const index of candidates) {
        const x = index % GRID_WIDTH + 0.5, z = Math.floor(index / GRID_WIDTH) + 0.5;
        let score;
        if (chosen.length === 0) {
          // The first: as far as it can be from every locking door. Deep inside, not on the doorstep.
          score = 60;
          for (const door of lockingDoors) score = Math.min(score, distanceBetweenPoints(x, z, door.centerX, door.centerZ));
        } else {
          // The others: as far as they can be from the hatches this part already has.
          score = Infinity;
          for (const hatch of chosen) score = Math.min(score, distanceBetweenPoints(x, z, hatch.x, hatch.z));
          if (score < TUNING.hollowHatchLeastMetresApart) continue;
        }
        if (score > bestScore) { bestScore = score; bestIndex = index; }
      }
      if (bestIndex < 0) break;
      const tileX = bestIndex % GRID_WIDTH, tileZ = (bestIndex - tileX) / GRID_WIDTH;
      const hatch = { x: tileX + 0.5, z: tileZ + 0.5, index: bestIndex, part: partNumber, ceilingY: tileCeilingHeight[bestIndex] };
      addHollowHatchProps(tileX, tileZ, hatch.ceilingY);
      chosen.push(hatch);
      hollowHatches.push(hatch);
    }
  }
  level.hatchCount = hollowHatches.length;
  refreshHollowDoorBlocks();
}

// Checks that the locks stop the Hollow and the crawlspace does not. Returns a list of problems (empty when fine).
function auditHollowRoutes() {
  const problems = [];
  // As at the worst moment for it once the mains is on: every keycard door and the lift door shut.
  const savedBlocks = tileBlocksHollow.slice();
  for (const door of doors) tileBlocksHollow[tileIndexAt(door.tileX, door.tileZ)] = isLockingDoorKind(door.kind) ? 1 : 0;
  const hatchesInPart = new Array(hollowPartCount + 1).fill(0);
  for (const hatch of hollowHatches) {
    hatchesInPart[hatch.part]++;
    if (tileIsWalkable[hatch.index] === 0) problems.push('the hatch at ' + hatch.x + ', ' + hatch.z + ' is over floor that cannot be walked on');
    if (level.storeZone && tileZone[hatch.index] === level.storeZone) problems.push('a hatch is in the calibration store');
    if (ZONE_NAMES[tileZone[hatch.index]] === 'LIFT CAR') problems.push('a hatch is in the lift car');
    if (tileFlags[hatch.index] & (TILE_FLAG_DOOR | TILE_FLAG_VENT | TILE_FLAG_PIT)) problems.push('a hatch is over a doorway, a vent or a pit');
  }
  for (let partNumber = 1; partNumber <= hollowPartCount; partNumber++) {
    if (hatchesInPart[partNumber] === 0) problems.push('part ' + partNumber + ' of the station has no hatch: the Hollow could never get in or out of it');
  }
  const startIndex = findNearestWalkableTileIndex(HOLLOW_SPAWN_POSITION.x, HOLLOW_SPAWN_POSITION.z);
  const field = new Int16Array(TILE_COUNT);
  computeHollowDistanceField(field, startIndex, true);
  let unreachable = 0, partsReachedOnFoot = 0;
  for (let index = 0; index < TILE_COUNT; index++) {
    if (tileHollowPart[index] !== 0 && field[index] >= NAVIGATION_UNREACHABLE) unreachable++;
  }
  if (unreachable > 0) problems.push(unreachable + ' tile(s) the Hollow can never reach, even through the crawlspace');
  // And without the crawlspace it must be shut into the part it starts in, if there is more than one part.
  computeHollowDistanceField(field, startIndex, false);
  const reachedParts = new Set();
  for (let index = 0; index < TILE_COUNT; index++) if (tileHollowPart[index] !== 0 && field[index] < NAVIGATION_UNREACHABLE) reachedParts.add(tileHollowPart[index]);
  partsReachedOnFoot = reachedParts.size;
  if (hollowPartCount > 1 && partsReachedOnFoot !== 1) problems.push('with every lock shut the Hollow can still walk into ' + partsReachedOnFoot + ' parts of the station');
  tileBlocksHollow.set(savedBlocks);
  return problems;
}
