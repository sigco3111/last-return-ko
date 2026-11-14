// Builds the game from src/ into two files:
//   index.html                      a complete page: open it in a browser, or serve it with GitHub Pages
//   build/no-return.artifact.html   the same game without the outer page shell, for hosts that add their own
//
// `node build.js --dev` (or `npm run dev`, which also serves it and rebuilds on every change) builds a third:
//   build/workshop.html             the game plus everything in src/dev/: debug mode, and the workshop
//                                   with its room and creature editors
const fs = require('fs');
const path = require('path');

// Reads every .json file in src/rooms/. These are rooms made in the workshop; the file name is the room's key.
function readDesignedRooms(roomDirectory) {
  const rooms = {};
  if (!fs.existsSync(roomDirectory)) return rooms;
  for (const fileName of fs.readdirSync(roomDirectory).sort()) {
    if (path.extname(fileName).toLowerCase() !== '.json') continue;
    const filePath = path.join(roomDirectory, fileName);
    try {
      rooms[path.basename(fileName, path.extname(fileName))] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      throw new Error('src/rooms/' + fileName + ' is not valid JSON: ' + error.message);
    }
  }
  return rooms;
}

// `options.root` is the project folder (this one unless a test says otherwise); `options.dev` adds debug mode
// and the workshop.
// Returns the lines to print and the finished script, so the dev server can check it before serving it.
function build(options) {
  const settings = Object.assign({ root: __dirname, dev: false }, options || {});
  const sourceDirectory = path.join(settings.root, 'src');
  const scriptDirectory = path.join(sourceDirectory, 'js');
  const devDirectory = path.join(sourceDirectory, 'dev');
  const buildDirectory = path.join(settings.root, 'build');
  const messages = [];

  const readScripts = function (directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory).filter((name) => name.endsWith('.js')).sort()
      .map((name) => '// ===== ' + name + ' =====\n' + fs.readFileSync(path.join(directory, name), 'utf8'));
  };
  const gameScripts = readScripts(scriptDirectory);

  // Voice recordings dropped into assets/voice/ are packed into the page, so it stays one self-contained file.
  // The file name (without its ending) is the line's key: leftLift.mp3 is played for RADIO_MESSAGES.leftLift.
  const voiceDirectory = path.join(settings.root, 'assets', 'voice');
  const voiceMimeTypes = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };
  const voiceEntries = [];
  let voiceBytes = 0;
  if (fs.existsSync(voiceDirectory)) {
    for (const fileName of fs.readdirSync(voiceDirectory).sort()) {
      const mimeType = voiceMimeTypes[path.extname(fileName).toLowerCase()];
      if (!mimeType) continue;
      const bytes = fs.readFileSync(path.join(voiceDirectory, fileName));
      voiceBytes += bytes.length;
      voiceEntries.push('  ' + JSON.stringify(path.basename(fileName, path.extname(fileName))) +
        ': { mimeType: ' + JSON.stringify(mimeType) + ', base64: "' + bytes.toString('base64') + '" }');
    }
  }
  const voiceScript = '// ===== voice recordings from assets/voice (packed by build.js) =====\n' +
    'const EMBEDDED_VOICE_LINES = {\n' + voiceEntries.join(',\n') + '\n};\n';

  // Rooms made in the workshop are packed the same way. 03-workshop-rooms.js turns them into catalogue rooms.
  const designedRooms = readDesignedRooms(path.join(sourceDirectory, 'rooms'));
  const roomScript = '// ===== rooms from src/rooms (packed by build.js) =====\n' +
    'const DESIGNED_ROOMS = ' + JSON.stringify(designedRooms, null, 1) + ';\n';

  const wrapScript = function (scripts) {
    return '(function () {\n\'use strict\';\n' + voiceScript + roomScript + scripts.join('\n') + '\n})();\n';
  };
  const wrappedScript = wrapScript(gameScripts);

  const headMarkup = fs.readFileSync(path.join(sourceDirectory, 'head.html'), 'utf8').trim();
  const styleSheet = fs.readFileSync(path.join(sourceDirectory, 'style.css'), 'utf8');
  const bodyMarkup = fs.readFileSync(path.join(sourceDirectory, 'body.html'), 'utf8').trim();

  const fragment = [
    headMarkup,
    '<style>\n' + styleSheet + '</style>',
    bodyMarkup,
    '<script>\n' + wrappedScript + '</script>'
  ].join('\n') + '\n';

  // The small reset a hosting page would normally provide.
  const pageReset = 'body{margin:0}img{max-width:100%}[hidden]{display:none!important}';
  const makeStandalonePage = function (styles, script) {
    return [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
      '<meta name="description" content="A first-person horror game where a handheld LiDAR scanner is the only way to see.">',
      '<style>' + pageReset + '</style>',
      headMarkup,
      '<style>\n' + styles + '</style>',
      '</head>',
      '<body>',
      bodyMarkup,
      '<script>\n' + script + '</script>',
      '</body>',
      '</html>'
    ].join('\n') + '\n';
  };
  const standalonePage = makeStandalonePage(styleSheet, wrappedScript);

  fs.mkdirSync(buildDirectory, { recursive: true });
  fs.writeFileSync(path.join(settings.root, 'index.html'), standalonePage);
  fs.writeFileSync(path.join(buildDirectory, 'no-return.artifact.html'), fragment);
  fs.writeFileSync(path.join(buildDirectory, 'bundle.js'), wrappedScript);

  messages.push(voiceEntries.length === 0 ? 'No voice recordings in assets/voice: radio lines will be text only.'
    : 'Packed ' + voiceEntries.length + ' voice recording(s), ' + (voiceBytes / 1024).toFixed(0) + ' KB.');
  const roomCount = Object.keys(designedRooms).length;
  if (roomCount > 0) messages.push('Packed ' + roomCount + ' room(s) from src/rooms.');
  messages.push('Built index.html (' + (standalonePage.length / 1024).toFixed(0) + ' KB) from ' + gameScripts.length + ' scripts.');

  // The dev build: the same game with the scripts and styles from src/dev/ (debug mode, the workshop) added after it.
  // Nothing from src/dev/ ever reaches index.html.
  let workshopScript = null;
  if (settings.dev) {
    const devScripts = readScripts(devDirectory);
    const devStyles = fs.existsSync(devDirectory)
      ? fs.readdirSync(devDirectory).filter((name) => name.endsWith('.css')).sort()
        .map((name) => fs.readFileSync(path.join(devDirectory, name), 'utf8')).join('\n')
      : '';
    workshopScript = wrapScript(gameScripts.concat(devScripts));
    fs.writeFileSync(path.join(buildDirectory, 'workshop.html'), makeStandalonePage(styleSheet + '\n' + devStyles, workshopScript));
    fs.writeFileSync(path.join(buildDirectory, 'workshop-bundle.js'), workshopScript);
    messages.push('Built build/workshop.html with ' + devScripts.length + ' dev script(s).');
  }

  return { messages: messages, script: wrappedScript, workshopScript: workshopScript, buildDirectory: buildDirectory };
}

if (require.main === module) {
  const result = build({ dev: process.argv.includes('--dev') });
  for (const message of result.messages) console.log(message);
}

module.exports = { build };
