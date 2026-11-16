// Shared helper for the scripts in this folder: opens the built game in headless Chromium.
// `openGame({ dev: true })` opens the dev build instead (build/workshop.html), which has debug mode in it.
// Needs Playwright (npm install, then npx playwright install chromium).
const path = require('path');
const { chromium } = require('playwright');

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
