// Checks the loose objects (things you carry, drop and throw): that they fall and come to rest, that carrying
// one puts it in the way of the scanner, that a knock is heard by how hard it was, that an object which cannot
// follow you is pulled out of your hands, and that the keys and the phone's button do what they say.
const { openGame, startGame, drawFrames } = require('./browser-harness.js');

const failures = [];
function check(description, condition, detail) {
  const line = (condition ? 'ok    ' : 'FAIL  ') + description + (detail !== undefined ? '  ' + JSON.stringify(detail) : '');
  console.log(line);
  if (!condition) failures.push(description);
}

// Helpers that run inside the game's page. They are put on `window.looseLab` once.
function installLab() {
  const d = window.lastReturnDebug, p = d.player;
  const round = (value) => Math.round(value * 1000) / 1000;
  // Most of these checks are about how things move, and were written when nothing could break. So in this
  // suite nothing does, unless a check asks for it: the checks under "what a knock costs" switch it on.
  const whole = { from: d.tuning.looseDamageFromSpeed, shattersAt: {} };
  for (const kindKey of Object.keys(d.looseObjectKinds)) whole.shattersAt[kindKey] = d.looseObjectKinds[kindKey].shattersAt;
  const lab = window.looseLab = {
    round: round,
    noises: [],
    setBreakable: function (isBreakable) {
      d.tuning.looseDamageFromSpeed = isBreakable ? whole.from : 1000;
      for (const kindKey of Object.keys(d.looseObjectKinds)) d.looseObjectKinds[kindKey].shattersAt = isBreakable ? whole.shattersAt[kindKey] : undefined;
    },
    // Starts over: Kessel-9, nothing loose, creatures held still, every noise written down.
    reset: function () {
      d.loadStation('classic', 0);
      d.clearLooseObjects(); // the station's own loose things have their own checks, further down
      d.game.flags.hasLeftLift = true;
      d.setDebugOption('freezeCreatures', true); d.setDebugOption('invulnerable', true); d.setDebugOption('unlimitedStamina', true);
      d.hollow.isActive = false;
      d.input.keysDown.clear(); d.input.touchDropHeld = false;
      d.settings.captions = 'all';
      lab.noises.length = 0;
      d.debugHooks.recordNoise = function (x, z, radius) { lab.noises.push({ x: x, z: z, radius: radius }); };
      for (const key of ['ownObjectKnock', 'ownObjectCrash', 'ownObjectKicked', 'objectKnock', 'objectCrash', 'hollowFling']) d.captionCounts[key] = 0;
    },
    // The roomiest spot in the station: the place on plain level floor that is furthest from every wall, from
    // everything that stands or hangs lower than 2.2 m, and from any floor that is not plain (the pit, water,
    // a grate, something noisy to step on). `room` is that distance, in metres.
    findOpenSpot: function () {
      const props = d.worldProps.filter((prop) => !prop.isRemoved && prop.minimumY < 2.2 && prop.maximumY > 0.02);
      let best = null, bestRoom = 0;
      for (let z = 2; z < 200; z++) {
        for (let x = 2; x < 200; x++) {
          const centreX = x + 0.5, centreZ = z + 0.5;
          const spot = d.findWalkableSpotNear(centreX, centreZ);
          if (!spot || spot.x !== centreX || spot.z !== centreZ || d.isVentAt(centreX, centreZ)) continue;
          if (Math.abs(d.getFloorHeightAt(centreX, centreZ)) > 0.01 || d.getTileFlagsAt(centreX, centreZ) !== 0) continue;
          let room = 9;
          // Rock, steps and vents, tile by tile.
          for (let tileZ = z - 9; tileZ <= z + 9 && room > bestRoom; tileZ++) {
            for (let tileX = x - 9; tileX <= x + 9; tileX++) {
              if (d.isSpaceOpenAt(tileX + 0.5, 1.5, tileZ + 0.5) && Math.abs(d.getFloorHeightAt(tileX + 0.5, tileZ + 0.5)) < 0.01 && d.getTileFlagsAt(tileX + 0.5, tileZ + 0.5) === 0) continue;
              const nearX = Math.max(tileX, Math.min(centreX, tileX + 1)), nearZ = Math.max(tileZ, Math.min(centreZ, tileZ + 1));
              room = Math.min(room, Math.hypot(nearX - centreX, nearZ - centreZ));
            }
          }
          if (room <= bestRoom) continue;
          for (const prop of props) {
            const awayX = Math.max(0, Math.abs(prop.centerX - centreX) - prop.boundsHalfX), awayZ = Math.max(0, Math.abs(prop.centerZ - centreZ) - prop.boundsHalfZ);
            room = Math.min(room, Math.hypot(awayX, awayZ));
            if (room <= bestRoom) break;
          }
          if (room > bestRoom) { bestRoom = room; best = { x: centreX, z: centreZ }; }
        }
      }
      best.room = bestRoom;
      return best;
    },
    // A bare wall to walk into: a stretch of rock with nothing standing against it, no door near it, and a clear
    // run of two and a half metres or more straight up to it, wider than anything you can carry.
    findBareWall: function () {
      for (let z = 2; z < 200; z++) {
        for (let x = 2; x < 200; x++) {
          const here = d.findWalkableSpotNear(x + 0.5, z + 0.5);
          if (!here || here.x !== x + 0.5 || here.z !== z + 0.5 || d.isVentAt(x + 0.5, z + 0.5) || Math.abs(d.getFloorHeightAt(x + 0.5, z + 0.5)) > 0.01) continue;
          for (const step of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            // How far the rock is, straight ahead from this tile.
            let rock = 0;
            while (rock < 12 && d.isSpaceOpenAt(x + 0.5 + step[0] * rock, 1, z + 0.5 + step[1] * rock)) rock += 0.05;
            if (rock < 3.2 || rock >= 12) continue;
            let isBare = true;
            for (const across of [-0.7, -0.35, 0, 0.35, 0.7]) {
              for (const height of [0.15, 0.6, 1.0, 1.4, 1.7]) {
                const fromX = x + 0.5 - step[1] * across, fromZ = z + 0.5 + step[0] * across;
                const isHit = d.castScannerRay(fromX, height, fromZ, step[0], 0, step[1], 20);
                if (!isHit || Math.abs(d.rayHit.distance - rock) > 0.08) isBare = false;
              }
            }
            if (!isBare) continue;
            const wallX = x + 0.5 + step[0] * rock, wallZ = z + 0.5 + step[1] * rock;
            if (d.doors.some((door) => Math.hypot(door.centerX - wallX, door.centerZ - wallZ) < 4 || Math.hypot(door.centerX - (x + 0.5), door.centerZ - (z + 0.5)) < 4)) continue;
            return { x: x + 0.5, z: z + 0.5, stepX: step[0], stepZ: step[1], wall: rock, yaw: Math.atan2(step[0], -step[1]) };
          }
        }
      }
      return null;
    },
    // Distance from (x, z) to the first wall or object along `yaw`, at chest height.
    distanceAhead: function (x, z, yaw) {
      return d.castScannerRay(x, 1.2, z, Math.sin(yaw), 0, -Math.cos(yaw), 60) ? d.rayHit.distance : 60;
    },
    stand: function (x, z, yaw) {
      d.input.keysDown.clear();
      d.teleport(x, z, yaw); p.pitch = 0; p.velocityX = 0; p.velocityZ = 0;
      d.simulate(0.3);
    },
    // Puts an object of this kind straight into your hands and lets it settle there.
    carry: function (kindKey) {
      const held = d.getHeldLooseObject();
      if (held) d.removeLooseObject(held);
      const object = d.createLooseObject(kindKey, p.x + Math.sin(p.yaw) * 0.55, d.getPlayerEyeY() - 0.2, p.z - Math.cos(p.yaw) * 0.55, p.yaw);
      d.pickUpLooseObject(object);
      d.simulate(1.6);
      return object;
    },
    gapToHands: function (object) {
      return Math.hypot(d.looseState.holdTargetX - object.x, d.looseState.holdTargetY - object.y, d.looseState.holdTargetZ - object.z);
    },
    // The share of the scanner's cone, `degrees` wide, that stops on this object. The pulses are spread the way
    // the scanner spreads them, but evenly instead of by chance, so that the answer is the same every time.
    coneShare: function (object, degrees) {
      d.computeScannerBasis(p.yaw, p.pitch);
      const basis = d.scannerBasis, tangent = Math.tan(degrees * Math.PI / 180), eyeY = d.getPlayerEyeY(), pulses = 800;
      d.updateScanEmitterAtLens(p.x, eyeY, p.z);
      let stopped = 0;
      for (let pulse = 0; pulse < pulses; pulse++) {
        const radius = Math.pow((pulse + 0.5) / pulses, 0.62) * tangent, angle = pulse * 2.399963;
        const across = Math.cos(angle) * radius, up = Math.sin(angle) * radius;
        if (d.castScannerPulse(across, up) && d.rayHit.looseObject === object) stopped++;
      }
      return round(stopped / pulses);
    },
    // Counts the scan points inside a box that will stay (not fading, not removed): those on the floor and walls,
    // and those on things that can be picked up.
    countPoints: function (x, y, z, reach) {
      const floats = d.pointCloud.floatView, bytes = d.pointCloud.byteView, counts = { station: 0, onObjects: 0, fading: 0 };
      for (let index = 0; index < d.pointCloud.storedCount; index++) {
        const px = floats[index * 5], py = floats[index * 5 + 1], pz = floats[index * 5 + 2];
        if (Math.abs(px - x) > reach || Math.abs(py - y) > reach || Math.abs(pz - z) > reach) continue;
        if (floats[index * 5 + 3] < -1e8) continue; // removed
        const surfaceClass = bytes[index * 20 + 17], lifeCode = bytes[index * 20 + 18];
        if (lifeCode !== 0) counts.fading++;
        else if (surfaceClass === 7) counts.onObjects++;
        else counts.station++;
      }
      return counts;
    },
    // Stands two metres from an object, looks at it, and scans it and the floor around it for a second and a half.
    scan: function (object) {
      lab.stand(object.x - 2, object.z, Math.PI / 2);
      p.pitch = Math.atan2(object.y - d.getPlayerEyeY(), 2);
      d.setDebugOption('unlimitedScanner', true);
      d.setScannerSpread(24);
      d.setScanHeld(true);
      d.simulate(1.5);
      d.setScanHeld(false);
      d.setScannerSpread(d.tuning.scannerSpreadDefaultDegrees);
      d.simulate(0.1);
    },
    knocks: function () { const s = d.looseState.statistics; return { heard: s.knocksHeard, quiet: s.knocksQuiet, pulled: s.pulledFromHands }; },
    since: function (before) { const now = lab.knocks(); return { heard: now.heard - before.heard, quiet: now.quiet - before.quiet, pulled: now.pulled - before.pulled }; },
    messages: function () { return Array.from(document.querySelectorAll('#hud-messages .hud-message')).map((element) => element.textContent); },
    // Is this point inside the station, with room for something to be there?
    isInTheOpen: function (x, y, z) { return d.isSpaceOpenAt(x, y + 0.02, z); },
    // How far it is from (x, z) along +x to the rock itself, whatever stands in front of it.
    rockAhead: function (x, z) {
      let distance = 0;
      while (distance < 60 && d.isSpaceOpenAt(x + distance, 1, z)) distance += 0.05;
      return distance;
    }
  };
}

(async () => {
  const { browser, page, problems } = await openGame({ dev: true });
  const inGame = (callback, argument) => page.evaluate(callback, argument);
  await startGame(page, false);
  await inGame(installLab);
  await inGame(() => window.looseLab.setBreakable(false));

  // --- how they are described ---
  const described = await inGame(() => {
    const d = window.lastReturnDebug, wrong = [], counts = {};
    for (const kindKey of Object.keys(d.looseObjectKinds)) {
      const kind = d.looseObjectKinds[kindKey];
      if (!kind.label || !(kind.mass > 0) || ['metal', 'glass', 'case', 'tin', 'card'].indexOf(kind.material) < 0 || typeof kind.bulky !== 'boolean' ||
          !(kind.value >= 0) || !(kind.loud > 0) || ['upright', 'onItsSide', 'either'].indexOf(kind.lies) < 0 ||
          !(kind.bounce >= 0 && kind.bounce < 1) || !(kind.grip >= 0 && kind.grip <= 1) || !kind.parts || kind.parts.length === 0) wrong.push(kindKey + ': incomplete');
      const object = d.createLooseObject(kindKey, 0, 0, 0, 0);
      const prepared = object.prepared, shell = prepared.shell;
      counts[kindKey] = prepared.shellCount;
      // The centre of mass is the object's own origin: weighed by volume, the balls of the shell balance about it.
      let x = 0, y = 0, z = 0, total = 0;
      for (let ball = 0; ball < prepared.shellCount; ball++) {
        const weight = Math.pow(shell[ball * 4 + 3], 3);
        x += shell[ball * 4] * weight; y += shell[ball * 4 + 1] * weight; z += shell[ball * 4 + 2] * weight; total += weight;
      }
      if (Math.hypot(x, y, z) / total > 1e-6) wrong.push(kindKey + ': centre of mass is off');
      if (!(prepared.boundsRadius > 0.05 && prepared.boundsRadius < 1) || !(prepared.smallestRadius >= 0.01)) wrong.push(kindKey + ': size');
      if (kindKey !== 'scanGrenade' && !(kind.value > 0)) wrong.push(kindKey + ': is worth nothing');
      d.removeLooseObject(object);
    }
    return { wrong: wrong, counts: counts, kinds: Object.keys(d.looseObjectKinds).length };
  });
  check('every kind of object is described completely, and balances about its own centre', described.wrong.length === 0 && described.kinds >= 6, described);

  // --- falling and coming to rest ---
  const spot = await inGame(() => { window.looseLab.reset(); return window.looseLab.findOpenSpot(); });
  check('Kessel-9 has an open stretch of floor to try things on (3 m clear of everything, all round)', spot.room >= 3, spot);

  const drops = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, result = {};
    lab.stand(spot.x - 2.5, spot.z, Math.PI / 2);
    for (const kindKey of Object.keys(d.looseObjectKinds)) {
      d.clearLooseObjects();
      const before = lab.knocks();
      const object = d.createLooseObject(kindKey, spot.x, 1.3, spot.z, 0.4);
      let lowest = 99, asleepAfter = -1, leftTheOpen = false;
      for (let step = 0; step < 150; step++) {
        d.simulate(1 / 30);
        lowest = Math.min(lowest, object.y);
        if (!lab.isInTheOpen(object.x, object.y, object.z)) leftTheOpen = true;
        if (object.isAsleep && asleepAfter < 0) asleepAfter = lab.round((step + 1) / 30);
      }
      result[kindKey] = { restsAt: lab.round(object.y), lowest: lab.round(lowest), asleepAfter: asleepAfter, drifted: lab.round(Math.hypot(object.x - spot.x, object.z - spot.z)),
        leftTheOpen: leftTheOpen, knocks: lab.since(before), reach: lab.round(object.prepared.boundsRadius), smallest: lab.round(object.prepared.smallestRadius) };
    }
    return result;
  }, spot);
  const badDrops = Object.keys(drops).filter((key) => {
    const drop = drops[key];
    return drop.asleepAfter < 0 || drop.asleepAfter > 4 || drop.leftTheOpen || drop.lowest < drop.smallest - 0.02 || drop.restsAt > drop.reach + 0.01 ||
      drop.drifted > 1.2 || drop.knocks.heard < 1 || drop.knocks.heard > 4;
  });
  check('dropped from chest height, every kind lands, stays above the floor, comes to rest within four seconds and is heard one to four times', badDrops.length === 0, drops);
  check('a crate dropped flat lands flat (22 cm from its middle to the floor)', Math.abs(drops.crate.restsAt - 0.22) < 0.012, drops.crate.restsAt);

  const tumble = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab;
    d.clearLooseObjects();
    const runs = [];
    for (let run = 0; run < 2; run++) {
      const object = d.createLooseObject('crate', spot.x, 1.4, spot.z, 0);
      d.setLooseObjectOrientation(object, 0.33, 0.1, 0.22, 0.91); // tipped over two of its edges
      object.spinX = 2; object.velocityX = 1.5;
      for (let step = 0; step < 240 && !object.isAsleep; step++) d.simulate(1 / 30);
      runs.push({ asleep: object.isAsleep, x: object.x, y: object.y, z: object.z, turned: [object.orientationX, object.orientationY, object.orientationZ, object.orientationW] });
      d.removeLooseObject(object);
    }
    return runs;
  }, spot);
  check('a crate thrown down on a corner tumbles and ends up lying on one of its faces',
    tumble[0].asleep && (Math.abs(tumble[0].y - 0.22) < 0.015 || Math.abs(tumble[0].y - 0.25) < 0.015), { y: tumble[0].y });
  check('the same throw twice ends in exactly the same place: nothing in how they move is left to chance',
    JSON.stringify(tumble[0]) === JSON.stringify(tumble[1]), tumble.map((run) => [run.x, run.y, run.z]));

  // --- on a table ---
  const table = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.looseLab;
    d.clearLooseObjects();
    // A flat top between knee and chest height, wide enough to put a tool case on, with nothing standing on it.
    for (const prop of d.worldProps) {
      if (prop.kind !== 0 || prop.isRemoved || prop.isDynamic || prop.halfX < 0.4 || prop.halfZ < 0.4) continue;
      if (prop.maximumY < 0.5 || prop.maximumY > 1.2) continue;
      const isClear = d.worldProps.every((other) => other === prop || other.isRemoved ||
        Math.abs(other.centerX - prop.centerX) > prop.boundsHalfX + other.boundsHalfX || Math.abs(other.centerZ - prop.centerZ) > prop.boundsHalfZ + other.boundsHalfZ ||
        other.maximumY <= prop.maximumY || other.minimumY > prop.maximumY + 0.8);
      if (!isClear) continue;
      const object = d.createLooseObject('toolCase', prop.centerX, prop.maximumY + 0.4, prop.centerZ, 0);
      for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
      return { top: lab.round(prop.maximumY), restsAt: lab.round(object.y), asleep: object.isAsleep, drifted: lab.round(Math.hypot(object.x - prop.centerX, object.z - prop.centerZ)) };
    }
    return null;
  });
  check('a tool case dropped onto a table comes to rest on the table, not on the floor under it',
    table !== null && table.asleep && Math.abs(table.restsAt - table.top - 0.15) < 0.02 && table.drifted < 0.3, table);

  // --- thrown ---
  const thrown = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    for (const kindKey of ['jar', 'canister', 'pumpMotor']) {
      d.clearLooseObjects();
      const yaw = Math.PI / 2;
      const wall = lab.rockAhead(spot.x, spot.z);
      lab.stand(spot.x, spot.z, yaw);
      const object = lab.carry(kindKey);
      const before = lab.knocks();
      p.pitch = 0.1;
      d.releaseHeldLooseObject(1);
      const speed = Math.hypot(object.velocityX, object.velocityY, object.velocityZ);
      let furthest = 0, leftTheOpen = false;
      for (let step = 0; step < 720 && !object.isAsleep; step++) {
        d.simulate(1 / 60);
        furthest = Math.max(furthest, object.x - spot.x);
        if (!lab.isInTheOpen(object.x, object.y, object.z)) leftTheOpen = true;
      }
      result[kindKey] = { leavesAt: lab.round(speed), wallAt: lab.round(wall), furthest: lab.round(furthest), leftTheOpen: leftTheOpen, asleep: object.isAsleep, knocks: lab.since(before) };
    }
    return result;
  }, spot);
  check('thrown as hard as you can, a jar reaches the far wall and a canister goes metres; nothing goes through a wall or the floor',
    ['jar', 'canister', 'pumpMotor'].every((key) => !thrown[key].leftTheOpen && thrown[key].asleep && thrown[key].furthest <= thrown[key].wallAt + 0.02 && thrown[key].knocks.heard >= 1) &&
    thrown.jar.furthest > thrown.jar.wallAt - 1.2 && thrown.canister.furthest > 3, thrown);
  check('a heavy object leaves your hands slower and lands nearer than a light one',
    thrown.pumpMotor.leavesAt < thrown.canister.leavesAt && thrown.canister.leavesAt < thrown.jar.leavesAt && thrown.pumpMotor.furthest < thrown.jar.furthest, thrown);

  // A thrown object is a lure: the noise is where it lands, not where you stand.
  const lure = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player;
    d.clearLooseObjects();
    lab.stand(spot.x - 3, spot.z, Math.PI / 2);
    const object = lab.carry('canister');
    // The Hollow stands seven metres to one side of you, far from where the canister will come down.
    d.spawnHollow(spot.x - 3, spot.z + 7);
    d.hollow.graceTimer = 0; d.hollow.state = 0; d.hollow.hasHeardNoise = false;
    const knockBefore = d.looseState.lastKnock.time;
    p.pitch = 0.25;
    d.releaseHeldLooseObject(1);
    for (let step = 0; step < 240 && d.looseState.lastKnock.time === knockBefore; step++) d.simulate(1 / 60);
    const knock = d.looseState.lastKnock;
    const answer = { landedMetresFromYou: lab.round(Math.hypot(knock.x - p.x, knock.z - p.z)), carries: lab.round(knock.carries),
      hollowMetresFromLanding: lab.round(Math.hypot(knock.x - d.hollow.figure.x, knock.z - d.hollow.figure.z)),
      hollowIsGoingToLook: d.hollow.state === 1, goingToWhereItLanded: Math.hypot(d.hollow.targetX - knock.x, d.hollow.targetZ - knock.z) < 0.5,
      notToYou: Math.hypot(d.hollow.targetX - p.x, d.hollow.targetZ - p.z) > 3 };
    d.hollow.isActive = false;
    return answer;
  }, spot);
  check('a canister thrown across the room is a lure: the Hollow goes to look where it came down, not where you stand',
    lure.landedMetresFromYou > 4 && lure.hollowIsGoingToLook && lure.goingToWhereItLanded && lure.notToYou, lure);

  // --- carrying ---
  const carrying = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    for (const kindKey of Object.keys(d.looseObjectKinds)) {
      d.clearLooseObjects();
      lab.stand(spot.x - spot.room + 1.2, spot.z, Math.PI / 2);
      const object = lab.carry(kindKey);
      const before = lab.knocks();
      const entry = { atRest: lab.round(lab.gapToHands(object)) };
      d.input.keysDown.add('KeyW');
      d.simulate(0.6); // up to speed
      const fromX = p.x;
      let widest = 0;
      for (let step = 0; step < 30; step++) { d.simulate(1 / 30); widest = Math.max(widest, lab.gapToHands(object)); }
      entry.walking = lab.round(widest);
      entry.speed = lab.round(p.x - fromX);
      entry.wantedSpeed = lab.round(d.tuning.walkSpeed * d.getCarrySpeedFactor());
      d.input.keysDown.add('ShiftLeft');
      d.simulate(0.5);
      entry.canRun = p.isSprinting;
      d.input.keysDown.clear();
      d.simulate(0.5);
      entry.knocksWalking = lab.since(before);
      // A quarter turn in a fifth of a second. (What it swings into on the way round is the room's business.)
      widest = 0;
      for (let step = 0; step < 6; step++) { p.yaw += Math.PI / 12; d.simulate(1 / 30); widest = Math.max(widest, lab.gapToHands(object)); }
      for (let step = 0; step < 20; step++) { d.simulate(1 / 30); widest = Math.max(widest, lab.gapToHands(object)); }
      entry.turning = lab.round(widest);
      entry.stillHeld = d.getHeldLooseObject() === object;
      entry.knocks = lab.since(before);
      entry.bulky = object.kind.bulky;
      result[kindKey] = entry;
    }
    return result;
  }, spot);
  const badCarry = Object.keys(carrying).filter((key) => {
    const entry = carrying[key];
    return entry.atRest > 0.03 || entry.walking > 0.35 || !entry.stillHeld || entry.knocksWalking.heard + entry.knocksWalking.quiet > 0 ||
      Math.abs(entry.speed - entry.wantedSpeed) > 0.12 || entry.canRun !== !entry.bulky;
  });
  check('carried in the open, every kind stays in the beam, walking without a knock and through a quick turn; it slows you by its weight; you cannot run with a bulky one',
    badCarry.length === 0, carrying);
  check('it swings wide behind a quick turn, and the heavier it is the wider', carrying.jar.turning > 0.3 && carrying.pumpMotor.turning > carrying.jar.turning + 0.1, [carrying.jar.turning, carrying.pumpMotor.turning]);

  // --- in the way of the scanner ---
  const blocking = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    for (const kindKey of Object.keys(d.looseObjectKinds)) {
      d.clearLooseObjects();
      lab.stand(spot.x, spot.z, Math.PI / 2);
      const object = lab.carry(kindKey);
      const entry = { narrow: lab.coneShare(object, 5), normal: lab.coneShare(object, d.tuning.scannerSpreadDefaultDegrees), wide: lab.coneShare(object, 24) };
      p.pitch = -0.6; d.simulate(0.6);
      entry.lookingDown = lab.coneShare(object, d.tuning.scannerSpreadDefaultDegrees);
      p.pitch = 0.6; d.simulate(0.6);
      entry.lookingUp = lab.coneShare(object, d.tuning.scannerSpreadDefaultDegrees);
      p.pitch = 0; d.simulate(0.4);
      entry.fadesWhileCarried = d.getLooseObjectPointLifeCode(object) > 0;
      // Out of your hands it is an object like any other: a pulse that meets it stops on it.
      d.releaseHeldLooseObject(0);
      d.castScannerRay(object.x - 3, object.y, object.z, 1, 0, 0, 10);
      entry.stopsAPulseOutOfYourHands = d.rayHit.looseObject === object;
      result[kindKey] = entry;
    }
    // Nothing in your hands: nothing in the way.
    d.clearLooseObjects();
    const loose = d.createLooseObject('crate', spot.x + 2, 0.5, spot.z, 0);
    for (let step = 0; step < 120 && !loose.isAsleep; step++) d.simulate(1 / 30);
    result.lyingAhead = { share: lab.coneShare(loose, 24), staysOnceAtRest: d.getLooseObjectPointLifeCode(loose) === 0 };
    return result;
  }, spot);
  const kindsCarried = Object.keys(blocking).filter((key) => key !== 'lyingAhead');
  check('what the beam holds hangs straight out from the scanner and is in its way: a crate takes nearly all of the normal beam, a jar or a pipe a part of it',
    blocking.crate.normal >= 0.85 && blocking.pumpMotor.normal >= 0.5 && blocking.toolCase.normal >= 0.5 &&
    blocking.jar.normal >= 0.1 && blocking.jar.normal <= 0.6 && blocking.pipe.normal >= 0.05 && blocking.pipe.normal <= 0.4 &&
    kindsCarried.every((key) => blocking[key].normal > 0 && blocking[key].lookingDown > 0 && blocking[key].lookingUp > 0), blocking);
  check('a pulse that meets a carried object stops on it', kindsCarried.every((key) => blocking[key].narrow > 0 || blocking[key].normal > 0), kindsCarried);
  check('the wide beam sees round it, and the narrow beam least of all: every kind takes a smaller share of the wide beam than of the normal one',
    kindsCarried.every((key) => blocking[key].wide < blocking[key].normal && blocking[key].narrow >= blocking[key].normal) && blocking.crate.wide < 0.8, blocking);
  check('points on a carried object fade, points on one lying still stay, and any of them out of your hands stops a pulse that meets it',
    Object.keys(blocking).filter((key) => key !== 'lyingAhead').every((key) => blocking[key].stopsAPulseOutOfYourHands && blocking[key].fadesWhileCarried) && blocking.lyingAhead.staysOnceAtRest, blocking.lyingAhead);

  // --- where the scanner's light comes from ---
  const bareWallForScanner = await inGame(() => { window.looseLab.reset(); return window.looseLab.findBareWall(); });
  const light = await inGame((bare) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = { offBy: [] };
    d.clearLooseObjects();
    const cast = function (fromEye, across, up) {
      const eyeY = d.getPlayerEyeY();
      d.computeScannerBasis(p.yaw, p.pitch);
      if (fromEye) d.updateScanEmitterAtEye(p.x, eyeY, p.z); else d.updateScanEmitterAtLens(p.x, eyeY, p.z);
      return d.castScannerPulse(across, up) ? { x: d.rayHit.x, y: d.rayHit.y, z: d.rayHit.z, looseObject: d.rayHit.looseObject } : null;
    };
    // You aim with your eyes: with nothing in the way, every pulse lands on the station where your eye sees it.
    lab.stand(bare.x + bare.stepX * (bare.wall - 3), bare.z + bare.stepZ * (bare.wall - 3), bare.yaw);
    for (const offset of [[0, 0], [0.19, 0], [-0.19, 0], [0, 0.19], [0, -0.19], [0.1, -0.12]]) {
      const seen = cast(true, offset[0], offset[1]), lit = cast(false, offset[0], offset[1]);
      result.offBy.push(seen && lit ? Math.hypot(seen.x - lit.x, seen.y - lit.y, seen.z - lit.z) : 99);
    }
    const emitter = d.scanEmitter, eyeY = d.getPlayerEyeY();
    result.lensFromTheEye = lab.round(Math.hypot(emitter.x - p.x, emitter.y - eyeY, emitter.z - p.z));
    result.lensBelowTheEye = lab.round(eyeY - emitter.y);
    // What the beam carries is tested from the lens: a pulse it stops lands on it, on the straight line from
    // the lens to the spot the pulse was going to.
    const going = cast(false, 0.02, -0.02);
    const crate = lab.carry('crate');
    const stopped = cast(false, 0.02, -0.02);
    const lens = { x: d.scanEmitter.x, y: d.scanEmitter.y, z: d.scanEmitter.z };
    const whole = Math.hypot(going.x - lens.x, going.y - lens.y, going.z - lens.z), part = stopped ? Math.hypot(stopped.x - lens.x, stopped.y - lens.y, stopped.z - lens.z) : 0;
    result.carried = { stopsThePulse: Boolean(stopped) && stopped.looseObject === crate, metresFromTheLens: lab.round(part),
      offTheLine: stopped ? Math.hypot(lens.x + (going.x - lens.x) * part / whole - stopped.x, lens.y + (going.y - lens.y) * part / whole - stopped.y, lens.z + (going.z - lens.z) * part / whole - stopped.z) : 99,
      onTheCrate: Boolean(stopped) && Math.hypot(stopped.x - crate.x, stopped.y - crate.y, stopped.z - crate.z) < crate.prepared.partsRadius + 0.01 };
    d.clearLooseObjects();
    // With your face against the wall the scanner would be inside it. It is held back, and still paints.
    lab.stand(bare.x + bare.stepX * (bare.wall - 0.32), bare.z + bare.stepZ * (bare.wall - 0.32), bare.yaw);
    d.computeScannerBasis(p.yaw, p.pitch);
    d.updateScanEmitterAtLens(p.x, d.getPlayerEyeY(), p.z);
    result.atTheWall = { emitterInTheOpen: d.isSpaceOpenAt(d.scanEmitter.x, d.scanEmitter.y, d.scanEmitter.z),
      fromTheWall: lab.round(bare.wall - ((d.scanEmitter.x - bare.x) * bare.stepX + (d.scanEmitter.z - bare.z) * bare.stepZ)),
      paints: [cast(false, 0, 0), cast(false, 0.15, 0.1), cast(false, -0.15, -0.1)].every((hit) => hit !== null) };
    // Anything can fire a pulse from anywhere: one from the middle of the room, straight down, lands on the floor under it.
    const before = d.pointCloud.totalReturns;
    const landed = d.fireScanPulse(bare.x, 1.2, bare.z, 0, -1, 0, false);
    result.fromAnywhere = { landed: landed, onTheFloor: landed && Math.abs(d.rayHit.y) < 0.01 && Math.abs(d.rayHit.x - bare.x) < 0.001, pointsAdded: d.pointCloud.totalReturns - before };
    return result;
  }, bareWallForScanner);
  check('you aim with your eyes: with nothing in the beam, every pulse lands exactly where your eye sees its place in the ring',
    light.offBy.every((metres) => metres < 1e-6), light.offBy);
  check('what the beam carries is tested from the lens, a forearm from your eyes: a pulse the crate stops lands on the crate, on the straight line from the lens to where it was going',
    light.lensFromTheEye > 0.5 && light.lensBelowTheEye > 0.1 && light.carried.stopsThePulse && light.carried.onTheCrate && light.carried.offTheLine < 1e-6 && light.carried.metresFromTheLens < 1.6, light);
  check('with your face against a wall the scanner is held back out of it, and still paints', light.atTheWall.emitterInTheOpen && light.atTheWall.fromTheWall > 0.05 && light.atTheWall.paints, light.atTheWall);
  check('a pulse can be fired from anywhere, not only from the scanner: one fired straight down in mid-room leaves a point on the floor under it',
    light.fromAnywhere.landed && light.fromAnywhere.onTheFloor && light.fromAnywhere.pointsAdded === 1, light.fromAnywhere);

  // --- knocks ---
  const bareWall = await inGame(() => { window.looseLab.reset(); return window.looseLab.findBareWall(); });
  check('Kessel-9 has a bare wall with a clear run up to it and no door near', bareWall !== null, bareWall);
  // Carried into that wall at a walk, crouched, and at a run. The Hollow stands four metres off to one side, listening.
  const intoWall = await inGame((bare) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    const wallX = bare.x + bare.stepX * bare.wall, wallZ = bare.z + bare.stepZ * bare.wall;
    for (const kindKey of ['canister', 'crate', 'pipe']) {
      for (const pace of ['crouched', 'walking', 'running']) {
        if (pace === 'running' && d.looseObjectKinds[kindKey].bulky) continue;
        d.clearLooseObjects();
        const startX = bare.x + bare.stepX * (bare.wall - 2.9), startZ = bare.z + bare.stepZ * (bare.wall - 2.9);
        lab.stand(startX, startZ, bare.yaw);
        const object = lab.carry(kindKey);
        // A metre back from the wall and four metres to one side. (It is held still, so it may stand anywhere.)
        d.spawnHollow(wallX - bare.stepX - bare.stepZ * 4, wallZ - bare.stepZ + bare.stepX * 4);
        d.hollow.graceTimer = 0; d.hollow.state = 0; d.hollow.hasHeardNoise = false;
        const before = lab.knocks();
        for (const key of ['ownObjectKnock', 'ownObjectCrash']) d.captionCounts[key] = 0;
        const knockBefore = d.looseState.lastKnock.time;
        d.input.keysDown.add('KeyW');
        if (pace === 'crouched') d.input.keysDown.add('KeyC');
        if (pace === 'running') d.input.keysDown.add('ShiftLeft');
        d.simulate(pace === 'crouched' ? 5 : 3.5);
        const lastKnock = d.looseState.lastKnock, wasKnock = lastKnock.time !== knockBefore;
        const along = (p.x - bare.x) * bare.stepX + (p.z - bare.z) * bare.stepZ;
        result[kindKey + ' ' + pace] = {
          knocks: lab.since(before), stillHeld: d.getHeldLooseObject() === object,
          fromWall: lab.round(bare.wall - along), sideways: lab.round(Math.abs((p.x - startX) * bare.stepZ - (p.z - startZ) * bare.stepX)),
          noiseCarries: wasKnock ? lab.round(lastKnock.carries) : 0,
          knockAtTheWall: wasKnock && Math.abs((lastKnock.x - wallX) * bare.stepX + (lastKnock.z - wallZ) * bare.stepZ) < 0.3, yours: wasKnock && lastKnock.isOwn,
          hollowCameToLook: d.hollow.state === 1 && Math.hypot(d.hollow.targetX - wallX, d.hollow.targetZ - wallZ) < 1.5,
          saidSo: d.captionCounts.ownObjectKnock + d.captionCounts.ownObjectCrash
        };
        d.hollow.isActive = false;
        d.input.keysDown.clear();
      }
    }
    result.hearing = d.game.difficulty.hearingFactor;
    return result;
  }, bareWall);
  check('walked into a wall, what you carry knocks once, the Hollow four metres off comes to look, and the caption says so',
    ['canister walking', 'crate walking', 'pipe walking'].every((key) => intoWall[key].knocks.heard === 1 && intoWall[key].knocks.quiet <= 1 && intoWall[key].noiseCarries > 4 && intoWall[key].knockAtTheWall && intoWall[key].yours && intoWall[key].hollowCameToLook && intoWall[key].saidSo === 1), intoWall);
  check('crouched, the same walk into the same wall is a tap the Hollow does not hear',
    ['canister crouched', 'crate crouched', 'pipe crouched'].every((key) => intoWall[key].knocks.heard === 0 && intoWall[key].knocks.quiet >= 1 && intoWall[key].knocks.quiet <= 2 && intoWall[key].noiseCarries === 0 && !intoWall[key].hollowCameToLook && intoWall[key].saidSo === 0), intoWall);
  check('a heavy crate carries further than a light canister at the same pace', intoWall['crate walking'].noiseCarries > intoWall['canister walking'].noiseCarries,
    [intoWall['canister walking'].noiseCarries, intoWall['crate walking'].noiseCarries]);
  // Against something straight ahead the beam gives: the thing comes nearer to you, and you can walk right up.
  // (The beam is 0.7 m long, and it used to hold you off the wall by that much and the size of the thing.)
  check('walked into a wall, what you carry comes in close and stays in the beam: with a canister you reach the wall, with a crate you stop where the crate is between you and it; you are not pushed sideways',
    ['canister walking', 'crate walking', 'pipe walking', 'crate crouched', 'canister running', 'pipe running'].every((key) => intoWall[key].stillHeld && intoWall[key].knocks.pulled === 0 && intoWall[key].sideways < 0.2) &&
    intoWall['canister walking'].fromWall < 0.5 && intoWall['crate walking'].fromWall > 0.6 && intoWall['crate walking'].fromWall < 1.0 && intoWall['pipe walking'].fromWall < 1.05, intoWall);
  check('run at the wall with a length of pipe and it clatters, and is still in the beam', intoWall['pipe running'].stillHeld && intoWall['pipe running'].knocks.heard >= 1 && intoWall['pipe running'].fromWall < 0.6, intoWall['pipe running']);

  // The beam shortens, and lets out again when there is room.
  const beamGives = await inGame((bare) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    d.clearLooseObjects();
    lab.stand(bare.x + bare.stepX * (bare.wall - 2.9), bare.z + bare.stepZ * (bare.wall - 2.9), bare.yaw);
    const object = lab.carry('toolCase');
    const fromLens = function () { return lab.round(Math.hypot(object.x - d.scanEmitter.x, object.y - d.scanEmitter.y, object.z - d.scanEmitter.z) - object.prepared.partsRadius); };
    result.inTheOpen = { length: lab.round(d.looseState.holdLength), fromLens: fromLens() };
    d.input.keysDown.add('KeyW');
    d.simulate(3.5);
    d.input.keysDown.clear();
    d.simulate(0.5);
    const along = (p.x - bare.x) * bare.stepX + (p.z - bare.z) * bare.stepZ;
    result.atTheWall = { length: lab.round(d.looseState.holdLength), fromLens: fromLens(), youFromWall: lab.round(bare.wall - along), held: d.getHeldLooseObject() === object };
    d.input.keysDown.add('KeyS');
    d.simulate(1.2);
    d.input.keysDown.clear();
    d.simulate(1.2);
    result.backedAway = { length: lab.round(d.looseState.holdLength), fromLens: fromLens(), held: d.getHeldLooseObject() === object };
    result.full = d.tuning.looseHoldDistance; result.shortest = d.tuning.looseHoldShortestDistance;
    return result;
  }, bareWall);
  check('against a wall the beam holds the thing nearer, down to its shortest; back away and it lets it out to its full length again',
    beamGives.inTheOpen.length === beamGives.full && beamGives.atTheWall.held && beamGives.atTheWall.length < beamGives.full - 0.2 && beamGives.atTheWall.length >= beamGives.shortest &&
    beamGives.atTheWall.fromLens < beamGives.inTheOpen.fromLens - 0.2 && beamGives.backedAway.held && beamGives.backedAway.length === beamGives.full && Math.abs(beamGives.backedAway.fromLens - beamGives.inTheOpen.fromLens) < 0.1, beamGives);

  // What the beam still loses: a thing left behind something. You stand in front of the wall beside a doorway
  // with a canister in the beam, and are then on the other side of that wall (the test puts you there in one
  // step, as a corner turned too sharply would): the canister is against the wall, and the beam lets it go.
  const leftBehind = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = { found: false };
    lab.reset();
    d.game.flags.powerOn = true;
    const isPlain = function (x, z) { const spot = d.findWalkableSpotNear(x, z); return Boolean(spot) && spot.x === x && spot.z === z && Math.abs(d.getFloorHeightAt(x, z)) < 0.01 && d.getTileFlagsAt(x, z) === 0; };
    // (The door's own frame does not count: it stands proud of the wall by five centimetres and stops nobody.)
    const clearOfThings = function (x, z) { return d.worldProps.every((prop) => prop.isRemoved || prop.isDynamic || !prop.blocksMovement || prop.minimumY > 2.2 || prop.maximumY < 0.03 || Math.abs(prop.centerX - x) > prop.boundsHalfX + 0.75 || Math.abs(prop.centerZ - z) > prop.boundsHalfZ + 0.75); };
    for (const door of d.doors) {
      if (door.kind !== d.doorKinds.automatic || result.found) continue;
      for (const step of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        // Beside the door, a tile and a bit to one side: floor on both sides of the wall there, two tiles deep, and nothing standing on it.
        const sideX = -step[1], sideZ = step[0];
        const spots = [-2, -1, 1, 2].map((along) => [door.centerX + step[0] * along + sideX, door.centerZ + step[1] * along + sideZ]);
        if (!spots.every((spot) => isPlain(spot[0], spot[1]) && clearOfThings(spot[0], spot[1]))) continue;
        if (d.isSpaceOpenAt(door.centerX + sideX, 1, door.centerZ + sideZ)) continue; // there must be wall beside the door
        result.found = true;
        lab.stand(door.centerX - step[0] * 1.6 + sideX, door.centerZ - step[1] * 1.6 + sideZ, Math.atan2(step[0], -step[1]));
        const canister = lab.carry('canister');
        d.simulate(0.5);
        const before = lab.knocks();
        result.inFrontOfTheWall = { held: d.getHeldLooseObject() === canister };
        d.teleport(door.centerX + step[0] * 1.6 + sideX, door.centerZ + step[1] * 1.6 + sideZ);
        d.simulate(2.5);
        const side = (canister.x - door.centerX) * step[0] + (canister.z - door.centerZ) * step[1];
        result.behindIt = { stillHeld: d.getHeldLooseObject() === canister, canisterOnTheFirstSide: side < 0, knocks: lab.since(before), messages: lab.messages() };
        break;
      }
    }
    return result;
  });
  check('with a wall between you and what you carry, the beam loses it, and says so',
    leftBehind.found && leftBehind.inFrontOfTheWall.held && !leftBehind.behindIt.stillHeld && leftBehind.behindIt.canisterOnTheFirstSide && leftBehind.behindIt.knocks.pulled === 1 &&
    leftBehind.behindIt.messages.some((text) => /The beam loses the gas canister/.test(text)), leftBehind);

  const settingDown = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    for (const how of ['standing', 'crouched and low']) {
      d.clearLooseObjects();
      lab.stand(spot.x, spot.z, Math.PI / 2);
      if (how !== 'standing') { d.input.keysDown.add('KeyC'); d.simulate(0.8); }
      const object = lab.carry('toolCase');
      if (how !== 'standing') { p.pitch = -1.1; d.simulate(1.2); }
      const before = lab.knocks();
      const height = object.y;
      d.releaseHeldLooseObject(0);
      for (let step = 0; step < 120 && !object.isAsleep; step++) d.simulate(1 / 30);
      result[how] = { fromHeight: lab.round(height), knocks: lab.since(before), asleep: object.isAsleep };
      d.input.keysDown.clear();
    }
    return result;
  }, spot);
  check('let go of standing up, a tool case is heard landing; set down from a crouch, looking at the floor, it is not',
    settingDown.standing.knocks.heard >= 1 && settingDown['crouched and low'].knocks.heard === 0 && settingDown['crouched and low'].asleep, settingDown);

  // --- kicked ---
  const kicked = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    d.clearLooseObjects();
    lab.stand(spot.x - 2, spot.z, Math.PI / 2);
    const object = d.createLooseObject('canister', spot.x, 0.3, spot.z, 0);
    d.setLooseObjectOrientation(object, 0.7071, 0, 0, 0.7071); // lying on its side
    for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
    result.layStill = object.isAsleep;
    let before = lab.knocks();
    const fromX = object.x;
    d.input.keysDown.add('KeyW');
    d.simulate(1.6);
    d.input.keysDown.clear();
    result.byYou = { moved: lab.round(object.x - fromX), knocks: lab.since(before), saidAsYours: d.captionCounts.ownObjectKnock + d.captionCounts.ownObjectCrash + d.captionCounts.ownObjectKicked, playerPassed: p.x > fromX };
    for (let step = 0; step < 240 && !object.isAsleep; step++) d.simulate(1 / 30);
    // Now the Hollow walks through it, while you stand well back and have not touched it for a while.
    lab.stand(object.x - 6, object.z, Math.PI / 2);
    d.simulate(4.5);
    for (let step = 0; step < 240 && !object.isAsleep; step++) d.simulate(1 / 30);
    d.spawnHollow(object.x, object.z - 2);
    before = lab.knocks();
    lab.noises.length = 0;
    for (const key of ['objectKnock', 'objectCrash', 'ownObjectKnock', 'ownObjectCrash', 'ownObjectKicked']) d.captionCounts[key] = 0;
    const startX = object.x, startZ = object.z;
    for (let step = 0; step < 60; step++) { d.hollow.figure.z += 3.2 / 30; d.simulate(1 / 30); }
    result.byTheHollow = { moved: lab.round(Math.hypot(object.x - startX, object.z - startZ)), knocks: lab.since(before),
      noiseAtTheObject: lab.noises.some((noise) => Math.hypot(noise.x - startX, noise.z - startZ) < 1.5),
      saidWithADirection: d.captionCounts.objectKnock + d.captionCounts.objectCrash, saidAsYours: d.captionCounts.ownObjectKnock + d.captionCounts.ownObjectCrash + d.captionCounts.ownObjectKicked };
    d.hollow.isActive = false;
    return result;
  }, spot);
  check('a canister lying on the floor is kicked along when you walk into it, and does not stop you', kicked.layStill && kicked.byYou.moved > 0.3 && kicked.byYou.playerPassed && kicked.byYou.knocks.heard >= 1 && kicked.byYou.saidAsYours >= 1, kicked.byYou);
  check('the Hollow kicks it too: you hear that, captioned as something out there and not as yours, and the Hollow is not startled by a noise of its own making',
    kicked.byTheHollow.moved > 0.3 && kicked.byTheHollow.knocks.heard >= 1 && !kicked.byTheHollow.noiseAtTheObject && kicked.byTheHollow.saidWithADirection >= 1 && kicked.byTheHollow.saidAsYours === 0, kicked.byTheHollow);

  // --- how it is turned ---
  const turned = await inGame(([spot, bare]) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    lab.reset();
    // The angle between the pipe's length and your right-hand side, in degrees, 0 to 90: 0 is square across you.
    const acrossYou = function (object) {
      const lengthX = object.matrix[0], lengthZ = object.matrix[6], rightX = Math.cos(p.yaw), rightZ = Math.sin(p.yaw);
      const cosine = Math.abs(lengthX * rightX + lengthZ * rightZ) / Math.hypot(lengthX, lengthZ);
      return Math.round(Math.acos(Math.min(1, cosine)) * 180 / Math.PI);
    };
    // A pipe lying on the floor a step and a half ahead, at an angle to you, taken into the beam.
    const takeUp = function (x, z, yaw) {
      d.clearLooseObjects();
      lab.stand(x, z, yaw);
      const pipe = d.createLooseObject('pipe', x + Math.sin(yaw) * 1.4, 0.2, z - Math.cos(yaw) * 1.4, yaw + 0.5);
      for (let step = 0; step < 150 && !pipe.isAsleep; step++) d.simulate(1 / 30);
      const lying = acrossYou(pipe);
      d.pickUpLooseObject(pipe);
      d.simulate(2.5);
      return { pipe: pipe, lying: lying };
    };
    // In the open: the beam takes it as it lies, and it comes round with you when you turn.
    let taken = takeUp(spot.x, spot.z, Math.PI / 2);
    result.lying = taken.lying;
    result.takenUp = { angle: acrossYou(taken.pipe), level: Math.abs(taken.pipe.matrix[3]) < 0.1 };
    for (let step = 0; step < 30; step++) { p.yaw += Math.PI / 60; d.simulate(1 / 30); } // a quarter turn in a second
    d.simulate(2.5);
    result.afterAQuarterTurn = { angle: acrossYou(taken.pipe), stillHeld: d.getHeldLooseObject() === taken.pipe };
    // At the bare wall: walk it, crouched, against the wall. One end meets the wall first and the wall turns it.
    taken = takeUp(bare.x + bare.stepX * (bare.wall - 3.1), bare.z + bare.stepZ * (bare.wall - 3.1), bare.yaw);
    result.atTheWall = { before: acrossYou(taken.pipe) };
    const before = lab.knocks();
    d.input.keysDown.add('KeyW'); d.input.keysDown.add('KeyC');
    d.simulate(5);
    d.input.keysDown.clear();
    result.atTheWall.against = acrossYou(taken.pipe);
    result.atTheWall.stillHeld = d.getHeldLooseObject() === taken.pipe;
    result.atTheWall.knocks = lab.since(before);
    // Back off: it stays as the wall left it.
    d.input.keysDown.add('KeyS');
    d.simulate(1);
    d.input.keysDown.clear();
    d.simulate(2.5);
    result.atTheWall.backedOff = acrossYou(taken.pipe);
    result.atTheWall.stillHeldAfter = d.getHeldLooseObject() === taken.pipe;
    return result;
  }, [spot, bareWallForScanner]);
  check('the beam takes a thing as it lies, without straightening it, and it comes round with you when you turn',
    turned.lying > 20 && Math.abs(turned.takenUp.angle - turned.lying) <= 8 && turned.afterAQuarterTurn.stillHeld && Math.abs(turned.afterAQuarterTurn.angle - turned.lying) <= 8, turned);
  // (Even crouched this is not silent every time: as the wall turns the pipe, its far end comes round faster than you walk.)
  check('walked against a wall, a pipe held at an angle is turned by the wall, with one knock at most, and it stays as the wall left it',
    turned.atTheWall.stillHeld && turned.atTheWall.against < turned.atTheWall.before - 15 && turned.atTheWall.knocks.heard <= 1 &&
    turned.atTheWall.stillHeldAfter && Math.abs(turned.atTheWall.backedOff - turned.atTheWall.against) <= 8, turned.atTheWall);

  // --- a pile ---
  const pile = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, result = {};
    lab.reset();
    d.clearLooseObjects();
    lab.stand(spot.x - 2.6, spot.z, Math.PI / 2);
    const kinds = ['crate', 'toolCase', 'canister', 'crate', 'jar', 'pumpMotor', 'toolCase', 'canister', 'pipe', 'jar'];
    const started = performance.now();
    for (let index = 0; index < kinds.length; index++) {
      d.createLooseObject(kinds[index], spot.x + (index % 3 - 1) * 0.12, 1.6, spot.z + (index % 2 - 0.5) * 0.12, index * 0.9);
      d.simulate(0.5);
    }
    let settledAfter = -1;
    for (let step = 0; step < 300; step++) {
      d.simulate(1 / 30);
      if (settledAfter < 0 && d.looseObjects.every((object) => object.isAsleep)) settledAfter = lab.round((step + 1) / 30);
    }
    const describe = function () {
      return { atRest: d.looseObjects.filter((object) => object.isAsleep).length, of: d.looseObjects.length,
        lowest: lab.round(Math.min.apply(null, d.looseObjects.map((object) => object.y))), highest: lab.round(Math.max.apply(null, d.looseObjects.map((object) => object.y))),
        widest: lab.round(Math.max.apply(null, d.looseObjects.map((object) => Math.hypot(object.x - spot.x, object.z - spot.z)))),
        allInTheOpen: d.looseObjects.every((object) => lab.isInTheOpen(object.x, object.y, object.z)),
        allNumbers: d.looseObjects.every((object) => [object.x, object.y, object.z, object.orientationW].every(Number.isFinite)) };
    };
    result.dropped = describe();
    result.dropped.settledAfter = settledAfter;
    result.dropped.milliseconds = Math.round(performance.now() - started);
    // Something is lying on something: take the lowest thing away and what was on it comes down.
    const lowest = d.looseObjects.slice().sort((a, b) => a.y - b.y)[0];
    const above = d.looseObjects.filter((object) => object !== lowest && object.y > lowest.y + 0.05 && Math.hypot(object.x - lowest.x, object.z - lowest.z) < 0.5);
    result.somethingOnTop = above.length;
    const heights = above.map((object) => object.y);
    d.removeLooseObject(lowest);
    d.simulate(0.2);
    result.wokeWhenItWent = above.some((object) => !object.isAsleep);
    for (let step = 0; step < 300 && !d.looseObjects.every((object) => object.isAsleep); step++) d.simulate(1 / 30);
    result.cameDown = above.some((object, index) => object.y < heights[index] - 0.05);
    result.afterwards = describe();
    result.putBack = d.looseState.statistics.putBack;
    return result;
  }, spot);
  check('ten things dropped onto one spot make a heap that comes to rest, with nothing through the floor and nothing lost',
    pile.dropped.atRest === pile.dropped.of && pile.dropped.settledAfter >= 0 && pile.dropped.settledAfter <= 8 && pile.dropped.lowest > 0.02 &&
    pile.dropped.highest > 0.3 && pile.dropped.widest < 3 && pile.dropped.allInTheOpen && pile.dropped.allNumbers && pile.putBack === 0, pile.dropped);
  check('take the lowest thing out of the heap and what lay on it wakes, comes down and comes to rest again',
    pile.somethingOnTop >= 1 && pile.wokeWhenItWent && pile.cameDown && pile.afterwards.atRest === pile.afterwards.of && pile.afterwards.allInTheOpen, pile);

  // --- a door ---
  const wedged = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    lab.reset();
    d.clearLooseObjects();
    const door = d.doors.find((candidate) => candidate.kind === 0 && candidate.forcedState === null);
    const alongX = door.slab.halfX < door.slab.halfZ ? 1 : 0, alongZ = 1 - alongX; // the way through the door
    const near = function () { d.teleport(door.centerX - alongX * 1.2, door.centerZ - alongZ * 1.2, Math.atan2(alongX, -alongZ)); d.simulate(1.5); };
    const away = function () { d.teleport(door.centerX - alongX * 7, door.centerZ - alongZ * 7, 0); d.simulate(4); };
    near();
    result.opensForYou = door.openFraction;
    away();
    result.closesBehindYou = door.openFraction;
    near();
    const object = d.createLooseObject('canister', door.centerX, 0.4, door.centerZ, 0);
    for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
    away();
    result.wedged = { open: door.openFraction, objectStill: object.isAsleep, inTheDoorway: Math.hypot(object.x - door.centerX, object.z - door.centerZ) < 0.6 };
    // Take it out of the doorway and the door closes.
    d.removeLooseObject(object);
    d.simulate(4);
    result.afterItIsGone = door.openFraction;
    return result;
  });
  check('a door opens for you and closes behind you; with something lying in the doorway it waits, open; take the thing away and it closes',
    wedged.opensForYou === 1 && wedged.closesBehindYou === 0 && wedged.wedged.open === 1 && wedged.wedged.objectStill && wedged.wedged.inTheDoorway && wedged.afterItIsGone === 0, wedged);

  // --- thrown about at random ---
  const stations = [['classic', 0], ['generated', 2, 'medium', 'mixed', 'two'], ['generated', 5, 'large', 'mixed', 'two']];
  for (const station of stations) {
    const storm = await inGame((station) => {
      const d = window.lastReturnDebug, lab = window.looseLab;
      d.loadStation.apply(null, station);
      d.clearLooseObjects();
      d.game.flags.hasLeftLift = true;
      d.setDebugOption('freezeCreatures', true); d.hollow.isActive = false;
      d.input.keysDown.clear();
      // Chance that is the same every run.
      let seed = 12345 + station[1] * 977;
      const chance = function () { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const places = [];
      for (let z = 2; z < 300; z++) for (let x = 2; x < 300; x++) if (d.isSpaceOpenAt(x + 0.5, 1, z + 0.5) && !(d.getTileFlagsAt(x + 0.5, z + 0.5) & d.tileFlagPit)) places.push([x + 0.5, z + 0.5]);
      const kinds = Object.keys(d.looseObjectKinds), thrown = [];
      const statistics = d.looseState.statistics, lostBefore = statistics.lostDownThePit, putBackBefore = statistics.putBack;
      const started = performance.now();
      let stillMoving = 0, outside = 0, notNumbers = 0, count = 0;
      for (let batch = 0; batch < 4; batch++) {
        d.clearLooseObjects();
        for (let index = 0; index < 30; index++) {
          const place = places[Math.floor(chance() * places.length)];
          const floor = d.getFloorHeightAt(place[0], place[1]);
          const object = d.createLooseObject(kinds[Math.floor(chance() * kinds.length)], place[0], floor + 0.7 + chance() * 0.6, place[1], chance() * 6);
          d.setLooseObjectOrientation(object, chance() - 0.5, chance() - 0.5, chance() - 0.5, chance() - 0.5);
          const speed = 2 + chance() * 11, heading = chance() * Math.PI * 2, climb = (chance() - 0.5) * 2;
          object.velocityX = Math.cos(heading) * speed; object.velocityZ = Math.sin(heading) * speed; object.velocityY = climb * speed * 0.6;
          object.spinX = (chance() - 0.5) * 30; object.spinY = (chance() - 0.5) * 30; object.spinZ = (chance() - 0.5) * 30;
          thrown.push(object);
        }
        // Twenty seconds at most: something round that came down on top of something else can take a while to roll off it.
        for (let step = 0; step < 600 && !d.looseObjects.every((object) => object.isAsleep); step++) d.simulate(1 / 30);
        for (const object of d.looseObjects) {
          count++;
          if (![object.x, object.y, object.z, object.orientationX, object.orientationW, object.velocityX].every(Number.isFinite)) notNumbers++;
          else if (!lab.isInTheOpen(object.x, object.y, object.z)) outside++;
          else if (!object.isAsleep) stillMoving++;
        }
      }
      d.clearLooseObjects();
      return { station: station.slice(0, 3).join(' '), places: places.length, thrown: thrown.length, stillInTheStation: count, lostDownThePit: statistics.lostDownThePit - lostBefore,
        notNumbers: notNumbers, outside: outside, stillMoving: stillMoving, putBack: statistics.putBack - putBackBefore, seconds: Math.round((performance.now() - started) / 100) / 10 };
    }, station);
    check('120 objects thrown at random through ' + storm.station + ', spinning, at up to 13 m/s: every one ends inside the station and at rest (or down the pit), and none had to be put back',
      storm.thrown === 120 && storm.stillInTheStation + storm.lostDownThePit === 120 && storm.notNumbers === 0 && storm.outside === 0 && storm.stillMoving === 0 && storm.putBack === 0, storm);
  }

  // --- the scan grenade ---
  await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab;
    lab.reset();
    d.setDebugOption('freezeCreatures', false); // the Hollow has to be able to be stunned, and to come
    lab.stand(spot.x - 2.8, spot.z, Math.PI / 2);
    lab.carry('scanGrenade');
  }, spot);
  await drawFrames(page, 4);
  const beforeArming = await inGame(() => ({ prompt: document.getElementById('hud-prompt').textContent, chip: document.getElementById('chip-carrying').textContent }));
  await page.keyboard.press('KeyQ');
  const armed = await inGame(() => { const d = window.lastReturnDebug; d.simulate(0.1); const grenade = d.getHeldLooseObject(); return { armed: grenade.armedTime >= 0, spent: grenade.isSpent, label: d.getLooseObjectLabel(grenade), messages: window.looseLab.messages() }; });
  check('with a scan grenade in the beam the screen offers Q to arm it, and Q arms it',
    /\[Q\]  Arm the scan grenade/.test(beforeArming.prompt) && beforeArming.chip === 'CARRYING: SCAN GRENADE' && armed.armed && !armed.spent && armed.label === 'scan grenade, armed' && armed.messages.some((text) => /Armed/.test(text)), [beforeArming, armed]);

  const grenade = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    const object = d.getHeldLooseObject();
    // The Hollow stands in the open, a few metres past where you are; you throw the grenade its way.
    d.spawnHollow(spot.x + 1.5, spot.z + 0.6);
    d.hollow.graceTimer = 0; d.hollow.state = 0; d.hollow.hasHeardNoise = false; d.hollow.anger = 0;
    const hollowAt = { x: d.hollow.figure.x, z: d.hollow.figure.z };
    const pointsBefore = d.pointCloud.totalReturns;
    lab.noises.length = 0;
    p.pitch = 0.15;
    d.releaseHeldLooseObject(0.45);
    let wentOffAt = null, stunnedAtAll = false, movedWhileStunned = 0, longestStun = 0;
    for (let step = 0; step < 180; step++) {
      d.simulate(1 / 30);
      if (wentOffAt === null && object.burstSeconds > 0) wentOffAt = { x: object.x, z: object.z, afterSeconds: lab.round(step / 30) };
      if (d.hollow.stunSeconds > 0) {
        stunnedAtAll = true; longestStun = Math.max(longestStun, d.hollow.stunSeconds);
        movedWhileStunned = Math.max(movedWhileStunned, d.hollow.currentSpeed);
      }
      if (object.isSpent && d.hollow.stunSeconds <= 0 && step > 60) break;
    }
    result.wentOff = wentOffAt;
    result.metresFromYou = wentOffAt ? lab.round(Math.hypot(wentOffAt.x - p.x, wentOffAt.z - p.z)) : 0;
    result.metresFromTheHollow = wentOffAt ? lab.round(Math.hypot(wentOffAt.x - hollowAt.x, wentOffAt.z - hollowAt.z)) : 99;
    result.pointsAdded = d.pointCloud.totalReturns - pointsBefore;
    result.noiseThere = wentOffAt !== null && lab.noises.some((noise) => Math.hypot(noise.x - wentOffAt.x, noise.z - wentOffAt.z) < 0.5 && noise.radius > 10);
    result.hitsOnTheHollow = object.burstHitsOnHollow;
    result.stunned = { atAll: stunnedAtAll, seconds: lab.round(longestStun), fastestWhileStunned: lab.round(movedWhileStunned) };
    // Afterwards it comes for where the light came from: the grenade, not you.
    d.simulate(1.5);
    const goingTo = d.hollow.state === 2 ? { x: d.hollow.lastKnownPlayerX, z: d.hollow.lastKnownPlayerZ } : { x: d.hollow.targetX, z: d.hollow.targetZ };
    // (The grenade rolls on while it is going off, so: where it went off, or where it lies now.)
    result.afterwards = { state: d.hollow.state, metresFromWhereItWentOff: wentOffAt !== null ? lab.round(Math.hypot(goingTo.x - wentOffAt.x, goingTo.z - wentOffAt.z)) : 99,
      metresFromWhereItLies: lab.round(Math.hypot(goingTo.x - object.x, goingTo.z - object.z)), metresFromYou: lab.round(Math.hypot(goingTo.x - p.x, goingTo.z - p.z)) };
    result.afterwards.toTheGrenade = Math.min(result.afterwards.metresFromWhereItWentOff, result.afterwards.metresFromWhereItLies) < 1.5;
    result.afterwards.notToYou = result.afterwards.metresFromYou > 2;
    result.spent = { isSpent: object.isSpent, label: d.getLooseObjectLabel(object), counted: d.looseState.statistics.grenadesSpent };
    d.hollow.isActive = false;
    // Used up: Q with it in the beam again does nothing.
    d.pickUpLooseObject(object);
    d.simulate(0.5);
    d.input.wantsUseCarried = true;
    d.simulate(0.3);
    result.spent.armsAgain = object.armedTime > 0 && object.burstSeconds < d.tuning.scanGrenadeBurstSeconds;
    return result;
  }, spot);
  check('thrown, the armed grenade goes off a moment after it lands, metres from you, and scans the room from there: thousands of points, and a noise at that place',
    grenade.wentOff !== null && grenade.metresFromYou > 2.5 && grenade.pointsAdded > 8000 && grenade.noiseThere, grenade);
  check('its light stuns the Hollow where it stands, for a few seconds', grenade.hitsOnTheHollow >= 25 && grenade.stunned.atAll && grenade.stunned.seconds > 2 && grenade.stunned.fastestWhileStunned < 0.05, [grenade.hitsOnTheHollow, grenade.stunned]);
  check('and then the Hollow comes for where the light came from, which is the grenade and not you', grenade.afterwards.toTheGrenade && grenade.afterwards.notToYou, grenade.afterwards);
  check('a grenade that has gone off is spent: it says so and cannot be armed again', grenade.spent.isSpent && grenade.spent.label === 'spent scan grenade' && grenade.spent.counted === 1 && !grenade.spent.armsAgain, grenade.spent);

  const grenadeEdges = await inGame(([spot, bare]) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    // Armed and never thrown: its fuse runs out and it goes off in the beam.
    d.clearLooseObjects();
    lab.stand(spot.x - 2.8, spot.z, Math.PI / 2);
    let object = lab.carry('scanGrenade');
    d.input.wantsUseCarried = true;
    d.simulate(0.1);
    const pointsBefore = d.pointCloud.totalReturns;
    d.simulate(d.tuning.scanGrenadeFuseSeconds - 0.5);
    result.beforeTheFuseIsOut = { spent: object.isSpent, bursting: object.burstSeconds > 0 };
    d.simulate(0.5 + d.tuning.scanGrenadeBurstSeconds + 0.3);
    result.afterTheFuse = { spent: object.isSpent, stillInTheBeam: d.getHeldLooseObject() === object, pointsAdded: d.pointCloud.totalReturns - pointsBefore };
    // Held up in the air, its light goes down as well: the floor under it and round it is lit.
    {
      const added = result.afterTheFuse.pointsAdded, floats = d.pointCloud.floatView;
      let underIt = 0, onTheFloor = 0;
      for (let index = d.pointCloud.storedCount - added; index < d.pointCloud.storedCount; index++) {
        if (floats[index * 5 + 1] >= 0.02) continue;
        onTheFloor++;
        if (Math.hypot(floats[index * 5] - object.x, floats[index * 5 + 2] - object.z) < 1) underIt++;
      }
      result.inTheAir = { height: lab.round(object.y), floorPointsWithinAMetre: underIt, shareOnTheFloor: lab.round(onTheFloor / added) };
    }
    // Lying on the floor, its light goes on the room and not into the floor it lies on.
    d.clearLooseObjects();
    object = d.createLooseObject('scanGrenade', spot.x + 0.5, 0.3, spot.z, 0);
    for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
    const landedBefore = d.pointCloud.totalReturns;
    object.armedTime = d.game.time; object.goesOffTime = d.game.time;
    d.simulate(d.tuning.scanGrenadeBurstSeconds + 0.2);
    const landed = d.pointCloud.totalReturns - landedBefore, floats = d.pointCloud.floatView;
    let underIt = 0, onTheFloor = 0, furthest = 0;
    for (let index = d.pointCloud.storedCount - landed; index < d.pointCloud.storedCount; index++) {
      const away = Math.hypot(floats[index * 5] - object.x, floats[index * 5 + 2] - object.z);
      if (floats[index * 5 + 1] < 0.02) onTheFloor++;
      if (Math.hypot(away, floats[index * 5 + 1] - object.y) < 0.24) underIt++;
      furthest = Math.max(furthest, away);
    }
    result.whereItsLightGoes = { pulses: landed, shareUnderIt: lab.round(underIt / landed), shareOnTheFloor: lab.round(onTheFloor / landed), furthestMetres: lab.round(furthest) };
    // Lying on the floor right up against a wall: nothing on the floor under it and nothing on the wall beside it.
    d.clearLooseObjects();
    object = d.createLooseObject('scanGrenade', bare.x + bare.stepX * (bare.wall - 0.07), 0.08, bare.z + bare.stepZ * (bare.wall - 0.07), 0);
    object.isAsleep = true; // as it lies
    {
      const before = d.pointCloud.totalReturns;
      object.armedTime = d.game.time; object.goesOffTime = d.game.time;
      d.simulate(d.tuning.scanGrenadeBurstSeconds + 0.2);
      const added = d.pointCloud.totalReturns - before, floats = d.pointCloud.floatView;
      let near = 0, onThatWall = 0, awayFromTheWall = 0;
      for (let index = d.pointCloud.storedCount - added; index < d.pointCloud.storedCount; index++) {
        const x = floats[index * 5], y = floats[index * 5 + 1], z = floats[index * 5 + 2];
        if (Math.hypot(x - object.x, y - object.y, z - object.z) < 0.24) near++;
        const towardsTheWall = (x - object.x) * bare.stepX + (z - object.z) * bare.stepZ;
        if (towardsTheWall > 0.02) onThatWall++; else if (towardsTheWall < -0.5) awayFromTheWall++;
      }
      result.againstAWall = { fromTheWall: lab.round(bare.wall - ((object.x - bare.x) * bare.stepX + (object.z - bare.z) * bare.stepZ)), pulses: added,
        shareWithinAHand: lab.round(near / added), shareOnThatWall: lab.round(onThatWall / added), shareOutIntoTheRoom: lab.round(awayFromTheWall / added) };
    }
    // An enraged Hollow is not stunned by it.
    d.clearLooseObjects();
    object = d.createLooseObject('scanGrenade', spot.x + 0.5, 0.3, spot.z, 0);
    for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
    d.setDebugOption('freezeCreatures', true); // it stays where it is put, enraged
    d.spawnHollow(spot.x + 2, spot.z);
    d.hollow.graceTimer = 0; d.hollow.enragedTimer = 30;
    object.armedTime = d.game.time; object.goesOffTime = d.game.time;
    d.simulate(d.tuning.scanGrenadeBurstSeconds + 0.2);
    result.enraged = { hits: object.burstHitsOnHollow, stunSeconds: d.hollow.stunSeconds };
    d.hollow.isActive = false; d.hollow.enragedTimer = 0;
    return result;
  }, [spot, bareWallForScanner]);
  check('armed and never thrown, it goes off in the beam when its fuse runs out, and not before',
    !grenadeEdges.beforeTheFuseIsOut.spent && !grenadeEdges.beforeTheFuseIsOut.bursting && grenadeEdges.afterTheFuse.spent && grenadeEdges.afterTheFuse.stillInTheBeam && grenadeEdges.afterTheFuse.pointsAdded > 8000, grenadeEdges);
  check('held up in the air when it goes off, its light goes down too: the floor right under it is lit',
    grenadeEdges.inTheAir.height > 0.8 && grenadeEdges.inTheAir.floorPointsWithinAMetre > 500 && grenadeEdges.inTheAir.shareOnTheFloor > 0.25, grenadeEdges.inTheAir);
  check('lying on the floor, a grenade puts its light on the room: next to none of it on the patch of floor it lies on, some of it on the floor round about, and it reaches the walls',
    grenadeEdges.whereItsLightGoes.shareUnderIt < 0.05 && grenadeEdges.whereItsLightGoes.shareOnTheFloor > 0.08 && grenadeEdges.whereItsLightGoes.shareOnTheFloor < 0.3 && grenadeEdges.whereItsLightGoes.furthestMetres > 3, grenadeEdges.whereItsLightGoes);
  check('lying against a wall, its light goes away from the wall as well as from the floor: almost none within a hand of it, and more than half of it out into the room',
    grenadeEdges.againstAWall.fromTheWall < 0.1 && grenadeEdges.againstAWall.pulses > 8000 && grenadeEdges.againstAWall.shareWithinAHand < 0.05 && grenadeEdges.againstAWall.shareOutIntoTheRoom > 0.5, grenadeEdges.againstAWall);
  check('an enraged Hollow is lit by it and not stunned', grenadeEdges.enraged.hits >= 25 && grenadeEdges.enraged.stunSeconds === 0, grenadeEdges.enraged);

  // --- the Hollow goes after what it kicks ---
  const chased = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, result = {};
    lab.reset(); // creatures held still again: the test walks the Hollow by hand
    lab.stand(spot.x - 2.9, spot.z - 2, Math.PI / 2);
    for (const which of ['canister', 'pumpMotor', 'canister you never touched']) {
      const kindKey = which.split(' ')[0];
      d.clearLooseObjects();
      const object = d.createLooseObject(kindKey, spot.x, 0.3, spot.z, 0);
      object.wasHandled = which === kindKey; // as if you had had it in the beam, some time ago
      if (kindKey === 'canister') d.setLooseObjectOrientation(object, 0.7071, 0, 0, 0.7071); // lying on its side, to roll
      for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
      d.spawnHollow(object.x, object.z - 1.5);
      d.hollow.graceTimer = 0; d.hollow.state = 0;
      const start = { x: object.x, z: object.z };
      for (let step = 0; step < 24; step++) { d.hollow.figure.z += 3 / 30; d.simulate(1 / 30); } // it walks through where the thing lies
      const entry = { kicked: lab.round(Math.hypot(object.x - start.x, object.z - start.z)), state: d.hollow.state,
        goingAfterIt: d.hollow.state === 1 && Math.hypot(d.hollow.targetX - object.x, d.hollow.targetZ - object.z) < 0.6 };
      // Give the thing a shove by hand and see whether the Hollow's aim follows it, now and after it has had enough.
      object.x += 1.2; d.wakeLooseObject(object); object.kickedByHollowTime = d.game.time;
      d.simulate(0.2);
      entry.followsIt = Math.hypot(d.hollow.targetX - object.x, d.hollow.targetZ - object.z) < 0.6;
      d.simulate(d.tuning.hollowChasesKickedSeconds + 1);
      const before = { x: d.hollow.targetX, z: d.hollow.targetZ };
      object.x -= 1.5; d.wakeLooseObject(object); object.kickedByHollowTime = d.game.time;
      d.simulate(0.2);
      entry.hasHadEnough = Math.hypot(d.hollow.targetX - before.x, d.hollow.targetZ - before.z) < 0.01;
      result[which] = entry;
      d.hollow.isActive = false;
    }
    result.limit = d.tuning.hollowChasesKickedMass;
    return result;
  }, spot);
  check('the Hollow goes after a canister it has kicked, if you have handled it: it follows it as it rolls, and has had enough after a few seconds',
    chased.canister.kicked > 0.3 && chased.canister.goingAfterIt && chased.canister.followsIt && chased.canister.hasHadEnough, chased.canister);
  check('it does not go after something too heavy to roll off, like a pump motor', !chased.pumpMotor.goingAfterIt && !chased.pumpMotor.followsIt, chased.pumpMotor);
  check('and what you have never touched it kicks aside and forgets', chased['canister you never touched'].kicked > 0.3 && !chased['canister you never touched'].goingAfterIt && !chased['canister you never touched'].followsIt, chased['canister you never touched']);

  // --- its points, and the floor's ---
  const pointsKept = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    lab.reset();
    d.clearLooseObjects();
    const object = d.createLooseObject('crate', spot.x, 0.4, spot.z, 0.3);
    for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
    lab.scan(object);
    const reach = object.prepared.partsRadius + 0.3;
    result.scannedAtRest = lab.countPoints(object.x, object.y, object.z, reach);
    const wasAt = { x: object.x, y: object.y, z: object.z };
    // Picked up and carried off: its points go, the floor's stay.
    lab.stand(object.x - 1.6, object.z, Math.PI / 2);
    d.pickUpLooseObject(object);
    p.pitch = 0.9; // up and away from where it lay
    d.simulate(2);
    result.carriedOff = lab.countPoints(wasAt.x, wasAt.y, wasAt.z, reach);
    // In the beam and scanned: the points on it are the kind that fade.
    p.pitch = 0;
    d.simulate(1);
    d.setScanHeld(true); d.simulate(0.4); d.setScanHeld(false);
    result.inTheBeam = lab.countPoints(object.x, object.y, object.z, object.prepared.partsRadius + 0.1);
    // Set down, scanned where it lies, and then taken out of the world: its points go with it.
    d.releaseHeldLooseObject(0);
    for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
    lab.scan(object);
    const liesAt = { x: object.x, y: object.y, z: object.z };
    result.scannedAgain = lab.countPoints(liesAt.x, liesAt.y, liesAt.z, reach);
    const button = document.getElementById('debug-loose-clear');
    result.usedTheDebugButton = Boolean(button);
    if (button) button.click(); else d.removeLooseObject(object);
    result.removed = { loose: d.looseObjects.length, points: lab.countPoints(liesAt.x, liesAt.y, liesAt.z, reach) };
    return result;
  }, spot);
  check('an object scanned where it lies keeps the points; picked up, they are let go and the floor it stood on keeps every one of its own',
    pointsKept.scannedAtRest.onObjects > 50 && pointsKept.scannedAtRest.station > 50 && pointsKept.carriedOff.onObjects === 0 && pointsKept.carriedOff.station === pointsKept.scannedAtRest.station,
    [pointsKept.scannedAtRest, pointsKept.carriedOff]);
  check('points scanned onto an object in the beam are of the kind that fade', pointsKept.inTheBeam.fading > 20 && pointsKept.inTheBeam.onObjects === 0, pointsKept.inTheBeam);
  check('"Remove them all" in debug mode takes each object\'s points with it, and leaves the floor\'s',
    pointsKept.usedTheDebugButton && pointsKept.scannedAgain.onObjects > 50 && pointsKept.removed.loose === 0 && pointsKept.removed.points.onObjects === 0 && pointsKept.removed.points.station === pointsKept.scannedAgain.station,
    [pointsKept.scannedAgain, pointsKept.removed]);

  // --- walking into one that lies on the floor ---
  const shoved = await inGame((bare) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    lab.reset();
    const startX = bare.x + bare.stepX * (bare.wall - 3.1), startZ = bare.z + bare.stepZ * (bare.wall - 3.1);
    const walk = function (kindKey) {
      d.clearLooseObjects();
      lab.stand(startX, startZ, bare.yaw);
      let object = null;
      if (kindKey) {
        object = d.createLooseObject(kindKey, startX + bare.stepX * 0.9, 0.5, startZ + bare.stepZ * 0.9, bare.yaw);
        for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
      }
      const objectAt = object ? { x: object.x, z: object.z } : null;
      d.input.keysDown.add('KeyW');
      d.simulate(1.2);
      d.input.keysDown.clear();
      return { walked: lab.round((p.x - startX) * bare.stepX + (p.z - startZ) * bare.stepZ),
        objectMoved: object ? lab.round((object.x - objectAt.x) * bare.stepX + (object.z - objectAt.z) * bare.stepZ) : 0,
        resistance: kindKey ? d.getLooseShoveResistance(d.looseObjectKinds[kindKey].mass) : 0 };
    };
    result.nothing = walk(null);
    for (const kindKey of ['jar', 'toolCase', 'crate', 'pumpMotor']) result[kindKey] = walk(kindKey);
    return result;
  }, bareWall);
  check('a jar on the floor is kicked along without slowing you; a tool case slows you a little, a crate a lot',
    shoved.jar.walked > shoved.nothing.walked - 0.1 && shoved.jar.objectMoved > 0.5 &&
    shoved.toolCase.walked < shoved.nothing.walked - 0.1 && shoved.crate.walked < shoved.toolCase.walked - 0.2 && shoved.crate.objectMoved > 0.05, shoved);
  check('a pump motor on the floor does not move for your legs: it stops you where it lies',
    shoved.pumpMotor.resistance === 1 && shoved.pumpMotor.objectMoved < 0.03 && shoved.pumpMotor.walked < 0.6, shoved.pumpMotor);

  // --- a vent ---
  const vent = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    // A vent mouth: a vent tile with ordinary floor right in front of it, and more vent behind. Kessel-9 has no
    // vents, so this is a generated station: the first of a few that has such a mouth.
    let mouth = null;
    for (let seed = 1; seed <= 12 && !mouth; seed++) {
    d.loadStation('generated', seed, 'medium', 'mixed', 'one');
    d.clearLooseObjects();
    d.game.flags.hasLeftLift = true;
    d.setDebugOption('freezeCreatures', true); d.hollow.isActive = false;
    result.seed = seed;
    for (let z = 2; z < 200 && !mouth; z++) {
      for (let x = 2; x < 200 && !mouth; x++) {
        if (!d.isVentAt(x + 0.5, z + 0.5)) continue;
        for (const step of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const outside = d.findWalkableSpotNear(x + 0.5 - step[0], z + 0.5 - step[1]);
          const twoOutside = d.findWalkableSpotNear(x + 0.5 - step[0] * 2, z + 0.5 - step[1] * 2);
          if (!outside || outside.x !== x + 0.5 - step[0] || outside.z !== z + 0.5 - step[1] || d.isVentAt(outside.x, outside.z)) continue;
          if (!twoOutside || twoOutside.x !== x + 0.5 - step[0] * 2 || twoOutside.z !== z + 0.5 - step[1] * 2 || d.isVentAt(twoOutside.x, twoOutside.z)) continue;
          if (!d.isVentAt(x + 0.5 + step[0], z + 0.5 + step[1])) continue;
          if (Math.abs(d.getFloorHeightAt(outside.x, outside.z) - d.getFloorHeightAt(x + 0.5, z + 0.5)) > 0.05) continue;
          mouth = { x: x + 0.5, z: z + 0.5, stepX: step[0], stepZ: step[1] };
          break;
        }
      }
    }
    }
    if (!mouth) return null;
    result.mouth = mouth;
    for (const kindKey of ['jar', 'crate', 'pumpMotor', 'pipe', 'toolCase']) {
      d.clearLooseObjects();
      lab.stand(mouth.x - mouth.stepX * 1.6, mouth.z - mouth.stepZ * 1.6, Math.atan2(mouth.stepX, -mouth.stepZ));
      d.input.keysDown.add('KeyC');
      d.simulate(0.8);
      const object = lab.carry(kindKey);
      if (kindKey === 'pipe') {
        // Taken up squarely across your way: put down, turned across the vent, and taken into the beam again.
        d.releaseHeldLooseObject(0);
        d.setLooseObjectYaw(object, mouth.stepX !== 0 ? Math.PI / 2 : 0);
        object.velocityX = 0; object.velocityY = 0; object.velocityZ = 0; object.spinX = 0; object.spinY = 0; object.spinZ = 0;
        d.pickUpLooseObject(object, false);
        d.simulate(0.6);
      }
      const before = lab.knocks();
      // Which way its length lies: 1 along the vent, 0 across it. (Its own first axis is its length, for a pipe.)
      const alongTheVent = function () { return lab.round(Math.abs(object.matrix[0] * mouth.stepX + object.matrix[6] * mouth.stepZ)); };
      const acrossAtFirst = alongTheVent();
      d.input.keysDown.add('KeyW');
      let objectInVent = false;
      for (let step = 0; step < 150; step++) { d.simulate(1 / 30); if (d.isVentAt(object.x, object.z)) objectInVent = true; }
      result[kindKey] = { playerInVent: d.isVentAt(p.x, p.z), objectInVent: objectInVent, objectInVentAtTheEnd: d.isVentAt(object.x, object.z), stillHeld: d.getHeldLooseObject() === object, knocks: lab.since(before), messages: lab.messages(),
        metresIn: lab.round((p.x - mouth.x) * mouth.stepX + (p.z - mouth.z) * mouth.stepZ), acrossAtFirst: acrossAtFirst, alongTheVent: alongTheVent() };
      d.input.keysDown.clear();
    }
    return result;
  });
  // No rule says what may go into a vent: a thing goes where it fits. A vent is a metre wide and 1.15 m high.
  check('a jar, a tool case, a crate and a pump motor each go into a vent ahead of you, still in the beam',
    vent !== null && ['jar', 'toolCase', 'crate', 'pumpMotor'].every((key) => vent[key].playerInVent && vent[key].objectInVent && vent[key].stillHeld), vent);
  check('a pipe hangs across the beam and is wider than the vent: it goes in only once pressing it against the mouth has turned it lengthwise, and nothing but the pipe says so',
    vent !== null && vent.pipe.stillHeld && (!vent.pipe.playerInVent || vent.pipe.alongTheVent > 0.6) && vent.pipe.acrossAtFirst < 0.45 &&
    ['jar', 'toolCase', 'crate', 'pumpMotor', 'pipe'].every((key) => !vent[key].messages.some((text) => /will not go in|no room in here/.test(text))), vent ? vent.pipe : null);

  // --- the pit, and a new descent ---
  const housekeeping = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, result = {};
    d.clearLooseObjects();
    let pit = null;
    for (let z = 2; z < 200 && !pit; z++) for (let x = 2; x < 200 && !pit; x++) if (d.getTileFlagsAt(x + 0.5, z + 0.5) & d.tileFlagPit) pit = { x: x + 0.5, z: z + 0.5 };
    if (pit) {
      const lostBefore = d.looseState.statistics.lostDownThePit;
      const object = d.createLooseObject('jar', pit.x, 0.5, pit.z, 0);
      const fromY = object.y;
      for (let step = 0; step < 400 && d.looseObjects.length > 0; step++) d.simulate(1 / 30);
      result.pit = { there: true, fellFrom: fromY, gone: d.looseObjects.length === 0, counted: d.looseState.statistics.lostDownThePit - lostBefore };
    } else {
      result.pit = { there: false };
    }
    lab.stand(spot.x, spot.z, Math.PI / 2);
    lab.carry('canister');
    d.createLooseObject('crate', spot.x - 1.5, 0.5, spot.z, 0);
    result.before = { loose: d.looseObjects.length, carrying: d.getHeldLooseObject() !== null };
    d.loadStation('classic', 0);
    result.after = { loose: d.looseObjects.length, ofTheStation: d.stationLooseObjects.length, carrying: d.getHeldLooseObject() !== null, speedFactor: d.getCarrySpeedFactor() };
    return result;
  }, spot);
  check('something dropped down the shaft is gone for good', housekeeping.pit.there ? housekeeping.pit.gone && housekeeping.pit.counted === 1 : true, housekeeping.pit);
  check('a new descent starts with nothing in the beam, and nothing loose but what the station has lying about',
    housekeeping.before.loose === 2 && housekeeping.before.carrying && housekeeping.after.loose === housekeeping.after.ofTheStation && housekeeping.after.ofTheStation > 10 && !housekeeping.after.carrying && housekeeping.after.speedFactor === 1, housekeeping);

  // --- what a station has lying about ---
  const lyingAbout = await inGame(() => {
    const d = window.lastReturnDebug, result = {};
    for (const station of [['classic', 0], ['generated', 7, 'medium', 'mixed', 'one'], ['generated', 99, 'large', 'mixed', 'one']]) {
      d.loadStation.apply(null, station);
      d.setDebugOption('freezeCreatures', true); d.hollow.isActive = false;
      const entry = { total: d.stationLooseObjects.length, loose: d.looseObjects.length, asleep: d.looseObjects.filter((object) => object.isAsleep).length,
        counts: {}, value: 0, onSurfaces: 0, lowestSurface: 9, cansInHeaps: d.noisyFloorCanHeaps.length * 6, problems: d.auditStationLooseObjects() };
      for (const item of d.stationLooseObjects) {
        entry.counts[item.kindKey] = (entry.counts[item.kindKey] || 0) + 1;
        entry.value += d.looseObjectKinds[item.kindKey].value;
        if (item.on === 'surface') { entry.onSurfaces++; entry.lowestSurface = Math.min(entry.lowestSurface, item.y - d.getFloorHeightAt(item.x, item.z)); }
      }
      entry.lowestSurface = Math.round(entry.lowestSurface * 100) / 100;
      const signature = JSON.stringify(d.stationLooseObjects);
      // Wake every one of them: put down as it would lie, none of them should stir, and none should make a sound.
      const noises = []; d.debugHooks.recordNoise = function (x, z, radius) { noises.push(radius); };
      const before = d.looseObjects.map((object) => [object.x, object.y, object.z, object.orientationX, object.orientationY, object.orientationZ, object.orientationW]);
      for (const object of d.looseObjects) d.wakeLooseObject(object);
      for (let step = 0; step < 120; step++) d.simulate(1 / 30);
      entry.stirred = 0;
      d.looseObjects.forEach((object, index) => {
        const was = before[index];
        const turned = 2 * Math.acos(Math.min(1, Math.abs(object.orientationX * was[3] + object.orientationY * was[4] + object.orientationZ * was[5] + object.orientationW * was[6]))) * 180 / Math.PI;
        if (Math.hypot(object.x - was[0], object.y - was[1], object.z - was[2]) > 0.03 || turned > 5) entry.stirred++;
      });
      entry.asleepAgain = d.looseObjects.filter((object) => object.isAsleep).length;
      entry.noises = noises.length;
      // Carry one off and kick another away, then come down again: all of it lies where it lay.
      d.looseObjects[0].x += 0.4; d.looseObjects[0].y += 1; d.wakeLooseObject(d.looseObjects[0]);
      d.removeLooseObject(d.looseObjects[1]);
      d.simulate(0.5);
      d.loadStation.apply(null, station);
      entry.sameAgain = JSON.stringify(d.stationLooseObjects) === signature && d.looseObjects.length === entry.total &&
        d.looseObjects.every((object, index) => object.isAsleep && Math.hypot(object.x - before[index][0], object.y - before[index][1], object.z - before[index][2]) < 1e-6);
      result[station.join(' ')] = entry;
    }
    window.looseLab.reset();
    return result;
  });
  for (const stationName of Object.keys(lyingAbout)) {
    const entry = lyingAbout[stationName];
    check(stationName + ': the station has things lying about, each at rest, none in rock, a doorway, a vent, the pit or the lift car',
      entry.total >= 25 && entry.loose === entry.total && entry.asleep === entry.total && entry.problems.length === 0, entry);
    check(stationName + ': cans where the draw put cans (six to a heap), litter, and things worth carrying out, some of them on tables and shelves',
      entry.counts.can >= entry.cansInHeaps && entry.cansInHeaps >= 6 && entry.counts.carton >= 3 && entry.counts.plate >= 1 && entry.onSurfaces >= 2 && entry.lowestSurface >= 0.35 && entry.value >= 250, entry);
    check(stationName + ': woken, none of them stirs or makes a sound, and they are at rest again', entry.stirred === 0 && entry.noises === 0 && entry.asleepAgain === entry.total, entry);
    check(stationName + ': the same station has the same things in the same places, and a new descent puts them back', entry.sameAgain, entry);
  }

  // --- cans ---
  const cans = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    for (const pace of ['crouched', 'walking', 'running']) {
      lab.reset();
      lab.stand(spot.x - 2.2, spot.z, Math.PI / 2);
      const can = d.createLooseObject('can', spot.x, 0.05, spot.z, 0);
      d.setLooseObjectOrientation(can, 0.7071, 0, 0, 0.7071); // on its side, across your way
      for (let step = 0; step < 150 && !can.isAsleep; step++) d.simulate(1 / 30);
      const before = lab.knocks(), fromX = can.x;
      lab.noises.length = 0;
      if (pace === 'crouched') { d.input.keysDown.add('KeyC'); d.simulate(0.8); }
      if (pace === 'running') d.input.keysDown.add('ShiftLeft');
      d.input.keysDown.add('KeyW');
      // How far the loudest knock of the can carried. (Your own steps make noise too: those are not counted.)
      let carries = 0, knockTime = d.looseState.lastKnock.time;
      for (let step = 0; step < (pace === 'crouched' ? 90 : 42); step++) {
        d.simulate(1 / 30);
        if (d.looseState.lastKnock.time !== knockTime) { knockTime = d.looseState.lastKnock.time; carries = Math.max(carries, d.looseState.lastKnock.carries); }
      }
      d.input.keysDown.clear();
      result[pace] = { layStill: Math.abs(fromX - spot.x) < 0.05, moved: lab.round(can.x - fromX), knocks: lab.since(before), youPassed: p.x > fromX,
        carries: lab.round(carries), saidKicked: d.captionCounts.ownObjectKicked, saidOtherwise: d.captionCounts.ownObjectKnock + d.captionCounts.ownObjectCrash };
    }
    // One left standing stays standing, until something touches it.
    lab.reset();
    lab.stand(spot.x - 3, spot.z, Math.PI / 2);
    const standing = d.createLooseObject('can', spot.x, 0.0665, spot.z, 0.4);
    for (let step = 0; step < 150 && !standing.isAsleep; step++) d.simulate(1 / 30);
    result.standing = { atRest: standing.isAsleep, upright: lab.round(standing.matrix[4]), height: lab.round(standing.y) };
    // In a scan it shows in the warning colour, like broken glass; a jar shows as something to take.
    const colourOf = function (object) { return d.castScannerRay(object.x - 1, object.y + 0.3, object.z, 0.958, -0.287, 0, 5) && d.rayHit.looseObject === object ? d.rayHit.surfaceClass : -1; };
    const jar = d.createLooseObject('jar', spot.x, 0.3, spot.z + 1, 0);
    for (let step = 0; step < 150 && !jar.isAsleep; step++) d.simulate(1 / 30);
    result.colours = { can: colourOf(standing), jar: colourOf(jar) };
    return result;
  }, spot);
  check('walked into, an empty can is kicked away and heard about as far as broken glass underfoot, and the caption says what you did',
    cans.walking.layStill && cans.walking.moved > 0.3 && cans.walking.youPassed && cans.walking.carries >= 7 && cans.walking.carries <= 13 && cans.walking.saidKicked >= 1 && cans.walking.saidOtherwise === 0, cans.walking);
  check('at a run it carries much further; crouched, you nudge it aside and the Hollow hears nothing',
    cans.running.carries >= 14 && cans.running.carries > cans.walking.carries + 3 && cans.crouched.carries === 0 && cans.crouched.knocks.heard === 0 && cans.crouched.youPassed, { running: cans.running, crouched: cans.crouched });
  check('a can left standing stays standing', cans.standing.atRest && cans.standing.upright > 0.99 && cans.standing.height > 0.05, cans.standing);
  check('a can shows in the warning colour in a scan, a jar as something to take', cans.colours.can === 12 && cans.colours.jar === 7, cans.colours);

  // --- thrown back ---
  const thrownBack = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    for (const which of ['can', 'canister']) {
      lab.reset(); // creatures held still: the test walks the Hollow by hand
      lab.stand(spot.x - 2.9, spot.z - 2, Math.PI / 2);
      const object = d.createLooseObject(which, spot.x + 2, 0.3, spot.z + 1, 0);
      d.setLooseObjectOrientation(object, 0.7071, 0, 0, 0.7071);
      for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
      object.wasHandled = true; // you threw it there, a while ago
      d.spawnHollow(object.x, object.z - 1.5);
      d.hollow.graceTimer = 0; d.hollow.state = 0;
      for (let step = 0; step < 24; step++) { d.hollow.figure.z += 3 / 30; d.simulate(1 / 30); } // it walks through where the thing lies
      const entry = { kicked: object.kickedByHollowTime > d.game.time - 2, flungTooSoon: d.looseState.statistics.flungBack };
      // It stays on the thing's heels for as long as it goes after it.
      lab.noises.length = 0;
      const before = lab.knocks();
      let flungAt = -1;
      for (let step = 0; step < 150 && flungAt < 0; step++) {
        d.hollow.figure.x = object.x + 0.6; d.hollow.figure.z = object.z; object.kickedByHollowTime = d.game.time;
        d.simulate(1 / 30);
        if (d.looseState.statistics.flungBack > 0) flungAt = step / 30;
      }
      entry.flungAfterSeconds = lab.round(flungAt);
      entry.speed = lab.round(Math.hypot(object.velocityX, object.velocityZ));
      entry.said = d.captionCounts.hollowFling;
      // Where it aimed. (Where the thing ends up is another matter: a can bounces and rolls.)
      entry.aimedMetresFromYou = flungAt >= 0 ? lab.round(Math.hypot(d.looseState.lastFling.targetX - p.x, d.looseState.lastFling.targetZ - p.z)) : -1;
      entry.scatter = d.tuning.hollowFlingsScatterMetres;
      const hollowAt = { x: d.hollow.figure.x, z: d.hollow.figure.z };
      for (let step = 0; step < 240 && !object.isAsleep; step++) d.simulate(1 / 30);
      entry.landedMetresFromYou = lab.round(Math.hypot(object.x - p.x, object.z - p.z));
      entry.wasMetresFromYou = lab.round(Math.hypot(hollowAt.x - p.x, hollowAt.z - p.z));
      entry.knocksOnLanding = lab.since(before);
      entry.noisesTheHollowHeard = lab.noises.length;
      entry.hollowStillLooksAtIt = Math.hypot(d.hollow.targetX - object.x, d.hollow.targetZ - object.z) < 1;
      entry.ignored = object.isIgnoredByHollow; entry.stillOfInterest = object.wasHandled;
      // In the beam again, it is yours again and its noise counts.
      d.pickUpLooseObject(object, false);
      entry.afterPickingItUp = { ignored: object.isIgnoredByHollow, ofInterest: object.wasHandled };
      d.releaseHeldLooseObject(0);
      d.hollow.isActive = false;
      result[which] = entry;
    }
    return result;
  }, spot);
  check('a can you have handled, the Hollow kicks, goes after for a couple of seconds, and then throws back: aimed at you or just beside you, it comes down on your side of the room, with a caption',
    thrownBack.can.kicked && thrownBack.can.flungTooSoon === 0 && thrownBack.can.flungAfterSeconds >= 0.5 && thrownBack.can.speed > 3 && thrownBack.can.said >= 1 &&
    thrownBack.can.aimedMetresFromYou >= 0 && thrownBack.can.aimedMetresFromYou <= thrownBack.can.scatter + 0.01 && thrownBack.can.landedMetresFromYou < thrownBack.can.wasMetresFromYou - 1.5, thrownBack.can);
  check('what it threw makes its own noise where it lands, and the Hollow does not come to that; picked up again, the thing is yours again',
    thrownBack.can.knocksOnLanding.heard + thrownBack.can.knocksOnLanding.quiet >= 1 && thrownBack.can.noisesTheHollowHeard === 0 && thrownBack.can.ignored && !thrownBack.can.stillOfInterest &&
    !thrownBack.can.afterPickingItUp.ignored && thrownBack.can.afterPickingItUp.ofInterest, thrownBack.can);
  check('a gas canister is too heavy for that: it goes after it and does not throw it', thrownBack.canister.kicked && thrownBack.canister.flungAfterSeconds < 0 && !thrownBack.canister.ignored, thrownBack.canister);

  // --- what a knock costs ---
  const breakage = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player, result = {};
    lab.reset();
    lab.setBreakable(true);
    const wall = lab.rockAhead(spot.x, spot.z);
    // How a thing of this kind fares: set down from a crouch, let go of standing up, or thrown as hard as you can.
    const fares = function (kindKey, how) {
      d.clearLooseObjects();
      lab.stand(spot.x, spot.z, Math.PI / 2);
      if (how === 'set down') { d.input.keysDown.add('KeyC'); d.simulate(0.8); }
      const object = lab.carry(kindKey);
      // Set down: you look down at the floor over a second and a half, so that it is lowered and not slammed.
      if (how === 'set down') { for (let step = 0; step < 45; step++) { p.pitch -= 1.1 / 45; d.simulate(1 / 30); } d.simulate(0.8); } else p.pitch = how === 'thrown' ? 0.1 : 0;
      d.captionCounts.ownObjectShatter = 0;
      d.clearMessages();
      lab.noises.length = 0;
      const shatteredBefore = d.looseState.statistics.shattered;
      d.releaseHeldLooseObject(how === 'thrown' ? 1 : 0);
      for (let step = 0; step < 300 && !object.isAsleep && !object.isRemoved; step++) d.simulate(1 / 30);
      d.input.keysDown.clear();
      return { whole: object.kind.value, worth: object.isRemoved ? 0 : d.getLooseObjectValue(object), gone: object.isRemoved, shattered: d.looseState.statistics.shattered - shatteredBefore,
        said: lab.messages(), caption: d.captionCounts.ownObjectShatter, loudest: lab.round(Math.max.apply(null, [0].concat(lab.noises.map((noise) => noise.radius)))),
        at: [lab.round(object.x), lab.round(object.z)] };
    };
    result.toolCase = { setDown: fares('toolCase', 'set down'), dropped: fares('toolCase', 'dropped'), thrown: fares('toolCase', 'thrown') };
    result.can = { thrown: fares('can', 'thrown') };
    // Thrown again and again, it is never worth less than a tenth of what it was.
    d.clearLooseObjects();
    lab.stand(spot.x, spot.z, Math.PI / 2);
    const battered = lab.carry('toolCase');
    for (let again = 0; again < 14; again++) {
      p.pitch = 0.1;
      d.releaseHeldLooseObject(1);
      for (let step = 0; step < 240 && !battered.isAsleep; step++) d.simulate(1 / 30);
      lab.stand(battered.x - 1.2, battered.z, Math.PI / 2);
      p.pitch = Math.atan2(battered.y - d.getPlayerEyeY(), 1.2);
      d.simulate(0.1);
      d.pickUpLooseObject(battered, false);
      d.simulate(1.2);
      lab.stand(spot.x, spot.z, Math.PI / 2);
      d.simulate(0.8);
    }
    result.battered = { worth: d.getLooseObjectValue(battered), whole: battered.kind.value, least: battered.kind.value * d.tuning.looseWorthLeastShare, lostInAll: d.looseState.statistics.worthLost };
    d.releaseHeldLooseObject(0);

    // A sample jar: set down it is whole; carried into a wall at a walk it lives, and is worth a little less;
    // let go of standing up it shatters.
    result.jar = { setDown: fares('jar', 'set down') };
    d.clearLooseObjects();
    lab.stand(spot.x + wall - 2.6, spot.z, Math.PI / 2);
    const bumped = lab.carry('jar');
    d.input.keysDown.add('KeyW');
    d.simulate(2.5);
    d.input.keysDown.clear();
    result.jar.walkedIntoAWall = { gone: bumped.isRemoved, worth: bumped.isRemoved ? 0 : d.getLooseObjectValue(bumped), whole: bumped.kind.value, held: d.getHeldLooseObject() === bumped };
    const patchesBefore = d.noisyFloorPatches.length;
    result.jar.dropped = fares('jar', 'dropped');
    const glass = d.noisyFloorPatches.filter((patch) => patch.isFromPlay);
    result.glass = { patches: d.noisyFloorPatches.length - patchesBefore, kind: glass.length ? glass[0].kind : '', metresFromWhereItBroke: glass.length ? lab.round(Math.hypot(glass[0].x - result.jar.dropped.at[0], glass[0].z - result.jar.dropped.at[1])) : 99,
      pieces: glass.length ? glass[0].props.length : 0, markedLoud: glass.length ? d.findNoisyFloorPatchAt(glass[0].x, glass[0].z) === glass[0] : false };
    // Walking across what is left of it is as loud as any broken glass.
    if (glass.length) {
      d.clearLooseObjects();
      d.noisyFloorCounts.byPlayer = 0;
      lab.stand(glass[0].x - 1.6, glass[0].z, Math.PI / 2);
      d.input.keysDown.add('KeyW');
      d.simulate(1.6);
      d.input.keysDown.clear();
      result.glass.setOffByWalkingOverIt = d.noisyFloorCounts.byPlayer;
    }
    // A new descent: the glass is swept up, and what the station has lying about is whole again.
    d.startOver();
    d.game.flags.hasLeftLift = true; d.hollow.isActive = false;
    result.newDescent = { glassLeft: d.noisyFloorPatches.filter((patch) => patch.isFromPlay).length, patches: d.noisyFloorPatches.length - patchesBefore,
      allWhole: d.looseObjects.length > 10 && d.looseObjects.every((object) => d.getLooseObjectValue(object) === object.kind.value), lost: d.looseState.statistics.worthLost };
    lab.reset();
    lab.setBreakable(false);
    return result;
  }, spot);
  check('a knock costs by how hard it is: a tool case set down from a crouch is worth what it was, let go of standing up it is worth less, thrown it is worth less still, and the screen says so',
    breakage.toolCase.setDown.worth === breakage.toolCase.setDown.whole && breakage.toolCase.dropped.worth < breakage.toolCase.dropped.whole && breakage.toolCase.dropped.worth > breakage.toolCase.dropped.whole * 0.6 &&
    breakage.toolCase.thrown.worth < breakage.toolCase.dropped.worth && !breakage.toolCase.thrown.gone && breakage.toolCase.dropped.said.some((text) => /The tool case took that badly/.test(text)) &&
    breakage.toolCase.setDown.said.every((text) => !/took that badly/.test(text)), breakage.toolCase);
  check('an empty can loses nothing however it is thrown, and a thing thrown again and again is never worth less than a tenth of what it was',
    breakage.can.thrown.worth === breakage.can.thrown.whole && breakage.battered.worth >= Math.round(breakage.battered.least) && breakage.battered.worth <= breakage.battered.whole * 0.25 && breakage.battered.lostInAll > 0, [breakage.can, breakage.battered]);
  check('a sample jar set down is whole; carried into a wall at a walk it lives, worth no more than it was; let go of standing up it shatters, loudly, and is gone',
    !breakage.jar.setDown.gone && breakage.jar.setDown.worth === breakage.jar.setDown.whole && !breakage.jar.walkedIntoAWall.gone && breakage.jar.walkedIntoAWall.held && breakage.jar.walkedIntoAWall.worth <= breakage.jar.walkedIntoAWall.whole &&
    breakage.jar.walkedIntoAWall.worth >= breakage.jar.walkedIntoAWall.whole * 0.85 && breakage.jar.dropped.gone && breakage.jar.dropped.shattered === 1 && breakage.jar.dropped.caption === 1 && breakage.jar.dropped.loudest >= 18 &&
    breakage.jar.dropped.said.some((text) => /The sample jar shatters\..*Mind the glass/.test(text)), breakage.jar);
  check('where it shattered there is broken glass on the floor, as loud to walk over as any other; a new descent sweeps it up and has everything whole again',
    breakage.glass.patches === 1 && breakage.glass.kind === 'glass' && breakage.glass.metresFromWhereItBroke < 0.8 && breakage.glass.pieces >= 3 && breakage.glass.markedLoud && breakage.glass.setOffByWalkingOverIt >= 1 &&
    breakage.newDescent.glassLeft === 0 && breakage.newDescent.patches === 0 && breakage.newDescent.allWhole && breakage.newDescent.lost === 0, [breakage.glass, breakage.newDescent]);

  // --- what a thing is worth ---
  await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab;
    lab.reset();
    lab.stand(spot.x, spot.z, Math.PI / 2);
    const object = d.createLooseObject('canister', spot.x + 1, 0.3, spot.z, 0);
    for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
    d.player.pitch = Math.atan2(object.y - d.getPlayerEyeY(), 1); // look at it
    d.simulate(0.1);
  }, spot);
  await drawFrames(page, 3);
  const unread = await inGame(() => { const d = window.lastReturnDebug, object = d.looseObjects[0]; return { prompt: document.getElementById('hud-prompt').textContent, worth: d.getLooseObjectWorth(object), pulses: object.scanHits }; });
  // Scanned where it lies, from where you stand: a second and a half of the ordinary beam.
  const read = await inGame(() => {
    const d = window.lastReturnDebug, object = d.looseObjects[0];
    d.looseState.hasShownAppraisalHint = false;
    d.clearMessages();
    d.setDebugOption('unlimitedScanner', true);
    d.setScanHeld(true); d.simulate(1.5); d.setScanHeld(false); d.simulate(0.1);
    return { worth: d.getLooseObjectWorth(object), really: object.kind.value, pulses: object.scanHits, needed: d.tuning.looseAppraiseHits, messages: window.looseLab.messages() };
  });
  await drawFrames(page, 3);
  const readPrompt = await inGame(() => document.getElementById('hud-prompt').textContent);
  await inGame(() => { const d = window.lastReturnDebug; d.pickUpLooseObject(d.looseObjects[0], false); d.simulate(0.3); });
  await drawFrames(page, 3);
  const readChip = await inGame(() => { const d = window.lastReturnDebug, chip = document.getElementById('chip-carrying').textContent; d.releaseHeldLooseObject(0); return chip; });
  check('what a thing is worth is not on screen until the scanner has read it: enough pulses on it, and then the prompt and the status line say it',
    /Pick up the gas canister$/.test(unread.prompt) && unread.worth === 0 && read.pulses >= read.needed && read.worth === read.really && read.really > 0 &&
    read.messages.some((text) => /The scanner has read what that is: gas canister, worth 25/.test(text)) && /Pick up the gas canister \(worth 25\)$/.test(readPrompt) && readChip === 'CARRYING: GAS CANISTER · 25',
    { unread: unread, read: read, prompt: readPrompt, chip: readChip });

  // --- what it costs ---
  const cost = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab;
    lab.reset();
    lab.stand(spot.x - 3, spot.z, Math.PI / 2);
    const kinds = Object.keys(d.looseObjectKinds);
    // Without anything loose, for comparison.
    let started = performance.now();
    d.simulate(2);
    const plain = performance.now() - started;
    // The same throw three times over, and the quickest of the three counts: the clock on the wall also measures
    // whatever else the machine is doing, and that can only make a run look slower, never quicker.
    let tumbling = Infinity;
    for (let attempt = 0; attempt < 3; attempt++) {
      d.clearLooseObjects();
      for (let index = 0; index < 12; index++) {
        const object = d.createLooseObject(kinds[index % kinds.length], spot.x + (index % 4) * 0.7 - 1, 1 + Math.floor(index / 4) * 0.7, spot.z + (index % 3) * 0.7 - 0.7, index);
        object.spinX = 3; object.velocityZ = (index % 2 ? 1 : -1) * 2;
      }
      started = performance.now();
      d.simulate(2);
      tumbling = Math.min(tumbling, performance.now() - started);
    }
    for (let step = 0; step < 300; step++) d.simulate(1 / 30);
    const atRest = d.looseObjects.filter((object) => object.isAsleep).length;
    started = performance.now();
    d.simulate(2);
    const resting = performance.now() - started;
    const allInTheOpen = d.looseObjects.every((object) => lab.isInTheOpen(object.x, object.y, object.z));
    return { millisecondsPerSecondOfPlay: { nothingLoose: Math.round(plain / 2), twelveTumbling: Math.round(tumbling / 2), twelveAtRest: Math.round(resting / 2) }, atRest: atRest, of: d.looseObjects.length, allInTheOpen: allInTheOpen };
  }, spot);
  check('twelve objects thrown in a heap all come to rest inside the room', cost.atRest === cost.of && cost.allInTheOpen, cost);
  check('twelve tumbling at once cost less than a fifth of the time there is (200 ms of work per second of play), and at rest they cost nothing to speak of',
    cost.millisecondsPerSecondOfPlay.twelveTumbling - cost.millisecondsPerSecondOfPlay.nothingLoose < 200 &&
    cost.millisecondsPerSecondOfPlay.twelveAtRest - cost.millisecondsPerSecondOfPlay.nothingLoose < 25, cost.millisecondsPerSecondOfPlay);

  // --- the keys ---
  await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab;
    lab.reset();
    lab.stand(spot.x, spot.z, Math.PI / 2);
    const object = d.createLooseObject('canister', spot.x + 1, 0.3, spot.z, 0);
    for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
    d.player.pitch = Math.atan2(object.y - d.getPlayerEyeY(), 1); // look at it
    d.simulate(0.1);
    // The hint about the keys is given once a descent, and this descent has had it. Make it due again.
    d.looseState.hasShownCarryHint = false;
    d.clearMessages();
  }, spot);
  await drawFrames(page, 3);
  const beforePickUp = await inGame(() => ({ prompt: document.getElementById('hud-prompt').textContent, promptHidden: document.getElementById('hud-prompt').hidden,
    chipHidden: document.getElementById('chip-carrying').hidden }));
  await page.keyboard.press('KeyE');
  // A message stays for a few seconds of the game's own clock, which the browser may run on by itself while
  // this test waits for it. So what is on screen is read in the same breath as the thing that puts it there.
  const pickUpMessages = await inGame(() => { window.lastReturnDebug.simulate(0.5); return window.looseLab.messages(); });
  await drawFrames(page, 8);
  const afterPickUp = await inGame(() => ({ carrying: window.lastReturnDebug.getHeldLooseObject() !== null, chip: document.getElementById('chip-carrying').textContent,
    chipHidden: document.getElementById('chip-carrying').hidden }));
  afterPickUp.messages = pickUpMessages;
  check('looking at an object within reach offers to pick it up, and E does', !beforePickUp.promptHidden && /Pick up the gas canister/.test(beforePickUp.prompt) && beforePickUp.chipHidden && afterPickUp.carrying, [beforePickUp, afterPickUp.carrying]);
  check('the screen says what you carry, and the first time, which key lets go of it',
    !afterPickUp.chipHidden && afterPickUp.chip === 'CARRYING: GAS CANISTER' && afterPickUp.messages.some((text) => /E again lets go/.test(text)), afterPickUp);

  // A tap on E, with nothing in front of you to use, lets go. The key is put down and let go inside the game
  // here, not through the browser: between a real press and a real release the browser may draw frames of its
  // own, and each of those counts as time the key was held. (The real key is what the check after this uses.)
  const tapped = await inGame(() => {
    const d = window.lastReturnDebug;
    d.player.pitch = 0.1; d.simulate(1.5); // look up from where it lay, and let it stop swinging: nothing to use or pick up in view
    const nothingInView = d.player.focusedInteractable === null && d.player.focusedLooseObject === null;
    d.input.keysDown.add('KeyE'); d.input.wantsInteract = true;
    d.simulate(0.05);
    const whileDown = d.getHeldLooseObject() !== null;
    d.input.keysDown.delete('KeyE');
    d.simulate(0.05);
    const object = d.looseObjects[0];
    return { nothingInView: nothingInView, stillCarryingWhileTheKeyIsDown: whileDown, carrying: d.getHeldLooseObject() !== null, speed: Math.hypot(object.velocityX, object.velocityZ) };
  });
  check('E again, with nothing in front of you to use, lets go of it when the key comes up: it drops, it is not thrown',
    tapped.nothingInView && tapped.stillCarryingWhileTheKeyIsDown && !tapped.carrying && tapped.speed < 0.5, tapped);

  // The press that picks something up does not also let go of it, however long E is held.
  const pickUpHeld = await inGame(() => {
    const d = window.lastReturnDebug, object = d.looseObjects[0];
    for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
    d.player.pitch = Math.atan2(object.y - d.getPlayerEyeY(), Math.hypot(object.x - d.player.x, object.z - d.player.z));
    d.player.yaw = Math.atan2(object.x - d.player.x, -(object.z - d.player.z));
    d.simulate(0.1);
    const lookingAtIt = d.player.focusedLooseObject === object;
    d.input.keysDown.add('KeyE'); d.input.wantsInteract = true;
    d.simulate(1.2);
    d.input.keysDown.delete('KeyE');
    d.simulate(0.2);
    return { lookingAtIt: lookingAtIt, carrying: d.getHeldLooseObject() === object };
  });
  check('holding E down while picking something up does not throw it away again', pickUpHeld.lookingAtIt && pickUpHeld.carrying, pickUpHeld);

  await inGame(() => { const d = window.lastReturnDebug; d.player.pitch = 0.15; d.simulate(0.6); });
  await page.keyboard.down('KeyE');
  await inGame(() => window.lastReturnDebug.simulate(0.6));
  await drawFrames(page, 3);
  const windingUp = await inGame(() => ({ windUp: window.lastReturnDebug.getThrowWindUp(), prompt: document.getElementById('hud-prompt').textContent, stillCarrying: window.lastReturnDebug.getHeldLooseObject() !== null }));
  await page.keyboard.up('KeyE');
  const thrownByKey = await inGame(() => {
    const d = window.lastReturnDebug;
    d.simulate(0.03);
    const object = d.looseObjects[0];
    return { carrying: d.getHeldLooseObject() !== null, speed: Math.hypot(object.velocityX, object.velocityY, object.velocityZ) };
  });
  check('holding E winds up a throw, with a bar on screen that fills; letting go throws it', windingUp.stillCarrying && windingUp.windUp > 0.5 && /THROW/.test(windingUp.prompt) && !thrownByKey.carrying && thrownByKey.speed > 3, [windingUp, thrownByKey]);

  // The right mouse button: held, it carries; let go, it drops. And it no longer sweeps: the wheel button does.
  // (The pointer is put in place first, while the game is not yet listening to it: once the game takes mouse
  // movement as looking around, moving the pointer there would turn the view away from the object.)
  //
  // The test's browser does capture the mouse, and while it does, every press and release that this script
  // sends arrives with a movement of the pointer that never happened (640 by 360 pixels: the whole way from the
  // corner of the page). The game would take that for the view being whipped round, and on GitHub, where the
  // browser draws frames by itself between the steps below, it did so at once: with the button still down, the
  // thing in the beam was swung and then let go at five metres a second. So for these steps the game is told
  // to take no mouse movement as looking around; the checks turn the view themselves where they need to.
  await page.mouse.move(640, 360);
  await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player;
    d.clearLooseObjects();
    lab.stand(spot.x, spot.z, Math.PI / 2);
    const object = d.createLooseObject('canister', spot.x + 1.6, 0.3, spot.z, 0);
    for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
    p.pitch = Math.atan2(object.y - d.getPlayerEyeY(), 1.6);
    d.simulate(0.1);
    d.input.isPointerLocked = true; // for where the browser does not capture the mouse by itself
    d.input.ignoreLookUntil = performance.now() + 600000; // see above; set back below
    d.input.lookDeltaX = 0; d.input.lookDeltaY = 0;
    d.looseState.hasShownCarryHint = false;
    d.clearMessages();
    // Everything the browser tells the page about the mouse from here on is written down, so that a failure
    // of the checks below says what the browser did. (On GitHub the browser draws frames by itself between
    // the steps of this test, and anything the game is told there it acts on at once.)
    if (!window.mouseLog) {
      window.mouseLog = [];
      for (const type of ['mousemove', 'mousedown', 'mouseup', 'contextmenu', 'blur', 'pointerlockchange', 'visibilitychange']) {
        window.addEventListener(type, function (event) {
          window.mouseLog.push(type + (type === 'mousemove' ? ' ' + (event.movementX || 0) + ',' + (event.movementY || 0) : '') + (event.button !== undefined && type !== 'mousemove' ? ' button ' + event.button : '') + ' mode ' + d.game.mode);
        }, true);
      }
    }
    window.mouseLog.length = 0;
  }, spot);
  await page.mouse.down({ button: 'right' });
  const grabbed = await inGame(() => {
    const d = window.lastReturnDebug;
    d.input.lookDeltaX = 0; d.input.lookDeltaY = 0; // nothing the browser's pointer did counts as looking around
    d.simulate(0.6);
    return { buttonSeen: d.input.isGrabHeld, carrying: d.getHeldLooseObject() !== null, byButton: d.looseState.isHeldByButton, sweeping: d.player.sweepTimeRemaining > 0, messages: window.looseLab.messages() };
  });
  await inGame(() => { const d = window.lastReturnDebug; d.player.pitch = 0; d.simulate(1.5); });
  const stillGrabbed = await inGame(() => window.lastReturnDebug.getHeldLooseObject() !== null);
  await page.mouse.up({ button: 'right' });
  const letGo = await inGame((spot) => {
    const d = window.lastReturnDebug, p = d.player, object = d.looseObjects[0], round = window.looseLab.round;
    const atEntry = { carrying: d.getHeldLooseObject() !== null, velocity: [round(object.velocityX), round(object.velocityY), round(object.velocityZ)],
      yawDegrees: round(p.yaw * 180 / Math.PI), pitchDegrees: round(p.pitch * 180 / Math.PI), movedFromSpot: round(Math.hypot(p.x - spot.x, p.z - spot.z)),
      objectFromYou: [round(object.x - p.x), round(object.y - d.getPlayerEyeY()), round(object.z - p.z)],
      pendingLook: [d.input.lookDeltaX, d.input.lookDeltaY], grabHeld: d.input.isGrabHeld, pointerLockFlag: d.input.isPointerLocked, reallyLocked: document.pointerLockElement !== null, mode: d.game.mode };
    d.simulate(0.05);
    return { carrying: d.getHeldLooseObject() !== null, speed: Math.hypot(object.velocityX, object.velocityZ), objects: d.looseObjects.length, atEntry: atEntry, whatTheBrowserSaid: window.mouseLog.slice(-30) };
  }, spot);
  check('holding the right mouse button on an object within reach takes it into the beam and keeps it there; it does not sweep',
    grabbed.buttonSeen && grabbed.carrying && grabbed.byButton && !grabbed.sweeping && stillGrabbed && grabbed.messages.some((text) => /while you hold the button/.test(text)), grabbed);
  check('letting the button go drops it where it hangs', !letGo.carrying && letGo.speed < 0.6 && Math.abs(letGo.atEntry.yawDegrees - 90) < 0.5, letGo);

  // Swung and let go, it flies: there is no other throw with the mouse.
  // (With an object of its own, put where the last one lay: wherever that one ended up is no concern of this check.)
  const flung = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player;
    d.input.isGrabHeld = false; d.input.lookDeltaX = 0; d.input.lookDeltaY = 0;
    d.clearLooseObjects();
    lab.stand(spot.x, spot.z, Math.PI / 2);
    const object = d.createLooseObject('canister', spot.x + 1.6, 0.3, spot.z, 0);
    for (let step = 0; step < 150 && !object.isAsleep; step++) d.simulate(1 / 30);
    p.yaw = Math.atan2(object.x - p.x, -(object.z - p.z));
    p.pitch = Math.atan2(object.y - d.getPlayerEyeY(), Math.hypot(object.x - p.x, object.z - p.z));
    d.simulate(0.1);
    d.input.isGrabHeld = true;
    d.simulate(1.5);
    const wasCarrying = d.getHeldLooseObject() === object;
    p.pitch = 0.2;
    for (let step = 0; step < 9; step++) { p.yaw += Math.PI / 18; d.simulate(1 / 30); } // a quarter turn in a third of a second
    d.simulate(0.1);
    d.input.isGrabHeld = false;
    d.simulate(1 / 30);
    return { wasCarrying: wasCarrying, carrying: d.getHeldLooseObject() !== null, speed: Math.hypot(object.velocityX, object.velocityY, object.velocityZ) };
  }, spot);
  check('swung round and let go, it keeps the speed of the swing', flung.wasCarrying && !flung.carrying && flung.speed > 2.5, flung);

  await inGame(() => { const d = window.lastReturnDebug; d.clearLooseObjects(); d.player.heat = 0; d.simulate(0.2); });
  await page.mouse.down({ button: 'right' });
  const rightAlone = await inGame(() => { const d = window.lastReturnDebug; d.simulate(0.1); return d.player.sweepTimeRemaining > 0; });
  await page.mouse.up({ button: 'right' });
  await page.mouse.down({ button: 'middle' });
  const middle = await inGame(() => { const d = window.lastReturnDebug; d.simulate(0.1); return d.player.sweepTimeRemaining > 0; });
  await page.mouse.up({ button: 'middle' });
  await inGame(() => { const d = window.lastReturnDebug; d.simulate(3); d.input.isPointerLocked = false; d.input.ignoreLookUntil = 0; d.input.lookDeltaX = 0; d.input.lookDeltaY = 0; });
  check('the right mouse button no longer sweeps; the wheel button does (and F still does)', !rightAlone && middle, { rightSweeps: rightAlone, middleSweeps: middle });

  // With something to use in front of you, E uses that and you keep what you carry.
  const usedInstead = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player;
    d.clearLooseObjects();
    const target = d.interactables.find((interactable) => interactable.isAvailable);
    if (!target) return null;
    const spot = d.findWalkableSpotNear(target.x, target.z);
    lab.stand(spot.x, spot.z, Math.atan2(target.x - spot.x, -(target.z - spot.z)));
    const object = lab.carry('jar');
    p.yaw = Math.atan2(target.x - p.x, -(target.z - p.z));
    p.pitch = Math.atan2(target.y - d.getPlayerEyeY(), Math.hypot(target.x - p.x, target.z - p.z));
    d.simulate(0.2);
    const lookingAtIt = p.focusedInteractable === target;
    d.input.keysDown.add('KeyE'); d.input.wantsInteract = true;
    d.simulate(0.05);
    d.input.keysDown.delete('KeyE');
    d.simulate(0.3);
    if (d.game.mode === 'reading') d.closeReader();
    return { lookingAtIt: lookingAtIt, stillCarrying: d.getHeldLooseObject() === object, metresAway: Math.round(Math.hypot(target.x - p.x, target.z - p.z) * 100) / 100 };
  });
  check('with something to use in front of you, E uses that, and you keep what you carry', usedInstead !== null && usedInstead.lookingAtIt && usedInstead.stillCarrying, usedInstead);

  const handsFull = await inGame((spot) => {
    const d = window.lastReturnDebug, lab = window.looseLab;
    d.clearLooseObjects();
    lab.stand(spot.x, spot.z, Math.PI / 2);
    lab.carry('jar');
    const other = d.createLooseObject('toolCase', spot.x + 1.1, 0.2, spot.z, 0);
    for (let step = 0; step < 150 && !other.isAsleep; step++) d.simulate(1 / 30);
    d.player.pitch = Math.atan2(other.y - d.getPlayerEyeY(), 1.1);
    d.simulate(0.1);
    d.clearMessages();
    return { lookingAtIt: d.player.focusedLooseObject === other };
  }, spot);
  // E is given inside the game, so that the message is read in the same step as the press that causes it.
  const handsFullAfter = await inGame(() => {
    const d = window.lastReturnDebug;
    d.input.wantsInteract = true;
    d.simulate(0.05);
    return { carrying: d.getHeldLooseObject().kindKey, messages: window.looseLab.messages() };
  });
  check('with something in the beam already, E on another object says so', handsFull.lookingAtIt && handsFullAfter.carrying === 'jar' && handsFullAfter.messages.some((text) => /already holding something/.test(text)), handsFullAfter);

  check('no script errors were reported', problems.length === 0, problems);
  await browser.close();

  // --- on a phone ---
  const phone = await openGame({ dev: true, width: 844, height: 390, isPhone: true });
  await startGame(phone.page, true);
  await phone.page.evaluate(installLab);
  await phone.page.evaluate(() => window.looseLab.setBreakable(false));
  const phoneHint = await phone.page.evaluate(() => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player;
    lab.reset();
    lab.stand(p.x, p.z, p.yaw);
    lab.carry('canister');
    p.pitch = 0.1; d.simulate(0.3);
    return { messages: lab.messages(), nothingInView: p.focusedInteractable === null && p.focusedLooseObject === null, noDropButton: document.getElementById('touch-drop') === null };
  });
  check('on a phone the hint names the USE button, not a key, and there is no extra button for letting go',
    phoneHint.messages.some((text) => /USE again lets go/.test(text)) && phoneHint.noDropButton, phoneHint);
  await phone.page.tap('#touch-use');
  const phoneDropped = await phone.page.evaluate(() => { const d = window.lastReturnDebug; d.simulate(0.2); return { carrying: d.getHeldLooseObject() !== null }; });
  check('a tap on USE, with nothing to use in view, lets go of it', phoneHint.nothingInView && !phoneDropped.carrying, phoneDropped);
  // A finger held on USE winds up a throw.
  const phoneThrow = await phone.page.evaluate(() => {
    const d = window.lastReturnDebug, lab = window.looseLab, p = d.player;
    const object = lab.carry('canister');
    p.pitch = 0.15; d.simulate(0.3);
    const button = document.getElementById('touch-use');
    const touch = function (type) { button.dispatchEvent(new Event(type, { bubbles: true, cancelable: true })); };
    touch('touchstart');
    d.simulate(0.7);
    const windUp = d.getThrowWindUp(), stillCarrying = d.getHeldLooseObject() === object;
    touch('touchend');
    d.simulate(0.03);
    return { windUp: windUp, stillCarryingWhileHeld: stillCarrying, carrying: d.getHeldLooseObject() !== null, speed: Math.hypot(object.velocityX, object.velocityY, object.velocityZ) };
  });
  check('a finger held on USE winds up a throw, and lifting it throws', phoneThrow.stillCarryingWhileHeld && phoneThrow.windUp > 0.5 && !phoneThrow.carrying && phoneThrow.speed > 3, phoneThrow);
  // Something that does something: a button for it appears, and only then.
  await phone.page.evaluate(() => { const d = window.lastReturnDebug, lab = window.looseLab; d.clearLooseObjects(); lab.carry('canister'); d.player.pitch = 0; d.simulate(0.3); });
  await drawFrames(phone.page, 4);
  const phoneWithCanister = await phone.page.evaluate(() => ({ buttonHidden: document.getElementById('touch-use-carried').hidden }));
  await phone.page.evaluate(() => { const d = window.lastReturnDebug, lab = window.looseLab; d.clearLooseObjects(); lab.carry('scanGrenade'); d.player.pitch = 0; d.simulate(0.3); });
  await drawFrames(phone.page, 4);
  const phoneWithGrenade = await phone.page.evaluate(() => {
    const button = document.getElementById('touch-use-carried'), box = button.getBoundingClientRect(), scan = document.getElementById('touch-scan').getBoundingClientRect();
    return { buttonHidden: button.hidden, says: button.textContent, prompt: document.getElementById('hud-prompt').textContent, onScreen: box.width > 40 && box.right <= window.innerWidth && box.top >= 0,
      clearOfScan: box.bottom <= scan.top + 1, armed: window.lastReturnDebug.getHeldLooseObject().armedTime >= 0 };
  });
  await phone.page.tap('#touch-use-carried');
  await phone.page.evaluate(() => window.lastReturnDebug.simulate(0.1));
  await drawFrames(phone.page, 4);
  const phoneArmed = await phone.page.evaluate(() => { const d = window.lastReturnDebug, grenade = d.getHeldLooseObject(); return { armed: grenade !== null && grenade.armedTime >= 0, buttonHidden: document.getElementById('touch-use-carried').hidden, messages: window.looseLab.messages() }; });
  check('on a phone, a scan grenade in the beam brings up an ARM button above SCAN and a prompt that names it; a canister does not',
    phoneWithCanister.buttonHidden && !phoneWithGrenade.buttonHidden && phoneWithGrenade.says === 'ARM' && phoneWithGrenade.prompt === 'ARM · Arm the scan grenade' && phoneWithGrenade.onScreen && phoneWithGrenade.clearOfScan && !phoneWithGrenade.armed,
    [phoneWithCanister, phoneWithGrenade]);
  check('a tap on it arms the grenade, and the button goes away again', phoneArmed.armed && phoneArmed.buttonHidden && phoneArmed.messages.some((text) => /Armed/.test(text)), phoneArmed);
  check('no script errors were reported on the phone', phone.problems.length === 0, phone.problems);
  await phone.browser.close();

  console.log(failures.length ? '\n' + failures.length + ' check(s) failed.' : '\nAll checks passed.');
  process.exit(failures.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
