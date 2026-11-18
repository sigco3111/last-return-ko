// Checks that the station treats everyone in it alike: with a second player in `players`, doors open for
// them, the Hollow hears them and goes for whoever is nearest, its director keeps its distance from both, and
// the Stills walk at them. And that what catches somebody else does not kill you.
//
// The second player here is only a record put into the list by hand. Nobody is on the other end of it.
const { openGame, startGame } = require('./browser-harness.js');

const failures = [];
function check(description, condition, detail) {
  const line = (condition ? 'ok    ' : 'FAIL  ') + description + (detail !== undefined ? '  ' + JSON.stringify(detail) : '');
  console.log(line);
  if (!condition) failures.push(description);
}

(async () => {
  const { browser, page, problems } = await openGame({ dev: true });
  await startGame(page, false);

  const result = await page.evaluate(() => {
    const d = window.lastReturnDebug, result = {};
    const other = { x: 0, z: 0, velocityX: 0, velocityZ: 0, audibleRadius: 0 };
    const fresh = function () {
      d.loadStation('classic', 0);
      d.game.flags.hasLeftLift = true;
      d.hollow.isActive = false;
      d.players.length = 1;
      d.teleport(d.playerStart.x, d.playerStart.z, 0); d.player.velocityX = 0; d.player.velocityZ = 0;
      d.simulate(0.2);
    };
    const distance = function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z); };
    const standAt = function (who, x, z) { const spot = d.findWalkableSpotNear(x, z); who.x = spot.x; who.z = spot.z; };

    result.aloneCount = d.players.length;
    result.aloneIsYou = d.players[0] === d.player;

    // ---- A door far from you opens for the other player, and shuts again once they are gone. ----
    fresh();
    let door = null;
    for (const candidate of d.doors) {
      if (candidate.kind === d.doorKinds.automatic && distance(d.player, { x: candidate.centerX, z: candidate.centerZ }) > 12) { door = candidate; break; }
    }
    d.simulate(1);
    result.doorShutWithNobodyThere = door.openFraction;
    other.x = door.centerX; other.z = door.centerZ;
    d.players.push(other);
    d.simulate(1.5);
    result.doorOpenForOther = door.openFraction;
    d.players.length = 1;
    d.simulate(4);
    result.doorShutAfterOtherLeft = door.openFraction;

    // ---- The Hollow hears the other player, though you are far away and silent, and it does not kill you for it. ----
    fresh();
    const far = d.findWalkableSpotNear(door.centerX, door.centerZ + 1.2) || d.findWalkableSpotNear(door.centerX + 1.2, door.centerZ);
    standAt(other, far.x, far.z);
    other.velocityX = 1.5; other.velocityZ = 0; other.audibleRadius = 6;
    d.players.push(other);
    d.spawnHollow(other.x, other.z);
    d.hollow.graceTimer = 0;
    d.simulate(0.1);
    result.hollowHuntsOther = { state: d.hollow.state, aimedAtOther: Math.hypot(d.hollow.lastKnownPlayerX - other.x, d.hollow.lastKnownPlayerZ - other.z) < 0.01,
      tookTheirSpeed: d.hollow.lastKnownVelocityX === 1.5 };
    d.simulate(1);
    result.youLiveWhenOtherIsCaught = d.game.mode;

    // ---- The director measures from whoever is nearer: a spot beside the other player is no steps away. ----
    result.stepsBesideOther = d.stepsFromPlayerTo(other.x, other.z);
    d.players.length = 1;
    result.stepsBesideOtherWhenAlone = d.stepsFromPlayerTo(other.x, other.z);

    // ---- The Stills, woken, walk at the other player, who is in their rooms and not looking. You are not there. ----
    fresh();
    d.awakenStills();
    const still = d.stills.filter((candidate) => candidate.isPresent)[0];
    standAt(other, still.figure.x + 3, still.figure.z);
    other.velocityX = 0; other.audibleRadius = 0;
    d.simulate(12);
    result.stillStaysWithNobodyThere = distance(still.figure, { x: still.homeX, z: still.homeZ });
    const before = distance(still.figure, other);
    d.players.push(other);
    for (const each of d.stills) each.figure.lastScannedTime = -999;
    d.simulate(12);
    result.stillWalksAtOther = { before: before, after: distance(still.figure, other) };
    d.simulate(20);
    result.youLiveWhenStillReachesOther = d.game.mode;

    d.players.length = 1;
    return result;
  });

  check('on your own, the list of players is you and nobody else', result.aloneCount === 1 && result.aloneIsYou, result.aloneCount);
  check('a door far from everyone is shut', result.doorShutWithNobodyThere === 0, result.doorShutWithNobodyThere);
  check('it opens for the other player', result.doorOpenForOther === 1, result.doorOpenForOther);
  check('and shuts once they are gone', result.doorShutAfterOtherLeft === 0, result.doorShutAfterOtherLeft);
  check('the Hollow hears the other player and hunts them, leading with their speed',
    result.hollowHuntsOther.state === 2 && result.hollowHuntsOther.aimedAtOther && result.hollowHuntsOther.tookTheirSpeed, result.hollowHuntsOther);
  check('the Hollow catching somebody else is not your death', result.youLiveWhenOtherIsCaught === 'playing', result.youLiveWhenOtherIsCaught);
  check('walking distance is measured from whoever is nearest', result.stepsBesideOther === 0 && result.stepsBesideOtherWhenAlone > 10,
    [result.stepsBesideOther, result.stepsBesideOtherWhenAlone]);
  check('the Stills do not stir while nobody is in their rooms', result.stillStaysWithNobodyThere < 0.01, result.stillStaysWithNobodyThere);
  check('they walk at the other player', result.stillWalksAtOther.after < result.stillWalksAtOther.before - 1, result.stillWalksAtOther);
  check('a Still reaching somebody else is not your death', result.youLiveWhenStillReachesOther === 'playing', result.youLiveWhenStillReachesOther);
  check('no script errors were reported', problems.length === 0, problems);
  await browser.close();

  if (failures.length > 0) {
    console.error('\n' + failures.length + ' check(s) failed.');
    process.exit(1);
  }
  console.log('\nAll checks passed.');
})().catch((error) => { console.error('Players test crashed:', error); process.exit(1); });
