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
const wrappedScript = '(function () {\n\'use strict\';\n' + combinedScript + '\n})();\n';

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

console.log('Built index.html (' + (standalonePage.length / 1024).toFixed(0) + ' KB) from ' + scriptNames.length + ' scripts.');
