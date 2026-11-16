// Measures the game's sounds, since a test cannot listen to them.
// Everything is measured where it leaves the compressor, which is what reaches the speakers. For each sound:
//   loud     how loud it is to an ear at its loudest moment, in decibels below the most the speakers can do.
//            Ten less is about half as loud. Deep rumble counts for little here, as it does in your head.
//   peak     how large the wave got at the speakers, of 1.0. Above 1.0 the speakers cut it off flat.
//   held     how many decibels the compressor took off it (never much: see SOUND_OUTPUT in src/js/07-audio.js)
//   centre   where its energy sits, in Hz: low is dull or deep, high is bright or harsh
//   heard to for a sound that comes from somewhere: how far away it can still be heard, taken as the distance at
//            which it has faded to the level of the room tone. This is the number a caption's `withinMetres`
//            should have (CAPTIONS in src/js/00-config.js), so that a caption shows where ears would hear it.
// It fails only if a sound is silent or the audio engine produced invalid numbers.
// Two lists follow that are for you to judge, not faults:
//   - sounds whose peak is over 1.0. They get a harsh edge, and turning them up further adds edge, not loudness.
//     In a horror game some of that may be exactly what you want.
//   - sounds with a big wave for how little of it is heard, because most of the sound is very low. These are
//     the ones that stay hard to hear however far they are turned up.
//
// The sounds are the ones on the workshop's sound board (src/dev/23-workshop-sounds.js), played the way
// the board plays them: one at a time, with nothing else on.
//
//   node tools/audio-check.js                 measures every sound
//   node tools/audio-check.js hollow door     only the sounds with "hollow" or "door" in their name or group
//   node tools/audio-check.js --listen        measures nothing: opens the sound board in your browser, where
//                                             every sound is on a button and you can hear it yourself
//                                             (--port 5000 for another port)
const { spawn } = require('child_process');
const { openGame } = require('./browser-harness.js');
const { startDevServer, DEFAULT_PORT } = require('./dev-server.js');

// The same line the sound board draws (SOUND_BOARD_LITTLE_HEARD_FOR_ITS_WAVE): loudness to the ear, less the size of the wave in decibels.
const LITTLE_HEARD_FOR_ITS_WAVE = -34;
const FAR_DISTANCE = 12; // the Hollow's hunting growl is also measured from this far, to see how it carries
const QUIETEST_HEARD = -48; // dB: about the level of the room tone. A sound from somewhere counts as heard down to this.

// How far away a sound measured at `metres` with loudness `decibels` still reaches QUIETEST_HEARD. Sound from a
// place fades the way createTemporaryPanner in src/js/07-audio.js sets it: full within 2.5 m, then as
// 2.5 / (2.5 + 1.2 x (distance - 2.5)). The Hollow's own voice fades very slightly faster; near enough.
function metresHeardTo(decibels, metres) {
  const fadeAt = function (distance) { return distance <= 2.5 ? 1 : 2.5 / (2.5 + 1.2 * (distance - 2.5)); };
  const fadeWanted = fadeAt(metres) * Math.pow(10, (QUIETEST_HEARD - decibels) / 20);
  if (fadeWanted >= 1) return 0;
  return 2.5 + (2.5 / fadeWanted - 2.5) / 1.2;
}

function openInBrowser(address) {
  const command = process.platform === 'darwin' ? ['open', address]
    : process.platform === 'win32' ? ['cmd', '/c', 'start', '', address]
      : ['xdg-open', address];
  try {
    const child = spawn(command[0], command.slice(1), { stdio: 'ignore', detached: true });
    child.on('error', () => {}); // no such program: the address has been printed, so it can be opened by hand
    child.unref();
  } catch (error) { /* the same */ }
}

// Serves the dev build (as `npm run dev` does, so the page reloads when the source changes) and opens
// the sound board in it.
async function listen() {
  const portPosition = process.argv.indexOf('--port');
  const port = Number((portPosition >= 0 && process.argv[portPosition + 1]) || process.env.PORT || DEFAULT_PORT);
  let address = 'http://localhost:' + port + '/';
  console.log('');
  try {
    address = (await startDevServer({ port: port })).address;
    console.log('Sound board: ' + address + '#sounds');
    console.log('Every sound is on a button. Change its number in SOUND_LEVELS (top of src/js/07-audio.js) and the page reloads with it.');
    console.log('Ctrl+C stops.');
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    // Most likely `npm run dev` in another terminal, which serves the same page.
    console.log('Port ' + port + ' is already in use. If that is `npm run dev`, the sound board is at:');
    console.log('  ' + address + '#sounds');
    console.log('If it is something else: npm run audio-check -- --listen --port ' + (port + 1));
    openInBrowser(address + '#sounds');
    process.exit(0); // nothing of ours is serving, so there is nothing to keep running
  }
  openInBrowser(address + '#sounds');
}

async function measure(filters) {
  const { browser, page, problems } = await openGame({ dev: true });
  await page.click('#button-workshop');
  await page.click('#workshop-tab-sounds');
  const board = () => window.lastReturnDebug.soundBoard;
  await page.evaluate(`(${board})().start()`);
  await page.waitForTimeout(300);
  const state = await page.evaluate(`(${board})().start()`);
  if (state !== 'running') { console.log('The audio engine is not running here (state: ' + state + '), so nothing can be measured.'); await browser.close(); process.exit(2); }

  const limits = await page.evaluate(`({ silentPeak: (${board})().silentPeak, distortingPeak: (${board})().distortingPeak, })`);
  const nearDistance = await page.evaluate(`(${board})().state.distance`);
  const cases = [];
  for (const entry of await page.evaluate(`(${board})().list()`)) {
    const place = entry.hasPlace ? ', ' + nearDistance + ' m away' : '';
    cases.push({ key: entry.key, group: entry.group, name: entry.label + place, goesOn: entry.goesOn, distance: nearDistance, hasPlace: entry.hasPlace === true });
    if (entry.key === 'growlHunt') cases.push({ key: entry.key, group: entry.group, name: entry.label + ', ' + FAR_DISTANCE + ' m away', goesOn: true, distance: FAR_DISTANCE, hasPlace: true });
  }
  const wanted = cases.filter((item) => filters.length === 0 || filters.some((filter) => (item.group + ' ' + item.name + ' ' + item.key).toLowerCase().includes(filter)));
  if (wanted.length === 0) { console.log('No sound has ' + filters.map((filter) => '"' + filter + '"').join(' or ') + ' in its name.'); await browser.close(); process.exit(1); }

  const listenTo = (item) => page.evaluate(([key, distance]) => {
    window.lastReturnDebug.soundBoard.setDistance(distance);
    return window.lastReturnDebug.soundBoard.listen(key);
  }, [item.key, item.distance]);
  const nameWidth = Math.max(...wanted.map((item) => item.name.length)) + 4;
  const failures = [], overloading = [], mostlyTooLow = [];
  let group = null;
  console.log('sound'.padEnd(nameWidth) + 'loud     peak   held    centre    heard to');
  for (const item of wanted) {
    if (item.group !== group) { group = item.group; console.log('\n' + group); }
    let result = await listenTo(item);
    // A very short sound can slip past the start of the measurement on a slow machine. Before calling a
    // sound that plays once silent, play it and listen once more.
    if (!item.goesOn && result.peak < limits.silentPeak) {
      await page.waitForTimeout(300);
      result = await listenTo(item);
    }
    console.log(('  ' + item.name).padEnd(nameWidth) + (Math.round(result.loudness) + ' dB').padEnd(9) + result.peak.toFixed(2).padEnd(7) +
      (result.heldBack >= 1 ? Math.round(result.heldBack) + ' dB' : '-').padEnd(8) + (Math.round(result.centre) + ' Hz').padEnd(10) +
      (item.hasPlace && isFinite(result.loudness) ? Math.round(metresHeardTo(result.loudness, item.distance)) + ' m' : ''));
    if (result.isInvalid) failures.push(item.name + ': invalid numbers in the output');
    if (result.peak < limits.silentPeak) failures.push(item.name + ': silent');
    if (result.peak > limits.distortingPeak) overloading.push(item.name + ': peak ' + result.peak.toFixed(2) + ', heard at ' + Math.round(result.loudness) + ' dB');
    if (result.peak >= 0.3 && result.loudness - 20 * Math.log10(result.peak) <= LITTLE_HEARD_FOR_ITS_WAVE) {
      mostlyTooLow.push(item.name + ': peak ' + result.peak.toFixed(2) + ', but heard at only ' + Math.round(result.loudness) + ' dB (its energy sits around ' + Math.round(result.centre) + ' Hz)');
    }
    await page.waitForTimeout(500); // let it ring out before the next one
  }
  if (problems.length > 0) failures.push('script errors: ' + problems.join('; '));
  await browser.close();
  console.log(failures.length === 0 ? '\nEvery sound is audible and the numbers are valid.' : '\nProblems:\n  ' + failures.join('\n  '));
  if (overloading.length > 0) {
    console.log('\nOver what a speaker can take (the top of the wave is cut off flat: a harsh edge, and no louder for being turned up).');
    console.log('Yours to judge; for some sounds in a horror game that edge is the point:\n  ' + overloading.join('\n  '));
  }
  if (mostlyTooLow.length > 0) {
    console.log('\nA big wave for how little of it is heard (most of the sound is too low for ears and small speakers).');
    console.log('These stay hard to hear however far they are turned up. More of the sound between 150 and 600 Hz would help:\n  ' + mostlyTooLow.join('\n  '));
  }
  console.log('To hear them yourself: npm run audio-check -- --listen');
  process.exit(failures.length === 0 ? 0 : 1);
}

const wantsToListen = process.argv.includes('--listen');
(wantsToListen ? listen() : measure(process.argv.slice(2).filter((word) => !word.startsWith('--')).map((word) => word.toLowerCase())))
  .catch((error) => { console.error('Audio check crashed:', error); process.exit(1); });
