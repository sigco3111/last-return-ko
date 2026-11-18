// ---------------------------------------------------------------------------
// Loose objects: things you can pick up, carry, set down and throw.
//
// Each one is a small rigid body. It falls, bounces, tumbles, rolls and comes to rest on the floor, on a
// shelf or on another object. You do not carry one in your hands: the scanner holds it, in a beam, out in
// front of you where you are looking. It hangs there on a spring: it swings wide when you turn, stops against
// a door frame, and is lost when it is caught on something and left too far behind.
//
// What that does to the game:
//   - What you carry is in front of the scanner, in the middle of its beam: pulses stop on it.
//   - It is never drawn. What you see of it is the points your scanner leaves on it.
//   - Every knock is heard, by you and by the Hollow, by how hard it was. Slow is silent.
//
// This is not a general physics engine, and is not meant to become one. There is one kind of contact (a small
// ball against something solid), objects are never stacked into towers, and nothing is jointed. An object
// is described as boxes, balls and capsules (`parts`); from those the game makes a shell of small balls that
// does the touching, which is what lets a box land on a corner and tip over.
//
// To add a kind of object: add an entry to LOOSE_OBJECT_KINDS. Nothing else needs to change.
// Or make one in the workshop's object tool: that is a file in src/objects/ (see 08-workshop-objects.js).
// ---------------------------------------------------------------------------

// TWEAK: the objects.
//   label      what it is called on screen ("Pick up the gas canister")
//   mass       kilograms. Heavier swings wider behind the beam, slows you more, throws shorter, knocks louder.
//   value      what it is worth, in the station's own credits, while it is whole. Everything loose is worth something, however little.
//   fragile    how much of what it is worth a ruinous knock takes off it: 0 nothing (a can), 1 all of it down to scrap
//              (see "What a knock costs" further down). Left out: 0.
//   shattersAt hit harder than this (m/s) it is destroyed outright. Left out: it never is. Glass leaves broken
//              glass on the floor; anything else breaks apart with its own sound and leaves nothing.
//   material   what it sounds like when it hits something: 'metal', 'glass', 'case' (a dull box with things in it), 'tin' (a can) or 'card' (cardboard)
//   loud       how far its knocks carry for its weight: 1 is ordinary, an empty can is more, a cardboard box less
//   lies       how it is put out in a station: 'upright' as its parts are given, 'onItsSide' (a quarter turn over),
//              or 'either'
//   bulky      true for something you cannot run with. (Whether a thing goes into a vent is not a rule: it goes
//              where it fits. A vent is a metre wide and 1.15 m high.)
//   bounce     0 to 1: how much of its speed it keeps when it bounces. A glass jar 0.2, a steel pipe 0.35.
//   grip       0 to 1: how much it resists sliding. Low slides like a puck, high stops and tips over.
//   parts      its shape, in metres, as it hangs in the beam: x to your right, y up, z towards you (so -z points ahead).
//              { shape: 'box', center: [x, y, z], half: [x, y, z] }
//              { shape: 'ball', center: [x, y, z], radius: r }
//              { shape: 'capsule', from: [x, y, z], to: [x, y, z], radius: r }   a rod with round ends
//   use        for an object that does something when you press Q with it in the beam:
//              { prompt: 'Arm the scan grenade', button: 'ARM', activate: function (object) { ... } }
//              (`button` is what the phone's button for it says)
//              What it then does over time is `update(object, dt)`, called every frame for every object of the kind.
// Where it hangs is the same for all of them: straight out from the scanner's lens, `looseHoldDistance` (in
// 00-config.js) beyond its own size. How much of the beam it takes follows from how big it is.
const LOOSE_OBJECT_KINDS = {
  canister: {
    label: 'gas canister', mass: 3, value: 25, fragile: 0.5, material: 'metal', loud: 1, lies: 'either', bulky: false, bounce: 0.3, grip: 0.5,
    parts: [{ shape: 'capsule', from: [0, -0.13, 0], to: [0, 0.13, 0], radius: 0.07 }]
  },
  jar: {
    label: 'sample jar', mass: 0.8, value: 60, fragile: 1, shattersAt: 3.4, material: 'glass', loud: 1, lies: 'upright', bulky: false, bounce: 0.2, grip: 0.45,
    parts: [{ shape: 'capsule', from: [0, -0.05, 0], to: [0, 0.05, 0], radius: 0.06 }]
  },
  toolCase: {
    label: 'tool case', mass: 6, value: 80, fragile: 0.7, material: 'case', loud: 1, lies: 'onItsSide', bulky: false, bounce: 0.15, grip: 0.6,
    parts: [{ shape: 'box', center: [0, 0, 0], half: [0.21, 0.15, 0.08] }]
  },
  // The pipe hangs across the beam, not along it: 1.2 m of it, and a doorway is a metre wide.
  pipe: {
    label: 'length of pipe', mass: 4, value: 15, fragile: 0.3, material: 'metal', loud: 1, lies: 'upright', bulky: false, bounce: 0.35, grip: 0.4,
    parts: [{ shape: 'capsule', from: [-0.6, 0, 0], to: [0.6, 0, 0], radius: 0.03 }]
  },
  crate: {
    label: 'crate', mass: 12, value: 40, fragile: 0.6, material: 'case', loud: 1, lies: 'upright', bulky: true, bounce: 0.12, grip: 0.7,
    parts: [{ shape: 'box', center: [0, 0, 0], half: [0.25, 0.22, 0.22] }]
  },
  // A scan grenade: arm it (Q), throw it, and where it lands it scans the room for you, all round. The light
  // stuns the Hollow if enough of it lands on it, and the noise brings it to where the grenade went off.
  scanGrenade: {
    label: 'scan grenade', mass: 0.6, value: 0, material: 'metal', loud: 1, lies: 'either', bulky: false, bounce: 0.3, grip: 0.6,
    parts: [
      { shape: 'capsule', from: [0, -0.045, 0], to: [0, 0.045, 0], radius: 0.04 },
      { shape: 'box', center: [0.05, 0.02, 0], half: [0.02, 0.05, 0.02] }
    ],
    use: { prompt: 'Arm the scan grenade', button: 'ARM', activate: armScanGrenade },
    update: updateScanGrenade
  },
  // ---- litter: what lies about a station that nobody has swept in forty years ----
  // An empty can. Six of them lie wherever the noisy floor's draw says "cans" (03-noisy-floor.js). Kicked at a
  // walk they carry as far as the patch of cans they replace did; crouched, you can pick your way through.
  can: {
    label: 'empty can', mass: 0.06, value: 1, material: 'tin', loud: 1.7, lies: 'either', bulky: false, bounce: 0.35, grip: 0.4,
    stepRadius: 0.035, // its body is what must not pass through a shelf in one step; the feet are within it
    // The body, and four small feet at each end so that it can stand: a capsule alone has round ends.
    parts: [{ shape: 'capsule', from: [0, -0.03, 0], to: [0, 0.03, 0], radius: 0.035 },
      { shape: 'ball', center: [0.016, -0.053, 0.016], radius: 0.012 }, { shape: 'ball', center: [-0.016, -0.053, 0.016], radius: 0.012 },
      { shape: 'ball', center: [0.016, -0.053, -0.016], radius: 0.012 }, { shape: 'ball', center: [-0.016, -0.053, -0.016], radius: 0.012 },
      { shape: 'ball', center: [0.016, 0.053, 0.016], radius: 0.012 }, { shape: 'ball', center: [-0.016, 0.053, 0.016], radius: 0.012 },
      { shape: 'ball', center: [0.016, 0.053, -0.016], radius: 0.012 }, { shape: 'ball', center: [-0.016, 0.053, -0.016], radius: 0.012 }]
  },
  carton: {
    label: 'cardboard box', mass: 0.7, value: 2, fragile: 0.5, material: 'card', loud: 0.6, lies: 'upright', bulky: false, bounce: 0.1, grip: 0.7,
    parts: [{ shape: 'box', center: [0, 0, 0], half: [0.17, 0.11, 0.13] }]
  },
  plate: {
    label: 'steel plate', mass: 3.5, value: 6, fragile: 0.2, material: 'metal', loud: 1.3, lies: 'upright', bulky: false, bounce: 0.25, grip: 0.5,
    // It is thin, but nothing in a station is thinner than a shelf board: steps of a centimetre or so are fine enough
    // for it not to pass through one, and steps as fine as its own thickness would slow everything that moves with it.
    stepRadius: 0.025,
    parts: [{ shape: 'box', center: [0, 0, 0], half: [0.2, 0.012, 0.15] }]
  },
  // The cover of a vent: a sheet-metal grille a little smaller than the opening. About half of them still stand
  // in their vent's mouth, where they hide the vent from a scan and fall over, loudly, if anything walks into
  // them; the rest lie on the floor in front of it. Heavy, awkward, and worth carrying off.
  ventCover: {
    label: 'vent cover', mass: 9, value: 20, fragile: 0.3, material: 'metal', loud: 1.2, lies: 'upright', bulky: true, bounce: 0.2, grip: 0.5,
    stepRadius: 0.03,
    // Lying flat it is a plate on the floor: you and the Hollow walk over it. Standing or leaning it is in the way.
    stepOverHeight: 0.15,
    // Bigger than the mouth it covers (which is a metre wide and 1.15 m high): it stands in front of the mouth,
    // against the frame, and does not go through it. The sheet, and a lug at each corner, front and back: it
    // stands on the bottom four, and lies flat on four of a side.
    parts: [{ shape: 'box', center: [0, 0, 0], half: [0.56, 0.6, 0.02] },
      { shape: 'ball', center: [0.52, -0.58, 0.045], radius: 0.02 }, { shape: 'ball', center: [-0.52, -0.58, 0.045], radius: 0.02 },
      { shape: 'ball', center: [0.52, -0.58, -0.045], radius: 0.02 }, { shape: 'ball', center: [-0.52, -0.58, -0.045], radius: 0.02 },
      { shape: 'ball', center: [0.52, 0.58, 0.045], radius: 0.02 }, { shape: 'ball', center: [-0.52, 0.58, 0.045], radius: 0.02 },
      { shape: 'ball', center: [0.52, 0.58, -0.045], radius: 0.02 }, { shape: 'ball', center: [-0.52, 0.58, -0.045], radius: 0.02 }]
  },

  pumpMotor: {
    label: 'pump motor', mass: 18, value: 150, fragile: 0.6, material: 'metal', loud: 1, lies: 'upright', bulky: true, bounce: 0.1, grip: 0.65,
    parts: [
      { shape: 'capsule', from: [-0.12, 0, 0], to: [0.12, 0, 0], radius: 0.13 },
      { shape: 'capsule', from: [0.12, 0, 0], to: [0.3, 0, 0], radius: 0.035 },
      { shape: 'box', center: [-0.02, -0.14, 0], half: [0.16, 0.025, 0.13] }
    ]
  }
};

const LOOSE_SHELL_BALL_RADIUS = 0.06;   // the largest ball in the shell that does a box's touching
const LOOSE_SHELL_BALL_SPACING = 0.16;  // at most this far from one ball of the shell to the next
const LOOSE_MAXIMUM_CONTACTS = 24;
const LOOSE_CONTACT_SLOP = 0.003;       // overlap that is left alone, so that an object at rest is not nudged every step

const looseObjects = [];
const looseState = {
  accumulator: 0,
  nextId: 1,
  held: null,              // the object in the beam, or null
  isHeldByButton: false,   // it is carried for as long as the right mouse button is down (and not by a press of E, which stays until E again)
  holdTargetX: 0, holdTargetY: 0, holdTargetZ: 0,
  holdBreakTimer: 0,       // how long the carried object has been too far from where the beam wants it
  lastDamageSaidTime: -10, // when the screen last said that a knock cost something
  holdLength: 0,           // how far out the beam holds it right now: looseHoldDistance, or less while it is pressed against something ahead
  isLettingGo: false,      // E went down with something in the beam and nothing to use: this press lets go or throws
  lettingGoSeconds: 0,     // ... and has been held this long. A tap lets go, a hold winds up a throw.
  hasShownCarryHint: false,
  hasShownKnockHint: false,
  hollowLastX: 0, hollowLastZ: 0, hollowVelocityX: 0, hollowVelocityZ: 0, hollowWasActive: false,
  // How fast you are really moving, from where you were a frame ago. (`player.velocityX` is how fast your legs
  // are trying to go, which is not the same thing with a wall in front of you.)
  playerLastX: 0, playerLastZ: 0, playerVelocityX: 0, playerVelocityZ: 0, playerWasThere: false,
  // How far something heavy on the floor has pushed back at you this frame (the deepest push, and which way).
  shoveBackDepth: 0, shoveBackX: 0, shoveBackZ: 0,
  // How fast you walked this frame before anything on the floor held you back: that is the speed you kick with.
  playerStrideX: 0, playerStrideZ: 0,
  statistics: { knocksHeard: 0, knocksQuiet: 0, pulledFromHands: 0, lostDownThePit: 0, putBack: 0, grenadesSpent: 0, flungBack: 0, worthLost: 0, shattered: 0, coversThrown: 0 }, // putBack: an object got into the rock and was set back where it last was not. Should stay 0.
  lastKnock: { x: 0, z: 0, speed: 0, carries: 0, isOwn: false, time: -10 }, // the last knock the Hollow could hear: where, how hard, how far it carried
  lastFling: { x: 0, z: 0, targetX: 0, targetZ: 0, time: -100, id: 0 }, // the last thing the Hollow threw back, for the tests and the debug readout
  lastCoverThrown: { x: 0, z: 0, towardsX: 0, towardsZ: 0, time: -100 } // the last vent cover the Hollow threw out of its way, likewise
};

// Scratch space, so that a step allocates nothing.
const looseContacts = [];
for (let contactIndex = 0; contactIndex < LOOSE_MAXIMUM_CONTACTS; contactIndex++) {
  looseContacts.push({ normalX: 0, normalY: 0, normalZ: 0, depth: 0, velocityX: 0, velocityZ: 0, other: null, isSoft: false, isPlayer: false });
}
let looseContactCount = 0;
const looseScratchVector = { x: 0, y: 0, z: 0 };
const looseLocalRay = { originX: 0, originY: 0, originZ: 0, directionX: 0, directionY: 0, directionZ: 0 };
const looseCapsuleScratch = new Float32Array(7);

// ---------------------------------------------------------------------------
// Preparing a kind: the shell of balls, the centre of mass, how hard it is to spin
// ---------------------------------------------------------------------------

function addShellBallsForPart(part, balls) {
  if (part.shape === 'ball') {
    balls.push([part.center[0], part.center[1], part.center[2], part.radius]);
  } else if (part.shape === 'capsule') {
    const deltaX = part.to[0] - part.from[0], deltaY = part.to[1] - part.from[1], deltaZ = part.to[2] - part.from[2];
    const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
    const steps = Math.max(1, Math.ceil(length / (part.radius * 1.2)));
    for (let step = 0; step <= steps; step++) {
      const along = step / steps;
      balls.push([part.from[0] + deltaX * along, part.from[1] + deltaY * along, part.from[2] + deltaZ * along, part.radius]);
    }
  } else {
    // A box: balls on its faces, edges and corners, set in by their own radius so that the shell is the box's size.
    const radius = Math.min(LOOSE_SHELL_BALL_RADIUS, part.half[0], part.half[1], part.half[2]);
    const counts = [], spans = [];
    for (let axis = 0; axis < 3; axis++) {
      spans.push(Math.max(0, part.half[axis] - radius));
      counts.push(spans[axis] < 0.001 ? 1 : Math.max(2, Math.ceil(spans[axis] * 2 / LOOSE_SHELL_BALL_SPACING) + 1));
    }
    for (let indexX = 0; indexX < counts[0]; indexX++) {
      for (let indexY = 0; indexY < counts[1]; indexY++) {
        for (let indexZ = 0; indexZ < counts[2]; indexZ++) {
          const isOnShell = indexX === 0 || indexX === counts[0] - 1 || indexY === 0 || indexY === counts[1] - 1 || indexZ === 0 || indexZ === counts[2] - 1;
          if (!isOnShell) continue;
          balls.push([
            part.center[0] + (counts[0] === 1 ? 0 : -spans[0] + spans[0] * 2 * indexX / (counts[0] - 1)),
            part.center[1] + (counts[1] === 1 ? 0 : -spans[1] + spans[1] * 2 * indexY / (counts[1] - 1)),
            part.center[2] + (counts[2] === 1 ? 0 : -spans[2] + spans[2] * 2 * indexZ / (counts[2] - 1)),
            radius]);
        }
      }
    }
  }
}

// Works out, once per kind, everything the steps below need. The parts are moved so that the object's own
// origin is its centre of mass: that is the point it turns about.
function prepareLooseObjectKind(kindKey) {
  const kind = LOOSE_OBJECT_KINDS[kindKey];
  if (kind.prepared) return kind.prepared;
  const balls = [];
  for (const part of kind.parts) addShellBallsForPart(part, balls);
  // Weigh each ball by its volume, so that a thin shaft does not pull the centre of mass as far as the motor it is on.
  let totalWeight = 0, centreX = 0, centreY = 0, centreZ = 0;
  for (const ball of balls) {
    const weight = ball[3] * ball[3] * ball[3];
    totalWeight += weight; centreX += ball[0] * weight; centreY += ball[1] * weight; centreZ += ball[2] * weight;
  }
  centreX /= totalWeight; centreY /= totalWeight; centreZ /= totalWeight;
  const shell = new Float32Array(balls.length * 4);
  let inertiaX = 0, inertiaY = 0, inertiaZ = 0, boundsRadius = 0, smallestRadius = Infinity;
  for (let ballIndex = 0; ballIndex < balls.length; ballIndex++) {
    const ball = balls[ballIndex];
    const x = ball[0] - centreX, y = ball[1] - centreY, z = ball[2] - centreZ, radius = ball[3];
    shell[ballIndex * 4] = x; shell[ballIndex * 4 + 1] = y; shell[ballIndex * 4 + 2] = z; shell[ballIndex * 4 + 3] = radius;
    const ballMass = kind.mass * radius * radius * radius / totalWeight;
    const own = 0.4 * radius * radius;
    inertiaX += ballMass * (y * y + z * z + own);
    inertiaY += ballMass * (x * x + z * z + own);
    inertiaZ += ballMass * (x * x + y * y + own);
    boundsRadius = Math.max(boundsRadius, Math.sqrt(x * x + y * y + z * z) + radius);
    smallestRadius = Math.min(smallestRadius, radius);
  }
  const parts = kind.parts.map(function (part) {
    if (part.shape === 'box') return { shape: 'box', centerX: part.center[0] - centreX, centerY: part.center[1] - centreY, centerZ: part.center[2] - centreZ, halfX: part.half[0], halfY: part.half[1], halfZ: part.half[2] };
    if (part.shape === 'ball') return { shape: 'ball', centerX: part.center[0] - centreX, centerY: part.center[1] - centreY, centerZ: part.center[2] - centreZ, radius: part.radius };
    return { shape: 'capsule', radius: part.radius,
      fromX: part.from[0] - centreX, fromY: part.from[1] - centreY, fromZ: part.from[2] - centreZ,
      toX: part.to[0] - centreX, toY: part.to[1] - centreY, toZ: part.to[2] - centreZ };
  });
  // How far any part reaches from the centre of mass. This is more than the shell's reach for a box, whose
  // corners are sharp where the shell's are round: a pulse must be able to land on a corner.
  let partsRadius = 0;
  for (const part of parts) {
    if (part.shape === 'box') {
      partsRadius = Math.max(partsRadius, Math.sqrt(Math.pow(Math.abs(part.centerX) + part.halfX, 2) + Math.pow(Math.abs(part.centerY) + part.halfY, 2) + Math.pow(Math.abs(part.centerZ) + part.halfZ, 2)));
    } else if (part.shape === 'ball') {
      partsRadius = Math.max(partsRadius, Math.sqrt(part.centerX * part.centerX + part.centerY * part.centerY + part.centerZ * part.centerZ) + part.radius);
    } else {
      partsRadius = Math.max(partsRadius, Math.sqrt(part.fromX * part.fromX + part.fromY * part.fromY + part.fromZ * part.fromZ) + part.radius,
        Math.sqrt(part.toX * part.toX + part.toY * part.toY + part.toZ * part.toZ) + part.radius);
    }
  }
  kind.prepared = {
    centreX: centreX, centreY: centreY, centreZ: centreZ, // where the centre of mass is, in the coordinates the parts were given in
    partsRadius: partsRadius,
    shell: shell, shellCount: balls.length, parts: parts,
    inverseMass: 1 / kind.mass,
    inverseInertiaX: 1 / inertiaX, inverseInertiaY: 1 / inertiaY, inverseInertiaZ: 1 / inertiaZ,
    boundsRadius: boundsRadius, smallestRadius: kind.stepRadius || smallestRadius
  };
  return kind.prepared;
}

// ---------------------------------------------------------------------------
// Where they are, tile by tile
//
// A station can have hundreds of loose things lying about. A scanner pulse must not have to ask every one of
// them whether it is in the way, nor a rolling can ask every other object whether they touch. So each object
// is noted in the floor tiles it is near, the way the furniture is, and a pulse asks only the tiles it crosses.
// (Measured with 600 objects in a massive station before this: scanning cost fifteen times what it does with none.)
// ---------------------------------------------------------------------------

const tileLooseLists = new Array(TILE_COUNT).fill(null);
const LOOSE_TILE_MARGIN = 0.5;   // an object is noted in every tile within this of its outermost part ...
const LOOSE_TILE_SLACK = 0.2;    // ... and noted afresh once it has moved this far, so the margin never runs out
const LOOSE_FEW = 6;             // with this few objects in the station it is quicker simply to ask them all
let looseStampCounter = 1;

function noteLooseObjectInTiles(object) {
  const reach = Math.max(object.prepared.partsRadius, object.prepared.boundsRadius) + LOOSE_TILE_MARGIN;
  object.notedX = object.x; object.notedZ = object.z;
  object.tileFirstX = Math.max(0, Math.floor(object.x - reach)); object.tileLastX = Math.min(GRID_WIDTH - 1, Math.floor(object.x + reach));
  object.tileFirstZ = Math.max(0, Math.floor(object.z - reach)); object.tileLastZ = Math.min(GRID_DEPTH - 1, Math.floor(object.z + reach));
  for (let tileZ = object.tileFirstZ; tileZ <= object.tileLastZ; tileZ++) {
    for (let tileX = object.tileFirstX; tileX <= object.tileLastX; tileX++) {
      const index = tileZ * GRID_WIDTH + tileX;
      if (tileLooseLists[index] === null) tileLooseLists[index] = [];
      tileLooseLists[index].push(object);
    }
  }
  object.isNotedInTiles = true;
}

function forgetLooseObjectInTiles(object) {
  if (!object.isNotedInTiles) return;
  for (let tileZ = object.tileFirstZ; tileZ <= object.tileLastZ; tileZ++) {
    for (let tileX = object.tileFirstX; tileX <= object.tileLastX; tileX++) {
      const index = tileZ * GRID_WIDTH + tileX, list = tileLooseLists[index];
      if (list === null) continue;
      const at = list.indexOf(object);
      if (at >= 0) { list[at] = list[list.length - 1]; list.pop(); }
      if (list.length === 0) tileLooseLists[index] = null;
    }
  }
  object.isNotedInTiles = false;
}

// Call when an object may have moved. Does nothing until it has moved far enough to matter.
function refreshLooseObjectTiles(object) {
  if (object.isNotedInTiles && Math.abs(object.x - object.notedX) < LOOSE_TILE_SLACK && Math.abs(object.z - object.notedZ) < LOOSE_TILE_SLACK) return;
  forgetLooseObjectInTiles(object);
  noteLooseObjectInTiles(object);
}

// ---------------------------------------------------------------------------
// Making, removing, waking
// ---------------------------------------------------------------------------

// Sets which way an object faces: turned `yaw` about the vertical, the way the player's own yaw is counted.
function setLooseObjectYaw(object, yaw) {
  object.orientationX = 0; object.orientationY = Math.sin(-yaw / 2); object.orientationZ = 0; object.orientationW = Math.cos(-yaw / 2);
  updateLooseObjectMatrix(object);
}

// Sets how an object is turned outright, as a quaternion (x, y, z, w). It is made unit length here.
function setLooseObjectOrientation(object, x, y, z, w) {
  const length = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
  object.orientationX = x / length; object.orientationY = y / length; object.orientationZ = z / length; object.orientationW = w / length;
  updateLooseObjectMatrix(object);
}

// The rotation as nine numbers, row by row: a point of the object is at position + matrix * (its own coordinates).
function updateLooseObjectMatrix(object) {
  const x = object.orientationX, y = object.orientationY, z = object.orientationZ, w = object.orientationW;
  const matrix = object.matrix;
  matrix[0] = 1 - 2 * (y * y + z * z); matrix[1] = 2 * (x * y - w * z); matrix[2] = 2 * (x * z + w * y);
  matrix[3] = 2 * (x * y + w * z); matrix[4] = 1 - 2 * (x * x + z * z); matrix[5] = 2 * (y * z - w * x);
  matrix[6] = 2 * (x * z - w * y); matrix[7] = 2 * (y * z + w * x); matrix[8] = 1 - 2 * (x * x + y * y);
}

function createLooseObject(kindKey, x, y, z, yaw) {
  const kind = LOOSE_OBJECT_KINDS[kindKey];
  if (!kind) return null;
  const prepared = prepareLooseObjectKind(kindKey);
  const object = {
    id: looseState.nextId++,
    kindKey: kindKey, kind: kind, prepared: prepared,
    x: x, y: y, z: z,
    orientationX: 0, orientationY: 0, orientationZ: 0, orientationW: 1,
    matrix: new Float32Array(9),
    velocityX: 0, velocityY: 0, velocityZ: 0,
    spinX: 0, spinY: 0, spinZ: 0,       // how fast it turns, in radians per second, about each axis of the world
    beforeVelocityX: 0, beforeVelocityY: 0, beforeVelocityZ: 0, beforeSpinX: 0, beforeSpinY: 0, beforeSpinZ: 0, // ... and how it was moving a moment ago
    isHeld: false,
    isAsleep: false,                    // at rest: it is left out of the steps until something touches it
    restSeconds: 0,
    touchedThisStep: false, wasTouching: false, isMoving: false,
    moveEast: 0, moveWest: 0, moveUp: 0, moveDown: 0, moveSouth: 0, moveNorth: 0, // how far it has to shift to be out of what it touches
    gripX: 0, gripY: 0, gripZ: 0, gripW: 1, // how it was turned, compared with the way you faced, when the beam took hold of it
    lastGoodX: x, lastGoodY: y, lastGoodZ: z,
    // The hardest knock since the last frame, for the sound and the noise.
    knockSpeed: 0, knockX: 0, knockY: 0, knockZ: 0, knockIsOwn: false,
    lastKnockTime: -10,
    lastHandledTime: -10,               // when you last had it in the beam: a knock soon after is your doing
    lastScannedTime: -10,               // when a pulse last landed on it
    hasRestPoints: false,               // it was scanned where it lies, and those points are still on it
    // For a kind that does something (`use`): when it was set off, when it starts doing it, and whether it is used up.
    armedTime: -1, goesOffTime: -1, burstSeconds: 0, burstBudget: 0, burstHitsOnHollow: 0, isSpent: false,
    kickedByHollowTime: -100, chasedSince: -100, // when the Hollow last kicked it, and when it last started going after it
    worth: kind.value,                  // what it is worth now: less than kind.value once it has been knocked about
    scanHits: 0, isAppraised: false,    // how many pulses have landed on it, and whether that was enough for the scanner to read what it is worth
    wasHandled: false,                  // you have had it in the beam (and the Hollow has not flung it back since): only such things interest it
    isIgnoredByHollow: false,           // the Hollow flung it: it knows that noise, and pays it no heed until you handle the thing again
    isRemoved: false
  };
  setLooseObjectYaw(object, yaw || 0);
  looseObjects.push(object);
  noteLooseObjectInTiles(object);
  return object;
}

function clearLooseObjects() {
  for (let objectIndex = 0; objectIndex < looseObjects.length; objectIndex++) forgetLooseObjectInTiles(looseObjects[objectIndex]);
  looseObjects.length = 0;
  looseState.held = null;
  looseState.accumulator = 0;
  looseState.holdBreakTimer = 0;
  looseState.isLettingGo = false;
  looseState.lettingGoSeconds = 0;
  looseState.hollowWasActive = false;
  looseState.playerWasThere = false; looseState.playerVelocityX = 0; looseState.playerVelocityZ = 0;
}

// A new descent: nothing loose is left over from the last one, and the hints are due again.
function resetLooseObjectsForNewRun() {
  spawnStationLooseObjects(); // clears whatever was loose, and puts the station's own things back where they lay
  looseState.hasShownCarryHint = false;
  looseState.hasShownKnockHint = false;
  looseState.hasShownAppraisalHint = false;
  const statistics = looseState.statistics;
  statistics.knocksHeard = 0; statistics.knocksQuiet = 0; statistics.pulledFromHands = 0; statistics.lostDownThePit = 0; statistics.putBack = 0; statistics.grenadesSpent = 0; statistics.flungBack = 0; statistics.worthLost = 0; statistics.shattered = 0; statistics.coversThrown = 0;
  looseState.lastDamageSaidTime = -10;
  removeBrokenGlassFromPlay(); // what was broken in the last descent is swept up
}

function removeLooseObject(object) {
  changePointsOnLooseObject(object, 0); // its points do not stay behind in the air
  wakeLooseObjectsTouching(object); // and what lay on it comes down
  if (looseState.held === object) looseState.held = null;
  object.isRemoved = true;
  object.isHeld = false;
  forgetLooseObjectInTiles(object);
  const index = looseObjects.indexOf(object);
  if (index >= 0) looseObjects.splice(index, 1);
}

// Is this point (in the station) on the surface of the object, where it is now? A hand's width of slack.
function isPointOnLooseObject(object, x, y, z) {
  const matrix = object.matrix, slack = 0.04;
  const offsetX = x - object.x, offsetY = y - object.y, offsetZ = z - object.z;
  const localX = matrix[0] * offsetX + matrix[3] * offsetY + matrix[6] * offsetZ;
  const localY = matrix[1] * offsetX + matrix[4] * offsetY + matrix[7] * offsetZ;
  const localZ = matrix[2] * offsetX + matrix[5] * offsetY + matrix[8] * offsetZ;
  const parts = object.prepared.parts;
  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex];
    if (part.shape === 'box') {
      if (Math.abs(localX - part.centerX) <= part.halfX + slack && Math.abs(localY - part.centerY) <= part.halfY + slack && Math.abs(localZ - part.centerZ) <= part.halfZ + slack) return true;
    } else if (part.shape === 'ball') {
      const reach = part.radius + slack;
      if (Math.pow(localX - part.centerX, 2) + Math.pow(localY - part.centerY, 2) + Math.pow(localZ - part.centerZ, 2) <= reach * reach) return true;
    } else {
      // How far from the rod's middle line.
      const alongX = part.toX - part.fromX, alongY = part.toY - part.fromY, alongZ = part.toZ - part.fromZ;
      const lengthSquared = alongX * alongX + alongY * alongY + alongZ * alongZ;
      const share = lengthSquared > 0 ? clampNumber(((localX - part.fromX) * alongX + (localY - part.fromY) * alongY + (localZ - part.fromZ) * alongZ) / lengthSquared, 0, 1) : 0;
      const reach = part.radius + slack;
      if (Math.pow(localX - part.fromX - alongX * share, 2) + Math.pow(localY - part.fromY - alongY * share, 2) + Math.pow(localZ - part.fromZ - alongZ * share, 2) <= reach * reach) return true;
    }
  }
  return false;
}

// The points that were scanned onto an object at rest stay where they were measured. When it moves off they
// are let go, the way a door's are when it slides away; when it is taken out of the world they go at once
// (`seconds` 0). Only the points on the object itself: the floor it stood on keeps its own.
function changePointsOnLooseObject(object, seconds) {
  const reach = object.prepared.partsRadius + 0.05;
  changePointsOnShape(object.x - reach, object.y - reach, object.z - reach, object.x + reach, object.y + reach, object.z + reach,
    SURFACE_INTERACTIVE, seconds > 0 ? convertSecondsToPointLifeCode(seconds) : 0,
    function (x, y, z) { return isPointOnLooseObject(object, x, y, z); });
}

// A pulse has landed on this object.
function noteLooseObjectScanned(object) {
  object.lastScannedTime = game.time;
  if (object.isAsleep) object.hasRestPoints = true;
  // Enough pulses on it, and the scanner has read what it is: from then on the screen says what it is worth.
  object.scanHits++;
  if (!object.isAppraised && object.scanHits >= TUNING.looseAppraiseHits) {
    object.isAppraised = true;
    if (!looseState.hasShownAppraisalHint && getLooseObjectValue(object) > 0 && game.mode === 'playing') {
      looseState.hasShownAppraisalHint = true;
      showMessage('The scanner has read what that is: ' + object.kind.label + ', worth ' + getLooseObjectValue(object) + '. Scan a thing well and what it is worth shows at it for a few seconds, each time you scan it.', 7, 'info');
    }
  }
}

// How long ago a pulse last landed on it, in seconds. What a thing is worth floats at it for a few seconds after
// that, and no longer: scan it again and it shows again (10-interface.js).
function getSecondsSinceLooseObjectScanned(object) {
  return game.time - object.lastScannedTime;
}

// How high the top of it is, turned as it is: what floats at it floats just above that.
function getLooseObjectTopY(object) {
  const matrix = object.matrix, parts = object.prepared.parts;
  let reachUp = 0;
  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex];
    if (part.shape === 'box') {
      reachUp = Math.max(reachUp, matrix[3] * part.centerX + matrix[4] * part.centerY + matrix[5] * part.centerZ +
        Math.abs(matrix[3]) * part.halfX + Math.abs(matrix[4]) * part.halfY + Math.abs(matrix[5]) * part.halfZ);
    } else if (part.shape === 'ball') {
      reachUp = Math.max(reachUp, matrix[3] * part.centerX + matrix[4] * part.centerY + matrix[5] * part.centerZ + part.radius);
    } else {
      reachUp = Math.max(reachUp, matrix[3] * part.fromX + matrix[4] * part.fromY + matrix[5] * part.fromZ + part.radius,
        matrix[3] * part.toX + matrix[4] * part.toY + matrix[5] * part.toZ + part.radius);
    }
  }
  return object.y + reachUp;
}

// What the scanner has read a thing to be worth: nothing until it has.
function getLooseObjectWorth(object) {
  return object.isAppraised ? getLooseObjectValue(object) : 0;
}

// What a thing is worth now, as a whole number: what Salvage counts, and what the screen says once the
// scanner has read it. Never nothing, for a thing that was worth something.
function getLooseObjectValue(object) {
  return object.kind.value > 0 ? Math.max(1, Math.round(object.worth)) : 0;
}


// Wakes an object at rest, and with it whatever lies against it or on top of it: take the bottom crate away
// and the one above must fall.
// Does it lie low enough to be walked over? Only a kind with a step-over height can: a vent cover flat on the floor.
function isLooseObjectLyingLow(object) {
  const stepOverHeight = object.kind.stepOverHeight || 0;
  if (stepOverHeight === 0 || object.isHeld) return false;
  const tileX = Math.floor(object.x), tileZ = Math.floor(object.z);
  if (!isInsideGrid(tileX, tileZ)) return false;
  // How far its first part (the sheet) reaches above its centre, turned as it is.
  const part = object.prepared.parts[0], matrix = object.matrix;
  const reachUp = part.shape === 'box' ? Math.abs(matrix[3]) * part.halfX + Math.abs(matrix[4]) * part.halfY + Math.abs(matrix[5]) * part.halfZ : object.prepared.boundsRadius;
  return object.y + reachUp < tileFloorHeight[tileIndexAt(tileX, tileZ)] + stepOverHeight;
}

// Does touching it make a noise worth a warning? That is what the scanner's warning colour on a loose thing
// says. A loud kind does, except where it lies low and is walked over.
function isLooseObjectLoudToTouch(object) {
  return object.kind.loud > 1 && !isLooseObjectLyingLow(object);
}

// Is something big standing within `radius` of (x, z): a vent cover in its mouth, a crate left there?
function isLooseObjectInTheWayAt(x, z, radius) {
  for (const object of looseObjects) {
    if (object.prepared.boundsRadius < 0.3 || isLooseObjectLyingLow(object)) continue;
    if ((object.x - x) * (object.x - x) + (object.z - z) * (object.z - z) < radius * radius) return true;
  }
  return false;
}

function wakeLooseObject(object) {
  if (!object.isAsleep) return;
  object.isAsleep = false;
  object.restSeconds = 0;
  if (object.hasRestPoints) {
    // Its points stay behind where it lay, and go over the next moment.
    changePointsOnLooseObject(object, TUNING.looseImprintSeconds);
    object.hasRestPoints = false;
  }
  wakeLooseObjectsTouching(object);
}

function wakeLooseObjectsTouching(object) {
  for (let objectIndex = 0; objectIndex < looseObjects.length; objectIndex++) {
    const other = looseObjects[objectIndex];
    if (other === object || !other.isAsleep) continue;
    const reach = object.prepared.boundsRadius + other.prepared.boundsRadius + 0.02;
    const deltaX = other.x - object.x, deltaY = other.y - object.y, deltaZ = other.z - object.z;
    if (deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ < reach * reach) wakeLooseObject(other);
  }
}

// ---------------------------------------------------------------------------
// Scanner pulses
// ---------------------------------------------------------------------------

// Distance along a ray, given in the object's own coordinates, to one box part. -1 for a miss.
function intersectRayWithLooseBox(part, ray) {
  let near = -Infinity, far = Infinity;
  const originX = ray.originX - part.centerX, originY = ray.originY - part.centerY, originZ = ray.originZ - part.centerZ;
  if (Math.abs(ray.directionX) < 1e-9) { if (Math.abs(originX) > part.halfX) return -1; }
  else {
    let first = (-part.halfX - originX) / ray.directionX, second = (part.halfX - originX) / ray.directionX;
    if (first > second) { const swap = first; first = second; second = swap; }
    if (first > near) near = first;
    if (second < far) far = second;
  }
  if (Math.abs(ray.directionY) < 1e-9) { if (Math.abs(originY) > part.halfY) return -1; }
  else {
    let first = (-part.halfY - originY) / ray.directionY, second = (part.halfY - originY) / ray.directionY;
    if (first > second) { const swap = first; first = second; second = swap; }
    if (first > near) near = first;
    if (second < far) far = second;
  }
  if (Math.abs(ray.directionZ) < 1e-9) { if (Math.abs(originZ) > part.halfZ) return -1; }
  else {
    let first = (-part.halfZ - originZ) / ray.directionZ, second = (part.halfZ - originZ) / ray.directionZ;
    if (first > second) { const swap = first; first = second; second = swap; }
    if (first > near) near = first;
    if (second < far) far = second;
  }
  if (near > far || near <= 0) return -1;
  return near;
}

// Distance along a ray (in the world) to the nearest part of one object, or -1. Which part that was is left in
// `looseRayPartIndex` (the workshop's object tool asks).
let looseRayPartIndex = -1;
function intersectRayWithLooseObject(object, originX, originY, originZ, directionX, directionY, directionZ, nearerThan) {
  const toCentreX = object.x - originX, toCentreY = object.y - originY, toCentreZ = object.z - originZ;
  const projection = toCentreX * directionX + toCentreY * directionY + toCentreZ * directionZ;
  const boundsRadius = object.prepared.partsRadius;
  if (projection < -boundsRadius || projection - boundsRadius > nearerThan) return -1;
  const perpendicularSquared = toCentreX * toCentreX + toCentreY * toCentreY + toCentreZ * toCentreZ - projection * projection;
  if (perpendicularSquared > boundsRadius * boundsRadius) return -1;
  // The same ray in the object's own coordinates: the rotation undone.
  const matrix = object.matrix, ray = looseLocalRay;
  ray.originX = -(matrix[0] * toCentreX + matrix[3] * toCentreY + matrix[6] * toCentreZ);
  ray.originY = -(matrix[1] * toCentreX + matrix[4] * toCentreY + matrix[7] * toCentreZ);
  ray.originZ = -(matrix[2] * toCentreX + matrix[5] * toCentreY + matrix[8] * toCentreZ);
  ray.directionX = matrix[0] * directionX + matrix[3] * directionY + matrix[6] * directionZ;
  ray.directionY = matrix[1] * directionX + matrix[4] * directionY + matrix[7] * directionZ;
  ray.directionZ = matrix[2] * directionX + matrix[5] * directionY + matrix[8] * directionZ;
  let best = -1;
  const parts = object.prepared.parts;
  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex];
    let distance;
    if (part.shape === 'box') {
      distance = intersectRayWithLooseBox(part, ray);
    } else if (part.shape === 'ball') {
      distance = intersectRayWithSphere(part.centerX, part.centerY, part.centerZ, part.radius,
        ray.originX, ray.originY, ray.originZ, ray.directionX, ray.directionY, ray.directionZ);
    } else {
      const capsule = looseCapsuleScratch;
      capsule[0] = part.fromX; capsule[1] = part.fromY; capsule[2] = part.fromZ;
      capsule[3] = part.toX; capsule[4] = part.toY; capsule[5] = part.toZ; capsule[6] = part.radius;
      distance = intersectRayWithCapsule(capsule, 0, ray.originX, ray.originY, ray.originZ, ray.directionX, ray.directionY, ray.directionZ);
    }
    if (distance > 0.03 && distance < nearerThan && (best < 0 || distance < best)) { best = distance; looseRayPartIndex = partIndex; }
  }
  return best;
}

// The nearest loose object a ray meets before `nearerThan`, or null. Every scanner pulse asks this.
// `looseRaySkipped` is an object the ray passes through: what the beam is carrying, while the player's scanner
// asks what your eyes see past it; or a scan grenade, for its own light.
let looseRayDistance = 0;
let looseRaySkipped = null;
function findLooseObjectOnRay(originX, originY, originZ, directionX, directionY, directionZ, nearerThan) {
  let best = null;
  looseRayDistance = nearerThan;
  if (looseObjects.length <= LOOSE_FEW) {
    for (let objectIndex = 0; objectIndex < looseObjects.length; objectIndex++) {
      if (looseObjects[objectIndex] === looseRaySkipped) continue;
      const distance = intersectRayWithLooseObject(looseObjects[objectIndex], originX, originY, originZ, directionX, directionY, directionZ, looseRayDistance);
      if (distance > 0) { looseRayDistance = distance; best = looseObjects[objectIndex]; }
    }
    return best;
  }
  // Tile by tile along the ray, on the plan, asking only the objects noted in each tile it crosses. It stops
  // as soon as the tiles ahead are all further off than the nearest object found (or than `nearerThan`).
  let tileX = Math.floor(originX), tileZ = Math.floor(originZ);
  const stamp = ++looseStampCounter;
  const stepX = directionX > 0 ? 1 : -1, stepZ = directionZ > 0 ? 1 : -1;
  const deltaX = directionX !== 0 ? Math.abs(1 / directionX) : Infinity;
  const deltaZ = directionZ !== 0 ? Math.abs(1 / directionZ) : Infinity;
  let nextCrossingX = directionX > 0 ? (tileX + 1 - originX) / directionX : (directionX < 0 ? (tileX - originX) / directionX : Infinity);
  let nextCrossingZ = directionZ > 0 ? (tileZ + 1 - originZ) / directionZ : (directionZ < 0 ? (tileZ - originZ) / directionZ : Infinity);
  for (let iteration = 0; iteration < 200; iteration++) {
    if (tileX < 0 || tileZ < 0 || tileX >= GRID_WIDTH || tileZ >= GRID_DEPTH) break;
    const list = tileLooseLists[tileZ * GRID_WIDTH + tileX];
    if (list !== null) {
      for (let listIndex = 0; listIndex < list.length; listIndex++) {
        const object = list[listIndex];
        if (object.rayStamp === stamp) continue;
        object.rayStamp = stamp;
        if (object === looseRaySkipped) continue;
        const distance = intersectRayWithLooseObject(object, originX, originY, originZ, directionX, directionY, directionZ, looseRayDistance);
        if (distance > 0) { looseRayDistance = distance; best = object; }
      }
    }
    if (nextCrossingX < nextCrossingZ) {
      if (nextCrossingX >= looseRayDistance) break;
      tileX += stepX; nextCrossingX += deltaX;
    } else {
      if (nextCrossingZ >= looseRayDistance) break;
      tileZ += stepZ; nextCrossingZ += deltaZ;
    }
  }
  return best;
}

// How long a point scanned onto this object stays: for good while it lies still, a moment while it moves.
function getLooseObjectPointLifeCode(object) {
  return object.isAsleep ? 0 : convertSecondsToPointLifeCode(TUNING.looseImprintSeconds);
}

// ---------------------------------------------------------------------------
// What a ball of the shell is touching
// ---------------------------------------------------------------------------

function addLooseContact(normalX, normalY, normalZ, depth) {
  if (looseContactCount >= LOOSE_MAXIMUM_CONTACTS) return null;
  const contact = looseContacts[looseContactCount++];
  contact.normalX = normalX; contact.normalY = normalY; contact.normalZ = normalZ; contact.depth = depth;
  contact.velocityX = 0; contact.velocityZ = 0; contact.other = null; contact.isSoft = false; contact.isPlayer = false;
  return contact;
}

function isLooseSpaceOpenAt(tileX, tileZ, height) {
  if (!isInsideGrid(tileX, tileZ)) return false;
  const index = tileZ * GRID_WIDTH + tileX;
  return tileIsOpen[index] === 1 && tileFloorHeight[index] <= height && tileCeilingHeight[index] >= height;
}

// The ball's centre is inside something solid that fills this tile at this height (rock, the floor of a step,
// a lintel). Push it out through the nearest side that has room beyond it; `otherwise` is used when none has.
function addLooseContactOutOfTile(positionX, positionY, positionZ, radius, tileX, tileZ, otherwiseX, otherwiseY, otherwiseZ, otherwiseDepth) {
  let bestDepth = otherwiseDepth, normalX = otherwiseX, normalY = otherwiseY, normalZ = otherwiseZ;
  const toWest = positionX - tileX, toEast = tileX + 1 - positionX, toNorth = positionZ - tileZ, toSouth = tileZ + 1 - positionZ;
  if (toWest + radius < bestDepth && isLooseSpaceOpenAt(tileX - 1, tileZ, positionY)) { bestDepth = toWest + radius; normalX = -1; normalY = 0; normalZ = 0; }
  if (toEast + radius < bestDepth && isLooseSpaceOpenAt(tileX + 1, tileZ, positionY)) { bestDepth = toEast + radius; normalX = 1; normalY = 0; normalZ = 0; }
  if (toNorth + radius < bestDepth && isLooseSpaceOpenAt(tileX, tileZ - 1, positionY)) { bestDepth = toNorth + radius; normalX = 0; normalY = 0; normalZ = -1; }
  if (toSouth + radius < bestDepth && isLooseSpaceOpenAt(tileX, tileZ + 1, positionY)) { bestDepth = toSouth + radius; normalX = 0; normalY = 0; normalZ = 1; }
  if (bestDepth < Infinity) addLooseContact(normalX, normalY, normalZ, bestDepth);
}

function addLooseContactsWithBoxProp(prop, positionX, positionY, positionZ, radius) {
  const offsetX = positionX - prop.centerX, offsetZ = positionZ - prop.centerZ;
  const localX = offsetX * prop.cosineYaw + offsetZ * prop.sineYaw;
  const localZ = -offsetX * prop.sineYaw + offsetZ * prop.cosineYaw;
  const localY = positionY - prop.centerY;
  const nearestX = clampNumber(localX, -prop.halfX, prop.halfX);
  const nearestY = clampNumber(localY, -prop.halfY, prop.halfY);
  const nearestZ = clampNumber(localZ, -prop.halfZ, prop.halfZ);
  let deltaX = localX - nearestX, deltaY = localY - nearestY, deltaZ = localZ - nearestZ;
  const distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
  if (distanceSquared >= radius * radius) return;
  let depth;
  if (distanceSquared > 1e-10) {
    const distance = Math.sqrt(distanceSquared);
    deltaX /= distance; deltaY /= distance; deltaZ /= distance;
    depth = radius - distance;
  } else {
    // The centre is inside the box: out through the nearest face.
    const insideX = prop.halfX - Math.abs(localX), insideY = prop.halfY - Math.abs(localY), insideZ = prop.halfZ - Math.abs(localZ);
    deltaX = 0; deltaY = 0; deltaZ = 0;
    if (insideY <= insideX && insideY <= insideZ) { deltaY = localY < 0 ? -1 : 1; depth = insideY + radius; }
    else if (insideX <= insideZ) { deltaX = localX < 0 ? -1 : 1; depth = insideX + radius; }
    else { deltaZ = localZ < 0 ? -1 : 1; depth = insideZ + radius; }
  }
  addLooseContact(deltaX * prop.cosineYaw - deltaZ * prop.sineYaw, deltaY, deltaX * prop.sineYaw + deltaZ * prop.cosineYaw, depth);
}

function addLooseContactsWithCylinderProp(prop, positionX, positionY, positionZ, radius) {
  // `along` runs down the cylinder's axis; `acrossA` and `acrossB` are the two directions across it.
  const offsetX = positionX - prop.centerX, offsetY = positionY - prop.centerY, offsetZ = positionZ - prop.centerZ;
  let along, acrossA, acrossB;
  if (prop.axis === AXIS_Y) { along = offsetY; acrossA = offsetX; acrossB = offsetZ; }
  else if (prop.axis === AXIS_X) { along = offsetX; acrossA = offsetY; acrossB = offsetZ; }
  else { along = offsetZ; acrossA = offsetX; acrossB = offsetY; }
  const across = Math.sqrt(acrossA * acrossA + acrossB * acrossB);
  const overEnd = Math.abs(along) - prop.halfLength, overSide = across - prop.radius;
  if (overEnd >= radius || overSide >= radius) return;
  let normalAlong = 0, normalA = 0, normalB = 0, depth;
  const sign = along < 0 ? -1 : 1;
  if (overEnd <= 0 && overSide <= 0) {
    // Inside: out through whichever is nearer, the end or the side.
    if (-overEnd < -overSide) { normalAlong = sign; depth = -overEnd + radius; }
    else if (across > 1e-6) { normalA = acrossA / across; normalB = acrossB / across; depth = -overSide + radius; }
    else { normalAlong = sign; depth = -overEnd + radius; }
  } else if (overEnd <= 0) {
    normalA = acrossA / across; normalB = acrossB / across; depth = radius - overSide;
  } else if (overSide <= 0) {
    normalAlong = sign; depth = radius - overEnd;
  } else {
    // Off the rim.
    const distance = Math.sqrt(overEnd * overEnd + overSide * overSide);
    if (distance >= radius) return;
    normalAlong = sign * overEnd / distance; normalA = acrossA / across * overSide / distance; normalB = acrossB / across * overSide / distance;
    depth = radius - distance;
  }
  if (prop.axis === AXIS_Y) addLooseContact(normalA, normalAlong, normalB, depth);
  else if (prop.axis === AXIS_X) addLooseContact(normalAlong, normalA, normalB, depth);
  else addLooseContact(normalA, normalB, normalAlong, depth);
}

// How much of your push a thing of this weight takes out of your stride: 0 for something you kick along without
// feeling it, 1 for something that does not move for your shins at all and stops you.
function getLooseShoveResistance(mass) {
  return clampNumber((mass - TUNING.looseShoveFreeMass) / (TUNING.looseShoveBlockMass - TUNING.looseShoveFreeMass), 0, 1);
}

// Something that walks (you, the Hollow), as an upright post. It shoves the object along. The Hollow is not
// held up by anything. You are, by as much as the thing weighs: `resistance` is 0 to 1 (see above).
function addLooseContactWithWalker(isPlayer, resistance, walkerX, walkerZ, walkerRadius, bottomY, topY, velocityX, velocityZ, positionX, positionY, positionZ, radius) {
  if (positionY < bottomY - radius * 0.5 || positionY > topY + radius * 0.5) return;
  const deltaX = positionX - walkerX, deltaZ = positionZ - walkerZ;
  const distanceSquared = deltaX * deltaX + deltaZ * deltaZ, reach = walkerRadius + radius;
  if (distanceSquared >= reach * reach || distanceSquared < 1e-8) return;
  const distance = Math.sqrt(distanceSquared);
  const contact = addLooseContact(deltaX / distance, 0, deltaZ / distance, reach - distance);
  if (!contact) return;
  // The heavier it is, the less of your speed it takes up ...
  contact.velocityX = velocityX * (1 - resistance); contact.velocityZ = velocityZ * (1 - resistance);
  contact.isSoft = true; contact.isPlayer = isPlayer;
  // ... and the more of the overlap is yours to give back.
  const pushBack = (reach - distance) * resistance;
  if (isPlayer && pushBack > looseState.shoveBackDepth) {
    looseState.shoveBackDepth = pushBack;
    looseState.shoveBackX = -deltaX / distance; looseState.shoveBackZ = -deltaZ / distance;
  }
}

// Fills `looseContacts` with everything one ball of `object`'s shell overlaps.
function collectLooseContacts(object, positionX, positionY, positionZ, radius) {
  looseContactCount = 0;
  const firstTileX = Math.floor(positionX - radius), lastTileX = Math.floor(positionX + radius);
  const firstTileZ = Math.floor(positionZ - radius), lastTileZ = Math.floor(positionZ + radius);
  const stamp = ++collisionStampCounter;
  for (let tileZ = firstTileZ; tileZ <= lastTileZ; tileZ++) {
    for (let tileX = firstTileX; tileX <= lastTileX; tileX++) {
      const nearestX = clampNumber(positionX, tileX, tileX + 1), nearestZ = clampNumber(positionZ, tileZ, tileZ + 1);
      const deltaX = positionX - nearestX, deltaZ = positionZ - nearestZ;
      const acrossSquared = deltaX * deltaX + deltaZ * deltaZ;
      if (acrossSquared >= radius * radius) continue;
      const isBeside = acrossSquared > 1e-10;
      const across = isBeside ? Math.sqrt(acrossSquared) : 0;
      const index = tileZ * GRID_WIDTH + tileX;
      if (!isInsideGrid(tileX, tileZ) || tileIsOpen[index] === 0) {
        // Rock, from top to bottom.
        if (isBeside) addLooseContact(deltaX / across, 0, deltaZ / across, radius - across);
        else addLooseContactOutOfTile(positionX, positionY, positionZ, radius, tileX, tileZ, 0, 0, 0, Infinity);
        continue;
      }
      const floorHeight = tileFloorHeight[index], ceilingHeight = tileCeilingHeight[index];
      if (positionY - radius < floorHeight) {
        if (positionY >= floorHeight) {
          // Above this floor and close to it: flat on it, or over the edge of a step.
          const deltaY = positionY - floorHeight;
          const distanceSquared = acrossSquared + deltaY * deltaY;
          if (distanceSquared < radius * radius) {
            const distance = Math.sqrt(distanceSquared);
            if (distance > 1e-6) addLooseContact(deltaX / distance, deltaY / distance, deltaZ / distance, radius - distance);
            else addLooseContact(0, 1, 0, radius);
          }
        } else if (isBeside) {
          addLooseContact(deltaX / across, 0, deltaZ / across, radius - across); // the side of a step
        } else {
          addLooseContactOutOfTile(positionX, positionY, positionZ, radius, tileX, tileZ, 0, 1, 0, floorHeight - positionY + radius);
        }
      }
      if (positionY + radius > ceilingHeight) {
        if (positionY <= ceilingHeight) {
          const deltaY = ceilingHeight - positionY;
          const distanceSquared = acrossSquared + deltaY * deltaY;
          if (distanceSquared < radius * radius) {
            const distance = Math.sqrt(distanceSquared);
            if (distance > 1e-6) addLooseContact(deltaX / distance, -deltaY / distance, deltaZ / distance, radius - distance);
            else addLooseContact(0, -1, 0, radius);
          }
        } else if (isBeside) {
          addLooseContact(deltaX / across, 0, deltaZ / across, radius - across); // the wall over a doorway or a vent
        } else {
          addLooseContactOutOfTile(positionX, positionY, positionZ, radius, tileX, tileZ, 0, -1, 0, positionY - ceilingHeight + radius);
        }
      }
      const list = tilePropLists[index];
      if (list === null) continue;
      for (let listIndex = 0; listIndex < list.length; listIndex++) {
        const prop = list[listIndex];
        if (prop.collisionStamp === stamp) continue;
        prop.collisionStamp = stamp;
        if (prop.isRemoved) continue;
        if (positionY - radius > prop.maximumY || positionY + radius < prop.minimumY) continue;
        if (prop.kind === PROP_KIND_BOX) addLooseContactsWithBoxProp(prop, positionX, positionY, positionZ, radius);
        else if (prop.kind === PROP_KIND_CYLINDER) addLooseContactsWithCylinderProp(prop, positionX, positionY, positionZ, radius);
        else {
          const offsetX = positionX - prop.centerX, offsetY = positionY - prop.centerY, offsetZ = positionZ - prop.centerZ;
          const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ);
          if (distance < radius + prop.radius && distance > 1e-6) addLooseContact(offsetX / distance, offsetY / distance, offsetZ / distance, radius + prop.radius - distance);
        }
      }
    }
  }

  // Other loose objects: those noted in the tile this ball is in. (Anything near enough to touch it is noted there.)
  const ballTileX = Math.floor(positionX), ballTileZ = Math.floor(positionZ);
  const neighbours = ballTileX >= 0 && ballTileZ >= 0 && ballTileX < GRID_WIDTH && ballTileZ < GRID_DEPTH ? tileLooseLists[ballTileZ * GRID_WIDTH + ballTileX] : null;
  for (let objectIndex = 0; neighbours !== null && objectIndex < neighbours.length; objectIndex++) {
    const other = neighbours[objectIndex];
    if (other === object) continue;
    const offsetX = positionX - other.x, offsetY = positionY - other.y, offsetZ = positionZ - other.z;
    const reach = radius + other.prepared.boundsRadius;
    if (offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ >= reach * reach) continue;
    const shell = other.prepared.shell, matrix = other.matrix;
    for (let ballIndex = 0; ballIndex < other.prepared.shellCount; ballIndex++) {
      const localX = shell[ballIndex * 4], localY = shell[ballIndex * 4 + 1], localZ = shell[ballIndex * 4 + 2], otherRadius = shell[ballIndex * 4 + 3];
      const otherX = other.x + matrix[0] * localX + matrix[1] * localY + matrix[2] * localZ;
      const otherY = other.y + matrix[3] * localX + matrix[4] * localY + matrix[5] * localZ;
      const otherZ = other.z + matrix[6] * localX + matrix[7] * localY + matrix[8] * localZ;
      const deltaX = positionX - otherX, deltaY = positionY - otherY, deltaZ = positionZ - otherZ;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ, both = radius + otherRadius;
      if (distanceSquared >= both * both || distanceSquared < 1e-10) continue;
      const distance = Math.sqrt(distanceSquared);
      const contact = addLooseContact(deltaX / distance, deltaY / distance, deltaZ / distance, both - distance);
      if (!contact) break;
      contact.other = other;
    }
  }

  // You and the Hollow. What you are carrying passes through you: the beam has it. A kind with a step-over
  // height is only in your way where it stands higher than that: the part of it below is walked over.
  const stepOverHeight = object.kind.stepOverHeight || 0;
  if (!object.isHeld && game.mode === 'playing') {
    addLooseContactWithWalker(true, getLooseShoveResistance(object.kind.mass), player.x, player.z, TUNING.playerRadius, player.floorY + stepOverHeight, player.floorY + (player.isCrouching ? 1.0 : 1.7),
      looseState.playerStrideX, looseState.playerStrideZ, positionX, positionY, positionZ, radius);
  }
  if (hollow.isActive) {
    const figure = hollow.figure;
    addLooseContactWithWalker(false, 0, figure.x, figure.z, 0.34, figure.y + stepOverHeight, figure.y + 1.9,
      looseState.hollowVelocityX, looseState.hollowVelocityZ, positionX, positionY, positionZ, radius);
  }
}

// ---------------------------------------------------------------------------
// Pushes
// ---------------------------------------------------------------------------

// How readily the object turns when pushed about (x, y, z): the answer goes into `looseScratchVector`.
function applyLooseInverseInertia(object, x, y, z) {
  const matrix = object.matrix, prepared = object.prepared;
  const ownX = (matrix[0] * x + matrix[3] * y + matrix[6] * z) * prepared.inverseInertiaX;
  const ownY = (matrix[1] * x + matrix[4] * y + matrix[7] * z) * prepared.inverseInertiaY;
  const ownZ = (matrix[2] * x + matrix[5] * y + matrix[8] * z) * prepared.inverseInertiaZ;
  looseScratchVector.x = matrix[0] * ownX + matrix[1] * ownY + matrix[2] * ownZ;
  looseScratchVector.y = matrix[3] * ownX + matrix[4] * ownY + matrix[5] * ownZ;
  looseScratchVector.z = matrix[6] * ownX + matrix[7] * ownY + matrix[8] * ownZ;
  return looseScratchVector;
}

// How little a push along (directionX, Y, Z) at arm (armX, Y, Z) from the centre of mass moves that point.
function getLoosePushResistance(object, armX, armY, armZ, directionX, directionY, directionZ) {
  const turned = applyLooseInverseInertia(object,
    armY * directionZ - armZ * directionY, armZ * directionX - armX * directionZ, armX * directionY - armY * directionX);
  const crossX = turned.y * armZ - turned.z * armY, crossY = turned.z * armX - turned.x * armZ, crossZ = turned.x * armY - turned.y * armX;
  return object.prepared.inverseMass + crossX * directionX + crossY * directionY + crossZ * directionZ;
}

// A sudden push of (pushX, Y, Z) newton-seconds at arm (armX, Y, Z) from the centre of mass.
function pushLooseObject(object, armX, armY, armZ, pushX, pushY, pushZ) {
  const inverseMass = object.prepared.inverseMass;
  object.velocityX += pushX * inverseMass; object.velocityY += pushY * inverseMass; object.velocityZ += pushZ * inverseMass;
  const turned = applyLooseInverseInertia(object, armY * pushZ - armZ * pushY, armZ * pushX - armX * pushZ, armX * pushY - armY * pushX);
  object.spinX += turned.x; object.spinY += turned.y; object.spinZ += turned.z;
}

// Everything every moving object is touching at this moment, across all the balls of their shells. Worked out
// once per piece of a step for all of them, and then settled together. Taking the contacts one ball at a time
// makes a box that lands flat kick up on the corner that happened to be looked at first; taking the objects one
// at a time makes two things that lean on each other shove one another about for ever.
// How many touches one step can hold, over everything that is moving. An object the list has no room left for
// gets none, and falls through what it rests on: so there is room for a whole massive station awake at once
// (about 150 things, a vent cover lying flat touching with sixty balls), several times over.
const LOOSE_MAXIMUM_TOUCHES = 6000;
const LOOSE_SETTLE_PASSES = 8; // TWEAK: how many times the touches are gone over. More is steadier and slower.
const looseTouches = [];
for (let touchIndex = 0; touchIndex < LOOSE_MAXIMUM_TOUCHES; touchIndex++) {
  looseTouches.push({ object: null, normalX: 0, normalY: 0, normalZ: 0, depth: 0, armX: 0, armY: 0, armZ: 0, otherArmX: 0, otherArmY: 0, otherArmZ: 0,
    other: null, isSoft: false, isPlayer: false, velocityX: 0, velocityZ: 0, resistance: 1, wantedSpeed: 0, pushed: 0 });
}
let looseTouchCount = 0;
const looseMoving = []; // the objects that are not at rest, for the step in hand

// How fast the touching point of the object is moving away from what it touches (negative: into it).
function getLooseTouchSpeed(touch, alongX, alongY, alongZ) {
  const object = touch.object;
  let speedX = object.velocityX + object.spinY * touch.armZ - object.spinZ * touch.armY - touch.velocityX;
  let speedY = object.velocityY + object.spinZ * touch.armX - object.spinX * touch.armZ;
  let speedZ = object.velocityZ + object.spinX * touch.armY - object.spinY * touch.armX - touch.velocityZ;
  const other = touch.other;
  if (other) {
    speedX -= other.velocityX + other.spinY * touch.otherArmZ - other.spinZ * touch.otherArmY;
    speedY -= other.velocityY + other.spinZ * touch.otherArmX - other.spinX * touch.otherArmZ;
    speedZ -= other.velocityZ + other.spinX * touch.otherArmY - other.spinY * touch.otherArmX;
  }
  if (alongX === undefined) { looseScratchSpeed.x = speedX; looseScratchSpeed.y = speedY; looseScratchSpeed.z = speedZ; return 0; }
  return speedX * alongX + speedY * alongY + speedZ * alongZ;
}
const looseScratchSpeed = { x: 0, y: 0, z: 0 };

// Adds what one object is touching to the list.
function gatherLooseTouches(object) {
  const shell = object.prepared.shell, matrix = object.matrix;
  for (let ballIndex = 0; ballIndex < object.prepared.shellCount; ballIndex++) {
    const localX = shell[ballIndex * 4], localY = shell[ballIndex * 4 + 1], localZ = shell[ballIndex * 4 + 2], radius = shell[ballIndex * 4 + 3];
    const ballX = object.x + matrix[0] * localX + matrix[1] * localY + matrix[2] * localZ;
    const ballY = object.y + matrix[3] * localX + matrix[4] * localY + matrix[5] * localZ;
    const ballZ = object.z + matrix[6] * localX + matrix[7] * localY + matrix[8] * localZ;
    collectLooseContacts(object, ballX, ballY, ballZ, radius);
    for (let contactIndex = 0; contactIndex < looseContactCount && looseTouchCount < LOOSE_MAXIMUM_TOUCHES; contactIndex++) {
      const contact = looseContacts[contactIndex];
      let other = contact.other;
      // Two moving objects touch each other once, not once from each side: the one made later notes it.
      if (other && other.isMoving && other.id > object.id) continue;
      const touch = looseTouches[looseTouchCount++];
      const normalX = contact.normalX, normalY = contact.normalY, normalZ = contact.normalZ;
      const pointX = ballX - normalX * radius, pointY = ballY - normalY * radius, pointZ = ballZ - normalZ * radius;
      touch.object = object;
      touch.normalX = normalX; touch.normalY = normalY; touch.normalZ = normalZ; touch.depth = contact.depth;
      touch.armX = pointX - object.x; touch.armY = pointY - object.y; touch.armZ = pointZ - object.z;
      touch.other = other; touch.isSoft = contact.isSoft; touch.isPlayer = contact.isPlayer;
      touch.velocityX = contact.velocityX; touch.velocityZ = contact.velocityZ;
      touch.pushed = 0;
      touch.resistance = getLoosePushResistance(object, touch.armX, touch.armY, touch.armZ, normalX, normalY, normalZ);
      if (other) {
        touch.otherArmX = pointX - other.x; touch.otherArmY = pointY - other.y; touch.otherArmZ = pointZ - other.z;
      }
      // How fast it came in. This is measured from how it was moving before this piece of the step began: the
      // beam pressing a carried object against a wall, and gravity pressing one into the floor, are pushes and
      // not hits, and must neither bounce nor be heard.
      let cameInX = object.beforeVelocityX + object.beforeSpinY * touch.armZ - object.beforeSpinZ * touch.armY - touch.velocityX;
      let cameInY = object.beforeVelocityY + object.beforeSpinZ * touch.armX - object.beforeSpinX * touch.armZ;
      let cameInZ = object.beforeVelocityZ + object.beforeSpinX * touch.armY - object.beforeSpinY * touch.armX - touch.velocityZ;
      if (other) {
        const otherVelocityX = other.isMoving ? other.beforeVelocityX : other.velocityX, otherVelocityY = other.isMoving ? other.beforeVelocityY : other.velocityY, otherVelocityZ = other.isMoving ? other.beforeVelocityZ : other.velocityZ;
        const otherSpinX = other.isMoving ? other.beforeSpinX : other.spinX, otherSpinY = other.isMoving ? other.beforeSpinY : other.spinY, otherSpinZ = other.isMoving ? other.beforeSpinZ : other.spinZ;
        cameInX -= otherVelocityX + otherSpinY * touch.otherArmZ - otherSpinZ * touch.otherArmY;
        cameInY -= otherVelocityY + otherSpinZ * touch.otherArmX - otherSpinX * touch.otherArmZ;
        cameInZ -= otherVelocityZ + otherSpinX * touch.otherArmY - otherSpinY * touch.otherArmX;
      }
      const closingSpeed = -(cameInX * normalX + cameInY * normalY + cameInZ * normalZ);
      // What the Hollow has just kicked or thrown knocks other things about on its way: that is the Hollow's
      // doing as well, and no more startles it than the first thing did. (The second thing takes the first one's
      // time, so that a row of cans does not carry this on for ever.)
      if (other && closingSpeed > 0.3) {
        const isRecent = game.time - object.kickedByHollowTime < 3, isOtherRecent = game.time - other.kickedByHollowTime < 3;
        if (isRecent && !isOtherRecent) other.kickedByHollowTime = object.kickedByHollowTime;
        else if (isOtherRecent && !isRecent) object.kickedByHollowTime = other.kickedByHollowTime;
      }
      // Another object that lies at rest is as good as part of the floor, until it is hit hard enough to shift it.
      if (other && other.isAsleep) {
        if (closingSpeed > TUNING.looseWakeFromSpeed) wakeLooseObject(other);
        else { other = null; touch.other = null; }
      }
      if (other) touch.resistance += getLoosePushResistance(other, touch.otherArmX, touch.otherArmY, touch.otherArmZ, normalX, normalY, normalZ);
      // How fast it should be leaving once this is settled: not at all, or bouncing off if it came in fast.
      // In the beam it never bounces: the beam takes that up.
      touch.wantedSpeed = !touch.isSoft && !object.isHeld && closingSpeed > TUNING.looseBounceFromSpeed ? closingSpeed * object.kind.bounce : 0;
      if (touch.isSoft && !touch.isPlayer && closingSpeed > 0.3) object.kickedByHollowTime = game.time;
      if (closingSpeed > object.knockSpeed) {
        object.knockSpeed = closingSpeed;
        object.knockX = pointX; object.knockY = pointY; object.knockZ = pointZ;
        // A knock is yours when it is in the beam, when you have just let go of it, or when you walked into it.
        object.knockIsOwn = object.isHeld || game.time - object.lastHandledTime < 4 || touch.isPlayer;
      }
    }
  }
}

// Stops everything in the list going into what it touches, lets it bounce and grip, and notes how far each
// object has to move to be out again.
function settleLooseTouches() {
  const count = looseTouchCount;
  for (let pass = 0; pass < LOOSE_SETTLE_PASSES; pass++) {
    for (let touchIndex = 0; touchIndex < count; touchIndex++) {
      const touch = looseTouches[touchIndex], object = touch.object;
      const leavingSpeed = getLooseTouchSpeed(touch, touch.normalX, touch.normalY, touch.normalZ);
      // A touch can only push, never pull: what counts is the total it has given so far.
      const before = touch.pushed;
      touch.pushed = Math.max(0, before + (touch.wantedSpeed - leavingSpeed) / touch.resistance);
      const push = touch.pushed - before;
      if (push === 0) continue;
      pushLooseObject(object, touch.armX, touch.armY, touch.armZ, touch.normalX * push, touch.normalY * push, touch.normalZ * push);
      if (touch.other) pushLooseObject(touch.other, touch.otherArmX, touch.otherArmY, touch.otherArmZ, -touch.normalX * push, -touch.normalY * push, -touch.normalZ * push);
    }
  }
  for (let touchIndex = 0; touchIndex < count; touchIndex++) {
    const touch = looseTouches[touchIndex], object = touch.object, other = touch.other;
    object.touchedThisStep = true;
    if (other) other.touchedThisStep = true;
    if (touch.isSoft) continue;
    // Grip: a push against the slide, no stronger than the surface can give for how hard the two are pressed together.
    if (touch.pushed > 0) {
      getLooseTouchSpeed(touch);
      let slideX = looseScratchSpeed.x, slideY = looseScratchSpeed.y, slideZ = looseScratchSpeed.z;
      const into = slideX * touch.normalX + slideY * touch.normalY + slideZ * touch.normalZ;
      slideX -= touch.normalX * into; slideY -= touch.normalY * into; slideZ -= touch.normalZ * into;
      const slide = Math.sqrt(slideX * slideX + slideY * slideY + slideZ * slideZ);
      if (slide >= 1e-4) {
        slideX /= slide; slideY /= slide; slideZ /= slide;
        let slideResistance = getLoosePushResistance(object, touch.armX, touch.armY, touch.armZ, slideX, slideY, slideZ);
        if (other) slideResistance += getLoosePushResistance(other, touch.otherArmX, touch.otherArmY, touch.otherArmZ, slideX, slideY, slideZ);
        const grip = Math.min(object.kind.grip * touch.pushed, slide / slideResistance);
        pushLooseObject(object, touch.armX, touch.armY, touch.armZ, -slideX * grip, -slideY * grip, -slideZ * grip);
        if (other) pushLooseObject(other, touch.otherArmX, touch.otherArmY, touch.otherArmZ, slideX * grip, slideY * grip, slideZ * grip);
      }
    }
    // Out again. Four corners resting on the floor all ask for the same move, so the moves are not added up:
    // along each direction the largest one asked for is made, and most of it, not all (all at once makes an
    // object at rest shiver). Between two objects the lighter gives way more.
    if (touch.depth <= LOOSE_CONTACT_SLOP) continue;
    const amount = (touch.depth - LOOSE_CONTACT_SLOP) * 0.8;
    let share = 1;
    if (other && !other.isHeld) share = object.isHeld ? 0 : object.prepared.inverseMass / (object.prepared.inverseMass + other.prepared.inverseMass);
    noteLooseMove(object, touch.normalX * amount * share, touch.normalY * amount * share, touch.normalZ * amount * share);
    if (other && share < 1) noteLooseMove(other, -touch.normalX * amount * (1 - share), -touch.normalY * amount * (1 - share), -touch.normalZ * amount * (1 - share));
  }
}

function noteLooseMove(object, x, y, z) {
  if (x > object.moveEast) object.moveEast = x; else if (x < object.moveWest) object.moveWest = x;
  if (y > object.moveUp) object.moveUp = y; else if (y < object.moveDown) object.moveDown = y;
  if (z > object.moveSouth) object.moveSouth = z; else if (z < object.moveNorth) object.moveNorth = z;
}

// ---------------------------------------------------------------------------
// Stepping
// ---------------------------------------------------------------------------

// a * b for two rotations given as quaternions; the answer goes into `looseScratchTurn`.
const looseScratchTurn = { x: 0, y: 0, z: 0, w: 1 };
function multiplyLooseTurns(ax, ay, az, aw, bx, by, bz, bw) {
  looseScratchTurn.x = aw * bx + ax * bw + ay * bz - az * by;
  looseScratchTurn.y = aw * by - ax * bz + ay * bw + az * bx;
  looseScratchTurn.z = aw * bz + ax * by - ay * bx + az * bw;
  looseScratchTurn.w = aw * bw - ax * bx - ay * by - az * bz;
  return looseScratchTurn;
}

// Notes how the object is turned compared with the way you face. The beam holds it like that from now on.
function gripLooseObject(object) {
  const grip = multiplyLooseTurns(0, -Math.sin(-player.yaw / 2), 0, Math.cos(-player.yaw / 2),
    object.orientationX, object.orientationY, object.orientationZ, object.orientationW);
  object.gripX = grip.x; object.gripY = grip.y; object.gripZ = grip.z; object.gripW = grip.w;
}

// Pulls the carried object towards where the beam wants it, and keeps it turned the way it was taken hold of.
function driveHeldLooseObject(object, stepSeconds) {
  const kind = object.kind;
  // TWEAK: these two lines are how carrying feels. `follow` is how fast it wants to close the gap to that place
  // (per second); `response` how quickly it gets up to that speed. A heavy object is slower at both.
  const follow = TUNING.looseHoldFollowRate / (1 + kind.mass * TUNING.looseHoldLagPerKilogram);
  const response = Math.min(1, TUNING.looseHoldResponseRate / (1 + kind.mass * TUNING.looseHoldLagPerKilogram) * stepSeconds);
  let wantedX = (looseState.holdTargetX - object.x) * follow + looseState.playerVelocityX;
  let wantedY = (looseState.holdTargetY - object.y) * follow;
  let wantedZ = (looseState.holdTargetZ - object.z) * follow + looseState.playerVelocityZ;
  const wantedSpeed = Math.sqrt(wantedX * wantedX + wantedY * wantedY + wantedZ * wantedZ);
  if (wantedSpeed > TUNING.looseHoldFastestSpeed) {
    const scale = TUNING.looseHoldFastestSpeed / wantedSpeed;
    wantedX *= scale; wantedY *= scale; wantedZ *= scale;
  }
  object.velocityX += (wantedX - object.velocityX) * response;
  object.velocityY += (wantedY - object.velocityY) * response;
  object.velocityZ += (wantedZ - object.velocityZ) * response;

  // How it should be turned: the way you face, then the way it was turned when the beam took hold of it.
  // And the turn still to make from how it is to that, as an axis times an angle.
  const target = multiplyLooseTurns(0, Math.sin(-player.yaw / 2), 0, Math.cos(-player.yaw / 2), object.gripX, object.gripY, object.gripZ, object.gripW);
  const error = multiplyLooseTurns(target.x, target.y, target.z, target.w, -object.orientationX, -object.orientationY, -object.orientationZ, object.orientationW);
  let errorX = error.x, errorY = error.y, errorZ = error.z, errorW = error.w;
  if (errorW < 0) { errorX = -errorX; errorY = -errorY; errorZ = -errorZ; errorW = -errorW; }
  const sine = Math.sqrt(errorX * errorX + errorY * errorY + errorZ * errorZ);
  const angle = sine > 1e-5 ? 2 * Math.atan2(sine, errorW) : 0;
  // The beam's hold on how a thing is turned is weak. Knock it against something hard enough to turn it this
  // far and the beam gives: it holds the thing as the knock left it. That is how you turn what you carry.
  if (object.wasTouching && angle > TUNING.looseHoldSlipDegrees * DEGREES_TO_RADIANS) {
    gripLooseObject(object);
    return;
  }
  let turnX = 0, turnY = 0, turnZ = 0;
  if (angle > 0) {
    const rate = angle * TUNING.looseHoldTurnRate / (1 + kind.mass * TUNING.looseHoldLagPerKilogram) / sine;
    turnX = errorX * rate; turnY = errorY * rate; turnZ = errorZ * rate;
  }
  object.spinX += (turnX - object.spinX) * response;
  object.spinY += (turnY - object.spinY) * response;
  object.spinZ += (turnZ - object.spinZ) * response;
}

function integrateLooseObject(object, seconds) {
  object.x += object.velocityX * seconds; object.y += object.velocityY * seconds; object.z += object.velocityZ * seconds;
  const x = object.orientationX, y = object.orientationY, z = object.orientationZ, w = object.orientationW;
  const half = seconds * 0.5;
  object.orientationX = x + half * (object.spinX * w + object.spinY * z - object.spinZ * y);
  object.orientationY = y + half * (object.spinY * w + object.spinZ * x - object.spinX * z);
  object.orientationZ = z + half * (object.spinZ * w + object.spinX * y - object.spinY * x);
  object.orientationW = w - half * (object.spinX * x + object.spinY * y + object.spinZ * z);
  const length = Math.sqrt(object.orientationX * object.orientationX + object.orientationY * object.orientationY +
    object.orientationZ * object.orientationZ + object.orientationW * object.orientationW) || 1;
  object.orientationX /= length; object.orientationY /= length; object.orientationZ /= length; object.orientationW /= length;
  updateLooseObjectMatrix(object);
}

// One step of the whole world of loose objects: everything that is not at rest moves, and then everything
// that touches anything is settled together.
function stepLooseObjects(stepSeconds) {
  looseMoving.length = 0;
  // A fast object takes its step in pieces, so that it cannot be on one side of a shelf at the start of a
  // step and on the other at the end: no piece moves it further than half its smallest ball. They all take
  // the same number of pieces, the number the fastest one needs.
  let piecesNeeded = 1;
  for (let objectIndex = 0; objectIndex < looseObjects.length; objectIndex++) {
    const object = looseObjects[objectIndex];
    object.isMoving = !object.isAsleep;
    if (object.isAsleep) continue;
    looseMoving.push(object);
    object.wasTouching = object.touchedThisStep;
    object.touchedThisStep = false;
    const speed = Math.sqrt(object.velocityX * object.velocityX + object.velocityY * object.velocityY + object.velocityZ * object.velocityZ) +
      Math.sqrt(object.spinX * object.spinX + object.spinY * object.spinY + object.spinZ * object.spinZ) * object.prepared.boundsRadius;
    piecesNeeded = Math.max(piecesNeeded, speed * stepSeconds / (object.prepared.smallestRadius * 0.5));
  }
  if (looseMoving.length === 0) return;
  const pieces = clampNumber(Math.ceil(piecesNeeded), 1, 12);
  const seconds = stepSeconds / pieces;
  for (let piece = 0; piece < pieces; piece++) {
    for (let movingIndex = 0; movingIndex < looseMoving.length; movingIndex++) {
      const object = looseMoving[movingIndex];
      object.beforeVelocityX = object.velocityX; object.beforeVelocityY = object.velocityY; object.beforeVelocityZ = object.velocityZ;
      object.beforeSpinX = object.spinX; object.beforeSpinY = object.spinY; object.beforeSpinZ = object.spinZ;
      if (object.isHeld) driveHeldLooseObject(object, seconds);
      else object.velocityY -= TUNING.looseGravity * seconds;
      integrateLooseObject(object, seconds);
      refreshLooseObjectTiles(object);
      object.moveEast = 0; object.moveWest = 0; object.moveUp = 0; object.moveDown = 0; object.moveSouth = 0; object.moveNorth = 0;
    }
    looseTouchCount = 0;
    for (let movingIndex = 0; movingIndex < looseMoving.length; movingIndex++) gatherLooseTouches(looseMoving[movingIndex]);
    settleLooseTouches();
    for (let movingIndex = 0; movingIndex < looseMoving.length; movingIndex++) {
      const object = looseMoving[movingIndex];
      object.x += object.moveEast + object.moveWest; object.y += object.moveUp + object.moveDown; object.z += object.moveSouth + object.moveNorth;
    }
  }
  for (let movingIndex = 0; movingIndex < looseMoving.length; movingIndex++) finishLooseObjectStep(looseMoving[movingIndex], stepSeconds);
}

// What is left to do for one object when a step is over: the small losses, a check that it is still in the
// station, and whether it has come to rest.
function finishLooseObjectStep(object, stepSeconds) {
  object.isMoving = false;
  // Air and, on the ground, the small losses that bring a rolling thing to a stop.
  const drag = 1 - TUNING.looseAirDrag * stepSeconds;
  object.velocityX *= drag; object.velocityY *= drag; object.velocityZ *= drag;
  const spinDrag = 1 - (object.touchedThisStep ? TUNING.looseRollingDrag : TUNING.looseAirDrag) * stepSeconds;
  object.spinX *= spinDrag; object.spinY *= spinDrag; object.spinZ *= spinDrag;

  // Still in the station? An object that has got into the rock goes back to where it last was not.
  const tileX = Math.floor(object.x), tileZ = Math.floor(object.z);
  if (isLooseSpaceOpenAt(tileX, tileZ, object.y)) {
    object.lastGoodX = object.x; object.lastGoodY = object.y; object.lastGoodZ = object.z;
  } else if (!isInsideGrid(tileX, tileZ) || tileIsOpen[tileZ * GRID_WIDTH + tileX] === 0 ||
      object.y < tileFloorHeight[tileZ * GRID_WIDTH + tileX] - object.prepared.boundsRadius ||
      object.y > tileCeilingHeight[tileZ * GRID_WIDTH + tileX] + object.prepared.boundsRadius) {
    object.x = object.lastGoodX; object.y = object.lastGoodY; object.z = object.lastGoodZ;
    object.velocityX = 0; object.velocityY = 0; object.velocityZ = 0;
    looseState.statistics.putBack++;
  }

  // Rest: slow, touching something, and for long enough.
  if (!object.isHeld && object.touchedThisStep &&
      object.velocityX * object.velocityX + object.velocityY * object.velocityY + object.velocityZ * object.velocityZ < TUNING.looseRestSpeed * TUNING.looseRestSpeed &&
      object.spinX * object.spinX + object.spinY * object.spinY + object.spinZ * object.spinZ < TUNING.looseRestSpin * TUNING.looseRestSpin) {
    object.restSeconds += stepSeconds;
    if (object.restSeconds >= TUNING.looseRestSeconds) {
      object.isAsleep = true;
      object.velocityX = 0; object.velocityY = 0; object.velocityZ = 0;
      object.spinX = 0; object.spinY = 0; object.spinZ = 0;
    }
  } else {
    object.restSeconds = 0;
  }
}

// Is anything loose lying where this door's slab comes down? (What the beam is carrying does not count: you
// are standing there with it, and the door is open for you anyway.)
function isLooseObjectInDoorway(door) {
  const slab = door.slab;
  for (let objectIndex = 0; objectIndex < looseObjects.length; objectIndex++) {
    const object = looseObjects[objectIndex];
    if (object.isHeld) continue;
    const reach = object.prepared.boundsRadius;
    if (Math.abs(object.x - door.centerX) > slab.halfX + reach || Math.abs(object.z - door.centerZ) > slab.halfZ + reach) continue;
    if (object.y - reach > door.baseY + DOOR_OPENING_HEIGHT) continue;
    return true;
  }
  return false;
}

// Wakes every object at rest within `radius` metres of a place on the plan.
function wakeLooseObjectsNear(x, z, radius) {
  for (let objectIndex = 0; objectIndex < looseObjects.length; objectIndex++) {
    const object = looseObjects[objectIndex];
    if (!object.isAsleep) continue;
    const reach = radius + object.prepared.boundsRadius;
    if ((object.x - x) * (object.x - x) + (object.z - z) * (object.z - z) < reach * reach) wakeLooseObject(object);
  }
}

// Is someone walking into an object that is at rest? Then it is woken, and the next step does the rest.
function wakeLooseObjectIfWalkedInto(object, walkerX, walkerZ, walkerRadius, bottomY, topY) {
  const reach = walkerRadius + object.prepared.boundsRadius;
  const deltaX = object.x - walkerX, deltaZ = object.z - walkerZ;
  if (deltaX * deltaX + deltaZ * deltaZ > reach * reach) return;
  if (object.y + object.prepared.boundsRadius < bottomY || object.y - object.prepared.boundsRadius > topY) return;
  wakeLooseObject(object);
}

// ---------------------------------------------------------------------------
// Knocks: the sound, the noise the Hollow hears, the caption
// ---------------------------------------------------------------------------

function reportLooseObjectKnock(object) {
  const speed = object.knockSpeed;
  object.knockSpeed = 0;
  if (speed < TUNING.looseKnockFaintestSpeed) return;
  if (game.time - object.lastKnockTime < TUNING.looseKnockGapSeconds) return;
  object.lastKnockTime = game.time;
  if (damageLooseObject(object, speed)) return; // it shattered: that made its own noise, and there is nothing left to knock
  // 0 at the speed below which the Hollow hears nothing, 1 at a full-blooded crash.
  const loudness = clampNumber((speed - TUNING.looseKnockQuietSpeed) / (TUNING.looseKnockLoudSpeed - TUNING.looseKnockQuietSpeed), 0, 1);
  const isHeard = speed >= TUNING.looseKnockQuietSpeed;
  const weight = clampNumber(0.55 + object.kind.mass / 14, 0.6, 1.5) * (object.kind.loud || 1);
  playLooseObjectKnock(object.kind.material, isHeard ? 0.3 + loudness * 0.7 : 0.12, weight, object.knockX, object.knockY, object.knockZ);
  if (!isHeard) { looseState.statistics.knocksQuiet++; return; }
  looseState.statistics.knocksHeard++;
  const radius = interpolateLinear(TUNING.noiseRadiusKnockSoft, TUNING.noiseRadiusKnockHard, loudness) * weight;
  const lastKnock = looseState.lastKnock;
  lastKnock.x = object.knockX; lastKnock.z = object.knockZ; lastKnock.speed = speed; lastKnock.carries = radius; lastKnock.isOwn = object.knockIsOwn; lastKnock.time = game.time;
  // What the Hollow has just kicked makes its noise for you to hear, but does not startle the Hollow: it knows
  // what that was. (It goes after the thing all the same, if the thing is light: see updateHollowAfterKickedObjects.)
  // The same goes for what it has flung back at you, wherever that ends up, until you handle the thing again.
  const isOfTheHollowsOwnMaking = !object.knockIsOwn && (game.time - object.kickedByHollowTime < 3 || object.isIgnoredByHollow);
  if (!isOfTheHollowsOwnMaking) emitNoise(object.knockX, object.knockZ, radius);
  if (object.knockIsOwn) {
    // In the beam or just out of it, it is "it". Something you walked into has no name yet.
    const wasKicked = !object.isHeld && game.time - object.lastHandledTime >= 4 && object.kind.mass <= TUNING.looseShoveFreeMass * 2;
    showCaption(wasKicked ? 'ownObjectKicked' : (loudness > 0.55 ? 'ownObjectCrash' : 'ownObjectKnock'));
    if (!looseState.hasShownKnockHint && hollow.isActive) {
      looseState.hasShownKnockHint = true;
      showMessage(wasKicked ? 'You kicked something. That carried. Crouch, and what lies on the floor stays quiet.' : 'That carried. Move slowly with something in the beam and it will not knock.', 6, 'warning');
    }
  } else {
    showCaption(loudness > 0.55 ? 'objectCrash' : 'objectKnock', { x: object.knockX, z: object.knockZ });
  }
}

// ---------------------------------------------------------------------------
// What a knock costs
//
// Every hard knock takes something off what a thing is worth: nothing below looseDamageFromSpeed (a thing set
// down, or carried into a wall at a heavy walk), more the harder it is, and at looseDamageRuinSpeed the whole
// of its `fragile` share. It never goes below a tenth of what it was worth whole: scrap is still scrap.
// Glass does not wear down for long: hit harder than its `shattersAt`, a sample jar is gone, and what is
// left of it lies on the floor as broken glass (03-noisy-floor.js), loud to walk on like any other.
// It makes no difference who did the knocking. The Hollow kicking through a room costs you as well.
// ---------------------------------------------------------------------------

// Returns true if the thing was destroyed.
// (getLooseDamageShare says how much of its present worth one knock takes; the workshop's object tool asks it too.)
function getLooseDamageShare(kind, speed) {
  if (!kind.fragile || speed <= TUNING.looseDamageFromSpeed) return 0;
  return kind.fragile * clampNumber((speed - TUNING.looseDamageFromSpeed) / (TUNING.looseDamageRuinSpeed - TUNING.looseDamageFromSpeed), 0, 1);
}

function damageLooseObject(object, speed) {
  const kind = object.kind;
  if (kind.shattersAt && speed >= kind.shattersAt) { shatterLooseObject(object); return true; }
  const share = getLooseDamageShare(kind, speed);
  if (share <= 0 || kind.value <= 0) return false;
  const before = getLooseObjectValue(object);
  object.worth = Math.max(kind.value * TUNING.looseWorthLeastShare, object.worth * (1 - share));
  const after = getLooseObjectValue(object);
  if (after >= before) return false;
  looseState.statistics.worthLost += before - after;
  // Said only of what is yours just now (in the beam, or just out of it), and not for every scratch.
  if (object.knockIsOwn && (object.isHeld || game.time - object.lastHandledTime < 4) && game.time - looseState.lastDamageSaidTime > 1.5 && game.mode === 'playing') {
    looseState.lastDamageSaidTime = game.time;
    showMessage(object.isAppraised ? 'The ' + kind.label + ' took that badly: worth ' + after + ' now.' : 'The ' + kind.label + ' took that badly: it is worth less now.', 3.5, 'warning');
  }
  return false;
}

function shatterLooseObject(object) {
  const x = object.x, y = object.y, z = object.z, wasOwn = object.knockIsOwn, wasWorth = getLooseObjectValue(object), wasAppraised = object.isAppraised;
  const kind = object.kind, isGlass = kind.material === 'glass';
  const isOfTheHollowsOwnMaking = !wasOwn && (game.time - object.kickedByHollowTime < 3 || object.isIgnoredByHollow);
  removeLooseObject(object);
  looseState.statistics.shattered++;
  looseState.statistics.worthLost += wasWorth;
  looseState.statistics.knocksHeard++;
  if (isGlass) {
    // Glass: the crash, and what is left of it lies there as broken glass, loud to walk over.
    playLooseObjectKnock('glass', 1, 0.7, x, y, z);
    playNoisyFloorSound('glass', 1.6, { x: x, z: z });
    addBrokenGlassAt(x, z);
  } else {
    // Anything else set to break: its own sound, as hard as that gets, and nothing left of it.
    playLooseObjectKnock(kind.material, 1, clampNumber(0.55 + kind.mass / 14, 0.6, 1.5) * (kind.loud || 1), x, y, z);
  }
  if (!isOfTheHollowsOwnMaking) emitNoise(x, z, TUNING.noiseRadiusShatter);
  const lastKnock = looseState.lastKnock;
  lastKnock.x = x; lastKnock.z = z; lastKnock.speed = kind.shattersAt; lastKnock.carries = TUNING.noiseRadiusShatter; lastKnock.isOwn = wasOwn; lastKnock.time = game.time;
  if (wasOwn) {
    showCaption(isGlass ? 'ownObjectShatter' : 'ownObjectBreak');
    if (game.mode === 'playing') {
      showMessage('The ' + kind.label + (isGlass ? ' shatters.' : ' breaks apart.') + (wasAppraised ? ' That was worth ' + wasWorth + '.' : '') + (isGlass ? ' Mind the glass.' : ''), 5, 'warning');
    }
  } else {
    showCaption(isGlass ? 'objectShatter' : 'objectBreak', { x: x, z: z });
  }
}

// ---------------------------------------------------------------------------
// Carrying
// ---------------------------------------------------------------------------

function getHeldLooseObject() {
  return looseState.held;
}

// How much slower you walk with this in the beam: 1 is not at all.
function getCarrySpeedFactor() {
  const held = looseState.held;
  if (!held) return 1;
  return 1 / (1 + held.kind.mass * TUNING.carrySlowdownPerKilogram);
}

function canSprintWhileCarrying() {
  return !looseState.held || !looseState.held.kind.bulky;
}


// Where the carried object wants to be: straight out from the scanner's lens, along the way the scanner
// points, far enough to be clear of it, and a little lower for its weight. The scanner is in your right hand,
// so that is to the right of and below the middle of what you see. It goes wherever you point: at the floor to
// set it down, over your head if you look up.
function computeLooseHoldTarget(eyeX, eyeY, eyeZ) {
  const held = looseState.held;
  if (!held) return;
  computeHeldScannerBasis();
  updateScanEmitterAtLens(eyeX, eyeY, eyeZ);
  const distance = looseState.holdLength + held.prepared.partsRadius;
  looseState.holdTargetX = scanEmitter.x + scannerBasis.forwardX * distance;
  looseState.holdTargetY = scanEmitter.y + scannerBasis.forwardY * distance - held.kind.mass * TUNING.looseHoldSagPerKilogram;
  looseState.holdTargetZ = scanEmitter.z + scannerBasis.forwardZ * distance;
}

// `isByButton`: it is held for as long as the right mouse button is, and dropped when that is let go.
function pickUpLooseObject(object, isByButton) {
  if (looseState.held || !object || object.isRemoved) return false;
  wakeLooseObject(object);
  wakeLooseObjectsTouching(object);
  object.isHeld = true;
  object.restSeconds = 0;
  object.lastHandledTime = game.time;
  object.wasHandled = true; object.isIgnoredByHollow = false;
  looseState.held = object;
  // The line that says how to pick a thing up has done its work: it is not shown again, in this descent or any other.
  if (!settings.hasPickedSomethingUp) { settings.hasPickedSomethingUp = true; saveSettings(); }
  looseState.holdLength = TUNING.looseHoldDistance;
  gripLooseObject(object); // as it lies: the beam does not straighten it
  looseState.isHeldByButton = Boolean(isByButton);
  looseState.holdBreakTimer = 0;
  looseState.isLettingGo = false; // the press that picked it up is not also the press that lets go of it
  looseState.lettingGoSeconds = 0;
  playLooseObjectHandlingSound(object.kind.material, true);
  if (!looseState.hasShownCarryHint) {
    looseState.hasShownCarryHint = true;
    showMessage(input.isTouchDevice
      ? 'USE again lets go of it. Hold USE and let go to throw it.'
      : (isByButton ? 'It stays in the beam while you hold the button. Swing it and let go to throw it.' : 'E again lets go of it. Hold E and let go to throw it.'), 7, 'info');
  }
  return true;
}

// Lets go of what you carry. `throwStrength` is 0 for just letting go, up to 1 for a full throw.
function releaseHeldLooseObject(throwStrength) {
  const object = looseState.held;
  if (!object) return null;
  looseState.held = null;
  looseState.isLettingGo = false;
  looseState.lettingGoSeconds = 0;
  object.isHeld = false;
  object.lastHandledTime = game.time;
  if (throwStrength > 0) {
    const speed = TUNING.looseThrowSpeed * throwStrength / (1 + object.kind.mass * TUNING.looseThrowLossPerKilogram);
    const cosinePitch = Math.cos(player.pitch);
    const forwardX = Math.sin(player.yaw) * cosinePitch, forwardY = Math.sin(player.pitch), forwardZ = -Math.cos(player.yaw) * cosinePitch;
    object.velocityX = looseState.playerVelocityX + forwardX * speed;
    object.velocityY = forwardY * speed + TUNING.looseThrowLift * throwStrength;
    object.velocityZ = looseState.playerVelocityZ + forwardZ * speed;
    // It leaves the beam turning end over end, away from you.
    object.spinX += Math.cos(player.yaw) * -TUNING.looseThrowSpin * throwStrength;
    object.spinZ += Math.sin(player.yaw) * -TUNING.looseThrowSpin * throwStrength;
    playLooseObjectHandlingSound(object.kind.material, false);
  }
  return object;
}

// E was pressed with something in the beam and nothing in front of you to use (09-player.js calls this).
// What that press does is decided when the key comes up again: let go at once and it only lets go of the
// object; held, it winds up a throw.
function beginLettingGo() {
  if (!looseState.held) return;
  looseState.isLettingGo = true;
  looseState.lettingGoSeconds = 0;
}

function updateLooseCarryInput(dt) {
  // Q: set off what the beam is carrying, if it is something that does anything.
  if (input.wantsUseCarried) {
    input.wantsUseCarried = false;
    const carried = looseState.held;
    if (carried && carried.kind.use && !carried.isSpent && carried.armedTime < 0) carried.kind.use.activate(carried);
  }
  // The right mouse button: down on something in reach takes it into the beam, up lets it go as it is moving.
  if (input.isGrabHeld && !looseState.held && player.focusedLooseObject && !player.focusedLooseObject.isRemoved) {
    pickUpLooseObject(player.focusedLooseObject, true);
  } else if (looseState.held && looseState.isHeldByButton && !input.isGrabHeld) {
    releaseHeldLooseObject(0);
  }
  if (!looseState.held || !looseState.isLettingGo) { looseState.isLettingGo = false; looseState.lettingGoSeconds = 0; return; }
  const isDown = input.keysDown.has('KeyE') || input.touchUseHeld;
  if (isDown) { looseState.lettingGoSeconds += dt; return; }
  // The key is up. (A tap shorter than one frame arrives here with no time counted at all: that is a tap.)
  const held = looseState.lettingGoSeconds;
  if (held < TUNING.looseThrowTapSeconds) releaseHeldLooseObject(0);
  else releaseHeldLooseObject(clampNumber(held / TUNING.looseThrowChargeSeconds, 0.25, 1));
}

// How far the throw is wound up, 0 to 1, for the screen. 0 while the key is only being tapped.
function getThrowWindUp() {
  if (!looseState.held || !looseState.isLettingGo || looseState.lettingGoSeconds < TUNING.looseThrowTapSeconds) return 0;
  return clampNumber(looseState.lettingGoSeconds / TUNING.looseThrowChargeSeconds, 0.25, 1);
}

// The loose object you are looking at and can reach, with how well it is lined up (0 to 1), or null.
let looseFocusScore = 0;
function findLooseObjectInFocus(eyeX, eyeY, eyeZ, betterThan) {
  let best = null;
  looseFocusScore = betterThan;
  for (let objectIndex = 0; objectIndex < looseObjects.length; objectIndex++) {
    const object = looseObjects[objectIndex];
    if (object.isHeld) continue;
    const deltaX = object.x - eyeX, deltaY = object.y - eyeY, deltaZ = object.z - eyeZ;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
    if (distance > TUNING.looseBeamReach + object.prepared.boundsRadius) continue;
    const alignment = (deltaX * scannerBasis.forwardX + deltaY * scannerBasis.forwardY + deltaZ * scannerBasis.forwardZ) / Math.max(distance, 0.001);
    // A wide object does not need to be looked at dead centre.
    const score = Math.min(1, alignment + object.prepared.boundsRadius * 0.12);
    if (score <= looseFocusScore) continue;
    // Not through a wall or a closed door.
    if (distance > 0.3 && castRayAgainstWorld(eyeX, eyeY, eyeZ, deltaX / distance, deltaY / distance, deltaZ / distance, distance) &&
        rayHit.distance < distance - object.prepared.boundsRadius - 0.05) continue;
    looseFocusScore = score;
    best = object;
  }
  return best;
}

// ---------------------------------------------------------------------------
// In a station: what lies loose there when you arrive
//
// Worked out once when the station is built (`planStationLooseObjects`), from a sequence of random numbers of
// its own, so that a seed always gives the same things in the same places and nothing else in the station
// moves because of them. Put out again at the start of every descent (`spawnStationLooseObjects`).
// Each thing is put down at rest, as it would lie, and left out of the work until something touches it.
// ---------------------------------------------------------------------------

const stationLooseObjects = []; // { kindKey, x, y, z, orientation: [x, y, z, w], on: 'floor' | 'surface' }

// How a thing of this kind is turned when it lies as `lies` says and faces `yaw`: a quaternion.
function getLooseRestOrientation(kindKey, yaw, isOnItsSide, alongX) {
  let turned = { x: 0, y: 0, z: 0, w: 1 };
  if (isOnItsSide) {
    // A quarter turn over: about the line across you, or about the line ahead of you.
    turned = alongX ? { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } : { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
  }
  const product = multiplyLooseTurns(0, Math.sin(-yaw / 2), 0, Math.cos(-yaw / 2), turned.x, turned.y, turned.z, turned.w);
  return [product.x, product.y, product.z, product.w];
}

// How far below its centre of mass the lowest point of a thing is, turned like this: put it that far above
// a surface and it rests on it.
function getLooseRestHeight(kindKey, orientation) {
  const prepared = prepareLooseObjectKind(kindKey), shell = prepared.shell;
  const x = orientation[0], y = orientation[1], z = orientation[2], w = orientation[3];
  // The middle row of the rotation: what each of the thing's own directions contributes to height.
  const upX = 2 * (x * y + w * z), upY = 1 - 2 * (x * x + z * z), upZ = 2 * (y * z - w * x);
  let lowest = Infinity;
  for (let ballIndex = 0; ballIndex < prepared.shellCount; ballIndex++) {
    lowest = Math.min(lowest, shell[ballIndex * 4] * upX + shell[ballIndex * 4 + 1] * upY + shell[ballIndex * 4 + 2] * upZ - shell[ballIndex * 4 + 3]);
  }
  return -lowest;
}

// Is the floor round (x, z) bare for `reach` metres: all of it floor at this height, and nothing on it that
// stands more than a couple of centimetres proud?
function isLooseFloorClearAt(x, z, floorY, reach) {
  for (let tileZ = Math.floor(z - reach); tileZ <= Math.floor(z + reach); tileZ++) {
    for (let tileX = Math.floor(x - reach); tileX <= Math.floor(x + reach); tileX++) {
      if (!isInsideGrid(tileX, tileZ)) return false;
      const index = tileIndexAt(tileX, tileZ);
      if (tileIsOpen[index] !== 1 || Math.abs(tileFloorHeight[index] - floorY) > 0.01 || tileCeilingHeight[index] - floorY < 1.5) return false;
      if (tileFlags[index] & (TILE_FLAG_DOOR | TILE_FLAG_PIT | TILE_FLAG_WATER)) return false;
      const list = tilePropLists[index];
      if (!list) continue;
      for (const prop of list) {
        if (prop.isRemoved || prop.maximumY < floorY + 0.025 || prop.minimumY > floorY + 1.2) continue;
        if (Math.abs(prop.centerX - x) < prop.boundsHalfX + reach && Math.abs(prop.centerZ - z) < prop.boundsHalfZ + reach) return false;
      }
    }
  }
  return true;
}

// Where a vent's cover stands: in front of the mouth, out in the room, against the frame round the opening.
// (The frame stands 6 cm proud of the wall; the cover's lugs reach 6.5 cm behind its middle.)
const VENT_COVER_SEAT_METRES = 0.13;
function getVentCoverSeat(mouth) {
  return { x: mouth.faceX - mouth.outwardX * VENT_COVER_SEAT_METRES, z: mouth.faceZ - mouth.outwardZ * VENT_COVER_SEAT_METRES };
}

// Is there room for a cover to stand in front of this mouth? It is wider than the mouth, so it needs the wall to
// run on a little to either side, floor at the mouth's height under all of it, and nothing standing where it would.
function isVentCoverSeatClear(mouth) {
  const seat = getVentCoverSeat(mouth), halfWidth = 0.6, halfDepth = 0.1, height = 1.25;
  // Along the wall is across the way out of the mouth.
  const halfX = mouth.outwardX !== 0 ? halfDepth : halfWidth, halfZ = mouth.outwardX !== 0 ? halfWidth : halfDepth;
  for (let tileZ = Math.floor(seat.z - halfZ); tileZ <= Math.floor(seat.z + halfZ); tileZ++) {
    for (let tileX = Math.floor(seat.x - halfX); tileX <= Math.floor(seat.x + halfX); tileX++) {
      if (!isInsideGrid(tileX, tileZ)) return false;
      const index = tileIndexAt(tileX, tileZ);
      if (tileIsOpen[index] !== 1 || Math.abs(tileFloorHeight[index] - mouth.floorY) > 0.01 || tileCeilingHeight[index] - mouth.floorY < height) return false;
      if (tileFlags[index] & (TILE_FLAG_DOOR | TILE_FLAG_VENT | TILE_FLAG_PIT | TILE_FLAG_WATER)) return false;
      const list = tilePropLists[index];
      if (!list) continue;
      for (const prop of list) {
        if (prop.isRemoved || prop.isVentFrame || prop.maximumY < mouth.floorY + 0.025 || prop.minimumY > mouth.floorY + height) continue;
        if (Math.abs(prop.centerX - seat.x) < prop.boundsHalfX + halfX && Math.abs(prop.centerZ - seat.z) < prop.boundsHalfZ + halfZ) return false;
      }
    }
  }
  return true;
}

// Would a thing of this kind, put down at (x, z) turned like this, have all of itself over bare floor? A length
// of pipe is longer than a tile is wide: turned the wrong way in a narrow place, its end would be inside the wall.
function isLooseRestClearAt(kindKey, x, z, floorY, orientation) {
  const prepared = prepareLooseObjectKind(kindKey), shell = prepared.shell;
  const turnX = orientation[0], turnY = orientation[1], turnZ = orientation[2], turnW = orientation[3];
  for (let ballIndex = 0; ballIndex < prepared.shellCount; ballIndex++) {
    const localX = shell[ballIndex * 4], localY = shell[ballIndex * 4 + 1], localZ = shell[ballIndex * 4 + 2];
    // The top and bottom rows of the rotation: where the ball is east and south of the thing's centre.
    const offsetX = (1 - 2 * (turnY * turnY + turnZ * turnZ)) * localX + 2 * (turnX * turnY - turnW * turnZ) * localY + 2 * (turnX * turnZ + turnW * turnY) * localZ;
    const offsetZ = 2 * (turnX * turnZ - turnW * turnY) * localX + 2 * (turnY * turnZ + turnW * turnX) * localY + (1 - 2 * (turnX * turnX + turnY * turnY)) * localZ;
    if (!isLooseFloorClearAt(x + offsetX, z + offsetZ, floorY, shell[ballIndex * 4 + 3] + 0.02)) return false;
  }
  return true;
}

function addStationLooseObject(kindKey, x, surfaceY, z, yaw, isOnItsSide, alongX, on) {
  const orientation = getLooseRestOrientation(kindKey, yaw, isOnItsSide, alongX);
  stationLooseObjects.push({ kindKey: kindKey, x: x, y: surfaceY + getLooseRestHeight(kindKey, orientation) + 0.001, z: z, orientation: orientation, on: on });
}

// TWEAK: what the litter is, and what is worth carrying out, with how often each turns up among its sort.
const STATION_LITTER = [['carton', 5], ['plate', 3], ['can', 2]];
const STATION_VALUABLES_ON_THE_FLOOR = [['canister', 4], ['crate', 3], ['pipe', 3], ['toolCase', 2], ['pumpMotor', 1]];
const STATION_VALUABLES_ON_A_SURFACE = [['jar', 5], ['toolCase', 3], ['canister', 2]];

function drawFromLooseTable(table, random) {
  let total = 0;
  for (const entry of table) total += entry[1];
  let draw = random() * total;
  for (const entry of table) { draw -= entry[1]; if (draw < 0) return entry[0]; }
  return table[0][0];
}

// The flat tops in the station that something can be stood on: tables, shelves, crates, benches.
function findStationSurfaces() {
  const surfaces = [];
  for (const prop of worldProps) {
    if (prop.kind !== PROP_KIND_BOX || prop.isDynamic || prop.isRemoved || prop.objectId !== 0 || prop.surfaceClass === SURFACE_HAZARD) continue;
    if (prop.halfX < 0.2 || prop.halfZ < 0.2) continue;
    if (Math.abs(prop.sineYaw) > 0.01 && Math.abs(prop.cosineYaw) > 0.01) continue; // only those that stand square to the walls
    const floor = getFloorHeightAt(prop.centerX, prop.centerZ), top = prop.maximumY - floor;
    if (top < 0.35 || top > 1.35) continue;
    if (!isLooseSpaceOpenAt(Math.floor(prop.centerX), Math.floor(prop.centerZ), prop.maximumY + 0.2)) continue;
    surfaces.push(prop);
  }
  return surfaces;
}

// Is there room for something `halfWidth` wide and `height` high standing on `surface` at (x, z)?
function isStationSurfaceClearAt(surface, x, z, halfWidth, height) {
  // Whatever stands on it within reach, in whichever tile that is noted: a flask just across a tile line counts.
  for (let tileZ = Math.floor(z - halfWidth); tileZ <= Math.floor(z + halfWidth); tileZ++) {
    for (let tileX = Math.floor(x - halfWidth); tileX <= Math.floor(x + halfWidth); tileX++) {
      if (!isInsideGrid(tileX, tileZ)) continue;
      const list = tilePropLists[tileIndexAt(tileX, tileZ)];
      if (!list) continue;
      for (const other of list) {
        if (other === surface || other.isRemoved) continue;
        if (other.maximumY <= surface.maximumY + 0.005 || other.minimumY >= surface.maximumY + height) continue;
        if (Math.abs(other.centerX - x) < other.boundsHalfX + halfWidth && Math.abs(other.centerZ - z) < other.boundsHalfZ + halfWidth) return false;
      }
    }
  }
  return true;
}

// Can you still get round a tile when something too heavy to shove stands in the middle of it? True when the
// floor next to it (north, east, south, west) is all joined up by the floor round it, without stepping on it.
function isLooseTileEasyToPass(index) {
  const tileX = index % GRID_WIDTH, tileZ = (index - tileX) / GRID_WIDTH;
  // The eight tiles round it, in a ring: north, north-east, east, ... Each is next to the one before and after.
  const ringX = [0, 1, 1, 1, 0, -1, -1, -1], ringZ = [-1, -1, 0, 1, 1, 1, 0, -1], isFloor = [];
  for (let step = 0; step < 8; step++) {
    const nearX = tileX + ringX[step], nearZ = tileZ + ringZ[step];
    isFloor.push(isInsideGrid(nearX, nearZ) && tileIsWalkable[tileIndexAt(nearX, nearZ)] !== 0
      && Math.abs(tileFloorHeight[tileIndexAt(nearX, nearZ)] - tileFloorHeight[index]) < 0.01);
  }
  // Count the separate runs of floor in the ring that hold one of the four tiles next to this one.
  let runs = 0;
  for (let step = 0; step < 8; step++) {
    if (!isFloor[step] || isFloor[(step + 7) % 8]) continue; // not the start of a run
    let holdsNeighbour = false;
    for (let along = step; isFloor[along % 8] && along < step + 8; along++) if (along % 2 === 0) holdsNeighbour = true;
    if (holdsNeighbour) runs++;
  }
  return runs <= 1;
}

function planStationLooseObjects() {
  stationLooseObjects.length = 0;
  const random = createSeededRandomGenerator(Math.imul(level.seed + 1, 0x9E3779B1) ^ 0x10053e);
  // The cans, where the noisy floor's draw put them.
  for (const heap of noisyFloorCanHeaps) {
    const floor = tileFloorHeight[heap.index];
    // No two of a heap start inside each other: one that was drawn too near an earlier one is moved off it.
    const placedCans = [];
    for (const can of heap.cans) {
      let x = can.x, z = can.z;
      for (let round = 0; round < 6; round++) {
        for (const earlier of placedCans) {
          const awayX = x - earlier[0], awayZ = z - earlier[1], apart = Math.sqrt(awayX * awayX + awayZ * awayZ);
          if (apart >= 0.15) continue;
          if (apart < 0.001) { x += 0.15; continue; }
          x = earlier[0] + awayX / apart * 0.15; z = earlier[1] + awayZ / apart * 0.15;
        }
        x = clampNumber(x, heap.x - 0.4, heap.x + 0.4); z = clampNumber(z, heap.z - 0.4, heap.z + 0.4);
      }
      placedCans.push([x, z]);
      addStationLooseObject('can', x, floor, z, random() * TWO_PI, !can.isStanding, can.liesAlongX, 'floor');
    }
  }
  // The covers of the vents: standing in front of the mouth, or lying where they fell. They have numbers of
  // their own, so that nothing else here is moved by how many vents a station has.
  const coverRandom = createSeededRandomGenerator(Math.imul(level.seed + 1, 0x9E3779B1) ^ 0x7e47c0);
  const fallenCovers = []; // [x, z] of each cover that lies on the floor: nothing else is put down on top of one
  for (const mouth of level.ventMouths) {
    // It stands if the draw says so and there is room for it to (it is wider than the mouth: in a corner, or
    // with a shelf against the wall beside the vent, there is not).
    const canStand = isVentCoverSeatClear(mouth);
    let isInPlace = coverRandom() < TUNING.ventCoverInPlaceChance && canStand;
    // Where it lies otherwise: where the old grille lay if that floor is bare, or else a little further into the room.
    let fallenX = mouth.fallenX, fallenZ = mouth.fallenZ, hasFallenSpot = false;
    if (!isInPlace) {
      const tries = [[mouth.fallenX, mouth.fallenZ]];
      for (const back of [1.45, 1.75, 2.1]) tries.push([mouth.tileX + 0.5 - mouth.outwardX * back, mouth.tileZ + 0.5 - mouth.outwardZ * back]);
      for (const spot of tries) {
        let isBare = isLooseFloorClearAt(spot[0], spot[1], mouth.floorY, 0.72);
        for (const heap of noisyFloorCanHeaps) if (distanceBetweenPoints(heap.x, heap.z, spot[0], spot[1]) < 1.6) isBare = false;
        if (!isBare) continue;
        fallenX = spot[0]; fallenZ = spot[1]; hasFallenSpot = true;
        break;
      }
      // No bare floor for it to lie on (cans, a bench, a wall too near): it never came off, if it can stand.
      // If it can do neither, this mouth has no cover: somebody carried it off long ago.
      if (!hasFallenSpot) { if (canStand) isInPlace = true; else continue; }
    }
    if (isInPlace) {
      // Its face along the wall: turned a quarter if the vent runs east or west.
      const seat = getVentCoverSeat(mouth);
      addStationLooseObject('ventCover', seat.x, mouth.floorY, seat.z, mouth.outwardX !== 0 ? Math.PI / 2 : 0, false, false, 'vent');
    } else {
      fallenCovers.push([fallenX, fallenZ]);
      addStationLooseObject('ventCover', fallenX, mouth.floorY, fallenZ, mouth.fallenYaw, true, false, 'floor');
    }
  }
  const rooms = level.roomCount || 19;
  // Every tile of plain floor that will do, in a drawn order: for the litter, and for what stands on the floor.
  const tiles = [];
  for (let tileZ = level.boundsMinimumZ; tileZ < level.boundsMaximumZ; tileZ++) {
    for (let tileX = level.boundsMinimumX; tileX < level.boundsMaximumX; tileX++) {
      if (!isInsideGrid(tileX, tileZ)) continue;
      const index = tileIndexAt(tileX, tileZ);
      if (rateNoisyFloorTile(index) === 0 || (tileFlags[index] & TILE_FLAG_DEBRIS)) continue;
      let isTaken = false;
      for (const heap of noisyFloorCanHeaps) if (heap.index === index) isTaken = true;
      for (const cover of fallenCovers) if (Math.abs(cover[0] - tileX - 0.5) < 1.35 && Math.abs(cover[1] - tileZ - 0.5) < 1.35) isTaken = true;
      if (!isTaken) tiles.push([random(), index, rateNoisyFloorTile(index)]);
    }
  }
  tiles.sort(function (first, second) { return first[0] - second[0] || first[1] - second[1]; });
  let nextTile = 0;
  const litterWanted = Math.round(rooms * TUNING.looseLitterPerRoom);
  for (let count = 0; count < litterWanted && nextTile < tiles.length; count++, nextTile++) {
    const index = tiles[nextTile][1], kindKey = drawFromLooseTable(STATION_LITTER, random);
    const x = index % GRID_WIDTH + 0.25 + random() * 0.5, z = Math.floor(index / GRID_WIDTH) + 0.25 + random() * 0.5;
    addStationLooseObject(kindKey, x, tileFloorHeight[index], z, random() * TWO_PI, kindKey === 'can' && random() < 0.7, random() < 0.5, 'floor');
  }
  // What is worth carrying out: about half of it on tables and shelves, the rest on the floor, out of the way.
  const valuablesWanted = Math.round(rooms * TUNING.looseValuablesPerRoom);
  const surfaces = findStationSurfaces().map(function (surface) { return [random(), surface]; });
  surfaces.sort(function (first, second) { return first[0] - second[0] || first[1].centerX - second[1].centerX || first[1].centerZ - second[1].centerZ; });
  let placed = 0;
  for (let surfaceIndex = 0; surfaceIndex < surfaces.length && placed < Math.round(valuablesWanted * TUNING.looseValuablesShareOnSurfaces); surfaceIndex++) {
    const surface = surfaces[surfaceIndex][1], kindKey = drawFromLooseTable(STATION_VALUABLES_ON_A_SURFACE, random);
    const prepared = prepareLooseObjectKind(kindKey);
    // Three tries at a clear spot on it, away from its edges.
    for (let attempt = 0; attempt < 3; attempt++) {
      const reachX = Math.max(0, surface.boundsHalfX - prepared.boundsRadius - 0.03), reachZ = Math.max(0, surface.boundsHalfZ - prepared.boundsRadius - 0.03);
      const x = surface.centerX + (random() * 2 - 1) * reachX, z = surface.centerZ + (random() * 2 - 1) * reachZ;
      const yaw = random() * TWO_PI;
      if (prepared.boundsRadius > Math.min(surface.boundsHalfX, surface.boundsHalfZ) + 0.02) continue; // too big for it
      if (!isLooseSpaceOpenAt(Math.floor(x), Math.floor(z), surface.maximumY + 0.05)) continue;
      if (!isStationSurfaceClearAt(surface, x, z, prepared.boundsRadius, prepared.boundsRadius * 2 + 0.05)) continue;
      addStationLooseObject(kindKey, x, surface.maximumY, z, yaw, LOOSE_OBJECT_KINDS[kindKey].lies === 'onItsSide', false, 'surface');
      placed++;
      break;
    }
  }
  // The rest on the floor, in the tiles that are not where people have to walk.
  for (; placed < valuablesWanted && nextTile < tiles.length; nextTile++) {
    if (tiles[nextTile][2] !== 1) continue;
    const index = tiles[nextTile][1];
    let kindKey = drawFromLooseTable(STATION_VALUABLES_ON_THE_FLOOR, random);
    // What cannot be shoved aside does not go where it would stand in the only way through.
    if (LOOSE_OBJECT_KINDS[kindKey].mass >= TUNING.looseShoveBlockMass * 0.6 && !isLooseTileEasyToPass(index)) kindKey = 'canister';
    let lies = LOOSE_OBJECT_KINDS[kindKey].lies;
    let yaw = random() * TWO_PI;
    const sideDraw = lies === 'either' ? random() : 1, isTurnedTheOtherWay = random() < 0.5; // drawn exactly as they always were
    const centerX = index % GRID_WIDTH + 0.5, centerZ = Math.floor(index / GRID_WIDTH) + 0.5;
    // Something longer than its tile is turned, an eighth at a time, until all of it lies on bare floor. If no
    // way round fits (a pipe in a nook), a canister stands there instead.
    if (prepareLooseObjectKind(kindKey).boundsRadius > 0.45) {
      let fits = false;
      for (let turn = 0; turn < 4 && !fits; turn++) {
        const tried = yaw + turn * Math.PI / 4;
        const isOnItsSideTried = lies === 'onItsSide' || (lies === 'either' && sideDraw < 0.5);
        if (!isLooseRestClearAt(kindKey, centerX, centerZ, tileFloorHeight[index], getLooseRestOrientation(kindKey, tried, isOnItsSideTried, lies === 'onItsSide' ? false : isTurnedTheOtherWay))) continue;
        yaw = tried; fits = true;
      }
      if (!fits) { kindKey = 'canister'; lies = LOOSE_OBJECT_KINDS[kindKey].lies; }
    }
    const isOnItsSide = lies === 'onItsSide' || (lies === 'either' && sideDraw < 0.5);
    // Something round lies either way; a tool case lies on its broad side, never on its end.
    addStationLooseObject(kindKey, centerX, tileFloorHeight[index], centerZ, yaw,
      isOnItsSide, lies === 'onItsSide' ? false : isTurnedTheOtherWay, 'floor');
    placed++;
  }
  level.looseObjectCount = stationLooseObjects.length;
}

// Puts the station's loose things out, at rest. Whatever was loose before is cleared away first.
function spawnStationLooseObjects() {
  clearLooseObjects();
  for (const entry of stationLooseObjects) {
    const object = createLooseObject(entry.kindKey, entry.x, entry.y, entry.z, 0);
    setLooseObjectOrientation(object, entry.orientation[0], entry.orientation[1], entry.orientation[2], entry.orientation[3]);
    object.isAsleep = true;
    object.isFromTheStation = true;
  }
}

// Checks the station's loose things. Returns a list of problems (empty when fine).
function auditStationLooseObjects() {
  const problems = [];
  for (const entry of stationLooseObjects) {
    const where = entry.kindKey + ' at ' + entry.x.toFixed(1) + ', ' + entry.z.toFixed(1);
    if (!isLooseSpaceOpenAt(Math.floor(entry.x), Math.floor(entry.z), entry.y)) problems.push(where + ' is not in open space');
    const flagsThere = tileFlags[tileIndexAt(Math.floor(entry.x), Math.floor(entry.z))];
    if (flagsThere & (TILE_FLAG_DOOR | TILE_FLAG_PIT | TILE_FLAG_VENT)) problems.push(where + ' is in a doorway, a vent or the pit');
    // A vent's cover that still stands does so in front of a mouth, out in the room.
    if (entry.on === 'vent') {
      let isAtAMouth = false;
      for (const mouth of level.ventMouths) { const seat = getVentCoverSeat(mouth); if (distanceBetweenPoints(seat.x, seat.z, entry.x, entry.z) < 0.05) isAtAMouth = true; }
      if (!isAtAMouth) problems.push(where + ' should stand in front of the mouth of a vent and does not');
    }
    const zoneName = ZONE_NAMES[tileZone[tileIndexAt(Math.floor(entry.x), Math.floor(entry.z))]] || '';
    if (zoneName === 'LIFT CAR') problems.push(where + ' is in the lift car');
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Salvage: the bays, and what is sealed into them
//
// A station may have the 'haul' quest (09-quests.js): Salvage wants a sum's worth of what lies about. It goes
// into salvage bays: closets two tiles deep behind a door of their own, dug into the finished station where
// it has a doorway left over (findHaulBaySites and digHaulBay in 03-levelgen.js). The first is near the lift,
// the rest are spread through the station.
//
// A bay is shut until you open it at the panel beside its door. One bay is open at a time. An open bay has a
// lamp over its door that puts a patch of scan points on the floor in front of it about once a minute, and
// pings; it is on your map from then on. When what lies in it is worth its share, and you are out of it, its
// door comes down for good and what is inside is taken. Then the next bay has to be found and opened.
// ---------------------------------------------------------------------------

const haulState = {
  isActive: false,
  bays: [],            // { index, objectId, door, interactable, minimumX, maximumX, minimumZ, maximumZ, floorY, doorwayX, doorwayZ,
                       //   lampX, lampY, lampZ, spotX, spotZ, quota, state: 'shut' | 'open' | 'sealing' | 'sealed', taken, pulseTimer }
  target: 0,           // what Salvage wants in all: settled once the station's things are put out (settleHaulTarget)
  withinWalk: 0,       // what everything is worth that can be carried to a bay without crawling
  taken: 0,            // what has been sealed into bays so far
  announced: -1, checkTimer: 0
};

function clearHaulBays() {
  haulState.isActive = false; haulState.bays.length = 0;
  haulState.target = 0; haulState.withinWalk = 0; haulState.taken = 0; haulState.announced = -1;
}

// A new descent: every bay is shut and empty again.
function resetHaulBays() {
  haulState.taken = 0; haulState.announced = -1; haulState.checkTimer = 0;
  for (const bay of haulState.bays) { bay.state = 'shut'; bay.taken = 0; bay.pulseTimer = 0; bay.interactable.prompt = 'Open salvage bay ' + (bay.index + 1); }
}

// Makes one planned bay (a room of 03-levelgen.js's plan: its door hangs and its floor is dug by now) into a
// bay you can use: the panel beside its door, and what the code below needs to know about it.
// Returns where its panel is, for the quest and the map.
function buildHaulBay(planned, objectId, index) {
  const step = WALL_DIRECTIONS[planned.wall]; // from the room, through the door, into the bay
  const sideX = -step[1], sideZ = step[0];
  const door = doors.find(function (candidate) { return candidate.tileX === planned.doorTileX && candidate.tileZ === planned.doorTileZ; });
  const floorY = planned.floorY;
  const doorwayX = planned.doorTileX + 0.5, doorwayZ = planned.doorTileZ + 0.5;
  // The panel: on the wall beside the door, on the room's side, at hand height. (If there is no wall on either
  // side of the door to hang it on, the door itself is what you press.)
  clearPlacement();
  let panel = null, panelX = doorwayX - step[0] * 0.45, panelZ = doorwayZ - step[1] * 0.45;
  for (const side of [1, -1]) {
    const wallTileX = planned.doorTileX + sideX * side, wallTileZ = planned.doorTileZ + sideZ * side;
    if (isTileOpenAt(wallTileX, wallTileZ) || !isTileOpenAt(wallTileX - step[0], wallTileZ - step[1])) continue;
    panelX = wallTileX + 0.5 - step[0] * 0.53 - sideX * side * 0.22;
    panelZ = wallTileZ + 0.5 - step[1] * 0.53 - sideZ * side * 0.22;
    panel = addBoxProp(panelX, floorY + 1.25, panelZ, sideX !== 0 ? 0.13 : 0.03, 0.17, sideZ !== 0 ? 0.13 : 0.03,
      { surfaceClass: SURFACE_INTERACTIVE, blocksMovement: false, isDynamic: true, objectId: objectId });
    break;
  }
  const interactable = registerInteractable(objectId, panelX, floorY + 1.25, panelZ, 'Open salvage bay ' + (index + 1), panel ? [panel] : [], { mapLabel: 'BAY ' + (index + 1) });
  clearPlacement();
  let minimumX = GRID_WIDTH, maximumX = 0, minimumZ = GRID_DEPTH, maximumZ = 0;
  for (const tileIndex of planned.route) {
    const tileX = tileIndex % GRID_WIDTH, tileZ = (tileIndex - tileX) / GRID_WIDTH;
    minimumX = Math.min(minimumX, tileX); maximumX = Math.max(maximumX, tileX + 1);
    minimumZ = Math.min(minimumZ, tileZ); maximumZ = Math.max(maximumZ, tileZ + 1);
  }
  // How much floor there is in front of the door: the lamp's patch goes in the middle of the first two tiles
  // of it, or of the one tile there is if the door opens onto a narrow corridor.
  let floorInFront = 0;
  while (floorInFront < 2 && isTileOpenAt(planned.doorTileX - step[0] * (floorInFront + 1), planned.doorTileZ - step[1] * (floorInFront + 1))) floorInFront++;
  const spotDistance = 0.5 + Math.max(1, floorInFront) * 0.5;
  haulState.isActive = true;
  haulState.bays.push({
    index: index, objectId: objectId, door: door, interactable: interactable || findInteractableByObjectId(objectId),
    minimumX: minimumX, maximumX: maximumX, minimumZ: minimumZ, maximumZ: maximumZ, floorY: floorY,
    doorwayX: doorwayX, doorwayZ: doorwayZ,
    // The lamp: over the door on the room's side. The patch it lights: the floor a step or two in front of the door.
    lampX: doorwayX - step[0] * 0.62, lampY: floorY + 2.25, lampZ: doorwayZ - step[1] * 0.62,
    spotX: doorwayX - step[0] * spotDistance, spotZ: doorwayZ - step[1] * spotDistance,
    spotRadius: Math.min(TUNING.haulBayPulseMetres, floorInFront >= 2 ? 1.1 : 0.55),
    quota: 0, state: 'shut', taken: 0, pulseTimer: 0
  });
  return { x: panelX, z: panelZ };
}

function findHaulBayOfDoor(door) {
  for (const bay of haulState.bays) if (bay.door === door) return bay;
  return null;
}

// What 08-entities.js asks about a bay's door every frame: open while the bay is being filled, and at no other time.
function isHaulBayDoorWantedOpen(door) {
  const bay = findHaulBayOfDoor(door);
  return bay !== null && bay.state === 'open';
}

function findOpenHaulBay() {
  for (const bay of haulState.bays) if (bay.state === 'open' || bay.state === 'sealing') return bay;
  return null;
}

// What Salvage asks for: a share of what everything is worth that can be got to a bay on foot. (Something
// bulky does not go through a vent, so what lies where only a vent leads is left out of the sum: whatever
// is asked for can always be brought.) Each bay takes an even share of it. Called when the station's things
// have been put out.
function settleHaulTarget() {
  if (!haulState.isActive) return;
  const field = borrowTileField('haulWalk');
  field.fill(NAVIGATION_UNREACHABLE);
  let queueHead = 0, queueTail = 0;
  const startIndex = findNearestWalkableTileIndex(LIFT_POSITION.x, LIFT_POSITION.z);
  if (startIndex >= 0) { field[startIndex] = 0; navigationQueue[queueTail++] = startIndex; }
  while (queueHead < queueTail) {
    const index = navigationQueue[queueHead++];
    const tileX = index % GRID_WIDTH, tileZ = (index - tileX) / GRID_WIDTH;
    for (let direction = 0; direction < 4; direction++) {
      const neighbourX = tileX + (direction === 0 ? 1 : direction === 1 ? -1 : 0), neighbourZ = tileZ + (direction === 2 ? 1 : direction === 3 ? -1 : 0);
      if (!isInsideGrid(neighbourX, neighbourZ)) continue;
      const neighbourIndex = neighbourZ * GRID_WIDTH + neighbourX;
      if (tileIsWalkable[neighbourIndex] === 0 || field[neighbourIndex] === 0 || (tileFlags[neighbourIndex] & TILE_FLAG_VENT)) continue;
      if (Math.abs(tileFloorHeight[neighbourIndex] - tileFloorHeight[index]) > MAXIMUM_STEP_HEIGHT) continue;
      field[neighbourIndex] = 0;
      navigationQueue[queueTail++] = neighbourIndex;
    }
  }
  let withinWalk = 0;
  for (const entry of stationLooseObjects) {
    // On the floor it has walked to, or on a table that stands on the floor next to it.
    let isWithinWalk = false;
    for (let offsetZ = -1; offsetZ <= 1 && !isWithinWalk; offsetZ++) {
      for (let offsetX = -1; offsetX <= 1 && !isWithinWalk; offsetX++) {
        const tileX = Math.floor(entry.x) + offsetX, tileZ = Math.floor(entry.z) + offsetZ;
        if (isInsideGrid(tileX, tileZ) && field[tileIndexAt(tileX, tileZ)] === 0) isWithinWalk = true;
      }
    }
    if (isWithinWalk) withinWalk += LOOSE_OBJECT_KINDS[entry.kindKey].value;
  }
  haulState.withinWalk = withinWalk;
  haulState.target = Math.max(10, Math.round(withinWalk * TUNING.haulShareOfValue / 10) * 10);
  const share = Math.max(10, Math.ceil(haulState.target / haulState.bays.length / 10) * 10);
  for (const bay of haulState.bays) bay.quota = share;
}

function isPointInHaulBay(bay, x, z, margin) {
  return x > bay.minimumX - margin && x < bay.maximumX + margin && z > bay.minimumZ - margin && z < bay.maximumZ + margin;
}

function isLooseObjectInHaulBay(object, bay) {
  return !object.isHeld && isPointInHaulBay(bay, object.x, object.z, 0) && object.y > bay.floorY - 0.2 && object.y < bay.floorY + 2.4;
}

// What lies in a bay is worth this much.
function getHaulBayValue(bay) {
  let value = 0;
  for (let objectIndex = 0; objectIndex < looseObjects.length; objectIndex++) if (isLooseObjectInHaulBay(looseObjects[objectIndex], bay)) value += getLooseObjectValue(looseObjects[objectIndex]);
  return value;
}

// { done, total }: `done` is what has been sealed into bays plus what lies in the open one, and Salvage wants
// `total`. If so much has been lost (down the shaft, say) that what is left in the station is worth less than
// was asked, what is left is all that is asked: the quest can always be finished.
function getHaulProgress() {
  if (!haulState.isActive) return { done: 0, total: 0 };
  let stillThere = 0;
  for (let objectIndex = 0; objectIndex < looseObjects.length; objectIndex++) stillThere += getLooseObjectValue(looseObjects[objectIndex]);
  const open = findOpenHaulBay();
  const total = Math.min(haulState.target, haulState.taken + stillThere);
  return { done: Math.min(haulState.taken + (open ? getHaulBayValue(open) : 0), total), total: total };
}

// You press a bay's panel (09-quests.js calls this).
function useHaulBay(index) {
  const bay = haulState.bays[index];
  if (!bay) return;
  if (bay.state === 'sealed') { showMessage('SALVAGE BAY ' + (index + 1) + ': sealed.', 3, 'info'); return; }
  if (bay.state === 'open' || bay.state === 'sealing') {
    showMessage('SALVAGE BAY ' + (index + 1) + ': ' + getHaulBayValue(bay) + ' of ' + bay.quota + '. It seals itself when it holds enough and you are out of it.', 5, 'info');
    return;
  }
  const other = findOpenHaulBay();
  if (other !== null) {
    playDeniedSound();
    showMessage('SALVAGE BAY ' + (index + 1) + ': bay ' + (other.index + 1) + ' is still open. One at a time: fill that one first.', 5, 'warning');
    return;
  }
  const progress = getHaulProgress();
  if (progress.done >= progress.total) { showMessage('SALVAGE BAY ' + (index + 1) + ': nothing more is wanted.', 3, 'info'); return; }
  bay.state = 'open';
  bay.pulseTimer = 0.6; // the lamp comes on a moment after the door starts up
  bay.interactable.isDiscovered = true; // on the map from now on
  bay.interactable.prompt = 'Salvage bay ' + (index + 1) + ': what it holds';
  haulState.announced = progress.done; // (what it holds is said when that changes, not now)
  playPickupSound();
  emitNoise(bay.doorwayX, bay.doorwayZ, TUNING.noiseRadiusDoor);
  showMessage('Salvage bay ' + (index + 1) + ' open. It wants ' + Math.min(bay.quota, progress.total - progress.done) + ' worth.', 5, 'info');
  refreshObjective();
}

// The lamp over an open bay's door: a patch of scan points on the floor in front of it, and a ping.
function pulseHaulBay(bay) {
  bay.pulseTimer = TUNING.haulBayPulseSeconds;
  for (let ray = 0; ray < TUNING.haulBayPulseRays; ray++) {
    const angle = Math.random() * TWO_PI, reach = Math.sqrt(Math.random()) * bay.spotRadius;
    const directionX = bay.spotX + Math.cos(angle) * reach - bay.lampX, directionY = bay.floorY - bay.lampY, directionZ = bay.spotZ + Math.sin(angle) * reach - bay.lampZ;
    const length = Math.sqrt(directionX * directionX + directionY * directionY + directionZ * directionZ);
    fireScanPulse(bay.lampX, bay.lampY, bay.lampZ, directionX / length, directionY / length, directionZ / length, false);
  }
  playHaulBayPing(bay.lampX, bay.lampY, bay.lampZ);
  showCaption('salvageBayPing', { x: bay.doorwayX, z: bay.doorwayZ });
  emitNoise(bay.doorwayX, bay.doorwayZ, TUNING.noiseRadiusHaulBayPing);
}

// The door is down: what is inside is taken.
function finishSealingHaulBay(bay) {
  let value = 0;
  for (let objectIndex = looseObjects.length - 1; objectIndex >= 0; objectIndex--) {
    const object = looseObjects[objectIndex];
    if (!isLooseObjectInHaulBay(object, bay)) continue;
    value += getLooseObjectValue(object);
    removeLooseObject(object);
  }
  bay.state = 'sealed'; bay.taken = value;
  haulState.taken += value;
  bay.interactable.isAvailable = false;
  const progress = getHaulProgress();
  haulState.announced = progress.done;
  const isEnough = progress.done >= progress.total;
  const isAnotherLeft = haulState.bays.some(function (other) { return other.state === 'shut'; });
  showMessage('Salvage bay ' + (bay.index + 1) + ' sealed: ' + value + ' taken. ' + progress.done + ' of ' + progress.total + '.' +
    (isEnough ? ' That is what they asked for.' : (isAnotherLeft ? ' Find the next bay.' : '')), 6, 'info');
  saveCheckpoint();
  refreshObjective();
}

function updateHaulBays(dt) {
  if (!haulState.isActive) return;
  const bay = findOpenHaulBay();
  if (bay === null) return;
  // Are you in it, or in its doorway? Then its door stays up, whatever it holds.
  const isPlayerInTheWay = isPointInHaulBay(bay, player.x, player.z, 0.35) || distanceBetweenPoints(player.x, player.z, bay.doorwayX, bay.doorwayZ) < 0.95;
  if (bay.state === 'sealing') {
    if (isPlayerInTheWay) { bay.state = 'open'; return; } // back under the door before it was down: it goes up again
    if (bay.door.openFraction <= 0) finishSealingHaulBay(bay);
    return;
  }
  bay.pulseTimer -= dt;
  if (bay.pulseTimer <= 0) pulseHaulBay(bay);
  haulState.checkTimer -= dt;
  if (haulState.checkTimer > 0) return;
  haulState.checkTimer = 0.5;
  let isSettling = false;
  for (let objectIndex = 0; objectIndex < looseObjects.length; objectIndex++) {
    if (isLooseObjectInHaulBay(looseObjects[objectIndex], bay) && !looseObjects[objectIndex].isAsleep) isSettling = true;
  }
  if (isSettling) return; // wait until what was put in lies still
  const progress = getHaulProgress(), inside = getHaulBayValue(bay);
  if (progress.done !== haulState.announced) {
    haulState.announced = progress.done;
    showMessage('Salvage bay ' + (bay.index + 1) + ': ' + inside + ' of ' + bay.quota + '.', 4, 'info');
    refreshObjective();
  }
  // Enough in it (or enough in all): it seals, once you, the Hollow and anything in the doorway are out of the way.
  if (inside <= 0 || (inside < bay.quota && progress.done < progress.total)) return;
  if (isPlayerInTheWay || isLooseObjectInDoorway(bay.door)) return;
  if (hollow.isActive && isPointInHaulBay(bay, hollow.figure.x, hollow.figure.z, 0.6)) return;
  bay.state = 'sealing';
}

// For tests and debug mode: opens the bays one after another, carries what each one wants into it (the
// dearest things first) and seals it, until Salvage has what it asked for. Returns how many things were moved.
function fillHaulBays() {
  if (!haulState.isActive) return 0;
  let moved = 0;
  // The one that stands open first, then the rest in their order.
  const open = findOpenHaulBay();
  const inOrder = (open ? [open] : []).concat(haulState.bays.filter(function (bay) { return bay !== open; }));
  for (const bay of inOrder) {
    let progress = getHaulProgress();
    if (progress.done >= progress.total) break;
    if (bay.state === 'sealed') continue;
    bay.state = 'open'; bay.interactable.isDiscovered = true; bay.pulseTimer = TUNING.haulBayPulseSeconds;
    bay.interactable.prompt = 'Salvage bay ' + (bay.index + 1) + ': what it holds';
    const byWorth = looseObjects.filter(function (object) { return !object.isHeld && !isLooseObjectInHaulBay(object, bay); })
      .sort(function (first, second) { return getLooseObjectValue(second) - getLooseObjectValue(first) || first.id - second.id; });
    let placed = 0;
    for (const object of byWorth) {
      progress = getHaulProgress();
      if (getHaulBayValue(bay) >= bay.quota || progress.done >= progress.total) break;
      forgetLooseObjectInTiles(object);
      changePointsOnLooseObject(object, 0);
      const along = (placed % 4 + 0.5) / 4, across = (Math.floor(placed / 4) % 2 + 0.5) / 2;
      const isAlongX = bay.maximumX - bay.minimumX > bay.maximumZ - bay.minimumZ;
      object.x = isAlongX ? bay.minimumX + along * (bay.maximumX - bay.minimumX) : bay.minimumX + across;
      object.z = isAlongX ? bay.minimumZ + across : bay.minimumZ + along * (bay.maximumZ - bay.minimumZ);
      object.y = bay.floorY + object.prepared.boundsRadius + 0.02 + Math.floor(placed / 8) * 0.6;
      object.velocityX = 0; object.velocityY = 0; object.velocityZ = 0; object.spinX = 0; object.spinY = 0; object.spinZ = 0;
      object.lastGoodX = object.x; object.lastGoodY = object.y; object.lastGoodZ = object.z;
      noteLooseObjectInTiles(object);
      wakeLooseObject(object);
      placed++; moved++;
    }
    bay.door.openFraction = 0;
    finishSealingHaulBay(bay);
  }
  return moved;
}

// ---------------------------------------------------------------------------
// The Hollow and what it kicks
// ---------------------------------------------------------------------------

// Something light that the Hollow has just kicked rolls off, and it goes after it: for a few seconds, and not
// while it is hunting you. Then it loses interest in that thing for a while. (Something you threw at it works
// the same way, through the noise it made.)
// The Hollow goes into a vent, or comes out of one, and the cover still stands in front of the mouth. It does
// not push past it: it has it in its hands and throws it out across the room, and where that comes down it is
// as loud as a sheet of steel thrown eight metres a second is. That noise does not startle the Hollow.
function updateHollowAtVentCovers() {
  if (!hollow.isActive || level.ventMouths.length === 0) return;
  const figure = hollow.figure, reach = TUNING.hollowThrowsCoverMetres;
  for (const mouth of level.ventMouths) {
    // Where it is, measured from the middle of the mouth's face: `along` is positive inside the duct, negative out in the room.
    const along = (figure.x - mouth.faceX) * mouth.outwardX + (figure.z - mouth.faceZ) * mouth.outwardZ;
    const across = Math.abs((figure.x - mouth.faceX) * mouth.outwardZ - (figure.z - mouth.faceZ) * mouth.outwardX);
    if (Math.abs(along) > reach || across > 0.6 || Math.abs(figure.y - mouth.floorY) > 0.6) continue;
    // Only on its way through: towards the face of the mouth, from either side. Walking past along the wall is not.
    const speedAlong = looseState.hollowVelocityX * mouth.outwardX + looseState.hollowVelocityZ * mouth.outwardZ;
    if (along * speedAlong >= 0 || Math.abs(speedAlong) < 0.3) continue;
    const seat = getVentCoverSeat(mouth);
    for (const object of looseObjects) {
      if (object.kindKey !== 'ventCover' || object.isHeld || object.isRemoved || isLooseObjectLyingLow(object)) continue;
      if (distanceBetweenPoints(object.x, object.z, seat.x, seat.z) > 0.5 || game.time - object.kickedByHollowTime < 2) continue; // not there, or thrown a moment ago
      throwVentCoverFromHollow(object, mouth, along < 0);
      break;
    }
  }
}

function throwVentCoverFromHollow(object, mouth, isHollowInTheRoom) {
  // Coming out of the duct, it throws the cover straight out into the room, or up to about fifty degrees to
  // either side of that. Going in from the room it stands where that would hit it: it throws the cover away
  // along the wall, to one side or the other, and a little out into the room.
  const side = Math.random() < 0.5 ? -1 : 1;
  const angle = isHollowInTheRoom ? side * (1.1 + Math.random() * 0.3) : (Math.random() * 2 - 1) * 0.9;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const outX = -mouth.outwardX * cosine + mouth.outwardZ * sine, outZ = -mouth.outwardZ * cosine - mouth.outwardX * sine;
  changePointsOnLooseObject(object, TUNING.looseImprintSeconds); // what you scanned of it where it stood fades
  wakeLooseObjectsTouching(object);
  wakeLooseObject(object);
  object.velocityX = outX * TUNING.hollowThrowsCoverSpeed; object.velocityZ = outZ * TUNING.hollowThrowsCoverSpeed;
  object.velocityY = TUNING.hollowThrowsCoverLift;
  object.spinX = (Math.random() - 0.5) * 8; object.spinY = (Math.random() - 0.5) * 8; object.spinZ = (Math.random() - 0.5) * 8;
  object.kickedByHollowTime = game.time;
  object.wasHandled = false; object.isIgnoredByHollow = true;
  object.chaseUntil = undefined; object.chasedSince = game.time;
  looseState.statistics.coversThrown++;
  looseState.lastCoverThrown.x = object.x; looseState.lastCoverThrown.z = object.z; looseState.lastCoverThrown.towardsX = outX; looseState.lastCoverThrown.towardsZ = outZ; looseState.lastCoverThrown.time = game.time;
  playLooseObjectFlingSound(object.x, object.y, object.z);
  showCaption('hollowFling', { x: object.x, z: object.z });
}

function updateHollowAfterKickedObjects() {
  if (!hollow.isActive) return;
  for (let objectIndex = 0; objectIndex < looseObjects.length; objectIndex++) {
    const object = looseObjects[objectIndex];
    if (object.isHeld || !object.wasHandled || object.kind.mass > TUNING.hollowChasesKickedMass) continue;
    if (game.time - object.kickedByHollowTime > 0.5) continue; // not just now
    if (game.time - object.chasedSince > TUNING.hollowChasesAgainAfterSeconds) object.chasedSince = game.time; // a new chase begins
    if (game.time - object.chasedSince > TUNING.hollowChasesKickedSeconds) continue; // it has had enough of this one
    object.chaseUntil = Math.min(object.chasedSince + TUNING.hollowChasesKickedSeconds, game.time + 2);
  }
  // Go after the one most recently kicked that is still worth it.
  let chased = null;
  for (let objectIndex = 0; objectIndex < looseObjects.length; objectIndex++) {
    const object = looseObjects[objectIndex];
    if (object.chaseUntil !== undefined && game.time < object.chaseUntil && !object.isHeld && (chased === null || object.kickedByHollowTime > chased.kickedByHollowTime)) chased = object;
  }
  if (chased === null) return;
  if (!drawHollowTowards(chased.x, chased.z)) return; // it is hunting you, or held off: no time for this
  // It has batted the thing about for long enough and has it at its feet again: back to where it came from.
  if (chased.kind.mass <= TUNING.hollowFlingsMass && game.time - chased.chasedSince >= TUNING.hollowFlingsAfterSeconds
    && distanceBetweenPoints(hollow.figure.x, hollow.figure.z, chased.x, chased.z) < TUNING.hollowFlingsWithinMetres) flingLooseObjectFromHollow(chased);
}

// The Hollow picks a small thing up and throws it at you, or near enough. It lands with all the noise such a
// thing makes, and the Hollow does not come to that noise: it knows what it was.
function flingLooseObjectFromHollow(object) {
  const scatter = TUNING.hollowFlingsScatterMetres, angle = Math.random() * TWO_PI, reach = Math.sqrt(Math.random()) * scatter;
  const targetX = player.x + Math.cos(angle) * reach, targetZ = player.z + Math.sin(angle) * reach, targetY = player.floorY + 0.6;
  // From where its arm would let go: over its own feet, clear of the floor.
  const fromY = getFloorHeightAt(hollow.figure.x, hollow.figure.z) + 1.3;
  if (!isLooseSpaceOpenAt(Math.floor(hollow.figure.x), Math.floor(hollow.figure.z), fromY)) return false;
  forgetLooseObjectInTiles(object);
  changePointsOnLooseObject(object, TUNING.looseImprintSeconds); // what you scanned of it where it lay fades
  wakeLooseObjectsTouching(object);
  object.x = hollow.figure.x; object.y = fromY; object.z = hollow.figure.z;
  noteLooseObjectInTiles(object);
  wakeLooseObject(object);
  let deltaX = targetX - object.x, deltaZ = targetZ - object.z, across = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
  // It throws only so far: from further off than that, the thing comes down on the way to you.
  const furthest = TUNING.hollowFlingsSpeed * 1.1;
  if (across > furthest) { deltaX *= furthest / across; deltaZ *= furthest / across; across = furthest; }
  // A flat, fast throw: as long in the air as its speed takes to cover the ground, but never a lob.
  const seconds = clampNumber(across / TUNING.hollowFlingsSpeed, 0.25, 1.1);
  object.velocityX = deltaX / seconds; object.velocityZ = deltaZ / seconds;
  object.velocityY = (targetY - object.y) / seconds + 0.5 * TUNING.looseGravity * seconds;
  object.spinX = (Math.random() - 0.5) * 14; object.spinY = (Math.random() - 0.5) * 14; object.spinZ = (Math.random() - 0.5) * 14;
  object.lastGoodX = object.x; object.lastGoodY = object.y; object.lastGoodZ = object.z;
  object.kickedByHollowTime = game.time;
  object.wasHandled = false; object.isIgnoredByHollow = true;
  object.chaseUntil = undefined; object.chasedSince = game.time;
  looseState.statistics.flungBack++;
  looseState.lastFling.x = hollow.figure.x; looseState.lastFling.z = hollow.figure.z; looseState.lastFling.targetX = targetX; looseState.lastFling.targetZ = targetZ; looseState.lastFling.time = game.time; looseState.lastFling.id = object.id;
  playLooseObjectFlingSound(hollow.figure.x, fromY, hollow.figure.z);
  showCaption('hollowFling', { x: hollow.figure.x, z: hollow.figure.z });
  return true;
}

// ---------------------------------------------------------------------------
// The scan grenade
// ---------------------------------------------------------------------------

// Q, with it in the beam: the pin is out. It goes off a moment after it first hits something once you have let
// go of it, or when its fuse runs out, wherever it is by then.
function armScanGrenade(object) {
  object.armedTime = game.time;
  object.goesOffTime = game.time + TUNING.scanGrenadeFuseSeconds;
  object.hasLanded = false;
  playScanGrenadeSound('arm', object.x, object.y, object.z);
  showMessage('Armed. It goes off where it lands. Throw it.', 4, 'warning');
}

function updateScanGrenade(object, dt) {
  if (object.isSpent || object.armedTime < 0) return;
  // Thrown, and it has just hit something for the first time: that is where it goes off.
  if (!object.isHeld && !object.hasLanded && object.knockSpeed > TUNING.looseKnockFaintestSpeed) {
    object.hasLanded = true;
    object.goesOffTime = Math.min(object.goesOffTime, game.time + TUNING.scanGrenadeLandingSeconds);
  }
  if (game.time < object.goesOffTime) return;
  if (object.burstSeconds === 0) {
    // It goes off.
    playScanGrenadeSound('burst', object.x, object.y, object.z);
    showCaption('scanGrenade', { x: object.x, z: object.z });
    emitNoise(object.x, object.z, TUNING.noiseRadiusScanGrenade);
    object.burstHitsOnHollow = 0;
  }
  // Its light: pulses in every direction from where it is, a share of them each frame, for as long as it lasts.
  const pulsesInAll = QUALITY_PRESETS[settings.quality].sweepRays * TUNING.scanGrenadeSweeps;
  object.burstBudget += pulsesInAll * Math.min(dt, TUNING.scanGrenadeBurstSeconds - object.burstSeconds) / TUNING.scanGrenadeBurstSeconds;
  const pulses = Math.min(4000, Math.floor(object.burstBudget));
  object.burstBudget -= pulses;
  looseRaySkipped = object; // its own light does not stop on its own case
  for (let pulse = 0; pulse < pulses; pulse++) {
    // Evenly over the whole sphere: a height between pole and pole, and a turn round the upright. But not onto
    // whatever it is lying against. A pulse that would land within a hand of it (on the floor under it, on
    // the wall it has rolled up to, on the ceiling of a duct) is not fired; another direction is drawn instead,
    // a few times over. So its light goes away from whatever it is up against, whichever way that is, and a
    // grenade that goes off in mid-air lights everything round it, the floor below included.
    for (let attempt = 0; attempt < 8; attempt++) {
      const height = Math.random() * 2 - 1, turn = Math.random() * TWO_PI, across = Math.sqrt(1 - height * height);
      const landed = fireScanPulseBeyond(object.x, object.y + 0.03, object.z, Math.cos(turn) * across, height, Math.sin(turn) * across,
        attempt < 7 ? TUNING.scanGrenadePatchMetres : 0); // shut in on every side, it lights what there is
      if (landed === -1) continue;
      if (landed === 1 && rayHit.figure === hollow.figure) object.burstHitsOnHollow++;
      break;
    }
  }
  looseRaySkipped = null;
  if (object.burstHitsOnHollow >= TUNING.scanGrenadeStunHits && !object.hasStunned) object.hasStunned = stunHollow(TUNING.scanGrenadeStunSeconds);
  object.burstSeconds += dt;
  if (object.burstSeconds >= TUNING.scanGrenadeBurstSeconds) {
    object.isSpent = true;
    looseState.statistics.grenadesSpent++;
  }
}

// What the screen calls an object: a thing that has been used up says so.
function getLooseObjectLabel(object) {
  if (object.isSpent) return 'spent ' + object.kind.label;
  if (object.armedTime >= 0) return object.kind.label + ', armed';
  return object.kind.label;
}

// ---------------------------------------------------------------------------
// Every frame
// ---------------------------------------------------------------------------

// Notes how fast you really moved this frame, for the next one. A jump of metres is a teleport, not a speed.
function rememberPlayerMovement(dt) {
  const movedX = player.x - looseState.playerLastX, movedZ = player.z - looseState.playerLastZ;
  const isSpeed = looseState.playerWasThere && dt > 0 && movedX * movedX + movedZ * movedZ < 1;
  looseState.playerVelocityX = isSpeed ? movedX / dt : 0;
  looseState.playerVelocityZ = isSpeed ? movedZ / dt : 0;
  looseState.playerLastX = player.x; looseState.playerLastZ = player.z; looseState.playerWasThere = true;
}

function updateLooseObjects(dt, eyeX, eyeY, eyeZ) {
  updateLooseCarryInput(dt);
  updateHaulBays(dt);
  if (looseObjects.length === 0) { rememberPlayerMovement(dt); return; }
  computeLooseHoldTarget(eyeX, eyeY, eyeZ);
  // How far you walked since the last frame, before anything you carry has had its say.
  let walkedX = player.x - looseState.playerLastX, walkedZ = player.z - looseState.playerLastZ;
  if (!looseState.playerWasThere || walkedX * walkedX + walkedZ * walkedZ > 1) { walkedX = 0; walkedZ = 0; }
  looseState.playerStrideX = dt > 0 ? walkedX / dt : 0; looseState.playerStrideZ = dt > 0 ? walkedZ / dt : 0;

  // How fast the Hollow is moving, from where it was a frame ago: it kicks what lies in its way.
  if (hollow.isActive) {
    if (looseState.hollowWasActive && dt > 0) {
      looseState.hollowVelocityX = clampNumber((hollow.figure.x - looseState.hollowLastX) / dt, -8, 8);
      looseState.hollowVelocityZ = clampNumber((hollow.figure.z - looseState.hollowLastZ) / dt, -8, 8);
    }
    looseState.hollowLastX = hollow.figure.x; looseState.hollowLastZ = hollow.figure.z;
  }
  looseState.hollowWasActive = hollow.isActive;

  for (let objectIndex = 0; objectIndex < looseObjects.length; objectIndex++) {
    const object = looseObjects[objectIndex];
    if (!object.isAsleep) continue;
    if (player.isMoving) wakeLooseObjectIfWalkedInto(object, player.x, player.z, TUNING.playerRadius, player.floorY, player.floorY + 1.7);
    if (hollow.isActive) wakeLooseObjectIfWalkedInto(object, hollow.figure.x, hollow.figure.z, 0.34, hollow.figure.y, hollow.figure.y + 1.9);
  }

  looseState.shoveBackDepth = 0;
  looseState.accumulator = Math.min(looseState.accumulator + dt, TUNING.looseStepSeconds * 8);
  while (looseState.accumulator >= TUNING.looseStepSeconds) {
    looseState.accumulator -= TUNING.looseStepSeconds;
    stepLooseObjects(TUNING.looseStepSeconds);
  }

  updateHollowAtVentCovers();
  updateHollowAfterKickedObjects();
  for (let objectIndex = looseObjects.length - 1; objectIndex >= 0; objectIndex--) {
    const object = looseObjects[objectIndex];
    if (object.kind.update) object.kind.update(object, dt);
    if (object.knockSpeed > 0) reportLooseObjectKnock(object);
    if (object.y < PIT_NO_RETURN_DEPTH) {
      looseState.statistics.lostDownThePit++;
      removeLooseObject(object);
    }
  }

  // Something heavy on the floor that you walked into gives you back what it did not take.
  if (looseState.shoveBackDepth > 0) {
    const resolved = resolveBodyCollision(player.x + looseState.shoveBackX * looseState.shoveBackDepth, player.z + looseState.shoveBackZ * looseState.shoveBackDepth,
      TUNING.playerRadius, player.isCrouching ? 1.0 : 1.7, getFloorHeightAt(player.x, player.z));
    player.x = resolved.x; player.z = resolved.z;
  }

  const held = looseState.held;
  // What you carry is against something straight ahead: the beam gives. It holds the thing nearer to you, by
  // as much as the thing is short of where the beam wanted it, so you can walk right up to a wall with it.
  // It lets it out again as soon as there is room. (Only along the beam: a thing caught to one side, or left
  // behind, is not brought round to you.)
  if (held) {
    const shortBy = (looseState.holdTargetX - held.x) * scannerBasis.forwardX + (looseState.holdTargetY - held.y) * scannerBasis.forwardY + (looseState.holdTargetZ - held.z) * scannerBasis.forwardZ;
    let length = looseState.holdLength;
    if (held.touchedThisStep && shortBy > TUNING.looseHoldGiveSlack) length = Math.max(TUNING.looseHoldShortestDistance, length - (shortBy - TUNING.looseHoldGiveSlack));
    // Out again: at once when it touches nothing, and feeling its way (a quarter as fast) while it still does.
    else length = Math.min(TUNING.looseHoldDistance, length + TUNING.looseHoldLetOutSpeed * (held.touchedThisStep ? 0.25 : 1) * dt);
    if (length !== looseState.holdLength) {
      // The hold point moves with it at once, so that what is left of the gap below is only what the beam could not take up.
      const change = length - looseState.holdLength;
      looseState.holdLength = length;
      looseState.holdTargetX += scannerBasis.forwardX * change; looseState.holdTargetY += scannerBasis.forwardY * change; looseState.holdTargetZ += scannerBasis.forwardZ * change;
    }
  }
  // It can come no nearer (or it is caught to one side) and you are walking on into it: it stops you, as a
  // crate against a wall would. It can only hold you back so fast, though. At a walk that is enough; at a run
  // you carry on, and a moment later the beam has lost it.
  if (held && held.touchedThisStep) {
    const gapX = looseState.holdTargetX - held.x, gapZ = looseState.holdTargetZ - held.z;
    const gap = Math.sqrt(gapX * gapX + gapZ * gapZ);
    // Only your own advance is taken back: it stops you walking on, it never pulls you towards it.
    const advance = gap > 0 ? (walkedX * gapX + walkedZ * gapZ) / gap : 0;
    if (gap > TUNING.looseHoldStopDistance && advance > 0) {
      const back = Math.min(gap - TUNING.looseHoldStopDistance, advance, TUNING.looseHoldStopSpeed * dt);
      const resolved = resolveBodyCollision(player.x - gapX / gap * back, player.z - gapZ / gap * back,
        TUNING.playerRadius, player.isCrouching ? 1.0 : 1.7, getFloorHeightAt(player.x, player.z));
      looseState.holdTargetX += resolved.x - player.x; looseState.holdTargetZ += resolved.z - player.z;
      player.x = resolved.x; player.z = resolved.z;
    }
  }

  rememberPlayerMovement(dt);

  // Left too far behind (round a door frame, under a lintel, on the other side of you): the beam loses it.
  if (held) {
    const deltaX = looseState.holdTargetX - held.x, deltaY = looseState.holdTargetY - held.y, deltaZ = looseState.holdTargetZ - held.z;
    // Only something that is caught on the station can be lost this way. In open air it is merely behind, however
    // fast you turn, and catches up; unless it is so far behind that it cannot be yours any more.
    const gapSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
    const breakDistance = held.touchedThisStep ? TUNING.looseHoldBreakDistance : TUNING.looseHoldBreakDistance * 2.5;
    if (gapSquared > breakDistance * breakDistance) {
      looseState.holdBreakTimer += dt;
      if (looseState.holdBreakTimer >= TUNING.looseHoldBreakSeconds) {
        releaseHeldLooseObject(0);
        looseState.statistics.pulledFromHands++;
        showMessage('The beam loses the ' + held.kind.label + '.', 3, 'warning');
      }
    } else {
      looseState.holdBreakTimer = 0;
    }
  }
}
