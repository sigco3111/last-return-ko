// Checks the generators a station can have besides Generator 2 (Generator 1, 3 and 4), and where fuel cans go:
// how many a station gets, that a can is near the generator it is for, that a small generator only starts with
// the mains on and fuel in its tank, that starting one brings the Hollow, that the lift waits for all of them,
// and that the map shows brightly only what can be acted on now.
const { openGame, startGame, drawFrames } = require('./browser-harness.js');

const failures = [];
function check(description, condition, detail) {
  const line = (condition ? 'ok    ' : 'FAIL  ') + description + (detail !== undefined ? '  ' + JSON.stringify(detail) : '');
  console.log(line);
  if (!condition) failures.push(description);
}

(async () => {
  const { browser, page, problems } = await openGame({ dev: true });
  const inGame = (callback, argument) => page.evaluate(callback, argument);
  await startGame(page, false);

  // --- how many, and where ---
  const survey = await inGame(() => {
    const d = window.lastReturnDebug, result = { sizes: {}, bad: [], canSteps: [], mainCanSteps: [] };
    const layouts = ['tight', 'mixed', 'sprawling', 'sparse'];
    const describe = function () {
      return d.level.mission.extraGenerators.map((generator) => [generator.objectId, generator.x, generator.z, generator.needsFuel, generator.fuelCanId].join(':')).join(' ') + ' | ' +
        d.interactables.filter((thing) => thing.mapLabel === 'FUEL').map((thing) => [thing.objectId, thing.x, thing.z].join(':')).join(' ');
    };
    for (const size of ['small', 'medium', 'large', 'massive']) {
      const counts = [];
      for (let seed = 1; seed <= 16; seed++) {
        const built = d.loadStation('generated', seed, size, layouts[seed % 4], seed % 2 ? 'one' : 'two');
        if (!built) { result.bad.push(size + ' ' + seed + ': not built'); continue; }
        const found = d.auditLayout().concat(d.auditProgression());
        if (found.length > 0) result.bad.push(size + ' ' + seed + ': ' + found.slice(0, 3).join('; '));
        const generators = d.level.mission.extraGenerators;
        counts.push(generators.length);
        for (const generator of generators) {
          if (!generator.needsFuel) continue;
          const can = d.findInteractable(generator.fuelCanId), stand = d.findWalkableSpotNear(generator.x, generator.z);
          d.teleport(stand.x, stand.z, 0);
          result.canSteps.push(d.stepsFromPlayerTo(can.x, can.z));
        }
        if (d.level.mission.needsFuel) {
          const can = d.findInteractable(d.missionObjectIds.fuelCan), stand = d.findWalkableSpotNear(d.generator.x, d.generator.z);
          d.teleport(stand.x, stand.z, 0);
          result.mainCanSteps.push(d.stepsFromPlayerTo(can.x, can.z));
        }
      }
      result.sizes[size] = { fewest: Math.min.apply(null, counts), most: Math.max.apply(null, counts), allowed: d.sizePresets[size].extraGenerators, counts: counts.join('') };
    }
    result.canSteps.sort((a, b) => a - b); result.mainCanSteps.sort((a, b) => a - b);
    // The same seed gives the same generators and cans; another seed gives others.
    d.loadStation('generated', 7, 'massive', 'mixed', 'two');
    const first = describe();
    d.loadStation('generated', 8, 'massive', 'mixed', 'two');
    result.anotherSeedDiffers = describe() !== first;
    d.loadStation('generated', 7, 'massive', 'mixed', 'two');
    result.sameSeedSame = describe() === first;
    d.loadStation('classic', 0);
    result.classic = { generators: d.level.mission.extraGenerators.length, cans: d.interactables.filter((thing) => thing.mapLabel === 'FUEL').length,
      problems: d.auditLayout().concat(d.auditProgression()) };
    return result;
  });
  const median = (list) => list[Math.floor(list.length / 2)];
  check('64 stations of every size: each can still be finished, with its generators and cans where the rules allow', survey.bad.length === 0, survey.bad.slice(0, 4));
  check('every size has as many extra generators as its range says, and uses the whole range',
    Object.keys(survey.sizes).every((size) => survey.sizes[size].fewest === survey.sizes[size].allowed[0] && survey.sizes[size].most === survey.sizes[size].allowed[1]), survey.sizes);
  check('a fuel can is near the generator it is for: half within 25 steps of walking, none over 60',
    survey.canSteps.length >= 20 && median(survey.canSteps) <= 25 && survey.canSteps[survey.canSteps.length - 1] <= 60, survey.canSteps);
  check('the can for Generator 2 too: half within 30 steps, none over 45',
    survey.mainCanSteps.length >= 10 && median(survey.mainCanSteps) <= 30 && survey.mainCanSteps[survey.mainCanSteps.length - 1] <= 45, survey.mainCanSteps);
  check('the same seed always gives the same generators and cans, and another seed gives others', survey.sameSeedSame && survey.anotherSeedDiffers, [survey.sameSeedSame, survey.anotherSeedDiffers]);
  check('Kessel-9 has none of this and can still be finished', survey.classic.generators === 0 && survey.classic.cans === 0 && survey.classic.problems.length === 0, survey.classic);

  // --- the rules, in a large station with two extra generators, one with an empty tank and one without,
  //     an empty tank on Generator 2 as well, and no other quest to get in the way ---
  const found = await inGame(() => {
    const d = window.lastReturnDebug;
    for (let seed = 1; seed < 400; seed++) {
      if (!d.loadStation('generated', seed, 'large', 'mixed', 'one')) continue;
      const mission = d.level.mission, generators = mission.extraGenerators;
      if (generators.length >= 2 && generators.some((generator) => generator.needsFuel) && generators.some((generator) => !generator.needsFuel) &&
          mission.needsFuel && d.level.quests.every((quest) => ['spools', 'fuel', 'generators'].indexOf(quest.key) >= 0)) return { seed: seed, generators: JSON.parse(JSON.stringify(generators)) };
    }
    return null;
  });
  check('there is a station to try the rules in', found !== null, found);
  if (found) {
    const rules = await inGame(([found]) => {
      const d = window.lastReturnDebug, flags = d.game.flags, ids = d.missionObjectIds, result = {};
      const thirsty = found.generators.filter((generator) => generator.needsFuel)[0], ready = found.generators.filter((generator) => !generator.needsFuel)[0];
      const messages = () => Array.from(document.querySelectorAll('#hud-messages .hud-message')).map((element) => element.textContent).join(' | ');
      const wanted = (objectId) => d.isInteractableWantedNow(d.findInteractable(objectId));
      d.setDebugOption('invulnerable', true);
      d.hollow.isActive = false;
      flags.hasLeftLift = true;

      // Before the mains is on.
      result.beforeMains = { wantedOnMap: { generator2: wanted(2), small: wanted(ready.objectId), ownCan: wanted(ids.fuelCan), terminal: wanted(1), spool: wanted(3) } };
      d.use(ready.objectId);
      result.beforeMains.refused = flags.extraGeneratorsRunning === 0 && /no control power/.test(messages());
      // Any can fills any tank: the can meant for a small generator starts Generator 2, and you carry one at a time.
      d.use(2);
      result.generator2 = { refusedEmpty: !flags.powerOn };
      d.use(thirsty.fuelCanId);
      result.generator2.tookTheOtherCan = flags.hasFuel === true;
      d.use(ids.fuelCan);
      result.generator2.secondCanRefused = d.findInteractable(ids.fuelCan).isAvailable === true && /already carrying/.test(messages());
      d.use(2);
      result.generator2.started = flags.powerOn === true && flags.hasFuel === false;
      d.hollow.isActive = false;

      // Dispatch says, some seconds later, that the lift needs the others, and marks them.
      result.beforeTold = { knows: flags.knowsAboutGenerators, marked: d.findInteractable(ready.objectId).isDiscovered, objective: d.game.objectiveText };
      d.setDebugOption('freezeCreatures', true);
      d.simulate(21);
      result.told = { knows: flags.knowsAboutGenerators, marked: found.generators.every((generator) => d.findInteractable(generator.objectId).isDiscovered),
        objective: d.game.objectiveText, radio: /more generators/.test(messages()) };
      d.setDebugOption('freezeCreatures', false);
      d.hollow.isActive = false;

      // With the mains on.
      result.afterMains = { wantedOnMap: { generator2Gone: d.findInteractable(2).isAvailable === false, ready: wanted(ready.objectId), thirsty: wanted(thirsty.objectId), can: wanted(ids.fuelCan), terminal: wanted(1) } };
      d.use(thirsty.objectId);
      result.emptyTank = { refused: flags.extraGeneratorsRunning === 0 && /day tank empty/.test(messages()) };
      d.grantSpools();
      d.use(1);
      result.liftRefuses = { started: flags.uploadStarted, uploaded: flags.spoolsUploaded, said: /winch supply low\. Generators running: 1 of/.test(messages()) };

      // Starting one is loud. The Hollow, standing twelve metres off and unaware, comes to look at the generator.
      const far = d.findWalkableSpotNear(ready.x + 12, ready.z);
      const stand = d.findWalkableSpotNear(ready.x, ready.z);
      d.teleport(stand.x, stand.z, 0); d.simulate(0.1);
      d.spawnHollow(far.x, far.z); d.hollow.graceTimer = 0; d.hollow.state = 0;
      const hollowMetres = Math.hypot(far.x - ready.x, far.z - ready.z);
      d.use(ready.objectId);
      result.loud = { hollowMetres: Math.round(hollowMetres * 10) / 10, heardFromMetres: d.tuning.noiseRadiusGeneratorStart * d.game.difficulty.hearingFactor,
        hollowState: d.hollow.state, goesTo: [d.hollow.targetX, d.hollow.targetZ], generatorAt: [ready.x, ready.z],
        running: flags.extraGeneratorsRunning, gone: d.findInteractable(ready.objectId).isAvailable === false };
      d.hollow.isActive = false;
      // Standing right at it, the Hollow knows where you are.
      d.use(ids.fuelCan);
      const near = d.findWalkableSpotNear(thirsty.x + 4, thirsty.z);
      const stand2 = d.findWalkableSpotNear(thirsty.x, thirsty.z);
      d.teleport(stand2.x, stand2.z, 0); d.simulate(0.1);
      d.spawnHollow(near.x, near.z); d.hollow.graceTimer = 0; d.hollow.state = 0;
      result.objectiveWithCan = d.game.objectiveText;
      result.thirstyWantedWithCan = wanted(thirsty.objectId);
      d.use(thirsty.objectId);
      result.close = { hollowMetres: Math.round(Math.hypot(near.x - thirsty.x, near.z - thirsty.z) * 10) / 10, hollowState: d.hollow.state, fuelUsed: flags.hasFuel === false, running: flags.extraGeneratorsRunning };
      d.hollow.isActive = false;

      // The rest, then the lift.
      for (const generator of found.generators) {
        if (d.findInteractable(generator.objectId).isAvailable) { if (generator.needsFuel) d.use(generator.fuelCanId); d.use(generator.objectId); d.hollow.isActive = false; }
      }
      result.all = { running: flags.extraGeneratorsRunning, of: found.generators.length, missing: d.areGeneratorsMissing(), objective: d.game.objectiveText, terminalWanted: wanted(1), said: /That is all of them/.test(messages()) };
      d.use(1);
      result.liftCalled = flags.uploadStarted === true;
      d.hollow.isActive = false;
      return result;
    }, [found]);
    await drawFrames(page, 8); // the screen's text is brought up to date a few times a second, and only while frames are drawn
    const chip = await inGame(() => document.getElementById('chip-extra').textContent);

    check('before the mains is on: a small generator will not start, and the map shows Generator 2, its can and the spool brightly, the small one and the terminal dimly',
      rules.beforeMains.refused && rules.beforeMains.wantedOnMap.generator2 && rules.beforeMains.wantedOnMap.ownCan && rules.beforeMains.wantedOnMap.spool &&
      !rules.beforeMains.wantedOnMap.small && !rules.beforeMains.wantedOnMap.terminal, rules.beforeMains);
    check('any can fills any tank, and you carry one at a time: the can left for a small generator starts Generator 2, and a second can is refused meanwhile',
      rules.generator2.refusedEmpty && rules.generator2.tookTheOtherCan && rules.generator2.secondCanRefused && rules.generator2.started, rules.generator2);
    check('some seconds after Generator 2 starts, Dispatch says the lift needs the others and marks them on the map; the objective counts them',
      !rules.beforeTold.knows && !rules.beforeTold.marked && !/generator/i.test(rules.beforeTold.objective) &&
      rules.told.knows && rules.told.marked && rules.told.radio && /every generator running: 1 of/.test(rules.told.objective), [rules.beforeTold, rules.told]);
    check('with the mains on: the map shows the generator that can start and a can for the one that cannot, brightly; the empty one and the terminal dimly',
      rules.afterMains.wantedOnMap.generator2Gone && rules.afterMains.wantedOnMap.ready && rules.afterMains.wantedOnMap.can &&
      !rules.afterMains.wantedOnMap.thirsty && !rules.afterMains.wantedOnMap.terminal, rules.afterMains);
    check('a small generator with an empty tank will not start without a can', rules.emptyTank.refused, rules.emptyTank);
    check('the lift terminal will not take the upload while a generator is not running, and says how many are', !rules.liftRefuses.started && !rules.liftRefuses.uploaded && rules.liftRefuses.said, rules.liftRefuses);
    check('starting one is loud: the Hollow twelve metres off, unaware, comes to look at that generator',
      rules.loud.running === 1 && rules.loud.gone && rules.loud.hollowMetres < rules.loud.heardFromMetres && rules.loud.hollowMetres > rules.loud.heardFromMetres * 0.3 &&
      rules.loud.hollowState === 1 && Math.hypot(rules.loud.goesTo[0] - rules.loud.generatorAt[0], rules.loud.goesTo[1] - rules.loud.generatorAt[1]) < 0.01, rules.loud);
    check('carrying a can, the objective says so and the empty generator shows brightly; four metres from the Hollow, starting it is being found',
      /carrying a fuel can/.test(rules.objectiveWithCan) && rules.thirstyWantedWithCan && rules.close.fuelUsed && rules.close.running === 2 && rules.close.hollowState === 2, [rules.objectiveWithCan, rules.close]);
    check('with every generator running the winch has its power: the objective is the lift again, the terminal shows brightly, and it calls the lift',
      rules.all.running === rules.all.of && !rules.all.missing && rules.all.said && !/generator/i.test(rules.all.objective) && rules.all.terminalWanted && rules.liftCalled, rules.all);
    check('the screen counts them: GENERATORS ' + (found.generators.length + 1) + '/' + (found.generators.length + 1),
      chip.indexOf('GENERATORS ' + (found.generators.length + 1) + '/' + (found.generators.length + 1)) >= 0, chip);

    // --- a new descent starts with all of it as it was ---
    const again = await inGame(([found]) => {
      const d = window.lastReturnDebug, flags = d.game.flags;
      d.loadStation('generated', found.seed, 'large', 'mixed', 'one');
      return { running: flags.extraGeneratorsRunning, knows: flags.knowsAboutGenerators, carrying: flags.hasFuel,
        available: found.generators.every((generator) => d.findInteractable(generator.objectId).isAvailable && !d.findInteractable(generator.objectId).isDiscovered),
        tanks: d.level.mission.extraGenerators.every((generator) => !generator.isRunning && !generator.isFilled),
        cans: d.interactables.filter((thing) => thing.mapLabel === 'FUEL' && thing.isAvailable).length,
        cansWanted: found.generators.filter((generator) => generator.needsFuel).length + 1 };
    }, [found]);
    check('a new descent: no generator running, every tank as it was, every can back, nothing marked',
      again.running === 0 && !again.knows && !again.carrying && again.available && again.tanks && again.cans === again.cansWanted, again);

    // --- the lift terminal tells you if Dispatch has not yet ---
    const told = await inGame(() => {
      const d = window.lastReturnDebug, flags = d.game.flags;
      d.grantPower(); d.grantSpools();
      const before = flags.knowsAboutGenerators;
      d.use(1);
      return { before: before, after: flags.knowsAboutGenerators, marked: d.level.mission.extraGenerators.every((generator) => d.findInteractable(generator.objectId).isDiscovered) };
    });
    check('if you reach the terminal before Dispatch has said it, the terminal tells you and the generators go on the map', !told.before && told.after && told.marked, told);
  }

  check('no script errors were reported', problems.length === 0, problems);
  await browser.close();

  if (failures.length > 0) {
    console.log('\n' + failures.length + ' generator check(s) failed:');
    for (const failure of failures) console.log('  - ' + failure);
    process.exit(1);
  }
  console.log('\nAll generator checks passed.');
})().catch((error) => { console.error('Generators test crashed:', error); process.exit(1); });
