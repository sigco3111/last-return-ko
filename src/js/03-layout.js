// ---------------------------------------------------------------------------
// The rooms of the Kessel-9 pumping annex, each described once so it can be used two ways:
//   the classic station puts every room exactly where these numbers say;
//   a generated station (03-levelgen.js) moves and turns the same rooms into a new arrangement.
// Coordinates are metres. X runs east, Z runs south, Y is up.
// ---------------------------------------------------------------------------

const OBJECT_LIFT_TERMINAL = 1;
const OBJECT_GENERATOR = 2;
const OBJECT_SPOOL_1 = 3;
const OBJECT_SPOOL_2 = 4;
const OBJECT_SPOOL_3 = 5;
const OBJECT_KEYCARD = 6;
const OBJECT_NOTE_SECURITY = 7;
const OBJECT_NOTE_LOCKER = 8;
const OBJECT_NOTE_LAB = 9;
const OBJECT_NOTE_ARCHIVE = 10;

// Where things are in the station that is loaded. The rooms below fill these in as they are built,
// so they are right for the classic station and for generated ones.
const PLAYER_START = { x: 6.5, z: 53.5, yaw: Math.PI / 2 };
const LIFT_CAR_BOUNDS = { minimumX: 5, maximumX: 8, minimumZ: 52, maximumZ: 55 };
const GENERATOR_POSITION = { x: 71.5, y: 1.0, z: 47.5 };
const LIFT_POSITION = { x: 8.5, y: 1.2, z: 53.5 };
const SHAFT_POSITION = { x: 59.5, y: 0, z: 8.5 };
const HOLLOW_SPAWN_POSITION = { x: 52.5, z: 12.5 };

const stillSpawnPoints = [];
const lateStillSpawnPoints = [];
const phantomDefinitions = [];
let liftDoor = null;

function addNote(objectId, x, y, z, yaw) {
  const paper = addBoxProp(x, y, z, 0.11, 0.008, 0.15, { yaw: yaw, surfaceClass: SURFACE_INTERACTIVE, blocksMovement: false, isDynamic: true });
  registerInteractable(objectId, x, y, z, 'Read the note', [paper], { mapLabel: 'NOTE' });
}

function addSurveySpool(objectId, x, y, z, label) {
  const reelCore = addBoxProp(x, y + 0.07, z, 0.1, 0.07, 0.1, { surfaceClass: SURFACE_INTERACTIVE, blocksMovement: false, isDynamic: true });
  const reelBase = addBoxProp(x, y + 0.005, z, 0.14, 0.012, 0.14, { yaw: 0.78, surfaceClass: SURFACE_INTERACTIVE, blocksMovement: false, isDynamic: true });
  const reelCap = addBoxProp(x, y + 0.15, z, 0.14, 0.012, 0.14, { yaw: 0.78, surfaceClass: SURFACE_INTERACTIVE, blocksMovement: false, isDynamic: true });
  registerInteractable(objectId, x, y + 0.08, z, 'Take survey spool', [reelCore, reelBase, reelCap], { removeWhenUsed: true, mapLabel: label });
}


function addKeycard(x, y, z) {
  const keycard = addBoxProp(x, y, z, 0.07, 0.01, 0.045, { yaw: 0.5, surfaceClass: SURFACE_INTERACTIVE, blocksMovement: false, isDynamic: true });
  const keycardLanyard = addBoxProp(x + 0.15, y - 0.003, z + 0.1, 0.1, 0.006, 0.012, { yaw: 1.1, surfaceClass: SURFACE_INTERACTIVE, blocksMovement: false, isDynamic: true });
  registerInteractable(OBJECT_KEYCARD, x, y + 0.025, z, 'Take keycard', [keycard, keycardLanyard], { removeWhenUsed: true, mapLabel: 'KEYCARD' });
}

// A generated station may move the first spool or the keycard out of its usual room (see 03-levelgen.js).
const relocatedObjectives = { spool1: false, keycard: false };
function isObjectivePlacedInItsUsualRoom(objectiveName) {
  return !relocatedObjectives[objectiveName];
}

// Adds [x, z] points (and anything after x and z in each entry) to a list, moved and turned with the room.
function pushPlacedPoints(target) {
  for (let argumentIndex = 1; argumentIndex < arguments.length; argumentIndex++) {
    const point = arguments[argumentIndex];
    const placed = placePoint(point[0], point[1]);
    target.push([placed[0], placed[1]].concat(point.slice(2)));
  }
}

function setLevelPlayerStart(x, z, yaw) {
  const placed = placePoint(x, z);
  PLAYER_START.x = placed[0]; PLAYER_START.z = placed[1]; PLAYER_START.yaw = wrapAngleToPi(placeYaw(yaw));
}

function setLevelLift(carStartX, carStartZ, carEndX, carEndZ, doorX, doorZ) {
  const cornerA = placePoint(carStartX, carStartZ), cornerB = placePoint(carEndX, carEndZ), door = placePoint(doorX, doorZ);
  LIFT_CAR_BOUNDS.minimumX = Math.min(cornerA[0], cornerB[0]); LIFT_CAR_BOUNDS.maximumX = Math.max(cornerA[0], cornerB[0]);
  LIFT_CAR_BOUNDS.minimumZ = Math.min(cornerA[1], cornerB[1]); LIFT_CAR_BOUNDS.maximumZ = Math.max(cornerA[1], cornerB[1]);
  LIFT_POSITION.x = door[0]; LIFT_POSITION.z = door[1];
}

function setLevelAttractCamera(x, y, z, yaw) {
  const placed = placePoint(x, z);
  level.attractCamera.x = placed[0]; level.attractCamera.y = y; level.attractCamera.z = placed[1];
  level.attractCamera.yaw = placeYaw(yaw);
}

function setLevelGenerator(x, z, approachX, approachZ) {
  const placed = placePoint(x, z), approach = placePoint(approachX, approachZ);
  GENERATOR_POSITION.x = placed[0]; GENERATOR_POSITION.z = placed[1];
  level.generatorApproachX = approach[0]; level.generatorApproachZ = approach[1];
}

function setLevelShaft(x, z, hollowSpawnX, hollowSpawnZ) {
  const placed = placePoint(x, z), spawn = placePoint(hollowSpawnX, hollowSpawnZ);
  SHAFT_POSITION.x = placed[0]; SHAFT_POSITION.z = placed[1];
  HOLLOW_SPAWN_POSITION.x = spawn[0]; HOLLOW_SPAWN_POSITION.z = spawn[1];
}

// How far a point is outside the lift car (0 when inside it).
function distanceOutsideLiftCar(x, z) {
  const deltaX = Math.max(LIFT_CAR_BOUNDS.minimumX - x, 0, x - LIFT_CAR_BOUNDS.maximumX);
  const deltaZ = Math.max(LIFT_CAR_BOUNDS.minimumZ - z, 0, z - LIFT_CAR_BOUNDS.maximumZ);
  return Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
}

// ---------------------------------------------------------------------------
// Carving: hollowing each room out of the rock. Coordinates are the room's place in the classic station.
// ---------------------------------------------------------------------------

function carveLiftLobby() {
  carveRoom(5, 52, 8, 55, 2.5, ZONE_LIFT_CAR);
  carveRoom(9, 49, 18, 58, 3.4, ZONE_LOBBY);
  liftDoor = addDoor(8, 53, DOOR_KIND_LIFT);
  setLevelPlayerStart(6.5, 53.5, Math.PI / 2);
  setLevelLift(5, 52, 8, 55, 8.5, 53.5);
  setLevelAttractCamera(16.9, 1.5, 50.3, -1.95);
}
function carveSecurityOffice() { carveRoom(10, 43, 16, 48, 2.8, ZONE_SECURITY_OFFICE); }
function carveLockerRoom() { carveRoom(22, 55, 29, 61, 2.8, ZONE_LOCKER_ROOM); }
function carveMessRoom() { carveRoom(22, 45, 30, 51, 2.8, ZONE_BREAK_ROOM); }
function carveStoreCloset() { carveRoom(33, 55, 37, 59, 2.6, ZONE_CLOSET); }
function carvePumpHall() {
  carveRoom(47, 38, 66, 58, 7.0, ZONE_PUMP_HALL);
  setTileFlagInRectangle(56, 51, 66, 58, TILE_FLAG_WATER);
  setTileFlagInRectangle(49, 46, 64, 47, TILE_FLAG_HAZARD);
  setTileFlagInRectangle(49, 50, 56, 51, TILE_FLAG_HAZARD);
}
function carveGeneratorRoom() {
  carveRoom(67, 44, 74, 51, 3.5, ZONE_GENERATOR_ROOM);
  setLevelGenerator(71.5, 47.5, 68.5, 47.5);
}
function carveControlRoom() { carveRoom(50, 32, 58, 37, 2.8, ZONE_CONTROL_ROOM); }
function carveLaboratory() { carveRoom(9, 26, 19, 35, 3.0, ZONE_LAB); }
function carveColdRoom() { carveRoom(10, 18, 16, 25, 2.6, ZONE_COLD_ROOM); }
function carveArchive() { carveRoom(20, 24, 42, 37, 3.2, ZONE_ARCHIVE); }
function carveCalibrationStore() {
  carveRoom(24, 10, 40, 23, 4.0, ZONE_CALIBRATION_STORE);
  level.storeZone = resolveZone(ZONE_CALIBRATION_STORE);
}
// Shaft 9: a round pit with a grated bridge out to a platform in the middle.
function carveShaftChamber() {
  carveRoom(49, 2, 69, 15, 9.0, ZONE_SHAFT);
  for (let tileZ = 2; tileZ < 15; tileZ++) {
    for (let tileX = 49; tileX < 69; tileX++) {
      const fromCenterX = tileX + 0.5 - 59.5, fromCenterZ = tileZ + 0.5 - 8.5;
      const isInsidePit = Math.sqrt(fromCenterX * fromCenterX + fromCenterZ * fromCenterZ) < 4.3;
      const isPlatform = Math.abs(fromCenterX) <= 1.5 && Math.abs(fromCenterZ) <= 1.5;
      const isBridge = tileX === 59 && tileZ >= 10 && tileZ <= 13;
      if (isInsidePit) setPitTile(tileX, tileZ, !isPlatform && !isBridge);
    }
  }
  setTileFlagInRectangle(54, 13, 65, 15, TILE_FLAG_HAZARD);
  setLevelShaft(59.5, 8.5, 52.5, 12.5);
}

// ---------------------------------------------------------------------------
// Furnishing: everything that stands in each room.
// ---------------------------------------------------------------------------

// The lift car and the lobby it opens onto.
function furnishLiftLobby(random) {
  addPipeAlongX(5.1, 7.9, 1.0, 52.07, 0.025);
  addPipeAlongX(5.1, 7.9, 1.0, 54.93, 0.025);
  addPipeAlongZ(52.1, 54.9, 1.0, 5.07, 0.025);
  addBoxProp(7.95, 1.3, 54.4, 0.04, 0.22, 0.14, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addCeilingLamp(6.5, 53.5, 2.5, true);
  addBoxBetween(9.0, 0, 55.0, 9.34, 1.35, 55.6, { surfaceClass: SURFACE_METAL });
  const terminalScreen = addBoxBetween(9.34, 0.95, 55.08, 9.39, 1.3, 55.52,
    { surfaceClass: SURFACE_INTERACTIVE, blocksMovement: false, isDynamic: true });
  registerInteractable(OBJECT_LIFT_TERMINAL, 9.4, 1.15, 55.3, 'Use lift terminal', [terminalScreen], { mapLabel: 'LIFT' });
  // reception desk, a U shape open to the south
  addBoxBetween(12.1, 0, 52.8, 14.9, 1.05, 53.3);
  addBoxBetween(12.1, 0, 53.3, 12.5, 1.05, 54.6);
  addBoxBetween(14.5, 0, 53.3, 14.9, 1.05, 54.6);
  addBoxProp(13.0, 1.27, 53.05, 0.24, 0.17, 0.03, { yaw: 0.15, blocksMovement: false });
  addBoxProp(14.1, 1.27, 53.05, 0.24, 0.17, 0.03, { yaw: -0.2, blocksMovement: false });
  addChair(13.5, 54.2, 2.6, false);
  addBoxBetween(10.8, 0, 50.3, 11.2, 3.4, 50.7);
  addBoxBetween(15.8, 0, 56.3, 16.2, 3.4, 56.7);
  addBoxBetween(11.5, 0, 57.4, 14.5, 0.45, 57.9);
  addBoxBetween(11.5, 0.45, 57.82, 14.5, 0.95, 57.9, CLUTTER);
  addCylinderProp(AXIS_Y, 17.3, 0.25, 49.7, 0.25, 0.25);
  for (let stemIndex = 0; stemIndex < 5; stemIndex++) {
    addCylinderProp(AXIS_Y, 17.3 + (random() - 0.5) * 0.3, 0.5 + 0.35 + random() * 0.3, 49.7 + (random() - 0.5) * 0.3, 0.012, 0.35 + random() * 0.3, CLUTTER);
  }
  addCeilingLamp(13.5, 51, 3.4, true);
  addCeilingLamp(13.5, 56, 3.4, true);
  addBoxProp(16.3, 0.06, 51.5, 0.6, 0.05, 0.1, { yaw: 0.55, blocksMovement: false });
  addCrate(10.1, 57.3, 0.28, 0.3, 0);
  addBoxProp(10.2, 0.2, 56.5, 0.32, 0.2, 0.12, { yaw: 1.2, blocksMovement: false });
  addWallSign('KESSEL-9 · INTAKE LEVEL', 13, 49, WALL_NORTH, { width: 5.2, height: 0.46, centerY: 2.98 });
  addWallSign('LIFT', 9, 53, WALL_WEST, { width: 0.95, height: 0.36, centerY: 2.78 });
}

// Security office.
function furnishSecurityOffice(random) {
  addTable(14.9, 45.3, 0, 1.0, 2.6, 0.76);
  for (let monitorIndex = 0; monitorIndex < 3; monitorIndex++) {
    addBoxProp(15.2, 0.96, 44.5 + monitorIndex * 0.8, 0.03, 0.17, 0.22, { yaw: (monitorIndex - 1) * 0.25, blocksMovement: false });
  }
  addChair(13.9, 45.7, 1.9, true);
  addBoxBetween(10.0, 0, 44.1, 10.5, 1.3, 44.7, { surfaceClass: SURFACE_METAL });
  addBoxBetween(10.0, 0, 44.8, 10.5, 1.3, 45.4, { surfaceClass: SURFACE_METAL });
  addBoxBetween(10.0, 0, 45.5, 10.5, 1.3, 46.1, { surfaceClass: SURFACE_METAL });
  addBoxBetween(10.05, 0.5, 46.25, 10.9, 0.62, 46.75, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addBoxProp(11.0, 1.5, 47.94, 0.3, 0.3, 0.05, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addCeilingLamp(13, 45.5, 2.8, false);
  addNote(OBJECT_NOTE_SECURITY, 14.75, 0.77, 46.2, 0.3);
  addWallSign('SECURITY', 13, 49, WALL_NORTH, { width: 1.1, height: 0.2, centerY: 2.52, alongOffset: 0 });
}

// Locker room.
function furnishLockerRoom(random) {
  for (let lockerIndex = 0; lockerIndex < 9; lockerIndex++) {
    addLocker(22.24, 56.2 + lockerIndex * 0.5, Math.PI / 2, lockerIndex === 3 || lockerIndex === 6);
    if (lockerIndex !== 4) addLocker(28.76, 56.2 + lockerIndex * 0.5, -Math.PI / 2, lockerIndex === 1);
  }
  addBoxBetween(25.2, 0, 56.8, 25.8, 0.45, 59.2);
  addBoxBetween(23.6, 0, 59.7, 23.66, 2.0, 60.95);
  addBoxBetween(25.4, 0, 59.7, 25.46, 2.0, 60.95);
  addBoxBetween(27.2, 0, 59.7, 27.26, 2.0, 60.95);
  addVerticalPipe(24.5, 60.9, 0, 2.1, 0.02, false);
  addVerticalPipe(26.3, 60.9, 0, 2.1, 0.02, false);
  addBoxProp(26.6, 0.12, 57.6, 0.2, 0.12, 0.3, { yaw: 0.7, blocksMovement: false });
  addCeilingLamp(25.5, 57.5, 2.8, false);
  addNote(OBJECT_NOTE_LOCKER, 25.5, 0.46, 58.3, -0.4);
}

// Mess room.
function furnishMessRoom(random) {
  addBoxBetween(22.3, 0, 45.0, 27.5, 0.9, 45.6);
  addBoxBetween(22.3, 1.5, 45.0, 27.5, 2.2, 45.35, CLUTTER);
  addBoxBetween(28.2, 0, 45.0, 29.0, 1.9, 45.8, { surfaceClass: SURFACE_METAL });
  addBoxBetween(22.0, 0, 48.6, 22.7, 1.9, 49.6, { surfaceClass: SURFACE_METAL });
  addRoundTable(24.3, 48.2, 0.6);
  addChair(23.5, 47.7, 2.1, false);
  addChair(25.1, 48.6, -1.2, false);
  addChair(24.6, 49.3, 0.4, true);
  addRoundTable(27.4, 47.5, 0.6);
  addChair(27.2, 46.6, 3.0, false);
  addChair(28.1, 48.3, -2.2, true);
  addCylinderProp(AXIS_Y, 24.2, 0.82, 48.1, 0.04, 0.05, CLUTTER);
  addCylinderProp(AXIS_Y, 27.6, 0.82, 47.4, 0.04, 0.05, CLUTTER);
  addCylinderProp(AXIS_Y, 24.6, 0.95, 45.3, 0.09, 0.05, CLUTTER);
  addCeilingLamp(25.5, 48, 2.8, true);
}

// Store closet.
function furnishStoreCloset(random) {
  addShelfRackAlongZ(33.3, 55.2, 58.8, 2.2, random, 0.7);
  addShelfRackAlongZ(36.7, 56.2, 58.8, 2.2, random, 0.6);
  addCrate(35.0, 58.4, 0.3, 0.2, 0);
  addCylinderProp(AXIS_Y, 34.3, 0.18, 56.3, 0.17, 0.18, CLUTTER);
  addVerticalPipe(34.35, 56.2, 0.2, 1.4, 0.015, false);
}

// Pump hall B.
function furnishPumpHall(random) {
  addTank(51.5, 42.5, 1.5, 5.2);
  addTank(56.5, 42.5, 1.5, 5.2);
  addTank(61.5, 42.5, 1.5, 5.2);
  addPumpUnit(51.5, 48.5);
  addPumpUnit(56.5, 48.5);
  addPumpUnit(61.5, 48.5);
  addPipeAlongZ(44.0, 48.0, 0.55, 52.0, 0.11);
  addPipeAlongZ(44.0, 48.0, 0.55, 57.0, 0.11);
  addPipeAlongZ(44.0, 48.0, 0.55, 62.0, 0.11);
  addPipeAlongX(47, 66, 5.5, 48.5, 0.2);
  addPipeAlongX(47, 66, 6.2, 42.5, 0.25);
  addPipeAlongZ(38, 58, 5.9, 59.2, 0.16);
  addPipeAlongX(47, 66, 0.4, 57.75, 0.12);
  addBoxBetween(48.6, 0, 44.6, 49.4, 7, 45.4);
  addBoxBetween(48.6, 0, 54.6, 49.4, 7, 55.4);
  addBoxBetween(63.6, 0, 44.6, 64.4, 7, 45.4);
  addBoxBetween(63.6, 0, 54.6, 64.4, 7, 55.4);
  const chainPositions = [[53.2, 52.3, 2.3], [58.7, 53.6, 2.0], [60.4, 45.2, 2.6], [54.6, 55.5, 2.2], [50.4, 40.2, 2.8]];
  for (const chain of chainPositions) {
    addVerticalPipe(chain[0], chain[1], chain[2], 7, 0.02, false);
    addSphereProp(chain[0], chain[2] - 0.08, chain[1], 0.09, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  }
  addCrateStack(48.3, 39.3, random);
  addBarrel(64.8, 39.2);
  addBarrel(64.1, 39.4);
  addBarrel(64.9, 40.0);
  addCrateStack(50.0, 56.6, random);
  addBoxProp(60.5, 0.22, 54.5, 0.4, 0.3, 0.4, { yaw: 0.4 });
  addCylinderProp(AXIS_X, 62.2, 0.27, 56.2, 0.29, 0.44, { surfaceClass: SURFACE_METAL });
  addBoxProp(58.2, 0.16, 52.6, 0.5, 0.05, 0.35, { yaw: -0.5, blocksMovement: false });
  addBoxBetween(47.0, 0, 55.6, 47.5, 1.6, 57.0, { surfaceClass: SURFACE_METAL });
  if (!placement.isGenerating) addWallSign('GENERATOR 2', 65, 47, WALL_EAST, { width: 2.6, height: 0.42, centerY: 2.95 });
  if (!placement.isGenerating) addWallSign('CONTROL ROOM', 54, 38, WALL_NORTH, { width: 2.6, height: 0.4, centerY: 2.95 });
  addWallSign('PUMP HALL B', 47, 52, WALL_WEST, { width: 4.4, height: 0.7, centerY: 3.7, alongOffset: 0.5 });
  addWallSign('DANGER · FLOODED BELOW THIS LINE', 60, 57, WALL_SOUTH, { width: 5.5, height: 0.3, centerY: 1.4 });
}

// Generator room.
function furnishGeneratorRoom(random) {
  addBoxBetween(69.9, 0, 46.7, 73.1, 1.7, 48.3, { surfaceClass: SURFACE_METAL });
  addBoxBetween(73.1, 0.2, 46.9, 73.5, 1.6, 48.1, { surfaceClass: SURFACE_METAL });
  addVerticalPipe(72.5, 47.5, 1.7, 3.5, 0.12, false);
  addCylinderProp(AXIS_X, 70.6, 1.95, 47.5, 0.25, 0.5, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  const generatorPanel = addBoxBetween(69.82, 0.9, 47.15, 69.9, 1.5, 47.85,
    { surfaceClass: SURFACE_INTERACTIVE, blocksMovement: false, isDynamic: true });
  registerInteractable(OBJECT_GENERATOR, 69.8, 1.2, 47.5, 'Start the generator', [generatorPanel], { mapLabel: 'GENERATOR' });
  addBarrel(67.45, 44.45);
  addBarrel(68.15, 44.45);
  addBarrel(67.45, 45.2);
  addBarrel(73.4, 50.4);
  addCylinderProp(AXIS_Z, 72.4, 0.29, 50.3, 0.29, 0.44, { surfaceClass: SURFACE_METAL });
  addTable(69.6, 50.45, 0, 2.6, 0.9, 0.85);
  addBoxProp(69.1, 0.95, 50.5, 0.25, 0.1, 0.14, { yaw: 0.2, surfaceClass: SURFACE_METAL, blocksMovement: false });
  addBoxBetween(67.0, 2.8, 44.0, 74.0, 2.9, 44.3, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addCeilingLamp(70.5, 47.5, 3.5, true);
  addWallSign('DO NOT START IT', 70, 44, WALL_NORTH, { width: 3.6, height: 0.55, centerY: 1.6, alongOffset: 0.5, isScrawled: true });
  addWallSign('GENERATOR 2 · 400 V', 72, 50, WALL_SOUTH, { width: 2.4, height: 0.26, centerY: 2.2 });
}

// Control room.
function furnishControlRoom(random) {
  addBoxBetween(50.0, 0, 33.0, 50.8, 0.95, 35.8, { surfaceClass: SURFACE_METAL });
  addBoxBetween(50.0, 0.95, 33.0, 50.35, 1.6, 35.8, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  for (let gaugeIndex = 0; gaugeIndex < 5; gaugeIndex++) {
    addCylinderProp(AXIS_X, 50.38, 1.3, 33.3 + gaugeIndex * 0.55, 0.11, 0.03, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  }
  addTable(53.0, 34.3, 0, 1.6, 0.8, 0.76);
  addChair(53.1, 35.1, 0.3, false);
  addChair(51.6, 34.4, 1.4, true);
  addBoxBetween(57.3, 0, 32.2, 57.95, 1.9, 33.4, { surfaceClass: SURFACE_METAL });
  addBoxProp(57.94, 1.5, 34.6, 0.04, 0.4, 0.6, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addCeilingLamp(53.5, 34.5, 2.8, true);
  if (isObjectivePlacedInItsUsualRoom('spool1')) addSurveySpool(OBJECT_SPOOL_1, 53.0, 0.77, 34.3, 'SPOOL');
  addWallSign('PUMP CONTROL', 53, 32, WALL_NORTH, { width: 2.4, height: 0.3, centerY: 2.2 });
  if (!placement.isGenerating) addWallSign('DEEP CORRIDOR', 56, 32, WALL_NORTH, { width: 0.95, height: 0.16, centerY: 2.5 });
}

// Laboratory.
function furnishLaboratory(random) {
  addBoxBetween(9.2, 0, 26.0, 12.4, 0.9, 26.6);
  addBoxBetween(14.4, 0, 26.0, 18.3, 0.9, 26.6);
  addBoxBetween(12.0, 0, 30.0, 15.2, 0.9, 31.2);
  for (let glassIndex = 0; glassIndex < 9; glassIndex++) {
    const glassX = glassIndex < 4 ? 9.6 + glassIndex * 0.7 : (glassIndex < 7 ? 15 + (glassIndex - 4) * 0.9 : 12.6 + (glassIndex - 7) * 1.6);
    const glassZ = glassIndex < 7 ? 26.3 : 30.4;
    if (glassIndex % 2 === 0) addCylinderProp(AXIS_Y, glassX, 1.02, glassZ, 0.045, 0.12, CLUTTER);
    else addSphereProp(glassX, 1.0, glassZ, 0.09, CLUTTER);
  }
  addBoxBetween(9.0, 0, 31.5, 9.8, 2.2, 33.5, { surfaceClass: SURFACE_METAL });
  addBoxBetween(18.5, 0, 27.2, 19.0, 2.0, 29.2);
  addCylinderProp(AXIS_Y, 13.0, 0.3, 31.9, 0.17, 0.3, CLUTTER);
  addCylinderProp(AXIS_Y, 14.6, 0.3, 29.4, 0.17, 0.3, CLUTTER);
  addCylinderProp(AXIS_X, 11.2, 0.17, 28.3, 0.17, 0.3, CLUTTER);
  addTable(17.3, 33.4, 0, 1.4, 0.8, 0.76);
  addChair(17.2, 32.5, 3.3, false);
  addCeilingLamp(13.5, 28.5, 3.0, true);
  addCeilingLamp(13.5, 32.5, 3.0, true);
  addNote(OBJECT_NOTE_LAB, 13.0, 0.91, 30.6, 0.2);
  if (isObjectivePlacedInItsUsualRoom('keycard')) addKeycard(17.3, 0.775, 33.4);
  addWallSign('LABORATORY 2', 12, 34, WALL_SOUTH, { width: 0.95, height: 0.18, centerY: 2.6 });
}

// Cold room.
function furnishColdRoom(random) {
  addGurney(11.2, 21.2, 0.0, true);
  addGurney(14.7, 20.4, 0.14, true);
  addGurney(12.9, 22.9, 1.45, false);
  for (let drawerColumn = 0; drawerColumn < 6; drawerColumn++) {
    for (let drawerRow = 0; drawerRow < 2; drawerRow++) {
      const isPulledOut = drawerColumn === 4 && drawerRow === 0;
      addBoxBetween(10.05 + drawerColumn, 0.1 + drawerRow * 0.9, 18.0, 10.95 + drawerColumn, 0.9 + drawerRow * 0.9,
        isPulledOut ? 19.7 : 18.5, { surfaceClass: SURFACE_METAL });
    }
  }
  addCeilingLamp(13, 21.5, 2.6, false);
  addWallSign('COLD STORE', 13, 26, WALL_NORTH, { width: 0.95, height: 0.18, centerY: 2.6 });
}

// Archive.
function furnishArchive(random) {
  const archiveRowPositions = [23.5, 26.5, 29.5, 34.5, 37.5];
  for (const rowX of archiveRowPositions) {
    addShelfRackAlongZ(rowX, 26.2, 29.3, 2.3, random, 0.75);
    addShelfRackAlongZ(rowX, 31.7, 34.8, 2.3, random, 0.75);
  }
  addTable(21.2, 35.9, 0, 1.6, 0.8, 0.76);
  addChair(21.3, 35.1, 3.0, false);
  addNote(OBJECT_NOTE_ARCHIVE, 21.0, 0.77, 35.9, -0.2);
  addBoxProp(31.6, 0.14, 28.2, 0.2, 0.14, 0.28, { yaw: 0.6, blocksMovement: false });
  addBoxProp(32.4, 0.14, 33.1, 0.2, 0.14, 0.28, { yaw: -0.9, blocksMovement: false });
  addBoxProp(40.3, 0.14, 25.3, 0.2, 0.14, 0.28, { yaw: 0.2, blocksMovement: false });
  addBoxProp(25.1, 0.02, 30.4, 0.15, 0.01, 0.11, { yaw: 0.8, blocksMovement: false });
  addBoxProp(28.2, 0.02, 30.7, 0.15, 0.01, 0.11, { yaw: -0.3, blocksMovement: false });
  for (let lampX = 22; lampX < 42; lampX += 6) addCeilingLamp(lampX, 30.5, 3.2, true);
  addWallSign('COUNT THEM', 35, 24, WALL_NORTH, { width: 2.8, height: 0.55, centerY: 1.55, isScrawled: true });
  if (!placement.isGenerating) addWallSign('CALIBRATION STORE C4', 32, 24, WALL_NORTH, { width: 2.6, height: 0.3, centerY: 2.75 });
  if (!placement.isGenerating) addWallSign('DEEP CORRIDOR · KEYCARD', 41, 30, WALL_EAST, { width: 2.8, height: 0.26, centerY: 2.72 });
  addWallSign('RECORDS 1961–1987', 26, 36, WALL_SOUTH, { width: 3.0, height: 0.3, centerY: 2.1 });
}

// Calibration store C4, home of the Stills.
function furnishCalibrationStore(random) {
  addShelfRackAlongZ(24.4, 11.0, 17.0, 2.3, random, 0.4);
  addShelfRackAlongZ(39.6, 13.0, 20.0, 2.3, random, 0.4);
  addRegistrationSphere(27.5, 21.4);
  addRegistrationSphere(36.6, 21.0);
  addRegistrationSphere(25.7, 13.2);
  addRegistrationSphere(38.4, 11.4);
  addRegistrationSphere(33.2, 17.2);
  addTargetBoard(29.0, 11.0, 0.2);
  addTargetBoard(37.2, 16.2, -1.2);
  addTargetBoard(26.0, 18.3, 1.0);
  addTripod(30.4, 14.2);
  addTripod(35.1, 20.6);
  addBoxBetween(31.7, 0, 11.2, 32.3, 0.9, 11.8);
  addSurveySpool(OBJECT_SPOOL_2, 32.0, 0.9, 11.5, 'SPOOL');
  addCrate(38.6, 21.9, 0.35, 0.2, 0);
  addCrate(25.0, 21.6, 0.35, -0.3, 0);
  addBoxProp(34.4, 0.03, 13.4, 0.9, 0.02, 0.6, { yaw: 0.4, blocksMovement: false });
  addWallSign('C4 · CALIBRATION DUMMIES · QTY 9', 36, 22, WALL_SOUTH, { width: 4.8, height: 0.34, centerY: 2.0 });
  pushPlacedPoints(stillSpawnPoints,
    [27.5, 19.5], [30.5, 20.5], [34.5, 19.5], [37.5, 18.5], [26.5, 15.5],
    [31.5, 16.5], [36.5, 14.5], [28.5, 12.5], [35.5, 12.5]);
  pushPlacedPoints(lateStillSpawnPoints,[30.5, 21.5], [33.5, 21.5]);
}

// Shaft 9 chamber.
function furnishShaftChamber(random) {
  addBoxBetween(52.0, 6.0, 8.35, 67.0, 6.3, 8.65, CLUTTER);
  addBoxBetween(52.0, 0, 8.2, 52.3, 6.0, 8.8);
  addBoxBetween(66.7, 0, 8.2, 67.0, 6.0, 8.8);
  addCylinderProp(AXIS_Y, 62.0, -22, 8.5, 0.03, 28, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addBoxProp(62.0, 5.85, 8.5, 0.25, 0.15, 0.25, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  const postPositions = [[58, 7], [61, 7], [58, 10], [61, 10], [59, 11], [60, 11], [59, 12], [60, 12], [59, 13], [60, 13], [59, 14], [60, 14]];
  for (const post of postPositions) addVerticalPipe(post[0], post[1], 0, 1.1, 0.03, false);
  addPipeAlongZ(10, 14, 1.05, 59.03, 0.022);
  addPipeAlongZ(10, 14, 1.05, 59.97, 0.022);
  addPipeAlongX(58, 61, 1.05, 7.03, 0.022);
  addPipeAlongZ(7, 10, 1.05, 58.03, 0.022);
  addPipeAlongZ(7, 10, 1.05, 60.97, 0.022);
  addBoxProp(59.5, 0.25, 7.45, 0.3, 0.25, 0.2, { surfaceClass: SURFACE_METAL });
  addSurveySpool(OBJECT_SPOOL_3, 59.5, 0.5, 7.45, 'SPOOL');
  addTripod(58.6, 7.7);
  addCylinderProp(AXIS_X, 51.4, 0.6, 12.6, 0.6, 0.35);
  addCylinderProp(AXIS_X, 51.4, 0.6, 12.6, 0.2, 0.45, CLUTTER);
  addCrateStack(66.6, 13.2, random);
  addBarrel(50.0, 3.0);
  addBarrel(50.75, 3.1);
  addBoxBetween(66.0, 0, 2.4, 68.4, 1.1, 3.4, { surfaceClass: SURFACE_METAL });
  addWallSign('SHAFT 9 · DEPTH UNSURVEYED', 59, 2, WALL_NORTH, { width: 7.2, height: 0.58, centerY: 2.9, alongOffset: 0 });
  addWallSign('NO RETURN BELOW 40 m', 59, 2, WALL_NORTH, { width: 5.2, height: 0.42, centerY: 2.15, alongOffset: 0 });
}

// ---------------------------------------------------------------------------
// The classic station: the hand-built arrangement, identical every time.
// ---------------------------------------------------------------------------

// HOW TO CHANGE THE STATION
//   A room:    carveRoom(startX, startZ, endX, endZ, ceilingHeight, ZONE_...) hollows out a rectangle of tiles.
//              Rooms must be separated by at least one solid tile, and joined by a door or an open gap.
//   A door:    addDoor(tileX, tileZ, DOOR_KIND_...) on the solid tile between two rooms.
//              AUTOMATIC always opens, POWERED needs the generator, KEYCARD needs power and the card.
//   An object: addBoxBetween(minX, minY, minZ, maxX, maxY, maxZ) for a box,
//              or one of the furniture helpers in 02-world.js (addTable, addBarrel, addShelfRackAlongZ, ...).
//              Pass { blocksMovement: false } (or CLUTTER) for things you should be able to walk through.
//   Lettering: addWallSign('TEXT', tileX, tileZ, WALL_NORTH, { width, height, centerY }) on a wall of that tile.
//              Add isScrawled: true for hand-scratched writing.
// After a change, run `npm test`: its first check reports anything a creature can no longer reach.
function buildFacilityLayout() {
  const random = createSeededRandomGenerator(90210);
  level.kind = 'classic';
  level.description = 'Kessel-9 (classic)';
  level.keycardRoomText = 'the laboratory';
  level.stillZones.length = 0;
  level.stillZones.push(ZONE_CALIBRATION_STORE, ZONE_ARCHIVE);
  level.unlabelledZones.length = 0;
  relocatedObjectives.spool1 = false; relocatedObjectives.keycard = false;
  ZONE_NAMES.length = 0;
  for (const name of CLASSIC_ZONE_NAMES) ZONE_NAMES.push(name);

  // ---- Rooms --------------------------------------------------------------
  carveLiftLobby();
  carveSecurityOffice();
  carveLockerRoom();
  carveMessRoom();
  carveStoreCloset();
  carvePumpHall();
  carveGeneratorRoom();
  carveControlRoom();
  carveLaboratory();
  carveColdRoom();
  carveArchive();
  carveCalibrationStore();
  carveShaftChamber();
  // corridors and connecting spaces that only the classic station has
  carveRoom(18, 52, 40, 54, 2.8, ZONE_MAIN_CORRIDOR);
  carveRoom(31, 38, 33, 52, 2.8, ZONE_BRANCH_CORRIDOR);
  carveRoom(41, 50, 46, 55, 3.0, ZONE_VESTIBULE);
  carveRoom(46, 52, 47, 54, 2.6, ZONE_VESTIBULE);
  carveRoom(12, 36, 14, 42, 2.6, ZONE_WEST_CORRIDOR);
  carveRoom(43, 29, 60, 31, 2.5, ZONE_DEEP_CORRIDOR);
  carveRoom(58, 15, 60, 29, 2.5, ZONE_DEEP_CORRIDOR);
  setTileFlagInRectangle(58, 18, 60, 26, TILE_FLAG_WATER);

  // ---- Doors (added after the rooms so each door knows which way it faces) -
  addDoor(13, 48, DOOR_KIND_AUTOMATIC);
  addDoor(25, 54, DOOR_KIND_AUTOMATIC);
  addDoor(26, 51, DOOR_KIND_AUTOMATIC);
  addDoor(30, 48, DOOR_KIND_AUTOMATIC);
  addDoor(35, 54, DOOR_KIND_AUTOMATIC);
  addDoor(40, 52, DOOR_KIND_AUTOMATIC);
  addDoor(66, 47, DOOR_KIND_AUTOMATIC);
  addDoor(54, 37, DOOR_KIND_AUTOMATIC);
  addDoor(31, 37, DOOR_KIND_POWERED);
  addDoor(12, 42, DOOR_KIND_AUTOMATIC);
  addDoor(12, 35, DOOR_KIND_POWERED);
  addDoor(19, 30, DOOR_KIND_AUTOMATIC);
  addDoor(13, 25, DOOR_KIND_AUTOMATIC);
  addDoor(32, 23, DOOR_KIND_AUTOMATIC);
  addDoor(42, 30, DOOR_KIND_KEYCARD);
  addDoor(56, 31, DOOR_KIND_KEYCARD);

  // ---- Furnishing, in a fixed order so the seeded clutter lands the same every time ----
  furnishLiftLobby(random);
  furnishSecurityOffice(random);
  furnishClassicMainCorridor(random);
  furnishLockerRoom(random);
  furnishMessRoom(random);
  furnishStoreCloset(random);
  furnishClassicConnections(random);
  furnishPumpHall(random);
  furnishGeneratorRoom(random);
  furnishControlRoom(random);
  furnishLaboratory(random);
  furnishColdRoom(random);
  furnishArchive(random);
  furnishCalibrationStore(random);
  furnishClassicDeepCorridor(random);
  furnishShaftChamber(random);

  // ---- Structure: ribs, pilasters and beams, so walls and ceilings are not blank ----
  addPortalFrames(18, 52, 40, 54, 2.8, 4, true);      // main corridor
  addPortalFrames(31, 38, 33, 52, 2.8, 4, false);     // archive access
  addPortalFrames(12, 36, 14, 42, 2.6, 3, false);     // west service passage
  addPortalFrames(43, 29, 58, 31, 2.5, 3, true);      // deep corridor
  addPortalFrames(58, 15, 60, 29, 2.5, 3, false);     // deep corridor, north leg
  addCeilingBeams(9, 49, 18, 58, 3.4, 3, true);       // lift lobby
  addCeilingBeams(47, 38, 66, 58, 7.0, 5, true, 0.4); // pump hall trusses
  addCeilingBeams(20, 24, 42, 37, 3.2, 5.5, false);   // archive
  addCeilingBeams(24, 10, 40, 23, 4.0, 4, true, 0.3); // calibration store
  addCeilingBeams(9, 26, 19, 35, 3.0, 3, false);      // laboratory
  addCeilingBeams(49, 2, 69, 15, 9.0, 5, false, 0.5); // shaft chamber

  // ---- Places the roaming thing likes to check ----------------------------
  pushPlacedPoints(roamingWaypoints,
    [14, 51], [28, 52.5], [25, 48], [25, 58], [31.5, 44], [43, 52], [49, 50], [58, 46], [54, 40],
    [68, 47.5], [54, 34], [31.5, 35.5], [21, 30], [40, 30], [14, 29], [13, 23], [50, 29.5],
    [58.5, 22], [54, 13.5], [12, 45], [12.5, 39]);

  // ---- Apparitions that exist only in the point cloud ---------------------
  phantomDefinitions.push(
    { x: 37.5, z: 52.6, yaw: -Math.PI / 2, triggerZone: ZONE_MAIN_CORRIDOR, onlyBeforePower: false },
    { x: 10.7, z: 24.2, yaw: Math.PI + 0.7, triggerZone: ZONE_COLD_ROOM, onlyBeforePower: false },
    { x: 62.5, z: 55.5, yaw: -1.9, triggerZone: ZONE_PUMP_HALL, onlyBeforePower: true });

  computeNavigationGrid();
  computeLevelBounds();
}

// Main corridor A (classic station only).
function furnishClassicMainCorridor(random) {
  addPipeAlongX(18, 40, 2.55, 52.22, 0.09);
  addPipeAlongX(18, 40, 2.62, 53.76, 0.06);
  for (let lampX = 21; lampX < 40; lampX += 6) addCeilingLamp(lampX, 53, 2.8, true);
  addBoxProp(28.3, 0.3, 53.55, 0.45, 0.3, 0.3, { yaw: 0.35, surfaceClass: SURFACE_METAL });
  addCylinderProp(AXIS_Y, 28.9, 0.08, 53.1, 0.08, 0.08, CLUTTER);
  addCylinderProp(AXIS_Y, 22.5, 0.55, 53.9, 0.07, 0.25, CLUTTER);
  addCrate(36.4, 53.65, 0.2, 0.4, 0);
  addBoxProp(34.2, 0.03, 52.6, 0.3, 0.02, 0.2, { yaw: 0.9, blocksMovement: false });
  addWallSign('← LIFT    PUMP HALL B →', 20, 52, WALL_NORTH, { width: 3.6, height: 0.3, centerY: 1.9, alongOffset: 0.5 });
  addWallSign('ARCHIVE · LABORATORY →', 29, 52, WALL_NORTH, { width: 2.8, height: 0.26, centerY: 1.9 });
  addWallSign('PUMP HALL B →', 37, 52, WALL_NORTH, { width: 2.4, height: 0.3, centerY: 1.9 });
  addWallSign('LOCKERS', 25, 53, WALL_SOUTH, { width: 0.95, height: 0.2, centerY: 2.52 });
  addWallSign('MESS', 26, 52, WALL_NORTH, { width: 0.8, height: 0.2, centerY: 2.52 });
}

// Archive access corridor, pump hall vestibule and west service passage (classic station only).
function furnishClassicConnections(random) {
  addPipeAlongZ(38, 52, 2.5, 31.22, 0.08);
  addCeilingLamp(32, 45, 2.8, false);
  addCrate(32.65, 41.5, 0.24, 0.2, 0);
  addWallSign('ARCHIVE', 32, 38, WALL_NORTH, { width: 0.9, height: 0.24, centerY: 1.9 });
  addWallSign('MAINS POWER DOOR', 32, 38, WALL_NORTH, { width: 0.9, height: 0.12, centerY: 1.62 });
  addCrateStack(41.7, 50.7, random);
  addBarrel(45.3, 54.4);
  addBarrel(44.55, 54.5);
  addCeilingLamp(43.5, 52.5, 3.0, true);
  addWallSign('PUMP HALL B', 45, 50, WALL_EAST, { width: 1.8, height: 0.34, centerY: 2.0, alongOffset: 0.5 });
  addPipeAlongZ(36, 42, 2.3, 13.78, 0.09);
  addCrate(13.6, 39.2, 0.22, 0.3, 0);
}

// Deep corridor (classic station only).
function furnishClassicDeepCorridor(random) {
  addPipeAlongX(43, 58, 2.2, 29.22, 0.14);
  addPipeAlongX(43, 58, 2.32, 29.52, 0.06);
  addPipeAlongZ(15, 29, 2.25, 58.2, 0.12);
  addCrate(51.5, 30.7, 0.2, 0.5, 0);
  addBoxProp(47.2, 0.05, 30.5, 0.35, 0.03, 0.05, { yaw: 0.6, blocksMovement: false });
  addBoxProp(47.3, 0.12, 30.3, 0.1, 0.1, 0.13, { yaw: 0.2, surfaceClass: SURFACE_METAL, blocksMovement: false });
  addWallSign('IT FEELS THE LIGHT', 48, 29, WALL_NORTH, { width: 4.6, height: 0.55, centerY: 1.45, alongOffset: 0.5, isScrawled: true });
  addWallSign('TURN IT OFF', 58, 22, WALL_WEST, { width: 2.8, height: 0.5, centerY: 1.4, isScrawled: true });
  addWallSign('SHAFT 9 →', 55, 30, WALL_SOUTH, { width: 1.4, height: 0.26, centerY: 1.9, alongOffset: -1.5 });
}

// Reports anything the walking creatures could not reach. Used by the automated checks.
function auditFacilityLayout() {
  const problems = [];
  const field = new Int16Array(TILE_COUNT);
  computeDistanceField(field, findNearestWalkableTileIndex(PLAYER_START.x, PLAYER_START.z), 0, null);
  const checkReachable = function (label, x, z) {
    const index = findNearestWalkableTileIndex(x, z);
    if (index < 0 || field[index] >= NAVIGATION_UNREACHABLE) problems.push(label + ' at ' + x + ',' + z + ' is unreachable');
  };
  for (const interactable of interactables) checkReachable('interactable ' + interactable.objectId, interactable.x, interactable.z);
  for (const door of doors) {
    if (field[tileIndexAt(door.tileX, door.tileZ)] >= NAVIGATION_UNREACHABLE) problems.push('door ' + door.tileX + ',' + door.tileZ + ' is unreachable');
  }
  for (const waypoint of roamingWaypoints) checkReachable('waypoint', waypoint[0], waypoint[1]);
  for (const point of stillSpawnPoints) checkReachable('still', point[0], point[1]);
  for (const point of lateStillSpawnPoints) checkReachable('late still', point[0], point[1]);
  checkReachable('hollow spawn', HOLLOW_SPAWN_POSITION.x, HOLLOW_SPAWN_POSITION.z);
  return problems;
}
