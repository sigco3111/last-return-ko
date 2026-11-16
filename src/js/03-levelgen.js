// ---------------------------------------------------------------------------
// Generated stations: the same rooms as the classic station, plus a set of extra
// ones, arranged differently for every seed.
//
// How a station is put together:
//   1. PLAN  Rooms are attached one at a time to doorways ("sockets") of rooms and corridors that are
//            already placed, either wall to wall or at the end of a new corridor. Nothing is built yet;
//            the plan is only rectangles, so a room that does not fit costs nothing to try.
//   2. LOCKS Every room belongs to a tier: 0 can be reached at once, 1 needs mains power, 2 needs the
//            keycard. A door from a lower tier into a higher one gets that tier's lock. Rooms are only ever
//            attached to their own tier or a lower one, so the station can always be finished.
//   3. BUILD The plan is carved, doors are hung, rooms are furnished, corridors are dressed and
//            every door gets the name of the room behind it.
// ---------------------------------------------------------------------------

const ZONE_GENERATED_ROOM = 250; // stand-in zone for rooms that only exist in generated stations

// TWEAK: how big each size of station is. "fillers" are the extra rooms per tier (no power, power, keycard).
const GENERATED_SIZE_PRESETS = {
  // vents: crawl-height tunnels between rooms. loops: full-height service ducts. Both join places far apart on foot.
  // extraJobs, errands: the fewest and the most quests a station of this size is given from each of the two
  //           draws of quests (QUEST_POOLS in 09-quests.js, where every quest is described).
  // extraGenerators: the fewest and the most generators it has besides Generator 2.
  // keycards: 1 to 3. Each card opens one more ring of doors, and the next card is somewhere inside that ring;
  //           Shaft 9 is behind the last. The third number of "fillers" is shared out between the rings.
  small: { label: 'Small', fillers: [2, 1, 0], loops: 2, vents: 1, keycards: 1, extraJobs: [0, 1], errands: [0, 0], extraGenerators: [0, 1], spineLength: [10, 14] },
  medium: { label: 'Medium', fillers: [4, 2, 1], loops: 3, vents: 2, keycards: 1, extraJobs: [1, 1], errands: [0, 1], extraGenerators: [0, 2], spineLength: [13, 18] },
  large: { label: 'Large', fillers: [7, 4, 2], loops: 5, vents: 3, keycards: 2, extraJobs: [1, 2], errands: [0, 1], extraGenerators: [1, 2], spineLength: [16, 22] },
  massive: { label: 'Massive', fillers: [12, 6, 4], loops: 7, vents: 7, keycards: 3, extraJobs: [2, 3], errands: [1, 2], extraGenerators: [1, 3], spineLength: [18, 26] },
};

// TWEAK: how spread out a station is.
//   corridorChance  how often a room is put at the end of a new corridor instead of straight against another room
//   corridorLength  shortest and longest such corridor, in metres
//   spread          how far from the lift rooms are happy to be, in metres (smaller = packed closer)
const GENERATED_LAYOUT_PRESETS = {
  tight: { label: 'Tight', corridorChance: 0.3, corridorLength: [3, 6], spread: 14 },
  mixed: { label: 'Mixed', corridorChance: 0.55, corridorLength: [3, 9], spread: 24 },
  sprawling: { label: 'Sprawling', corridorChance: 0.7, corridorLength: [5, 12], spread: 60 },
  sparse: { label: 'Sparse', corridorChance: 0.8, corridorLength: [7, 16], spread: 70 },
};


// How many levels a station has. With two, everything behind the keycard (Shaft 9 included) is down a flight of stairs.
const GENERATED_LEVEL_PRESETS = {
  one: { label: 'One level', hasLowerLevel: false },
  two: { label: 'Two levels', hasLowerLevel: true }
};

// TWEAK: things scratched on corridor walls in generated stations.
const CORRIDOR_SCRAWLS = ['IT FEELS THE LIGHT', 'TURN IT OFF', 'DO NOT RUN', 'COUNT THEM AGAIN', 'IT IS LISTENING', 'WE SHOWED IT THE WAY', 'STAND STILL', 'WE WOKE IT', 'DO NOT R', 'IT IS OUR FAULT'];

const WALL_DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // north, east, south, west as [x, z] steps

// ---------------------------------------------------------------------------
// Extra rooms. Each is described with its north-west corner at (0, 0).
// ---------------------------------------------------------------------------

function addBunkBed(x, z, runsAlongX) {
  const lengthX = runsAlongX ? 2.0 : 0.9, lengthZ = runsAlongX ? 0.9 : 2.0;
  addBoxBetween(x, 0.35, z, x + lengthX, 0.47, z + lengthZ);
  addBoxBetween(x, 1.35, z, x + lengthX, 1.47, z + lengthZ, CLUTTER);
  for (let corner = 0; corner < 4; corner++) {
    const postX = x + (corner & 1 ? lengthX - 0.05 : 0), postZ = z + (corner & 2 ? lengthZ - 0.05 : 0);
    addBoxBetween(postX, 0, postZ, postX + 0.05, 1.8, postZ + 0.05, CLUTTER);
  }
  addBoxBetween(x + 0.05, 0.47, z + 0.05, x + (runsAlongX ? 0.5 : lengthX - 0.05), 0.56, z + (runsAlongX ? lengthZ - 0.05 : 0.5), CLUTTER);
}

function furnishBoilerRoom(random, roomName) {
  for (const boilerX of [2.0, 5.6]) {
    addCylinderProp(AXIS_Y, boilerX, 1.2, 1.7, 0.85, 1.2, { surfaceClass: SURFACE_METAL });
    addSphereProp(boilerX, 2.25, 1.7, 0.86, { surfaceClass: SURFACE_METAL, blocksMovement: false });
    addVerticalPipe(boilerX, 1.7, 2.9, 3.4, 0.14, false);
    addCylinderProp(AXIS_Z, boilerX, 0.9, 2.62, 0.16, 0.1, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  }
  addPipeAlongX(0.2, 7.8, 2.7, 0.3, 0.1);
  addPipeAlongX(0.2, 7.8, 0.35, 0.22, 0.07);
  addBoxBetween(7.86, 1.0, 2.6, 7.98, 1.8, 4.2, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addTable(6.8, 5.6, 0, 1.0, 0.8, 0.76);
  addBarrel(0.6, 5.9);
  addCeilingLamp(4, 3.6, 3.4, true);
  addWallSign(roomName || 'BOILER HOUSE', 3, 0, WALL_NORTH, { width: 2.4, height: 0.3, centerY: 3.0, alongOffset: 0.5 });
}

function furnishWorkshop(random, roomName) {
  addBoxBetween(1.0, 0, 0.0, 6.0, 0.9, 0.7);
  addBoxProp(2.2, 1.0, 0.35, 0.12, 0.1, 0.16, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addBoxBetween(1.0, 1.4, 0.0, 6.0, 1.46, 0.3, CLUTTER);
  addBoxBetween(7.2, 0, 0.0, 8.9, 2.0, 0.6, { surfaceClass: SURFACE_METAL });
  addBoxBetween(2.5, 0, 4.9, 5.5, 0.85, 5.7, { surfaceClass: SURFACE_METAL });
  addCylinderProp(AXIS_X, 4.0, 1.1, 5.3, 0.18, 1.2, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addBoxProp(2.8, 1.15, 5.3, 0.22, 0.3, 0.3, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addCrateStack(0.7, 5.2, random);
  addChair(6.6, 1.3, 2.4, random() < 0.5);
  addCeilingLamp(4.5, 3, 3.0, true);
  addWallSign(roomName || 'WORKSHOP', 3, 0, WALL_NORTH, { width: 1.8, height: 0.28, centerY: 2.4, alongOffset: 0.5 });
}

function furnishBunkRoom(random, roomName) {
  addBunkBed(0.05, 0.2, false);
  addBunkBed(0.05, 2.6, false);
  addBunkBed(2.6, 0.05, true);
  addRoundTable(4.3, 3.5, 0.55);
  addChair(5.1, 3.9, -1.0, false);
  addChair(3.6, 4.2, 0.8, random() < 0.6);
  addLocker(0.5, 5.75, Math.PI, false);
  addLocker(1.05, 5.75, Math.PI, random() < 0.5);
  addBoxProp(5.6, 0.12, 0.6, 0.3, 0.12, 0.2, { yaw: 0.4, blocksMovement: false });
  addCeilingLamp(3.5, 3, 2.8, true);
  addWallSign(roomName || 'CREW QUARTERS', 4, 5, WALL_SOUTH, { width: 2.2, height: 0.26, centerY: 2.3, alongOffset: 0.9 });
}

function furnishWashroom(random) {
  for (const partitionX of [1.5, 3.0, 4.5]) addBoxBetween(partitionX, 0.15, 0.0, partitionX + 0.05, 2.0, 1.6);
  for (const stallX of [0.75, 2.25, 3.75, 5.25]) {
    addBoxBetween(stallX - 0.2, 0, 0.1, stallX + 0.2, 0.42, 0.7, CLUTTER);
    addBoxBetween(stallX - 0.22, 0.42, 0.05, stallX + 0.22, 0.95, 0.22, CLUTTER);
  }
  addBoxBetween(5.5, 0.7, 2.2, 6.0, 0.88, 4.6);
  addBoxBetween(5.92, 1.1, 2.3, 5.98, 1.9, 4.5, { surfaceClass: SURFACE_SIGN, blocksMovement: false });
  addVerticalPipe(5.85, 2.6, 0, 0.7, 0.03, false);
  addVerticalPipe(5.85, 4.2, 0, 0.7, 0.03, false);
  addPipeAlongX(0.1, 5.9, 2.4, 0.12, 0.05);
  addCylinderProp(AXIS_Y, 0.5, 0.2, 4.4, 0.18, 0.2, CLUTTER);
  addCeilingLamp(3, 2.8, 2.7, true);
}

function furnishElectricalRoom(random) {
  for (let unit = 0; unit < 5; unit++) addBoxBetween(0.0, 0, 0.35 + unit * 1.06, 0.7, 2.1, 1.35 + unit * 1.06, { surfaceClass: SURFACE_METAL });
  for (let unit = 0; unit < 3; unit++) addBoxBetween(1.6 + unit * 1.2, 0, 5.3, 2.7 + unit * 1.2, 2.1, 6.0, { surfaceClass: SURFACE_METAL });
  addBoxBetween(4.6, 0, 0.2, 5.6, 0.9, 0.8, { surfaceClass: SURFACE_METAL });
  addBoxBetween(0.7, 2.55, 0.2, 1.1, 2.62, 5.8, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addBoxBetween(1.1, 2.55, 5.4, 5.6, 2.62, 5.8, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addCeilingLamp(3, 3, 3.0, false);
  addWallSign('DANGER · 400 V', 0, 3, WALL_WEST, { width: 2.2, height: 0.3, centerY: 2.45 });
  setTileFlagInRectangle(1, 1, 5, 2, TILE_FLAG_HAZARD);
}

function furnishStorageHall(random, roomName) {
  for (const rackX of [2.5, 4.5, 8.5, 10.5]) {
    addShelfRackAlongZ(rackX, 0.6, 3.1, 2.3, random, 0.6);
    addShelfRackAlongZ(rackX, 5.9, 8.4, 2.3, random, 0.6);
  }
  addCrate(7.7, 7.6, 0.35, 0.25, 0);
  addCrateStack(0.7, 0.7, random);
  addBarrel(11.4, 8.4);
  addBarrel(11.3, 7.65);
  addBoxProp(6.4, 0.12, 2.0, 0.3, 0.12, 0.2, { yaw: 0.7, blocksMovement: false });
  addCeilingLamp(6, 4.5, 4.0, true);
  addWallSign(roomName || 'STORES', 6, 0, WALL_NORTH, { width: 1.6, height: 0.4, centerY: 3.2 });
}

function furnishFloodedRoom(random, roomName) {
  addCylinderProp(AXIS_X, 2.4, 0.27, 4.9, 0.29, 0.44, { surfaceClass: SURFACE_METAL });
  addBarrel(8.9, 5.3);
  addBoxProp(6.2, 0.25, 1.0, 0.5, 0.3, 0.4, { yaw: 0.5 });
  addBoxProp(4.4, 0.5, 5.2, 0.9, 0.04, 0.3, { yaw: 0.15, blocksMovement: false });
  addBoxProp(4.4, 0.25, 5.45, 0.9, 0.25, 0.03, { yaw: 0.15, blocksMovement: false });
  addPipeAlongX(0.1, 9.9, 0.45, 0.2, 0.12);
  addPipeAlongX(0.1, 9.9, 2.3, 5.75, 0.1);
  addWallSign(roomName || 'SUMP 3', 5, 0, WALL_NORTH, { width: 1.4, height: 0.3, centerY: 2.0 });
}

function furnishServerRoom(random, roomName) {
  for (let unit = 0; unit < 4; unit++) {
    addBoxBetween(1.6, 0, 3.2 + unit, 2.3, 2.0, 4.15 + unit, { surfaceClass: SURFACE_METAL });
    addBoxBetween(5.4, 0, 3.2 + unit, 6.1, 2.0, 4.15 + unit, { surfaceClass: SURFACE_METAL });
  }
  addBoxBetween(2.5, 0, 0.0, 5.5, 0.9, 0.7);
  addBoxProp(3.3, 1.1, 0.35, 0.24, 0.17, 0.03, { yaw: 0.1, blocksMovement: false });
  addBoxProp(4.7, 1.1, 0.35, 0.24, 0.17, 0.03, { yaw: -0.15, blocksMovement: false });
  addChair(4.0, 1.4, 0.2, random() < 0.5);
  addBoxBetween(1.6, 2.5, 3.2, 6.1, 2.56, 3.5, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addCeilingLamp(4, 4.5, 3.0, false);
  addWallSign(roomName || 'TELEMETRY', 4, 0, WALL_NORTH, { width: 2.0, height: 0.26, centerY: 2.4 });
}


function furnishInfirmary(random, roomName) {
  addGurney(1.4, 1.3, 0, false);
  addGurney(3.6, 1.3, 0, true);
  addGurney(5.8, 1.3, 0.12, false);
  addBoxBetween(2.47, 0.3, 0.1, 2.53, 1.9, 2.3, CLUTTER); // screens between the beds
  addBoxBetween(4.67, 0.3, 0.1, 4.73, 1.9, 2.3, CLUTTER);
  addBoxBetween(8.4, 0, 3.2, 9.0, 1.9, 5.4, { surfaceClass: SURFACE_METAL }); // drug cabinet
  addTable(1.3, 5.9, 0, 1.4, 0.7, 0.76);
  addChair(1.3, 5.1, Math.PI, random() < 0.4);
  addVerticalPipe(7.6, 0.6, 0, 1.9, 0.02, false); // drip stand
  addBoxProp(7.6, 1.86, 0.6, 0.12, 0.02, 0.02, CLUTTER);
  addCylinderProp(AXIS_Y, 6.9, 0.2, 5.9, 0.18, 0.2, CLUTTER);
  addCeilingLamp(4.5, 3.5, 2.8, true);
  addWallSign(roomName || 'INFIRMARY', 4, 0, WALL_NORTH, { width: 2.0, height: 0.26, centerY: 2.4, alongOffset: 0.5 });
}

function furnishPipeGallery(random, roomName) {
  // Four pipes stacked along the north wall. They hug the wall, so they are in nobody's way.
  addPipeAlongX(0, 14, 0.35, 0.2, 0.16);
  addPipeAlongX(0, 14, 0.85, 0.16, 0.11);
  addPipeAlongX(0, 14, 1.35, 0.14, 0.08);
  addPipeAlongX(0, 14, 2.25, 0.3, 0.14);
  for (const valveX of [2.5, 6.5, 11.5]) {
    addCylinderProp(AXIS_Z, valveX, 0.85, 0.33, 0.16, 0.03, { surfaceClass: SURFACE_METAL, blocksMovement: false }); // valve wheel
    addCylinderProp(AXIS_X, valveX + 1.2, 0.35, 0.2, 0.21, 0.05, { surfaceClass: SURFACE_METAL, blocksMovement: false }); // flange
  }
  addBoxProp(4.4, 0.05, 2.3, 0.3, 0.04, 0.2, { yaw: 0.6, blocksMovement: false });
  setTileFlagInRectangle(9, 1, 12, 3, TILE_FLAG_WATER); // a leak
  addCeilingLamp(3.5, 1.5, 2.6, true);
  addCeilingLamp(10.5, 1.5, 2.6, true);
  addWallSign(roomName || 'PIPE GALLERY', 3, 2, WALL_SOUTH, { width: 2.4, height: 0.26, centerY: 1.8 });
}

function furnishCoreStore(random, roomName) {
  addShelfRackAlongZ(2.4, 0.5, 3.3, 2.3, random, 0.75);
  addShelfRackAlongZ(5.6, 0.5, 3.3, 2.3, random, 0.75);
  addShelfRackAlongZ(2.4, 5.0, 7.5, 2.3, random, 0.6);
  for (let tray = 0; tray < 3; tray++) {
    // core trays on the floor: a shallow box with a length of drilled rock lying in it
    const trayZ = 4.7 + tray * 0.55;
    addBoxBetween(5.2, 0, trayZ, 7.4, 0.14, trayZ + 0.4, CLUTTER);
    addCylinderProp(AXIS_X, 6.3, 0.2, trayZ + 0.2, 0.06, 0.6 + random() * 0.4, CLUTTER);
  }
  addTable(6.6, 7.2, 0, 1.3, 0.7, 0.76);
  addCeilingLamp(4, 4, 3.2, false);
  addWallSign(roomName || 'CORE STORE', 4, 0, WALL_NORTH, { width: 1.8, height: 0.3, centerY: 2.6 });
}

function furnishBatteryRoom(random, roomName) {
  // Two banks of cells with aisles between: each bank is a plinth with a row of cells standing on it.
  const banks = [[0.0, 5.4, 1.2], [1.6, 7.0, 3.2]];
  for (const bank of banks) {
    addBoxBetween(bank[0], 0, bank[2], bank[1], 0.45, bank[2] + 0.6, { surfaceClass: SURFACE_METAL });
    for (let cellX = bank[0] + 0.08; cellX < bank[1] - 0.4; cellX += 0.45) {
      addBoxBetween(cellX, 0.45, bank[2] + 0.06, cellX + 0.38, 0.8, bank[2] + 0.54, CLUTTER);
      addCylinderProp(AXIS_Y, cellX + 0.19, 0.83, bank[2] + 0.2, 0.025, 0.03, CLUTTER);
    }
    addBoxBetween(bank[0] + 0.1, 0.88, bank[2] + 0.36, bank[1] - 0.1, 0.9, bank[2] + 0.42, { surfaceClass: SURFACE_METAL, blocksMovement: false }); // bus bar
  }
  addBoxBetween(2.0, 0, 5.4, 5.0, 0.9, 6.0);
  addBoxProp(4.4, 1.0, 5.7, 0.1, 0.1, 0.08, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  addCeilingLamp(3.5, 2.5, 2.8, true);
  addWallSign(roomName || 'BATTERY ROOM', 0, 4, WALL_WEST, { width: 1.8, height: 0.26, centerY: 2.3 });
  addWallSign('NO NAKED FLAME', 0, 4, WALL_WEST, { width: 1.8, height: 0.2, centerY: 1.95 });
}

// A waterproof suit on a hook. Scanned in the dark it is the height and shape of a person. It can be walked through.
function addHangingSuit(x, z, yaw) {
  const frame = createLocalFrame(x, z, yaw);
  addBoxInFrame(frame, 0, 1.52, 0, 0.21, 0.3, 0.07, CLUTTER);
  addBoxInFrame(frame, -0.27, 1.5, 0, 0.055, 0.3, 0.055, CLUTTER);
  addBoxInFrame(frame, 0.27, 1.5, 0, 0.055, 0.3, 0.055, CLUTTER);
  addBoxInFrame(frame, -0.1, 0.84, 0, 0.085, 0.38, 0.06, CLUTTER);
  addBoxInFrame(frame, 0.1, 0.84, 0, 0.085, 0.38, 0.06, CLUTTER);
  addSphereInFrame(frame, 0, 1.95, 0, 0.12, CLUTTER);
  addVerticalCylinderInFrame(frame, 0, 2.13, 0, 0.012, 0.07, CLUTTER);
}

function furnishDryingRoom(random, roomName) {
  for (const railZ of [2.2, 4.4]) {
    addPipeAlongX(0.8, 6.2, 2.2, railZ, 0.025);
    const emptyHook = Math.floor(random() * 5);
    for (let hook = 0; hook < 5; hook++) {
      if (hook !== emptyHook) addHangingSuit(1.3 + hook * 1.05, railZ, (random() - 0.5) * 0.7);
    }
  }
  addBoxBetween(1.5, 0, 0.0, 6.5, 0.45, 0.4);
  for (let pair = 0; pair < 4; pair++) {
    addBoxProp(2.0 + pair * 1.2, 0.14, 0.62, 0.06, 0.14, 0.13, { yaw: (random() - 0.5) * 0.5, blocksMovement: false });
    addBoxProp(2.22 + pair * 1.2, 0.14, 0.62, 0.06, 0.14, 0.13, { yaw: (random() - 0.5) * 0.5, blocksMovement: false });
  }
  addBoxBetween(6.6, 0, 5.0, 7.0, 0.9, 6.6, { surfaceClass: SURFACE_METAL }); // heater
  addBoxProp(4.6, 0.04, 5.7, 0.5, 0.04, 0.25, { yaw: 0.7, blocksMovement: false }); // one that fell off its hook
  addCylinderProp(AXIS_Y, 3.5, 0.01, 3.3, 0.2, 0.01, CLUTTER);
  addWallSign(roomName || 'DRYING ROOM', 6, 3, WALL_EAST, { width: 1.8, height: 0.26, centerY: 2.45 });
}

function furnishOldWorkings(random, roomName) {
  // The roof came down in the north-east corner.
  addBoxProp(8.3, 0.55, 1.3, 1.3, 0.55, 1.0, { yaw: 0.4 });
  addBoxProp(6.6, 0.3, 0.9, 0.7, 0.3, 0.6, { yaw: -0.3 });
  addBoxProp(9.0, 0.95, 2.6, 0.8, 0.95, 0.7, { yaw: 0.9 });
  addBoxProp(7.4, 0.2, 2.6, 0.5, 0.2, 0.4, { yaw: 1.2, blocksMovement: false });
  addBoxProp(5.6, 0.12, 1.6, 0.3, 0.12, 0.25, { yaw: 0.5, blocksMovement: false });
  addVerticalPipe(5.2, 0.7, 0, 2.6, 0.07, true); // props holding up what is left
  addVerticalPipe(5.4, 3.4, 0, 2.6, 0.07, true);
  addVerticalPipe(8.6, 4.2, 0, 2.6, 0.07, true);
  addBoxProp(6.9, 1.05, 3.5, 1.9, 0.1, 0.1, { yaw: 0.35, surfaceClass: SURFACE_METAL, blocksMovement: false }); // a fallen roof beam
  addBoxBetween(0.0, 0, 0.3, 0.5, 1.0, 2.5);
  addBarrel(1.2, 6.3);
  setTileFlagInRectangle(6, 3, 10, 5, TILE_FLAG_HAZARD);
  addWallSign('NO FURTHER', 2, 0, WALL_NORTH, { width: 2.6, height: 0.5, centerY: 1.4, alongOffset: 0.5, isScrawled: true });
}

// Stairs down to the lower level: a landing, some steps, a landing. The top is at the north end.
// Every station gets its own flight, picked from its seed (so a seed still always builds the same station).
// TWEAK: a step is one tile deep, so more or taller steps make a longer or steeper stair.
// A step taller than MAXIMUM_STEP_HEIGHT (02-world.js) cannot be climbed.
const STAIR_STEP_COUNT_RANGE = [5, 15];       // whole steps, both ends included
const STAIR_STEP_HEIGHT_RANGE = [0.30, 0.45]; // metres
let stairStepCount = 10, stairStepHeight = 0.3;
let stairDrop = stairStepCount * stairStepHeight; // how far below the upper level the lower level is

// Picks the station's stair and resizes the stairwell in the room catalogue to match. The step count must be
// a whole number: the stairwell is that many tiles long, and its bottom doorway sits on the tile after the last one.
function chooseStairShape(seed) {
  const random = createSeededRandomGenerator((seed * 40503 + 977) >>> 0);
  const countRange = STAIR_STEP_COUNT_RANGE, heightRange = STAIR_STEP_HEIGHT_RANGE;
  stairStepCount = countRange[0] + Math.floor(random() * (countRange[1] - countRange[0] + 1));
  // Kept a centimetre under the limit: floor heights are stored as 32-bit floats, and a step of exactly the limit can round to just over it.
  stairStepHeight = Math.min(heightRange[0] + random() * (heightRange[1] - heightRange[0]), MAXIMUM_STEP_HEIGHT - 0.01);
  stairDrop = stairStepCount * stairStepHeight;
  const stairwell = ROOM_CATALOGUE.stairwell;
  stairwell.rect = [0, 0, 2, stairStepCount + 2];
  stairwell.sockets = [[0, -1, WALL_NORTH], [1, stairStepCount + 2, WALL_SOUTH]];
  stairwell.socketDrops = [0, -stairDrop];
}

function carveStairwell() {
  carveRoom(0, 0, 2, stairStepCount + 2, 2.6, ZONE_GENERATED_ROOM);
  for (let step = 1; step <= stairStepCount + 1; step++) {
    setFloorHeightInRectangle(0, step, 2, step + 1, -stairStepHeight * Math.min(step, stairStepCount));
  }
}

function furnishStairwell(random, roomName) {
  for (let step = 0; step <= stairStepCount + 1; step++) {
    const floor = -stairStepHeight * Math.min(step, stairStepCount);
    // a handrail down each wall, and a metal edge on every step so the scanner picks the steps out
    addBoxBetween(0.03, floor + 0.92, step, 0.08, floor + 0.97, step + 1, { surfaceClass: SURFACE_METAL, blocksMovement: false });
    addBoxBetween(1.92, floor + 0.92, step, 1.97, floor + 0.97, step + 1, { surfaceClass: SURFACE_METAL, blocksMovement: false });
    if (step >= 1 && step <= stairStepCount) addBoxBetween(0, floor + stairStepHeight - 0.03, step - 0.04, 2, floor + stairStepHeight, step + 0.02, { surfaceClass: SURFACE_METAL, blocksMovement: false });
  }
  addCeilingLamp(1, 0.5, 2.6, false);
  addWallSign('LOWER LEVEL \u2193', 1, 0, WALL_EAST, { width: 0.96, height: 0.2, centerY: 1.8 });
  addWallSign('UPPER LEVEL \u2191', 0, stairStepCount + 1, WALL_WEST, { width: 0.96, height: 0.2, centerY: 1.8 });
  if (random() < 0.5) addBoxProp(0.5, -stairDrop + 0.05, stairStepCount + 1.5, 0.2, 0.05, 0.14, { yaw: random() * 3, blocksMovement: false });
}

// ---------------------------------------------------------------------------
// The room catalogue
//   rect     the room's rectangle [startX, startZ, endX, endZ], in the coordinates its carve function uses
//   sockets  where a door may go: [tileX, tileZ, wall]. The tile is the one just outside the room, and
//            `wall` is the side of the room it is on. The floor just inside each socket must be kept clear.
//   tiers    which lock tiers the room may be placed in: 0 open, 1 behind mains power, 2 behind the keycard
//   prefers  a room this one likes to be attached to; with mustAdjoin it is always attached straight to it
//            (the radio says "Generator 2 is off Pump Hall B", so that has to be true)
//   socketDrops  only for stairs: how far below the room's own floor each socket's doorway is
//   itemSpot a table top where the first spool or the keycard may be left instead of its usual room
// ---------------------------------------------------------------------------

function carveSimpleRoom(width, depth, ceilingHeight) {
  return function () { carveRoom(0, 0, width, depth, ceilingHeight, ZONE_GENERATED_ROOM); };
}

const ROOM_CATALOGUE = {
  liftLobby: { name: 'LIFT LOBBY', rect: [5, 49, 18, 58], ceiling: 3.4, tiers: [0], carve: carveLiftLobby, furnish: furnishLiftLobby,
    sockets: [[13, 48, WALL_NORTH], [18, 53, WALL_EAST], [17, 58, WALL_SOUTH]] },
  securityOffice: { name: 'SECURITY OFFICE', rect: [10, 43, 16, 48], ceiling: 2.8, tiers: [0], carve: carveSecurityOffice, furnish: furnishSecurityOffice,
    sockets: [[13, 48, WALL_SOUTH], [12, 42, WALL_NORTH]] },
  lockerRoom: { name: 'LOCKER ROOM', rect: [22, 55, 29, 61], ceiling: 2.8, tiers: [0], carve: carveLockerRoom, furnish: furnishLockerRoom,
    sockets: [[25, 54, WALL_NORTH]] },
  messRoom: { name: 'MESS ROOM', rect: [22, 45, 30, 51], ceiling: 2.8, tiers: [0], carve: carveMessRoom, furnish: furnishMessRoom,
    sockets: [[26, 51, WALL_SOUTH], [30, 48, WALL_EAST]] },
  storeCloset: { name: 'STORE CLOSET', rect: [33, 55, 37, 59], ceiling: 2.6, tiers: [0, 1], carve: carveStoreCloset, furnish: furnishStoreCloset,
    sockets: [[35, 54, WALL_NORTH]] },
  pumpHall: { name: 'PUMP HALL B', rect: [47, 38, 66, 58], ceiling: 7.0, tiers: [0], carve: carvePumpHall, furnish: furnishPumpHall,
    sockets: [[46, 52, WALL_WEST], [66, 47, WALL_EAST], [54, 37, WALL_NORTH], [52, 58, WALL_SOUTH]] },
  generatorRoom: { name: 'GENERATOR ROOM', rect: [67, 44, 74, 51], ceiling: 3.5, tiers: [0], carve: carveGeneratorRoom, furnish: furnishGeneratorRoom,
    sockets: [[66, 47, WALL_WEST]], prefers: 'pumpHall', mustAdjoin: true },
  controlRoom: { name: 'CONTROL ROOM', rect: [50, 32, 58, 37], ceiling: 2.8, tiers: [0], carve: carveControlRoom, furnish: furnishControlRoom,
    sockets: [[56, 31, WALL_NORTH], [54, 37, WALL_SOUTH]] },
  laboratory: { name: 'LABORATORY', rect: [9, 26, 19, 35], ceiling: 3.0, tiers: [1], carve: carveLaboratory, furnish: furnishLaboratory,
    sockets: [[12, 35, WALL_SOUTH], [19, 30, WALL_EAST], [13, 25, WALL_NORTH]] },
  coldRoom: { name: 'COLD ROOM', rect: [10, 18, 16, 25], ceiling: 2.6, tiers: [1], carve: carveColdRoom, furnish: furnishColdRoom,
    sockets: [[13, 25, WALL_SOUTH]], prefers: 'laboratory' },
  archive: { name: 'ARCHIVE', rect: [20, 24, 42, 37], ceiling: 3.2, tiers: [1], carve: carveArchive, furnish: furnishArchive,
    sockets: [[19, 30, WALL_WEST], [31, 37, WALL_SOUTH], [32, 23, WALL_NORTH], [42, 30, WALL_EAST]] },
  calibrationStore: { name: 'CALIBRATION STORE C4', rect: [24, 10, 40, 23], ceiling: 4.0, tiers: [1], carve: carveCalibrationStore, furnish: furnishCalibrationStore,
    sockets: [[32, 23, WALL_SOUTH]], prefers: 'archive' },
  shaftChamber: { name: 'SHAFT 9', rect: [49, 2, 69, 15], ceiling: 9.0, tiers: [2], carve: carveShaftChamber, furnish: furnishShaftChamber,
    sockets: [[59, 15, WALL_SOUTH]] },
  stairwell: { name: 'STAIRS', rect: [0, 0, 2, stairStepCount + 2], ceiling: 2.6, tiers: [2], carve: carveStairwell, furnish: furnishStairwell,
    sockets: [[0, -1, WALL_NORTH], [1, stairStepCount + 2, WALL_SOUTH]], socketDrops: [0, -stairDrop] },
  // ---- extra rooms ----
  boilerRoom: { name: 'BOILER HOUSE', rect: [0, 0, 8, 7], ceiling: 3.4, tiers: [0, 1], carve: carveSimpleRoom(8, 7, 3.4), furnish: furnishBoilerRoom,
    sockets: [[4, 7, WALL_SOUTH], [-1, 3, WALL_WEST]], itemSpot: [6.8, 0.77, 5.6], isFiller: true },
  workshop: { name: 'WORKSHOP', rect: [0, 0, 9, 6], ceiling: 3.0, tiers: [0, 1], carve: carveSimpleRoom(9, 6, 3.0), furnish: furnishWorkshop,
    sockets: [[-1, 2, WALL_WEST], [9, 3, WALL_EAST]], itemSpot: [3.5, 0.92, 0.35], isFiller: true },
  bunkRoom: { name: 'CREW QUARTERS', rect: [0, 0, 7, 6], ceiling: 2.8, tiers: [0], carve: carveSimpleRoom(7, 6, 2.8), furnish: furnishBunkRoom,
    sockets: [[3, 6, WALL_SOUTH], [7, 2, WALL_EAST]], itemSpot: [4.3, 0.78, 3.5], isFiller: true },
  washroom: { name: 'WASHROOM', rect: [0, 0, 6, 5], ceiling: 2.7, tiers: [0, 1], carve: carveSimpleRoom(6, 5, 2.7), furnish: furnishWashroom,
    sockets: [[2, 5, WALL_SOUTH]], isFiller: true },
  electricalRoom: { name: 'SWITCH ROOM', rect: [0, 0, 6, 6], ceiling: 3.0, tiers: [0, 1, 2], carve: carveSimpleRoom(6, 6, 3.0), furnish: furnishElectricalRoom,
    sockets: [[3, -1, WALL_NORTH], [6, 3, WALL_EAST]], itemSpot: [5.1, 0.92, 0.5], isFiller: true },
  storageHall: { name: 'STORES', rect: [0, 0, 12, 9], ceiling: 4.0, tiers: [0, 1, 2], carve: carveSimpleRoom(12, 9, 4.0), furnish: furnishStorageHall,
    sockets: [[-1, 4, WALL_WEST], [12, 4, WALL_EAST], [6, 9, WALL_SOUTH]], itemSpot: [7.7, 0.76, 7.6], isFiller: true },
  floodedRoom: { name: 'SUMP 3', rect: [0, 0, 10, 6], ceiling: 2.6, tiers: [2, 1], isFlooded: true, carve: carveSimpleRoom(10, 6, 2.6), furnish: furnishFloodedRoom,
    sockets: [[-1, 3, WALL_WEST], [10, 2, WALL_EAST]], isFiller: true },
  serverRoom: { name: 'TELEMETRY', rect: [0, 0, 8, 8], ceiling: 3.0, tiers: [1, 0], carve: carveSimpleRoom(8, 8, 3.0), furnish: furnishServerRoom,
    sockets: [[4, 8, WALL_SOUTH], [-1, 2, WALL_WEST]], itemSpot: [4.0, 0.92, 0.35], isFiller: true },
  infirmary: { name: 'INFIRMARY', rect: [0, 0, 9, 7], ceiling: 2.8, tiers: [0, 1], carve: carveSimpleRoom(9, 7, 2.8), furnish: furnishInfirmary,
    sockets: [[4, 7, WALL_SOUTH], [-1, 3, WALL_WEST]], itemSpot: [1.3, 0.77, 5.9], isFiller: true },
  pipeGallery: { name: 'PIPE GALLERY', rect: [0, 0, 14, 3], ceiling: 2.6, tiers: [0, 1, 2], carve: carveSimpleRoom(14, 3, 2.6), furnish: furnishPipeGallery,
    sockets: [[-1, 1, WALL_WEST], [14, 1, WALL_EAST], [7, 3, WALL_SOUTH]], isFiller: true },
  coreStore: { name: 'CORE STORE', rect: [0, 0, 8, 8], ceiling: 3.2, tiers: [1, 2], carve: carveSimpleRoom(8, 8, 3.2), furnish: furnishCoreStore,
    sockets: [[-1, 4, WALL_WEST], [4, 8, WALL_SOUTH]], itemSpot: [6.6, 0.77, 7.2], isFiller: true },
  batteryRoom: { name: 'BATTERY ROOM', rect: [0, 0, 7, 6], ceiling: 2.8, tiers: [0, 1], carve: carveSimpleRoom(7, 6, 2.8), furnish: furnishBatteryRoom,
    sockets: [[3, -1, WALL_NORTH], [7, 2, WALL_EAST]], itemSpot: [3.2, 0.92, 5.7], isFiller: true },
  dryingRoom: { name: 'DRYING ROOM', rect: [0, 0, 7, 7], ceiling: 2.8, tiers: [0], carve: carveSimpleRoom(7, 7, 2.8), furnish: furnishDryingRoom,
    sockets: [[3, 7, WALL_SOUTH], [-1, 2, WALL_WEST]], isFiller: true },
  oldWorkings: { name: 'OLD WORKINGS', rect: [0, 0, 10, 7], ceiling: 2.6, tiers: [2, 1], carve: carveSimpleRoom(10, 7, 2.6), furnish: furnishOldWorkings,
    sockets: [[-1, 4, WALL_WEST], [3, 7, WALL_SOUTH]], isFiller: true }
};

// ---------------------------------------------------------------------------
// Step 1: the plan
// ---------------------------------------------------------------------------

function createLevelPlan() {
  return { rooms: [], sockets: [], doors: [], spine: null };
}

function doRectanglesClash(first, second) {
  // Two rooms must have at least one tile of rock between them.
  return first.startX < second.endX + 1 && first.endX + 1 > second.startX &&
    first.startZ < second.endZ + 1 && first.endZ + 1 > second.startZ;
}

function isPlanRectangleFree(plan, rectangle) {
  if (rectangle.startX < 3 || rectangle.startZ < 3 || rectangle.endX > GRID_WIDTH - 3 || rectangle.endZ > GRID_DEPTH - 3) return false;
  for (const room of plan.rooms) {
    if (doRectanglesClash(rectangle, room)) return false;
  }
  return true;
}

// Tiers: 0 is open from the start, 1 needs mains power, 2 needs keycard 1, 3 needs keycard 2, 4 needs keycard 3.
function doorKindForTier(tier) {
  return tier >= 2 ? DOOR_KIND_KEYCARD : (tier === 1 ? DOOR_KIND_POWERED : DOOR_KIND_AUTOMATIC);
}
function cardLevelForTier(tier) {
  return tier >= 2 ? tier - 1 : 0;
}

// Tries to put a catalogue room against a socket, wall to wall, sharing the socket's door. Returns the room or null.
// `onlyOwnSocketIndex` (optional) says which of the room's own doorways must be the one used: stairs use it
// to choose between being entered at the top (0) and at the bottom (1).
function tryPlanRoomAtSocket(plan, roomKey, socket, tier, onlyOwnSocketIndex) {
  const definition = ROOM_CATALOGUE[roomKey];
  const facing = (socket.wall + 2) % 4; // the new room's socket must face back toward the socket's owner
  // Shuffled by giving each doorway a random number and sorting on that. Never put the random number inside the
  // comparison itself: a sort may ask the same question any number of times, and browsers ask a different number
  // once the code has warmed up, so the same seed would stop giving the same station.
  let candidates = definition.sockets.map(function (ownSocket) { return [plan.random(), ownSocket]; })
    .sort(function (first, second) { return first[0] - second[0]; }).map(function (pair) { return pair[1]; });
  if (onlyOwnSocketIndex !== undefined) candidates = [definition.sockets[onlyOwnSocketIndex]];
  const drops = definition.socketDrops;
  for (const ownSocket of candidates) {
    // The room's floor is level with the doorway it is entered by, unless that doorway is the foot of a stair.
    const floorY = socket.floorY - (drops ? drops[definition.sockets.indexOf(ownSocket)] : 0);
    const turns = (facing - ownSocket[2] + 4) % 4;
    setPlacement(turns, ownSocket[0] + 0.5, ownSocket[1] + 0.5, socket.tileX + 0.5, socket.tileZ + 0.5);
    const cornerA = placePoint(definition.rect[0], definition.rect[1]), cornerB = placePoint(definition.rect[2], definition.rect[3]);
    const room = {
      key: roomKey, name: definition.name, tier: tier, isCorridor: false,
      startX: Math.round(Math.min(cornerA[0], cornerB[0])), startZ: Math.round(Math.min(cornerA[1], cornerB[1])),
      endX: Math.round(Math.max(cornerA[0], cornerB[0])), endZ: Math.round(Math.max(cornerA[1], cornerB[1])),
      turns: turns, offsetX: placement.offsetX, offsetZ: placement.offsetZ, floorY: floorY, ceiling: definition.ceiling, zone: 0
    };
    if (!isPlanRectangleFree(plan, room)) continue;
    // Accept: record the room, the door, and the room's other sockets.
    plan.rooms.push(room);
    for (let socketIndex = 0; socketIndex < definition.sockets.length; socketIndex++) {
      const otherSocket = definition.sockets[socketIndex];
      const tile = placeTile(otherSocket[0], otherSocket[1]);
      plan.sockets.push({ tileX: tile[0], tileZ: tile[1], wall: placeWall(otherSocket[2]), owner: room, isUsed: otherSocket === ownSocket,
        floorY: floorY + (drops ? drops[socketIndex] : 0) });
    }
    socket.isUsed = true;
    plan.doors.push({ tileX: socket.tileX, tileZ: socket.tileZ, kind: doorKindForTier(tier > socket.owner.tier ? tier : 0),
      cardLevel: cardLevelForTier(tier > socket.owner.tier ? tier : 0), roomA: socket.owner, roomB: room });
    clearPlacement();
    return room;
  }
  clearPlacement();
  return null;
}

// Tries to run a two-tile-wide corridor outward from a socket. Returns the corridor (a kind of room) or null.
function tryPlanCorridorAtSocket(plan, socket, length, tier) {
  const direction = WALL_DIRECTIONS[socket.wall];
  const sideways = [-direction[1], direction[0]];
  const side = plan.random() < 0.5 ? 0 : -1; // which side of the door the second lane goes
  const firstX = socket.tileX + direction[0], firstZ = socket.tileZ + direction[1];
  const lastX = firstX + direction[0] * (length - 1), lastZ = firstZ + direction[1] * (length - 1);
  const laneAX = firstX + sideways[0] * side, laneAZ = firstZ + sideways[1] * side;
  const laneBX = lastX + sideways[0] * (side + 1), laneBZ = lastZ + sideways[1] * (side + 1);
  const corridor = {
    key: 'corridor', name: 'CORRIDOR', tier: tier, isCorridor: true, runsAlongX: direction[0] !== 0,
    startX: Math.min(laneAX, laneBX), startZ: Math.min(laneAZ, laneBZ),
    endX: Math.max(laneAX, laneBX) + 1, endZ: Math.max(laneAZ, laneBZ) + 1,
    floorY: socket.floorY, ceiling: tier >= 2 ? 2.5 : 2.8, zone: 0, isFlooded: tier >= 2 && plan.random() < 0.45
  };
  if (!isPlanRectangleFree(plan, corridor)) return null;
  plan.rooms.push(corridor);
  socket.isUsed = true;
  plan.doors.push({ tileX: socket.tileX, tileZ: socket.tileZ, kind: doorKindForTier(tier > socket.owner.tier ? tier : 0),
    cardLevel: cardLevelForTier(tier > socket.owner.tier ? tier : 0), roomA: socket.owner, roomB: corridor });
  // Sockets: one at the far end, and one on each side every three tiles.
  const endLane = plan.random() < 0.5 ? 0 : 1;
  plan.sockets.push({
    tileX: lastX + direction[0] + sideways[0] * (side + endLane), tileZ: lastZ + direction[1] + sideways[1] * (side + endLane),
    wall: socket.wall, owner: corridor, isUsed: false, isCorridorEnd: true, floorY: socket.floorY
  });
  for (let along = 1; along < length - 1; along += 3) {
    const baseX = firstX + direction[0] * along, baseZ = firstZ + direction[1] * along;
    plan.sockets.push({ tileX: baseX + sideways[0] * (side - 1), tileZ: baseZ + sideways[1] * (side - 1), wall: (socket.wall + 3) % 4, owner: corridor, isUsed: false, floorY: socket.floorY });
    plan.sockets.push({ tileX: baseX + sideways[0] * (side + 2), tileZ: baseZ + sideways[1] * (side + 2), wall: (socket.wall + 1) % 4, owner: corridor, isUsed: false, floorY: socket.floorY });
  }
  return corridor;
}

// Attaches one room somewhere sensible. Returns the room, or null if it fits nowhere.
// `floorY` is the level the room's entrance must be on. `onlyOwnSocketIndex` is passed on to tryPlanRoomAtSocket.
function planRoom(plan, roomKey, tier, floorY, onlyOwnSocketIndex) {
  const definition = ROOM_CATALOGUE[roomKey];
  const weighted = [];
  for (const socket of plan.sockets) {
    if (socket.isUsed || socket.owner.tier > tier) continue;
    if (socket.owner.key === 'calibrationStore') continue;
    if (socket.floorY !== floorY) continue;
    if (definition.mustAdjoin && socket.owner.key !== definition.prefers) continue;
    let weight = socket.owner.isCorridor ? 2.5 : 1;
    if (socket.owner.tier === tier) weight *= 1.6;
    // Rooms like to be near the lift; what is behind the keycard likes to be far from it.
    const distanceFromLift = Math.abs(socket.tileX - plan.centerX) + Math.abs(socket.tileZ - plan.centerZ);
    if (tier >= 2) weight *= 1 + distanceFromLift / 8;
    else weight *= Math.exp(-distanceFromLift / plan.layout.spread);
    if (definition.prefers && socket.owner.key === definition.prefers) weight = 1000;
    weighted.push({ socket: socket, order: Math.pow(plan.random(), 1 / weight) });
  }
  weighted.sort(function (first, second) { return second.order - first.order; });
  for (let attempt = 0; attempt < Math.min(weighted.length, 60); attempt++) {
    const socket = weighted[attempt].socket;
    const wantsCorridorFirst = !(definition.prefers && socket.owner.key === definition.prefers) &&
      plan.random() < (socket.owner.isCorridor ? plan.layout.corridorChance / 3 : plan.layout.corridorChance);
    if (!wantsCorridorFirst) {
      const room = tryPlanRoomAtSocket(plan, roomKey, socket, tier, onlyOwnSocketIndex);
      if (room) return room;
      continue;
    }
    // A corridor first, then the room on one of the corridor's own sockets. Undo the corridor if the room will not fit.
    const savedRooms = plan.rooms.length, savedSockets = plan.sockets.length, savedDoors = plan.doors.length;
    const corridorLength = plan.layout.corridorLength[0] + Math.floor(plan.random() * (plan.layout.corridorLength[1] - plan.layout.corridorLength[0] + 1));
    const corridor = tryPlanCorridorAtSocket(plan, socket, corridorLength, tier);
    if (!corridor) continue;
    // The corridor's far end is usually tried before its sides. (Each doorway's random number is drawn once,
    // before sorting: see the note in tryPlanRoomAtSocket.)
    const corridorSockets = plan.sockets.slice(savedSockets)
      .map(function (corridorSocket) { return [(corridorSocket.isCorridorEnd ? 1 : 0) + plan.random() * 1.5, corridorSocket]; })
      .sort(function (first, second) { return second[0] - first[0]; }).map(function (pair) { return pair[1]; });
    let placed = null;
    for (const corridorSocket of corridorSockets) {
      placed = tryPlanRoomAtSocket(plan, roomKey, corridorSocket, tier, onlyOwnSocketIndex);
      if (placed) break;
    }
    if (placed) return placed;
    plan.rooms.length = savedRooms; plan.sockets.length = savedSockets; plan.doors.length = savedDoors;
    socket.isUsed = false;
  }
  return null;
}

// Finds a way for a one-tile-wide service duct through solid rock, from one tile to another.
// `blocked` marks tiles the duct may not use. Bends cost extra, so ducts come out mostly straight.
// Returns the tiles of the route in order, or null when there is none short enough.
function routeDuctThroughRock(blocked, startX, startZ, startDirection, goalX, goalZ, maximumCost) {
  const BEND_COST = 3; // TWEAK: higher = straighter ducts, but fewer places a duct can be fitted
  const startIndex = tileIndexAt(startX, startZ), goalIndex = tileIndexAt(goalX, goalZ);
  if (blocked[startIndex] || blocked[goalIndex]) return null;
  const bestCost = new Int16Array(TILE_COUNT * 4).fill(32000);
  const cameFrom = new Int32Array(TILE_COUNT * 4).fill(-1);
  const buckets = [];
  for (let cost = 0; cost <= maximumCost; cost++) buckets.push([]);
  const startState = startIndex * 4 + startDirection;
  bestCost[startState] = 0;
  buckets[0].push(startState);
  for (let cost = 0; cost <= maximumCost; cost++) {
    const bucket = buckets[cost];
    for (let entry = 0; entry < bucket.length; entry++) {
      const state = bucket[entry];
      if (bestCost[state] !== cost) continue;
      const index = state >> 2, direction = state & 3;
      if (index === goalIndex) {
        const route = [];
        for (let walk = state; walk >= 0; walk = cameFrom[walk]) route.push(walk >> 2);
        return route.reverse();
      }
      const tileX = index % GRID_WIDTH, tileZ = (index - tileX) / GRID_WIDTH;
      for (let nextDirection = 0; nextDirection < 4; nextDirection++) {
        if (nextDirection === (direction + 2) % 4) continue; // never straight back
        const nextX = tileX + WALL_DIRECTIONS[nextDirection][0], nextZ = tileZ + WALL_DIRECTIONS[nextDirection][1];
        if (nextX < 3 || nextZ < 3 || nextX >= GRID_WIDTH - 3 || nextZ >= GRID_DEPTH - 3) continue;
        const nextIndex = tileIndexAt(nextX, nextZ);
        if (blocked[nextIndex]) continue;
        const nextCost = cost + 1 + (nextDirection === direction ? 0 : BEND_COST);
        const nextState = nextIndex * 4 + nextDirection;
        if (nextCost > maximumCost || nextCost >= bestCost[nextState]) continue;
        bestCost[nextState] = nextCost;
        cameFrom[nextState] = state;
        buckets[nextCost].push(nextState);
      }
    }
  }
  return null;
}

// How many doors apart every room is from one room, going through the rooms and corridors planned so far.
function countDoorsBetweenRooms(plan, fromRoom) {
  const doorsAway = new Map();
  doorsAway.set(fromRoom, 0);
  const queue = [fromRoom];
  for (let head = 0; head < queue.length; head++) {
    const room = queue[head];
    for (const door of plan.doors) {
      const other = door.roomA === room ? door.roomB : (door.roomB === room ? door.roomA : null);
      if (!other || doorsAway.has(other)) continue;
      doorsAway.set(other, doorsAway.get(room) + 1);
      queue.push(other);
    }
  }
  return doorsAway;
}

// Extra connections, so there is more than one way round (and more than one way to be cut off).
// Two unused doorways that are close as the crow flies but far apart on foot are joined by a
// one-tile-wide service duct dug through the rock between them.
const MAXIMUM_DUCT_COST = 34; // TWEAK: longest service duct, in tiles (each bend counts as three)

// Marks a rectangle of the map, and one tile all round it, as somewhere a duct may not go.
function blockDuctRectangle(blocked, startX, startZ, endX, endZ) {
  for (let tileZ = Math.max(0, startZ - 1); tileZ < Math.min(GRID_DEPTH, endZ + 1); tileZ++) {
    for (let tileX = Math.max(0, startX - 1); tileX < Math.min(GRID_WIDTH, endX + 1); tileX++) blocked[tileIndexAt(tileX, tileZ)] = 1;
  }
}

function createDuctBlockGrid(plan) {
  const blocked = new Uint8Array(TILE_COUNT);
  for (const room of plan.rooms) blockDuctRectangle(blocked, room.startX, room.startZ, room.endX, room.endZ);
  return blocked;
}

// Digs a service duct between two free doorways on the same level, if a way through the rock exists.
// The door at the end that needs more (power, or the keycard) gets the lock. Returns true if the duct was made.
// With `isVent` it is a vent instead: crawl height, and open at both ends. A vent has nowhere to put a lock,
// so it is only ever dug between two places behind the same locks.
function tryPlanDuct(plan, blocked, first, second, isVent) {
  if (first.floorY !== second.floorY) return false;
  if (isVent && first.owner.tier !== second.owner.tier) return false;
  const firstStep = WALL_DIRECTIONS[first.wall], secondStep = WALL_DIRECTIONS[second.wall];
  const route = routeDuctThroughRock(blocked, first.tileX + firstStep[0], first.tileZ + firstStep[1], first.wall,
    second.tileX + secondStep[0], second.tileZ + secondStep[1], MAXIMUM_DUCT_COST);
  if (!route) return false;
  const lowerTier = Math.min(first.owner.tier, second.owner.tier), higherTier = Math.max(first.owner.tier, second.owner.tier);
  let startX = GRID_WIDTH, startZ = GRID_DEPTH, endX = 0, endZ = 0;
  for (const index of route) {
    const tileX = index % GRID_WIDTH, tileZ = (index - tileX) / GRID_WIDTH;
    startX = Math.min(startX, tileX); endX = Math.max(endX, tileX + 1);
    startZ = Math.min(startZ, tileZ); endZ = Math.max(endZ, tileZ + 1);
    blockDuctRectangle(blocked, tileX, tileZ, tileX + 1, tileZ + 1);
  }
  const duct = {
    key: 'duct', name: 'SERVICE DUCT', tier: lowerTier, isCorridor: true, isDuct: true, route: route,
    startX: startX, startZ: startZ, endX: endX, endZ: endZ, floorY: first.floorY, ceiling: 2.4, zone: 0
  };
  plan.rooms.push(duct);
  if (isVent) {
    // The two doorway tiles become the vent's mouths: part of the tunnel, with no door in them.
    duct.key = 'vent'; duct.name = 'VENT'; duct.isVent = true; duct.ceiling = VENT_HEIGHT;
    duct.route = [tileIndexAt(first.tileX, first.tileZ)].concat(route, [tileIndexAt(second.tileX, second.tileZ)]);
    duct.mouths = [{ tileX: first.tileX, tileZ: first.tileZ, wall: first.wall }, { tileX: second.tileX, tileZ: second.tileZ, wall: second.wall }];
    first.isUsed = true; second.isUsed = true;
    return true;
  }
  const lockedKind = doorKindForTier(higherTier), lockedCardLevel = cardLevelForTier(higherTier);
  plan.doors.push({ tileX: first.tileX, tileZ: first.tileZ, kind: first.owner.tier > lowerTier ? lockedKind : DOOR_KIND_AUTOMATIC,
    cardLevel: first.owner.tier > lowerTier ? lockedCardLevel : 0, roomA: first.owner, roomB: duct });
  plan.doors.push({ tileX: second.tileX, tileZ: second.tileZ, kind: second.owner.tier > lowerTier ? lockedKind : DOOR_KIND_AUTOMATIC,
    cardLevel: second.owner.tier > lowerTier ? lockedCardLevel : 0, roomA: duct, roomB: second.owner });
  first.isUsed = true; second.isUsed = true;
  return true;
}

// `isVent` plans vents instead of service ducts (see tryPlanDuct). `isLessPicky` accepts pairs that are only two
// doors apart on foot, and vents that run from corridor to corridor: used when the picky pass came up short.
function planLoops(plan, wantedCount, isVent, isLessPicky) {
  const blocked = createDuctBlockGrid(plan);
  const isUsable = function (socket) { return !socket.isUsed && socket.owner.key !== 'calibrationStore'; };
  let made = 0;
  for (let round = 0; round < wantedCount * 3 && made < wantedCount; round++) {
    // Score every pair of free doorways: far apart on foot is good, far apart through the rock is bad.
    const candidates = [];
    const doorsAwayCache = new Map();
    for (const first of plan.sockets) {
      if (!isUsable(first)) continue;
      if (!doorsAwayCache.has(first.owner)) doorsAwayCache.set(first.owner, countDoorsBetweenRooms(plan, first.owner));
      const doorsAway = doorsAwayCache.get(first.owner);
      for (const second of plan.sockets) {
        if (!isUsable(second) || second.owner === first.owner || second.floorY !== first.floorY) continue;
        if (isVent && second.owner.tier !== first.owner.tier) continue;
        if (isVent && !isLessPicky && first.owner.isCorridor && second.owner.isCorridor) continue;
        if (second.tileZ * GRID_WIDTH + second.tileX <= first.tileZ * GRID_WIDTH + first.tileX) continue; // each pair once
        const onFoot = doorsAway.get(second.owner);
        if (onFoot === undefined || onFoot < (isLessPicky ? 2 : 3)) continue;
        const throughRock = Math.abs(first.tileX - second.tileX) + Math.abs(first.tileZ - second.tileZ);
        if (throughRock > 26 || throughRock < 3) continue;
        candidates.push({ first: first, second: second, score: onFoot * 5 - throughRock + plan.random() * 6 });
      }
    }
    candidates.sort(function (a, b) { return b.score - a.score; });
    let madeThisRound = false;
    for (let attempt = 0; attempt < Math.min(candidates.length, 25) && !madeThisRound; attempt++) {
      madeThisRound = tryPlanDuct(plan, blocked, candidates[attempt].first, candidates[attempt].second, isVent);
    }
    if (!madeThisRound) break;
    made++;
  }
  return made;
}

// A second way between the levels, so the lower one is not a dead end with a single way out:
// a stair built upward from the lower level, joined at its top to the upper level by a service duct.
// If either half cannot be fitted, nothing is left behind. Returns true if it was built.
function planSecondStair(plan) {
  const savedRooms = plan.rooms.length, savedSockets = plan.sockets.length, savedDoors = plan.doors.length;
  const wasUsed = plan.sockets.map(function (socket) { return socket.isUsed; });
  const undo = function () {
    plan.rooms.length = savedRooms; plan.sockets.length = savedSockets; plan.doors.length = savedDoors;
    for (let socketIndex = 0; socketIndex < savedSockets; socketIndex++) plan.sockets[socketIndex].isUsed = wasUsed[socketIndex];
    return false;
  };
  const stair = planRoom(plan, 'stairwell', plan.finalTier, plan.deepFloorY, 1); // entered at the foot
  if (!stair) return undo();
  const top = plan.sockets.find(function (socket) { return socket.owner === stair && !socket.isUsed; });
  if (!top) return undo();
  // Join the top to the nearest free doorway on the upper level that is not part of the keycard area.
  const blocked = createDuctBlockGrid(plan);
  const candidates = plan.sockets.filter(function (socket) {
    return !socket.isUsed && socket.owner !== stair && socket.owner.tier < plan.finalTier && socket.floorY === top.floorY && socket.owner.key !== 'calibrationStore';
  }).sort(function (a, b) {
    return Math.abs(a.tileX - top.tileX) + Math.abs(a.tileZ - top.tileZ) - Math.abs(b.tileX - top.tileX) - Math.abs(b.tileZ - top.tileZ);
  });
  for (let attempt = 0; attempt < Math.min(candidates.length, 12); attempt++) {
    if (tryPlanDuct(plan, blocked, candidates[attempt], top)) return true;
  }
  return undo();
}

function planStation(seed, sizeKey, layoutKey, levelsKey, attempt) {
  const size = GENERATED_SIZE_PRESETS[sizeKey] || GENERATED_SIZE_PRESETS.medium;
  const plan = createLevelPlan();
  plan.layout = GENERATED_LAYOUT_PRESETS[layoutKey] || GENERATED_LAYOUT_PRESETS.mixed;
  const hasLowerLevel = (GENERATED_LEVEL_PRESETS[levelsKey] || GENERATED_LEVEL_PRESETS.two).hasLowerLevel;
  chooseStairShape(seed);
  plan.deepFloorY = hasLowerLevel ? -stairDrop : 0; // the level everything behind the last keycard is built on
  plan.cardCount = clampNumber(Math.round(size.keycards || 1), 1, 3);
  plan.finalTier = 1 + plan.cardCount; // the tier Shaft 9 is in
  plan.cardHosts = [];                 // by tier: the room in that tier where the next keycard is left
  plan.random = createSeededRandomGenerator((seed * 7919 + attempt * 104729) >>> 0);
  const random = plan.random;
  const shuffle = function (list) { return list.map(function (item) { return [random(), item]; }).sort(function (a, b) { return a[0] - b[0]; }).map(function (pair) { return pair[1]; }); };

  // The lift lobby goes near the middle of the map, turned at random.
  const lobby = ROOM_CATALOGUE.liftLobby;
  plan.centerX = 58 + Math.floor(random() * 14); plan.centerZ = 50 + Math.floor(random() * 12);
  setPlacement(Math.floor(random() * 4), 11.5, 53.5, plan.centerX + 0.5, plan.centerZ + 0.5); // tile centre onto tile centre
  const cornerA = placePoint(lobby.rect[0], lobby.rect[1]), cornerB = placePoint(lobby.rect[2], lobby.rect[3]);
  const lobbyRoom = {
    key: 'liftLobby', name: lobby.name, tier: 0, isCorridor: false,
    startX: Math.round(Math.min(cornerA[0], cornerB[0])), startZ: Math.round(Math.min(cornerA[1], cornerB[1])),
    endX: Math.round(Math.max(cornerA[0], cornerB[0])), endZ: Math.round(Math.max(cornerA[1], cornerB[1])),
    turns: placement.turns, offsetX: placement.offsetX, offsetZ: placement.offsetZ, floorY: 0, ceiling: lobby.ceiling, zone: 0
  };
  plan.rooms.push(lobbyRoom);
  for (const socket of lobby.sockets) {
    const tile = placeTile(socket[0], socket[1]);
    plan.sockets.push({ tileX: tile[0], tileZ: tile[1], wall: placeWall(socket[2]), owner: lobbyRoom, isUsed: false, floorY: 0 });
  }
  clearPlacement();

  // A long main corridor out of the lobby, like the classic station's.
  for (const socket of shuffle(plan.sockets.slice())) {
    const length = size.spineLength[0] + Math.floor(random() * (size.spineLength[1] - size.spineLength[0] + 1));
    plan.spine = tryPlanCorridorAtSocket(plan, socket, length, 0);
    if (plan.spine) break;
  }
  if (!plan.spine) return null;

  // Which rooms, in which tier. Every station has the same thirteen; the extra rooms vary.
  const fillerKeys = Object.keys(ROOM_CATALOGUE).filter(function (key) { return ROOM_CATALOGUE[key].isFiller; });
  const timesFillerUsed = {};
  const pickFillers = function (tier, count, mustHaveItemSpot) {
    // No extra room appears more than twice in one station.
    const picked = [];
    // In the catalogue, tier 2 means "behind a keycard", whichever card that is.
    const catalogueTier = Math.min(tier, 2);
    const allowed = fillerKeys.filter(function (key) { return ROOM_CATALOGUE[key].tiers.indexOf(catalogueTier) >= 0 && (!mustHaveItemSpot || ROOM_CATALOGUE[key].itemSpot); });
    for (let guard = 0; allowed.length > 0 && picked.length < count && guard < 60; guard++) {
      const key = allowed[Math.floor(random() * allowed.length)];
      if ((timesFillerUsed[key] || 0) >= 2) continue;
      timesFillerUsed[key] = (timesFillerUsed[key] || 0) + 1;
      picked.push(key);
    }
    return picked;
  };
  // The rooms that will hold keycard 2 and 3 are chosen first, while every kind of room is still available:
  // they need somewhere to leave a card, and not every room has that.
  const cardHostKeys = [];
  for (let tier = 2; tier < plan.finalTier; tier++) {
    cardHostKeys[tier] = pickFillers(tier, 1, true)[0];
    if (!cardHostKeys[tier]) return null;
  }
  const tiers = [
    ['pumpHall', 'generatorRoom'].concat(shuffle(['controlRoom', 'securityOffice', 'lockerRoom', 'messRoom', 'storeCloset'].concat(pickFillers(0, size.fillers[0])))),
    ['archive', 'calibrationStore', 'laboratory', 'coldRoom'].concat(shuffle(pickFillers(1, size.fillers[1])))
  ];
  // One ring of rooms per keycard. Every ring but the last starts with a room that has somewhere to leave the
  // next card; the last ring ends with Shaft 9. The extra rooms are shared out, the last ring getting the odd ones.
  const fillersPerRing = Math.floor(size.fillers[2] / plan.cardCount);
  for (let tier = 2; tier <= plan.finalTier; tier++) {
    if (tier < plan.finalTier) tiers.push([cardHostKeys[tier]].concat(shuffle(pickFillers(tier, fillersPerRing))));
    else tiers.push(shuffle(pickFillers(tier, size.fillers[2] - fillersPerRing * (plan.cardCount - 1))).concat(['shaftChamber']));
  }
  const requiredKeys = ['pumpHall', 'generatorRoom', 'controlRoom', 'archive', 'calibrationStore', 'laboratory', 'shaftChamber'];
  for (let tier = 0; tier <= plan.finalTier; tier++) {
    // With two levels, the last ring starts with the stairs down (entered at the top, from the upper level).
    if (tier === plan.finalTier && hasLowerLevel && !planRoom(plan, 'stairwell', tier, 0, 0)) return null;
    for (let roomIndex = 0; roomIndex < tiers[tier].length; roomIndex++) {
      const roomKey = tiers[tier][roomIndex];
      const room = planRoom(plan, roomKey, tier, tier === plan.finalTier ? plan.deepFloorY : 0);
      if (!room && requiredKeys.indexOf(roomKey) >= 0) return null;
      // The first room of a middle ring is the one that holds the next card: without it the station cannot be finished.
      if (tier >= 2 && tier < plan.finalTier && roomIndex === 0) {
        if (!room) return null;
        plan.cardHosts[tier] = room;
      }
    }
  }

  plan.stairCount = hasLowerLevel ? 1 : 0;
  // Medium and large stations try several times to fit a second stair; a failed try leaves nothing behind.
  for (let stairAttempt = 0; stairAttempt < 8 && hasLowerLevel && sizeKey !== 'small' && plan.stairCount < 2; stairAttempt++) {
    if (planSecondStair(plan)) plan.stairCount = 2;
  }
  // Vents first: they are pickier about where they can go (both ends behind the same locks).
  plan.ventCount = planLoops(plan, size.vents || 0, true, false);
  if (plan.ventCount < (size.vents || 0)) plan.ventCount += planLoops(plan, size.vents - plan.ventCount, true, true);
  plan.loopCount = planLoops(plan, size.loops, false);
  // The quests, drawn last so that nothing about them changes the rooms and corridors a seed gives.
  plan.seed = seed;
  plan.quests = planQuests(seed, size, random);
  return plan;
}

// ---------------------------------------------------------------------------
// Step 3: building the plan
// ---------------------------------------------------------------------------

// Dresses the mouth of a vent. `mouth.wall` is the side of the room the vent leaves from, so the room is on the
// opposite side of the mouth's tile. Heights are from the floor of the room being built (placement.offsetY).
function addVentMouth(mouth, random) {
  const frame = { surfaceClass: SURFACE_METAL, blocksMovement: false };
  const outward = WALL_DIRECTIONS[mouth.wall];
  // The face of the mouth's tile that looks into the room, and a strip 6 cm thick standing proud of the wall there.
  const faceX = outward[0] > 0 ? mouth.tileX : mouth.tileX + 1, faceZ = outward[1] > 0 ? mouth.tileZ : mouth.tileZ + 1;
  if (outward[0] !== 0) {
    const nearX = outward[0] > 0 ? faceX - 0.06 : faceX, farX = nearX + 0.06;
    addBoxBetween(nearX, VENT_HEIGHT, mouth.tileZ - 0.08, farX, VENT_HEIGHT + 0.08, mouth.tileZ + 1.08, frame);
    addBoxBetween(nearX, 0, mouth.tileZ - 0.08, farX, VENT_HEIGHT, mouth.tileZ, frame);
    addBoxBetween(nearX, 0, mouth.tileZ + 1, farX, VENT_HEIGHT, mouth.tileZ + 1.08, frame);
  } else {
    const nearZ = outward[1] > 0 ? faceZ - 0.06 : faceZ, farZ = nearZ + 0.06;
    addBoxBetween(mouth.tileX - 0.08, VENT_HEIGHT, nearZ, mouth.tileX + 1.08, VENT_HEIGHT + 0.08, farZ, frame);
    addBoxBetween(mouth.tileX - 0.08, 0, nearZ, mouth.tileX, VENT_HEIGHT, farZ, frame);
    addBoxBetween(mouth.tileX + 1, 0, nearZ, mouth.tileX + 1.08, VENT_HEIGHT, farZ, frame);
  }
  // The grille, flat on the floor a step inside the room.
  const grilleX = mouth.tileX + 0.5 - outward[0] * 1.2 + (random() - 0.5) * 0.3, grilleZ = mouth.tileZ + 0.5 - outward[1] * 1.2 + (random() - 0.5) * 0.3;
  const grilleYaw = random() * 3;
  addBoxProp(grilleX, 0.02, grilleZ, 0.47, 0.02, 0.5, { yaw: grilleYaw, surfaceClass: SURFACE_METAL, blocksMovement: false });
  for (let slat = -2; slat <= 2; slat++) {
    addBoxProp(grilleX + Math.cos(grilleYaw) * slat * 0.17, 0.05, grilleZ + Math.sin(grilleYaw) * slat * 0.17, 0.02, 0.012, 0.44, { yaw: grilleYaw, surfaceClass: SURFACE_METAL, blocksMovement: false });
  }
}

// Finds a stretch of one side wall of a corridor that has no doorway in it, as near the middle as possible.
// Returns the first tile of the stretch (counted along the corridor), or -1 if there is none.
function findBlankCorridorWall(corridor, wall, tilesNeeded) {
  const runsAlongX = corridor.runsAlongX;
  const first = runsAlongX ? corridor.startX : corridor.startZ;
  const last = (runsAlongX ? corridor.endX : corridor.endZ) - tilesNeeded;
  const middle = (first + last) / 2;
  let best = -1;
  for (let start = first; start <= last; start++) {
    let isBlank = true;
    for (let offset = 0; offset < tilesNeeded && isBlank; offset++) {
      const along = start + offset;
      const behindX = runsAlongX ? along : (wall === WALL_WEST ? corridor.startX - 1 : corridor.endX);
      const behindZ = runsAlongX ? (wall === WALL_NORTH ? corridor.startZ - 1 : corridor.endZ) : along;
      if (isTileOpenAt(behindX, behindZ)) isBlank = false;
    }
    if (isBlank && (best < 0 || Math.abs(start - middle) < Math.abs(best - middle))) best = start;
  }
  return best;
}

// Letters a corridor's side wall, centred on a stretch found by findBlankCorridorWall.
function addCorridorWallSign(corridor, wall, firstTile, tilesUsed, text, options) {
  const center = firstTile + tilesUsed / 2;
  const tile = Math.floor(center);
  options.alongOffset = center - (tile + 0.5);
  if (corridor.runsAlongX) addWallSign(text, tile, wall === WALL_NORTH ? corridor.startZ : corridor.endZ - 1, wall, options);
  else addWallSign(text, wall === WALL_WEST ? corridor.startX : corridor.endX - 1, tile, wall, options);
}

// A place in a room to stand something on: floor that can be walked on, with walkable floor on all eight sides
// (so whatever is put there blocks no path) and no door within two tiles. Returns [x, z] or null.
function findDropSpot(room, random, takenSpots) {
  const candidates = [];
  for (let tileZ = room.startZ; tileZ < room.endZ; tileZ++) {
    for (let tileX = room.startX; tileX < room.endX; tileX++) {
      if (tileZone[tileIndexAt(tileX, tileZ)] !== room.zone) continue;
      let isClear = true;
      for (let offsetZ = -2; offsetZ <= 2 && isClear; offsetZ++) {
        for (let offsetX = -2; offsetX <= 2 && isClear; offsetX++) {
          const nearX = tileX + offsetX, nearZ = tileZ + offsetZ;
          const isRing = Math.abs(offsetX) <= 1 && Math.abs(offsetZ) <= 1;
          if (isRing && (!isWalkableAt(nearX, nearZ) || tileFloorHeight[tileIndexAt(nearX, nearZ)] !== tileFloorHeight[tileIndexAt(tileX, tileZ)])) isClear = false;
          if (isInsideGrid(nearX, nearZ) && (tileFlags[tileIndexAt(nearX, nearZ)] & (TILE_FLAG_DOOR | TILE_FLAG_VENT | TILE_FLAG_PIT))) isClear = false;
        }
      }
      for (const taken of takenSpots) if (Math.abs(taken[0] - tileX - 0.5) < 3 && Math.abs(taken[1] - tileZ - 0.5) < 3) isClear = false;
      // Nothing may already stand or lie on the tile itself, not even something low enough to walk over
      // (a pallet, a heap of planks): the thing put here would be standing in it. What hangs overhead is fine.
      const propsOnTile = tilePropLists[tileIndexAt(tileX, tileZ)];
      if (isClear && propsOnTile) {
        for (const prop of propsOnTile) {
          if (!prop.isRemoved && prop.minimumY < tileFloorHeight[tileIndexAt(tileX, tileZ)] + 2) { isClear = false; break; }
        }
      }
      if (isClear) candidates.push([tileX + 0.5, tileZ + 0.5]);
    }
  }
  return candidates.length > 0 ? candidates[Math.floor(random() * candidates.length)] : null;
}

// Direction signs, like the ones in Kessel-9: which way to the lift, and which way to where you are probably going.
// The arrows come from real walking distances, so they are right however the station came out.
function addCorridorDirectionSigns(plan) {
  const fieldToLift = new Int16Array(TILE_COUNT), fieldToPumpHall = new Int16Array(TILE_COUNT), fieldToShaft = new Int16Array(TILE_COUNT);
  const pumpHall = plan.rooms.find(function (room) { return room.key === 'pumpHall'; });
  computeDistanceField(fieldToLift, findNearestWalkableTileIndex(LIFT_POSITION.x, LIFT_POSITION.z), 0, null);
  computeDistanceField(fieldToPumpHall, findNearestWalkableTileIndex((pumpHall.startX + pumpHall.endX) / 2, (pumpHall.startZ + pumpHall.endZ) / 2), 0, null);
  computeDistanceField(fieldToShaft, findNearestWalkableTileIndex(SHAFT_POSITION.x, SHAFT_POSITION.z), 0, null);
  for (const corridor of plan.rooms) {
    if (!corridor.isCorridor || corridor.isDuct) continue;
    const length = corridor.runsAlongX ? corridor.endX - corridor.startX : corridor.endZ - corridor.startZ;
    if (length < 6) continue;
    // The sign goes on the south wall (corridors running east-west) or the east wall (north-south).
    const wall = corridor.runsAlongX ? WALL_SOUTH : WALL_EAST;
    const firstTile = findBlankCorridorWall(corridor, wall, 4);
    if (firstTile < 0) continue;
    // Looking at that wall, "left" is the corridor's far end (east, or north) for one and the near end for the other.
    const lowEndIndex = tileIndexAt(corridor.startX, corridor.startZ);
    const highEndIndex = tileIndexAt(corridor.endX - 1, corridor.endZ - 1);
    const towardLeft = [], towardRight = [];
    const targets = [['LIFT', fieldToLift], corridor.tier === 0 ? ['PUMP HALL B', fieldToPumpHall] : ['SHAFT 9', fieldToShaft]];
    for (const target of targets) {
      const fromLowEnd = target[1][lowEndIndex], fromHighEnd = target[1][highEndIndex];
      if (fromLowEnd >= NAVIGATION_UNREACHABLE || fromHighEnd >= NAVIGATION_UNREACHABLE) continue;
      if (Math.abs(fromLowEnd - fromHighEnd) < (length - 1) * 0.7) continue; // reached through a side door: no clear direction
      const isTowardLowEnd = fromLowEnd < fromHighEnd;
      // Facing south, the low (west) end is on the right. Facing east, the low (north) end is on the left.
      const isOnLeft = corridor.runsAlongX ? !isTowardLowEnd : isTowardLowEnd;
      (isOnLeft ? towardLeft : towardRight).push(target[0]);
    }
    if (towardLeft.length + towardRight.length === 0) continue;
    let text = '';
    if (towardLeft.length > 0) text += '\u2190 ' + towardLeft.join(' \u00b7 ');
    if (towardLeft.length > 0 && towardRight.length > 0) text += '    ';
    if (towardRight.length > 0) text += towardRight.join(' \u00b7 ') + ' \u2192';
    addCorridorWallSign(corridor, wall, firstTile, 4, text, { width: 3.4, height: 0.28, centerY: 1.9 });
  }
}

function furnishGeneratedCorridor(corridor, random) {
  const startX = corridor.startX, startZ = corridor.startZ, endX = corridor.endX, endZ = corridor.endZ;
  const ceiling = corridor.ceiling;
  if (corridor.isFlooded) setTileFlagInRectangle(startX, startZ, endX, endZ, TILE_FLAG_WATER);
  if (corridor.isVent) {
    // A vent: nothing in it but the seams of the sheet metal, one every other tile, so a scan has something to
    // catch on. At each mouth, a frame round the opening and the grille that used to cover it, lying where it fell.
    for (let step = 1; step < corridor.route.length - 1; step += 2) {
      const index = corridor.route[step];
      const tileX = index % GRID_WIDTH, tileZ = (index - tileX) / GRID_WIDTH;
      addBoxBetween(tileX, 0, tileZ + 0.47, tileX + 1, 0.015, tileZ + 0.53, { surfaceClass: SURFACE_METAL, blocksMovement: false });
      addBoxBetween(tileX + 0.47, 0, tileZ, tileX + 0.53, 0.015, tileZ + 1, { surfaceClass: SURFACE_METAL, blocksMovement: false });
    }
    for (const mouth of corridor.mouths) addVentMouth(mouth, random);
    return;
  }
  if (corridor.isDuct) {
    // A service duct: low, one tile wide, with a fat pipe overhead along every straight stretch.
    const route = corridor.route;
    let runStart = 0;
    for (let step = 1; step <= route.length; step++) {
      const isRunEnd = step === route.length ||
        (step >= 2 && route[step] - route[step - 1] !== route[step - 1] - route[step - 2]);
      if (!isRunEnd) continue;
      const fromIndex = route[runStart], toIndex = route[step - 1];
      const fromX = fromIndex % GRID_WIDTH, fromZ = (fromIndex - fromX) / GRID_WIDTH;
      const toX = toIndex % GRID_WIDTH, toZ = (toIndex - toX) / GRID_WIDTH;
      if (fromZ === toZ && fromX !== toX) addPipeAlongX(Math.min(fromX, toX), Math.max(fromX, toX) + 1, ceiling - 0.22, fromZ + 0.2, 0.12);
      else if (fromX === toX && fromZ !== toZ) addPipeAlongZ(Math.min(fromZ, toZ), Math.max(fromZ, toZ) + 1, ceiling - 0.22, fromX + 0.2, 0.12);
      runStart = step - 1;
    }
    if (random() < 0.5) {
      const litterIndex = route[Math.floor(route.length / 2)];
      addBoxProp(litterIndex % GRID_WIDTH + 0.5, 0.06, Math.floor(litterIndex / GRID_WIDTH) + 0.5, 0.18, 0.06, 0.12, { yaw: random() * 3, blocksMovement: false });
    }
    return;
  }
  addPortalFrames(startX, startZ, endX, endZ, ceiling, 4, corridor.runsAlongX);
  if (corridor.runsAlongX) {
    addPipeAlongX(startX, endX, ceiling - 0.25, startZ + 0.22, 0.09);
    if (random() < 0.6) addPipeAlongX(startX, endX, ceiling - 0.18, endZ - 0.24, 0.06);
    for (let lampX = startX + 2.5; lampX < endX - 1; lampX += 6) addCeilingLamp(lampX, (startZ + endZ) / 2, ceiling, true);
  } else {
    addPipeAlongZ(startZ, endZ, ceiling - 0.25, startX + 0.22, 0.09);
    if (random() < 0.6) addPipeAlongZ(startZ, endZ, ceiling - 0.18, endX - 0.24, 0.06);
    for (let lampZ = startZ + 2.5; lampZ < endZ - 1; lampZ += 6) addCeilingLamp((startX + endX) / 2, lampZ, ceiling, false);
  }
  // Litter: only things you can walk through, so a corridor is never blocked.
  const litterCount = Math.floor(random() * 3);
  for (let item = 0; item < litterCount; item++) {
    const litterX = startX + 0.4 + random() * (endX - startX - 0.8), litterZ = startZ + 0.4 + random() * (endZ - startZ - 0.8);
    addBoxProp(litterX, 0.1, litterZ, 0.2 + random() * 0.15, 0.1, 0.14 + random() * 0.1, { yaw: random() * 3, blocksMovement: false });
  }
  // Now and then, something scratched on the north or west wall, where there is room between the doors.
  if (random() < 0.4) {
    const text = CORRIDOR_SCRAWLS[Math.floor(random() * CORRIDOR_SCRAWLS.length)];
    const wall = corridor.runsAlongX ? WALL_NORTH : WALL_WEST;
    const firstTile = findBlankCorridorWall(corridor, wall, 5);
    if (firstTile >= 0) addCorridorWallSign(corridor, wall, firstTile, 5, text, { width: 4.4, height: 0.5, centerY: 1.45, isScrawled: true });
  }
}

// Beams under the ceiling of a room that is big and tall enough to want them. `room` is its rectangle on the map
// (startX, startZ, endX, endZ) and its ceiling height. The workshop uses this too, so a room looks the same there.
function addBeamsToLargeRoom(room) {
  const width = room.endX - room.startX, depth = room.endZ - room.startZ;
  if (room.ceiling < 3 || Math.min(width, depth) < 6) return;
  addCeilingBeams(room.startX, room.startZ, room.endX, room.endZ, room.ceiling, room.ceiling > 5 ? 5 : 3.5, width < depth, room.ceiling > 5 ? 0.4 : 0.22);
}

// Builds a station from a seed. Returns true, or false if no workable plan was found (the map is left empty).
function buildGeneratedStation(seed, sizeKey, layoutKey, levelsKey) {
  if (!GENERATED_SIZE_PRESETS[sizeKey]) sizeKey = 'medium';
  if (!GENERATED_LAYOUT_PRESETS[layoutKey]) layoutKey = 'mixed';
  if (!GENERATED_LEVEL_PRESETS[levelsKey]) levelsKey = 'two';
  let plan = null;
  // A short stair leaves the lower level little room beside the upper one, so Shaft 9 can take many tries to fit:
  // large stations with a one-step stair have needed over 50. Most stations are planned within ten.
  for (let attempt = 0; attempt < 200 && !plan; attempt++) plan = planStation(seed, sizeKey, layoutKey, levelsKey, attempt);
  clearPlacement();
  if (!plan) return false;
  const random = plan.random;

  level.kind = 'generated';
  level.seed = seed;
  level.sizeKey = sizeKey;
  level.layoutKey = layoutKey;
  level.levelsKey = levelsKey;
  level.stairCount = plan.stairCount;
  level.description = 'Generated · ' + GENERATED_SIZE_PRESETS[sizeKey].label.toLowerCase() + ', ' +
    GENERATED_LAYOUT_PRESETS[layoutKey].label.toLowerCase() + ', ' + GENERATED_LEVEL_PRESETS[levelsKey].label.toLowerCase() + ' · seed ' + seed;
  level.storeZone = 0;
  level.stillZones.length = 0;
  level.unlabelledZones.length = 0;
  placement.isGenerating = true;

  // Zones and their names. A second room of the same kind is numbered.
  ZONE_NAMES.length = 0;
  ZONE_NAMES.push('UNSURVEYED');
  const nameCounts = {};
  let corridorLetter = 0, liftCarZone = 0;
  for (const room of plan.rooms) {
    room.zone = ZONE_NAMES.length;
    let name = room.name;
    if (room.key === 'corridor') name = 'CORRIDOR ' + String.fromCharCode(65 + (corridorLetter++ % 26)) + (corridorLetter > 26 ? '2' : '');
    else {
      // A second room of a kind is numbered: WORKSHOP, WORKSHOP 2. One that already ends in a number counts on: SUMP 3, SUMP 4.
      nameCounts[name] = (nameCounts[name] || 0) + 1;
      if (nameCounts[name] > 1) {
        const endsInNumber = /^(.*?)([0-9]+)$/.exec(name);
        name = endsInNumber ? endsInNumber[1] + (Number(endsInNumber[2]) + nameCounts[name] - 1) : name + ' ' + nameCounts[name];
      }
    }
    room.name = name;
    ZONE_NAMES.push(name);
    if (room.isCorridor) level.unlabelledZones.push(room.zone);
    if (room.key === 'liftLobby') { liftCarZone = ZONE_NAMES.length; ZONE_NAMES.push('LIFT CAR'); }
  }

  // Where the first spool and the keycard are: usually their own rooms, sometimes on a table elsewhere.
  relocatedObjectives.spool1 = false; relocatedObjectives.keycard = false;
  const roomsWithSpot = function (tier) { return plan.rooms.filter(function (room) { return !room.isCorridor && room.tier === tier && ROOM_CATALOGUE[room.key].itemSpot; }); };
  const spoolHosts = roomsWithSpot(0), keycardHosts = roomsWithSpot(1);
  const spoolHost = spoolHosts.length > 0 && random() < 0.55 ? spoolHosts[Math.floor(random() * spoolHosts.length)] : null;
  const keycardHost = keycardHosts.length > 0 && random() < 0.55 ? keycardHosts[Math.floor(random() * keycardHosts.length)] : null;
  relocatedObjectives.spool1 = spoolHost !== null;
  relocatedObjectives.keycard = keycardHost !== null;
  // The security office note says where the card is kept, so it has to name the right room.
  level.keycardRoomText = keycardHost ? 'the ' + keycardHost.name.toLowerCase() : 'the laboratory';
  level.keycardCount = plan.cardCount;

  const placeRoom = function (room) {
    placement.turns = room.turns; placement.offsetX = room.offsetX; placement.offsetZ = room.offsetZ;
    placement.offsetY = room.floorY;
    placement.zone = room.zone;
    placement.zoneMap = room.key === 'liftLobby' ? { [ZONE_LIFT_CAR]: liftCarZone } : null;
  };

  // Carve every room, then every corridor.
  for (const room of plan.rooms) {
    if (room.isCorridor) continue;
    placeRoom(room);
    ROOM_CATALOGUE[room.key].carve();
    if (ROOM_CATALOGUE[room.key].isFlooded) setTileFlagInRectangle(ROOM_CATALOGUE[room.key].rect[0], ROOM_CATALOGUE[room.key].rect[1], ROOM_CATALOGUE[room.key].rect[2], ROOM_CATALOGUE[room.key].rect[3], TILE_FLAG_WATER);
  }
  clearPlacement();
  for (const room of plan.rooms) {
    if (!room.isCorridor) continue;
    placement.zone = room.zone;
    placement.offsetY = room.floorY;
    if (room.route) {
      for (const index of room.route) {
        const tileX = index % GRID_WIDTH, tileZ = (index - tileX) / GRID_WIDTH;
        carveRoom(tileX, tileZ, tileX + 1, tileZ + 1, room.ceiling, ZONE_GENERATED_ROOM);
        if (room.isVent) tileFlags[index] |= TILE_FLAG_VENT | TILE_FLAG_GRATE; // sheet metal: it rings underfoot
      }
    } else carveRoom(room.startX, room.startZ, room.endX, room.endZ, room.ceiling, ZONE_GENERATED_ROOM);
  }

  // Hang the doors.
  clearPlacement();
  for (const door of plan.doors) addDoor(door.tileX, door.tileZ, door.kind, door.cardLevel);

  // Furnish.
  for (const room of plan.rooms) {
    if (room.isCorridor) {
      clearPlacement();
      placement.zone = room.zone;
      placement.offsetY = room.floorY;
      furnishGeneratedCorridor(room, random);
      continue;
    }
    placeRoom(room);
    const definition = ROOM_CATALOGUE[room.key];
    definition.furnish(random, room.name);
    if (room === spoolHost) addSurveySpool(OBJECT_SPOOL_1, definition.itemSpot[0], definition.itemSpot[1], definition.itemSpot[2], 'SPOOL');
    if (room === keycardHost) addKeycard(definition.itemSpot[0], definition.itemSpot[1] + 0.005, definition.itemSpot[2], 1);
    // Card 2 is left in the ring that card 1 opens (tier 2), card 3 in the ring that card 2 opens.
    if (room.tier >= 2 && plan.cardHosts[room.tier] === room) addKeycard(definition.itemSpot[0], definition.itemSpot[1] + 0.005, definition.itemSpot[2], room.tier);
    // Apparitions travel with their rooms.
    if (room.key === 'coldRoom') pushPhantom(10.7, 24.2, Math.PI + 0.7, room.zone, false);
    if (room.key === 'pumpHall') pushPhantom(62.5, 55.5, -1.9, room.zone, true);
  }
  clearPlacement();

  // Beams in the larger rooms.
  for (const room of plan.rooms) {
    if (room.isCorridor || room.key === 'liftLobby') continue;
    placement.offsetY = room.floorY;
    addBeamsToLargeRoom(room);
  }

  // Every door is labelled, on each side, with the name of what is behind it.
  for (const door of plan.doors) {
    for (let side = 0; side < 4; side++) {
      const step = WALL_DIRECTIONS[side];
      const standX = door.tileX + step[0], standZ = door.tileZ + step[1];
      const beyondX = door.tileX - step[0], beyondZ = door.tileZ - step[1];
      if (!isTileOpenAt(standX, standZ) || !isTileOpenAt(beyondX, beyondZ)) continue;
      const standIndex = tileIndexAt(standX, standZ);
      if (tileFlags[standIndex] & TILE_FLAG_DOOR) continue;
      if (tileCeilingHeight[standIndex] - tileFloorHeight[standIndex] < 2.62) continue;
      const beyondName = ZONE_NAMES[tileZone[tileIndexAt(beyondX, beyondZ)]];
      if (!beyondName) continue;
      placement.zone = tileZone[standIndex];
      addWallSign(beyondName, standX, standZ, (side + 2) % 4, { width: 0.96, height: beyondName.length > 12 ? 0.13 : 0.18, centerY: 2.47 });
    }
  }
  clearPlacement();

  // The Stills may walk in their store and in whatever is outside its door.
  level.stillZones.push(level.storeZone);
  for (const door of plan.doors) {
    if (door.roomA.key === 'calibrationStore') level.stillZones.push(door.roomB.zone);
    if (door.roomB.key === 'calibrationStore') level.stillZones.push(door.roomA.zone);
  }

  // An apparition at the end of the main corridor furthest from the lift, looking back toward the lift.
  const spine = plan.spine;
  const spineMiddleX = (spine.startX + spine.endX) / 2, spineMiddleZ = (spine.startZ + spine.endZ) / 2;
  if (spine.runsAlongX) {
    const isLiftAtWestEnd = Math.abs(plan.centerX - spine.startX) < Math.abs(plan.centerX - spine.endX);
    pushPhantom(isLiftAtWestEnd ? spine.endX - 1.5 : spine.startX + 1.5, spineMiddleZ, isLiftAtWestEnd ? -Math.PI / 2 : Math.PI / 2, spine.zone, false);
  } else {
    const isLiftAtNorthEnd = Math.abs(plan.centerZ - spine.startZ) < Math.abs(plan.centerZ - spine.endZ);
    pushPhantom(spineMiddleX, isLiftAtNorthEnd ? spine.endZ - 1.5 : spine.startZ + 1.5, isLiftAtNorthEnd ? 0 : Math.PI, spine.zone, false);
  }

  placement.isGenerating = false;
  computeNavigationGrid();
  computeLevelBounds();
  placeQuests(plan, random);
  addCorridorDirectionSigns(plan);

  // Places for the Hollow to wander between: the middle of every room and corridor.
  for (const room of plan.rooms) {
    if (room.key === 'calibrationStore' || room.isVent) continue; // a vent is a way through, not somewhere to wander to
    if (room.route) {
      const middle = room.route[Math.floor(room.route.length / 2)];
      roamingWaypoints.push([middle % GRID_WIDTH + 0.5, Math.floor(middle / GRID_WIDTH) + 0.5]);
      continue;
    }
    const index = findNearestWalkableTileIndex((room.startX + room.endX) / 2, (room.startZ + room.endZ) / 2);
    if (index >= 0) roamingWaypoints.push([index % GRID_WIDTH + 0.5, Math.floor(index / GRID_WIDTH) + 0.5]);
  }
  level.roomCount = plan.rooms.length;
  level.loopCount = plan.loopCount;
  level.ventCount = plan.ventCount;
  return true;
}

function pushPhantom(x, z, yaw, triggerZone, onlyBeforePower) {
  const placed = placePoint(x, z);
  phantomDefinitions.push({ x: placed[0], z: placed[1], yaw: placeYaw(yaw), triggerZone: triggerZone, onlyBeforePower: onlyBeforePower });
}

// Empties the map and builds either the classic station or a generated one.
function buildStation(kind, seed, sizeKey, layoutKey, levelsKey) {
  const wasBuiltAsAsked = buildStationRooms(kind, seed, sizeKey, layoutKey, levelsKey);
  // Last of all, the ceiling hatches of the Hollow's crawlspace: they depend on where the locked doors ended up.
  placeHollowHatches();
  // And the loose things on the floor that are loud to walk on. After the hatches, so that none lies under one.
  placeNoisyFloor();
  return wasBuiltAsAsked;
}

function buildStationRooms(kind, seed, sizeKey, layoutKey, levelsKey) {
  resetWorldForNewLevel();
  stillSpawnPoints.length = 0; lateStillSpawnPoints.length = 0; phantomDefinitions.length = 0;
  liftDoor = null;
  if (kind === 'generated' && buildGeneratedStation(seed, sizeKey, layoutKey, levelsKey)) return true;
  if (kind === 'generated') {
    // No plan worked for this seed (rare). Fall back to the classic station so there is always something to play.
    resetWorldForNewLevel();
    stillSpawnPoints.length = 0; lateStillSpawnPoints.length = 0; phantomDefinitions.length = 0;
  }
  level.seed = 0;
  buildFacilityLayout();
  level.roomCount = 0;
  level.loopCount = 0;
  level.stairCount = 0;
  level.ventCount = 0;
  return kind !== 'generated';
}

// Checks that the station can be finished in the intended order. Returns a list of problems (empty when fine).
//   with no power:    the generator and the first spool must be reachable
//   with power:       the keycard and the second spool
//   with the keycard: everything
function auditLevelProgression() {
  const problems = [];
  const field = new Int16Array(TILE_COUNT);
  // `isShut` says which doors are locked in the situation being checked.
  const reach = function (isShut) {
    const closed = [];
    for (const door of doors) {
      if (!isShut(door)) continue;
      const index = tileIndexAt(door.tileX, door.tileZ);
      if (tileIsWalkable[index]) { tileIsWalkable[index] = 0; closed.push(index); }
    }
    computeDistanceField(field, findNearestWalkableTileIndex(PLAYER_START.x, PLAYER_START.z), 0, null);
    for (const index of closed) tileIsWalkable[index] = 1;
  };
  const canReach = function (objectId) {
    const interactable = findInteractableByObjectId(objectId);
    if (!interactable) return false;
    const index = findNearestWalkableTileIndex(interactable.x, interactable.z);
    return index >= 0 && field[index] < NAVIGATION_UNREACHABLE;
  };
  const cardIds = KEYCARD_OBJECT_IDS.slice(1, level.keycardCount + 1);
  const mustExistOnce = [OBJECT_LIFT_TERMINAL, OBJECT_GENERATOR, OBJECT_SPOOL_1, OBJECT_SPOOL_2, OBJECT_SPOOL_3].concat(cardIds);
  for (const objectId of mustExistOnce) {
    if (interactables.filter(function (interactable) { return interactable.objectId === objectId; }).length !== 1) problems.push('object ' + objectId + ' does not exist exactly once');
  }
  // No power: every powered and keycard door is shut.
  reach(function (door) { return door.kind === DOOR_KIND_POWERED || door.kind === DOOR_KIND_KEYCARD; });
  if (!canReach(OBJECT_GENERATOR)) problems.push('the generator cannot be reached without power');
  if (!canReach(OBJECT_SPOOL_1)) problems.push('the first spool cannot be reached without power');
  if (!canReach(OBJECT_LIFT_TERMINAL)) problems.push('the lift terminal cannot be reached');
  if (canReach(OBJECT_SPOOL_3)) problems.push('the shaft can be reached without power or keycard');
  // Power on, holding cards 1 to `held`: the next card must be in reach, later ones and the shaft must not be.
  for (let held = 0; held <= level.keycardCount; held++) {
    reach(function (door) { return door.kind === DOOR_KIND_KEYCARD && door.cardLevel > held; });
    if (held === 0 && !canReach(OBJECT_SPOOL_2)) problems.push('the second spool cannot be reached with power alone');
    if (held < level.keycardCount) {
      if (!canReach(cardIds[held])) problems.push('keycard ' + (held + 1) + ' cannot be reached ' + (held === 0 ? 'with power alone' : 'with keycard ' + held));
      if (canReach(OBJECT_SPOOL_3)) problems.push('the shaft can be reached with ' + (held === 0 ? 'no keycard' : 'only keycard ' + held));
      for (let later = held + 1; later < level.keycardCount; later++) {
        if (canReach(cardIds[later])) problems.push('keycard ' + (later + 1) + ' can be reached before keycard ' + later + ' is held');
      }
    } else if (!canReach(OBJECT_SPOOL_3)) problems.push('the third spool cannot be reached at all');
  }
  // The quests: each thing they need must exist, and be where its quest says it is (09-quests.js).
  auditQuests(problems, reach, canReach, mustExistOnce);
  if (!level.storeZone) problems.push('there is no calibration store');
  // Everything you must use has to be within arm's reach of somewhere you can stand.
  for (const objectId of mustExistOnce) {
    const interactable = findInteractableByObjectId(objectId);
    if (!interactable) continue;
    const index = findNearestWalkableTileIndex(interactable.x, interactable.z);
    const distance = index < 0 ? Infinity : distanceBetweenPoints(interactable.x, interactable.z, index % GRID_WIDTH + 0.5, Math.floor(index / GRID_WIDTH) + 0.5);
    if (distance > TUNING.interactionReach - 0.4) problems.push('object ' + objectId + ' is out of reach: ' + distance.toFixed(2) + ' m from the nearest standing spot');
  }
  // A door with furniture or rock straight behind it is a door nobody can use.
  for (const door of doors) {
    const opensAlongX = isWalkableAt(door.tileX - 1, door.tileZ) && isWalkableAt(door.tileX + 1, door.tileZ);
    const opensAlongZ = isWalkableAt(door.tileX, door.tileZ - 1) && isWalkableAt(door.tileX, door.tileZ + 1);
    if (!opensAlongX && !opensAlongZ) problems.push('the door at ' + door.tileX + ',' + door.tileZ + ' is blocked on one side');
  }
  if (ZONE_NAMES.length > 250) problems.push('too many rooms for one station: ' + ZONE_NAMES.length);
  return problems;
}
