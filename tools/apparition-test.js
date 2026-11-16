// Checks the apparitions: that each kind is only ever put somewhere its rules allow, that each kind behaves
// as described once it is out, and that the part that decides when they come keeps to its limits.
// Where and when they appear is left to chance in the game, so nothing here trusts one lucky try:
// the placing rules are checked on hundreds of standing places, with a fixed sequence of "random" numbers
// for where the player stands.
const { openGame, startGame } = require('./browser-harness.js');

const failures = [];
function check(description, condition, detail) {
  const line = (condition ? 'ok    ' : 'FAIL  ') + description + (detail !== undefined ? '  ' + JSON.stringify(detail) : '');
  console.log(line);
  if (!condition) failures.push(description);
}

// Helpers that run inside the page. They are handed over as text and kept on `window.lab`.
const labSource = String(function () {
  const d = window.lastReturnDebug;
  let seed = 20261115;
  const lab = {};
  // The game throws its own dice (which kind, which of several good places). For the length of this test those
  // dice are a fixed sequence too, which keeps one run close to the next. Not identical: the page goes on drawing
  // frames in between and uses a few numbers for that, so no check here depends on one particular throw.
  let gameSeed = 7654321;
  Math.random = function () { gameSeed = (gameSeed * 1664525 + 1013904223) >>> 0; return gameSeed / 4294967296; };
  // A fixed sequence of numbers between 0 and 1, so that every run of the test stands the player in the same places.
  lab.random = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // Stands the player somewhere ordinary: on floor, not in a vent, not in the lift, not on the stairs.
  lab.standSomewhere = function () {
    const level = d.level;
    for (let attempt = 0; attempt < 200; attempt++) {
      const spot = d.findWalkableSpotNear(
        level.boundsMinimumX + lab.random() * (level.boundsMaximumX - level.boundsMinimumX),
        level.boundsMinimumZ + lab.random() * (level.boundsMaximumZ - level.boundsMinimumZ));
      if (!spot || d.isVentAt(spot.x, spot.z)) continue;
      if (/LIFT CAR|STAIRS|SHAFT/.test(d.zoneNames[d.getZoneAt(spot.x, spot.z)])) continue;
      d.teleport(spot.x, spot.z, lab.random() * Math.PI * 2);
      d.player.pitch = 0; d.player.velocityX = 0; d.player.velocityZ = 0;
      d.setScanHeld(false);
      d.simulate(0.07); // two steps: the floor under the player is worked out, and the scanner settles
      return spot;
    }
    return null;
  };
  // Stands the player in one place after another until an apparition of the kind can be put out. Returns it, or null.
  lab.summonSomewhere = function (kind, mostAttempts) {
    for (let attempt = 0; attempt < (mostAttempts || 300); attempt++) {
      if (!lab.standSomewhere()) continue;
      const phantom = d.summonPhantom(kind);
      if (phantom) return phantom;
    }
    return null;
  };
  lab.distanceTo = function (x, z) { return Math.hypot(x - d.player.x, z - d.player.z); };
  // Turns the player to look straight at a point `height` above the floor at (x, z).
  lab.aimAt = function (x, z, height) {
    const eyeY = d.player.floorY + d.player.eyeHeight;
    d.player.yaw = Math.atan2(x - d.player.x, -(z - d.player.z));
    d.player.pitch = Math.atan2(d.getFloorHeightAt(x, z) + height - eyeY, lab.distanceTo(x, z));
  };
  lab.scanFor = function (seconds) { d.setScanHeld(true); d.simulate(seconds); d.setScanHeld(false); };
  // Scans an apparition for a second and a half, and for longer (up to four seconds) if by then too few pulses
  // have landed on it for the game to count it as seen. A dummy twelve metres off is a small thing in the
  // beam: about one time in four hundred, a second and a half left it with 32 to 40 points where the game
  // wants more than 40, and it then stood there for good. Measured on 420 dummies; the game is right, the
  // test was impatient.
  lab.scanUntilSeen = function (phantom) {
    d.setScanHeld(true);
    d.simulate(1.5);
    for (let extra = 0; extra < 5 && phantom.figure.totalHits <= 60; extra++) d.simulate(0.5);
    d.setScanHeld(false);
  };
  lab.isOut = function (phantom) { return d.phantomDirector.current === phantom && d.phantoms.indexOf(phantom) >= 0 && phantom.state !== 2; };
  // Runs the game until the apparition has gone, or the time is up. Returns how long it took (seconds), or -1.
  lab.waitUntilGone = function (phantom, mostSeconds) {
    for (let elapsed = 0; elapsed <= mostSeconds; elapsed += 0.1) {
      if (!lab.isOut(phantom)) return Math.round(elapsed * 10) / 10;
      d.simulate(0.1);
    }
    return lab.isOut(phantom) ? -1 : mostSeconds;
  };
  lab.freshStation = function (kind, seed, size, layout, levels) {
    d.loadStation(kind, seed, size, layout, levels);
    d.game.flags.hasLeftLift = true;
    d.setDebugOption('unlimitedScanner', true);
    d.setDebugOption('invulnerable', true);
    d.setScannerSpread(24);
  };
  window.lab = lab;
});

(async () => {
  const { browser, page, problems } = await openGame({ dev: true }); // the debug switches hold the creatures still and keep the scanner cool
  const inGame = (callback, argument) => page.evaluate(callback, argument);
  await startGame(page, false);
  await inGame((source) => (0, eval)('(' + source + ')')(), labSource);

  // --- where they are put: every kind, from hundreds of standing places, in three stations ---
  const placing = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, tuning = d.tuning;
    const ranges = {
      watcher: [tuning.phantomWatcherNearestMetres, tuning.phantomWatcherFarthestMetres],
      behind: [tuning.phantomBehindNearestMetres, tuning.phantomBehindFarthestMetres],
      dummy: [tuning.phantomDummyNearestMetres, tuning.phantomDummyFarthestMetres],
      crosser: [tuning.phantomCrosserNearestMetres, tuning.phantomCrosserFarthestMetres],
      crawler: [tuning.phantomCrawlerNearestMetres, tuning.phantomCrawlerFarthestMetres]
    };
    const placed = {}, broken = [];
    // The five kinds the phantom director chooses from. (The one in your face has its own checks further down.)
    const kinds = d.phantomKindKeys.filter((kind) => kind !== 'face');
    for (const kind of kinds) placed[kind] = 0;
    const stations = [['classic', 0, 'medium', 'mixed', 'one'], ['generated', 1, 'medium', 'mixed', 'two'], ['generated', 2, 'large', 'sprawling', 'one']];
    for (const station of stations) {
      lab.freshStation.apply(null, station);
      for (let attempt = 0; attempt < 720; attempt++) {
        if (!lab.standSomewhere()) continue;
        // Vents are few, so in the stations that have them the crawler gets more tries than the others.
        const turns = station[0] === 'classic' ? kinds : kinds.concat(['crawler', 'crawler', 'crawler', 'crawler']);
        const kind = turns[attempt % turns.length];
        // Half the time the scanner is on, with a narrow beam or a wide one: the rules are stricter then.
        const isScanning = lab.random() < 0.5;
        d.setScannerSpread(isScanning && lab.random() < 0.5 ? 6 : 24);
        d.player.scannerActivity = isScanning ? 1 : 0;
        const phantom = d.summonPhantom(kind);
        if (!phantom) continue;
        placed[kind]++;
        const figure = phantom.figure, where = station[0] + ' ' + station[1] + ' try ' + attempt + ' ' + kind;
        const complain = function (what) { broken.push(where + ': ' + what); };
        const tileX = Math.floor(figure.x), tileZ = Math.floor(figure.z);
        const scannedHalfAngle = d.getScannedHalfAngle(), angle = d.getAngleFromPlayerView(figure.x, figure.z);
        const floor = d.getFloorHeightAt(figure.x, figure.z);
        const lookX = kind === 'crosser' ? phantom.watchX : figure.x, lookZ = kind === 'crosser' ? phantom.watchZ : figure.z;
        const distance = lab.distanceTo(lookX, lookZ);
        if (distance < ranges[kind][0] - 0.01 || distance > ranges[kind][1] + 0.01) complain('it is ' + distance.toFixed(1) + ' m away, outside ' + ranges[kind].join(' to '));
        if (d.zoneNames[d.getZoneAt(figure.x, figure.z)] === 'LIFT CAR') complain('it is in the lift car');
        if (Math.abs(floor - d.player.floorY) > 0.5) complain('it is on another level');
        if (kind === 'crawler') {
          if (!d.isVentAt(figure.x, figure.z)) complain('it is not in a vent');
          if (figure.pose.crawl !== 1) complain('it is not on its knees and hands');
          if (!d.canPlayerSeePoint(figure.x, floor + 0.45, figure.z)) complain('the player cannot see it');
        } else {
          if (!d.canPhantomStandOnTile(tileX, tileZ)) complain('it is not standing on good floor');
          if (!d.canPlayerSeePoint(lookX, d.getFloorHeightAt(lookX, lookZ) + 1.3, lookZ)) complain('the player cannot see it');
        }
        if (kind === 'watcher' || kind === 'dummy' || kind === 'crawler') {
          if (angle < scannedHalfAngle - 0.0001) complain('it was put inside the beam');
        }
        if (kind === 'behind' && angle < 2.1) complain('it is not behind the player (angle ' + angle.toFixed(2) + ')');
        if (kind === 'watcher' || kind === 'behind' || kind === 'dummy') {
          const facing = Math.atan2(d.player.x - figure.x, -(d.player.z - figure.z));
          if (Math.abs(Math.atan2(Math.sin(facing - figure.yaw), Math.cos(facing - figure.yaw))) > 0.01) complain('it does not face the player');
          if (phantom.state !== 1) complain('it is not there to be scanned');
        }
        if (kind === 'dummy' && d.level.stillZones.indexOf(d.getZoneAt(figure.x, figure.z)) >= 0) complain('it is where the real dummies are');
        if (kind === 'crosser') {
          if (phantom.state !== 0) complain('it is walking before the player has scanned its way');
          const startSeen = d.canPlayerSeePoint(figure.x, floor + 1.3, figure.z);
          if (startSeen && angle < scannedHalfAngle - 0.0001) complain('it would step out of nothing inside the beam');
          const length = Math.hypot(phantom.endX - figure.x, phantom.endZ - figure.z);
          if (length < 2.99) complain('its crossing is only ' + length.toFixed(1) + ' m long');
          let closest = Infinity;
          for (let along = 0; along <= length + 0.01; along += 0.5) {
            const x = figure.x + (phantom.endX - figure.x) * along / length, z = figure.z + (phantom.endZ - figure.z) * along / length;
            if (!d.canPhantomStandOnTile(Math.floor(x), Math.floor(z))) complain('its way goes over bad floor');
            closest = Math.min(closest, lab.distanceTo(x, z));
          }
          if (closest < 6) complain('its way comes within ' + closest.toFixed(1) + ' m of the player');
        }
      }
    }
    d.setScannerSpread(24);
    return { placed: placed, broken: broken.slice(0, 6), brokenCount: broken.length };
  });
  check('every apparition was put where the rules of its kind allow (range, in sight, never inside the beam, good floor)',
    placing.brokenCount === 0, placing.broken);
  check('each kind found a place often enough for that to mean something',
    placing.placed.watcher >= 40 && placing.placed.behind >= 40 && placing.placed.dummy >= 40 && placing.placed.crosser >= 15 && placing.placed.crawler >= 12, placing.placed);

  // --- the watcher: gone after a proper look, gone if approached, withdrawn and not counted if never seen ---
  const watcher = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, director = d.phantomDirector, tuning = d.tuning, result = {};
    lab.freshStation('classic', 0);
    // scanned
    let phantom = lab.summonSomewhere('watcher');
    const usedBefore = director.used;
    lab.aimAt(phantom.figure.x, phantom.figure.z, 1.3);
    d.simulate(0.2);
    result.thereBeforeScan = lab.isOut(phantom);
    d.setScanHeld(true);
    result.secondsScanned = lab.waitUntilGone(phantom, 6);
    d.setScanHeld(false);
    result.countedWhenSeen = director.used - usedBefore;
    result.waitAfterSeen = director.timer;
    // approached, never scanned
    phantom = lab.summonSomewhere('watcher');
    const usedBeforeApproach = director.used;
    const near = d.findWalkableSpotNear(phantom.figure.x + 2, phantom.figure.z + 2);
    d.teleport(near.x, near.z, 0);
    result.distanceWhenApproached = Math.round(lab.distanceTo(phantom.figure.x, phantom.figure.z) * 10) / 10;
    d.simulate(0.1);
    result.goneWhenApproached = !lab.isOut(phantom);
    result.countedWhenApproachedUnseen = director.used - usedBeforeApproach;
    // never looked at
    phantom = lab.summonSomewhere('watcher');
    const usedBeforeUnseen = director.used;
    d.player.yaw += Math.PI;
    result.secondsUnseen = lab.waitUntilGone(phantom, tuning.phantomUnseenSeconds + 5);
    result.countedWhenUnseen = director.used - usedBeforeUnseen;
    result.waitAfterUnseen = director.timer;
    result.limits = [tuning.phantomGapShortestSeconds, tuning.phantomGapLongestSeconds, tuning.phantomRetryShortestSeconds, tuning.phantomRetryLongestSeconds, tuning.phantomUnseenSeconds];
    return result;
  });
  check('a watcher is there until you have had a proper look, then it is gone and counts as one seen',
    watcher.thereBeforeScan && watcher.secondsScanned >= 1.4 && watcher.secondsScanned <= 4 && watcher.countedWhenSeen === 1, watcher);
  check('after one you saw, the next is a long wait away',
    watcher.waitAfterSeen >= watcher.limits[0] && watcher.waitAfterSeen <= watcher.limits[1], [watcher.waitAfterSeen, watcher.limits]);
  check('walk up to a watcher and it is gone', watcher.distanceWhenApproached < 5.5 && watcher.goneWhenApproached, watcher);
  check('one you never scanned is withdrawn, does not count, and the next comes sooner',
    Math.abs(watcher.secondsUnseen - watcher.limits[4]) < 1 && watcher.countedWhenUnseen === 0 && watcher.countedWhenApproachedUnseen === 0 &&
    watcher.waitAfterUnseen >= watcher.limits[2] && watcher.waitAfterUnseen <= watcher.limits[3], watcher);

  // --- behind you ---
  const behind = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, director = d.phantomDirector, result = {};
    lab.freshStation('classic', 0);
    let phantom = lab.summonSomewhere('behind');
    result.angleWhenPut = Math.round(d.getAngleFromPlayerView(phantom.figure.x, phantom.figure.z) * 100) / 100;
    result.secondsIfNeverTurned = lab.waitUntilGone(phantom, d.tuning.phantomBehindSeconds + 5);
    result.usedIfNeverTurned = director.used;
    phantom = lab.summonSomewhere('behind');
    lab.aimAt(phantom.figure.x, phantom.figure.z, 1.3);
    d.setScanHeld(true);
    result.secondsOnceTurned = lab.waitUntilGone(phantom, 4);
    d.setScanHeld(false);
    result.usedOnceTurned = director.used;
    result.limit = d.tuning.phantomBehindSeconds;
    return result;
  });
  check('the one behind you is really behind you, and goes by itself if you never turn round',
    behind.angleWhenPut > 2.1 && Math.abs(behind.secondsIfNeverTurned - behind.limit) < 1 && behind.usedIfNeverTurned === 0, behind);
  check('turn and scan it, and it is gone within a second', behind.secondsOnceTurned > 0.3 && behind.secondsOnceTurned <= 1.2 && behind.usedOnceTurned === 1, behind);

  // --- the dummy: closer after you look away, gone after you look away again ---
  const dummy = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, director = d.phantomDirector, trials = [];
    lab.freshStation('classic', 0);
    for (let trial = 0; trial < 6; trial++) {
      const phantom = lab.summonSomewhere('dummy');
      if (!phantom) { trials.push({ none: true }); continue; }
      const record = { firstDistance: lab.distanceTo(phantom.figure.x, phantom.figure.z), usedBefore: director.used };
      lab.aimAt(phantom.figure.x, phantom.figure.z, 1.2);
      lab.scanUntilSeen(phantom);
      record.pointsOnIt = phantom.figure.totalHits;
      record.stillThereWhileWatched = lab.isOut(phantom) && phantom.stage === 0;
      d.simulate(d.tuning.phantomDummyLookAwaySeconds + 0.3);
      record.stage = phantom.stage;
      record.movedCloser = lab.isOut(phantom) && phantom.stage === 1;
      if (record.movedCloser) {
        record.secondDistance = lab.distanceTo(phantom.figure.x, phantom.figure.z);
        record.canBeSeenThere = d.canPlayerSeePoint(phantom.figure.x, d.getFloorHeightAt(phantom.figure.x, phantom.figure.z) + 1.3, phantom.figure.z);
        lab.aimAt(phantom.figure.x, phantom.figure.z, 1.2);
        lab.scanUntilSeen(phantom);
        record.thereWhileWatchedAgain = lab.isOut(phantom);
        d.simulate(d.tuning.phantomDummyLookAwaySeconds + 0.3);
      }
      record.goneAtTheEnd = !lab.isOut(phantom);
      record.counted = director.used - record.usedBefore;
      trials.push(record);
    }
    return trials;
  });
  const dummyMoved = dummy.filter((trial) => trial.movedCloser);
  check('a dummy stays put while you scan it, and when you look away it is closer (never closer than 3.2 m), where you can see it',
    dummyMoved.length >= 3 && dummy.every((trial) => trial.none || trial.stillThereWhileWatched) &&
    dummyMoved.every((trial) => trial.secondDistance < trial.firstDistance && trial.secondDistance >= 3.19 && trial.canBeSeenThere && trial.thereWhileWatchedAgain), dummy);
  check('look away a second time and the dummy is gone, counted once',
    dummy.every((trial) => trial.none || (trial.goneAtTheEnd && trial.counted === 1)), dummy.map((trial) => [trial.stage, trial.goneAtTheEnd, trial.counted]));

  // --- the crosser: waits unseen, walks across once you scan that way, and is gone at the far side ---
  const crosser = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    lab.freshStation('classic', 0);
    const phantom = lab.summonSomewhere('crosser', 900);
    if (!phantom) return { none: true };
    const figure = phantom.figure, start = [figure.x, figure.z];
    const length = Math.hypot(phantom.endX - figure.x, phantom.endZ - figure.z);
    // Not scanning: it waits where it is and cannot be found.
    lab.aimAt(phantom.watchX, phantom.watchZ, 1.3);
    d.simulate(2);
    result.waited = phantom.state === 0 && figure.x === start[0] && figure.z === start[1];
    d.setScanHeld(true);
    let seconds = 0, closest = Infinity, wentBackwards = false, lastRemaining = length;
    let last = [figure.x, figure.z];
    while (lab.isOut(phantom) && seconds < 30) {
      d.simulate(0.1); seconds += 0.1;
      if (!lab.isOut(phantom)) break;
      const remaining = Math.hypot(phantom.endX - figure.x, phantom.endZ - figure.z);
      if (remaining > lastRemaining + 0.001) wentBackwards = true;
      lastRemaining = remaining;
      closest = Math.min(closest, lab.distanceTo(figure.x, figure.z));
      last = [figure.x, figure.z];
    }
    d.setScanHeld(false);
    result.length = Math.round(length * 10) / 10;
    result.seconds = Math.round(seconds * 10) / 10;
    result.expectedSeconds = Math.round(length / d.tuning.phantomCrosserSpeed * 10) / 10;
    result.endedMetresFromFarSide = Math.round(Math.hypot(phantom.endX - last[0], phantom.endZ - last[1]) * 10) / 10;
    result.closestToPlayer = Math.round(closest * 10) / 10;
    result.wentBackwards = wentBackwards;
    result.pointsOnIt = figure.totalHits;
    result.gone = !lab.isOut(phantom);
    return result;
  });
  check('a crosser waits unseen until you scan its way, walks straight across at its speed, and is gone at the far side',
    !crosser.none && crosser.waited && crosser.gone && !crosser.wentBackwards && Math.abs(crosser.seconds - crosser.expectedSeconds) < 0.6 &&
    crosser.endedMetresFromFarSide < 0.5, crosser);
  check('the crosser never comes near you, and the scanner did catch it on its way', crosser.closestToPlayer >= 6 && crosser.pointsOnIt > 25, crosser);

  // --- the crawler: in a vent mouth, low enough to be in one, gone after a proper look ---
  const crawler = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    lab.freshStation('generated', 1, 'medium', 'mixed', 'two');
    result.ventMouths = d.phantomVentMouths.length;
    const phantom = lab.summonSomewhere('crawler', 900);
    if (!phantom) return Object.assign(result, { none: true });
    const figure = phantom.figure;
    let top = 0;
    for (let capsule = 0; capsule < figure.capsuleCount; capsule++) top = Math.max(top, figure.capsules[capsule * 7 + 1] + figure.capsules[capsule * 7 + 6], figure.capsules[capsule * 7 + 4] + figure.capsules[capsule * 7 + 6]);
    result.heightAboveFloor = Math.round((top - d.getFloorHeightAt(figure.x, figure.z)) * 100) / 100;
    result.ventHeight = d.ventHeight;
    result.inVent = d.isVentAt(figure.x, figure.z);
    lab.aimAt(figure.x, figure.z, 0.45);
    d.setScannerSpread(10); // it is small and low: a narrow beam, as you would use
    d.setScanHeld(true);
    result.secondsScanned = lab.waitUntilGone(phantom, 6);
    d.setScannerSpread(24);
    d.setScanHeld(false);
    result.used = d.phantomDirector.used;
    lab.freshStation('classic', 0);
    result.ventMouthsInKessel = d.phantomVentMouths.length;
    result.inKessel = lab.summonSomewhere('crawler', 60) !== null;
    return result;
  });
  check('a crawler is in the mouth of a vent, on its knees and hands and low enough to fit, and goes after a proper look',
    !crawler.none && crawler.inVent && crawler.heightAboveFloor < crawler.ventHeight && crawler.secondsScanned >= 1.1 && crawler.secondsScanned <= 4 && crawler.used === 1, crawler);
  check('Kessel-9 has no vents, so no crawler ever turns up there', crawler.ventMouthsInKessel === 0 && crawler.inKessel === false, crawler);

  // --- the phantom director, over a long quiet walk: not too soon, not too often, never two, never the same twice, never over the limit ---
  const walk = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, director = d.phantomDirector, tuning = d.tuning;
    // Shorter waits, so that a whole descent's worth fits into a few minutes of game time.
    const kept = {};
    const quick = { phantomFirstAfterSeconds: 12, phantomGapShortestSeconds: 15, phantomGapLongestSeconds: 25, phantomRetryShortestSeconds: 4, phantomRetryLongestSeconds: 8 };
    const quickNote = 'and the dice for the one in your face are put away for this part: it has checks of its own below';
    quick.phantomFaceChancePerScan = 0;
    for (const key in quick) { kept[key] = tuning[key]; tuning[key] = quick[key]; }
    const runs = [];
    for (const station of [['classic', 0], ['generated', 2, 'large', 'sprawling', 'one']]) {
      lab.freshStation.apply(null, station);
      const run = { station: station.slice(0, 2).join(' '), budget: director.budget, events: [], mostAtOnce: 0, lateEvents: 0 };
      let time = 0, current = null, event = null, sinceMove = 99, timeFull = -1;
      // Time is read off the game's own clock. Counting a quarter second for every step below would run slow:
      // the game moves on in thirtieths of a second, so a step of "0.25" is really eight of those, 0.267 s.
      // An apparition that came at the first moment it was allowed would then seem to have come too early.
      const clockAtStart = d.game.time;
      while (time < 1500 && (timeFull < 0 || time < timeFull + 90)) {
        if (!director.current && sinceMove > 3) { lab.standSomewhere(); sinceMove = 0; }
        d.simulate(0.25); sinceMove += d.game.time - clockAtStart - time; time = d.game.time - clockAtStart;
        run.mostAtOnce = Math.max(run.mostAtOnce, d.phantoms.filter((phantom) => phantom.isChance && phantom.state !== 2).length);
        if (director.current !== current) {
          if (event) { event.ended = time; event.seen = event.phantom.wasEverSeen; delete event.phantom; }
          current = director.current; event = null;
          if (current) {
            event = { kind: current.kind, began: time, phantom: current };
            run.events.push(event);
            if (timeFull >= 0) run.lateEvents++;
          }
        }
        // Whenever one is out, look at it and scan, a second and a half on and a second off, so that it gets seen.
        if (current) {
          const lookX = current.kind === 'crosser' ? current.watchX : current.figure.x, lookZ = current.kind === 'crosser' ? current.watchZ : current.figure.z;
          lab.aimAt(lookX, lookZ, current.kind === 'crawler' ? 0.45 : 1.2);
          d.setScannerSpread(current.kind === 'crawler' ? 10 : 24);
          d.setScanHeld((time - event.began) % 2.5 < 1.5);
        } else d.setScanHeld(false);
        if (timeFull < 0 && director.used >= director.budget) timeFull = time;
      }
      d.setScanHeld(false);
      run.seen = director.used;
      run.minutes = Math.round(time / 6) / 10;
      run.reasonAtTheEnd = d.getPhantomHoldReason();
      run.mode = d.game.mode;
      runs.push(run);
    }
    for (const key in kept) tuning[key] = kept[key];
    return { runs: runs, quick: quick };
  });
  for (const run of walk.runs) {
    const events = run.events;
    const tooSoon = [], sameTwice = [];
    for (let index = 1; index < events.length; index++) {
      const wait = events[index].began - events[index - 1].ended;
      const least = events[index - 1].seen ? walk.quick.phantomGapShortestSeconds : walk.quick.phantomRetryShortestSeconds;
      if (wait < least - 0.3) tooSoon.push([events[index - 1].kind, events[index - 1].seen, Math.round(wait * 10) / 10]);
      if (events[index].kind === events[index - 1].kind) sameTwice.push(events[index].kind);
    }
    const kinds = Array.from(new Set(events.map((event) => event.kind)));
    const summary = { budget: run.budget, seen: run.seen, came: events.length, kinds: kinds, minutes: run.minutes, first: events.length ? events[0].began : null };
    check(run.station + ': a quiet walk gets its apparitions, of several kinds, and no more than the descent is allowed',
      run.seen === run.budget && kinds.length >= (run.budget > 4 ? 4 : 3) && run.lateEvents === 0 && /all of its apparitions/.test(run.reasonAtTheEnd), Object.assign(summary, { lateEvents: run.lateEvents, reason: run.reasonAtTheEnd }));
    check(run.station + ': none before the first is due, never two at once, never the same kind twice running, never too soon after the last',
      events.length > 0 && events[0].began >= walk.quick.phantomFirstAfterSeconds && run.mostAtOnce === 1 && sameTwice.length === 0 && tooSoon.length === 0,
      { first: summary.first, mostAtOnce: run.mostAtOnce, sameTwice: sameTwice, tooSoon: tooSoon });
    check(run.station + ': nothing an apparition does can hurt you', run.mode === 'playing', run.mode);
  }

  // --- they keep out of the way of what is real ---
  const real = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, director = d.phantomDirector, tuning = d.tuning, result = {};
    const keptFirst = tuning.phantomFirstAfterSeconds;
    tuning.phantomFirstAfterSeconds = 0;
    lab.freshStation('classic', 0);
    d.setDebugOption('freezeCreatures', true); // the Hollow stays in whatever state the test puts it
    const stand = function () { lab.standSomewhere(); return d.player; };
    // The Hollow hunting: nothing comes, for two minutes of standing in good places.
    stand();
    d.spawnHollow(d.player.x + 3, d.player.z);
    d.hollow.state = 2;
    result.reasonWhileHunted = d.getPhantomHoldReason();
    let came = 0;
    for (let time = 0; time < 120; time += 0.5) { if (time % 5 === 0) stand(); d.hollow.state = 2; d.simulate(0.5); if (director.current) came++; }
    result.cameWhileHunted = came;
    // Roaming but close (the director's menace is high): still nothing.
    d.hollow.state = 0; d.director.menace = 0.9;
    came = 0;
    for (let time = 0; time < 60; time += 0.5) { if (time % 5 === 0) stand(); d.director.menace = 0.9; d.simulate(0.5); if (director.current) came++; }
    result.cameWhileClose = came;
    // Roaming and far: they come again, but not at once.
    d.director.menace = 0;
    result.waitOnceItIsQuiet = director.timer;
    came = 0;
    for (let time = 0; time < 120 && came === 0; time += 0.5) { if (time % 5 === 0) stand(); d.director.menace = 0; d.simulate(0.5); if (director.current) came++; }
    result.cameWhenQuietAgain = came;
    // One is out, and the hunt starts: it goes at once and does not count.
    const phantom = lab.summonSomewhere('watcher');
    const usedBefore = director.used;
    d.hollow.state = 2;
    d.simulate(0.1);
    result.goneWhenTheHuntStarted = !lab.isOut(phantom);
    result.countedThen = director.used - usedBefore;
    // In a vent, and before leaving the lift, and once the lift is called.
    d.hollow.isActive = false; d.hollow.state = 0;
    d.game.flags.hasLeftLift = false;
    result.reasonInTheLift = d.getPhantomHoldReason();
    d.game.flags.hasLeftLift = true; d.game.flags.uploadStarted = true;
    result.reasonAtTheEnd = d.getPhantomHoldReason();
    d.game.flags.uploadStarted = false;
    d.setDebugOption('freezeCreatures', false);
    tuning.phantomFirstAfterSeconds = keptFirst;
    return result;
  });
  check('while the Hollow hunts, or roams close by, no apparition comes',
    real.cameWhileHunted === 0 && real.cameWhileClose === 0 && /something real/.test(real.reasonWhileHunted), real);
  check('once it is quiet again they come back, after a pause', real.waitOnceItIsQuiet >= 15 && real.cameWhenQuietAgain > 0, real);
  check('one that is out goes the moment a hunt starts, and does not count', real.goneWhenTheHuntStarted && real.countedThen === 0, real);
  check('none in the lift on the way down, none once the lift has been called', /not left the lift/.test(real.reasonInTheLift) && /lift has been called/.test(real.reasonAtTheEnd), real);

  // --- in your face: its own dice at the start of a scan, its own limit, and never while something real is near ---
  const face = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, director = d.phantomDirector, tuning = d.tuning, result = {};
    const kept = { chance: tuning.phantomFaceChancePerScan, notBefore: tuning.phantomFaceNotBeforeSeconds };
    lab.freshStation('classic', 0);
    result.metresWanted = tuning.phantomFaceMetres;
    result.chanceAsShipped = kept.chance; result.mostAsShipped = tuning.phantomFaceMostPerDescent; result.notBeforeAsShipped = kept.notBefore;
    director.timer = 9999; // the phantom director itself puts nothing out during this part
    // Starts a scan in one standing place after another. Returns the apparition that came, or null.
    const startScans = function (count) {
      for (let attempt = 0; attempt < count; attempt++) {
        if (!lab.standSomewhere()) continue;
        d.setScanHeld(true);
        d.simulate(0.07);
        if (director.current) return director.current;
        d.setScanHeld(false);
      }
      d.setScanHeld(false);
      return null;
    };
    // As shipped, a descent that has only just begun never has one, whatever the dice say.
    tuning.phantomFaceChancePerScan = 1;
    result.cameInTheFirstMinutes = startScans(40) !== null;
    // Dice that always come up: the first scan with room in front of you brings it.
    tuning.phantomFaceNotBeforeSeconds = 0;
    const usedBefore = director.used;
    const phantom = startScans(200);
    if (phantom) {
      result.kind = phantom.kind;
      result.metresAway = Math.round(lab.distanceTo(phantom.figure.x, phantom.figure.z) * 100) / 100;
      result.angleOffCentre = Math.round(d.getAngleFromPlayerView(phantom.figure.x, phantom.figure.z) * 100) / 100;
      result.goodFloor = d.canPhantomStandOnTile(Math.floor(phantom.figure.x), Math.floor(phantom.figure.z)) || !d.isVentAt(phantom.figure.x, phantom.figure.z);
      result.secondsUntilGone = lab.waitUntilGone(phantom, 5);
      result.pointsOnIt = phantom.figure.totalHits;
      d.setScanHeld(false);
    }
    result.countedAgainstTheOthers = director.used - usedBefore;
    result.faceUsed = director.faceUsed;
    // The limit: no second one in this descent, however often a scan starts.
    director.lastEndTime = -999;
    result.cameAgainOverTheLimit = startScans(60) !== null;
    // Chance 0 switches it off.
    director.faceUsed = 0; tuning.phantomFaceChancePerScan = 0;
    result.cameWithChanceZero = startScans(60) !== null;
    // Never while the Hollow hunts.
    tuning.phantomFaceChancePerScan = 1;
    d.setDebugOption('freezeCreatures', true);
    lab.standSomewhere();
    d.spawnHollow(d.player.x + 3, d.player.z);
    let cameWhileHunted = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      lab.standSomewhere(); d.hollow.state = 2;
      d.setScanHeld(true); d.simulate(0.07);
      if (director.current) cameWhileHunted = true;
      d.setScanHeld(false);
    }
    result.cameWhileHunted = cameWhileHunted;
    d.hollow.isActive = false; d.hollow.state = 0;
    d.setDebugOption('freezeCreatures', false);
    tuning.phantomFaceChancePerScan = kept.chance; tuning.phantomFaceNotBeforeSeconds = kept.notBefore;
    return result;
  });
  check('in your face: it stands dead ahead, as close as its setting says, when a scan starts, and is gone about a second later',
    face.kind === 'face' && Math.abs(face.metresAway - face.metresWanted) < 0.05 && face.angleOffCentre < 0.05 && face.pointsOnIt > 25 &&
    face.secondsUntilGone >= 0.6 && face.secondsUntilGone <= 1.4, face);
  check('in your face: one in a hundred scans as shipped, at most one a descent, none in the first two minutes, and it has its own count',
    face.chanceAsShipped === 0.01 && face.mostAsShipped === 1 && face.notBeforeAsShipped === 120 && !face.cameInTheFirstMinutes &&
    face.faceUsed === 1 && face.countedAgainstTheOthers === 0 && !face.cameAgainOverTheLimit, face);
  check('in your face: chance 0 switches it off, and it never comes while the Hollow hunts', !face.cameWithChanceZero && !face.cameWhileHunted, face);

  // --- the cold room's placed one: it used to need you seven metres off, which that room only allows from the far corner ---
  const coldRoom = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    lab.freshStation('classic', 0);
    d.phantomDirector.budget = 0;
    const cold = d.phantoms.filter((phantom) => phantom.kind === 'placed' && d.zoneNames[phantom.definition.triggerZone] === 'COLD ROOM')[0];
    // In the doorway (the door is in the south wall, a little way along from the corner it stands in).
    d.teleport(13.5, 24.5, 0);
    d.simulate(0.1);
    result.metresAtTheDoor = Math.round(lab.distanceTo(cold.figure.x, cold.figure.z) * 10) / 10;
    result.shownAtTheDoor = cold.state === 1;
    // Two steps into the room, looking at the far wall: it is now in the corner behind you.
    d.teleport(13.5, 22.3, 0);
    d.simulate(0.1);
    result.metresTwoStepsIn = Math.round(lab.distanceTo(cold.figure.x, cold.figure.z) * 10) / 10;
    result.shownTwoStepsIn = cold.state === 1;
    result.canBeSeen = d.canPlayerSeePoint(cold.figure.x, 1.3, cold.figure.z);
    result.angleOffCentre = Math.round(d.getAngleFromPlayerView(cold.figure.x, cold.figure.z) * 100) / 100;
    d.simulate(3);
    result.staysWhileYouStandThere = cold.state === 1;
    lab.aimAt(cold.figure.x, cold.figure.z, 1.3);
    d.setScanHeld(true);
    let seconds = 0;
    while (cold.state === 1 && seconds < 6) { d.simulate(0.1); seconds += 0.1; }
    d.setScanHeld(false);
    result.secondsScanned = Math.round(seconds * 10) / 10;
    result.gone = cold.state === 2;
    return result;
  });
  check('the cold room apparition is there two steps into the room (under four metres away), behind you, and can be scanned from there',
    !coldRoom.shownAtTheDoor && coldRoom.shownTwoStepsIn && coldRoom.metresTwoStepsIn < 4 && coldRoom.canBeSeen && coldRoom.angleOffCentre > 1.5 &&
    coldRoom.staysWhileYouStandThere && coldRoom.gone && coldRoom.secondsScanned >= 1.4, coldRoom);

  // --- the placed ones still work as they did ---
  const placedOnes = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    lab.freshStation('classic', 0);
    d.phantomDirector.budget = 0; // only the placed ones, for this part
    const placed = d.phantoms.filter((phantom) => phantom.kind === 'placed');
    result.count = placed.length;
    const corridor = placed[0];
    result.waitingAtFirst = corridor.state === 0;
    // Stand in its corridor ten metres off, looking at it.
    const spot = d.findWalkableSpotNear(corridor.figure.x - 10, corridor.figure.z);
    d.teleport(spot.x, spot.z, 0);
    d.simulate(0.2);
    result.thereOnceYouAreInItsRoom = corridor.state === 1;
    lab.aimAt(corridor.figure.x, corridor.figure.z, 1.3);
    d.setScanHeld(true);
    let seconds = 0;
    while (corridor.state === 1 && seconds < 6) { d.simulate(0.1); seconds += 0.1; }
    d.setScanHeld(false);
    result.secondsScanned = Math.round(seconds * 10) / 10;
    result.gone = corridor.state === 2;
    return result;
  });
  check('Kessel-9 keeps its three placed apparitions, and they behave as before (there when you come in, gone after a look)',
    placedOnes.count === 3 && placedOnes.waitingAtFirst && placedOnes.thereOnceYouAreInItsRoom && placedOnes.gone && placedOnes.secondsScanned >= 1.4, placedOnes);

  check('no script errors were reported', problems.length === 0, problems);
  await browser.close();

  if (failures.length > 0) {
    console.log('\n' + failures.length + ' check(s) failed.');
    process.exit(1);
  }
  console.log('\nAll apparition checks passed.');
})().catch((error) => { console.error('Apparition test crashed:', error); process.exit(1); });
