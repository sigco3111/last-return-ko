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
// With one of those after every door, the chases stay at 1.2 to 1.4 GB.
//
// Two things to know before putting one in:
//   - The game may run a frame of its own in such a pause, as it may between any two steps of a test. So
//     pause where nothing is going on: between two chases, never in the middle of one.
//   - A pause takes time, more on a machine that draws slowly. Thirteen cost nothing to speak of. Tried
//     before every station that quests-test.js and generators-test.js build (they hold 2.4 GB at the most,
//     stations waiting to be cleared away), a few hundred pauses took a gigabyte off and added up to a
//     minute, which is why those two have none.
// To see what a suite holds at the most: `node tools/measure-memory.js tools/<suite>-test.js`.
// Every page `openGame` opens has the function, also after the page is loaded again.
function installLetTheBrowserCatchUp() {
  window.letTheBrowserCatchUp = function () {
    return new Promise(function (resolve) { window.setTimeout(resolve, 0); });
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
