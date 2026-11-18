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
      if (['collect', 'activate', 'supply', 'haul'].indexOf(quest.kind) < 0) say('unknown kind ' + quest.kind);
      if (['mains', 'upload', 'lift'].indexOf(quest.blocks) < 0) say('holds up nothing the game knows: ' + quest.blocks);
      if (quest.pool && !d.questPools[quest.pool]) say('its pool does not exist: ' + quest.pool);
      if (!quest.text) say('has no text');
      if (quest.tell && lines.indexOf(quest.tell.line) < 0) say('Dispatch has no line called ' + quest.tell.line);
      if (quest.releasedLine && lines.indexOf(quest.releasedLine) < 0) say('Dispatch has no line called ' + quest.releasedLine);
      if (quest.requires && !d.questItems[quest.requires.item]) say('needs an item that does not exist: ' + quest.requires.item);
      if (quest.kind !== 'supply' && quest.kind !== 'haul' && typeof quest.build !== 'function') say('has nothing to build its things with');
      if (quest.kind === 'haul' && !(typeof quest.progress === 'function' && quest.text.refused && quest.text.objective && quest.text.chip)) say('a haul quest needs a way to say how far along it is, and the sentences refused, objective and chip');
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
  // This check and seven more below build stations by the dozen in one go. Before each station the browser
  // gets a moment to clear the last one away (browser-harness.js says why).
  const survey = await inGame(async () => {
    const d = window.lastReturnDebug, lab = window.lab, result = { bad: [], sizes: {}, seen: {}, numbersUsedTwice: [] };
    const layouts = ['tight', 'mixed', 'sprawling', 'sparse'];
    for (const size of ['small', 'medium', 'large', 'massive']) {
      const errands = [], all = [];
      for (let seed = 1; seed <= 16; seed++) {
        await window.letTheBrowserCatchUp();
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

  // --- the map and the quests are kept apart ---
  // The same seed, built with other numbers for its quests, is the same map: not a tile, a prop, a door, a hatch,
  // a loud patch of floor or a loose thing is anywhere else, and the quests have altered nothing of it.
  const apart = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = { stations: 0, mapsThatDiffer: [], touched: [], cannotBeFinished: [], questsDiffered: 0, withAndWithoutSalvage: 0 };
    for (const size of ['small', 'medium', 'large', 'massive']) {
      for (let seed = 1; seed <= 5; seed++) {
        const station = ['generated', seed, size, ['mixed', 'tight', 'sprawling', 'sparse'][seed % 4], seed % 2 ? 'one' : 'two'], name = size + ' ' + seed;
        const builds = [undefined, seed + 1000, seed + 2000, seed + 3000].map((questSeed) => {
          d.loadStation.apply(null, station.concat([questSeed]));
          d.game.flags.hasLeftLift = true; d.hollow.isActive = false;
          const audit = d.auditMapApartFromQuests(), found = d.auditLayout().concat(d.auditProgression()).concat(d.auditHollowRoutes()).concat(d.auditNoisyFloor()).concat(d.auditStationLooseObjects());
          if (audit.length) result.touched.push(name + ' (quests ' + questSeed + '): ' + audit[0]);
          if (found.length) result.cannotBeFinished.push(name + ' (quests ' + questSeed + '): ' + found[0]);
          return { map: d.level.mapFingerprint, questSeed: d.level.questSeed, quests: lab.describeQuests(''), hasSalvage: d.findQuest('haul') !== null };
        });
        result.stations++;
        if (builds.some((build) => build.map !== builds[0].map)) result.mapsThatDiffer.push(name);
        if (builds[0].questSeed !== seed) result.mapsThatDiffer.push(name + ': left to itself, a station takes its quests from its own seed');
        if (builds.some((build) => build.quests !== builds[0].quests)) result.questsDiffered++;
        if (builds.some((build) => build.hasSalvage) && builds.some((build) => !build.hasSalvage)) result.withAndWithoutSalvage++;
      }
    }
    return result;
  });
  check('the map and the quests are apart: twenty stations, each built four times with different quests, give the same map every time, and no quest has altered any of it',
    apart.stations === 20 && apart.mapsThatDiffer.length === 0 && apart.touched.length === 0 && apart.cannotBeFinished.length === 0, apart);
  check('and those were different quests: most of the twenty got other quests or other places for them, some of them salvage bays in one build and none in another',
    apart.questsDiffered >= 15 && apart.withAndWithoutSalvage >= 5, [apart.questsDiffered, apart.withAndWithoutSalvage]);

  // --- three stations, as they were when this was last read off ---
  // Two records, because the map and the quests are two things. The first is one number for each station's whole
  // map (and, to say what moved if it does, the number as it stood after each part of the map). The second is
  // where each quest's things are. Neither may change by accident: a seed someone was given has to keep building
  // what they were given. Changing the map on purpose (a room, a size, the furniture) changes the first; changing
  // a quest on purpose changes the second, and only the second. Then that record is read off again, and that is
  // the only time it is.
  const asBefore = await inGame(() => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    const before = {
      // Read off when the map and the quests were taken apart. Until then the first four quests drew their
      // numbers from the station's own sequence, so taking them out of it changed the furniture, the quests and
      // what lies about in every generated station, once. The rooms, corridors, doors and vents did not change.
      'medium 9 mixed one': { map: 1574309035,
        quests: '3:63.7:42 4:95:83.5 5:130.55:65.5 20:40.5:52.5 21:70.5:81.5 22:94.5:65.5 23:63.5:44.5 30:60.5:88.5' },
      'large 7 sparse one': { map: 3054155276,
        quests: '3:85.4:41.7 4:40:73.5 5:143.5:81.55 13:121.5:45.5 30:106.5:27.5 40:120.5:50.5 50:100.5:43.5 180:92.5:16.5 181:116.5:41.5 220:67.28:48.03 221:147.28:56.03 222:112.03:10.72' },
      'massive 12 tight two': { map: 204994769,
        quests: '3:107.2:53.4 4:82.5:14 5:37.45:108.5 13:94.5:48.5 14:96.5:9.5 30:70.5:116.5 31:114.5:18.5 32:91.5:69.5 42:92.5:36.5 50:77.5:78.5 180:61.5:91.5 181:90.5:43.5 200:62.5:115.5 201:107.5:10.5 220:81.72:57.97 221:126.03:27.72 222:89.72:109.97' }
    };
    for (const name in before) {
      const parts = name.split(' ');
      lab.fresh('generated', Number(parts[1]), parts[0], parts[2], parts[3]);
      const mapParts = {}; d.computeMapFingerprint(mapParts);
      const quests = d.interactables.filter((thing) => d.level.quests.some((quest) => quest.objects.some((object) => object.objectId === thing.objectId || object.itemObjectId === thing.objectId)))
        .sort((a, b) => a.objectId - b.objectId).map((thing) => thing.objectId + ':' + thing.x + ':' + thing.z).join(' ');
      result[name] = { sameMap: d.level.mapFingerprint === before[name].map, sameQuests: quests === before[name].quests, mapNow: d.level.mapFingerprint, questsNow: quests, mapPartByPart: mapParts };
    }
    return result;
  });
  check('the maps of three stations are what they were when they were last read off',
    Object.keys(asBefore).every((name) => asBefore[name].sameMap), Object.keys(asBefore).map((name) => name + ': ' + asBefore[name].mapNow + ' ' + JSON.stringify(asBefore[name].mapPartByPart)));
  check('and so are the places of their quests\' things',
    Object.keys(asBefore).every((name) => asBefore[name].sameQuests), Object.keys(asBefore).map((name) => name + ': ' + asBefore[name].questsNow));

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

  // --- salvage: a 'haul' quest. It asks for a sum's worth of what the station has lying about, sealed into bays ---
  const salvagePlaces = await inGame(async () => {
    const d = window.lastReturnDebug, lab = window.lab, result = { stations: 0, withIt: 0, wrong: [], moved: [], bays: {}, targets: [], alsoTheSame: { otherQuestsToTheTile: 0, hatches: 0, noisyFloor: 0, looseThings: 0 } };
    const definition = d.quests.filter((quest) => quest.key === 'haul')[0], place = d.quests.indexOf(definition);
    // What the quest must leave alone: every door but those of its own bays (and so every room), and which
    // other quests the station has, each with as many things. (Where those things stand may shift by a tile or
    // two: a bay's door needs its doorstep clear, and so may the noisy floor and the litter near it.)
    const describe = function () {
      return d.level.quests.filter((quest) => quest.key !== 'haul').map((quest) => quest.key + ' ' + quest.total).join(',') + ' # ' +
        d.doors.filter((door) => door.kind !== d.doorKinds.bay).map((door) => door.tileX + '.' + door.tileZ + '.' + door.kind).join(',');
    };
    const places = () => lab.describeQuests('haul');
    const hatches = () => d.hollowHatches.map((hatch) => hatch.index).join(','), noisy = () => d.noisyFloorPatches.map((patch) => patch.index).join(','), loose = () => JSON.stringify(d.stationLooseObjects);
    for (const size of ['small', 'large']) {
      const allowed = d.sizePresets[size].salvageBays;
      for (let seed = 1; seed <= 14; seed++) {
        await window.letTheBrowserCatchUp();
        const station = ['generated', seed, size, ['mixed', 'tight', 'sparse'][seed % 3], seed % 2 ? 'one' : 'two'], name = size + ' ' + seed;
        lab.fresh.apply(null, station);
        result.stations++;
        const quest = d.findQuest('haul');
        if (!quest) continue;
        result.withIt++;
        const state = d.haulState, bays = state.bays, progress = d.getHaulProgress(), withIt = describe(), others = [hatches(), noisy(), loose(), places()];
        let all = 0;
        for (const item of d.stationLooseObjects) all += d.looseObjectKinds[item.kindKey].value;
        result.targets.push(state.target);
        result.bays[size + ' ' + bays.length] = (result.bays[size + ' ' + bays.length] || 0) + 1;
        if (bays.length < 1 || bays.length > allowed[1] || quest.total !== bays.length) result.wrong.push(name + ': ' + bays.length + ' bays, ' + quest.total + ' in the quest, at most ' + allowed[1] + ' allowed');
        if (!(state.target >= 10 && state.target % 10 === 0 && state.target <= state.withinWalk && state.withinWalk <= all)) result.wrong.push(name + ': asks for ' + state.target + ' of ' + state.withinWalk + ' within walking reach, ' + all + ' in all');
        if (bays.length > 0 && bays[0].quota * bays.length < state.target) result.wrong.push(name + ': the bays together take less than is asked');
        if (progress.done !== 0 || progress.total !== state.target) result.wrong.push(name + ': starts at ' + progress.done + ' of ' + progress.total);
        bays.forEach((bay, index) => {
          const what = name + ' bay ' + (index + 1) + ': ';
          if (!bay.door || bay.door.kind !== d.doorKinds.bay || bay.door.openFraction !== 0 || bay.state !== 'shut') result.wrong.push(what + 'its door is not a bay door standing shut');
          if ((bay.maximumX - bay.minimumX) * (bay.maximumZ - bay.minimumZ) !== 2) result.wrong.push(what + 'is not two tiles of floor');
          for (let z = bay.minimumZ; z < bay.maximumZ; z++) for (let x = bay.minimumX; x < bay.maximumX; x++) {
            const spot = d.findWalkableSpotNear(x + 0.5, z + 0.5);
            if (!spot || spot.x !== x + 0.5 || spot.z !== z + 0.5) result.wrong.push(what + 'has floor you cannot stand on');
          }
          if (d.looseObjects.some((object) => d.isLooseObjectInHaulBay(object, bay))) result.wrong.push(what + 'something lies in it before you have brought anything');
          if (!bay.interactable || bay.interactable.props.length !== 1 || !/^Open salvage bay/.test(bay.interactable.prompt)) result.wrong.push(what + 'has no panel beside its door');
          for (const other of bays) if (other !== bay && Math.abs(other.doorwayX - bay.doorwayX) + Math.abs(other.doorwayZ - bay.doorwayZ) < 10) result.wrong.push(what + 'is less than ten tiles from another bay');
        });
        const found = d.auditLayout().concat(d.auditProgression()).concat(d.auditHollowRoutes()).concat(d.auditNoisyFloor()).concat(d.auditStationLooseObjects());
        if (found.length > 0) result.wrong.push(name + ': ' + found[0]);
        // Without the quest, the same station has the same rooms and doors and the same other quests.
        d.quests.splice(place, 1);
        try {
          lab.fresh.apply(null, station);
          if (d.findQuest('haul') || describe() !== withIt) result.moved.push(name);
          if (places() === others[3]) result.alsoTheSame.otherQuestsToTheTile++;
          if (hatches() === others[0]) result.alsoTheSame.hatches++;
          if (noisy() === others[1]) result.alsoTheSame.noisyFloor++;
          if (loose() === others[2]) result.alsoTheSame.looseThings++;
        } finally { d.quests.splice(place, 0, definition); }
      }
    }
    return result;
  });
  check('salvage: about half the stations have it; each asks for a round sum that is no more than what lies within walking reach, and has as many bays as its size allows: two tiles each behind a shut door of their own, a panel beside it, empty, and well apart',
    salvagePlaces.withIt >= 6 && salvagePlaces.withIt <= salvagePlaces.stations - 6 && salvagePlaces.wrong.length === 0, salvagePlaces);
  check('salvage: a station with it is the same station without it, plus its bays: the same rooms and other doors, and to the tile the same hatches, loud floor, loose things and other quests\' things',
    salvagePlaces.moved.length === 0 && ['otherQuestsToTheTile', 'hatches', 'noisyFloor', 'looseThings'].every((what) => salvagePlaces.alsoTheSame[what] === salvagePlaces.withIt), [salvagePlaces.moved, salvagePlaces.alsoTheSame, salvagePlaces.withIt]);

  const salvage = await inGame(async () => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    for (let seed = 1; seed < 300 && !result.seed; seed++) {
      await window.letTheBrowserCatchUp();
      lab.fresh('generated', seed, 'medium', 'mixed', 'one');
      if (d.findQuest('haul') && d.haulState.bays.length >= 2 && d.level.quests.every((quest) => ['spools', 'haul', 'generators', 'fuel'].indexOf(quest.key) >= 0)) result.seed = seed;
    }
    if (!result.seed) return result;
    d.setDebugOption('freezeCreatures', true);
    d.settings.captions = 'all';
    const state = d.haulState, target = state.target, quest = d.findQuest('haul'), bay = state.bays[0];
    result.target = target; result.quota = bay.quota;
    d.grantPower(); d.doQuest('generators'); d.hollow.isActive = false;
    result.objectiveWithSpools = d.game.objectiveText;
    d.grantSpools(); d.grantKeycard();
    result.objectiveAlone = d.game.objectiveText;
    result.chipBefore = d.getQuestChips().join(' · ');
    d.use(1);
    result.refused = { started: d.game.flags.uploadStarted, said: lab.messages().indexOf('manifest short. Salvage in the bays: 0 of ' + target) >= 0 };

    // Opening a bay: its door goes up, its lamp lights the floor in front of it and pings, and it is on the map.
    d.teleport(bay.spotX, bay.spotZ, 0);
    d.captionCounts.salvageBayPing = 0;
    let points = d.pointCloud.totalReturns;
    const wasOnMap = bay.interactable.isDiscovered, wasWanted = d.isInteractableWantedNow(bay.interactable);
    d.use(quest.objects[0].objectId);
    d.simulate(1.5);
    result.opened = { state: bay.state, door: bay.door.openFraction, lampPoints: d.pointCloud.totalReturns - points, pings: d.captionCounts.salvageBayPing, wasOnMap: wasOnMap, onMap: bay.interactable.isDiscovered, wasWanted: wasWanted,
      said: lab.messages().indexOf('Salvage bay 1 open. It wants ' + bay.quota + ' worth.') >= 0 };
    // A minute later the lamp does it again.
    points = d.pointCloud.totalReturns;
    d.simulate(d.tuning.haulBayPulseSeconds + 1);
    result.aMinuteLater = { lampPoints: d.pointCloud.totalReturns - points, pings: d.captionCounts.salvageBayPing };
    // One bay at a time.
    d.use(quest.objects[1].objectId);
    result.secondMeanwhile = { state: state.bays[1].state, said: /bay 1 is still open\. One at a time/.test(lab.messages()) };

    // What it wants carried in, with you standing in it: it counts, and the door stays up.
    const dearestFirst = d.looseObjects.slice().sort((a, b) => b.kind.value - a.kind.value);
    const isAlongX = bay.maximumX - bay.minimumX > 1;
    let carried = 0;
    for (const object of dearestFirst) {
      if (d.getHaulBayValue(bay) >= bay.quota) break;
      d.pickUpLooseObject(object, false); d.releaseHeldLooseObject(0);
      object.x = bay.minimumX + 0.5 + (isAlongX ? carried % 2 : 0); object.z = bay.minimumZ + 0.5 + (isAlongX ? 0 : carried % 2); object.y = bay.floorY + 0.4 + Math.floor(carried / 2) * 0.6;
      object.velocityX = 0; object.velocityY = 0; object.velocityZ = 0; d.wakeLooseObject(object);
      carried++;
    }
    const looseBefore = d.looseObjects.length;
    d.teleport(bay.minimumX + 0.5, bay.minimumZ + 0.5, 0);
    d.simulate(6);
    result.withYouInside = { state: bay.state, door: bay.door.openFraction, holds: d.getHaulBayValue(bay), progress: d.getHaulProgress(), chip: d.getQuestChips().join(' · '),
      said: lab.messages().indexOf('Salvage bay 1: ' + d.getHaulBayValue(bay) + ' of ' + bay.quota) >= 0 };
    // You step out: it starts to seal. You dart back under the door: it goes up again, and stays up while you stand there.
    d.teleport(bay.spotX, bay.spotZ, 0);
    d.simulate(0.7);
    result.steppedOut = bay.state;
    d.teleport(bay.doorwayX, bay.doorwayZ, 0);
    d.simulate(2.5);
    result.dartedBack = { state: bay.state, door: bay.door.openFraction };
    // Out for good: the door comes down, and what was inside is taken.
    d.teleport(bay.spotX, bay.spotZ, 0);
    const holds = d.getHaulBayValue(bay);
    d.simulate(4);
    result.sealed = { state: bay.state, door: bay.door.openFraction, taken: state.taken, held: holds, thingsGone: looseBefore - d.looseObjects.length, carried: carried, progress: d.getHaulProgress(),
      panelGone: bay.interactable.isAvailable === false, said: /Salvage bay 1 sealed: [0-9]+ taken\. [0-9]+ of [0-9]+\. Find the next bay\./.test(lab.messages()) };
    d.use(quest.objects[1].objectId);
    d.simulate(1);
    result.nextBay = state.bays[1].state;
    // The rest of it: the terminal takes the upload.
    d.fillHaulBays();
    result.afterAll = { progress: d.getHaulProgress(), states: state.bays.map((each) => each.state).join(','), said: /That is what they asked for/.test(lab.messages()), objective: d.game.objectiveText, chip: d.getQuestChips().join(' · ') };
    d.use(1);
    result.accepted = d.game.flags.uploadStarted === true;
    // A new descent: every bay shut and empty again, and everything back where it lay.
    lab.fresh('generated', result.seed, 'medium', 'mixed', 'one');
    result.newDescent = { states: state.bays.map((each) => each.state).join(','), taken: state.taken, progress: d.getHaulProgress(), things: d.looseObjects.length === d.stationLooseObjects.length,
      doorsShut: state.bays.every((each) => each.door.openFraction === 0), panelsBack: state.bays.every((each) => each.interactable.isAvailable) };
    // If so much is lost that what is left is worth less than was asked, what is left is all that is asked.
    const byWorth = d.looseObjects.slice().sort((a, b) => b.kind.value - a.kind.value);
    let left = 0;
    for (const object of byWorth) { if (byWorth.indexOf(object) < byWorth.length - 6) d.removeLooseObject(object); else left += object.kind.value; }
    result.withLittleLeft = { left: left, asked: d.getHaulProgress().total, wasAsked: d.haulState.target };
    d.doQuest('haul');
    result.withLittleLeft.done = d.getHaulProgress().done;
    d.hollow.isActive = false;
    return result;
  });
  check('salvage: the objective and the screen say what is asked and how much is in; the terminal refuses the upload until it is',
    salvage.seed > 0 && salvage.target >= 10 && /spools.*Salvage also wants/.test(salvage.objectiveWithSpools) && salvage.objectiveAlone.indexOf('Salvage still wants ' + salvage.target + ' worth') === 0 &&
    salvage.chipBefore.indexOf('SALVAGE 0/' + salvage.target) >= 0 && !salvage.refused.started && salvage.refused.said, salvage);
  check('salvage: a bay opens at its panel: the door goes up, a lamp puts a patch of points in front of it and pings, it is on the map from then on, and a minute later the lamp does it again',
    salvage.opened.state === 'open' && salvage.opened.door > 0.95 && salvage.opened.lampPoints >= 300 && salvage.opened.pings === 1 && !salvage.opened.wasOnMap && salvage.opened.onMap && salvage.opened.wasWanted && salvage.opened.said &&
    salvage.aMinuteLater.lampPoints >= 300 && salvage.aMinuteLater.pings === 2, [salvage.opened, salvage.aMinuteLater]);
  check('salvage: one bay at a time: the second will not open while the first stands open', salvage.secondMeanwhile.state === 'shut' && salvage.secondMeanwhile.said, salvage.secondMeanwhile);
  check('salvage: what lies in the open bay counts, and its door never comes down on you: not while you stand in it, and not if you dart back under it as it starts to seal',
    salvage.withYouInside.state === 'open' && salvage.withYouInside.door > 0.95 && salvage.withYouInside.holds >= salvage.quota && salvage.withYouInside.progress.done === salvage.withYouInside.holds && salvage.withYouInside.said &&
    salvage.withYouInside.chip.indexOf('SALVAGE ' + salvage.withYouInside.holds + '/') >= 0 && salvage.steppedOut === 'sealing' && salvage.dartedBack.state === 'open' && salvage.dartedBack.door > 0.95, [salvage.withYouInside, salvage.steppedOut, salvage.dartedBack]);
  check('salvage: with you out of it, the full bay seals: the door comes down for good, what was inside is taken, and the next bay can be opened',
    salvage.sealed.state === 'sealed' && salvage.sealed.door === 0 && salvage.sealed.taken === salvage.sealed.held && salvage.sealed.thingsGone === salvage.sealed.carried && salvage.sealed.progress.done === salvage.sealed.taken &&
    salvage.sealed.panelGone && salvage.sealed.said && salvage.nextBay === 'open', [salvage.sealed, salvage.nextBay]);
  check('salvage: with what was asked sealed in, the screen says so and the upload goes through',
    salvage.afterAll.progress.done === salvage.target && salvage.afterAll.said && salvage.afterAll.objective === 'Return to the lift lobby and upload the spools at the terminal.' && salvage.accepted, salvage.afterAll);
  check('salvage: a new descent has every bay shut and empty again and everything back where it lay',
    /^(shut,?)+$/.test(salvage.newDescent.states) && salvage.newDescent.taken === 0 && salvage.newDescent.progress.done === 0 && salvage.newDescent.things && salvage.newDescent.doorsShut && salvage.newDescent.panelsBack, salvage.newDescent);
  check('salvage: if less is left in the station than was asked, what is left is all that is asked, so it can always be finished',
    salvage.withLittleLeft.left < salvage.withLittleLeft.wasAsked && salvage.withLittleLeft.asked === salvage.withLittleLeft.left && salvage.withLittleLeft.done === salvage.withLittleLeft.left, salvage.withLittleLeft);

  // --- the lift's door never comes down on you either ---
  const liftDoor = await inGame(() => {
    const d = window.lastReturnDebug, result = {};
    d.loadStation('classic', 0);
    d.setDebugOption('invulnerable', true); d.hollow.isActive = false;
    const door = d.getLiftDoor(), start = d.playerStart;
    const away = Math.hypot(door.centerX - start.x, door.centerZ - start.z), stepX = (door.centerX - start.x) / away, stepZ = (door.centerZ - start.z) / away;
    result.atTheStart = { door: door.openFraction, left: d.game.flags.hasLeftLift };
    // Out of the car, a good step past its door: the door starts down.
    d.teleport(door.centerX + stepX * 2.4, door.centerZ + stepZ * 2.4, 0);
    d.simulate(1.5);
    result.steppedOut = { left: d.game.flags.hasLeftLift, door: door.openFraction, told: door.forcedState };
    // Straight back under it while it is coming down: it goes up again.
    d.teleport(door.centerX, door.centerZ, 0);
    d.simulate(1.5);
    result.dartedBack = { door: door.openFraction };
    // Into the car: it stays up for as long as you are in there.
    d.teleport(start.x, start.z, 0);
    d.simulate(4);
    result.backInTheCar = { door: door.openFraction, mode: d.game.mode };
    // Out again, and clear of it: now it shuts.
    d.teleport(door.centerX + stepX * 3, door.centerZ + stepZ * 3, 0);
    d.simulate(4);
    result.outForGood = { door: door.openFraction };
    return result;
  });
  check('the lift door starts down when you step out, goes up again if you dart back under it, stays up while you are in the car, and shuts once you are clear',
    liftDoor.atTheStart.door === 1 && !liftDoor.atTheStart.left && liftDoor.steppedOut.left && liftDoor.steppedOut.door < 1 && liftDoor.steppedOut.door > 0 && liftDoor.dartedBack.door > 0.95 &&
    liftDoor.backInTheCar.door > 0.95 && liftDoor.backInTheCar.mode === 'playing' && liftDoor.outForGood.door === 0, liftDoor);

  // --- crew badges: a 'collect' quest ---
  const badges = await inGame(async () => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    for (let seed = 1; seed < 300 && !result.seed; seed++) {
      await window.letTheBrowserCatchUp();
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
  const valves = await inGame(async () => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    for (let seed = 1; seed < 300 && !result.seed; seed++) {
      await window.letTheBrowserCatchUp();
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
    const stand = d.findWalkableSpotNear(first.x, first.z);
    d.teleport(stand.x, stand.z, 0); d.simulate(0.1);
    // Somewhere to stand, eight to twelve metres from the valve as the crow flies and out of your sight. (Ten
    // metres east of the valve may be rock, and the nearest floor to that may be four metres off in plain view.)
    let far = null;
    for (let ring = 10; ring >= 8 && !far; ring--) {
      for (let turn = 0; turn < 24 && !far; turn++) {
        const spot = d.findWalkableSpotNear(first.x + Math.cos(turn / 24 * Math.PI * 2) * ring, first.z + Math.sin(turn / 24 * Math.PI * 2) * ring);
        if (!spot) continue;
        const metres = Math.hypot(spot.x - first.x, spot.z - first.z);
        if (metres >= 8 && metres <= 12 && !d.canPlayerSeePoint(spot.x, d.getFloorHeightAt(spot.x, spot.z) + 1.3, spot.z)) far = spot;
      }
    }
    if (!far) far = d.findWalkableSpotNear(first.x + 10, first.z);
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
  const spoolCounts = await inGame(async () => {
    const d = window.lastReturnDebug, lab = window.lab, result = { sizes: {}, bad: [] };
    const layouts = ['tight', 'mixed', 'sprawling', 'sparse'];
    for (const size of ['small', 'medium', 'large', 'massive']) {
      const counts = [];
      for (let seed = 1; seed <= 16; seed++) {
        await window.letTheBrowserCatchUp();
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
  const fourFound = await inGame(async () => {
    const d = window.lastReturnDebug, lab = window.lab;
    for (let seed = 1; seed < 300; seed++) {
      await window.letTheBrowserCatchUp();
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
  const fuelLine = await inGame(async () => {
    const d = window.lastReturnDebug, lab = window.lab, result = {};
    for (let seed = 1; seed < 300 && !result.seed; seed++) {
      await window.letTheBrowserCatchUp();
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
