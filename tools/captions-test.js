// Checks the captions (the lines in square brackets): the three levels of the setting, that a caption only
// shows where its sound could be heard, the arrow and the distance word, how captions share a line, and that
// the things that make a sound in play really put their caption up.
const fs = require('fs');
const path = require('path');
const { openGame, startGame, drawFrames } = require('./browser-harness.js');

const failures = [];
function check(description, condition, detail) {
  const line = (condition ? 'ok    ' : 'FAIL  ') + description + (detail !== undefined ? '  ' + JSON.stringify(detail) : '');
  console.log(line);
  if (!condition) failures.push(description);
}

(async () => {
  const { browser, page, problems } = await openGame({ dev: true }); // the debug switches hold the Hollow still where the test wants it
  const inGame = (callback, argument) => page.evaluate(callback, argument);
  await startGame(page, false);

  // --- the table, and the source ---
  const table = await inGame(() => window.lastReturnDebug.captions);
  const keys = Object.keys(table);
  const badEntries = keys.filter((key) => {
    const caption = table[key];
    return !/^\[.+\]$/.test(caption.text) || (caption.level !== 'tell' && caption.level !== 'sound') || !(caption.seconds > 0) || !(caption.withinMetres >= 0);
  });
  check('every caption has a text in square brackets, a level, a time to stay and a distance', keys.length >= 30 && badEntries.length === 0, { captions: keys.length, bad: badEntries });
  const sourceFolder = path.join(__dirname, '..', 'src', 'js');
  let source = '';
  for (const file of fs.readdirSync(sourceFolder)) if (file !== '00-config.js') source += fs.readFileSync(path.join(sourceFolder, file), 'utf8');
  const namedInCalls = Array.from(source.matchAll(/showCaption\('([A-Za-z]+)'/g)).map((match) => match[1]);
  const unknown = namedInCalls.filter((key) => !table[key]);
  const neverUsed = keys.filter((key) => source.indexOf("'" + key + "'") < 0);
  check('every caption the game asks for is in the table, and every caption in the table is asked for somewhere',
    namedInCalls.length >= 20 && unknown.length === 0 && neverUsed.length === 0, { calls: namedInCalls.length, unknown: unknown, neverUsed: neverUsed });
  check('no caption text is written out in the game any more: showCaption is always given a name', !/showCaption\('\[/.test(source));

  // --- the setting ---
  const setting = await inGame(() => {
    const d = window.lastReturnDebug, title = document.getElementById('title-captions'), pause = document.getElementById('pause-captions');
    const result = { atStart: d.settings.captions, titleShows: title.value, pauseShows: pause.value,
      titleChoices: Array.from(title.options).map((option) => option.value), pauseChoices: Array.from(pause.options).map((option) => option.value) };
    pause.value = 'all'; pause.dispatchEvent(new Event('input', { bubbles: true }));
    result.afterChoosing = { setting: d.settings.captions, titleShows: title.value, stored: JSON.parse(window.localStorage.getItem('last-return-settings')).captions };
    return result;
  });
  check('a new game starts on "tells", and both menus offer off, tells and every sound',
    setting.atStart === 'tells' && setting.titleShows === 'tells' && setting.pauseShows === 'tells' &&
    setting.titleChoices.join() === 'off,tells,all' && setting.pauseChoices.join() === 'off,tells,all', setting);
  check('choosing a level in one menu changes the setting, the other menu and what is kept for next time',
    setting.afterChoosing.setting === 'all' && setting.afterChoosing.titleShows === 'all' && setting.afterChoosing.stored === 'all', setting.afterChoosing);

  // --- a quiet place to try captions by hand: Kessel-9, nothing hunting, the player in the open ---
  await inGame(() => {
    const d = window.lastReturnDebug;
    d.loadStation('classic', 0);
    d.setDebugOption('invulnerable', true);
    d.hollow.isActive = false;
    d.teleport(44.5, 52.5, 0); d.player.velocityX = 0; d.player.velocityZ = 0;
    window.captionLab = {
      // A point `metres` from the player, `eighths` eighths of a turn clockwise from straight ahead of them.
      pointAt: function (metres, eighths) {
        const angle = d.player.yaw + eighths * Math.PI / 4;
        return { x: d.player.x + Math.sin(angle) * metres, z: d.player.z - Math.cos(angle) * metres };
      },
      // What is on screen, without the lines the station puts up by itself now and then (a drip, a pipe).
      lines: function () { return d.getCaptionLines().filter((line) => line.key.indexOf('ambient') !== 0); },
      line: function (key) { return this.lines().filter((line) => line.key === key)[0] || null; }
    };
  });

  // --- the three levels ---
  const levels = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.captionLab, result = {};
    for (const level of ['off', 'tells', 'all']) {
      d.settings.captions = level; d.clearCaptions();
      const there = lab.pointAt(4, 0);
      result[level] = { tell: d.showCaption('hollowFound', there), sound: d.showCaption('hollowSteps', there), onScreen: lab.lines().map((line) => line.key) };
    }
    // Messages and Dispatch are not captions: with captions off they still come.
    d.settings.captions = 'off'; d.clearCaptions();
    const before = document.querySelectorAll('#hud-messages .hud-message').length;
    d.playRadioLine('generatorStarted');
    result.messagesWithCaptionsOff = document.querySelectorAll('#hud-messages .hud-message.is-radio').length;
    result.messagesBefore = before;
    // Lowering the level takes down what it no longer allows.
    d.settings.captions = 'all'; d.clearCaptions();
    d.showCaption('hollowFound', lab.pointAt(4, 0)); d.showCaption('hollowSteps', lab.pointAt(4, 0));
    d.settings.captions = 'tells';
    result.leftAfterLowering = lab.lines().map((line) => line.key);
    d.settings.captions = 'off';
    result.leftAfterOff = lab.lines().map((line) => line.key);
    return result;
  });
  check('off shows no captions at all', !levels.off.tell && !levels.off.sound && levels.off.onScreen.length === 0, levels.off);
  check('tells shows what the Hollow has just done and no sounds', levels.tells.tell && !levels.tells.sound && levels.tells.onScreen.join() === 'hollowFound', levels.tells);
  check('every sound shows both', levels.all.tell && levels.all.sound && levels.all.onScreen.length === 2, levels.all);
  check('messages and Dispatch are not captions: with captions off, Dispatch still comes up in words', levels.messagesWithCaptionsOff >= 1, levels.messagesWithCaptionsOff);
  check('turning the level down takes away the lines it no longer allows, at once',
    levels.leftAfterLowering.join() === 'hollowFound' && levels.leftAfterOff.length === 0, [levels.leftAfterLowering, levels.leftAfterOff]);

  // --- only where it could be heard ---
  const earshot = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.captionLab, wrong = [];
    d.settings.captions = 'all';
    let tried = 0;
    for (const key of Object.keys(d.captions)) {
      const within = d.captions[key].withinMetres;
      if (within <= 0) continue;
      tried++;
      d.clearCaptions();
      const inside = d.showCaption(key, lab.pointAt(within * 0.9, 1));
      d.clearCaptions();
      const outside = d.showCaption(key, lab.pointAt(within * 1.1, 1));
      if (!inside || outside) wrong.push(key);
    }
    d.clearCaptions();
    return { tried: tried, wrong: wrong, fromNowhere: d.showCaption('heartbeat'), anyDistance: d.showCaption('hollowLost', lab.pointAt(200, 3)) };
  });
  check('every caption with a distance shows just inside it and not just outside it', earshot.tried >= 25 && earshot.wrong.length === 0, earshot);
  check('a caption with no distance shows from anywhere, and one for a sound of your own needs no place at all', earshot.fromNowhere && earshot.anyDistance, earshot);

  // --- the arrow and the distance word ---
  const pointing = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.captionLab, result = { around: [], turned: [], words: [] };
    d.settings.captions = 'all';
    for (let eighths = 0; eighths < 8; eighths++) {
      d.clearCaptions();
      d.showCaption('hollowSnarl', lab.pointAt(8, eighths));
      result.around.push(lab.line('hollowSnarl').where);
    }
    // One thing that stays where it is, while the player turns to the right a quarter at a time: it goes from
    // ahead, to the left, to behind, to the right.
    d.clearCaptions();
    const fixed = lab.pointAt(8, 0);
    for (let quarter = 0; quarter < 4; quarter++) {
      d.showCaption('hollowSnarl', fixed);
      result.turned.push(lab.line('hollowSnarl').where);
      d.player.yaw += Math.PI / 2;
    }
    // (four quarter turns: the player faces the way they did)
    for (const metres of [0.6, 3, 8, 20]) {
      d.clearCaptions();
      d.showCaption('hollowSnarl', lab.pointAt(metres, 0));
      result.words.push(lab.line('hollowSnarl').where);
    }
    // A thing that moves is followed.
    d.clearCaptions();
    const mover = lab.pointAt(8, 0);
    d.showCaption('hollowSnarl', mover);
    const before = lab.line('hollowSnarl').where;
    const behind = lab.pointAt(3, 4); mover.x = behind.x; mover.z = behind.z;
    result.followed = [before, lab.line('hollowSnarl').where];
    // On "tells" there is no arrow: that level is for people who can hear where it is.
    d.settings.captions = 'tells'; d.clearCaptions();
    d.showCaption('hollowFound', lab.pointAt(8, 2));
    result.onTells = lab.line('hollowFound').where;
    result.arrowShownOnTells = !document.querySelector('#hud-caption .hud-caption-where').hidden;
    return result;
  });
  check('the arrow points at the sound: up is straight ahead, then clockwise through right, behind and left',
    pointing.around.join(' | ') === '↑ near | ↗ near | → near | ↘ near | ↓ near | ↙ near | ← near | ↖ near', pointing.around);
  check('as the player turns right, a thing that stays put goes from ahead to the left, to behind, to the right', pointing.turned.join(' | ') === '↑ near | ← near | ↓ near | → near', pointing.turned);
  check('the word says how near: right here, close, near, far', pointing.words.join(' | ') === 'right here | ↑ close | ↑ near | ↑ far', pointing.words);
  check('a sound that moves is followed', pointing.followed.join(' | ') === '↑ near | ↓ close', pointing.followed);
  check('on "tells" a caption has no arrow', pointing.onTells === '' && !pointing.arrowShownOnTells, [pointing.onTells, pointing.arrowShownOnTells]);

  // --- sharing a line, staying up, going away ---
  const lines = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.captionLab, result = {};
    d.settings.captions = 'all'; d.clearCaptions();
    const there = lab.pointAt(4, 0);
    // The growl goes on all the time; a snarl is over in a moment and says more. They share a line.
    d.showCaption('hollowGrowlHunting', there);
    result.snarlTakesOver = d.showCaption('hollowSnarl', there);
    result.growlWaits = d.showCaption('hollowGrowlHunting', there) === false;
    result.whileSnarling = lab.lines().map((line) => line.key);
    d.simulate(d.captions.hollowSnarl.seconds + 0.2);
    result.growlComesBack = d.showCaption('hollowGrowlHunting', there);
    result.afterwards = lab.lines().map((line) => line.key);
    // A sound that goes on keeps its one line for as long as it lasts, and is gone soon after it stops.
    d.clearCaptions();
    let mostLines = 0;
    for (let time = 0; time < 6; time += 0.5) { d.showCaption('hollowSteps', there); d.simulate(0.5); mostLines = Math.max(mostLines, lab.lines().length); }
    result.keptUp = { mostLines: mostLines, stillThere: lab.line('hollowSteps') !== null };
    d.simulate(d.captions.hollowSteps.seconds + 0.2);
    result.goneAfterItStops = lab.line('hollowSteps') === null;
    // Never more lines than the screen is given: the ones that say least make way.
    d.clearCaptions();
    for (const key of ['hollowSteps', 'hatchRattle', 'doorOpens', 'stillShifts', 'hollowFound', 'phantomBreath']) d.showCaption(key, there);
    result.crowded = lab.lines().map((line) => line.key);
    result.mostLines = d.tuning.captionMostLines;
    d.clearCaptions();
    return result;
  });
  check('captions that share a line take turns: a snarl pushes the growl out, the growl waits, and comes back when the snarl has had its time',
    lines.snarlTakesOver && lines.growlWaits && lines.whileSnarling.join() === 'hollowSnarl' && lines.growlComesBack && lines.afterwards.join() === 'hollowGrowlHunting', lines);
  check('a sound that goes on is one steady line, and the line goes soon after the sound stops',
    lines.keptUp.mostLines === 1 && lines.keptUp.stillThere && lines.goneAfterItStops, lines.keptUp);
  check('never more lines than the screen is given, and what the Hollow has just done is kept',
    lines.crowded.length === lines.mostLines && lines.crowded.indexOf('hollowFound') >= 0 && lines.crowded.indexOf('phantomBreath') >= 0, lines.crowded);

  // --- in play: the things that make a sound put their caption up ---
  const play = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.captionLab, result = {};
    const count = function (key) { return d.captionCounts[key] || 0; };
    d.settings.captions = 'all'; d.clearCaptions();
    d.teleport(44.5, 52.5, 0);
    // It wanders past, eight metres off, taking no notice of the player.
    d.setDebugOption('creaturesIgnorePlayer', true);
    const start = lab.pointAt(5, 6); // to the player's left
    d.spawnHollow(start.x, start.z);
    d.hollow.graceTimer = 999;
    const seen = {};
    for (let time = 0; time < 4; time += 0.25) {
      d.hollow.state = 0; d.hollow.targetX = d.player.x - 12; d.hollow.targetZ = d.player.z;
      d.simulate(0.25);
      for (const line of lab.lines()) seen[line.key] = line.where;
    }
    result.wandering = seen;
    // It stops dead to listen: no footsteps, so that line goes; the growl is still there.
    const stand = lab.pointAt(4, 6);
    for (let time = 0; time < 3; time += 0.1) { d.hollow.state = 4; d.hollow.listenTimer = 5; d.hollow.figure.x = stand.x; d.hollow.figure.z = stand.z; d.simulate(0.1); }
    result.listening = lab.lines().map((line) => line.key);
    // It finds the player: the first time with the stinger ("it has found you"), the second time soon after with only the roar.
    d.setDebugOption('creaturesIgnorePlayer', false);
    const foundBefore = count('hollowFound'), roarBefore = count('hollowRoar');
    d.hollow.graceTimer = 0; d.hollow.stingerCooldown = 0;
    d.emitNoise(d.player.x, d.player.z, 80); d.simulate(0.1);
    result.found = { state: d.hollow.state, found: count('hollowFound') - foundBefore, roar: count('hollowRoar') - roarBefore };
    d.hollow.state = 0; d.simulate(0.05);
    d.emitNoise(d.player.x, d.player.z, 80); d.simulate(0.1);
    result.foundAgain = { state: d.hollow.state, found: count('hollowFound') - foundBefore, roar: count('hollowRoar') - roarBefore };
    // Hunting, its growl is the louder one, it snarls, and your heart pounds.
    const snarlBefore = count('hollowSnarl'), heartBefore = count('heartbeat'), loudGrowlBefore = count('hollowGrowlHunting');
    for (let time = 0; time < 6; time += 0.1) { d.hollow.state = 2; d.hollow.timeSinceSensed = 0; d.hollow.figure.x = stand.x; d.hollow.figure.z = stand.z; d.simulate(0.1); }
    result.hunting = { snarls: count('hollowSnarl') - snarlBefore, heartbeat: count('heartbeat') - heartBefore > 0, loudGrowl: count('hollowGrowlHunting') - loudGrowlBefore > 0 };
    // It loses the player.
    const lostBefore = count('hollowLost'), sniffBefore = count('hollowSniff');
    d.setDebugOption('creaturesIgnorePlayer', true);
    d.hollow.state = 2; d.hollow.timeSinceSensed = 999; d.hollow.targetX = d.hollow.figure.x; d.hollow.targetZ = d.hollow.figure.z;
    d.simulate(0.2);
    result.lost = { state: d.hollow.state, lost: count('hollowLost') - lostBefore };
    for (let time = 0; time < 8 && d.hollow.state === 3; time += 0.5) d.simulate(0.5);
    result.lost.sniffs = count('hollowSniff') - sniffBefore;
    d.hollow.isActive = false;
    d.setDebugOption('creaturesIgnorePlayer', false);
    return result;
  });
  check('wandering past, the Hollow puts up its footsteps and its growl, each with where it is',
    /^[←↖↙↑↓] (close|near)$/.test(play.wandering.hollowSteps || '') && /^[←↖↙↑↓] (close|near)$/.test(play.wandering.hollowGrowl || ''), play.wandering);
  check('when it stops dead to listen its footsteps go from the screen and its growl stays: the same tell ears get',
    play.listening.indexOf('hollowGrowl') >= 0 && play.listening.indexOf('hollowSteps') < 0, play.listening);
  check('finding you is "it has found you" with the stinger, and "it roars" when it finds you again too soon for one',
    play.found.state === 2 && play.found.found === 1 && play.found.roar === 0 && play.foundAgain.state === 2 && play.foundAgain.found === 1 && play.foundAgain.roar === 1, [play.found, play.foundAgain]);
  check('hunting, it snarls, its growl is the loud one, and your heart pounds', play.hunting.snarls >= 1 && play.hunting.heartbeat && play.hunting.loudGrowl, play.hunting);
  check('losing you is "it has lost you", and then it sniffs about', play.lost.state === 3 && play.lost.lost === 1 && play.lost.sniffs >= 1, play.lost);

  // --- doors, hatches, the lift, the station, the Stills ---
  const things = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.captionLab, result = {};
    const count = function (key) { return d.captionCounts[key] || 0; };
    d.settings.captions = 'all'; d.clearCaptions();
    // A door that opens by itself, with the Hollow at it and the player eight metres off.
    let door = null;
    for (const candidate of d.doors) if (candidate.kind === d.doorKinds.automatic && !door) door = candidate;
    const sides = d.getDoorSides(door);
    const awayX = Math.sign(sides[0].x - door.centerX), awayZ = Math.sign(sides[0].z - door.centerZ);
    const far = d.findWalkableSpotNear(door.centerX + awayX * 8, door.centerZ + awayZ * 8);
    d.teleport(far.x, far.z, 0); d.simulate(0.3);
    d.setDebugOption('creaturesIgnorePlayer', true);
    const opensBefore = count('doorOpens'), closesBefore = count('doorCloses');
    const atDoor = { x: door.centerX - awayX * 1.2, z: door.centerZ - awayZ * 1.2 };
    d.spawnHollow(atDoor.x, atDoor.z); d.hollow.graceTimer = 999;
    for (let time = 0; time < 2; time += 0.1) { d.hollow.state = 4; d.hollow.listenTimer = 5; d.hollow.figure.x = atDoor.x; d.hollow.figure.z = atDoor.z; d.simulate(0.1); }
    result.byTheHollow = { metresFromPlayer: Math.round(Math.hypot(door.centerX - d.player.x, door.centerZ - d.player.z) * 10) / 10, opens: count('doorOpens') - opensBefore };
    d.hollow.isActive = false;
    d.simulate(4);
    result.byTheHollow.closes = count('doorCloses') - closesBefore;
    // The same door, opened by the player walking up to it: no caption, it is their own doing.
    const opensBeforeOwn = count('doorOpens'), closesBeforeOwn = count('doorCloses');
    d.teleport(door.centerX + awayX * 1.2, door.centerZ + awayZ * 1.2, 0); d.simulate(1.5);
    result.byThePlayer = { open: door.openFraction, opens: count('doorOpens') - opensBeforeOwn };
    d.setDebugOption('creaturesIgnorePlayer', false);
    // A ceiling hatch forced open near the player, and one too far away to hear.
    const hatch = d.hollowHatches[0];
    const underHatch = d.findWalkableSpotNear(hatch.x + 3, hatch.z);
    d.shutHollowHatches();
    d.teleport(underHatch.x, underHatch.z, 0);
    const burstBefore = count('hatchBurst');
    d.forceHollowHatchOpen(hatch, true);
    result.hatchNear = count('hatchBurst') - burstBefore;
    d.shutHollowHatches();
    d.teleport(d.playerStart.x, d.playerStart.z, 0);
    result.hatchMetresFromTheLift = Math.round(Math.hypot(hatch.x - d.playerStart.x, hatch.z - d.playerStart.z));
    d.forceHollowHatchOpen(hatch, true);
    result.hatchFar = count('hatchBurst') - burstBefore - result.hatchNear;
    d.shutHollowHatches();
    // The station's own sounds each have theirs. They come by chance, so the clock is run until all four have.
    d.teleport(d.shaft.x + 3, d.shaft.z, 0);
    const ambientBefore = ['ambientDrips', 'ambientPipe', 'ambientMetal', 'ambientKnocks'].map(count);
    let ambientSeconds = 0;
    for (; ambientSeconds < 900; ambientSeconds += 5) {
      d.simulate(5);
      if (['ambientDrips', 'ambientPipe', 'ambientMetal', 'ambientKnocks'].every((key, index) => count(key) > ambientBefore[index])) break;
    }
    result.ambient = { seconds: ambientSeconds, heard: ['ambientDrips', 'ambientPipe', 'ambientMetal', 'ambientKnocks'].filter((key, index) => count(key) > ambientBefore[index]) };
    return result;
  });
  check('a door the Hollow opens eight metres away says so, opening and closing',
    things.byTheHollow.metresFromPlayer > 5 && things.byTheHollow.opens === 1 && things.byTheHollow.closes === 1, things.byTheHollow);
  check('the door you open yourself gets no caption', things.byThePlayer.open > 0.5 && things.byThePlayer.opens === 0, things.byThePlayer);
  check('a ceiling hatch forced open three metres away says so; the same hatch from the lift, out of earshot, does not',
    things.hatchNear === 1 && (things.hatchMetresFromTheLift <= 25 || things.hatchFar === 0), things);
  check('the station\'s own sounds (drips, a pipe, settling metal, the knocking in the shaft) each have a caption', things.ambient.heard.length === 4, things.ambient);

  // --- the rest of them, each made to happen ---
  const rest = await inGame(() => {
    const d = window.lastReturnDebug, result = {};
    const count = function (key) { return d.captionCounts[key] || 0; };
    const reset = function () { for (const key of Object.keys(d.captionCounts)) d.captionCounts[key] = 0; d.clearCaptions(); };
    d.loadStation('classic', 0);
    d.setDebugOption('invulnerable', true); d.setDebugOption('unlimitedScanner', true);
    d.settings.captions = 'all';

    // A noise some way off: it trills and goes to look.
    reset();
    d.teleport(44.5, 52.5, 0); d.simulate(0.1);
    d.spawnHollow(36.5, 52.5); d.hollow.graceTimer = 0; d.hollow.state = 0; d.hollow.trillCooldown = 0;
    d.emitNoise(d.hollow.figure.x - 9, d.hollow.figure.z, 14);
    result.trill = { state: d.hollow.state, captions: count('hollowTrill') };

    // The beam on it while it wanders: it turns toward the light. Held on, it ends up enraged.
    reset();
    d.teleport(44.5, 52.5, -Math.PI / 2); d.player.pitch = 0; // facing it
    d.spawnHollow(39.5, 52.5); d.hollow.graceTimer = 0; d.hollow.state = 0; d.hollow.anger = 0; d.hollow.turnCaptionCooldown = 0;
    d.setScanHeld(true);
    d.simulate(0.5);
    result.beam = { turns: count('hollowTurns') };
    for (let time = 0; time < 8 && count('hollowEnraged') === 0; time += 0.25) d.simulate(0.25);
    result.beam.enraged = count('hollowEnraged');
    // Already hunting and not yet enraged, the beam makes it shriek.
    reset();
    d.spawnHollow(39.5, 52.5); d.hollow.graceTimer = 0; d.hollow.state = 2; d.hollow.timeSinceSensed = 0; d.hollow.anger = 0.3; d.hollow.enragedTimer = 0;
    d.simulate(1);
    result.beam.shriek = count('hollowShriek') > 0;
    result.beam.shriekOnScreen = d.getCaptionLines().some((line) => line.key === 'hollowShriek');
    d.setScanHeld(false);

    // The chase is over with menace full: the breather begins, and it is moving off.
    reset();
    d.setDebugOption('creaturesIgnorePlayer', true);
    d.hollow.anger = 0; d.hollow.enragedTimer = 0;
    d.director.phase = 0; d.director.phaseTime = 50; d.director.menace = 1; d.director.hasPeaked = true;
    d.hollow.state = 0; d.simulate(0.4);
    result.movingOff = { phase: d.director.phase, captions: count('hollowMovingOff') };
    d.hollow.isActive = false;
    d.setDebugOption('creaturesIgnorePlayer', false);

    // The apparition that stands behind you breathes.
    reset();
    const phantom = d.summonPhantom('behind');
    result.breath = { came: phantom !== null, captions: count('phantomBreath'), where: (d.getCaptionLines().filter((line) => line.key === 'phantomBreath')[0] || {}).where };
    if (phantom) d.summonPhantom('watcher'); // sends the one behind away; whatever comes instead is silent

    // The Stills, woken, come up behind someone who is not looking.
    reset();
    d.awakenStills();
    const still = d.stills.filter((candidate) => candidate.isPresent)[0].figure;
    const spot = d.findWalkableSpotNear(still.x + 3, still.z);
    d.teleport(spot.x, spot.z, Math.atan2(spot.x - still.x, -(spot.z - still.z))); // back to it
    for (let time = 0; time < 12 && count('stillShifts') === 0; time += 0.5) d.simulate(0.5);
    result.stills = count('stillShifts');

    // The lift on its way down rings its bell.
    d.loadStation('classic', 0);
    reset();
    d.teleport(d.lift.x + 4, d.lift.z, 0);
    d.game.flags.uploadStarted = true; d.game.liftCountdown = 30;
    d.simulate(3.5);
    result.bell = count('liftBell');

    // In a station that has a vent, the Hollow crawling through it.
    let vent = null;
    for (let seed = 1; seed <= 12 && !vent; seed++) {
      d.loadStation('generated', seed, 'medium', 'mixed', 'one');
      if (d.level.ventCount === 0) continue;
      for (let z = d.level.boundsMinimumZ; z < d.level.boundsMaximumZ && !vent; z++) {
        for (let x = d.level.boundsMinimumX; x < d.level.boundsMaximumX && !vent; x++) {
          if (d.isVentAt(x + 0.5, z + 0.5) && d.isVentAt(x + 1.5, z + 0.5) && d.isVentAt(x + 2.5, z + 0.5)) vent = { x: x + 0.5, z: z + 0.5, stepX: 1, stepZ: 0, seed: seed };
          else if (d.isVentAt(x + 0.5, z + 0.5) && d.isVentAt(x + 0.5, z + 1.5) && d.isVentAt(x + 0.5, z + 2.5)) vent = { x: x + 0.5, z: z + 0.5, stepX: 0, stepZ: 1, seed: seed };
        }
      }
    }
    result.vent = vent;
    if (vent) {
      reset();
      d.setDebugOption('invulnerable', true);
      d.setDebugOption('creaturesIgnorePlayer', true);
      const near = d.findWalkableSpotNear(vent.x + 3, vent.z + 3);
      d.teleport(near.x, near.z, 0);
      d.spawnHollow(vent.x, vent.z); d.hollow.graceTimer = 999;
      for (let time = 0; time < 4; time += 0.1) { d.hollow.state = 0; d.hollow.targetX = vent.x + vent.stepX * 2; d.hollow.targetZ = vent.z + vent.stepZ * 2; d.simulate(0.1); }
      result.ventSteps = { captions: count('hollowVentSteps'), metresAway: Math.round(Math.hypot(near.x - vent.x, near.z - vent.z) * 10) / 10 };
      d.hollow.isActive = false;
      d.setDebugOption('creaturesIgnorePlayer', false);
    }
    d.loadStation('classic', 0);
    return result;
  });
  check('a noise some way off: it trills, and goes to look', rest.trill.state === 1 && rest.trill.captions === 1, rest.trill);
  check('the beam on it: it turns toward the light; held on it until it is enraged, the beam no longer holds it', rest.beam.turns === 1 && rest.beam.enraged === 1, rest.beam);
  check('in the beam while it hunts, it shrieks', rest.beam.shriek && rest.beam.shriekOnScreen, rest.beam);
  check('when the breather begins near you, it is moving off', rest.movingOff.phase === 1 && rest.movingOff.captions === 1, rest.movingOff);
  check('the apparition behind you breathes, and the arrow points behind', rest.breath.came && rest.breath.captions === 1 && /^[↓↙↘] (close|near)$/.test(rest.breath.where || ''), rest.breath);
  check('the Stills coming up behind you shift', rest.stills >= 1, rest.stills);
  check('the lift on its way down rings its bell', rest.bell >= 1, rest.bell);
  check('the Hollow crawling through a vent booms on the sheet metal', rest.vent !== null && rest.ventSteps.captions >= 1 && rest.ventSteps.metresAway < 12, [rest.vent, rest.ventSteps]);

  check('no script errors were reported', problems.length === 0, problems);

  // --- kept between visits, and nonsense put right ---
  await inGame(() => { window.localStorage.setItem('last-return-settings', JSON.stringify(Object.assign(JSON.parse(window.localStorage.getItem('last-return-settings')), { captions: 'off' }))); });
  await page.reload();
  await page.waitForFunction(() => window.lastReturnDebug !== undefined);
  const kept = await inGame(() => window.lastReturnDebug.settings.captions);
  await inGame(() => { window.localStorage.setItem('last-return-settings', JSON.stringify(Object.assign(JSON.parse(window.localStorage.getItem('last-return-settings')), { captions: 'loud' }))); });
  await page.reload();
  await page.waitForFunction(() => window.lastReturnDebug !== undefined);
  const repaired = await inGame(() => ({ setting: window.lastReturnDebug.settings.captions, titleShows: document.getElementById('title-captions').value }));
  check('the level is kept for the next visit, and a stored value that is none of the three becomes "tells"',
    kept === 'off' && repaired.setting === 'tells' && repaired.titleShows === 'tells', { kept: kept, repaired: repaired });

  await browser.close();

  // --- where the captions stand on the screen: a phone held sideways, a tablet, a desktop screen ---
  // The longest sentence the work order can show, with its numbers filled in: it makes the work order tallest.
  const questSource = fs.readFileSync(path.join(sourceFolder, '09-quests.js'), 'utf8');
  const objectiveSentences = Array.from(questSource.matchAll(/objective: '((?:[^'\\]|\\.)+)'/g)).map((match) => match[1].replace(/\{[a-z]+\}/gi, '3'));
  const longestObjective = objectiveSentences.reduce((longest, sentence) => (sentence.length > longest.length ? sentence : longest), '');
  check('the longest sentence for the work order was found in the quests', longestObjective.length >= 100, longestObjective);
  const screens = [
    { name: 'phone 844 x 390', width: 844, height: 390, isPhone: true, isSideColumn: true },
    { name: 'phone 800 x 360', width: 800, height: 360, isPhone: true, isSideColumn: true },
    { name: 'phone 667 x 375', width: 667, height: 375, isPhone: true, isSideColumn: true },
    { name: 'tablet 1024 x 768', width: 1024, height: 768, isPhone: true, isSideColumn: false },
    { name: 'desktop 1280 x 720', width: 1280, height: 720, isPhone: false, isSideColumn: false }
  ];
  for (const screen of screens) {
    const opened = await openGame({ dev: true, width: screen.width, height: screen.height, isPhone: screen.isPhone });
    await startGame(opened.page, screen.isPhone);
    const measureLayout = async (objectiveText) => {
      const putUp = () => opened.page.evaluate((objective) => {
        const d = window.lastReturnDebug;
        d.setDebugOption('invulnerable', true);
        d.hollow.isActive = false;
        d.settings.captions = 'all';
        if (objective) d.game.objectiveText = objective;
        d.simulate(0.3); // the work order is written out afresh ten times a second
        const source = { x: d.player.x + 2, z: d.player.z + 2 };
        for (const key of ['hollowRoar', 'doorPoundedLast', 'hollowVentSteps', 'hatchForced']) d.showCaption(key, source);
        d.getCaptionLines();
        const boxOf = (selector) => {
          const element = document.querySelector(selector);
          if (!element || element.hidden || element.closest('[hidden]')) return null;
          const rectangle = element.getBoundingClientRect();
          return { left: Math.round(rectangle.left), top: Math.round(rectangle.top), right: Math.round(rectangle.right), bottom: Math.round(rectangle.bottom) };
        };
        const lines = Array.from(document.querySelectorAll('.hud-caption-line'));
        return {
          boxes: { captions: boxOf('#hud-caption'), workOrder: boxOf('#hud-block-objective'), map: boxOf('#touch-map'), pause: boxOf('#touch-pause'),
            minimap: boxOf('#hud-block-map'), meters: boxOf('#hud-block-instruments'), ring: boxOf('#reticle-ring') },
          lineCount: lines.length,
          linesWithWhereFirst: lines.filter((line) => line.firstElementChild.classList.contains('hud-caption-where')).length
        };
      }, objectiveText);
      await putUp();
      await drawFrames(opened.page, 3); // the ring takes its size from the beam when a frame is drawn
      return putUp();
    };
    const overlapsIn = (boxes) => {
      const names = Object.keys(boxes).filter((name) => boxes[name] !== null), overlaps = [];
      for (let first = 0; first < names.length; first++) {
        for (let second = first + 1; second < names.length; second++) {
          const one = boxes[names[first]], other = boxes[names[second]];
          if (one.left < other.right && other.left < one.right && one.top < other.bottom && other.top < one.bottom) overlaps.push(names[first] + ' over ' + names[second]);
        }
      }
      return overlaps;
    };
    const usual = await measureLayout('');
    if (screen.isSideColumn) {
      const withLongest = await measureLayout(longestObjective);
      check(screen.name + ': four captions, the work order, MAP, PAUSE, the minimap, the meters and the aiming ring keep clear of one another',
        usual.lineCount === 4 && overlapsIn(usual.boxes).length === 0, { overlaps: overlapsIn(usual.boxes), boxes: usual.boxes });
      check(screen.name + ': the same with the longest sentence in the work order, and the captions hang under it',
        withLongest.lineCount === 4 && overlapsIn(withLongest.boxes).length === 0 && withLongest.boxes.workOrder.bottom > usual.boxes.workOrder.bottom &&
        withLongest.boxes.captions.top >= withLongest.boxes.workOrder.bottom, { overlaps: overlapsIn(withLongest.boxes), boxes: withLongest.boxes });
      check(screen.name + ': the arrow and the distance come first in every caption line', usual.linesWithWhereFirst === 4, usual.linesWithWhereFirst);
    } else {
      const captions = usual.boxes.captions;
      const isCentred = Math.abs((captions.left + captions.right) / 2 - screen.width / 2) <= 1;
      const isWhereItWas = screen.isPhone ? Math.abs(captions.top - screen.height * 0.16) <= 1 : Math.abs(captions.bottom - screen.height * 0.97) <= 1;
      check(screen.name + ': the captions are where they were (in the middle, ' + (screen.isPhone ? 'under the work order' : 'at the bottom') + '), the text first and the arrow after',
        usual.lineCount === 4 && isCentred && isWhereItWas && usual.linesWithWhereFirst === 0 && overlapsIn({ captions: captions, ring: usual.boxes.ring }).length === 0,
        { captions: captions, ring: usual.boxes.ring, whereFirst: usual.linesWithWhereFirst });
    }
    check(screen.name + ': no script errors were reported', opened.problems.length === 0, opened.problems);
    await opened.browser.close();
  }

  if (failures.length > 0) {
    console.log('\n' + failures.length + ' caption check(s) failed:');
    for (const failure of failures) console.log('  - ' + failure);
    process.exit(1);
  }
  console.log('\nAll caption checks passed.');
})().catch((error) => { console.error('Captions test crashed:', error); process.exit(1); });
