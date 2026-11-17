// ---------------------------------------------------------------------------
// Debug mode: a panel of switches for looking at the game from the outside.
// Open it in play with the ` key (left of 1) or F2, or from the pause menu.
//
// Like the workshop, this is only present in a build made with `npm run dev`: nothing in here reaches
// index.html. The game itself keeps only what it reads (src/js/12-debug.js); this file fills that in.
//
// Nothing in here is needed to play. Every switch is off by default, and a run
// in which any of them was used is marked on the ending screen and does not
// count for the best time.
// ---------------------------------------------------------------------------

// The switches. `group` decides which heading they appear under in the panel.
// To add a switch: add a line here, then read `debugState.options.yourKey` wherever it should act.
const DEBUG_OPTION_DEFINITIONS = [
  { key: 'showCreatures', group: 'See', label: 'Show creatures', hint: 'Draws the Hollow (red), the Stills (amber) and apparitions (violet) as solid bodies.' },
  { key: 'seeThroughWalls', group: 'See', label: 'See creatures through walls', hint: 'Also draws them faintly behind walls. Needs "Show creatures".' },
  { key: 'lightStation', group: 'See', label: 'Light the station', hint: 'Draws every wall, floor and object with a metre grid, scanned or not.' },
  { key: 'showSenses', group: 'See', label: 'Show senses and paths', hint: 'Rings for how far you can be heard, noises as they happen, and the route the Hollow is walking.' },
  { key: 'creaturesOnMap', group: 'See', label: 'Creatures on the map', hint: 'Live positions on the minimap and the full map.' },
  { key: 'invulnerable', group: 'Cheat', label: 'Cannot be caught', hint: 'Creatures still chase you, but touching you does nothing.' },
  { key: 'creaturesIgnorePlayer', group: 'Cheat', label: 'Creatures ignore me', hint: 'The Hollow senses nothing and the Stills never advance.' },
  { key: 'freezeCreatures', group: 'Cheat', label: 'Freeze creatures', hint: 'Everything that walks stops where it is.' },
  { key: 'unlimitedScanner', group: 'Cheat', label: 'Scanner never heats', hint: 'Paint and sweep without limit.' },
  { key: 'unlimitedStamina', group: 'Cheat', label: 'Unlimited sprint', hint: 'The stamina bar stays full.' },
  { key: 'flyMode', group: 'Cheat', label: 'Fly through walls', hint: 'W and S move where you look, walls do not stop you, Shift goes faster. Nothing can catch you while flying.' }
];

const DEBUG_FLY_SPEED = 6;          // metres per second while flying
const DEBUG_FLY_SPEED_FAST = 16;    // with Shift held
const DEBUG_NOISE_RING_SECONDS = 2; // how long a noise ring stays drawn

// The game's own debugState holds the switches and whether the panel is up. This adds what only debug mode needs.
Object.assign(debugState, {
  noiseEvents: [],
  zoneDestinations: [],
  zoneSelectElement: null,
  defaultTuning: {},
  panelElement: null,
  readoutElement: null,
  badgeElement: null,
  readoutTimer: 0,
  frameCounter: 0,
  frameCounterTime: 0,
  framesPerSecond: 0,
  frameData: {
    lightStation: false,
    seeThroughWalls: false,
    figures: [],
    lineVertices: new Float32Array(DEBUG_MAXIMUM_LINE_VERTICES * 6),
    lineVertexCount: 0
  }
});
for (const definition of DEBUG_OPTION_DEFINITIONS) debugState.options[definition.key] = false;

function isAnyDebugOptionOn() {
  for (const definition of DEBUG_OPTION_DEFINITIONS) {
    if (debugState.options[definition.key]) return true;
  }
  return false;
}

function markDebugUsed() {
  debugState.hasBeenUsedThisRun = true;
}

function setDebugOption(key, isOn) {
  const wasFlying = debugState.options.flyMode;
  debugState.options[key] = isOn;
  if (isOn) markDebugUsed();
  if (key === 'flyMode' && wasFlying && !isOn) landAfterFlying();
  const checkbox = document.getElementById('debug-option-' + key);
  if (checkbox) checkbox.checked = isOn;
  refreshDebugBadge();
}

function refreshDebugBadge() {
  if (debugState.badgeElement) debugState.badgeElement.hidden = !(isAnyDebugOptionOn() || debugState.hasBeenUsedThisRun);
}

// Called when a new run starts: switches stay as they are, so a run that starts with one on is already marked.
function resetDebugForNewRun() {
  debugState.hasBeenUsedThisRun = isAnyDebugOptionOn();
  debugState.noiseEvents.length = 0;
  refreshDebugBadge();
}

// ---------------------------------------------------------------------------
// Flying
// ---------------------------------------------------------------------------

function updateDebugFlight(dt, forwardInput, strafeInput) {
  const keys = input.keysDown;
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') || input.touchSprint) ? DEBUG_FLY_SPEED_FAST : DEBUG_FLY_SPEED;
  const cosinePitch = Math.cos(player.pitch);
  const forwardX = Math.sin(player.yaw) * cosinePitch, forwardY = Math.sin(player.pitch), forwardZ = -Math.cos(player.yaw) * cosinePitch;
  const rightX = Math.cos(player.yaw), rightZ = Math.sin(player.yaw);
  player.x += (forwardX * forwardInput + rightX * strafeInput) * speed * dt;
  player.z += (forwardZ * forwardInput + rightZ * strafeInput) * speed * dt;
  player.eyeHeight = clampNumber(player.eyeHeight + forwardY * forwardInput * speed * dt, -75, 40);
  player.velocityX = 0; player.velocityZ = 0;
  player.isMoving = false; player.isSprinting = false; player.isCrouching = false;
  player.audibleRadius = 0;
}

// Flying can end inside solid rock. Put the player back on the nearest floor.
function landAfterFlying() {
  const index = findNearestWalkableTileIndex(player.x, player.z);
  if (index < 0) {
    player.x = game.checkpoint.x; player.z = game.checkpoint.z;
  } else if (!isWalkableAt(Math.floor(player.x), Math.floor(player.z))) {
    player.x = index % GRID_WIDTH + 0.5;
    player.z = Math.floor(index / GRID_WIDTH) + 0.5;
  }
  player.eyeHeight = TUNING.eyeHeightStanding;
  player.floorY = getFloorHeightAt(player.x, player.z);
}

// ---------------------------------------------------------------------------
// Actions (the buttons in the panel)
// ---------------------------------------------------------------------------

function debugRestorePower() {
  markDebugUsed();
  game.flags.powerOn = true;
  const generator = findInteractableByObjectId(OBJECT_GENERATOR);
  if (generator) generator.isAvailable = false;
  setGeneratorSoundRunning(true);
  refreshObjective();
  showMessage('Debug: mains power restored. The Hollow was not woken.', 3, 'info');
}

function debugGiveKeycard() {
  markDebugUsed();
  setKeycardLevel(3); // every card there could be
  for (const objectId of KEYCARD_OBJECT_IDS) {
    const keycard = objectId ? findInteractableByObjectId(objectId) : null;
    if (keycard && keycard.isAvailable) removeInteractableFromWorld(keycard);
  }
  showMessage(level.keycardCount > 1 ? 'Debug: all ' + level.keycardCount + ' keycards given.' : 'Debug: keycard given.', 3, 'info');
}

function debugGiveAllSpools() {
  markDebugUsed();
  const quest = findQuest('spools');
  for (const object of quest ? quest.objects : []) {
    const spool = findInteractableByObjectId(object.objectId);
    if (spool && spool.isAvailable) removeInteractableFromWorld(spool);
  }
  game.flags.spoolsCollected = level.spoolCount;
  refreshObjective();
  showMessage('Debug: all ' + level.spoolCount + ' spools given.', 3, 'info');
}

// Puts out one apparition of the chosen kind. Each kind has its own idea of a good place (see 08-phantoms.js),
// and from where you are standing there may not be one: then this says so.
function debugSummonPhantom(kindKey) {
  markDebugUsed();
  const phantom = summonPhantom(kindKey);
  const label = PHANTOM_KINDS[kindKey].label.toLowerCase();
  if (!phantom) { showMessage('Debug: no good place for the "' + label + '" apparition from here. Try a longer room or corridor.', 4, 'warning'); return; }
  const distance = distanceBetweenPoints(phantom.figure.x, phantom.figure.z, player.x, player.z).toFixed(0);
  if (phantom.state === PHANTOM_STATE_WAITING) showMessage('Debug: "' + label + '" is waiting ' + distance + ' m away. Scan ahead of you and it starts.', 4, 'warning');
  else showMessage('Debug: "' + label + '" apparition is out, ' + distance + ' m away. Switch on "Show creatures" to see where.', 4, 'warning');
}

function debugSummonHollow() {
  markDebugUsed();
  // Look for a spot about eight metres ahead; fall back to nearer ones if that is inside a wall.
  for (let distance = 8; distance >= 2; distance -= 1) {
    const targetX = player.x + Math.sin(player.yaw) * distance, targetZ = player.z - Math.cos(player.yaw) * distance;
    if (isWalkableAt(Math.floor(targetX), Math.floor(targetZ)) && hasClearWalkingLine(player.x, player.z, targetX, targetZ)) {
      activateHollow(targetX, targetZ, 3);
      chooseHollowRoamTarget();
      showMessage('Debug: the Hollow is ' + distance + ' m in front of you.', 3, 'warning');
      return;
    }
  }
  activateHollow(HOLLOW_SPAWN_POSITION.x, HOLLOW_SPAWN_POSITION.z, 3);
  chooseHollowRoamTarget();
  showMessage('Debug: no room in front of you. The Hollow was placed at Shaft 9.', 3, 'warning');
}

function debugSendHollowAway() {
  markDebugUsed();
  if (!hollow.isActive) { showMessage('Debug: the Hollow is not in the station.', 3, 'info'); return; }
  relocateHollowAwayFromPlayer(10);
  showMessage('Debug: the Hollow was moved as far from you as it can get.', 3, 'info');
}

function debugRemoveHollow() {
  markDebugUsed();
  deactivateHollow();
  hollow.knowsPlayerPositionAlways = false;
  showMessage('Debug: the Hollow was removed.', 3, 'info');
}

function debugWakeStills() {
  markDebugUsed();
  if (!game.difficulty.stillsEnabled) { showMessage('Debug: the Stills are switched off on this threat level.', 4, 'info'); return; }
  awakenStills();
  showMessage('Debug: the Stills are awake.', 3, 'warning');
}

function debugRevealMap() {
  markDebugUsed();
  revealWholeMap();
  showMessage('Debug: the whole station is on the map.', 3, 'info');
}

function debugClearPoints() {
  markDebugUsed();
  clearAllPoints();
  showMessage('Debug: point cloud cleared.', 3, 'info');
}

function debugBringLift() {
  markDebugUsed();
  if (game.flags.liftArrived) { showMessage('Debug: the lift is already here.', 3, 'info'); return; }
  if (!game.flags.powerOn) debugRestorePower();
  if (game.flags.spoolsCollected < level.spoolCount) debugGiveAllSpools();
  if (!game.flags.uploadStarted) startLiftCall();
  game.liftCountdown = 0.5;
}

function debugTeleportToZone(zone) {
  for (const destination of debugState.zoneDestinations) {
    if (destination.zone !== zone) continue;
    markDebugUsed();
    player.x = destination.x; player.z = destination.z;
    player.velocityX = 0; player.velocityZ = 0;
    if (!debugState.options.flyMode) player.eyeHeight = TUNING.eyeHeightStanding;
    return;
  }
}

// Refills the "Go to" list. Called at start-up and again whenever a different station is loaded.
function rebuildDebugZoneList() {
  computeDebugZoneDestinations();
  const zoneSelect = debugState.zoneSelectElement;
  if (!zoneSelect) return;
  zoneSelect.textContent = '';
  for (const destination of debugState.zoneDestinations) {
    const option = document.createElement('option');
    option.value = String(destination.zone);
    option.textContent = ZONE_NAMES[destination.zone];
    zoneSelect.appendChild(option);
  }
}

// One standing spot per zone: the walkable tile closest to the middle of the zone.
function computeDebugZoneDestinations() {
  const sums = {};
  for (let index = 0; index < TILE_COUNT; index++) {
    const zone = tileZone[index];
    if (!zone || !tileIsWalkable[index]) continue;
    if (!sums[zone]) sums[zone] = { x: 0, z: 0, count: 0 };
    sums[zone].x += index % GRID_WIDTH + 0.5;
    sums[zone].z += Math.floor(index / GRID_WIDTH) + 0.5;
    sums[zone].count++;
  }
  debugState.zoneDestinations.length = 0;
  for (const zoneText in sums) {
    const zone = Number(zoneText);
    const middleX = sums[zone].x / sums[zone].count, middleZ = sums[zone].z / sums[zone].count;
    let bestIndex = -1, bestDistance = Infinity;
    for (let index = 0; index < TILE_COUNT; index++) {
      if (tileZone[index] !== zone || !tileIsWalkable[index]) continue;
      const distance = distanceBetweenPoints(middleX, middleZ, index % GRID_WIDTH + 0.5, Math.floor(index / GRID_WIDTH) + 0.5);
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    }
    debugState.zoneDestinations.push({ zone: zone, x: bestIndex % GRID_WIDTH + 0.5, z: Math.floor(bestIndex / GRID_WIDTH) + 0.5 });
  }
}

// ---------------------------------------------------------------------------
// What the renderer draws for debug mode this frame
// ---------------------------------------------------------------------------

function recordDebugNoise(x, z, radius) {
  if (!debugState.options.showSenses) return;
  debugState.noiseEvents.push({ x: x, z: z, radius: radius, time: game.time });
  if (debugState.noiseEvents.length > 24) debugState.noiseEvents.shift();
}

function pushDebugLine(fromX, fromY, fromZ, toX, toY, toZ, red, green, blue) {
  const data = debugState.frameData;
  if (data.lineVertexCount + 2 > DEBUG_MAXIMUM_LINE_VERTICES) return;
  const vertices = data.lineVertices;
  let offset = data.lineVertexCount * 6;
  vertices[offset++] = fromX; vertices[offset++] = fromY; vertices[offset++] = fromZ;
  vertices[offset++] = red; vertices[offset++] = green; vertices[offset++] = blue;
  vertices[offset++] = toX; vertices[offset++] = toY; vertices[offset++] = toZ;
  vertices[offset++] = red; vertices[offset++] = green; vertices[offset++] = blue;
  data.lineVertexCount += 2;
}

function pushDebugCircle(centerX, y, centerZ, radius, red, green, blue) {
  const segmentCount = radius > 6 ? 56 : 32;
  for (let segment = 0; segment < segmentCount; segment++) {
    const angleA = segment / segmentCount * TWO_PI, angleB = (segment + 1) / segmentCount * TWO_PI;
    pushDebugLine(centerX + Math.cos(angleA) * radius, y, centerZ + Math.sin(angleA) * radius,
      centerX + Math.cos(angleB) * radius, y, centerZ + Math.sin(angleB) * radius, red, green, blue);
  }
}

function pushDebugCross(x, y, z, size, red, green, blue) {
  pushDebugLine(x - size, y, z - size, x + size, y, z + size, red, green, blue);
  pushDebugLine(x - size, y, z + size, x + size, y, z - size, red, green, blue);
  pushDebugLine(x, y, z, x, y + 1.8, z, red, green, blue);
}

// Follows the Hollow's own distance field downhill, which is exactly the route it will take.
function pushDebugHollowRoute() {
  const field = hollow.distanceField;
  let tileX = Math.floor(hollow.figure.x), tileZ = Math.floor(hollow.figure.z);
  if (!isInsideGrid(tileX, tileZ)) return;
  let previousX = hollow.figure.x, previousZ = hollow.figure.z;
  for (let step = 0; step < 160; step++) {
    const value = field[tileIndexAt(tileX, tileZ)];
    if (value <= 0 || value >= NAVIGATION_UNREACHABLE) break;
    let nextX = tileX, nextZ = tileZ, bestValue = value;
    for (let direction = 0; direction < 4; direction++) {
      const candidateX = tileX + (direction === 0 ? 1 : direction === 1 ? -1 : 0);
      const candidateZ = tileZ + (direction === 2 ? 1 : direction === 3 ? -1 : 0);
      if (!isInsideGrid(candidateX, candidateZ)) continue;
      const candidateValue = field[tileIndexAt(candidateX, candidateZ)];
      if (candidateValue < bestValue) { bestValue = candidateValue; nextX = candidateX; nextZ = candidateZ; }
    }
    if (nextX === tileX && nextZ === tileZ) break;
    pushDebugLine(previousX, getFloorHeightAt(previousX, previousZ) + 0.06, previousZ, nextX + 0.5, getFloorHeightAt(nextX + 0.5, nextZ + 0.5) + 0.06, nextZ + 0.5, 1.0, 0.85, 0.2);
    previousX = nextX + 0.5; previousZ = nextZ + 0.5;
    tileX = nextX; tileZ = nextZ;
  }
}

// Returns what the renderer should draw for debug mode, or null when nothing is switched on.
function buildDebugFrameData() {
  const options = debugState.options;
  if (!options.showCreatures && !options.lightStation && !options.showSenses) return null;
  const data = debugState.frameData;
  data.lightStation = options.lightStation;
  data.seeThroughWalls = options.seeThroughWalls;
  data.figures.length = 0;
  data.lineVertexCount = 0;

  if (options.showCreatures) {
    if (hollow.isActive) {
      const isHunting = hollow.state === HOLLOW_STATE_HUNT || hollow.enragedTimer > 0;
      data.figures.push({ figure: hollow.figure, red: 1.0, green: isHunting ? 0.05 : 0.3, blue: isHunting ? 0.05 : 0.25 });
    }
    for (const still of stills) {
      if (!still.isPresent) continue;
      const isAdvancing = stillsAreHunting && still.wakeDelay <= 0;
      data.figures.push({ figure: still.figure, red: 1.0, green: isAdvancing ? 0.45 : 0.75, blue: isAdvancing ? 0.05 : 0.3 });
    }
    for (const phantom of phantoms) {
      if (phantom.state === 2) continue;
      // Waiting apparitions are drawn darker than ones that can currently be scanned.
      const strength = phantom.state === 1 ? 1 : 0.45;
      data.figures.push({ figure: phantom.figure, red: 0.6 * strength, green: 0.4 * strength, blue: 1.0 * strength });
    }
  }

  if (options.showSenses) {
    // Cyan ring: how close the Hollow must be to notice you as you are right now.
    pushDebugCircle(player.x, player.floorY + 0.05, player.z, Math.max(0.05, player.audibleRadius * game.difficulty.hearingFactor), 0.2, 0.9, 1.0);
    // Fading magenta rings: noises as they happen.
    for (const event of debugState.noiseEvents) {
      const age = game.time - event.time;
      if (age < 0 || age > DEBUG_NOISE_RING_SECONDS) continue;
      const strength = 1 - age / DEBUG_NOISE_RING_SECONDS;
      pushDebugCircle(event.x, getFloorHeightAt(event.x, event.z) + 0.08, event.z, Math.min(event.radius, 60), strength, 0.2 * strength, 0.9 * strength);
    }
    if (hollow.isActive) {
      // Red ring: its reach. Yellow: the route it is walking and where it is going. Orange: where it last sensed you.
      pushDebugCircle(hollow.figure.x, hollow.figure.y + 0.05, hollow.figure.z, TUNING.hollowKillDistance, 1.0, 0.1, 0.1);
      pushDebugHollowRoute();
      pushDebugCross(hollow.targetX, getFloorHeightAt(hollow.targetX, hollow.targetZ) + 0.05, hollow.targetZ, 0.35, 1.0, 0.85, 0.2);
      if (hollow.state === HOLLOW_STATE_HUNT) pushDebugCross(hollow.lastKnownPlayerX, getFloorHeightAt(hollow.lastKnownPlayerX, hollow.lastKnownPlayerZ) + 0.05, hollow.lastKnownPlayerZ, 0.25, 1.0, 0.45, 0.1);
    }
    for (const still of stills) {
      if (still.isPresent) pushDebugCircle(still.figure.x, still.figure.y + 0.05, still.figure.z, TUNING.stillKillDistance, 1.0, 0.7, 0.2);
    }
  }
  return data;
}

// Draws live creature positions on a map canvas. `toCanvas` converts metres to canvas pixels.
function drawDebugMapMarkers(context, toCanvasX, toCanvasY, markerSize) {
  if (!debugState.options.creaturesOnMap) return;
  context.save();
  for (const still of stills) {
    if (!still.isPresent) continue;
    context.fillStyle = stillsAreHunting ? '#ff8a1e' : '#ffd166';
    context.fillRect(toCanvasX(still.figure.x) - markerSize / 2, toCanvasY(still.figure.z) - markerSize / 2, markerSize, markerSize);
  }
  for (const phantom of phantoms) {
    if (phantom.state === 2) continue;
    context.fillStyle = '#a58bff';
    context.fillRect(toCanvasX(phantom.figure.x) - markerSize / 2, toCanvasY(phantom.figure.z) - markerSize / 2, markerSize, markerSize);
  }
  if (hollow.isActive) {
    const hollowX = toCanvasX(hollow.figure.x), hollowY = toCanvasY(hollow.figure.z);
    context.strokeStyle = '#ffd94a';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(hollowX, hollowY);
    context.lineTo(toCanvasX(hollow.targetX), toCanvasY(hollow.targetZ));
    context.stroke();
    context.fillStyle = '#ff3b2f';
    context.beginPath();
    context.arc(hollowX, hollowY, markerSize * 0.8, 0, TWO_PI);
    context.fill();
  }
  context.restore();
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

const HOLLOW_STATE_NAMES = ['roaming', 'investigating', 'hunting', 'searching', 'standing still, listening'];

// Puts a loose object of the chosen kind in the air a step in front of you, to be picked up, carried and thrown.
function debugPutLooseObjectAhead(kindKey) {
  markDebugUsed();
  const forwardX = Math.sin(player.yaw), forwardZ = -Math.cos(player.yaw);
  const eyeY = getPlayerEyeY();
  // A step ahead, or half way to the wall if the wall is nearer than that.
  let distance = 1.1;
  if (castRayAgainstWorld(player.x, eyeY - 0.3, player.z, forwardX, 0, forwardZ, 1.6)) distance = Math.min(distance, rayHit.distance * 0.5);
  const object = createLooseObject(kindKey, player.x + forwardX * distance, eyeY - 0.3, player.z + forwardZ * distance, player.yaw);
  if (object) showMessage('Debug: a ' + object.kind.label + ' in front of you.', 3, 'info');
  return object;
}

function debugRemoveLooseObjects() {
  markDebugUsed();
  while (looseObjects.length > 0) removeLooseObject(looseObjects[looseObjects.length - 1]); // one by one, so that each takes its points with it
  clearLooseObjects();
  showMessage('Debug: every loose object removed.', 3, 'info');
}

function buildDebugReadout() {
  const lines = [];
  let heading = Math.round(player.yaw / DEGREES_TO_RADIANS) % 360;
  if (heading < 0) heading += 360;
  lines.push('frames/s    ' + debugState.framesPerSecond.toFixed(0));
  lines.push('position    x ' + player.x.toFixed(1) + '  z ' + player.z.toFixed(1) + '  eye ' + player.eyeHeight.toFixed(2) + '  floor ' + player.floorY.toFixed(1));
  lines.push('heading     ' + heading + ' deg   zone ' + getZoneAtPosition(player.x, player.z));
  lines.push('points      ' + formatWithThousandsSeparators(pointCloud.storedCount) + ' of ' + formatWithThousandsSeparators(pointCloud.capacity));
  lines.push('heard from  ' + (player.audibleRadius * game.difficulty.hearingFactor).toFixed(1) + ' m');
  if (looseObjects.length > 0) {
    let awake = 0, worth = 0, handled = 0;
    for (const object of looseObjects) { if (!object.isAsleep) awake++; worth += getLooseObjectValue(object); if (object.wasHandled) handled++; }
    const held = getHeldLooseObject();
    lines.push('objects     ' + looseObjects.length + ' loose, ' + awake + ' moving' + (held ? '   carrying the ' + held.kind.label : ''));
    lines.push('  knocks    ' + looseState.statistics.knocksHeard + ' heard by it, ' + looseState.statistics.knocksQuiet + ' only by you');
    if (haulState.isActive) {
      const salvage = getHaulProgress();
      lines.push('  salvage   ' + salvage.done + ' of ' + salvage.total + '   (' + haulState.withinWalk + ' within walking reach)');
      for (const bay of haulState.bays) lines.push('  bay ' + (bay.index + 1) + '     ' + bay.state + ' at x ' + bay.doorwayX.toFixed(0) + '  z ' + bay.doorwayZ.toFixed(0) + '   ' + (bay.state === 'sealed' ? bay.taken + ' taken' : getHaulBayValue(bay) + ' of ' + bay.quota));
    }
    lines.push('  worth     ' + worth + ' in all' + (held ? ', ' + getLooseObjectValue(held) + ' of ' + held.kind.value + ' in the beam' : '') + '   lost to knocks ' + looseState.statistics.worthLost + '   handled ' + handled + '   thrown back ' + looseState.statistics.flungBack);
  }
  if (hollow.isActive) {
    const distance = distanceBetweenPoints(hollow.figure.x, hollow.figure.z, player.x, player.z);
    lines.push('HOLLOW      ' + (hollow.enragedTimer > 0 ? 'ENRAGED' : HOLLOW_STATE_NAMES[hollow.state]));
    lines.push('  distance  ' + distance.toFixed(1) + ' m   speed ' + hollow.currentSpeed.toFixed(1) + ' m/s');
    lines.push('  in beam   ' + (hollow.wasInBeam ? 'yes' : 'no') + '   anger ' + hollow.anger.toFixed(2) + ' (notices at ' + TUNING.hollowAngerNoticeLevel + ')');
    if (hollow.doubleBackTimer > 0) lines.push('  feint     doubling back in ' + hollow.doubleBackTimer.toFixed(1) + ' s');
    lines.push('  sensed    ' + (hollow.timeSinceSensed < 90 ? hollow.timeSinceSensed.toFixed(1) + ' s ago' : 'never'));
    if (hollow.doorBang) {
      lines.push('  AT A DOOR ' + (hollow.doorBang.isPounding ? 'pounding, blow ' + hollow.doorBang.hits : 'walking up to it') + '; the door has taken ' +
        Math.round(hollow.doorBang.door.damage * 100) + ' % of what it can');
    }
    if (isHollowInCrawlspace()) {
      const crawl = hollow.crawlspace;
      const secondsLeft = crawl.phase === CRAWL_PHASE_CLIMBING ? TUNING.hollowCrawlClimbSeconds - crawl.timer :
        (crawl.phase === CRAWL_PHASE_TRAVELLING ? crawl.travelSeconds - crawl.timer : TUNING.hollowCrawlDropWarningSeconds - crawl.timer);
      lines.push('  CRAWLSPACE ' + CRAWL_PHASE_NAMES[crawl.phase] + ', ' + Math.max(0, secondsLeft).toFixed(1) + ' s more; it comes out ' +
        distanceBetweenPoints(crawl.to.x, crawl.to.z, player.x, player.z).toFixed(0) + ' m from you');
    }
    lines.push('DIRECTOR    ' + (isDirectorOverruled() ? 'OVERRULED (the ending)' : DIRECTOR_PHASE_NAMES[director.phase]) + '   menace ' + director.menace.toFixed(2) + (director.hasPeaked ? ' (breather owed)' : '') + '   pace x' + getDirectorPaceFactor().toFixed(2));
    lines.push('  steering  to rooms ' + director.ringMinimumSteps + ' to ' + (director.ringMaximumSteps > 9000 ? 'any' : director.ringMaximumSteps) + ' steps from you; it is ' +
      (director.stepsToPlayer >= NAVIGATION_UNREACHABLE ? 'unreachable' : director.stepsToPlayer + ' steps') + ' away');
  } else {
    lines.push('HOLLOW      not in the station');
  }
  lines.push('station     ' + level.description);
  lines.push('crawlspace  ' + hollowHatches.length + ' hatches in ' + hollowPartCount + ' locked-off part' + (hollowPartCount === 1 ? '' : 's') + '; you are in part ' +
    (isInsideGrid(Math.floor(player.x), Math.floor(player.z)) ? tileHollowPart[tileIndexAt(Math.floor(player.x), Math.floor(player.z))] : 0));
  let presentStills = 0, nearestStill = Infinity;
  for (const still of stills) {
    if (!still.isPresent) continue;
    presentStills++;
    nearestStill = Math.min(nearestStill, distanceBetweenPoints(still.figure.x, still.figure.z, player.x, player.z));
  }
  lines.push('STILLS      ' + presentStills + (stillsAreHunting ? ' awake' : ' dormant') + '   nearest ' + (nearestStill < 999 ? nearestStill.toFixed(1) + ' m' : '-'));
  if (game.liftCountdown > 0) lines.push('lift in     ' + game.liftCountdown.toFixed(1) + ' s');
  // Apparitions: how many chance ones this descent has had, why none may come now, and the one that is out.
  const holdReason = getPhantomHoldReason();
  lines.push('APPARITIONS ' + phantomDirector.used + ' of ' + phantomDirector.budget + ' seen   ' + (holdReason === '' ? 'looking for a place' : holdReason));
  if (phantomDirector.current) {
    const current = phantomDirector.current;
    lines.push('  out now   ' + PHANTOM_KINDS[current.kind].label.toLowerCase() + (current.state === PHANTOM_STATE_WAITING ? ' (waiting for you to scan its way)' : '') + ', ' +
      distanceBetweenPoints(current.figure.x, current.figure.z, player.x, player.z).toFixed(1) + ' m away, ' + current.figure.totalHits + ' points on it');
  }
  return lines.join('\n');
}

function createDebugElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function initializeDebugMode() {
  // The panel and the DEBUG badge go into the HUD, under the reticle and everything after it.
  const reticle = document.getElementById('reticle');
  const badge = createDebugElement('div', '', 'DEBUG');
  badge.id = 'hud-debug-badge';
  badge.hidden = true;
  reticle.insertAdjacentElement('beforebegin', badge);
  const panel = createDebugElement('aside', '', '');
  panel.id = 'debug-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Debug mode');
  reticle.insertAdjacentElement('beforebegin', panel);
  debugState.panelElement = panel;
  debugState.badgeElement = badge;
  computeDebugZoneDestinations();
  for (const key in TUNING) debugState.defaultTuning[key] = TUNING[key];

  const header = createDebugElement('div', 'debug-header');
  header.appendChild(createDebugElement('strong', '', 'DEBUG MODE'));
  const closeButton = createDebugElement('button', 'button-quiet', 'Close');
  closeButton.type = 'button';
  closeButton.id = 'debug-close';
  closeButton.addEventListener('click', function () { closeDebugPanel(); });
  header.appendChild(closeButton);
  panel.appendChild(header);
  panel.appendChild(createDebugElement('p', 'debug-note',
    'Press ` or F2 to free the mouse for this panel. Click the view to take control again; the panel stays up.'));

  debugState.readoutElement = createDebugElement('pre', 'debug-readout');
  panel.appendChild(debugState.readoutElement);

  // Switches, grouped.
  for (const group of ['See', 'Cheat']) {
    panel.appendChild(createDebugElement('h3', 'debug-heading', group));
    for (const definition of DEBUG_OPTION_DEFINITIONS) {
      if (definition.group !== group) continue;
      const label = createDebugElement('label', 'debug-option');
      label.title = definition.hint;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'debug-option-' + definition.key;
      checkbox.addEventListener('change', function () {
        setDebugOption(definition.key, checkbox.checked);
        checkbox.blur(); // so W A S D go back to the game
      });
      label.appendChild(checkbox);
      label.appendChild(createDebugElement('span', '', definition.label));
      panel.appendChild(label);
    }
  }

  // Buttons.
  panel.appendChild(createDebugElement('h3', 'debug-heading', 'Do'));
  const actions = [
    ['debug-action-power', 'Restore mains power', debugRestorePower],
    ['debug-action-keycard', 'Give keycard', debugGiveKeycard],
    ['debug-action-spools', 'Give all spools', debugGiveAllSpools],
    ['debug-action-summon', 'Summon the Hollow ahead', debugSummonHollow],
    ['debug-action-send-away', 'Send the Hollow away', debugSendHollowAway],
    ['debug-action-remove', 'Remove the Hollow', debugRemoveHollow],
    ['debug-action-stills', 'Wake the Stills', debugWakeStills],
    ['debug-action-lift', 'Bring the lift now', debugBringLift],
    ['debug-action-map', 'Reveal the whole map', debugRevealMap],
    ['debug-action-clear', 'Clear the point cloud', debugClearPoints]
  ];
  const actionGrid = createDebugElement('div', 'debug-actions');
  for (const action of actions) {
    const button = createDebugElement('button', 'button-quiet', action[1]);
    button.type = 'button';
    button.id = action[0];
    button.addEventListener('click', function () { action[2](); button.blur(); });
    actionGrid.appendChild(button);
  }
  panel.appendChild(actionGrid);

  // Loose objects: one of each kind to try carrying, and a button to clear them away.
  panel.appendChild(createDebugElement('h3', 'debug-heading', 'Put an object in front of me'));
  const looseGrid = createDebugElement('div', 'debug-actions');
  for (const kindKey of Object.keys(LOOSE_OBJECT_KINDS)) {
    const kind = LOOSE_OBJECT_KINDS[kindKey];
    const button = createDebugElement('button', 'button-quiet', kind.label.charAt(0).toUpperCase() + kind.label.slice(1) + ' (' + kind.mass + ' kg)');
    button.type = 'button';
    button.id = 'debug-loose-' + kindKey;
    button.addEventListener('click', function () { debugPutLooseObjectAhead(kindKey); button.blur(); });
    looseGrid.appendChild(button);
  }
  const looseClearButton = createDebugElement('button', 'button-quiet', 'Remove them all');
  looseClearButton.type = 'button';
  looseClearButton.id = 'debug-loose-clear';
  looseClearButton.addEventListener('click', function () { debugRemoveLooseObjects(); looseClearButton.blur(); });
  looseGrid.appendChild(looseClearButton);
  // The salvage quest (only some stations have it): open, fill and seal its bays, to try the end of it.
  const haulButton = createDebugElement('button', 'button-quiet', 'Fill the salvage bays');
  haulButton.type = 'button';
  haulButton.id = 'debug-fill-salvage';
  haulButton.addEventListener('click', function () {
    if (!haulState.isActive) showMessage('This station has no salvage quest.', 3, 'info');
    else fillHaulBays();
    haulButton.blur();
  });
  looseGrid.appendChild(haulButton);
  panel.appendChild(looseGrid);

  // Apparitions: call one up of a chosen kind, now, whatever the phantom director thinks of it.
  panel.appendChild(createDebugElement('h3', 'debug-heading', 'Apparition'));
  const phantomRow = createDebugElement('div', 'debug-row');
  const phantomSelect = document.createElement('select');
  phantomSelect.id = 'debug-phantom-kind';
  for (const kindKey of PHANTOM_KIND_KEYS) {
    const option = document.createElement('option');
    option.value = kindKey;
    option.textContent = PHANTOM_KINDS[kindKey].label;
    phantomSelect.appendChild(option);
  }
  const phantomButton = createDebugElement('button', 'button-quiet', 'Summon');
  phantomButton.type = 'button';
  phantomButton.id = 'debug-phantom-summon';
  phantomButton.addEventListener('click', function () { debugSummonPhantom(phantomSelect.value); phantomButton.blur(); });
  phantomRow.appendChild(phantomSelect);
  phantomRow.appendChild(phantomButton);
  panel.appendChild(phantomRow);

  // Teleport.
  panel.appendChild(createDebugElement('h3', 'debug-heading', 'Go to'));
  const teleportRow = createDebugElement('div', 'debug-row');
  const zoneSelect = document.createElement('select');
  zoneSelect.id = 'debug-zone';
  debugState.zoneSelectElement = zoneSelect;
  rebuildDebugZoneList();
  const teleportButton = createDebugElement('button', 'button-quiet', 'Go');
  teleportButton.type = 'button';
  teleportButton.id = 'debug-teleport';
  teleportButton.addEventListener('click', function () { debugTeleportToZone(Number(zoneSelect.value)); teleportButton.blur(); });
  teleportRow.appendChild(zoneSelect);
  teleportRow.appendChild(teleportButton);
  panel.appendChild(teleportRow);

  // Live tuning: every number in TUNING, editable while the game runs.
  const tuning = document.createElement('details');
  tuning.className = 'debug-tuning';
  tuning.appendChild(createDebugElement('summary', '', 'Live tuning'));
  tuning.appendChild(createDebugElement('p', 'debug-note',
    'These are the numbers from src/js/00-config.js, where each one is explained. Changes apply at once and are lost on reload.'));
  const resetButton = createDebugElement('button', 'button-quiet', 'Reset all to the file values');
  resetButton.type = 'button';
  resetButton.id = 'debug-tuning-reset';
  tuning.appendChild(resetButton);
  const tuningGrid = createDebugElement('div', 'debug-tuning-grid');
  const tuningInputs = {};
  for (const key in TUNING) {
    if (typeof TUNING[key] !== 'number') continue;
    const label = createDebugElement('label', '', key);
    label.htmlFor = 'debug-tuning-' + key;
    const field = document.createElement('input');
    field.type = 'number';
    field.id = 'debug-tuning-' + key;
    field.step = TUNING[key] < 1 ? '0.01' : (TUNING[key] < 20 ? '0.1' : '1');
    field.value = String(TUNING[key]);
    field.addEventListener('change', function () {
      const value = Number(field.value);
      if (!Number.isFinite(value)) { field.value = String(TUNING[key]); return; }
      TUNING[key] = value;
      markDebugUsed();
      refreshDebugBadge();
    });
    tuningInputs[key] = field;
    tuningGrid.appendChild(label);
    tuningGrid.appendChild(field);
  }
  resetButton.addEventListener('click', function () {
    for (const key in debugState.defaultTuning) {
      TUNING[key] = debugState.defaultTuning[key];
      if (tuningInputs[key]) tuningInputs[key].value = String(TUNING[key]);
    }
    resetButton.blur();
  });
  tuning.appendChild(tuningGrid);
  panel.appendChild(tuning);

  // The ways in: a button in the pause menu, and a line on the title screen's field card saying which key it is.
  const openButton = createDebugElement('button', 'button-quiet', 'Debug mode');
  openButton.type = 'button';
  openButton.id = 'button-open-debug';
  openButton.addEventListener('click', function () {
    resumeGame();
    openDebugPanel();
  });
  document.getElementById('button-pause-restart').insertAdjacentElement('afterend', openButton);
  const controlsEntry = createDebugElement('div', '', '');
  controlsEntry.appendChild(createDebugElement('dt', '', 'Debug mode'));
  const controlsKeys = createDebugElement('dd', '', '');
  controlsKeys.appendChild(createDebugElement('kbd', '', '`'));
  controlsKeys.appendChild(document.createTextNode(' or '));
  controlsKeys.appendChild(createDebugElement('kbd', '', 'F2'));
  controlsEntry.appendChild(controlsKeys);
  document.querySelector('#screen-title .controls-list').appendChild(controlsEntry);

  debugHooks.resetForNewRun = resetDebugForNewRun;
  debugHooks.stationLoaded = rebuildDebugZoneList;
  debugHooks.hidePanel = hideDebugPanel;
  debugHooks.togglePanel = toggleDebugPanel;
  debugHooks.update = updateDebugMode;
  debugHooks.updateFlight = updateDebugFlight;
  debugHooks.recordNoise = recordDebugNoise;
  debugHooks.buildFrameData = buildDebugFrameData;
  debugHooks.drawMapMarkers = drawDebugMapMarkers;
  window.lastReturnDebug.setDebugOption = setDebugOption; // for the tests
}

function openDebugPanel() {
  if (game.mode !== 'playing') return;
  debugState.isPanelOpen = true;
  debugState.panelElement.hidden = false;
  debugState.readoutTimer = 0;
  if (document.exitPointerLock && input.isPointerLocked) document.exitPointerLock();
}

// Takes the panel down without touching the mouse or the keyboard: for when the run itself is being left.
function hideDebugPanel() {
  debugState.isPanelOpen = false;
  debugState.panelElement.hidden = true;
}

function closeDebugPanel() {
  hideDebugPanel();
  if (game.mode === 'playing') {
    focusGameView();
    requestPointerLockOnCanvas();
  }
}

// The ` / F2 key: open the panel, or free the mouse for it, or close it.
function toggleDebugPanel() {
  if (game.mode !== 'playing') return;
  if (!debugState.isPanelOpen) openDebugPanel();
  else if (input.isPointerLocked) document.exitPointerLock();
  else closeDebugPanel();
}

function updateDebugMode(realDt) {
  debugState.frameCounter++;
  debugState.frameCounterTime += realDt;
  if (debugState.frameCounterTime >= 0.5) {
    debugState.framesPerSecond = debugState.frameCounter / debugState.frameCounterTime;
    debugState.frameCounter = 0;
    debugState.frameCounterTime = 0;
  }
  if (!debugState.isPanelOpen) return;
  debugState.readoutTimer -= realDt;
  if (debugState.readoutTimer <= 0) {
    debugState.readoutTimer = 0.2;
    debugState.readoutElement.textContent = buildDebugReadout();
  }
}

// The game has started by the time this file runs (13-start.js comes first), so debug mode can be set up.
initializeDebugMode();
