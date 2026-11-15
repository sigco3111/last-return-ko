// Checks the Hollow and locked doors: which doors open for it and which never do, that it cannot walk
// through one that is shut, and that its way round through the crawlspace above the ceilings works, takes
// the time it should, gives the warning it should, and cannot be used by it to catch you from above.
const { openGame, startGame } = require('./browser-harness.js');

const failures = [];
function check(description, condition, detail) {
  const line = (condition ? 'ok    ' : 'FAIL  ') + description + (detail !== undefined ? '  ' + JSON.stringify(detail) : '');
  console.log(line);
  if (!condition) failures.push(description);
}

// Helpers that run inside the page, kept on `window.lab`.
const labSource = String(function () {
  const d = window.noReturnDebug, lab = {};
  lab.fresh = function () {
    d.loadStation('classic', 0);
    d.game.flags.hasLeftLift = true;
    d.hollow.isActive = false;
    d.setDebugOption('invulnerable', true);
    d.setDebugOption('unlimitedScanner', true);
  };
  // True once the Hollow is on its feet and has reached the player.
  lab.hasReachedPlayer = function () {
    return !d.hollow.crawlspace && Math.hypot(d.hollow.figure.x - d.player.x, d.hollow.figure.z - d.player.z) < 0.7;
  };
  // The first door of a kind, and a walkable spot on each side of it, 1.2 m from its middle.
  lab.findDoor = function (kind) {
    for (const door of d.doors) {
      if (door.kind !== kind) continue;
      const sides = [];
      for (const step of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) {
        const spot = d.findWalkableSpotNear(door.centerX + step[0], door.centerZ + step[1]);
        if (spot && Math.abs(spot.x - (door.centerX + Math.sign(step[0]))) < 0.01 && Math.abs(spot.z - (door.centerZ + Math.sign(step[1]))) < 0.01) sides.push({ x: door.centerX + step[0], z: door.centerZ + step[1], awayX: step[0], awayZ: step[1] });
      }
      if (sides.length === 2) return { door: door, sides: sides };
    }
    return null;
  };
  // Stands the Hollow still at a place (listening, so that it does not walk off) and lets time pass.
  lab.holdHollowAt = function (x, z, seconds) {
    d.spawnHollow(x, z);
    d.hollow.graceTimer = 999; // it senses nothing: this is about the door, not about the player
    for (let elapsed = 0; elapsed < seconds; elapsed += 0.1) { d.hollow.state = 4; d.hollow.listenTimer = 5; d.hollow.figure.x = x; d.hollow.figure.z = z; d.simulate(0.1); }
  };
  lab.far = function () { d.teleport(d.playerStart.x, d.playerStart.z, 0); d.simulate(0.1); };
  window.lab = lab;
});

(async () => {
  const { browser, page, problems } = await openGame({ dev: true }); // "cannot be caught" lets one descent serve for every part of this
  const inGame = (callback, argument) => page.evaluate(callback, argument);
  await startGame(page, false);
  await inGame((source) => (0, eval)('(' + source + ')')(), labSource);

  // --- which doors open for it ---
  const doorRules = await inGame(() => {
    const d = window.noReturnDebug, lab = window.lab, kinds = d.doorKinds, result = {};
    const openedFor = function (kind, prepare) {
      lab.fresh();
      prepare();
      const found = lab.findDoor(kind);
      if (!found) return null;
      lab.far();
      // The player must be nowhere near, or the door would open for them.
      if (Math.hypot(d.player.x - found.door.centerX, d.player.z - found.door.centerZ) < 4) return 'player too near';
      lab.holdHollowAt(found.sides[0].x, found.sides[0].z, 2);
      const answer = { open: found.door.openFraction, blocked: d.tileBlocksHollow[Math.floor(found.door.centerZ) * 256 + Math.floor(found.door.centerX)] };
      d.hollow.isActive = false;
      return answer;
    };
    result.automatic = openedFor(kinds.automatic, function () {});
    result.poweredWithoutPower = openedFor(kinds.powered, function () { d.game.flags.powerOn = false; });
    result.poweredWithPower = openedFor(kinds.powered, function () { d.game.flags.powerOn = true; });
    result.keycard = openedFor(kinds.keycard, function () { d.game.flags.powerOn = true; d.grantKeycard(); });
    // The lift door, shut behind the player as it is for most of a descent.
    lab.fresh();
    d.game.flags.powerOn = true;
    const lift = d.getLiftDoor();
    lift.forcedState = false; lift.openFraction = 0;
    d.teleport(40.5, 52.5, 0); d.simulate(0.2);
    const outside = d.findWalkableSpotNear(lift.centerX + 1, lift.centerZ);
    lab.holdHollowAt(outside.x, outside.z, 2);
    result.lift = { open: lift.openFraction, hollowMetresFromIt: Math.round(Math.hypot(outside.x - lift.centerX, outside.z - lift.centerZ) * 10) / 10 };
    d.hollow.isActive = false;
    return result;
  });
  check('a door that opens by itself opens for the Hollow', doorRules.automatic && doorRules.automatic.open > 0.9 && doorRules.automatic.blocked === 0, doorRules.automatic);
  check('a powered door opens for it only once the mains is on',
    doorRules.poweredWithoutPower && doorRules.poweredWithoutPower.open === 0 && doorRules.poweredWithoutPower.blocked === 1 &&
    doorRules.poweredWithPower.open > 0.9 && doorRules.poweredWithPower.blocked === 0, [doorRules.poweredWithoutPower, doorRules.poweredWithPower]);
  check('a keycard door never opens for it, even when the player holds every card', doorRules.keycard && doorRules.keycard.open === 0 && doorRules.keycard.blocked === 1, doorRules.keycard);
  check('the lift door never opens for it', doorRules.lift.open === 0 && doorRules.lift.hollowMetresFromIt < 1.8, doorRules.lift);

  // --- it cannot walk through a shut door, and it has a way round ---
  const wayRound = await inGame(() => {
    const d = window.noReturnDebug, lab = window.lab, kinds = d.doorKinds, tuning = d.tuning, result = {};
    lab.fresh();
    d.game.flags.powerOn = true; d.grantKeycard();
    const found = lab.findDoor(kinds.keycard);
    const door = found.door;
    // The player well inside on one side (too far for the door to open for them), the Hollow at the door on the other.
    const playerSpot = d.findWalkableSpotNear(found.sides[0].x + found.sides[0].awayX * 5, found.sides[0].z + found.sides[0].awayZ * 5);
    d.teleport(playerSpot.x, playerSpot.z, 0); d.simulate(0.2);
    result.playerMetresFromDoor = Math.round(Math.hypot(playerSpot.x - door.centerX, playerSpot.z - door.centerZ) * 10) / 10;
    const hollowSide = found.sides[1];
    d.spawnHollow(hollowSide.x + hollowSide.awayX * 1.5, hollowSide.z + hollowSide.awayZ * 1.5);
    d.hollow.graceTimer = 0; d.hollow.knowsPlayerPositionAlways = true;
    result.partsDiffer = d.getHollowPartAt(d.player.x, d.player.z) !== d.getHollowPartAt(d.hollow.figure.x, d.hollow.figure.z);
    result.stepsStraightThroughTheDoor = Math.round(Math.abs(playerSpot.x - d.hollow.figure.x) + Math.abs(playerSpot.z - d.hollow.figure.z));
    result.stepsItHasToGo = d.getHollowStepsTo(d.player.x, d.player.z);
    const phases = [], doorIndex = Math.floor(door.centerZ) * 256 + Math.floor(door.centerX);
    // Phases are timed on the game's own clock, so that the pause for the look from below does not count.
    let last = 'on foot', phaseStart = d.game.time, time = 0, wasOnShutDoor = false, doorOpened = false, crawlMetres = 0;
    let hitsWhileHidden = 0, caughtFromAbove = false, graceAfterLanding = -1, landedAt = null, exitHatch = null;
    d.setScannerSpread(24);
    let hasReached = false;
    for (; time < 150 && !hasReached; time += 0.1) {
      d.simulate(0.1);
      hasReached = lab.hasReachedPlayer();
      const figure = d.hollow.figure, crawl = d.hollow.crawlspace;
      if (door.openFraction > 0) doorOpened = true;
      if (!crawl && Math.floor(figure.z) * 256 + Math.floor(figure.x) === doorIndex && door.openFraction < 0.6) wasOnShutDoor = true;
      const now = crawl ? ['climbing', 'travelling', 'rattling'][crawl.phase] : 'on foot';
      if (now !== last) {
        phases.push([last, Math.round((d.game.time - phaseStart) * 10) / 10]);
        if (last === 'rattling' && now === 'on foot') { graceAfterLanding = d.hollow.graceTimer; landedAt = [figure.x, figure.z]; }
        last = now; phaseStart = d.game.time;
      }
      const underIt = crawl && crawl.phase === 1 ? d.findWalkableSpotNear(figure.x, figure.z) : null;
      if (underIt && !result.testedFromBelow && Math.hypot(underIt.x - figure.x, underIt.z - figure.z) < 0.3) {
        // It is right over a piece of floor. Stand on that floor, straight underneath it, with "cannot be caught"
        // switched off for the moment, and scan straight up: there is nothing to find, and it cannot reach down.
        result.testedFromBelow = true;
        const keep = [d.player.x, d.player.z, d.player.yaw, d.player.pitch];
        const hitsBefore = figure.totalHits;
        d.setDebugOption('invulnerable', false);
        d.teleport(figure.x, figure.z, 0); d.player.pitch = 1.3;
        result.metresUnderIt = Math.round(Math.hypot(d.player.x - figure.x, d.player.z - figure.z) * 100) / 100;
        d.setScanHeld(true); d.simulate(0.3); d.setScanHeld(false);
        if (d.game.mode !== 'playing') caughtFromAbove = true;
        d.setDebugOption('invulnerable', true);
        time += 0.3;
        hitsWhileHidden = figure.totalHits - hitsBefore;
        d.teleport(keep[0], keep[1], keep[2]); d.player.pitch = keep[3];
      }
      if (crawl && crawl.phase === 1) { crawlMetres = Math.hypot(crawl.to.x - crawl.from.x, crawl.to.z - crawl.from.z); exitHatch = [crawl.to.x, crawl.to.z]; }
    }
    result.phases = phases;
    result.secondsUntilItReachedThePlayer = Math.round(time);
    result.reachedThePlayer = hasReached;
    result.wasOnShutDoor = wasOnShutDoor; result.doorOpened = doorOpened;
    result.crawlMetres = Math.round(crawlMetres * 10) / 10;
    result.expectedTravelSeconds = Math.round(crawlMetres / tuning.hollowCrawlSpeed * 10) / 10;
    result.hitsWhileHidden = hitsWhileHidden; result.caughtFromAbove = caughtFromAbove;
    result.graceAfterLanding = graceAfterLanding; result.landedAt = landedAt; result.exitHatch = exitHatch;
    result.limits = [tuning.hollowCrawlClimbSeconds, tuning.hollowCrawlDropWarningSeconds, tuning.hollowCrawlLandingGraceSeconds];
    return result;
  });
  const phaseSeconds = (name) => { const found = wayRound.phases.filter((phase) => phase[0] === name); return found.length ? found[0][1] : -1; };
  check('a keycard door shut between it and the player stays shut, and it never walks through it',
    wayRound.partsDiffer && !wayRound.doorOpened && !wayRound.wasOnShutDoor && wayRound.playerMetresFromDoor > 3, wayRound);
  check('it goes round through the crawlspace instead, and reaches the player',
    wayRound.stepsItHasToGo > wayRound.stepsStraightThroughTheDoor && phaseSeconds('climbing') > 0 && phaseSeconds('travelling') > 0 && phaseSeconds('rattling') > 0 &&
    wayRound.reachedThePlayer, { phases: wayRound.phases, steps: [wayRound.stepsStraightThroughTheDoor, wayRound.stepsItHasToGo], seconds: wayRound.secondsUntilItReachedThePlayer });
  check('the crawl takes the time it should: the climb, the metres at its crawling speed, and the full warning at the exit hatch',
    Math.abs(phaseSeconds('climbing') - wayRound.limits[0]) < 0.25 && Math.abs(phaseSeconds('travelling') - wayRound.expectedTravelSeconds) < 0.8 &&
    Math.abs(phaseSeconds('rattling') - wayRound.limits[1]) < 0.25, { climbing: phaseSeconds('climbing'), travelling: phaseSeconds('travelling'), expected: wayRound.expectedTravelSeconds, rattling: phaseSeconds('rattling'), metres: wayRound.crawlMetres });
  check('above the ceiling there is nothing for a scan to find, and it cannot catch you from up there',
    wayRound.testedFromBelow === true && wayRound.metresUnderIt < 0.3 && wayRound.hitsWhileHidden === 0 && !wayRound.caughtFromAbove, { under: wayRound.metresUnderIt, hits: wayRound.hitsWhileHidden });
  check('it lands under the hatch that rattled, and cannot catch you in its first second on the floor',
    wayRound.landedAt && Math.hypot(wayRound.landedAt[0] - wayRound.exitHatch[0], wayRound.landedAt[1] - wayRound.exitHatch[1]) < 0.3 &&
    wayRound.graceAfterLanding >= wayRound.limits[2] - 0.15, { landedAt: wayRound.landedAt, hatch: wayRound.exitHatch, grace: wayRound.graceAfterLanding });

  // --- an open keycard door is an open door: it comes through behind you, and the door does not close on it ---
  const openDoor = await inGame(() => {
    const d = window.noReturnDebug, lab = window.lab, kinds = d.doorKinds, result = {};
    lab.fresh();
    d.game.flags.powerOn = true; d.grantKeycard();
    const found = lab.findDoor(kinds.keycard), door = found.door;
    // The player stands by the door, which holds it open. The Hollow comes from the other side.
    d.teleport(found.sides[0].x, found.sides[0].z, 0); d.simulate(1.2);
    result.openForThePlayer = door.openFraction > 0.9;
    d.spawnHollow(found.sides[1].x + found.sides[1].awayX * 3, found.sides[1].z + found.sides[1].awayZ * 3);
    d.hollow.graceTimer = 0; d.hollow.knowsPlayerPositionAlways = true;
    let usedCrawlspace = false, lowestOpenWhileInDoorway = 1, time = 0;
    const doorIndex = Math.floor(door.centerZ) * 256 + Math.floor(door.centerX);
    let hasReached = false;
    for (; time < 20 && !hasReached; time += 0.1) {
      d.simulate(0.1);
      hasReached = lab.hasReachedPlayer();
      if (d.hollow.crawlspace) usedCrawlspace = true;
      if (Math.floor(d.hollow.figure.z) * 256 + Math.floor(d.hollow.figure.x) === doorIndex) lowestOpenWhileInDoorway = Math.min(lowestOpenWhileInDoorway, door.openFraction);
    }
    result.reachedThePlayer = hasReached; result.seconds = Math.round(time * 10) / 10; result.usedCrawlspace = usedCrawlspace; result.lowestOpenWhileInDoorway = lowestOpenWhileInDoorway;
    return result;
  });
  check('through a keycard door that stands open for the player it simply walks, and quickly',
    openDoor.openForThePlayer && openDoor.reachedThePlayer && !openDoor.usedCrawlspace && openDoor.seconds < 6 && openDoor.lowestOpenWhileInDoorway > 0.6, openDoor);

  // --- it does not take to the ceiling for a short walk ---
  const shortWalk = await inGame(() => {
    const d = window.noReturnDebug, lab = window.lab, result = { trips: 0, crawls: 0 };
    lab.fresh();
    d.game.flags.powerOn = true;
    lab.far();
    // From every hatch, sent to a place ten metres off in the same part of the station.
    for (const hatch of d.hollowHatches) {
      let target = null;
      for (const step of [[10, 0], [-10, 0], [0, 10], [0, -10], [7, 7], [-7, -7], [7, -7], [-7, 7]]) {
        const spot = d.findWalkableSpotNear(hatch.x + step[0], hatch.z + step[1]);
        if (spot && d.getHollowPartAt(spot.x, spot.z) === hatch.part && Math.hypot(spot.x - hatch.x, spot.z - hatch.z) > 6) { target = spot; break; }
      }
      if (!target) continue;
      d.spawnHollow(hatch.x, hatch.z); d.hollow.graceTimer = 999;
      result.trips++;
      for (let time = 0; time < 4; time += 0.1) { d.hollow.state = 0; d.hollow.targetX = target.x; d.hollow.targetZ = target.z; d.simulate(0.1); if (d.hollow.crawlspace) { result.crawls++; break; } }
      d.hollow.isActive = false;
    }
    return result;
  });
  check('standing under a hatch with somewhere near to go, it walks', shortWalk.trips >= 3 && shortWalk.crawls === 0, shortWalk);

  // --- the lift car ---
  const liftCar = await inGame(() => {
    const d = window.noReturnDebug, lab = window.lab, result = {};
    lab.fresh();
    d.game.flags.powerOn = true;
    const lift = d.getLiftDoor();
    lift.forcedState = false; lift.openFraction = 0;
    d.teleport(40.5, 52.5, 0); d.simulate(0.2);
    const outside = d.findWalkableSpotNear(lift.centerX + 2.5, lift.centerZ);
    d.spawnHollow(outside.x, outside.z); d.hollow.graceTimer = 999;
    // Sent into the car, with the door shut.
    let wasInCar = false, gaveUp = false;
    d.hollow.state = 0; d.hollow.targetX = d.playerStart.x; d.hollow.targetZ = d.playerStart.z;
    for (let time = 0; time < 12; time += 0.1) {
      d.simulate(0.1);
      if (d.zoneNames[d.getZoneAt(d.hollow.figure.x, d.hollow.figure.z)] === 'LIFT CAR') wasInCar = true;
      if (Math.hypot(d.hollow.targetX - d.playerStart.x, d.hollow.targetZ - d.playerStart.z) > 1) gaveUp = true;
    }
    result.wasInCarWithDoorShut = wasInCar; result.wentSomewhereElseInstead = gaveUp; result.doorStayedShut = lift.openFraction === 0;
    // With the door open (the lift has come), it can.
    lift.forcedState = true;
    d.spawnHollow(outside.x, outside.z); d.hollow.graceTimer = 999;
    let wasInCarOpen = false;
    for (let time = 0; time < 12 && !wasInCarOpen; time += 0.1) {
      d.hollow.state = 0; d.hollow.targetX = d.playerStart.x; d.hollow.targetZ = d.playerStart.z;
      d.simulate(0.1);
      if (d.zoneNames[d.getZoneAt(d.hollow.figure.x, d.hollow.figure.z)] === 'LIFT CAR') wasInCarOpen = true;
    }
    result.wasInCarWithDoorOpen = wasInCarOpen;
    d.hollow.isActive = false;
    return result;
  });
  check('with the lift door shut it cannot get into the car, and goes somewhere else instead of standing at the door',
    !liftCar.wasInCarWithDoorShut && liftCar.doorStayedShut && liftCar.wentSomewhereElseInstead, liftCar);
  check('once the lift has come and its door is open, it can', liftCar.wasInCarWithDoorOpen, liftCar);

  // --- the hatches: every locked-off part has one, the same station always gets the same ones ---
  const hatches = await inGame(() => {
    const d = window.noReturnDebug, result = {};
    const describe = function () { return d.hollowHatches.map((hatch) => [hatch.x, hatch.z, hatch.part].join(':')).join(' '); };
    d.loadStation('classic', 0);
    result.classic = { hatches: d.hollowHatches.length, parts: d.getHollowPartCount(), problems: d.auditHollowRoutes(), layout: d.auditLayout() };
    const classicFirst = describe();
    d.loadStation('generated', 3, 'large', 'mixed', 'two');
    const generatedFirst = describe();
    result.generated = { hatches: d.hollowHatches.length, parts: d.getHollowPartCount(), problems: d.auditHollowRoutes(), keycards: d.level.keycardCount };
    d.loadStation('classic', 0);
    result.classicSame = describe() === classicFirst;
    d.loadStation('generated', 3, 'large', 'mixed', 'two');
    result.generatedSame = describe() === generatedFirst;
    d.loadStation('classic', 0);
    return result;
  });
  check('Kessel-9: every part that locked doors close off has a ceiling hatch, and the Hollow can get everywhere it may go',
    hatches.classic.parts >= 2 && hatches.classic.hatches >= hatches.classic.parts && hatches.classic.problems.length === 0 && hatches.classic.layout.length === 0, hatches.classic);
  check('a generated station with two keycards: the same',
    hatches.generated.keycards === 2 && hatches.generated.parts >= 3 && hatches.generated.hatches >= hatches.generated.parts && hatches.generated.problems.length === 0, hatches.generated);
  check('the same station always gets the same hatches', hatches.classicSame && hatches.generatedSame, [hatches.classicSame, hatches.generatedSame]);

  check('no script errors were reported', problems.length === 0, problems);
  await browser.close();

  if (failures.length > 0) {
    console.log('\n' + failures.length + ' check(s) failed.');
    process.exit(1);
  }
  console.log('\nAll locked-door checks passed.');
})().catch((error) => { console.error('Locked-door test crashed:', error); process.exit(1); });
