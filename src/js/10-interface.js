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
  lastStatusSignature: '',  // objective and chip state as last shown, to notice when it changes
  objectiveShownUntil: 0,   // on the quiet screen the objective block is visible until this moment
  messages: [],
  workOrderBottom: -1,  // how far down the screen the work order ends, in CSS pixels, as last told to the stylesheet
  captionLines: [],     // the caption lines on screen: { slot, key, rank, source, expiresAt, element, textElement, whereElement, whereText }
  captionCounts: {},    // how often each caption has been shown since the page was opened, by key (for the tests)
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
    'hud', 'hud-objective', 'chip-spools', 'chip-power', 'chip-keycard', 'chip-extra', 'chip-carrying', 'minimap-canvas', 'hud-location',
    'readout-range', 'readout-flight', 'readout-returns', 'readout-heading', 'bar-heat', 'bar-stamina',
    'bar-interference', 'meter-agitation', 'bar-agitation', 'hud-stance', 'hud-block-objective', 'hud-block-map', 'hud-block-instruments', 'hud-readouts',
    'meter-heat', 'meter-stamina', 'meter-interference', 'map-objective', 'map-status', 'reticle-ring', 'hud-prompt', 'hud-countdown', 'hud-messages', 'hud-caption',
    'touch-controls', 'map-overlay', 'map-canvas', 'map-close', 'screen-title', 'screen-intro', 'screen-pause',
    'screen-reader', 'screen-death', 'screen-ending', 'screen-rotate', 'button-play-upright', 'fatal-error', 'title-range', 'title-returns',
    'screen-custom', 'button-custom-difficulty', 'custom-options', 'custom-summary', 'button-custom-done',
    'custom-from-survey', 'custom-from-standard', 'custom-from-nightmare',
    'difficulty-description', 'button-begin', 'intro-lines', 'button-skip-intro', 'pause-objective', 'button-resume',
    'button-pause-restart', 'reader-source', 'reader-heading', 'reader-body', 'button-close-reader', 'death-title',
    'death-lines', 'button-retry', 'button-death-restart', 'ending-stats', 'ending-manifest', 'button-ending-restart',
    'button-ending-uncharted', 'station-options', 'work-order-options', 'station-description', 'pause-station', 'pause-build', 'link-report-problem',
    'title-build', 'link-report-problem-title'
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
  // Which build this is, and "Report a problem", on the title screen and the pause screen. The address is worked
  // out at the moment the link is reached for, so it carries the settings as they are then.
  elements['title-build'].textContent = 'Version: ' + describeBuild();
  for (const link of [elements['link-report-problem-title'], elements['link-report-problem']]) {
    for (const eventName of ['pointerdown', 'focus', 'click']) {
      link.addEventListener(eventName, function () { link.href = buildReportProblemAddress(); });
    }
  }
  elements['button-skip-intro'].addEventListener('click', function () { finishIntro(); });
  elements['button-resume'].addEventListener('click', function () { resumeGame(); });
  elements['button-pause-restart'].addEventListener('click', function () { returnToTitle(); });
  elements['button-close-reader'].addEventListener('click', function () { closeReader(); });
  elements['button-retry'].addEventListener('click', function () { retryFromCheckpoint(); });
  elements['button-death-restart'].addEventListener('click', function () { returnToTitle(); });
  elements['button-ending-restart'].addEventListener('click', function () { returnToTitle(); });
  elements['button-ending-uncharted'].addEventListener('click', function () {
    settings.station = 'generated';
    saveSettings();
    returnToTitle();
    interfaceState.refreshStationControls();
  });
  elements['map-close'].addEventListener('click', function () { toggleMapOverlay(); });
  elements['button-play-upright'].addEventListener('click', function () { allowUprightPlay(); });
  elements['screen-reader'].addEventListener('mousedown', function (event) {
    if (input.isPointerLocked && game.mode === 'reading') { event.preventDefault(); closeReader(); }
  });
  renderer.canvas.addEventListener('mousedown', function () {
    if (game.mode === 'reading' && input.isPointerLocked) closeReader();
    else if (game.mode === 'intro' && input.isPointerLocked) finishIntro();
  });

  // Settings controls appear on more than one screen; keep every copy in step.
  const settingControls = document.querySelectorAll('[data-setting]');
  const refreshSettingControls = function () {
    for (const control of settingControls) control.value = String(settings[control.dataset.setting]);
  };
  for (const control of settingControls) {
    control.addEventListener('input', function () {
      const name = control.dataset.setting;
      // Settings that are words stay words; the rest are numbers.
      if (typeof settings[name] === 'string') settings[name] = control.value;
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
    const isCustom = settings.difficulty === 'custom';
    for (const radio of difficultyInputs) radio.checked = radio.value === settings.difficulty;
    elements['difficulty-description'].textContent = isCustom ? describeCustomDifficulty(settings.customDifficulty) : difficultyDescriptions[settings.difficulty];
    elements['button-custom-difficulty'].hidden = !isCustom;
  };
  for (const radio of difficultyInputs) {
    radio.addEventListener('change', function () {
      if (!radio.checked) return;
      settings.difficulty = radio.value;
      saveSettings();
      refreshDifficulty();
      if (radio.value === 'custom') openCustomDifficultyPanel(); // choosing Custom shows what there is to set
    });
  }
  buildCustomDifficultyPanel(refreshDifficulty);
  refreshDifficulty();

  // Which work orders an uncharted annex may give you: a tick for each (WORK_ORDERS in 09-quests.js). A descent
  // has one of those that are ticked; the seed says which. At least one stays ticked.
  const workOrderInputs = [];
  for (const order of WORK_ORDERS) {
    const label = document.createElement('label');
    label.className = 'pill';
    label.title = order.blurb;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'work-order-' + order.key;
    input.value = order.key;
    const text = document.createElement('span');
    text.textContent = order.label;
    label.appendChild(input);
    label.appendChild(text);
    elements['work-order-options'].appendChild(label);
    workOrderInputs.push(input);
    input.addEventListener('change', function () {
      settings.workOrders[order.key] = input.checked;
      // The last one cannot be switched off: a descent has to be for something.
      if (!workOrderInputs.some(function (other) { return other.checked; })) { settings.workOrders[order.key] = true; }
      saveSettings();
      refreshStationControls();
    });
  }

  // Which station to go down into.
  const stationInputs = document.querySelectorAll('input[name="station"]');
  const refreshStationControls = function () {
    for (const radio of stationInputs) radio.checked = radio.value === settings.station;
    const isGenerated = settings.station === 'generated';
    elements['station-options'].hidden = !isGenerated;
    elements['work-order-options'].hidden = !isGenerated;
    for (const input of workOrderInputs) input.checked = settings.workOrders[input.value] !== false;
    let description = isGenerated
      ? 'No drawings exist. Different on every descent; the same seed gives the same station. (The game is still being built: after an update, a seed may give a different station than it did before.)'
      : 'The annex as it was built. The same every time.';
    // After a run in a generated station, say which one it was, so it can be visited again.
    if (isGenerated) {
      const allowed = getAllowedWorkOrders();
      description += ' A descent has one work order' + (allowed.length === 1 ? ': ' + findWorkOrder(allowed[0]).label + '. ' + findWorkOrder(allowed[0]).blurb : ', one of those ticked.');
    }
    if (isGenerated && level.kind === 'generated') description += ' Last descent: seed ' + level.seed + ' (' + (findWorkOrder(level.workOrder) || WORK_ORDERS[0]).label + ').';
    elements['station-description'].textContent = description;
  };
  for (const radio of stationInputs) {
    radio.addEventListener('change', function () {
      if (radio.checked) { settings.station = radio.value; saveSettings(); refreshStationControls(); }
    });
  }
  refreshStationControls();
  interfaceState.refreshStationControls = refreshStationControls;
}

// ---------------------------------------------------------------------------
// The "Custom" threat level panel. It lies over the title screen; the title screen stays where it is underneath.
// ---------------------------------------------------------------------------

// Builds one row for each of CUSTOM_DIFFICULTY_OPTIONS. `onChange` is called after any value has changed.
function buildCustomDifficultyPanel(onChange) {
  const elements = interfaceState.elements;
  const rows = [];
  // Puts what the settings hold into every row: the control, the value beside it, and the sentence under it.
  const refreshRows = function () {
    const values = settings.customDifficulty, standard = DIFFICULTY_PRESETS.standard;
    for (const row of rows) {
      const value = values[row.option.key];
      if (row.option.kind === 'switch') row.control.checked = value;
      else row.control.value = String(value);
      row.valueElement.textContent = formatCustomDifficultyValue(row.option, value);
      row.noteElement.textContent = explainCustomDifficultyValue(row.option.key, value);
      row.element.classList.toggle('is-changed', value !== standard[row.option.key]); // lit up where it differs from Standard
    }
    elements['custom-summary'].textContent = describeCustomDifficulty(values);
  };
  for (const option of CUSTOM_DIFFICULTY_OPTIONS) {
    const element = document.createElement('div');
    element.className = 'custom-row';
    const label = document.createElement('label');
    label.className = 'custom-label';
    label.textContent = option.label;
    label.htmlFor = 'custom-' + option.key;
    let control;
    if (option.kind === 'choice') {
      control = document.createElement('select');
      for (const choice of option.choices) {
        const choiceElement = document.createElement('option');
        choiceElement.value = String(choice[0]);
        choiceElement.textContent = choice[1];
        control.appendChild(choiceElement);
      }
    } else {
      control = document.createElement('input');
      control.type = option.kind === 'switch' ? 'checkbox' : 'range';
      if (option.kind === 'percent') { control.min = String(option.minimum); control.max = String(option.maximum); control.step = String(option.step); }
    }
    control.id = 'custom-' + option.key;
    const valueElement = document.createElement('span');
    valueElement.className = 'custom-value';
    const noteElement = document.createElement('p');
    noteElement.className = 'custom-note';
    element.appendChild(label); element.appendChild(control); element.appendChild(valueElement); element.appendChild(noteElement);
    elements['custom-options'].appendChild(element);
    rows.push({ option: option, element: element, control: control, valueElement: valueElement, noteElement: noteElement });
    const applyControl = function () {
      const raw = option.kind === 'switch' ? control.checked : Number(control.value);
      settings.customDifficulty[option.key] = sanitizeCustomDifficultyValue(option, raw, settings.customDifficulty[option.key]);
      saveSettings();
      refreshRows();
      onChange();
    };
    control.addEventListener('input', applyControl);
    control.addEventListener('change', applyControl);
  }
  for (const presetKey of ['survey', 'standard', 'nightmare']) {
    elements['custom-from-' + presetKey].addEventListener('click', function () {
      settings.customDifficulty = createCustomDifficultyValues(presetKey);
      saveSettings();
      refreshRows();
      onChange();
    });
  }
  elements['button-custom-difficulty'].addEventListener('click', function () { openCustomDifficultyPanel(); });
  elements['button-custom-done'].addEventListener('click', function () { closeCustomDifficultyPanel(); });
  elements['screen-custom'].addEventListener('keydown', function (event) {
    if (event.code === 'Escape') { event.stopPropagation(); closeCustomDifficultyPanel(); }
  });
  interfaceState.refreshCustomDifficultyRows = refreshRows;
  refreshRows();
}

function openCustomDifficultyPanel() {
  if (game.mode !== 'title') return;
  interfaceState.refreshCustomDifficultyRows();
  interfaceState.elements['screen-custom'].hidden = false;
  interfaceState.elements['screen-custom'].scrollTop = 0; // on a low screen the panel is taller than the window: start at its top
}

function closeCustomDifficultyPanel() {
  interfaceState.elements['screen-custom'].hidden = true;
  interfaceState.elements['button-custom-difficulty'].focus();
}

function showOnlyScreen(screenId) {
  const elements = interfaceState.elements;
  for (const candidate of ['screen-title', 'screen-intro', 'screen-pause', 'screen-reader', 'screen-death', 'screen-ending', 'screen-rotate', 'screen-custom']) {
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
  } else if (surfaceClass === SURFACE_DOOR_AUTOMATIC || surfaceClass === SURFACE_DOOR_POWERED || surfaceClass === SURFACE_DOOR_KEYCARD ||
      surfaceClass === SURFACE_DOOR_KEYCARD_2 || surfaceClass === SURFACE_DOOR_KEYCARD_3) {
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
  for (const interactable of interactables) {
    if (!interactable.isAvailable || !interactable.isDiscovered) continue;
    const markerX = (interactable.x - player.x) * scale + canvas.width / 2;
    const markerY = (interactable.z - player.z) * scale + canvas.height / 2;
    if (markerX < 0 || markerY < 0 || markerX > canvas.width || markerY > canvas.height) continue;
    // Bright for what can be acted on now, dim for the rest (see isInteractableWantedNow).
    context.fillStyle = isInteractableWantedNow(interactable) ? MAP_MARKER_WANTED_COLOUR : MAP_MARKER_OTHER_COLOUR;
    context.fillRect(markerX - 3, markerY - 3, 6, 6);
  }
  if (debugHooks.drawMapMarkers) {
    debugHooks.drawMapMarkers(context,
      function (worldX) { return (worldX - player.x) * scale + canvas.width / 2; },
      function (worldZ) { return (worldZ - player.z) * scale + canvas.height / 2; }, 5);
  }
  drawPlayerMarker(context, canvas.width / 2, canvas.height / 2, player.yaw, 7);
}

// The full map is drawn at 760 by 640 at least, and larger when the screen has room for more. On a small
// screen the style sheet scales that drawing down; on a big one the station is drawn with more pixels per
// metre, where it used to stay a small picture in the middle of the screen.
const FULL_MAP_MINIMUM_WIDTH = 760, FULL_MAP_MINIMUM_HEIGHT = 640;
const FULL_MAP_HEIGHT_KEPT_FREE = 150; // header, objective, legend and padding: the same 150px as in the style sheet

function fitFullMapCanvasToScreen(canvas) {
  const overlay = interfaceState.elements['map-overlay'];
  const overlayStyle = window.getComputedStyle(overlay);
  const canvasBorder = 2;
  const availableWidth = overlay.clientWidth - (parseFloat(overlayStyle.paddingLeft) || 0) - (parseFloat(overlayStyle.paddingRight) || 0) - canvasBorder;
  const availableHeight = window.innerHeight - FULL_MAP_HEIGHT_KEPT_FREE;
  const wantedWidth = Math.max(FULL_MAP_MINIMUM_WIDTH, Math.floor(availableWidth));
  const wantedHeight = Math.max(FULL_MAP_MINIMUM_HEIGHT, Math.floor(availableHeight));
  // Setting the size clears the canvas, so only do it when the size really changes.
  if (canvas.width !== wantedWidth) canvas.width = wantedWidth;
  if (canvas.height !== wantedHeight) canvas.height = wantedHeight;
}

// TWEAK: the colours of the marks on the map. "Wanted" is something you can act on right now.
const MAP_MARKER_WANTED_COLOUR = '#f2a93b';
const MAP_MARKER_OTHER_COLOUR = 'rgba(163, 122, 54, 0.5)';

function drawFullMap() {
  flushMapPixels();
  const canvas = interfaceState.elements['map-canvas'];
  fitFullMapCanvasToScreen(canvas);
  const context = canvas.getContext('2d');
  // Show only the part of the map the station occupies, as large as fits.
  const viewWidth = level.boundsMaximumX - level.boundsMinimumX, viewDepth = level.boundsMaximumZ - level.boundsMinimumZ;
  const scale = Math.min(canvas.width / viewWidth, canvas.height / viewDepth);
  const originX = (canvas.width - viewWidth * scale) / 2 - level.boundsMinimumX * scale;
  const originY = (canvas.height - viewDepth * scale) / 2 - level.boundsMinimumZ * scale;
  const toCanvasX = function (worldX) { return worldX * scale + originX; };
  const toCanvasY = function (worldZ) { return worldZ * scale + originY; };
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#04060a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(interfaceState.mapSourceCanvas,
    level.boundsMinimumX * MAP_PIXELS_PER_METRE, level.boundsMinimumZ * MAP_PIXELS_PER_METRE,
    viewWidth * MAP_PIXELS_PER_METRE, viewDepth * MAP_PIXELS_PER_METRE,
    toCanvasX(level.boundsMinimumX), toCanvasY(level.boundsMinimumZ), viewWidth * scale, viewDepth * scale);
  context.font = '11px "B612 Mono", ui-monospace, monospace';
  context.textAlign = 'center';
  // Zone labels appear once you have stood in the zone.
  const labelPositions = {};
  for (let tileZ = 0; tileZ < GRID_DEPTH; tileZ++) {
    for (let tileX = 0; tileX < GRID_WIDTH; tileX++) {
      const zone = tileZone[tileIndexAt(tileX, tileZ)];
      if (!zone || !interfaceState.visitedZones.has(zone) || level.unlabelledZones.indexOf(zone) >= 0) continue;
      if (!labelPositions[zone]) labelPositions[zone] = { sumX: 0, sumZ: 0, count: 0 };
      labelPositions[zone].sumX += tileX + 0.5; labelPositions[zone].sumZ += tileZ + 0.5; labelPositions[zone].count++;
    }
  }
  context.fillStyle = 'rgba(163, 122, 54, 0.95)';
  for (const zone in labelPositions) {
    const label = labelPositions[zone];
    context.fillText(ZONE_NAMES[zone] || '', toCanvasX(label.sumX / label.count), toCanvasY(label.sumZ / label.count) + 4);
  }
  context.textAlign = 'left';
  for (const interactable of interactables) {
    if (!interactable.isAvailable || !interactable.isDiscovered) continue;
    // Bright, with a full-size mark, for what can be acted on now; dim and smaller for the rest.
    const isWanted = isInteractableWantedNow(interactable), half = isWanted ? 4 : 3;
    context.fillStyle = isWanted ? MAP_MARKER_WANTED_COLOUR : MAP_MARKER_OTHER_COLOUR;
    context.fillRect(toCanvasX(interactable.x) - half, toCanvasY(interactable.z) - half, half * 2, half * 2);
    if (interactable.mapLabel) context.fillText(interactable.mapLabel, toCanvasX(interactable.x) + 8, toCanvasY(interactable.z) + 4);
  }
  if (debugHooks.drawMapMarkers) debugHooks.drawMapMarkers(context, toCanvasX, toCanvasY, 7);
  drawPlayerMarker(context, toCanvasX(player.x), toCanvasY(player.z), player.yaw, 9);
}

function toggleMapOverlay() {
  if (game.mode !== 'playing') return;
  interfaceState.isMapOverlayOpen = !interfaceState.isMapOverlayOpen;
  interfaceState.elements['map-overlay'].hidden = !interfaceState.isMapOverlayOpen;
  if (interfaceState.isMapOverlayOpen) { drawFullMap(); interfaceState.textRefreshTimer = 0; }
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

// ---- captions. What each one says, and who gets to see it, is the table CAPTIONS in 00-config.js. ----

// The eight arrows, clockwise from straight ahead. (On screen it is one arrow, turned: the slanting ones of
// most typefaces are too small to read at a glance. These are what the tests are given.)
const CAPTION_ARROWS = ['\u2191', '\u2197', '\u2192', '\u2198', '\u2193', '\u2199', '\u2190', '\u2196'];

// Whether the "Captions" setting lets captions of this level ('tell' or 'sound') through.
function isCaptionLevelShown(level) {
  return settings.captions === 'all' || (settings.captions === 'tells' && level === 'tell');
}

// Where a sound comes from, the way the player would point at it: which of eight ways (0 is straight ahead of
// them, 2 to their right, 4 behind) and "close", "near" or "far". Something within arm's reach is simply
// "right here", with no direction (-1).
function describeCaptionSource(source) {
  const offsetX = source.x - player.x, offsetZ = source.z - player.z;
  const metres = Math.hypot(offsetX, offsetZ);
  if (metres < 1.2) return { eighth: -1, word: 'right here' };
  const ahead = offsetX * Math.sin(player.yaw) - offsetZ * Math.cos(player.yaw);
  const toTheRight = offsetX * Math.cos(player.yaw) + offsetZ * Math.sin(player.yaw);
  const eighth = (Math.round(Math.atan2(toTheRight, ahead) / (Math.PI / 4)) + 8) % 8;
  return { eighth: eighth, word: metres < TUNING.captionCloseMetres ? 'close' : (metres < TUNING.captionNearMetres ? 'near' : 'far') };
}

function removeCaptionLine(line) {
  line.element.remove();
  const index = interfaceState.captionLines.indexOf(line);
  if (index >= 0) interfaceState.captionLines.splice(index, 1);
}

// Puts a caption on screen, if the "Captions" setting shows captions of its kind and the thing is near enough
// to be heard. `key` is its name in CAPTIONS. `source` is where the sound comes from: anything with an x and
// a z (a figure, a door, a hatch); leave it out for a sound that comes from nowhere in particular. A source
// that moves is followed: its arrow is worked out afresh every frame.
// Calling this again while the line is still up keeps it up, so a sound that goes on (footsteps, a growl) is
// one steady line and not a flicker. Returns whether the caption is now on screen.
function showCaption(key, source) {
  const caption = CAPTIONS[key], container = interfaceState.elements['hud-caption'];
  if (!caption || !container || !isCaptionLevelShown(caption.level)) return false;
  if (source && caption.withinMetres > 0 && distanceBetweenPoints(source.x, source.z, player.x, player.z) > caption.withinMetres) return false;
  const slot = caption.slot || key, rank = caption.rank || 0;
  let line = null;
  for (const existing of interfaceState.captionLines) if (existing.slot === slot) line = existing;
  // Something more telling has this line and has not had its time yet: this one waits.
  if (line && line.key !== key && rank < line.rank && game.time < line.expiresAt) return false;
  if (!line) {
    line = { slot: slot, key: '', rank: 0, source: null, expiresAt: 0, whereText: '',
      element: document.createElement('div'), textElement: document.createElement('span'), whereElement: document.createElement('span'),
      arrowElement: document.createElement('span'), wordElement: document.createElement('span') };
    line.element.className = 'hud-caption-line';
    line.whereElement.className = 'hud-caption-where';
    line.whereElement.setAttribute('aria-hidden', 'true'); // it changes as you turn: not something to read out each time
    line.whereElement.hidden = true;
    line.arrowElement.className = 'hud-caption-arrow';
    line.arrowElement.textContent = CAPTION_ARROWS[0];
    line.whereElement.appendChild(line.arrowElement);
    line.whereElement.appendChild(line.wordElement);
    line.element.appendChild(line.textElement);
    line.element.appendChild(line.whereElement);
    container.appendChild(line.element);
    interfaceState.captionLines.push(line);
    // Too many lines: the one that says least goes, and of those the one that has least time left.
    while (interfaceState.captionLines.length > TUNING.captionMostLines) {
      let weakest = null;
      for (const other of interfaceState.captionLines) {
        if (other !== line && (!weakest || other.rank < weakest.rank || (other.rank === weakest.rank && other.expiresAt < weakest.expiresAt))) weakest = other;
      }
      removeCaptionLine(weakest);
    }
  }
  if (line.key !== key) { line.key = key; line.textElement.textContent = caption.text; }
  line.rank = rank;
  line.source = source || null;
  line.expiresAt = game.time + caption.seconds;
  interfaceState.captionCounts[key] = (interfaceState.captionCounts[key] || 0) + 1;
  return true;
}

// Called every frame: takes down the lines whose time is up, and keeps the arrows pointing the right way.
function updateCaptions() {
  const container = interfaceState.elements['hud-caption'];
  if (!container) return;
  const isEverySound = settings.captions === 'all';
  container.classList.toggle('is-every-sound', isEverySound);
  // A phone held sideways: the captions are a column at the left (see style.css), and in a column the arrow
  // and the distance come before the text. The 480 is the same one as in the stylesheet's "max-height: 480px".
  const isSideColumn = document.body.classList.contains('is-touch') && window.innerHeight <= 480;
  container.classList.toggle('is-side-column', isSideColumn);
  for (let index = interfaceState.captionLines.length - 1; index >= 0; index--) {
    const line = interfaceState.captionLines[index];
    // (The second test: a new descent starts the clock again, and a line left over from the last one must not outstay it.)
    if (game.time > line.expiresAt || line.expiresAt - game.time > 30 || !isCaptionLevelShown(CAPTIONS[line.key].level)) { removeCaptionLine(line); continue; }
    if (isSideColumn !== (line.element.firstChild === line.whereElement)) line.element.insertBefore(line.whereElement, isSideColumn ? line.textElement : null);
    const where = isEverySound && line.source ? describeCaptionSource(line.source) : null;
    const whereText = where ? (where.eighth >= 0 ? CAPTION_ARROWS[where.eighth] + ' ' : '') + where.word : '';
    if (whereText !== line.whereText) {
      line.whereText = whereText;
      line.whereElement.hidden = !where;
      if (where) {
        line.arrowElement.hidden = where.eighth < 0;
        line.arrowElement.style.transform = 'rotate(' + Math.max(0, where.eighth) * 45 + 'deg)';
        line.wordElement.textContent = where.word;
      }
    }
  }
}

function clearCaptions() {
  while (interfaceState.captionLines.length > 0) removeCaptionLine(interfaceState.captionLines[0]);
}

function clearMessages() {
  for (const message of interfaceState.messages) message.element.remove();
  interfaceState.messages.length = 0;
  clearCaptions();
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

// "NO KEYCARD" or "KEYCARD" in a station with one card; "KEYCARDS 1/2" where there are more.
function getKeycardStatusText() {
  if (level.keycardCount > 1) return 'KEYCARDS ' + game.flags.keycardLevel + '/' + level.keycardCount;
  return game.flags.hasKeycard ? 'KEYCARD' : 'NO KEYCARD';
}

// What the extra jobs of this station want shown: "FUEL CAN", "CORES 1/3", "BREAKER OPEN". Empty when there is nothing to say.
function getExtraJobStatusText() {
  return getQuestChips().join(' · ');
}

// ---------------------------------------------------------------------------
// What a thing is worth, floating at the thing
//
// Once the scanner has read a loose thing, what it is worth shows as a small number just above it for a few
// seconds after a pulse last landed on it, then fades. Scan it again and it shows again. Nothing else floats
// at a thing: not its name, and nothing for a thing merely because it is in reach.
// ---------------------------------------------------------------------------

const looseMarkers = {
  container: null,
  elements: [],     // one per marker that can be on screen at once
  chosen: [],       // { object, offCentre }: which things have one just now
  chooseTimer: 0,
  screen: { x: 0, y: 0, isInFront: false }
};

// Where a point of the world is on the screen, in the screen's own pixels, by the renderer's last view.
function projectPointToScreen(x, y, z, result) {
  const matrix = renderer.viewProjectionMatrix;
  const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  result.isInFront = clipW > 0.05;
  if (!result.isInFront) return result;
  result.x = (clipX / clipW * 0.5 + 0.5) * renderer.canvas.clientWidth;
  result.y = (0.5 - clipY / clipW * 0.5) * renderer.canvas.clientHeight;
  return result;
}

// Which things have a marker: read, scanned in the last few seconds, near, on screen and in sight. If there are more
// than may show at once, those nearest to where you look. Looked at a few times a second, not every frame.
function chooseLooseMarkers() {
  const markers = looseMarkers, screen = markers.screen, candidates = [];
  const width = renderer.canvas.clientWidth, height = renderer.canvas.clientHeight;
  for (const object of looseObjects) {
    if (object.isHeld || object.isRemoved || !object.isAppraised || getLooseObjectValue(object) <= 0) continue;
    if (getSecondsSinceLooseObjectScanned(object) >= TUNING.looseMarkerSeconds) continue;
    if (distanceBetweenPoints(object.x, object.z, player.x, player.z) > TUNING.looseMarkerMetres) continue;
    projectPointToScreen(object.x, object.y, object.z, screen);
    if (!screen.isInFront || screen.x < 0 || screen.y < 0 || screen.x > width || screen.y > height) continue;
    // How far from the middle of the view, as a share of its height.
    candidates.push({ object: object, offCentre: Math.hypot(screen.x - width / 2, screen.y - height / 2) / height });
  }
  candidates.sort(function (first, second) { return first.offCentre - second.offCentre; });
  markers.chosen.length = 0;
  for (const candidate of candidates) {
    if (markers.chosen.length >= TUNING.looseMarkersAtOnce) break;
    if (!canPlayerSeePoint(candidate.object.x, candidate.object.y, candidate.object.z)) continue; // behind a wall, a crate, a shelf
    markers.chosen.push(candidate);
  }
}

function updateLooseMarkers(realDt) {
  const markers = looseMarkers;
  if (!markers.container) markers.container = document.getElementById('hud-loose-markers');
  if (!markers.container) return;
  if (game.mode !== 'playing') { markers.chosen.length = 0; markers.chooseTimer = 0; }
  else {
    markers.chooseTimer -= realDt;
    if (markers.chooseTimer <= 0) { markers.chooseTimer = 0.1; chooseLooseMarkers(); }
  }
  let shown = 0;
  for (const marker of markers.chosen) {
    const object = marker.object;
    if (object.isRemoved || object.isHeld) continue;
    // The few seconds may run out between two looks at which things have a marker.
    const secondsLeft = TUNING.looseMarkerSeconds - getSecondsSinceLooseObjectScanned(object);
    if (secondsLeft <= 0) continue;
    const screen = projectPointToScreen(object.x, getLooseObjectTopY(object) + 0.06, object.z, markers.screen);
    if (!screen.isInFront) continue;
    if (shown === markers.elements.length) {
      const created = document.createElement('div');
      created.className = 'loose-marker';
      markers.container.appendChild(created);
      markers.elements.push(created);
    }
    const element = markers.elements[shown++];
    const text = String(getLooseObjectValue(object));
    if (element.textContent !== text) element.textContent = text;
    // Fainter the further off it is, and fading out as its few seconds end.
    const distance = distanceBetweenPoints(object.x, object.z, player.x, player.z);
    const fade = clampNumber(secondsLeft / TUNING.looseMarkerFadeSeconds, 0, 1);
    element.style.opacity = ((1 - 0.6 * clampNumber(distance / TUNING.looseMarkerMetres, 0, 1)) * fade).toFixed(2);
    element.style.transform = 'translate(' + screen.x.toFixed(1) + 'px, ' + screen.y.toFixed(1) + 'px) translate(-50%, -100%)';
    element.hidden = false;
  }
  for (let index = shown; index < markers.elements.length; index++) markers.elements[index].hidden = true;
}

function updateHud(realDt) {
  const elements = interfaceState.elements;
  updateLooseMarkers(realDt);
  const now = game.realTime;
  for (let index = interfaceState.messages.length - 1; index >= 0; index--) {
    if (now > interfaceState.messages[index].expiresAt) {
      interfaceState.messages[index].element.remove();
      interfaceState.messages.splice(index, 1);
    }
  }
  updateCaptions();

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

  // ---- the quiet screen: every instrument is hidden until it has something to say ----
  // TWEAK: the numbers are when each one appears. Choose "Full instruments" in the settings to see them all, always.
  const isQuiet = settings.hud === 'quiet';
  const statusSignature = game.objectiveText + '|' + game.flags.spoolsCollected + '|' + game.flags.powerOn + '|' + game.flags.keycardLevel + '|' + getExtraJobStatusText();
  if (statusSignature !== interfaceState.lastStatusSignature) {
    interfaceState.lastStatusSignature = statusSignature;
    interfaceState.objectiveShownUntil = now + 8; // the objective and the three chips show for 8 s when any of them changes
  }
  const setShown = function (elementId, isShown) { elements[elementId].classList.toggle('is-faded', !isShown); };
  setShown('hud-block-objective', !isQuiet || now < interfaceState.objectiveShownUntil);
  setShown('hud-block-map', !isQuiet);              // the map is on Tab / M
  setShown('hud-readouts', !isQuiet);               // range, time of flight, returns, heading
  setShown('meter-heat', !isQuiet || player.heat > 0.3 || player.isOverheated);
  setShown('meter-stamina', !isQuiet || player.stamina < 0.97);
  setShown('meter-interference', !isQuiet);         // you can hear and see interference
  setShown('hud-stance', !isQuiet || player.isInVent);
  // The panel they sit in goes too when none of them is showing, so no empty box is left on screen.
  const hasMetHollowYet = hollow.isActive && hollow.figure.totalHits > 0;
  setShown('hud-block-instruments', !isQuiet || player.heat > 0.3 || player.isOverheated || player.stamina < 0.97 || player.isInVent ||
    (hasMetHollowYet && hollow.anger >= 0.04));

  elements['bar-heat'].style.width = (player.heat * 100).toFixed(1) + '%';
  elements['bar-heat'].classList.toggle('is-critical', player.isOverheated || player.heat > 0.8);
  elements['bar-stamina'].style.width = (player.stamina * 100).toFixed(1) + '%';
  elements['bar-stamina'].classList.toggle('is-critical', player.isStaminaLocked);
  elements['bar-interference'].style.width = (Math.min(1, game.interference) * 100).toFixed(1) + '%';
  // The agitation bar appears the first time the beam touches the Hollow. It is the Hollow's anger:
  // amber while a touch only makes it turn, red once the beam is giving your position away.
  const hasMetHollow = hollow.isActive && hollow.figure.totalHits > 0;
  elements['meter-agitation'].hidden = !hasMetHollow || (isQuiet && hollow.anger < 0.04);
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
  // The ring is where the scanner points, and that trails a little behind the middle of what you see.
  const scannerInView = computeHeldScannerInView();
  const pixelsPerTangent = (viewHeight / 2) / Math.tan(fieldOfView / 2);
  ring.parentElement.style.transform = 'translate(' + (-scannerInView[6] / scannerInView[8] * pixelsPerTangent).toFixed(1) + 'px, ' +
    (scannerInView[7] / scannerInView[8] * pixelsPerTangent).toFixed(1) + 'px)';
  ring.classList.toggle('is-overheated', player.isOverheated);

  interfaceState.textRefreshTimer -= realDt;
  if (interfaceState.textRefreshTimer <= 0) {
    interfaceState.textRefreshTimer = 0.1;
    elements['hud-objective'].textContent = game.objectiveText;
    // The spools have a place of their own on screen where they are what you came for. On any other work order
    // the place is empty until you take one anyway, and then says how many you hold and no more.
    const spools = game.flags.spoolsCollected, areWanted = areSpoolsOnTheOrder();
    elements['chip-spools'].hidden = !areWanted && spools === 0;
    elements['chip-spools'].textContent = areWanted ? 'SPOOLS ' + spools + '/' + level.spoolCount : 'SPOOLS ' + spools;
    elements['chip-spools'].classList.toggle('is-on', areWanted && spools >= level.spoolCount);
    elements['chip-power'].textContent = game.flags.powerOn ? 'MAINS ON' : 'MAINS OFF';
    elements['chip-power'].classList.toggle('is-on', game.flags.powerOn);
    elements['chip-keycard'].textContent = getKeycardStatusText();
    elements['chip-keycard'].classList.toggle('is-on', game.flags.hasKeycard);
    const extraText = getExtraJobStatusText();
    elements['chip-extra'].hidden = extraText === '';
    elements['chip-extra'].textContent = extraText;
    const carried = getHeldLooseObject();
    elements['chip-carrying'].hidden = carried === null;
    if (carried !== null) elements['chip-carrying'].textContent = 'CARRYING: ' + getLooseObjectLabel(carried).toUpperCase() + (getLooseObjectWorth(carried) > 0 ? ' · ' + getLooseObjectWorth(carried) : '');
    // On a phone held sideways the captions hang under the work order (see style.css), and the work order
    // is as tall as its sentence is long: the stylesheet is told where it ends.
    const workOrderBlock = elements['hud-block-objective'];
    const workOrderBottom = workOrderBlock.offsetTop + workOrderBlock.offsetHeight;
    if (workOrderBottom !== interfaceState.workOrderBottom) {
      interfaceState.workOrderBottom = workOrderBottom;
      elements['hud-caption'].style.setProperty('--work-order-bottom', workOrderBottom + 'px');
    }

    const zone = getZoneAtPosition(player.x, player.z);
    if (zone) interfaceState.visitedZones.add(zone);
    elements['hud-location'].textContent = ZONE_NAMES[zone] || ZONE_NAMES[0];
    // The map screen always carries the objective and where things stand, whatever the screen setting.
    if (interfaceState.isMapOverlayOpen) {
      elements['map-objective'].textContent = game.objectiveText;
      elements['map-status'].textContent = 'SPOOLS ' + spools + '/3 · ' + (game.flags.powerOn ? 'MAINS ON' : 'MAINS OFF') + ' · ' +
        getKeycardStatusText() + (extraText ? ' · ' + extraText : '') + ' · ' + (ZONE_NAMES[zone] || ZONE_NAMES[0]);
    }

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
    if (player.isInVent) stance = player.isMoving ? 'IN A VENT · LOUD' : 'IN A VENT · STILL';
    else if (player.isCrouching) stance = player.isMoving ? 'CROUCHED · QUIET' : 'CROUCHED · STILL · NEARLY SILENT';
    else if (player.isSprinting) stance = 'SPRINTING · LOUD';
    elements['hud-stance'].textContent = stance;

    const prompt = elements['hud-prompt'];
    const focused = player.focusedInteractable;
    const focusedLooseObject = player.focusedLooseObject, heldLooseObject = getHeldLooseObject();
    // Something in the beam that does something, and has not done it yet: on a phone a button for it appears.
    const canSetOffCarried = game.mode === 'playing' && heldLooseObject !== null && Boolean(heldLooseObject.kind.use) && !heldLooseObject.isSpent && heldLooseObject.armedTime < 0;
    const carriedButton = document.getElementById('touch-use-carried');
    if (carriedButton) {
      carriedButton.hidden = !(input.isTouchDevice && canSetOffCarried);
      if (canSetOffCarried) carriedButton.textContent = heldLooseObject.kind.use.button || 'USE IT';
    }
    if (game.mode === 'playing' && heldLooseObject && getThrowWindUp() > 0) {
      // Winding up a throw: a bar that fills.
      const filled = Math.round(getThrowWindUp() * 8);
      prompt.hidden = false;
      prompt.textContent = 'THROW  ' + '\u25AE'.repeat(filled) + '\u25AF'.repeat(8 - filled);
    } else if (game.mode === 'playing' && focusedLooseObject && !heldLooseObject && !settings.hasPickedSomethingUp) {
      // A tutorial: how to pick a thing up is said until you have done it once, and never again.
      prompt.hidden = false;
      prompt.textContent = (input.isTouchDevice ? 'USE · ' : '[E] or hold [Right mouse]  ') + 'Pick up the ' + getLooseObjectLabel(focusedLooseObject);
    } else if (game.mode === 'playing' && focused) {
      prompt.hidden = false;
      prompt.textContent = (input.isTouchDevice ? 'USE · ' : '[E]  ') + focused.prompt;
    } else if (canSetOffCarried) {
      // In the beam, and it does something: say which key, or which button.
      prompt.hidden = false;
      prompt.textContent = (input.isTouchDevice ? (heldLooseObject.kind.use.button || 'USE IT') + ' · ' : '[Q]  ') + heldLooseObject.kind.use.prompt;
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

// `heading` replaces the entry's own heading when one is given.
function openReader(entry, heading) {
  const elements = interfaceState.elements;
  elements['reader-source'].textContent = entry.source;
  elements['reader-heading'].textContent = heading || entry.heading;
  const body = elements['reader-body'];
  body.textContent = '';
  for (const paragraphText of entry.paragraphs) {
    const paragraph = document.createElement('p');
    paragraph.textContent = paragraphText.replace('{keycardRoom}', level.keycardRoomText);
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
  // One life (a custom threat level can ask for it): there is no checkpoint to go back to.
  if (!game.difficulty.checkpointsEnabled) {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'One life. This descent is over.';
    lines.appendChild(paragraph);
  }
  elements['button-retry'].hidden = !game.difficulty.checkpointsEnabled;
  setHudVisible(false);
  closeMapOverlay();
  showOnlyScreen('screen-death');
}

// What build this is, as the pause and ending screens show it: "1.11.0 · build 214 · a5f1785".
// BUILD_STAMP is written by build.js; a part it could not find out is left off.
function describeBuild() {
  const parts = [];
  if (BUILD_STAMP.version) parts.push(BUILD_STAMP.version);
  if (BUILD_STAMP.number) parts.push('build ' + BUILD_STAMP.number);
  if (BUILD_STAMP.commit) parts.push(BUILD_STAMP.commit);
  if (BUILD_STAMP.isDevBuild) parts.push('dev');
  return parts.length > 0 ? parts.join(' · ') : 'unknown';
}

// The address "Report a problem" on the title screen and the pause screen opens: the bug form in .github/ISSUE_TEMPLATE/1-bug.yml,
// with what the game knows already filled in. Each name here is the `id` of a field in that form, so a field
// renamed there must be renamed here. GitHub fills in text fields only, never a list to pick from, which is why
// those fields are text in the form. Nothing is sent anywhere: the player sees the form and decides.
// What the server this page came from calls itself, such as "Official server", or '' if it does not say.
// A server says it by filling in the page's `last-return-server` line (see docker/40-server-name.sh).
function readServerName() {
  const tag = document.querySelector('meta[name="last-return-server"]');
  return tag ? tag.content.trim().slice(0, 40) : '';
}

// Where this page came from, as far as a page can tell: the dev build, a file opened from disk, a server on this
// computer (which is also what Docker looks like), or a page online. Only the host and the path are given, and
// for a file nothing at all, because its path has the player's user name in it. A server that names itself goes
// in front, and what the page can tell still follows, because a page saved from that server keeps the name.
function describeHowThePageIsServed() {
  if (BUILD_STAMP.isDevBuild) return 'The dev build (npm run dev)';
  const protocol = window.location.protocol, host = window.location.host;
  let served = 'Online at ' + host + window.location.pathname;
  if (protocol === 'file:') served = 'index.html opened from disk';
  else if (protocol !== 'http:' && protocol !== 'https:') served = 'Inside another page';
  else if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) served = 'Served from this computer (' + host + ')';
  const serverName = readServerName();
  return serverName ? serverName + ' · ' + served : served;
}

const REPORT_PROBLEM_ADDRESS = 'https://github.com/StefanKnol/Last-Return/issues/new';
function buildReportProblemAddress() {
  // From the title screen there is no descent to describe: the threat level is the one chosen there, and there
  // is no room. A generated station stays loaded after a descent, so its seed is still given, as the last one.
  const isOnTitleScreen = game.mode === 'title';
  const isGenerated = level.kind === 'generated';
  const difficulty = isOnTitleScreen ? getChosenDifficulty() : game.difficulty;
  const fields = {
    template: '1-bug.yml',
    version: describeBuild(),
    station: isOnTitleScreen ? 'Title screen' + (isGenerated ? ', after a descent into an Uncharted annex' : '') : (isGenerated ? 'Uncharted annex' : 'Kessel-9'),
    threat: difficulty.isCustom ? difficulty.label + ': ' + difficulty.description : difficulty.label,
    quality: settings.quality.charAt(0).toUpperCase() + settings.quality.slice(1),
    device: navigator.userAgent,
    build: describeHowThePageIsServed()
  };
  if (!isOnTitleScreen) fields.where = ZONE_NAMES[getZoneAtPosition(player.x, player.z)] + ' (x ' + player.x.toFixed(1) + ', z ' + player.z.toFixed(1) + ')';
  // (The seed alone does not say what a descent asked for: that also hangs on which work orders were ticked.)
  if (isGenerated) {
    fields.seed = [level.seed, level.sizeKey, level.layoutKey, level.levelsKey === 'two' ? 'two levels' : 'one level',
      'work order ' + (findWorkOrder(level.workOrder) || WORK_ORDERS[0]).label, level.liftWaits ? 'with the wait for the lift' : 'no wait for the lift'].join(', ');
  }
  return REPORT_PROBLEM_ADDRESS + '?' + new URLSearchParams(fields).toString();
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
  if (game.difficulty.isCustom) addRow('Custom settings', game.difficulty.description);
  addRow('Station', level.description);
  addRow('Work order', (findWorkOrder(level.workOrder) || WORK_ORDERS[0]).label);
  addRow('Build', describeBuild());
  if (debugState.hasBeenUsedThisRun) addRow('Debug mode', 'used, so this run sets no best time');
  if (game.statistics.bestTime !== null) addRow('Best time', formatClockTime(game.statistics.bestTime));
  const manifest = elements['ending-manifest'];
  manifest.textContent = '';
  manifest.appendChild(document.createTextNode('Upload manifest: ' + describeUploadManifest() + '. Automatic classification of objects in the car: 1 operator. '));
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
