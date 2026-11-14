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

  // --- many stations: every one must be buildable and finishable in the intended order ---
  for (const sizeKey of ['small', 'medium', 'large']) {
    const result = await inGame(([size, seedCount]) => {
      const debug = window.noReturnDebug;
      const layouts = ['tight', 'mixed', 'sprawling'];
      const bad = [];
      let roomTotal = 0, loopTotal = 0, stairTotal = 0, twoLevelCount = 0;
      for (let seed = 1; seed <= seedCount; seed++) {
        const layout = layouts[seed % 3], levels = seed % 2 === 0 ? 'two' : 'one';
        const wasBuilt = debug.loadStation('generated', seed, size, layout, levels);
        const found = wasBuilt ? debug.auditLayout().concat(debug.auditProgression()) : ['no plan could be made'];
        // A two-level station must have its shaft a flight of stairs down; a one-level station must be flat.
        const shaftFloor = debug.getFloorHeightAt(debug.findInteractable(5).x, debug.findInteractable(5).z);
        if (wasBuilt && levels === 'two' && !(shaftFloor < 0 && debug.level.stairCount >= 1)) found.push('two levels were asked for but the shaft is at ' + shaftFloor);
        if (wasBuilt && levels === 'one' && (shaftFloor !== 0 || debug.level.stairCount !== 0)) found.push('one level was asked for but the shaft is at ' + shaftFloor);
        if (found.length > 0) bad.push({ seed: seed, layout: layout, levels: levels, problems: found.slice(0, 4) });
        roomTotal += debug.level.roomCount; loopTotal += debug.level.loopCount;
        if (levels === 'two') { twoLevelCount++; stairTotal += debug.level.stairCount; }
      }
      return { bad: bad, averageRooms: Math.round(roomTotal / seedCount), averageLoops: Math.round(loopTotal / seedCount * 10) / 10,
        averageStairs: Math.round(stairTotal / Math.max(1, twoLevelCount) * 10) / 10 };
    }, [sizeKey, SEEDS_PER_SIZE]);
    check(SEEDS_PER_SIZE + ' ' + sizeKey + ' stations, half of them with two levels: all can be built, walked and finished in order (about ' +
      result.averageRooms + ' rooms and corridors, ' + result.averageLoops + ' extra ducts, ' + result.averageStairs + ' stairs each)', result.bad.length === 0, result.bad.slice(0, 3));
  }

  // --- a seed is a promise: the same seed must give the same station, a different seed a different one ---
  const repeat = await inGame(() => {
    const debug = window.noReturnDebug;
    debug.loadStation('generated', 4471, 'medium', 'mixed');
    const first = debug.getStationFingerprint();
    debug.loadStation('generated', 4472, 'medium', 'mixed');
    const other = debug.getStationFingerprint();
    debug.loadStation('generated', 4471, 'medium', 'mixed');
    const again = debug.getStationFingerprint();
    return { same: first === again, different: first !== other, wordSeed: debug.chooseSeedFromText('okafor') === debug.chooseSeedFromText('okafor'),
      numberSeed: debug.chooseSeedFromText('4471'), emptySeedsDiffer: debug.chooseSeedFromText('') !== debug.chooseSeedFromText('') };
  });
  check('the same seed builds the same station, and another seed a different one', repeat.same && repeat.different, repeat);
  check('a typed number is used as the seed, a typed word always gives the same seed, an empty box a new one',
    repeat.numberSeed === 4471 && repeat.wordSeed && repeat.emptySeedsDiffer, repeat);

  // --- going back to the classic station restores it exactly ---
  const classicAgain = await inGame(() => {
    const debug = window.noReturnDebug;
    debug.loadStation('classic', 0);
    return { kind: debug.level.kind, problems: debug.auditLayout().concat(debug.auditProgression()), start: [debug.playerStart.x, debug.playerStart.z], zone: debug.zoneNames[3] };
  });
  check('loading Kessel-9 again after generated stations gives the classic station back',
    classicAgain.kind === 'classic' && classicAgain.problems.length === 0 && classicAgain.start[0] === 6.5 && classicAgain.zone === 'MAIN CORRIDOR A', classicAgain);

  // --- one generated station, played from lift to lift through the real title screen ---
  await page.evaluate(() => document.getElementById('station-generated').click());
  check('choosing "Uncharted annex" shows the size, layout and seed boxes', await page.evaluate(() => !document.getElementById('station-options').hidden));
  await page.selectOption('#title-station-size', 'medium');
  await page.selectOption('#title-station-layout', 'mixed');
  await page.fill('#title-seed', '7');
  await startGame(page, false);
  const loaded = await inGame(() => ({ kind: window.noReturnDebug.level.kind, seed: window.noReturnDebug.level.seed, description: window.noReturnDebug.level.description }));
  check('Begin descent loads the generated station for the typed seed', loaded.kind === 'generated' && loaded.seed === 7, loaded);

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
    for (let z = level.boundsMinimumZ; z < level.boundsMaximumZ; z++) for (let x = level.boundsMinimumX; x < level.boundsMaximumX; x++) {
      if (debug.getZoneAt(x + 0.5, z + 0.5) !== zone) continue;
      const floor = debug.getFloorHeightAt(x + 0.5, z + 0.5);
      if (!top || floor > top.floor) top = { x: x + 0.5, z: z + 0.5, floor: floor };
      if (!bottom || floor < bottom.floor) bottom = { x: x + 0.5, z: z + 0.5, floor: floor };
    }
    // Stand at the top, in the same lane as the bottom tile found, facing down the flight.
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

  await standNear(1);
  await inGame(() => window.noReturnDebug.use(1));
  const upload = await inGame(() => ({ started: window.noReturnDebug.game.flags.uploadStarted, countdown: window.noReturnDebug.game.liftCountdown }));
  check('uploading three spools calls the lift', upload.started && upload.countdown > 39 && upload.countdown <= 40, upload);
  await inGame(() => { const debug = window.noReturnDebug; debug.hollow.isActive = false; debug.simulate(41); });
  check('the lift arrives and opens', await inGame(() => window.noReturnDebug.game.flags.liftArrived && window.noReturnDebug.getLiftDoor().openFraction === 1));
  await inGame(() => { const debug = window.noReturnDebug; debug.teleport(debug.playerStart.x, debug.playerStart.z, 0); debug.simulate(0.2); });
  check('boarding the lift starts the ascent', (await inGame(() => window.noReturnDebug.game.mode)) === 'ascending');
  await page.waitForFunction(() => window.noReturnDebug.game.mode === 'ending', null, { timeout: 90000 });
  await drawFrames(page, 1);
  const endingText = await page.evaluate(() => document.getElementById('ending-stats').textContent);
  check('the ending screen names the station and its seed', /seed 7/.test(endingText), endingText);

  // --- "somewhere uncharted" on the ending screen switches the title screen over ---
  await page.evaluate(() => document.getElementById('button-ending-uncharted').click());
  const afterEnding = await page.evaluate(() => ({ mode: window.noReturnDebug.game.mode, station: window.noReturnDebug.settings.station, checked: document.getElementById('station-generated').checked }));
  check('the ending screen can send you to the title screen with "Uncharted annex" chosen',
    afterEnding.mode === 'title' && afterEnding.station === 'generated' && afterEnding.checked, afterEnding);
  for (let pump = 0; pump < 6; pump++) await drawFrames(page, 1);
  check('the title screen scans the generated lift lobby by itself', (await inGame(() => window.noReturnDebug.pointCloud.totalReturns)) > 0);

  check('no script errors were reported', problems.length === 0, problems);
  await browser.close();

  if (failures.length > 0) {
    console.log('\n' + failures.length + ' check(s) failed.');
    process.exit(1);
  }
  console.log('\nAll generated-station checks passed.');
})();
