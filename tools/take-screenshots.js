// Regenerates the pictures in docs/screenshots/ from the built game.
const path = require('path');
const { openGame, startGame, drawFrames } = require('./browser-harness.js');

const outputDirectory = path.join(__dirname, '..', 'docs', 'screenshots');

async function capture(page, name) {
  // Messages and captions are part of play, but they cover the picture.
  await page.evaluate(() => {
    document.getElementById('hud-messages').replaceChildren();
    document.getElementById('hud-caption').classList.remove('is-visible');
  });
  await drawFrames(page, 3);
  await page.evaluate(() => document.getElementById('hud-messages').replaceChildren());
  await page.screenshot({ path: path.join(outputDirectory, name + '.jpg'), type: 'jpeg', quality: 86 });
  console.log('wrote ' + name + '.jpg');
}

// Stands at each listed spot in turn and fires full sweeps in the listed directions.
async function scanFrom(page, stops) {
  await page.evaluate((stopList) => {
    const debug = window.noReturnDebug;
    for (const stop of stopList) {
      for (const yaw of stop.yaws) {
        debug.teleport(stop.x, stop.z, yaw);
        debug.player.pitch = stop.pitch || 0;
        debug.player.heat = 0; debug.player.isOverheated = false;
        debug.sweep();
        debug.simulate(2.6);
      }
    }
  }, stops);
}

async function paintFor(page, seconds, spreadDegrees) {
  await page.evaluate(([duration, spread]) => {
    const debug = window.noReturnDebug;
    debug.player.heat = 0; debug.player.isOverheated = false;
    debug.setScannerSpread(spread);
    debug.setScanHeld(true);
    debug.simulate(duration);
  }, [seconds, spreadDegrees]);
}

async function stand(page, x, z, yaw, pitch, settleSeconds) {
  await page.evaluate(([px, pz, pyaw, ppitch, settle]) => {
    const debug = window.noReturnDebug;
    debug.setScanHeld(false);
    debug.teleport(px, pz, pyaw);
    debug.player.pitch = ppitch;
    debug.simulate(settle);
  }, [x, z, yaw, pitch || 0, settleSeconds === undefined ? 1.2 : settleSeconds]);
}

const east = Math.PI / 2, north = 0;
const corridorStops = [
  { x: 19.5, z: 52.9, yaws: [east, east - 0.5, east + 0.5] },
  { x: 24.3, z: 53.1, yaws: [east, east - 0.7, east + 0.7] },
  { x: 30.5, z: 52.8, yaws: [east] }
];

// Each picture does its own scanning, so any of them can be retaken alone:
//   node tools/take-screenshots.js hollow map
const desktopShots = {
  'corridor': async (page) => {
    await scanFrom(page, corridorStops);
    await stand(page, 19.2, 53.0, east, 0.02);
    await paintFor(page, 0.35, 9);
    await capture(page, 'corridor');
  },
  'pump-hall': async (page) => {
    await scanFrom(page, [
      { x: 47.6, z: 52.9, yaws: [east - 0.9, east - 0.3, east + 0.3], pitch: 0.15 },
      { x: 50.5, z: 51.5, yaws: [east - 1.0, east - 0.4, east + 0.2], pitch: 0.25 },
      { x: 54.0, z: 51.6, yaws: [north, east - 0.6, east], pitch: 0.2 },
      { x: 54.0, z: 45.6, yaws: [north - 0.5, north + 0.5, east], pitch: 0.3 }
    ]);
    await stand(page, 47.7, 53.2, east - 0.62, 0.16);
    await paintFor(page, 0.35, 11);
    await capture(page, 'pump-hall');
  },
  'calibration-store': async (page) => {
    await scanFrom(page, [
      { x: 32.5, z: 22.3, yaws: [north - 0.7, north, north + 0.7], pitch: 0.05 },
      { x: 32.5, z: 19.0, yaws: [north - 0.8, north, north + 0.8], pitch: 0.05 },
      { x: 29.5, z: 17.5, yaws: [north + 0.9, north], pitch: 0.05 }
    ]);
    await stand(page, 32.5, 22.4, north + 0.12, 0.03);
    await paintFor(page, 0.3, 14);
    await capture(page, 'calibration-store');
  },
  'shaft': async (page) => {
    await scanFrom(page, [
      { x: 59.5, z: 14.4, yaws: [north - 0.8, north, north + 0.8], pitch: 0.1 },
      { x: 59.5, z: 14.4, yaws: [north - 0.5, north + 0.5], pitch: -0.5 },
      { x: 59.5, z: 12.5, yaws: [north - 0.6, north, north + 0.6], pitch: 0.22 },
      { x: 59.5, z: 9.4, yaws: [north, north - 0.9, north + 0.9], pitch: 0.2 }
    ]);
    await stand(page, 59.5, 14.5, north, 0.07);
    await paintFor(page, 0.3, 12);
    await capture(page, 'shaft');
  },
  'map': async (page) => {
    // One look around in a handful of rooms is enough to draw a floor plan.
    const around = [north, east, Math.PI, -east];
    await scanFrom(page, [
      { x: 13.5, z: 51.2, yaws: around }, { x: 13.5, z: 56.0, yaws: around }, { x: 24.0, z: 53.0, yaws: around },
      { x: 34.0, z: 53.0, yaws: around }, { x: 25.5, z: 48.0, yaws: around }, { x: 43.5, z: 52.5, yaws: around },
      { x: 53.0, z: 52.0, yaws: around }, { x: 58.0, z: 46.0, yaws: around }, { x: 54.0, z: 34.5, yaws: around },
      { x: 31.5, z: 30.5, yaws: around }, { x: 32.5, z: 17.0, yaws: around }, { x: 59.5, z: 13.6, yaws: around }
    ]);
    await stand(page, 53.0, 52.0, east - 0.5, 0.05);
    await drawFrames(page, 2);
    await page.keyboard.press('KeyM');
    await capture(page, 'map');
    await page.keyboard.press('KeyM');
  },
  'hollow': async (page) => {
    await scanFrom(page, corridorStops);
    await page.evaluate(([facing]) => {
      const debug = window.noReturnDebug;
      debug.teleport(21.5, 53.0, facing);
      debug.player.pitch = 0.06;
      debug.spawnHollow(27.2, 52.8);
      debug.hollow.graceTimer = 99;
      debug.hollow.targetX = 27.2; debug.hollow.targetZ = 52.8;
      debug.hollow.figure.yaw = -Math.PI / 2;
      debug.simulate(0.3);
    }, [east]);
    await paintFor(page, 0.7, 8);
    await capture(page, 'hollow');
    await page.evaluate(() => { window.noReturnDebug.setScanHeld(false); window.noReturnDebug.hollow.isActive = false; });
  },
  'debug-mode': async (page) => {
    // The calibration store again, this time with the lights on and the creatures drawn.
    await scanFrom(page, [{ x: 32.5, z: 22.3, yaws: [north], pitch: 0.05 }]);
    await stand(page, 32.5, 22.4, north + 0.12, 0.03);
    await page.keyboard.press('Backquote');
    await drawFrames(page, 2);
    for (const key of ['showCreatures', 'seeThroughWalls', 'lightStation', 'showSenses', 'creaturesOnMap']) {
      await page.evaluate((optionKey) => document.getElementById('debug-option-' + optionKey).click(), key);
    }
    await page.mouse.click(900, 300); // take the mouse back; the panel stays up
    // Capturing the mouse turns the view; let that settle, then face the room again.
    await page.waitForTimeout(500);
    await drawFrames(page, 2);
    await page.evaluate(([facing]) => {
      const debug = window.noReturnDebug;
      debug.setScanHeld(false);
      debug.simulate(0.05);
      debug.teleport(32.5, 22.4, facing);
      debug.player.pitch = 0.03;
      debug.simulate(0.3);
    }, [north + 0.12]);
    await capture(page, 'debug-mode');
    await page.evaluate(() => {
      const debug = window.noReturnDebug;
      for (const key of Object.keys(debug.debugState.options)) debug.setDebugOption(key, false);
    });
    await page.keyboard.press('Backquote');
    await page.keyboard.press('Backquote');
  }
};

(async () => {
  const requested = process.argv.slice(2);
  const wants = (name) => requested.length === 0 || requested.includes(name);

  // ---- desktop, 1920 x 1080 ----
  const { browser, page, problems } = await openGame({ deviceScaleFactor: 1.5 });
  if (wants('title')) {
    for (let pump = 0; pump < 45; pump++) await drawFrames(page, 1); // let the title screen scan the lobby for a while
    await page.screenshot({ path: path.join(outputDirectory, 'title.jpg'), type: 'jpeg', quality: 86 });
    console.log('wrote title.jpg');
  }
  await startGame(page, false);
  await page.evaluate(() => {
    const debug = window.noReturnDebug;
    debug.game.difficulty = Object.assign({}, debug.game.difficulty, { stillsEnabled: false });
    debug.grantPower();
    debug.grantKeycard();
  });
  for (const name of Object.keys(desktopShots)) {
    if (wants(name)) await desktopShots[name](page);
  }
  await browser.close();
  if (problems.length > 0) console.log('Problems reported by the page:', problems);

  // ---- phone ----
  if (wants('phone')) {
    const phone = await openGame({ width: 844, height: 390, deviceScaleFactor: 2, isPhone: true }); // held sideways
    await startGame(phone.page, true);
    await scanFrom(phone.page, [
      { x: 14.0, z: 56.0, yaws: [-0.4, -1.1, 0.3], pitch: 0.1 },
      { x: 13.0, z: 51.0, yaws: [-1.4, -0.4], pitch: 0.1 }
    ]);
    await stand(phone.page, 15.2, 56.6, -0.75, 0.08);
    await capture(phone.page, 'phone');
    await phone.browser.close();
  }
})().catch((error) => { console.error('Screenshot run crashed:', error); process.exit(1); });
