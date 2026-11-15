// Checks the generated stations: that many of them can be built and finished,
// that a seed always gives the same station, and that one of them plays from lift to lift.
const { openGame, startGame, drawFrames } = require('./browser-harness.js');

const failures = [];
function check(description, condition, detail) {
  const line = (condition ? 'ok    ' : 'FAIL  ') + description + (detail !== undefined ? '  ' + JSON.stringify(detail) : '');
  console.log(line);
  if (!condition) failures.push(description);
}

// How many seeds to try for each size. Each one is tried with one of the three layouts in turn,
// and alternately with one level and with two.
const SEEDS_PER_SIZE = Number(process.env.GENERATED_SEEDS || 40);

(async () => {
  const { browser, page, problems } = await openGame();
  const inGame = (callback, argument) => page.evaluate(callback, argument);

  // Describes the first vent of the station that is loaded: its tiles, and the two places where it opens into a
  // room (a vent tile with ordinary floor next to it). It runs inside the page, so it is handed over as text.
  const describeFirstVent = function () {
    const debug = window.noReturnDebug, level = debug.level;
    const tiles = [], mouths = [];
    for (let z = level.boundsMinimumZ; z < level.boundsMaximumZ; z++) for (let x = level.boundsMinimumX; x < level.boundsMaximumX; x++) {
      if (!debug.isVentAt(x + 0.5, z + 0.5) || debug.zoneNames[debug.getZoneAt(x + 0.5, z + 0.5)] !== 'VENT') continue;
      tiles.push([x, z]);
      for (const step of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const beside = [x + step[0] + 0.5, z + step[1] + 0.5];
        const spot = debug.findWalkableSpotNear(beside[0], beside[1]);
        if (spot && spot.x === beside[0] && spot.z === beside[1] && !debug.isVentAt(beside[0], beside[1])) {
          mouths.push({ mouthX: x + 0.5, mouthZ: z + 0.5, roomX: beside[0], roomZ: beside[1], stepX: -step[0], stepZ: -step[1] });
        }
      }
    }
    return { seed: level.seed, ventCount: level.ventCount, tileCount: tiles.length, mouths: mouths.slice(0, 2), mouthCount: mouths.length,
      headroom: tiles.length ? debug.getHeadroomAt(tiles[0][0] + 0.5, tiles[0][1] + 0.5) : 0, ventHeight: debug.ventHeight };
  };

  // --- a seed is a promise, part one: note what a few seeds build while the page is still cold ---
  // (A browser runs code differently once it has warmed up. Anything in the planner that leans on that, such as
  // a sort with a random number inside its comparison, shows up as a station that differs between now and later.)
  const promisedSeeds = [[2, 'large', 'mixed', 'one'], [3, 'large', 'sprawling', 'two'], [7, 'medium', 'mixed', 'two'], [11, 'small', 'tight', 'one'], [5, 'massive', 'mixed', 'two']];
  const buildPrints = (seeds) => inGame((list) => list.map((entry) => {
    window.noReturnDebug.loadStation('generated', entry[0], entry[1], entry[2], entry[3]);
    return window.noReturnDebug.getStationFingerprint();
  }), seeds);
  const coldPrints = await buildPrints(promisedSeeds);

  // --- many stations: every one must be buildable and finishable in the intended order ---
  const jobTotals = { fuel: 0, cores: 0, breaker: 0 };
  for (const sizeKey of ['small', 'medium', 'large']) {
    const result = await inGame(([size, seedCount]) => {
      const debug = window.noReturnDebug;
      const layouts = ['tight', 'mixed', 'sprawling'];
      const bad = [];
      let roomTotal = 0, loopTotal = 0, stairTotal = 0, twoLevelCount = 0, ventTotal = 0, withVent = 0;
      const jobs = { fuel: 0, cores: 0, breaker: 0 };
      for (let seed = 1; seed <= seedCount; seed++) {
        const layout = layouts[seed % 3], levels = seed % 2 === 0 ? 'two' : 'one';
        const wasBuilt = debug.loadStation('generated', seed, size, layout, levels);
        const found = wasBuilt ? debug.auditLayout().concat(debug.auditProgression()).concat(debug.auditHollowRoutes()) : ['no plan could be made'];
        // A two-level station must have its shaft a flight of stairs down; a one-level station must be flat.
        const shaftFloor = debug.getFloorHeightAt(debug.findInteractable(5).x, debug.findInteractable(5).z);
        if (wasBuilt && levels === 'two' && !(shaftFloor < 0 && debug.level.stairCount >= 1)) found.push('two levels were asked for but the shaft is at ' + shaftFloor);
        if (wasBuilt && levels === 'one' && (shaftFloor !== 0 || debug.level.stairCount !== 0)) found.push('one level was asked for but the shaft is at ' + shaftFloor);
        if (found.length > 0) bad.push({ seed: seed, layout: layout, levels: levels, problems: found.slice(0, 4) });
        roomTotal += debug.level.roomCount; loopTotal += debug.level.loopCount;
        ventTotal += debug.level.ventCount; if (debug.level.ventCount > 0) withVent++;
        if (debug.level.mission.needsFuel) jobs.fuel++;
        if (debug.level.mission.coreCount > 0) jobs.cores++;
        if (debug.level.mission.needsBreaker) jobs.breaker++;
        if (levels === 'two') { twoLevelCount++; stairTotal += debug.level.stairCount; }
      }
      return { bad: bad, averageRooms: Math.round(roomTotal / seedCount), averageLoops: Math.round(loopTotal / seedCount * 10) / 10,
        averageStairs: Math.round(stairTotal / Math.max(1, twoLevelCount) * 10) / 10,
        averageVents: Math.round(ventTotal / seedCount * 10) / 10, withVent: withVent, jobs: jobs };
    }, [sizeKey, SEEDS_PER_SIZE]);
    check(SEEDS_PER_SIZE + ' ' + sizeKey + ' stations, half of them with two levels: all can be built, walked and finished in order (about ' +
      result.averageRooms + ' rooms and corridors, ' + result.averageLoops + ' extra ducts, ' + result.averageVents + ' vents, ' + result.averageStairs + ' stairs each)', result.bad.length === 0, result.bad.slice(0, 3));
    check('at least three in four ' + sizeKey + ' stations have a vent', result.withVent >= SEEDS_PER_SIZE * 0.75, result.withVent + ' of ' + SEEDS_PER_SIZE);
    jobTotals.fuel += result.jobs.fuel; jobTotals.cores += result.jobs.cores; jobTotals.breaker += result.jobs.breaker;
  }

  check('across those stations every kind of extra job turns up (fuel, core samples, winch breaker)',
    jobTotals.fuel > 5 && jobTotals.cores > 5 && jobTotals.breaker > 5, jobTotals);

  // --- a seed is a promise: the same seed must give the same station, a different seed a different one ---
  const repeat = await inGame(() => {
    const debug = window.noReturnDebug;
    debug.loadStation('generated', 4471, 'medium', 'mixed');
    const first = debug.getStationFingerprint();
    debug.loadStation('generated', 4472, 'medium', 'mixed');
    const other = debug.getStationFingerprint();
    debug.loadStation('generated', 4471, 'medium', 'mixed');
    const again = debug.getStationFingerprint();
    return { same: first === again, different: first !== other, wordSeed: debug.chooseSeedFromText('ripley') === debug.chooseSeedFromText('ripley'),
      numberSeed: debug.chooseSeedFromText('4471'), emptySeedsDiffer: debug.chooseSeedFromText('') !== debug.chooseSeedFromText('') };
  });
  check('the same seed builds the same station, and another seed a different one', repeat.same && repeat.different, repeat);
  // Part two of the promise: after well over a hundred stations the page is warm. The same seeds must build the same stations.
  const warmPrints = await buildPrints(promisedSeeds);
  const changed = promisedSeeds.filter((entry, index) => coldPrints[index] !== warmPrints[index]).map((entry) => entry.join('/'));
  check('five seeds build exactly the same stations on a warm page as they did on a cold one', changed.length === 0, changed);
  const plannerSource = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'js', '03-levelgen.js'), 'utf8');
  const riskySorts = plannerSource.match(/\.sort\(function \([^)]*\) \{[^}]*random\(/g) || [];
  check('no sort in the planner has a random number inside its comparison', riskySorts.length === 0, riskySorts);
  check('a typed number is used as the seed, a typed word always gives the same seed, an empty box a new one',
    repeat.numberSeed === 4471 && repeat.wordSeed && repeat.emptySeedsDiffer, repeat);

  // --- choose the station for the lift-to-lift run below ---
  // It has to have a vent that is the shortest way between the two rooms it joins, so that the Hollow, which
  // always takes the shortest way, can be watched crawling through it. Which seed that is depends on the planner,
  // so the test looks for one instead of trusting a number that was right once.
  const playSeed = await inGame(([describeSource]) => {
    const debug = window.noReturnDebug, describeFirstVent = (0, eval)('(' + describeSource + ')');
    for (let seed = 1; seed <= 80; seed++) {
      if (!debug.loadStation('generated', seed, 'medium', 'mixed', 'two')) continue;
      const vent = describeFirstVent();
      if (vent.mouths.length !== 2 || vent.tileCount < 3) continue;
      debug.teleport(vent.mouths[0].roomX, vent.mouths[0].roomZ, 0);
      // room, every vent tile, room: one more step than the vent has tiles
      if (debug.stepsFromPlayerTo(vent.mouths[1].roomX, vent.mouths[1].roomZ) === vent.tileCount + 1) return seed;
    }
    return 0;
  }, [String(describeFirstVent)]);
  check('a medium two-level station whose first vent is a real short cut exists among the first 80 seeds', playSeed > 0, playSeed);

  // --- going back to the classic station restores it exactly ---
  const classicAgain = await inGame(() => {
    const debug = window.noReturnDebug;
    debug.loadStation('classic', 0);
    return { kind: debug.level.kind, problems: debug.auditLayout().concat(debug.auditProgression()).concat(debug.auditHollowRoutes()), start: [debug.playerStart.x, debug.playerStart.z], zone: debug.zoneNames[3] };
  });
  check('loading Kessel-9 again after generated stations gives the classic station back',
    classicAgain.kind === 'classic' && classicAgain.problems.length === 0 && classicAgain.start[0] === 6.5 && classicAgain.zone === 'MAIN CORRIDOR A', classicAgain);

  // --- one generated station, played from lift to lift through the real title screen ---
  await page.evaluate(() => document.getElementById('station-generated').click());
  check('choosing "Uncharted annex" shows the size, layout and seed boxes', await page.evaluate(() => !document.getElementById('station-options').hidden));
  await page.selectOption('#title-station-size', 'medium');
  await page.selectOption('#title-station-layout', 'mixed');
  await page.fill('#title-seed', String(playSeed));
  await startGame(page, false);
  const loaded = await inGame(() => ({ kind: window.noReturnDebug.level.kind, seed: window.noReturnDebug.level.seed, description: window.noReturnDebug.level.description }));
  check('Begin descent loads the generated station for the typed seed', loaded.kind === 'generated' && loaded.seed === playSeed, loaded);
  await page.keyboard.press('Escape');
  const reported = await inGame(() => Object.fromEntries(new URL(document.getElementById('link-report-problem').href).searchParams));
  await page.keyboard.press('Escape');
  check('"Report a problem" on the pause screen carries the seed and the station options',
    reported.station === 'Uncharted annex' && new RegExp('^' + playSeed + ', medium, [a-z]+, two levels$').test(reported.seed) &&
    (await inGame(() => window.noReturnDebug.game.mode)) === 'playing', reported);

  await page.keyboard.down('KeyW');
  await inGame(() => window.noReturnDebug.simulate(4));
  await page.keyboard.up('KeyW');
  check('walking forward leaves the lift car', await inGame(() => window.noReturnDebug.game.flags.hasLeftLift));
  await inGame(() => window.noReturnDebug.simulate(4));
  check('lift door closes behind the player', (await inGame(() => window.noReturnDebug.getLiftDoor().openFraction)) === 0);

  // --- the stairs: walk down them on foot, and check the view goes down with the floor ---
  const stairs = await inGame(() => {
    const debug = window.noReturnDebug, level = debug.level;
    const zone = debug.zoneNames.indexOf('STAIRS');
    let top = null, bottom = null;
    const tiles = [];
    for (let z = level.boundsMinimumZ; z < level.boundsMaximumZ; z++) for (let x = level.boundsMinimumX; x < level.boundsMaximumX; x++) {
      if (debug.getZoneAt(x + 0.5, z + 0.5) !== zone) continue;
      const floor = debug.getFloorHeightAt(x + 0.5, z + 0.5);
      tiles.push({ x: x + 0.5, z: z + 0.5, floor: floor });
      if (!bottom || floor < bottom.floor) bottom = { x: x + 0.5, z: z + 0.5, floor: floor };
    }
    // Stand on the top landing, on the tile nearest the foot (the far end of the landing is the stair door, and a
    // closed door pushes you back out of it), in the same lane as the bottom tile found, facing down the flight.
    for (const tile of tiles) {
      if (tile.floor < -0.01) continue;
      if (!top || Math.hypot(tile.x - bottom.x, tile.z - bottom.z) < Math.hypot(top.x - bottom.x, top.z - bottom.z)) top = tile;
    }
    const alongX = Math.abs(bottom.x - top.x) > Math.abs(bottom.z - top.z);
    if (alongX) top.z = bottom.z; else top.x = bottom.x;
    debug.teleport(top.x, top.z, Math.atan2(bottom.x - top.x, -(bottom.z - top.z)));
    debug.simulate(0.2);
    return { top: top, bottom: bottom, floorAtTop: debug.player.floorY };
  });
  await page.keyboard.down('KeyW');
  const descent = await inGame(() => {
    const debug = window.noReturnDebug;
    const heights = [];
    for (let step = 0; step < 16; step++) { debug.simulate(0.5); heights.push(Math.round(debug.player.floorY * 100) / 100); }
    return { heights: heights, camera: debug.renderCamera.y, mode: debug.game.mode };
  });
  await page.keyboard.up('KeyW');
  await drawFrames(page, 1);
  const cameraAtFoot = await inGame(() => window.noReturnDebug.renderCamera.y);
  const neverJumps = descent.heights.every((height, index) => index === 0 || Math.abs(height - descent.heights[index - 1]) < 1);
  // How far down the stairs go differs from station to station, so everything is measured against the foot of this one.
  check('walking down the stairs lowers the floor under you smoothly, all the way to the foot',
    stairs.floorAtTop === 0 && stairs.bottom.floor < -0.2 && Math.abs(descent.heights[descent.heights.length - 1] - stairs.bottom.floor) < 0.05 && neverJumps, { stairs: stairs, descent: descent });
  const eyeAboveFoot = cameraAtFoot - stairs.bottom.floor;
  check('the view follows the floor down', eyeAboveFoot > 1.4 && eyeAboveFoot < 2, { cameraAtFoot: cameraAtFoot, foot: stairs.bottom.floor });
  await inGame(() => { const debug = window.noReturnDebug; debug.teleport(debug.playerStart.x, debug.playerStart.z, 0); debug.simulate(0.2); });

  // --- vents: you only fit crouched, it is loud in there, and the Hollow crawls through ---
  const vent = await inGame(([describeSource]) => (0, eval)('(' + describeSource + ')')(), [String(describeFirstVent)]);
  check('a vent is crawl height and opens into a room at each end', vent.mouths.length === 2 && Math.abs(vent.headroom - vent.ventHeight) < 0.01 && vent.tileCount >= 3, vent);
  const enterVent = async (holdCrouch) => {
    const mouth = vent.mouths[0];
    await inGame(([m]) => {
      const debug = window.noReturnDebug;
      debug.teleport(m.roomX, m.roomZ, Math.atan2(m.stepX, -m.stepZ));
      debug.player.velocityX = 0; debug.player.velocityZ = 0;
      debug.simulate(0.1);
    }, [mouth]);
    if (holdCrouch) await page.keyboard.down('KeyC');
    await page.keyboard.down('KeyW');
    const state = await inGame(() => {
      const debug = window.noReturnDebug;
      // Two and a half seconds forward. How audible the player is gets noted while they are moving inside the
      // vent, because a vent can bend, and a player stopped against the bend is quiet again.
      let loudestInVent = 0;
      for (let step = 0; step < 25; step++) {
        debug.simulate(0.1);
        if (debug.isVentAt(debug.player.x, debug.player.z) && debug.player.isMoving) loudestInVent = Math.max(loudestInVent, debug.player.audibleRadius);
      }
      return { inVent: debug.isVentAt(debug.player.x, debug.player.z), crouching: debug.player.isCrouching, audible: loudestInVent, eye: Math.round(debug.player.eyeHeight * 100) / 100 };
    });
    if (holdCrouch) {
      // Let go of crouch and keep crawling: there is no room to stand up.
      await page.keyboard.up('KeyC');
      await inGame(() => window.noReturnDebug.simulate(1));
      Object.assign(state, await inGame(() => ({ stillCrouching: window.noReturnDebug.player.isCrouching, stillInVent: window.noReturnDebug.isVentAt(window.noReturnDebug.player.x, window.noReturnDebug.player.z),
        eyeAfter: Math.round(window.noReturnDebug.player.eyeHeight * 100) / 100, quietLimit: window.noReturnDebug.tuning.audibleRadiusCrouchWalking, ventLimit: window.noReturnDebug.tuning.audibleRadiusVentCrawling })));
    }
    await page.keyboard.up('KeyW');
    return state;
  };
  const standing = await enterVent(false);
  check('walking at a vent on your feet does not get you in', standing.inVent === false && standing.crouching === false, standing);
  const crawling = await enterVent(true);
  check('crouched you crawl in, and you stay down in there even when you let go of crouch',
    crawling.inVent && crawling.crouching && crawling.stillInVent && crawling.stillCrouching && crawling.eyeAfter < 1.05, crawling);
  check('crawling in a vent is louder than creeping in a room', crawling.audible === crawling.ventLimit && crawling.ventLimit > crawling.quietLimit, crawling);
  const hollowInVent = await inGame(([mouths]) => {
    const debug = window.noReturnDebug, hollow = debug.hollow;
    // Out of the vent and out of earshot; then send the Hollow from one end of the vent to the room at the other.
    debug.teleport(debug.playerStart.x, debug.playerStart.z, 0);
    debug.spawnHollow(mouths[0].roomX, mouths[0].roomZ);
    hollow.graceTimer = 999; // it senses nothing: this is only about getting through
    let wasInVent = false, lowestTopAboveFloor = Infinity, mostCrawl = 0, seconds = 0, closest = Infinity;
    for (; seconds < 60 && closest > 1.6; seconds += 0.1) {
      hollow.state = 0; hollow.targetX = mouths[1].roomX; hollow.targetZ = mouths[1].roomZ;
      debug.simulate(0.1);
      const figure = hollow.figure;
      if (debug.isVentAt(figure.x, figure.z)) {
        wasInVent = true;
        let top = 0;
        for (let capsule = 0; capsule < figure.capsuleCount; capsule++) top = Math.max(top, figure.capsules[capsule * 7 + 1] + figure.capsules[capsule * 7 + 6], figure.capsules[capsule * 7 + 4] + figure.capsules[capsule * 7 + 6]);
        // measured two tiles in, once it has had time to get down
        if (debug.isVentAt(figure.x + Math.sin(figure.yaw) * -1.2, figure.z - Math.cos(figure.yaw) * -1.2)) lowestTopAboveFloor = Math.min(lowestTopAboveFloor, top - figure.y);
        mostCrawl = Math.max(mostCrawl, figure.pose.crawl);
      }
      closest = Math.min(closest, Math.hypot(figure.x - mouths[1].roomX, figure.z - mouths[1].roomZ));
    }
    hollow.isActive = false;
    return { wasInVent: wasInVent, lowestTop: Math.round(lowestTopAboveFloor * 100) / 100, mostCrawl: Math.round(mostCrawl * 100) / 100, seconds: Math.round(seconds), closest: Math.round(closest * 10) / 10, mode: debug.game.mode };
  }, [vent.mouths]);
  check('the Hollow goes through the vent on knees and hands and comes out at the other end',
    hollowInVent.wasInVent && hollowInVent.closest <= 1.6 && hollowInVent.mostCrawl > 0.8 && hollowInVent.lowestTop < vent.ventHeight, hollowInVent);

  await inGame(() => { const debug = window.noReturnDebug; debug.teleport(debug.playerStart.x, debug.playerStart.z, 0); debug.simulate(0.2); });

  // Helpers that work in any station: stand next to a thing, or next to the first door of a kind.
  const standNear = (objectId) => inGame((id) => {
    const debug = window.noReturnDebug;
    const thing = debug.findInteractable(id);
    const spot = debug.findWalkableSpotNear(thing.x, thing.z);
    debug.teleport(spot.x, spot.z, 0);
    return Math.hypot(spot.x - thing.x, spot.z - thing.z);
  }, objectId);
  const standAtDoorOfKind = (kind) => inGame((doorKind) => {
    const debug = window.noReturnDebug;
    const door = debug.doors.find((candidate) => candidate.kind === doorKind);
    for (const step of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const spot = debug.findWalkableSpotNear(door.tileX + 0.5 + step[0], door.tileZ + 0.5 + step[1]);
      if (spot && Math.abs(spot.x - door.tileX - 0.5 - step[0]) < 0.01 && Math.abs(spot.z - door.tileZ - 0.5 - step[1]) < 0.01) {
        debug.teleport(spot.x, spot.z, 0);
        debug.simulate(1.5);
        return door.openFraction;
      }
    }
    return -1;
  }, kind);

  check('a powered door stays shut while the mains is off', (await standAtDoorOfKind(1)) === 0);

  const reachToSpool = await standNear(3);
  await inGame(() => window.noReturnDebug.use(3));
  check('the first spool is within reach of the floor and opens its log', reachToSpool < 2 && (await inGame(() => window.noReturnDebug.game.mode)) === 'reading', reachToSpool);
  await page.keyboard.press('KeyE');

  // This station's extra jobs, whatever the seed gave it. The run below does each one where it belongs.
  const mission = await inGame(() => JSON.parse(JSON.stringify(window.noReturnDebug.level.mission)));
  const missionIds = await inGame(() => window.noReturnDebug.missionObjectIds);
  console.log('      (this station\'s extra jobs: ' + JSON.stringify(mission) + ')');
  if (mission.needsFuel) {
    await standNear(2);
    await inGame(() => window.noReturnDebug.use(2));
    const refused = await inGame(() => ({ powerOn: window.noReturnDebug.game.flags.powerOn, objective: window.noReturnDebug.game.objectiveText }));
    await standNear(missionIds.fuelCan);
    await inGame((id) => window.noReturnDebug.use(id), missionIds.fuelCan);
    check('the generator will not start without the fuel can, and says so', refused.powerOn === false && /fuel/i.test(refused.objective) &&
      (await inGame(() => window.noReturnDebug.game.flags.hasFuel)) === true, refused);
  }
  await standNear(2);
  const hollowWalk = await inGame(() => {
    const debug = window.noReturnDebug;
    debug.use(2);
    debug.teleport(debug.playerStart.x, debug.playerStart.z, 0);
    debug.simulate(7);
    const appeared = debug.game.flags.powerOn && debug.hollow.isActive;
    let closest = Infinity, seconds = 0;
    for (; seconds < 300 && closest >= 3 && debug.game.mode === 'playing'; seconds++) {
      debug.simulate(1);
      closest = Math.min(closest, Math.hypot(debug.hollow.figure.x - debug.level.generatorApproachX, debug.hollow.figure.z - debug.level.generatorApproachZ));
    }
    debug.hollow.isActive = false;
    return { appeared: appeared, closest: closest, seconds: seconds, mode: debug.game.mode };
  });
  check('the generator restores power and the Hollow appears', hollowWalk.appeared, hollowWalk);
  check('the Hollow finds its way from the shaft to the generator room', hollowWalk.closest < 3, hollowWalk);

  check('the powered door opens once the mains is on', (await standAtDoorOfKind(1)) === 1);
  check('a keycard door stays shut without the card', (await standAtDoorOfKind(2)) === 0);
  await standNear(6);
  await inGame(() => window.noReturnDebug.use(6));
  check('the keycard door opens with the card', (await standAtDoorOfKind(2)) === 1);

  for (const spool of [4, 5]) {
    await standNear(spool);
    await inGame((id) => window.noReturnDebug.use(id), spool);
    await page.keyboard.press('KeyE');
    await inGame(() => { window.noReturnDebug.hollow.isActive = false; });
  }
  check('all three spools can be collected', (await inGame(() => window.noReturnDebug.game.flags.spoolsCollected)) === 3);

  if (mission.coreCount > 0) {
    await standNear(1);
    await inGame(() => window.noReturnDebug.use(1));
    const refused = await inGame(() => ({ started: window.noReturnDebug.game.flags.uploadStarted, uploaded: window.noReturnDebug.game.flags.spoolsUploaded }));
    for (let core = 0; core < mission.coreCount; core++) {
      await standNear(missionIds.firstCore + core);
      await inGame((id) => window.noReturnDebug.use(id), missionIds.firstCore + core);
      await inGame(() => { window.noReturnDebug.hollow.isActive = false; });
    }
    check('the terminal will not take the upload until every core sample is in hand', !refused.started && !refused.uploaded &&
      (await inGame(() => window.noReturnDebug.game.flags.coresCollected)) === mission.coreCount, refused);
  }
  await standNear(1);
  await inGame(() => window.noReturnDebug.use(1));
  if (mission.needsBreaker) {
    const waiting = await inGame(() => ({ started: window.noReturnDebug.game.flags.uploadStarted, uploaded: window.noReturnDebug.game.flags.spoolsUploaded, objective: window.noReturnDebug.game.objectiveText,
      marked: window.noReturnDebug.findInteractable(window.noReturnDebug.missionObjectIds.winchBreaker).isDiscovered }));
    await standNear(missionIds.winchBreaker);
    await inGame((id) => window.noReturnDebug.use(id), missionIds.winchBreaker);
    check('with the winch breaker open the upload goes through but the lift does not come; closing the breaker calls it',
      waiting.uploaded && !waiting.started && waiting.marked && /breaker/i.test(waiting.objective) && (await inGame(() => window.noReturnDebug.game.flags.uploadStarted)) === true, waiting);
  }
  const upload = await inGame(() => ({ started: window.noReturnDebug.game.flags.uploadStarted, countdown: window.noReturnDebug.game.liftCountdown }));
  check('uploading three spools calls the lift', upload.started && upload.countdown > 39 && upload.countdown <= 40, upload);
  await inGame(() => { const debug = window.noReturnDebug; debug.hollow.isActive = false; debug.simulate(41); });
  check('the lift arrives and opens', await inGame(() => window.noReturnDebug.game.flags.liftArrived && window.noReturnDebug.getLiftDoor().openFraction === 1));
  await inGame(() => { const debug = window.noReturnDebug; debug.teleport(debug.playerStart.x, debug.playerStart.z, 0); debug.simulate(0.2); });
  check('boarding the lift starts the ascent', (await inGame(() => window.noReturnDebug.game.mode)) === 'ascending');
  await page.waitForFunction(() => window.noReturnDebug.game.mode === 'ending', null, { timeout: 90000 });
  await drawFrames(page, 1);
  const endingText = await page.evaluate(() => document.getElementById('ending-stats').textContent);
  check('the ending screen names the station and its seed', endingText.indexOf('seed ' + playSeed) >= 0, endingText);
  check('the ending screen names the build', /Build\d+\.\d+\.\d+ · build \d+ · [0-9a-f]{7}/.test(endingText), endingText);

  // --- "somewhere uncharted" on the ending screen switches the title screen over ---
  await page.evaluate(() => document.getElementById('button-ending-uncharted').click());
  const afterEnding = await page.evaluate(() => ({ mode: window.noReturnDebug.game.mode, station: window.noReturnDebug.settings.station, checked: document.getElementById('station-generated').checked }));
  check('the ending screen can send you to the title screen with "Uncharted annex" chosen',
    afterEnding.mode === 'title' && afterEnding.station === 'generated' && afterEnding.checked, afterEnding);
  for (let pump = 0; pump < 6; pump++) await drawFrames(page, 1);
  check('the title screen scans the generated lift lobby by itself', (await inGame(() => window.noReturnDebug.pointCloud.totalReturns)) > 0);

  // --- more than one keycard: a large station has two, and each opens only its own ring of doors ---
  await page.selectOption('#title-station-size', 'large');
  await page.fill('#title-seed', '3');
  await startGame(page, false);
  const cards = await inGame(() => {
    const debug = window.noReturnDebug, result = { count: debug.level.keycardCount, problems: debug.auditProgression() };
    debug.grantPower();
    const doorOfCard = (cardLevel) => debug.doors.find((door) => door.kind === 2 && door.cardLevel === cardLevel);
    const tryDoor = (door) => {
      for (const step of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const spot = debug.findWalkableSpotNear(door.tileX + 0.5 + step[0], door.tileZ + 0.5 + step[1]);
        if (spot && Math.abs(spot.x - door.tileX - 0.5 - step[0]) < 0.01 && Math.abs(spot.z - door.tileZ - 0.5 - step[1]) < 0.01) {
          debug.teleport(spot.x, spot.z, 0); debug.simulate(1.5); return door.openFraction;
        }
      }
      return -1;
    };
    const take = (objectId) => { const thing = debug.findInteractable(objectId); const spot = debug.findWalkableSpotNear(thing.x, thing.z); debug.teleport(spot.x, spot.z, 0); debug.use(objectId); debug.simulate(0.2); };
    result.hasBothKindsOfDoor = Boolean(doorOfCard(1) && doorOfCard(2));
    result.card1DoorNoCard = tryDoor(doorOfCard(1));
    take(debug.keycardObjectIds[1]);
    result.levelAfterCard1 = debug.game.flags.keycardLevel;
    result.card1DoorWithCard1 = tryDoor(doorOfCard(1));
    result.card2DoorWithCard1 = tryDoor(doorOfCard(2));
    take(debug.keycardObjectIds[2]);
    result.levelAfterCard2 = debug.game.flags.keycardLevel;
    result.card2DoorWithCard2 = tryDoor(doorOfCard(2));
    result.chip = document.getElementById('chip-keycard').textContent;
    debug.hollow.isActive = false;
    return result;
  });
  await drawFrames(page, 2);
  cards.chip = await page.evaluate(() => document.getElementById('chip-keycard').textContent);
  check('a large station has two keycards and passes the lock-order check', cards.count === 2 && cards.problems.length === 0 && cards.hasBothKindsOfDoor, cards);
  check('keycard 1 opens its own doors and not keycard 2 doors; keycard 2 opens those',
    cards.card1DoorNoCard === 0 && cards.levelAfterCard1 === 1 && cards.card1DoorWithCard1 === 1 && cards.card2DoorWithCard1 === 0 &&
    cards.levelAfterCard2 === 2 && cards.card2DoorWithCard2 === 1 && cards.chip === 'KEYCARDS 2/2', cards);

  // --- the core sample and winch breaker jobs, each on the first large station the seeds give it to ---
  const jobRules = await inGame(() => {
    const debug = window.noReturnDebug, flags = debug.game.flags, ids = debug.missionObjectIds, result = {};
    const findStation = (wanted) => { for (let seed = 1; seed < 80; seed++) { debug.loadStation('generated', seed, 'large', 'mixed', 'one'); if (wanted(debug.level.mission)) return seed; } return -1; };
    // Core samples, and no breaker to muddy it.
    result.coreSeed = findStation((mission) => mission.coreCount > 0 && !mission.needsBreaker);
    debug.grantPower(); debug.grantSpools();
    debug.use(1);
    result.refusedWithoutCores = !flags.uploadStarted && !flags.spoolsUploaded;
    for (let core = 0; core < debug.level.mission.coreCount; core++) debug.use(ids.firstCore + core);
    result.coresCollected = flags.coresCollected === debug.level.mission.coreCount;
    result.chipText = '';
    debug.use(1);
    result.acceptedWithCores = flags.uploadStarted === true;
    // The winch breaker, closed after the upload.
    result.breakerSeed = findStation((mission) => mission.needsBreaker);
    debug.grantSpools();
    debug.use(ids.winchBreaker);
    result.breakerNeedsPower = flags.breakerClosed === false;
    debug.grantPower();
    for (let core = 0; core < debug.level.mission.coreCount; core++) debug.use(ids.firstCore + core);
    debug.use(1);
    result.uploadedButNoLift = flags.spoolsUploaded === true && flags.uploadStarted === false;
    debug.use(ids.winchBreaker);
    result.liftCalledByBreaker = flags.uploadStarted === true && debug.game.liftCountdown > 30;
    // The other order: breaker first, then the upload calls the lift straight away.
    debug.loadStation('generated', result.breakerSeed, 'large', 'mixed', 'one');
    debug.grantPower(); debug.grantSpools();
    for (let core = 0; core < debug.level.mission.coreCount; core++) debug.use(ids.firstCore + core);
    debug.use(ids.winchBreaker);
    result.breakerFirstDoesNotCallLift = flags.breakerClosed === true && flags.uploadStarted === false;
    debug.use(1);
    result.thenUploadCallsLift = flags.uploadStarted === true;
    debug.hollow.isActive = false;
    return result;
  });
  check('core samples: the terminal refuses the upload without them and takes it with them',
    jobRules.coreSeed > 0 && jobRules.refusedWithoutCores && jobRules.coresCollected && jobRules.acceptedWithCores, jobRules);
  check('winch breaker: it needs power; closed after the upload it calls the lift; closed before, the upload does',
    jobRules.breakerSeed > 0 && jobRules.breakerNeedsPower && jobRules.uploadedButNoLift && jobRules.liftCalledByBreaker &&
    jobRules.breakerFirstDoesNotCallLift && jobRules.thenUploadCallsLift, jobRules);

  // --- the largest size: three keycards ---
  const massive = await inGame(() => {
    const debug = window.noReturnDebug, bad = [];
    let cardTotal = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const wasBuilt = debug.loadStation('generated', seed, 'massive', ['tight', 'mixed', 'sprawling'][seed % 3], seed % 2 === 0 ? 'two' : 'one');
      const found = wasBuilt ? debug.auditLayout().concat(debug.auditProgression()).concat(debug.auditHollowRoutes()) : ['no plan could be made'];
      if (found.length > 0) bad.push({ seed: seed, problems: found.slice(0, 4) });
      cardTotal += debug.level.keycardCount;
    }
    return { bad: bad, cardTotal: cardTotal };
  });
  check('8 massive stations: all can be built and finished in order, each with three keycards', massive.bad.length === 0 && massive.cardTotal === 24, massive);

  check('no script errors were reported', problems.length === 0, problems);
  await browser.close();

  if (failures.length > 0) {
    console.log('\n' + failures.length + ' check(s) failed.');
    process.exit(1);
  }
  console.log('\nAll generated-station checks passed.');
})();
