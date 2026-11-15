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

// The ceiling hatches of this station: { x, z, index, part, ceilingY, isOpen, cover }.
// `isOpen` is false until the Hollow has used the hatch once; `cover` is the part of it that moves.
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
  // The first time through a hatch it has to force the cover, and that is loud. After that the cover only rattles.
  if (fromHatch.isOpen) { playHatchRattle(fromHatch.x, fromHatch.z, 1); showCaption('hatchRattle', fromHatch); }
  else forceHollowHatchOpen(fromHatch, false);
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
    // Pulling itself up and in takes a moment, and you hear it: a scrabble on the ceiling right at the hatch.
    if (crawl.timer > 0.4 && crawl.soundTimer <= 0) {
      crawl.soundTimer = 0.34;
      playHollowCeilingStep(figure.x, figure.z, 0.7);
      showCaption('hollowOverhead', figure);
    }
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
      showCaption('hollowOverhead', figure);
    }
    if (amount >= 1) { crawl.phase = CRAWL_PHASE_RATTLING; crawl.timer = 0; crawl.soundTimer = 0; }
    return;
  }

  // Above the exit hatch. It rattles: that is the warning. Then it drops.
  figure.x = crawl.to.x; figure.z = crawl.to.z;
  if (crawl.soundTimer <= 0) {
    crawl.soundTimer = 0.55;
    playHatchRattle(crawl.to.x, crawl.to.z, 0.7 + 0.3 * crawl.timer / Math.max(0.1, TUNING.hollowCrawlDropWarningSeconds));
    showCaption('hatchRattle', crawl.to);
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
    showCaption('hollowSteps', figure);
    // Out through a hatch nothing has come through before: the cover goes with a bang as it drops.
    if (crawl.to.isOpen) { playHatchRattle(crawl.to.x, crawl.to.z, 1.2); showCaption('hatchRattle', crawl.to); }
    else forceHollowHatchOpen(crawl.to, true);
  }
}

// ---------------------------------------------------------------------------
// Breaking a door down
//
// Hunting, with a keycard door shut between it and you, it does not turn away for the crawlspace at once.
// It goes to the door and pounds on it. One bout of pounding does not break a door; it gives up, leaves that
// door alone for a while and goes round. But the damage stays. The third bout on the same door (sooner if it
// is angry) and the door gives way for good: the slab is on the floor and the doorway stands open.
//
// Two limits:
//   - It only goes at a door you could open yourself, with the card you are carrying. So a door it breaks is
//     never one that was keeping you out, and it cannot be used to skip a lock.
//   - The lift door cannot be broken.
// ---------------------------------------------------------------------------

function isDoorBreakable(door) {
  return door.kind === DOOR_KIND_KEYCARD && !door.isBroken;
}

// The middle of the floor tile on each side of a door: [{ x, z, index }, { x, z, index }], or null if it has
// no walkable floor on both sides.
function getDoorSides(door) {
  const runsAlongX = isWalkableAt(door.tileX - 1, door.tileZ) && isWalkableAt(door.tileX + 1, door.tileZ);
  const first = runsAlongX ? [door.tileX - 1, door.tileZ] : [door.tileX, door.tileZ - 1];
  const second = runsAlongX ? [door.tileX + 1, door.tileZ] : [door.tileX, door.tileZ + 1];
  if (!isWalkableAt(first[0], first[1]) || !isWalkableAt(second[0], second[1])) return null;
  return [first, second].map(function (tile) { return { x: tile[0] + 0.5, z: tile[1] + 0.5, index: tileIndexAt(tile[0], tile[1]) }; });
}

// While it hunts: is there a shut door close by that would be a much shorter way to where it is going?
// Returns { door, stand } (`stand` is the floor on its own side of the door), or null.
// Uses the Hollow's own distance field, so it must be called while that field is for where it is hunting to.
function findDoorWorthBreaking() {
  if (TUNING.hollowDoorBangSeconds <= 0 || !game.flags.powerOn) return null;
  const figure = hollow.figure, field = hollow.distanceField;
  const hereIndex = findNearestWalkableTileIndex(figure.x, figure.z);
  if (hereIndex < 0) return null;
  const stepsRound = field[hereIndex]; // the way it would have to go as things stand (maybe "no way at all")
  let best = null, bestSaving = TUNING.hollowDoorBangWorthSteps;
  for (const door of doors) {
    if (!isDoorBreakable(door) || door.bangCooldown > 0) continue;
    if (tileBlocksHollow[tileIndexAt(door.tileX, door.tileZ)] !== 1) continue;  // it is open: just walk through
    if (game.flags.keycardLevel < door.cardLevel) continue;                     // not one you could open: leave it be
    const sides = getDoorSides(door);
    if (!sides) continue;
    for (let order = 0; order < 2; order++) {
      const near = sides[order], far = sides[1 - order];
      const metres = distanceBetweenPoints(figure.x, figure.z, near.x, near.z);
      if (metres > TUNING.hollowDoorBangWithinMetres || field[far.index] >= NAVIGATION_UNREACHABLE) continue;
      if (!hasClearHollowWalkingLine(figure.x, figure.z, near.x, near.z)) continue;
      const stepsThrough = metres + 2 + field[far.index];
      const saving = stepsRound - stepsThrough;
      if (saving >= bestSaving) { bestSaving = saving; best = { door: door, stand: near }; }
    }
  }
  return best;
}

// Called every frame while it hunts. Decides whether to go at a door, and walks it up to the door it chose.
function updateHollowDoorChoice(dt) {
  const figure = hollow.figure;
  if (hollow.doorBang) {
    const bang = hollow.doorBang;
    bang.timer += dt;
    // The door opened after all (you came back to it), or it is taking too long to get there: forget it.
    if (isDoorPassableToHollow(bang.door) || bang.timer > 6) { hollow.doorBang = null; return; }
    if (distanceBetweenPoints(figure.x, figure.z, bang.standX, bang.standZ) < 0.45) {
      bang.isPounding = true; bang.timer = 0; bang.hits = 0; bang.hitTimer = 0.35;
    }
    return;
  }
  hollow.doorCheckTimer -= dt;
  if (hollow.doorCheckTimer > 0) return;
  hollow.doorCheckTimer = 0.4;
  // Its distance field has to be the one for where it is hunting to, or the sums below mean nothing.
  if (hollow.fieldTargetIndex !== findNearestWalkableTileIndex(hollow.lastKnownPlayerX, hollow.lastKnownPlayerZ)) return;
  if (hollow.fieldVersion !== hollowNavigationVersion) return;
  const found = findDoorWorthBreaking();
  if (found) hollow.doorBang = { door: found.door, standX: found.stand.x, standZ: found.stand.z, isPounding: false, timer: 0, hits: 0, hitTimer: 0 };
}

// One frame of the Hollow pounding on a door. Like the crawlspace, this is all it does while it lasts.
function updateHollowDoorBang(dt) {
  const bang = hollow.doorBang, door = bang.door, figure = hollow.figure, pose = figure.pose;
  figure.hitsThisFrame = 0;
  hollow.currentSpeed = 0;
  if (isDoorPassableToHollow(door)) { hollow.doorBang = null; hollow.fieldTargetIndex = -1; return; } // it opened: through it
  bang.timer += dt;
  bang.hitTimer -= dt;
  // Squared up to the door, both arms going up and coming down on it.
  const towardDoor = Math.atan2(door.centerX - figure.x, -(door.centerZ - figure.z));
  figure.yaw += clampNumber(wrapAngleToPi(towardDoor - figure.yaw), -dt * 8, dt * 8);
  const windUp = clampNumber(bang.hitTimer / TUNING.hollowDoorBangEverySeconds, 0, 1); // 1 just after a blow, 0 as the next lands
  pose.armRaise = interpolateLinear(1.25, 2.5, Math.sin(windUp * Math.PI));
  pose.elbowBend = 0.2; pose.lean = 0.22 + 0.12 * (1 - windUp); pose.legSwing = 0; pose.armSwing = 0; pose.fingerSplay = 0.2;
  const fit = fitHollowUnderCeiling(figure, getHeadroomAt(figure.x, figure.z), 0.3, TUNING.hollowCeilingGap);
  pose.stretch = approachValue(pose.stretch, fit.stretch, dt * 2); pose.stoop = approachValue(pose.stoop, fit.stoop, dt * 3);
  updateFigureCapsules(figure);

  if (bang.hitTimer <= 0) {
    const blowsInOneBout = Math.max(1, Math.round(TUNING.hollowDoorBangSeconds / TUNING.hollowDoorBangEverySeconds));
    const isEnraged = hollow.enragedTimer > 0;
    bang.hitTimer = TUNING.hollowDoorBangEverySeconds * (0.85 + Math.random() * 0.3);
    bang.hits++;
    // Every blow takes its share of what a bout does. Anger makes each one count for more; enraged, for twice as much.
    const damagePerBlow = TUNING.hollowDoorDamagePerBout * (1 + TUNING.hollowDoorDamageAngerBonus * hollow.anger) * (isEnraged ? 2 : 1) / blowsInOneBout;
    door.damage = Math.min(1, door.damage + damagePerBlow);
    playDoorBang(door.centerX, door.centerZ, 0.8 + 0.3 * hollow.anger + 0.25 * door.damage);
    if (bang.hits === 1) {
      // What you are told depends on the state of the door: untouched, already battered, or about to go.
      const damageBefore = door.damage - damagePerBlow;
      const willGoThisBout = damageBefore + damagePerBlow * blowsInOneBout >= 0.999;
      bang.captionKey = willGoThisBout ? 'doorPoundedLast' : (damageBefore > 0.01 ? 'doorPoundedAgain' : 'doorPounded');
    }
    showCaption(bang.captionKey, { x: door.centerX, z: door.centerZ }); // every blow keeps the line up for as long as it goes on
    if (door.damage >= 1) { breakDoor(door); hollow.doorBang = null; hollow.fieldTargetIndex = -1; return; }
    if (bang.hits >= blowsInOneBout) {
      // The door held. It leaves it for now and goes round; what it did to the door stays done.
      door.bangCooldown = TUNING.hollowDoorBangCooldownSeconds;
      hollow.doorBang = null;
      hollow.fieldTargetIndex = -1;
    }
  }
}

// The door gives way. From now on the doorway stands open, for everyone, and what is left of the slab lies in it.
function breakDoor(door) {
  if (door.isBroken) return;
  const slab = door.slab;
  door.isBroken = true; door.damage = 1; door.openFraction = 1; door.closeDelay = 0;
  // Remember how the slab stood, so that the next descent can have its door back.
  door.slabStanding = { halfX: slab.halfX, halfY: slab.halfY, halfZ: slab.halfZ, boundsHalfX: slab.boundsHalfX, boundsHalfZ: slab.boundsHalfZ, blocksMovement: slab.blocksMovement };
  removePointsInsideBox(door.centerX - 0.6, door.baseY, door.centerZ - 0.6, door.centerX + 0.6, door.baseY + 2.5, door.centerZ + 0.6);
  // Flat on the floor of the doorway, buckled: something to scan and to step over, nothing that stops anyone.
  slab.halfX = 0.46; slab.halfZ = 0.46; slab.halfY = 0.04;
  slab.boundsHalfX = 0.46; slab.boundsHalfZ = 0.46;
  slab.centerY = door.baseY + 0.04; slab.minimumY = door.baseY; slab.maximumY = door.baseY + 0.08;
  slab.blocksMovement = false; slab.isRemoved = false;
  playDoorBreak(door.centerX, door.centerZ);
  showCaption('doorBreaks', { x: door.centerX, z: door.centerZ });
  if (!game.flags.hasHeardOfBrokenDoor) {
    game.flags.hasHeardOfBrokenDoor = true;
    scheduleEvent(3.5, function () { playRadioLine('doorBroken'); });
  }
  refreshHollowDoorBlocks();
}

// Puts a door back as it was built: whole, undamaged, standing. For the start of a new descent.
function mendDoor(door) {
  door.damage = 0; door.bangCooldown = 0;
  if (!door.isBroken) return;
  door.isBroken = false;
  const slab = door.slab, standing = door.slabStanding;
  slab.halfX = standing.halfX; slab.halfY = standing.halfY; slab.halfZ = standing.halfZ;
  slab.boundsHalfX = standing.boundsHalfX; slab.boundsHalfZ = standing.boundsHalfZ;
  slab.blocksMovement = standing.blocksMovement;
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

// The hatch itself: a square frame let into the ceiling, and its cover. In the scan both show in the warning
// colour, so that you can learn what a hatch looks like and where they are.
// The cover starts shut, flat in its frame. The first time the Hollow goes up or comes down through a hatch it
// forces the cover, which from then on hangs down from one edge: an open hatch is one it has been through.
// Returns the cover, which is the one part that moves.
function addHollowHatchProps(tileX, tileZ, ceilingY) {
  const saved = { turns: placement.turns, offsetX: placement.offsetX, offsetZ: placement.offsetZ, offsetY: placement.offsetY };
  placement.turns = 0; placement.offsetX = 0; placement.offsetZ = 0; placement.offsetY = 0;
  const options = { surfaceClass: SURFACE_HAZARD, blocksMovement: false };
  const low = ceilingY - 0.07, minimumX = tileX + 0.05, maximumX = tileX + 0.95, minimumZ = tileZ + 0.05, maximumZ = tileZ + 0.95;
  addBoxBetween(minimumX, low, minimumZ, maximumX, ceilingY, minimumZ + 0.09, options);
  addBoxBetween(minimumX, low, maximumZ - 0.09, maximumX, ceilingY, maximumZ, options);
  addBoxBetween(minimumX, low, minimumZ, minimumX + 0.09, ceilingY, maximumZ, options);
  addBoxBetween(maximumX - 0.09, low, minimumZ, maximumX, ceilingY, maximumZ, options);
  const cover = addBoxBetween(minimumX + 0.08, ceilingY - 0.06, minimumZ + 0.08, maximumX - 0.08, ceilingY - 0.03, maximumZ - 0.08,
    { surfaceClass: SURFACE_HAZARD, blocksMovement: false, isDynamic: true });
  placement.turns = saved.turns; placement.offsetX = saved.offsetX; placement.offsetZ = saved.offsetZ; placement.offsetY = saved.offsetY;
  return cover;
}

// Puts a hatch's cover where it belongs for the state the hatch is in: flat in the frame, or hanging from one edge.
function placeHollowHatchCover(hatch) {
  const cover = hatch.cover, tileX = Math.floor(hatch.x), tileZ = Math.floor(hatch.z);
  if (hatch.isOpen) {
    cover.centerX = tileX + 0.845; cover.centerZ = tileZ + 0.5; cover.centerY = hatch.ceilingY - 0.335;
    cover.halfX = 0.015; cover.halfY = 0.285; cover.halfZ = 0.37;
  } else {
    cover.centerX = tileX + 0.5; cover.centerZ = tileZ + 0.5; cover.centerY = hatch.ceilingY - 0.045;
    cover.halfX = 0.37; cover.halfY = 0.015; cover.halfZ = 0.37;
  }
  cover.boundsHalfX = cover.halfX; cover.boundsHalfZ = cover.halfZ;
  cover.minimumY = cover.centerY - cover.halfY; cover.maximumY = cover.centerY + cover.halfY;
}

// The Hollow forces a hatch that has not been used yet: a bang you hear from a long way off, and the cover is
// left hanging. `isComingOut` says which way it is going (the sound is the same; what you are told is not).
// A hatch that is already open is left as it is.
function forceHollowHatchOpen(hatch, isComingOut) {
  if (hatch.isOpen) return;
  hatch.isOpen = true;
  // The points a scan left on the shut cover stay a moment and fade, as a door's do.
  fadePointsInsideBox(hatch.x - 0.5, hatch.ceilingY - 0.12, hatch.z - 0.5, hatch.x + 0.5, hatch.ceilingY, hatch.z + 0.5,
    convertSecondsToPointLifeCode(TUNING.doorImprintSeconds));
  placeHollowHatchCover(hatch);
  playHatchBurst(hatch.x, hatch.z);
  showCaption(isComingOut ? 'hatchBurst' : 'hatchForced', hatch);
}

// Shuts every hatch again. For the start of a new descent.
function shutHollowHatches() {
  for (const hatch of hollowHatches) {
    hatch.isOpen = false;
    placeHollowHatchCover(hatch);
  }
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
      const hatch = { x: tileX + 0.5, z: tileZ + 0.5, index: bestIndex, part: partNumber, ceilingY: tileCeilingHeight[bestIndex],
        isOpen: false, cover: null }; // shut until the Hollow has been through it once
      hatch.cover = addHollowHatchProps(tileX, tileZ, hatch.ceilingY);
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
