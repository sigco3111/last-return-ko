// ---------------------------------------------------------------------------
// Figures: bodies built from capsules (a capsule is a rod with rounded ends).
// They are never drawn. The only trace of one is the points a scan leaves on it,
// frozen where it stood at that moment. Stop scanning and there is nothing to see.
// ---------------------------------------------------------------------------

const FIGURE_MAXIMUM_CAPSULES = 26;
const FIGURE_CAPSULE_STRIDE = 7; // startX, startY, startZ, endX, endY, endZ, radius

// TWEAK: body shapes, in metres. Lengths are bone lengths, radii are how thick each part is.
// The Hollow: a hunched thing with a long neck, a hanging jaw, arms that reach its knees and three long
// fingers on each hand. Standing hunched it is about 2.2 m tall; when it straightens up to listen, about 2.5 m.
const FIGURE_PROPORTIONS_HOLLOW = {
  kind: 'hollow',
  thigh: 0.75, shin: 0.79, footLength: 0.295, hipWidth: 0.285,
  lowerSpine: 0.4, upperSpine: 0.465, shoulderWidth: 0.265,
  neckLength: 0.345, headLength: 0.11, headRadius: 0.11, jawLength: 0.075,
  upperArm: 0.705, foreArm: 0.75, handLength: 0.125,
  fingerLengths: [0.26, 0.32, 0.27],   // outer, middle, inner finger
  torsoRadius: 0.095, limbRadius: 0.05, legRadius: 0.08, fingerRadius: 0.015
};

// The calibration dummy: an ordinary jointed shop mannequin, about 1.75 m tall.
const FIGURE_PROPORTIONS_DUMMY = {
  kind: 'dummy',
  torsoLength: 0.585, neckLength: 0.11, headRadius: 0.11, headLength: 0.05,
  shoulderWidth: 0.42, hipWidth: 0.205, upperArm: 0.31, foreArm: 0.285, handLength: 0.11,
  thigh: 0.575, shin: 0.45, footLength: 0.2, torsoRadius: 0.145, limbRadius: 0.04, legRadius: 0.065, jointRadius: 0.06
};

const raycastableFigures = [];

// Points store their lifetime in one byte, in quarter seconds: 1 = 0.25 s, 255 = 63.75 s. 0 means "forever".
function convertSecondsToPointLifeCode(seconds) {
  return clampNumber(Math.round(seconds / 0.25), 1, 255);
}

// `imprintTuningKey` names the TUNING value that says how long points left on this figure stay visible.
function createFigure(proportions, surfaceClass, imprintTuningKey) {
  return {
    x: 0, z: 0, yaw: 0,
    y: 0, // height of the floor it stands on; worked out from x and z whenever the body is rebuilt
    proportions: proportions,
    // Pose, all angles in radians:
    //   legSwing / armSwing  walking motion          armRaise     arms lifted forward (0 hanging, 1.4 reaching)
    //   kneeBend / elbowBend extra bend              lean         whole body tipped forward
    //   headTilt             head cocked sideways
    //   stretch              Hollow only: 0 hunched, 1 drawn up to full height
    //   fingerSplay          Hollow only: 0 fingers together and curled, 1 spread wide
    //   stoop                Hollow only: 0 as it stands, 1 folded as low as it can go to get under a low ceiling
    //   crawl                Hollow only: 0 on its feet, 1 down on knees and hands, the way it goes through a vent
    pose: { legSwing: 0, kneeBend: 0, armSwing: 0, armRaise: 0, elbowBend: 0.1, lean: 0, headTilt: 0, stretch: 0, fingerSplay: 0.25, stoop: 0, crawl: 0 },
    capsules: new Float32Array(FIGURE_MAXIMUM_CAPSULES * FIGURE_CAPSULE_STRIDE),
    capsuleCount: 0,
    headHeight: 1.6,
    boundsCenterY: 1,
    boundsRadius: 1.5,
    surfaceClass: surfaceClass,
    imprintTuningKey: imprintTuningKey,
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

function addLocalPoints(point, direction, length) {
  return [point[0] + direction[0] * length, point[1] + direction[1] * length, point[2] + direction[2] * length];
}

function normalizeLocalVector(vector) {
  const length = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

// The Hollow. Local frame: X = its right, Y = up, Z = the way it faces.
function buildHollowCapsules(figure) {
  const body = figure.proportions, pose = figure.pose;
  const stretch = clampNumber(pose.stretch, 0, 1), hunch = 1 - stretch;
  const splay = clampNumber(pose.fingerSplay, 0, 1);
  // Stooping folds the legs further and tips the back and neck over, the way a tall man goes through a low door.
  // TWEAK: the four STOOP numbers say how much each joint gives. Larger = it can get under lower ceilings.
  const stoop = clampNumber(pose.stoop || 0, 0, 1);
  const STOOP_THIGH = 0.5, STOOP_KNEE = 1.0, STOOP_LOWER_BACK = 0.3, STOOP_UPPER_BACK = 0.55;
  // Crawling: knees on the floor under the hips, shins lying back, the back level, the neck stuck out, and the
  // long arms reaching ahead with the elbows cocked out to the sides. Every joint moves from where it would be
  // standing to where it is crawling as `crawl` goes from 0 to 1.
  // TWEAK: the CRAWL numbers are joint angles in radians (0 = straight down or straight up, 1.57 = level).
  const crawl = clampNumber(pose.crawl || 0, 0, 1);
  const CRAWL_THIGH = 0.55, CRAWL_SHIN = -1.5, CRAWL_LOWER_BACK = 1.5, CRAWL_UPPER_BACK = 1.62, CRAWL_NECK = 1.45;
  const CRAWL_ELBOW_OUT = 0.26, CRAWL_ELBOW_DROP = 0.22; // metres the elbow sits out from and below the shoulder
  let next = 0;
  const add = function (start, end, radius) { writeFigureCapsule(figure, next++, start, end, radius); };

  // Legs: knees pushed forward, shins sloping back, like something that was not built to stand upright.
  const legs = [];
  let lowestAnkle = 0;
  for (let side = -1; side <= 1; side += 2) {
    const swing = pose.legSwing * (side < 0 ? 1 : -1);
    const standingThighAngle = swing + 0.38 * hunch + pose.kneeBend * 0.5 + STOOP_THIGH * stoop;
    const standingShinAngle = standingThighAngle - (0.8 * hunch + pose.kneeBend + Math.max(0, -swing) * 0.6 + STOOP_KNEE * stoop);
    const thighAngle = interpolateLinear(standingThighAngle, CRAWL_THIGH + swing * 0.6, crawl);
    const shinAngle = interpolateLinear(standingShinAngle, CRAWL_SHIN, crawl);
    const hip = [side * body.hipWidth / 2, 0, 0];
    const knee = [hip[0], -Math.cos(thighAngle) * body.thigh, Math.sin(thighAngle) * body.thigh];
    const ankle = [knee[0], knee[1] - Math.cos(shinAngle) * body.shin, knee[2] + Math.sin(shinAngle) * body.shin];
    lowestAnkle = Math.min(lowestAnkle, ankle[1]);
    legs.push({ hip: hip, knee: knee, ankle: ankle, side: side });
  }
  const pelvisHeight = -lowestAnkle + 0.07;
  for (const leg of legs) { leg.hip[1] += pelvisHeight; leg.knee[1] += pelvisHeight; leg.ankle[1] += pelvisHeight; }

  // Spine in two pieces, so the back curves instead of tipping like a plank.
  const pelvis = [0, pelvisHeight, 0];
  const lowerLean = interpolateLinear(pose.lean * 0.7 + 0.25 * hunch + STOOP_LOWER_BACK * stoop, CRAWL_LOWER_BACK, crawl);
  const upperLean = interpolateLinear(pose.lean * 1.5 + 0.6 * hunch + STOOP_UPPER_BACK * stoop, CRAWL_UPPER_BACK, crawl);
  const midSpine = addLocalPoints(pelvis, [0, Math.cos(lowerLean), Math.sin(lowerLean)], body.lowerSpine);
  const chest = addLocalPoints(midSpine, [0, Math.cos(upperLean), Math.sin(upperLean)], body.upperSpine);
  add(pelvis, midSpine, body.torsoRadius);
  add(midSpine, chest, body.torsoRadius * 1.08);

  // Neck jutting forward, head cocked hard to one side, jaw hanging.
  const neckLean = interpolateLinear(upperLean * 0.6 + 0.55 * hunch, CRAWL_NECK, crawl);
  const neckDirection = normalizeLocalVector([Math.sin(pose.headTilt) * 0.45, Math.cos(neckLean), Math.sin(neckLean)]);
  const headBase = addLocalPoints(chest, neckDirection, body.neckLength);
  const headDirection = normalizeLocalVector([Math.sin(pose.headTilt), Math.cos(pose.headTilt) * Math.cos(neckLean * 0.6), Math.sin(neckLean * 0.6)]);
  const headTop = addLocalPoints(headBase, headDirection, body.headLength);
  add(chest, headBase, body.limbRadius * 1.15);
  add(headBase, headTop, body.headRadius);
  const jawStart = [headBase[0], headBase[1] - 0.02, headBase[2] + 0.07];
  add(jawStart, [jawStart[0] - Math.sin(pose.headTilt) * 0.03, jawStart[1] - body.jawLength - 0.06 * splay, jawStart[2] + 0.05], 0.028);
  figure.headHeight = (headBase[1] + headTop[1]) / 2;

  // Shoulders, one hanging lower than the other.
  const droop = 0.07 * hunch;
  const shoulderLeft = [-body.shoulderWidth / 2, chest[1] - 0.02 - droop, chest[2] + 0.02];
  const shoulderRight = [body.shoulderWidth / 2, chest[1] - 0.02 + droop * 0.3, chest[2] + 0.02];
  add(shoulderLeft, shoulderRight, body.limbRadius * 1.3);
  add(legs[0].hip, legs[1].hip, body.legRadius * 1.1);

  // Arms that reach its knees, ending in three long fingers.
  for (let side = -1; side <= 1; side += 2) {
    const shoulder = side < 0 ? shoulderLeft : shoulderRight;
    const armAngle = pose.armRaise + upperLean * 0.5 + pose.armSwing * (side < 0 ? -1 : 1);
    const elbow = [shoulder[0] + side * 0.08 * (1 + stretch), shoulder[1] - Math.cos(armAngle) * body.upperArm, shoulder[2] + Math.sin(armAngle) * body.upperArm];
    const foreArmAngle = armAngle + pose.elbowBend + (side < 0 ? 0.14 * hunch : 0);
    const wrist = [elbow[0] + side * 0.03, elbow[1] - Math.cos(foreArmAngle) * body.foreArm, elbow[2] + Math.sin(foreArmAngle) * body.foreArm];
    if (crawl > 0) {
      // Crawling: the elbow out to the side and a little below the shoulder, the hand flat on the floor ahead.
      // The two arms reach in turn, opposite to the legs.
      const reach = pose.legSwing * (side < 0 ? -1 : 1) * 0.25;
      const elbowForward = Math.sqrt(Math.max(0.01, body.upperArm * body.upperArm - CRAWL_ELBOW_OUT * CRAWL_ELBOW_OUT - CRAWL_ELBOW_DROP * CRAWL_ELBOW_DROP));
      const crawlElbow = [shoulder[0] + side * CRAWL_ELBOW_OUT, shoulder[1] - CRAWL_ELBOW_DROP, shoulder[2] + elbowForward + reach];
      const drop = Math.max(0, crawlElbow[1] - 0.06);
      const crawlWrist = [crawlElbow[0] + side * 0.03, 0.06, crawlElbow[2] + Math.sqrt(Math.max(0.01, body.foreArm * body.foreArm - drop * drop))];
      for (let axis = 0; axis < 3; axis++) {
        elbow[axis] = interpolateLinear(elbow[axis], crawlElbow[axis], crawl);
        wrist[axis] = interpolateLinear(wrist[axis], crawlWrist[axis], crawl);
      }
    }
    // The hand follows the forearm, except when crawling, where it lies along the floor.
    const foreArmDirection = normalizeLocalVector([wrist[0] - elbow[0], (wrist[1] - elbow[1]) * (1 - 0.9 * crawl), wrist[2] - elbow[2] + crawl * 0.4]);
    const knuckles = addLocalPoints(wrist, foreArmDirection, body.handLength);
    add(shoulder, elbow, body.limbRadius);
    add(elbow, wrist, body.limbRadius * 0.9);
    add(wrist, knuckles, body.limbRadius * 0.8);
    for (let finger = -1; finger <= 1; finger++) {
      const fingerDirection = normalizeLocalVector([
        foreArmDirection[0] + finger * 0.42 * (0.3 + 0.7 * splay),
        foreArmDirection[1],
        foreArmDirection[2] + 0.2 * (1 - splay)]);
      add(knuckles, addLocalPoints(knuckles, fingerDirection, body.fingerLengths[finger + 1]), body.fingerRadius);
    }
  }

  for (const leg of legs) {
    add(leg.hip, leg.knee, body.legRadius);
    add(leg.knee, leg.ankle, body.legRadius * 0.85);
    add(leg.ankle, [leg.ankle[0] + leg.side * 0.03, 0.035, leg.ankle[2] + body.footLength * (1 - 2 * crawl)], 0.035); // crawling, the toes trail behind
  }
  figure.capsuleCount = next;
  return headTop[1] + body.headRadius;
}

// The calibration dummy: stiff, symmetrical, with a ball at every joint.
function buildDummyCapsules(figure) {
  const body = figure.proportions, pose = figure.pose;
  let next = 0;
  const add = function (start, end, radius) { writeFigureCapsule(figure, next++, start, end, radius); };

  const legs = [];
  let lowestFoot = 0;
  for (let side = -1; side <= 1; side += 2) {
    const swing = pose.legSwing * (side < 0 ? 1 : -1);
    const bend = pose.kneeBend + Math.max(0, -swing) * 0.7;
    const hip = [side * body.hipWidth / 2, 0, 0];
    const knee = [hip[0], -Math.cos(swing) * body.thigh, Math.sin(swing) * body.thigh];
    const shinAngle = swing - bend;
    const ankle = [knee[0], knee[1] - Math.cos(shinAngle) * body.shin, knee[2] + Math.sin(shinAngle) * body.shin];
    lowestFoot = Math.min(lowestFoot, ankle[1]);
    legs.push({ hip: hip, knee: knee, ankle: ankle });
  }
  const pelvisHeight = -lowestFoot + 0.07;
  for (const leg of legs) { leg.hip[1] += pelvisHeight; leg.knee[1] += pelvisHeight; leg.ankle[1] += pelvisHeight; }

  const pelvis = [0, pelvisHeight, 0];
  const waist = [0, pelvisHeight + Math.cos(pose.lean) * body.torsoLength * 0.45, Math.sin(pose.lean) * body.torsoLength * 0.45];
  const chest = [0, pelvisHeight + Math.cos(pose.lean) * body.torsoLength, Math.sin(pose.lean) * body.torsoLength];
  const neckLean = pose.lean * 1.5;
  const neckDirection = [Math.sin(pose.headTilt), Math.cos(neckLean) * Math.cos(pose.headTilt), Math.sin(neckLean)];
  const headBase = addLocalPoints(chest, neckDirection, body.neckLength + body.headRadius);
  const headTop = addLocalPoints(headBase, neckDirection, body.headLength);
  add(pelvis, waist, body.torsoRadius * 0.9);
  add(waist, chest, body.torsoRadius * 1.1);
  add(chest, headBase, body.limbRadius);
  add(headBase, headTop, body.headRadius);
  figure.headHeight = (headBase[1] + headTop[1]) / 2;

  const shoulderLeft = [-body.shoulderWidth / 2, chest[1] - 0.03, chest[2]];
  const shoulderRight = [body.shoulderWidth / 2, chest[1] - 0.03, chest[2]];
  add(shoulderLeft, shoulderRight, body.limbRadius * 1.3);
  add(legs[0].hip, legs[1].hip, body.legRadius);

  for (let side = -1; side <= 1; side += 2) {
    const shoulder = side < 0 ? shoulderLeft : shoulderRight;
    const armAngle = pose.armRaise + pose.lean * 0.4 + pose.armSwing * (side < 0 ? -1 : 1);
    const elbow = [shoulder[0], shoulder[1] - Math.cos(armAngle) * body.upperArm, shoulder[2] + Math.sin(armAngle) * body.upperArm];
    const foreArmAngle = armAngle + pose.elbowBend;
    const wrist = [elbow[0], elbow[1] - Math.cos(foreArmAngle) * body.foreArm, elbow[2] + Math.sin(foreArmAngle) * body.foreArm];
    const hand = [wrist[0], wrist[1] - Math.cos(foreArmAngle) * body.handLength, wrist[2] + Math.sin(foreArmAngle) * body.handLength];
    add(shoulder, elbow, body.limbRadius);
    add(elbow, wrist, body.limbRadius * 0.9);
    add(wrist, hand, body.limbRadius * 1.15);
    add(shoulder, shoulder, body.jointRadius);
    add(elbow, elbow, body.jointRadius * 0.85);
  }
  for (const leg of legs) {
    add(leg.hip, leg.knee, body.legRadius);
    add(leg.knee, leg.ankle, body.legRadius * 0.85);
    add(leg.ankle, [leg.ankle[0], 0.04, leg.ankle[2] + body.footLength], 0.04);
    add(leg.knee, leg.knee, body.jointRadius);
  }
  figure.capsuleCount = next;
  return headTop[1] + body.headRadius;
}

function updateFigureCapsules(figure) {
  const topHeight = figure.proportions.kind === 'hollow' ? buildHollowCapsules(figure) : buildDummyCapsules(figure);

  // The body is built standing at height 0; lift or lower it onto the floor it is really on.
  const capsules = figure.capsules;
  figure.y = getFloorHeightAt(figure.x, figure.z);
  if (figure.y !== 0) {
    for (let capsuleIndex = 0; capsuleIndex < figure.capsuleCount; capsuleIndex++) {
      capsules[capsuleIndex * FIGURE_CAPSULE_STRIDE + 1] += figure.y;
      capsules[capsuleIndex * FIGURE_CAPSULE_STRIDE + 4] += figure.y;
    }
  }

  // Bounding sphere for quick rejection in the ray caster.
  figure.boundsCenterY = figure.y + topHeight / 2;
  let largestDistanceSquared = 0;
  for (let capsuleIndex = 0; capsuleIndex < figure.capsuleCount; capsuleIndex++) {
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

// Height of the head above the lift's floor level (not above the figure's own feet).
// How high the top of the Hollow's body would be, standing on flat ground, with a given stretch and stoop and
// otherwise posed as `figure` is now. Worked out on a spare body, so `figure` itself is not touched.
let hollowFittingFigure = null;
function measureHollowTop(figure, stretch, stoop, crawl) {
  if (!hollowFittingFigure) hollowFittingFigure = createFigure(figure.proportions, figure.surfaceClass, figure.imprintTuningKey);
  const spare = hollowFittingFigure;
  spare.proportions = figure.proportions;
  Object.assign(spare.pose, figure.pose);
  spare.pose.stretch = stretch; spare.pose.stoop = stoop; spare.pose.crawl = crawl || 0;
  spare.pose.legSwing = 0; // or the answer would bob up and down with every step
  spare.x = 0; spare.z = 0; spare.yaw = 0;
  buildHollowCapsules(spare);
  let top = 0;
  for (let capsuleIndex = 0; capsuleIndex < spare.capsuleCount; capsuleIndex++) {
    const offset = capsuleIndex * FIGURE_CAPSULE_STRIDE, radius = spare.capsules[offset + 6];
    top = Math.max(top, spare.capsules[offset + 1] + radius, spare.capsules[offset + 4] + radius);
  }
  return top;
}

// Decides how the Hollow must hold itself to fit under a ceiling `headroom` metres above its feet:
// as drawn up as it wants to be if there is room, less so if not, stooping if it is too tall even hunched,
// and down on knees and hands if stooping is not enough (a vent).
// The heights come from the body itself, so this stays right whatever FIGURE_PROPORTIONS_HOLLOW is changed to.
// `gap` is how far below the ceiling the top of it must stay. Returns the same object every time: { stretch, stoop, crawl }.
const hollowFit = { stretch: 0, stoop: 0, crawl: 0 };
function fitHollowUnderCeiling(figure, headroom, wantedStretch, gap) {
  const limit = headroom - gap;
  hollowFit.stretch = wantedStretch; hollowFit.stoop = 0; hollowFit.crawl = 0;
  if (measureHollowTop(figure, wantedStretch, 0) <= limit) return hollowFit;
  if (measureHollowTop(figure, 0, 0) <= limit) {
    // Somewhere between hunched and what it wanted: close in on the most that fits.
    let low = 0, high = wantedStretch;
    for (let step = 0; step < 6; step++) {
      const middle = (low + high) / 2;
      if (measureHollowTop(figure, middle, 0) <= limit) low = middle; else high = middle;
    }
    hollowFit.stretch = low;
    return hollowFit;
  }
  // Too tall even hunched: stoop as little as will do.
  hollowFit.stretch = 0;
  if (measureHollowTop(figure, 0, 1) <= limit) {
    let low = 0, high = 1;
    for (let step = 0; step < 6; step++) {
      const middle = (low + high) / 2;
      if (measureHollowTop(figure, 0, middle) <= limit) high = middle; else low = middle;
    }
    hollowFit.stoop = high;
    return hollowFit;
  }
  // Too low even for that: down on knees and hands, as far as it takes. Crawling it only needs a finger's
  // width over its back, whatever gap it keeps when it is on its feet.
  const crawlLimit = headroom - Math.min(gap, 0.05);
  let low = 0, high = 1;
  for (let step = 0; step < 6; step++) {
    const middle = (low + high) / 2;
    if (measureHollowTop(figure, 0, 0, middle) <= crawlLimit) high = middle; else low = middle;
  }
  hollowFit.crawl = high;
  return hollowFit;
}

function getFigureHeadHeight(figure) {
  return figure.y + figure.headHeight;
}

// Sprays points straight onto a figure's surface. Used for the moment it reaches you.
function emitFigureRevealPoints(figure, pointCount, surfaceClass, lifeCode) {
  const capsules = figure.capsules;
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    const offset = Math.floor(Math.random() * figure.capsuleCount) * FIGURE_CAPSULE_STRIDE;
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
