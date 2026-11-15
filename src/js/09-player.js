// ---------------------------------------------------------------------------
// Player: input (keyboard, mouse, touch), movement and the scanner itself.
// ---------------------------------------------------------------------------

const input = {
  keysDown: new Set(),
  isPointerLocked: false,
  hasPointerLockEverWorked: false,
  ignoreLookUntil: 0,
  useDragLook: false,
  isTouchDevice: false,
  isScanHeld: false,
  isLookDragging: false,
  touchScanHeld: false,
  touchSprint: false,
  touchCrouch: false,
  moveStickX: 0,
  moveStickZ: 0,
  lookDeltaX: 0,
  lookDeltaY: 0,
  wantsSweep: false,
  wantsInteract: false
};

const player = {
  x: PLAYER_START.x, z: PLAYER_START.z,
  yaw: PLAYER_START.yaw, pitch: 0,
  eyeHeight: TUNING.eyeHeightStanding, // eyes above the floor you stand on
  floorY: 0,                           // height of that floor: 0 on the lift's level, negative further down
  velocityX: 0, velocityZ: 0,
  stamina: 1,
  isStaminaLocked: false,
  timeSinceSprint: 9,
  isCrouching: false,
  isInVent: false,
  isSprinting: false,
  isMoving: false,
  audibleRadius: 2.6,
  strideDistance: 0,
  bobPhase: 0,
  heat: 0,
  isOverheated: false,
  sweepTimeRemaining: 0,
  spreadDegrees: TUNING.scannerSpreadDefaultDegrees,
  rayBudget: 0,
  sweepRayBudget: 0,
  scannerHumTimer: 0,
  scannerActivity: 0,
  centerRange: -1,
  focusedInteractable: null,
  isPainting: false
};

const settings = {
  sensitivity: 1.0,
  volume: 0.8,
  quality: 'medium',
  palette: 0,
  difficulty: 'standard',
  station: 'classic',       // 'classic' (Kessel-9 as built) or 'generated' (a different station every descent)
  stationSize: 'medium',    // a key of GENERATED_SIZE_PRESETS
  stationLayout: 'mixed',   // a key of GENERATED_LAYOUT_PRESETS
  stationLevels: 'two',     // a key of GENERATED_LEVEL_PRESETS
  seedText: '',             // what is typed in the seed box; empty means a new random station each descent
  hud: 'quiet'              // 'quiet' shows instruments only while they matter; 'full' shows everything all the time
};

function loadSettings() {
  try {
    const stored = JSON.parse(window.localStorage.getItem('no-return-settings') || 'null');
    if (stored && typeof stored === 'object') {
      if (typeof stored.sensitivity === 'number') settings.sensitivity = clampNumber(stored.sensitivity, 0.2, 3);
      if (typeof stored.volume === 'number') settings.volume = clampNumber(stored.volume, 0, 1);
      if (QUALITY_PRESETS[stored.quality]) settings.quality = stored.quality;
      if (stored.palette === 0 || stored.palette === 1 || stored.palette === 2) settings.palette = stored.palette;
      if (DIFFICULTY_PRESETS[stored.difficulty]) settings.difficulty = stored.difficulty;
      if (stored.station === 'classic' || stored.station === 'generated') settings.station = stored.station;
      if (GENERATED_SIZE_PRESETS[stored.stationSize]) settings.stationSize = stored.stationSize;
      if (GENERATED_LAYOUT_PRESETS[stored.stationLayout]) settings.stationLayout = stored.stationLayout;
      if (GENERATED_LEVEL_PRESETS[stored.stationLevels]) settings.stationLevels = stored.stationLevels;
      if (typeof stored.seedText === 'string') settings.seedText = stored.seedText.slice(0, 24);
      if (stored.hud === 'quiet' || stored.hud === 'full') settings.hud = stored.hud;
    }
  } catch (error) { /* storage is optional */ }
}

function saveSettings() {
  try { window.localStorage.setItem('no-return-settings', JSON.stringify(settings)); } catch (error) { /* storage is optional */ }
}

// Where the eyes (and so the camera and the scanner) are, measured from the lift's floor level.
function getPlayerEyeY() {
  return player.floorY + player.eyeHeight;
}

function resetPlayerToStart() {
  player.x = PLAYER_START.x; player.z = PLAYER_START.z;
  player.yaw = PLAYER_START.yaw; player.pitch = 0;
  player.velocityX = 0; player.velocityZ = 0;
  player.stamina = 1; player.isStaminaLocked = false;
  player.heat = 0; player.isOverheated = false;
  player.sweepTimeRemaining = 0;
  player.eyeHeight = TUNING.eyeHeightStanding;
  player.floorY = getFloorHeightAt(player.x, player.z);
  player.focusedInteractable = null;
}

// ---------------------------------------------------------------------------
// Input wiring
// ---------------------------------------------------------------------------

function requestPointerLockOnCanvas() {
  if (input.isTouchDevice || input.isPointerLocked) return;
  const canvas = renderer.canvas;
  if (!canvas.requestPointerLock) { input.useDragLook = true; return; }
  try {
    const result = canvas.requestPointerLock();
    if (result && typeof result.catch === 'function') {
      result.catch(function () { enableDragLookFallback(); });
    }
  } catch (error) {
    enableDragLookFallback();
  }
}

function enableDragLookFallback() {
  // A refused re-lock right after pressing Escape is normal; only fall back if capture never worked.
  if (input.useDragLook || input.hasPointerLockEverWorked) return;
  input.useDragLook = true;
  showMessage('Mouse capture is not available here. Hold the mouse button and drag to look, or use the arrow keys.', 7, 'info');
}

function initializeInput() {
  const canvas = renderer.canvas;

  window.addEventListener('keydown', function (event) {
    const code = event.code;
    // Debug mode's key, in a build that has debug mode (`npm run dev`). It works while typing in the panel too.
    const isDebugKey = debugHooks.togglePanel !== null && (code === 'Backquote' || code === 'F2');
    if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') && !isDebugKey) return;
    if (code === 'Tab' || code === 'Space' || code.indexOf('Arrow') === 0) event.preventDefault();
    if (event.repeat) return;
    if (isDebugKey) { event.preventDefault(); debugHooks.togglePanel(); return; }
    input.keysDown.add(code);
    if (game.mode === 'playing') {
      if (code === 'KeyE') input.wantsInteract = true;
      else if (code === 'KeyF') input.wantsSweep = true;
      else if (code === 'Tab' || code === 'KeyM') toggleMapOverlay();
      else if (code === 'Digit1') setScannerSpread(5);
      else if (code === 'Digit2') setScannerSpread(TUNING.scannerSpreadDefaultDegrees);
      else if (code === 'Digit3') setScannerSpread(24);
      else if (code === 'KeyV') cyclePalette();
      else if (code === 'Escape' || code === 'KeyP') pauseGame();
    } else if (game.mode === 'paused') {
      if (code === 'Escape' || code === 'KeyP') resumeGame();
    } else if (game.mode === 'reading') {
      if (code === 'KeyE' || code === 'Escape' || code === 'Enter' || code === 'Space') closeReader();
    } else if (game.mode === 'intro') {
      if (code === 'Space' || code === 'Enter' || code === 'Escape') finishIntro();
    }
  });
  window.addEventListener('keyup', function (event) { input.keysDown.delete(event.code); });
  window.addEventListener('blur', function () {
    input.keysDown.clear();
    input.isScanHeld = false;
    input.isLookDragging = false;
  });

  canvas.addEventListener('mousedown', function (event) {
    if (game.mode !== 'playing') return;
    if (event.button === 0) {
      if (!input.isPointerLocked && !input.useDragLook) requestPointerLockOnCanvas();
      input.isScanHeld = true;
    } else if (event.button === 2) {
      if (input.isPointerLocked) input.wantsSweep = true;
      else input.isLookDragging = true;
    }
  });
  window.addEventListener('mouseup', function (event) {
    if (event.button === 0) input.isScanHeld = false;
    if (event.button === 2) input.isLookDragging = false;
  });
  window.addEventListener('mousemove', function (event) {
    if (game.mode !== 'playing') return;
    if (performance.now() < input.ignoreLookUntil) return;
    if (input.isPointerLocked || (input.useDragLook && (input.isScanHeld || input.isLookDragging))) {
      input.lookDeltaX += event.movementX || 0;
      input.lookDeltaY += event.movementY || 0;
    }
  });
  canvas.addEventListener('wheel', function (event) {
    if (game.mode !== 'playing') return;
    event.preventDefault();
    setScannerSpread(player.spreadDegrees + (event.deltaY > 0 ? -2 : 2));
  }, { passive: false });
  canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });

  document.addEventListener('pointerlockchange', function () {
    input.isPointerLocked = document.pointerLockElement === canvas;
    if (input.isPointerLocked) {
      input.hasPointerLockEverWorked = true;
      // Some browsers report one huge mouse jump right after capture. Skip the first moments.
      input.ignoreLookUntil = performance.now() + 150;
    }
    if (!input.isPointerLocked) {
      input.isScanHeld = false;
      // Losing the mouse normally means the player pressed Escape. With the debug panel up it means they want the cursor.
      if (game.mode === 'playing' && !input.useDragLook && !input.isTouchDevice && !debugState.isPanelOpen) pauseGame();
    }
  });
  document.addEventListener('pointerlockerror', enableDragLookFallback);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.mode === 'playing') pauseGame();
  });

  initializeTouchControls();
}

function setScannerSpread(degrees) {
  player.spreadDegrees = clampNumber(degrees, TUNING.scannerSpreadMinimumDegrees, TUNING.scannerSpreadMaximumDegrees);
}

function cyclePalette() {
  settings.palette = (settings.palette + 1) % 3;
  saveSettings();
  showMessage('Colour mode: ' + ['range (ice)', 'amber', 'height'][settings.palette], 2, 'info');
}

function initializeTouchControls() {
  const touchRoot = document.getElementById('touch-controls');
  const moveZone = document.getElementById('touch-move-zone');
  const lookZone = document.getElementById('touch-look-zone');
  const stickBase = document.getElementById('touch-stick-base');
  const stickKnob = document.getElementById('touch-stick-knob');
  const scanButton = document.getElementById('touch-scan');
  const lookTouches = new Map();
  let moveTouchIdentifier = null, moveOriginX = 0, moveOriginY = 0;

  const activateTouchMode = function () {
    if (input.isTouchDevice) return;
    input.isTouchDevice = true;
    document.body.classList.add('is-touch');
    if (game.mode === 'playing') touchRoot.hidden = false;
  };
  window.addEventListener('touchstart', activateTouchMode, { passive: true });

  moveZone.addEventListener('touchstart', function (event) {
    event.preventDefault();
    const touch = event.changedTouches[0];
    moveTouchIdentifier = touch.identifier;
    moveOriginX = touch.clientX; moveOriginY = touch.clientY;
    stickBase.style.left = (touch.clientX - 55) + 'px';
    stickBase.style.top = (touch.clientY - 55) + 'px';
    stickBase.hidden = false;
    stickKnob.style.transform = 'translate(0px, 0px)';
  }, { passive: false });
  moveZone.addEventListener('touchmove', function (event) {
    event.preventDefault();
    for (const touch of event.changedTouches) {
      if (touch.identifier !== moveTouchIdentifier) continue;
      let deltaX = touch.clientX - moveOriginX, deltaY = touch.clientY - moveOriginY;
      const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const limit = 48;
      if (length > limit) { deltaX = deltaX / length * limit; deltaY = deltaY / length * limit; }
      input.moveStickX = deltaX / limit;
      input.moveStickZ = deltaY / limit;
      stickKnob.style.transform = 'translate(' + deltaX + 'px, ' + deltaY + 'px)';
    }
  }, { passive: false });
  const endMoveTouch = function (event) {
    for (const touch of event.changedTouches) {
      if (touch.identifier !== moveTouchIdentifier) continue;
      moveTouchIdentifier = null;
      input.moveStickX = 0; input.moveStickZ = 0;
      stickBase.hidden = true;
    }
  };
  moveZone.addEventListener('touchend', endMoveTouch);
  moveZone.addEventListener('touchcancel', endMoveTouch);

  const beginLookTouch = function (event) {
    event.preventDefault();
    for (const touch of event.changedTouches) lookTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
  };
  const moveLookTouch = function (event) {
    event.preventDefault();
    for (const touch of event.changedTouches) {
      const last = lookTouches.get(touch.identifier);
      if (!last) continue;
      input.lookDeltaX += (touch.clientX - last.x) * 2.4;
      input.lookDeltaY += (touch.clientY - last.y) * 2.4;
      last.x = touch.clientX; last.y = touch.clientY;
    }
  };
  const endLookTouch = function (event) {
    for (const touch of event.changedTouches) lookTouches.delete(touch.identifier);
  };
  for (const element of [lookZone, scanButton]) {
    element.addEventListener('touchstart', beginLookTouch, { passive: false });
    element.addEventListener('touchmove', moveLookTouch, { passive: false });
    element.addEventListener('touchend', endLookTouch);
    element.addEventListener('touchcancel', endLookTouch);
  }
  scanButton.addEventListener('touchstart', function () { input.touchScanHeld = true; scanButton.classList.add('is-held'); }, { passive: true });
  const releaseScan = function () { input.touchScanHeld = false; scanButton.classList.remove('is-held'); };
  scanButton.addEventListener('touchend', releaseScan);
  scanButton.addEventListener('touchcancel', releaseScan);

  const bindTapButton = function (elementId, action) {
    const element = document.getElementById(elementId);
    element.addEventListener('touchstart', function (event) { event.preventDefault(); action(element); }, { passive: false });
    element.addEventListener('click', function () { if (!input.isTouchDevice) action(element); });
  };
  bindTapButton('touch-sweep', function () { input.wantsSweep = true; });
  bindTapButton('touch-use', function () { input.wantsInteract = true; });
  bindTapButton('touch-map', function () { toggleMapOverlay(); });
  bindTapButton('touch-pause', function () { pauseGame(); });
  bindTapButton('touch-run', function (element) {
    input.touchSprint = !input.touchSprint;
    if (input.touchSprint) { input.touchCrouch = false; document.getElementById('touch-crouch').classList.remove('is-held'); }
    element.classList.toggle('is-held', input.touchSprint);
  });
  bindTapButton('touch-crouch', function (element) {
    input.touchCrouch = !input.touchCrouch;
    if (input.touchCrouch) { input.touchSprint = false; document.getElementById('touch-run').classList.remove('is-held'); }
    element.classList.toggle('is-held', input.touchCrouch);
  });
  bindTapButton('touch-spread', function () {
    const next = player.spreadDegrees < 8 ? TUNING.scannerSpreadDefaultDegrees : (player.spreadDegrees < 18 ? 24 : 5);
    setScannerSpread(next);
  });
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function updatePlayerMovement(dt) {
  const keys = input.keysDown;
  // TWEAK: base mouse sensitivity, in radians turned per pixel moved. The "Look speed" slider multiplies it.
  const lookScale = 0.0021 * settings.sensitivity;
  player.yaw += input.lookDeltaX * lookScale;
  player.pitch -= input.lookDeltaY * lookScale;
  input.lookDeltaX = 0; input.lookDeltaY = 0;
  if (keys.has('ArrowLeft')) player.yaw -= 1.9 * dt;
  if (keys.has('ArrowRight')) player.yaw += 1.9 * dt;
  if (keys.has('ArrowUp')) player.pitch += 1.2 * dt;
  if (keys.has('ArrowDown')) player.pitch -= 1.2 * dt;
  player.yaw = wrapAngleToPi(player.yaw);
  player.pitch = clampNumber(player.pitch, -1.45, 1.45);

  let forwardInput = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) - input.moveStickZ;
  let strafeInput = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + input.moveStickX;
  const inputLength = Math.sqrt(forwardInput * forwardInput + strafeInput * strafeInput);
  if (inputLength > 1) { forwardInput /= inputLength; strafeInput /= inputLength; }
  const hasMoveInput = inputLength > 0.08;

  if (debugState.options.flyMode) { debugHooks.updateFlight(dt, forwardInput, strafeInput); return; }

  // Under a ceiling too low to stand under (a vent), you are down whether you hold the key or not.
  const isInVent = (getTileFlagsAtPosition(player.x, player.z) & TILE_FLAG_VENT) !== 0;
  const hasNoRoomToStand = getHeadroomAt(player.x, player.z) < 1.75;
  player.isCrouching = keys.has('KeyC') || input.touchCrouch || hasNoRoomToStand;
  player.isInVent = isInVent;
  const wantsSprint = (keys.has('ShiftLeft') || keys.has('ShiftRight') || input.touchSprint) && !player.isCrouching;
  player.isSprinting = wantsSprint && hasMoveInput && forwardInput > 0.2 && !player.isStaminaLocked && player.sweepTimeRemaining <= 0;

  if (player.isSprinting) {
    player.stamina -= dt / TUNING.staminaSeconds;
    player.timeSinceSprint = 0;
    if (player.stamina <= 0) { player.stamina = 0; player.isStaminaLocked = true; }
  } else {
    player.timeSinceSprint += dt;
    if (player.timeSinceSprint > 0.9) player.stamina = Math.min(1, player.stamina + dt / TUNING.staminaRecoverySeconds);
    if (player.isStaminaLocked && player.stamina > 0.3) player.isStaminaLocked = false;
  }
  if (debugState.options.unlimitedStamina) { player.stamina = 1; player.isStaminaLocked = false; }

  let speed = TUNING.walkSpeed;
  if (player.isCrouching) speed = TUNING.crouchSpeed;
  else if (player.isSprinting) speed = TUNING.sprintSpeed;
  if (player.sweepTimeRemaining > 0) speed *= 0.5;
  const flags = getTileFlagsAtPosition(player.x, player.z);
  const isInWater = (flags & TILE_FLAG_WATER) !== 0;
  if (isInWater) speed *= TUNING.waterSpeedFactor;

  const forwardX = Math.sin(player.yaw), forwardZ = -Math.cos(player.yaw);
  const rightX = Math.cos(player.yaw), rightZ = Math.sin(player.yaw);
  const desiredVelocityX = (forwardX * forwardInput + rightX * strafeInput) * speed;
  const desiredVelocityZ = (forwardZ * forwardInput + rightZ * strafeInput) * speed;
  const maximumChange = TUNING.playerAcceleration * dt;
  player.velocityX = approachValue(player.velocityX, desiredVelocityX, maximumChange);
  player.velocityZ = approachValue(player.velocityZ, desiredVelocityZ, maximumChange);

  const previousX = player.x, previousZ = player.z;
  const resolved = resolveBodyCollision(player.x + player.velocityX * dt, player.z + player.velocityZ * dt,
    TUNING.playerRadius, player.isCrouching ? 1.0 : 1.7, getFloorHeightAt(player.x, player.z));
  player.x = resolved.x; player.z = resolved.z;
  // Follow the floor. Stairs are taken smoothly; anything bigger (a teleport, a checkpoint) lands at once.
  // TWEAK: 2.5 = how fast the view rises and falls on stairs, in metres per second. Lower feels floatier.
  const floorHere = getFloorHeightAt(player.x, player.z);
  if (Math.abs(floorHere - player.floorY) > 1) player.floorY = floorHere;
  else player.floorY = approachValue(player.floorY, floorHere, dt * 2.5);
  const movedDistance = distanceBetweenPoints(previousX, previousZ, player.x, player.z);
  player.isMoving = movedDistance > dt * 0.3;
  game.statistics.distanceWalked += movedDistance;

  player.eyeHeight = approachValue(player.eyeHeight, player.isCrouching ? TUNING.eyeHeightCrouching : TUNING.eyeHeightStanding, dt * 3.2);
  player.bobPhase += movedDistance * (player.isSprinting ? 5.2 : 6.4);

  // Footsteps are what the Hollow listens for.
  player.strideDistance += movedDistance;
  // TWEAK: metres between footsteps (sprinting, crouching, walking). Each footstep is one noise the Hollow can hear,
  // so shorter strides mean more chances to be heard.
  const strideLength = player.isSprinting ? 1.15 : (player.isCrouching ? 0.62 : 0.8);
  if (player.strideDistance >= strideLength) {
    player.strideDistance = 0;
    const loudness = player.isSprinting ? 1.0 : (player.isCrouching ? 0.25 : 0.55);
    playFootstepSound(isInWater, (flags & TILE_FLAG_GRATE) !== 0, loudness);
    let radius = player.isSprinting ? TUNING.noiseRadiusSprintStep : (player.isCrouching ? TUNING.noiseRadiusCrouchStep : TUNING.noiseRadiusWalkStep);
    if (isInVent) { radius = TUNING.noiseRadiusVentStep; playVentCrawlSound(); }
    if (isInWater) radius *= TUNING.waterStepNoiseFactor;
    emitNoise(player.x, player.z, radius);
  }

  // How close the Hollow has to be to notice you right now, without any particular noise.
  if (player.isMoving) {
    player.audibleRadius = player.isSprinting ? TUNING.audibleRadiusSprinting
      : (player.isCrouching ? TUNING.audibleRadiusCrouchWalking : TUNING.audibleRadiusWalking);
  } else {
    player.audibleRadius = player.isCrouching ? TUNING.audibleRadiusCrouchedStill : TUNING.audibleRadiusStanding;
  }
  if (isInWater && player.isMoving) player.audibleRadius *= TUNING.waterAudibleFactor;
  if (isInVent && player.isMoving) player.audibleRadius = TUNING.audibleRadiusVentCrawling;

  // The first time you walk up to a vent on your feet, say how to get in.
  if (!game.hasShownVentHint && !player.isCrouching && hasMoveInput &&
      (getTileFlagsAtPosition(player.x + forwardX * 0.9, player.z + forwardZ * 0.9) & TILE_FLAG_VENT) !== 0) {
    game.hasShownVentHint = true;
    showMessage(input.isTouchDevice ? 'A vent. Hold CROUCH to crawl in. It is not quiet in there.' : 'A vent. Hold C to crawl in. It is not quiet in there.', 6, 'info');
  }
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

const scannerBasis = {
  forwardX: 0, forwardY: 0, forwardZ: -1,
  rightX: 1, rightY: 0, rightZ: 0,
  upX: 0, upY: 1, upZ: 0
};

function computeScannerBasis(yaw, pitch) {
  const cosineYaw = Math.cos(yaw), sineYaw = Math.sin(yaw), cosinePitch = Math.cos(pitch), sinePitch = Math.sin(pitch);
  scannerBasis.forwardX = sineYaw * cosinePitch; scannerBasis.forwardY = sinePitch; scannerBasis.forwardZ = -cosineYaw * cosinePitch;
  scannerBasis.rightX = cosineYaw; scannerBasis.rightY = 0; scannerBasis.rightZ = sineYaw;
  scannerBasis.upX = -sineYaw * sinePitch; scannerBasis.upY = cosinePitch; scannerBasis.upZ = cosineYaw * sinePitch;
}

function markInteractableDiscovered(objectId) {
  const interactable = findInteractableByObjectId(objectId);
  if (interactable && !interactable.isDiscovered) interactable.isDiscovered = true;
}

// Fires one pulse offset from the view direction by (horizontalTangent, verticalTangent).
function fireScannerPulse(originX, originY, originZ, horizontalTangent, verticalTangent, drawBeam) {
  const basis = scannerBasis;
  let directionX = basis.forwardX + basis.rightX * horizontalTangent + basis.upX * verticalTangent;
  let directionY = basis.forwardY + basis.rightY * horizontalTangent + basis.upY * verticalTangent;
  let directionZ = basis.forwardZ + basis.rightZ * horizontalTangent + basis.upZ * verticalTangent;
  const length = Math.sqrt(directionX * directionX + directionY * directionY + directionZ * directionZ);
  directionX /= length; directionY /= length; directionZ /= length;
  if (!castScannerRay(originX, originY, originZ, directionX, directionY, directionZ, TUNING.scannerMaximumRange)) return false;
  let lifeCode = 0;
  const figure = rayHit.figure;
  if (figure !== null) {
    figure.hitsThisFrame++;
    figure.totalHits++;
    figure.lastScannedTime = game.time;
    lifeCode = convertSecondsToPointLifeCode(TUNING[figure.imprintTuningKey]);
  }
  addScanPoint(rayHit.x, rayHit.y, rayHit.z, rayHit.intensity, rayHit.surfaceClass, lifeCode);
  if (rayHit.objectId !== 0) markInteractableDiscovered(rayHit.objectId);
  if (drawBeam) addBeamLine(rayHit.x, rayHit.y, rayHit.z, 0.1 + Math.random() * 0.12);
  return true;
}

function updateScanner(dt, eyeX, eyeY, eyeZ) {
  const quality = QUALITY_PRESETS[settings.quality];
  computeScannerBasis(player.yaw, player.pitch);
  const basis = scannerBasis;
  resetBeamLines(
    eyeX + basis.rightX * 0.2 + basis.upX * -0.16 + basis.forwardX * 0.55,
    eyeY + basis.rightY * 0.2 + basis.upY * -0.16 + basis.forwardY * 0.55,
    eyeZ + basis.rightZ * 0.2 + basis.upZ * -0.16 + basis.forwardZ * 0.55);

  const isSweeping = player.sweepTimeRemaining > 0;
  const wantsPaint = (input.isScanHeld || input.touchScanHeld || input.keysDown.has('Space')) && !player.isOverheated && !isSweeping;
  player.isPainting = wantsPaint;

  if (input.wantsSweep) {
    input.wantsSweep = false;
    if (!isSweeping && !player.isOverheated && player.heat < 0.78) {
      player.sweepTimeRemaining = TUNING.sweepDurationSeconds;
      player.sweepRayBudget = 0;
      player.heat = Math.min(1, player.heat + TUNING.sweepHeatCost * game.difficulty.heatFactor);
      playSweepSound(TUNING.sweepDurationSeconds);
      emitNoise(player.x, player.z, TUNING.noiseRadiusSweep);
    } else if (!isSweeping) {
      playDeniedSound();
      showMessage('Scanner too hot for a full sweep.', 2, 'warning');
    }
  }

  if (wantsPaint) {
    player.heat += TUNING.heatPerSecondWhilePainting * game.difficulty.heatFactor * dt;
    player.rayBudget += quality.raysPerSecond * dt;
    const rayCount = Math.min(700, Math.floor(player.rayBudget));
    player.rayBudget -= rayCount;
    const spreadTangent = Math.tan(player.spreadDegrees * DEGREES_TO_RADIANS);
    const beamEvery = Math.max(1, Math.floor(rayCount / 26)); // TWEAK: about 26 visible laser lines per frame
    for (let rayIndex = 0; rayIndex < rayCount; rayIndex++) {
      // TWEAK: 0.5 spreads pulses evenly over the cone, lower values crowd them toward the centre.
      const radius = Math.pow(Math.random(), 0.62) * spreadTangent;
      const angle = Math.random() * TWO_PI;
      fireScannerPulse(eyeX, eyeY, eyeZ, Math.cos(angle) * radius, Math.sin(angle) * radius, rayIndex % beamEvery === 0);
    }
    player.scannerHumTimer -= dt;
    if (player.scannerHumTimer <= 0) {
      player.scannerHumTimer = 0.5;
      emitNoise(player.x, player.z, TUNING.noiseRadiusScannerHum);
    }
  } else if (isSweeping) {
    const previousProgress = 1 - player.sweepTimeRemaining / TUNING.sweepDurationSeconds;
    player.sweepTimeRemaining = Math.max(0, player.sweepTimeRemaining - dt);
    const progress = 1 - player.sweepTimeRemaining / TUNING.sweepDurationSeconds;
    player.sweepRayBudget += quality.sweepRays * (progress - previousProgress);
    const rayCount = Math.min(3000, Math.floor(player.sweepRayBudget));
    player.sweepRayBudget -= rayCount;
    const halfWidthTangent = Math.tan(TUNING.sweepHalfWidthDegrees * DEGREES_TO_RADIANS);
    const halfHeightTangent = Math.tan(TUNING.sweepHalfHeightDegrees * DEGREES_TO_RADIANS);
    const beamEvery = Math.max(1, Math.floor(rayCount / 40));
    for (let rayIndex = 0; rayIndex < rayCount; rayIndex++) {
      const lineProgress = previousProgress + (progress - previousProgress) * Math.random();
      const verticalTangent = interpolateLinear(halfHeightTangent, -halfHeightTangent, lineProgress);
      const horizontalTangent = (Math.random() * 2 - 1) * halfWidthTangent;
      fireScannerPulse(eyeX, eyeY, eyeZ, horizontalTangent, verticalTangent, rayIndex % beamEvery === 0);
    }
  } else {
    player.heat = Math.max(0, player.heat - TUNING.heatCoolingPerSecond * dt);
  }

  if (player.heat >= 1 && !player.isOverheated) {
    player.heat = 1;
    player.isOverheated = true;
    playOverheatSound();
    showMessage('Scanner overheated. Cooling.', 2.5, 'warning');
  }
  if (player.isOverheated && player.heat <= TUNING.overheatRecoveryLevel) player.isOverheated = false;
  if (debugState.options.unlimitedScanner) { player.heat = 0; player.isOverheated = false; }

  setScannerSound(wantsPaint ? 1 : (isSweeping ? 0.7 : 0));
  player.scannerActivity = approachValue(player.scannerActivity, wantsPaint || isSweeping ? 1 : 0, dt * 9);

  // The range readout always measures straight ahead, even when not scanning.
  if (castScannerRay(eyeX, eyeY, eyeZ, basis.forwardX, basis.forwardY, basis.forwardZ, TUNING.scannerMaximumRange)) {
    player.centerRange = rayHit.distance;
  } else {
    player.centerRange = -1;
  }
}

function updateInteractionFocus(eyeX, eyeY, eyeZ) {
  const basis = scannerBasis;
  let best = null, bestScore = 0.86;
  for (const interactable of interactables) {
    if (!interactable.isAvailable) continue;
    const deltaX = interactable.x - eyeX, deltaY = interactable.y - eyeY, deltaZ = interactable.z - eyeZ;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
    if (distance > TUNING.interactionReach) continue;
    const alignment = (deltaX * basis.forwardX + deltaY * basis.forwardY + deltaZ * basis.forwardZ) / Math.max(distance, 0.001);
    const score = distance < 0.7 ? 1 : alignment;
    if (score > bestScore) { bestScore = score; best = interactable; }
  }
  player.focusedInteractable = best;
  if (input.wantsInteract) {
    input.wantsInteract = false;
    if (best) useInteractable(best);
  }
}
