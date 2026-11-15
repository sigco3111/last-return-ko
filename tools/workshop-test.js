// Checks the workshop (`npm run dev`): the room tool, the creature tool, saving into src/ and reloading
// when the source changes. It works on a copy of src/ in a temporary folder, so nothing here touches the project.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { startDevServer, patchObjectNumbers, formatRoomFile } = require('./dev-server.js');

const failures = [];
function check(description, condition, detail) {
  const line = (condition ? 'ok    ' : 'FAIL  ') + description + (detail !== undefined ? '  ' + JSON.stringify(detail) : '');
  console.log(line);
  if (!condition) failures.push(description);
}

// --- writing numbers back into a source file, without a browser ---
function checkSourcePatching() {
  const source = [
    'const FIGURE_A = {',
    '  kind: \'a\',',
    '  thigh: 0.56, shin: 0.6, upperShin: 0.2, // shin: 9 in the old model',
    '  fingerLengths: [0.24, 0.3, 0.26],   // outer, middle, inner finger',
    '  legRadius: 0.052',
    '};',
    '',
    'const FIGURE_B = {',
    '  thigh: 0.45, shin: 0.44',
    '};',
    ''
  ].join('\n');
  const result = patchObjectNumbers(source, 'FIGURE_A', { thigh: 0.61234567, shin: 0.7, fingerLengths: [0.1, 0.25, 0.3], legRadius: 0.052, noSuchKey: 1 });
  check('patching changes the numbers it is given, to four decimals',
    result.source.includes('thigh: 0.6123, shin: 0.7, upperShin: 0.2,') && result.source.includes('fingerLengths: [0.1, 0.25, 0.3],   // outer, middle, inner finger'), result.source);
  check('patching leaves comments and the other block alone',
    result.source.includes('// shin: 9 in the old model') && result.source.includes('  thigh: 0.45, shin: 0.44'));
  check('patching reports what changed and what it could not find',
    result.changedKeys.join() === 'thigh,shin,fingerLengths' && result.missingKeys.join() === 'noSuchKey', result);
  const room = { key: 'x', name: 'X', width: 8, tiers: [0, 1], doors: [{ wall: 'south', at: 4 }], itemSpot: null, items: [{ type: 'table', x: 1 }, { type: 'barrel', x: 2 }] };
  const text = formatRoomFile(room);
  const parsed = JSON.parse(text);
  check('a room file is valid JSON without the key, one item per line',
    parsed.key === undefined && parsed.items.length === 2 && parsed.tiers.length === 2 && text.split('\n').filter((line) => line.includes('"type"')).length === 2, text);
}

(async () => {
  checkSourcePatching();

  const projectRoot = path.join(__dirname, '..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'last-return-workshop-'));
  fs.cpSync(path.join(projectRoot, 'src'), path.join(root, 'src'), { recursive: true });
  fs.rmSync(path.join(root, 'src', 'rooms'), { recursive: true, force: true }); // start without workshop rooms
  fs.mkdirSync(path.join(root, 'assets'));
  const figuresPath = path.join(root, 'src', 'js', '04-figures.js');
  const roomPath = path.join(root, 'src', 'rooms', 'testRoom.json');

  const server = await startDevServer({ root: root, port: 0, quiet: true });
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']
  });
  const context = await browser.newContext({ viewport: { width: 1400, height: 820 } });
  const page = await context.newPage();
  const problems = [];
  page.on('console', (message) => { if (message.type() === 'error') problems.push('console error: ' + message.text()); });
  page.on('pageerror', (error) => problems.push('page error: ' + error.message));
  page.on('dialog', (dialog) => dialog.accept());
  const inPage = (callback, argument) => page.evaluate(callback, argument);
  // Headless Chromium only draws (and so only runs the game loop) when asked.
  const frames = async (count) => { for (let index = 0; index < (count || 3); index++) await page.screenshot({ type: 'jpeg', quality: 5 }); };
  const workshopIsReady = () => page.waitForFunction(() => Boolean(window.lastReturnDebug && window.lastReturnDebug.roomWorkshop));
  const waitForReload = async (action) => {
    await inPage(() => { window.pageMarker = true; });
    await action();
    await page.waitForFunction(() => !window.pageMarker && Boolean(window.lastReturnDebug && window.lastReturnDebug.roomWorkshop), null, { timeout: 15000 });
  };
  const setNumber = async (fieldId, value) => {
    await page.fill('#' + fieldId + ' input[type="number"]', String(value));
    await frames(2);
  };

  try {
    await page.goto(server.address);
    await workshopIsReady();
    const plainPage = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), devPage = fs.readFileSync(path.join(root, 'build', 'workshop.html'), 'utf8');
    check('the plain game page has no workshop in it', !plainPage.includes('initializeWorkshop') && devPage.includes('initializeWorkshop'));
    check('the plain game page has no debug mode in it', !plainPage.includes('initializeDebugMode') && devPage.includes('initializeDebugMode'));

    // --- the room tool, on a room written as code ---
    await page.click('#button-workshop');
    await frames();
    const opened = await inPage(() => {
      const debug = window.lastReturnDebug;
      return { mode: debug.game.mode, key: debug.roomWorkshop.key, doors: debug.doors.length, hasRoom: debug.roomWorkshop.room !== null, canvasWidth: debug.renderer.canvas.clientWidth };
    });
    check('the workshop opens on a room written as code, with its doors, beside the panel',
      opened.mode === 'workshop' && opened.key === 'boilerRoom' && opened.doors === 2 && !opened.hasRoom && opened.canvasWidth === 1400 - 380, opened);

    // --- a new room: add, select by clicking, drag, turn, undo ---
    await page.click('#workshop-new-room');
    await page.click('.workshop-list-entry >> nth=0'); // the ceiling lamp, which hangs right where the test will click
    await page.keyboard.press('Delete');
    await page.keyboard.press('KeyT');
    await frames();
    await page.selectOption('#workshop-add-type', 'table');
    await page.click('#workshop-add-item');
    await frames();
    const tableIndex = await inPage(() => window.lastReturnDebug.roomWorkshop.room.items.findIndex((item) => item.type === 'table'));
    const added = await inPage(() => {
      const state = window.lastReturnDebug.roomWorkshop;
      return { count: state.room.items.length, selected: state.selectedIndex, table: state.room.items[state.selectedIndex], isDirty: state.isDirty };
    });
    check('a table is added in the middle of the view and selected',
      added.count === 2 && added.selected === tableIndex && Math.abs(added.table.x - 4) < 0.3 && Math.abs(added.table.z - 3) < 0.3 && added.isDirty, added);

    const canvasBox = await page.locator('#view-canvas').boundingBox();
    const middleX = canvasBox.x + canvasBox.width / 2, middleY = canvasBox.y + canvasBox.height / 2;
    await page.keyboard.press('Escape');
    await page.mouse.click(middleX + 300, middleY + 250); // bare floor
    check('clicking bare floor selects nothing', (await inPage(() => window.lastReturnDebug.roomWorkshop.selectedIndex)) === -1);
    await page.mouse.click(middleX, middleY);
    check('clicking the table selects it', (await inPage(() => window.lastReturnDebug.roomWorkshop.selectedIndex)) === tableIndex);

    await page.mouse.move(middleX, middleY);
    await page.mouse.down();
    await page.mouse.move(middleX + 60, middleY + 10, { steps: 4 });
    await page.mouse.move(middleX + 150, middleY + 40, { steps: 6 });
    await page.mouse.up();
    await frames();
    const dragged = await inPage((index) => window.lastReturnDebug.roomWorkshop.room.items[index], tableIndex);
    check('dragging moves it across the floor (east and south here)', dragged.x > added.table.x + 0.5 && dragged.z > added.table.z + 0.1 && dragged.x < 8, dragged);

    await page.keyboard.press('KeyR');
    check('R turns it', (await inPage((index) => window.lastReturnDebug.roomWorkshop.room.items[index].angle, tableIndex)) === 15);
    await page.keyboard.press('Control+z');
    check('Ctrl+Z takes the turn back', (await inPage((index) => window.lastReturnDebug.roomWorkshop.room.items[index].angle, tableIndex)) === 0);

    // --- the checks: a table in the doorway is reported, and no longer once it is moved away ---
    await setNumber('workshop-item-x', 4.5);
    await setNumber('workshop-item-z', 5.5);
    const blocked = await inPage(() => window.lastReturnDebug.roomWorkshop.problems.slice());
    check('a table just inside the door is reported', blocked.some((problem) => problem.includes('south wall')), blocked);
    await setNumber('workshop-item-z', 1.5);
    check('and not once it is moved away', (await inPage(() => window.lastReturnDebug.roomWorkshop.problems.length)) === 0, await inPage(() => window.lastReturnDebug.roomWorkshop.problems));

    // --- a pump unit's pipe stops at the ceiling of a low room, and is not reported as too tall ---
    await page.selectOption('#workshop-add-type', 'pumpUnit');
    await page.click('#workshop-add-item');
    await frames();
    const pumpUnit = await inPage(() => {
      const state = window.lastReturnDebug.roomWorkshop;
      const shapes = state.itemShapes[state.selectedIndex] || [];
      return { type: state.room.items[state.selectedIndex].type, ceiling: state.room.ceiling, shapeCount: shapes.length,
        highestPoint: Math.max.apply(null, shapes.map((shape) => shape.maximumY)), problems: state.problems.slice() };
    });
    check('a pump unit in a low room has its pipe end at the ceiling',
      pumpUnit.type === 'pumpUnit' && pumpUnit.shapeCount > 0 && Math.abs(pumpUnit.highestPoint - pumpUnit.ceiling) < 0.001 &&
      !pumpUnit.problems.some((problem) => problem.includes('ceiling')), pumpUnit);
    await page.keyboard.press('Delete');
    await frames();
    check('and the room is as it was once the pump unit is removed', (await inPage(() => window.lastReturnDebug.roomWorkshop.room.items.length)) === 2);

    // --- saving: a file appears, the page reloads into the saved room ---
    await page.fill('#workshop-room-key', 'testRoom');
    await page.locator('#workshop-room-key').blur();
    await page.fill('#workshop-room-name', 'test room');
    await page.locator('label.debug-option:has-text("Use this room in generated stations") input').check();
    await frames();
    await waitForReload(() => page.click('#workshop-save-room'));
    await frames();
    const savedFile = fs.existsSync(roomPath) ? JSON.parse(fs.readFileSync(roomPath, 'utf8')) : null;
    check('saving writes src/rooms/testRoom.json with the table in it',
      savedFile !== null && savedFile.name === 'TEST ROOM' && savedFile.useInStations === true && savedFile.items.some((item) => item.type === 'table' && item.z === 1.5), savedFile);
    const afterSave = await inPage(() => {
      const debug = window.lastReturnDebug, state = debug.roomWorkshop;
      return { mode: debug.game.mode, key: state.key, savedKey: state.savedKey, isDirty: state.isDirty, items: state.room ? state.room.items.length : -1, props: debug.interactables.length };
    });
    check('after the reload the workshop is open on the saved room, with nothing unsaved',
      afterSave.mode === 'workshop' && afterSave.key === 'testRoom' && afterSave.savedKey === 'testRoom' && !afterSave.isDirty && afterSave.items === 2, afterSave);

    // --- the saved room turns up in generated stations, and those can still be finished ---
    const gamePage = await context.newPage();
    gamePage.on('pageerror', (error) => problems.push('page error (game): ' + error.message));
    await gamePage.goto(server.address + 'game');
    await gamePage.waitForFunction(() => Boolean(window.lastReturnDebug));
    const inStations = await gamePage.evaluate(() => {
      const debug = window.lastReturnDebug;
      const found = [], audits = [];
      for (let seed = 1; seed <= 12; seed++) {
        if (!debug.loadStation('generated', seed, 'large', 'mixed', 'two')) continue;
        if (debug.zoneNames.some((name) => name.indexOf('TEST ROOM') === 0)) { found.push(seed); audits.push(debug.auditProgression().length); }
      }
      return { found: found, audits: audits };
    });
    await gamePage.close();
    check('the room is built into generated stations, which can still be finished',
      inStations.found.length > 0 && inStations.audits.every((count) => count === 0), inStations);

    // --- an unsaved change survives a reload caused by a change to the source ---
    if ((await inPage(() => window.lastReturnDebug.roomWorkshop.selectedIndex)) < 0) await page.click('.workshop-list-entry:has-text("Table")');
    await setNumber('workshop-item-x', 2);
    await frames(30); // long enough for the work in progress to be written to the browser's storage
    await waitForReload(() => fs.appendFileSync(path.join(root, 'src', 'js', '01-math.js'), '\n// touched by the workshop test\n'));
    await frames();
    const afterSourceChange = await inPage(() => {
      const state = window.lastReturnDebug.roomWorkshop;
      return { key: state.key, isDirty: state.isDirty, tableX: state.room.items.find((item) => item.type === 'table').x };
    });
    check('a change to the source reloads the page and keeps unsaved work', afterSourceChange.key === 'testRoom' && afterSourceChange.isDirty && afterSourceChange.tableX === 2, afterSourceChange);

    // --- a source file that does not parse: the page stays, with the reason on screen ---
    const mathPath = path.join(root, 'src', 'js', '01-math.js');
    const goodMath = fs.readFileSync(mathPath, 'utf8');
    await inPage(() => { window.pageMarker = true; });
    fs.writeFileSync(mathPath, goodMath + '\nfunction broken( {\n');
    await page.waitForFunction(() => !document.getElementById('workshop-banner').hidden, null, { timeout: 15000 });
    const banner = await inPage(() => ({ text: document.getElementById('workshop-banner').textContent, stillHere: window.pageMarker === true }));
    check('a broken source file is named on screen and the last good build stays', banner.stillHere && banner.text.includes('01-math.js'), banner);
    await waitForReload(() => fs.writeFileSync(mathPath, goodMath));
    check('fixing it reloads', (await inPage(() => document.getElementById('workshop-banner').hidden)) === true);

    // --- the creature tool ---
    await page.click('#workshop-tab-creatures');
    await frames(4);
    // The body walks on the spot, and its height rises and falls some twenty centimetres with every stride.
    // So "how tall" is the tallest it gets over a whole stride. One drawn frame moves the game on by a
    // twentieth of a second at most, and at its wandering pace a stride is then some 42 frames: 45 are taken.
    const tallestOverAStride = async () => {
      let tallest = 0;
      for (let frame = 0; frame < 45; frame++) {
        await frames(1);
        tallest = Math.max(tallest, await inPage(() => { const figure = window.lastReturnDebug.creatureWorkshop.figure; return (figure.boundsCenterY - figure.y) * 2; }));
      }
      return Math.round(tallest * 1000) / 1000;
    };
    const before = await inPage(() => {
      const state = window.lastReturnDebug.creatureWorkshop;
      return { thigh: state.figure.proportions.thigh, capsules: state.figure.capsuleCount };
    });
    before.tallest = await tallestOverAStride();
    // Whatever the file holds today, a thigh 30 cm longer makes a taller body.
    const longThigh = Math.round((before.thigh + 0.3) * 1000) / 1000;
    await setNumber('workshop-proportion-thigh', longThigh);
    await frames(1);
    const after = await inPage(() => {
      const debug = window.lastReturnDebug, state = debug.creatureWorkshop;
      return {
        thigh: state.figure.proportions.thigh,
        gameThigh: debug.hollow.figure.proportions.thigh, changes: Object.keys(state.overrides.hollow),
        originalThigh: state.originalFigure.proportions.thigh
      };
    });
    after.tallest = await tallestOverAStride();
    check('a proportion slider changes the body at once, for the whole game, and keeps the file\'s shape to compare',
      after.thigh === longThigh && after.tallest > before.tallest + 0.1 && after.gameThigh === longThigh && after.changes.join() === 'thigh' && after.originalThigh === before.thigh, { before: before, after: after });

    await page.selectOption('#workshop-creature-behaviour', 'hunt');
    await frames(40);
    const hunting = await inPage(() => window.lastReturnDebug.creatureWorkshop.figure.pose.armRaise);
    check('"Hunting" poses it with the game\'s own code: the arms come up', hunting > 0.3, hunting);

    await page.selectOption('#workshop-creature-view', 'scanned');
    await frames(6);
    const scanned = await inPage(() => ({ hits: window.lastReturnDebug.creatureWorkshop.figure.totalHits, isLit: window.lastReturnDebug.workshop.isLit }));
    check('the scanner view turns the lights off and leaves points on the body', scanned.hits > 200 && !scanned.isLit, scanned);

    await frames(30);
    await waitForReload(() => page.reload());
    await frames(4);
    const reloaded = await inPage(() => {
      const state = window.lastReturnDebug.creatureWorkshop;
      return { tool: window.lastReturnDebug.workshop.tool, thigh: state.figure.proportions.thigh, behaviour: state.behaviour };
    });
    check('a reload keeps the tool, the pose and the changed proportion', reloaded.tool === 'creatures' && reloaded.thigh === longThigh && reloaded.behaviour === 'hunt', reloaded);

    const dummyThigh = /FIGURE_PROPORTIONS_DUMMY = \{[^}]*thigh: ([0-9.]+)/.exec(fs.readFileSync(figuresPath, 'utf8'))[1];
    await waitForReload(() => page.click('#workshop-save-creature'));
    await frames(4);
    const figuresSource = fs.readFileSync(figuresPath, 'utf8');
    const written = await inPage(() => {
      const state = window.lastReturnDebug.creatureWorkshop;
      return { thigh: state.figure.proportions.thigh, fileThigh: state.fileProportions.hollow.thigh, changes: Object.keys(state.overrides.hollow).length };
    });
    const thighIn = (figureName, value) => new RegExp('FIGURE_PROPORTIONS_' + figureName + ' = \\{[^}]*thigh: ' + String(value).replace('.', '\\.') + ',').test(figuresSource);
    check('"Write to file" puts the number into FIGURE_PROPORTIONS_HOLLOW and nowhere else', thighIn('HOLLOW', longThigh) && thighIn('DUMMY', dummyThigh));
    check('after that the body is the same as the file', written.thigh === longThigh && written.fileThigh === longThigh && written.changes === 0, written);

    // --- leaving ---
    await waitForReload(() => page.click('#workshop-leave'));
    await frames();
    const left = await inPage(() => ({ mode: window.lastReturnDebug.game.mode, isOpen: window.lastReturnDebug.workshop.isOpen, titleShown: !document.getElementById('screen-title').hidden }));
    check('"Leave" goes back to the title screen', left.mode === 'title' && !left.isOpen && left.titleShown, left);

    check('no script errors along the way', problems.length === 0, problems);
  } catch (error) {
    console.log('Test run crashed:', error);
    failures.push('crash');
  }

  await browser.close();
  await server.close();
  fs.rmSync(root, { recursive: true, force: true });
  if (failures.length > 0) {
    console.log('\n' + failures.length + ' check(s) failed.');
    process.exitCode = 1;
  } else {
    console.log('\nAll workshop checks passed.');
  }
})();
