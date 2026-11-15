// ---------------------------------------------------------------------------
// Game flow: objectives, checkpoints, death, ending and the main loop.
// ---------------------------------------------------------------------------

const game = {
  mode: 'title', // title | intro | playing | rotate | paused | reading | dying | dead | ascending | ending | workshop
  isUprightPlayAllowed: false,
  time: 0,
  realTime: 0,
  difficulty: DIFFICULTY_PRESETS.standard,
  flags: {
    hasLeftLift: false,
    powerOn: false,
    hasKeycard: false,   // holds at least keycard 1
    keycardLevel: 0,     // the number of the best keycard held: 0 none, then 1, 2, 3
    spoolsCollected: 0,
    uploadStarted: false,
    liftArrived: false
  },
  objectiveText: '',
  liftCountdown: -1,
  checkpoint: { x: PLAYER_START.x, z: PLAYER_START.z, yaw: PLAYER_START.yaw },
  statistics: { elapsed: 0, distanceWalked: 0, deaths: 0, bestTime: null },
  interference: 0,
  danger: 0,
  fade: 1,
  scheduledEvents: [],
  deathSequence: null,
  ascentTimer: 0,
  hasShownHollowHint: false,
  hasShownVentHint: false,
  attract: { yaw: -0.9, pitch: 0, timer: 0, sweepTimer: 4, sweepProgress: -1, rayBudget: 0, centerRange: -1 }
};

// The workshop (src/dev/, only present in a build made with `npm run dev`) runs as its own mode, 'workshop'.
// It fills these in: `update` is called every frame instead of the game's own updates, and `buildFrameData`
// returns what debug mode would otherwise hand the renderer (bodies, lines, and whether the station is lit).
const workshopHooks = { update: null, buildFrameData: null };

const ATTRACT_CAMERA = level.attractCamera; // set by whichever lift lobby is loaded
const renderCamera = { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0, fieldOfViewDegrees: 72 };
const frameState = {
  time: 0, realTime: 0, interference: 0, danger: 0, fade: 1, powerOn: false, hasKeycard: false, keycardLevel: 0, palette: 0,
  showViewmodel: false, viewmodelSwayX: 0, viewmodelSwayY: 0, viewmodelKick: 0, scannerActivity: 0, scannerHeat: 0,
  debug: null
};
let lastFrameTimestamp = 0;

function getPlayFieldOfViewDegrees() {
  const canvas = renderer.canvas;
  const aspectRatio = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  return aspectRatio < 1 ? 92 : 72; // TWEAK: field of view in degrees (upright phone : everything else)
}

function scheduleEvent(delaySeconds, action) {
  game.scheduledEvents.push({ time: game.time + delaySeconds, action: action });
}

function saveCheckpoint() {
  game.checkpoint.x = player.x; game.checkpoint.z = player.z; game.checkpoint.yaw = player.yaw;
}

function setKeycardLevel(cardLevel) {
  game.flags.keycardLevel = cardLevel;
  game.flags.hasKeycard = cardLevel >= 1;
}

function setObjective(text) {
  game.objectiveText = text;
}

function refreshObjective() {
  const flags = game.flags;
  if (!flags.hasLeftLift) setObjective(OBJECTIVE_TEXT.leaveLift);
  else if (flags.liftArrived) setObjective(OBJECTIVE_TEXT.boardLift);
  else if (flags.uploadStarted) setObjective(OBJECTIVE_TEXT.surviveLift);
  else if (!flags.powerOn) setObjective(OBJECTIVE_TEXT.findGenerator);
  else if (flags.spoolsCollected < 3) setObjective(OBJECTIVE_TEXT.collectSpools);
  else setObjective(OBJECTIVE_TEXT.returnToLift);
}

// ---------------------------------------------------------------------------
// Starting, pausing, restarting
// ---------------------------------------------------------------------------

function resetWorldState() {
  const flags = game.flags;
  flags.hasLeftLift = false; flags.powerOn = false; setKeycardLevel(0);
  flags.spoolsCollected = 0; flags.uploadStarted = false; flags.liftArrived = false;
  game.liftCountdown = -1;
  game.scheduledEvents.length = 0;
  game.statistics.elapsed = 0; game.statistics.distanceWalked = 0; game.statistics.deaths = 0;
  game.interference = 0; game.danger = 0;
  game.hasShownHollowHint = false;
  game.hasShownVentHint = false;
  game.deathSequence = null;
  for (const interactable of interactables) {
    interactable.isAvailable = true;
    interactable.isDiscovered = false;
    for (const prop of interactable.props) prop.isRemoved = false;
  }
  for (const door of doors) {
    door.openFraction = 0; door.closeDelay = 0; door.forcedState = null; door.deniedMessageCooldown = 0;
    door.slab.centerY = door.baseY + 1.15; door.slab.isRemoved = false;
    door.slab.minimumY = door.baseY; door.slab.maximumY = door.baseY + 2.3;
  }
  liftDoor.forcedState = true;
  liftDoor.openFraction = 1;
  raycastableFigures.length = 0;
  deactivateHollow();
  hollow.knowsPlayerPositionAlways = false;
  createStills();
  createPhantoms();
  resetPlayerToStart();
  game.checkpoint.x = PLAYER_START.x; game.checkpoint.z = PLAYER_START.z; game.checkpoint.yaw = PLAYER_START.yaw;
  clearAllPoints();
  clearMap();
  clearMessages();
  if (debugHooks.resetForNewRun) debugHooks.resetForNewRun();
  setGeneratorSoundRunning(false);
  setLiftMachinerySound(0);
}

// Builds a station and hands it to everything that keeps its own picture of the world.
// kind is 'classic' or 'generated'; the rest only matter for generated stations.
// Returns false if a generated station could not be planned (the classic one is loaded instead).
function loadStation(kind, seed, sizeKey, layoutKey, levelsKey) {
  const wasBuiltAsAsked = buildStation(kind, seed, sizeKey, layoutKey, levelsKey);
  uploadWorldOccluderMesh(buildWorldOccluderVertices());
  if (debugHooks.stationLoaded) debugHooks.stationLoaded();
  moveMachinerySoundsToLevel();
  return wasBuiltAsAsked;
}

// Turns whatever is in the seed box into a station number. Empty: a new one every time.
// Digits are used as they are; anything else (a word, a name) is boiled down to a number.
function chooseSeedFromText(text) {
  text = String(text || '').trim();
  if (text === '') return 1 + Math.floor(Math.random() * 999999);
  if (/^[0-9]{1,9}$/.test(text)) return Math.max(1, Number(text));
  let hash = 2166136261;
  for (let position = 0; position < text.length; position++) {
    hash ^= text.charCodeAt(position);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return 1 + hash % 999999999;
}

function beginNewGame() {
  initializeAudioEngine();
  setMasterVolume(settings.volume);
  suspendAudio(false);
  game.difficulty = DIFFICULTY_PRESETS[settings.difficulty];
  const quality = QUALITY_PRESETS[settings.quality];
  if (pointCloud.capacity !== quality.maximumPoints) allocatePointCloud(quality.maximumPoints);
  if (settings.station === 'generated') loadStation('generated', chooseSeedFromText(settings.seedText), settings.stationSize, settings.stationLayout, settings.stationLevels);
  else if (level.kind !== 'classic') loadStation('classic', 0);
  resetWorldState();
  requestPointerLockOnCanvas();
  requestLandscapeOnPhone();
  game.mode = 'intro';
  game.fade = 0;
  showOnlyScreen('screen-intro');
  setHudVisible(false);
  playLiftIntroSound();
  const container = interfaceState.elements['intro-lines'];
  container.textContent = '';
  for (const timer of interfaceState.introTimers) window.clearTimeout(timer);
  interfaceState.introTimers.length = 0;
  const introLines = INTRO_LINES.slice();
  if (level.kind === 'generated') introLines.push('No drawings survive for this annex. Survey reference ' + level.seed + '.');
  introLines.forEach(function (line, lineIndex) {
    interfaceState.introTimers.push(window.setTimeout(function () {
      if (game.mode !== 'intro') return;
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      container.appendChild(paragraph);
    }, 300 + lineIndex * 1500));
  });
  interfaceState.introTimers.push(window.setTimeout(function () { finishIntro(); }, 300 + introLines.length * 1500 + 1600));
}

function playLiftIntroSound() {
  if (!isAudioReady()) return;
  setLiftMachinerySound(0.5);
  window.setTimeout(function () {
    if (game.mode === 'intro' || game.mode === 'playing') { setLiftMachinerySound(0); playLiftBell(); }
  }, 5200);
}

function finishIntro() {
  if (game.mode !== 'intro') return;
  for (const timer of interfaceState.introTimers) window.clearTimeout(timer);
  interfaceState.introTimers.length = 0;
  setLiftMachinerySound(0);
  game.mode = 'playing';
  game.fade = 0;
  showOnlyScreen(null);
  setHudVisible(true);
  refreshObjective();
  focusGameView();
  showMessage(input.isTouchDevice
    ? 'Hold SCAN and drag to paint the dark with returns.'
    : 'Hold the left mouse button (or Space) to scan. Everything you see is what the scanner has touched.', 9, 'info');
}

function focusGameView() {
  if (document.activeElement && document.activeElement !== renderer.canvas && document.activeElement.blur) document.activeElement.blur();
  try { renderer.canvas.focus({ preventScroll: true }); } catch (error) { /* focus is a nicety */ }
}

// ---------------------------------------------------------------------------
// Phones: the game is meant to be played sideways
// ---------------------------------------------------------------------------

function isPhoneHeldUpright() {
  return input.isTouchDevice && window.innerHeight > window.innerWidth;
}

// Browsers only allow an orientation lock in fullscreen, and many refuse both. Best effort.
function requestLandscapeOnPhone() {
  if (!input.isTouchDevice) return;
  const lockOrientation = function () {
    try {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () { /* not allowed here */ });
    } catch (error) { /* not allowed here */ }
  };
  try {
    const root = document.documentElement;
    if (root.requestFullscreen && !document.fullscreenElement) {
      const request = root.requestFullscreen();
      if (request && typeof request.then === 'function') request.then(lockOrientation).catch(lockOrientation);
      else lockOrientation();
    } else {
      lockOrientation();
    }
  } catch (error) { lockOrientation(); }
}

// Called every frame: holds the game while a phone is upright, and lets go when it is turned.
function updateRotationGate() {
  if (game.mode === 'playing' && !game.isUprightPlayAllowed && isPhoneHeldUpright()) {
    game.mode = 'rotate';
    setScannerSound(0);
    closeMapOverlay();
    input.touchScanHeld = false;
    input.moveStickX = 0; input.moveStickZ = 0;
    setHudVisible(false);
    showOnlyScreen('screen-rotate');
    suspendAudio(true);
  } else if (game.mode === 'rotate' && (game.isUprightPlayAllowed || !isPhoneHeldUpright())) {
    suspendAudio(false);
    showOnlyScreen(null);
    setHudVisible(true);
    game.mode = 'playing';
  }
}

function allowUprightPlay() {
  game.isUprightPlayAllowed = true;
  updateRotationGate();
}

function pauseGame() {
  if (game.mode !== 'playing') return;
  game.mode = 'paused';
  setScannerSound(0);
  closeMapOverlay();
  interfaceState.elements['pause-objective'].textContent = game.objectiveText;
  interfaceState.elements['pause-station'].textContent = 'Station: ' + level.description;
  interfaceState.refreshSettingControls();
  showOnlyScreen('screen-pause');
  if (document.exitPointerLock && input.isPointerLocked) document.exitPointerLock();
  suspendAudio(true);
}

function resumeGame() {
  if (game.mode !== 'paused') return;
  suspendAudio(false);
  showOnlyScreen(null);
  game.mode = 'playing';
  input.keysDown.clear();
  focusGameView();
  requestPointerLockOnCanvas();
}

function returnToTitle() {
  suspendAudio(false);
  stopVoiceLine();
  silenceGameplaySounds();
  if (debugHooks.hidePanel) debugHooks.hidePanel();
  if (document.exitPointerLock && input.isPointerLocked) document.exitPointerLock();
  resetWorldState();
  game.mode = 'title';
  game.fade = 1;
  setHudVisible(false);
  closeMapOverlay();
  showOnlyScreen('screen-title');
  interfaceState.refreshStationControls();
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

function removeInteractableFromWorld(interactable) {
  interactable.isAvailable = false;
  for (const prop of interactable.props) {
    prop.isRemoved = true;
    removePointsInsideBox(prop.centerX - prop.boundsHalfX - 0.06, prop.minimumY - 0.06, prop.centerZ - prop.boundsHalfZ - 0.06,
      prop.centerX + prop.boundsHalfX + 0.06, prop.maximumY + 0.06, prop.centerZ + prop.boundsHalfZ + 0.06);
  }
}

function collectSpool(interactable, logEntry) {
  removeInteractableFromWorld(interactable);
  game.flags.spoolsCollected++;
  playPickupSound();
  emitNoise(player.x, player.z, TUNING.noiseRadiusPickup);
  saveCheckpoint();
  refreshObjective();
  openReader(logEntry);
  const collected = game.flags.spoolsCollected;
  if (collected >= 3) scheduleEvent(1.5, function () { playRadioLine('allSpools'); });
  else if (collected === 1) scheduleEvent(1.5, function () { playRadioLine('firstSpool'); });
}

function useInteractable(interactable) {
  const flags = game.flags;
  switch (interactable.objectId) {
    case OBJECT_LIFT_TERMINAL:
      if (!flags.powerOn) {
        playDeniedSound();
        showMessage('LIFT CONTROL: no mains power. Generator 2 is in Pump Hall B.', 5, 'warning');
      } else if (flags.spoolsCollected < 3) {
        playDeniedSound();
        showMessage('LIFT CONTROL: upload locked. Survey spools loaded: ' + flags.spoolsCollected + ' of 3.', 5, 'warning');
      } else if (!flags.uploadStarted) {
        startLiftCall();
      } else if (!flags.liftArrived) {
        showMessage('LIFT CONTROL: car descending.', 3, 'info');
      } else {
        showMessage('LIFT CONTROL: car at this level. Doors open.', 3, 'info');
      }
      break;
    case OBJECT_GENERATOR:
      if (!flags.powerOn) startGenerator(interactable);
      break;
    case OBJECT_SPOOL_1:
      collectSpool(interactable, LOG_ENTRIES.spool1);
      break;
    case OBJECT_SPOOL_2:
      collectSpool(interactable, LOG_ENTRIES.spool2);
      scheduleEvent(1.0, function () { awakenStills(); playStinger('still'); });
      scheduleEvent(2.5, function () { playRadioLine('secondSpool'); });
      break;
    case OBJECT_SPOOL_3:
      collectSpool(interactable, LOG_ENTRIES.spool3);
      break;
    case OBJECT_KEYCARD:
    case OBJECT_KEYCARD_2:
    case OBJECT_KEYCARD_3: {
      const cardLevel = KEYCARD_OBJECT_IDS.indexOf(interactable.objectId);
      removeInteractableFromWorld(interactable);
      setKeycardLevel(Math.max(flags.keycardLevel, cardLevel));
      playPickupSound();
      saveCheckpoint();
      showMessage(level.keycardCount > 1 ? 'Keycard ' + cardLevel + ' taken.' : 'Keycard taken.', 3, 'info');
      // The last card is the one that opens the way to the shaft; an earlier one only gets you further in.
      const isLastCard = cardLevel >= level.keycardCount;
      scheduleEvent(1.5, function () { playRadioLine(isLastCard ? 'keycardTaken' : 'lowerKeycardTaken'); });
      break;
    }
    case OBJECT_NOTE_SECURITY: playInterfaceBlip(620); openReader(LOG_ENTRIES.noteSecurity); break;
    case OBJECT_NOTE_LOCKER: playInterfaceBlip(620); openReader(LOG_ENTRIES.noteLocker); break;
    case OBJECT_NOTE_LAB: playInterfaceBlip(620); openReader(LOG_ENTRIES.noteLab); break;
    case OBJECT_NOTE_ARCHIVE: playInterfaceBlip(620); openReader(LOG_ENTRIES.noteArchive); break;
    default: break;
  }
}

function startGenerator(interactable) {
  game.flags.powerOn = true;
  interactable.isAvailable = false;
  startGeneratorSound();
  saveCheckpoint();
  refreshObjective();
  showMessage('Generator 2 running. Mains restored.', 4, 'info');
  scheduleEvent(4.5, function () { playRadioLine('generatorStarted'); });
  if (game.difficulty.hollowEnabled) {
    scheduleEvent(11, function () { playRadioLine('generatorFollowUp'); });
    scheduleEvent(TUNING.hollowWakeDelaySeconds, function () {
      activateHollow(HOLLOW_SPAWN_POSITION.x, HOLLOW_SPAWN_POSITION.z, 3);
      hollow.state = HOLLOW_STATE_INVESTIGATE;
      hollow.targetX = level.generatorApproachX; hollow.targetZ = level.generatorApproachZ;
    });
  }
}

function startLiftCall() {
  const flags = game.flags;
  flags.uploadStarted = true;
  game.liftCountdown = game.difficulty.hollowEnabled ? TUNING.liftArrivalSeconds : TUNING.liftArrivalSecondsWithoutHollow;
  saveCheckpoint();
  refreshObjective();
  playPickupSound();
  setLiftMachinerySound(0.85);
  playRadioLine('uploadStarted');
  if (hollow.isActive) {
    scheduleEvent(4, function () {
      if (game.flags.uploadStarted && !game.flags.liftArrived) hollow.knowsPlayerPositionAlways = true;
    });
  }
}

function completeLiftArrival() {
  game.flags.liftArrived = true;
  game.liftCountdown = -1;
  liftDoor.forcedState = true;
  setLiftMachinerySound(0);
  playLiftBell();
  refreshObjective();
  playRadioLine('liftArrived');
}

// ---------------------------------------------------------------------------
// Death and retry
// ---------------------------------------------------------------------------

function triggerPlayerDeath(kind, figure) {
  if (game.mode !== 'playing') return;
  if (debugState.options.invulnerable || debugState.options.flyMode) return;
  game.mode = 'dying';
  game.statistics.deaths++;
  game.deathSequence = { kind: kind, figure: figure, timer: 0 };
  setScannerSound(0);
  closeMapOverlay();
  playStinger('death');
}

function updateDying(dt) {
  const sequence = game.deathSequence;
  sequence.timer += dt;
  game.time += dt;
  currentPointTime = game.time;
  const figure = sequence.figure;
  // It is right in front of the emitter now, and for once the scanner sees all of it.
  const towardFigure = Math.atan2(figure.x - player.x, -(figure.z - player.z));
  player.yaw += clampNumber(wrapAngleToPi(towardFigure - player.yaw), -dt * 9, dt * 9);
  const eyeHeight = getPlayerEyeY();
  const distance = Math.max(0.3, distanceBetweenPoints(figure.x, figure.z, player.x, player.z));
  const targetPitch = Math.atan2(getFigureHeadHeight(figure) - eyeHeight, distance);
  player.pitch = approachValue(player.pitch, targetPitch, dt * 4);
  // Hold it at arm's length so the scanner frames its head and shoulders.
  const approach = clampNumber(distance - 1.0, -dt * 3, dt * 1.5);
  figure.x += (player.x - figure.x) / distance * approach;
  figure.z += (player.z - figure.z) / distance * approach;
  figure.yaw = Math.atan2(player.x - figure.x, -(player.z - figure.z));
  figure.pose.armRaise = approachValue(figure.pose.armRaise, 1.45, dt * 3);
  figure.pose.fingerSplay = 1;
  figure.pose.headTilt = (Math.random() - 0.5) * 1.1;
  updateFigureCapsules(figure);
  emitFigureRevealPoints(figure, Math.floor(26000 * dt), sequence.kind === 'hollow' ? SURFACE_HOLLOW : SURFACE_STILL, 3);
  game.interference = 0.3 + Math.min(0.5, sequence.timer * 0.5);
  game.danger = Math.min(1, sequence.timer * 1.5);
  if (sequence.timer > 1.25) game.fade = Math.max(0, 1 - (sequence.timer - 1.25) * 5);
  if (sequence.timer > 1.55) {
    game.mode = 'dead';
    game.fade = 0;
    silenceGameplaySounds();
    if (document.exitPointerLock && input.isPointerLocked) document.exitPointerLock();
    showDeathScreen(sequence.kind);
  }
}

function retryFromCheckpoint() {
  if (game.mode !== 'dead') return;
  player.x = game.checkpoint.x; player.z = game.checkpoint.z; player.yaw = game.checkpoint.yaw;
  player.pitch = 0; player.velocityX = 0; player.velocityZ = 0;
  player.heat = 0; player.isOverheated = false; player.stamina = 1; player.isStaminaLocked = false;
  player.sweepTimeRemaining = 0;
  input.keysDown.clear();
  game.interference = 0; game.danger = 0; game.fade = 0;
  game.deathSequence = null;
  if (hollow.isActive) {
    hollow.knowsPlayerPositionAlways = false;
    relocateHollowAwayFromPlayer(12);
  }
  if (stillsAreHunting) resetStillsToHomePositions();
  if (game.flags.uploadStarted && !game.flags.liftArrived) {
    game.liftCountdown = TUNING.liftArrivalSeconds;
    scheduleEvent(8, function () {
      if (game.flags.uploadStarted && !game.flags.liftArrived && hollow.isActive) hollow.knowsPlayerPositionAlways = true;
    });
  }
  showOnlyScreen(null);
  setHudVisible(true);
  game.mode = 'playing';
  focusGameView();
  requestPointerLockOnCanvas();
  showMessage('Scanner restarted from the last checkpoint. Your point cloud was kept.', 5, 'info');
}

// ---------------------------------------------------------------------------
// Per-frame updates
// ---------------------------------------------------------------------------

function updateGameProgress(dt) {
  const flags = game.flags;
  game.statistics.elapsed += dt;

  for (let index = game.scheduledEvents.length - 1; index >= 0; index--) {
    if (game.time >= game.scheduledEvents[index].time) {
      const event = game.scheduledEvents[index];
      game.scheduledEvents.splice(index, 1);
      event.action();
    }
  }

  // Out of the car and a good step past its door.
  if (!flags.hasLeftLift && distanceOutsideLiftCar(player.x, player.z) > 1.7) {
    flags.hasLeftLift = true;
    liftDoor.forcedState = false;
    saveCheckpoint();
    refreshObjective();
    scheduleEvent(1.4, function () { playLiftDepartSound(); });
    scheduleEvent(3.0, function () { playRadioLine('leftLift'); });
  }

  if (flags.uploadStarted && !flags.liftArrived) {
    game.liftCountdown -= dt;
    updateLiftBell(true, game.time);
    if (game.liftCountdown <= 0) completeLiftArrival();
  }

  const isWellInsideLiftCar = player.x > LIFT_CAR_BOUNDS.minimumX + 0.3 && player.x < LIFT_CAR_BOUNDS.maximumX - 0.3 &&
    player.z > LIFT_CAR_BOUNDS.minimumZ + 0.3 && player.z < LIFT_CAR_BOUNDS.maximumZ - 0.3;
  if (flags.liftArrived && isWellInsideLiftCar) {
    game.mode = 'ascending';
    game.ascentTimer = 0;
    liftDoor.forcedState = false;
    hollow.knowsPlayerPositionAlways = false;
    setScannerSound(0);
    setLiftMachinerySound(0.9);
    closeMapOverlay();
  }

  if (hollow.isActive && !game.hasShownHollowHint && hollow.figure.totalHits > 30) {
    game.hasShownHollowHint = true;
    showMessage('The beam slows it and angers it. Hold it too long and it knows exactly where you are.', 7, 'warning');
  }
}

function updateAtmosphere(dt) {
  let hollowPressure = 0, hollowDistance = Infinity;
  if (hollow.isActive) {
    hollowDistance = distanceBetweenPoints(hollow.figure.x, hollow.figure.z, player.x, player.z);
    const aggression = getHollowAggression();
    hollowPressure = clampNumber(1 - hollowDistance / 16, 0, 1) * (0.35 + 0.65 * aggression) + hollow.heldAmount * 0.2;
    if (hollow.enragedTimer > 0) hollowPressure = Math.max(hollowPressure, 0.85);
  }
  const stillDistance = getNearestHuntingStillDistance();
  const stillPressure = clampNumber(1 - stillDistance / 5, 0, 1) * 0.6;
  const pressure = Math.min(1, Math.max(hollowPressure, stillPressure));
  game.interference = approachValue(game.interference, pressure, dt * 1.8);
  const isCloseHunt = hollow.isActive && hollow.state === HOLLOW_STATE_HUNT;
  game.danger = approachValue(game.danger, isCloseHunt ? clampNumber(1 - hollowDistance / 7, 0, 1) : 0, dt * 1.5);
  if (game.fade < 1) game.fade = Math.min(1, game.fade + dt * 0.9);

  updateAudioListener(player.x, getPlayerEyeY(), player.z, player.yaw);
  setInterferenceSound(game.interference);
  updateHeartbeat(pressure, game.time);
  updateHollowVoice(hollow.figure.x, hollow.figure.z, hollow.isActive, getHollowAggression(),
    hollow.heldAmount * hollow.anger, dt, game.time);
  const caption = updateAmbientEvents(game.time, player.x, player.z, game.flags.powerOn ? 0.6 : 0.2);
  if (caption) showCaption(caption);
}

function updatePlaying(dt) {
  game.time += dt;
  currentPointTime = game.time;
  updatePlayerMovement(dt);
  const bobHeight = Math.sin(player.bobPhase) * 0.028;
  const eyeY = getPlayerEyeY() + bobHeight;
  updateScanner(dt, player.x, eyeY, player.z);
  updateInteractionFocus(player.x, eyeY, player.z);
  updateDoors(dt);
  if (debugState.options.freezeCreatures) {
    hollow.figure.hitsThisFrame = 0;
  } else {
    updateHollow(dt);
    updateStills(dt);
  }
  updatePhantoms();
  if (game.mode === 'playing') updateGameProgress(dt);
  updateAtmosphere(dt);
}

function updateAscending(dt) {
  game.time += dt;
  currentPointTime = game.time;
  game.ascentTimer += dt;
  updateDoors(dt);
  resetBeamLines(0, 0, 0);
  game.interference = approachValue(game.interference, 0, dt);
  game.danger = approachValue(game.danger, 0, dt);
  setInterferenceSound(game.interference);
  updateHollowVoice(hollow.figure.x, hollow.figure.z, false, 0, 0, dt, game.time);
  if (game.ascentTimer > 1.6) game.fade = Math.max(0, 1 - (game.ascentTimer - 1.6) / 2.4);
  if (game.ascentTimer > 4.4) {
    game.mode = 'ending';
    setLiftMachinerySound(0);
    setGeneratorSoundRunning(false);
    if (document.exitPointerLock && input.isPointerLocked) document.exitPointerLock();
    if (debugState.hasBeenUsedThisRun) {
      game.statistics.bestTime = null; // a run with debug mode does not count
    } else {
      try {
        // Best times are kept per threat level, and per station: a generated station only competes with itself.
        let storageKey = 'no-return-best-' + game.difficulty.key;
        if (level.kind === 'generated') storageKey += '-' + level.sizeKey + '-' + level.layoutKey + '-' + level.levelsKey + '-' + level.seed;
        const previousBest = Number(window.localStorage.getItem(storageKey));
        if (!previousBest || game.statistics.elapsed < previousBest) window.localStorage.setItem(storageKey, String(game.statistics.elapsed));
        game.statistics.bestTime = previousBest && previousBest < game.statistics.elapsed ? previousBest : game.statistics.elapsed;
      } catch (error) { game.statistics.bestTime = null; }
    }
    showEndingScreen();
  }
}

// Title screen: the scanner sweeps the lift lobby by itself.
function updateAttractMode(dt) {
  const attract = game.attract;
  game.time += dt;
  currentPointTime = game.time;
  attract.timer += dt;
  const viewYaw = ATTRACT_CAMERA.yaw + Math.sin(attract.timer * 0.11) * 0.5;
  const viewPitch = 0.04 + Math.sin(attract.timer * 0.07) * 0.05;
  renderCamera.x = ATTRACT_CAMERA.x; renderCamera.y = ATTRACT_CAMERA.y; renderCamera.z = ATTRACT_CAMERA.z;
  renderCamera.yaw = viewYaw; renderCamera.pitch = viewPitch;
  renderCamera.fieldOfViewDegrees = getPlayFieldOfViewDegrees();

  const quality = QUALITY_PRESETS[settings.quality];
  const paintYaw = viewYaw + Math.sin(attract.timer * 0.83) * 0.6;
  const paintPitch = viewPitch + Math.sin(attract.timer * 1.31) * 0.32;
  computeScannerBasis(paintYaw, paintPitch);
  resetBeamLines(ATTRACT_CAMERA.x + 0.2, ATTRACT_CAMERA.y - 0.2, ATTRACT_CAMERA.z);
  attract.rayBudget += quality.raysPerSecond * 0.45 * dt;
  const rayCount = Math.min(400, Math.floor(attract.rayBudget));
  attract.rayBudget -= rayCount;
  const spreadTangent = Math.tan(13 * DEGREES_TO_RADIANS);
  for (let rayIndex = 0; rayIndex < rayCount; rayIndex++) {
    const radius = Math.sqrt(Math.random()) * spreadTangent, angle = Math.random() * TWO_PI;
    fireScannerPulse(ATTRACT_CAMERA.x, ATTRACT_CAMERA.y, ATTRACT_CAMERA.z, Math.cos(angle) * radius, Math.sin(angle) * radius, rayIndex % 16 === 0);
  }
  attract.sweepTimer -= dt;
  if (attract.sweepTimer <= 0 && attract.sweepProgress < 0) { attract.sweepProgress = 0; attract.sweepTimer = 11; }
  if (attract.sweepProgress >= 0) {
    computeScannerBasis(viewYaw, viewPitch);
    const previousProgress = attract.sweepProgress;
    attract.sweepProgress += dt / 2.6;
    const sweepRays = Math.floor(quality.sweepRays * 0.6 * (attract.sweepProgress - previousProgress));
    const halfWidthTangent = Math.tan(50 * DEGREES_TO_RADIANS), halfHeightTangent = Math.tan(34 * DEGREES_TO_RADIANS);
    for (let rayIndex = 0; rayIndex < sweepRays; rayIndex++) {
      const lineProgress = previousProgress + (attract.sweepProgress - previousProgress) * Math.random();
      fireScannerPulse(ATTRACT_CAMERA.x, ATTRACT_CAMERA.y, ATTRACT_CAMERA.z, (Math.random() * 2 - 1) * halfWidthTangent,
        interpolateLinear(halfHeightTangent, -halfHeightTangent, lineProgress), false);
    }
    if (attract.sweepProgress >= 1) attract.sweepProgress = -1;
  }
  computeScannerBasis(viewYaw, viewPitch);
  attract.centerRange = castScannerRay(ATTRACT_CAMERA.x, ATTRACT_CAMERA.y, ATTRACT_CAMERA.z,
    scannerBasis.forwardX, scannerBasis.forwardY, scannerBasis.forwardZ, TUNING.scannerMaximumRange) ? rayHit.distance : -1;
}

let lastFrameMode = '';

function runFrame(timestamp) {
  window.requestAnimationFrame(runFrame);
  const realDt = Math.min(0.05, Math.max(0.001, (timestamp - lastFrameTimestamp) / 1000));
  lastFrameTimestamp = timestamp;
  game.realTime += realDt;
  resizeRenderer(QUALITY_PRESETS[settings.quality].renderScale);
  updateRotationGate();

  if (game.mode === 'title') {
    updateAttractMode(realDt);
    frameState.showViewmodel = false;
    game.interference = 0; game.danger = 0; game.fade = 1;
  } else {
    if (game.mode === 'playing') updatePlaying(realDt);
    else if (game.mode === 'dying') updateDying(realDt);
    else if (game.mode === 'ascending') updateAscending(realDt);
    else if (game.mode === 'workshop') workshopHooks.update(realDt);
    else resetBeamLines(0, 0, 0);
    const isScanning = player.isPainting || player.sweepTimeRemaining > 0;
    renderCamera.x = player.x;
    renderCamera.y = getPlayerEyeY() + Math.sin(player.bobPhase) * 0.028;
    renderCamera.z = player.z;
    renderCamera.yaw = player.yaw;
    renderCamera.pitch = player.pitch;
    renderCamera.fieldOfViewDegrees = getPlayFieldOfViewDegrees();
    frameState.showViewmodel = game.mode === 'playing' || game.mode === 'paused' || game.mode === 'reading' || game.mode === 'ascending';
    frameState.viewmodelSwayX = Math.cos(player.bobPhase * 0.5) * 0.006;
    frameState.viewmodelSwayY = Math.sin(player.bobPhase) * 0.005 - (player.isSprinting ? 0.03 : 0);
    frameState.viewmodelKick = isScanning && game.mode === 'playing' ? (Math.random() - 0.5) * 0.004 : 0;
  }

  // Belt and braces: whenever the game arrives at a screen that is not play, by whatever route, the sounds of
  // play are switched off. (Abandoning from the pause menu used to leave the growl running under the title.)
  if (game.mode !== lastFrameMode) {
    if (game.mode === 'title' || game.mode === 'intro' || game.mode === 'dead' || game.mode === 'ending') silenceGameplaySounds();
    lastFrameMode = game.mode;
  }

  frameState.time = game.time;
  frameState.realTime = game.realTime;
  frameState.interference = game.interference;
  frameState.danger = game.danger;
  frameState.fade = game.mode === 'intro' || game.mode === 'dead' || game.mode === 'ending' ? 0 : game.fade;
  frameState.powerOn = game.flags.powerOn;
  frameState.hasKeycard = game.flags.hasKeycard;
  frameState.keycardLevel = game.flags.keycardLevel;
  frameState.palette = settings.palette;
  frameState.scannerActivity = player.scannerActivity;
  frameState.scannerHeat = player.heat;
  if (game.mode === 'workshop') frameState.debug = workshopHooks.buildFrameData();
  else frameState.debug = game.mode === 'title' || !debugHooks.buildFrameData ? null : debugHooks.buildFrameData();
  renderFrame(renderCamera, frameState);
  updateHud(realDt);
  if (debugHooks.update) debugHooks.update(realDt);
}

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------

function startApplication() {
  loadSettings();
  const canvas = document.getElementById('view-canvas');
  let isRendererReady = false;
  try { isRendererReady = initializeRenderer(canvas); }
  catch (error) { showFatalError('The scanner cannot start: ' + error.message); return; }
  if (!isRendererReady) { showFatalError(null); return; }

  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && settings.quality === 'high') settings.quality = 'medium';
  buildStation('classic', 0);
  uploadWorldOccluderMesh(buildWorldOccluderVertices());
  allocatePointCloud(QUALITY_PRESETS[settings.quality].maximumPoints);
  createStills();
  createPhantoms();
  initializeInput();
  initializeInterface();
  liftDoor.forcedState = true;
  liftDoor.openFraction = 1;
  liftDoor.slab.isRemoved = true;
  game.mode = 'title';
  showOnlyScreen('screen-title');

  window.noReturnDebug = {
    game: game, player: player, hollow: hollow, renderer: renderer, renderCamera: renderCamera, audio: audio,
    playHollowRoar: playHollowRoar, playHollowSnarl: playHollowSnarl, playHollowLostHiss: playHollowLostHiss, playHollowSniff: playHollowSniff, playHollowCuriousTrill: playHollowCuriousTrill,
    playStinger: playStinger, playSweepSound: playSweepSound, playInterfaceBlip: playInterfaceBlip, playRadioBlip: playRadioBlip, playDeniedSound: playDeniedSound, stills: stills, doors: doors, pointCloud: pointCloud, settings: settings,
    auditLayout: auditFacilityLayout,
    auditProgression: auditLevelProgression,
    level: level, interactables: interactables, zoneNames: ZONE_NAMES,
    loadStation: function (kind, seed, sizeKey, layoutKey, levelsKey) { const result = loadStation(kind, seed, sizeKey, layoutKey, levelsKey); resetWorldState(); return result; },
    getFloorHeightAt: getFloorHeightAt,
    getHeadroomAt: getHeadroomAt,
    isVentAt: function (x, z) { return (getTileFlagsAtPosition(x, z) & TILE_FLAG_VENT) !== 0; },
    ventHeight: VENT_HEIGHT,
    chooseSeedFromText: chooseSeedFromText,
    getLiftDoor: function () { return liftDoor; },
    director: director, chooseHollowRoamTarget: chooseHollowRoamTarget,
    // Walking distance from the player to a point, in tiles (what the director calls steps).
    stepsFromPlayerTo: function (x, z) {
      refreshPlayerDistanceField();
      const index = findNearestWalkableTileIndex(x, z);
      return index < 0 ? NAVIGATION_UNREACHABLE : playerDistanceField[index];
    },
    findSigns: function (textPart) {
      // Every tile that carries wall lettering containing the given text.
      const found = [];
      for (let index = 0; index < TILE_COUNT; index++) {
        for (const sign of tileSignLists[index] || []) {
          if (sign.text.indexOf(textPart) >= 0) found.push({ tileX: index % GRID_WIDTH, tileZ: Math.floor(index / GRID_WIDTH), wall: sign.wall, text: sign.text });
        }
      }
      return found;
    },
    getStationFingerprint: function () {
      // A short text that is the same for two stations only if they are built the same.
      const parts = [worldProps.length, interactables.length];
      for (const door of doors) parts.push(door.tileX + '.' + door.tileZ + '.' + door.kind);
      for (const interactable of interactables) parts.push(interactable.objectId + ':' + interactable.x.toFixed(2) + ':' + interactable.z.toFixed(2));
      return parts.join(',');
    },
    findInteractable: findInteractableByObjectId,
    lift: LIFT_POSITION, generator: GENERATOR_POSITION, shaft: SHAFT_POSITION, playerStart: PLAYER_START,
    getZoneAt: getZoneAtPosition,
    findWalkableSpotNear: function (x, z) {
      const index = findNearestWalkableTileIndex(x, z);
      return index < 0 ? null : { x: index % GRID_WIDTH + 0.5, z: Math.floor(index / GRID_WIDTH) + 0.5 };
    },
    teleport: function (x, z, yaw) { player.x = x; player.z = z; if (yaw !== undefined) player.yaw = yaw; },
    grantPower: function () { game.flags.powerOn = true; refreshObjective(); },
    grantKeycard: function () { setKeycardLevel(3); },
    keycardObjectIds: KEYCARD_OBJECT_IDS,
    grantSpools: function () { game.flags.spoolsCollected = 3; refreshObjective(); },
    spawnHollow: function (x, z) { activateHollow(x, z, 2); },
    use: function (objectId) { useInteractable(findInteractableByObjectId(objectId)); },
    sweep: function () { input.wantsSweep = true; },
    simulate: function (seconds) {
      const step = 1 / 30;
      for (let elapsed = 0; elapsed < seconds && game.mode === 'playing'; elapsed += step) updatePlaying(step);
    },
    awakenStills: awakenStills,
    emitNoise: emitNoise,
    setScanHeld: function (isHeld) { input.isScanHeld = isHeld; },
    setScannerSpread: setScannerSpread,
    updateFigureCapsules: updateFigureCapsules,
    voiceState: voiceState, hasVoiceLine: hasVoiceLine, playRadioLine: playRadioLine, playVoiceLine: playVoiceLine,
    loadVoiceLine: loadVoiceLine, radioLineKeys: Object.keys(RADIO_MESSAGES),
    debugState: debugState,
    tuning: TUNING
  };

  window.requestAnimationFrame(function (timestamp) {
    lastFrameTimestamp = timestamp;
    runFrame(timestamp);
  });
}
