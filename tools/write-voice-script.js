// Writes docs/voice-lines.md: the list of lines to record, taken straight from src/js/00-config.js
// so the sheet can never disagree with the text the game shows.
const fs = require('fs');
const path = require('path');

const configSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '00-config.js'), 'utf8');
const config = new Function(configSource + '\nreturn { RADIO_MESSAGES: RADIO_MESSAGES, LOG_ENTRIES: LOG_ENTRIES };')();

// How each line should be said. Edit these freely; they only affect the sheet.
const dispatchDirections = {
  leftLift: 'Routine. Reading a checklist for the hundredth time.',
  firstSpool: 'Flat, mildly pleased. Already looking at the next item.',
  generatorStarted: 'Matter-of-fact, eyes on a gauge.',
  generatorFollowUp: 'Mild curiosity on "Odd." Then talks himself out of it. Not worried.',
  keycardTaken: 'Helpful, brief.',
  generatorNoFuel: 'Reading it off a screen. Mildly annoyed at the station, not at you. Said the first time any generator will not start for want of fuel.',
  generatorsWanted: 'Starts as a routine correction. Slows down on the last sentence: he knows what noise means down there. Only in stations with more generators, a little after Generator 2 starts.',
  badgesWanted: 'Passing on a request he did not want to pass on. Flat. A short pause before "Bring every one you find." Only in stations with the badges quest.',
  valvesWanted: 'Checklist voice. The last two sentences are almost an apology. Only in stations with the valves quest, a little after you take a keycard.',
  coresWanted: 'An afterthought, as if someone has just handed him a note. Only in stations with the core sample job.',
  winchBreakerOpen: 'The first two sentences flat. Then a beat. Then quicker: he knows what this means for you. Only with the breaker job.',
  breakerClosed: 'Fast and low. The last sentence is an order. Only with the breaker job.',
  doorBroken: 'Shaken, and trying not to sound it. The second sentence is disbelief. The last is advice, quietly. Heard the first time it breaks a door down.',
  lowerKeycardTaken: 'Helpful, brief, a little apologetic. Only heard in large stations, which have more than one card.',
  secondSpool: 'First sentence normal. Second sentence a little too quick. Said when the Stills of the calibration store wake, which today is when you take the spool there.',
  allSpools: 'Relief he is trying not to show. (The recording made before this text changed says "all three".)',
  uploadStarted: 'Businesslike. The last sentence is a dry understatement.',
  liftArrived: 'Urgent now, but still quiet. He does not raise his voice.'
};
const spoolDirections = {
  spool1: 'Day 1. Calm and precise, a surveyor dictating notes. Slightly amused at the end, not yet afraid.',
  spool2: 'Day 3. Quieter, closer to the microphone. The last two sentences are said with no emotion at all.',
  spool3: 'Day 4. Exhausted and very controlled. Speaking to whoever comes next.'
};

const lines = [];
lines.push('# Voice lines to record');
lines.push('');
lines.push('This sheet is generated from `src/js/00-config.js` by `npm run voice-script`. Do not edit it by hand; change the text in the config file and run the command again.');
lines.push('');
lines.push('## How it works');
lines.push('');
lines.push('- Record each line **clean and dry**: no radio effect, no reverb, no music. The game adds the bad-radio sound itself (narrow band, overdrive, static, dropouts), so every line matches and the effect can be retuned later without recording again.');
lines.push('- Save each line as its own file, named exactly as in the "File" column, and put it in `assets/voice/`.');
lines.push('- `.mp3` is best (small). `.wav`, `.ogg` and `.m4a` also work. Mono is enough.');
lines.push('- Trim the silence at the start and end to about a tenth of a second.');
lines.push('- Run `npm run build`. The build reports how many recordings it packed into the page.');
lines.push('- Any line without a file simply stays text only, so you can add them one at a time.');
lines.push('');
lines.push('To retune the effect, see `VOICE_TREATMENTS` in `src/js/07-audio.js`.');
lines.push('');
lines.push('## Voice 1: Dispatch (required for voiced radio)');
lines.push('');
lines.push('A night-shift controller at the surface, talking to you over a poor radio link. Middle-aged, tired, unhurried, procedural. He has sent crews down before. He never sounds alarmed, which is what makes the later lines uneasy. Keep the same voice and distance from the microphone for all nine lines.');
lines.push('');
lines.push('| File | Line | How to say it |');
lines.push('|---|---|---|');
for (const key of Object.keys(config.RADIO_MESSAGES)) {
  lines.push('| `' + key + '.mp3` | ' + config.RADIO_MESSAGES[key] + ' | ' + (dispatchDirections[key] || '') + ' |');
}
lines.push('');
lines.push('## Voice 2: A. Ripley, survey lead of Crew 2 (optional)');
lines.push('');
lines.push('The three survey spools are her dictated field notes. With a recording, a spool is read aloud while its text is open, through a softer "dictation machine" effect. A different voice from Dispatch: a professional in her thirties or forties, exact with words. Each spool is one file; leave a short pause between paragraphs.');
lines.push('');
for (const key of ['spool1', 'spool2', 'spool3']) {
  const entry = config.LOG_ENTRIES[key];
  lines.push('### `' + key + '.mp3`: ' + entry.heading);
  lines.push('');
  lines.push('*' + spoolDirections[key] + '*');
  lines.push('');
  for (const paragraph of entry.paragraphs) { lines.push('> ' + paragraph); lines.push('>'); }
  lines.pop();
  lines.push('');
}
lines.push('## Not voiced');
lines.push('');
lines.push('The four notes (security shift note, locker note, bench notes, inventory query) are paper, written by other people, and stay text only.');
lines.push('');

fs.writeFileSync(path.join(__dirname, '..', 'docs', 'voice-lines.md'), lines.join('\n'));
console.log('Wrote docs/voice-lines.md: ' + Object.keys(config.RADIO_MESSAGES).length + ' dispatch lines and 3 optional spools.');
