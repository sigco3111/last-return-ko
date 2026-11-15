// ---------------------------------------------------------------------------
// World representation: a tile grid (1 tile = 1 metre) carved into rooms, plus
// "props" (boxes, cylinders, spheres) for everything that stands in the rooms.
// The same data drives ray casting, collision, navigation and the occluder mesh.
// ---------------------------------------------------------------------------

// The whole map, in one-metre tiles. The classic station uses the top-left 76 x 64; generated stations may use it all.
const GRID_WIDTH = 512;
const GRID_DEPTH = 512;
const TILE_COUNT = GRID_WIDTH * GRID_DEPTH;

const tileIsOpen = new Uint8Array(TILE_COUNT);
const tileFloorHeight = new Float32Array(TILE_COUNT);
const tileCeilingHeight = new Float32Array(TILE_COUNT);
const tileFlags = new Uint8Array(TILE_COUNT);
const tileZone = new Uint8Array(TILE_COUNT);
const tilePropLists = new Array(TILE_COUNT).fill(null);
const tileSignLists = new Array(TILE_COUNT).fill(null);
const tileIsWalkable = new Uint8Array(TILE_COUNT);

const TILE_FLAG_WATER = 1;
const TILE_FLAG_PIT = 2;
const TILE_FLAG_GRATE = 4;
const TILE_FLAG_HAZARD = 8;
const TILE_FLAG_DOOR = 16;
const TILE_FLAG_VENT = 32; // a crawl-height tunnel: sheet metal underfoot, and no room to stand

// TWEAK: how high a vent is inside, in metres. You crouch at 1.0 m and the Hollow crawls at about the same,
// so much lower than 1.1 and neither of you fits.
const VENT_HEIGHT = 1.15;

const ZONE_LIFT_CAR = 1;
const ZONE_LOBBY = 2;
const ZONE_MAIN_CORRIDOR = 3;
const ZONE_SECURITY_OFFICE = 4;
const ZONE_LOCKER_ROOM = 5;
const ZONE_BREAK_ROOM = 6;
const ZONE_CLOSET = 7;
const ZONE_BRANCH_CORRIDOR = 8;
const ZONE_VESTIBULE = 9;
const ZONE_PUMP_HALL = 10;
const ZONE_GENERATOR_ROOM = 11;
const ZONE_CONTROL_ROOM = 12;
const ZONE_WEST_CORRIDOR = 13;
const ZONE_ARCHIVE = 14;
const ZONE_LAB = 15;
const ZONE_COLD_ROOM = 16;
const ZONE_CALIBRATION_STORE = 17;
const ZONE_DEEP_CORRIDOR = 18;
const ZONE_SHAFT = 19;

// Surface classes decide how a scanned point is coloured.
const SURFACE_FLOOR = 0;
const SURFACE_WALL = 1;
const SURFACE_CEILING = 2;
const SURFACE_PROP = 3;
const SURFACE_DOOR_AUTOMATIC = 4;
const SURFACE_DOOR_POWERED = 5;
const SURFACE_DOOR_KEYCARD = 6;
const SURFACE_INTERACTIVE = 7;
const SURFACE_SIGN = 8;
const SURFACE_WATER = 9;
const SURFACE_HOLLOW = 10;
const SURFACE_STILL = 11;
const SURFACE_HAZARD = 12;
const SURFACE_METAL = 13;
const SURFACE_DOOR_KEYCARD_2 = 14; // a door that needs keycard 2
const SURFACE_DOOR_KEYCARD_3 = 15; // a door that needs keycard 3

const WALL_NORTH = 0;
const WALL_EAST = 1;
const WALL_SOUTH = 2;
const WALL_WEST = 3;

const PROP_KIND_BOX = 0;
const PROP_KIND_CYLINDER = 1;
const PROP_KIND_SPHERE = 2;

const AXIS_X = 0;
const AXIS_Y = 1;
const AXIS_Z = 2;

const PIT_FLOOR_HEIGHT = -80;
const PIT_NO_RETURN_DEPTH = -40;

const worldProps = [];
const dynamicBoxProps = [];
const doors = [];
const interactables = [];
const roamingWaypoints = [];

// ---------------------------------------------------------------------------
// Placement: lets a room be described once and then put anywhere, turned any of four ways.
// While a placement is active, every carve, prop, sign and pickup below is moved and turned by it.
// The classic station is built with no placement (everything exactly where the numbers say).
// ---------------------------------------------------------------------------

const placement = {
  turns: 0,          // quarter turns clockwise seen from above (0 to 3)
  offsetX: 0, offsetZ: 0,
  offsetY: 0,        // how far below (negative) or above the lift's floor this room's floor is, in metres
  isGenerating: false,
  zone: 0,           // zone given to tiles carved by the room being placed
  zoneMap: null      // optional: classic zone number -> zone number in this station
};

function clearPlacement() {
  placement.turns = 0; placement.offsetX = 0; placement.offsetZ = 0; placement.offsetY = 0;
  placement.zone = 0; placement.zoneMap = null;
}

function rotatePointByTurns(x, z, turns) {
  for (let turn = 0; turn < turns; turn++) { const rotatedX = -z; z = x; x = rotatedX; }
  return [x, z];
}

// Sets the placement so that the point (pivotX, pivotZ) of the room lands on (targetX, targetZ) after turning.
function setPlacement(turns, pivotX, pivotZ, targetX, targetZ) {
  const rotated = rotatePointByTurns(pivotX, pivotZ, turns);
  placement.turns = turns;
  placement.offsetX = targetX - rotated[0];
  placement.offsetZ = targetZ - rotated[1];
}

function placePoint(x, z) {
  const rotated = rotatePointByTurns(x, z, placement.turns);
  return [rotated[0] + placement.offsetX, rotated[1] + placement.offsetZ];
}

function placeTile(tileX, tileZ) {
  const center = placePoint(tileX + 0.5, tileZ + 0.5);
  return [Math.floor(center[0]), Math.floor(center[1])];
}

function placeYaw(yaw) {
  return yaw + placement.turns * Math.PI / 2;
}

function placeWall(wall) {
  return (wall + placement.turns) % 4;
}

function resolveZone(zone) {
  if (!placement.isGenerating) return zone;
  if (placement.zoneMap && placement.zoneMap[zone] !== undefined) return placement.zoneMap[zone];
  return placement.zone;
}

// Facts about the station that is currently loaded. Rooms fill these in as they are built.
const level = {
  kind: 'classic',        // 'classic' or 'generated'
  seed: 0,
  sizeKey: 'medium',
  layoutKey: 'mixed',
  levelsKey: 'two',
  stairCount: 0,          // flights of stairs between the levels (0 in a one-level station)
  ventCount: 0,           // crawl-height vents (generated stations only)
  keycardRoomText: 'the laboratory', // filled into the security office note
  // Extra jobs on top of "power, three spools, lift". Kessel-9 has none; a generated station may have some.
  mission: { needsFuel: false, coreCount: 0, needsBreaker: false },
  keycardCount: 1,        // how many keycards this station has. Card 1 opens "card 1" doors, card 2 the next ring in, and so on.
  loopCount: 0,
  storeZone: 0,           // the calibration store: the Hollow will not enter it
  stillZones: [],         // zones the Stills may walk in
  unlabelledZones: [],    // zones whose name is left off the big map (generated corridors and ducts: too many, too small)
  generatorApproachX: 68.5, generatorApproachZ: 47.5, // where the Hollow goes when the generator starts
  attractCamera: { x: 16.9, y: 1.5, z: 50.3, yaw: -1.95 },
  boundsMinimumX: 0, boundsMinimumZ: 0, boundsMaximumX: GRID_WIDTH, boundsMaximumZ: GRID_DEPTH,
  roomCount: 0,
  hatchCount: 0,          // ceiling hatches of the Hollow's crawlspace (see 08-crawlspace.js)
  description: 'Kessel-9 (classic)'
};

function tileIndexAt(tileX, tileZ) {
  return tileZ * GRID_WIDTH + tileX;
}

function isInsideGrid(tileX, tileZ) {
  return tileX >= 0 && tileZ >= 0 && tileX < GRID_WIDTH && tileZ < GRID_DEPTH;
}

function isTileOpenAt(tileX, tileZ) {
  return isInsideGrid(tileX, tileZ) && tileIsOpen[tileZ * GRID_WIDTH + tileX] === 1;
}

// The tallest step anything can walk up or down between two neighbouring tiles, in metres.
const MAXIMUM_STEP_HEIGHT = 0.45;

// Height of the floor under a point: 0 on the lift's level, negative on a lower one.
function getFloorHeightAt(x, z) {
  const tileX = Math.floor(x), tileZ = Math.floor(z);
  if (!isInsideGrid(tileX, tileZ)) return 0;
  const index = tileZ * GRID_WIDTH + tileX;
  if (!tileIsOpen[index] || (tileFlags[index] & TILE_FLAG_PIT)) return 0;
  return tileFloorHeight[index];
}

// How much room there is between floor and ceiling at a point, in metres. Solid rock and the pit count as "plenty",
// so that something asking about the tile ahead of it is not made to duck for a wall.
function getHeadroomAt(x, z) {
  const tileX = Math.floor(x), tileZ = Math.floor(z);
  if (!isInsideGrid(tileX, tileZ)) return 99;
  const index = tileZ * GRID_WIDTH + tileX;
  if (!tileIsOpen[index] || (tileFlags[index] & TILE_FLAG_PIT)) return 99;
  return tileCeilingHeight[index] - tileFloorHeight[index];
}

function getZoneAtPosition(x, z) {
  const tileX = Math.floor(x), tileZ = Math.floor(z);
  if (!isInsideGrid(tileX, tileZ)) return 0;
  return tileZone[tileZ * GRID_WIDTH + tileX];
}

function getTileFlagsAtPosition(x, z) {
  const tileX = Math.floor(x), tileZ = Math.floor(z);
  if (!isInsideGrid(tileX, tileZ)) return 0;
  return tileFlags[tileZ * GRID_WIDTH + tileX];
}

// Carves the rectangle [startX, endX) x [startZ, endZ) out of solid rock.
function carveRoom(startX, startZ, endX, endZ, ceilingHeight, zone) {
  const resolvedZone = resolveZone(zone);
  for (let tileZ = startZ; tileZ < endZ; tileZ++) {
    for (let tileX = startX; tileX < endX; tileX++) {
      const placed = placeTile(tileX, tileZ);
      const index = tileIndexAt(placed[0], placed[1]);
      tileIsOpen[index] = 1;
      tileFloorHeight[index] = placement.offsetY;
      tileCeilingHeight[index] = placement.offsetY + ceilingHeight;
      tileZone[index] = resolvedZone;
    }
  }
}

function setTileFlagInRectangle(startX, startZ, endX, endZ, flag) {
  for (let tileZ = startZ; tileZ < endZ; tileZ++) {
    for (let tileX = startX; tileX < endX; tileX++) {
      const placed = placeTile(tileX, tileZ);
      if (isTileOpenAt(placed[0], placed[1])) tileFlags[tileIndexAt(placed[0], placed[1])] |= flag;
    }
  }
}

// Lowers (or raises) the floor of a rectangle of tiles that is already carved, ceiling and all.
// `floorHeight` is measured from the floor of the room being built. This is how stairs are made: one call per step.
function setFloorHeightInRectangle(startX, startZ, endX, endZ, floorHeight) {
  for (let tileZ = startZ; tileZ < endZ; tileZ++) {
    for (let tileX = startX; tileX < endX; tileX++) {
      const placed = placeTile(tileX, tileZ);
      if (!isTileOpenAt(placed[0], placed[1])) continue;
      const index = tileIndexAt(placed[0], placed[1]);
      const roomHeight = tileCeilingHeight[index] - tileFloorHeight[index];
      tileFloorHeight[index] = placement.offsetY + floorHeight;
      tileCeilingHeight[index] = tileFloorHeight[index] + roomHeight;
    }
  }
}

// Turns one tile into bottomless pit (or grated floor over it). Used by the shaft.
function setPitTile(tileX, tileZ, isPit) {
  const placed = placeTile(tileX, tileZ);
  const index = tileIndexAt(placed[0], placed[1]);
  if (isPit) { tileFlags[index] |= TILE_FLAG_PIT; tileFloorHeight[index] = PIT_FLOOR_HEIGHT; }
  else tileFlags[index] |= TILE_FLAG_GRATE;
}

// Empties the whole map so another station can be built.
function resetWorldForNewLevel() {
  tileIsOpen.fill(0); tileFloorHeight.fill(0); tileCeilingHeight.fill(0); tileFlags.fill(0); tileZone.fill(0);
  tileIsWalkable.fill(0);
  tilePropLists.fill(null); tileSignLists.fill(null);
  worldProps.length = 0; dynamicBoxProps.length = 0; doors.length = 0; interactables.length = 0;
  roamingWaypoints.length = 0;
  clearHollowHatches();
  clearPlacement();
  placement.isGenerating = false;
}

function computeLevelBounds() {
  let minimumX = GRID_WIDTH, minimumZ = GRID_DEPTH, maximumX = 0, maximumZ = 0;
  for (let tileZ = 0; tileZ < GRID_DEPTH; tileZ++) {
    for (let tileX = 0; tileX < GRID_WIDTH; tileX++) {
      if (!tileIsOpen[tileIndexAt(tileX, tileZ)]) continue;
      minimumX = Math.min(minimumX, tileX); maximumX = Math.max(maximumX, tileX + 1);
      minimumZ = Math.min(minimumZ, tileZ); maximumZ = Math.max(maximumZ, tileZ + 1);
    }
  }
  level.boundsMinimumX = Math.max(0, minimumX - 3); level.boundsMinimumZ = Math.max(0, minimumZ - 3);
  level.boundsMaximumX = Math.min(GRID_WIDTH, maximumX + 3); level.boundsMaximumZ = Math.min(GRID_DEPTH, maximumZ + 3);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

function createEmptyProp(kind) {
  return {
    kind: kind,
    centerX: 0, centerY: 0, centerZ: 0,
    halfX: 0, halfY: 0, halfZ: 0,
    cosineYaw: 1, sineYaw: 0,
    axis: AXIS_Y, radius: 0, halfLength: 0,
    boundsHalfX: 0, boundsHalfZ: 0,
    minimumY: 0, maximumY: 0,
    surfaceClass: SURFACE_PROP,
    blocksMovement: true,
    objectId: 0,
    isDynamic: false,
    isRemoved: false,
    rayStamp: 0,
    collisionStamp: 0
  };
}

function applyPropOptions(prop, options) {
  if (!options) return;
  if (options.surfaceClass !== undefined) prop.surfaceClass = options.surfaceClass;
  if (options.blocksMovement !== undefined) prop.blocksMovement = options.blocksMovement;
  if (options.objectId !== undefined) prop.objectId = options.objectId;
  if (options.isDynamic !== undefined) prop.isDynamic = options.isDynamic;
}

function registerPropInTiles(prop) {
  const firstTileX = Math.floor(prop.centerX - prop.boundsHalfX);
  const lastTileX = Math.floor(prop.centerX + prop.boundsHalfX);
  const firstTileZ = Math.floor(prop.centerZ - prop.boundsHalfZ);
  const lastTileZ = Math.floor(prop.centerZ + prop.boundsHalfZ);
  for (let tileZ = firstTileZ; tileZ <= lastTileZ; tileZ++) {
    for (let tileX = firstTileX; tileX <= lastTileX; tileX++) {
      if (!isTileOpenAt(tileX, tileZ)) continue;
      const index = tileIndexAt(tileX, tileZ);
      if (!tilePropLists[index]) tilePropLists[index] = [];
      tilePropLists[index].push(prop);
    }
  }
}

function finishProp(prop, options) {
  applyPropOptions(prop, options);
  worldProps.push(prop);
  if (prop.isDynamic && prop.kind === PROP_KIND_BOX) dynamicBoxProps.push(prop);
  registerPropInTiles(prop);
  return prop;
}

function addBoxProp(centerX, centerY, centerZ, halfX, halfY, halfZ, options) {
  const prop = createEmptyProp(PROP_KIND_BOX);
  const yaw = placeYaw(options && options.yaw ? options.yaw : 0);
  const placedCenter = placePoint(centerX, centerZ);
  centerX = placedCenter[0]; centerZ = placedCenter[1];
  centerY += placement.offsetY;
  prop.centerX = centerX; prop.centerY = centerY; prop.centerZ = centerZ;
  prop.halfX = halfX; prop.halfY = halfY; prop.halfZ = halfZ;
  prop.cosineYaw = Math.cos(yaw); prop.sineYaw = Math.sin(yaw);
  prop.boundsHalfX = Math.abs(prop.cosineYaw) * halfX + Math.abs(prop.sineYaw) * halfZ;
  prop.boundsHalfZ = Math.abs(prop.sineYaw) * halfX + Math.abs(prop.cosineYaw) * halfZ;
  prop.minimumY = centerY - halfY; prop.maximumY = centerY + halfY;
  return finishProp(prop, options);
}

function addBoxBetween(minimumX, minimumY, minimumZ, maximumX, maximumY, maximumZ, options) {
  return addBoxProp(
    (minimumX + maximumX) / 2, (minimumY + maximumY) / 2, (minimumZ + maximumZ) / 2,
    (maximumX - minimumX) / 2, (maximumY - minimumY) / 2, (maximumZ - minimumZ) / 2, options);
}

function addCylinderProp(axis, centerX, centerY, centerZ, radius, halfLength, options) {
  const prop = createEmptyProp(PROP_KIND_CYLINDER);
  if (placement.turns % 2 === 1 && axis !== AXIS_Y) axis = axis === AXIS_X ? AXIS_Z : AXIS_X;
  const placedCenter = placePoint(centerX, centerZ);
  centerX = placedCenter[0]; centerZ = placedCenter[1];
  centerY += placement.offsetY;
  prop.axis = axis;
  prop.centerX = centerX; prop.centerY = centerY; prop.centerZ = centerZ;
  prop.radius = radius; prop.halfLength = halfLength;
  prop.halfX = axis === AXIS_X ? halfLength : radius;
  prop.halfY = axis === AXIS_Y ? halfLength : radius;
  prop.halfZ = axis === AXIS_Z ? halfLength : radius;
  prop.boundsHalfX = prop.halfX; prop.boundsHalfZ = prop.halfZ;
  prop.minimumY = centerY - prop.halfY; prop.maximumY = centerY + prop.halfY;
  return finishProp(prop, options);
}

function addSphereProp(centerX, centerY, centerZ, radius, options) {
  const prop = createEmptyProp(PROP_KIND_SPHERE);
  const placedCenter = placePoint(centerX, centerZ);
  centerX = placedCenter[0]; centerZ = placedCenter[1];
  centerY += placement.offsetY;
  prop.centerX = centerX; prop.centerY = centerY; prop.centerZ = centerZ;
  prop.radius = radius;
  prop.halfX = radius; prop.halfY = radius; prop.halfZ = radius;
  prop.boundsHalfX = radius; prop.boundsHalfZ = radius;
  prop.minimumY = centerY - radius; prop.maximumY = centerY + radius;
  return finishProp(prop, options);
}

// A local frame lets furniture be described once and placed at any angle.
// Local +Z is "forward" for the piece of furniture, local +X is its right-hand side.
function createLocalFrame(originX, originZ, yaw) {
  return { originX: originX, originZ: originZ, yaw: yaw, cosine: Math.cos(yaw), sine: Math.sin(yaw) };
}

function addBoxInFrame(frame, localX, centerY, localZ, halfX, halfY, halfZ, options) {
  const worldX = frame.originX + localX * frame.cosine - localZ * frame.sine;
  const worldZ = frame.originZ + localX * frame.sine + localZ * frame.cosine;
  const merged = Object.assign({}, options || {}, { yaw: frame.yaw });
  return addBoxProp(worldX, centerY, worldZ, halfX, halfY, halfZ, merged);
}

function addVerticalCylinderInFrame(frame, localX, centerY, localZ, radius, halfLength, options) {
  const worldX = frame.originX + localX * frame.cosine - localZ * frame.sine;
  const worldZ = frame.originZ + localX * frame.sine + localZ * frame.cosine;
  return addCylinderProp(AXIS_Y, worldX, centerY, worldZ, radius, halfLength, options);
}

function addSphereInFrame(frame, localX, centerY, localZ, radius, options) {
  const worldX = frame.originX + localX * frame.cosine - localZ * frame.sine;
  const worldZ = frame.originZ + localX * frame.sine + localZ * frame.cosine;
  return addSphereProp(worldX, centerY, worldZ, radius, options);
}

// ---------------------------------------------------------------------------
// Furniture builders
// ---------------------------------------------------------------------------

const CLUTTER = { blocksMovement: false };

function addTable(x, z, yaw, lengthX, lengthZ, height) {
  const frame = createLocalFrame(x, z, yaw);
  addBoxInFrame(frame, 0, height - 0.03, 0, lengthX / 2, 0.03, lengthZ / 2);
  const legX = lengthX / 2 - 0.06, legZ = lengthZ / 2 - 0.06;
  for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
    const signX = cornerIndex & 1 ? 1 : -1, signZ = cornerIndex & 2 ? 1 : -1;
    addBoxInFrame(frame, signX * legX, (height - 0.06) / 2, signZ * legZ, 0.03, (height - 0.06) / 2, 0.03, CLUTTER);
  }
}

function addChair(x, z, yaw, isToppled) {
  const frame = createLocalFrame(x, z, yaw);
  if (isToppled) {
    addBoxInFrame(frame, 0, 0.04, -0.28, 0.2, 0.03, 0.26, CLUTTER);
    addBoxInFrame(frame, 0, 0.22, 0, 0.2, 0.2, 0.025, CLUTTER);
    addBoxInFrame(frame, -0.17, 0.4, 0.22, 0.02, 0.02, 0.2, CLUTTER);
    addBoxInFrame(frame, 0.17, 0.4, 0.22, 0.02, 0.02, 0.2, CLUTTER);
    return;
  }
  addBoxInFrame(frame, 0, 0.45, 0, 0.21, 0.025, 0.21, CLUTTER);
  addBoxInFrame(frame, 0, 0.75, -0.2, 0.21, 0.26, 0.02, CLUTTER);
  for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
    const signX = cornerIndex & 1 ? 1 : -1, signZ = cornerIndex & 2 ? 1 : -1;
    addBoxInFrame(frame, signX * 0.18, 0.21, signZ * 0.18, 0.018, 0.21, 0.018, CLUTTER);
  }
}

function addRoundTable(x, z, radius) {
  addCylinderProp(AXIS_Y, x, 0.74, z, radius, 0.025);
  addCylinderProp(AXIS_Y, x, 0.36, z, 0.05, 0.36, CLUTTER);
  addCylinderProp(AXIS_Y, x, 0.02, z, radius * 0.5, 0.02, CLUTTER);
}

function addLocker(x, z, yaw, isDoorOpen) {
  const frame = createLocalFrame(x, z, yaw);
  addBoxInFrame(frame, 0, 0.95, 0, 0.24, 0.95, 0.22, { surfaceClass: SURFACE_METAL });
  for (let ventIndex = 0; ventIndex < 3; ventIndex++) {
    addBoxInFrame(frame, 0, 1.58 + ventIndex * 0.07, -0.226, 0.14, 0.012, 0.008, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  }
  addBoxInFrame(frame, 0.17, 1.05, -0.232, 0.012, 0.06, 0.014, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addBoxInFrame(frame, 0, 0.04, -0.2, 0.24, 0.04, 0.04, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  if (isDoorOpen) {
    const doorFrame = createLocalFrame(
      x + 0.24 * frame.cosine - 0.22 * frame.sine - 0.2 * Math.sin(yaw + 1.2),
      z + 0.24 * frame.sine + 0.22 * frame.cosine + 0.2 * Math.cos(yaw + 1.2), yaw + 1.2);
    addBoxInFrame(doorFrame, 0, 0.95, 0, 0.015, 0.9, 0.22, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  }
}

function addCrate(x, z, halfSize, yaw, baseHeight) {
  const bottom = baseHeight || 0;
  const frame = createLocalFrame(x, z, yaw || 0);
  // lid rim, a band round the middle, and two skids so it does not sit flat on the floor
  addBoxInFrame(frame, 0, bottom + halfSize * 2 - 0.02, 0, halfSize + 0.02, 0.025, halfSize + 0.02, CLUTTER);
  addBoxInFrame(frame, 0, bottom + halfSize, 0, halfSize + 0.012, 0.03, halfSize + 0.012, CLUTTER);
  if (bottom === 0) {
    addBoxInFrame(frame, -halfSize * 0.6, 0.03, 0, 0.04, 0.03, halfSize, CLUTTER);
    addBoxInFrame(frame, halfSize * 0.6, 0.03, 0, 0.04, 0.03, halfSize, CLUTTER);
  }
  return addBoxProp(x, bottom + halfSize + (bottom === 0 ? 0.03 : 0), z, halfSize, halfSize - (bottom === 0 ? 0.03 : 0), halfSize, { yaw: yaw || 0 });
}

// Structure that makes a corridor read as built: a rib across the ceiling and a pilaster down each wall,
// repeated every few metres. `runsAlongX` says which way the corridor runs; the rectangle is its floor area.
// A pilaster is left out wherever the wall has an opening behind it.
function addPortalFrames(startX, startZ, endX, endZ, ceilingHeight, spacing, runsAlongX) {
  const length = runsAlongX ? endX - startX : endZ - startZ;
  for (let along = spacing / 2; along < length - 0.3; along += spacing) {
    if (runsAlongX) {
      const x = startX + along;
      addBoxBetween(x - 0.1, ceilingHeight - 0.16, startZ, x + 0.1, ceilingHeight, endZ, CLUTTER);
      if (!isTileOpenAt(Math.floor(x), startZ - 1)) addBoxBetween(x - 0.13, 0, startZ, x + 0.13, ceilingHeight, startZ + 0.09, CLUTTER);
      if (!isTileOpenAt(Math.floor(x), endZ)) addBoxBetween(x - 0.13, 0, endZ - 0.09, x + 0.13, ceilingHeight, endZ, CLUTTER);
    } else {
      const z = startZ + along;
      addBoxBetween(startX, ceilingHeight - 0.16, z - 0.1, endX, ceilingHeight, z + 0.1, CLUTTER);
      if (!isTileOpenAt(startX - 1, Math.floor(z))) addBoxBetween(startX, 0, z - 0.13, startX + 0.09, ceilingHeight, z + 0.13, CLUTTER);
      if (!isTileOpenAt(endX, Math.floor(z))) addBoxBetween(endX - 0.09, 0, z - 0.13, endX, ceilingHeight, z + 0.13, CLUTTER);
    }
  }
}

// Beams under the ceiling of a room, spanning it one way and repeated the other.
function addCeilingBeams(startX, startZ, endX, endZ, ceilingHeight, spacing, beamsRunAlongX, depth) {
  const beamDepth = depth || 0.22;
  const span = beamsRunAlongX ? endZ - startZ : endX - startX;
  for (let across = spacing / 2; across < span - 0.2; across += spacing) {
    if (beamsRunAlongX) addBoxBetween(startX, ceilingHeight - beamDepth, startZ + across - 0.11, endX, ceilingHeight, startZ + across + 0.11, CLUTTER);
    else addBoxBetween(startX + across - 0.11, ceilingHeight - beamDepth, startZ, startX + across + 0.11, ceilingHeight, endZ, CLUTTER);
  }
}

function addCrateStack(x, z, random) {
  addCrate(x, z, 0.4, random() * 0.5 - 0.25, 0);
  if (random() > 0.3) addCrate(x + random() * 0.2 - 0.1, z + random() * 0.2 - 0.1, 0.3, random() * 1.2, 0.8);
  if (random() > 0.5) addCrate(x + 0.75, z + random() * 0.3, 0.28, random() * 1.5, 0);
}

function addBarrel(x, z) {
  addCylinderProp(AXIS_Y, x, 0.44, z, 0.29, 0.44, { surfaceClass: SURFACE_METAL });
  addCylinderProp(AXIS_Y, x, 0.3, z, 0.305, 0.015, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addCylinderProp(AXIS_Y, x, 0.6, z, 0.305, 0.015, { surfaceClass: SURFACE_METAL, blocksMovement: false });
}

function addCeilingLamp(x, z, ceilingHeight, runsAlongX) {
  const halfX = runsAlongX ? 0.6 : 0.1, halfZ = runsAlongX ? 0.1 : 0.6;
  addBoxProp(x, ceilingHeight - 0.05, z, halfX, 0.05, halfZ, CLUTTER);
}

function addPipeAlongX(startX, endX, y, z, radius) {
  addCylinderProp(AXIS_X, (startX + endX) / 2, y, z, radius, (endX - startX) / 2, { surfaceClass: SURFACE_METAL, blocksMovement: false });
}

function addPipeAlongZ(startZ, endZ, y, x, radius) {
  addCylinderProp(AXIS_Z, x, y, (startZ + endZ) / 2, radius, (endZ - startZ) / 2, { surfaceClass: SURFACE_METAL, blocksMovement: false });
}

function addVerticalPipe(x, z, bottomY, topY, radius, blocksMovement) {
  addCylinderProp(AXIS_Y, x, (bottomY + topY) / 2, z, radius, (topY - bottomY) / 2,
    { surfaceClass: SURFACE_METAL, blocksMovement: blocksMovement === true });
}

function addTank(x, z, radius, height) {
  addCylinderProp(AXIS_Y, x, height / 2, z, radius, height / 2, { surfaceClass: SURFACE_METAL });
  addSphereProp(x, height - radius * 0.55, z, radius * 1.14, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  for (let bandIndex = 1; bandIndex <= 3; bandIndex++) {
    addCylinderProp(AXIS_Y, x, bandIndex * height / 4, z, radius + 0.04, 0.05, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  }
  // inspection ladder
  // a rung every 45 cm, as far up as the tank goes (not further: a short tank used to get rungs hanging in the air)
  for (let rungHeight = 0.4; rungHeight < height - 0.1; rungHeight += 0.45) {
    addBoxProp(x, rungHeight, z + radius + 0.09, 0.2, 0.015, 0.015, CLUTTER);
  }
  addBoxProp(x - 0.2, height / 2 - 0.2, z + radius + 0.09, 0.015, height / 2 - 0.2, 0.015, CLUTTER);
  addBoxProp(x + 0.2, height / 2 - 0.2, z + radius + 0.09, 0.015, height / 2 - 0.2, 0.015, CLUTTER);
}

function addPumpUnit(x, z) {
  addBoxBetween(x - 0.95, 0, z - 0.5, x + 0.95, 0.32, z + 0.5, { surfaceClass: SURFACE_METAL });
  addCylinderProp(AXIS_X, x - 0.3, 0.82, z, 0.4, 0.52, { surfaceClass: SURFACE_METAL });
  addCylinderProp(AXIS_X, x + 0.52, 0.82, z, 0.55, 0.17, { surfaceClass: SURFACE_METAL });
  addCylinderProp(AXIS_X, x - 0.9, 0.82, z, 0.2, 0.08, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addVerticalPipe(x + 0.52, z, 1.3, 5.4, 0.14, false);
  addCylinderProp(AXIS_Y, x + 0.52, 2.2, z, 0.2, 0.04, { surfaceClass: SURFACE_METAL, blocksMovement: false });
}

function addShelfRackAlongZ(centerX, startZ, endZ, height, random, fillAmount) {
  const halfDepth = 0.25;
  const shelfHeights = [0.15, 0.65, 1.15, 1.65, 2.12];
  for (let shelfIndex = 0; shelfIndex < shelfHeights.length; shelfIndex++) {
    if (shelfHeights[shelfIndex] > height) continue;
    addBoxBetween(centerX - halfDepth, shelfHeights[shelfIndex] - 0.02, startZ, centerX + halfDepth, shelfHeights[shelfIndex] + 0.02, endZ);
    let cursorZ = startZ + 0.1;
    while (cursorZ < endZ - 0.4) {
      const boxLength = 0.3 + random() * 0.25;
      if (random() < fillAmount) {
        const boxHeight = 0.12 + random() * 0.1;
        addBoxProp(centerX + (random() - 0.5) * 0.08, shelfHeights[shelfIndex] + 0.02 + boxHeight, cursorZ + boxLength / 2,
          0.19, boxHeight, boxLength / 2 - 0.02, CLUTTER);
      }
      cursorZ += boxLength + 0.04;
    }
  }
  const uprightCount = Math.max(2, Math.round((endZ - startZ) / 1.6) + 1);
  for (let uprightIndex = 0; uprightIndex < uprightCount; uprightIndex++) {
    const uprightZ = startZ + (endZ - startZ) * uprightIndex / (uprightCount - 1);
    addBoxProp(centerX - halfDepth, height / 2, uprightZ, 0.025, height / 2, 0.025, CLUTTER);
    addBoxProp(centerX + halfDepth, height / 2, uprightZ, 0.025, height / 2, 0.025, CLUTTER);
  }
}

function addGurney(x, z, yaw, hasCoveredShape) {
  const frame = createLocalFrame(x, z, yaw);
  addBoxInFrame(frame, 0, 0.8, 0, 0.35, 0.03, 0.95, { surfaceClass: SURFACE_METAL });
  for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
    const signX = cornerIndex & 1 ? 1 : -1, signZ = cornerIndex & 2 ? 1 : -1;
    addBoxInFrame(frame, signX * 0.3, 0.39, signZ * 0.85, 0.02, 0.39, 0.02, CLUTTER);
  }
  if (hasCoveredShape) {
    addBoxInFrame(frame, 0, 0.92, -0.1, 0.22, 0.09, 0.42, CLUTTER);
    addBoxInFrame(frame, 0, 0.9, 0.52, 0.17, 0.07, 0.25, CLUTTER);
    addSphereInFrame(frame, 0, 0.95, -0.68, 0.125, CLUTTER);
    addBoxInFrame(frame, 0, 0.97, 0.82, 0.14, 0.1, 0.05, CLUTTER);
  }
}

function addRegistrationSphere(x, z) {
  // The white reference spheres surveyors use to stitch scans together (145 mm diameter).
  addCylinderProp(AXIS_Y, x, 0.75, z, 0.015, 0.75, CLUTTER);
  addCylinderProp(AXIS_Y, x, 0.02, z, 0.16, 0.02, CLUTTER);
  addSphereProp(x, 1.57, z, 0.0725, { surfaceClass: SURFACE_SIGN, blocksMovement: false });
}

function addTargetBoard(x, z, yaw) {
  const frame = createLocalFrame(x, z, yaw);
  addVerticalCylinderInFrame(frame, 0, 0.55, 0, 0.02, 0.55, CLUTTER);
  addBoxInFrame(frame, 0, 0.02, 0, 0.25, 0.02, 0.25, CLUTTER);
  addBoxInFrame(frame, 0, 1.45, 0, 0.42, 0.42, 0.012, { surfaceClass: SURFACE_SIGN, blocksMovement: false });
}

function addTripod(x, z) {
  addCylinderProp(AXIS_Y, x, 0.65, z, 0.022, 0.65, CLUTTER);
  addBoxProp(x, 0.03, z, 0.3, 0.012, 0.02, CLUTTER);
  addBoxProp(x, 0.03, z, 0.02, 0.012, 0.3, CLUTTER);
  addBoxProp(x, 1.4, z, 0.09, 0.1, 0.12, { surfaceClass: SURFACE_METAL, blocksMovement: false });
}

// ---------------------------------------------------------------------------
// Wall signs: retro-reflective lettering that only shows up when scanned.
// ---------------------------------------------------------------------------

const SIGN_PIXELS_PER_METRE = 72;

function renderSignBitmap(text, widthMetres, heightMetres, isScrawled) {
  const pixelWidth = Math.max(8, Math.round(widthMetres * SIGN_PIXELS_PER_METRE));
  const pixelHeight = Math.max(8, Math.round(heightMetres * SIGN_PIXELS_PER_METRE));
  const canvas = document.createElement('canvas');
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.clearRect(0, 0, pixelWidth, pixelHeight);
  context.fillStyle = '#fff';
  context.strokeStyle = '#fff';
  context.textBaseline = 'middle';
  const fontSize = Math.round(pixelHeight * (isScrawled ? 0.78 : 0.82));
  context.font = (isScrawled ? '' : 'bold ') + fontSize + 'px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  const measuredWidth = context.measureText(text).width || 1;
  const horizontalScale = Math.min(1, (pixelWidth - 6) / measuredWidth);
  if (isScrawled) {
    // Scratched by hand: every letter sits slightly off line and off angle.
    const scrawlRandom = createSeededRandomGenerator(text.length * 7919 + text.charCodeAt(0));
    context.lineWidth = Math.max(2, pixelHeight * 0.07);
    context.lineJoin = 'round';
    let cursorX = (pixelWidth - measuredWidth * horizontalScale) / 2;
    for (const character of text) {
      const characterWidth = context.measureText(character).width * horizontalScale;
      context.save();
      context.translate(cursorX + characterWidth / 2, pixelHeight / 2 + (scrawlRandom() - 0.5) * pixelHeight * 0.16);
      context.rotate((scrawlRandom() - 0.5) * 0.28);
      context.scale(horizontalScale, 1);
      context.textAlign = 'center';
      context.strokeText(character, 0, 0);
      context.restore();
      cursorX += characterWidth;
    }
  } else {
    context.save();
    context.translate(pixelWidth / 2, pixelHeight / 2);
    context.scale(horizontalScale, 1);
    context.textAlign = 'center';
    context.fillText(text, 0, 0);
    context.restore();
  }
  const imageData = context.getImageData(0, 0, pixelWidth, pixelHeight).data;
  const bitmap = new Uint8Array(pixelWidth * pixelHeight);
  for (let pixelIndex = 0; pixelIndex < bitmap.length; pixelIndex++) {
    bitmap[pixelIndex] = imageData[pixelIndex * 4 + 3] > 110 ? 1 : 0;
  }
  return { bitmap: bitmap, pixelWidth: pixelWidth, pixelHeight: pixelHeight };
}

// Places lettering on one wall of a tile. `wall` says which side of the tile the wall is on.
function addWallSign(text, tileX, tileZ, wall, options) {
  const width = options.width, height = options.height;
  // Move and turn the sign with the room it belongs to.
  let alongOffset = options.alongOffset || 0;
  if (placement.turns !== 0 || placement.offsetX !== 0 || placement.offsetZ !== 0) {
    const localRunsAlongX = wall === WALL_NORTH || wall === WALL_SOUTH;
    const direction = rotatePointByTurns(localRunsAlongX ? 1 : 0, localRunsAlongX ? 0 : 1, placement.turns);
    alongOffset *= (direction[0] + direction[1]);
    const placed = placeTile(tileX, tileZ);
    tileX = placed[0]; tileZ = placed[1];
    wall = placeWall(wall);
  }
  // In a generated station a room may only letter its own walls.
  if (placement.isGenerating && (!isTileOpenAt(tileX, tileZ) || tileZone[tileIndexAt(tileX, tileZ)] !== placement.zone)) return;
  const runsAlongX = wall === WALL_NORTH || wall === WALL_SOUTH;
  const alongCenter = (runsAlongX ? tileX + 0.5 : tileZ + 0.5) + alongOffset;
  const rendered = renderSignBitmap(text, width, height, options.isScrawled === true);
  // Heights are measured from the floor of the tile the sign belongs to.
  const signFloor = isTileOpenAt(tileX, tileZ) ? tileFloorHeight[tileIndexAt(tileX, tileZ)] : 0;
  const sign = {
    text: text, // kept only so tests and debugging can find a sign by what it says
    wall: wall,
    alongMinimum: alongCenter - width / 2,
    alongMaximum: alongCenter + width / 2,
    bottomY: signFloor + options.centerY - height / 2,
    topY: signFloor + options.centerY + height / 2,
    isReversed: wall === WALL_SOUTH || wall === WALL_WEST,
    bitmap: rendered.bitmap,
    pixelWidth: rendered.pixelWidth,
    pixelHeight: rendered.pixelHeight
  };
  const firstAlong = Math.floor(sign.alongMinimum), lastAlong = Math.floor(sign.alongMaximum - 0.0001);
  for (let along = firstAlong; along <= lastAlong; along++) {
    const signTileX = runsAlongX ? along : tileX;
    const signTileZ = runsAlongX ? tileZ : along;
    if (!isTileOpenAt(signTileX, signTileZ)) continue;
    const index = tileIndexAt(signTileX, signTileZ);
    if (!tileSignLists[index]) tileSignLists[index] = [];
    tileSignLists[index].push(sign);
  }
}

function isWallHitOnSign(signList, wall, alongCoordinate, y) {
  for (let signIndex = 0; signIndex < signList.length; signIndex++) {
    const sign = signList[signIndex];
    if (sign.wall !== wall) continue;
    if (alongCoordinate < sign.alongMinimum || alongCoordinate >= sign.alongMaximum) continue;
    if (y < sign.bottomY || y >= sign.topY) continue;
    let horizontal = (alongCoordinate - sign.alongMinimum) / (sign.alongMaximum - sign.alongMinimum);
    if (sign.isReversed) horizontal = 1 - horizontal;
    const vertical = (sign.topY - y) / (sign.topY - sign.bottomY);
    const pixelX = Math.min(sign.pixelWidth - 1, Math.floor(horizontal * sign.pixelWidth));
    const pixelY = Math.min(sign.pixelHeight - 1, Math.floor(vertical * sign.pixelHeight));
    if (sign.bitmap[pixelY * sign.pixelWidth + pixelX] === 1) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Doors and interactable objects
// ---------------------------------------------------------------------------

const DOOR_KIND_AUTOMATIC = 0;
const DOOR_KIND_POWERED = 1;
const DOOR_KIND_KEYCARD = 2;
const DOOR_KIND_LIFT = 3;
const DOOR_TRAVEL_HEIGHT = 2.28;
const DOOR_OPENING_HEIGHT = 2.3;

// `cardLevel` only matters for keycard doors: which card (1, 2 or 3) the door needs. Left out, it is card 1.
function addDoor(tileX, tileZ, kind, cardLevel) {
  const doorCardLevel = kind === DOOR_KIND_KEYCARD ? (cardLevel || 1) : 0;
  const placedTile = placeTile(tileX, tileZ);
  tileX = placedTile[0]; tileZ = placedTile[1];
  // The slab and frame below are given in final map coordinates, so placement is set aside while they are built.
  const savedPlacement = { turns: placement.turns, offsetX: placement.offsetX, offsetZ: placement.offsetZ, offsetY: placement.offsetY };
  placement.turns = 0; placement.offsetX = 0; placement.offsetZ = 0;
  const index = tileIndexAt(tileX, tileZ);
  // A door stands on the floor of the room beside it.
  let baseY = 0;
  for (const step of [[-1, 0], [1, 0], [0, 1], [0, -1]]) {
    if (isTileOpenAt(tileX + step[0], tileZ + step[1])) { baseY = tileFloorHeight[tileIndexAt(tileX + step[0], tileZ + step[1])]; break; }
  }
  placement.offsetY = baseY;
  tileIsOpen[index] = 1;
  tileFloorHeight[index] = baseY;
  tileCeilingHeight[index] = baseY + DOOR_OPENING_HEIGHT;
  tileFlags[index] |= TILE_FLAG_DOOR;
  const passageRunsAlongX = isTileOpenAt(tileX - 1, tileZ) && isTileOpenAt(tileX + 1, tileZ);
  tileZone[index] = passageRunsAlongX ? tileZone[tileIndexAt(tileX - 1, tileZ)] : tileZone[tileIndexAt(tileX, tileZ + 1)];
  if (!tileZone[index]) tileZone[index] = passageRunsAlongX ? tileZone[tileIndexAt(tileX + 1, tileZ)] : tileZone[tileIndexAt(tileX, tileZ - 1)];
  let surfaceClass = SURFACE_DOOR_AUTOMATIC;
  if (kind === DOOR_KIND_POWERED) surfaceClass = SURFACE_DOOR_POWERED;
  if (kind === DOOR_KIND_KEYCARD) surfaceClass = doorCardLevel >= 3 ? SURFACE_DOOR_KEYCARD_3 : (doorCardLevel === 2 ? SURFACE_DOOR_KEYCARD_2 : SURFACE_DOOR_KEYCARD);
  if (kind === DOOR_KIND_LIFT) surfaceClass = SURFACE_DOOR_POWERED;
  const slab = addBoxProp(tileX + 0.5, 1.15, tileZ + 0.5,
    passageRunsAlongX ? 0.07 : 0.5, 1.15, passageRunsAlongX ? 0.5 : 0.07,
    { surfaceClass: surfaceClass, isDynamic: true });
  // The frame: a strip up each side of the opening and one across the top, standing 5 cm proud of the wall
  // on both faces. It is only there to be scanned; it never blocks anything.
  const frameOptions = { surfaceClass: SURFACE_METAL, blocksMovement: false };
  for (let face = -1; face <= 1; face += 2) {
    if (passageRunsAlongX) {
      const nearX = face < 0 ? tileX - 0.05 : tileX + 1, farX = nearX + 0.05;
      addBoxBetween(nearX, 0, tileZ - 0.09, farX, DOOR_OPENING_HEIGHT + 0.09, tileZ, frameOptions);
      addBoxBetween(nearX, 0, tileZ + 1, farX, DOOR_OPENING_HEIGHT + 0.09, tileZ + 1.09, frameOptions);
      addBoxBetween(nearX, DOOR_OPENING_HEIGHT, tileZ, farX, DOOR_OPENING_HEIGHT + 0.09, tileZ + 1, frameOptions);
    } else {
      const nearZ = face < 0 ? tileZ - 0.05 : tileZ + 1, farZ = nearZ + 0.05;
      addBoxBetween(tileX - 0.09, 0, nearZ, tileX, DOOR_OPENING_HEIGHT + 0.09, farZ, frameOptions);
      addBoxBetween(tileX + 1, 0, nearZ, tileX + 1.09, DOOR_OPENING_HEIGHT + 0.09, farZ, frameOptions);
      addBoxBetween(tileX, DOOR_OPENING_HEIGHT, nearZ, tileX + 1, DOOR_OPENING_HEIGHT + 0.09, farZ, frameOptions);
    }
  }

  const door = {
    tileX: tileX, tileZ: tileZ,
    centerX: tileX + 0.5, centerZ: tileZ + 0.5,
    kind: kind,
    cardLevel: doorCardLevel, // 0 for anything but a keycard door
    slab: slab,
    baseY: baseY, // height of the floor the door stands on
    openFraction: 0,
    isOpening: false,
    closeDelay: 0,
    deniedMessageCooldown: 0,
    forcedState: null,
    damage: 0,          // how much of the door the Hollow's pounding has used up, 0 to 1 (see 08-crawlspace.js)
    isBroken: false,    // it has given way: open for good, the slab lying in the doorway
    bangCooldown: 0     // seconds until the Hollow will go at this door again
  };
  doors.push(door);
  placement.turns = savedPlacement.turns; placement.offsetX = savedPlacement.offsetX; placement.offsetZ = savedPlacement.offsetZ;
  placement.offsetY = savedPlacement.offsetY;
  return door;
}

function registerInteractable(objectId, x, y, z, prompt, props, options) {
  const placedPosition = placePoint(x, z);
  x = placedPosition[0]; z = placedPosition[1];
  y += placement.offsetY;
  const interactable = {
    objectId: objectId,
    x: x, y: y, z: z,
    prompt: prompt,
    props: props,
    isAvailable: true,
    isDiscovered: false,
    removeWhenUsed: options && options.removeWhenUsed === true,
    mapLabel: options && options.mapLabel ? options.mapLabel : ''
  };
  for (const prop of props) prop.objectId = objectId;
  interactables.push(interactable);
  return interactable;
}

function findInteractableByObjectId(objectId) {
  for (const interactable of interactables) {
    if (interactable.objectId === objectId) return interactable;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Navigation grid (for the things that walk)
// ---------------------------------------------------------------------------

function computeNavigationGrid() {
  for (let index = 0; index < TILE_COUNT; index++) {
    tileIsWalkable[index] = tileIsOpen[index] === 1 && (tileFlags[index] & TILE_FLAG_PIT) === 0 ? 1 : 0;
  }
  const clearance = 0.28;
  for (const prop of worldProps) {
    if (!prop.blocksMovement || prop.isDynamic) continue;
    const firstTileX = Math.floor(prop.centerX - prop.boundsHalfX - clearance);
    const lastTileX = Math.floor(prop.centerX + prop.boundsHalfX + clearance);
    const firstTileZ = Math.floor(prop.centerZ - prop.boundsHalfZ - clearance);
    const lastTileZ = Math.floor(prop.centerZ + prop.boundsHalfZ + clearance);
    for (let tileZ = firstTileZ; tileZ <= lastTileZ; tileZ++) {
      for (let tileX = firstTileX; tileX <= lastTileX; tileX++) {
        if (!isInsideGrid(tileX, tileZ)) continue;
        // Only things between shin and head height (measured from that tile's own floor) are in the way.
        const tileFloor = tileFloorHeight[tileIndexAt(tileX, tileZ)];
        if (prop.maximumY < tileFloor + 0.3 || prop.minimumY > tileFloor + 1.6) continue;
        const centerX = tileX + 0.5, centerZ = tileZ + 0.5;
        let isCovered;
        if (prop.kind === PROP_KIND_CYLINDER && prop.axis === AXIS_Y || prop.kind === PROP_KIND_SPHERE) {
          isCovered = distanceBetweenPoints(centerX, centerZ, prop.centerX, prop.centerZ) < prop.radius + clearance;
        } else {
          isCovered = Math.abs(centerX - prop.centerX) < prop.boundsHalfX + clearance &&
            Math.abs(centerZ - prop.centerZ) < prop.boundsHalfZ + clearance;
        }
        if (isCovered) tileIsWalkable[tileIndexAt(tileX, tileZ)] = 0;
      }
    }
  }
}

function isWalkableAt(tileX, tileZ) {
  return isInsideGrid(tileX, tileZ) && tileIsWalkable[tileZ * GRID_WIDTH + tileX] === 1;
}

function findNearestWalkableTileIndex(x, z) {
  const startX = Math.floor(x), startZ = Math.floor(z);
  if (isWalkableAt(startX, startZ)) return tileIndexAt(startX, startZ);
  let bestIndex = -1, bestDistance = Infinity;
  for (let ring = 1; ring <= 8 && bestIndex < 0; ring++) {
    for (let offsetZ = -ring; offsetZ <= ring; offsetZ++) {
      for (let offsetX = -ring; offsetX <= ring; offsetX++) {
        const tileX = startX + offsetX, tileZ = startZ + offsetZ;
        if (!isWalkableAt(tileX, tileZ)) continue;
        const distance = distanceBetweenPoints(x, z, tileX + 0.5, tileZ + 0.5);
        if (distance < bestDistance) { bestDistance = distance; bestIndex = tileIndexAt(tileX, tileZ); }
      }
    }
  }
  return bestIndex;
}

const navigationQueue = new Int32Array(TILE_COUNT);
const NAVIGATION_UNREACHABLE = 32000;

// Flood-fills walking distance (in tiles) outward from a target tile.
// `forbiddenZone` lets a walker refuse to enter one zone; `allowedZones` restricts it to a set.
function computeDistanceField(field, targetIndex, forbiddenZone, allowedZones) {
  field.fill(NAVIGATION_UNREACHABLE);
  if (targetIndex < 0) return;
  let queueHead = 0, queueTail = 0;
  field[targetIndex] = 0;
  navigationQueue[queueTail++] = targetIndex;
  while (queueHead < queueTail) {
    const index = navigationQueue[queueHead++];
    const nextDistance = field[index] + 1;
    const tileX = index % GRID_WIDTH, tileZ = (index - tileX) / GRID_WIDTH;
    for (let direction = 0; direction < 4; direction++) {
      const neighbourX = tileX + (direction === 0 ? 1 : direction === 1 ? -1 : 0);
      const neighbourZ = tileZ + (direction === 2 ? 1 : direction === 3 ? -1 : 0);
      if (!isInsideGrid(neighbourX, neighbourZ)) continue;
      const neighbourIndex = neighbourZ * GRID_WIDTH + neighbourX;
      if (tileIsWalkable[neighbourIndex] === 0 || field[neighbourIndex] <= nextDistance) continue;
      if (Math.abs(tileFloorHeight[neighbourIndex] - tileFloorHeight[index]) > MAXIMUM_STEP_HEIGHT) continue; // too tall to step
      const zone = tileZone[neighbourIndex];
      if (forbiddenZone && zone === forbiddenZone) continue;
      if (allowedZones && allowedZones.indexOf(zone) < 0) continue;
      field[neighbourIndex] = nextDistance;
      navigationQueue[queueTail++] = neighbourIndex;
    }
  }
}

// True when a straight walk between two points never leaves walkable tiles.
function hasClearWalkingLine(fromX, fromZ, toX, toZ) {
  const distance = distanceBetweenPoints(fromX, fromZ, toX, toZ);
  const stepCount = Math.max(1, Math.ceil(distance / 0.3));
  for (let step = 0; step <= stepCount; step++) {
    const amount = step / stepCount;
    const sampleX = fromX + (toX - fromX) * amount, sampleZ = fromZ + (toZ - fromZ) * amount;
    if (!isWalkableAt(Math.floor(sampleX), Math.floor(sampleZ))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Collision for a standing body (a circle on the floor plan)
// ---------------------------------------------------------------------------

let collisionStampCounter = 1;
const collisionResult = { x: 0, z: 0 };

function pushCircleOutOfRectangle(circle, radius, minimumX, minimumZ, maximumX, maximumZ) {
  const nearestX = clampNumber(circle.x, minimumX, maximumX);
  const nearestZ = clampNumber(circle.z, minimumZ, maximumZ);
  let deltaX = circle.x - nearestX, deltaZ = circle.z - nearestZ;
  const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (distanceSquared >= radius * radius) return;
  if (distanceSquared > 1e-9) {
    const distance = Math.sqrt(distanceSquared);
    circle.x = nearestX + deltaX / distance * radius;
    circle.z = nearestZ + deltaZ / distance * radius;
    return;
  }
  // Centre is inside the rectangle: leave through the closest side.
  const toLeft = circle.x - minimumX, toRight = maximumX - circle.x;
  const toTop = circle.z - minimumZ, toBottom = maximumZ - circle.z;
  const smallest = Math.min(toLeft, toRight, toTop, toBottom);
  if (smallest === toLeft) circle.x = minimumX - radius;
  else if (smallest === toRight) circle.x = maximumX + radius;
  else if (smallest === toTop) circle.z = minimumZ - radius;
  else circle.z = maximumZ + radius;
}

// `floorHeight` is the height of the floor the body is standing on (0 on the lift's level).
function resolveBodyCollision(x, z, radius, bodyTopHeight, floorHeight) {
  floorHeight = floorHeight || 0;
  collisionResult.x = x;
  collisionResult.z = z;
  for (let pass = 0; pass < 3; pass++) {
    const centerTileX = Math.floor(collisionResult.x), centerTileZ = Math.floor(collisionResult.z);
    const stamp = ++collisionStampCounter;
    for (let tileZ = centerTileZ - 1; tileZ <= centerTileZ + 1; tileZ++) {
      for (let tileX = centerTileX - 1; tileX <= centerTileX + 1; tileX++) {
        // Rock, the pit, and any floor too far above or below to step onto all stop a body.
        const isSolid = !isInsideGrid(tileX, tileZ) || tileIsOpen[tileZ * GRID_WIDTH + tileX] === 0 ||
          (tileFlags[tileZ * GRID_WIDTH + tileX] & TILE_FLAG_PIT) !== 0 ||
          Math.abs(tileFloorHeight[tileZ * GRID_WIDTH + tileX] - floorHeight) > MAXIMUM_STEP_HEIGHT ||
          // too low to get under at this height: a vent, to someone standing up
          tileCeilingHeight[tileZ * GRID_WIDTH + tileX] - tileFloorHeight[tileZ * GRID_WIDTH + tileX] < bodyTopHeight + 0.02;
        if (isSolid) {
          pushCircleOutOfRectangle(collisionResult, radius, tileX, tileZ, tileX + 1, tileZ + 1);
          continue;
        }
        const list = tilePropLists[tileZ * GRID_WIDTH + tileX];
        if (!list) continue;
        for (let listIndex = 0; listIndex < list.length; listIndex++) {
          const prop = list[listIndex];
          if (prop.collisionStamp === stamp) continue;
          prop.collisionStamp = stamp;
          if (!prop.blocksMovement || prop.isRemoved) continue;
          if (prop.minimumY > floorHeight + bodyTopHeight || prop.maximumY < floorHeight + 0.3) continue;
          if ((prop.kind === PROP_KIND_CYLINDER && prop.axis === AXIS_Y) || prop.kind === PROP_KIND_SPHERE) {
            const deltaX = collisionResult.x - prop.centerX, deltaZ = collisionResult.z - prop.centerZ;
            const distance = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
            const minimumDistance = radius + prop.radius;
            if (distance < minimumDistance && distance > 1e-6) {
              collisionResult.x = prop.centerX + deltaX / distance * minimumDistance;
              collisionResult.z = prop.centerZ + deltaZ / distance * minimumDistance;
            }
          } else if (prop.kind === PROP_KIND_BOX && (prop.sineYaw !== 0)) {
            // Rotated box: solve in the box's own frame, then rotate the answer back.
            const offsetX = collisionResult.x - prop.centerX, offsetZ = collisionResult.z - prop.centerZ;
            const local = {
              x: offsetX * prop.cosineYaw + offsetZ * prop.sineYaw,
              z: -offsetX * prop.sineYaw + offsetZ * prop.cosineYaw
            };
            pushCircleOutOfRectangle(local, radius, -prop.halfX, -prop.halfZ, prop.halfX, prop.halfZ);
            collisionResult.x = prop.centerX + local.x * prop.cosineYaw - local.z * prop.sineYaw;
            collisionResult.z = prop.centerZ + local.x * prop.sineYaw + local.z * prop.cosineYaw;
          } else {
            pushCircleOutOfRectangle(collisionResult, radius,
              prop.centerX - prop.boundsHalfX, prop.centerZ - prop.boundsHalfZ,
              prop.centerX + prop.boundsHalfX, prop.centerZ + prop.boundsHalfZ);
          }
        }
      }
    }
  }
  return collisionResult;
}

// ---------------------------------------------------------------------------
// Occluder mesh: solid black geometry that hides points behind walls
// ---------------------------------------------------------------------------

function pushQuad(target, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
  target.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
}

function pushBoxTriangles(target, prop) {
  const corners = [];
  for (let cornerIndex = 0; cornerIndex < 8; cornerIndex++) {
    const localX = (cornerIndex & 1 ? 1 : -1) * prop.halfX;
    const localY = (cornerIndex & 2 ? 1 : -1) * prop.halfY;
    const localZ = (cornerIndex & 4 ? 1 : -1) * prop.halfZ;
    corners.push([
      prop.centerX + localX * prop.cosineYaw - localZ * prop.sineYaw,
      prop.centerY + localY,
      prop.centerZ + localX * prop.sineYaw + localZ * prop.cosineYaw
    ]);
  }
  const faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  for (const face of faces) {
    const a = corners[face[0]], b = corners[face[1]], c = corners[face[2]], d = corners[face[3]];
    pushQuad(target, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  }
}

function pushCylinderTriangles(target, prop) {
  const segmentCount = prop.radius > 0.5 ? 20 : (prop.radius > 0.1 ? 12 : 6);
  const toWorld = function (ringCosine, ringSine, along) {
    if (prop.axis === AXIS_Y) return [prop.centerX + ringCosine * prop.radius, prop.centerY + along, prop.centerZ + ringSine * prop.radius];
    if (prop.axis === AXIS_X) return [prop.centerX + along, prop.centerY + ringCosine * prop.radius, prop.centerZ + ringSine * prop.radius];
    return [prop.centerX + ringCosine * prop.radius, prop.centerY + ringSine * prop.radius, prop.centerZ + along];
  };
  const centerLow = toWorld(0, 0, -prop.halfLength), centerHigh = toWorld(0, 0, prop.halfLength);
  for (let segment = 0; segment < segmentCount; segment++) {
    const angleA = segment / segmentCount * TWO_PI, angleB = (segment + 1) / segmentCount * TWO_PI;
    const lowA = toWorld(Math.cos(angleA), Math.sin(angleA), -prop.halfLength);
    const lowB = toWorld(Math.cos(angleB), Math.sin(angleB), -prop.halfLength);
    const highA = toWorld(Math.cos(angleA), Math.sin(angleA), prop.halfLength);
    const highB = toWorld(Math.cos(angleB), Math.sin(angleB), prop.halfLength);
    pushQuad(target, lowA[0], lowA[1], lowA[2], lowB[0], lowB[1], lowB[2], highB[0], highB[1], highB[2], highA[0], highA[1], highA[2]);
    target.push(centerLow[0], centerLow[1], centerLow[2], lowA[0], lowA[1], lowA[2], lowB[0], lowB[1], lowB[2]);
    target.push(centerHigh[0], centerHigh[1], centerHigh[2], highA[0], highA[1], highA[2], highB[0], highB[1], highB[2]);
  }
}

function pushSphereTriangles(target, prop) {
  const latitudeCount = 7, longitudeCount = 12;
  const pointOnSphere = function (latitudeIndex, longitudeIndex) {
    const polar = latitudeIndex / latitudeCount * Math.PI, azimuth = longitudeIndex / longitudeCount * TWO_PI;
    const scale = prop.radius * 0.97;
    return [prop.centerX + Math.sin(polar) * Math.cos(azimuth) * scale, prop.centerY + Math.cos(polar) * scale,
      prop.centerZ + Math.sin(polar) * Math.sin(azimuth) * scale];
  };
  for (let latitudeIndex = 0; latitudeIndex < latitudeCount; latitudeIndex++) {
    for (let longitudeIndex = 0; longitudeIndex < longitudeCount; longitudeIndex++) {
      const a = pointOnSphere(latitudeIndex, longitudeIndex), b = pointOnSphere(latitudeIndex, longitudeIndex + 1);
      const c = pointOnSphere(latitudeIndex + 1, longitudeIndex + 1), d = pointOnSphere(latitudeIndex + 1, longitudeIndex);
      pushQuad(target, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    }
  }
}

// Where in the occluder mesh the props begin (counted in vertices): everything before is floor, wall and ceiling.
// The lit view of debug mode draws the two parts in different colours.
let worldOccluderPropStart = 0;

function buildWorldOccluderVertices() {
  const vertices = [];
  const neighbourOffsets = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let tileZ = 0; tileZ < GRID_DEPTH; tileZ++) {
    for (let tileX = 0; tileX < GRID_WIDTH; tileX++) {
      const index = tileIndexAt(tileX, tileZ);
      if (!tileIsOpen[index]) continue;
      const floor = tileFloorHeight[index], ceiling = tileCeilingHeight[index];
      pushQuad(vertices, tileX, floor, tileZ, tileX + 1, floor, tileZ, tileX + 1, floor, tileZ + 1, tileX, floor, tileZ + 1);
      pushQuad(vertices, tileX, ceiling, tileZ, tileX + 1, ceiling, tileZ, tileX + 1, ceiling, tileZ + 1, tileX, ceiling, tileZ + 1);
      for (let wall = 0; wall < 4; wall++) {
        const neighbourX = tileX + neighbourOffsets[wall][0], neighbourZ = tileZ + neighbourOffsets[wall][1];
        // The two floor-plan end points of this tile edge.
        let edgeStartX, edgeStartZ, edgeEndX, edgeEndZ;
        if (wall === WALL_NORTH) { edgeStartX = tileX; edgeStartZ = tileZ; edgeEndX = tileX + 1; edgeEndZ = tileZ; }
        else if (wall === WALL_EAST) { edgeStartX = tileX + 1; edgeStartZ = tileZ; edgeEndX = tileX + 1; edgeEndZ = tileZ + 1; }
        else if (wall === WALL_SOUTH) { edgeStartX = tileX; edgeStartZ = tileZ + 1; edgeEndX = tileX + 1; edgeEndZ = tileZ + 1; }
        else { edgeStartX = tileX; edgeStartZ = tileZ; edgeEndX = tileX; edgeEndZ = tileZ + 1; }
        const pushVerticalStrip = function (bottom, top) {
          pushQuad(vertices, edgeStartX, bottom, edgeStartZ, edgeEndX, bottom, edgeEndZ, edgeEndX, top, edgeEndZ, edgeStartX, top, edgeStartZ);
        };
        if (!isTileOpenAt(neighbourX, neighbourZ)) {
          pushVerticalStrip(floor, ceiling);
        } else {
          const neighbourIndex = tileIndexAt(neighbourX, neighbourZ);
          if (tileCeilingHeight[neighbourIndex] < ceiling) pushVerticalStrip(tileCeilingHeight[neighbourIndex], ceiling);
          if (tileFloorHeight[neighbourIndex] > floor) pushVerticalStrip(floor, tileFloorHeight[neighbourIndex]);
        }
      }
    }
  }
  worldOccluderPropStart = vertices.length / 3;
  for (const prop of worldProps) {
    if (prop.isDynamic) continue;
    if (prop.kind === PROP_KIND_BOX) pushBoxTriangles(vertices, prop);
    else if (prop.kind === PROP_KIND_CYLINDER) pushCylinderTriangles(vertices, prop);
    else pushSphereTriangles(vertices, prop);
  }
  return new Float32Array(vertices);
}
