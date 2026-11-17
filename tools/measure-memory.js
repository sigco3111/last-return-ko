// Runs one test suite and reports how much memory its browser took at the most.
//
//   node tools/measure-memory.js tools/locked-doors-test.js
//   node tools/measure-memory.js tools/locked-doors-test.js --samples memory.csv
//
// The suite runs as it always does and prints what it always prints. Meanwhile this looks at the processes
// the suite started, four times a second, and remembers the most memory they held. At the end it says:
//   - the peak of the renderer: the process the game's page runs in, and the one that grows when a check
//     gives the browser no time to tidy up (see "A long stretch of script" in browser-harness.js);
//   - the peak of the whole browser: every process of it added up. Memory that two of them share is counted
//     twice in that, so read it as "no more than";
//   - the last line the suite had printed when the renderer peaked, which is the check before the costly one.
// With --samples every reading is also written to a file: seconds since the start, megabytes in the renderer,
// megabytes in the whole browser.
//
// It exits with whatever the suite exited with, so a failing suite still fails.
// Needs `ps`, so Linux or macOS. Run one suite at a time: two browsers at once share the machine's memory.
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const SAMPLE_EVERY_MILLISECONDS = 250;

const commandLine = process.argv.slice(2);
const samplesFlagIndex = commandLine.indexOf('--samples');
const samplesPath = samplesFlagIndex >= 0 ? commandLine[samplesFlagIndex + 1] : '';
if (samplesFlagIndex >= 0) commandLine.splice(samplesFlagIndex, 2);
const suitePath = commandLine[0];
if (!suitePath || (samplesFlagIndex >= 0 && !samplesPath)) {
  console.error('Usage: node tools/measure-memory.js tools/<suite>-test.js [--samples <file.csv>]');
  process.exit(2);
}

// Every process on the machine: its number, its parent's, the kilobytes of memory it holds, and its command line.
function listProcesses() {
  return new Promise((resolve) => {
    execFile('ps', ['-A', '-o', 'pid=,ppid=,rss=,args='], { maxBuffer: 64 * 1024 * 1024 }, (error, output) => {
      if (error) { resolve(null); return; }
      const processes = [];
      for (const line of output.split('\n')) {
        const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
        if (match) processes.push({ processId: Number(match[1]), parentId: Number(match[2]), kilobytes: Number(match[3]), commandLine: match[4] });
      }
      resolve(processes);
    });
  });
}

// The processes of one browser: everything that descends from the suite and is a part of Chromium.
// (Chromium names the job of every helper process with --type=...; the main process has no such flag.)
function findBrowserProcesses(processes, suiteProcessId) {
  const childrenOf = new Map();
  for (const entry of processes) {
    if (!childrenOf.has(entry.parentId)) childrenOf.set(entry.parentId, []);
    childrenOf.get(entry.parentId).push(entry);
  }
  const found = [], waiting = (childrenOf.get(suiteProcessId) || []).slice();
  while (waiting.length > 0) {
    const entry = waiting.pop();
    if (/chrom|headless_shell/i.test(entry.commandLine)) found.push(entry);
    for (const child of childrenOf.get(entry.processId) || []) waiting.push(child);
  }
  return found;
}

function formatMegabytes(megabytes) {
  return megabytes >= 1024 ? (megabytes / 1024).toFixed(2) + ' GB' : Math.round(megabytes) + ' MB';
}

const startedAt = Date.now();
const peak = { rendererMegabytes: 0, rendererAtSeconds: 0, rendererAfterLine: '', browserMegabytes: 0, browserAtSeconds: 0 };
const samples = [];
let lastLinePrinted = '', unfinishedLine = '', hasFailedToMeasure = false, isSampling = false;

const suite = spawn(process.execPath, [path.resolve(suitePath)], { stdio: ['inherit', 'pipe', 'inherit'] });
suite.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  const lines = (unfinishedLine + chunk.toString()).split('\n');
  unfinishedLine = lines.pop();
  for (const line of lines) if (line.trim()) lastLinePrinted = line.trim();
});

async function takeSample() {
  if (isSampling) return; // the reading before this one is still being taken
  isSampling = true;
  const processes = await listProcesses();
  isSampling = false;
  if (!processes) { hasFailedToMeasure = true; return; }
  let rendererMegabytes = 0, browserMegabytes = 0;
  for (const entry of findBrowserProcesses(processes, suite.pid)) {
    browserMegabytes += entry.kilobytes / 1024;
    if (entry.commandLine.includes('--type=renderer')) rendererMegabytes = Math.max(rendererMegabytes, entry.kilobytes / 1024);
  }
  const seconds = (Date.now() - startedAt) / 1000;
  samples.push([seconds.toFixed(2), rendererMegabytes.toFixed(1), browserMegabytes.toFixed(1)]);
  if (rendererMegabytes > peak.rendererMegabytes) {
    peak.rendererMegabytes = rendererMegabytes; peak.rendererAtSeconds = seconds; peak.rendererAfterLine = lastLinePrinted;
  }
  if (browserMegabytes > peak.browserMegabytes) { peak.browserMegabytes = browserMegabytes; peak.browserAtSeconds = seconds; }
}
const sampleTimer = setInterval(takeSample, SAMPLE_EVERY_MILLISECONDS);

suite.on('close', (exitCode, signal) => {
  clearInterval(sampleTimer);
  const totalSeconds = (Date.now() - startedAt) / 1000;
  if (samplesPath) fs.writeFileSync(samplesPath, 'seconds,rendererMegabytes,browserMegabytes\n' + samples.map((sample) => sample.join(',')).join('\n') + '\n');
  console.log('\n--- memory of ' + path.basename(suitePath) + ' (' + Math.round(totalSeconds) + ' s, ' + samples.length + ' readings) ---');
  if (hasFailedToMeasure || peak.browserMegabytes === 0) {
    console.log('Could not measure: ' + (hasFailedToMeasure ? '`ps` did not answer.' : 'no browser process was seen.'));
  } else {
    console.log('Peak of the renderer:      ' + formatMegabytes(peak.rendererMegabytes) + ', ' + Math.round(peak.rendererAtSeconds) + ' s in');
    console.log('Peak of the whole browser: ' + formatMegabytes(peak.browserMegabytes) + ', ' + Math.round(peak.browserAtSeconds) + ' s in');
    console.log('Last line before the renderer peaked: ' + (peak.rendererAfterLine || '(none yet)'));
    if (samplesPath) console.log('Every reading: ' + samplesPath);
  }
  if (signal) { console.log('The suite was stopped by ' + signal + '.'); process.exit(1); }
  process.exit(exitCode === null ? 1 : exitCode);
});
