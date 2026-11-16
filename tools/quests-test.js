// Checks the quest system (src/js/09-quests.js): that every quest is described completely, that stations get
// the quests their size allows, that adding a quest moves nothing that was there before, that the two quests
// written as nothing but an entry (crew badges, isolation valves) play by the rules their entries give, and
// that Dispatch's lines come when their table says: with a quest, with the Stills waking, with a room.
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

  // Helpers that run inside the page.
  await inGame(() => {
    const d = window.lastReturnDebug, lab = {};
    lab.messages = function () { return Array.from(document.querySelectorAll('#hud-messages .hud-message')).map((element) => element.textContent).join(' | '); };
    // Where every thing of every quest stands, as one text: the same text means the same places.
    lab.describeQuests = function (leaveOut) {
      return d.level.quests.filter((quest) => quest.key !== leaveOut).map((quest) => quest.key + ' ' + quest.objects.map((object) =>
        [object.objectId, object.x, object.z, object.needsItem, object.itemObjectId].concat(object.itemObjectId > 0 ? [d.findInteractable(object.itemObjectId).x, d.findInteractable(object.itemObjectId).z] : []).join(':')).join(',')).join(' / ');
    };
    lab.fresh = function (kind, seed, size, layout, levels) {
      const built = d.loadStation(kind, seed, size, layout, levels);
      d.game.flags.hasLeftLift = true;
      d.setDebugOption('invulnerable', true);
      d.hollow.isActive = false;
      return built;
    };
    window.lab = lab;
  });

  // --- every quest is described completely ---
  const described = await inGame(() => {
    const d = window.lastReturnDebug, wrong = [], lines = d.radioLineKeys, numbers = {};
    for (const quest of d.quests) {
      const say = (what) => wrong.push(quest.key + ': ' + what);
      if (d.quests.filter((other) => other.key === quest.key).length !== 1) say('its key is used twice');
      if (['collect', 'activate', 'supply'].indexOf(quest.kind) < 0) say('unknown kind ' + quest.kind);
      if (['mains', 'upload', 'lift'].indexOf(quest.blocks) < 0) say('holds up nothing the game knows: ' + quest.blocks);
      if (quest.pool && !d.questPools[quest.pool]) say('its pool does not exist: ' + quest.pool);
      if (!quest.text) say('has no text');
      if (quest.tell && lines.indexOf(quest.tell.line) < 0) say('Dispatch has no line called ' + quest.tell.line);
      if (quest.releasedLine && lines.indexOf(quest.releasedLine) < 0) say('Dispatch has no line called ' + quest.releasedLine);
      if (quest.requires && !d.questItems[quest.requires.item]) say('needs an item that does not exist: ' + quest.requires.item);
      if (quest.kind !== 'supply' && typeof quest.build !== 'function') say('has nothing to build its things with');
      // (A quest that does something of its own when a thing is taken has no sentence for that, and the spools have their own place on screen.)
      if (quest.kind === 'collect' && !(quest.text.refused && quest.text.objective && (quest.text.taken || typeof quest.taken === 'function') && (quest.text.chip || quest.always))) say('a collect quest needs the sentences taken, refused, objective and chip');
      if (quest.kind === 'activate' && !(quest.text.activated && quest.text.objective && (quest.text.refused || quest.text.holding))) say('an activate quest needs the sentences activated, objective and refused (or holding)');
      if (quest.kind === 'activate' && quest.needsPower && !quest.text.noPower) say('needs the mains but has no sentence for when it is off');
      if (quest.kind === 'activate' && quest.requires && !quest.text.noItem) say('may need an item but has no sentence for when you have none');
    }
    for (const itemKey in d.questItems) if (d.questItems[itemKey].line && lines.indexOf(d.questItems[itemKey].line) < 0) wrong.push('item ' + itemKey + ': Dispatch has no line called ' + d.questItems[itemKey].line);
    for (const cue of d.dispatchCues) if (lines.indexOf(cue.line) < 0) wrong.push('a cue of Dispatch names a line that does not exist: ' + cue.line);
    return { quests: d.quests.map((quest) => quest.key), wrong: wrong };
  });
  check('every quest is described completely: a kind, what it holds up, its sentences, and lines Dispatch really has', described.quests.length >= 7 && described.wrong.length === 0, described);

  // --- which stations get which quests ---
  const survey = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = { bad: [], sizes: {}, seen: {}, numbersUsedTwice: [] };
    const layouts = ['tight', 'mixed', 'sprawling', 'sparse'];
    for (const size of ['small', 'medium', 'large', 'massive']) {
      const errands = [], all = [];
      for (let seed = 1; seed <= 16; seed++) {
        if (!lab.fresh('generated', seed, size, layouts[seed % 4], seed % 2 ? 'one' : 'two')) { result.bad.push(size + ' ' + seed + ': not built'); continue; }
        const found = d.auditLayout().concat(d.auditProgression());
        if (found.length > 0) result.bad.push(size + ' ' + seed + ': ' + found.slice(0, 3).join('; '));
        for (const quest of d.level.quests) result.seen[quest.key] = (result.seen[quest.key] || 0) + 1;
        errands.push(d.level.quests.filter((quest) => quest.definition.pool === 'errands').length);
        all.push(d.level.quests.length - 1);
        // No two things in a station share a number.
        const numbers = d.interactables.map((thing) => thing.objectId);
        if (new Set(numbers).size !== numbers.length) result.numbersUsedTwice.push(size + ' ' + seed);
      }
      result.sizes[size] = { errandsFewest: Math.min.apply(null, errands), errandsMost: Math.max.apply(null, errands), allowed: d.sizePresets[size].errands, questsInAll: all.join(' ') };
    }
    lab.fresh('generated', 5, 'massive', 'mixed', 'two');
    const first = lab.describeQuests();
    lab.fresh('generated', 6, 'massive', 'mixed', 'two');
    result.anotherSeedDiffers = lab.describeQuests() !== first;
    lab.fresh('generated', 5, 'massive', 'mixed', 'two');
    result.sameSeedSame = lab.describeQuests() === first;
    lab.fresh('classic', 0);
    result.classic = d.level.quests.map((quest) => quest.key);
    return result;
  });
  check('64 stations of every size, with whatever quests the seed gave them: each can be finished, each quest\'s things are where it says', survey.bad.length === 0, survey.bad.slice(0, 4));
  check('every quest turns up in some of them', described.quests.every((key) => survey.seen[key] > 0), survey.seen);
  check('the new draw of quests gives each size as many as its range allows, never more',
    Object.keys(survey.sizes).every((size) => survey.sizes[size].errandsFewest >= survey.sizes[size].allowed[0] && survey.sizes[size].errandsMost <= survey.sizes[size].allowed[1]), survey.sizes);
  check('no two things in a station share an object number', survey.numbersUsedTwice.length === 0, survey.numbersUsedTwice);
  check('the same seed always gives the same quests in the same places, and another seed gives others', survey.sameSeedSame && survey.anotherSeedDiffers, [survey.sameSeedSame, survey.anotherSeedDiffers]);
  check('Kessel-9 asks for the spools and nothing else', survey.classic.join() === 'spools', survey.classic);

  // --- the quests that were jobs before this system existed are where they were then ---
  // These places were read off the game as it was before the quest system, for three stations. They must
  // never change: a seed someone was given has to keep building the station they were given.
  const asBefore = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    const before = {
      'medium 9 mixed one': '13:80.5:49.5 30:63.5:44.5 31:61.5:64.5 40:74.5:49.5 41:78.5:41.5',
      'large 7 sparse one': '13:126.5:47.5 30:42.5:40.5 31:100.5:42.5 41:118.5:46.5',
      'massive 12 tight two': '14:66.5:83.5 20:77.5:61.5 21:39.5:59.5 22:72.5:34.5 30:102.5:83.5 40:91.5:94.5'
    };
    const oldNumbers = [13, 14, 20, 21, 22, 23, 24, 25, 30, 31, 32, 40, 41, 42];
    for (const name in before) {
      const parts = name.split(' ');
      lab.fresh('generated', Number(parts[1]), parts[0], parts[2], parts[3]);
      const now = d.interactables.filter((thing) => oldNumbers.indexOf(thing.objectId) >= 0).sort((a, b) => a.objectId - b.objectId)
        .map((thing) => thing.objectId + ':' + thing.x + ':' + thing.z).join(' ');
      result[name] = { same: now === before[name], now: now };
    }
    return result;
  });
  check('the fuel cans, core samples, breakers and generators of three stations are exactly where they were before the quest system',
    Object.keys(asBefore).every((name) => asBefore[name].same), asBefore);

  // --- adding a quest moves nothing else ---
  const added = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = { moved: [], missing: [], notDone: [], notRefused: [] };
    // A made-up quest: three more valves in every station, described here and nowhere else.
    const valves = d.quests.filter((quest) => quest.key === 'valves')[0];
    const madeUp = Object.assign({}, valves, { key: 'testValves', pool: undefined, count: 3, fewest: 1, tiers: [0, 'beforeLast'], tell: undefined, hideUntilTold: false,
      names: ['Test valve 1', 'Test valve 2', 'Test valve 3'], text: Object.assign({}, valves.text, { refused: 'LIFT CONTROL: test valves shut: {done} of {total}.' }) });
    const stations = [['generated', 3, 'small', 'tight', 'one'], ['generated', 8, 'medium', 'mixed', 'two'], ['generated', 5, 'large', 'sprawling', 'one'], ['generated', 2, 'massive', 'sparse', 'two']];
    const before = stations.map((station) => { lab.fresh.apply(null, station); return lab.describeQuests('testValves') + ' # ' + d.getStationFingerprint().length; });
    d.quests.push(madeUp);
    try {
      stations.forEach((station, index) => {
        const name = station.slice(1, 3).join(' ');
        lab.fresh.apply(null, station);
        if (lab.describeQuests('testValves') !== before[index].split(' # ')[0]) result.moved.push(name);
        const quest = d.findQuest('testValves');
        if (!quest || quest.total < 1) { result.missing.push(name); return; }
        const found = d.auditLayout().concat(d.auditProgression());
        if (found.length > 0) result.moved.push(name + ': ' + found[0]);
        // It plays, too: the terminal refuses for it once everything else is done, and takes the upload after.
        d.grantPower(); d.grantSpools(); d.grantKeycard();
        for (const other of d.level.quests) if (other.key !== 'testValves' && other.key !== 'spools' && other.key !== 'breaker') d.doQuest(other.key);
        d.use(1);
        if (d.game.flags.uploadStarted || d.game.flags.spoolsUploaded || !/test valves shut: 0 of/.test(lab.messages())) result.notRefused.push(name);
        if (!d.doQuest('testValves')) result.notDone.push(name);
        d.hollow.isActive = false;
        d.use(1);
        if (!(d.game.flags.uploadStarted || d.game.flags.spoolsUploaded)) result.notDone.push(name + ': the terminal still refuses');
      });
    } finally {
      d.quests.splice(d.quests.indexOf(madeUp), 1);
    }
    lab.fresh.apply(null, stations[2]);
    result.goneAgain = d.findQuest('testValves') === null && lab.describeQuests('testValves') === before[2].split(' # ')[0];
    return result;
  });
  check('a quest added as one more entry turns up in every station, and not one thing of any other quest moves for it', added.missing.length === 0 && added.moved.length === 0, added);
  check('that made-up quest plays without another line of code: the terminal refuses for it, it can be done, and then the upload goes through',
    added.notRefused.length === 0 && added.notDone.length === 0 && added.goneAgain, added);

  // --- crew badges: a 'collect' quest ---
  const badges = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    for (let seed = 1; seed < 300 && !result.seed; seed++) {
      lab.fresh('generated', seed, 'large', 'mixed', 'one');
      if (d.findQuest('badges') && d.level.quests.every((quest) => ['spools', 'badges', 'generators', 'fuel'].indexOf(quest.key) >= 0)) result.seed = seed;
    }
    if (!result.seed) return result;
    const quest = d.findQuest('badges');
    result.total = quest.total;
    d.grantPower(); d.doQuest('generators'); d.hollow.isActive = false;
    result.objectiveWithSpools = d.game.objectiveText;
    d.grantSpools();
    result.objectiveAlone = d.game.objectiveText;
    result.chipBefore = d.getQuestChips().join(' · ');
    d.use(1);
    result.refused = { started: d.game.flags.uploadStarted, said: /manifest incomplete\. Crew badges loaded: 0 of/.test(lab.messages()) };
    d.use(quest.objects[0].objectId);
    result.afterOne = { done: quest.done, said: lab.messages().indexOf('Crew badge 1 of ' + quest.total) >= 0, gone: d.findInteractable(quest.objects[0].objectId).isAvailable === false, chip: d.getQuestChips().join(' · ') };
    result.wantedOnMap = d.isInteractableWantedNow(d.findInteractable(quest.objects[1].objectId));
    for (const object of quest.objects.slice(1)) d.use(object.objectId);
    result.afterAll = { done: quest.done, objective: d.game.objectiveText };
    d.use(1);
    result.accepted = d.game.flags.uploadStarted === true;
    d.hollow.isActive = false;
    return result;
  });
  check('crew badges: the objective asks for them "also" beside the spools and "still" once the spools are in hand; the screen counts them',
    badges.seed > 0 && /spools.*Personnel also wants the badges/.test(badges.objectiveWithSpools) && badges.objectiveAlone === 'Personnel still wants the badges of Crew 2.' &&
    badges.chipBefore.indexOf('BADGES 0/' + badges.total) >= 0, badges);
  check('crew badges: the terminal refuses without them; each one taken is counted and shows brightly on the map; with all of them the upload goes through',
    badges.seed > 0 && !badges.refused.started && badges.refused.said && badges.afterOne.done === 1 && badges.afterOne.said && badges.afterOne.gone &&
    badges.afterOne.chip.indexOf('BADGES 1/' + badges.total) >= 0 && badges.wantedOnMap === true && badges.afterAll.done === badges.total &&
    badges.afterAll.objective === 'Return to the lift lobby and upload the spools at the terminal.' && badges.accepted, badges);

  // --- isolation valves: an 'activate' quest that needs the mains, is loud, and is not spoken of until Dispatch has ---
  const valves = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    for (let seed = 1; seed < 300 && !result.seed; seed++) {
      lab.fresh('generated', seed, 'large', 'mixed', 'one');
      if (d.findQuest('valves') && d.level.quests.every((quest) => ['spools', 'valves', 'generators', 'fuel'].indexOf(quest.key) >= 0)) result.seed = seed;
    }
    if (!result.seed) return result;
    const quest = d.findQuest('valves'), first = quest.objects[0], thing = d.findInteractable(first.objectId);
    result.total = quest.total;
    d.use(first.objectId);
    result.beforeMains = { done: quest.done, said: /actuator dead\. It needs the mains/.test(lab.messages()), wantedOnMap: d.isInteractableWantedNow(thing) };
    d.grantPower(); d.doQuest('generators'); d.hollow.isActive = false;
    result.notYetTold = { objective: d.game.objectiveText, chip: d.getQuestChips().join(' · '), marked: thing.isDiscovered };
    // Taking a keycard is when Dispatch thinks of them, eight seconds on.
    d.fireGameEvent('keycard');
    d.simulate(7); const tooSoon = quest.isKnown;
    d.simulate(1.5);
    result.told = { tooSoon: tooSoon, known: quest.isKnown, marked: quest.objects.every((object) => d.findInteractable(object.objectId).isDiscovered),
      radio: /isolation valves on your level have to be shut/.test(lab.messages()), objective: d.game.objectiveText, chip: d.getQuestChips().join(' · '), wantedOnMap: d.isInteractableWantedNow(thing) };
    // Shutting one squeals. The Hollow ten metres off, unaware, comes to look at that valve.
    const stand = d.findWalkableSpotNear(first.x, first.z), far = d.findWalkableSpotNear(first.x + 10, first.z);
    d.teleport(stand.x, stand.z, 0); d.simulate(0.1);
    d.spawnHollow(far.x, far.z); d.hollow.graceTimer = 0; d.hollow.state = 0;
    d.use(first.objectId);
    result.loud = { hollowMetres: Math.round(Math.hypot(far.x - first.x, far.z - first.z) * 10) / 10, heardFromMetres: d.tuning.noiseRadiusValve * d.game.difficulty.hearingFactor,
      hollowState: d.hollow.state, goesTo: [d.hollow.targetX, d.hollow.targetZ], valveAt: [first.x, first.z], done: quest.done, said: /Isolation valve A shut\. Valves shut: 1 of/.test(lab.messages()) };
    d.hollow.isActive = false;
    d.grantSpools();
    d.use(1);
    result.refused = { started: d.game.flags.uploadStarted, said: /line pressure high\. Isolation valves shut: 1 of/.test(lab.messages()) };
    for (const object of quest.objects.slice(1)) { d.use(object.objectId); d.hollow.isActive = false; }
    result.afterAll = { done: quest.done, said: /That is all of them/.test(lab.messages()), objective: d.game.objectiveText };
    d.use(1);
    result.accepted = d.game.flags.uploadStarted === true;
    d.hollow.isActive = false;
    return result;
  });
  check('isolation valves: one will not move before the mains is on, and shows dimly on the map',
    valves.seed > 0 && valves.beforeMains.done === 0 && valves.beforeMains.said && valves.beforeMains.wantedOnMap === false, valves.beforeMains);
  check('isolation valves: nothing on screen speaks of them until Dispatch does, eight seconds after a keycard is taken; then they are marked, counted and in the objective',
    valves.seed > 0 && !/valve/i.test(valves.notYetTold.objective) && !/VALVES/.test(valves.notYetTold.chip) && !valves.notYetTold.marked &&
    !valves.told.tooSoon && valves.told.known && valves.told.marked && valves.told.radio && /isolation valves have to be shut.*0 of/.test(valves.told.objective) &&
    valves.told.chip.indexOf('VALVES 0/' + valves.total) >= 0 && valves.told.wantedOnMap === true, [valves.notYetTold, valves.told]);
  check('isolation valves: shutting one is loud enough to bring a Hollow ten metres off to that valve',
    valves.seed > 0 && valves.loud.done === 1 && valves.loud.said && valves.loud.hollowMetres < valves.loud.heardFromMetres && valves.loud.hollowState === 1 &&
    Math.hypot(valves.loud.goesTo[0] - valves.loud.valveAt[0], valves.loud.goesTo[1] - valves.loud.valveAt[1]) < 0.01, valves.loud);
  check('isolation valves: the terminal refuses while one is open and says how many are shut; with all shut the upload goes through',
    valves.seed > 0 && !valves.refused.started && valves.refused.said && valves.afterAll.done === valves.total && valves.afterAll.said &&
    valves.afterAll.objective === 'Return to the lift lobby and upload the spools at the terminal.' && valves.accepted, [valves.refused, valves.afterAll, valves.accepted]);

  // --- the survey spools are a quest too, and their number can vary ---
  const spoolCounts = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = { sizes: {}, bad: [] };
    const layouts = ['tight', 'mixed', 'sprawling', 'sparse'];
    for (const size of ['small', 'medium', 'large', 'massive']) {
      const counts = [];
      for (let seed = 1; seed <= 16; seed++) {
        lab.fresh('generated', seed, size, layouts[seed % 4], seed % 2 ? 'one' : 'two');
        const quest = d.findQuest('spools');
        counts.push(d.level.spoolCount);
        if (!quest || quest.total !== d.level.spoolCount || quest.objects.filter((object) => object.isFixed).length !== 3) result.bad.push(size + ' ' + seed + ': the quest and the station disagree');
        if (d.level.quests[0].key !== 'spools') result.bad.push(size + ' ' + seed + ': the spools are not the first thing asked for');
      }
      const allowed = d.sizePresets[size].extraSpools;
      result.sizes[size] = { fewest: Math.min.apply(null, counts), most: Math.max.apply(null, counts), allowed: [3 + allowed[0], 3 + allowed[1]], counts: counts.join('') };
    }
    lab.fresh('classic', 0);
    result.classic = { count: d.level.spoolCount, things: d.findQuest('spools').objects.map((object) => object.objectId).join() };
    return result;
  });
  check('every station has the three spools its rooms put out; a bigger one may have more, as many as its size allows; Kessel-9 has its three',
    spoolCounts.bad.length === 0 && spoolCounts.classic.count === 3 && spoolCounts.classic.things === '3,4,5' &&
    Object.keys(spoolCounts.sizes).every((size) => spoolCounts.sizes[size].fewest === spoolCounts.sizes[size].allowed[0] && spoolCounts.sizes[size].most === spoolCounts.sizes[size].allowed[1]), spoolCounts);

  // A station with four spools and little else in the way.
  const fourFound = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab;
    for (let seed = 1; seed < 300; seed++) {
      lab.fresh('generated', seed, 'large', 'mixed', 'one');
      if (d.level.spoolCount === 4 && d.level.quests.every((quest) => ['spools', 'generators', 'fuel'].indexOf(quest.key) >= 0)) return { seed: seed, loose: d.findQuest('spools').objects.filter((object) => !object.isFixed).map((object) => object.objectId) };
    }
    return null;
  });
  check('there is a station with four spools to try', fourFound !== null && fourFound.loose.length === 1, fourFound);
  if (fourFound) {
    // Each spool taken opens its text; the reader is closed again before the next step.
    const takeSpool = async (objectId) => {
      const read = await inGame((id) => {
        const d = window.lastReturnDebug;
        d.use(id);
        const result = { mode: d.game.mode, heading: document.getElementById('reader-heading').textContent, held: d.game.flags.spoolsCollected };
        d.closeReader();
        return result;
      }, objectId);
      return read;
    };
    const start = await inGame(() => {
      const d = window.lastReturnDebug;
      d.grantPower(); d.doQuest('generators'); d.hollow.isActive = false;
      d.setDebugOption('freezeCreatures', true);
      d.clearMessages();
      return { objective: d.game.objectiveText };
    });
    await drawFrames(page, 3);
    const chipAtStart = await inGame(() => document.getElementById('chip-spools').textContent);
    const first = await takeSpool(3);
    const afterFirst = await inGame(() => { const d = window.lastReturnDebug; d.simulate(2); return window.lab.messages(); });
    const loose = await takeSpool(fourFound.loose[0]);
    const store = await takeSpool(4);
    const afterStore = await inGame(() => { const d = window.lastReturnDebug; d.clearMessages(); d.simulate(3); return window.lab.messages(); });
    const refused = await inGame(() => {
      const d = window.lastReturnDebug;
      d.clearMessages(); d.use(1);
      return { started: d.game.flags.uploadStarted, said: /Survey spools loaded: 3 of 4/.test(window.lab.messages()), objective: d.game.objectiveText };
    });
    const last = await takeSpool(5);
    const afterLast = await inGame(() => {
      const d = window.lastReturnDebug;
      d.clearMessages(); d.simulate(2);
      const said = window.lab.messages();
      d.use(1);
      return { said: said, objective: d.game.objectiveText, started: d.game.flags.uploadStarted };
    });
    await inGame(() => { window.lastReturnDebug.setDebugOption('freezeCreatures', false); window.lastReturnDebug.hollow.isActive = false; });
    check('four spools: the objective and the screen say four, and Ripley\'s first is headed "1 of 4"',
      start.objective === 'Recover the 4 survey spools left by Crew 2.' && chipAtStart === 'SPOOLS 0/4' && first.mode === 'reading' && first.heading === 'Survey spool 1 of 4' && first.held === 1,
      { objective: start.objective, chip: chipAtStart, first: first });
    check('four spools: Dispatch\'s line for the first one does not say "two more"',
      /Crew 2 logged more of them/.test(afterFirst) && !/two more/.test(afterFirst), afterFirst);
    check('four spools: the loose one can be taken, has nothing on it, and counts',
      loose.mode === 'reading' && loose.heading === 'Survey spool, unlabelled' && loose.held === 2, loose);
    check('four spools: when the Stills wake, Dispatch says "Do not stay in that room" and nothing about a count',
      store.held === 3 && /Do not stay in that room/.test(afterStore) && !/That is two/.test(afterStore), afterStore);
    check('four spools: with three in hand the terminal still refuses, and says three of four',
      !refused.started && refused.said && /4 survey spools/.test(refused.objective), refused);
    check('four spools: with all four, Dispatch says "That is all of them" and the upload goes through',
      last.held === 4 && /That is all of them/.test(afterLast.said) && afterLast.started, [last, afterLast]);
  }

  // A station with three, as every station had: the recorded lines, word for word.
  const three = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    lab.fresh('classic', 0);
    d.setDebugOption('freezeCreatures', true);
    result.objectiveAfterPower = (d.grantPower(), d.game.objectiveText);
    d.use(3);
    result.heading = document.getElementById('reader-heading').textContent;
    d.closeReader(); d.simulate(2);
    result.first = lab.messages();
    d.clearMessages();
    d.use(4); d.closeReader(); d.simulate(3);
    result.store = lab.messages();
    d.grantSpools();
    result.granted = d.game.flags.spoolsCollected;
    d.setDebugOption('freezeCreatures', false);
    d.hollow.isActive = false;
    return result;
  });
  check('three spools, as in Kessel-9: the objective says three, Ripley\'s first is "1 of 3", and Dispatch speaks the lines as they were recorded',
    three.objectiveAfterPower === 'Recover the three survey spools left by Crew 2.' && three.heading === 'Survey spool 1 of 3' &&
    /Crew 2 logged two more: one in the calibration store, one at the shaft\./.test(three.first) && /That is two\. Do not stay in that room\./.test(three.store) && three.granted === 3, three);

  // --- Dispatch's line about fuel is one line for every generator, said once a descent ---
  const fuelLine = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    for (let seed = 1; seed < 300 && !result.seed; seed++) {
      lab.fresh('generated', seed, 'large', 'mixed', 'one');
      const generators = d.findQuest('generators');
      if (!d.findQuest('fuel') && generators && generators.objects.filter((object) => object.needsItem).length >= 1) result.seed = seed;
    }
    if (!result.seed) return result;
    const thirsty = d.findQuest('generators').objects.filter((object) => object.needsItem)[0];
    d.grantPower(); d.hollow.isActive = false;
    d.setDebugOption('freezeCreatures', true);
    d.use(thirsty.objectId);
    d.simulate(1.0); const tooSoon = /Day tank reads empty/.test(lab.messages());
    d.simulate(1.0);
    result.first = { tooSoon: tooSoon, said: /Day tank reads empty from here.*Bring it to the generator\./.test(lab.messages()), namesGenerator2: /Generator 2/.test(d.radioText('generatorNoFuel')) };
    d.clearMessages();
    d.use(thirsty.objectId);
    d.simulate(2.5);
    result.second = { saidAgain: /Day tank reads empty from here/.test(lab.messages()), refusedAgain: /day tank empty/.test(lab.messages()) };
    d.setDebugOption('freezeCreatures', false);
    return result;
  });
  check('a small generator with an empty tank: Dispatch says the line about fuel, which no longer names Generator 2, a second and a half later',
    fuelLine.seed > 0 && !fuelLine.first.tooSoon && fuelLine.first.said && !fuelLine.first.namesGenerator2, fuelLine.first);
  check('and says it once a descent: the second refusal is the generator\'s own message only', fuelLine.seed > 0 && !fuelLine.second.saidAgain && fuelLine.second.refusedAgain, fuelLine.second);

  // --- Dispatch's table: a line that goes with the Stills waking, and a line that goes with a room ---
  const cues = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    lab.fresh('classic', 0);
    d.setDebugOption('freezeCreatures', true);
    result.cueForStills = d.dispatchCues.filter((cue) => cue.when === 'stillsWake').map((cue) => cue.line + ' after ' + cue.seconds);
    result.cueForSecondSpool = d.dispatchCues.filter((cue) => cue.when === 'secondSpool').length;
    d.clearMessages();
    d.fireGameEvent('stillsWake');
    d.simulate(1.0); const tooSoon = /Do not stay in that room/.test(lab.messages());
    d.simulate(1.0);
    result.stills = { tooSoon: tooSoon, said: /Do not stay in that room/.test(lab.messages()) };
    // A line for a room: made up here, for the first time you set foot in the pump hall.
    const cue = { when: 'enter:PUMP HALL B', line: 'liftArrived', seconds: 0 };
    d.dispatchCues.push(cue);
    try {
      d.clearMessages();
      d.teleport(d.playerStart.x, d.playerStart.z, 0); d.simulate(0.5);
      result.room = { beforeEntering: /The car is at your level/.test(lab.messages()), placeAtStart: d.zoneNames[d.getZoneAt(d.player.x, d.player.z)] };
      const hall = d.findSigns('PUMP HALL B')[0];
      let inside = null;
      for (let z = 30; z < 70 && !inside; z++) for (let x = 30; x < 80 && !inside; x++) if (d.zoneNames[d.getZoneAt(x + 0.5, z + 0.5)] === 'PUMP HALL B' && d.findWalkableSpotNear(x + 0.5, z + 0.5)) inside = d.findWalkableSpotNear(x + 0.5, z + 0.5);
      d.teleport(inside.x, inside.z, 0); d.simulate(0.5);
      result.room.place = d.zoneNames[d.getZoneAt(d.player.x, d.player.z)];
      result.room.onEntering = /The car is at your level/.test(lab.messages());
      d.clearMessages();
      d.teleport(d.playerStart.x, d.playerStart.z, 0); d.simulate(0.5);
      d.teleport(inside.x, inside.z, 0); d.simulate(0.5);
      result.room.onComingBack = /The car is at your level/.test(lab.messages());
    } finally {
      d.dispatchCues.splice(d.dispatchCues.indexOf(cue), 1);
    }
    d.setDebugOption('freezeCreatures', false);
    return result;
  });
  check('"Do not stay in that room" goes with the Stills waking, a second and a half after, and with nothing about how many spools you hold',
    cues.cueForStills.join() === 'secondSpool after 1.5,stillsWake after 1.5' && cues.cueForSecondSpool === 0 && !cues.stills.tooSoon && cues.stills.said, cues);
  check('a line can go with a room: said the first time you set foot in it, and not when you come back',
    cues.room.place === 'PUMP HALL B' && !cues.room.beforeEntering && cues.room.onEntering && !cues.room.onComingBack, cues.room);

  check('no script errors were reported', problems.length === 0, problems);
  await browser.close();

  if (failures.length > 0) {
    console.log('\n' + failures.length + ' quest check(s) failed:');
    for (const failure of failures) console.log('  - ' + failure);
    process.exit(1);
  }
  console.log('\nAll quest checks passed.');
})().catch((error) => { console.error('Quests test crashed:', error); process.exit(1); });
