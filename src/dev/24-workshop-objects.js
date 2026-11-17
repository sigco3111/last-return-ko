// ---------------------------------------------------------------------------
// Workshop, object tool: design a loose object by putting basic forms together.
//
// A loose object's shape is boxes, balls and capsules (`parts`, see the top of 08-loose-objects.js). Here they
// are added, taken hold of and moved about, the way things are placed in a room in the room tool. The object
// on screen is the real thing: a loose object of the game's own, hanging where its parts say, so the scanner
// lands on it and it falls, rolls and sounds exactly as it will in play ("Try it").
//
// Two kinds of object can be opened:
//   objects made here   saved to src/objects/<key>.json (08-workshop-objects.js). These can be changed in every way.
//   kinds written as code (LOOSE_OBJECT_KINDS in 08-loose-objects.js). These can be looked at and tried, and
//                       copied to make one that can be changed.
//
// On the bench the object hangs as it does in the beam: x to your right, y up, z towards you. The three short
// lines mark its own origin: red is x, green is y, blue is z.
// ---------------------------------------------------------------------------

const OBJECT_WORKSHOP_KEY_PATTERN = /^[a-z][A-Za-z0-9]{1,30}$/;
const OBJECT_WORKSHOP_DRAFT_KEY = 'workshopDraft'; // the kind the working copy is, for as long as it is on the bench
const OBJECT_WORKSHOP_STAGE_SIZE = 7;              // the test room is this many metres square
const OBJECT_WORKSHOP_CEILING = 3;
const OBJECT_WORKSHOP_BENCH_HEIGHT = 1.1;          // how high the object's own origin hangs: about where the beam carries it
const OBJECT_WORKSHOP_MANY_BALLS = 120;            // TWEAK: an object that touches with more balls than this is reported
// TWEAK: the knocks the readout prices, in metres per second. Walking into a wall is your walking speed. A thing
// let go of while you stand lands at about 4.5 (see looseKnockLoudSpeed in 00-config.js). A hard throw leaves
// at what a full throw gives a thing of its weight.
const OBJECT_WORKSHOP_DROP_SPEED = 4.5;
const OBJECT_WORKSHOP_SHAPES = [['box', 'Box'], ['ball', 'Ball'], ['capsule', 'Capsule (a rod with round ends)']];
const OBJECT_WORKSHOP_AXIS_NAMES = ['x: to your right', 'y: up', 'z: towards you'];

const objectWorkshop = {
  key: '',               // which object is open
  savedKey: null,        // the file it was opened from; null for one that has never been saved
  object: null,          // the working copy, when it is an object made here; null for a kind written as code
  isDirty: false,        // the working copy differs from the file
  selectedIndex: -1,     // which of object.parts is selected
  body: null,            // the loose object on the bench
  scaleKey: '',          // a kind hung beside it, to judge its size by
  isTrying: false,       // it has been let go of: it falls and rolls, and cannot be taken hold of part by part
  liesOnItsSide: false,
  showsShell: false,     // mark the balls that do its touching
  needsRebuild: false,
  problems: [],
  problemsElement: null, saveButton: null, readoutElement: null, readoutTimer: 0,
  selectedSetters: {},   // setValue functions of the selected part's place fields
  undoStack: [], redoStack: [], lastEditLabel: '', lastEditTime: -9999,
  orbit: { yaw: 0.6, pitch: -0.3, distance: 1.1 },
  focus: null,           // what the camera circles: [x, y, z]
  drag: null
};

function getObjectWorkshopBench() {
  return [WORKSHOP_ORIGIN_X + OBJECT_WORKSHOP_STAGE_SIZE / 2, OBJECT_WORKSHOP_BENCH_HEIGHT, WORKSHOP_ORIGIN_Z + OBJECT_WORKSHOP_STAGE_SIZE / 2];
}

// ---------------------------------------------------------------------------
// Which object
// ---------------------------------------------------------------------------

function getObjectWorkshopChoices() {
  const state = objectWorkshop;
  const made = [], coded = [];
  for (const key in LOOSE_OBJECT_KINDS) {
    if (key === OBJECT_WORKSHOP_DRAFT_KEY) continue;
    if (!LOOSE_OBJECT_KINDS[key].isDesigned) coded.push([key, LOOSE_OBJECT_KINDS[key].label]);
    else if (key !== state.savedKey) made.push([key, LOOSE_OBJECT_KINDS[key].label]);
  }
  // The object being worked on is listed under its current name, even before it has a file.
  if (state.object) made.unshift([state.key, state.object.label + (state.savedKey ? (state.isDirty ? ' (changed)' : '') : ' (not saved yet)')]);
  return [['Made in the workshop', made], ['Written as code (to look at)', coded]];
}

function getDefaultObjectWorkshopKey() {
  for (const key in designedObjects) return key;
  return 'canister';
}

// Opens an object. `draft` (optional) is a working copy to carry on with instead of the object's file.
function openObjectInWorkshop(key, draft, savedKey) {
  const state = objectWorkshop;
  state.key = key;
  if (draft) {
    state.object = normalizeDesignedObject(draft, key);
    state.savedKey = savedKey || null;
    state.isDirty = true;
  } else if (designedObjects[key]) {
    state.object = normalizeDesignedObject(JSON.parse(JSON.stringify(designedObjects[key])), key);
    state.savedKey = key;
    state.isDirty = false;
  } else {
    state.object = null;
    state.savedKey = null;
    state.isDirty = false;
  }
  state.selectedIndex = -1;
  state.undoStack.length = 0; state.redoStack.length = 0;
  state.lastEditLabel = '';
  state.drag = null;
  rebuildObjectWorkshopBody();
  markWorkshopStateChanged();
}

function mayDiscardObjectWorkshopChanges() {
  const state = objectWorkshop;
  if (!state.object || !state.isDirty) return true;
  return window.confirm('"' + state.object.label + '" has changes that are not saved. Throw them away?');
}

// A new object: a plain box, or a copy of the one that is open (which may be a kind written as code).
function createNewWorkshopObject(isCopy) {
  const state = objectWorkshop;
  if (!mayDiscardObjectWorkshopChanges()) return;
  const source = isCopy ? (state.object || LOOSE_OBJECT_KINDS[state.key]) : null;
  let key = isCopy ? state.key + 'Copy' : 'newObject';
  for (let number = 2; LOOSE_OBJECT_KINDS[key]; number++) key = (isCopy ? state.key + 'Copy' : 'newObject') + number;
  // Only what a file can hold is taken over: not what a kind written as code does when it is used.
  const draft = source ? JSON.parse(JSON.stringify(source)) : { label: 'new object', parts: [{ shape: 'box', center: [0, 0, 0], half: [0.12, 0.1, 0.08] }] };
  if (source) {
    draft.label = (source.label + ' copy').slice(0, 40);
    // In no station until you say so: it would change what existing seeds produce.
    for (const field of DESIGNED_OBJECT_STATION_FIELDS) draft[field.key] = 0;
  }
  openObjectInWorkshop(key, draft, null);
  renderWorkshopPanel();
  setWorkshopStatus(source ? 'A copy to work on. It becomes a file when you save it.' : 'A new object. It becomes a file when you save it.', 'info');
}

// ---------------------------------------------------------------------------
// The test room, and the object in it
// ---------------------------------------------------------------------------

function buildObjectWorkshopStage() {
  prepareWorkshopWorld('Workshop · objects');
  ZONE_NAMES.push('UNSURVEYED', 'TEST ROOM');
  clearPlacement();
  placement.zone = 1;
  carveRoom(WORKSHOP_ORIGIN_X, WORKSHOP_ORIGIN_Z, WORKSHOP_ORIGIN_X + OBJECT_WORKSHOP_STAGE_SIZE, WORKSHOP_ORIGIN_Z + OBJECT_WORKSHOP_STAGE_SIZE, OBJECT_WORKSHOP_CEILING, ZONE_GENERATED_ROOM);
  finishWorkshopWorld();
}

// Hangs a loose object of some kind so that its own origin (not its centre of mass) is at this point, at rest.
function hangObjectWorkshopBody(kindKey, x, y, z) {
  const prepared = prepareLooseObjectKind(kindKey);
  const body = createLooseObject(kindKey, x + prepared.centreX, y + prepared.centreY, z + prepared.centreZ, 0);
  body.isAsleep = true;
  return body;
}

// Makes the object afresh from its parts and hangs it over the bench. Called after every change.
function rebuildObjectWorkshopBody() {
  const state = objectWorkshop;
  state.needsRebuild = false;
  state.isTrying = false;
  while (looseObjects.length > 0) removeLooseObject(looseObjects[looseObjects.length - 1]); // one by one, so that each takes its points with it
  removeBrokenGlassFromPlay(); // what a jar left on the floor when it was tried
  const kindKey = state.object ? OBJECT_WORKSHOP_DRAFT_KEY : state.key;
  if (state.object) LOOSE_OBJECT_KINDS[OBJECT_WORKSHOP_DRAFT_KEY] = createDesignedObjectKind(state.object);
  const bench = getObjectWorkshopBench();
  state.body = hangObjectWorkshopBody(kindKey, bench[0], bench[1], bench[2]);
  if (LOOSE_OBJECT_KINDS[state.scaleKey] && state.scaleKey !== OBJECT_WORKSHOP_DRAFT_KEY) {
    const apart = state.body.prepared.partsRadius + prepareLooseObjectKind(state.scaleKey).partsRadius + 0.15;
    hangObjectWorkshopBody(state.scaleKey, bench[0] - apart, bench[1], bench[2]);
  }
  workshop.needsScanBurst = true;
  state.problems = findObjectWorkshopProblems();
  refreshObjectWorkshopProblems();
}

// The smallest upright box round some parts, in the object's own coordinates: { low: [x, y, z], high: [x, y, z] }.
function getObjectWorkshopExtents(parts) {
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    for (let axis = 0; axis < 3; axis++) {
      const reach = part.shape === 'box' ? part.half[axis] : part.radius;
      for (const place of part.shape === 'capsule' ? [part.from, part.to] : [part.center]) {
        low[axis] = Math.min(low[axis], place[axis] - reach);
        high[axis] = Math.max(high[axis], place[axis] + reach);
      }
    }
  }
  return { low: low, high: high };
}

function describeObjectWorkshopPart(part, partIndex) {
  const place = part.shape === 'capsule' ? [0, 1, 2].map(function (axis) { return (part.from[axis] + part.to[axis]) / 2; }) : part.center;
  return (partIndex + 1) + '. ' + (part.shape === 'box' ? 'Box' : (part.shape === 'ball' ? 'Ball' : 'Capsule')) + ' · ' + place.map(formatWorkshopNumber).join(', ');
}

// Things that would go wrong: a name that will not do, a shape that costs too much to move.
function findObjectWorkshopProblems() {
  const state = objectWorkshop, problems = [];
  if (!state.object) return problems;
  if (!OBJECT_WORKSHOP_KEY_PATTERN.test(state.key)) problems.push('The file name must start with a small letter and have only letters and digits.');
  else if (state.key !== state.savedKey && LOOSE_OBJECT_KINDS[state.key]) problems.push('There is already an object called "' + state.key + '". Choose another file name.');
  // What `npm test` holds every kind of loose object to (tools/loose-objects-test.js).
  const reach = state.body.prepared.boundsRadius;
  if (reach >= 1) problems.push('It reaches ' + reach.toFixed(2) + ' m from its middle. A loose object stays under a metre: the length of pipe, the longest there is, reaches 0.63.');
  if (reach <= 0.05) problems.push('It reaches only ' + Math.round(reach * 100) + ' cm from its middle. Under 5 cm is too small to find with the scanner.');
  if (state.object.shattersAt > 0 && state.object.shattersAt <= TUNING.looseKnockQuietSpeed) {
    problems.push('It shatters at ' + state.object.shattersAt + ' m/s. Crouching, you carry things into walls at up to ' + TUNING.looseKnockQuietSpeed + ': it would break however carefully it is carried.');
  }
  const ballCount = state.body.prepared.shellCount;
  if (ballCount > OBJECT_WORKSHOP_MANY_BALLS) {
    problems.push('It touches the station with ' + ballCount + ' balls (B shows them). Over ' + OBJECT_WORKSHOP_MANY_BALLS + ', every one of them in a station costs time whenever it moves: fewer or smaller boxes.');
  }
  return problems;
}

function refreshObjectWorkshopProblems() {
  const state = objectWorkshop;
  if (state.saveButton) state.saveButton.textContent = (state.isDirty ? 'Save *' : 'Saved');
  const list = state.problemsElement;
  if (!list) return;
  list.textContent = '';
  if (!state.object) return;
  if (state.problems.length === 0) list.appendChild(createDebugElement('li', 'is-fine', 'Nothing wrong with it.'));
  for (const problem of state.problems) list.appendChild(createDebugElement('li', '', problem));
}

function buildObjectWorkshopReadout() {
  const state = objectWorkshop;
  const kind = state.body.kind, extents = getObjectWorkshopExtents(kind.parts);
  const size = [0, 1, 2].map(function (axis) { return (extents.high[axis] - extents.low[axis]).toFixed(2); });
  const resistance = getLooseShoveResistance(kind.mass);
  const lines = [];
  // Short lines: the panel is narrow.
  lines.push('size        ' + size.join(' x ') + ' m (x, y, z)');
  lines.push('            a doorway or a vent is 1 m wide');
  lines.push('touches     with ' + state.body.prepared.shellCount + ' balls' + (state.showsShell ? '' : ' (B shows them)'));
  lines.push('walked into ' + (resistance <= 0 ? 'you kick it along without feeling it' : (resistance >= 1 ? 'it stops you: pick it up' : 'it takes ' + Math.round(resistance * 100) + '% out of your stride')));
  // What a knock costs it, by the game's own sum (getLooseDamageShare, and `shattersAt`).
  const throwSpeed = TUNING.looseThrowSpeed / (1 + kind.mass * TUNING.looseThrowLossPerKilogram);
  const afterKnock = function (speed) {
    if (kind.shattersAt && speed >= kind.shattersAt) return 'shatters';
    return 'worth ' + Math.max(1, Math.round(Math.max(kind.value * TUNING.looseWorthLeastShare, kind.value * (1 - getLooseDamageShare(kind, speed)))));
  };
  if (kind.value > 0) {
    lines.push('whole       worth ' + kind.value);
    lines.push('into a wall ' + afterKnock(TUNING.walkSpeed) + ' (at a walk)');
    lines.push('let go of   ' + afterKnock(OBJECT_WORKSHOP_DROP_SPEED) + ' (standing up)');
    lines.push('thrown hard ' + afterKnock(throwSpeed) + ' (leaves at ' + throwSpeed.toFixed(1) + ' m/s)');
  }
  if (state.isTrying) {
    if (state.body.isRemoved) lines.push(kind.material === 'glass' ? 'now         shattered: gone, and its glass lies\n            where it hit' : 'now         broken apart: gone, and nothing\n            left of it');
    else {
      lines.push(state.body.isAsleep ? 'now         at rest, its middle ' + state.body.y.toFixed(2) + ' m up' : 'now         moving');
      if (kind.value > 0) lines.push('            worth ' + getLooseObjectValue(state.body) + ' of ' + kind.value);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Trying it: the game's own falling, rolling and knocking
// ---------------------------------------------------------------------------

// Lets go of it from the bench. `throwStrength` 0 drops it; 1 is a full throw, the way the view is looking.
function tryObjectWorkshopBody(throwStrength) {
  const state = objectWorkshop;
  rebuildObjectWorkshopBody(); // from the bench, every time
  initializeAudioEngine();
  for (const object of looseObjects) wakeLooseObject(object); // what hangs beside it for scale falls with it
  if (throwStrength > 0) {
    looseState.playerVelocityX = 0; looseState.playerVelocityZ = 0;
    looseState.held = state.body; state.body.isHeld = true;
    releaseHeldLooseObject(throwStrength);
  }
  state.isTrying = true;
}

// Puts it on the floor the way a station would put one out (`lies`). One that lies either way takes turns.
function layObjectWorkshopBodyDown() {
  const state = objectWorkshop;
  rebuildObjectWorkshopBody();
  const body = state.body, lies = body.kind.lies;
  state.liesOnItsSide = lies === 'onItsSide' || (lies === 'either' && !state.liesOnItsSide);
  const orientation = getLooseRestOrientation(body.kindKey, 0, state.liesOnItsSide, false);
  const bench = getObjectWorkshopBench();
  body.x = bench[0]; body.y = getLooseRestHeight(body.kindKey, orientation) + 0.001; body.z = bench[2];
  setLooseObjectOrientation(body, orientation[0], orientation[1], orientation[2], orientation[3]);
  refreshLooseObjectTiles(body);
  state.isTrying = true;
}

// ---------------------------------------------------------------------------
// Changing the object
// ---------------------------------------------------------------------------

// Call before every change. Changes of the same kind in quick succession (a slider being dragged) are one step to undo.
function beginObjectWorkshopEdit(label) {
  const state = objectWorkshop;
  const now = window.performance.now();
  if (label !== state.lastEditLabel || now - state.lastEditTime > 700) {
    state.undoStack.push(JSON.stringify({ object: state.object, selectedIndex: state.selectedIndex }));
    if (state.undoStack.length > 120) state.undoStack.shift();
    state.redoStack.length = 0;
  }
  state.lastEditLabel = label;
  state.lastEditTime = now;
}

// Call after every change.
function finishObjectWorkshopEdit() {
  const state = objectWorkshop;
  state.isDirty = true;
  state.needsRebuild = true;
  markWorkshopStateChanged();
}

function stepObjectWorkshopHistory(fromStack, toStack) {
  const state = objectWorkshop;
  if (!state.object || fromStack.length === 0) return;
  toStack.push(JSON.stringify({ object: state.object, selectedIndex: state.selectedIndex }));
  const restored = JSON.parse(fromStack.pop());
  state.key = restored.object.key || state.key; // the file name can be undone too
  state.object = normalizeDesignedObject(restored.object, state.key);
  state.selectedIndex = Math.min(restored.selectedIndex, state.object.parts.length - 1);
  state.lastEditLabel = '';
  finishObjectWorkshopEdit();
  renderWorkshopPanel();
}

function selectObjectWorkshopPart(partIndex, shouldScrollToIt) {
  objectWorkshop.selectedIndex = partIndex;
  renderWorkshopPanel();
  if (shouldScrollToIt) {
    const heading = document.getElementById('workshop-selected');
    if (heading && heading.scrollIntoView) heading.scrollIntoView({ block: 'nearest' });
  }
}

function addObjectWorkshopPart(shape) {
  const state = objectWorkshop;
  if (!state.object) return;
  if (state.object.parts.length >= DESIGNED_OBJECT_LIMITS.maximumParts) {
    setWorkshopStatus('An object has at most ' + DESIGNED_OBJECT_LIMITS.maximumParts + ' parts.', 'warning');
    return;
  }
  // On top of what is there, half sunk into it: it can be seen, and it is joined on.
  const top = getObjectWorkshopExtents(state.object.parts).high[1];
  beginObjectWorkshopEdit('add');
  state.object.parts.push(normalizeDesignedPart({ shape: shape, center: [0, top, 0], from: [0, top, 0], to: [0, top + 0.2, 0] }));
  finishObjectWorkshopEdit();
  selectObjectWorkshopPart(state.object.parts.length - 1, true);
}

function deleteSelectedObjectWorkshopPart() {
  const state = objectWorkshop;
  if (!state.object || state.selectedIndex < 0) return;
  if (state.object.parts.length === 1) { setWorkshopStatus('An object needs at least one part.', 'info'); return; }
  beginObjectWorkshopEdit('delete');
  state.object.parts.splice(state.selectedIndex, 1);
  state.selectedIndex = -1;
  finishObjectWorkshopEdit();
  renderWorkshopPanel();
}

// A copy of a part, moved by [x, y, z].
function shiftObjectWorkshopPart(part, shift) {
  const moved = JSON.parse(JSON.stringify(part));
  for (const name of moved.shape === 'capsule' ? ['from', 'to'] : ['center']) {
    for (let axis = 0; axis < 3; axis++) moved[name][axis] += shift[axis];
  }
  return normalizeDesignedPart(moved);
}

function duplicateSelectedObjectWorkshopPart() {
  const state = objectWorkshop;
  const part = state.object && state.object.parts[state.selectedIndex];
  if (!part || state.object.parts.length >= DESIGNED_OBJECT_LIMITS.maximumParts) return;
  beginObjectWorkshopEdit('duplicate');
  state.object.parts.push(shiftObjectWorkshopPart(part, [0.1, 0, 0])); // beside the original, so the copy can be seen and taken hold of
  finishObjectWorkshopEdit();
  selectObjectWorkshopPart(state.object.parts.length - 1, true);
}

// Puts another shape in the selected part's place. Does nothing if it is the same.
function replaceSelectedObjectWorkshopPart(part, editLabel) {
  const state = objectWorkshop;
  if (JSON.stringify(part) === JSON.stringify(state.object.parts[state.selectedIndex])) return;
  beginObjectWorkshopEdit(editLabel);
  state.object.parts[state.selectedIndex] = part;
  finishObjectWorkshopEdit();
  for (const fieldKey in state.selectedSetters) state.selectedSetters[fieldKey].setValue(part[fieldKey.slice(0, -1)][Number(fieldKey.slice(-1))]);
}

// A quarter turn of the selected part about its own middle: about the upright line, or (`isTippedOver`) about
// the line that points at you. The two together reach every way a part can lie along the object's own directions.
function turnSelectedObjectWorkshopPart(isTippedOver) {
  const state = objectWorkshop;
  const part = state.object && state.object.parts[state.selectedIndex];
  if (!part || part.shape === 'ball') return;
  const turned = JSON.parse(JSON.stringify(part));
  if (part.shape === 'box') {
    const other = isTippedOver ? 1 : 2;
    turned.half[0] = part.half[other]; turned.half[other] = part.half[0];
  } else {
    const middle = [0, 1, 2].map(function (axis) { return (part.from[axis] + part.to[axis]) / 2; });
    const half = [0, 1, 2].map(function (axis) { return (part.to[axis] - part.from[axis]) / 2; });
    const turnedHalf = isTippedOver ? [-half[1], half[0], half[2]] : [half[2], half[1], -half[0]];
    for (let axis = 0; axis < 3; axis++) { turned.from[axis] = middle[axis] - turnedHalf[axis]; turned.to[axis] = middle[axis] + turnedHalf[axis]; }
  }
  replaceSelectedObjectWorkshopPart(normalizeDesignedPart(turned), 'turn');
  renderWorkshopPanel(); // a box's sizes have changed places
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

// The object as it is written to its file: everything but the key, which is the file's name.
function getObjectWorkshopFileContent() {
  const content = normalizeDesignedObject(objectWorkshop.object, objectWorkshop.key);
  delete content.key;
  return content;
}

function saveObjectWorkshop() {
  const state = objectWorkshop;
  if (!state.object) { setWorkshopStatus('This kind is written as code. "Copy of this" makes one that can be changed and saved.', 'info'); return; }
  const key = state.key;
  if (!OBJECT_WORKSHOP_KEY_PATTERN.test(key) || (key !== state.savedKey && LOOSE_OBJECT_KINDS[key])) {
    setWorkshopStatus('Not saved: ' + state.problems[0], 'warning');
    return;
  }
  const content = getObjectWorkshopFileContent();
  if (!workshop.hasServer) {
    downloadWorkshopFile(key + '.json', JSON.stringify(content, null, 2) + '\n');
    setWorkshopStatus('No dev server, so the object was downloaded instead. Put ' + key + '.json in src/objects/.', 'warning');
    return;
  }
  const previousKey = state.savedKey;
  callWorkshopServer('/dev/save-object', { key: key, object: content }).then(function () {
    // Renamed: the old file goes, or the object would exist twice.
    if (previousKey && previousKey !== key) return callWorkshopServer('/dev/delete-object', { key: previousKey });
    return null;
  }).then(function () {
    state.isDirty = false;
    state.savedKey = key;
    designedObjects[key] = normalizeDesignedObject(content, key);
    saveWorkshopState();
    refreshObjectWorkshopProblems();
    setWorkshopStatus('Saved src/objects/' + key + '.json' + (state.problems.length > 0 ? ', with ' + state.problems.length + ' thing(s) still to check.' : '.'), state.problems.length > 0 ? 'warning' : 'good');
  }).catch(function (error) {
    setWorkshopStatus('Not saved: ' + error.message, 'warning');
  });
}

function revertObjectWorkshop() {
  const state = objectWorkshop;
  if (!state.object || !state.isDirty) return;
  if (!window.confirm('Throw away every change to "' + state.object.label + '" since it was last saved?')) return;
  openObjectInWorkshop(state.savedKey || getDefaultObjectWorkshopKey());
  renderWorkshopPanel();
}

function deleteObjectWorkshopObject() {
  const state = objectWorkshop;
  if (!state.object) return;
  if (!window.confirm('Delete the object "' + state.object.label + '"' + (state.savedKey ? ' and its file src/objects/' + state.savedKey + '.json?' : '?'))) return;
  const afterwards = function () {
    if (state.savedKey) { delete designedObjects[state.savedKey]; delete LOOSE_OBJECT_KINDS[state.savedKey]; }
    openObjectInWorkshop(getDefaultObjectWorkshopKey());
    saveWorkshopState();
    renderWorkshopPanel();
  };
  if (!state.savedKey) { afterwards(); return; }
  if (!workshop.hasServer) { setWorkshopStatus('No dev server: delete src/objects/' + state.savedKey + '.json by hand.', 'warning'); return; }
  callWorkshopServer('/dev/delete-object', { key: state.savedKey }).then(afterwards).catch(function (error) {
    setWorkshopStatus('Not deleted: ' + error.message, 'warning');
  });
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

// One control per field, for the numbers and switches an object has (DESIGNED_OBJECT_FIELDS).
function addObjectWorkshopFields(body, fields) {
  const state = objectWorkshop;
  for (const field of fields) {
    const change = function (value) { beginObjectWorkshopEdit('field ' + field.key); state.object[field.key] = value; finishObjectWorkshopEdit(); };
    let control;
    if (field.kind === 'number') control = addWorkshopNumber(body, field.label, state.object[field.key], field.minimum, field.maximum, field.step, change).element;
    else if (field.kind === 'boolean') control = addWorkshopCheckbox(body, field.label, state.object[field.key], change);
    else control = addWorkshopSelect(body, field.label, state.object[field.key], field.choices, change);
    control.id = 'workshop-object-' + field.key;
  }
}

function renderObjectWorkshopSelection(body) {
  const state = objectWorkshop;
  const part = state.object.parts[state.selectedIndex];
  state.selectedSetters = {};
  const heading = addWorkshopHeading(body, part ? 'Selected: ' + describeObjectWorkshopPart(part, state.selectedIndex) : 'Selected: nothing');
  heading.id = 'workshop-selected';
  if (!part) { addWorkshopNote(body, 'Click a part in the view, or in the list below.'); return; }
  const limits = DESIGNED_OBJECT_LIMITS;
  const selected = function () { return state.object.parts[state.selectedIndex]; };
  const addPlace = function (name, label) {
    for (let axis = 0; axis < 3; axis++) {
      const field = addWorkshopNumber(body, label + ', ' + OBJECT_WORKSHOP_AXIS_NAMES[axis], part[name][axis], -limits.reach, limits.reach, 0.005, function (value) {
        beginObjectWorkshopEdit('part ' + name + axis); selected()[name][axis] = value; finishObjectWorkshopEdit();
      });
      field.element.id = 'workshop-part-' + name + axis;
      state.selectedSetters[name + axis] = field;
    }
  };
  if (part.shape === 'capsule') { addPlace('from', 'One end'); addPlace('to', 'The other end'); }
  else addPlace('center', 'Its middle');
  if (part.shape === 'box') {
    ['Width (x)', 'Height (y)', 'Depth (z)'].forEach(function (label, axis) {
      addWorkshopNumber(body, label, part.half[axis] * 2, limits.minimumHalf * 2, limits.maximumHalf * 2, 0.01, function (value) {
        beginObjectWorkshopEdit('part size' + axis); selected().half[axis] = value / 2; finishObjectWorkshopEdit();
      }).element.id = 'workshop-part-size' + axis;
    });
  } else {
    addWorkshopNumber(body, part.shape === 'ball' ? 'Radius' : 'Thickness (radius)', part.radius, limits.minimumRadius, limits.maximumRadius, 0.005, function (value) {
      beginObjectWorkshopEdit('part radius'); selected().radius = value; finishObjectWorkshopEdit();
    }).element.id = 'workshop-part-radius';
  }
  const row = addWorkshopRow(body);
  addWorkshopButton(row, 'Copy', duplicateSelectedObjectWorkshopPart, 'Ctrl+D');
  addWorkshopButton(row, 'Delete', deleteSelectedObjectWorkshopPart, 'Delete key');
  if (part.shape !== 'ball') {
    addWorkshopButton(row, 'Turn', function () { turnSelectedObjectWorkshopPart(false); }, 'R: a quarter turn about the upright line');
    addWorkshopButton(row, 'Tip over', function () { turnSelectedObjectWorkshopPart(true); }, 'Shift+R: a quarter turn about the line that points at you');
  }
}

function renderObjectWorkshopPanel(body) {
  const state = objectWorkshop, object = state.object;
  state.problemsElement = null; state.saveButton = null;

  addWorkshopSelect(body, 'Object', state.key, getObjectWorkshopChoices(), function (key) {
    if (key !== state.key && mayDiscardObjectWorkshopChanges()) openObjectInWorkshop(key);
    renderWorkshopPanel();
  }).id = 'workshop-object';
  let row = addWorkshopRow(body);
  addWorkshopButton(row, 'New object', function () { createNewWorkshopObject(false); }).id = 'workshop-new-object';
  addWorkshopButton(row, 'Copy of this', function () { createNewWorkshopObject(true); }, 'A new object that starts out as this one').id = 'workshop-copy-object';
  if (object) addWorkshopButton(row, 'Delete', deleteObjectWorkshopObject);

  if (object) {
    row = addWorkshopRow(body);
    state.saveButton = addWorkshopButton(row, 'Save', saveObjectWorkshop, workshop.hasServer ? 'Ctrl+S: writes src/objects/' + state.key + '.json' : 'No dev server: downloads the file instead');
    state.saveButton.id = 'workshop-save-object';
    state.saveButton.classList.add('workshop-main-button');
    addWorkshopButton(row, 'Undo', function () { stepObjectWorkshopHistory(state.undoStack, state.redoStack); }, 'Ctrl+Z');
    addWorkshopButton(row, 'Redo', function () { stepObjectWorkshopHistory(state.redoStack, state.undoStack); }, 'Ctrl+Y');
    addWorkshopButton(row, 'Revert', revertObjectWorkshop, 'Back to the last saved state');
    state.problemsElement = body.appendChild(createDebugElement('ul', 'workshop-problems'));
    state.problemsElement.id = 'workshop-problems';
    refreshObjectWorkshopProblems();
  } else {
    addWorkshopNote(body, 'This kind is written as code: LOOSE_OBJECT_KINDS in src/js/08-loose-objects.js. It can be looked at and tried here, not changed. ' +
      '"Copy of this" makes an object with the same shape and numbers that can be.');
  }
  state.readoutElement = body.appendChild(createDebugElement('pre', 'debug-readout'));
  state.readoutElement.id = 'workshop-object-readout';
  state.readoutTimer = 0;

  addWorkshopHeading(body, 'Try it');
  row = addWorkshopRow(body);
  addWorkshopButton(row, 'Drop it', function () { tryObjectWorkshopBody(0); }, 'Lets go of it from where it hangs').id = 'workshop-drop-object';
  addWorkshopButton(row, 'Throw it', function () { tryObjectWorkshopBody(1); }, 'A full throw, the way the view is looking');
  addWorkshopButton(row, 'As it lies', layObjectWorkshopBodyDown, 'On the floor, the way a station puts one out');
  addWorkshopButton(row, 'Back on the bench', rebuildObjectWorkshopBody).id = 'workshop-bench-object';
  addWorkshopNote(body, 'It falls, rolls and knocks as it will in play, with its own sound. To carry it, save it and leave the workshop: every kind has a button in debug mode (F2 in a descent).');

  addWorkshopHeading(body, 'Look');
  addWorkshopCheckbox(body, 'Lights on (L). Off: what the scanner shows, which is all a player sees of it', workshop.isLit, function (isLit) { setWorkshopLights(isLit); });
  addWorkshopCheckbox(body, 'Mark the balls it touches the station with (B)', state.showsShell, function (isOn) { state.showsShell = isOn; markWorkshopStateChanged(); },
    'An object does not touch with its boxes but with a shell of small balls made from them. This is why a box lands on a corner and tips over, and why a rod with round ends cannot stand.');
  const scaleChoices = [['', 'Nothing']];
  for (const key in LOOSE_OBJECT_KINDS) {
    if (key !== OBJECT_WORKSHOP_DRAFT_KEY) scaleChoices.push([key, 'A ' + LOOSE_OBJECT_KINDS[key].label]);
  }
  addWorkshopSelect(body, 'Beside it, for scale', LOOSE_OBJECT_KINDS[state.scaleKey] ? state.scaleKey : '', scaleChoices, function (key) {
    state.scaleKey = key; state.needsRebuild = true; markWorkshopStateChanged();
  }).id = 'workshop-object-scale';
  addWorkshopNote(body, 'Drag to circle it, wheel to come closer; A and D also circle. Space scans it by hand.' +
    (object ? ' Click a part to select it, drag it to move it (Ctrl: 5 cm steps). Arrow keys nudge it right, left, up and down, Page Up and Page Down away from you and towards you (Shift: 5 cm). R turns it, Shift+R tips it over.' : ''));
  if (!object) return;

  renderObjectWorkshopSelection(body);

  addWorkshopHeading(body, 'Parts (' + object.parts.length + ' of at most ' + DESIGNED_OBJECT_LIMITS.maximumParts + ')');
  row = addWorkshopRow(body);
  const shapeSelect = addWorkshopSelect(row, '', workshop.stored.objects.lastAddedShape || 'box', OBJECT_WORKSHOP_SHAPES, function (shape) { workshop.stored.objects.lastAddedShape = shape; });
  shapeSelect.id = 'workshop-add-shape';
  addWorkshopButton(row, 'Add', function () { workshop.stored.objects.lastAddedShape = shapeSelect.value; addObjectWorkshopPart(shapeSelect.value); }, 'Puts one on top of what is there').id = 'workshop-add-part';
  const list = body.appendChild(createDebugElement('div', 'workshop-list'));
  object.parts.forEach(function (part, partIndex) {
    const entry = createDebugElement('button', 'workshop-list-entry' + (partIndex === state.selectedIndex ? ' is-current' : ''), describeObjectWorkshopPart(part, partIndex));
    entry.type = 'button';
    entry.addEventListener('click', function () { entry.blur(); selectObjectWorkshopPart(partIndex === state.selectedIndex ? -1 : partIndex, true); });
    list.appendChild(entry);
  });

  addWorkshopHeading(body, 'The object');
  addWorkshopText(body, 'What it is called on screen ("Pick up the …")', object.label, function (value) {
    beginObjectWorkshopEdit('label'); state.object.label = value.trim().slice(0, 40) || state.key; finishObjectWorkshopEdit();
  }, 40).id = 'workshop-object-label';
  const keyBox = addWorkshopText(body, 'File name: src/objects/….json', state.key, function (value) {
    beginObjectWorkshopEdit('key'); state.key = state.object.key = value.trim(); finishObjectWorkshopEdit();
  }, 31);
  keyBox.id = 'workshop-object-key';
  keyBox.addEventListener('change', renderWorkshopPanel); // the list of objects at the top shows the new name
  addObjectWorkshopFields(body, DESIGNED_OBJECT_FIELDS);

  addWorkshopHeading(body, 'In generated stations');
  addWorkshopNote(body, 'How often a station has one lying about, among the other things of its sort. All three at 0: it is kept, and in no station. ' +
    'Anything above 0 changes what existing seeds produce.');
  addObjectWorkshopFields(body, DESIGNED_OBJECT_STATION_FIELDS);
}

// ---------------------------------------------------------------------------
// The mouse and the keyboard
// ---------------------------------------------------------------------------

function onObjectWorkshopPointerDown(event) {
  const state = objectWorkshop;
  state.drag = { lastClientX: event.clientX, lastClientY: event.clientY, grab: null };
  // Only on the bench can a part be taken hold of: once let go, the object lies however it fell.
  if (event.button !== 0 || !state.object || state.isTrying) return;
  if (state.needsRebuild) rebuildObjectWorkshopBody();
  const ray = computeWorkshopMouseRay(event);
  const distance = intersectRayWithLooseObject(state.body, ray.originX, ray.originY, ray.originZ, ray.directionX, ray.directionY, ray.directionZ, 50);
  if (distance < 0) return; // beside it: this drag circles it
  const partIndex = looseRayPartIndex;
  if (partIndex !== state.selectedIndex) selectObjectWorkshopPart(partIndex, true);
  // It is dragged across the plane that faces the view, through the point where it was taken hold of.
  state.drag.grab = {
    startClientX: event.clientX, startClientY: event.clientY, isMoving: false,
    point: [ray.originX + ray.directionX * distance, ray.originY + ray.directionY * distance, ray.originZ + ray.directionZ * distance],
    facing: [scannerBasis.forwardX, scannerBasis.forwardY, scannerBasis.forwardZ],
    part: JSON.stringify(state.object.parts[partIndex])
  };
}

function onObjectWorkshopPointerMove(event) {
  const state = objectWorkshop, drag = state.drag;
  if (!drag) return;
  const grab = drag.grab;
  if (!grab) {
    state.orbit.yaw = wrapAngleToPi(state.orbit.yaw + (event.clientX - drag.lastClientX) * 0.007);
    state.orbit.pitch -= (event.clientY - drag.lastClientY) * 0.005;
    drag.lastClientX = event.clientX; drag.lastClientY = event.clientY;
    return;
  }
  // A click that wobbles a pixel or two is still a click.
  if (!grab.isMoving && Math.abs(event.clientX - grab.startClientX) + Math.abs(event.clientY - grab.startClientY) < 4) return;
  grab.isMoving = true;
  const ray = computeWorkshopMouseRay(event);
  const towards = ray.directionX * grab.facing[0] + ray.directionY * grab.facing[1] + ray.directionZ * grab.facing[2];
  if (towards < 0.05) return;
  const distance = ((grab.point[0] - ray.originX) * grab.facing[0] + (grab.point[1] - ray.originY) * grab.facing[1] + (grab.point[2] - ray.originZ) * grab.facing[2]) / towards;
  const moved = [ray.originX + ray.directionX * distance - grab.point[0], ray.originY + ray.directionY * distance - grab.point[1], ray.originZ + ray.directionZ * distance - grab.point[2]];
  // Its middle (or a rod's first end) lands on whole centimetres.
  const start = JSON.parse(grab.part), anchor = start.shape === 'capsule' ? start.from : start.center;
  const snap = event.ctrlKey ? 0.05 : 0.01;
  replaceSelectedObjectWorkshopPart(shiftObjectWorkshopPart(start, moved.map(function (amount, axis) {
    return Math.round((anchor[axis] + amount) / snap) * snap - anchor[axis];
  })), 'drag');
}

function onObjectWorkshopPointerUp() {
  const state = objectWorkshop;
  if (!state.drag) return;
  const wasMoving = state.drag.grab && state.drag.grab.isMoving;
  state.drag = null;
  state.lastEditLabel = ''; // the next drag is its own step to undo
  markWorkshopStateChanged();
  if (wasMoving) renderWorkshopPanel(); // the list shows where the parts are
}

function onObjectWorkshopWheel(event) {
  objectWorkshop.orbit.distance *= event.deltaY > 0 ? 1.1 : 0.9;
  markWorkshopStateChanged();
}

function onObjectWorkshopKey(event) {
  const state = objectWorkshop;
  const hasCommandKey = event.ctrlKey || event.metaKey;
  if (hasCommandKey && event.code === 'KeyZ') { if (event.shiftKey) stepObjectWorkshopHistory(state.redoStack, state.undoStack); else stepObjectWorkshopHistory(state.undoStack, state.redoStack); return true; }
  if (hasCommandKey && event.code === 'KeyY') { stepObjectWorkshopHistory(state.redoStack, state.undoStack); return true; }
  if (hasCommandKey && event.code === 'KeyD') { duplicateSelectedObjectWorkshopPart(); return true; }
  if (hasCommandKey || event.altKey) return false;
  const part = state.object ? state.object.parts[state.selectedIndex] : null;
  if (part) {
    const step = event.shiftKey ? 0.05 : 0.01;
    const nudges = { ArrowRight: [step, 0, 0], ArrowLeft: [-step, 0, 0], ArrowUp: [0, step, 0], ArrowDown: [0, -step, 0], PageUp: [0, 0, -step], PageDown: [0, 0, step] };
    if (nudges[event.code]) { replaceSelectedObjectWorkshopPart(shiftObjectWorkshopPart(part, nudges[event.code]), 'nudge'); return true; }
    if (event.code === 'KeyR') { turnSelectedObjectWorkshopPart(event.shiftKey); return true; }
  }
  if (event.repeat) return false;
  if (part && (event.code === 'Delete' || event.code === 'Backspace')) { deleteSelectedObjectWorkshopPart(); return true; }
  if (part && event.code === 'Escape') { selectObjectWorkshopPart(-1); return true; }
  if (event.code === 'KeyB') { state.showsShell = !state.showsShell; markWorkshopStateChanged(); renderWorkshopPanel(); return true; }
  return false;
}

// ---------------------------------------------------------------------------
// Every frame
// ---------------------------------------------------------------------------

// The camera circles the bench, or the object itself once it has been let go of.
function placeObjectWorkshopCamera(dt) {
  const state = objectWorkshop, orbit = state.orbit;
  const bench = getObjectWorkshopBench();
  const target = state.isTrying && state.body ? [state.body.x, state.body.y, state.body.z] : bench;
  if (!state.focus) state.focus = bench.slice();
  const follow = Math.min(1, dt * 7);
  for (let axis = 0; axis < 3; axis++) state.focus[axis] += (target[axis] - state.focus[axis]) * follow;
  orbit.distance = clampNumber(orbit.distance, 0.25, 3);
  orbit.pitch = clampNumber(orbit.pitch, -1.4, 0.6);
  const cosinePitch = Math.cos(orbit.pitch);
  // Never through a wall, the floor or the ceiling of the test room.
  const low = 0.15, high = OBJECT_WORKSHOP_STAGE_SIZE - 0.15;
  placeWorkshopCamera(
    clampNumber(state.focus[0] - Math.sin(orbit.yaw) * cosinePitch * orbit.distance, WORKSHOP_ORIGIN_X + low, WORKSHOP_ORIGIN_X + high),
    clampNumber(state.focus[1] - Math.sin(orbit.pitch) * orbit.distance, 0.1, OBJECT_WORKSHOP_CEILING - 0.1),
    clampNumber(state.focus[2] + Math.cos(orbit.yaw) * cosinePitch * orbit.distance, WORKSHOP_ORIGIN_Z + low, WORKSHOP_ORIGIN_Z + high),
    orbit.yaw, orbit.pitch);
}

function updateObjectWorkshop(dt) {
  const state = objectWorkshop, orbit = state.orbit, keys = input.keysDown;
  if (state.needsRebuild) rebuildObjectWorkshopBody();
  orbit.yaw = wrapAngleToPi(orbit.yaw + ((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)) * dt * 1.4);
  orbit.distance += ((keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0)) * dt * 1.5;
  input.lookDeltaX = 0; input.lookDeltaY = 0;

  // Let go of, it is in the hands of the game's own steps, and is heard as it will be in play.
  if (state.isTrying) {
    looseState.accumulator = Math.min(looseState.accumulator + dt, TUNING.looseStepSeconds * 8);
    while (looseState.accumulator >= TUNING.looseStepSeconds) {
      looseState.accumulator -= TUNING.looseStepSeconds;
      stepLooseObjects(TUNING.looseStepSeconds);
    }
    for (const object of looseObjects.slice()) if (object.knockSpeed > 0) reportLooseObjectKnock(object); // a copy: one that shatters leaves the list
  }
  placeObjectWorkshopCamera(dt);
  updateAudioListener(player.x, getPlayerEyeY(), player.z, player.yaw);

  state.readoutTimer -= dt;
  if (state.readoutTimer <= 0 && state.readoutElement) {
    state.readoutTimer = 0.2;
    state.readoutElement.textContent = buildObjectWorkshopReadout();
  }
}

function addObjectWorkshopOverlays() {
  const state = objectWorkshop, body = state.body;
  if (!body || body.isRemoved) return; // nothing there, or it shattered when it was tried
  if (state.showsShell) {
    // A small cross for each ball, as big as the ball is.
    const shell = body.prepared.shell, matrix = body.matrix;
    for (let ballIndex = 0; ballIndex < body.prepared.shellCount; ballIndex++) {
      const localX = shell[ballIndex * 4], localY = shell[ballIndex * 4 + 1], localZ = shell[ballIndex * 4 + 2], radius = shell[ballIndex * 4 + 3];
      const x = body.x + matrix[0] * localX + matrix[1] * localY + matrix[2] * localZ;
      const y = body.y + matrix[3] * localX + matrix[4] * localY + matrix[5] * localZ;
      const z = body.z + matrix[6] * localX + matrix[7] * localY + matrix[8] * localZ;
      pushDebugLine(x - radius, y, z, x + radius, y, z, 0.3, 0.9, 1.0);
      pushDebugLine(x, y - radius, z, x, y + radius, z, 0.3, 0.9, 1.0);
      pushDebugLine(x, y, z - radius, x, y, z + radius, 0.3, 0.9, 1.0);
    }
  }
  if (state.isTrying) return;
  // The object's own origin, and which way is which: red x (to your right), green y (up), blue z (towards you).
  const bench = getObjectWorkshopBench();
  pushDebugLine(bench[0], bench[1], bench[2], bench[0] + 0.25, bench[1], bench[2], 1.0, 0.3, 0.25);
  pushDebugLine(bench[0], bench[1], bench[2], bench[0], bench[1] + 0.25, bench[2], 0.3, 1.0, 0.35);
  pushDebugLine(bench[0], bench[1], bench[2], bench[0], bench[1], bench[2] + 0.25, 0.35, 0.5, 1.0);
  const part = state.object && !state.needsRebuild ? state.object.parts[state.selectedIndex] : null;
  if (part) {
    const extents = getObjectWorkshopExtents([part]), margin = 0.006;
    pushWorkshopBoxLines(bench[0] + extents.low[0] - margin, bench[1] + extents.low[1] - margin, bench[2] + extents.low[2] - margin,
      bench[0] + extents.high[0] + margin, bench[1] + extents.high[1] + margin, bench[2] + extents.high[2] + margin, 1.0, 1.0, 1.0);
  }
}

workshop.tools.objects = {
  label: 'Objects',
  initialize: function () { /* nothing to prepare */ },
  open: function (stored) {
    const state = objectWorkshop;
    state.showsShell = stored.showsShell === true;
    state.scaleKey = typeof stored.scaleKey === 'string' ? stored.scaleKey : '';
    if (stored.orbit && Number.isFinite(stored.orbit.yaw + stored.orbit.pitch + stored.orbit.distance)) {
      state.orbit.yaw = stored.orbit.yaw; state.orbit.pitch = stored.orbit.pitch; state.orbit.distance = stored.orbit.distance;
    }
    state.focus = null;
    buildObjectWorkshopStage();
    let hasDraft = stored.draft && typeof stored.draft === 'object' && typeof stored.key === 'string';
    // Work in progress that is the same as the file is not work in progress (it was saved just before a reload).
    if (hasDraft && stored.savedKey === stored.key && designedObjects[stored.key] &&
        JSON.stringify(normalizeDesignedObject(stored.draft, stored.key)) === JSON.stringify(designedObjects[stored.key])) hasDraft = false;
    if (hasDraft) openObjectInWorkshop(stored.key, stored.draft, stored.savedKey && designedObjects[stored.savedKey] ? stored.savedKey : null);
    else openObjectInWorkshop(LOOSE_OBJECT_KINDS[stored.key] && stored.key !== OBJECT_WORKSHOP_DRAFT_KEY ? stored.key : getDefaultObjectWorkshopKey());
    if (state.object && Number.isInteger(stored.selectedIndex)) state.selectedIndex = clampNumber(stored.selectedIndex, -1, state.object.parts.length - 1);
    placeObjectWorkshopCamera(1);
  },
  close: function () {
    const state = objectWorkshop;
    state.drag = null; state.body = null; state.readoutElement = null; state.saveButton = null; state.problemsElement = null;
    delete LOOSE_OBJECT_KINDS[OBJECT_WORKSHOP_DRAFT_KEY];
  },
  storeState: function (stored) {
    const state = objectWorkshop;
    stored.key = state.key;
    stored.savedKey = state.savedKey;
    stored.draft = state.object && state.isDirty ? state.object : null;
    stored.selectedIndex = state.selectedIndex;
    stored.showsShell = state.showsShell;
    stored.scaleKey = state.scaleKey;
    stored.orbit = state.orbit;
  },
  save: saveObjectWorkshop,
  moveCameraInside: function () { placeObjectWorkshopCamera(1); }, // it always is: the camera circles inside the test room
  update: updateObjectWorkshop,
  addOverlays: addObjectWorkshopOverlays,
  renderPanel: renderObjectWorkshopPanel,
  onPointerDown: onObjectWorkshopPointerDown,
  onPointerMove: onObjectWorkshopPointerMove,
  onPointerUp: onObjectWorkshopPointerUp,
  onWheel: onObjectWorkshopWheel,
  onKey: onObjectWorkshopKey
};
