// Shared helper for the scripts in this folder: opens the built game in headless Chromium.
// `openGame({ dev: true })` opens the dev build instead (build/workshop.html), which has debug mode in it.
// Needs Playwright (npm install, then npx playwright install chromium).
const path = require('path');
const { chromium } = require('playwright');

// A long stretch of script, and the browser's own housekeeping.
//
// While a script of the page runs, the browser does nothing else in that page. Memory the script has let go
// of is not handed back, sounds that have ended are not cleared away, timers do not fire: all of that waits
// until the script has finished. A check that plays minutes of the game inside one `page.evaluate` is one
// such script, and what waits can come to gigabytes. The 520 chases through doorways in locked-doors-test.js
// (about 125,000 frames) left the page holding 1.8 to 2.3 GB. (Before the game put a limit on its own sounds,
// MAXIMUM_PLACED_SOUNDS and MAXIMUM_SHORT_SOUNDS in src/js/07-audio.js, they came to 9.7 GB: sounds that
// could not end.)
//
// So a long check hands the page back to the browser now and then. Inside the page, in a function marked
// `async`:
//     await window.letTheBrowserCatchUp();
// With one of those after every door, the chases stay at 1.1 to 1.4 GB. quests-test.js and generators-test.js
// take one before every station they build, 286 and 64 of them: 2.6 and 2.3 GB came down to 1.1 to 1.6.
//
// The game draws nothing in such a pause, and does not move on in it. Left alone it would: a frame of its own
// comes up in nearly every pause, and drawing one is slow in these tests. With those frames drawn, the pauses
// added a minute to quests-test.js on a fast machine and nine minutes on the one GitHub runs the tests on.
// So a frame that comes up during a pause is kept waiting and asked for again afterwards; it is drawn once
// the check has finished. A pause then takes about a twentieth of a second, and both suites finish sooner
// than they did with no pauses at all.
// To see what a suite holds at the most: `node tools/measure-memory.js tools/<suite>-test.js`.
// Every page `openGame` opens has the function, also after the page is loaded again.
function installLetTheBrowserCatchUp() {
  // The game asks for each of its frames through this, so that one that comes up during a pause can be kept waiting.
  const askBrowserForFrame = window.requestAnimationFrame.bind(window);
  const framesKeptWaiting = [];
  let isCatchingUp = false;
  window.requestAnimationFrame = function (drawFrame) {
    return askBrowserForFrame(function (timestamp) {
      if (isCatchingUp) framesKeptWaiting.push(drawFrame);
      else drawFrame(timestamp);
    });
  };
  window.letTheBrowserCatchUp = function () {
    isCatchingUp = true;
    return new Promise(function (resolve) {
      window.setTimeout(function () {
        isCatchingUp = false;
        // What was kept waiting is asked for again, and is drawn once the check has finished.
        for (const drawFrame of framesKeptWaiting.splice(0)) window.requestAnimationFrame(drawFrame);
        resolve();
      }, 0);
    });
  };
}

const gamePagePath = path.join(__dirname, '..', 'index.html');
const devPagePath = path.join(__dirname, '..', 'build', 'workshop.html');

async function openGame(options) {
  const settings = Object.assign({ width: 1280, height: 720, deviceScaleFactor: 1, isPhone: false, dev: false }, options || {});
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']
  });
  const context = await browser.newContext({
    viewport: { width: settings.width, height: settings.height },
    deviceScaleFactor: settings.deviceScaleFactor,
    hasTouch: settings.isPhone,
    isMobile: settings.isPhone
  });
  const page = await context.newPage();
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push('console error: ' + message.text());
  });
  page.on('pageerror', (error) => problems.push('page error: ' + error.message));
  await page.addInitScript(installLetTheBrowserCatchUp);
  await page.goto('file://' + (settings.dev ? devPagePath : gamePagePath));
  await page.waitForFunction((needsDebugMode) => Boolean(window.lastReturnDebug && (!needsDebugMode || window.lastReturnDebug.setDebugOption)), settings.dev);
  return { browser, page, problems };
}

// Starts a new game and skips the intro text.
async function startGame(page, isPhone) {
  if (isPhone) {
    await page.tap('#button-begin');
    await page.waitForTimeout(400);
    await page.tap('#button-skip-intro');
  } else {
    await page.click('#button-begin');
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
  }
  // An upright phone goes straight to the "turn your phone sideways" screen instead of play.
  await page.waitForFunction(() => ['playing', 'rotate'].includes(window.lastReturnDebug.game.mode));
}

// Headless Chromium only draws new frames when asked, so this nudges it to draw a few.
// A frame is drawn in software, and on a machine that is busy with other work one frame has been seen to
// take seven seconds where it usually takes a tenth of one. So a frame gets two minutes, not the usual
// thirty seconds, before the test gives up on it: a slow machine is not a fault in the game.
async function drawFrames(page, frameCount) {
  for (let frameIndex = 0; frameIndex < (frameCount || 2); frameIndex++) {
    await page.screenshot({ type: 'jpeg', quality: 5, timeout: 120000 });
  }
}

module.exports = { openGame, startGame, drawFrames };
