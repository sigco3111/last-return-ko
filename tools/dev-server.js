// The workshop's server: `npm run dev`, then open the address it prints.
//
//   - builds the game with the workshop added (build.js --dev) and serves it
//   - rebuilds whenever something in src/ or assets/ changes and tells the open page to reload,
//     so a number changed in the source shows up in the workshop a moment later
//   - lets the workshop save: a room becomes src/rooms/<key>.json, and creature proportions are
//     written into the FIGURE_PROPORTIONS_... blocks of src/js/04-figures.js
//
// Node built-ins only. It listens on this machine only (127.0.0.1), and only the workshop page it
// serves itself can ask it to write anything.
//
// Options: --port 4471 (or PORT=...), --root <project folder> (used by the tests).
const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');
const { build } = require('../build.js');

const DEFAULT_PORT = 4471;
const ROOM_KEY_PATTERN = /^[a-z][A-Za-z0-9]{1,30}$/;
const FIGURE_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,30}$/;

// ---------------------------------------------------------------------------
// Writing things back into the source
// ---------------------------------------------------------------------------

// Numbers are written the way a person would type them: at most four decimals, no trailing zeros.
function formatNumber(value) {
  return String(Math.round(value * 10000) / 10000);
}

// Changes numbers inside one `const <constantName> = { ... };` block and leaves everything else
// (layout, comments, other keys) exactly as it was. `values` maps a key to a number or a list of numbers.
// Returns { source, changedKeys, missingKeys }.
function patchObjectNumbers(source, constantName, values) {
  const blockStart = source.indexOf('const ' + constantName + ' = {');
  if (blockStart < 0) throw new Error('There is no "const ' + constantName + ' = {" in the file.');
  const blockEnd = source.indexOf('\n};', blockStart);
  if (blockEnd < 0) throw new Error('The block of ' + constantName + ' has no closing "};" on a line of its own.');
  const lines = source.slice(blockStart, blockEnd).split('\n');
  const changedKeys = [], missingKeys = [];
  for (const key of Object.keys(values)) {
    const value = values[key];
    const isList = Array.isArray(value);
    if (isList ? !value.every(Number.isFinite) : !Number.isFinite(value)) throw new Error(key + ' is not a number.');
    const pattern = isList
      ? new RegExp('(^|[^A-Za-z0-9_$])(' + key + '\\s*:\\s*\\[)[^\\]]*(\\])')
      : new RegExp('(^|[^A-Za-z0-9_$])(' + key + '\\s*:\\s*)-?[0-9]*\\.?[0-9]+(?:e-?[0-9]+)?');
    let wasFound = false;
    for (let lineIndex = 0; lineIndex < lines.length && !wasFound; lineIndex++) {
      // Only the code part of a line is touched, never what follows "//".
      const commentStart = lines[lineIndex].indexOf('//');
      const code = commentStart < 0 ? lines[lineIndex] : lines[lineIndex].slice(0, commentStart);
      const comment = commentStart < 0 ? '' : lines[lineIndex].slice(commentStart);
      if (!pattern.test(code)) continue;
      wasFound = true;
      const replaced = code.replace(pattern, function (match, before, label, closing) {
        return before + label + (isList ? value.map(formatNumber).join(', ') + closing : formatNumber(value));
      });
      if (replaced !== code) { lines[lineIndex] = replaced + comment; changedKeys.push(key); }
    }
    if (!wasFound) missingKeys.push(key);
  }
  return {
    source: source.slice(0, blockStart) + lines.join('\n') + source.slice(blockEnd),
    changedKeys: changedKeys, missingKeys: missingKeys
  };
}

// A room file is ordinary JSON, laid out with one door and one item per line so changes read well in a diff.
function formatRoomFile(room) {
  const oneLine = function (value) {
    return '{ ' + Object.keys(value).map((key) => JSON.stringify(key) + ': ' + JSON.stringify(value[key])).join(', ') + ' }';
  };
  const lines = [];
  for (const key of Object.keys(room)) {
    if (key === 'key') continue; // the file name is the key
    const value = room[key];
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      lines.push('  ' + JSON.stringify(key) + ': [\n' + value.map((entry) => '    ' + oneLine(entry)).join(',\n') + '\n  ]');
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      lines.push('  ' + JSON.stringify(key) + ': ' + oneLine(value));
    } else {
      lines.push('  ' + JSON.stringify(key) + ': ' + JSON.stringify(value));
    }
  }
  return '{\n' + lines.join(',\n') + '\n}\n';
}

function saveRoom(root, key, room) {
  if (!ROOM_KEY_PATTERN.test(key)) throw new Error('A room key starts with a small letter and has only letters and digits: "' + key + '" will not do.');
  if (!room || typeof room !== 'object' || Array.isArray(room)) throw new Error('That is not a room.');
  const roomDirectory = path.join(root, 'src', 'rooms');
  fs.mkdirSync(roomDirectory, { recursive: true });
  fs.writeFileSync(path.join(roomDirectory, key + '.json'), formatRoomFile(room));
  return 'src/rooms/' + key + '.json';
}

function deleteRoom(root, key) {
  if (!ROOM_KEY_PATTERN.test(key)) throw new Error('Not a room key: "' + key + '".');
  const filePath = path.join(root, 'src', 'rooms', key + '.json');
  if (!fs.existsSync(filePath)) throw new Error('There is no src/rooms/' + key + '.json.');
  fs.unlinkSync(filePath);
  return 'src/rooms/' + key + '.json';
}

function saveProportions(root, figureName, values) {
  if (!FIGURE_NAME_PATTERN.test(figureName)) throw new Error('Not a figure name: "' + figureName + '".');
  const filePath = path.join(root, 'src', 'js', '04-figures.js');
  const result = patchObjectNumbers(fs.readFileSync(filePath, 'utf8'), 'FIGURE_PROPORTIONS_' + figureName, values);
  if (result.changedKeys.length > 0) fs.writeFileSync(filePath, result.source);
  return { file: 'src/js/04-figures.js', changedKeys: result.changedKeys, missingKeys: result.missingKeys };
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

// Says where in src/ a line of the bundle came from, using the "// ===== name =====" lines build.js puts in.
function describeBundleLine(script, lineNumber) {
  const lines = script.split('\n');
  for (let index = Math.min(lineNumber, lines.length) - 1; index >= 0; index--) {
    const marker = /^\/\/ ===== (.+\.js) =====$/.exec(lines[index]);
    if (marker) return marker[1] + ' line ' + (lineNumber - index - 1);
  }
  return 'line ' + lineNumber + ' of the bundle';
}

// Looks for a mistake in the grammar of one source file. Each file is checked by itself first, because in the
// whole bundle a missing bracket is often only noticed many lines later, in a different file.
function findSyntaxProblem(root, folder) {
  const directory = path.join(root, 'src', folder);
  if (!fs.existsSync(directory)) return null;
  for (const fileName of fs.readdirSync(directory).filter((name) => name.endsWith('.js')).sort()) {
    try {
      new vm.Script(fs.readFileSync(path.join(directory, fileName), 'utf8'), { filename: fileName });
    } catch (error) {
      const where = new RegExp(fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+)').exec(String(error.stack));
      return 'src/' + folder + '/' + fileName + (where ? ' line ' + where[1] : '') + ': ' + error.message;
    }
  }
  return null;
}

// Builds everything. Returns null when all is well, or a text saying what is wrong.
function buildAndCheck(root) {
  const syntaxProblem = findSyntaxProblem(root, 'js') || findSyntaxProblem(root, 'dev');
  if (syntaxProblem) return syntaxProblem;
  let result;
  try {
    result = build({ root: root, dev: true });
  } catch (error) {
    return error.message;
  }
  try {
    new vm.Script(result.workshopScript, { filename: 'workshop-bundle.js' });
  } catch (error) {
    const where = /workshop-bundle\.js:(\d+)/.exec(String(error.stack));
    return (where ? describeBundleLine(result.workshopScript, Number(where[1])) + ': ' : '') + error.message;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------

function startDevServer(options) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const port = options.port === undefined ? DEFAULT_PORT : options.port; // 0: any free port (the tests)
  const log = options.quiet ? function () {} : function (text) { console.log(text); };
  const listeners = new Set(); // open pages waiting for news
  let buildNumber = 0;
  let buildProblem = null;

  const tellPages = function (eventName, data) {
    for (const response of listeners) response.write('event: ' + eventName + '\ndata: ' + JSON.stringify(data) + '\n\n');
  };

  const rebuild = function (reason) {
    buildProblem = buildAndCheck(root);
    buildNumber++;
    if (buildProblem) {
      log('Build failed (' + reason + '): ' + buildProblem);
      tellPages('problem', { text: buildProblem });
    } else {
      log('Built (' + reason + ').');
      tellPages('reload', { build: buildNumber });
    }
  };

  // Watch src/ and assets/. Many editors save in several steps, so wait for a short quiet spell before building.
  let rebuildTimer = null;
  const watchers = [];
  const onChange = function (eventType, fileName) {
    const name = String(fileName || '');
    if (/(^|[\\/])\.|~$|\.swp$|___jb_/.test(name)) return; // editor droppings
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(function () { rebuild(name || 'a change'); }, 120);
  };
  for (const folder of ['src', 'assets']) {
    const folderPath = path.join(root, folder);
    if (!fs.existsSync(folderPath)) continue;
    watchers.push(fs.watch(folderPath, { recursive: true }, onChange));
  }

  const sendJson = function (response, status, value) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(value));
  };
  const sendPage = function (response, filePath) {
    if (!fs.existsSync(filePath)) {
      response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Nothing has been built yet' + (buildProblem ? ': ' + buildProblem : '.'));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(fs.readFileSync(filePath));
  };

  const actions = {
    '/dev/save-room': function (body) { return { file: saveRoom(root, String(body.key), body.room) }; },
    '/dev/delete-room': function (body) { return { file: deleteRoom(root, String(body.key)) }; },
    '/dev/save-proportions': function (body) { return saveProportions(root, String(body.figure), body.values || {}); }
  };

  const server = http.createServer(function (request, response) {
    const address = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && (address.pathname === '/' || address.pathname === '/workshop')) {
      sendPage(response, path.join(root, 'build', 'workshop.html'));
    } else if (request.method === 'GET' && address.pathname === '/game') {
      sendPage(response, path.join(root, 'index.html'));
    } else if (request.method === 'GET' && address.pathname === '/dev/events') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive' });
      response.write('event: hello\ndata: ' + JSON.stringify({ build: buildNumber, problem: buildProblem }) + '\n\n');
      listeners.add(response);
      request.on('close', function () { listeners.delete(response); });
    } else if (request.method === 'POST' && actions[address.pathname]) {
      // Only the workshop page served from here may write. A page on another site cannot send this header
      // without asking first, and this server never says yes.
      const host = String(request.headers.host || '');
      const origin = request.headers.origin;
      const isFromHere = /^(localhost|127\.0\.0\.1):\d+$/.test(host) && (!origin || origin === 'http://' + host);
      if (request.headers['x-workshop'] !== '1' || !isFromHere) { sendJson(response, 403, { error: 'Only the workshop page may do that.' }); return; }
      const chunks = [];
      let size = 0;
      request.on('data', function (chunk) {
        size += chunk.length;
        if (size > 2e6) request.destroy(); else chunks.push(chunk);
      });
      request.on('end', function () {
        try {
          const result = actions[address.pathname](JSON.parse(Buffer.concat(chunks).toString('utf8')));
          log(address.pathname.replace('/dev/', '') + ': ' + result.file);
          sendJson(response, 200, result);
        } catch (error) {
          sendJson(response, 400, { error: error.message });
        }
      });
    } else {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });

  rebuild('start');
  return new Promise(function (resolve, reject) {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', function () {
      resolve({
        port: server.address().port,
        address: 'http://localhost:' + server.address().port + '/',
        close: function () {
          clearTimeout(rebuildTimer);
          for (const watcher of watchers) watcher.close();
          for (const response of listeners) response.end();
          return new Promise(function (done) { server.close(done); server.closeAllConnections(); });
        }
      });
    });
  });
}

if (require.main === module) {
  const argumentAfter = function (flag) {
    const position = process.argv.indexOf(flag);
    return position >= 0 ? process.argv[position + 1] : undefined;
  };
  const port = Number(argumentAfter('--port') || process.env.PORT || DEFAULT_PORT);
  startDevServer({ root: argumentAfter('--root'), port: port }).then(function (server) {
    console.log('');
    console.log('Workshop:   ' + server.address + '   (the game, with a "Workshop" button on the title screen)');
    console.log('Plain game: ' + server.address + 'game');
    console.log('Watching src/ and assets/. Ctrl+C stops.');
  }).catch(function (error) {
    console.error(error.code === 'EADDRINUSE' ? 'Port ' + port + ' is in use. Try: npm run dev -- --port ' + (port + 1) : error.message);
    process.exit(1);
  });
}

module.exports = { startDevServer, patchObjectNumbers, formatRoomFile };
