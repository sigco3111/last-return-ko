// ---------------------------------------------------------------------------
// The workshop: tools for building the game. Not part of the game.
//
// Everything in src/dev/ is only in the page made by `npm run dev` (or `node build.js --dev`);
// none of it reaches index.html. It runs after the game has started, inside the same script,
// so it uses the game's own world, renderer, figures and scanner: what you see here is what
// the game will do with the same numbers.
//
//   20-workshop.js            this file: the panel, the camera, saving, reloading when the source changes
//   21-workshop-rooms.js      the room tool
//   22-workshop-creatures.js  the creature tool
//
// The workshop runs as its own game mode ('workshop', see runFrame in 11-game.js). To get back to the
// game the page is simply loaded again, so nothing here has to tidy up after itself.
// ---------------------------------------------------------------------------

const WORKSHOP_STORAGE_KEY = 'no-return-workshop';
// Where on the (otherwise empty) map the room being worked on is put: its north-west corner.
const WORKSHOP_ORIGIN_X = 40, WORKSHOP_ORIGIN_Z = 40;
const WORKSHOP_FLY_SPEED = 3.5;        // metres per second
const WORKSHOP_FLY_SPEED_FAST = 11;    // with Shift held
const WORKSHOP_SCAN_RAYS_PER_FRAME = 3500;  // "lights off": pulses fired across the whole view every frame
const WORKSHOP_SCAN_RAYS_AT_ONCE = 45000;   // and at once after the world has been rebuilt

const workshop = {
  isOpen: false,
  tool: 'rooms',
  tools: {},             // the tools register themselves here (see the end of their files)
  isLit: true,           // lights on: the station is drawn. Off: only what the scanner returns, as in the game.
  isWalking: false,      // off: fly. On: walk on the floor with the game's own collision.
  hasServer: false,      // the dev server is answering, so things can be saved into src/
  buildNumber: null,
  stored: null,          // everything that survives a reload (see loadWorkshopState)
  hasUnsavedState: false,
  stateSaveTimer: 0,
  panelElement: null, bodyElement: null, statusElement: null, bannerElement: null, tabElements: {},
  statusSecondsLeft: 0,
  isLooking: false,      // right mouse button held: the mouse turns the camera
  needsScanBurst: false,
  mouseRay: { originX: 0, originY: 0, originZ: 0, directionX: 0, directionY: 0, directionZ: -1 }
};

// ---------------------------------------------------------------------------
// What survives a reload
// ---------------------------------------------------------------------------

// The page reloads itself every time the source changes, so everything worth keeping is written to the
// browser's storage: which tool was open, where the camera was, and any work that is not saved to a file yet.
function loadWorkshopState() {
  let stored = null;
  try { stored = JSON.parse(window.localStorage.getItem(WORKSHOP_STORAGE_KEY) || 'null'); } catch (error) { /* start fresh */ }
  if (!stored || typeof stored !== 'object') stored = {};
  if (typeof stored.isOpen !== 'boolean') stored.isOpen = false;
  if (!workshop.tools[stored.tool]) stored.tool = 'rooms';
  if (typeof stored.isLit !== 'boolean') stored.isLit = true;
  if (!stored.cameras || typeof stored.cameras !== 'object') stored.cameras = {};
  for (const toolKey in workshop.tools) {
    if (!stored[toolKey] || typeof stored[toolKey] !== 'object') stored[toolKey] = {};
  }
  return stored;
}

function saveWorkshopState() {
  if (!workshop.stored) return;
  if (workshop.isOpen) {
    workshop.stored.tool = workshop.tool;
    workshop.stored.isLit = workshop.isLit;
    workshop.stored.cameras[workshop.tool] = { x: player.x, z: player.z, eyeHeight: player.eyeHeight, yaw: player.yaw, pitch: player.pitch };
    workshop.tools[workshop.tool].storeState(workshop.stored[workshop.tool]);
  }
  try { window.localStorage.setItem(WORKSHOP_STORAGE_KEY, JSON.stringify(workshop.stored)); } catch (error) { /* storage is optional */ }
  workshop.hasUnsavedState = false;
}

// Call after any change worth keeping; it is written out a moment later.
function markWorkshopStateChanged() {
  workshop.hasUnsavedState = true;
}

// ---------------------------------------------------------------------------
// The dev server: saving, and reloading when the source changes
// ---------------------------------------------------------------------------

function setWorkshopStatus(text, kind) {
  if (!workshop.statusElement) return;
  workshop.statusElement.textContent = text;
  workshop.statusElement.className = 'workshop-status is-' + (kind || 'info');
  workshop.statusElement.hidden = false;
  workshop.statusSecondsLeft = kind === 'warning' ? 9 : 5;
}

function showWorkshopBanner(text) {
  workshop.bannerElement.textContent = text || '';
  workshop.bannerElement.hidden = !text;
}

// Asks the dev server to do something. Resolves with its answer, rejects with an Error that says what went wrong.
function callWorkshopServer(path, body) {
  return window.fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Workshop': '1' },
    body: JSON.stringify(body)
  }).then(function (response) {
    return response.json().then(function (result) {
      if (!response.ok) throw new Error(result.error || 'The dev server said no (' + response.status + ').');
      return result;
    });
  });
}

function connectToWorkshopServer() {
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return; // opened as a file
  if (!window.EventSource) return;
  const events = new window.EventSource('/dev/events');
  const reloadWhenSafe = function () {
    // Mid-game, a reload would throw the run away: say so instead and let the player decide.
    if (workshop.isOpen || game.mode === 'title') { saveWorkshopState(); window.location.reload(); }
    else showWorkshopBanner('The source has changed. Reload the page to see it.');
  };
  events.addEventListener('hello', function (event) {
    const data = JSON.parse(event.data);
    const hadServer = workshop.hasServer;
    workshop.hasServer = true;
    if (workshop.buildNumber === null) workshop.buildNumber = data.build;
    else if (data.build !== workshop.buildNumber && !data.problem) { reloadWhenSafe(); return; }
    showWorkshopBanner(data.problem ? 'Build failed, still showing the last good one. ' + data.problem : '');
    if (!hadServer && workshop.isOpen) renderWorkshopPanel();
  });
  events.addEventListener('reload', reloadWhenSafe);
  events.addEventListener('problem', function (event) {
    showWorkshopBanner('Build failed, still showing the last good one. ' + JSON.parse(event.data).text);
  });
  events.onerror = function () {
    if (!workshop.hasServer) return;
    workshop.hasServer = false;
    if (workshop.isOpen) { renderWorkshopPanel(); setWorkshopStatus('The dev server has stopped. Nothing can be saved until `npm run dev` runs again.', 'warning'); }
  };
}

// Offers a text as a file to download: the way out when there is no dev server to save through.
function downloadWorkshopFile(fileName, text) {
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(new window.Blob([text], { type: 'application/json' }));
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(function () { window.URL.revokeObjectURL(link.href); }, 2000);
}

function copyWorkshopText(text, whatItIs) {
  const fallBack = function () { window.prompt('Copy this ' + whatItIs + ':', text); };
  if (!window.navigator.clipboard || !window.navigator.clipboard.writeText) { fallBack(); return; }
  window.navigator.clipboard.writeText(text).then(function () {
    setWorkshopStatus('Copied the ' + whatItIs + '.', 'good');
  }, fallBack);
}

// ---------------------------------------------------------------------------
// Small pieces every tool's panel is made of
// ---------------------------------------------------------------------------

function addWorkshopHeading(container, text) {
  return container.appendChild(createDebugElement('h3', 'debug-heading', text));
}

function addWorkshopNote(container, text) {
  return container.appendChild(createDebugElement('p', 'debug-note', text));
}

function addWorkshopRow(container) {
  return container.appendChild(createDebugElement('div', 'workshop-row'));
}

function addWorkshopButton(container, label, onClick, hint) {
  const button = createDebugElement('button', 'button-quiet', label);
  button.type = 'button';
  if (hint) button.title = hint;
  // Let go of the keyboard afterwards, or Space (the scanner) would press the button again.
  button.addEventListener('click', function () { button.blur(); onClick(); });
  container.appendChild(button);
  return button;
}

function formatWorkshopNumber(value) {
  return String(Math.round(value * 10000) / 10000);
}

// A number with a slider and a box to type in. `onInput` is called with every new value, while dragging too.
// Returns { setValue }, for when something else (dragging the thing in the view) changes the number.
function addWorkshopNumber(container, label, value, minimum, maximum, step, onInput) {
  const row = createDebugElement('label', 'workshop-field');
  row.appendChild(createDebugElement('span', '', label));
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(minimum); slider.max = String(maximum); slider.step = String(step);
  slider.value = String(value);
  const box = document.createElement('input');
  box.type = 'number';
  box.min = String(minimum); box.max = String(maximum); box.step = String(step);
  box.value = formatWorkshopNumber(value);
  slider.addEventListener('input', function () {
    box.value = formatWorkshopNumber(Number(slider.value));
    onInput(Number(slider.value));
  });
  slider.addEventListener('change', function () { slider.blur(); }); // so W A S D go back to the camera
  box.addEventListener('input', function () {
    if (box.value === '' || !Number.isFinite(Number(box.value))) return;
    const typed = clampNumber(Number(box.value), minimum, maximum);
    slider.value = String(typed);
    onInput(typed);
  });
  box.addEventListener('change', function () { box.value = formatWorkshopNumber(clampNumber(Number(box.value) || 0, minimum, maximum)); });
  box.addEventListener('keydown', function (event) { if (event.code === 'Enter' || event.code === 'Escape') box.blur(); });
  row.appendChild(slider);
  row.appendChild(box);
  container.appendChild(row);
  return {
    element: row,
    setValue: function (newValue) { slider.value = String(newValue); box.value = formatWorkshopNumber(newValue); }
  };
}

function addWorkshopCheckbox(container, label, isChecked, onChange, hint) {
  const row = createDebugElement('label', 'debug-option');
  if (hint) row.title = hint;
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = isChecked;
  checkbox.addEventListener('change', function () { checkbox.blur(); onChange(checkbox.checked); });
  row.appendChild(checkbox);
  row.appendChild(createDebugElement('span', '', label));
  container.appendChild(row);
  return checkbox;
}

// `choices` is a list of [value, label], or of [groupLabel, [[value, label], ...]] to group them under headings.
function fillWorkshopSelect(select, choices, value) {
  select.textContent = '';
  const addOption = function (parent, choice) {
    const option = document.createElement('option');
    option.value = String(choice[0]);
    option.textContent = choice[1];
    parent.appendChild(option);
  };
  for (const choice of choices) {
    if (Array.isArray(choice[1])) {
      if (choice[1].length === 0) continue;
      const group = document.createElement('optgroup');
      group.label = choice[0];
      for (const inner of choice[1]) addOption(group, inner);
      select.appendChild(group);
    } else addOption(select, choice);
  }
  select.value = String(value);
}

function addWorkshopSelect(container, label, value, choices, onChange) {
  const row = createDebugElement('label', 'workshop-field workshop-field-wide');
  if (label) row.appendChild(createDebugElement('span', '', label));
  const select = document.createElement('select');
  fillWorkshopSelect(select, choices, value);
  select.addEventListener('change', function () { select.blur(); onChange(select.value); });
  row.appendChild(select);
  container.appendChild(row);
  return select;
}

function addWorkshopText(container, label, value, onInput, maximumLength) {
  const row = createDebugElement('label', 'workshop-field workshop-field-wide');
  row.appendChild(createDebugElement('span', '', label));
  const box = document.createElement('input');
  box.type = 'text';
  box.value = value;
  box.maxLength = maximumLength || 60;
  box.spellcheck = false;
  box.autocomplete = 'off';
  box.addEventListener('input', function () { onInput(box.value); });
  box.addEventListener('keydown', function (event) { if (event.code === 'Enter' || event.code === 'Escape') box.blur(); });
  row.appendChild(box);
  container.appendChild(row);
  return box;
}

// ---------------------------------------------------------------------------
// The world a tool works in
// ---------------------------------------------------------------------------

// Empties the map and everything that lives on it, ready for a tool to build its own small world.
// The tool then carves and furnishes, and calls finishWorkshopWorld.
function prepareWorkshopWorld(description) {
  resetWorldForNewLevel();
  stillSpawnPoints.length = 0; lateStillSpawnPoints.length = 0; phantomDefinitions.length = 0;
  stills.length = 0; phantoms.length = 0;
  stillsAreHunting = false;
  raycastableFigures.length = 0;
  hollow.isActive = false;
  liftDoor = null;
  level.kind = 'generated';
  level.seed = 0;
  level.description = description;
  level.storeZone = 0;
  level.stillZones.length = 0;
  level.unlabelledZones.length = 0;
  level.roomCount = 1; level.loopCount = 0; level.stairCount = 0;
  relocatedObjectives.spool1 = false; relocatedObjectives.keycard = false;
  game.scheduledEvents.length = 0;
  ZONE_NAMES.length = 0;
  placement.isGenerating = true; // rooms are placed the way a generated station places them
}

function finishWorkshopWorld() {
  placement.isGenerating = false;
  clearPlacement();
  computeNavigationGrid();
  computeLevelBounds();
  uploadWorldOccluderMesh(buildWorldOccluderVertices());
  // Points left by the scanner belong to the world as it was a moment ago.
  clearAllPoints();
  workshop.needsScanBurst = true;
}

// Fires scanner pulses from the camera, spread evenly over a rectangle of the view.
// The rectangle is given in tangents: (0, 0) is the middle of the view.
function fireWorkshopScan(rayCount, centerHorizontal, centerVertical, halfWidth, halfHeight) {
  computeScannerBasis(player.yaw, player.pitch);
  const eyeY = getPlayerEyeY();
  for (let rayIndex = 0; rayIndex < rayCount; rayIndex++) {
    fireScannerPulse(player.x, eyeY, player.z,
      centerHorizontal + (Math.random() * 2 - 1) * halfWidth, centerVertical + (Math.random() * 2 - 1) * halfHeight, false);
  }
}

function getWorkshopViewTangents() {
  const canvas = renderer.canvas;
  const vertical = Math.tan(getPlayFieldOfViewDegrees() * DEGREES_TO_RADIANS / 2);
  return { vertical: vertical, horizontal: vertical * canvas.clientWidth / Math.max(1, canvas.clientHeight) };
}

// The ray from the camera through the mouse, left in workshop.mouseRay.
function computeWorkshopMouseRay(event) {
  const bounds = renderer.canvas.getBoundingClientRect();
  const tangents = getWorkshopViewTangents();
  const horizontal = (((event.clientX - bounds.left) / bounds.width) * 2 - 1) * tangents.horizontal;
  const vertical = (1 - ((event.clientY - bounds.top) / bounds.height) * 2) * tangents.vertical;
  computeScannerBasis(player.yaw, player.pitch);
  const basis = scannerBasis, ray = workshop.mouseRay;
  let directionX = basis.forwardX + basis.rightX * horizontal + basis.upX * vertical;
  let directionY = basis.forwardY + basis.rightY * horizontal + basis.upY * vertical;
  let directionZ = basis.forwardZ + basis.rightZ * horizontal + basis.upZ * vertical;
  const length = Math.sqrt(directionX * directionX + directionY * directionY + directionZ * directionZ);
  ray.originX = player.x; ray.originY = getPlayerEyeY(); ray.originZ = player.z;
  ray.directionX = directionX / length; ray.directionY = directionY / length; ray.directionZ = directionZ / length;
  return ray;
}

// How far along a ray it meets a shape (a prop, or anything laid out like one). Negative: it does not.
function intersectWorkshopRayWithShape(ray, shape) {
  if (shape.kind === PROP_KIND_BOX) return intersectRayWithBox(shape, ray.originX, ray.originY, ray.originZ, ray.directionX, ray.directionY, ray.directionZ);
  if (shape.kind === PROP_KIND_CYLINDER) return intersectRayWithCylinder(shape, ray.originX, ray.originY, ray.originZ, ray.directionX, ray.directionY, ray.directionZ);
  return intersectRayWithSphere(shape.centerX, shape.centerY, shape.centerZ, shape.radius, ray.originX, ray.originY, ray.originZ, ray.directionX, ray.directionY, ray.directionZ);
}

// A box that is only there to be clicked on or outlined, laid out like a box prop.
function createWorkshopBoxShape(minimumX, minimumY, minimumZ, maximumX, maximumY, maximumZ) {
  return {
    kind: PROP_KIND_BOX,
    centerX: (minimumX + maximumX) / 2, centerY: (minimumY + maximumY) / 2, centerZ: (minimumZ + maximumZ) / 2,
    halfX: (maximumX - minimumX) / 2, halfY: (maximumY - minimumY) / 2, halfZ: (maximumZ - minimumZ) / 2,
    boundsHalfX: (maximumX - minimumX) / 2, boundsHalfZ: (maximumZ - minimumZ) / 2,
    minimumY: minimumY, maximumY: maximumY, cosineYaw: 1, sineYaw: 0
  };
}

// The twelve edges of a box, as debug lines.
function pushWorkshopBoxLines(minimumX, minimumY, minimumZ, maximumX, maximumY, maximumZ, red, green, blue) {
  for (const y of [minimumY, maximumY]) {
    pushDebugLine(minimumX, y, minimumZ, maximumX, y, minimumZ, red, green, blue);
    pushDebugLine(maximumX, y, minimumZ, maximumX, y, maximumZ, red, green, blue);
    pushDebugLine(maximumX, y, maximumZ, minimumX, y, maximumZ, red, green, blue);
    pushDebugLine(minimumX, y, maximumZ, minimumX, y, minimumZ, red, green, blue);
  }
  for (const corner of [[minimumX, minimumZ], [maximumX, minimumZ], [maximumX, maximumZ], [minimumX, maximumZ]]) {
    pushDebugLine(corner[0], minimumY, corner[1], corner[0], maximumY, corner[1], red, green, blue);
  }
}

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

// In the workshop the "player" is just a camera. This puts it somewhere, looking some way.
function placeWorkshopCamera(x, height, z, yaw, pitch) {
  player.x = x; player.z = z;
  player.floorY = 0; player.eyeHeight = height;
  player.yaw = wrapAngleToPi(yaw); player.pitch = clampNumber(pitch, -1.5, 1.5);
  player.velocityX = 0; player.velocityZ = 0;
  player.bobPhase = 0;
}

function restoreWorkshopCamera(toolKey) {
  const camera = workshop.stored.cameras[toolKey];
  if (!camera || !Number.isFinite(camera.x + camera.z + camera.eyeHeight + camera.yaw + camera.pitch)) return false;
  placeWorkshopCamera(camera.x, camera.eyeHeight, camera.z, camera.yaw, camera.pitch);
  return true;
}

// Turning with the right mouse button (or the arrow keys are left to the tools), flying with W A S D, E up, Q down.
function updateWorkshopFlight(dt) {
  const keys = input.keysDown;
  const lookScale = 0.0021 * settings.sensitivity;
  player.yaw = wrapAngleToPi(player.yaw + input.lookDeltaX * lookScale);
  player.pitch = clampNumber(player.pitch - input.lookDeltaY * lookScale, -1.5, 1.5);
  input.lookDeltaX = 0; input.lookDeltaY = 0;
  const forwardInput = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const strafeInput = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const riseInput = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? WORKSHOP_FLY_SPEED_FAST : WORKSHOP_FLY_SPEED;
  const cosinePitch = Math.cos(player.pitch);
  const forwardX = Math.sin(player.yaw) * cosinePitch, forwardY = Math.sin(player.pitch), forwardZ = -Math.cos(player.yaw) * cosinePitch;
  player.x += (forwardX * forwardInput + Math.cos(player.yaw) * strafeInput) * speed * dt;
  player.z += (forwardZ * forwardInput + Math.sin(player.yaw) * strafeInput) * speed * dt;
  player.x = clampNumber(player.x, 1, GRID_WIDTH - 1); player.z = clampNumber(player.z, 1, GRID_DEPTH - 1);
  player.floorY = 0;
  player.eyeHeight = clampNumber(player.eyeHeight + (forwardY * forwardInput + riseInput) * speed * dt, -6, 40);
  player.velocityX = 0; player.velocityZ = 0; player.bobPhase = 0;
  player.isMoving = false; player.isSprinting = false; player.isCrouching = false;
}

// True when the camera is in the open part of the map: over a carved tile, between its floor and its ceiling.
function isWorkshopCameraInsideRoom() {
  const tileX = Math.floor(player.x), tileZ = Math.floor(player.z);
  if (!isTileOpenAt(tileX, tileZ)) return false;
  const index = tileIndexAt(tileX, tileZ), eyeY = getPlayerEyeY();
  return eyeY > tileFloorHeight[index] + 0.02 && eyeY < tileCeilingHeight[index] - 0.02;
}

// Walking: the game's own movement, so doorways, furniture and steps behave exactly as they will in play.
function setWorkshopWalking(isWalking) {
  workshop.isWalking = isWalking;
  debugState.options.flyMode = false;
  if (isWalking) {
    landAfterFlying();
    player.pitch = clampNumber(player.pitch, -1.45, 1.45);
  }
}

// ---------------------------------------------------------------------------
// Every frame
// ---------------------------------------------------------------------------

function updateWorkshop(dt) {
  game.time += dt;
  currentPointTime = game.time;
  game.fade = 1; game.interference = 0; game.danger = 0;
  const tool = workshop.tools[workshop.tool];
  tool.update(dt);

  // The scanner works as it does in the game (Space paints, F sweeps), and never overheats here.
  // Like the game's, it only makes sense from inside a room: from above the ceiling its pulses would
  // seem to stop in mid-air.
  player.heat = 0; player.isOverheated = false;
  if (isWorkshopCameraInsideRoom()) {
    updateScanner(dt, player.x, getPlayerEyeY(), player.z);
    // Lights off: the whole view is scanned all the time, so the screen shows what a player who has
    // scanned everything would see.
    if (!workshop.isLit) {
      const tangents = getWorkshopViewTangents();
      fireWorkshopScan(workshop.needsScanBurst ? WORKSHOP_SCAN_RAYS_AT_ONCE : WORKSHOP_SCAN_RAYS_PER_FRAME, 0, 0, tangents.horizontal, tangents.vertical);
    }
    workshop.needsScanBurst = false;
  } else {
    input.wantsSweep = false;
    player.isPainting = false;
    setScannerSound(0);
    resetBeamLines(0, 0, 0);
  }
  updateDoors(dt);

  if (workshop.statusSecondsLeft > 0) {
    workshop.statusSecondsLeft -= dt;
    if (workshop.statusSecondsLeft <= 0) workshop.statusElement.hidden = true;
  }
  workshop.stateSaveTimer -= dt;
  if (workshop.stateSaveTimer <= 0) {
    workshop.stateSaveTimer = 0.7;
    saveWorkshopState(); // cheap, and it means a reload at any moment loses nothing
  }
}

function buildWorkshopFrameData() {
  const data = debugState.frameData;
  data.lightStation = workshop.isLit;
  data.seeThroughWalls = false;
  data.figures.length = 0;
  data.lineVertexCount = 0;
  workshop.tools[workshop.tool].addOverlays(data);
  return data;
}

function setWorkshopLights(isLit) {
  workshop.isLit = isLit;
  workshop.needsScanBurst = true;
  if (isLit) clearAllPoints();
  // In the dark there is only the scanner, and that needs the camera inside the room.
  else if (!isWorkshopCameraInsideRoom()) workshop.tools[workshop.tool].moveCameraInside();
  markWorkshopStateChanged();
}

// ---------------------------------------------------------------------------
// Opening, leaving, switching tools
// ---------------------------------------------------------------------------

function renderWorkshopPanel() {
  if (!workshop.isOpen) return;
  for (const toolKey in workshop.tabElements) workshop.tabElements[toolKey].classList.toggle('is-current', toolKey === workshop.tool);
  const scrollTop = workshop.bodyElement.scrollTop;
  workshop.bodyElement.textContent = '';
  workshop.tools[workshop.tool].renderPanel(workshop.bodyElement);
  workshop.bodyElement.scrollTop = scrollTop;
}

function selectWorkshopTool(toolKey) {
  if (workshop.isOpen && toolKey !== workshop.tool) {
    saveWorkshopState();
    workshop.tools[workshop.tool].close();
  }
  workshop.tool = toolKey;
  setWorkshopWalking(false);
  workshop.tools[toolKey].open(workshop.stored[toolKey]);
  workshop.bodyElement.scrollTop = 0;
  renderWorkshopPanel();
  markWorkshopStateChanged();
}

function openWorkshop() {
  if (workshop.isOpen) return;
  workshop.isOpen = true;
  workshop.stored.isOpen = true;
  workshop.isLit = workshop.stored.isLit;
  game.mode = 'workshop';
  game.flags.powerOn = true; game.flags.hasKeycard = true; // every door answers
  debugState.isPanelOpen = false;
  debugState.panelElement.hidden = true;
  showOnlyScreen(null);
  setHudVisible(false);
  closeMapOverlay();
  document.getElementById('game-root').classList.add('is-workshop');
  workshop.panelElement.hidden = false;
  selectWorkshopTool(workshop.stored.tool);
  focusGameView();
}

// Back to the game: the page is loaded again, which puts the station and everything else back as it was.
function leaveWorkshop() {
  saveWorkshopState();
  workshop.stored.isOpen = false;
  try { window.localStorage.setItem(WORKSHOP_STORAGE_KEY, JSON.stringify(workshop.stored)); } catch (error) { /* storage is optional */ }
  workshop.isOpen = false; // so nothing writes "open" again on the way out
  if (window.location.hash === '#workshop') window.history.replaceState(null, '', window.location.pathname + window.location.search);
  window.location.reload();
}

// ---------------------------------------------------------------------------
// Start-up: the panel, the mouse and the keyboard
// ---------------------------------------------------------------------------

function initializeWorkshop() {
  workshop.stored = loadWorkshopState();
  for (const toolKey in workshop.tools) workshop.tools[toolKey].initialize(workshop.stored[toolKey]);

  const root = document.getElementById('game-root');
  const panel = createDebugElement('aside', '', '');
  panel.id = 'workshop-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Workshop');
  const header = createDebugElement('div', 'workshop-header');
  header.appendChild(createDebugElement('strong', '', 'WORKSHOP'));
  const tabs = createDebugElement('div', 'workshop-tabs');
  for (const toolKey in workshop.tools) {
    const tab = createDebugElement('button', 'button-quiet', workshop.tools[toolKey].label);
    tab.type = 'button';
    tab.id = 'workshop-tab-' + toolKey;
    tab.addEventListener('click', function () { tab.blur(); selectWorkshopTool(toolKey); });
    workshop.tabElements[toolKey] = tab;
    tabs.appendChild(tab);
  }
  header.appendChild(tabs);
  const leaveButton = createDebugElement('button', 'button-quiet', 'Leave');
  leaveButton.type = 'button';
  leaveButton.id = 'workshop-leave';
  leaveButton.title = 'Back to the title screen';
  leaveButton.addEventListener('click', leaveWorkshop);
  header.appendChild(leaveButton);
  panel.appendChild(header);
  workshop.bodyElement = createDebugElement('div', 'workshop-body');
  panel.appendChild(workshop.bodyElement);
  root.appendChild(panel);
  workshop.panelElement = panel;

  workshop.statusElement = createDebugElement('div', 'workshop-status');
  workshop.statusElement.id = 'workshop-status';
  workshop.statusElement.hidden = true;
  root.appendChild(workshop.statusElement);
  workshop.bannerElement = createDebugElement('div', '');
  workshop.bannerElement.id = 'workshop-banner';
  workshop.bannerElement.hidden = true;
  root.appendChild(workshop.bannerElement);

  // The way in: a button on the title screen.
  const openButton = createDebugElement('button', 'button-quiet', 'Workshop');
  openButton.type = 'button';
  openButton.id = 'button-workshop';
  openButton.title = 'Room and creature tools (only in the `npm run dev` build)';
  openButton.addEventListener('click', openWorkshop);
  document.getElementById('button-begin').insertAdjacentElement('afterend', openButton);

  workshopHooks.update = updateWorkshop;
  workshopHooks.buildFrameData = buildWorkshopFrameData;

  const canvas = renderer.canvas;
  canvas.addEventListener('mousedown', function (event) {
    if (!workshop.isOpen) return;
    if (document.activeElement && document.activeElement !== canvas && document.activeElement.blur) document.activeElement.blur();
    event.preventDefault();
    workshop.tools[workshop.tool].onPointerDown(event);
  });
  window.addEventListener('mousemove', function (event) {
    if (!workshop.isOpen) return;
    workshop.tools[workshop.tool].onPointerMove(event);
  });
  window.addEventListener('mouseup', function (event) {
    if (!workshop.isOpen) return;
    workshop.tools[workshop.tool].onPointerUp(event);
  });
  canvas.addEventListener('wheel', function (event) {
    if (!workshop.isOpen) return;
    event.preventDefault();
    workshop.tools[workshop.tool].onWheel(event);
  }, { passive: false });
  window.addEventListener('keydown', function (event) {
    if (!workshop.isOpen) return;
    const isTyping = event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT' || event.target.tagName === 'TEXTAREA');
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') {
      event.preventDefault();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      workshop.tools[workshop.tool].save();
      return;
    }
    if (isTyping) return;
    if (workshop.tools[workshop.tool].onKey(event)) { event.preventDefault(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (event.code === 'KeyL') { setWorkshopLights(!workshop.isLit); renderWorkshopPanel(); }
    else if (event.code === 'KeyF') input.wantsSweep = true;
  });
  window.addEventListener('pagehide', function () { if (workshop.isOpen) saveWorkshopState(); });

  connectToWorkshopServer();
  window.noReturnDebug.workshop = workshop;
  window.noReturnDebug.openWorkshop = openWorkshop;
  if (workshop.stored.isOpen || window.location.hash === '#workshop') openWorkshop();
}
