// Shared helper for the scripts in this folder: opens the built game in headless Chromium.
// Needs Playwright (npm install, then npx playwright install chromium).
const path = require('path');
const { chromium } = require('playwright');

const gamePagePath = path.join(__dirname, '..', 'index.html');

async function openGame(options) {
  const settings = Object.assign({ width: 1280, height: 720, deviceScaleFactor: 1, isPhone: false }, options || {});
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
  await page.goto('file://' + gamePagePath);
  await page.waitForFunction(() => Boolean(window.noReturnDebug));
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
  await page.waitForFunction(() => ['playing', 'rotate'].includes(window.noReturnDebug.game.mode));
}

// Headless Chromium only draws new frames when asked, so this nudges it to draw a few.
async function drawFrames(page, frameCount) {
  for (let frameIndex = 0; frameIndex < (frameCount || 2); frameIndex++) {
    await page.screenshot({ type: 'jpeg', quality: 5 });
  }
}

module.exports = { openGame, startGame, drawFrames };
