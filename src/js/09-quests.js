// ---------------------------------------------------------------------------
// Quests: everything a descent asks of you between "power" and "lift", the survey spools first among them.
//
// HOW TO ADD A QUEST
// Add one entry to QUESTS below. Nothing else in the game needs to know about it: the entry says what kind
// of quest it is, what it holds up, where its things go, what they look like and every word it uses, and
// this file does the rest (which stations get it, placing, the rules, the objective line, the status chip,
// the marks on the map, the lift terminal's refusal, Dispatch, and the check that it can be finished).
//
// There are three kinds (the spools, which every descent has, are a 'collect' quest like the rest):
//   'collect'   Things lie about the station. Take them all.            (core samples, crew badges)
//   'activate'  Machines stand about the station. Switch every one on.  (small generators, valves, the breaker)
//               A machine may need the mains, may need something brought to it first, and may be loud.
//   'supply'    One machine that is already part of every descent will not work until you bring it
//               something.                                                (fuel for Generator 2)
//
// And a quest holds up one of three moments (`blocks`):
//   'mains'     Generator 2 will not start until it is done.
//   'upload'    The lift terminal will not take the spools until it is done.
//   'lift'      The terminal takes the spools, but the lift does not come until it is done.
//
// THE FIELDS OF AN ENTRY
//   key            its name, used nowhere but in this file, the tests and debug mode
//   kind, blocks   as above
//   pool           which draw decides whether a station has it (see QUEST_POOLS). Leave out for a quest
//                  that decides for itself from `countFromSize`: no things, no quest.
//   always         true: every station has it, Kessel-9 too (the spools)
//   fixedObjectIds things of the quest that the rooms put out themselves, by object number; `count` then
//                  says how many more are put out besides them
//   placeLast      true: its things are put out after every other quest's, so that giving a station more
//                  of them moves nothing else
//   progress       instead of the count the quest keeps: a function returning { done, total }
//   taken          for 'collect': function (instance, object, interactable) run in place of the usual
//                  "take it and count it", for a thing that does more when taken
//   count          how many things: a number, or [fewest, most] to let the seed decide
//   countFromSize  instead of count: the name of a [fewest, most] pair in GENERATED_SIZE_PRESETS (03-levelgen.js)
//   fewest         if fewer than this many find a place, the quest is taken out again
//   tiers          [lowest, highest] ring of rooms its things may stand in: 0 is reachable at once, 1 needs the
//                  mains, 2 and up need keycards; 'beforeLast' is the last ring short of Shaft 9's
//   build          function (objectId, x, z, random, index) that puts one thing there (see 03-layout.js)
//   names          for 'activate': what each machine is called in messages, by index
//   needsPower     for 'activate': true if it will not work until the mains is on
//   requires       for 'activate': { item, chance } - with that chance a machine needs one of QUEST_ITEMS
//                  brought to it first, and one is put near it. For 'supply': { item }.
//   noise          for 'activate': how far switching one on carries, in metres (0 or left out: no further than a pickup)
//   activated      for 'activate': function (instance, object) run as it switches on (its sound, say)
//   countsWith     a number added to both sides of "{done} of {total}" (the generators count Generator 2 too)
//   hideUntilTold  true: the objective and the chip say nothing of it until Dispatch or the terminal has
//   tell           how you come to hear of it: { line, after, seconds, marksOnMap }. `line` is a line of
//                  RADIO_MESSAGES (00-config.js); `after` is something that happens (see fireQuestEvent)
//                  or 'refused' (the first time it holds you up); `marksOnMap` puts its things on the map then.
//   releasedLine   for blocks 'lift': the RADIO_MESSAGES line said when finishing it sends the lift down
//   text           every sentence it uses. {done}, {total} and {name} are filled in. See the entries below
//                  for which sentences each kind uses; one that is left out is simply not said.
//
// Every quest draws its random numbers from a sequence of its own, started from the station's seed and the
// quest's key. So adding a quest, or changing one, never moves anything else in any station.
// (The first four below were written before this file was. They draw their numbers the way they always
// did, which is what `legacy` on them says, so that every seed still builds the station it used to.)
// ---------------------------------------------------------------------------

// Things you carry for a quest. Any one of a kind does for any machine that needs that kind.
// TWEAK: `carryMost` is how many you can hold at once.
const QUEST_ITEMS = {
  fuel: {
    carryMost: 1,
    chip: 'FUEL CAN',
    build: function (objectId, x, z) { addFuelCan(x, z, objectId); },
    taken: 'Fuel can taken.',
    alreadyCarrying: 'You are already carrying a fuel can.',
    used: 'Fuel can emptied into the day tank.',
    line: 'generatorNoFuel'   // Dispatch says this once a descent, the first time something will not run for want of one
  }
};

// The draws that decide which quests a station has. A pool gives a station some of its quests, not all:
// how many is the [fewest, most] pair named `sizeField` in GENERATED_SIZE_PRESETS (03-levelgen.js).
const QUEST_POOLS = {
  jobs: { sizeField: 'extraJobs', legacy: true },
  errands: { sizeField: 'errands' }
};

// TWEAK: a thing that is needed (a fuel can) goes in the nearest other room, unless that is more than this many
// steps' walk (a step is a metre) from the machine it is for: then it goes in the machine's own room.
const QUEST_ITEM_NEAR_STEPS = 30;

const QUESTS = [
  // ---- the survey spools: what every descent is for ----
  // Three of them are part of every station and lie where their rooms put them (`fixedObjectIds`): the first
  // where you can reach it without power, the second in the calibration store, the third at Shaft 9. A bigger
  // station may have more (`countFromSize`), left on crates in ordinary rooms. Taking one does more than
  // count it (`taken`): it is read, and Dispatch may speak.
  {
    key: 'spools', kind: 'collect', blocks: 'upload', always: true, placeLast: true,
    fixedObjectIds: STORY_SPOOL_IDS,
    countFromSize: 'extraSpools', most: MAXIMUM_EXTRA_SPOOLS, firstObjectId: OBJECT_EXTRA_SPOOL_FIRST,
    tiers: [0, 'beforeLast'],
    build: function (objectId, x, z) { addLooseSpool(objectId, x, z); },
    // How many you hold is game.flags.spoolsCollected, as it always was: the Hollow's pacing reads it, and so do the tests.
    progress: function () { return { done: game.flags.spoolsCollected, total: level.spoolCount }; },
    taken: function (instance, object, interactable) { collectSpool(interactable); },
    text: {
      objective: function () { return level.spoolCount === 3 ? OBJECTIVE_TEXT.collectSpools : OBJECTIVE_TEXT.collectSpoolsOfMany; },
      chip: '', // the spools have a place of their own on screen, beside the mains and the keycards
      refused: 'LIFT CONTROL: upload locked. Survey spools loaded: {done} of {total}.'
    }
  },

  // ---- fuel for Generator 2 ----
  {
    key: 'fuel', kind: 'supply', blocks: 'mains', pool: 'jobs', legacy: { reservesASpot: true, placeNumbers: 'machines', placeRank: 1 },
    requires: { item: 'fuel', objectId: OBJECT_FUEL_CAN },
    target: function () { return GENERATOR_POSITION; },
    text: {
      refused: 'GENERATOR 2: day tank empty. It will not start without fuel.',
      objective: OBJECTIVE_TEXT.findFuel,        // once you know the tank is empty
      carrying: OBJECTIVE_TEXT.bringFuel         // once you have a can
    }
  },

  // ---- core samples ----
  {
    key: 'cores', kind: 'collect', blocks: 'upload', pool: 'jobs', legacy: { placeNumbers: 'station', placeRank: 2 },
    count: [2, 4], fewest: 2, most: MAXIMUM_CORE_SAMPLES, firstObjectId: OBJECT_CORE_FIRST,
    tiers: [0, 'beforeLast'],
    build: function (objectId, x, z, random) { addCoreSample(objectId, x, z, random() * 3); },
    tell: { line: 'coresWanted', after: 'firstSpool', seconds: 12 },
    text: {
      objective: 'Dispatch also wants the core samples.',
      objectiveAlone: 'Dispatch still wants the core samples.',
      chip: 'CORES {done}/{total}',
      taken: 'Core sample {done} of {total}.',
      refused: 'LIFT CONTROL: manifest incomplete. Core samples loaded: {done} of {total}.'
    }
  },

  // ---- more generators: Generator 1, 3 and 4 ----
  {
    key: 'generators', kind: 'activate', blocks: 'upload', legacy: { planNumbers: [0x9e3779b1, 0x6e3a7011], placeNumbers: 'machines', placeRank: 4 },
    countFromSize: 'extraGenerators', most: MAXIMUM_EXTRA_GENERATORS, firstObjectId: OBJECT_EXTRA_GENERATOR_FIRST,
    tiers: [0, 'beforeLast'],
    names: EXTRA_GENERATOR_NUMBERS.map(function (number) { return 'Generator ' + number; }),
    build: function (objectId, x, z, random, index) { addExtraGenerator(objectId, EXTRA_GENERATOR_NUMBERS[index], x, z); },
    needsPower: true,
    requires: { item: 'fuel', chance: 0.5, firstObjectId: OBJECT_EXTRA_FUEL_CAN_FIRST }, // TWEAK: 0.5 = half of them have an empty tank
    noise: function () { return TUNING.noiseRadiusGeneratorStart; },
    activated: function (instance, object) { startExtraGeneratorSound(object.index, object.x, object.z); },
    reset: function () { stopExtraGeneratorSounds(); },
    countsWith: 1, // Generator 2 is counted with them: "2 of 3"
    hideUntilTold: true,
    tell: { line: 'generatorsWanted', after: 'mainsOn', seconds: 19, secondsWithoutHollow: 11, marksOnMap: true },
    text: {
      objective: OBJECTIVE_TEXT.startGenerators.replace('{running}', '{done}'),
      carrying: OBJECTIVE_TEXT.fuelForGenerator,
      chip: 'GENERATORS {done}/{total}',
      noPower: '{NAME}: no control power. It needs the mains. Start Generator 2 first.',
      noItem: '{NAME}: day tank empty. There is a fuel can not far from it.',
      activated: '{name} running. Generators running: {done} of {total}.',
      activatedLast: '{name} running. That is all of them: the winch has its power.',
      refused: 'LIFT CONTROL: winch supply low. Generators running: {done} of {total}. All must run.'
    }
  },

  // ---- crew badges (new with this file: written as nothing but this entry) ----
  {
    key: 'badges', kind: 'collect', blocks: 'upload', pool: 'errands',
    count: [2, 3], fewest: 2,
    tiers: [0, 'beforeLast'],
    build: function (objectId, x, z, random) { addCrewBadge(objectId, x, z, random() * TWO_PI); },
    tell: { line: 'badgesWanted', after: 'firstSpool', seconds: 24 },
    text: {
      objective: 'Personnel also wants the badges of Crew 2.',
      objectiveAlone: 'Personnel still wants the badges of Crew 2.',
      chip: 'BADGES {done}/{total}',
      taken: 'Crew badge {done} of {total}.',
      refused: 'LIFT CONTROL: manifest incomplete. Crew badges loaded: {done} of {total}.'
    }
  },

  // ---- isolation valves (new with this file) ----
  {
    key: 'valves', kind: 'activate', blocks: 'upload', pool: 'errands',
    count: [2, 3], fewest: 2,
    tiers: [1, 'beforeLast'],
    names: ['Isolation valve A', 'Isolation valve B', 'Isolation valve C'],
    build: function (objectId, x, z, random, index) { addIsolationValve(objectId, 'ABC'.charAt(index), x, z); },
    needsPower: true,
    noise: function () { return TUNING.noiseRadiusValve; },
    activated: function (instance, object) { playValveSound(object.x, object.z); },
    hideUntilTold: true,
    tell: { line: 'valvesWanted', after: 'keycard', seconds: 8, marksOnMap: true },
    text: {
      objective: 'The isolation valves have to be shut before the lift will come: {done} of {total} so far. They are marked on the map.',
      chip: 'VALVES {done}/{total}',
      noPower: '{NAME}: actuator dead. It needs the mains.',
      activated: '{name} shut. Valves shut: {done} of {total}.',
      activatedLast: '{name} shut. That is all of them.',
      refused: 'LIFT CONTROL: line pressure high. Isolation valves shut: {done} of {total}. All must be shut.'
    }
  },

  // ---- the winch breaker ----
  {
    key: 'breaker', kind: 'activate', blocks: 'lift', pool: 'jobs', legacy: { placeNumbers: 'station', placeRank: 3 },
    count: 1, firstObjectId: OBJECT_WINCH_BREAKER,
    tiers: [1, 1],
    names: ['Winch breaker'],
    build: function (objectId, x, z) { addWinchBreaker(x, z); },
    needsPower: true,
    noise: function () { return TUNING.noiseRadiusDoor * 1.5; }, noiseAtPlayer: true,
    activated: function () { playDeniedSound(); }, // the same heavy clunk
    tell: { line: 'winchBreakerOpen', after: 'refused', seconds: 0, marksOnMap: true },
    releasedLine: 'breakerClosed',
    text: {
      objective: OBJECTIVE_TEXT.closeBreaker,
      chipWhileHolding: 'BREAKER OPEN',
      noPower: 'WINCH BREAKER: no mains power. It will not hold.',
      activated: 'Winch breaker closed.',
      activatedReleases: 'Winch breaker closed. The lift is coming.',
      holding: 'LIFT CONTROL: upload received. Car not responding: winch breaker open.'
    }
  }
];

// Object numbers for quests that do not name their own: each quest gets twenty, ten for its things and ten
// for the items that go with them.
const QUEST_OBJECT_ID_BASE = 100;
const QUEST_MOST_THINGS = 10;

function findQuestDefinition(key) {
  for (const definition of QUESTS) if (definition.key === key) return definition;
  return null;
}

function getQuestObjectId(definition, index, isItem) {
  if (isItem) {
    if (definition.requires.objectId) return definition.requires.objectId;
    if (definition.requires.firstObjectId) return definition.requires.firstObjectId + index;
    return QUEST_OBJECT_ID_BASE + QUESTS.indexOf(definition) * 20 + QUEST_MOST_THINGS + index;
  }
  if (definition.firstObjectId) return definition.firstObjectId + index;
  return QUEST_OBJECT_ID_BASE + QUESTS.indexOf(definition) * 20 + index;
}

// A sequence of random numbers that belongs to one quest (or pool) in one station.
function createQuestRandom(seed, name) {
  let hash = 2166136261;
  for (let index = 0; index < name.length; index++) hash = Math.imul(hash ^ name.charCodeAt(index), 16777619);
  return createSeededRandomGenerator((Math.imul(seed + 1, 0x9e3779b1) ^ hash) >>> 0);
}

// ---------------------------------------------------------------------------
// Which quests a station has (decided while it is planned)
// ---------------------------------------------------------------------------

// How many things a quest has in this station, and which of them need an item brought first.
function planOneQuest(definition, size, random) {
  let count = 1;
  const range = definition.countFromSize ? (size[definition.countFromSize] || [0, 0]) : definition.count;
  if (Array.isArray(range)) count = range[0] + Math.floor(random() * (range[1] - range[0] + 1));
  else if (typeof range === 'number') count = range;
  count = Math.min(count, definition.most || QUEST_MOST_THINGS);
  const needsItem = [];
  for (let index = 0; index < count; index++) {
    needsItem.push(definition.kind === 'activate' && definition.requires ? random() < definition.requires.chance : false);
  }
  return { count: count, needsItem: needsItem };
}

// Returns { questKey: { count, needsItem } } for the quests this station is to have.
// `stationRandom` is the station's own sequence, which the quests written first still draw from.
function planQuests(seed, size, stationRandom) {
  const planned = {};
  for (const poolKey in QUEST_POOLS) {
    const pool = QUEST_POOLS[poolKey];
    const members = QUESTS.filter(function (definition) { return definition.pool === poolKey; });
    if (members.length === 0) continue;
    const random = pool.legacy ? stationRandom : createQuestRandom(seed, 'pool ' + poolKey);
    const range = size[pool.sizeField] || [0, 0];
    const wanted = Math.min(members.length, range[0] + Math.floor(random() * (range[1] - range[0] + 1)));
    const chosen = members.map(function (definition) { return [random(), definition]; }).sort(function (a, b) { return a[0] - b[0]; })
      .slice(0, wanted).map(function (pair) { return pair[1]; });
    for (const definition of members) if (chosen.indexOf(definition) >= 0) planned[definition.key] = planOneQuest(definition, size, random);
  }
  for (const definition of QUESTS) {
    if (definition.pool) continue;
    const numbers = definition.legacy && definition.legacy.planNumbers;
    const random = numbers ? createSeededRandomGenerator((Math.imul(seed + 1, numbers[0]) ^ numbers[1]) >>> 0) : createQuestRandom(seed, 'plan ' + definition.key);
    const one = planOneQuest(definition, size, random);
    if (one.count > 0 || definition.always) planned[definition.key] = one;
  }
  return planned;
}

// ---------------------------------------------------------------------------
// Putting a station's quests into it (done once it is built)
// ---------------------------------------------------------------------------

// The quests of the station that is loaded. Each: { key, definition, total, done, isKnown, wasSaid, objects }.
// An object of a quest: { objectId, index, name, x, z, needsItem, itemObjectId, isSupplied, isDone }.
const questLookup = {}; // by object number: { instance, object, isItem }

function clearQuests() {
  level.quests.length = 0;
  for (const objectId in questLookup) delete questLookup[objectId];
}

function createQuestInstance(definition) {
  return { key: definition.key, definition: definition, total: 0, done: 0, isKnown: false, wasSaid: false, objects: [] };
}

function findQuest(key) {
  for (const instance of level.quests) if (instance.key === key) return instance;
  return null;
}

// A quest with the things its rooms have already put out (`fixedObjectIds`), and no others yet.
function createQuestInstanceWithFixedThings(definition) {
  const instance = createQuestInstance(definition);
  for (const objectId of definition.fixedObjectIds || []) {
    const interactable = findInteractableByObjectId(objectId);
    if (!interactable) continue;
    instance.objects.push({ objectId: objectId, index: instance.objects.length, name: '', x: interactable.x, z: interactable.z,
      needsItem: false, itemObjectId: 0, isSupplied: false, isDone: false, isFixed: true });
  }
  instance.total = instance.objects.length;
  return instance;
}

// Makes the list of a station's quests findable by object number, and notes how many spools there are.
function registerQuests() {
  for (const instance of level.quests) {
    for (const object of instance.objects) {
      if (object.objectId > 0) questLookup[object.objectId] = { instance: instance, object: object, isItem: false };
      if (object.itemObjectId > 0) questLookup[object.itemObjectId] = { instance: instance, object: object, isItem: true };
    }
  }
  const spools = findQuest('spools');
  level.spoolCount = spools ? spools.total : 0;
}

// The quests every station has, with nothing but what its rooms put out. This is all of Kessel-9's quests;
// a generated station goes through placeQuests instead, which may add to them.
function addAlwaysQuests() {
  clearQuests();
  for (const definition of QUESTS) if (definition.always) level.quests.push(createQuestInstanceWithFixedThings(definition));
  registerQuests();
}

function placeQuests(plan, stationRandom) {
  clearQuests();
  const takenSpots = [];
  const lastRing = plan.finalTier - 1;
  const resolveTier = function (tier) { return tier === 'beforeLast' ? lastRing : (tier === 'last' ? plan.finalTier : tier); };
  const ordinaryRooms = plan.rooms.filter(function (room) {
    return !room.isCorridor && ['liftLobby', 'generatorRoom', 'calibrationStore', 'shaftChamber', 'stairwell'].indexOf(room.key) < 0;
  });
  const shuffledRooms = function (lowestTier, highestTier, random) {
    return ordinaryRooms.filter(function (room) { return room.tier >= lowestTier && room.tier <= highestTier; })
      .map(function (room) { return [random(), room]; }).sort(function (a, b) { return a[0] - b[0]; }).map(function (pair) { return pair[1]; });
  };
  const placeInRoom = function (room, random, place) {
    const spot = findDropSpot(room, random, takenSpots);
    if (!spot) return null;
    takenSpots.push(spot);
    clearPlacement();
    placement.offsetY = room.floorY;
    place(spot[0], spot[1]);
    clearPlacement();
    return spot;
  };
  // The rooms of ring `highestTier` and below other than `ownRoom`, each with how many steps it is from (x, z)
  // to the nearest floor of that room, nearest first.
  const field = borrowTileField('questRooms');
  const roomsNearestFirst = function (x, z, highestTier, ownRoom) {
    computeDistanceField(field, findNearestWalkableTileIndex(x, z), 0, null);
    return ordinaryRooms.filter(function (room) { return room !== ownRoom && room.tier <= highestTier; }).map(function (room) {
      let steps = NAVIGATION_UNREACHABLE;
      for (let tileZ = room.startZ; tileZ < room.endZ; tileZ++) {
        for (let tileX = room.startX; tileX < room.endX; tileX++) {
          const index = tileIndexAt(tileX, tileZ);
          if (tileZone[index] === room.zone && field[index] < steps) steps = field[index];
        }
      }
      return [steps, room];
    }).filter(function (pair) { return pair[0] < NAVIGATION_UNREACHABLE; }).sort(function (a, b) { return a[0] - b[0] || a[1].zone - b[1].zone; });
  };
  // An item goes in the nearest other room that has a free spot; if that is too far, in the machine's own room.
  const placeItemNear = function (itemKey, objectId, x, z, highestTier, ownRoom, random) {
    const place = function (itemX, itemZ) { QUEST_ITEMS[itemKey].build(objectId, itemX, itemZ); };
    const others = roomsNearestFirst(x, z, highestTier, ownRoom);
    for (const pair of others) if (pair[0] <= QUEST_ITEM_NEAR_STEPS && placeInRoom(pair[1], random, place)) return true;
    if (ownRoom !== null && placeInRoom(ownRoom, random, place)) return true;
    for (const pair of others) if (pair[0] > QUEST_ITEM_NEAR_STEPS && placeInRoom(pair[1], random, place)) return true;
    return false;
  };
  // The sequences of random numbers. The quests written first share two: the station's own, and one for the
  // machines and their fuel. Every other quest has one to itself.
  const sharedMachines = createSeededRandomGenerator((Math.imul(plan.seed + 1, 0x85ebca6b) ^ 0x2f6b3d01) >>> 0);
  const randomFor = function (definition) {
    const name = definition.legacy && definition.legacy.placeNumbers;
    if (name === 'station') return stationRandom;
    if (name === 'machines') return sharedMachines;
    return createQuestRandom(plan.seed, 'place ' + definition.key);
  };

  // The order things are put out in. The quests written first keep the order they were written in, because
  // where each one's things end up depends on what was put out before it; the rest follow in the order of QUESTS.
  const planned = QUESTS.filter(function (definition) { return plan.quests[definition.key] !== undefined; });
  const rankOf = function (definition) {
    if (definition.legacy && definition.legacy.placeRank) return definition.legacy.placeRank;
    return (definition.placeLast ? 1000 : 100) + QUESTS.indexOf(definition);
  };
  const usesStation = function (definition) { return Boolean(definition.legacy && definition.legacy.placeNumbers === 'station'); };
  const inOrder = planned.slice().sort(function (a, b) { return rankOf(a) - rankOf(b); });

  // First: the fuel can for Generator 2 used to be put in any room you can reach without power. The old
  // choice is still made, and its place kept free, only so that the station's own numbers are drawn as they
  // always were and the core samples and the breaker stay where they were for every seed.
  for (const definition of inOrder) {
    if (!(definition.legacy && definition.legacy.reservesASpot)) continue;
    for (const room of shuffledRooms(0, 0, stationRandom)) {
      const oldSpot = findDropSpot(room, stationRandom, takenSpots);
      if (oldSpot) { takenSpots.push(oldSpot); break; }
    }
  }

  const placed = {};
  const placeOne = function (definition) {
    const wanted = plan.quests[definition.key], random = randomFor(definition), instance = createQuestInstanceWithFixedThings(definition);
    const fixedCount = instance.objects.length;
    if (definition.kind === 'supply') {
      // One thing to bring, to a machine that is already there. It must be in reach before the mains is on.
      const target = definition.target(), objectId = getQuestObjectId(definition, 0, true);
      if (!placeItemNear(definition.requires.item, objectId, target.x, target.z, 0, null, random)) return;
      instance.total = 1;
      instance.objects.push({ objectId: 0, index: 0, name: '', x: target.x, z: target.z, needsItem: true, itemObjectId: objectId, isSupplied: false, isDone: false });
    } else {
      const lowest = resolveTier(definition.tiers[0]), highest = resolveTier(definition.tiers[1]);
      const rooms = shuffledRooms(lowest, highest, random);
      for (let placedSoFar = 0; placedSoFar < wanted.count; placedSoFar++) {
        const index = fixedCount + placedSoFar; // its place among all the quest's things, the fixed ones first
        const objectId = getQuestObjectId(definition, placedSoFar, false);
        let spot = null, host = null;
        for (const room of rooms) {
          spot = placeInRoom(room, random, function (x, z) { definition.build(objectId, x, z, random, placedSoFar); });
          if (spot) { host = room; break; }
        }
        if (!spot) break; // no room left with a free spot: the station has fewer of them
        rooms.splice(rooms.indexOf(host), 1); // one to a room
        const object = { objectId: objectId, index: index, name: definition.names ? definition.names[placedSoFar] : '', x: spot[0], z: spot[1],
          needsItem: false, itemObjectId: 0, isSupplied: false, isDone: false };
        // What it needs may be behind any door the machine itself is behind, but no door beyond that.
        if (wanted.needsItem[placedSoFar]) {
          const itemObjectId = getQuestObjectId(definition, placedSoFar, true);
          if (placeItemNear(definition.requires.item, itemObjectId, spot[0], spot[1], host.tier, host, random)) { object.needsItem = true; object.itemObjectId = itemObjectId; }
        }
        instance.objects.push(object);
      }
      instance.total = instance.objects.length;
      if (instance.total < (definition.fewest || 1) && !definition.always) {
        // Too few of them found a place to make a quest of it. Take them back out.
        for (const object of instance.objects) {
          for (const objectId of [object.objectId, object.itemObjectId]) {
            const index = interactables.findIndex(function (interactable) { return objectId > 0 && interactable.objectId === objectId; });
            if (index < 0) continue;
            for (const prop of interactables[index].props) prop.isRemoved = true;
            interactables.splice(index, 1);
          }
        }
        return;
      }
    }
    placed[definition.key] = instance;
  };
  for (const definition of inOrder) if (usesStation(definition)) placeOne(definition);
  for (const definition of inOrder) if (!usesStation(definition)) placeOne(definition);

  // The station's quests, in the order of QUESTS: the order the objective and the terminal speak of them in.
  for (const definition of QUESTS) if (placed[definition.key]) level.quests.push(placed[definition.key]);
  registerQuests();
  // Crates, cabinets and machines stand on the floor: work out again where things can walk.
  computeNavigationGrid();
}

// ---------------------------------------------------------------------------
// Checking that a station's quests can be done. Called by auditLevelProgression (03-levelgen.js), which hands
// over its two tools: reach(isShut) works out what can be walked to with the doors that isShut picks kept
// shut, and canReach(objectId) asks about one thing after that. Every object number that must exist exactly
// once is added to mustExistOnce.
// ---------------------------------------------------------------------------
function auditQuests(problems, reach, canReach, mustExistOnce) {
  const noPower = function (door) { return door.kind === DOOR_KIND_POWERED || door.kind === DOOR_KIND_KEYCARD; };
  for (const instance of level.quests) {
    const definition = instance.definition;
    if (instance.total < (definition.fewest || 1)) problems.push('the quest "' + instance.key + '" has only ' + instance.total + ' of its things');
    if (definition.kind === 'supply') {
      reach(noPower);
      for (const object of instance.objects) {
        mustExistOnce.push(object.itemObjectId);
        if (!canReach(object.itemObjectId)) problems.push('what the quest "' + instance.key + '" needs cannot be reached without power');
      }
      continue;
    }
    // Its things stand no deeper than the ring it names, so no more keycards than that ring takes may be needed.
    const highest = definition.tiers[1] === 'beforeLast' ? level.keycardCount : (definition.tiers[1] === 'last' ? level.keycardCount + 1 : definition.tiers[1]);
    const mostCards = Math.max(0, highest - 1);
    for (const object of instance.objects) {
      if (object.isFixed) continue; // put out by its room, and checked with the rooms (auditLevelProgression)
      const what = (object.name || 'thing ' + (object.index + 1)) + ' of the quest "' + instance.key + '"';
      mustExistOnce.push(object.objectId);
      if (object.needsItem) mustExistOnce.push(object.itemObjectId);
      let cardsNeeded = -1;
      for (let held = 0; held <= level.keycardCount && cardsNeeded < 0; held++) {
        reach(function (door) { return door.kind === DOOR_KIND_KEYCARD && door.cardLevel > held; });
        if (!canReach(object.objectId)) continue;
        cardsNeeded = held;
        if (object.needsItem && !canReach(object.itemObjectId)) problems.push('what ' + what + ' needs is behind a door it is not behind itself');
      }
      if (cardsNeeded < 0) problems.push(what + ' cannot be reached at all');
      else if (cardsNeeded > mostCards) problems.push(what + ' is behind a door of keycard ' + cardsNeeded + ', deeper than its quest allows');
    }
  }
}

// ---------------------------------------------------------------------------
// The rules, while you play
// ---------------------------------------------------------------------------

function getQuestProgress(instance) {
  if (instance.definition.progress) return instance.definition.progress();
  return { done: instance.done, total: instance.total };
}

function isQuestDone(instance) {
  const progress = getQuestProgress(instance);
  return progress.done >= progress.total;
}

// The quests that hold up a moment ('mains', 'upload' or 'lift') and are not done, in the order of QUESTS.
function getUnfinishedQuests(moment) {
  return level.quests.filter(function (instance) { return instance.definition.blocks === moment && !isQuestDone(instance); });
}

function isQuestUnfinished(key) {
  const instance = findQuest(key);
  return instance !== null && !isQuestDone(instance);
}

function getCarriedCount(itemKey) {
  return game.carried[itemKey] || 0;
}

// A sentence of a quest with its numbers and names filled in. '' if the quest has no such sentence.
function fillQuestText(instance, textKey, object) {
  let text = instance.definition.text[textKey];
  if (typeof text === 'function') text = text(instance, object);
  if (!text) return '';
  const progress = getQuestProgress(instance), extra = instance.definition.countsWith || 0;
  const name = object && object.name ? object.name : '';
  return text.replace('{done}', String(progress.done + extra)).replace('{total}', String(progress.total + extra))
    .replace('{NAME}', name.toUpperCase()).replace('{name}', name);
}

// You come to know of a quest: its things go on the map if it says so, and the objective may speak of it.
function makeQuestKnown(instance) {
  if (instance.isKnown) return;
  instance.isKnown = true;
  const tell = instance.definition.tell;
  if (tell && tell.marksOnMap) {
    for (const object of instance.objects) {
      const interactable = object.objectId > 0 ? findInteractableByObjectId(object.objectId) : null;
      if (interactable) interactable.isDiscovered = true;
    }
  }
  refreshObjective();
}

// Dispatch says a quest's line, once, and not at all if the quest is already done.
function sayQuestLine(instance) {
  const tell = instance.definition.tell;
  makeQuestKnown(instance);
  if (!tell || !tell.line || instance.wasSaid || isQuestDone(instance)) return;
  instance.wasSaid = true;
  playRadioLine(tell.line);
}

// Something has happened that quests may be waiting for before Dispatch speaks of them: 'firstSpool',
// 'secondSpool', 'allSpools', 'mainsOn', 'keycard', 'leftLift', 'stillsWake'.
function fireQuestEvent(eventName) {
  for (const instance of level.quests) {
    const tell = instance.definition.tell;
    if (!tell || tell.after !== eventName) continue;
    const seconds = !game.difficulty.hollowEnabled && tell.secondsWithoutHollow !== undefined ? tell.secondsWithoutHollow : tell.seconds;
    scheduleEvent(seconds, function () { sayQuestLine(instance); });
  }
}

// A quest has just held you up. You know of it now; if that is how it is told, Dispatch says so.
function noteQuestRefusal(instance) {
  const tell = instance.definition.tell;
  const isFirstTime = !instance.isKnown;
  makeQuestKnown(instance);
  if (isFirstTime && tell && tell.after === 'refused') {
    if (tell.seconds > 0) scheduleEvent(tell.seconds, function () { sayQuestLine(instance); });
    else sayQuestLine(instance);
  }
}

// Something would not run for want of an item. The first time in a descent, Dispatch has a line for that.
function noteItemWanted(itemKey) {
  const item = QUEST_ITEMS[itemKey];
  if (!item.line || game.itemLinesSaid[itemKey]) return;
  game.itemLinesSaid[itemKey] = true;
  scheduleEvent(1.5, function () { playRadioLine(item.line); });
}

function resetQuests() {
  game.carried = {};
  game.itemLinesSaid = {};
  for (const instance of level.quests) {
    instance.done = 0; instance.isKnown = false; instance.wasSaid = false;
    for (const object of instance.objects) { object.isDone = false; object.isSupplied = false; }
  }
  for (const definition of QUESTS) if (definition.reset) definition.reset();
}

// Taking an item, or being told you have your hands full.
function takeQuestItem(interactable, itemKey) {
  const item = QUEST_ITEMS[itemKey];
  if (getCarriedCount(itemKey) >= item.carryMost) { showMessage(item.alreadyCarrying, 3, 'info'); return; }
  removeInteractableFromWorld(interactable);
  game.carried[itemKey] = getCarriedCount(itemKey) + 1;
  playPickupSound();
  emitNoise(player.x, player.z, TUNING.noiseRadiusPickup);
  saveCheckpoint();
  showMessage(item.taken, 3, 'info');
  refreshObjective();
}

// Uses a thing that belongs to a quest. Returns false if this object belongs to none.
function useQuestObject(interactable) {
  const entry = questLookup[interactable.objectId];
  if (!entry) return false;
  const instance = entry.instance, definition = instance.definition, object = entry.object, flags = game.flags;
  if (entry.isItem) { takeQuestItem(interactable, definition.requires.item); return true; }

  if (definition.kind === 'collect' && definition.taken) {
    object.isDone = true;
    definition.taken(instance, object, interactable);
    return true;
  }
  if (definition.kind === 'collect') {
    removeInteractableFromWorld(interactable);
    object.isDone = true;
    instance.done++;
    playPickupSound();
    emitNoise(player.x, player.z, TUNING.noiseRadiusPickup);
    saveCheckpoint();
    showMessage(fillQuestText(instance, 'taken', object), 3, 'info');
    refreshObjective();
    return true;
  }

  // 'activate': a machine to switch on.
  if (object.isDone) return true;
  if (definition.needsPower && !flags.powerOn) {
    playDeniedSound();
    showMessage(fillQuestText(instance, 'noPower', object), 5, 'warning');
    return true;
  }
  if (object.needsItem && !object.isSupplied) {
    const itemKey = definition.requires.item;
    if (getCarriedCount(itemKey) < 1) {
      playDeniedSound();
      showMessage(fillQuestText(instance, 'noItem', object), 5, 'warning');
      noteItemWanted(itemKey);
      return true;
    }
    game.carried[itemKey]--;
    object.isSupplied = true;
    showMessage(QUEST_ITEMS[itemKey].used, 3, 'info');
  }
  object.isDone = true;
  interactable.isAvailable = false;
  instance.done++;
  if (definition.activated) definition.activated(instance, object);
  const noiseRadius = definition.noise ? definition.noise() : TUNING.noiseRadiusPickup;
  if (definition.noiseAtPlayer) emitNoise(player.x, player.z, noiseRadius);
  else emitNoise(object.x, object.z, noiseRadius);
  saveCheckpoint();
  // If the upload is already in and this was the last thing holding the lift, the car starts down at once.
  if (definition.blocks === 'lift' && flags.spoolsUploaded && !flags.uploadStarted && getUnfinishedQuests('lift').length === 0) {
    showMessage(fillQuestText(instance, 'activatedReleases', object) || fillQuestText(instance, 'activated', object), 4, 'info');
    startLiftCall(definition.releasedLine || 'uploadStarted');
    return true;
  }
  refreshObjective();
  showMessage((isQuestDone(instance) && fillQuestText(instance, 'activatedLast', object)) || fillQuestText(instance, 'activated', object), 4, 'info');
  return true;
}

// Generator 2 is about to be started. Returns whether every quest that holds up the mains lets it: one that
// wants something brought takes it from you if you carry it, and says so if you do not.
function doQuestsAllowTheMains() {
  for (const instance of getUnfinishedQuests('mains')) {
    const itemKey = instance.definition.requires.item;
    if (getCarriedCount(itemKey) < 1) {
      playDeniedSound();
      showMessage(fillQuestText(instance, 'refused'), 5, 'warning');
      if (!instance.isKnown) noteItemWanted(itemKey);
      makeQuestKnown(instance);
      refreshObjective();
      return false;
    }
    game.carried[itemKey]--;
    for (const object of instance.objects) { object.isSupplied = true; object.isDone = true; }
    instance.done = instance.total;
    showMessage(QUEST_ITEMS[itemKey].used, 3, 'info');
  }
  return true;
}

// The lift terminal, with the mains on. Returns true if a quest has dealt with the press (by refusing the
// upload, or by taking it and holding the lift), false if nothing stands in the way of calling the lift.
function doQuestsHoldTheTerminal() {
  const flags = game.flags;
  const refusing = getUnfinishedQuests('upload');
  if (refusing.length > 0) {
    playDeniedSound();
    showMessage(fillQuestText(refusing[0], 'refused'), 5, 'warning');
    noteQuestRefusal(refusing[0]);
    return true;
  }
  const holding = getUnfinishedQuests('lift');
  if (holding.length > 0 && !flags.uploadStarted) {
    // The upload goes through, but the car will not move until what holds it is dealt with.
    if (!flags.spoolsUploaded) {
      flags.spoolsUploaded = true;
      playPickupSound();
      saveCheckpoint();
      for (const instance of holding) noteQuestRefusal(instance);
      refreshObjective();
    }
    showMessage(fillQuestText(holding[0], 'holding'), 5, 'warning');
    return true;
  }
  return false;
}

// What the objective says while the mains is off, if a quest has anything to say about that: '' otherwise.
function getMainsQuestObjective() {
  for (const instance of getUnfinishedQuests('mains')) {
    if (getCarriedCount(instance.definition.requires.item) > 0) return fillQuestText(instance, 'carrying');
    if (instance.isKnown) return fillQuestText(instance, 'objective');
  }
  return '';
}

// The sentences of the objective with the mains on: one for each quest that still holds up the upload.
function getUploadQuestObjectives() {
  const parts = [];
  for (const instance of getUnfinishedQuests('upload')) {
    const definition = instance.definition;
    if (definition.hideUntilTold && !instance.isKnown) continue;
    parts.push(parts.length === 0 && definition.text.objectiveAlone ? fillQuestText(instance, 'objectiveAlone') : fillQuestText(instance, 'objective'));
    if (definition.requires && getCarriedCount(definition.requires.item) > 0 && definition.text.carrying) parts.push(fillQuestText(instance, 'carrying'));
  }
  return parts;
}

// What the status line on screen lists for the quests: what you carry, then each quest's count.
function getQuestChips() {
  const parts = [];
  for (const itemKey in QUEST_ITEMS) if (getCarriedCount(itemKey) > 0) parts.push(QUEST_ITEMS[itemKey].chip);
  for (const instance of level.quests) {
    const definition = instance.definition;
    if (definition.text.chip && !(definition.hideUntilTold && !instance.isKnown)) parts.push(fillQuestText(instance, 'chip'));
    if (definition.text.chipWhileHolding && game.flags.spoolsUploaded && !isQuestDone(instance)) parts.push(definition.text.chipWhileHolding);
  }
  return parts;
}

// Whether a machine somewhere could take one of these items right now.
function isQuestItemWantedNow(itemKey) {
  for (const instance of level.quests) {
    const definition = instance.definition;
    if (!definition.requires || definition.requires.item !== itemKey) continue;
    if (definition.kind === 'supply') { if (!game.flags.powerOn && !isQuestDone(instance)) return true; continue; }
    if (definition.needsPower && !game.flags.powerOn) continue;
    for (const object of instance.objects) if (object.needsItem && !object.isSupplied && !object.isDone) return true;
  }
  return false;
}

// For the map: whether a quest's thing can be acted on right now. Returns undefined for a thing of no quest.
function isQuestObjectWantedNow(objectId) {
  const entry = questLookup[objectId];
  if (!entry) return undefined;
  const definition = entry.instance.definition, object = entry.object;
  if (entry.isItem) {
    const itemKey = definition.requires.item;
    return getCarriedCount(itemKey) < QUEST_ITEMS[itemKey].carryMost && isQuestItemWantedNow(itemKey);
  }
  if (definition.kind === 'collect') return true;
  if (definition.needsPower && !game.flags.powerOn) return false;
  return !object.needsItem || object.isSupplied || getCarriedCount(definition.requires.item) > 0;
}

// ---------------------------------------------------------------------------
// The old names. Before this file there were four jobs, each with fields of its own on level.mission and on
// game.flags. The tests and debug mode still read those names, so they are kept, as read-only views of the
// quests: nothing in the game itself uses them.
// ---------------------------------------------------------------------------
Object.defineProperty(level, 'mission', {
  enumerable: true,
  get: function () {
    const cores = findQuest('cores'), generators = findQuest('generators');
    return {
      needsFuel: findQuest('fuel') !== null,
      coreCount: cores ? cores.total : 0,
      needsBreaker: findQuest('breaker') !== null,
      extraGenerators: generators ? generators.objects.map(function (object) {
        return { objectId: object.objectId, number: EXTRA_GENERATOR_NUMBERS[object.index], needsFuel: object.needsItem, fuelCanId: object.itemObjectId,
          x: object.x, z: object.z, isRunning: object.isDone, isFilled: object.isSupplied };
      }) : [],
      // Every quest of the station, in the same plain form: for whatever wants to list them.
      quests: level.quests.map(function (instance) { const progress = getQuestProgress(instance); return { key: instance.key, total: progress.total, done: progress.done }; })
    };
  }
});

function defineOldQuestFlagNames(flags) {
  const doneOf = function (key) { const instance = findQuest(key); return instance ? instance.done : 0; };
  const knownOf = function (key) { const instance = findQuest(key); return instance !== null && instance.isKnown; };
  Object.defineProperties(flags, {
    hasFuel: { enumerable: true, get: function () { return getCarriedCount('fuel') > 0; } },
    knowsAboutFuel: { enumerable: true, get: function () { return knownOf('fuel'); } },
    coresCollected: { enumerable: true, get: function () { return doneOf('cores'); } },
    breakerClosed: { enumerable: true, get: function () { const instance = findQuest('breaker'); return instance !== null && isQuestDone(instance); } },
    extraGeneratorsRunning: { enumerable: true, get: function () { return doneOf('generators'); } },
    knowsAboutGenerators: { enumerable: true, get: function () { return knownOf('generators'); } }
  });
}
