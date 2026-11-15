// Checks the "Custom" threat level: the panel on the title screen, that what is set there is what the
// game then plays by, that each setting really changes the thing it says it changes, and that a custom
// descent is named as such at the end and keeps its best times to itself.
const { openGame, startGame, drawFrames } = require('./browser-harness.js');

const failures = [];
function check(description, condition, detail) {
  const line = (condition ? 'ok    ' : 'FAIL  ') + description + (detail !== undefined ? '  ' + JSON.stringify(detail) : '');
  console.log(line);
  if (!condition) failures.push(description);
}

(async () => {
  const { browser, page, problems } = await openGame(); // the game as shipped: no debug mode needed for any of this
  const inGame = (callback, argument) => page.evaluate(callback, argument);
  // Sets one control in the custom panel the way a hand would: change it, and let the page hear about it.
  const setControl = (key, value) => page.evaluate(([id, wanted]) => {
    const control = document.getElementById(id);
    if (control.type === 'checkbox') control.checked = wanted; else control.value = String(wanted);
    control.dispatchEvent(new Event('input', { bubbles: true }));
  }, ['custom-' + key, value]);
  const readRow = (key) => page.evaluate((id) => {
    const row = document.getElementById(id).closest('.custom-row');
    return { value: row.querySelector('.custom-value').textContent, note: row.querySelector('.custom-note').textContent, changed: row.classList.contains('is-changed') };
  }, 'custom-' + key);
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => Boolean(window.noReturnDebug));

  // --- the presets and the list of settings agree with each other ---
  const shape = await inGame(() => {
    const d = window.noReturnDebug, missing = [];
    for (const presetKey in d.difficultyPresets) {
      for (const option of d.customDifficultyOptions) {
        const value = d.difficultyPresets[presetKey][option.key];
        const isRightKind = option.kind === 'switch' ? typeof value === 'boolean' : typeof value === 'number';
        if (!isRightKind) missing.push(presetKey + '.' + option.key);
      }
    }
    return { missing: missing, options: d.customDifficultyOptions.map((option) => option.key), startsAs: d.describeCustomDifficulty(d.settings.customDifficulty) };
  });
  check('every preset has a value of the right kind for everything a custom threat level can set', shape.missing.length === 0, shape.missing);
  check('a custom threat level starts out the same as Standard', shape.startsAs === 'The same as Standard.', shape.startsAs);

  // --- the title screen: choosing Custom opens the panel, with a row for each setting ---
  const beforeChoosing = await page.evaluate(() => ({ panelHidden: document.getElementById('screen-custom').hidden, adjustHidden: document.getElementById('button-custom-difficulty').hidden }));
  await page.evaluate(() => document.getElementById('difficulty-custom').click());
  const opened = await page.evaluate(() => ({
    panelHidden: document.getElementById('screen-custom').hidden, adjustHidden: document.getElementById('button-custom-difficulty').hidden,
    rows: document.querySelectorAll('#custom-options .custom-row').length, titleStillThere: !document.getElementById('screen-title').hidden,
    setting: window.noReturnDebug.settings.difficulty
  }));
  check('choosing Custom opens its panel over the title screen, with one row for each setting',
    beforeChoosing.panelHidden && beforeChoosing.adjustHidden && !opened.panelHidden && !opened.adjustHidden && opened.titleStillThere &&
    opened.rows === shape.options.length && opened.setting === 'custom', { before: beforeChoosing, opened: opened });

  await setControl('hollowSpeedFactor', 1.35);
  await setControl('hearingFactor', 0.7);
  await setControl('checkpointsEnabled', false);
  await setControl('phantomFactor', 2);
  const afterSetting = await inGame(() => JSON.parse(JSON.stringify(window.noReturnDebug.settings.customDifficulty)));
  const speedRow = await readRow('hollowSpeedFactor'), heatRow = await readRow('heatFactor'), lifeRow = await readRow('checkpointsEnabled');
  check('moving a control changes the setting, and the row says what it now comes to',
    afterSetting.hollowSpeedFactor === 1.35 && afterSetting.hearingFactor === 0.7 && afterSetting.checkpointsEnabled === false && afterSetting.phantomFactor === 2 &&
    speedRow.value === '135 %' && /cannot outrun/.test(speedRow.note) && /One life/.test(lifeRow.note), { settings: afterSetting, speedRow: speedRow, lifeRow: lifeRow });
  check('rows that differ from Standard are marked, rows that do not are not', speedRow.changed && lifeRow.changed && !heatRow.changed, [speedRow.changed, lifeRow.changed, heatRow.changed]);
  const summary = await page.evaluate(() => [document.getElementById('custom-summary').textContent, document.getElementById('difficulty-description').textContent]);
  check('the panel and the title screen both say how it differs from Standard',
    summary[0] === summary[1] && /Hollow speed 135 %/.test(summary[0]) && /Hollow hearing 70 %/.test(summary[0]) && /Apparitions many/.test(summary[0]) && /Checkpoints off/.test(summary[0]), summary);

  await page.evaluate(() => document.getElementById('button-custom-done').click());
  const closed = await page.evaluate(() => document.getElementById('screen-custom').hidden);
  await page.evaluate(() => document.getElementById('button-custom-difficulty').click());
  const reopened = await page.evaluate(() => !document.getElementById('screen-custom').hidden && document.getElementById('custom-hollowSpeedFactor').value === '1.35');
  check('Done closes the panel, and Adjust opens it again with the values as they were left', closed && reopened, [closed, reopened]);

  // --- it is remembered: close the page, open it again ---
  await page.reload();
  await page.waitForFunction(() => Boolean(window.noReturnDebug));
  const remembered = await inGame(() => ({
    difficulty: window.noReturnDebug.settings.difficulty, values: window.noReturnDebug.settings.customDifficulty,
    pill: document.getElementById('difficulty-custom').checked, panelHidden: document.getElementById('screen-custom').hidden,
    description: document.getElementById('difficulty-description').textContent
  }));
  check('after closing and reopening the page, Custom is still chosen with the same values, and the panel does not pop open by itself',
    remembered.difficulty === 'custom' && remembered.pill && remembered.panelHidden && remembered.values.hollowSpeedFactor === 1.35 &&
    remembered.values.checkpointsEnabled === false && /Hollow speed 135 %/.test(remembered.description), remembered);

  // --- "Start from" copies a preset; values that are no good are put right ---
  await page.evaluate(() => { document.getElementById('button-custom-difficulty').click(); document.getElementById('custom-from-nightmare').click(); });
  const fromNightmare = await page.evaluate(() => document.getElementById('custom-summary').textContent);
  await page.evaluate(() => document.getElementById('custom-from-standard').click());
  const fromStandard = await page.evaluate(() => document.getElementById('custom-summary').textContent);
  check('"Start from" copies a preset exactly', fromNightmare === 'The same as Nightmare.' && fromStandard === 'The same as Standard.', [fromNightmare, fromStandard]);
  const repaired = await inGame(() => {
    const d = window.noReturnDebug;
    return d.sanitizeCustomDifficultyValues({ hollowEnabled: 'yes', hollowSpeedFactor: 99, hearingFactor: -3, heatFactor: 1.234, staminaFactor: 'fast', phantomFactor: 0.6, checkpointsEnabled: false, somethingElse: 5 });
  });
  check('stored values that are out of range, of the wrong kind or between steps are put right',
    repaired.hollowEnabled === true && repaired.hollowSpeedFactor === 1.4 && repaired.hearingFactor === 0.5 && repaired.heatFactor === 1.2 &&
    repaired.staminaFactor === 1 && repaired.phantomFactor === 0.5 && repaired.checkpointsEnabled === false && repaired.somethingElse === undefined, repaired);

  // --- what is set is what the game plays by ---
  await setControl('hollowSpeedFactor', 0.8);
  await setControl('staminaFactor', 2);
  await setControl('heatFactor', 0.5);
  await setControl('angerFactor', 2);
  await setControl('phantomFactor', 2);
  await setControl('checkpointsEnabled', false);
  await page.evaluate(() => document.getElementById('button-custom-done').click());
  await startGame(page, false);
  const playing = await inGame(() => {
    const d = window.noReturnDebug, difficulty = d.game.difficulty;
    return { label: difficulty.label, key: difficulty.key, isCustom: difficulty.isCustom, speed: difficulty.hollowSpeedFactor, stamina: difficulty.staminaFactor,
      heat: difficulty.heatFactor, anger: difficulty.angerFactor, phantoms: difficulty.phantomFactor, checkpoints: difficulty.checkpointsEnabled, hearing: difficulty.hearingFactor,
      standardHearing: d.difficultyPresets.standard.hearingFactor, panelHidden: document.getElementById('screen-custom').hidden };
  });
  check('a descent begun on Custom plays by the custom values, and by Standard for whatever was left alone',
    playing.label === 'Custom' && playing.isCustom && /^custom-/.test(playing.key) && playing.speed === 0.8 && playing.stamina === 2 && playing.heat === 0.5 &&
    playing.anger === 2 && playing.phantoms === 2 && playing.checkpoints === false && playing.hearing === playing.standardHearing && playing.panelHidden, playing);

  // --- each new setting changes the thing it says it changes (measured against the same thing at 100 %) ---
  const effects = await inGame(() => {
    const d = window.noReturnDebug, tuning = d.tuning, result = {};
    const withDifficulty = function (changes, measure) {
      const kept = d.game.difficulty;
      d.game.difficulty = Object.assign({}, d.difficultyPresets.standard, changes);
      const value = measure();
      d.game.difficulty = kept;
      return value;
    };
    // Heat: two seconds of painting from cold.
    const heatAfterPainting = function () {
      d.loadStation('classic', 0);
      d.teleport(10.5, 53.5, Math.PI / 2); d.player.heat = 0; d.player.isOverheated = false;
      d.setScanHeld(true); d.simulate(2); d.setScanHeld(false);
      return d.player.heat;
    };
    result.heat = [withDifficulty({ heatFactor: 0.5 }, heatAfterPainting), withDifficulty({}, heatAfterPainting), withDifficulty({ heatFactor: 2 }, heatAfterPainting)];
    result.heatExpectedAtStandard = tuning.heatPerSecondWhilePainting * 2 * d.difficultyPresets.standard.heatFactor;
    // Anger: the Hollow six metres down the corridor, half a second in the beam from calm.
    const angerAfterBeam = function () {
      d.loadStation('classic', 0);
      d.game.flags.hasLeftLift = true;
      d.teleport(14.5, 53.5, Math.PI / 2); d.player.pitch = 0; d.simulate(0.1);
      d.spawnHollow(20.5, 53.5);
      d.hollow.anger = 0; d.hollow.graceTimer = 0;
      d.setScanHeld(true); d.simulate(0.5); d.setScanHeld(false);
      const anger = d.hollow.anger;
      d.hollow.isActive = false;
      return anger;
    };
    result.anger = [withDifficulty({ angerFactor: 0.5 }, angerAfterBeam), withDifficulty({}, angerAfterBeam), withDifficulty({ angerFactor: 2 }, angerAfterBeam)];
    // Apparitions: how many a descent of Kessel-9 may have, how many stand at fixed places, and the wait after one.
    const apparitions = function () {
      d.loadStation('classic', 0);
      const answer = { budget: d.phantomDirector.budget, placed: d.phantoms.length, reason: d.getPhantomHoldReason() };
      d.game.flags.hasLeftLift = true;
      // one watcher, scanned until it goes: what is the wait for the next?
      let phantom = null;
      for (let attempt = 0; attempt < 300 && !phantom; attempt++) {
        const spot = d.findWalkableSpotNear(6 + Math.random() * 60, 10 + Math.random() * 50);
        if (!spot || /LIFT CAR|SHAFT/.test(d.zoneNames[d.getZoneAt(spot.x, spot.z)])) continue;
        d.teleport(spot.x, spot.z, Math.random() * 6.28); d.player.pitch = 0; d.simulate(0.07);
        phantom = d.summonPhantom('watcher');
      }
      if (phantom) {
        d.player.yaw = Math.atan2(phantom.figure.x - d.player.x, -(phantom.figure.z - d.player.z));
        d.player.heat = 0; d.player.isOverheated = false;
        d.setScanHeld(true);
        for (let elapsed = 0; elapsed < 5 && d.phantomDirector.current === phantom; elapsed += 0.1) d.simulate(0.1);
        d.setScanHeld(false);
        answer.waitAfterOne = d.phantomDirector.current === null ? d.phantomDirector.timer : -1;
      }
      return answer;
    };
    result.apparitions = { none: withDifficulty({ phantomFactor: 0 }, apparitions), few: withDifficulty({ phantomFactor: 0.5 }, apparitions),
      normal: withDifficulty({}, apparitions), many: withDifficulty({ phantomFactor: 2 }, apparitions) };
    result.gap = [tuning.phantomGapShortestSeconds, tuning.phantomGapLongestSeconds];
    d.loadStation('classic', 0);
    return result;
  });
  const heat = effects.heat, anger = effects.anger, apparitions = effects.apparitions;
  check('scanner heat: half the heat at 50 %, twice at 200 %',
    Math.abs(heat[1] - effects.heatExpectedAtStandard) < 0.02 && Math.abs(heat[0] - heat[1] / 2) < 0.02 && Math.abs(heat[2] - heat[1] * 2) < 0.03, heat);
  check('its temper in the beam: half the anger at 50 %, twice at 200 %',
    anger[1] > 0.05 && Math.abs(anger[0] - anger[1] / 2) < 0.03 && Math.abs(anger[2] - anger[1] * 2) < 0.06, anger);
  check('apparitions "None": none may come, and the ones that stand at fixed places are gone too',
    apparitions.none.budget === 0 && apparitions.none.placed === 0 && /all of its apparitions/.test(apparitions.none.reason), apparitions.none);
  check('apparitions "Few", "Normal" and "Many": half as many, the usual number, twice as many; Kessel-9 keeps its three placed ones',
    apparitions.normal.budget === 4 && apparitions.few.budget === 2 && apparitions.many.budget === 8 &&
    apparitions.few.placed === 3 && apparitions.normal.placed === 3 && apparitions.many.placed === 3, [apparitions.few, apparitions.normal, apparitions.many]);
  check('with "Many" the wait after one is half as long, with "Few" twice as long',
    apparitions.normal.waitAfterOne >= effects.gap[0] && apparitions.normal.waitAfterOne <= effects.gap[1] &&
    apparitions.many.waitAfterOne >= effects.gap[0] / 2 && apparitions.many.waitAfterOne <= effects.gap[1] / 2 &&
    apparitions.few.waitAfterOne >= effects.gap[0] * 2 && apparitions.few.waitAfterOne <= effects.gap[1] * 2,
    [apparitions.few.waitAfterOne, apparitions.normal.waitAfterOne, apparitions.many.waitAfterOne, effects.gap]);

  // Stamina, through the keyboard: sprint along the main corridor for three seconds on 50 %, 100 % and 200 %.
  const staminaLeft = [];
  for (const factor of [0.5, 1, 2]) {
    await inGame((value) => {
      const d = window.noReturnDebug;
      d.game.difficulty = Object.assign({}, d.difficultyPresets.standard, { staminaFactor: value });
      d.teleport(10.5, 53.5, Math.PI / 2); d.player.stamina = 1; d.player.isStaminaLocked = false; d.simulate(0.1);
    }, factor);
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    staminaLeft.push(await inGame(() => { const d = window.noReturnDebug; d.simulate(3); return d.player.stamina; }));
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
  }
  const staminaSeconds = await inGame(() => window.noReturnDebug.tuning.staminaSeconds);
  const used = staminaLeft.map((left) => 1 - left);
  check('your stamina: three seconds of sprinting uses twice as much of the bar at 50 % and half as much at 200 %',
    Math.abs(used[1] - 3 / staminaSeconds) < 0.05 && Math.abs(used[0] - Math.min(1, used[1] * 2)) < 0.08 && Math.abs(used[2] - used[1] / 2) < 0.04, { left: staminaLeft, used: used });

  // --- one life ---
  const die = async () => {
    await inGame(() => {
      const d = window.noReturnDebug;
      d.game.flags.hasLeftLift = true;
      // In the open, in the middle of the main corridor, with the Hollow two metres off and told where the player is.
      d.teleport(30.5, 52.5, Math.PI / 2); d.simulate(0.1);
      d.spawnHollow(32.5, 52.5);
      d.hollow.graceTimer = 0; d.hollow.knowsPlayerPositionAlways = true;
      for (let step = 0; step < 100 && d.game.mode === 'playing'; step++) d.simulate(0.1);
    });
    await page.waitForFunction(() => window.noReturnDebug.game.mode === 'dead', null, { timeout: 60000 });
  };
  await inGame(() => { const d = window.noReturnDebug; d.game.difficulty = d.getChosenDifficulty(); }); // back to the custom values, which have checkpoints off
  await die();
  const oneLife = await page.evaluate(() => {
    const before = { retryHidden: document.getElementById('button-retry').hidden, startOverThere: !document.getElementById('button-death-restart').hidden, text: document.getElementById('death-lines').textContent };
    window.noReturnDebug.retryFromCheckpoint();
    before.modeAfterTryingAnyway = window.noReturnDebug.game.mode;
    return before;
  });
  check('one life: caught, there is no way to resume, only to start over',
    oneLife.retryHidden && oneLife.startOverThere && /One life/.test(oneLife.text) && oneLife.modeAfterTryingAnyway === 'dead', oneLife);
  await page.evaluate(() => document.getElementById('button-death-restart').click());
  // With checkpoints on, everything is as it always was.
  await page.evaluate(() => document.getElementById('button-custom-difficulty').click());
  await setControl('checkpointsEnabled', true);
  await page.evaluate(() => document.getElementById('button-custom-done').click());
  await startGame(page, false);
  await die();
  const withCheckpoints = await page.evaluate(() => ({ retryHidden: document.getElementById('button-retry').hidden, text: document.getElementById('death-lines').textContent }));
  await page.evaluate(() => document.getElementById('button-retry').click());
  const resumed = await inGame(() => window.noReturnDebug.game.mode);
  check('with checkpoints on, being caught offers the checkpoint as before', !withCheckpoints.retryHidden && !/One life/.test(withCheckpoints.text) && resumed === 'playing', { withCheckpoints: withCheckpoints, resumed: resumed });

  // --- the end of a custom descent: named as custom, with its own best time ---
  await inGame(() => {
    const d = window.noReturnDebug;
    d.hollow.isActive = false;
    d.game.flags.powerOn = true; d.game.flags.spoolsCollected = 3;
    d.teleport(10.2, 55.3, -Math.PI / 2); d.use(1);
    d.hollow.isActive = false;
    d.simulate(41);
    d.hollow.isActive = false;
    d.teleport(6.5, 53.5, Math.PI / 2); d.simulate(0.2);
  });
  await page.waitForFunction(() => window.noReturnDebug.game.mode === 'ending', null, { timeout: 90000 });
  await drawFrames(page, 1);
  const ending = await page.evaluate(() => {
    const rows = {};
    const terms = document.querySelectorAll('#ending-stats dt');
    for (const term of terms) rows[term.textContent] = term.nextElementSibling.textContent;
    const bestKeys = [];
    for (let index = 0; index < window.localStorage.length; index++) if (/^no-return-best-/.test(window.localStorage.key(index))) bestKeys.push(window.localStorage.key(index));
    return { rows: rows, bestKeys: bestKeys, key: window.noReturnDebug.game.difficulty.key };
  });
  check('the ending screen says Custom and lists what was changed',
    ending.rows['Threat level'] === 'Custom' && /Hollow speed 80 %/.test(ending.rows['Custom settings'] || '') && /Your stamina 200 %/.test(ending.rows['Custom settings'] || ''), ending.rows);
  check('its best time is kept under its own values, apart from Standard',
    ending.bestKeys.length === 1 && ending.bestKeys[0] === 'no-return-best-' + ending.key && ending.bestKeys[0] !== 'no-return-best-standard', ending.bestKeys);

  // --- the presets still work, and the panel stays out of the way ---
  await page.evaluate(() => document.getElementById('button-ending-restart').click());
  await page.evaluate(() => document.getElementById('difficulty-nightmare').click());
  const backOnPreset = await page.evaluate(() => ({ adjustHidden: document.getElementById('button-custom-difficulty').hidden, panelHidden: document.getElementById('screen-custom').hidden, description: document.getElementById('difficulty-description').textContent }));
  await startGame(page, false);
  const nightmare = await inGame(() => ({ label: window.noReturnDebug.game.difficulty.label, same: window.noReturnDebug.game.difficulty === window.noReturnDebug.difficultyPresets.nightmare }));
  check('choosing a preset again hides Adjust, and the descent plays on that preset untouched',
    backOnPreset.adjustHidden && backOnPreset.panelHidden && !/Standard, but/.test(backOnPreset.description) && nightmare.label === 'Nightmare' && nightmare.same, { backOnPreset: backOnPreset, nightmare: nightmare });

  check('no script errors were reported', problems.length === 0, problems);
  await browser.close();

  if (failures.length > 0) {
    console.log('\n' + failures.length + ' check(s) failed.');
    process.exit(1);
  }
  console.log('\nAll custom threat level checks passed.');
})().catch((error) => { console.error('Custom threat level test crashed:', error); process.exit(1); });
