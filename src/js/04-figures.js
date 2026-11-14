// ---------------------------------------------------------------------------
// Figures: upright bodies built from twelve capsules. They are never drawn.
// The only trace of one is the points a scan leaves on it, frozen where it stood
// at that moment. Stop scanning and there is nothing to see.
// ---------------------------------------------------------------------------

const FIGURE_CAPSULE_COUNT = 12;
const FIGURE_CAPSULE_STRIDE = 7; // startX, startY, startZ, endX, endY, endZ, radius

const FIGURE_PROPORTIONS_HOLLOW = {
  torsoLength: 0.76, neckLength: 0.15, headRadius: 0.112, headLength: 0.11,
  shoulderWidth: 0.44, hipWidth: 0.2, upperArm: 0.58, foreArm: 0.7,
  thigh: 0.6, shin: 0.64, torsoRadius: 0.11, limbRadius: 0.042, legRadius: 0.058
};

const FIGURE_PROPORTIONS_DUMMY = {
  torsoLength: 0.55, neckLength: 0.08, headRadius: 0.105, headLength: 0.05,
  shoulderWidth: 0.4, hipWidth: 0.2, upperArm: 0.3, foreArm: 0.29,
  thigh: 0.45, shin: 0.46, torsoRadius: 0.14, limbRadius: 0.046, legRadius: 0.066
};

const raycastableFigures = [];

function createFigure(proportions, surfaceClass, pointLifeCode) {
  return {
    x: 0, z: 0, yaw: 0,
    proportions: proportions,
    pose: { legSwing: 0, kneeBend: 0, armSwing: 0, armRaise: 0, elbowBend: 0.1, lean: 0, headTilt: 0 },
    capsules: new Float32Array(FIGURE_CAPSULE_COUNT * FIGURE_CAPSULE_STRIDE),
    boundsCenterY: 1,
    boundsRadius: 1.5,
    surfaceClass: surfaceClass,
    pointLifeCode: pointLifeCode,
    hitsThisFrame: 0,
    totalHits: 0,
    lastScannedTime: -999
  };
}

function setFigureRaycastable(figure, isRaycastable) {
  const position = raycastableFigures.indexOf(figure);
  if (isRaycastable && position < 0) raycastableFigures.push(figure);
  if (!isRaycastable && position >= 0) raycastableFigures.splice(position, 1);
}

function writeFigureCapsule(figure, capsuleIndex, startLocal, endLocal, radius) {
  // Local frame: X = the figure's right, Y = up, Z = the direction it faces.
  const forwardX = Math.sin(figure.yaw), forwardZ = -Math.cos(figure.yaw);
  const rightX = Math.cos(figure.yaw), rightZ = Math.sin(figure.yaw);
  const offset = capsuleIndex * FIGURE_CAPSULE_STRIDE;
  const capsules = figure.capsules;
  capsules[offset] = figure.x + startLocal[0] * rightX + startLocal[2] * forwardX;
  capsules[offset + 1] = startLocal[1];
  capsules[offset + 2] = figure.z + startLocal[0] * rightZ + startLocal[2] * forwardZ;
  capsules[offset + 3] = figure.x + endLocal[0] * rightX + endLocal[2] * forwardX;
  capsules[offset + 4] = endLocal[1];
  capsules[offset + 5] = figure.z + endLocal[0] * rightZ + endLocal[2] * forwardZ;
  capsules[offset + 6] = radius;
}

function updateFigureCapsules(figure) {
  const body = figure.proportions, pose = figure.pose;

  // Legs first, relative to the pelvis, so the lower foot can be planted on the floor.
  const legs = [];
  let lowestFootHeight = 0;
  for (let side = -1; side <= 1; side += 2) {
    const swing = pose.legSwing * (side < 0 ? 1 : -1);
    const bend = pose.kneeBend + Math.max(0, -swing) * 0.7;
    const hip = [side * body.hipWidth / 2, 0, 0];
    const knee = [hip[0], -Math.cos(swing) * body.thigh, Math.sin(swing) * body.thigh];
    const shinAngle = swing - bend;
    const foot = [knee[0], knee[1] - Math.cos(shinAngle) * body.shin, knee[2] + Math.sin(shinAngle) * body.shin];
    lowestFootHeight = Math.min(lowestFootHeight, foot[1]);
    legs.push({ hip: hip, knee: knee, foot: foot });
  }
  const pelvisHeight = -lowestFootHeight + body.legRadius;
  for (const leg of legs) { leg.hip[1] += pelvisHeight; leg.knee[1] += pelvisHeight; leg.foot[1] += pelvisHeight; }

  const pelvis = [0, pelvisHeight, 0];
  const chest = [0, pelvisHeight + Math.cos(pose.lean) * body.torsoLength, Math.sin(pose.lean) * body.torsoLength];
  const neckLean = pose.lean * 1.5;
  const neckDirection = [Math.sin(pose.headTilt), Math.cos(neckLean) * Math.cos(pose.headTilt), Math.sin(neckLean)];
  const neckReach = body.neckLength + body.headRadius;
  const headBase = [chest[0] + neckDirection[0] * neckReach, chest[1] + neckDirection[1] * neckReach, chest[2] + neckDirection[2] * neckReach];
  const headTop = [headBase[0] + neckDirection[0] * body.headLength, headBase[1] + neckDirection[1] * body.headLength, headBase[2] + neckDirection[2] * body.headLength];

  writeFigureCapsule(figure, 0, pelvis, chest, body.torsoRadius);
  writeFigureCapsule(figure, 1, headBase, headTop, body.headRadius);
  const shoulderLeft = [-body.shoulderWidth / 2, chest[1] - 0.03, chest[2]];
  const shoulderRight = [body.shoulderWidth / 2, chest[1] - 0.03, chest[2]];
  writeFigureCapsule(figure, 2, shoulderLeft, shoulderRight, body.limbRadius * 1.3);
  writeFigureCapsule(figure, 3, legs[0].hip, legs[1].hip, body.legRadius);

  for (let side = -1; side <= 1; side += 2) {
    const shoulder = side < 0 ? shoulderLeft : shoulderRight;
    const armAngle = pose.armRaise + pose.lean * 0.4 + pose.armSwing * (side < 0 ? -1 : 1);
    const elbow = [shoulder[0], shoulder[1] - Math.cos(armAngle) * body.upperArm, shoulder[2] + Math.sin(armAngle) * body.upperArm];
    const foreArmAngle = armAngle + pose.elbowBend;
    const hand = [elbow[0], elbow[1] - Math.cos(foreArmAngle) * body.foreArm, elbow[2] + Math.sin(foreArmAngle) * body.foreArm];
    const armIndex = side < 0 ? 0 : 1;
    writeFigureCapsule(figure, 4 + armIndex, shoulder, elbow, body.limbRadius);
    writeFigureCapsule(figure, 6 + armIndex, elbow, hand, body.limbRadius * 0.9);
    const leg = legs[armIndex];
    writeFigureCapsule(figure, 8 + armIndex, leg.hip, leg.knee, body.legRadius);
    writeFigureCapsule(figure, 10 + armIndex, leg.knee, leg.foot, body.legRadius * 0.85);
  }

  // Bounding sphere for quick rejection in the ray caster.
  const topHeight = headTop[1] + body.headRadius;
  figure.boundsCenterY = topHeight / 2;
  let largestDistanceSquared = 0;
  const capsules = figure.capsules;
  for (let capsuleIndex = 0; capsuleIndex < FIGURE_CAPSULE_COUNT; capsuleIndex++) {
    const offset = capsuleIndex * FIGURE_CAPSULE_STRIDE;
    for (let endIndex = 0; endIndex < 2; endIndex++) {
      const deltaX = capsules[offset + endIndex * 3] - figure.x;
      const deltaY = capsules[offset + endIndex * 3 + 1] - figure.boundsCenterY;
      const deltaZ = capsules[offset + endIndex * 3 + 2] - figure.z;
      largestDistanceSquared = Math.max(largestDistanceSquared, deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
    }
  }
  figure.boundsRadius = Math.sqrt(largestDistanceSquared) + 0.16;
}

function getFigureHeadHeight(figure) {
  return figure.capsules[1 * FIGURE_CAPSULE_STRIDE + 4];
}

// Sprays points straight onto a figure's surface. Used for the moment it reaches you.
function emitFigureRevealPoints(figure, pointCount, surfaceClass, lifeCode) {
  const capsules = figure.capsules;
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    const offset = Math.floor(Math.random() * FIGURE_CAPSULE_COUNT) * FIGURE_CAPSULE_STRIDE;
    const along = Math.random();
    let directionX = Math.random() - 0.5, directionY = Math.random() - 0.5, directionZ = Math.random() - 0.5;
    const length = Math.sqrt(directionX * directionX + directionY * directionY + directionZ * directionZ) || 1;
    const radius = capsules[offset + 6];
    addScanPoint(
      capsules[offset] + (capsules[offset + 3] - capsules[offset]) * along + directionX / length * radius,
      capsules[offset + 1] + (capsules[offset + 4] - capsules[offset + 1]) * along + directionY / length * radius,
      capsules[offset + 2] + (capsules[offset + 5] - capsules[offset + 2]) * along + directionZ / length * radius,
      0.6 + Math.random() * 0.4, surfaceClass, lifeCode);
  }
}
