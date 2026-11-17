// ---------------------------------------------------------------------------
// Loose objects made in the workshop (`npm run dev`, then "Workshop" on the title screen, then "Objects").
//
// Such an object is not written as code. It is one file in src/objects/, packed into the page by build.js,
// and holds what an entry of LOOSE_OBJECT_KINDS (08-loose-objects.js) holds: what it is called, what it
// weighs, what it is worth and how badly a knock costs it, what it sounds like, and its shape as boxes, balls and capsules. This file turns
// each of them into an ordinary kind of loose object, and puts it among a station's litter or its valuables
// if the file asks for that.
//
// What a file cannot give an object is something to do (`use`): that is code, and stays in 08-loose-objects.js.
//
// In an object file, as in LOOSE_OBJECT_KINDS, a part's numbers are metres as the object hangs in the beam:
// x to your right, y up, z towards you.
// ---------------------------------------------------------------------------

// TWEAK: how many parts a workshop object may have, how far from its own origin a part may be (metres), and
// how thin and how thick a part may be (a radius, or half the size of a box).
const DESIGNED_OBJECT_LIMITS = { maximumParts: 16, reach: 1, minimumRadius: 0.01, maximumRadius: 0.5, minimumHalf: 0.01, maximumHalf: 0.75 };

// What an object has besides its name and its shape. `defaultValue` is used when a file leaves one out.
// (numberField and the others are in 03-workshop-rooms.js.)
const DESIGNED_OBJECT_FIELDS = [
  numberField('mass', 'Weight (kg). Heavier swings wider, slows you more, throws shorter, knocks louder', 2, 0.05, 40, 0.05),
  numberField('value', 'Worth, in the station\'s credits. Everything loose is worth something, however little', 10, 1, 500, 1),
  numberField('fragile', 'Fragile: how much of its worth a ruinous knock takes off (an empty can 0, a pipe 0.3, a tool case 0.7, a jar 1)', 0.4, 0, 1, 0.05),
  numberField('shattersAt', 'Shatters when hit harder than this (m/s); 0 is never. Glass leaves broken glass on the floor, anything else nothing (a sample jar: 3.4)', 0, 0, 12, 0.1),
  choiceField('material', 'What it sounds like when it hits something', 'metal',
    [['metal', 'Metal'], ['glass', 'Glass'], ['case', 'A dull box with things in it'], ['tin', 'Tin (an empty can)'], ['card', 'Cardboard']]),
  numberField('loud', 'How far its knocks carry for its weight (1 is ordinary; over 1 it shows in the warning colour)', 1, 0.3, 2.5, 0.1),
  choiceField('lies', 'How a station puts it out', 'upright', [['upright', 'Upright, as its parts are given'], ['onItsSide', 'On its side (a quarter turn over)'], ['either', 'Either']]),
  booleanField('bulky', 'Bulky: you cannot run with it', false),
  numberField('bounce', 'Bounce: how much of its speed it keeps (a glass jar 0.2, a steel pipe 0.35)', 0.25, 0, 0.8, 0.05),
  numberField('grip', 'Grip: low slides like a puck, high stops and tips over', 0.5, 0, 1, 0.05)
];
// Where a generated station has it lying about, and how often among its sort: 0 is never. These are the weights
// in STATION_LITTER, STATION_VALUABLES_ON_THE_FLOOR and STATION_VALUABLES_ON_A_SURFACE (a canister is 4 on the floor).
const DESIGNED_OBJECT_STATION_FIELDS = [
  numberField('asLitter', 'As litter on the floor (a cardboard box is 5)', 0, 0, 10, 1),
  numberField('onTheFloor', 'Worth carrying out, on the floor (a canister is 4)', 0, 0, 10, 1),
  numberField('onASurface', 'Worth carrying out, on a table or shelf (a jar is 5)', 0, 0, 10, 1)
];

// A place in an object: three numbers within reach of its origin, to the tenth of a millimetre.
function normalizeDesignedPlace(source, fallback) {
  const reach = DESIGNED_OBJECT_LIMITS.reach;
  return [0, 1, 2].map(function (axis) {
    return Math.round(normalizeDesignedNumber(Array.isArray(source) ? source[axis] : undefined, fallback[axis], -reach, reach) * 10000) / 10000;
  });
}

// Returns a clean copy of one part, or null if it is not a box, a ball or a capsule.
function normalizeDesignedPart(source) {
  const limits = DESIGNED_OBJECT_LIMITS;
  if (!source || typeof source !== 'object') return null;
  const radius = function (fallback) { return Math.round(normalizeDesignedNumber(source.radius, fallback, limits.minimumRadius, limits.maximumRadius) * 10000) / 10000; };
  if (source.shape === 'box') {
    return { shape: 'box', center: normalizeDesignedPlace(source.center, [0, 0, 0]), half: [0, 1, 2].map(function (axis) {
      return Math.round(normalizeDesignedNumber(Array.isArray(source.half) ? source.half[axis] : undefined, 0.1, limits.minimumHalf, limits.maximumHalf) * 10000) / 10000;
    }) };
  }
  if (source.shape === 'ball') return { shape: 'ball', center: normalizeDesignedPlace(source.center, [0, 0, 0]), radius: radius(0.08) };
  if (source.shape !== 'capsule') return null;
  const part = { shape: 'capsule', from: normalizeDesignedPlace(source.from, [0, -0.1, 0]), to: normalizeDesignedPlace(source.to, [0, 0.1, 0]), radius: radius(0.05) };
  // A rod with no length has no direction to be drawn in: it gets a little.
  if (Math.abs(part.to[0] - part.from[0]) + Math.abs(part.to[1] - part.from[1]) + Math.abs(part.to[2] - part.from[2]) < 0.001) {
    part.to[1] = part.from[1] + (part.from[1] > 0 ? -0.02 : 0.02);
  }
  return part;
}

// Returns a clean copy of an object file: everything present, in range, and of the right kind.
// A file written by hand may leave things out; whatever is missing gets its default.
function normalizeDesignedObject(source, key) {
  source = source && typeof source === 'object' ? source : {};
  const object = { key: key, label: (typeof source.label === 'string' && source.label.trim() !== '' ? source.label.trim() : key).slice(0, 40) };
  normalizeDesignedFields(object, source, DESIGNED_OBJECT_FIELDS);
  normalizeDesignedFields(object, source, DESIGNED_OBJECT_STATION_FIELDS);
  object.parts = [];
  for (const sourcePart of Array.isArray(source.parts) ? source.parts : []) {
    const part = normalizeDesignedPart(sourcePart);
    if (part && object.parts.length < DESIGNED_OBJECT_LIMITS.maximumParts) object.parts.push(part);
  }
  if (object.parts.length === 0) object.parts.push(normalizeDesignedPart({ shape: 'box' }));
  return object;
}

// The LOOSE_OBJECT_KINDS entry for a workshop object.
function createDesignedObjectKind(object) {
  const kind = JSON.parse(JSON.stringify(object));
  kind.isDesigned = true;
  // In a file, 0 means never; a kind that never shatters has no `shattersAt` at all.
  if (!(kind.shattersAt > 0)) delete kind.shattersAt;
  // Something thin (a plate, a wire) is stepped as if it were a shelf board thick, as the steel plate is:
  // nothing in a station is thinner than that for it to pass through, and finer steps slow everything that moves with it.
  let thinnest = Infinity;
  for (const part of kind.parts) thinnest = Math.min(thinnest, part.shape === 'box' ? Math.min(part.half[0], part.half[1], part.half[2]) : part.radius);
  if (thinnest < 0.025) kind.stepRadius = 0.025;
  return kind;
}

// The objects from src/objects/, cleaned up, by key.
const designedObjects = {};
for (const key in DESIGNED_OBJECTS) {
  if (LOOSE_OBJECT_KINDS[key]) continue; // a file may not take the place of a kind that is written as code
  designedObjects[key] = normalizeDesignedObject(DESIGNED_OBJECTS[key], key);
  const kind = LOOSE_OBJECT_KINDS[key] = createDesignedObjectKind(designedObjects[key]);
  if (kind.asLitter > 0) STATION_LITTER.push([key, kind.asLitter]);
  if (kind.onTheFloor > 0) STATION_VALUABLES_ON_THE_FLOOR.push([key, kind.onTheFloor]);
  if (kind.onASurface > 0) STATION_VALUABLES_ON_A_SURFACE.push([key, kind.onASurface]);
}
