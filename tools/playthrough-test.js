// Plays the whole objective chain with scripted shortcuts and checks every step.
// It teleports between objectives, so it proves the rules work, not that the game is fun.
const { openGame, startGame, drawFrames } = require('./browser-harness.js');

const failures = [];
function check(description, condition, detail) {
  const line = (condition ? 'ok    ' : 'FAIL  ') + description + (detail !== undefined ? '  ' + JSON.stringify(detail) : '');
  console.log(line);
  if (!condition) failures.push(description);
}

(async () => {
  const { browser, page, problems } = await openGame();
  const inGame = (callback, argument) => page.evaluate(callback, argument);

  check('layout audit finds nothing unreachable', (await inGame(() => window.lastReturnDebug.auditLayout())).length === 0);

  // --- the title screen says which build this is, and its "Report a problem" has no descent to describe ---
  const title = await inGame(() => {
    const link = document.getElementById('link-report-problem-title');
    link.focus();
    const address = new URL(link.href);
    return { buildLine: document.getElementById('title-build').textContent, isVisible: link.getBoundingClientRect().height > 0,
      address: address.origin + address.pathname, fields: Object.fromEntries(address.searchParams) };
  });
  check('the title screen shows the build, and "Report a problem" there opens the bug form with the build, the chosen threat level and no room',
    /^Version: \d+\.\d+\.\d+ · build \d+ · [0-9a-f]{7}\+?$/.test(title.buildLine) && title.isVisible &&
    title.address === 'https://github.com/StefanKnol/Last-Return/issues/new' && title.fields.template === '1-bug.yml' &&
    'Version: ' + title.fields.version === title.buildLine && title.fields.station === 'Title screen' && title.fields.threat === 'Standard' &&
    title.fields.where === undefined && title.fields.seed === undefined && title.fields.build.length > 0, title);
  // --- a server that names itself is named in the report, in front of what the page can tell by itself ---
  const named = await inGame(() => {
    const tag = document.querySelector('meta[name="last-return-server"]'), link = document.getElementById('link-report-problem-title');
    const read = () => { link.dispatchEvent(new Event('pointerdown')); return new URL(link.href).searchParams.get('build'); };
    const result = { asBuilt: tag ? tag.content : null, unnamed: read() };
    tag.content = 'Official server';
    result.named = read();
    tag.content = '';
    return result;
  });
  check('the page is built naming no server, and one that names itself goes in front of "How you played" in the report',
    named.asBuilt === '' && named.unnamed.length > 0 && named.unnamed.indexOf('Official') < 0 && named.named === 'Official server · ' + named.unnamed, named);
  await startGame(page, false);

  // --- walking out of the lift ---
  await page.keyboard.down('KeyW');
  await inGame(() => window.lastReturnDebug.simulate(4));
  await page.keyboard.up('KeyW');
  const afterWalking = await inGame(() => ({ x: window.lastReturnDebug.player.x, hasLeftLift: window.lastReturnDebug.game.flags.hasLeftLift }));
  check('walking forward leaves the lift car', afterWalking.hasLeftLift && afterWalking.x > 10, afterWalking);
  await inGame(() => window.lastReturnDebug.simulate(4));
  check('lift door closes behind the player', (await inGame(() => window.lastReturnDebug.doors[0].openFraction)) === 0);

  // --- the pause screen says which build this is, and "Report a problem" carries it to the bug form ---
  await page.keyboard.press('Escape');
  const paused = await inGame(() => {
    const address = new URL(document.getElementById('link-report-problem').href);
    return { mode: window.lastReturnDebug.game.mode, buildLine: document.getElementById('pause-build').textContent, address: address.origin + address.pathname,
      fields: Object.fromEntries(address.searchParams) };
  });
  check('the pause screen shows the version, the build number and the commit', /^Version: \d+\.\d+\.\d+ · build \d+ · [0-9a-f]{7}\+?$/.test(paused.buildLine), paused.buildLine);
  check('"Report a problem" opens the bug form with the build, the station, the threat level and the room filled in',
    paused.mode === 'paused' && paused.address === 'https://github.com/StefanKnol/Last-Return/issues/new' && paused.fields.template === '1-bug.yml' &&
    'Version: ' + paused.fields.version === paused.buildLine && paused.fields.station === 'Kessel-9' && paused.fields.seed === undefined &&
    paused.fields.threat === 'Standard' && /^[A-Z0-9 ]+ \(x [\d.]+, z [\d.]+\)$/.test(paused.fields.where) && paused.fields.where.indexOf('UNSURVEYED') < 0 && paused.fields.device.length > 0 && paused.fields.quality === 'Medium' &&
    /^(index\.html opened from disk|Served from this computer \(.+\))$/.test(paused.fields.build), paused);
  // Pausing lets go of the mouse, and the browser reports that a moment later. Resuming before it has would
  // let that report arrive in the middle of play, where it means "the player pressed Escape": paused again.
  await page.waitForFunction(() => document.pointerLockElement === null, null, { polling: 50 });
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Escape resumes the descent, and it stays resumed', (await inGame(() => window.lastReturnDebug.game.mode)) === 'playing');

  // --- the quiet screen: instruments stay out of the way until they have something to say ---
  await drawFrames(page, 2);
  const quiet = await inGame(() => {
    const debug = window.lastReturnDebug, faded = (id) => document.getElementById(id).classList.contains('is-faded');
    const result = { setting: debug.settings.hud, readouts: faded('hud-readouts'), minimap: faded('hud-block-map'), heatCold: faded('meter-heat'), objectiveJustChanged: faded('hud-block-objective') };
    debug.player.heat = 0.6;
    return result;
  });
  await drawFrames(page, 2);
  const quietLater = await inGame(() => {
    const debug = window.lastReturnDebug, faded = (id) => document.getElementById(id).classList.contains('is-faded');
    const result = { heatWarm: faded('meter-heat') };
    debug.player.heat = 0;
    debug.settings.hud = 'full';
    return result;
  });
  await drawFrames(page, 2);
  const full = await inGame(() => {
    const faded = (id) => document.getElementById(id).classList.contains('is-faded');
    const result = { readouts: faded('hud-readouts'), minimap: faded('hud-block-map'), heatCold: faded('meter-heat') };
    window.lastReturnDebug.settings.hud = 'quiet';
    return result;
  });
  check('the quiet screen hides the readouts, the minimap and a cold heat meter, shows the objective when it has just changed, and shows the heat meter once the emitter is warm',
    quiet.setting === 'quiet' && quiet.readouts && quiet.minimap && quiet.heatCold && !quiet.objectiveJustChanged && !quietLater.heatWarm, { quiet: quiet, later: quietLater });
  check('"Full instruments" shows them all', !full.readouts && !full.minimap && !full.heatCold, full);

  // --- voice recordings: a line with a recording is played, one without stays text only ---
  // Made-up line names are used, so this works whether or not real recordings are in assets/voice.
  const voice = await inGame(async () => {
    const debug = window.lastReturnDebug;
    const context = debug.audio.context;
    const before = { hasRecording: debug.hasVoiceLine('lineOnlyThisTestKnows') };
    if (!context) return { skipped: true };
    // Stand in for a real recording with half a second of tone.
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate / 2), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = Math.sin(index * 0.06) * 0.3;
    debug.voiceState.decodedBuffers.lineOnlyThisTestKnows = buffer;
    let reportedSeconds = 0;
    const started = debug.playVoiceLine('lineOnlyThisTestKnows', 'radio', 0, (seconds) => { reportedSeconds = seconds; });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const withoutRecording = debug.playVoiceLine('lineNobodyRecorded', 'radio', 0, null);
    delete debug.voiceState.decodedBuffers.lineOnlyThisTestKnows;
    return { before: before, started: started, reportedSeconds: reportedSeconds, withoutRecording: withoutRecording };
  });
  check('a radio line with a recording plays it and reports its length; one without stays text only',
    voice.skipped || (voice.before.hasRecording === false && voice.started === true && Math.abs(voice.reportedSeconds - 0.5) < 0.01 && voice.withoutRecording === false), voice);

  // --- the real recordings in assets/voice, if there are any: each must be a sound file the browser can play ---
  const recordings = await inGame(async () => {
    const debug = window.lastReturnDebug;
    if (!debug.audio.context) return { skipped: true };
    const lengths = {}, broken = [];
    for (const key of debug.radioLineKeys.concat(['spool1', 'spool2', 'spool3'])) {
      if (!debug.hasVoiceLine(key)) continue;
      const buffer = await debug.loadVoiceLine(key);
      if (buffer && buffer.duration > 0.3) lengths[key] = Math.round(buffer.duration * 10) / 10;
      else broken.push(key);
    }
    return { lengths: lengths, broken: broken };
  });
  check('every recording in assets/voice can be played (' + (recordings.skipped ? 'no audio here' : Object.keys(recordings.lengths).length + ' found') + ')',
    recordings.skipped || recordings.broken.length === 0, recordings);

  // --- nothing is ever drawn for a figure that has not been scanned ---
  const figureTrace = await inGame(() => {
    const debug = window.lastReturnDebug;
    debug.teleport(32.5, 21.6, 0);
    const returnsBefore = debug.pointCloud.totalReturns;
    debug.simulate(1);
    return { returnsAdded: debug.pointCloud.totalReturns - returnsBefore, stillCount: debug.stills.filter((still) => still.isPresent).length };
  });
  check('standing among the dummies without scanning stores no points', figureTrace.returnsAdded === 0 && figureTrace.stillCount === 9, figureTrace);

  // --- a door that opens leaves its old points behind until they fade ---
  const doorPoints = await inGame(() => {
    const debug = window.lastReturnDebug;
    const door = debug.doors.find((candidate) => candidate !== debug.getLiftDoor() && candidate.openFraction === 0 && debug.getDoorSides(candidate));
    const cloud = debug.pointCloud;
    const firstPointIndex = cloud.writeIndex, pointCount = 20;
    for (let pointNumber = 0; pointNumber < pointCount; pointNumber++) {
      debug.addScanPoint(door.centerX, door.baseY + 0.2 + pointNumber * 0.1, door.centerZ, 0.8, door.slab.surfaceClass, 0);
    }
    const describePoints = () => {
      let stillThere = 0, fading = 0, faded = 0;
      for (let pointNumber = 0; pointNumber < pointCount; pointNumber++) {
        const pointIndex = (firstPointIndex + pointNumber) % cloud.capacity;
        const birthTime = cloud.floatView[pointIndex * 5 + 3];
        const lifeSeconds = cloud.byteView[pointIndex * 20 + 18] * 0.25;
        if (birthTime > -1e8) stillThere++;
        if (birthTime > -1e8 && lifeSeconds > 0) fading++;
        if (birthTime > -1e8 && lifeSeconds > 0 && debug.game.time - birthTime >= lifeSeconds) faded++;
      }
      return { stillThere: stillThere, fading: fading, faded: faded };
    };
    const whileShut = describePoints();
    const side = debug.getDoorSides(door)[0];
    debug.teleport(side.x, side.z, 0);
    debug.simulate(0.5);
    const justOpened = describePoints();
    justOpened.openFraction = door.openFraction;
    debug.simulate(debug.tuning.doorImprintSeconds + 0.5);
    return { pointCount: pointCount, whileShut: whileShut, justOpened: justOpened, later: describePoints() };
  });
  check('points on a shut door are permanent', doorPoints.whileShut.stillThere === doorPoints.pointCount && doorPoints.whileShut.fading === 0, doorPoints.whileShut);
  check('a door that opens keeps its old points, and they start to fade',
    doorPoints.justOpened.openFraction > 0 && doorPoints.justOpened.stillThere === doorPoints.pointCount &&
    doorPoints.justOpened.fading === doorPoints.pointCount && doorPoints.justOpened.faded === 0, doorPoints.justOpened);
  check('the old points of an opened door are gone after doorImprintSeconds', doorPoints.later.faded === doorPoints.pointCount, doorPoints.later);

  await inGame(() => { const debug = window.lastReturnDebug; debug.teleport(53, 35.2, 0); debug.use(3); });
  check('taking a spool opens its log', (await inGame(() => window.lastReturnDebug.game.mode)) === 'reading');
  await page.keyboard.press('KeyE');
  check('closing the log returns to play', (await inGame(() => window.lastReturnDebug.game.mode)) === 'playing');

  // --- generator wakes the Hollow, which walks to the noise ---
  await inGame(() => { const debug = window.lastReturnDebug; debug.teleport(69.2, 47.5, Math.PI / 2); debug.use(2); debug.teleport(14, 51, 0); debug.simulate(7); });
  check('generator restores power and the Hollow appears', await inGame(() => window.lastReturnDebug.game.flags.powerOn && window.lastReturnDebug.hollow.isActive));
  let closestToGenerator = Infinity;
  for (let step = 0; step < 30; step++) {
    await inGame(() => window.lastReturnDebug.simulate(1));
    const position = await inGame(() => [window.lastReturnDebug.hollow.figure.x, window.lastReturnDebug.hollow.figure.z]);
    closestToGenerator = Math.min(closestToGenerator, Math.hypot(position[0] - 68.5, position[1] - 47.5));
  }
  check('the Hollow walks from the shaft to the generator room', closestToGenerator < 3, closestToGenerator);

  // --- the beam holds it; without the beam it catches the player ---
  await inGame(() => {
    const debug = window.lastReturnDebug;
    debug.hollow.figure.x = 30.5; debug.hollow.figure.z = 52.5; debug.hollow.graceTimer = 0;
    debug.teleport(22.5, 52.5, Math.PI / 2);
    // A tap of the beam: it must not start a hunt.
    debug.setScannerSpread(6);
    debug.setScanHeld(true);
    debug.simulate(0.3);
    debug.setScanHeld(false);
    window.tapResult = { anger: debug.hollow.anger, state: debug.hollow.state, hits: debug.hollow.figure.totalHits };
    debug.simulate(0.2);
    window.tapResult.stateAfter = debug.hollow.state;
    // Holding the beam: after about 1.25 s it knows where the light comes from.
    debug.hollow.figure.x = 30.5; debug.hollow.figure.z = 52.5;
    debug.setScanHeld(true);
    debug.simulate(2.2);
  });
  const tap = await inGame(() => window.tapResult);
  check('a tap of the beam raises its anger without starting a hunt',
    tap.hits > 0 && tap.anger > 0.03 && tap.anger < 0.15 && tap.state !== 2 && tap.stateAfter !== 2, tap);
  const held = await inGame(() => ({ held: window.lastReturnDebug.hollow.heldAmount, speed: window.lastReturnDebug.hollow.currentSpeed, state: window.lastReturnDebug.hollow.state, anger: window.lastReturnDebug.hollow.anger }));
  check('holding the beam on it starts a hunt and slows it', held.state === 2 && held.held > 0.9 && held.speed < 1 && held.anger >= 0.3, held);
  const enraged = await inGame(() => {
    const debug = window.lastReturnDebug;
    debug.player.heat = 0;
    debug.hollow.figure.x = 30.5; debug.hollow.figure.z = 52.5;
    debug.simulate(3.2);
    const result = { anger: debug.hollow.anger, enragedTimer: debug.hollow.enragedTimer };
    // put things back for the next check: calm, eight metres away, beam still on
    debug.hollow.enragedTimer = 0; debug.hollow.anger = 0.35;
    debug.hollow.figure.x = 30.5; debug.hollow.figure.z = 52.5;
    debug.player.heat = 0; debug.player.isOverheated = false;
    return result;
  });
  check('holding it until its anger is full enrages it', enraged.enragedTimer > 0, enraged);
  await inGame(() => { window.lastReturnDebug.setScanHeld(false); window.lastReturnDebug.simulate(8); });
  check('with the beam off it reaches the player', (await inGame(() => window.lastReturnDebug.game.mode)) === 'dying');
  await page.waitForFunction(() => window.lastReturnDebug.game.mode === 'dead', null, { timeout: 60000 });
  await page.evaluate(() => document.getElementById('button-retry').click());
  const afterRetry = await inGame(() => {
    const debug = window.lastReturnDebug;
    return { mode: debug.game.mode, distance: Math.hypot(debug.hollow.figure.x - debug.player.x, debug.hollow.figure.z - debug.player.z) };
  });
  check('retry resumes at the checkpoint with the Hollow far away', afterRetry.mode === 'playing' && afterRetry.distance > 20, afterRetry);

  // --- suspense behaviour: it stops to listen, and it searches ahead of where it lost you ---
  const listening = await inGame(() => {
    const debug = window.lastReturnDebug;
    debug.teleport(14, 51, 0);
    debug.hollow.state = 0; debug.hollow.anger = 0; debug.hollow.graceTimer = 0;
    debug.hollow.figure.x = 24.5; debug.hollow.figure.z = 52.5;
    debug.hollow.targetX = 38; debug.hollow.targetZ = 52.5;
    debug.hollow.nextListenIn = 0.05;
    debug.simulate(0.5);
    const during = { state: debug.hollow.state, speed: debug.hollow.currentSpeed, timer: debug.hollow.listenTimer };
    // However long it may stand there, and a little more: the pause is drawn between two tuning values.
    debug.simulate(debug.tuning.hollowListenSecondsMaximum + 0.5);
    return { during: during, stateAfter: debug.hollow.state };
  });
  check('wandering near the player it stops dead to listen, then moves on',
    listening.during.state === 4 && listening.during.speed === 0 && listening.stateAfter !== 4, listening);
  const searchLead = await inGame(() => {
    const debug = window.lastReturnDebug;
    const hollow = debug.hollow;
    // It last sensed the player at x 22 walking east at 2.5 m/s, then lost them.
    hollow.state = 2; hollow.figure.x = 21.5; hollow.figure.z = 52.5;
    hollow.lastKnownPlayerX = 22; hollow.lastKnownPlayerZ = 52.5;
    hollow.lastKnownVelocityX = 2.5; hollow.lastKnownVelocityZ = 0;
    hollow.timeSinceSensed = 99;
    debug.teleport(14, 45.5, 0); // the player is out of earshot, in the security office
    debug.simulate(0.1);
    return { state: hollow.state, searchCenterX: hollow.searchCenterX };
  });
  check('after losing the player it searches ahead in the direction they were moving',
    searchLead.state === 3 && searchLead.searchCenterX > 27, searchLead);

  // --- the director: it steers the Hollow's wandering, and it has to be fair about it ---
  const steering = await inGame(() => {
    const debug = window.lastReturnDebug, hollow = debug.hollow, director = debug.director;
    debug.teleport(14, 51, 0); // the player stands still in the lift lobby
    hollow.state = 0; hollow.anger = 0; hollow.graceTimer = 0; hollow.doubleBackTimer = 0;
    hollow.figure.x = 30.5; hollow.figure.z = 52.5;
    const sample = function (phaseTime) {
      director.phase = 0; director.phaseTime = phaseTime; director.hasPeaked = false; director.menace = 0;
      let nearest = Infinity, furthest = 0;
      for (let pick = 0; pick < 150; pick++) {
        debug.chooseHollowRoamTarget();
        const steps = debug.stepsFromPlayerTo(hollow.targetX, hollow.targetZ);
        nearest = Math.min(nearest, steps); furthest = Math.max(furthest, steps);
      }
      return { nearest: nearest, furthest: furthest, band: [director.ringMinimumSteps, director.ringMaximumSteps] };
    };
    const result = { justAfterBreather: sample(0), fullyClosedIn: sample(9999), floor: debug.tuning.directorNearRingMinimumSteps };
    // The same forty seconds into closing in, empty-handed and carrying all three spools.
    const spoolsReally = debug.game.flags.spoolsCollected;
    debug.game.flags.spoolsCollected = 0; result.fortySecondsNoSpools = sample(40).band;
    debug.game.flags.spoolsCollected = 3; result.fortySecondsThreeSpools = sample(40).band;
    debug.game.flags.spoolsCollected = spoolsReally;
    return result;
  });
  check('carrying spools makes it close in sooner', steering.fortySecondsThreeSpools[0] < steering.fortySecondsNoSpools[0] && steering.fortySecondsThreeSpools[1] < steering.fortySecondsNoSpools[1],
    { noSpools: steering.fortySecondsNoSpools, threeSpools: steering.fortySecondsThreeSpools });
  check('fresh from a breather the director keeps the Hollow to far rooms; later it closes in, but never nearer than its floor',
    steering.justAfterBreather.nearest >= steering.justAfterBreather.band[0] && steering.justAfterBreather.band[0] > steering.fullyClosedIn.band[0] &&
    steering.fullyClosedIn.nearest >= steering.floor && steering.fullyClosedIn.furthest <= steering.fullyClosedIn.band[1], steering);

  const breather = await inGame(() => {
    const debug = window.lastReturnDebug, hollow = debug.hollow, director = debug.director;
    const result = {};
    // Menace is full while it is still chasing something: it must not be called off.
    director.phase = 0; director.phaseTime = 50; director.menace = 1; director.hasPeaked = true;
    hollow.figure.x = 30.5; hollow.figure.z = 52.5;
    hollow.state = 2; hollow.lastKnownPlayerX = 36; hollow.lastKnownPlayerZ = 52.5; hollow.timeSinceSensed = 0;
    debug.simulate(0.3);
    result.duringChase = { phase: director.phase, state: hollow.state };
    // The chase is over and it is back to wandering: now the breather starts, and it heads for a far room.
    hollow.state = 0; hollow.doubleBackTimer = 3;
    debug.simulate(0.3);
    result.started = { phase: director.phase, targetSteps: debug.stepsFromPlayerTo(hollow.targetX, hollow.targetZ), feint: hollow.doubleBackTimer };
    // The player keeps quiet for twenty seconds: it must never come nearer than it was, and it must get to a far
    // room. (Where it is at the twentieth second is not asked: if the far room was close enough to reach in
    // fourteen, it is by then on its way to the next far room, and that walk can lead back past the middle.)
    let nearestSteps = Infinity, farthestSteps = 0;
    const stepsAtStart = debug.stepsFromPlayerTo(hollow.figure.x, hollow.figure.z);
    for (let second = 0; second < 20; second++) {
      debug.simulate(1);
      const stepsNow = debug.stepsFromPlayerTo(hollow.figure.x, hollow.figure.z);
      nearestSteps = Math.min(nearestSteps, stepsNow);
      farthestSteps = Math.max(farthestSteps, stepsNow);
    }
    result.away = { stepsAtStart: stepsAtStart, nearestSteps: nearestSteps, farthestSteps: farthestSteps, stepsAfter: debug.stepsFromPlayerTo(hollow.figure.x, hollow.figure.z), phase: director.phase, mode: debug.game.mode };
    // Noise the player makes still reaches it: the breather protects nobody who shouts.
    debug.emitNoise(debug.player.x, debug.player.z, 80);
    result.afterNoise = { state: hollow.state };
    // Put it back to wandering, with a room of the director's choosing (not the noise it was walking to).
    hollow.state = 0;
    debug.chooseHollowRoamTarget();
    // Left alone, the breather ends by itself once menace has drained, and it starts closing in again.
    let seconds = 20;
    for (; seconds < 90 && director.phase === 1; seconds++) debug.simulate(1);
    result.ended = { phase: director.phase, seconds: seconds, menace: Math.round(director.menace * 100) / 100, mode: debug.game.mode };
    return result;
  });
  check('with menace full, the Hollow is not called off in the middle of a chase', breather.duringChase.phase === 0 && breather.duringChase.state === 2, breather.duringChase);
  check('once the chase is over it gets a real breather: sent to a far room, with no pretending to leave',
    breather.started.phase === 1 && breather.started.targetSteps >= 30 && breather.started.feint === 0, breather.started);
  check('during the breather it stays away from a player who keeps quiet',
    breather.away.phase === 1 && breather.away.mode === 'playing' && breather.away.nearestSteps >= breather.away.stepsAtStart - 2 && breather.away.farthestSteps >= 30, breather.away);
  check('noise during a breather still brings it', breather.afterNoise.state === 1 || breather.afterNoise.state === 2, breather.afterNoise);
  check('the breather ends by itself, after at least 25 seconds, and the closing-in starts again',
    breather.ended.phase === 0 && breather.ended.seconds >= 25 && breather.ended.seconds < 90 && breather.ended.mode === 'playing', breather.ended);
  await inGame(() => { window.lastReturnDebug.hollow.isActive = false; });

  // --- doors ---
  const doorFraction = (tileX, tileZ) => inGame(([x, z]) => window.lastReturnDebug.doors.find((door) => door.tileX === x && door.tileZ === z).openFraction, [tileX, tileZ]);
  await inGame(() => { const debug = window.lastReturnDebug; debug.teleport(31.5, 38.7, 0); debug.simulate(1.5); });
  check('powered door opens once the mains is on', (await doorFraction(31, 37)) === 1);
  await inGame(() => { const debug = window.lastReturnDebug; debug.teleport(41.3, 30.5, Math.PI / 2); debug.simulate(1.5); });
  check('keycard door stays shut without the card', (await doorFraction(42, 30)) === 0);
  await inGame(() => { const debug = window.lastReturnDebug; debug.teleport(17.3, 32.6, Math.PI); debug.use(6); debug.teleport(41.3, 30.5, Math.PI / 2); debug.simulate(1.5); });
  check('keycard door opens with the card', (await doorFraction(42, 30)) === 1);

  // --- the Stills ---
  await inGame(() => { const debug = window.lastReturnDebug; debug.teleport(32, 12.6, Math.PI); debug.use(4); });
  await page.keyboard.press('KeyE');
  const stillPositions = () => inGame(() => window.lastReturnDebug.stills.map((still) => [still.figure.x, still.figure.z, still.isPresent]));
  await inGame(() => window.lastReturnDebug.simulate(1.2));
  check('two extra dummies appear after the spool is taken', (await stillPositions()).filter((still) => still[2]).length === 11);
  // Watched: sweep the room continuously for a few seconds; nobody may move.
  const beforeWatched = await stillPositions();
  await inGame(() => {
    const debug = window.lastReturnDebug;
    debug.teleport(32, 12.6, Math.PI);
    for (let step = 0; step < 150; step++) {
      debug.player.yaw = Math.PI + Math.sin(step * 0.35) * 1.3;
      debug.player.heat = 0; debug.player.isOverheated = false;
      debug.setScanHeld(true);
      debug.setScannerSpread(26);
      debug.simulate(1 / 30);
    }
    debug.setScanHeld(false);
  });
  const afterWatched = await stillPositions();
  let watchedMovement = 0;
  for (let index = 0; index < beforeWatched.length; index++) {
    watchedMovement += Math.hypot(afterWatched[index][0] - beforeWatched[index][0], afterWatched[index][1] - beforeWatched[index][1]);
  }
  check('dummies in front of the player barely move while being scanned', watchedMovement < 9 && (await inGame(() => window.lastReturnDebug.game.mode)) === 'playing', watchedMovement);
  await inGame(() => window.lastReturnDebug.simulate(25));
  check('unwatched, the dummies reach the player', (await inGame(() => window.lastReturnDebug.game.mode)) === 'dying');
  await page.waitForFunction(() => window.lastReturnDebug.game.mode === 'dead', null, { timeout: 60000 });
  await page.evaluate(() => document.getElementById('button-retry').click());

  // --- finale ---
  await inGame(() => { const debug = window.lastReturnDebug; debug.teleport(59.5, 8.5, 0); debug.use(5); });
  await page.keyboard.press('KeyE');
  await inGame(() => { const debug = window.lastReturnDebug; debug.teleport(10.2, 55.3, -Math.PI / 2); debug.use(1); });
  const upload = await inGame(() => ({ started: window.lastReturnDebug.game.flags.uploadStarted, countdown: window.lastReturnDebug.game.liftCountdown }));
  check('uploading three spools calls the lift', upload.started && upload.countdown > 39 && upload.countdown <= 40, upload);
  await inGame(() => { const debug = window.lastReturnDebug; debug.hollow.isActive = false; debug.simulate(41); });
  check('the lift arrives and opens', await inGame(() => window.lastReturnDebug.game.flags.liftArrived && window.lastReturnDebug.doors[0].openFraction === 1));
  await inGame(() => { const debug = window.lastReturnDebug; debug.teleport(6.5, 53.5, Math.PI / 2); debug.simulate(0.2); });
  check('boarding the lift starts the ascent', (await inGame(() => window.lastReturnDebug.game.mode)) === 'ascending');
  await page.waitForFunction(() => window.lastReturnDebug.game.mode === 'ending', null, { timeout: 90000 });
  await drawFrames(page, 1);
  check('the ending screen is shown', await page.evaluate(() => !document.getElementById('screen-ending').hidden));

  check('a normal run is not marked as a debug run', await inGame(() => !window.lastReturnDebug.debugState.hasBeenUsedThisRun));
  const plainGame = await inGame(() => ({
    panel: document.getElementById('debug-panel') !== null, button: document.getElementById('button-open-debug') !== null,
    switches: Object.keys(window.lastReturnDebug.debugState.options).length, fieldCard: document.querySelector('.controls-list').textContent.includes('Debug')
  }));
  check('the plain game has no debug mode: no panel, no pause-menu button, no switches',
    !plainGame.panel && !plainGame.button && plainGame.switches === 0 && !plainGame.fieldCard, plainGame);
  check('no script errors were reported', problems.length === 0, problems);
  await browser.close();

  // --- debug mode (only in the dev build): every switch does what its label says ---
  const debugSession = await openGame({ dev: true });
  const debugPage = debugSession.page;
  const inDebugGame = (callback, argument) => debugPage.evaluate(callback, argument);
  const clickInPage = (elementId) => debugPage.evaluate((id) => document.getElementById(id).click(), elementId);
  await startGame(debugPage, false);
  await debugPage.keyboard.press('Backquote');
  await drawFrames(debugPage, 2);
  const panelState = await inDebugGame(() => ({ hidden: document.getElementById('debug-panel').hidden, mode: window.lastReturnDebug.game.mode }));
  check('the ` key opens the debug panel without pausing the game', !panelState.hidden && panelState.mode === 'playing', panelState);

  // "Cannot be caught" goes on first, so the summoned Hollow cannot end the run while the other switches are tried.
  for (const key of ['invulnerable', 'showCreatures', 'seeThroughWalls', 'lightStation', 'showSenses', 'creaturesOnMap']) await clickInPage('debug-option-' + key);
  await clickInPage('debug-action-power');
  await inDebugGame(() => { const debug = window.lastReturnDebug; debug.teleport(21.5, 53, Math.PI / 2); debug.simulate(0.2); });
  await clickInPage('debug-action-summon');
  await inDebugGame(() => window.lastReturnDebug.simulate(1));
  await drawFrames(debugPage, 3);
  await clickInPage('touch-map'); // the full map, with creature markers
  await drawFrames(debugPage, 2);
  // The full map uses the room a big screen has, and still fits on a small one.
  const measureFullMap = () => debugPage.evaluate(() => {
    const canvas = document.getElementById('map-canvas'), box = canvas.getBoundingClientRect();
    return { drawnWidth: canvas.width, drawnHeight: canvas.height, shownWidth: Math.round(box.width), shownHeight: Math.round(box.height),
      fitsOnScreen: box.left >= 0 && box.top >= 0 && box.right <= window.innerWidth && box.bottom <= window.innerHeight };
  });
  const mapOnSmallScreen = await measureFullMap();
  await debugPage.setViewportSize({ width: 2560, height: 1440 });
  await drawFrames(debugPage, 2);
  await debugPage.waitForTimeout(250); // the map is redrawn about twelve times a second
  await drawFrames(debugPage, 2);
  const mapOnBigScreen = await measureFullMap();
  await debugPage.setViewportSize({ width: 1280, height: 720 });
  await drawFrames(debugPage, 2);
  check('the full map fills a big screen and still fits on a small one',
    mapOnSmallScreen.fitsOnScreen && mapOnBigScreen.fitsOnScreen && mapOnBigScreen.shownWidth > 2000 && mapOnBigScreen.shownHeight > 1200 &&
    Math.abs(mapOnBigScreen.drawnWidth - mapOnBigScreen.shownWidth) <= 2 && Math.abs(mapOnBigScreen.drawnHeight - mapOnBigScreen.shownHeight) <= 2,
    { small: mapOnSmallScreen, big: mapOnBigScreen });
  await clickInPage('touch-map');
  check('lit station, creature bodies, sense lines and map markers draw without errors',
    debugSession.problems.length === 0 && await inDebugGame(() => window.lastReturnDebug.hollow.isActive), debugSession.problems);
  check('using a switch marks the run as a debug run', await inDebugGame(() => window.lastReturnDebug.debugState.hasBeenUsedThisRun));

  await inDebugGame(() => {
    const debug = window.lastReturnDebug;
    debug.hollow.graceTimer = 0;
    debug.hollow.figure.x = debug.player.x + 0.4; debug.hollow.figure.z = debug.player.z;
    debug.simulate(2);
  });
  check('"Cannot be caught": the Hollow reaches the player and nothing happens', (await inDebugGame(() => window.lastReturnDebug.game.mode)) === 'playing');

  await clickInPage('debug-option-freezeCreatures');
  const frozen = await inDebugGame(() => {
    const debug = window.lastReturnDebug;
    debug.hollow.figure.x = 30.5; debug.hollow.figure.z = 52.5;
    debug.simulate(3);
    return [debug.hollow.figure.x, debug.hollow.figure.z];
  });
  check('"Freeze creatures": the Hollow does not move', frozen[0] === 30.5 && frozen[1] === 52.5, frozen);
  await clickInPage('debug-option-freezeCreatures');

  await clickInPage('debug-option-creaturesIgnorePlayer');
  const ignored = await inDebugGame(() => {
    const debug = window.lastReturnDebug;
    debug.hollow.state = 0;
    debug.hollow.figure.x = debug.player.x + 3; debug.hollow.figure.z = debug.player.z;
    debug.emitNoise(debug.player.x, debug.player.z, 13);
    debug.setScanHeld(true);
    debug.simulate(1);
    debug.setScanHeld(false);
    return debug.hollow.state;
  });
  check('"Creatures ignore me": noise and the beam do not start a hunt', ignored !== 2, ignored);

  await clickInPage('debug-option-unlimitedScanner');
  const heat = await inDebugGame(() => { const debug = window.lastReturnDebug; debug.setScanHeld(true); debug.simulate(15); debug.setScanHeld(false); return [debug.player.heat, debug.player.isOverheated]; });
  check('"Scanner never heats": fifteen seconds of painting leaves it cold', heat[0] === 0 && heat[1] === false, heat);

  await clickInPage('debug-option-flyMode');
  await debugPage.keyboard.down('KeyW');
  const flight = await inDebugGame(() => { const debug = window.lastReturnDebug; debug.player.pitch = 0.6; const before = debug.player.eyeHeight; debug.simulate(1.5); return debug.player.eyeHeight - before; });
  await debugPage.keyboard.up('KeyW');
  check('"Fly through walls": looking up and moving forward gains height', flight > 3, flight);
  await clickInPage('debug-option-flyMode');
  const landed = await inDebugGame(() => window.lastReturnDebug.player.eyeHeight);
  check('switching flying off puts the player back on the floor', Math.abs(landed - 1.62) < 0.01, landed);

  await inDebugGame(() => { document.getElementById('debug-zone').value = '19'; });
  await clickInPage('debug-teleport');
  const zoneAfterTeleport = await inDebugGame(() => { const debug = window.lastReturnDebug; debug.simulate(0.2); return [debug.player.x, debug.player.z]; });
  check('"Go to" moves the player into the chosen zone (Shaft 9)', zoneAfterTeleport[0] > 49 && zoneAfterTeleport[0] < 69 && zoneAfterTeleport[1] < 15, zoneAfterTeleport);

  const tuned = await inDebugGame(() => {
    const field = document.getElementById('debug-tuning-walkSpeed');
    field.value = '5';
    field.dispatchEvent(new Event('change'));
    const changed = window.lastReturnDebug.tuning.walkSpeed;
    document.getElementById('debug-tuning-reset').click();
    return [changed, window.lastReturnDebug.tuning.walkSpeed, field.value];
  });
  check('live tuning changes a value and reset restores it', tuned[0] === 5 && tuned[1] === 2.5 && tuned[2] === '2.5', tuned);
  // --- leaving for the title screen must leave no sound of play running under it ---
  await inDebugGame(() => { const debug = window.lastReturnDebug; debug.spawnHollow(debug.player.x + 6, debug.player.z); debug.simulate(0.5); });
  await drawFrames(debugSession.page, 2);
  await debugSession.page.waitForTimeout(700);
  const growlWhilePlaying = await inDebugGame(() => window.lastReturnDebug.audio.context ? window.lastReturnDebug.audio.hollowGrowlGain.gain.value : -1);
  await debugSession.page.evaluate(() => document.getElementById('button-pause-restart').click());
  await drawFrames(debugSession.page, 2);
  await debugSession.page.waitForTimeout(700);
  const afterLeaving = await inDebugGame(() => { const audio = window.lastReturnDebug.audio; return { mode: window.lastReturnDebug.game.mode,
    growl: audio.context ? audio.hollowGrowlGain.gain.value : 0, staticLevel: audio.context ? audio.staticGain.gain.value : 0 }; });
  check('abandoning to the title screen switches the growl and the static off',
    growlWhilePlaying === -1 || (growlWhilePlaying > 0.05 && afterLeaving.mode === 'title' && afterLeaving.growl < 0.01 && afterLeaving.staticLevel < 0.01), { growlWhilePlaying: growlWhilePlaying, afterLeaving: afterLeaving });
  check('no script errors were reported in debug mode', debugSession.problems.length === 0, debugSession.problems);
  await debugSession.browser.close();

  // --- phones: the game holds still until the phone is turned sideways ---
  const phone = await openGame({ width: 390, height: 844, isPhone: true });
  const phoneMode = () => phone.page.evaluate(() => window.lastReturnDebug.game.mode);
  const turnPhone = async (width, height) => {
    await phone.page.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : null));
    await phone.page.waitForTimeout(300);
    await phone.page.setViewportSize({ width: width, height: height });
    await drawFrames(phone.page, 2);
  };
  await startGame(phone.page, true);
  await drawFrames(phone.page, 2);
  check('an upright phone gets the turn-sideways screen instead of play',
    (await phoneMode()) === 'rotate' && await phone.page.evaluate(() => !document.getElementById('screen-rotate').hidden));
  await turnPhone(844, 390);
  check('turning the phone sideways starts play with touch controls',
    (await phoneMode()) === 'playing' && await phone.page.evaluate(() => !document.getElementById('touch-controls').hidden));
  await turnPhone(390, 844);
  check('turning it upright again holds the game', (await phoneMode()) === 'rotate');
  await phone.page.tap('#button-play-upright');
  await drawFrames(phone.page, 2);
  check('"Play upright anyway" lets the game continue', (await phoneMode()) === 'playing');
  check('no script errors were reported on the phone', phone.problems.length === 0, phone.problems);
  await phone.browser.close();
  console.log(failures.length === 0 ? '\nAll checks passed.' : '\n' + failures.length + ' check(s) failed.');
  process.exit(failures.length === 0 ? 0 : 1);
})().catch((error) => { console.error('Test run crashed:', error); process.exit(1); });
