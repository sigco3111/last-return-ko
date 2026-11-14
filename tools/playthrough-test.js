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

  check('layout audit finds nothing unreachable', (await inGame(() => window.noReturnDebug.auditLayout())).length === 0);
  await startGame(page, false);

  // --- walking out of the lift ---
  await page.keyboard.down('KeyW');
  await inGame(() => window.noReturnDebug.simulate(4));
  await page.keyboard.up('KeyW');
  const afterWalking = await inGame(() => ({ x: window.noReturnDebug.player.x, hasLeftLift: window.noReturnDebug.game.flags.hasLeftLift }));
  check('walking forward leaves the lift car', afterWalking.hasLeftLift && afterWalking.x > 10, afterWalking);
  await inGame(() => window.noReturnDebug.simulate(4));
  check('lift door closes behind the player', (await inGame(() => window.noReturnDebug.doors[0].openFraction)) === 0);

  // --- nothing is ever drawn for a figure that has not been scanned ---
  const figureTrace = await inGame(() => {
    const debug = window.noReturnDebug;
    debug.teleport(32.5, 21.6, 0);
    const returnsBefore = debug.pointCloud.totalReturns;
    debug.simulate(1);
    return { returnsAdded: debug.pointCloud.totalReturns - returnsBefore, stillCount: debug.stills.filter((still) => still.isPresent).length };
  });
  check('standing among the dummies without scanning stores no points', figureTrace.returnsAdded === 0 && figureTrace.stillCount === 9, figureTrace);

  // --- first spool and the reader ---
  await inGame(() => { const debug = window.noReturnDebug; debug.teleport(53, 35.2, 0); debug.use(3); });
  check('taking a spool opens its log', (await inGame(() => window.noReturnDebug.game.mode)) === 'reading');
  await page.keyboard.press('KeyE');
  check('closing the log returns to play', (await inGame(() => window.noReturnDebug.game.mode)) === 'playing');

  // --- generator wakes the Hollow, which walks to the noise ---
  await inGame(() => { const debug = window.noReturnDebug; debug.teleport(69.2, 47.5, Math.PI / 2); debug.use(2); debug.teleport(14, 51, 0); debug.simulate(7); });
  check('generator restores power and the Hollow appears', await inGame(() => window.noReturnDebug.game.flags.powerOn && window.noReturnDebug.hollow.isActive));
  let closestToGenerator = Infinity;
  for (let step = 0; step < 30; step++) {
    await inGame(() => window.noReturnDebug.simulate(1));
    const position = await inGame(() => [window.noReturnDebug.hollow.figure.x, window.noReturnDebug.hollow.figure.z]);
    closestToGenerator = Math.min(closestToGenerator, Math.hypot(position[0] - 68.5, position[1] - 47.5));
  }
  check('the Hollow walks from the shaft to the generator room', closestToGenerator < 3, closestToGenerator);

  // --- the beam holds it; without the beam it catches the player ---
  await inGame(() => {
    const debug = window.noReturnDebug;
    debug.hollow.figure.x = 30.5; debug.hollow.figure.z = 52.5; debug.hollow.graceTimer = 0;
    debug.teleport(22.5, 52.5, Math.PI / 2);
    debug.setScanHeld(true);
    debug.simulate(1.5);
  });
  const held = await inGame(() => ({ held: window.noReturnDebug.hollow.heldAmount, speed: window.noReturnDebug.hollow.currentSpeed, state: window.noReturnDebug.hollow.state }));
  check('painting the Hollow puts it in a hunt and slows it', held.state === 2 && held.held > 0.9 && held.speed < 1, held);
  await inGame(() => { window.noReturnDebug.setScanHeld(false); window.noReturnDebug.simulate(8); });
  check('with the beam off it reaches the player', (await inGame(() => window.noReturnDebug.game.mode)) === 'dying');
  await page.waitForFunction(() => window.noReturnDebug.game.mode === 'dead', null, { timeout: 60000 });
  await page.evaluate(() => document.getElementById('button-retry').click());
  const afterRetry = await inGame(() => {
    const debug = window.noReturnDebug;
    return { mode: debug.game.mode, distance: Math.hypot(debug.hollow.figure.x - debug.player.x, debug.hollow.figure.z - debug.player.z) };
  });
  check('retry resumes at the checkpoint with the Hollow far away', afterRetry.mode === 'playing' && afterRetry.distance > 20, afterRetry);

  // --- doors ---
  const doorFraction = (tileX, tileZ) => inGame(([x, z]) => window.noReturnDebug.doors.find((door) => door.tileX === x && door.tileZ === z).openFraction, [tileX, tileZ]);
  await inGame(() => { const debug = window.noReturnDebug; debug.hollow.isActive = false; debug.teleport(31.5, 38.7, 0); debug.simulate(1.5); });
  check('powered door opens once the mains is on', (await doorFraction(31, 37)) === 1);
  await inGame(() => { const debug = window.noReturnDebug; debug.teleport(41.3, 30.5, Math.PI / 2); debug.simulate(1.5); });
  check('keycard door stays shut without the card', (await doorFraction(42, 30)) === 0);
  await inGame(() => { const debug = window.noReturnDebug; debug.teleport(17.3, 32.6, Math.PI); debug.use(6); debug.teleport(41.3, 30.5, Math.PI / 2); debug.simulate(1.5); });
  check('keycard door opens with the card', (await doorFraction(42, 30)) === 1);

  // --- the Stills ---
  await inGame(() => { const debug = window.noReturnDebug; debug.teleport(32, 12.6, Math.PI); debug.use(4); });
  await page.keyboard.press('KeyE');
  const stillPositions = () => inGame(() => window.noReturnDebug.stills.map((still) => [still.figure.x, still.figure.z, still.isPresent]));
  await inGame(() => window.noReturnDebug.simulate(1.2));
  check('two extra dummies appear after the spool is taken', (await stillPositions()).filter((still) => still[2]).length === 11);
  // Watched: sweep the room continuously for a few seconds; nobody may move.
  const beforeWatched = await stillPositions();
  await inGame(() => {
    const debug = window.noReturnDebug;
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
  check('dummies in front of the player barely move while being scanned', watchedMovement < 9 && (await inGame(() => window.noReturnDebug.game.mode)) === 'playing', watchedMovement);
  await inGame(() => window.noReturnDebug.simulate(25));
  check('unwatched, the dummies reach the player', (await inGame(() => window.noReturnDebug.game.mode)) === 'dying');
  await page.waitForFunction(() => window.noReturnDebug.game.mode === 'dead', null, { timeout: 60000 });
  await page.evaluate(() => document.getElementById('button-retry').click());

  // --- finale ---
  await inGame(() => { const debug = window.noReturnDebug; debug.teleport(59.5, 8.5, 0); debug.use(5); });
  await page.keyboard.press('KeyE');
  await inGame(() => { const debug = window.noReturnDebug; debug.teleport(10.2, 55.3, -Math.PI / 2); debug.use(1); });
  const upload = await inGame(() => ({ started: window.noReturnDebug.game.flags.uploadStarted, countdown: window.noReturnDebug.game.liftCountdown }));
  check('uploading three spools calls the lift', upload.started && upload.countdown === 40, upload);
  await inGame(() => { const debug = window.noReturnDebug; debug.hollow.isActive = false; debug.simulate(41); });
  check('the lift arrives and opens', await inGame(() => window.noReturnDebug.game.flags.liftArrived && window.noReturnDebug.doors[0].openFraction === 1));
  await inGame(() => { const debug = window.noReturnDebug; debug.teleport(6.5, 53.5, Math.PI / 2); debug.simulate(0.2); });
  check('boarding the lift starts the ascent', (await inGame(() => window.noReturnDebug.game.mode)) === 'ascending');
  await page.waitForFunction(() => window.noReturnDebug.game.mode === 'ending', null, { timeout: 90000 });
  await drawFrames(page, 1);
  check('the ending screen is shown', await page.evaluate(() => !document.getElementById('screen-ending').hidden));

  check('no script errors were reported', problems.length === 0, problems);
  await browser.close();

  // --- phones: the game holds still until the phone is turned sideways ---
  const phone = await openGame({ width: 390, height: 844, isPhone: true });
  const phoneMode = () => phone.page.evaluate(() => window.noReturnDebug.game.mode);
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
