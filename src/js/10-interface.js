// ---------------------------------------------------------------------------
// Interface: HUD, the point-cloud map, messages and the overlay screens.
// ---------------------------------------------------------------------------

const MAP_PIXELS_PER_METRE = 5;
const MAP_WIDTH = GRID_WIDTH * MAP_PIXELS_PER_METRE;
const MAP_HEIGHT = GRID_DEPTH * MAP_PIXELS_PER_METRE;

const interfaceState = {
  elements: {},
  mapSourceCanvas: null,
  mapSourceContext: null,
  mapImageData: null,
  mapIsDirty: false,
  isMapOverlayOpen: false,
  messages: [],
  captionExpiresAt: 0,
  textRefreshTimer: 0,
  minimapRefreshTimer: 0,
  visitedZones: new Set(),
  introTimers: []
};

function getElement(elementId) {
  return document.getElementById(elementId);
}

function initializeInterface() {
  const elementIds = [
    'hud', 'hud-objective', 'chip-spools', 'chip-power', 'chip-keycard', 'minimap-canvas', 'hud-location',
    'readout-range', 'readout-flight', 'readout-returns', 'readout-heading', 'bar-heat', 'bar-stamina',
    'bar-interference', 'meter-agitation', 'bar-agitation', 'hud-stance', 'reticle-ring', 'hud-prompt', 'hud-countdown', 'hud-messages', 'hud-caption',
    'touch-controls', 'map-overlay', 'map-canvas', 'map-close', 'screen-title', 'screen-intro', 'screen-pause',
    'screen-reader', 'screen-death', 'screen-ending', 'screen-rotate', 'button-play-upright', 'fatal-error', 'title-range', 'title-returns',
    'difficulty-description', 'button-begin', 'intro-lines', 'button-skip-intro', 'pause-objective', 'button-resume',
    'button-pause-restart', 'reader-source', 'reader-heading', 'reader-body', 'button-close-reader', 'death-title',
    'death-lines', 'button-retry', 'button-death-restart', 'ending-stats', 'ending-manifest', 'button-ending-restart'
  ];
  for (const elementId of elementIds) interfaceState.elements[elementId] = getElement(elementId);

  interfaceState.mapSourceCanvas = document.createElement('canvas');
  interfaceState.mapSourceCanvas.width = MAP_WIDTH;
  interfaceState.mapSourceCanvas.height = MAP_HEIGHT;
  interfaceState.mapSourceContext = interfaceState.mapSourceCanvas.getContext('2d');
  interfaceState.mapImageData = interfaceState.mapSourceContext.createImageData(MAP_WIDTH, MAP_HEIGHT);
  clearMap();

  const elements = interfaceState.elements;
  elements['button-begin'].addEventListener('click', function () { beginNewGame(); });
  elements['button-skip-intro'].addEventListener('click', function () { finishIntro(); });
  elements['button-resume'].addEventListener('click', function () { resumeGame(); });
  elements['button-pause-restart'].addEventListener('click', function () { returnToTitle(); });
  elements['button-close-reader'].addEventListener('click', function () { closeReader(); });
  elements['button-retry'].addEventListener('click', function () { retryFromCheckpoint(); });
  elements['button-death-restart'].addEventListener('click', function () { returnToTitle(); });
  elements['button-ending-restart'].addEventListener('click', function () { returnToTitle(); });
  elements['map-close'].addEventListener('click', function () { toggleMapOverlay(); });
  elements['button-play-upright'].addEventListener('click', function () { allowUprightPlay(); });
  elements['screen-reader'].addEventListener('mousedown', function (event) {
    if (input.isPointerLocked && game.mode === 'reading') { event.preventDefault(); closeReader(); }
  });
  renderer.canvas.addEventListener('mousedown', function () {
    if (game.mode === 'reading' && input.isPointerLocked) closeReader();
    else if (game.mode === 'intro' && input.isPointerLocked) finishIntro();
  });

  // The point-budget choices show the numbers from QUALITY_PRESETS.
  for (const option of document.querySelectorAll('#title-quality option')) {
    const preset = QUALITY_PRESETS[option.value];
    if (preset) option.textContent = formatWithThousandsSeparators(preset.maximumPoints) + ' points';
  }

  // Settings controls appear on more than one screen; keep every copy in step.
  const settingControls = document.querySelectorAll('[data-setting]');
  const refreshSettingControls = function () {
    for (const control of settingControls) control.value = String(settings[control.dataset.setting]);
  };
  for (const control of settingControls) {
    control.addEventListener('input', function () {
      const name = control.dataset.setting;
      if (name === 'quality') settings.quality = control.value;
      else if (name === 'palette') settings.palette = Number(control.value);
      else settings[name] = Number(control.value);
      if (name === 'volume') setMasterVolume(settings.volume);
      saveSettings();
      refreshSettingControls();
    });
  }
  refreshSettingControls();
  interfaceState.refreshSettingControls = refreshSettingControls;

  const difficultyDescriptions = {
    survey: 'Nothing hunts you. Walk the station, map it, read what the last crew left.',
    standard: 'It is blind. It hears running, sweeps and doors. The beam slows it, and angers it.',
    nightmare: 'It is faster and hears further. The emitter overheats sooner.'
  };
  const difficultyInputs = document.querySelectorAll('input[name="difficulty"]');
  const refreshDifficulty = function () {
    for (const radio of difficultyInputs) radio.checked = radio.value === settings.difficulty;
    elements['difficulty-description'].textContent = difficultyDescriptions[settings.difficulty];
  };
  for (const radio of difficultyInputs) {
    radio.addEventListener('change', function () {
      if (radio.checked) { settings.difficulty = radio.value; saveSettings(); refreshDifficulty(); }
    });
  }
  refreshDifficulty();
}

function showOnlyScreen(screenId) {
  const elements = interfaceState.elements;
  for (const candidate of ['screen-title', 'screen-intro', 'screen-pause', 'screen-reader', 'screen-death', 'screen-ending', 'screen-rotate']) {
    elements[candidate].hidden = candidate !== screenId;
  }
}

function setHudVisible(isVisible) {
  interfaceState.elements['hud'].hidden = !isVisible;
  interfaceState.elements['touch-controls'].hidden = !(isVisible && input.isTouchDevice);
}

// ---------------------------------------------------------------------------
// Map: every stored return is also plotted on a plan view.
// ---------------------------------------------------------------------------

function clearMap() {
  const data = interfaceState.mapImageData.data;
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 4; data[offset + 1] = 6; data[offset + 2] = 10; data[offset + 3] = 255;
  }
  interfaceState.mapIsDirty = true;
  interfaceState.visitedZones.clear();
}

function plotPointOnMap(x, z, surfaceClass) {
  if (surfaceClass === SURFACE_HOLLOW || surfaceClass === SURFACE_STILL || surfaceClass === SURFACE_CEILING) return;
  const pixelX = Math.floor(x * MAP_PIXELS_PER_METRE), pixelZ = Math.floor(z * MAP_PIXELS_PER_METRE);
  if (pixelX < 0 || pixelZ < 0 || pixelX >= MAP_WIDTH || pixelZ >= MAP_HEIGHT) return;
  const data = interfaceState.mapImageData.data;
  const offset = (pixelZ * MAP_WIDTH + pixelX) * 4;
  if (surfaceClass === SURFACE_FLOOR || surfaceClass === SURFACE_HAZARD) {
    if (data[offset + 2] < 62) { data[offset] += 2; data[offset + 1] += 5; data[offset + 2] += 9; }
  } else if (surfaceClass === SURFACE_WATER) {
    if (data[offset + 2] < 120) { data[offset] += 1; data[offset + 1] += 6; data[offset + 2] += 22; }
  } else if (surfaceClass === SURFACE_INTERACTIVE) {
    data[offset] = 242; data[offset + 1] = 169; data[offset + 2] = 59;
  } else if (surfaceClass === SURFACE_DOOR_AUTOMATIC || surfaceClass === SURFACE_DOOR_POWERED || surfaceClass === SURFACE_DOOR_KEYCARD) {
    data[offset] = 95; data[offset + 1] = 224; data[offset + 2] = 160;
  } else {
    data[offset] = Math.min(215, data[offset] + 44);
    data[offset + 1] = Math.min(236, data[offset + 1] + 54);
    data[offset + 2] = Math.min(255, data[offset + 2] + 60);
  }
  interfaceState.mapIsDirty = true;
}

// Debug mode: draws every room on the map as if it had all been scanned.
function revealWholeMap() {
  const step = 1 / MAP_PIXELS_PER_METRE;
  for (let tileZ = 0; tileZ < GRID_DEPTH; tileZ++) {
    for (let tileX = 0; tileX < GRID_WIDTH; tileX++) {
      const index = tileIndexAt(tileX, tileZ);
      if (!tileIsOpen[index]) continue;
      const floorClass = (tileFlags[index] & TILE_FLAG_WATER) ? SURFACE_WATER : SURFACE_FLOOR;
      const isPit = (tileFlags[index] & TILE_FLAG_PIT) !== 0;
      for (let offsetZ = step / 2; offsetZ < 1; offsetZ += step) {
        for (let offsetX = step / 2; offsetX < 1; offsetX += step) {
          if (!isPit) for (let pass = 0; pass < 5; pass++) plotPointOnMap(tileX + offsetX, tileZ + offsetZ, floorClass);
        }
      }
      for (let along = step / 2; along < 1; along += step) {
        for (let pass = 0; pass < 4; pass++) {
          if (!isTileOpenAt(tileX, tileZ - 1)) plotPointOnMap(tileX + along, tileZ + 0.01, SURFACE_WALL);
          if (!isTileOpenAt(tileX, tileZ + 1)) plotPointOnMap(tileX + along, tileZ + 0.99, SURFACE_WALL);
          if (!isTileOpenAt(tileX - 1, tileZ)) plotPointOnMap(tileX + 0.01, tileZ + along, SURFACE_WALL);
          if (!isTileOpenAt(tileX + 1, tileZ)) plotPointOnMap(tileX + 0.99, tileZ + along, SURFACE_WALL);
        }
      }
      if (tileZone[index]) interfaceState.visitedZones.add(tileZone[index]);
    }
  }
  for (const prop of worldProps) {
    if (prop.isDynamic || prop.maximumY < 0.3 || prop.minimumY > 1.8 || !prop.blocksMovement) continue;
    for (let pass = 0; pass < 4; pass++) plotPointOnMap(prop.centerX, prop.centerZ, SURFACE_PROP);
  }
  for (const door of doors) plotPointOnMap(door.centerX, door.centerZ, SURFACE_DOOR_AUTOMATIC);
  for (const interactable of interactables) interactable.isDiscovered = true;
}

function flushMapPixels() {
  if (!interfaceState.mapIsDirty) return;
  interfaceState.mapSourceContext.putImageData(interfaceState.mapImageData, 0, 0);
  interfaceState.mapIsDirty = false;
}

function drawPlayerMarker(context, x, y, yaw, size) {
  context.save();
  context.translate(x, y);
  context.rotate(yaw);
  context.fillStyle = '#cfe9ff';
  context.beginPath();
  context.moveTo(0, -size);
  context.lineTo(size * 0.65, size * 0.75);
  context.lineTo(0, size * 0.35);
  context.lineTo(-size * 0.65, size * 0.75);
  context.closePath();
  context.fill();
  context.restore();
}

function drawMinimap() {
  flushMapPixels();
  const canvas = interfaceState.elements['minimap-canvas'];
  const context = canvas.getContext('2d');
  const spanMetres = 34;
  const sourceSize = spanMetres * MAP_PIXELS_PER_METRE;
  const sourceX = player.x * MAP_PIXELS_PER_METRE - sourceSize / 2;
  const sourceY = player.z * MAP_PIXELS_PER_METRE - sourceSize / 2;
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#04060a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(interfaceState.mapSourceCanvas, sourceX, sourceY, sourceSize, sourceSize, 0, 0, canvas.width, canvas.height);
  const scale = canvas.width / spanMetres;
  context.fillStyle = '#f2a93b';
  for (const interactable of interactables) {
    if (!interactable.isAvailable || !interactable.isDiscovered) continue;
    const markerX = (interactable.x - player.x) * scale + canvas.width / 2;
    const markerY = (interactable.z - player.z) * scale + canvas.height / 2;
    if (markerX < 0 || markerY < 0 || markerX > canvas.width || markerY > canvas.height) continue;
    context.fillRect(markerX - 3, markerY - 3, 6, 6);
  }
  drawDebugMapMarkers(context,
    function (worldX) { return (worldX - player.x) * scale + canvas.width / 2; },
    function (worldZ) { return (worldZ - player.z) * scale + canvas.height / 2; }, 5);
  drawPlayerMarker(context, canvas.width / 2, canvas.height / 2, player.yaw, 7);
}

function drawFullMap() {
  flushMapPixels();
  const canvas = interfaceState.elements['map-canvas'];
  const context = canvas.getContext('2d');
  const scale = canvas.width / GRID_WIDTH;
  context.imageSmoothingEnabled = false;
  context.drawImage(interfaceState.mapSourceCanvas, 0, 0, MAP_WIDTH, MAP_HEIGHT, 0, 0, canvas.width, canvas.height);
  context.font = '11px "B612 Mono", ui-monospace, monospace';
  context.textAlign = 'center';
  // Zone labels appear once you have stood in the zone.
  const labelPositions = {};
  for (let tileZ = 0; tileZ < GRID_DEPTH; tileZ++) {
    for (let tileX = 0; tileX < GRID_WIDTH; tileX++) {
      const zone = tileZone[tileIndexAt(tileX, tileZ)];
      if (!zone || !interfaceState.visitedZones.has(zone)) continue;
      if (!labelPositions[zone]) labelPositions[zone] = { sumX: 0, sumZ: 0, count: 0 };
      labelPositions[zone].sumX += tileX + 0.5; labelPositions[zone].sumZ += tileZ + 0.5; labelPositions[zone].count++;
    }
  }
  context.fillStyle = 'rgba(163, 122, 54, 0.95)';
  for (const zone in labelPositions) {
    const label = labelPositions[zone];
    context.fillText(ZONE_NAMES[zone], label.sumX / label.count * scale, label.sumZ / label.count * scale + 4);
  }
  context.textAlign = 'left';
  for (const interactable of interactables) {
    if (!interactable.isAvailable || !interactable.isDiscovered) continue;
    context.fillStyle = '#f2a93b';
    context.fillRect(interactable.x * scale - 4, interactable.z * scale - 4, 8, 8);
    if (interactable.mapLabel) context.fillText(interactable.mapLabel, interactable.x * scale + 8, interactable.z * scale + 4);
  }
  drawDebugMapMarkers(context, function (worldX) { return worldX * scale; }, function (worldZ) { return worldZ * scale; }, 7);
  drawPlayerMarker(context, player.x * scale, player.z * scale, player.yaw, 9);
}

function toggleMapOverlay() {
  if (game.mode !== 'playing') return;
  interfaceState.isMapOverlayOpen = !interfaceState.isMapOverlayOpen;
  interfaceState.elements['map-overlay'].hidden = !interfaceState.isMapOverlayOpen;
  if (interfaceState.isMapOverlayOpen) drawFullMap();
  playInterfaceBlip(interfaceState.isMapOverlayOpen ? 740 : 560);
}

function closeMapOverlay() {
  interfaceState.isMapOverlayOpen = false;
  interfaceState.elements['map-overlay'].hidden = true;
}

// ---------------------------------------------------------------------------
// Messages and captions
// ---------------------------------------------------------------------------

function showMessage(text, seconds, style) {
  const container = interfaceState.elements['hud-messages'];
  if (!container) return;
  for (const existing of interfaceState.messages) {
    if (existing.text === text) { existing.expiresAt = game.realTime + seconds; return; }
  }
  const element = document.createElement('div');
  element.className = 'hud-message' + (style === 'warning' ? ' is-warning' : '') + (style === 'radio' ? ' is-radio' : '');
  if (style === 'radio') {
    const speaker = document.createElement('span');
    speaker.className = 'message-speaker';
    speaker.textContent = 'DISPATCH · SURFACE';
    element.appendChild(speaker);
  }
  element.appendChild(document.createTextNode(text));
  container.appendChild(element);
  interfaceState.messages.push({ element: element, text: text, expiresAt: game.realTime + seconds });
  while (interfaceState.messages.length > 3) {
    const removed = interfaceState.messages.shift();
    removed.element.remove();
  }
}

// A line from dispatch. `key` names both the text in RADIO_MESSAGES and, if one was recorded,
// the voice file assets/voice/<key>.mp3. Without a recording the line is text only.
function playRadioLine(key) {
  const text = RADIO_MESSAGES[key];
  playRadioBlip();
  showMessage(text, Math.max(6, text.length * 0.075), 'radio');
  playVoiceLine(key, 'radio', 0.35, function (seconds) {
    // Keep the words on screen until the voice has finished saying them.
    showMessage(text, seconds + 1.5, 'radio');
  });
}

function showCaption(text) {
  const element = interfaceState.elements['hud-caption'];
  if (!element) return;
  element.textContent = text;
  element.classList.add('is-visible');
  interfaceState.captionExpiresAt = game.realTime + 3.2;
}

function clearMessages() {
  for (const message of interfaceState.messages) message.element.remove();
  interfaceState.messages.length = 0;
  interfaceState.elements['hud-caption'].classList.remove('is-visible');
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function updateHud(realDt) {
  const elements = interfaceState.elements;
  const now = game.realTime;
  for (let index = interfaceState.messages.length - 1; index >= 0; index--) {
    if (now > interfaceState.messages[index].expiresAt) {
      interfaceState.messages[index].element.remove();
      interfaceState.messages.splice(index, 1);
    }
  }
  if (now > interfaceState.captionExpiresAt) elements['hud-caption'].classList.remove('is-visible');

  if (game.mode === 'title') {
    interfaceState.textRefreshTimer -= realDt;
    if (interfaceState.textRefreshTimer <= 0) {
      interfaceState.textRefreshTimer = 0.12;
      elements['title-range'].textContent = game.attract.centerRange >= 0 ? game.attract.centerRange.toFixed(2) + ' m' : 'NO RETURN';
      elements['title-returns'].textContent = formatWithThousandsSeparators(pointCloud.totalReturns);
    }
    return;
  }
  if (elements['hud'].hidden) return;

  elements['bar-heat'].style.width = (player.heat * 100).toFixed(1) + '%';
  elements['bar-heat'].classList.toggle('is-critical', player.isOverheated || player.heat > 0.8);
  elements['bar-stamina'].style.width = (player.stamina * 100).toFixed(1) + '%';
  elements['bar-stamina'].classList.toggle('is-critical', player.isStaminaLocked);
  elements['bar-interference'].style.width = (Math.min(1, game.interference) * 100).toFixed(1) + '%';
  // The agitation bar appears the first time the beam touches the Hollow. It is the Hollow's anger:
  // amber while a touch only makes it turn, red once the beam is giving your position away.
  const hasMetHollow = hollow.isActive && hollow.figure.totalHits > 0;
  elements['meter-agitation'].hidden = !hasMetHollow;
  if (hasMetHollow) {
    elements['bar-agitation'].style.width = (hollow.anger * 100).toFixed(1) + '%';
    elements['bar-agitation'].classList.toggle('is-critical', hollow.anger >= TUNING.hollowAngerNoticeLevel);
  }

  const ring = elements['reticle-ring'];
  const viewHeight = renderer.canvas.clientHeight || 1;
  const fieldOfView = getPlayFieldOfViewDegrees() * DEGREES_TO_RADIANS;
  const ringDiameter = 2 * Math.tan(player.spreadDegrees * DEGREES_TO_RADIANS) / Math.tan(fieldOfView / 2) * (viewHeight / 2);
  ring.style.width = ringDiameter.toFixed(0) + 'px';
  ring.style.height = ringDiameter.toFixed(0) + 'px';
  ring.classList.toggle('is-active', player.isPainting);
  ring.classList.toggle('is-overheated', player.isOverheated);

  interfaceState.textRefreshTimer -= realDt;
  if (interfaceState.textRefreshTimer <= 0) {
    interfaceState.textRefreshTimer = 0.1;
    elements['hud-objective'].textContent = game.objectiveText;
    const spools = game.flags.spoolsCollected;
    elements['chip-spools'].textContent = 'SPOOLS ' + spools + '/3';
    elements['chip-spools'].classList.toggle('is-on', spools >= 3);
    elements['chip-power'].textContent = game.flags.powerOn ? 'MAINS ON' : 'MAINS OFF';
    elements['chip-power'].classList.toggle('is-on', game.flags.powerOn);
    elements['chip-keycard'].textContent = game.flags.hasKeycard ? 'KEYCARD' : 'NO KEYCARD';
    elements['chip-keycard'].classList.toggle('is-on', game.flags.hasKeycard);

    const zone = getZoneAtPosition(player.x, player.z);
    if (zone) interfaceState.visitedZones.add(zone);
    elements['hud-location'].textContent = ZONE_NAMES[zone] || ZONE_NAMES[0];

    const rangeElement = elements['readout-range'];
    if (player.centerRange >= 0) {
      rangeElement.textContent = player.centerRange.toFixed(2) + ' m';
      rangeElement.classList.remove('is-no-return');
      elements['readout-flight'].textContent = (player.centerRange * 2 / 0.299792458).toFixed(1) + ' ns';
    } else {
      rangeElement.textContent = 'NO RETURN';
      rangeElement.classList.add('is-no-return');
      elements['readout-flight'].textContent = '--- ns';
    }
    elements['readout-returns'].textContent = formatWithThousandsSeparators(pointCloud.totalReturns);
    let heading = Math.round(player.yaw / DEGREES_TO_RADIANS) % 360;
    if (heading < 0) heading += 360;
    elements['readout-heading'].innerHTML = String(heading).padStart(3, '0') + '&deg;';

    let stance = '';
    if (player.isCrouching) stance = player.isMoving ? 'CROUCHED · QUIET' : 'CROUCHED · STILL · NEARLY SILENT';
    else if (player.isSprinting) stance = 'SPRINTING · LOUD';
    elements['hud-stance'].textContent = stance;

    const prompt = elements['hud-prompt'];
    const focused = player.focusedInteractable;
    if (game.mode === 'playing' && focused) {
      prompt.hidden = false;
      prompt.textContent = (input.isTouchDevice ? 'USE · ' : '[E]  ') + focused.prompt;
    } else if (game.mode === 'playing' && !input.isPointerLocked && !input.useDragLook && !input.isTouchDevice) {
      prompt.hidden = false;
      prompt.textContent = 'Click to take control of the scanner';
    } else {
      prompt.hidden = true;
    }

    const countdown = elements['hud-countdown'];
    if (game.liftCountdown > 0) {
      countdown.hidden = false;
      countdown.textContent = 'LIFT ' + formatClockTime(Math.ceil(game.liftCountdown));
    } else {
      countdown.hidden = true;
    }
  }

  interfaceState.minimapRefreshTimer -= realDt;
  if (interfaceState.minimapRefreshTimer <= 0 && game.mode === 'playing') {
    interfaceState.minimapRefreshTimer = 0.08;
    drawMinimap();
    if (interfaceState.isMapOverlayOpen) drawFullMap();
  }
}

// ---------------------------------------------------------------------------
// Reader, death and ending screens
// ---------------------------------------------------------------------------

function openReader(entry) {
  const elements = interfaceState.elements;
  elements['reader-source'].textContent = entry.source;
  elements['reader-heading'].textContent = entry.heading;
  const body = elements['reader-body'];
  body.textContent = '';
  for (const paragraphText of entry.paragraphs) {
    const paragraph = document.createElement('p');
    paragraph.textContent = paragraphText;
    body.appendChild(paragraph);
  }
  elements['button-close-reader'].textContent = input.isPointerLocked ? 'Put it away (E or click)' : 'Put it away';
  game.mode = 'reading';
  setScannerSound(0);
  // A spool that has a recording (assets/voice/spool1.mp3 and so on) is read aloud while its text is open.
  for (const entryKey in LOG_ENTRIES) {
    if (LOG_ENTRIES[entryKey] === entry) playVoiceLine(entryKey, 'recorder', 0.4, null);
  }
  closeMapOverlay();
  showOnlyScreen('screen-reader');
}

function closeReader() {
  if (game.mode !== 'reading') return;
  stopVoiceLine();
  showOnlyScreen(null);
  game.mode = 'playing';
  input.isScanHeld = false;
  input.wantsInteract = false;
  playInterfaceBlip(520);
  focusGameView();
}

function showDeathScreen(kind) {
  const elements = interfaceState.elements;
  const text = DEATH_TEXT[kind];
  elements['death-title'].textContent = text.title;
  const lines = elements['death-lines'];
  lines.textContent = '';
  for (const lineText of text.lines) {
    const paragraph = document.createElement('p');
    paragraph.textContent = lineText;
    lines.appendChild(paragraph);
  }
  setHudVisible(false);
  closeMapOverlay();
  showOnlyScreen('screen-death');
}

function showEndingScreen() {
  const elements = interfaceState.elements;
  const stats = elements['ending-stats'];
  stats.textContent = '';
  const addRow = function (label, value) {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    stats.appendChild(term);
    stats.appendChild(description);
  };
  addRow('Time below', formatClockTime(game.statistics.elapsed));
  addRow('Returns logged', formatWithThousandsSeparators(pointCloud.totalReturns));
  addRow('Distance walked', Math.round(game.statistics.distanceWalked) + ' m');
  addRow('Signal losses', String(game.statistics.deaths));
  addRow('Threat level', game.difficulty.label);
  if (debugState.hasBeenUsedThisRun) addRow('Debug mode', 'used, so this run sets no best time');
  if (game.statistics.bestTime !== null) addRow('Best time', formatClockTime(game.statistics.bestTime));
  const manifest = elements['ending-manifest'];
  manifest.textContent = '';
  manifest.appendChild(document.createTextNode('Upload manifest: 3 spools. Automatic classification of objects in the car: 1 operator. '));
  if (game.difficulty.hollowEnabled) {
    const strong = document.createElement('strong');
    strong.textContent = '1 unclassified.';
    manifest.appendChild(strong);
  } else {
    manifest.appendChild(document.createTextNode('Nothing else.'));
  }
  setHudVisible(false);
  closeMapOverlay();
  showOnlyScreen('screen-ending');
}

function showFatalError(message) {
  const element = getElement('fatal-error');
  if (message) getElement('fatal-error-text').textContent = message;
  for (const screenId of ['screen-title', 'screen-intro', 'screen-pause', 'screen-reader', 'screen-death', 'screen-ending', 'screen-rotate']) {
    getElement(screenId).hidden = true;
  }
  element.hidden = false;
}
