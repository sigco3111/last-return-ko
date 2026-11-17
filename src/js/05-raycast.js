// ---------------------------------------------------------------------------
// Ray casting: what a single laser pulse hits, and how far away it is.
// The tile grid doubles as the acceleration structure (a 2D grid walk).
// ---------------------------------------------------------------------------

const rayHit = {
  distance: 0,
  surfaceClass: SURFACE_WALL,
  intensity: 0.5,
  objectId: 0,
  figure: null,
  looseObject: null, // the loose object the pulse stopped on, if it did (see 08-loose-objects.js)
  x: 0, y: 0, z: 0
};

let rayStampCounter = 1;

function intersectRayWithBox(prop, originX, originY, originZ, directionX, directionY, directionZ) {
  const offsetX = originX - prop.centerX, offsetZ = originZ - prop.centerZ;
  const localOriginX = offsetX * prop.cosineYaw + offsetZ * prop.sineYaw;
  const localOriginZ = -offsetX * prop.sineYaw + offsetZ * prop.cosineYaw;
  const localOriginY = originY - prop.centerY;
  const localDirectionX = directionX * prop.cosineYaw + directionZ * prop.sineYaw;
  const localDirectionZ = -directionX * prop.sineYaw + directionZ * prop.cosineYaw;
  let nearDistance = -Infinity, farDistance = Infinity;

  if (Math.abs(localDirectionX) < 1e-9) {
    if (localOriginX < -prop.halfX || localOriginX > prop.halfX) return -1;
  } else {
    let first = (-prop.halfX - localOriginX) / localDirectionX, second = (prop.halfX - localOriginX) / localDirectionX;
    if (first > second) { const swap = first; first = second; second = swap; }
    if (first > nearDistance) nearDistance = first;
    if (second < farDistance) farDistance = second;
  }
  if (Math.abs(directionY) < 1e-9) {
    if (localOriginY < -prop.halfY || localOriginY > prop.halfY) return -1;
  } else {
    let first = (-prop.halfY - localOriginY) / directionY, second = (prop.halfY - localOriginY) / directionY;
    if (first > second) { const swap = first; first = second; second = swap; }
    if (first > nearDistance) nearDistance = first;
    if (second < farDistance) farDistance = second;
  }
  if (Math.abs(localDirectionZ) < 1e-9) {
    if (localOriginZ < -prop.halfZ || localOriginZ > prop.halfZ) return -1;
  } else {
    let first = (-prop.halfZ - localOriginZ) / localDirectionZ, second = (prop.halfZ - localOriginZ) / localDirectionZ;
    if (first > second) { const swap = first; first = second; second = swap; }
    if (first > nearDistance) nearDistance = first;
    if (second < farDistance) farDistance = second;
  }
  if (nearDistance > farDistance || farDistance < 0) return -1;
  return nearDistance;
}

function intersectRayWithCylinder(prop, originX, originY, originZ, directionX, directionY, directionZ) {
  // Re-label the axes so the cylinder always runs along "axial".
  let originAxial, originU, originV, directionAxial, directionU, directionV;
  if (prop.axis === AXIS_Y) {
    originAxial = originY - prop.centerY; originU = originX - prop.centerX; originV = originZ - prop.centerZ;
    directionAxial = directionY; directionU = directionX; directionV = directionZ;
  } else if (prop.axis === AXIS_X) {
    originAxial = originX - prop.centerX; originU = originY - prop.centerY; originV = originZ - prop.centerZ;
    directionAxial = directionX; directionU = directionY; directionV = directionZ;
  } else {
    originAxial = originZ - prop.centerZ; originU = originX - prop.centerX; originV = originY - prop.centerY;
    directionAxial = directionZ; directionU = directionX; directionV = directionY;
  }
  let best = Infinity;
  const quadraticA = directionU * directionU + directionV * directionV;
  if (quadraticA > 1e-12) {
    const quadraticB = originU * directionU + originV * directionV;
    const quadraticC = originU * originU + originV * originV - prop.radius * prop.radius;
    const discriminant = quadraticB * quadraticB - quadraticA * quadraticC;
    if (discriminant < 0) return -1;
    const sideDistance = (-quadraticB - Math.sqrt(discriminant)) / quadraticA;
    if (sideDistance > 0) {
      const axial = originAxial + directionAxial * sideDistance;
      if (axial >= -prop.halfLength && axial <= prop.halfLength) best = sideDistance;
    }
  }
  if (Math.abs(directionAxial) > 1e-9) {
    const capOffset = directionAxial > 0 ? -prop.halfLength : prop.halfLength;
    const capDistance = (capOffset - originAxial) / directionAxial;
    if (capDistance > 0 && capDistance < best) {
      const capU = originU + directionU * capDistance, capV = originV + directionV * capDistance;
      if (capU * capU + capV * capV <= prop.radius * prop.radius) best = capDistance;
    }
  }
  return best === Infinity ? -1 : best;
}

function intersectRayWithSphere(centerX, centerY, centerZ, radius, originX, originY, originZ, directionX, directionY, directionZ) {
  const offsetX = originX - centerX, offsetY = originY - centerY, offsetZ = originZ - centerZ;
  const projection = offsetX * directionX + offsetY * directionY + offsetZ * directionZ;
  const discriminant = projection * projection - (offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ - radius * radius);
  if (discriminant < 0) return -1;
  return -projection - Math.sqrt(discriminant);
}

function intersectRayWithCapsule(capsules, offset, originX, originY, originZ, directionX, directionY, directionZ) {
  const startX = capsules[offset], startY = capsules[offset + 1], startZ = capsules[offset + 2];
  const endX = capsules[offset + 3], endY = capsules[offset + 4], endZ = capsules[offset + 5];
  const radius = capsules[offset + 6];
  const axisX = endX - startX, axisY = endY - startY, axisZ = endZ - startZ;
  const fromStartX = originX - startX, fromStartY = originY - startY, fromStartZ = originZ - startZ;
  const axisDotAxis = axisX * axisX + axisY * axisY + axisZ * axisZ;
  const axisDotDirection = axisX * directionX + axisY * directionY + axisZ * directionZ;
  const axisDotOffset = axisX * fromStartX + axisY * fromStartY + axisZ * fromStartZ;
  const directionDotOffset = directionX * fromStartX + directionY * fromStartY + directionZ * fromStartZ;
  const offsetDotOffset = fromStartX * fromStartX + fromStartY * fromStartY + fromStartZ * fromStartZ;
  const quadraticA = axisDotAxis - axisDotDirection * axisDotDirection;
  if (quadraticA < 1e-7) {
    // Ray runs along the capsule: only the rounded ends can be hit.
    const nearEnd = intersectRayWithSphere(startX, startY, startZ, radius, originX, originY, originZ, directionX, directionY, directionZ);
    const farEnd = intersectRayWithSphere(endX, endY, endZ, radius, originX, originY, originZ, directionX, directionY, directionZ);
    if (nearEnd > 0 && (farEnd <= 0 || nearEnd < farEnd)) return nearEnd;
    return farEnd;
  }
  let quadraticB = axisDotAxis * directionDotOffset - axisDotOffset * axisDotDirection;
  let quadraticC = axisDotAxis * offsetDotOffset - axisDotOffset * axisDotOffset - radius * radius * axisDotAxis;
  let discriminant = quadraticB * quadraticB - quadraticA * quadraticC;
  if (discriminant < 0) return -1;
  const bodyDistance = (-quadraticB - Math.sqrt(discriminant)) / quadraticA;
  const along = axisDotOffset + bodyDistance * axisDotDirection;
  if (along > 0 && along < axisDotAxis) return bodyDistance;
  const capX = along <= 0 ? fromStartX : originX - endX;
  const capY = along <= 0 ? fromStartY : originY - endY;
  const capZ = along <= 0 ? fromStartZ : originZ - endZ;
  quadraticB = directionX * capX + directionY * capY + directionZ * capZ;
  quadraticC = capX * capX + capY * capY + capZ * capZ - radius * radius;
  discriminant = quadraticB * quadraticB - quadraticC;
  if (discriminant > 0) return -quadraticB - Math.sqrt(discriminant);
  return -1;
}

// How strongly a surface reflects at a given spot. Seams, skirting and floor joints return
// less (or more) light, which is what makes a dense scan read as a real room.
function computeFloorIntensity(x, z) {
  const fractionX = x - Math.floor(x), fractionZ = z - Math.floor(z);
  if (fractionX < 0.035 || fractionZ < 0.035) return 0.12;
  return 0.52 + Math.random() * 0.2;
}

function computeWallIntensity(alongCoordinate, y) {
  if (y < 0.12) return 0.95;
  const seamHeight = y - Math.floor(y / 1.15) * 1.15;
  if (seamHeight < 0.035) return 0.15;
  const panel = alongCoordinate - Math.floor(alongCoordinate / 2) * 2;
  if (panel < 0.035) return 0.15;
  return 0.62 + Math.random() * 0.18;
}

function fillRayHit(distance, surfaceClass, intensity, objectId, originX, originY, originZ, directionX, directionY, directionZ) {
  rayHit.distance = distance;
  rayHit.surfaceClass = surfaceClass;
  rayHit.intensity = intensity;
  rayHit.objectId = objectId;
  rayHit.figure = null;
  rayHit.looseObject = null;
  rayHit.x = originX + directionX * distance;
  rayHit.y = originY + directionY * distance;
  rayHit.z = originZ + directionZ * distance;
  return rayHit.y > PIT_NO_RETURN_DEPTH;
}

// Casts one ray against rooms and props. Returns true and fills `rayHit` on a hit.
function castRayAgainstWorld(originX, originY, originZ, directionX, directionY, directionZ, maximumDistance) {
  let tileX = Math.floor(originX), tileZ = Math.floor(originZ);
  if (!isInsideGrid(tileX, tileZ) || tileIsOpen[tileZ * GRID_WIDTH + tileX] === 0) return false;
  const stamp = ++rayStampCounter;
  const stepX = directionX > 0 ? 1 : -1, stepZ = directionZ > 0 ? 1 : -1;
  const deltaX = directionX !== 0 ? Math.abs(1 / directionX) : Infinity;
  const deltaZ = directionZ !== 0 ? Math.abs(1 / directionZ) : Infinity;
  let nextCrossingX = directionX > 0 ? (tileX + 1 - originX) / directionX : (directionX < 0 ? (tileX - originX) / directionX : Infinity);
  let nextCrossingZ = directionZ > 0 ? (tileZ + 1 - originZ) / directionZ : (directionZ < 0 ? (tileZ - originZ) / directionZ : Infinity);
  let pendingPropDistance = Infinity, pendingProp = null;

  for (let iteration = 0; iteration < 400; iteration++) {
    const index = tileZ * GRID_WIDTH + tileX;
    const exitDistance = nextCrossingX < nextCrossingZ ? nextCrossingX : nextCrossingZ;

    const list = tilePropLists[index];
    if (list !== null) {
      for (let listIndex = 0; listIndex < list.length; listIndex++) {
        const prop = list[listIndex];
        if (prop.rayStamp === stamp) continue;
        prop.rayStamp = stamp;
        if (prop.isRemoved) continue;
        let distance;
        if (prop.kind === PROP_KIND_BOX) distance = intersectRayWithBox(prop, originX, originY, originZ, directionX, directionY, directionZ);
        else if (prop.kind === PROP_KIND_CYLINDER) distance = intersectRayWithCylinder(prop, originX, originY, originZ, directionX, directionY, directionZ);
        else distance = intersectRayWithSphere(prop.centerX, prop.centerY, prop.centerZ, prop.radius, originX, originY, originZ, directionX, directionY, directionZ);
        if (distance > 0.02 && distance < pendingPropDistance) { pendingPropDistance = distance; pendingProp = prop; }
      }
    }

    let surfaceDistance = Infinity, hitsFloor = false;
    if (directionY < 0) {
      const distance = (tileFloorHeight[index] - originY) / directionY;
      if (distance <= exitDistance) { surfaceDistance = distance; hitsFloor = true; }
    } else if (directionY > 0) {
      const distance = (tileCeilingHeight[index] - originY) / directionY;
      if (distance <= exitDistance) surfaceDistance = distance;
    }

    const limit = exitDistance < maximumDistance ? exitDistance : maximumDistance;
    if (pendingPropDistance <= limit && pendingPropDistance <= surfaceDistance) {
      const intensity = 0.62 + Math.random() * 0.22;
      return fillRayHit(pendingPropDistance, pendingProp.surfaceClass, intensity, pendingProp.objectId,
        originX, originY, originZ, directionX, directionY, directionZ);
    }
    if (surfaceDistance <= limit) {
      const hitX = originX + directionX * surfaceDistance, hitZ = originZ + directionZ * surfaceDistance;
      let surfaceClass = SURFACE_CEILING, intensity = 0.4 + Math.random() * 0.25;
      if (hitsFloor) {
        const flags = tileFlags[index];
        surfaceClass = SURFACE_FLOOR;
        intensity = computeFloorIntensity(hitX, hitZ);
        if (flags & TILE_FLAG_WATER) { surfaceClass = SURFACE_WATER; intensity = 0.35 + Math.random() * 0.5; }
        else if (flags & TILE_FLAG_HAZARD) {
          const stripe = (hitX + hitZ) * 1.6;
          if (stripe - Math.floor(stripe) < 0.5) { surfaceClass = SURFACE_HAZARD; intensity = 0.9; }
        } else if (flags & TILE_FLAG_GRATE) {
          const barX = hitX * 6 - Math.floor(hitX * 6), barZ = hitZ * 6 - Math.floor(hitZ * 6);
          surfaceClass = SURFACE_METAL;
          intensity = (barX < 0.3 || barZ < 0.3) ? 0.85 : 0.1;
        }
      } else {
        const gridX = hitX * 0.5 - Math.floor(hitX * 0.5), gridZ = hitZ * 0.5 - Math.floor(hitZ * 0.5);
        if (gridX < 0.02 || gridZ < 0.02) intensity = 0.1;
      }
      return fillRayHit(surfaceDistance, surfaceClass, intensity, 0, originX, originY, originZ, directionX, directionY, directionZ);
    }
    if (exitDistance >= maximumDistance) return false;

    // Step into the neighbouring tile and see whether there is a wall on the way.
    let wall;
    const previousIndex = index;
    if (nextCrossingX < nextCrossingZ) {
      tileX += stepX; nextCrossingX += deltaX; wall = stepX > 0 ? WALL_EAST : WALL_WEST;
    } else {
      tileZ += stepZ; nextCrossingZ += deltaZ; wall = stepZ > 0 ? WALL_SOUTH : WALL_NORTH;
    }
    const crossingY = originY + directionY * exitDistance;
    let isBlocked = !isInsideGrid(tileX, tileZ);
    if (!isBlocked) {
      const nextIndex = tileZ * GRID_WIDTH + tileX;
      isBlocked = tileIsOpen[nextIndex] === 0 || crossingY > tileCeilingHeight[nextIndex] || crossingY < tileFloorHeight[nextIndex];
    }
    if (isBlocked) {
      const alongCoordinate = (wall === WALL_NORTH || wall === WALL_SOUTH)
        ? originX + directionX * exitDistance : originZ + directionZ * exitDistance;
      let surfaceClass = SURFACE_WALL, intensity = computeWallIntensity(alongCoordinate, crossingY);
      const signs = tileSignLists[previousIndex];
      if (signs !== null && isWallHitOnSign(signs, wall, alongCoordinate, crossingY)) { surfaceClass = SURFACE_SIGN; intensity = 1; }
      return fillRayHit(exitDistance, surfaceClass, intensity, 0, originX, originY, originZ, directionX, directionY, directionZ);
    }
  }
  return false;
}

// What a ray meets that is not the station itself: a creature, or a loose object. Returns true and fills
// `rayHit` if there is one nearer than `nearerThan`; otherwise returns false and leaves `rayHit` as it was.
function castRayAgainstThings(originX, originY, originZ, directionX, directionY, directionZ, nearerThan) {
  let bestDistance = nearerThan;
  let bestFigure = null;
  for (let figureIndex = 0; figureIndex < raycastableFigures.length; figureIndex++) {
    const figure = raycastableFigures[figureIndex];
    const toCenterX = figure.x - originX, toCenterY = figure.boundsCenterY - originY, toCenterZ = figure.z - originZ;
    const projection = toCenterX * directionX + toCenterY * directionY + toCenterZ * directionZ;
    if (projection < -figure.boundsRadius || projection - figure.boundsRadius > bestDistance) continue;
    const perpendicularSquared = toCenterX * toCenterX + toCenterY * toCenterY + toCenterZ * toCenterZ - projection * projection;
    if (perpendicularSquared > figure.boundsRadius * figure.boundsRadius) continue;
    for (let capsuleIndex = 0; capsuleIndex < figure.capsuleCount; capsuleIndex++) {
      const distance = intersectRayWithCapsule(figure.capsules, capsuleIndex * FIGURE_CAPSULE_STRIDE,
        originX, originY, originZ, directionX, directionY, directionZ);
      if (distance > 0.05 && distance < bestDistance) { bestDistance = distance; bestFigure = figure; }
    }
  }
  // Anything loose in the way: what lies on a shelf or on the floor, and what the scanner's beam is carrying.
  const looseObject = looseObjects.length > 0
    ? findLooseObjectOnRay(originX, originY, originZ, directionX, directionY, directionZ, bestDistance) : null;
  if (looseObject !== null) {
    // What is loud to kick shows in the warning colour, like broken glass on the floor; the rest as things you can take.
    fillRayHit(looseRayDistance, isLooseObjectLoudToTouch(looseObject) ? SURFACE_HAZARD : SURFACE_INTERACTIVE, 0.6 + Math.random() * 0.3, 0,
      originX, originY, originZ, directionX, directionY, directionZ);
    rayHit.looseObject = looseObject;
    return true;
  }
  if (bestFigure !== null) {
    fillRayHit(bestDistance, bestFigure.surfaceClass, 0.6 + Math.random() * 0.4, 0,
      originX, originY, originZ, directionX, directionY, directionZ);
    rayHit.figure = bestFigure;
    return true;
  }
  return false;
}

// The full scanner pulse from one point: rooms, props and anything standing in them.
function castScannerRay(originX, originY, originZ, directionX, directionY, directionZ, maximumDistance) {
  const hitWorld = castRayAgainstWorld(originX, originY, originZ, directionX, directionY, directionZ, maximumDistance);
  if (castRayAgainstThings(originX, originY, originZ, directionX, directionY, directionZ, hitWorld ? rayHit.distance : maximumDistance)) return true;
  return hitWorld;
}
