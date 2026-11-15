// Measures the game's sounds, since a test cannot listen to them.
// For each sound it reports how loud it is (peak and average level, where 1.0 is the loudest a
// speaker can go) and where its energy sits ("centre" in Hz: low is dull or deep, high is bright or harsh).
// It fails if a sound is silent, if it would distort, or if the audio engine produced invalid numbers.
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

const FAR_DISTANCE = 12; // the Hollow's hunting growl is also measured from this far, to see how it carries

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
  const board = () => window.noReturnDebug.soundBoard;
  await page.evaluate(`(${board})().start()`);
  await page.waitForTimeout(300);
  const state = await page.evaluate(`(${board})().start()`);
  if (state !== 'running') { console.log('The audio engine is not running here (state: ' + state + '), so nothing can be measured.'); await browser.close(); process.exit(2); }

  const limits = await page.evaluate(`({ silentPeak: (${board})().silentPeak, distortingPeak: (${board})().distortingPeak })`);
  const nearDistance = await page.evaluate(`(${board})().state.distance`);
  const cases = [];
  for (const entry of await page.evaluate(`(${board})().list()`)) {
    const place = entry.hasPlace ? ', ' + nearDistance + ' m away' : '';
    cases.push({ key: entry.key, group: entry.group, name: entry.label + place, goesOn: entry.goesOn, distance: nearDistance });
    if (entry.key === 'growlHunt') cases.push({ key: entry.key, group: entry.group, name: entry.label + ', ' + FAR_DISTANCE + ' m away', goesOn: true, distance: FAR_DISTANCE });
  }
  const wanted = cases.filter((item) => filters.length === 0 || filters.some((filter) => (item.group + ' ' + item.name + ' ' + item.key).toLowerCase().includes(filter)));
  if (wanted.length === 0) { console.log('No sound has ' + filters.map((filter) => '"' + filter + '"').join(' or ') + ' in its name.'); await browser.close(); process.exit(1); }

  const listenTo = (item) => page.evaluate(([key, distance]) => {
    window.noReturnDebug.soundBoard.setDistance(distance);
    return window.noReturnDebug.soundBoard.listen(key);
  }, [item.key, item.distance]);
  const nameWidth = Math.max(...wanted.map((item) => item.name.length)) + 4;
  const failures = [];
  let group = null;
  console.log('sound'.padEnd(nameWidth) + 'peak   average  centre');
  for (const item of wanted) {
    if (item.group !== group) { group = item.group; console.log('\n' + group); }
    let result = await listenTo(item);
    // A very short sound can slip past the start of the measurement on a slow machine. Before calling a
    // sound that plays once silent, play it and listen once more.
    if (!item.goesOn && result.peak < limits.silentPeak) {
      await page.waitForTimeout(300);
      result = await listenTo(item);
    }
    console.log(('  ' + item.name).padEnd(nameWidth) + result.peak.toFixed(3) + '  ' + result.average.toFixed(4) + '   ' + Math.round(result.centre) + ' Hz');
    if (result.isInvalid) failures.push(item.name + ': invalid numbers in the output');
    if (result.peak < limits.silentPeak) failures.push(item.name + ': silent');
    if (result.peak > limits.distortingPeak) failures.push(item.name + ': loud enough to distort');
    await page.waitForTimeout(500); // let it ring out before the next one
  }
  if (problems.length > 0) failures.push('script errors: ' + problems.join('; '));
  await browser.close();
  console.log(failures.length === 0 ? '\nEvery sound is audible, undistorted and valid.' : '\nProblems:\n  ' + failures.join('\n  '));
  console.log('To hear them yourself: npm run audio-check -- --listen');
  process.exit(failures.length === 0 ? 0 : 1);
}

const wantsToListen = process.argv.includes('--listen');
(wantsToListen ? listen() : measure(process.argv.slice(2).filter((word) => !word.startsWith('--')).map((word) => word.toLowerCase())))
  .catch((error) => { console.error('Audio check crashed:', error); process.exit(1); });
