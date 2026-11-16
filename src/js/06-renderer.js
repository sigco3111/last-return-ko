// ---------------------------------------------------------------------------
// Renderer (WebGL 2). The world itself is drawn pure black and only exists to
// hide what is behind it. Everything you actually see is the point cloud.
// ---------------------------------------------------------------------------

const POINT_STRIDE_BYTES = 20; // x, y, z, birthTime as floats, then 4 data bytes
const POINT_STRIDE_FLOATS = 5;
const MAXIMUM_BEAM_LINES = 72;
// The scanner in the player's hand is drawn with its own, narrower field of view, so it looks the same
// whatever the field of view of the station behind it.
const VIEWMODEL_FIELD_OF_VIEW_DEGREES = 55;
const VIEWMODEL_MODEL_SCALE = 0.85;
// The glowing lens at the front of the scanner, in the model's own measurements (before VIEWMODEL_MODEL_SCALE).
const VIEWMODEL_LENS_CENTER_X = 0, VIEWMODEL_LENS_CENTER_Y = 0.005, VIEWMODEL_LENS_CENTER_Z = -0.187;
// How far in front of the eye the laser lines start. Only where on the screen they start is fixed (the lens);
// this distance decides how soon a wall right in front of the player hides their first stretch.
const BEAM_ORIGIN_DISTANCE = 0.55;
const DEAD_POINT_BIRTH_TIME = -1e9;

const renderer = {
  canvas: null,
  gl: null,
  isReady: false,
  pixelRatio: 1,
  width: 1, height: 1,
  pointProgram: null, solidProgram: null, beamProgram: null, postProgram: null, debugWorldProgram: null,
  pointUniforms: null, solidUniforms: null, beamUniforms: null, postUniforms: null, debugWorldUniforms: null,
  debugCylinderVertexArray: null, debugCylinderVertexCount: 0, debugSphereVertexArray: null, debugSphereVertexCount: 0,
  debugLineVertexArray: null, debugLineBuffer: null, identityMatrix: writeIdentityMatrix(new Float32Array(16)),
  pointVertexArray: null, pointBuffer: null,
  worldVertexArray: null, worldVertexBuffer: null, worldVertexCount: 0,
  unitCubeVertexArray: null,
  viewmodelVertexArray: null, viewmodelRanges: null,
  beamVertexArray: null, beamBuffer: null,
  postVertexArray: null,
  sceneFramebuffer: null, sceneTexture: null, sceneDepthBuffer: null,
  projectionMatrix: new Float32Array(16),
  viewMatrix: new Float32Array(16),
  viewProjectionMatrix: new Float32Array(16),
  modelMatrix: new Float32Array(16),
  scratchMatrix: new Float32Array(16),
  viewmodelProjectionMatrix: new Float32Array(16),
  viewmodelMatrix: new Float32Array(16)
};

const pointCloud = {
  capacity: 0,
  rawBuffer: null,
  floatView: null,
  byteView: null,
  writeIndex: 0,
  storedCount: 0,
  pendingUploadStart: 0,
  pendingUploadCount: 0,
  needsFullUpload: false,
  totalReturns: 0
};

const beamLines = {
  vertices: new Float32Array((MAXIMUM_BEAM_LINES + 1) * 2 * 4), // the last line is the beam that holds what you carry
  count: 0,
  originX: 0, originY: 0, originZ: 0
};

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const POINT_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in float aBirthTime;
layout(location = 2) in vec4 aData;
uniform mat4 uViewProjection;
uniform vec3 uCameraPosition;
uniform float uTime;
uniform float uPointScale;
uniform vec2 uPointSizeLimits;
uniform float uInterference;
uniform float uPowerOn;
uniform float uHasKeycard;
uniform int uPalette;
out vec3 vColor;
out float vFade;

float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }

void main() {
  float age = uTime - aBirthTime;
  float intensity = aData.x;
  int surfaceClass = int(aData.y * 255.0 + 0.5);
  float lifeSeconds = aData.z * 255.0 * 0.25;
  float fade = 1.0;
  if (lifeSeconds > 0.0) fade = 1.0 - smoothstep(lifeSeconds * 0.5, lifeSeconds, age);
  if (aBirthTime < -1.0e8 || fade <= 0.002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 1.0;
    vColor = vec3(0.0);
    vFade = 0.0;
    return;
  }
  vec3 position = aPosition;
  if (uInterference > 0.01) {
    float wobbleTime = floor(uTime * 30.0);
    vec3 noise = vec3(hash(position + wobbleTime), hash(position.yzx + wobbleTime), hash(position.zxy + wobbleTime)) - 0.5;
    position += noise * uInterference * 0.09;
  }
  if (surfaceClass == 9) position.y += sin(uTime * 1.7 + position.x * 3.1 + position.z * 2.3) * 0.014;
  vec3 toCamera = uCameraPosition - position;
  float distanceToCamera = length(toCamera);
  position += toCamera / max(distanceToCamera, 0.001) * (0.012 + distanceToCamera * 0.004);
  gl_Position = uViewProjection * vec4(position, 1.0);
  gl_PointSize = clamp(uPointScale / max(distanceToCamera, 0.05), uPointSizeLimits.x, uPointSizeLimits.y);

  float range = clamp(distanceToCamera / 26.0, 0.0, 1.0);
  vec3 rangeColor;
  if (uPalette == 1) {
    rangeColor = mix(vec3(1.0, 0.8, 0.45), vec3(0.75, 0.3, 0.05), range);
  } else if (uPalette == 2) {
    // Scanner Sombre style, a full saturated spectrum: pure red out to about 1.5 m, then orange (5 m),
    // yellow (9 m), green (14 m), cyan (19 m), and blue at 26 m and beyond.
    rangeColor = mix(vec3(1.0, 0.02, 0.05), vec3(1.0, 0.42, 0.0), smoothstep(0.06, 0.2, range));
    rangeColor = mix(rangeColor, vec3(1.0, 0.92, 0.0), smoothstep(0.2, 0.36, range));
    rangeColor = mix(rangeColor, vec3(0.05, 1.0, 0.2), smoothstep(0.36, 0.54, range));
    rangeColor = mix(rangeColor, vec3(0.0, 0.85, 1.0), smoothstep(0.54, 0.74, range));
    rangeColor = mix(rangeColor, vec3(0.16, 0.22, 1.0), smoothstep(0.74, 1.0, range));
    // TWEAK: how much brighter than the other palettes. Red is a dark colour to the eye and sits where points are
    // dimmed most, so it gets the first number; from yellow outward it is the second.
    rangeColor *= mix(1.7, 1.25, smoothstep(0.0, 0.36, range));
  } else if (uPalette == 3) {
    float heightBand = clamp(position.y / 4.0, 0.0, 1.0);
    rangeColor = mix(vec3(0.2, 0.35, 1.0), vec3(0.2, 1.0, 0.55), smoothstep(0.0, 0.45, heightBand));
    rangeColor = mix(rangeColor, vec3(1.0, 0.9, 0.3), smoothstep(0.45, 1.0, heightBand));
  } else {
    // TWEAK: the default "ice" colours as red, green, blue from 0 to 1.
    // First colour: points right next to you. Second: about 10 m away. Third (next line): 26 m and beyond.
    rangeColor = mix(vec3(0.78, 0.9, 1.0), vec3(0.14, 0.58, 0.9), smoothstep(0.0, 0.4, range));
    rangeColor = mix(rangeColor, vec3(0.24, 0.17, 0.66), smoothstep(0.4, 1.0, range));
  }
  vec3 color = rangeColor;
  vec3 lockedColor = vec3(1.0, 0.22, 0.1);
  vec3 openColor = vec3(0.25, 1.0, 0.55);
  // The vivid palette keeps its hues: there, surfaces are told apart by brightness more than by a tint.
  float tint = uPalette == 2 ? 0.45 : 1.0;
  if (surfaceClass == 0) color *= 0.72;
  else if (surfaceClass == 2) color *= mix(vec3(0.62), vec3(0.55, 0.5, 0.78), tint);
  else if (surfaceClass == 3 || surfaceClass == 11) color = mix(color, vec3(0.96, 0.88, 0.72), 0.5 * tint);
  else if (surfaceClass == 13) color = mix(color, vec3(0.55, 0.9, 0.82), 0.45 * tint);
  else if (surfaceClass == 4) color = openColor;
  else if (surfaceClass == 5) color = mix(lockedColor, openColor, uPowerOn);
  // uHasKeycard carries the number of the best keycard held (0 for none): a door shows green once it would open.
  else if (surfaceClass == 6) color = mix(lockedColor, openColor, uPowerOn * step(1.0, uHasKeycard));
  else if (surfaceClass == 14) color = mix(lockedColor, openColor, uPowerOn * step(2.0, uHasKeycard));
  else if (surfaceClass == 15) color = mix(lockedColor, openColor, uPowerOn * step(3.0, uHasKeycard));
  else if (surfaceClass == 7) color = vec3(1.0, 0.68, 0.12) * (0.8 + 0.35 * sin(uTime * 5.0 + position.y * 9.0));
  else if (surfaceClass == 8) color = vec3(1.15, 1.1, 0.9);
  else if (surfaceClass == 9) color = vec3(0.08, 0.3, 0.95);
  else if (surfaceClass == 10) color = vec3(1.0, 0.03, 0.02);
  else if (surfaceClass == 12) color = vec3(0.85, 0.66, 0.1);
  // TWEAK: 0.03 is how quickly points dim with distance. 0 = no dimming, 0.1 = far rooms nearly black.
  float brightness = (0.22 + 0.78 * intensity) / (1.0 + distanceToCamera * 0.03) * (0.72 + 0.28 * smoothstep(0.4, 4.0, distanceToCamera));
  // TWEAK: fresh points flash white. 2.6 is how fast the flash dies (higher = shorter flash).
  float flash = exp(-age * 2.6);
  vec3 flashColor = surfaceClass == 10 ? vec3(0.9, 0.05, 0.03) : vec3(0.85, 1.0, 1.0);
  if (surfaceClass == 10) brightness = max(brightness, 0.55);
  vColor = color * brightness + flashColor * flash * 0.45;
  vFade = fade;
}`;

const POINT_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec3 vColor;
in float vFade;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  vec2 fromCenter = gl_PointCoord * 2.0 - 1.0;
  float radiusSquared = dot(fromCenter, fromCenter);
  if (radiusSquared > 1.0) discard;
  if (vFade < 0.999 && hash(gl_FragCoord.xy) > vFade) discard;
  outColor = vec4(vColor * (0.62 + 0.38 * (1.0 - radiusSquared)), 1.0);
}`;

const SOLID_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColor;
uniform mat4 uMatrix;
out vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = uMatrix * vec4(aPosition, 1.0);
}`;

const SOLID_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec3 vColor;
uniform vec3 uTint;
out vec4 outColor;
void main() { outColor = vec4(vColor * uTint, 1.0); }`;

const BEAM_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aPositionAndAlpha;
uniform mat4 uViewProjection;
out float vAlpha;
void main() {
  vAlpha = aPositionAndAlpha.w;
  gl_Position = uViewProjection * vec4(aPositionAndAlpha.xyz, 1.0);
}`;

const BEAM_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in float vAlpha;
uniform vec3 uColor;
out vec4 outColor;
void main() { outColor = vec4(uColor * vAlpha, 1.0); }`;

const POST_VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 vTextureCoordinate;
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vTextureCoordinate = corner;
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const POST_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vTextureCoordinate;
uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uTime;
uniform float uInterference;
uniform float uDanger;
uniform float uFade;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 coordinate = vTextureCoordinate;
  float tick = floor(uTime * 24.0);
  float row = floor(coordinate.y * 110.0);
  float rowNoise = hash(vec2(row, tick));
  float tear = step(1.0 - uInterference * 0.45, hash(vec2(row * 0.37, tick * 1.7)));
  coordinate.x += (rowNoise - 0.5) * 0.08 * uInterference * tear;
  // TWEAK: colour fringing. First number: always on. Second: extra when a creature is near.
  float split = 0.0012 + uInterference * 0.0045;
  vec3 color;
  color.r = texture(uScene, coordinate + vec2(split, 0.0)).r;
  color.g = texture(uScene, coordinate).g;
  color.b = texture(uScene, coordinate - vec2(split, 0.0)).b;
  vec3 glow = textureLod(uScene, coordinate, 2.5).rgb * 0.45 + textureLod(uScene, coordinate, 4.5).rgb * 0.55;
  color += glow * 0.42; // TWEAK: strength of the soft glow around bright points (0 = none)
  float grain = hash(coordinate * uResolution + vec2(tick * 3.1, tick * 7.7)) - 0.5;
  color += grain * (0.035 + uInterference * 0.12); // TWEAK: film grain, at rest and extra under interference
  color *= 0.95 + 0.05 * sin(gl_FragCoord.y * 1.9);
  vec2 fromCenter = coordinate - 0.5;
  // TWEAK: darkening toward the screen corners. Raise 0.92 to push the dark edge further out.
  float vignette = smoothstep(0.92, 0.25, length(fromCenter * vec2(1.0, 1.15)));
  color *= mix(0.5, 1.0, vignette);
  color.r += uDanger * (1.0 - vignette) * 0.55;
  color.gb *= 1.0 - uDanger * 0.35;
  color = max(color, vec3(0.0)) * uFade;
  outColor = vec4(color, 1.0);
}`;

// Debug mode only: draws the station itself, shaded by which way each surface faces,
// with a line every metre so sizes and distances can be read off.
const DEBUG_WORLD_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
uniform mat4 uViewProjection;
uniform mat4 uModel;
out vec3 vWorldPosition;
void main() {
  vec4 worldPosition = uModel * vec4(aPosition, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = uViewProjection * worldPosition;
}`;

const DEBUG_WORLD_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vWorldPosition;
uniform vec3 uCameraPosition;
uniform vec3 uColor;
out vec4 outColor;
void main() {
  vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
  // Seen from above (flying), ceilings are left out so you can look down into the rooms.
  if (abs(normal.y) > 0.9 && vWorldPosition.y > 2.2 && uCameraPosition.y > vWorldPosition.y) discard;
  float light = 0.4 + 0.6 * abs(dot(normal, normalize(vec3(0.35, 0.8, 0.45))));
  // Distance to the nearest whole metre along each axis; skip the axis the surface faces.
  vec3 toGridLine = abs(fract(vWorldPosition + 0.5) - 0.5);
  vec3 onLine = (1.0 - step(0.014, toGridLine)) * (1.0 - step(0.9, abs(normal)));
  float gridLine = max(onLine.x, max(onLine.y, onLine.z));
  float distanceToCamera = length(vWorldPosition - uCameraPosition);
  // TWEAK: the last number is how quickly the lit station fades with distance (0 = no fade).
  vec3 color = uColor * light * (1.0 + gridLine * 1.3) / (1.0 + distanceToCamera * 0.035);
  outColor = vec4(color, 1.0);
}`;

function compileShaderProgram(gl, vertexSource, fragmentSource, label) {
  const compile = function (type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(label + ' shader failed to compile: ' + gl.getShaderInfoLog(shader));
    }
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(label + ' program failed to link: ' + gl.getProgramInfoLog(program));
  }
  return program;
}

function collectUniformLocations(gl, program, names) {
  const locations = {};
  for (const name of names) locations[name] = gl.getUniformLocation(program, name);
  return locations;
}

function createPositionOnlyVertexArray(gl, vertices) {
  const vertexArray = gl.createVertexArray();
  gl.bindVertexArray(vertexArray);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.disableVertexAttribArray(1);
  gl.bindVertexArray(null);
  return vertexArray;
}

function buildUnitCubeVertices() {
  const vertices = [];
  pushBoxTriangles(vertices, { centerX: 0, centerY: 0, centerZ: 0, halfX: 1, halfY: 1, halfZ: 1, cosineYaw: 1, sineYaw: 0 });
  return new Float32Array(vertices);
}

// Unit shapes with a baked light-to-dark shade, for drawing creature bodies in debug mode.
// Each vertex is x, y, z followed by a grey level repeated three times.
function buildShadedUnitCylinderVertices() {
  const vertices = [];
  const segmentCount = 10;
  for (let segment = 0; segment < segmentCount; segment++) {
    const angleA = segment / segmentCount * TWO_PI, angleB = (segment + 1) / segmentCount * TWO_PI;
    const shade = 0.62 + 0.38 * Math.cos((angleA + angleB) / 2 - 0.8);
    const corners = [
      [Math.cos(angleA), 0, Math.sin(angleA)], [Math.cos(angleB), 0, Math.sin(angleB)],
      [Math.cos(angleB), 1, Math.sin(angleB)], [Math.cos(angleA), 1, Math.sin(angleA)]];
    for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
      vertices.push(corners[cornerIndex][0], corners[cornerIndex][1], corners[cornerIndex][2], shade, shade, shade);
    }
  }
  return new Float32Array(vertices);
}

function buildShadedUnitSphereVertices() {
  const positions = [];
  pushSphereTriangles(positions, { centerX: 0, centerY: 0, centerZ: 0, radius: 1 / 0.97 });
  const vertices = [];
  for (let offset = 0; offset < positions.length; offset += 3) {
    const shade = 0.62 + 0.38 * (positions[offset] * 0.35 + positions[offset + 1] * 0.8 + positions[offset + 2] * 0.45);
    vertices.push(positions[offset], positions[offset + 1], positions[offset + 2], shade, shade, shade);
  }
  return new Float32Array(vertices);
}

function createPositionAndColorVertexArray(gl, vertices, usage) {
  const vertexArray = gl.createVertexArray();
  gl.bindVertexArray(vertexArray);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, usage);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  gl.bindVertexArray(null);
  return { vertexArray: vertexArray, buffer: buffer };
}

// The handheld scanner in the corner of the view. Unlit, so it reads as a dark shape
// with a glowing screen and emitter.
function buildViewmodelGeometry() {
  const vertices = [];
  const ranges = {};
  const faceShades = [0.5, 0.85, 0.35, 1.0, 0.7, 0.7]; // -Z, +Z, -Y, +Y, -X, +X
  const pushColoredBox = function (centerX, centerY, centerZ, halfX, halfY, halfZ, red, green, blue) {
    const corners = [];
    for (let cornerIndex = 0; cornerIndex < 8; cornerIndex++) {
      corners.push([
        centerX + (cornerIndex & 1 ? halfX : -halfX),
        centerY + (cornerIndex & 2 ? halfY : -halfY),
        centerZ + (cornerIndex & 4 ? halfZ : -halfZ)]);
    }
    const faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      const face = faces[faceIndex], shade = faceShades[faceIndex];
      const order = [face[0], face[1], face[2], face[0], face[2], face[3]];
      for (const cornerIndex of order) {
        const corner = corners[cornerIndex];
        vertices.push(corner[0] * VIEWMODEL_MODEL_SCALE, corner[1] * VIEWMODEL_MODEL_SCALE, corner[2] * VIEWMODEL_MODEL_SCALE, red * shade, green * shade, blue * shade);
      }
    }
  };
  const beginRange = function () { return vertices.length / 6; };
  let start = beginRange();
  pushColoredBox(0, 0, 0, 0.05, 0.042, 0.13, 0.085, 0.09, 0.11);
  pushColoredBox(0, 0.05, -0.02, 0.018, 0.008, 0.1, 0.05, 0.05, 0.065);
  pushColoredBox(0, 0.0, -0.155, 0.058, 0.05, 0.03, 0.06, 0.06, 0.075);
  pushColoredBox(0, -0.1, 0.06, 0.026, 0.065, 0.032, 0.065, 0.065, 0.075);
  pushColoredBox(0, -0.055, -0.01, 0.012, 0.012, 0.04, 0.045, 0.045, 0.055);
  pushColoredBox(0, 0.048, 0.085, 0.042, 0.006, 0.04, 0.04, 0.04, 0.05);
  pushColoredBox(-0.062, -0.005, 0.03, 0.012, 0.03, 0.07, 0.07, 0.075, 0.09);
  for (let finIndex = 0; finIndex < 4; finIndex++) {
    pushColoredBox(0.055, 0.0, -0.08 + finIndex * 0.035, 0.008, 0.03, 0.008, 0.075, 0.075, 0.09);
  }
  ranges.body = [start, beginRange() - start];
  start = beginRange();
  pushColoredBox(VIEWMODEL_LENS_CENTER_X, VIEWMODEL_LENS_CENTER_Y, VIEWMODEL_LENS_CENTER_Z, 0.03, 0.026, 0.003, 1, 1, 1);
  ranges.lens = [start, beginRange() - start];
  start = beginRange();
  pushColoredBox(0, 0.056, 0.085, 0.036, 0.001, 0.034, 1, 1, 1);
  ranges.screen = [start, beginRange() - start];
  return { vertices: new Float32Array(vertices), ranges: ranges };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function initializeRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) return false;
  renderer.canvas = canvas;
  renderer.gl = gl;

  renderer.pointProgram = compileShaderProgram(gl, POINT_VERTEX_SHADER, POINT_FRAGMENT_SHADER, 'point');
  renderer.pointUniforms = collectUniformLocations(gl, renderer.pointProgram,
    ['uViewProjection', 'uCameraPosition', 'uTime', 'uPointScale', 'uPointSizeLimits', 'uInterference', 'uPowerOn', 'uHasKeycard', 'uPalette']);
  renderer.solidProgram = compileShaderProgram(gl, SOLID_VERTEX_SHADER, SOLID_FRAGMENT_SHADER, 'solid');
  renderer.solidUniforms = collectUniformLocations(gl, renderer.solidProgram, ['uMatrix', 'uTint']);
  renderer.beamProgram = compileShaderProgram(gl, BEAM_VERTEX_SHADER, BEAM_FRAGMENT_SHADER, 'beam');
  renderer.beamUniforms = collectUniformLocations(gl, renderer.beamProgram, ['uViewProjection', 'uColor']);
  renderer.postProgram = compileShaderProgram(gl, POST_VERTEX_SHADER, POST_FRAGMENT_SHADER, 'post');
  renderer.postUniforms = collectUniformLocations(gl, renderer.postProgram,
    ['uScene', 'uResolution', 'uTime', 'uInterference', 'uDanger', 'uFade']);

  // debug mode
  renderer.debugWorldProgram = compileShaderProgram(gl, DEBUG_WORLD_VERTEX_SHADER, DEBUG_WORLD_FRAGMENT_SHADER, 'debug world');
  renderer.debugWorldUniforms = collectUniformLocations(gl, renderer.debugWorldProgram, ['uViewProjection', 'uModel', 'uCameraPosition', 'uColor']);
  const shadedCylinder = buildShadedUnitCylinderVertices();
  renderer.debugCylinderVertexArray = createPositionAndColorVertexArray(gl, shadedCylinder, gl.STATIC_DRAW).vertexArray;
  renderer.debugCylinderVertexCount = shadedCylinder.length / 6;
  const shadedSphere = buildShadedUnitSphereVertices();
  renderer.debugSphereVertexArray = createPositionAndColorVertexArray(gl, shadedSphere, gl.STATIC_DRAW).vertexArray;
  renderer.debugSphereVertexCount = shadedSphere.length / 6;
  const debugLines = createPositionAndColorVertexArray(gl, new Float32Array(DEBUG_MAXIMUM_LINE_VERTICES * 6), gl.DYNAMIC_DRAW);
  renderer.debugLineVertexArray = debugLines.vertexArray;
  renderer.debugLineBuffer = debugLines.buffer;

  // point cloud
  renderer.pointVertexArray = gl.createVertexArray();
  renderer.pointBuffer = gl.createBuffer();

  // unit cube for moving occluders (doors and things that can be picked up)
  renderer.unitCubeVertexArray = createPositionOnlyVertexArray(gl, buildUnitCubeVertices());
  // viewmodel
  const viewmodel = buildViewmodelGeometry();
  renderer.viewmodelRanges = viewmodel.ranges;
  renderer.viewmodelVertexArray = gl.createVertexArray();
  gl.bindVertexArray(renderer.viewmodelVertexArray);
  const viewmodelBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, viewmodelBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, viewmodel.vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

  // beams
  renderer.beamVertexArray = gl.createVertexArray();
  gl.bindVertexArray(renderer.beamVertexArray);
  renderer.beamBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.beamBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, beamLines.vertices.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);

  renderer.postVertexArray = gl.createVertexArray();
  gl.bindVertexArray(null);

  renderer.isReady = true;
  return true;
}

function allocatePointCloud(capacity) {
  const gl = renderer.gl;
  pointCloud.capacity = capacity;
  pointCloud.rawBuffer = new ArrayBuffer(capacity * POINT_STRIDE_BYTES);
  pointCloud.floatView = new Float32Array(pointCloud.rawBuffer);
  pointCloud.byteView = new Uint8Array(pointCloud.rawBuffer);
  pointCloud.writeIndex = 0;
  pointCloud.storedCount = 0;
  pointCloud.pendingUploadStart = 0;
  pointCloud.pendingUploadCount = 0;
  pointCloud.needsFullUpload = false;
  gl.bindVertexArray(renderer.pointVertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.pointBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, pointCloud.rawBuffer.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, POINT_STRIDE_BYTES, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, POINT_STRIDE_BYTES, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, POINT_STRIDE_BYTES, 16);
  gl.bindVertexArray(null);
}

function clearAllPoints() {
  pointCloud.writeIndex = 0;
  pointCloud.storedCount = 0;
  pointCloud.pendingUploadStart = 0;
  pointCloud.pendingUploadCount = 0;
  pointCloud.needsFullUpload = false;
  pointCloud.totalReturns = 0;
}

function uploadWorldOccluderMesh(vertices) {
  // Called again whenever a different station is loaded, so the old mesh is replaced, not added to.
  const gl = renderer.gl;
  if (renderer.worldVertexArray) gl.deleteVertexArray(renderer.worldVertexArray);
  if (renderer.worldVertexBuffer) gl.deleteBuffer(renderer.worldVertexBuffer);
  renderer.worldVertexArray = gl.createVertexArray();
  renderer.worldVertexBuffer = gl.createBuffer();
  gl.bindVertexArray(renderer.worldVertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.worldVertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.disableVertexAttribArray(1);
  gl.bindVertexArray(null);
  renderer.worldVertexCount = vertices.length / 3;
}

// Stores one scanner return. `lifeCode` 0 keeps the point forever; otherwise it fades
// after lifeCode * 0.25 seconds.
// `isOffTheMap`: the point is on something that moves about, and is left off the map.
function addScanPoint(x, y, z, intensity, surfaceClass, lifeCode, isOffTheMap) {
  const index = pointCloud.writeIndex;
  const floatOffset = index * POINT_STRIDE_FLOATS;
  pointCloud.floatView[floatOffset] = x;
  pointCloud.floatView[floatOffset + 1] = y;
  pointCloud.floatView[floatOffset + 2] = z;
  pointCloud.floatView[floatOffset + 3] = currentPointTime;
  const byteOffset = index * POINT_STRIDE_BYTES + 16;
  pointCloud.byteView[byteOffset] = intensity * 255;
  pointCloud.byteView[byteOffset + 1] = surfaceClass;
  pointCloud.byteView[byteOffset + 2] = lifeCode;
  pointCloud.byteView[byteOffset + 3] = 0;
  pointCloud.writeIndex = index + 1 === pointCloud.capacity ? 0 : index + 1;
  if (pointCloud.storedCount < pointCloud.capacity) pointCloud.storedCount++;
  pointCloud.pendingUploadCount++;
  pointCloud.totalReturns++;
  if (!isOffTheMap) plotPointOnMap(x, z, surfaceClass);
}

let currentPointTime = 0;

// Removes stored points inside a box (used when an item is taken or a door is broken down).
function removePointsInsideBox(minimumX, minimumY, minimumZ, maximumX, maximumY, maximumZ) {
  const floats = pointCloud.floatView;
  let removedAny = false;
  for (let index = 0; index < pointCloud.storedCount; index++) {
    const offset = index * POINT_STRIDE_FLOATS;
    const x = floats[offset];
    if (x < minimumX || x > maximumX) continue;
    const z = floats[offset + 2];
    if (z < minimumZ || z > maximumZ) continue;
    const y = floats[offset + 1];
    if (y < minimumY || y > maximumY) continue;
    floats[offset + 3] = DEAD_POINT_BIRTH_TIME;
    removedAny = true;
  }
  if (removedAny) pointCloud.needsFullUpload = true;
}

// Lets stored points inside a box fade out from now on, over `lifeCode` * 0.25 seconds (used when a door slides
// away: its old points stay where they were measured for a moment). Points that are already fading keep their own time.
function fadePointsInsideBox(minimumX, minimumY, minimumZ, maximumX, maximumY, maximumZ, lifeCode) {
  const floats = pointCloud.floatView;
  let fadedAny = false;
  for (let index = 0; index < pointCloud.storedCount; index++) {
    const offset = index * POINT_STRIDE_FLOATS;
    const x = floats[offset];
    if (x < minimumX || x > maximumX) continue;
    const z = floats[offset + 2];
    if (z < minimumZ || z > maximumZ) continue;
    const y = floats[offset + 1];
    if (y < minimumY || y > maximumY) continue;
    if (floats[offset + 3] === DEAD_POINT_BIRTH_TIME) continue;
    const lifeCodeByteOffset = index * POINT_STRIDE_BYTES + 18;
    if (pointCloud.byteView[lifeCodeByteOffset] !== 0) continue;
    floats[offset + 3] = currentPointTime;
    pointCloud.byteView[lifeCodeByteOffset] = lifeCode;
    fadedAny = true;
  }
  if (fadedAny) pointCloud.needsFullUpload = true;
}

// Like the two above, for points that lie on one particular thing: only points of `surfaceClass` inside the box
// for which `isOnIt(x, y, z)` says yes are touched, so that the floor under a crate keeps its points when the
// crate is taken away. `lifeCode` 0 removes them at once; anything else lets them fade over that time.
function changePointsOnShape(minimumX, minimumY, minimumZ, maximumX, maximumY, maximumZ, surfaceClass, lifeCode, isOnIt) {
  const floats = pointCloud.floatView, bytes = pointCloud.byteView;
  let changedAny = false;
  for (let index = 0; index < pointCloud.storedCount; index++) {
    const offset = index * POINT_STRIDE_FLOATS;
    const x = floats[offset];
    if (x < minimumX || x > maximumX) continue;
    const z = floats[offset + 2];
    if (z < minimumZ || z > maximumZ) continue;
    const y = floats[offset + 1];
    if (y < minimumY || y > maximumY) continue;
    if (floats[offset + 3] === DEAD_POINT_BIRTH_TIME) continue;
    const byteOffset = index * POINT_STRIDE_BYTES + 16;
    if (bytes[byteOffset + 1] !== surfaceClass || !isOnIt(x, y, z)) continue;
    if (lifeCode === 0) {
      floats[offset + 3] = DEAD_POINT_BIRTH_TIME;
    } else {
      if (bytes[byteOffset + 2] !== 0) continue; // already fading: it keeps its own time
      floats[offset + 3] = currentPointTime;
      bytes[byteOffset + 2] = lifeCode;
    }
    changedAny = true;
  }
  if (changedAny) pointCloud.needsFullUpload = true;
}

function flushPointUploads() {
  const gl = renderer.gl;
  if (pointCloud.pendingUploadCount === 0 && !pointCloud.needsFullUpload) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.pointBuffer);
  if (pointCloud.needsFullUpload || pointCloud.pendingUploadCount >= pointCloud.capacity) {
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pointCloud.byteView, 0, pointCloud.storedCount * POINT_STRIDE_BYTES);
  } else {
    const start = pointCloud.pendingUploadStart;
    const firstRunCount = Math.min(pointCloud.pendingUploadCount, pointCloud.capacity - start);
    gl.bufferSubData(gl.ARRAY_BUFFER, start * POINT_STRIDE_BYTES, pointCloud.byteView,
      start * POINT_STRIDE_BYTES, firstRunCount * POINT_STRIDE_BYTES);
    const wrappedCount = pointCloud.pendingUploadCount - firstRunCount;
    if (wrappedCount > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, pointCloud.byteView, 0, wrappedCount * POINT_STRIDE_BYTES);
  }
  pointCloud.pendingUploadStart = pointCloud.writeIndex;
  pointCloud.pendingUploadCount = 0;
  pointCloud.needsFullUpload = false;
}

function resetBeamLines(originX, originY, originZ) {
  beamLines.count = 0;
  beamLines.originX = originX; beamLines.originY = originY; beamLines.originZ = originZ;
}

function addBeamLine(targetX, targetY, targetZ, alpha) {
  if (beamLines.count >= MAXIMUM_BEAM_LINES) return;
  const offset = beamLines.count * 8;
  const vertices = beamLines.vertices;
  vertices[offset] = beamLines.originX; vertices[offset + 1] = beamLines.originY; vertices[offset + 2] = beamLines.originZ; vertices[offset + 3] = alpha;
  vertices[offset + 4] = targetX; vertices[offset + 5] = targetY; vertices[offset + 6] = targetZ; vertices[offset + 7] = alpha * 0.25;
  beamLines.count++;
}

function resizeRenderer(renderScale) {
  const gl = renderer.gl;
  const canvas = renderer.canvas;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * renderScale;
  const width = Math.max(2, Math.round(canvas.clientWidth * pixelRatio));
  const height = Math.max(2, Math.round(canvas.clientHeight * pixelRatio));
  if (width === renderer.width && height === renderer.height && renderer.sceneFramebuffer) return;
  renderer.width = width; renderer.height = height; renderer.pixelRatio = pixelRatio;
  canvas.width = width; canvas.height = height;

  if (renderer.sceneTexture) gl.deleteTexture(renderer.sceneTexture);
  if (renderer.sceneDepthBuffer) gl.deleteRenderbuffer(renderer.sceneDepthBuffer);
  if (renderer.sceneFramebuffer) gl.deleteFramebuffer(renderer.sceneFramebuffer);
  renderer.sceneTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, renderer.sceneTexture);
  const mipLevels = Math.floor(Math.log2(Math.max(width, height))) + 1;
  gl.texStorage2D(gl.TEXTURE_2D, mipLevels, gl.RGBA8, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  renderer.sceneDepthBuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, renderer.sceneDepthBuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
  renderer.sceneFramebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.sceneFramebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderer.sceneTexture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderer.sceneDepthBuffer);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function writeBoxPropMatrix(out, prop) {
  out[0] = prop.cosineYaw * prop.halfX; out[1] = 0; out[2] = prop.sineYaw * prop.halfX; out[3] = 0;
  out[4] = 0; out[5] = prop.halfY; out[6] = 0; out[7] = 0;
  out[8] = -prop.sineYaw * prop.halfZ; out[9] = 0; out[10] = prop.cosineYaw * prop.halfZ; out[11] = 0;
  out[12] = prop.centerX; out[13] = prop.centerY; out[14] = prop.centerZ; out[15] = 1;
  return out;
}

// A box that is part of a loose object: the object's rotation and position, then the part's own place and size.
function writeLooseBoxMatrix(out, object, part) {
  const matrix = object.matrix;
  out[0] = matrix[0] * part.halfX; out[1] = matrix[3] * part.halfX; out[2] = matrix[6] * part.halfX; out[3] = 0;
  out[4] = matrix[1] * part.halfY; out[5] = matrix[4] * part.halfY; out[6] = matrix[7] * part.halfY; out[7] = 0;
  out[8] = matrix[2] * part.halfZ; out[9] = matrix[5] * part.halfZ; out[10] = matrix[8] * part.halfZ; out[11] = 0;
  out[12] = object.x + matrix[0] * part.centerX + matrix[1] * part.centerY + matrix[2] * part.centerZ;
  out[13] = object.y + matrix[3] * part.centerX + matrix[4] * part.centerY + matrix[5] * part.centerZ;
  out[14] = object.z + matrix[6] * part.centerX + matrix[7] * part.centerY + matrix[8] * part.centerZ;
  out[15] = 1;
  return out;
}

// Sends the matrix in `renderer.modelMatrix` to whichever of the two occluder programs is in use, and draws.
function drawLooseObjectShape(isStationLit, vertexArray, vertexCount) {
  const gl = renderer.gl;
  if (isStationLit) {
    gl.uniformMatrix4fv(renderer.debugWorldUniforms.uModel, false, renderer.modelMatrix);
  } else {
    multiplyMatrices(renderer.scratchMatrix, renderer.viewProjectionMatrix, renderer.modelMatrix);
    gl.uniformMatrix4fv(renderer.solidUniforms.uMatrix, false, renderer.scratchMatrix);
  }
  gl.bindVertexArray(vertexArray);
  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
}

// Loose objects are not drawn, any more than the creatures are: what you see of one is the points your scanner
// has left on it. Those points are solid dots, so an object that has been scanned all over hides what is behind
// it by itself, and one with three points on it is three points. (A black shape for the whole object, the moment
// one pulse had landed on it, gave away its outline.)
// Only with "Light the station" on in debug mode are they drawn, in the colour of things you can pick up.
function drawLooseObjectOccluders(camera, isStationLit) {
  if (!isStationLit || looseObjects.length === 0) return;
  const gl = renderer.gl;
  if (isStationLit) gl.uniform3f(renderer.debugWorldUniforms.uColor, 0.9, 0.6, 0.12);
  for (let objectIndex = 0; objectIndex < looseObjects.length; objectIndex++) {
    const object = looseObjects[objectIndex];
    const deltaX = object.x - camera.x, deltaZ = object.z - camera.z;
    if (deltaX * deltaX + deltaZ * deltaZ > 60 * 60) continue; // TWEAK: further than 60 m away they are not worth drawing
    const matrix = object.matrix, parts = object.prepared.parts;
    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
      const part = parts[partIndex];
      if (part.shape === 'box') {
        writeLooseBoxMatrix(renderer.modelMatrix, object, part);
        drawLooseObjectShape(isStationLit, renderer.unitCubeVertexArray, 36);
      } else if (part.shape === 'ball') {
        writeTranslationScaleMatrix(renderer.modelMatrix,
          object.x + matrix[0] * part.centerX + matrix[1] * part.centerY + matrix[2] * part.centerZ,
          object.y + matrix[3] * part.centerX + matrix[4] * part.centerY + matrix[5] * part.centerZ,
          object.z + matrix[6] * part.centerX + matrix[7] * part.centerY + matrix[8] * part.centerZ,
          part.radius, part.radius, part.radius);
        drawLooseObjectShape(isStationLit, renderer.debugSphereVertexArray, renderer.debugSphereVertexCount);
      } else {
        const fromX = object.x + matrix[0] * part.fromX + matrix[1] * part.fromY + matrix[2] * part.fromZ;
        const fromY = object.y + matrix[3] * part.fromX + matrix[4] * part.fromY + matrix[5] * part.fromZ;
        const fromZ = object.z + matrix[6] * part.fromX + matrix[7] * part.fromY + matrix[8] * part.fromZ;
        const toX = object.x + matrix[0] * part.toX + matrix[1] * part.toY + matrix[2] * part.toZ;
        const toY = object.y + matrix[3] * part.toX + matrix[4] * part.toY + matrix[5] * part.toZ;
        const toZ = object.z + matrix[6] * part.toX + matrix[7] * part.toY + matrix[8] * part.toZ;
        writeSegmentMatrix(renderer.modelMatrix, fromX, fromY, fromZ, toX, toY, toZ, part.radius);
        drawLooseObjectShape(isStationLit, renderer.debugCylinderVertexArray, renderer.debugCylinderVertexCount);
        writeTranslationScaleMatrix(renderer.modelMatrix, fromX, fromY, fromZ, part.radius, part.radius, part.radius);
        drawLooseObjectShape(isStationLit, renderer.debugSphereVertexArray, renderer.debugSphereVertexCount);
        writeTranslationScaleMatrix(renderer.modelMatrix, toX, toY, toZ, part.radius, part.radius, part.radius);
        drawLooseObjectShape(isStationLit, renderer.debugSphereVertexArray, renderer.debugSphereVertexCount);
      }
    }
  }
}

function writeViewmodelMatrix(out, x, y, z, yaw, pitch) {
  const cosineYaw = Math.cos(yaw), sineYaw = Math.sin(yaw), cosinePitch = Math.cos(pitch), sinePitch = Math.sin(pitch);
  out[0] = cosineYaw; out[1] = 0; out[2] = -sineYaw; out[3] = 0;
  out[4] = sineYaw * sinePitch; out[5] = cosinePitch; out[6] = cosineYaw * sinePitch; out[7] = 0;
  out[8] = sineYaw * cosinePitch; out[9] = -sinePitch; out[10] = cosineYaw * cosinePitch; out[11] = 0;
  out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  return out;
}

// Where the scanner in the player's hand sits in front of the eye this frame.
function writeViewmodelPlacementMatrix(out, aspectRatio, frameState) {
  const narrowScreenShift = aspectRatio < 1 ? (1 - aspectRatio) * 0.16 : 0;
  return writeViewmodelMatrix(out,
    0.27 - narrowScreenShift + frameState.viewmodelSwayX, -0.215 + frameState.viewmodelSwayY, -0.55 + frameState.viewmodelKick,
    0.1, 0.06 + frameState.viewmodelSwayY * 0.6);
}

// Moves the near end of every laser line to the place in the station that is drawn exactly behind the lens of
// the scanner in the player's hand. The scanner is drawn with its own field of view and sways with the player's
// steps, so a fixed offset from the eye does not land on the lens: the lines then start in the air beside it.
// Where the lens of the scanner is, as the eye sees it: metres to the right, up, and (negative) ahead.
// `placement` is the scanner's place in front of the eye (writeViewmodelPlacementMatrix). The scanner is drawn
// with its own field of view, so this is the place in the station that is drawn exactly behind the lens.
const lensInView = { x: 0, y: 0, z: 0 };
function computeLensInView(placement, fieldOfViewDegrees) {
  const lensX = VIEWMODEL_LENS_CENTER_X * VIEWMODEL_MODEL_SCALE, lensY = VIEWMODEL_LENS_CENTER_Y * VIEWMODEL_MODEL_SCALE, lensZ = VIEWMODEL_LENS_CENTER_Z * VIEWMODEL_MODEL_SCALE;
  // The lens as the viewmodel camera sees it: x to the right, y up, z toward the eye.
  const lensViewX = placement[0] * lensX + placement[4] * lensY + placement[8] * lensZ + placement[12];
  const lensViewY = placement[1] * lensX + placement[5] * lensY + placement[9] * lensZ + placement[13];
  const lensViewZ = placement[2] * lensX + placement[6] * lensY + placement[10] * lensZ + placement[14];
  // The same place on the screen, seen with the field of view the station is drawn with.
  const fieldOfViewRatio = Math.tan(fieldOfViewDegrees * DEGREES_TO_RADIANS / 2) / Math.tan(VIEWMODEL_FIELD_OF_VIEW_DEGREES * DEGREES_TO_RADIANS / 2);
  lensInView.x = lensViewX / -lensViewZ * fieldOfViewRatio * BEAM_ORIGIN_DISTANCE;
  lensInView.y = lensViewY / -lensViewZ * fieldOfViewRatio * BEAM_ORIGIN_DISTANCE;
  lensInView.z = -BEAM_ORIGIN_DISTANCE;
  return lensInView;
}

// The same, for the game to ask: where the lens is when the scanner is held still (no sway from your steps).
// The scanner's pulses are worked out from here when something you carry may be in their way.
const STEADY_VIEWMODEL = { viewmodelSwayX: 0, viewmodelSwayY: 0, viewmodelKick: 0 };
const steadyViewmodelMatrix = new Float32Array(16);
function getSteadyLensInView(fieldOfViewDegrees) {
  const aspectRatio = renderer.height > 0 ? renderer.width / renderer.height : 16 / 9;
  return computeLensInView(writeViewmodelPlacementMatrix(steadyViewmodelMatrix, aspectRatio, STEADY_VIEWMODEL), fieldOfViewDegrees);
}

function moveBeamLineOriginsToViewmodelLens(camera, eyeX, eyeY, eyeZ) {
  const lens = computeLensInView(renderer.viewmodelMatrix, camera.fieldOfViewDegrees);
  const originViewX = lens.x, originViewY = lens.y, originViewZ = lens.z;
  // From in front of the eye to a place in the station: the view matrix holds right, up and backward in its rows.
  const view = renderer.viewMatrix;
  const originX = eyeX + view[0] * originViewX + view[1] * originViewY + view[2] * originViewZ;
  const originY = eyeY + view[4] * originViewX + view[5] * originViewY + view[6] * originViewZ;
  const originZ = eyeZ + view[8] * originViewX + view[9] * originViewY + view[10] * originViewZ;
  beamLines.originX = originX; beamLines.originY = originY; beamLines.originZ = originZ;
  const vertices = beamLines.vertices;
  for (let lineIndex = 0; lineIndex < beamLines.count; lineIndex++) {
    const offset = lineIndex * 8;
    vertices[offset] = originX; vertices[offset + 1] = originY; vertices[offset + 2] = originZ;
  }
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

// Debug mode only. Creatures are normally never drawn; this draws their capsule bodies in flat colours,
// and the coloured lines that show what they can sense and where they are going.
function drawDebugOverlays(debug) {
  const gl = renderer.gl;
  gl.useProgram(renderer.solidProgram);
  if (debug.figures.length > 0) {
    // First pass (optional): faint and ignoring walls, so a creature in the next room shows as a ghost.
    // Second pass: solid, hidden by walls like any real object.
    for (let pass = debug.seeThroughWalls ? 0 : 1; pass < 2; pass++) {
      let brightness = 1;
      if (pass === 0) {
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        brightness = 0.22; // TWEAK: how strongly creatures show through walls
      } else {
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.depthMask(true);
      }
      for (let entryIndex = 0; entryIndex < debug.figures.length; entryIndex++) {
        const entry = debug.figures[entryIndex];
        const capsules = entry.figure.capsules;
        gl.uniform3f(renderer.solidUniforms.uTint, entry.red * brightness, entry.green * brightness, entry.blue * brightness);
        for (let capsuleIndex = 0; capsuleIndex < entry.figure.capsuleCount; capsuleIndex++) {
          const offset = capsuleIndex * FIGURE_CAPSULE_STRIDE;
          const radius = capsules[offset + 6];
          writeSegmentMatrix(renderer.modelMatrix, capsules[offset], capsules[offset + 1], capsules[offset + 2],
            capsules[offset + 3], capsules[offset + 4], capsules[offset + 5], radius);
          multiplyMatrices(renderer.scratchMatrix, renderer.viewProjectionMatrix, renderer.modelMatrix);
          gl.uniformMatrix4fv(renderer.solidUniforms.uMatrix, false, renderer.scratchMatrix);
          gl.bindVertexArray(renderer.debugCylinderVertexArray);
          gl.drawArrays(gl.TRIANGLES, 0, renderer.debugCylinderVertexCount);
          gl.bindVertexArray(renderer.debugSphereVertexArray);
          for (let endIndex = 0; endIndex < 2; endIndex++) {
            writeTranslationScaleMatrix(renderer.modelMatrix, capsules[offset + endIndex * 3], capsules[offset + endIndex * 3 + 1],
              capsules[offset + endIndex * 3 + 2], radius, radius, radius);
            multiplyMatrices(renderer.scratchMatrix, renderer.viewProjectionMatrix, renderer.modelMatrix);
            gl.uniformMatrix4fv(renderer.solidUniforms.uMatrix, false, renderer.scratchMatrix);
            gl.drawArrays(gl.TRIANGLES, 0, renderer.debugSphereVertexCount);
          }
        }
      }
    }
  }
  if (debug.lineVertexCount > 0) {
    // Lines are drawn over everything, walls included.
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.uniform3f(renderer.solidUniforms.uTint, 1, 1, 1);
    gl.uniformMatrix4fv(renderer.solidUniforms.uMatrix, false, renderer.viewProjectionMatrix);
    gl.bindVertexArray(renderer.debugLineVertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.debugLineBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, debug.lineVertices, 0, debug.lineVertexCount * 6);
    gl.drawArrays(gl.LINES, 0, debug.lineVertexCount);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
}

function renderFrame(camera, frameState) {
  const gl = renderer.gl;
  if (!renderer.isReady || !renderer.sceneFramebuffer) return;
  const aspectRatio = renderer.width / renderer.height;
  const fieldOfView = camera.fieldOfViewDegrees * DEGREES_TO_RADIANS;
  // 0.06 and 160 are the nearest and farthest distances (in metres) that can be drawn.
  writePerspectiveMatrix(renderer.projectionMatrix, fieldOfView, aspectRatio, 0.06, 160);
  // A hair of offset keeps the eye from ever sitting exactly on a tile edge while looking exactly
  // along an axis; some drivers mishandle depth offset for polygons with a vertex at zero depth.
  const eyeX = camera.x + 0.00037, eyeY = camera.y, eyeZ = camera.z + 0.00053;
  writeViewMatrix(renderer.viewMatrix, eyeX, eyeY, eyeZ, camera.yaw + 0.00011, camera.pitch);
  multiplyMatrices(renderer.viewProjectionMatrix, renderer.projectionMatrix, renderer.viewMatrix);
  if (frameState.showViewmodel) {
    writePerspectiveMatrix(renderer.viewmodelProjectionMatrix, VIEWMODEL_FIELD_OF_VIEW_DEGREES * DEGREES_TO_RADIANS, aspectRatio, 0.03, 4);
    writeViewmodelPlacementMatrix(renderer.viewmodelMatrix, aspectRatio, frameState);
    moveBeamLineOriginsToViewmodelLens(camera, eyeX, eyeY, eyeZ);
  }

  flushPointUploads();

  gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.sceneFramebuffer);
  gl.viewport(0, 0, renderer.width, renderer.height);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.colorMask(true, true, true, true);
  gl.clearColor(0, 0, 0, 1);
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 1. Occluders. Normally depth only: the station is never visible, it just hides points behind it.
  //    With "Light the station" on in debug mode it is drawn in colour instead.
  const debug = frameState.debug;
  const isStationLit = debug !== null && debug.lightStation;
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(2.5, 4.0);
  if (isStationLit) {
    gl.useProgram(renderer.debugWorldProgram);
    gl.uniformMatrix4fv(renderer.debugWorldUniforms.uViewProjection, false, renderer.viewProjectionMatrix);
    gl.uniform3f(renderer.debugWorldUniforms.uCameraPosition, camera.x, camera.y, camera.z);
  } else {
    gl.useProgram(renderer.solidProgram);
    gl.uniform3f(renderer.solidUniforms.uTint, 0, 0, 0);
    gl.colorMask(false, false, false, false);
    gl.vertexAttrib3f(1, 0, 0, 0);
  }
  if (renderer.worldVertexArray) {
    if (isStationLit) {
      gl.uniformMatrix4fv(renderer.debugWorldUniforms.uModel, false, renderer.identityMatrix);
      gl.uniform3f(renderer.debugWorldUniforms.uColor, 0.2, 0.25, 0.32); // TWEAK: colour of the lit station
    } else {
      gl.uniformMatrix4fv(renderer.solidUniforms.uMatrix, false, renderer.viewProjectionMatrix);
    }
    gl.bindVertexArray(renderer.worldVertexArray);
    if (isStationLit) {
      // The rooms first, then what stands in them in a warmer colour, so furniture can be told from floor.
      gl.drawArrays(gl.TRIANGLES, 0, worldOccluderPropStart);
      gl.uniform3f(renderer.debugWorldUniforms.uColor, 0.42, 0.33, 0.22); // TWEAK: colour of props in the lit station
      gl.drawArrays(gl.TRIANGLES, worldOccluderPropStart, renderer.worldVertexCount - worldOccluderPropStart);
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, renderer.worldVertexCount);
    }
  }
  gl.bindVertexArray(renderer.unitCubeVertexArray);
  for (let propIndex = 0; propIndex < dynamicBoxProps.length; propIndex++) {
    const prop = dynamicBoxProps[propIndex];
    if (prop.isRemoved) continue;
    writeBoxPropMatrix(renderer.modelMatrix, prop);
    if (isStationLit) {
      // Doors and pickups get their scan colours so they are easy to find.
      gl.uniformMatrix4fv(renderer.debugWorldUniforms.uModel, false, renderer.modelMatrix);
      let canOpen = true;
      if (prop.surfaceClass === SURFACE_DOOR_POWERED) canOpen = frameState.powerOn;
      if (prop.surfaceClass === SURFACE_DOOR_KEYCARD) canOpen = frameState.powerOn && frameState.keycardLevel >= 1;
      if (prop.surfaceClass === SURFACE_DOOR_KEYCARD_2) canOpen = frameState.powerOn && frameState.keycardLevel >= 2;
      if (prop.surfaceClass === SURFACE_DOOR_KEYCARD_3) canOpen = frameState.powerOn && frameState.keycardLevel >= 3;
      if (prop.surfaceClass === SURFACE_INTERACTIVE) gl.uniform3f(renderer.debugWorldUniforms.uColor, 0.9, 0.6, 0.12);
      else if (canOpen) gl.uniform3f(renderer.debugWorldUniforms.uColor, 0.12, 0.5, 0.28);
      else gl.uniform3f(renderer.debugWorldUniforms.uColor, 0.55, 0.14, 0.08);
    } else {
      multiplyMatrices(renderer.scratchMatrix, renderer.viewProjectionMatrix, renderer.modelMatrix);
      gl.uniformMatrix4fv(renderer.solidUniforms.uMatrix, false, renderer.scratchMatrix);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 36);
  }
  drawLooseObjectOccluders(camera, isStationLit);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.colorMask(true, true, true, true);

  // 2. The point cloud: opaque discs, so a dense scan reads as a surface instead of glare.
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  if (pointCloud.storedCount > 0) {
    gl.useProgram(renderer.pointProgram);
    const uniforms = renderer.pointUniforms;
    gl.uniformMatrix4fv(uniforms.uViewProjection, false, renderer.viewProjectionMatrix);
    gl.uniform3f(uniforms.uCameraPosition, camera.x, camera.y, camera.z);
    gl.uniform1f(uniforms.uTime, frameState.time);
    const focalLengthPixels = renderer.height / (2 * Math.tan(fieldOfView / 2));
    // TWEAK: 0.03 is the size of one point in metres. The next line clamps it on screen:
    // never smaller than 1.7 pixels (far away) and never larger than 3.8 pixels (close up).
    gl.uniform1f(uniforms.uPointScale, 0.03 * focalLengthPixels);
    gl.uniform2f(uniforms.uPointSizeLimits, 1.7 * renderer.pixelRatio, 3.8 * renderer.pixelRatio);
    gl.uniform1f(uniforms.uInterference, frameState.interference);
    gl.uniform1f(uniforms.uPowerOn, frameState.powerOn ? 1 : 0);
    gl.uniform1f(uniforms.uHasKeycard, frameState.keycardLevel);
    gl.uniform1i(uniforms.uPalette, frameState.palette);
    gl.bindVertexArray(renderer.pointVertexArray);
    gl.drawArrays(gl.POINTS, 0, pointCloud.storedCount);
  }

  // 3. Laser lines from the emitter to this frame's returns.
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.depthMask(false);
  if (beamLines.count > 0) {
    gl.useProgram(renderer.beamProgram);
    gl.uniformMatrix4fv(renderer.beamUniforms.uViewProjection, false, renderer.viewProjectionMatrix);
    gl.uniform3f(renderer.beamUniforms.uColor, 0.55, 0.85, 1.0);
    gl.bindVertexArray(renderer.beamVertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.beamBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, beamLines.vertices, 0, beamLines.count * 8);
    gl.drawArrays(gl.LINES, 0, beamLines.count * 2);
  }
  // 3a. The beam that holds what you carry: one amber line from the lens to the object, so that you can tell
  //     something is on the end of it even when you have not scanned it.
  const carried = frameState.showViewmodel ? getHeldLooseObject() : null;
  if (carried !== null) {
    const vertices = beamLines.vertices, offset = MAXIMUM_BEAM_LINES * 8;
    const flicker = 0.5 + 0.12 * Math.sin(frameState.time * 31) + 0.08 * Math.sin(frameState.time * 47);
    vertices[offset] = beamLines.originX; vertices[offset + 1] = beamLines.originY; vertices[offset + 2] = beamLines.originZ; vertices[offset + 3] = flicker;
    vertices[offset + 4] = carried.x; vertices[offset + 5] = carried.y; vertices[offset + 6] = carried.z; vertices[offset + 7] = flicker * 0.6;
    gl.useProgram(renderer.beamProgram);
    gl.uniformMatrix4fv(renderer.beamUniforms.uViewProjection, false, renderer.viewProjectionMatrix);
    gl.uniform3f(renderer.beamUniforms.uColor, 1.0, 0.62, 0.18); // TWEAK: the colour of the holding beam
    gl.bindVertexArray(renderer.beamVertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.beamBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, offset * 4, vertices, offset, 8);
    gl.drawArrays(gl.LINES, MAXIMUM_BEAM_LINES * 2, 2);
  }
  gl.disable(gl.BLEND);
  gl.depthMask(true);

  // 3b. Debug mode overlays: creature bodies, then sense rings and routes.
  if (debug !== null) drawDebugOverlays(debug);

  // 4. The scanner in the player's hand.
  if (frameState.showViewmodel) {
    gl.clear(gl.DEPTH_BUFFER_BIT);
    multiplyMatrices(renderer.scratchMatrix, renderer.viewmodelProjectionMatrix, renderer.viewmodelMatrix);
    gl.useProgram(renderer.solidProgram);
    gl.uniformMatrix4fv(renderer.solidUniforms.uMatrix, false, renderer.scratchMatrix);
    gl.bindVertexArray(renderer.viewmodelVertexArray);
    const ranges = renderer.viewmodelRanges;
    gl.uniform3f(renderer.solidUniforms.uTint, 1, 1, 1);
    gl.drawArrays(gl.TRIANGLES, ranges.body[0], ranges.body[1]);
    const lensGlow = 0.12 + frameState.scannerActivity * 0.88;
    gl.uniform3f(renderer.solidUniforms.uTint, 0.5 * lensGlow, 0.9 * lensGlow, 1.0 * lensGlow);
    gl.drawArrays(gl.TRIANGLES, ranges.lens[0], ranges.lens[1]);
    const heat = frameState.scannerHeat;
    const flicker = 0.85 + 0.15 * Math.sin(frameState.time * 23);
    gl.uniform3f(renderer.solidUniforms.uTint, (0.95 + heat * 0.3) * flicker, (0.62 - heat * 0.45) * flicker, (0.14 - heat * 0.1) * flicker);
    gl.drawArrays(gl.TRIANGLES, ranges.screen[0], ranges.screen[1]);
  }

  // 5. Post-processing onto the screen.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, renderer.width, renderer.height);
  gl.disable(gl.DEPTH_TEST);
  gl.bindTexture(gl.TEXTURE_2D, renderer.sceneTexture);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.useProgram(renderer.postProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(renderer.postUniforms.uScene, 0);
  gl.uniform2f(renderer.postUniforms.uResolution, renderer.width, renderer.height);
  gl.uniform1f(renderer.postUniforms.uTime, frameState.realTime);
  gl.uniform1f(renderer.postUniforms.uInterference, frameState.interference);
  gl.uniform1f(renderer.postUniforms.uDanger, frameState.danger);
  gl.uniform1f(renderer.postUniforms.uFade, frameState.fade);
  gl.bindVertexArray(renderer.postVertexArray);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
}
