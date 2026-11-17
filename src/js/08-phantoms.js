// ---------------------------------------------------------------------------
// Apparitions (called "phantoms" in the code): figures that are only ever in the point cloud.
// They cannot touch you. They are there to make you doubt the scanner.
//
// There are two sorts:
//
//   Placed ones stand at a fixed spot in a room (see phantomDefinitions in 03-layout.js and 03-levelgen.js)
//   and are waiting there the first time you come in.
//
//   Chance ones are put out while you play, at a place chosen at that moment from where you are standing and
//   which way you are looking. The part that decides when is the "phantom director" at the bottom of this file.
//   It has five kinds to choose from (PHANTOM_KINDS below), and a sixth that comes by its own dice: once in a
//   long while you start a scan and one is standing right in front of you.
//
// Three rules keep them fair:
//
//   1. They are silent. Everything real in this station makes a noise of its own; an apparition never borrows
//      one. (The single sound of their own is a breath, for the kind that stands behind you.) They also scan in
//      the colour of the walls, not in the Hollow's colour.
//   2. They belong to the quiet stretches. None appears while the Hollow is after you or near you or while the
//      Stills are close, and one that is out is taken away the moment that changes. When something real is
//      happening, everything the scanner shows you is real.
//   3. They are rare. A descent has a fixed number of them (more in a bigger station), and one that you never
//      scanned does not count against that number.
//
// Where they stand is not part of the seed: the same seed gives the same station, not the same apparitions.
// ---------------------------------------------------------------------------

const PHANTOM_STATE_WAITING = 0; // not there yet (a placed one before you come in, a crosser before you look its way)
const PHANTOM_STATE_PRESENT = 1; // a scan will find it
const PHANTOM_STATE_GONE = 2;

const phantoms = [];

// Where each vent opens into a room: { x, z } is the middle of the first vent tile, (outX, outZ) points into the room.
const phantomVentMouths = [];

// TWEAK: the kinds of chance apparition. `weight` is how often a kind is chosen compared with the others
// (a kind with weight 4 turns up twice as often as one with weight 2). Set a weight to 0 to switch a kind off.
const PHANTOM_KINDS = {
  watcher: { label: 'Watcher', weight: 4, findSpot: findPhantomWatcherSpot, start: startPhantomWatcher, update: updatePhantomWatcher },
  behind: { label: 'Behind you', weight: 2, findSpot: findPhantomBehindSpot, start: startPhantomBehind, update: updatePhantomBehind },
  dummy: { label: 'Dummy', weight: 2, findSpot: findPhantomDummySpot, start: startPhantomDummy, update: updatePhantomDummy },
  crosser: { label: 'Crosser', weight: 2.5, findSpot: findPhantomCrosserSpot, start: startPhantomCrosser, update: updatePhantomCrosser },
  crawler: { label: 'Crawler', weight: 1.5, findSpot: findPhantomCrawlerSpot, start: startPhantomCrawler, update: updatePhantomCrawler },
  // Weight 0: the phantom director never picks this one. It has dice of its own (see updatePhantomFaceDice).
  face: { label: 'In your face', weight: 0, findSpot: findPhantomFaceSpot, start: startPhantomFace, update: updatePhantomFace }
};
const PHANTOM_KIND_KEYS = Object.keys(PHANTOM_KINDS);

const phantomDirector = {
  budget: 0,            // how many chance apparitions this descent may have
  used: 0,              // how many of those you have seen
  timer: 0,             // seconds until the next one may be tried
  retryTimer: 0,        // looking for a place costs a little, so it is not done every frame
  current: null,        // the chance apparition that is out now, if any (never more than one)
  lastKind: '',         // the kind of the last one, so the same kind does not come twice running
  seenByKind: {},       // how many of each kind you have seen this descent
  kindOrder: [],        // the kinds in the order they are being tried for the next one (see updatePhantomDirector)
  searchSeconds: 0,     // how long a place for the next one has been looked for
  lastStingerTime: -999,
  startTime: 0,         // when this descent began
  lastEndTime: -999,    // when the last chance apparition went
  faceUsed: 0,          // how many "in your face" ones this descent has had
  wasScanning: false    // the scanner was on last frame (to notice the moment a scan starts)
};

// ---------------------------------------------------------------------------
// What you can see from where you stand
// ---------------------------------------------------------------------------

// True if nothing solid is between your eyes and the point.
function canPlayerSeePoint(x, y, z) {
  const eyeY = getPlayerEyeY();
  const deltaX = x - player.x, deltaY = y - eyeY, deltaZ = z - player.z;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
  if (distance < 0.05) return true;
  if (!castRayAgainstWorld(player.x, eyeY, player.z, deltaX / distance, deltaY / distance, deltaZ / distance, distance)) return true;
  return rayHit.distance > distance - 0.25;
}

// True if you could see something standing on the floor at (x, z): low down, higher up, and halfway between
// (a pipe or a shelf at waist height can hide the middle of a body and leave both ends showing).
function canPlayerSeeFigureAt(x, z, lowHeight, highHeight) {
  const floor = getFloorHeightAt(x, z);
  return canPlayerSeePoint(x, floor + lowHeight, z) && canPlayerSeePoint(x, floor + highHeight, z) &&
    canPlayerSeePoint(x, floor + (lowHeight + highHeight) / 2, z);
}

// How far off the centre of your view a place is, left or right, in radians: 0 is dead ahead, 3.14 is right behind you.
function getAngleFromPlayerView(x, z) {
  return Math.abs(wrapAngleToPi(Math.atan2(x - player.x, -(z - player.z)) - player.yaw));
}

// The yaw something at (fromX, fromZ) needs to face (toX, toZ).
function getYawToward(fromX, fromZ, toX, toZ) {
  return Math.atan2(toX - fromX, -(toZ - fromZ));
}

// How far either side of the centre of your view the scanner is putting points right now, in radians.
// 0 when it is off. Nothing is ever put out inside this: it would pop into being in the middle of the beam.
function getScannedHalfAngle() {
  if (player.sweepTimeRemaining > 0) return (TUNING.sweepHalfWidthDegrees + 8) * DEGREES_TO_RADIANS;
  if (player.scannerActivity > 0.05) return (player.spreadDegrees + 10) * DEGREES_TO_RADIANS;
  return 0;
}

// ---------------------------------------------------------------------------
// Places to stand
// ---------------------------------------------------------------------------

// A tile a figure can stand on: open floor that can be walked on, level all round (so not on a stair or at
// the lip of one), and not a doorway, a vent or a pit.
function canPhantomStandOnTile(tileX, tileZ) {
  if (!isInsideGrid(tileX, tileZ) || !isWalkableAt(tileX, tileZ)) return false;
  const index = tileIndexAt(tileX, tileZ);
  if (tileFlags[index] & (TILE_FLAG_DOOR | TILE_FLAG_VENT | TILE_FLAG_PIT)) return false;
  if (ZONE_NAMES[tileZone[index]] === 'LIFT CAR') return false; // nothing ever stands in the lift with you
  if ((ZONE_NAMES[tileZone[index]] || '').indexOf('SALVAGE BAY') === 0) return false; // nor in a salvage bay
  const floor = tileFloorHeight[index];
  const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const step of neighbours) {
    const nearX = tileX + step[0], nearZ = tileZ + step[1];
    if (!isInsideGrid(nearX, nearZ)) continue;
    const nearIndex = tileIndexAt(nearX, nearZ);
    if (tileIsOpen[nearIndex] !== 0 && Math.abs(tileFloorHeight[nearIndex] - floor) > 0.01) return false;
  }
  return true;
}

// Every tile a figure could stand on that is between the two distances from you, on your level, and in a part
// of the station you could walk to. Each entry is { x, z, tileX, tileZ, distance }.
function collectPhantomStandingSpots(nearestMetres, farthestMetres) {
  refreshPlayerDistanceField();
  const spots = [];
  const playerTileX = Math.floor(player.x), playerTileZ = Math.floor(player.z);
  const reach = Math.ceil(farthestMetres);
  for (let tileZ = playerTileZ - reach; tileZ <= playerTileZ + reach; tileZ++) {
    for (let tileX = playerTileX - reach; tileX <= playerTileX + reach; tileX++) {
      if (!canPhantomStandOnTile(tileX, tileZ)) continue;
      const index = tileIndexAt(tileX, tileZ);
      if (playerDistanceField[index] > 90) continue; // cut off from you, or a very long way round
      if (Math.abs(tileFloorHeight[index] - player.floorY) > 0.5) continue;
      const x = tileX + 0.5, z = tileZ + 0.5;
      const distance = distanceBetweenPoints(x, z, player.x, player.z);
      if (distance < nearestMetres || distance > farthestMetres) continue;
      spots.push({ x: x, z: z, tileX: tileX, tileZ: tileZ, distance: distance });
    }
  }
  return spots;
}

// True if there is a wall right behind the spot as you look at it: the end of a corridor, the far side of a room.
function isWallBehindPhantomSpot(spot) {
  const deltaX = spot.x - player.x, deltaZ = spot.z - player.z;
  const behindX = spot.tileX + (Math.abs(deltaX) >= Math.abs(deltaZ) ? Math.sign(deltaX) : 0);
  const behindZ = spot.tileZ + (Math.abs(deltaX) >= Math.abs(deltaZ) ? 0 : Math.sign(deltaZ));
  return !isInsideGrid(behindX, behindZ) || tileIsOpen[tileIndexAt(behindX, behindZ)] === 0;
}

// True if one of the real dummies is within `metres` of the place.
function isRealStillNear(x, z, metres) {
  for (const still of stills) {
    if (still.isPresent && distanceBetweenPoints(still.figure.x, still.figure.z, x, z) < metres) return true;
  }
  return false;
}

// Works out where the vents open into rooms. Done once for each station.
function computePhantomVentMouths() {
  phantomVentMouths.length = 0;
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let tileZ = level.boundsMinimumZ; tileZ < level.boundsMaximumZ; tileZ++) {
    for (let tileX = level.boundsMinimumX; tileX < level.boundsMaximumX; tileX++) {
      if (!isInsideGrid(tileX, tileZ)) continue;
      if ((tileFlags[tileIndexAt(tileX, tileZ)] & TILE_FLAG_VENT) === 0) continue;
      for (const step of steps) {
        const roomX = tileX + step[0], roomZ = tileZ + step[1];
        if (!isInsideGrid(roomX, roomZ) || !isWalkableAt(roomX, roomZ)) continue;
        if (tileFlags[tileIndexAt(roomX, roomZ)] & TILE_FLAG_VENT) continue;
        phantomVentMouths.push({ x: tileX + 0.5, z: tileZ + 0.5, outX: step[0], outZ: step[1] });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Making one and taking it away
// ---------------------------------------------------------------------------

function createPhantomFigure(proportions) {
  // SURFACE_PROP: it scans in the colour of walls and crates, not in the colour of anything alive.
  return createFigure(proportions, SURFACE_PROP, 'phantomImprintSeconds');
}

function createPhantomRecord(kind, figure) {
  return {
    kind: kind, figure: figure, definition: null,
    state: PHANTOM_STATE_WAITING,
    isChance: kind !== 'placed',
    bornTime: game.time,
    firstHitTime: -1,     // when a scan first touched it
    wasEverSeen: false,   // enough points have landed on it for you to have made out a figure
    stage: 0,             // the dummy: 0 where it first stood, 1 after it has come closer
    shownDistance: 0      // a placed one: how far away you were when it appeared
  };
}

function showPhantom(phantom) {
  phantom.state = PHANTOM_STATE_PRESENT;
  setFigureRaycastable(phantom.figure, true);
}

// Takes an apparition away. `withStinger` asks for the three sagging notes, which are only played if you had
// really seen it, and not too soon after the last time.
function endPhantom(phantom, withStinger) {
  if (phantom.state === PHANTOM_STATE_GONE) return;
  phantom.state = PHANTOM_STATE_GONE;
  setFigureRaycastable(phantom.figure, false);
  if (phantom.figure.totalHits > 25) phantom.wasEverSeen = true;
  if (withStinger && phantom.wasEverSeen && game.time - phantomDirector.lastStingerTime >= TUNING.phantomStingerGapSeconds) {
    phantomDirector.lastStingerTime = game.time;
    playStinger('phantom');
  }
  const waitShortest = phantom.wasEverSeen ? TUNING.phantomGapShortestSeconds : TUNING.phantomRetryShortestSeconds;
  const waitLongest = phantom.wasEverSeen ? TUNING.phantomGapLongestSeconds : TUNING.phantomRetryLongestSeconds;
  if (phantom.isChance) {
    phantomDirector.lastEndTime = game.time;
    // One you never saw does not count, and the next is not long in coming.
    // (The one in your face is counted when it is put out, against a limit of its own.)
    if (phantom.wasEverSeen && phantom.kind !== 'face') phantomDirector.used++;
    if (phantom.wasEverSeen) phantomDirector.seenByKind[phantom.kind] = (phantomDirector.seenByKind[phantom.kind] || 0) + 1;
    // More of them also means less of a wait between them, and fewer means more.
    phantomDirector.timer = randomBetween(waitShortest, waitLongest) / Math.max(0.25, game.difficulty.phantomFactor);
    if (phantomDirector.current === phantom) phantomDirector.current = null;
    const position = phantoms.indexOf(phantom);
    if (position >= 0) phantoms.splice(position, 1);
  } else if (phantom.wasEverSeen) {
    // A placed one you saw pushes the next chance one back, so they do not come one on top of the other.
    phantomDirector.timer = Math.max(phantomDirector.timer, TUNING.phantomGapShortestSeconds);
  }
}

// The rule most kinds share: gone once you have had a proper look, or once you come close.
// Returns true if it has gone.
function endPhantomIfSeenOrApproached(phantom, hitsNeeded, secondsNeeded, closestMetres) {
  const figure = phantom.figure;
  if (figure.totalHits > 0 && phantom.firstHitTime < 0) phantom.firstHitTime = game.time;
  if (figure.totalHits > 25) phantom.wasEverSeen = true;
  const wasSeenLongEnough = phantom.firstHitTime >= 0 && figure.totalHits > hitsNeeded && game.time - phantom.firstHitTime > secondsNeeded;
  if (wasSeenLongEnough || distanceBetweenPoints(figure.x, figure.z, player.x, player.z) < closestMetres) {
    endPhantom(phantom, true);
    return true;
  }
  return false;
}

// Taken away if it has stood too long without anyone scanning it, or if you have walked far away from it.
// Returns true if it has gone.
function endPhantomIfForgotten(phantom, unseenSeconds, farthestMetres) {
  const figure = phantom.figure;
  const isUnseenTooLong = figure.totalHits === 0 && game.time - phantom.bornTime > unseenSeconds;
  if (isUnseenTooLong || distanceBetweenPoints(figure.x, figure.z, player.x, player.z) > farthestMetres) {
    endPhantom(phantom, false);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Placed apparitions: at a fixed spot in a room, there the first time you come in
// ---------------------------------------------------------------------------

function poseStandingPhantom(figure) {
  figure.pose.lean = 0.05; figure.pose.headTilt = 0.4; figure.pose.armRaise = 0.03; figure.pose.fingerSplay = 0.5;
  // Half drawn up, or as near to that as the ceiling where it stands allows.
  const fit = fitHollowUnderCeiling(figure, getHeadroomAt(figure.x, figure.z), 0.35, 0.05);
  figure.pose.stretch = fit.stretch; figure.pose.stoop = fit.stoop;
  updateFigureCapsules(figure);
}

function updatePlacedPhantom(phantom, playerZone) {
  const figure = phantom.figure;
  if (phantom.definition.onlyBeforePower && game.flags.powerOn) { endPhantom(phantom, false); return; }
  const distance = distanceBetweenPoints(figure.x, figure.z, player.x, player.z);
  if (phantom.state === PHANTOM_STATE_WAITING) {
    // It is there as soon as you are in its room, unless you are almost on top of its spot or the beam is on
    // that spot at this moment (then it waits for the beam to move off, so that it never pops into being).
    // It used to need you seven metres away, which a small room only allows from the far corner.
    if (playerZone === phantom.definition.triggerZone && distance >= TUNING.phantomPlacedNearestMetres &&
        getAngleFromPlayerView(figure.x, figure.z) >= getScannedHalfAngle()) {
      phantom.shownDistance = distance;
      showPhantom(phantom);
    }
    return;
  }
  // Gone after a proper look, or once you have come a step and a half closer than you were when it appeared
  // (but never from further off than 5.5 m, and it always lets you get to 2 m in a room too small for more).
  endPhantomIfSeenOrApproached(phantom, 60, 1.5, clampNumber(phantom.shownDistance - 1.5, 2, 5.5));
}

// ---------------------------------------------------------------------------
// Kind: the watcher. It stands some way off, facing you, somewhere you can see from where you are.
// Gone once you have had a proper look, or if you walk toward it.
// ---------------------------------------------------------------------------

function findPhantomWatcherSpot() {
  const spots = collectPhantomStandingSpots(TUNING.phantomWatcherNearestMetres, TUNING.phantomWatcherFarthestMetres);
  const scannedHalfAngle = getScannedHalfAngle();
  let best = null, bestScore = -Infinity;
  for (let sample = 0; sample < 90 && spots.length > 0; sample++) {
    const spot = spots[Math.floor(Math.random() * spots.length)];
    const angle = getAngleFromPlayerView(spot.x, spot.z);
    if (angle < scannedHalfAngle) continue;
    if (getHeadroomAt(spot.x, spot.z) < 1.9) continue;
    if (!canPlayerSeeFigureAt(spot.x, spot.z, 0.5, 1.3)) continue;
    let score = Math.random() * 0.6 + Math.min(1, spot.distance / TUNING.phantomWatcherFarthestMetres) * 0.3;
    if (angle < 1.2) score += 0.5;                      // somewhere you are likely to point the scanner next
    if (isWallBehindPhantomSpot(spot)) score += 0.7;    // the end of a corridor, the far side of a room
    if (score > bestScore) { bestScore = score; best = spot; }
  }
  return best ? { x: best.x, z: best.z, yaw: getYawToward(best.x, best.z, player.x, player.z) } : null;
}

function startPhantomWatcher(phantom, spot) {
  poseStandingPhantom(phantom.figure);
  showPhantom(phantom);
}

function updatePhantomWatcher(phantom) {
  if (endPhantomIfSeenOrApproached(phantom, 60, 1.5, 5.5)) return;
  endPhantomIfForgotten(phantom, TUNING.phantomUnseenSeconds, TUNING.phantomWatcherFarthestMetres + 12);
}

// ---------------------------------------------------------------------------
// Kind: behind you. Close, at your back, reaching. A breath tells you to turn round.
// Gone almost as soon as the scanner finds it, and gone if you never turn.
// ---------------------------------------------------------------------------

function findPhantomBehindSpot() {
  const spots = collectPhantomStandingSpots(TUNING.phantomBehindNearestMetres, TUNING.phantomBehindFarthestMetres);
  let best = null, bestScore = -Infinity;
  for (let sample = 0; sample < 60 && spots.length > 0; sample++) {
    const spot = spots[Math.floor(Math.random() * spots.length)];
    const angle = getAngleFromPlayerView(spot.x, spot.z);
    if (angle < 2.1) continue; // 120 degrees: well outside anything you can be looking at
    if (getHeadroomAt(spot.x, spot.z) < 1.7) continue;
    if (!canPlayerSeeFigureAt(spot.x, spot.z, 0.5, 1.3)) continue;
    const score = Math.random() * 0.5 + angle / Math.PI;
    if (score > bestScore) { bestScore = score; best = spot; }
  }
  return best ? { x: best.x, z: best.z, yaw: getYawToward(best.x, best.z, player.x, player.z) } : null;
}

function startPhantomBehind(phantom, spot) {
  const figure = phantom.figure;
  // The way the Hollow itself comes at you: leaning in, arms up and out, fingers spread.
  figure.pose.lean = 0.31; figure.pose.headTilt = 0.5; figure.pose.armRaise = 1.0; figure.pose.elbowBend = 0.4; figure.pose.fingerSplay = 1;
  const fit = fitHollowUnderCeiling(figure, getHeadroomAt(figure.x, figure.z), 0.3, 0.05);
  figure.pose.stretch = fit.stretch; figure.pose.stoop = fit.stoop;
  updateFigureCapsules(figure);
  showPhantom(phantom);
  playPhantomBreath(figure.x, figure.z);
  showCaption('phantomBreath', figure);
}

function updatePhantomBehind(phantom) {
  if (endPhantomIfSeenOrApproached(phantom, 30, 0.45, 2.4)) return;
  endPhantomIfForgotten(phantom, TUNING.phantomBehindSeconds, 14);
}

// ---------------------------------------------------------------------------
// Kind: the dummy. One of the calibration mannequins, standing where none should be.
// It does what the real ones do: scan it, look away, and it is closer. Look away once more and it is gone.
// ---------------------------------------------------------------------------

function findPhantomDummySpot() {
  // Not where the real ones are: that room is frightening enough, and there you must be able to trust what you count.
  if (level.stillZones.indexOf(getZoneAtPosition(player.x, player.z)) >= 0) return null;
  const spots = collectPhantomStandingSpots(TUNING.phantomDummyNearestMetres, TUNING.phantomDummyFarthestMetres);
  const scannedHalfAngle = getScannedHalfAngle();
  let best = null, bestScore = -Infinity;
  for (let sample = 0; sample < 90 && spots.length > 0; sample++) {
    const spot = spots[Math.floor(Math.random() * spots.length)];
    const angle = getAngleFromPlayerView(spot.x, spot.z);
    if (angle < scannedHalfAngle) continue;
    if (getHeadroomAt(spot.x, spot.z) < 1.9) continue;
    if (level.stillZones.indexOf(getZoneAtPosition(spot.x, spot.z)) >= 0 || isRealStillNear(spot.x, spot.z, 18)) continue;
    if (!canPlayerSeeFigureAt(spot.x, spot.z, 0.5, 1.3)) continue;
    let score = Math.random() * 0.6;
    if (angle < 1.2) score += 0.5;
    if (!isWallBehindPhantomSpot(spot)) score += 0.3; // out in the open: it has no business there
    if (score > bestScore) { bestScore = score; best = spot; }
  }
  return best ? { x: best.x, z: best.z, yaw: getYawToward(best.x, best.z, player.x, player.z) } : null;
}

function startPhantomDummy(phantom, spot) {
  const figure = phantom.figure;
  figure.pose.headTilt = 0.25; figure.pose.armRaise = 0;
  updateFigureCapsules(figure);
  showPhantom(phantom);
}

// Moves the dummy to about halfway between where it stands and where you are. Returns false if there is no
// good place for it there.
function movePhantomDummyCloser(phantom) {
  const figure = phantom.figure;
  const scannedHalfAngle = getScannedHalfAngle();
  for (const fraction of [0.5, 0.42, 0.58, 0.34, 0.66]) {
    const tileX = Math.floor(figure.x + (player.x - figure.x) * fraction), tileZ = Math.floor(figure.z + (player.z - figure.z) * fraction);
    const x = tileX + 0.5, z = tileZ + 0.5;
    if (!canPhantomStandOnTile(tileX, tileZ) || getHeadroomAt(x, z) < 1.9) continue;
    if (distanceBetweenPoints(x, z, player.x, player.z) < 3.2) continue;
    if (getAngleFromPlayerView(x, z) < scannedHalfAngle) continue; // not into the beam: it only moves unwatched
    if (!canPlayerSeeFigureAt(x, z, 0.5, 1.3)) continue;
    figure.x = x; figure.z = z;
    figure.yaw = getYawToward(x, z, player.x, player.z);
    figure.pose.armRaise = 0.55; figure.pose.elbowBend = 0.25; figure.pose.headTilt = -0.35; // its arms have started to come up
    figure.totalHits = 0;
    phantom.firstHitTime = -1;
    phantom.bornTime = game.time;
    updateFigureCapsules(figure);
    return true;
  }
  return false;
}

function updatePhantomDummy(phantom) {
  const figure = phantom.figure;
  if (figure.totalHits > 25) phantom.wasEverSeen = true;
  if (distanceBetweenPoints(figure.x, figure.z, player.x, player.z) < 2.6) { endPhantom(phantom, true); return; }
  // Scanned, and then not scanned for a moment: that is when the real ones move.
  if (figure.totalHits > 40 && game.time - figure.lastScannedTime > TUNING.phantomDummyLookAwaySeconds) {
    if (phantom.stage === 0 && movePhantomDummyCloser(phantom)) phantom.stage = 1;
    else endPhantom(phantom, true);
    return;
  }
  endPhantomIfForgotten(phantom, TUNING.phantomUnseenSeconds, TUNING.phantomDummyFarthestMetres + 14);
}

// ---------------------------------------------------------------------------
// Kind: the crosser. Something walks across the far end of what you are scanning, from one side to the other,
// and does not come back. It waits out of sight until you are scanning that way.
// ---------------------------------------------------------------------------

function canPhantomWalkOnTile(tileX, tileZ, floor) {
  return canPhantomStandOnTile(tileX, tileZ) && Math.abs(tileFloorHeight[tileIndexAt(tileX, tileZ)] - floor) < 0.01 &&
    getHeadroomAt(tileX + 0.5, tileZ + 0.5) >= 1.6;
}

function findPhantomCrosserSpot() {
  const spots = collectPhantomStandingSpots(TUNING.phantomCrosserNearestMetres, TUNING.phantomCrosserFarthestMetres);
  const scannedHalfAngle = getScannedHalfAngle();
  let best = null, bestScore = -Infinity;
  for (let sample = 0; sample < 90 && spots.length > 0; sample++) {
    // `spot` is the middle of the crossing: the place you will be looking at.
    const spot = spots[Math.floor(Math.random() * spots.length)];
    if (getAngleFromPlayerView(spot.x, spot.z) > 0.9) continue; // roughly ahead of you
    if (!canPlayerSeeFigureAt(spot.x, spot.z, 0.5, 1.3)) continue;
    // It walks square across your line of sight: along X if you are looking along Z, and the other way about.
    const isAlongX = Math.abs(spot.z - player.z) > Math.abs(spot.x - player.x);
    const stepX = isAlongX ? 1 : 0, stepZ = isAlongX ? 0 : 1;
    const floor = tileFloorHeight[tileIndexAt(spot.tileX, spot.tileZ)];
    let tilesBefore = 0, tilesAfter = 0, lowestHeadroom = getHeadroomAt(spot.x, spot.z);
    while (tilesBefore < 5 && canPhantomWalkOnTile(spot.tileX - stepX * (tilesBefore + 1), spot.tileZ - stepZ * (tilesBefore + 1), floor)) tilesBefore++;
    while (tilesAfter < 5 && canPhantomWalkOnTile(spot.tileX + stepX * (tilesAfter + 1), spot.tileZ + stepZ * (tilesAfter + 1), floor)) tilesAfter++;
    if (tilesBefore < 1 || tilesAfter < 1 || tilesBefore + tilesAfter < 3) continue;
    for (let offset = -tilesBefore; offset <= tilesAfter; offset++) {
      lowestHeadroom = Math.min(lowestHeadroom, getHeadroomAt(spot.x + stepX * offset, spot.z + stepZ * offset));
    }
    const isForward = Math.random() < 0.5;
    const startX = spot.x + stepX * (isForward ? -tilesBefore : tilesAfter), startZ = spot.z + stepZ * (isForward ? -tilesBefore : tilesAfter);
    const endX = spot.x + stepX * (isForward ? tilesAfter : -tilesBefore), endZ = spot.z + stepZ * (isForward ? tilesAfter : -tilesBefore);
    const isStartHidden = !canPlayerSeePoint(startX, floor + 1.3, startZ);
    const isEndHidden = !canPlayerSeePoint(endX, floor + 1.3, endZ);
    // If it would have to start in plain view inside the beam, it would pop into being there. Not that one.
    if (!isStartHidden && getAngleFromPlayerView(startX, startZ) < scannedHalfAngle) continue;
    const score = Math.random() * 0.5 + (isStartHidden ? 1 : 0) + (isEndHidden ? 0.5 : 0) + Math.min(8, tilesBefore + tilesAfter) / 8 * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = { x: startX, z: startZ, yaw: getYawToward(startX, startZ, endX, endZ), endX: endX, endZ: endZ, watchX: spot.x, watchZ: spot.z, headroom: lowestHeadroom };
    }
  }
  return best;
}

function startPhantomCrosser(phantom, spot) {
  const figure = phantom.figure;
  phantom.endX = spot.endX; phantom.endZ = spot.endZ;
  phantom.watchX = spot.watchX; phantom.watchZ = spot.watchZ;
  phantom.walkPhase = Math.random() * TWO_PI;
  figure.pose.lean = 0.1; figure.pose.headTilt = 0.3; figure.pose.armRaise = 0.06; figure.pose.kneeBend = 0.16; figure.pose.fingerSplay = 0.3;
  // Hunched, and bent further if the lowest ceiling on its way asks for it.
  const fit = fitHollowUnderCeiling(figure, spot.headroom, 0, TUNING.hollowCeilingGap);
  figure.pose.stretch = fit.stretch; figure.pose.stoop = Math.max(fit.stoop, TUNING.hollowBaseStoop);
  updateFigureCapsules(figure);
  // Not shown yet: it waits where it is until you are scanning its way (see updatePhantomCrosser).
}

function updatePhantomCrosser(phantom) {
  const figure = phantom.figure;
  if (phantom.state === PHANTOM_STATE_WAITING) {
    const distanceToCrossing = distanceBetweenPoints(phantom.watchX, phantom.watchZ, player.x, player.z);
    if (game.time - phantom.bornTime > 25 || distanceToCrossing < 5 || distanceToCrossing > TUNING.phantomCrosserFarthestMetres + 8) { endPhantom(phantom, false); return; }
    const isScanningThatWay = player.scannerActivity > 0.3 && getAngleFromPlayerView(phantom.watchX, phantom.watchZ) < 0.7 &&
      canPlayerSeePoint(phantom.watchX, getFloorHeightAt(phantom.watchX, phantom.watchZ) + 1.3, phantom.watchZ);
    if (isScanningThatWay) showPhantom(phantom);
    return;
  }
  if (figure.totalHits > 25) phantom.wasEverSeen = true;
  if (distanceBetweenPoints(figure.x, figure.z, player.x, player.z) < 4.5) { endPhantom(phantom, false); return; }
  if (debugState.options.freezeCreatures) return;
  const remaining = distanceBetweenPoints(figure.x, figure.z, phantom.endX, phantom.endZ);
  const stepLength = TUNING.phantomCrosserSpeed * phantom.frameSeconds;
  if (remaining <= stepLength) { endPhantom(phantom, false); return; } // across, and gone: no notes for this one
  figure.x += (phantom.endX - figure.x) / remaining * stepLength;
  figure.z += (phantom.endZ - figure.z) / remaining * stepLength;
  phantom.walkPhase += phantom.frameSeconds * 5.2;
  figure.pose.legSwing = Math.sin(phantom.walkPhase) * 0.55;
  figure.pose.armSwing = Math.sin(phantom.walkPhase) * 0.22;
  updateFigureCapsules(figure);
}

// ---------------------------------------------------------------------------
// Kind: the crawler. On knees and hands in the mouth of a vent, looking out into the room.
// Only in stations that have vents.
// ---------------------------------------------------------------------------

function findPhantomCrawlerSpot() {
  const scannedHalfAngle = getScannedHalfAngle();
  const good = [];
  for (const mouth of phantomVentMouths) {
    // Right at the lip of the opening, so that its head and arms are out in the room.
    const x = mouth.x + mouth.outX * 0.45, z = mouth.z + mouth.outZ * 0.45;
    const distance = distanceBetweenPoints(x, z, player.x, player.z);
    if (distance < TUNING.phantomCrawlerNearestMetres || distance > TUNING.phantomCrawlerFarthestMetres) continue;
    const floor = getFloorHeightAt(mouth.x, mouth.z);
    if (Math.abs(floor - player.floorY) > 0.5) continue;
    // You have to be out in the room it opens into and more or less in front of the opening: from far off to
    // one side the wall hides all of it but a hand.
    const metresInFront = (player.x - mouth.x) * mouth.outX + (player.z - mouth.z) * mouth.outZ;
    const metresToTheSide = Math.abs((player.x - mouth.x) * mouth.outZ - (player.z - mouth.z) * mouth.outX);
    if (metresInFront < 1.5 || metresToTheSide > metresInFront) continue;
    if (getAngleFromPlayerView(x, z) < scannedHalfAngle) continue;
    if (!canPlayerSeePoint(x, floor + 0.45, z)) continue;
    // Not where the vent's cover still stands in the mouth (or a crate has been left in it): it would be in the middle of that.
    if (isLooseObjectInTheWayAt(x, z, 0.5)) continue;
    good.push({ x: x, z: z, yaw: Math.atan2(mouth.outX, -mouth.outZ) });
  }
  return good.length > 0 ? good[Math.floor(Math.random() * good.length)] : null;
}

function startPhantomCrawler(phantom, spot) {
  const figure = phantom.figure;
  figure.pose.crawl = 1; figure.pose.stretch = 0; figure.pose.stoop = 0;
  figure.pose.headTilt = 0.35; figure.pose.fingerSplay = 0.9; figure.pose.legSwing = 0.25;
  updateFigureCapsules(figure);
  showPhantom(phantom);
}

function updatePhantomCrawler(phantom) {
  if (endPhantomIfSeenOrApproached(phantom, 40, 1.2, 3.2)) return;
  endPhantomIfForgotten(phantom, TUNING.phantomUnseenSeconds, TUNING.phantomCrawlerFarthestMetres + 10);
}

// ---------------------------------------------------------------------------
// Kind: in your face. You start a scan, and it is standing right in front of you, bent down to look you in the eye.
// It is gone a moment after the scan touches it. Everything else here keeps out of the beam; this one is the
// exception, and it is kept very rare (see the phantomFace numbers in 00-config.js).
// ---------------------------------------------------------------------------

function findPhantomFaceSpot() {
  if (Math.abs(player.pitch) > 0.45) return null; // you are looking at the floor or the ceiling: it would be out of view
  const forwardX = Math.sin(player.yaw), forwardZ = -Math.cos(player.yaw);
  const x = player.x + forwardX * TUNING.phantomFaceMetres, z = player.z + forwardZ * TUNING.phantomFaceMetres;
  const tileX = Math.floor(x), tileZ = Math.floor(z);
  if (!isInsideGrid(tileX, tileZ) || !isWalkableAt(tileX, tileZ)) return null;
  const index = tileIndexAt(tileX, tileZ);
  if (tileFlags[index] & (TILE_FLAG_DOOR | TILE_FLAG_VENT | TILE_FLAG_PIT)) return null;
  if (Math.abs(tileFloorHeight[index] - player.floorY) > 0.05 || getHeadroomAt(x, z) < 1.9) return null;
  // Clear air to where it stands, and three metres of it beyond: against a wall right behind it, a figure in
  // the colour of walls is lost among the wall's own points. It needs dark behind it to stand out.
  const floor = tileFloorHeight[index];
  if (!canPlayerSeePoint(x + forwardX * 3, floor + 1.5, z + forwardZ * 3) || !canPlayerSeePoint(x, floor + 0.5, z)) return null;
  return { x: x, z: z, yaw: getYawToward(x, z, player.x, player.z) };
}

function startPhantomFace(phantom, spot) {
  const figure = phantom.figure;
  // It is taller than you. Bent down as if under a ceiling a hand's width above your eyes, its head comes
  // level with yours and pushed forward: that is what fills the scan, not its chest. (The bend is worked out
  // with its arms down, and the arms are lifted afterwards; lifted arms would be measured as its height.)
  figure.pose.lean = 0.22; figure.pose.headTilt = 0.6; figure.pose.armRaise = 0;
  const eyeAboveFloor = getPlayerEyeY() - getFloorHeightAt(figure.x, figure.z);
  const fit = fitHollowUnderCeiling(figure, Math.min(getHeadroomAt(figure.x, figure.z), eyeAboveFloor + 0.3), 0, 0.05);
  figure.pose.stretch = fit.stretch; figure.pose.stoop = fit.crawl > 0 ? 1 : fit.stoop;
  // Arms half up and bent, hands coming at you from below its face and not hiding it.
  figure.pose.armRaise = 0.5; figure.pose.elbowBend = 0.75; figure.pose.fingerSplay = 1;
  updateFigureCapsules(figure);
  showPhantom(phantom);
  phantomDirector.faceUsed++;
}

function updatePhantomFace(phantom) {
  const figure = phantom.figure;
  if (figure.totalHits > 0 && phantom.firstHitTime < 0) phantom.firstHitTime = game.time;
  if (figure.totalHits > 25) phantom.wasEverSeen = true;
  const distance = distanceBetweenPoints(figure.x, figure.z, player.x, player.z);
  const hasBeenLookedAt = phantom.firstHitTime >= 0 && game.time - phantom.firstHitTime > TUNING.phantomFaceSeconds;
  // Also gone if you walk into it or back away from it, or if the scan stopped before it ever touched it.
  if (hasBeenLookedAt || distance < 0.6 || distance > 4 || game.time - phantom.bornTime > 2.5) endPhantom(phantom, true);
}

// Thrown every time a scan starts. Returns true if it put one out.
function updatePhantomFaceDice() {
  const isScanning = player.isPainting || player.sweepTimeRemaining > 0;
  const hasScanJustBegun = isScanning && !phantomDirector.wasScanning;
  phantomDirector.wasScanning = isScanning;
  if (!hasScanJustBegun || TUNING.phantomFaceChancePerScan <= 0 || game.difficulty.phantomFactor <= 0) return false;
  if (phantomDirector.faceUsed >= TUNING.phantomFaceMostPerDescent) return false;
  if (game.time - phantomDirector.startTime < TUNING.phantomFaceNotBeforeSeconds) return false;
  if (game.time - phantomDirector.lastEndTime < 30) return false; // not right on top of another apparition
  if (phantomDirector.current || !game.flags.hasLeftLift || game.flags.uploadStarted || player.isInVent) return false;
  if (Math.random() >= TUNING.phantomFaceChancePerScan) return false;
  return spawnPhantomOfKind('face') !== null;
}

// ---------------------------------------------------------------------------
// The phantom director: decides when a chance apparition is put out
// ---------------------------------------------------------------------------

// True while something real has, or is about to have, your attention. No apparitions then.
function isRealThreatNearPlayer() {
  if (hollow.isActive) {
    if (isDirectorOverruled() || hollow.enragedTimer > 0) return true;
    if (hollow.state === HOLLOW_STATE_HUNT || hollow.state === HOLLOW_STATE_SEARCH || hollow.state === HOLLOW_STATE_INVESTIGATE) return true;
    if (director.menace > TUNING.phantomMostMenace) return true;
  }
  return getNearestHuntingStillDistance() < 14;
}

// Why no chance apparition may be put out right now, in words, or '' if one may. Shown in debug mode.
function getPhantomHoldReason() {
  if (phantomDirector.used >= phantomDirector.budget) return 'this descent has had all of its apparitions';
  if (!game.flags.hasLeftLift) return 'you have not left the lift';
  if (game.flags.uploadStarted) return 'the lift has been called';
  if (player.isInVent) return 'you are in a vent';
  if (isRealThreatNearPlayer()) return 'something real is near';
  if (phantomDirector.current) return 'one is out now';
  if (phantomDirector.timer > 0) return 'the next comes in ' + Math.ceil(phantomDirector.timer) + ' s';
  return '';
}

// The kinds in the order they are to be tried. Kinds you have seen least often this descent come first, so a
// descent shows you as many different ones as it can; among those, it is a weighted draw. The first kind in the
// list that finds a place is the one that comes.
function drawPhantomKindOrder() {
  const drawn = [];
  for (const key of PHANTOM_KIND_KEYS) {
    const weight = PHANTOM_KINDS[key].weight;
    if (weight <= 0 || key === phantomDirector.lastKind) continue; // never the same kind twice running
    drawn.push([phantomDirector.seenByKind[key] || 0, Math.pow(Math.random(), 1 / weight), key]);
  }
  drawn.sort(function (first, second) { return first[0] - second[0] || second[1] - first[1]; });
  return drawn.map(function (entry) { return entry[2]; });
}

// Tries to put out one apparition of the given kind where the rules of that kind allow. Returns it, or null
// if there is no good place for one just now.
function spawnPhantomOfKind(kindKey) {
  const kind = PHANTOM_KINDS[kindKey];
  const spot = kind.findSpot();
  if (!spot) return null;
  const figure = createPhantomFigure(kindKey === 'dummy' ? FIGURE_PROPORTIONS_DUMMY : FIGURE_PROPORTIONS_HOLLOW);
  figure.x = spot.x; figure.z = spot.z; figure.yaw = spot.yaw;
  const phantom = createPhantomRecord(kindKey, figure);
  phantom.frameSeconds = 0;
  kind.start(phantom, spot);
  phantoms.push(phantom);
  phantomDirector.current = phantom;
  if (kindKey !== 'face') { phantomDirector.lastKind = kindKey; phantomDirector.kindOrder = []; }
  return phantom;
}

function updatePhantomDirector(dt) {
  // When something real comes for you, the apparition goes, and the next one is not waiting right behind it.
  if (isRealThreatNearPlayer()) {
    if (phantomDirector.current) endPhantom(phantomDirector.current, false);
    phantomDirector.timer = Math.max(phantomDirector.timer, 15);
    phantomDirector.wasScanning = player.isPainting || player.sweepTimeRemaining > 0;
    return;
  }
  phantomDirector.timer = Math.max(0, phantomDirector.timer - dt);
  if (updatePhantomFaceDice()) return;
  if (getPhantomHoldReason() !== '') return;
  phantomDirector.retryTimer -= dt;
  if (phantomDirector.retryTimer > 0) return;
  phantomDirector.retryTimer = 1.5;
  // The order of kinds is drawn once and kept until one has come. At first only the kind at the head of the
  // list is tried, so that a kind that needs a particular sort of place (a crossing, a vent) can wait for you
  // to walk into one. Every twelve seconds without a place, the next kind down the list may be tried as well.
  if (phantomDirector.kindOrder.length === 0) { phantomDirector.kindOrder = drawPhantomKindOrder(); phantomDirector.searchSeconds = 0; }
  const kindsToTry = Math.min(phantomDirector.kindOrder.length, 1 + Math.floor(phantomDirector.searchSeconds / 12));
  phantomDirector.searchSeconds += 1.5;
  for (let index = 0; index < kindsToTry; index++) {
    if (spawnPhantomOfKind(phantomDirector.kindOrder[index])) return;
  }
}

function resetPhantomDirector() {
  // The threat level can ask for more of them, fewer, or none (phantomFactor, see 00-config.js).
  phantomDirector.budget = getPhantomBudgetForRooms(level.roomCount || 19, game.difficulty.phantomFactor);
  phantomDirector.used = 0;
  phantomDirector.timer = TUNING.phantomFirstAfterSeconds + Math.random() * 30;
  phantomDirector.retryTimer = 0;
  phantomDirector.current = null;
  phantomDirector.lastKind = '';
  phantomDirector.lastStingerTime = -999;
  phantomDirector.startTime = game.time;
  phantomDirector.lastEndTime = -999;
  phantomDirector.faceUsed = 0;
  phantomDirector.wasScanning = false;
  phantomDirector.seenByKind = {};
  phantomDirector.kindOrder = [];
  phantomDirector.searchSeconds = 0;
}

// ---------------------------------------------------------------------------
// Start of a descent, and every frame
// ---------------------------------------------------------------------------

function createPhantoms() {
  for (const phantom of phantoms) setFigureRaycastable(phantom.figure, false);
  phantoms.length = 0;
  // A threat level with apparitions switched off has none at all: not the placed ones either.
  for (const definition of (game.difficulty.phantomFactor > 0 ? phantomDefinitions : [])) {
    const figure = createPhantomFigure(FIGURE_PROPORTIONS_HOLLOW);
    figure.x = definition.x; figure.z = definition.z; figure.yaw = definition.yaw;
    poseStandingPhantom(figure);
    const phantom = createPhantomRecord('placed', figure);
    phantom.definition = definition;
    phantoms.push(phantom);
  }
  computePhantomVentMouths();
  resetPhantomDirector();
}

function updatePhantoms(dt) {
  const playerZone = getZoneAtPosition(player.x, player.z);
  // Backwards, because one that goes is taken out of the list.
  for (let index = phantoms.length - 1; index >= 0; index--) {
    const phantom = phantoms[index];
    if (phantom.state === PHANTOM_STATE_GONE) continue;
    if (phantom.kind === 'placed') { updatePlacedPhantom(phantom, playerZone); continue; }
    phantom.frameSeconds = dt;
    PHANTOM_KINDS[phantom.kind].update(phantom);
  }
  updatePhantomDirector(dt);
}

// Debug mode and the tests: put out one of the given kind now, whatever the director thinks of it.
// The place still has to satisfy the rules of the kind. Returns the apparition, or null if there is no place.
function summonPhantom(kindKey) {
  if (!PHANTOM_KINDS[kindKey]) return null;
  if (phantomDirector.current) endPhantom(phantomDirector.current, false);
  return spawnPhantomOfKind(kindKey);
}
