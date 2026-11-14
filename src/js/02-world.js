// ---------------------------------------------------------------------------
// World representation: a tile grid (1 tile = 1 metre) carved into rooms, plus
// "props" (boxes, cylinders, spheres) for everything that stands in the rooms.
// The same data drives ray casting, collision, navigation and the occluder mesh.
// ---------------------------------------------------------------------------

const GRID_WIDTH = 76;
const GRID_DEPTH = 64;
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

function tileIndexAt(tileX, tileZ) {
  return tileZ * GRID_WIDTH + tileX;
}

function isInsideGrid(tileX, tileZ) {
  return tileX >= 0 && tileZ >= 0 && tileX < GRID_WIDTH && tileZ < GRID_DEPTH;
}

function isTileOpenAt(tileX, tileZ) {
  return isInsideGrid(tileX, tileZ) && tileIsOpen[tileZ * GRID_WIDTH + tileX] === 1;
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
  for (let tileZ = startZ; tileZ < endZ; tileZ++) {
    for (let tileX = startX; tileX < endX; tileX++) {
      const index = tileIndexAt(tileX, tileZ);
      tileIsOpen[index] = 1;
      tileFloorHeight[index] = 0;
      tileCeilingHeight[index] = ceilingHeight;
      tileZone[index] = zone;
    }
  }
}

function setTileFlagInRectangle(startX, startZ, endX, endZ, flag) {
  for (let tileZ = startZ; tileZ < endZ; tileZ++) {
    for (let tileX = startX; tileX < endX; tileX++) {
      if (isTileOpenAt(tileX, tileZ)) tileFlags[tileIndexAt(tileX, tileZ)] |= flag;
    }
  }
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
  const yaw = options && options.yaw ? options.yaw : 0;
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
  if (isDoorOpen) {
    const doorFrame = createLocalFrame(
      x + 0.24 * frame.cosine - 0.22 * frame.sine - 0.2 * Math.sin(yaw + 1.2),
      z + 0.24 * frame.sine + 0.22 * frame.cosine + 0.2 * Math.cos(yaw + 1.2), yaw + 1.2);
    addBoxInFrame(doorFrame, 0, 0.95, 0, 0.015, 0.9, 0.22, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  }
}

function addCrate(x, z, halfSize, yaw, baseHeight) {
  const bottom = baseHeight || 0;
  return addBoxProp(x, bottom + halfSize, z, halfSize, halfSize, halfSize, { yaw: yaw || 0 });
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
  for (let rungIndex = 0; rungIndex < 10; rungIndex++) {
    addBoxProp(x, 0.4 + rungIndex * 0.45, z + radius + 0.09, 0.2, 0.015, 0.015, CLUTTER);
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
  const runsAlongX = wall === WALL_NORTH || wall === WALL_SOUTH;
  const alongCenter = (runsAlongX ? tileX + 0.5 : tileZ + 0.5) + (options.alongOffset || 0);
  const rendered = renderSignBitmap(text, width, height, options.isScrawled === true);
  const sign = {
    wall: wall,
    alongMinimum: alongCenter - width / 2,
    alongMaximum: alongCenter + width / 2,
    bottomY: options.centerY - height / 2,
    topY: options.centerY + height / 2,
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

function addDoor(tileX, tileZ, kind) {
  const index = tileIndexAt(tileX, tileZ);
  tileIsOpen[index] = 1;
  tileFloorHeight[index] = 0;
  tileCeilingHeight[index] = DOOR_OPENING_HEIGHT;
  tileFlags[index] |= TILE_FLAG_DOOR;
  const passageRunsAlongX = isTileOpenAt(tileX - 1, tileZ) && isTileOpenAt(tileX + 1, tileZ);
  tileZone[index] = passageRunsAlongX ? tileZone[tileIndexAt(tileX - 1, tileZ)] : tileZone[tileIndexAt(tileX, tileZ + 1)];
  let surfaceClass = SURFACE_DOOR_AUTOMATIC;
  if (kind === DOOR_KIND_POWERED) surfaceClass = SURFACE_DOOR_POWERED;
  if (kind === DOOR_KIND_KEYCARD) surfaceClass = SURFACE_DOOR_KEYCARD;
  if (kind === DOOR_KIND_LIFT) surfaceClass = SURFACE_DOOR_POWERED;
  const slab = addBoxProp(tileX + 0.5, 1.15, tileZ + 0.5,
    passageRunsAlongX ? 0.07 : 0.5, 1.15, passageRunsAlongX ? 0.5 : 0.07,
    { surfaceClass: surfaceClass, isDynamic: true });
  const door = {
    tileX: tileX, tileZ: tileZ,
    centerX: tileX + 0.5, centerZ: tileZ + 0.5,
    kind: kind,
    slab: slab,
    openFraction: 0,
    isOpening: false,
    closeDelay: 0,
    deniedMessageCooldown: 0,
    forcedState: null
  };
  doors.push(door);
  return door;
}

function registerInteractable(objectId, x, y, z, prompt, props, options) {
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
    if (prop.maximumY < 0.3 || prop.minimumY > 1.6) continue;
    const firstTileX = Math.floor(prop.centerX - prop.boundsHalfX - clearance);
    const lastTileX = Math.floor(prop.centerX + prop.boundsHalfX + clearance);
    const firstTileZ = Math.floor(prop.centerZ - prop.boundsHalfZ - clearance);
    const lastTileZ = Math.floor(prop.centerZ + prop.boundsHalfZ + clearance);
    for (let tileZ = firstTileZ; tileZ <= lastTileZ; tileZ++) {
      for (let tileX = firstTileX; tileX <= lastTileX; tileX++) {
        if (!isInsideGrid(tileX, tileZ)) continue;
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

function resolveBodyCollision(x, z, radius, bodyTopHeight) {
  collisionResult.x = x;
  collisionResult.z = z;
  for (let pass = 0; pass < 3; pass++) {
    const centerTileX = Math.floor(collisionResult.x), centerTileZ = Math.floor(collisionResult.z);
    const stamp = ++collisionStampCounter;
    for (let tileZ = centerTileZ - 1; tileZ <= centerTileZ + 1; tileZ++) {
      for (let tileX = centerTileX - 1; tileX <= centerTileX + 1; tileX++) {
        const isSolid = !isInsideGrid(tileX, tileZ) || tileIsOpen[tileZ * GRID_WIDTH + tileX] === 0 ||
          (tileFlags[tileZ * GRID_WIDTH + tileX] & TILE_FLAG_PIT) !== 0;
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
          if (prop.minimumY > bodyTopHeight || prop.maximumY < 0.3) continue;
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
  for (const prop of worldProps) {
    if (prop.isDynamic) continue;
    if (prop.kind === PROP_KIND_BOX) pushBoxTriangles(vertices, prop);
    else if (prop.kind === PROP_KIND_CYLINDER) pushCylinderTriangles(vertices, prop);
    else pushSphereTriangles(vertices, prop);
  }
  return new Float32Array(vertices);
}
