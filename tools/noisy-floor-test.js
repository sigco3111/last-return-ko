// Checks the noisy things on the floor (broken glass, a loose floor plate, empty cans): where they are put,
// that walking or running over one carries much further than a footstep, that crouching over one carries
// nowhere, and that the Hollow sets them off too.
const { openGame, startGame } = require('./browser-harness.js');

const failures = [];
function check(description, condition, detail) {
  const line = (condition ? 'ok    ' : 'FAIL  ') + description + (detail !== undefined ? '  ' + JSON.stringify(detail) : '');
  console.log(line);
  if (!condition) failures.push(description);
}

(async () => {
  const { browser, page, problems } = await openGame({ dev: true }); // "freeze creatures" holds the Hollow where the test puts it
  const inGame = (callback, argument) => page.evaluate(callback, argument);
  await startGame(page, false);

  // --- where they are ---
  const placing = await inGame(() => {
    const d = window.lastReturnDebug, tuning = d.tuning, result = {};
    const describe = function () { return d.noisyFloorPatches.map((patch) => [patch.x, patch.z, patch.kind].join(':')).join(' '); };
    d.loadStation('classic', 0);
    const classic = describe();
    result.classic = { count: d.noisyFloorPatches.length, wanted: Math.max(tuning.noisyFloorFewest, Math.round(19 * tuning.noisyFloorPerRoom)),
      kinds: Array.from(new Set(d.noisyFloorPatches.map((patch) => patch.kind))), problems: d.auditNoisyFloor().concat(d.auditLayout()).concat(d.auditProgression()) };
    d.loadStation('generated', 3, 'large', 'mixed', 'two');
    const generated = describe();
    result.generated = { count: d.noisyFloorPatches.length, wanted: Math.max(tuning.noisyFloorFewest, Math.round(d.level.roomCount * tuning.noisyFloorPerRoom)),
      problems: d.auditNoisyFloor().concat(d.auditLayout()) };
    d.loadStation('generated', 4, 'large', 'mixed', 'two');
    result.anotherSeedDiffers = describe() !== generated;
    d.loadStation('classic', 0);
    result.classicSame = describe() === classic;
    d.loadStation('generated', 3, 'large', 'mixed', 'two');
    result.generatedSame = describe() === generated;
    d.loadStation('classic', 0);
    return result;
  });
  check('Kessel-9 has its share of them, of more than one kind, none in a bad place, and it can still be finished',
    placing.classic.count === placing.classic.wanted && placing.classic.kinds.length >= 2 && placing.classic.problems.length === 0, placing.classic);
  check('a generated station has more, in step with its size, none in a bad place',
    placing.generated.count > placing.classic.count && placing.generated.count >= placing.generated.wanted - 3 && placing.generated.problems.length === 0, placing.generated);
  check('the same station always gets the same ones, and another seed gets others', placing.classicSame && placing.generatedSame && placing.anotherSeedDiffers,
    [placing.classicSame, placing.generatedSame, placing.anotherSeedDiffers]);

  // --- stepping on one ---
  // A patch with two tiles of plain floor before it and two after, in a straight line, to walk across.
  // The first station that has one is used: Kessel-9 if it does, otherwise a generated station.
  const lane = await inGame(() => {
    const d = window.lastReturnDebug;
    const stations = [['classic', 0]];
    for (let seed = 1; seed <= 12; seed++) stations.push(['generated', seed, 'large', 'mixed', 'one']);
    for (const station of stations) {
    d.loadStation.apply(null, station);
    d.game.flags.hasLeftLift = true; d.game.flags.powerOn = true;
    d.setDebugOption('freezeCreatures', true); d.setDebugOption('invulnerable', true); d.setDebugOption('unlimitedStamina', true);
    const isPlain = function (x, z) {
      const spot = d.findWalkableSpotNear(x, z);
      return Boolean(spot) && spot.x === x && spot.z === z && !d.noisyFloorPatches.some((patch) => patch.x === x && patch.z === z) && !d.isVentAt(x, z);
    };
    for (const patch of d.noisyFloorPatches) {
      if (d.getZoneAt(patch.x, patch.z) === d.level.storeZone) continue; // the Hollow never goes into the calibration store
      for (const step of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        // No door anywhere near the run either: a door that opens for the player is a noise of its own.
        // (Doors notice the player from 1.9 m. The walk goes from two tiles before the patch to a metre and a half past it.)
        const isClearOfDoors = d.doors.every((door) => [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].every((along) =>
          Math.hypot(door.centerX - (patch.x + step[0] * along), door.centerZ - (patch.z + step[1] * along)) > 2.3));
        if (isClearOfDoors && [-2, -1, 1, 2].every((along) => isPlain(patch.x + step[0] * along, patch.z + step[1] * along))) {
          return { station: station.slice(0, 2).join(' '), patch: { x: patch.x, z: patch.z, kind: patch.kind }, stepX: step[0], stepZ: step[1], hearing: d.game.difficulty.hearingFactor,
            carries: { walk: d.tuning.noiseRadiusWalkStep, sprint: d.tuning.noiseRadiusSprintStep, noisyWalk: d.tuning.noiseRadiusNoisyFloorWalk, noisySprint: d.tuning.noiseRadiusNoisyFloorSprint } };
        }
      }
    }
    }
    return null;
  });
  check('there is a patch with a straight run of plain floor across it and no door near, for the walking checks', lane !== null, lane);

  // Crosses the patch from two tiles before it to a metre and a half after, with the Hollow standing still off to
  // one side at `listenerMetres`, and reports what the Hollow made of it.
  const cross = async (keys, listenerMetres) => {
    await inGame(([lane, metres]) => {
      const d = window.lastReturnDebug, patch = lane.patch;
      d.teleport(patch.x - lane.stepX * 2, patch.z - lane.stepZ * 2, Math.atan2(lane.stepX, -lane.stepZ));
      d.player.velocityX = 0; d.player.velocityZ = 0; d.player.pitch = 0;
      d.simulate(0.2);
      // Off to the side, square to the way the player walks, so that the patch is the nearest the player ever comes to it.
      d.spawnHollow(patch.x + lane.stepZ * metres, patch.z - lane.stepX * metres);
      d.hollow.graceTimer = 0; d.hollow.state = 0; d.hollow.hasHeardNoise = false;
      d.noisyFloorCounts.byPlayer = 0; d.noisyFloorCounts.byPlayerCrouched = 0;
      d.game.hasShownNoisyFloorHint = false;
      // With captions on "every sound", your own noise on a patch is put into words. Counted from here.
      d.settings.captions = 'all';
      for (const key of ['ownGlass', 'ownPlate', 'ownCans']) d.captionCounts[key] = 0;
    }, [lane, listenerMetres]);
    for (const key of keys) await page.keyboard.down(key);
    const result = await inGame(([lane]) => {
      const d = window.lastReturnDebug, patch = lane.patch;
      let nearestToPatch = Infinity;
      for (let time = 0; time < 9; time += 0.1) {
        d.simulate(0.1);
        nearestToPatch = Math.min(nearestToPatch, Math.hypot(d.player.x - patch.x, d.player.z - patch.z));
        if ((d.player.x - patch.x) * lane.stepX + (d.player.z - patch.z) * lane.stepZ > 1.5) break; // past it
      }
      const answer = { hollowState: d.hollow.state, wentToLookAt: [d.hollow.targetX, d.hollow.targetZ], nearestToPatch: Math.round(nearestToPatch * 100) / 100,
        setOff: d.noisyFloorCounts.byPlayer, setOffCrouched: d.noisyFloorCounts.byPlayerCrouched, toldWhatItWas: d.game.hasShownNoisyFloorHint,
        crouching: d.player.isCrouching, sprinting: d.player.isSprinting,
        captionsForYourOwnNoise: d.captionCounts.ownGlass + d.captionCounts.ownPlate + d.captionCounts.ownCans };
      d.hollow.isActive = false;
      return answer;
    }, [lane]);
    for (const key of keys) await page.keyboard.up(key);
    return result;
  };
  if (lane) {
    const hearing = lane.hearing, carries = lane.carries;
    // Far enough that a plain step is not heard, near enough that the patch is.
    const walkListener = (carries.walk * hearing + carries.noisyWalk * hearing) / 2 + 1;
    const sprintListener = (carries.sprint * hearing + carries.noisySprint * hearing) / 2;
    const walked = await cross(['KeyW'], walkListener);
    check('walking over one sets it off, and the Hollow, too far away to hear a footstep, comes to look at that very spot',
      walked.setOff >= 1 && walked.nearestToPatch < 0.5 && walked.hollowState === 1 &&
      Math.hypot(walked.wentToLookAt[0] - lane.patch.x, walked.wentToLookAt[1] - lane.patch.z) < 1 && walkListener > carries.walk * hearing + 0.5,
      { walked: walked, listenerMetres: walkListener, plainStepCarries: carries.walk * hearing, patchCarries: carries.noisyWalk * hearing });
    check('the first time, you are told what it was and how to avoid it', walked.toldWhatItWas === true, walked.toldWhatItWas);
    check('with captions on "every sound", the noise you made there is put into words', walked.captionsForYourOwnNoise >= 1, walked.captionsForYourOwnNoise);
    const crouched = await cross(['KeyC', 'KeyW'], 3.5);
    check('crouched, you cross the same patch and nothing carries: the Hollow three and a half metres away does not stir',
      crouched.crouching && crouched.nearestToPatch < 0.5 && crouched.setOff === 0 && crouched.setOffCrouched >= 1 && crouched.hollowState === 0 && !crouched.toldWhatItWas && crouched.captionsForYourOwnNoise === 0, crouched);
    const sprinted = await cross(['ShiftLeft', 'KeyW'], sprintListener);
    check('running over one carries further still: further than a running step on plain floor',
      sprinted.setOff >= 1 && sprinted.hollowState === 1 && sprintListener > carries.sprint * hearing + 0.5,
      { sprinted: sprinted, listenerMetres: sprintListener, plainRunCarries: carries.sprint * hearing, patchCarries: carries.noisySprint * hearing });

    // --- the Hollow sets them off too ---
    const hollowSteps = await inGame(([lane]) => {
      const d = window.lastReturnDebug, patch = lane.patch;
      d.setDebugOption('freezeCreatures', false);
      d.teleport(d.playerStart.x, d.playerStart.z, 0); d.simulate(0.1);
      d.spawnHollow(patch.x - lane.stepX * 2, patch.z - lane.stepZ * 2);
      d.hollow.graceTimer = 999; // it takes no notice of the player: this is only about where it puts its feet
      d.noisyFloorCounts.byHollow = 0;
      // What the Hollow does to a patch is put into words too, but only where it could be heard.
      d.settings.captions = 'all';
      const captionKey = { glass: 'hollowOnGlass', plate: 'hollowOnPlate', cans: 'hollowOnCans' }[patch.kind];
      d.captionCounts[captionKey] = 0;
      const targetX = patch.x + lane.stepX * 2, targetZ = patch.z + lane.stepZ * 2;
      let nearest = Infinity, furthestPast = -Infinity;
      for (let time = 0; time < 12; time += 0.1) {
        d.hollow.state = 0; d.hollow.targetX = targetX; d.hollow.targetZ = targetZ;
        d.simulate(0.1);
        nearest = Math.min(nearest, Math.hypot(d.hollow.figure.x - patch.x, d.hollow.figure.z - patch.z));
        // How far along the lane it is past the middle of the patch. Half a metre is the far edge of it.
        furthestPast = (d.hollow.figure.x - patch.x) * lane.stepX + (d.hollow.figure.z - patch.z) * lane.stepZ;
        if (furthestPast > 0.45) break;
      }
      const answer = { setOffByHollow: d.noisyFloorCounts.byHollow, nearestToPatch: Math.round(nearest * 100) / 100, endedPastTheMiddleBy: Math.round(furthestPast * 100) / 100 };
      // The player was standing at the lift all that while. Out of earshot, no line comes on screen.
      answer.playerMetresAway = Math.round(Math.hypot(d.playerStart.x - patch.x, d.playerStart.z - patch.z) * 10) / 10;
      answer.captionMetres = d.captions[captionKey].withinMetres;
      answer.captionsFromAfar = d.captionCounts[captionKey];

      // Then it is made to shuffle to and fro over the edge of the patch for three seconds, ten centimetres
      // either side, standing and listening (so it takes no steps of its own). That must set the patch off
      // once, when it first comes onto it, and not once for every time it crosses the edge.
      d.noisyFloorCounts.byHollow = 0;
      const edgeX = patch.x - lane.stepX * 0.5, edgeZ = patch.z - lane.stepZ * 0.5;
      d.hollow.figure.x = edgeX - lane.stepX * 1.5; d.hollow.figure.z = edgeZ - lane.stepZ * 1.5;
      d.hollow.state = 4; d.hollow.listenTimer = 5; d.simulate(0.5); // well clear of it first
      let side = 1;
      for (let time = 0; time < 3; time += 0.1) {
        d.hollow.state = 4; d.hollow.listenTimer = 5;
        d.hollow.figure.x = edgeX + lane.stepX * 0.1 * side; d.hollow.figure.z = edgeZ + lane.stepZ * 0.1 * side;
        d.simulate(0.1);
        side = -side;
      }
      answer.setOffWhileShufflingOnTheEdge = d.noisyFloorCounts.byHollow;
      // And once it has gone well clear and comes back, the patch goes off again.
      d.hollow.figure.x = edgeX - lane.stepX * 1.5; d.hollow.figure.z = edgeZ - lane.stepZ * 1.5;
      d.hollow.state = 4; d.hollow.listenTimer = 5; d.simulate(0.5);
      // This time the player stands two metres from the patch, so the line does come.
      d.setDebugOption('creaturesIgnorePlayer', true);
      d.teleport(patch.x + lane.stepX * 2, patch.z + lane.stepZ * 2, 0);
      d.captionCounts[captionKey] = 0;
      d.hollow.figure.x = patch.x; d.hollow.figure.z = patch.z;
      d.hollow.state = 4; d.hollow.listenTimer = 5; d.simulate(0.2);
      answer.setOffAfterComingBack = d.noisyFloorCounts.byHollow;
      answer.captionsFromNear = d.captionCounts[captionKey];
      answer.captionOnScreen = d.getCaptionLines().filter((line) => line.key === captionKey).map((line) => line.text + ' ' + line.where)[0] || '';
      d.setDebugOption('creaturesIgnorePlayer', false);
      d.hollow.isActive = false;
      return answer;
    }, [lane]);
    check('the Hollow walking across the same patch sets it off too, which is how you hear where it is: once or twice in a crossing, not a rattle',
      hollowSteps.setOffByHollow >= 1 && hollowSteps.setOffByHollow <= 3 && hollowSteps.nearestToPatch < 0.6, hollowSteps);
    check('shuffling to and fro over the edge of a patch sets it off once, not every time the edge is crossed; going clear and coming back sets it off again',
      hollowSteps.setOffWhileShufflingOnTheEdge === 1 && hollowSteps.setOffAfterComingBack === 2, hollowSteps);
    check('with captions on "every sound": when the Hollow sets one off near you a line says so and points at it, and from out of earshot none does',
      hollowSteps.captionsFromNear === 1 && /^\[.+\] . close$/.test(hollowSteps.captionOnScreen) && hollowSteps.playerMetresAway > hollowSteps.captionMetres && hollowSteps.captionsFromAfar === 0,
      { onScreen: hollowSteps.captionOnScreen, near: hollowSteps.captionsFromNear, fromAfar: hollowSteps.captionsFromAfar, playerMetresAway: hollowSteps.playerMetresAway, captionMetres: hollowSteps.captionMetres });
  }

  check('no script errors were reported', problems.length === 0, problems);
  await browser.close();

  if (failures.length > 0) {
    console.log('\n' + failures.length + ' check(s) failed.');
    process.exit(1);
  }
  console.log('\nAll noisy-floor checks passed.');
})().catch((error) => { console.error('Noisy-floor test crashed:', error); process.exit(1); });
