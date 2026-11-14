// Builds the game from src/ into two files:
//   index.html                      a complete page: open it in a browser, or serve it with GitHub Pages
//   build/no-return.artifact.html   the same game without the outer page shell, for hosts that add their own
const fs = require('fs');
const path = require('path');

const sourceDirectory = path.join(__dirname, 'src');
const scriptDirectory = path.join(sourceDirectory, 'js');
const buildDirectory = path.join(__dirname, 'build');

const scriptNames = fs.readdirSync(scriptDirectory).filter((name) => name.endsWith('.js')).sort();
const combinedScript = scriptNames
  .map((name) => '// ===== ' + name + ' =====\n' + fs.readFileSync(path.join(scriptDirectory, name), 'utf8'))
  .join('\n');
// Voice recordings dropped into assets/voice/ are packed into the page, so it stays one self-contained file.
// The file name (without its ending) is the line's key: leftLift.mp3 is played for RADIO_MESSAGES.leftLift.
const voiceDirectory = path.join(__dirname, 'assets', 'voice');
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

const wrappedScript = '(function () {\n\'use strict\';\n' + voiceScript + combinedScript + '\n})();\n';

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
const standalonePage = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  '<meta name="description" content="A first-person horror game where a handheld LiDAR scanner is the only way to see.">',
  '<style>' + pageReset + '</style>',
  headMarkup,
  '<style>\n' + styleSheet + '</style>',
  '</head>',
  '<body>',
  bodyMarkup,
  '<script>\n' + wrappedScript + '</script>',
  '</body>',
  '</html>'
].join('\n') + '\n';

fs.mkdirSync(buildDirectory, { recursive: true });
fs.writeFileSync(path.join(__dirname, 'index.html'), standalonePage);
fs.writeFileSync(path.join(buildDirectory, 'no-return.artifact.html'), fragment);
fs.writeFileSync(path.join(buildDirectory, 'bundle.js'), wrappedScript);

console.log(voiceEntries.length === 0 ? 'No voice recordings in assets/voice: radio lines will be text only.'
  : 'Packed ' + voiceEntries.length + ' voice recording(s), ' + (voiceBytes / 1024).toFixed(0) + ' KB.');
console.log('Built index.html (' + (standalonePage.length / 1024).toFixed(0) + ' KB) from ' + scriptNames.length + ' scripts.');
