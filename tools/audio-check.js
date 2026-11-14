// Measures the game's sounds, since a test cannot listen to them.
// For each sound it reports how loud it is (peak and average level, where 1.0 is the loudest a
// speaker can go) and where its energy sits ("centre" in Hz: low is dull or deep, high is bright or harsh).
// It fails if a sound is silent, if it would distort, or if the audio engine produced invalid numbers.
const { openGame, startGame } = require('./browser-harness.js');

(async () => {
  const { browser, page, problems } = await openGame({ dev: true }); // debug mode holds the creatures still
  await startGame(page, false);
  await page.evaluate(() => {
    const debug = window.noReturnDebug;
    const context = debug.audio.context;
    window.measureTap = context.createAnalyser();
    window.measureTap.fftSize = 2048;
    debug.audio.masterGain.connect(window.measureTap);
    debug.setDebugOption('freezeCreatures', true);
    debug.setDebugOption('invulnerable', true);
    // Samples the output every 20 ms for the given time and summarises it.
    window.measureFor = (seconds) => new Promise((resolve) => {
      const tap = window.measureTap;
      const samples = new Float32Array(tap.fftSize);
      const spectrum = new Float32Array(tap.frequencyBinCount);
      let peak = 0, squareSum = 0, sampleCount = 0, weighted = 0, weightTotal = 0, isInvalid = false;
      const started = performance.now();
      const timer = setInterval(() => {
        tap.getFloatTimeDomainData(samples);
        for (const value of samples) {
          if (!Number.isFinite(value)) isInvalid = true;
          peak = Math.max(peak, Math.abs(value));
          squareSum += value * value;
          sampleCount++;
        }
        tap.getFloatFrequencyData(spectrum);
        for (let bin = 1; bin < spectrum.length; bin++) {
          const power = Math.pow(10, spectrum[bin] / 10);
          weighted += power * bin * context.sampleRate / tap.fftSize;
          weightTotal += power;
        }
        if (performance.now() - started > seconds * 1000) {
          clearInterval(timer);
          resolve({ peak: peak, average: Math.sqrt(squareSum / Math.max(1, sampleCount)), centre: weightTotal > 0 ? weighted / weightTotal : 0, isInvalid: isInvalid });
        }
      }, 20);
    });
  });

  const state = await page.evaluate(() => window.noReturnDebug.audio.context.state);
  if (state !== 'running') { console.log('The audio engine is not running here (state: ' + state + '), so nothing can be measured.'); await browser.close(); process.exit(2); }

  // Each entry: name, what to do in the page, how long to listen, and whether the constant room tone is muted first.
  const hollowAt = (aggressionState, anger, held, distance) => `(() => { const d = window.noReturnDebug; d.spawnHollow(d.player.x + ${distance}, d.player.z); d.hollow.state = ${aggressionState}; d.hollow.anger = ${anger}; d.hollow.heldAmount = ${held}; d.simulate(0.1); })()`;
  const cases = [
    ['room tone only', `window.noReturnDebug.hollow.isActive = false; window.noReturnDebug.simulate(0.1)`, 2.0, false],
    ['Hollow growl, calm, 3 m away', hollowAt(0, 0, 0, 3), 3.0, true],
    ['Hollow growl, hunting, 3 m away', hollowAt(2, 0.5, 0, 3), 3.0, true],
    ['Hollow growl, hunting, 12 m away', hollowAt(2, 0.5, 0, 12), 3.0, true],
    ['Hollow shriek in the beam, 3 m away', hollowAt(2, 1, 1, 3), 2.0, true],
    ['Hollow removed (silence check setup)', `window.noReturnDebug.hollow.isActive = false; window.noReturnDebug.simulate(0.1)`, 0.6, true],
    ['full sweep', `window.noReturnDebug.playSweepSound(2.4)`, 2.4, true],
    ['interface blip', `window.noReturnDebug.playInterfaceBlip(740)`, 0.4, true],
    ['radio opening', `window.noReturnDebug.playRadioBlip()`, 0.6, true],
    ['door denied', `window.noReturnDebug.playDeniedSound()`, 0.6, true],
    ['stinger: found you', `window.noReturnDebug.playStinger('spotted')`, 2.0, true],
    ['stinger: apparition', `window.noReturnDebug.playStinger('phantom')`, 3.0, true],
    ['stinger: the Stills wake', `window.noReturnDebug.playStinger('still')`, 1.8, true],
    ['stinger: caught', `window.noReturnDebug.playStinger('death')`, 1.8, true]
  ];
  const failures = [];
  console.log('sound'.padEnd(38) + 'peak   average  centre');
  for (const [name, action, seconds, muteRoomTone] of cases) {
    await page.evaluate(([code, mute]) => {
      const audio = window.noReturnDebug.audio;
      audio.ambienceGain.gain.cancelScheduledValues(audio.context.currentTime);
      audio.ambienceGain.gain.setValueAtTime(mute ? 0 : 0.9, audio.context.currentTime);
      if (code.includes('spawnHollow') || code.includes('simulate')) eval(code);
    }, [action, muteRoomTone]);
    // Continuous sounds (the growl) need a moment to fade in; one-shots must be caught from their first instant.
    const isContinuous = name.startsWith('Hollow') || name.startsWith('room');
    if (isContinuous) await page.waitForTimeout(450);
    else await page.evaluate(([code]) => eval(code), [action]);
    const result = await page.evaluate((duration) => window.measureFor(duration), seconds);
    console.log(name.padEnd(38) + result.peak.toFixed(3) + '  ' + result.average.toFixed(4) + '   ' + Math.round(result.centre) + ' Hz');
    if (result.isInvalid) failures.push(name + ': invalid numbers in the output');
    if (result.peak < 0.004 && !name.includes('silence check')) failures.push(name + ': silent');
    if (result.peak > 0.98) failures.push(name + ': loud enough to distort');
    await page.waitForTimeout(500);
  }
  if (problems.length > 0) failures.push('script errors: ' + problems.join('; '));
  await browser.close();
  console.log(failures.length === 0 ? '\nEvery sound is audible, undistorted and valid.' : '\nProblems:\n  ' + failures.join('\n  '));
  process.exit(failures.length === 0 ? 0 : 1);
})().catch((error) => { console.error('Audio check crashed:', error); process.exit(1); });
