// ---------------------------------------------------------------------------
// Things that move: doors, the Hollow, the calibration dummies ("Stills")
// and the apparitions that only ever exist as points.
// ---------------------------------------------------------------------------

const HOLLOW_STATE_ROAM = 0;
const HOLLOW_STATE_INVESTIGATE = 1;
const HOLLOW_STATE_HUNT = 2;
const HOLLOW_STATE_SEARCH = 3;
const HOLLOW_STATE_LISTEN = 4;   // standing still, listening harder than usual


const hollow = {
  figure: createFigure(FIGURE_PROPORTIONS_HOLLOW, SURFACE_HOLLOW, 'hollowImprintSeconds'),
  isActive: false,
  state: HOLLOW_STATE_ROAM,
  targetX: 0, targetZ: 0,
  lastKnownPlayerX: 0, lastKnownPlayerZ: 0,
  timeSinceSensed: 99,
  timeSinceLastHunt: 0,
  searchTimer: 0,
  searchRetargetTimer: 0,
  searchCenterX: 0, searchCenterZ: 0,
  // Anger runs from 0 (calm) to 1 (enraged). The beam raises it, time lowers it slowly.
  // Below TUNING.hollowAngerNoticeLevel the beam only makes it stop and turn; above, it knows where you are.
  anger: 0,
  wasInBeam: false,
  turnCaptionCooldown: 0,
  enragedTimer: 0,
  listenTimer: 0,
  nextListenIn: 12,
  lastNoiseX: 0, lastNoiseZ: 0, hasHeardNoise: false,
  lastKnownVelocityX: 0, lastKnownVelocityZ: 0,
  doubleBackTimer: 0, doubleBackX: 0, doubleBackZ: 0,
  heldAmount: 0,
  walkPhase: 0,
  lastStepSign: 1,
  graceTimer: 0,
  stingerCooldown: 0,
  armRaise: 0,
  distanceField: new Int16Array(TILE_COUNT),
  fieldTargetIndex: -1,
  currentSpeed: 0,
  knowsPlayerPositionAlways: false
};

const playerDistanceField = new Int16Array(TILE_COUNT);
let playerDistanceFieldAge = 99;

const stills = [];
let stillsAreHunting = false;
const stillDistanceField = new Int16Array(TILE_COUNT);
let stillDistanceFieldAge = 99;
let stillShiftCaptionCooldown = 0;

const phantoms = [];

// ---------------------------------------------------------------------------
// Noise: anything loud the player does is reported here
// ---------------------------------------------------------------------------

// How much better than normal the Hollow hears right now: anger sharpens it, and so does standing still to listen.
function getHollowHearingBoost() {
  if (!hollow.isActive) return 1;
  return (1 + TUNING.hollowAngerHearingBonus * hollow.anger) *
    (hollow.state === HOLLOW_STATE_LISTEN ? TUNING.hollowListenHearingFactor : 1);
}

function emitNoise(x, z, radius) {
  const effectiveRadius = radius * game.difficulty.hearingFactor * getHollowHearingBoost();
  recordDebugNoise(x, z, effectiveRadius);
  if (!hollow.isActive || hollow.graceTimer > 0 || debugState.options.creaturesIgnorePlayer) return;
  const distance = distanceBetweenPoints(x, z, hollow.figure.x, hollow.figure.z);
  // Too faint to act on, but close enough to make it turn its head that way.
  if (distance < effectiveRadius * 1.8) { hollow.lastNoiseX = x; hollow.lastNoiseZ = z; hollow.hasHeardNoise = true; }
  if (distance > effectiveRadius) return;
  if (hollow.state === HOLLOW_STATE_HUNT) {
    if (distance < effectiveRadius * 0.7) {
      hollow.lastKnownPlayerX = x; hollow.lastKnownPlayerZ = z;
      hollow.timeSinceSensed = Math.min(hollow.timeSinceSensed, 2.5);
    }
    return;
  }
  if (distance < effectiveRadius * 0.3) {
    beginHollowHunt(x, z);
  } else {
    hollow.state = HOLLOW_STATE_INVESTIGATE;
    hollow.targetX = x; hollow.targetZ = z;
    hollow.doubleBackTimer = 0;
  }
}

// ---------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------

function canPlayerOpenDoor(door) {
  if (door.kind === DOOR_KIND_AUTOMATIC) return true;
  if (door.kind === DOOR_KIND_POWERED) return game.flags.powerOn;
  if (door.kind === DOOR_KIND_KEYCARD) return game.flags.powerOn && game.flags.hasKeycard;
  return false;
}

function updateDoors(dt) {
  for (const door of doors) {
    let wantsOpen = false;
    let openedByPlayer = false;
    if (door.forcedState !== null) {
      wantsOpen = door.forcedState;
    } else {
      // TWEAK: doors notice you from 1.9 m away.
      const isPlayerNear = distanceBetweenPoints(player.x, player.z, door.centerX, door.centerZ) < 1.9;
      door.deniedMessageCooldown -= dt;
      if (isPlayerNear) {
        if (canPlayerOpenDoor(door)) {
          wantsOpen = true; openedByPlayer = true;
        } else if (door.deniedMessageCooldown <= 0) {
          door.deniedMessageCooldown = 5;
          playDeniedSound();
          if (door.kind === DOOR_KIND_KEYCARD && game.flags.powerOn) showMessage('Door locked. Keycard required.', 3.5, 'warning');
          else showMessage('Door has no power.', 3.5, 'warning');
        }
      }
      if (hollow.isActive && distanceBetweenPoints(hollow.figure.x, hollow.figure.z, door.centerX, door.centerZ) < 1.8) wantsOpen = true;
      if (stillsAreHunting && !wantsOpen) {
        for (const still of stills) {
          if (still.isPresent && distanceBetweenPoints(still.figure.x, still.figure.z, door.centerX, door.centerZ) < 1.5) { wantsOpen = true; break; }
        }
      }
    }
    if (wantsOpen) {
      door.closeDelay = 1.3;
      if (door.openFraction === 0) {
        const slab = door.slab;
        removePointsInsideBox(door.centerX - slab.halfX - 0.1, 0, door.centerZ - slab.halfZ - 0.1,
          door.centerX + slab.halfX + 0.1, 2.5, door.centerZ + slab.halfZ + 0.1);
        playDoorSound(door.centerX, door.centerZ, true);
        if (openedByPlayer) emitNoise(door.centerX, door.centerZ, TUNING.noiseRadiusDoor);
      }
    } else {
      door.closeDelay -= dt;
    }
    const target = wantsOpen || door.closeDelay > 0 ? 1 : 0;
    const previousFraction = door.openFraction;
    door.openFraction = approachValue(door.openFraction, target, dt * 1.7); // TWEAK: 1.7 = a door takes about 0.6 s to open
    if (previousFraction === 1 && door.openFraction < 1) playDoorSound(door.centerX, door.centerZ, false);
    const slab = door.slab;
    slab.centerY = 1.15 + door.openFraction * DOOR_TRAVEL_HEIGHT;
    slab.minimumY = slab.centerY - slab.halfY;
    slab.maximumY = slab.centerY + slab.halfY;
    slab.isRemoved = door.openFraction > 0.97;
  }
}

// ---------------------------------------------------------------------------
// The Hollow
// ---------------------------------------------------------------------------

function activateHollow(x, z, graceSeconds) {
  hollow.isActive = true;
  hollow.figure.x = x; hollow.figure.z = z;
  hollow.state = HOLLOW_STATE_ROAM;
  hollow.targetX = x; hollow.targetZ = z;
  hollow.timeSinceSensed = 99;
  hollow.timeSinceLastHunt = 0;
  hollow.anger = 0; hollow.wasInBeam = false; hollow.enragedTimer = 0; hollow.heldAmount = 0;
  hollow.listenTimer = 0; hollow.nextListenIn = 12; hollow.doubleBackTimer = 0; hollow.hasHeardNoise = false;
  hollow.graceTimer = graceSeconds;
  hollow.fieldTargetIndex = -1;
  updateFigureCapsules(hollow.figure);
  setFigureRaycastable(hollow.figure, true);
}

function deactivateHollow() {
  hollow.isActive = false;
  setFigureRaycastable(hollow.figure, false);
}

function refreshPlayerDistanceField() {
  computeDistanceField(playerDistanceField, findNearestWalkableTileIndex(player.x, player.z), 0, null);
  playerDistanceFieldAge = 0;
}

function chooseHollowRoamTarget() {
  refreshPlayerDistanceField();
  // An angry Hollow leaves you alone for less long.
  const wantsPressure = hollow.timeSinceLastHunt > TUNING.hollowPressureAfterSeconds * (1 - 0.5 * hollow.anger);
  const minimumSteps = wantsPressure ? 4 : 9, maximumSteps = wantsPressure ? 14 : 34;
  const candidates = [];
  for (const waypoint of roamingWaypoints) {
    const index = findNearestWalkableTileIndex(waypoint[0], waypoint[1]);
    if (index < 0) continue;
    const steps = playerDistanceField[index];
    if (steps >= minimumSteps && steps <= maximumSteps) candidates.push(waypoint);
  }
  const pool = candidates.length > 0 ? candidates : roamingWaypoints;
  const choice = pool[Math.floor(Math.random() * pool.length)];
  hollow.targetX = choice[0]; hollow.targetZ = choice[1];
}

// Moves the Hollow somewhere far from the player (after a death, or to give breathing room).
function relocateHollowAwayFromPlayer(graceSeconds) {
  if (!hollow.isActive) return;
  refreshPlayerDistanceField();
  let best = roamingWaypoints[0], bestSteps = -1;
  for (const waypoint of roamingWaypoints) {
    const index = findNearestWalkableTileIndex(waypoint[0], waypoint[1]);
    if (index < 0) continue;
    const steps = playerDistanceField[index];
    if (steps < NAVIGATION_UNREACHABLE && steps > bestSteps && tileZone[index] !== level.storeZone) { bestSteps = steps; best = waypoint; }
  }
  hollow.figure.x = best[0]; hollow.figure.z = best[1];
  hollow.state = HOLLOW_STATE_ROAM;
  hollow.timeSinceSensed = 99;
  hollow.timeSinceLastHunt = 0;
  hollow.anger *= 0.5; hollow.wasInBeam = false; hollow.enragedTimer = 0; hollow.heldAmount = 0;
  hollow.listenTimer = 0; hollow.doubleBackTimer = 0;
  hollow.graceTimer = graceSeconds;
  chooseHollowRoamTarget();
  updateFigureCapsules(hollow.figure);
}

function beginHollowHunt(x, z) {
  hollow.lastKnownPlayerX = x; hollow.lastKnownPlayerZ = z;
  hollow.timeSinceSensed = 0;
  hollow.lastKnownVelocityX = player.velocityX; hollow.lastKnownVelocityZ = player.velocityZ;
  hollow.doubleBackTimer = 0;
  if (hollow.state !== HOLLOW_STATE_HUNT) {
    hollow.state = HOLLOW_STATE_HUNT;
    hollow.timeSinceLastHunt = 0;
    if (hollow.stingerCooldown <= 0) {
      playStinger('spotted');
      showCaption('[it has found you]');
      hollow.stingerCooldown = 14;
    }
  }
}

function moveHollowToward(targetX, targetZ, speed, dt) {
  const figure = hollow.figure;
  const targetIndex = findNearestWalkableTileIndex(targetX, targetZ);
  if (targetIndex !== hollow.fieldTargetIndex) {
    computeDistanceField(hollow.distanceField, targetIndex, level.storeZone, null);
    hollow.fieldTargetIndex = targetIndex;
  }
  let goalX = targetX, goalZ = targetZ;
  const directDistance = distanceBetweenPoints(figure.x, figure.z, targetX, targetZ);
  const canWalkStraight = directDistance < 8 && hasClearWalkingLine(figure.x, figure.z, targetX, targetZ) &&
    getZoneAtPosition(targetX, targetZ) !== level.storeZone;
  if (!canWalkStraight) {
    const tileX = Math.floor(figure.x), tileZ = Math.floor(figure.z);
    const currentIndex = isInsideGrid(tileX, tileZ) ? tileIndexAt(tileX, tileZ) : -1;
    const field = hollow.distanceField;
    if (currentIndex < 0 || field[currentIndex] >= NAVIGATION_UNREACHABLE) {
      // Standing somewhere it cannot path from: drift to the nearest tile it can.
      let bestIndex = -1, bestDistance = Infinity;
      for (let offsetZ = -3; offsetZ <= 3; offsetZ++) {
        for (let offsetX = -3; offsetX <= 3; offsetX++) {
          const nearX = tileX + offsetX, nearZ = tileZ + offsetZ;
          if (!isInsideGrid(nearX, nearZ)) continue;
          const nearIndex = tileIndexAt(nearX, nearZ);
          if (field[nearIndex] >= NAVIGATION_UNREACHABLE) continue;
          const nearDistance = distanceBetweenPoints(figure.x, figure.z, nearX + 0.5, nearZ + 0.5);
          if (nearDistance < bestDistance) { bestDistance = nearDistance; bestIndex = nearIndex; }
        }
      }
      if (bestIndex < 0) return 0;
      goalX = bestIndex % GRID_WIDTH + 0.5; goalZ = Math.floor(bestIndex / GRID_WIDTH) + 0.5;
    } else if (field[currentIndex] > 0) {
      let bestValue = field[currentIndex], bestX = tileX, bestZ = tileZ, bestIsDiagonal = false;
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          if (offsetX === 0 && offsetZ === 0) continue;
          const nearX = tileX + offsetX, nearZ = tileZ + offsetZ;
          if (!isInsideGrid(nearX, nearZ)) continue;
          const value = field[tileIndexAt(nearX, nearZ)];
          if (value >= NAVIGATION_UNREACHABLE) continue;
          const isDiagonal = offsetX !== 0 && offsetZ !== 0;
          if (isDiagonal && (!isWalkableAt(tileX + offsetX, tileZ) || !isWalkableAt(tileX, tileZ + offsetZ))) continue;
          if (value < bestValue || (value === bestValue && bestIsDiagonal && !isDiagonal && value < field[currentIndex])) {
            bestValue = value; bestX = nearX; bestZ = nearZ; bestIsDiagonal = isDiagonal;
          }
        }
      }
      goalX = bestX + 0.5; goalZ = bestZ + 0.5;
    }
  }
  const deltaX = goalX - figure.x, deltaZ = goalZ - figure.z;
  const distance = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
  if (distance < 0.05) return 0;
  const step = Math.min(distance, speed * dt);
  figure.x += deltaX / distance * step;
  figure.z += deltaZ / distance * step;
  const desiredYaw = Math.atan2(deltaX, -deltaZ);
  figure.yaw += clampNumber(wrapAngleToPi(desiredYaw - figure.yaw), -dt * 5, dt * 5);
  return step;
}

// Where it starts looking once it has lost you: a little ahead of where you were last sensed,
// in the direction you were moving, if it can walk there in a straight line.
function chooseHollowSearchCenter() {
  const figure = hollow.figure;
  const leadX = hollow.lastKnownPlayerX + hollow.lastKnownVelocityX * TUNING.hollowSearchLeadSeconds;
  const leadZ = hollow.lastKnownPlayerZ + hollow.lastKnownVelocityZ * TUNING.hollowSearchLeadSeconds;
  if (isWalkableAt(Math.floor(leadX), Math.floor(leadZ)) && hasClearWalkingLine(hollow.lastKnownPlayerX, hollow.lastKnownPlayerZ, leadX, leadZ) &&
      getZoneAtPosition(leadX, leadZ) !== level.storeZone) {
    hollow.searchCenterX = leadX; hollow.searchCenterZ = leadZ;
    hollow.targetX = leadX; hollow.targetZ = leadZ;
    hollow.searchRetargetTimer = randomBetween(2, 3.5);
  } else {
    hollow.searchCenterX = figure.x; hollow.searchCenterZ = figure.z;
    hollow.searchRetargetTimer = 0;
  }
}

function updateHollow(dt) {
  if (!hollow.isActive) return;
  const figure = hollow.figure;
  hollow.graceTimer -= dt;
  hollow.stingerCooldown -= dt;
  hollow.turnCaptionCooldown -= dt;
  hollow.timeSinceLastHunt += dt;
  const distanceToPlayer = distanceBetweenPoints(figure.x, figure.z, player.x, player.z);
  const beamHits = figure.hitsThisFrame;
  figure.hitsThisFrame = 0;
  const canSense = hollow.graceTimer <= 0 && !debugState.options.creaturesIgnorePlayer;
  const isInBeam = canSense && beamHits >= TUNING.hollowBeamHitsToNotice;
  const isEnraged = hollow.enragedTimer > 0;

  // ---- anger: the beam raises it, time lowers it. A tap is survivable; holding is not. ----
  if (isInBeam && !isEnraged) {
    hollow.anger = Math.min(1, hollow.anger + dt * TUNING.hollowAngerPerBeamSecond);
    if (!hollow.wasInBeam && hollow.turnCaptionCooldown <= 0 && hollow.state !== HOLLOW_STATE_HUNT) {
      showCaption('[it turns toward the light]');
      hollow.turnCaptionCooldown = 12;
    }
  } else if (!isEnraged && hollow.state !== HOLLOW_STATE_HUNT) {
    hollow.anger = Math.max(0, hollow.anger - dt * TUNING.hollowAngerCoolingPerSecond);
  }

  // ---- senses: it is blind. It hears, and once angry enough it can follow the beam back to you. ----
  let isSensed = false;
  if (canSense) {
    if (isInBeam && hollow.anger >= TUNING.hollowAngerNoticeLevel) isSensed = true;
    const proximityRadius = player.audibleRadius * game.difficulty.hearingFactor * getHollowHearingBoost();
    if (distanceToPlayer < proximityRadius &&
        (distanceToPlayer < 1.6 || hasClearWalkingLine(figure.x, figure.z, player.x, player.z))) isSensed = true;
    if (hollow.knowsPlayerPositionAlways) isSensed = true;
  }
  if (isSensed) beginHollowHunt(player.x, player.z);
  else hollow.timeSinceSensed += dt;

  // The beam has just left it and it was not sure where the light came from: it comes over to look.
  if (hollow.wasInBeam && !isInBeam && canSense && hollow.state !== HOLLOW_STATE_HUNT &&
      hollow.anger >= TUNING.hollowAngerNoticeLevel * 0.5) {
    hollow.state = HOLLOW_STATE_INVESTIGATE;
    hollow.targetX = player.x; hollow.targetZ = player.z;
    hollow.doubleBackTimer = 0;
  }
  hollow.wasInBeam = isInBeam;

  // ---- full anger: enraged. The beam stops working on it for a while. ----
  if (hollow.anger >= 1 && !isEnraged) {
    hollow.enragedTimer = TUNING.hollowEnragedDurationSeconds;
    playStinger('enraged');
    showCaption('[the beam no longer holds it]');
  }
  if (hollow.enragedTimer > 0) {
    hollow.enragedTimer -= dt;
    if (hollow.enragedTimer <= 0) hollow.anger = TUNING.hollowAngerAfterEnraged;
  }
  const isHeld = isInBeam && hollow.enragedTimer <= 0;
  hollow.heldAmount = approachValue(hollow.heldAmount, isHeld ? 1 : 0, dt * 5);

  // ---- decide where to go ----
  let speed = TUNING.hollowRoamSpeed;
  if (hollow.state === HOLLOW_STATE_HUNT) {
    hollow.targetX = hollow.lastKnownPlayerX; hollow.targetZ = hollow.lastKnownPlayerZ;
    speed = TUNING.hollowHuntSpeed * (1 + TUNING.hollowAngerSpeedBonus * hollow.anger);
    const reachedLastKnown = distanceBetweenPoints(figure.x, figure.z, hollow.targetX, hollow.targetZ) < 1.2;
    if (hollow.timeSinceSensed > TUNING.hollowMemorySeconds && (reachedLastKnown || hollow.timeSinceSensed > TUNING.hollowMemorySeconds + 7)) {
      hollow.state = HOLLOW_STATE_SEARCH;
      hollow.searchTimer = TUNING.hollowSearchSeconds;
      chooseHollowSearchCenter();
      showCaption('[it has lost you]');
    }
  } else if (hollow.state === HOLLOW_STATE_INVESTIGATE) {
    speed = TUNING.hollowInvestigateSpeed;
    if (distanceBetweenPoints(figure.x, figure.z, hollow.targetX, hollow.targetZ) < 1.4) {
      hollow.state = HOLLOW_STATE_SEARCH;
      hollow.searchTimer = TUNING.hollowSearchSeconds * 0.75;
      hollow.searchCenterX = figure.x; hollow.searchCenterZ = figure.z;
      hollow.searchRetargetTimer = 0;
    }
  } else if (hollow.state === HOLLOW_STATE_SEARCH) {
    speed = TUNING.hollowRoamSpeed * 1.25;
    hollow.searchTimer -= dt;
    hollow.searchRetargetTimer -= dt;
    if (hollow.searchRetargetTimer <= 0) {
      hollow.searchRetargetTimer = randomBetween(1.5, 3);
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidateX = hollow.searchCenterX + randomBetween(-5, 5), candidateZ = hollow.searchCenterZ + randomBetween(-5, 5);
        if (isWalkableAt(Math.floor(candidateX), Math.floor(candidateZ)) && getZoneAtPosition(candidateX, candidateZ) !== level.storeZone) {
          hollow.targetX = candidateX; hollow.targetZ = candidateZ;
          break;
        }
      }
    }
    if (hollow.searchTimer <= 0) {
      hollow.state = HOLLOW_STATE_ROAM;
      chooseHollowRoamTarget();
      // Sometimes it only pretends to give up: it walks off, then comes straight back to the same spot.
      if (Math.random() < TUNING.hollowDoubleBackChance) {
        hollow.doubleBackTimer = randomBetween(6, 11);
        hollow.doubleBackX = hollow.searchCenterX; hollow.doubleBackZ = hollow.searchCenterZ;
      }
    }
  } else if (hollow.state === HOLLOW_STATE_LISTEN) {
    // Standing still. Nothing to hear from it but the clicking, and it hears you better than usual.
    speed = 0;
    hollow.listenTimer -= dt;
    if (hollow.listenTimer <= 0) hollow.state = HOLLOW_STATE_ROAM;
  } else {
    if (distanceBetweenPoints(figure.x, figure.z, hollow.targetX, hollow.targetZ) < 1.5) chooseHollowRoamTarget();
    if (hollow.doubleBackTimer > 0) {
      hollow.doubleBackTimer -= dt;
      if (hollow.doubleBackTimer <= 0) {
        hollow.state = HOLLOW_STATE_INVESTIGATE;
        hollow.targetX = hollow.doubleBackX; hollow.targetZ = hollow.doubleBackZ;
      }
    }
    // Every so often, when you are not far away, it stops dead and listens.
    hollow.nextListenIn -= dt;
    if (hollow.nextListenIn <= 0 && hollow.state === HOLLOW_STATE_ROAM) {
      hollow.nextListenIn = randomBetween(TUNING.hollowListenEverySecondsMinimum, TUNING.hollowListenEverySecondsMaximum);
      if (distanceToPlayer < TUNING.hollowListenWithinMetres) {
        hollow.state = HOLLOW_STATE_LISTEN;
        hollow.listenTimer = randomBetween(TUNING.hollowListenSecondsMinimum, TUNING.hollowListenSecondsMaximum);
        hollow.hasHeardNoise = false;
      }
    }
  }

  speed *= game.difficulty.hollowSpeedFactor * (game.flags.spoolsCollected >= 3 ? TUNING.hollowSpeedBonusWithAllSpools : 1);
  if (hollow.enragedTimer > 0) speed = TUNING.hollowEnragedSpeed * game.difficulty.hollowSpeedFactor;
  else speed *= interpolateLinear(1, TUNING.hollowHeldSpeedFactor, hollow.heldAmount);

  const movedDistance = speed > 0 ? moveHollowToward(hollow.targetX, hollow.targetZ, speed, dt) : 0;
  hollow.currentSpeed = movedDistance / Math.max(dt, 0.0001);

  // ---- pose ----
  const isHunting = hollow.state === HOLLOW_STATE_HUNT;
  const isListening = hollow.state === HOLLOW_STATE_LISTEN;
  hollow.walkPhase += movedDistance * 2.3;
  const stride = Math.min(1, hollow.currentSpeed / 1.4);
  const pose = figure.pose;
  pose.legSwing = Math.sin(hollow.walkPhase) * 0.55 * stride;
  pose.armSwing = Math.sin(hollow.walkPhase) * 0.22 * stride;
  pose.kneeBend = 0.16;
  hollow.armRaise = approachValue(hollow.armRaise, isHunting ? 1.0 : 0.06, dt * 1.4);
  pose.armRaise = hollow.armRaise;
  pose.elbowBend = 0.15 + hollow.armRaise * 0.25;
  pose.lean = (isListening ? 0.0 : 0.06) + hollow.armRaise * 0.25;
  // Listening, it draws itself up to its full height (as far as the ceiling allows) and spreads its fingers.
  // Hunting, it reaches. Otherwise it goes hunched, hands hanging by its knees.
  const ceilingHere = isInsideGrid(Math.floor(figure.x), Math.floor(figure.z))
    ? tileCeilingHeight[tileIndexAt(Math.floor(figure.x), Math.floor(figure.z))] : 2.3;
  const tallestStretch = clampNumber((ceilingHere - 2.25) / 0.32, 0, 1);
  const wantedStretch = isListening ? 1 : (isHunting ? 0.3 : 0);
  pose.stretch = approachValue(pose.stretch, Math.min(wantedStretch, tallestStretch), dt * 0.7);
  pose.fingerSplay = approachValue(pose.fingerSplay, (isHunting || hollow.heldAmount > 0.3) ? 1 : (isListening ? 0.75 : 0.2), dt * 2.5);
  pose.headTilt = 0.28 + Math.sin(game.time * (isListening ? 0.35 : 0.8)) * (isListening ? 0.45 : 0.2) +
    (hollow.heldAmount > 0.3 ? (Math.random() - 0.5) * 0.9 : 0);
  if (hollow.heldAmount > 0.3) {
    // Held in the beam it turns its whole body toward the emitter.
    const towardPlayer = Math.atan2(player.x - figure.x, -(player.z - figure.z));
    figure.yaw += clampNumber(wrapAngleToPi(towardPlayer - figure.yaw), -dt * 6, dt * 6);
  } else if (isListening && hollow.hasHeardNoise) {
    // While listening it slowly turns to face the last thing it heard, however faint.
    const towardNoise = Math.atan2(hollow.lastNoiseX - figure.x, -(hollow.lastNoiseZ - figure.z));
    figure.yaw += clampNumber(wrapAngleToPi(towardNoise - figure.yaw), -dt * 1.2, dt * 1.2);
  }
  updateFigureCapsules(figure);

  const stepSign = Math.sin(hollow.walkPhase) >= 0 ? 1 : -1;
  if (stepSign !== hollow.lastStepSign) {
    hollow.lastStepSign = stepSign;
    playHollowFootstep(figure.x, figure.z, isHunting ? 1 : 0.7);
  }

  if (distanceToPlayer < TUNING.hollowKillDistance && hollow.graceTimer <= 0) triggerPlayerDeath('hollow', figure);
}

function getHollowAggression() {
  if (!hollow.isActive) return 0;
  if (hollow.enragedTimer > 0) return 1;
  if (hollow.state === HOLLOW_STATE_HUNT) return 0.8;
  if (hollow.state === HOLLOW_STATE_INVESTIGATE || hollow.state === HOLLOW_STATE_SEARCH) return 0.35;
  if (hollow.state === HOLLOW_STATE_LISTEN) return 0.2;
  return 0.1;
}

// ---------------------------------------------------------------------------
// The Stills: calibration dummies that only move while nothing is scanning them
// ---------------------------------------------------------------------------

function createStills() {
  stills.length = 0;
  const poseRandom = createSeededRandomGenerator(4471);
  const addStill = function (point, isLateArrival) {
    const figure = createFigure(FIGURE_PROPORTIONS_DUMMY, SURFACE_STILL, 'stillImprintSeconds');
    figure.x = point[0]; figure.z = point[1];
    figure.yaw = poseRandom() * TWO_PI;
    figure.pose.armRaise = poseRandom() < 0.3 ? 0.5 + poseRandom() * 0.9 : 0.04;
    figure.pose.headTilt = (poseRandom() - 0.5) * 0.3;
    figure.pose.elbowBend = 0.05 + poseRandom() * 0.2;
    updateFigureCapsules(figure);
    const still = {
      figure: figure,
      homeX: point[0], homeZ: point[1], homeYaw: figure.yaw, homeArmRaise: figure.pose.armRaise,
      isPresent: !isLateArrival,
      isLateArrival: isLateArrival,
      wakeDelay: 0,
      restlessCooldown: 3 + poseRandom() * 6,
      distanceMovedSinceSound: 0
    };
    stills.push(still);
    if (still.isPresent) setFigureRaycastable(figure, true);
  };
  for (const point of stillSpawnPoints) addStill(point, false);
  for (const point of lateStillSpawnPoints) addStill(point, true);
  stillsAreHunting = false;
}

function resetStillsToHomePositions() {
  for (const still of stills) {
    still.figure.x = still.homeX; still.figure.z = still.homeZ;
    still.figure.yaw = still.homeYaw;
    still.figure.pose.armRaise = still.homeArmRaise;
    still.figure.pose.legSwing = 0;
    still.figure.lastScannedTime = game.time;
    still.wakeDelay = 2 + Math.random() * 5;
    updateFigureCapsules(still.figure);
  }
}

function awakenStills() {
  if (!game.difficulty.stillsEnabled) return;
  stillsAreHunting = true;
  for (const still of stills) {
    if (still.isLateArrival && !still.isPresent) {
      still.isPresent = true;
      const towardPlayer = Math.atan2(player.x - still.figure.x, -(player.z - still.figure.z));
      still.figure.yaw = towardPlayer;
      still.figure.lastScannedTime = -999;
      updateFigureCapsules(still.figure);
      setFigureRaycastable(still.figure, true);
      still.wakeDelay = 5;
    } else {
      // TWEAK: each dummy waits between 2.5 and 8.5 seconds before it first moves, so they do not all start at once.
      still.wakeDelay = 2.5 + Math.random() * 6;
    }
  }
}

function isPositionCrowdedByOtherStill(still, x, z) {
  for (const other of stills) {
    if (other === still || !other.isPresent) continue;
    if (distanceBetweenPoints(x, z, other.figure.x, other.figure.z) < 0.6) return true;
  }
  return false;
}

function updateStills(dt) {
  if (!game.difficulty.stillsEnabled) return;
  const playerZone = getZoneAtPosition(player.x, player.z);
  const isPlayerInStore = playerZone === level.storeZone;
  const isPlayerInReach = level.stillZones.indexOf(playerZone) >= 0;
  if (!isPlayerInReach || debugState.options.creaturesIgnorePlayer) return;
  stillShiftCaptionCooldown -= dt;
  stillDistanceFieldAge += dt;
  if (stillsAreHunting && stillDistanceFieldAge > 0.3) {
    computeDistanceField(stillDistanceField, findNearestWalkableTileIndex(player.x, player.z), 0, level.stillZones);
    stillDistanceFieldAge = 0;
  }
  for (const still of stills) {
    if (!still.isPresent) continue;
    const figure = still.figure;
    const isObserved = game.time - figure.lastScannedTime < TUNING.stillObservedHoldSeconds;
    const distanceToPlayer = distanceBetweenPoints(figure.x, figure.z, player.x, player.z);

    if (!stillsAreHunting) {
      // Not hostile yet. They just never stand quite where you left them.
      still.restlessCooldown -= dt;
      if (!isPlayerInStore || isObserved || still.restlessCooldown > 0 || game.time - figure.lastScannedTime < 3.5) continue;
      still.restlessCooldown = randomBetween(4, 10); // TWEAK: seconds between a dormant dummy's small shifts
      figure.yaw = Math.atan2(player.x - figure.x, -(player.z - figure.z));
      if (Math.random() < 0.4 && distanceToPlayer > 4.2) {
        const shift = randomBetween(0.4, 0.9);
        const newX = figure.x + (player.x - figure.x) / distanceToPlayer * shift;
        const newZ = figure.z + (player.z - figure.z) / distanceToPlayer * shift;
        if (isWalkableAt(Math.floor(newX), Math.floor(newZ)) && !isPositionCrowdedByOtherStill(still, newX, newZ) &&
            getZoneAtPosition(newX, newZ) === level.storeZone) {
          figure.x = newX; figure.z = newZ;
        }
      }
      updateFigureCapsules(figure);
      continue;
    }

    if (distanceToPlayer < TUNING.stillKillDistance) { triggerPlayerDeath('still', figure); return; }
    if (still.wakeDelay > 0) { still.wakeDelay -= dt; continue; }
    if (isObserved) continue;

    // Unobserved: walk toward the player along the flood-filled distance field.
    let goalX = player.x, goalZ = player.z;
    if (!(distanceToPlayer < 6 && hasClearWalkingLine(figure.x, figure.z, player.x, player.z))) {
      const tileX = Math.floor(figure.x), tileZ = Math.floor(figure.z);
      let bestValue = NAVIGATION_UNREACHABLE, bestX = -1, bestZ = -1;
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const nearX = tileX + offsetX, nearZ = tileZ + offsetZ;
          if (!isInsideGrid(nearX, nearZ)) continue;
          if (offsetX !== 0 && offsetZ !== 0 && (!isWalkableAt(tileX + offsetX, tileZ) || !isWalkableAt(tileX, tileZ + offsetZ))) continue;
          const value = stillDistanceField[tileIndexAt(nearX, nearZ)];
          if (value < bestValue) { bestValue = value; bestX = nearX; bestZ = nearZ; }
        }
      }
      if (bestX < 0) continue;
      goalX = bestX + 0.5; goalZ = bestZ + 0.5;
    }
    const deltaX = goalX - figure.x, deltaZ = goalZ - figure.z;
    const goalDistance = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
    if (goalDistance < 0.02) continue;
    const step = Math.min(goalDistance, TUNING.stillSpeed * dt);
    const newX = figure.x + deltaX / goalDistance * step, newZ = figure.z + deltaZ / goalDistance * step;
    if (isPositionCrowdedByOtherStill(still, newX, newZ)) continue;
    figure.x = newX; figure.z = newZ;
    figure.yaw = Math.atan2(player.x - figure.x, -(player.z - figure.z));
    figure.pose.armRaise = Math.max(figure.pose.armRaise, clampNumber(1.5 - distanceToPlayer * 0.22, 0, 1.35));
    figure.pose.legSwing = Math.sin((figure.x + figure.z) * 5) * 0.3;
    updateFigureCapsules(figure);
    still.distanceMovedSinceSound += step;
    if (still.distanceMovedSinceSound > 0.7) {
      still.distanceMovedSinceSound = 0;
      const panner = createTemporaryPanner(figure.x, 0.1, figure.z);
      if (panner) playNoiseBurst({ duration: 0.16, filterType: 'bandpass', frequency: 900, resonance: 3, gain: 0.5, useBrownNoise: true, playbackRate: 2.4, destination: panner });
      if (stillShiftCaptionCooldown <= 0) { showCaption('[something shifts behind you]'); stillShiftCaptionCooldown = 9; }
    }
  }
}

function getNearestHuntingStillDistance() {
  if (!stillsAreHunting) return Infinity;
  let nearest = Infinity;
  for (const still of stills) {
    if (!still.isPresent) continue;
    nearest = Math.min(nearest, distanceBetweenPoints(still.figure.x, still.figure.z, player.x, player.z));
  }
  return nearest;
}

// ---------------------------------------------------------------------------
// Phantoms: figures that show up in one scan and are gone in the next
// ---------------------------------------------------------------------------

function createPhantoms() {
  phantoms.length = 0;
  for (const definition of phantomDefinitions) {
    const figure = createFigure(FIGURE_PROPORTIONS_HOLLOW, SURFACE_PROP, 'phantomImprintSeconds');
    figure.x = definition.x; figure.z = definition.z; figure.yaw = definition.yaw;
    figure.pose.lean = 0.05; figure.pose.headTilt = 0.4; figure.pose.armRaise = 0.03; figure.pose.stretch = 0.35; figure.pose.fingerSplay = 0.5;
    updateFigureCapsules(figure);
    phantoms.push({ figure: figure, definition: definition, state: 0, firstHitTime: -1 });
  }
}

function updatePhantoms() {
  const playerZone = getZoneAtPosition(player.x, player.z);
  for (const phantom of phantoms) {
    if (phantom.state === 2) continue;
    const figure = phantom.figure;
    const distance = distanceBetweenPoints(figure.x, figure.z, player.x, player.z);
    if (phantom.definition.onlyBeforePower && game.flags.powerOn) {
      phantom.state = 2;
      setFigureRaycastable(figure, false);
      continue;
    }
    if (phantom.state === 0) {
      if (playerZone === phantom.definition.triggerZone && distance > 7) {
        phantom.state = 1;
        setFigureRaycastable(figure, true);
      }
      continue;
    }
    if (figure.totalHits > 0 && phantom.firstHitTime < 0) phantom.firstHitTime = game.time;
    const wasSeenLongEnough = phantom.firstHitTime >= 0 && figure.totalHits > 60 && game.time - phantom.firstHitTime > 1.5;
    if (wasSeenLongEnough || distance < 5.5) {
      phantom.state = 2;
      setFigureRaycastable(figure, false);
      if (figure.totalHits > 25) playStinger('phantom');
    }
  }
}
