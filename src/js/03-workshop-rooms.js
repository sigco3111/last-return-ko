// ---------------------------------------------------------------------------
// Rooms made in the workshop (`npm run dev`, then "Workshop" on the title screen).
//
// Such a room is not written as code. It is a list of things from the catalogue below (a table here,
// a pipe there), saved as one file in src/rooms/ and packed into the page by build.js. This file turns
// each of them into an ordinary entry of ROOM_CATALOGUE (03-levelgen.js), so a generated station can
// use it like any other extra room.
//
// In a room file, positions are metres from the room's north-west corner: x runs east, z runs south.
// Angles are degrees, clockwise seen from above. Heights are metres above the room's floor.
// ---------------------------------------------------------------------------

const ROOM_WALL_NAMES = ['north', 'east', 'south', 'west']; // in the order of WALL_NORTH .. WALL_WEST

// TWEAK: how small and how large a workshop room may be, in tiles (metres), and how low and high its ceiling.
const DESIGNED_ROOM_LIMITS = { minimumSize: 3, maximumSize: 24, minimumCeiling: 2.4, maximumCeiling: 9 };

const ROOM_SURFACE_CHOICES = [['plain', 'Plain'], ['metal', 'Metal'], ['reflective', 'Reflective (like lettering)']];
const ROOM_SURFACE_CLASSES = { plain: SURFACE_PROP, metal: SURFACE_METAL, reflective: SURFACE_SIGN };

function numberField(key, label, defaultValue, minimum, maximum, step) {
  return { key: key, label: label, kind: 'number', defaultValue: defaultValue, minimum: minimum, maximum: maximum, step: step };
}
function booleanField(key, label, defaultValue) {
  return { key: key, label: label, kind: 'boolean', defaultValue: defaultValue };
}
function choiceField(key, label, defaultValue, choices) {
  return { key: key, label: label, kind: 'choice', defaultValue: defaultValue, choices: choices };
}
function textField(key, label, defaultValue) {
  return { key: key, label: label, kind: 'text', defaultValue: defaultValue };
}

function designedShapeOptions(item) {
  return { surfaceClass: ROOM_SURFACE_CLASSES[item.surface], blocksMovement: item.isSolid };
}

// Everything a workshop room can contain.
//   label, group  what the workshop calls it, and which heading it is listed under
//   placement     'floor' (stands somewhere: x, z, angle), 'wall' (lettering) or 'tiles' (a rectangle of floor tiles)
//   angleStep     0: turning it changes nothing, 90: quarter turns only, anything else: any angle
//   fields        the numbers and switches it has besides its position; `defaultValue` is used when a file leaves one out
//   build         puts it in the world. `context` holds: yaw (radians), random, ceiling, roomName, room
// To add something: write its builder next to the others in 02-world.js, then add an entry here.
const ROOM_ITEM_TYPES = {
  // ---- furniture ----
  table: { label: 'Table', group: 'Furniture', placement: 'floor', angleStep: 5,
    fields: [numberField('lengthX', 'Width', 1.4, 0.4, 5, 0.1), numberField('lengthZ', 'Depth', 0.7, 0.3, 3, 0.1), numberField('height', 'Height', 0.76, 0.3, 1.3, 0.02)],
    build: function (item, context) { addTable(item.x, item.z, context.yaw, item.lengthX, item.lengthZ, item.height); } },
  roundTable: { label: 'Round table', group: 'Furniture', placement: 'floor', angleStep: 0,
    fields: [numberField('radius', 'Radius', 0.55, 0.25, 1.5, 0.05)],
    build: function (item) { addRoundTable(item.x, item.z, item.radius); } },
  chair: { label: 'Chair', group: 'Furniture', placement: 'floor', angleStep: 5,
    fields: [booleanField('isToppled', 'Knocked over', false)],
    build: function (item, context) { addChair(item.x, item.z, context.yaw, item.isToppled); } },
  locker: { label: 'Locker', group: 'Furniture', placement: 'floor', angleStep: 5,
    fields: [booleanField('isDoorOpen', 'Door hanging open', false)],
    build: function (item, context) { addLocker(item.x, item.z, context.yaw, item.isDoorOpen); } },
  bunkBed: { label: 'Bunk bed', group: 'Furniture', placement: 'floor', angleStep: 90, fields: [],
    build: function (item) { addBunkBed(item.x - 0.45, item.z - 1.0, false); } },
  gurney: { label: 'Gurney', group: 'Furniture', placement: 'floor', angleStep: 5,
    fields: [booleanField('hasCoveredShape', 'Something under a sheet', false)],
    build: function (item, context) { addGurney(item.x, item.z, context.yaw, item.hasCoveredShape); } },
  shelfRack: { label: 'Shelf rack', group: 'Furniture', placement: 'floor', angleStep: 90,
    fields: [numberField('length', 'Length', 2.5, 0.8, 12, 0.1), numberField('height', 'Height', 2.3, 0.7, 2.3, 0.05), numberField('fillAmount', 'How full (0 to 1)', 0.6, 0, 1, 0.05)],
    build: function (item, context) { addShelfRackAlongZ(item.x, item.z - item.length / 2, item.z + item.length / 2, item.height, context.random, item.fillAmount); } },
  hangingSuit: { label: 'Suit on a hook', group: 'Furniture', placement: 'floor', angleStep: 5, fields: [],
    build: function (item, context) { addHangingSuit(item.x, item.z, context.yaw); } },

  // ---- stores ----
  crate: { label: 'Crate', group: 'Stores', placement: 'floor', angleStep: 5,
    fields: [numberField('size', 'Size', 0.7, 0.3, 1.6, 0.05), numberField('baseHeight', 'Stands on something this high', 0, 0, 3, 0.05)],
    build: function (item, context) { addCrate(item.x, item.z, item.size / 2, context.yaw, item.baseHeight); } },
  crateStack: { label: 'Stack of crates (random)', group: 'Stores', placement: 'floor', angleStep: 0, fields: [],
    build: function (item, context) { addCrateStack(item.x, item.z, context.random); } },
  barrel: { label: 'Barrel', group: 'Stores', placement: 'floor', angleStep: 0, fields: [],
    build: function (item) { addBarrel(item.x, item.z); } },

  // ---- machinery ----
  tank: { label: 'Tank with ladder', group: 'Machinery', placement: 'floor', angleStep: 90,
    fields: [numberField('radius', 'Radius', 1.2, 0.4, 3, 0.05), numberField('height', 'Height', 3, 1, 8, 0.1)],
    build: function (item) { addTank(item.x, item.z, item.radius, item.height); } },
  pumpUnit: { label: 'Pump unit', group: 'Machinery', placement: 'floor', angleStep: 90, fields: [],
    build: function (item) { addPumpUnit(item.x, item.z); } },
  pipe: { label: 'Pipe (lying)', group: 'Machinery', placement: 'floor', angleStep: 90,
    fields: [numberField('length', 'Length', 4, 0.3, 24, 0.1), numberField('height', 'Height of its middle', 2.4, 0.05, 8.5, 0.05), numberField('radius', 'Radius', 0.1, 0.02, 0.5, 0.01)],
    build: function (item) { addPipeAlongX(item.x - item.length / 2, item.x + item.length / 2, item.height, item.z, item.radius); } },
  verticalPipe: { label: 'Pipe (upright)', group: 'Machinery', placement: 'floor', angleStep: 0,
    fields: [numberField('bottom', 'Bottom', 0, 0, 8, 0.05), numberField('top', 'Top', 2.6, 0.1, 9, 0.05), numberField('radius', 'Radius', 0.07, 0.01, 0.5, 0.01), booleanField('isSolid', 'Blocks the way', false)],
    build: function (item) { addVerticalPipe(item.x, item.z, Math.min(item.bottom, item.top), Math.max(item.bottom, item.top), item.radius, item.isSolid); } },
  ceilingLamp: { label: 'Ceiling lamp', group: 'Machinery', placement: 'floor', angleStep: 90, fields: [],
    build: function (item, context) { addCeilingLamp(item.x, item.z, context.ceiling, true); } },

  // ---- survey gear ----
  tripod: { label: 'Scanner tripod', group: 'Survey gear', placement: 'floor', angleStep: 0, fields: [],
    build: function (item) { addTripod(item.x, item.z); } },
  targetBoard: { label: 'Target board', group: 'Survey gear', placement: 'floor', angleStep: 5, fields: [],
    build: function (item, context) { addTargetBoard(item.x, item.z, context.yaw); } },
  registrationSphere: { label: 'Registration sphere', group: 'Survey gear', placement: 'floor', angleStep: 0, fields: [],
    build: function (item) { addRegistrationSphere(item.x, item.z); } },

  // ---- plain shapes, for anything the list above does not have ----
  box: { label: 'Box', group: 'Shapes', placement: 'floor', angleStep: 5,
    fields: [numberField('sizeX', 'Width', 1, 0.02, 24, 0.05), numberField('sizeZ', 'Depth', 1, 0.02, 24, 0.05), numberField('sizeY', 'Height', 1, 0.02, 9, 0.05),
      numberField('bottom', 'Underside above the floor', 0, 0, 8.9, 0.05), choiceField('surface', 'Surface', 'plain', ROOM_SURFACE_CHOICES), booleanField('isSolid', 'Blocks the way', true)],
    build: function (item, context) {
      const options = designedShapeOptions(item);
      options.yaw = context.yaw;
      addBoxProp(item.x, item.bottom + item.sizeY / 2, item.z, item.sizeX / 2, item.sizeY / 2, item.sizeZ / 2, options);
    } },
  cylinder: { label: 'Cylinder (upright)', group: 'Shapes', placement: 'floor', angleStep: 0,
    fields: [numberField('radius', 'Radius', 0.4, 0.01, 4, 0.01), numberField('sizeY', 'Height', 1, 0.02, 9, 0.05),
      numberField('bottom', 'Underside above the floor', 0, 0, 8.9, 0.05), choiceField('surface', 'Surface', 'metal', ROOM_SURFACE_CHOICES), booleanField('isSolid', 'Blocks the way', true)],
    build: function (item) { addCylinderProp(AXIS_Y, item.x, item.bottom + item.sizeY / 2, item.z, item.radius, item.sizeY / 2, designedShapeOptions(item)); } },
  sphere: { label: 'Sphere', group: 'Shapes', placement: 'floor', angleStep: 0,
    fields: [numberField('radius', 'Radius', 0.3, 0.02, 3, 0.01), numberField('centerHeight', 'Height of its middle', 1, 0, 8.9, 0.05),
      choiceField('surface', 'Surface', 'plain', ROOM_SURFACE_CHOICES), booleanField('isSolid', 'Blocks the way', false)],
    build: function (item) { addSphereProp(item.x, item.centerHeight, item.z, item.radius, designedShapeOptions(item)); } },

  // ---- walls and floor ----
  sign: { label: 'Wall lettering', group: 'Walls and floor', placement: 'wall',
    // {name} in the text becomes the room's name in the station it ends up in ("WORKSHOP 2").
    fields: [textField('text', 'Text ({name} = the room\'s name)', '{name}'), choiceField('wall', 'Wall', 'north', [['north', 'North'], ['east', 'East'], ['south', 'South'], ['west', 'West']]),
      numberField('along', 'Along the wall', 2, 0, 24, 0.1), numberField('centerY', 'Height of its middle', 2.3, 0.2, 8.5, 0.05),
      numberField('width', 'Width', 2, 0.3, 10, 0.1), numberField('height', 'Height', 0.26, 0.08, 1.2, 0.02), booleanField('isScrawled', 'Scratched by hand', false)],
    build: function (item, context) {
      const text = item.text.split('{name}').join(context.roomName);
      if (text.trim() === '') return;
      const spot = getDesignedSignSpot(context.room, item);
      addWallSign(text, spot.tileX, spot.tileZ, spot.wall, { width: item.width, height: item.height, centerY: item.centerY, alongOffset: spot.alongOffset, isScrawled: item.isScrawled });
    } },
  floorArea: { label: 'Floor: water or hazard stripes', group: 'Walls and floor', placement: 'tiles',
    fields: [choiceField('kind', 'What', 'water', [['water', 'Standing water'], ['hazard', 'Hazard stripes']]), numberField('sizeX', 'Tiles east', 2, 1, 24, 1), numberField('sizeZ', 'Tiles south', 2, 1, 24, 1)],
    build: function (item) {
      setTileFlagInRectangle(item.x, item.z, item.x + item.sizeX, item.z + item.sizeZ, item.kind === 'hazard' ? TILE_FLAG_HAZARD : TILE_FLAG_WATER);
    } }
};

// Which tile and wall a piece of lettering is on, and how far along that tile's wall its middle is.
function getDesignedSignSpot(room, item) {
  const wall = Math.max(0, ROOM_WALL_NAMES.indexOf(item.wall));
  const runsAlongX = wall === WALL_NORTH || wall === WALL_SOUTH;
  const wallLength = runsAlongX ? room.width : room.depth;
  const along = clampNumber(item.along, 0.05, wallLength - 0.05);
  const tile = Math.min(wallLength - 1, Math.floor(along));
  return {
    wall: wall, along: along, alongOffset: along - (tile + 0.5),
    tileX: runsAlongX ? tile : (wall === WALL_WEST ? 0 : room.width - 1),
    tileZ: runsAlongX ? (wall === WALL_NORTH ? 0 : room.depth - 1) : tile
  };
}

function createDesignedItem(typeKey, x, z) {
  const type = ROOM_ITEM_TYPES[typeKey];
  const item = { type: typeKey };
  if (type.placement !== 'wall') { item.x = x; item.z = z; }
  if (type.placement === 'floor' && type.angleStep !== 0) item.angle = 0;
  for (const field of type.fields) item[field.key] = field.defaultValue;
  return item;
}

function normalizeDesignedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) return fallback;
  return clampNumber(number, minimum, maximum);
}

// Returns a clean copy of one item, or null if it is not something the catalogue above knows.
function normalizeDesignedItem(source, room) {
  if (!source || !ROOM_ITEM_TYPES[source.type]) return null;
  const type = ROOM_ITEM_TYPES[source.type];
  const item = { type: source.type };
  if (type.placement === 'floor') {
    item.x = normalizeDesignedNumber(source.x, room.width / 2, 0, room.width);
    item.z = normalizeDesignedNumber(source.z, room.depth / 2, 0, room.depth);
    if (type.angleStep !== 0) {
      item.angle = ((Math.round(normalizeDesignedNumber(source.angle, 0, -3600, 3600)) % 360) + 360) % 360;
      if (type.angleStep === 90) item.angle = Math.round(item.angle / 90) % 4 * 90;
    }
  } else if (type.placement === 'tiles') {
    item.x = Math.floor(normalizeDesignedNumber(source.x, 0, 0, room.width - 1));
    item.z = Math.floor(normalizeDesignedNumber(source.z, 0, 0, room.depth - 1));
  }
  for (const field of type.fields) {
    const value = source[field.key];
    if (field.kind === 'number') {
      item[field.key] = normalizeDesignedNumber(value, field.defaultValue, field.minimum, field.maximum);
      if (field.step === 1) item[field.key] = Math.round(item[field.key]);
    } else if (field.kind === 'boolean') {
      item[field.key] = value === undefined ? field.defaultValue : value === true;
    } else if (field.kind === 'choice') {
      const isKnown = field.choices.some(function (choice) { return choice[0] === value; });
      item[field.key] = isKnown ? value : field.defaultValue;
    } else {
      item[field.key] = typeof value === 'string' ? value.slice(0, 60) : field.defaultValue;
    }
  }
  return item;
}

// Returns a clean copy of a room file: everything present, in range, and of the right kind.
// A file written by hand may leave things out; whatever is missing gets its default.
function normalizeDesignedRoom(source, key) {
  source = source && typeof source === 'object' ? source : {};
  const limits = DESIGNED_ROOM_LIMITS;
  const room = {
    key: key,
    name: (typeof source.name === 'string' && source.name.trim() !== '' ? source.name.trim() : key).toUpperCase().slice(0, 24),
    width: Math.round(normalizeDesignedNumber(source.width, 8, limits.minimumSize, limits.maximumSize)),
    depth: Math.round(normalizeDesignedNumber(source.depth, 6, limits.minimumSize, limits.maximumSize)),
    ceiling: normalizeDesignedNumber(source.ceiling, 2.8, limits.minimumCeiling, limits.maximumCeiling),
    // 0: can be reached at once, 1: behind a powered door, 2: behind the keycard. A room may allow several.
    tiers: [],
    isFlooded: source.isFlooded === true,
    // Off: the room exists (the workshop can open it) but no station is ever built with it.
    useInStations: source.useInStations === true,
    doors: [],
    itemSpot: null,
    items: []
  };
  for (const tier of Array.isArray(source.tiers) ? source.tiers : []) {
    if ((tier === 0 || tier === 1 || tier === 2) && room.tiers.indexOf(tier) < 0) room.tiers.push(tier);
  }
  if (room.tiers.length === 0) room.tiers.push(0);
  // Doors: which wall, and how many tiles along it (counted from its west or north end).
  for (const door of Array.isArray(source.doors) ? source.doors : []) {
    const wall = ROOM_WALL_NAMES.indexOf(door && door.wall);
    if (wall < 0) continue;
    const wallLength = wall === WALL_NORTH || wall === WALL_SOUTH ? room.width : room.depth;
    const at = Math.round(normalizeDesignedNumber(door.at, Math.floor(wallLength / 2), 0, wallLength - 1));
    if (!room.doors.some(function (other) { return other.wall === door.wall && other.at === at; })) room.doors.push({ wall: door.wall, at: at });
  }
  if (room.doors.length === 0) room.doors.push({ wall: 'south', at: Math.floor(room.width / 2) });
  // A table top (or anything else at hand height) where the first spool or the keycard may be left.
  if (source.itemSpot && typeof source.itemSpot === 'object') {
    room.itemSpot = {
      x: normalizeDesignedNumber(source.itemSpot.x, room.width / 2, 0, room.width),
      y: normalizeDesignedNumber(source.itemSpot.y, 0.77, 0, 2),
      z: normalizeDesignedNumber(source.itemSpot.z, room.depth / 2, 0, room.depth)
    };
  }
  for (const sourceItem of Array.isArray(source.items) ? source.items : []) {
    const item = normalizeDesignedItem(sourceItem, room);
    if (item) room.items.push(item);
  }
  return room;
}

// A room's doorways in the form ROOM_CATALOGUE uses: the tile just outside the room, and the wall it is on.
function getDesignedRoomSockets(room) {
  return room.doors.map(function (door) {
    if (door.wall === 'north') return [door.at, -1, WALL_NORTH];
    if (door.wall === 'south') return [door.at, room.depth, WALL_SOUTH];
    if (door.wall === 'west') return [-1, door.at, WALL_WEST];
    return [room.width, door.at, WALL_EAST];
  });
}

// Runs `action` with everything it builds turned by quarter turns about one point of the room being built,
// on top of however the room itself is placed. This is how a builder that only knows one direction
// (a shelf rack runs north-south) can be used all four ways.
function withQuarterTurnsAbout(pivotX, pivotZ, quarterTurns, action) {
  if (quarterTurns === 0) { action(); return; }
  const savedTurns = placement.turns, savedOffsetX = placement.offsetX, savedOffsetZ = placement.offsetZ;
  const turnedPivot = rotatePointByTurns(pivotX, pivotZ, quarterTurns);
  const shift = rotatePointByTurns(pivotX - turnedPivot[0], pivotZ - turnedPivot[1], savedTurns);
  placement.turns = (savedTurns + quarterTurns) % 4;
  placement.offsetX = savedOffsetX + shift[0]; placement.offsetZ = savedOffsetZ + shift[1];
  action();
  placement.turns = savedTurns; placement.offsetX = savedOffsetX; placement.offsetZ = savedOffsetZ;
}

// Puts everything in a workshop room into the world. `builtRanges` is only used by the workshop: when given,
// it receives one [first, end] pair per item, saying which entries of worldProps that item turned into.
function furnishDesignedRoom(room, random, roomName, builtRanges) {
  const context = { yaw: 0, random: random, ceiling: room.ceiling, roomName: roomName || room.name, room: room };
  for (const item of room.items) {
    const type = ROOM_ITEM_TYPES[item.type];
    const firstProp = worldProps.length;
    if (type.placement === 'floor' && type.angleStep === 90) {
      context.yaw = 0;
      withQuarterTurnsAbout(item.x, item.z, Math.round((item.angle || 0) / 90) % 4, function () { type.build(item, context); });
    } else {
      context.yaw = (item.angle || 0) * DEGREES_TO_RADIANS;
      type.build(item, context);
    }
    if (builtRanges) builtRanges.push([firstProp, worldProps.length]);
  }
}

// The ROOM_CATALOGUE entry for a workshop room.
function createDesignedRoomDefinition(room) {
  const definition = {
    name: room.name, rect: [0, 0, room.width, room.depth], ceiling: room.ceiling, tiers: room.tiers.slice(),
    carve: carveSimpleRoom(room.width, room.depth, room.ceiling),
    furnish: function (random, roomName) { furnishDesignedRoom(room, random, roomName); },
    sockets: getDesignedRoomSockets(room),
    isFiller: room.useInStations,
    isDesigned: true
  };
  if (room.isFlooded) definition.isFlooded = true;
  if (room.itemSpot) definition.itemSpot = [room.itemSpot.x, room.itemSpot.y, room.itemSpot.z];
  return definition;
}

// The rooms from src/rooms/, cleaned up, by key.
const designedRooms = {};
for (const key in DESIGNED_ROOMS) {
  // A file may not take the place of a room that is written as code.
  if (ROOM_CATALOGUE[key] && !ROOM_CATALOGUE[key].isDesigned) continue;
  designedRooms[key] = normalizeDesignedRoom(DESIGNED_ROOMS[key], key);
  ROOM_CATALOGUE[key] = createDesignedRoomDefinition(designedRooms[key]);
}
