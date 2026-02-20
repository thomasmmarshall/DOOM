/**
 * Collision detection with floor/ceiling height tracking
 * Prevents walking through walls and handles step height
 */

import type { Mobj } from '../game/mobj';
import type { MapData } from '../level/types';
import type { Fixed } from '../core';
import { FixedToFloat, FloatToFixed } from '../core/fixed';
import { ML_BLOCKING, ML_TWOSIDED } from '../level/types';

// Maximum step height in DOOM units
const MAX_STEP_HEIGHT = 24;

/**
 * Check if a circle intersects with a line segment
 */
function circleLineIntersection(
  cx: number, cy: number, radius: number,
  x1: number, y1: number, x2: number, y2: number
): boolean {
  // Vector from line start to circle center
  const dx = cx - x1;
  const dy = cy - y1;

  // Line direction vector
  const lx = x2 - x1;
  const ly = y2 - y1;

  // Project circle center onto line
  const lineLength = Math.sqrt(lx * lx + ly * ly);
  if (lineLength === 0) return false;

  const t = Math.max(0, Math.min(1, (dx * lx + dy * ly) / (lineLength * lineLength)));

  // Closest point on line segment
  const closestX = x1 + t * lx;
  const closestY = y1 + t * ly;

  // Distance from circle center to closest point
  const distX = cx - closestX;
  const distY = cy - closestY;
  const distance = Math.sqrt(distX * distX + distY * distY);

  return distance < radius;
}

/**
 * Check if new position collides with walls
 * Returns true if movement is allowed, false if blocked
 */
export function checkWallCollision(
  mobj: Mobj,
  newX: Fixed,
  newY: Fixed,
  mapData: MapData
): boolean {
  // Convert to float for easier calculation
  const x = FixedToFloat(newX);
  const y = FixedToFloat(newY);
  const radius = FixedToFloat(mobj.radius);

  // Check against all linedefs
  for (const linedef of mapData.linedefs) {
    // Get vertices
    const v1 = mapData.vertexes[linedef.v1];
    const v2 = mapData.vertexes[linedef.v2];

    // Check if line is blocking
    const blocking = (linedef.flags & ML_BLOCKING) !== 0;
    const twoSided = (linedef.flags & ML_TWOSIDED) !== 0;

    // One-sided walls always block
    // Two-sided walls only block if ML_BLOCKING is set
    if (!twoSided || blocking) {
      // Check circle-line intersection
      if (circleLineIntersection(x, y, radius, v1.x, v1.y, v2.x, v2.y)) {
        return false; // Blocked
      }
    }
  }

  return true; // Movement allowed
}

/**
 * Find sector at given position using point-in-polygon test
 */
function findSectorAtPoint(x: number, y: number, mapData: MapData): number {
  // Try each sector to see if point is inside
  for (let sectorIdx = 0; sectorIdx < mapData.sectors.length; sectorIdx++) {
    // Find all linedefs that reference this sector
    const sectorLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

    for (let i = 0; i < mapData.linedefs.length; i++) {
      const linedef = mapData.linedefs[i];
      const frontSide = linedef.sidenum[0];
      const backSide = linedef.sidenum[1];

      // Check if this linedef's front or back side references our sector
      if (frontSide !== -1 && mapData.sidedefs[frontSide].sector === sectorIdx) {
        const v1 = mapData.vertexes[linedef.v1];
        const v2 = mapData.vertexes[linedef.v2];
        sectorLines.push({ x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y });
      } else if (backSide !== -1 && mapData.sidedefs[backSide].sector === sectorIdx) {
        const v1 = mapData.vertexes[linedef.v1];
        const v2 = mapData.vertexes[linedef.v2];
        sectorLines.push({ x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y });
      }
    }

    // Point-in-polygon test using ray casting algorithm
    if (sectorLines.length > 0) {
      let inside = false;
      for (const line of sectorLines) {
        if ((line.y1 > y) !== (line.y2 > y)) {
          const intersectX = (line.x2 - line.x1) * (y - line.y1) / (line.y2 - line.y1) + line.x1;
          if (x < intersectX) {
            inside = !inside;
          }
        }
      }

      if (inside) {
        return sectorIdx;
      }
    }
  }

  return -1; // Not in any sector
}

/**
 * Update floor and ceiling heights based on current position
 */
function updateFloorCeiling(mobj: Mobj, mapData: MapData): void {
  const x = FixedToFloat(mobj.x);
  const y = FixedToFloat(mobj.y);

  const sectorIdx = findSectorAtPoint(x, y, mapData);

  if (sectorIdx >= 0) {
    const sector = mapData.sectors[sectorIdx];
    mobj.floorz = FloatToFixed(sector.floorheight);
    mobj.ceilingz = FloatToFixed(sector.ceilingheight);
  }
}

/**
 * Apply collision detection to movement
 * Modifies mobj position based on collision
 */
export function applyCollision(mobj: Mobj, mapData: MapData): void {
  // Get new position
  const newX = mobj.x + mobj.momx;
  const newY = mobj.y + mobj.momy;

  // Check wall collision
  if (checkWallCollision(mobj, newX, newY, mapData)) {
    // No wall collision - apply full movement
    mobj.x = newX;
    mobj.y = newY;

    // Update floor/ceiling heights at new position
    updateFloorCeiling(mobj, mapData);

    // Check if we can step up to the new floor height
    const newFloorHeight = FixedToFloat(mobj.floorz);
    const currentZ = FixedToFloat(mobj.z);
    const stepHeight = newFloorHeight - currentZ;

    // If floor is higher but within step height, step up
    if (stepHeight > 0 && stepHeight <= MAX_STEP_HEIGHT) {
      mobj.z = mobj.floorz;
    }
    // If floor is lower, we'll fall (gravity handles this)
    else if (stepHeight <= 0) {
      // Moving onto lower floor or same height - allow it
    }
    // If step is too high, block movement
    else if (stepHeight > MAX_STEP_HEIGHT) {
      // Can't step up - revert position
      mobj.x -= mobj.momx;
      mobj.y -= mobj.momy;
      mobj.momx = 0;
      mobj.momy = 0;
      updateFloorCeiling(mobj, mapData);
      return;
    }
  } else {
    // Wall collision detected - try sliding along walls
    // Try X movement only
    const newX_only = mobj.x + mobj.momx;
    if (checkWallCollision(mobj, newX_only, mobj.y, mapData)) {
      mobj.x = newX_only;
      updateFloorCeiling(mobj, mapData);
    }

    // Try Y movement only
    const newY_only = mobj.y + mobj.momy;
    if (checkWallCollision(mobj, mobj.x, newY_only, mapData)) {
      mobj.y = newY_only;
      updateFloorCeiling(mobj, mapData);
    }

    // If both failed, stop movement
    if (!checkWallCollision(mobj, newX_only, mobj.y, mapData) &&
        !checkWallCollision(mobj, mobj.x, newY_only, mapData)) {
      mobj.momx = 0;
      mobj.momy = 0;
    }
  }
}
