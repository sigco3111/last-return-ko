// ---------------------------------------------------------------------------
// Small math helpers: scalars, seeded randomness and 4x4 matrices
// (matrices are column-major Float32Array(16), as WebGL expects)
// ---------------------------------------------------------------------------

const DEGREES_TO_RADIANS = Math.PI / 180;
const TWO_PI = Math.PI * 2;

function clampNumber(value, minimum, maximum) {
  return value < minimum ? minimum : (value > maximum ? maximum : value);
}

function interpolateLinear(from, to, amount) {
  return from + (to - from) * amount;
}

function smoothStep(edgeLow, edgeHigh, value) {
  const amount = clampNumber((value - edgeLow) / (edgeHigh - edgeLow), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function wrapAngleToPi(angle) {
  while (angle > Math.PI) angle -= TWO_PI;
  while (angle < -Math.PI) angle += TWO_PI;
  return angle;
}

function approachValue(current, target, maximumStep) {
  if (current < target) return Math.min(target, current + maximumStep);
  return Math.max(target, current - maximumStep);
}

function distanceBetweenPoints(firstX, firstZ, secondX, secondZ) {
  const deltaX = secondX - firstX;
  const deltaZ = secondZ - firstZ;
  return Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
}

function createSeededRandomGenerator(seed) {
  let state = seed >>> 0;
  return function nextSeededRandom() {
    state = (state + 0x6D2B79F5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBetween(minimum, maximum) {
  return minimum + Math.random() * (maximum - minimum);
}

function writeIdentityMatrix(out) {
  out.fill(0);
  out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
  return out;
}

function writePerspectiveMatrix(out, verticalFieldOfViewRadians, aspectRatio, nearPlane, farPlane) {
  const focal = 1 / Math.tan(verticalFieldOfViewRadians / 2);
  out.fill(0);
  out[0] = focal / aspectRatio;
  out[5] = focal;
  out[10] = (farPlane + nearPlane) / (nearPlane - farPlane);
  out[11] = -1;
  out[14] = (2 * farPlane * nearPlane) / (nearPlane - farPlane);
  return out;
}

// Camera convention used everywhere in the game:
//   yaw 0 looks toward -Z (north on the map), positive yaw turns right (toward +X, east)
//   pitch positive looks up
function writeViewMatrix(out, eyeX, eyeY, eyeZ, yaw, pitch) {
  const cosineYaw = Math.cos(yaw), sineYaw = Math.sin(yaw);
  const cosinePitch = Math.cos(pitch), sinePitch = Math.sin(pitch);
  const rightX = cosineYaw, rightY = 0, rightZ = sineYaw;
  const forwardX = sineYaw * cosinePitch, forwardY = sinePitch, forwardZ = -cosineYaw * cosinePitch;
  const upX = -sineYaw * sinePitch, upY = cosinePitch, upZ = cosineYaw * sinePitch;
  out[0] = rightX; out[1] = upX; out[2] = -forwardX; out[3] = 0;
  out[4] = rightY; out[5] = upY; out[6] = -forwardY; out[7] = 0;
  out[8] = rightZ; out[9] = upZ; out[10] = -forwardZ; out[11] = 0;
  out[12] = -(rightX * eyeX + rightY * eyeY + rightZ * eyeZ);
  out[13] = -(upX * eyeX + upY * eyeY + upZ * eyeZ);
  out[14] = (forwardX * eyeX + forwardY * eyeY + forwardZ * eyeZ);
  out[15] = 1;
  return out;
}

function multiplyMatrices(out, left, right) {
  for (let column = 0; column < 4; column++) {
    const r0 = right[column * 4], r1 = right[column * 4 + 1], r2 = right[column * 4 + 2], r3 = right[column * 4 + 3];
    out[column * 4] = left[0] * r0 + left[4] * r1 + left[8] * r2 + left[12] * r3;
    out[column * 4 + 1] = left[1] * r0 + left[5] * r1 + left[9] * r2 + left[13] * r3;
    out[column * 4 + 2] = left[2] * r0 + left[6] * r1 + left[10] * r2 + left[14] * r3;
    out[column * 4 + 3] = left[3] * r0 + left[7] * r1 + left[11] * r2 + left[15] * r3;
  }
  return out;
}

// Model matrix that maps a unit cylinder (radius 1, Y from 0 to 1) onto the segment from start to end.
// Used by debug mode to draw creature bodies.
function writeSegmentMatrix(out, startX, startY, startZ, endX, endY, endZ, radius) {
  const axisX = endX - startX, axisY = endY - startY, axisZ = endZ - startZ;
  const length = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ) || 0.0001;
  const directionX = axisX / length, directionY = axisY / length, directionZ = axisZ / length;
  let helperX = 0, helperY = 1;
  const helperZ = 0;
  if (Math.abs(directionY) > 0.98) { helperX = 1; helperY = 0; }
  let sideX = helperY * directionZ - helperZ * directionY;
  let sideY = helperZ * directionX - helperX * directionZ;
  let sideZ = helperX * directionY - helperY * directionX;
  const sideLength = Math.sqrt(sideX * sideX + sideY * sideY + sideZ * sideZ) || 1;
  sideX /= sideLength; sideY /= sideLength; sideZ /= sideLength;
  const otherX = directionY * sideZ - directionZ * sideY;
  const otherY = directionZ * sideX - directionX * sideZ;
  const otherZ = directionX * sideY - directionY * sideX;
  out[0] = sideX * radius; out[1] = sideY * radius; out[2] = sideZ * radius; out[3] = 0;
  out[4] = axisX; out[5] = axisY; out[6] = axisZ; out[7] = 0;
  out[8] = otherX * radius; out[9] = otherY * radius; out[10] = otherZ * radius; out[11] = 0;
  out[12] = startX; out[13] = startY; out[14] = startZ; out[15] = 1;
  return out;
}

function writeTranslationScaleMatrix(out, x, y, z, scaleX, scaleY, scaleZ) {
  out.fill(0);
  out[0] = scaleX; out[5] = scaleY; out[10] = scaleZ; out[15] = 1;
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}

function formatClockTime(totalSeconds) {
  const wholeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

function formatWithThousandsSeparators(value) {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
