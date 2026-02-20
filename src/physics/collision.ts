/**
 * Simple collision detection
 * Prevents walking through walls
 */

import type { Mobj } from '../game/mobj';
import type { MapData } from '../level/types';
import type { Fixed } from '../core';
import { FixedToFloat, FloatToFixed } from '../core/fixed';
import { ML_BLOCKING, ML_TWOSIDED } from '../level/types';

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
 * Apply collision detection to movement
 * Modifies mobj position based on collision
 */
export function applyCollision(mobj: Mobj, mapData: MapData): void {
  // Get new position
  const newX = mobj.x + mobj.momx;
  const newY = mobj.y + mobj.momy;

  // Check collision
  if (checkWallCollision(mobj, newX, newY, mapData)) {
    // No collision - apply full movement
    mobj.x = newX;
    mobj.y = newY;
  } else {
    // Collision detected - try sliding along walls
    // Try X movement only
    const newX_only = mobj.x + mobj.momx;
    if (checkWallCollision(mobj, newX_only, mobj.y, mapData)) {
      mobj.x = newX_only;
    }

    // Try Y movement only
    const newY_only = mobj.y + mobj.momy;
    if (checkWallCollision(mobj, mobj.x, newY_only, mapData)) {
      mobj.y = newY_only;
    }

    // If both failed, stop movement
    if (!checkWallCollision(mobj, newX_only, mobj.y, mapData) &&
        !checkWallCollision(mobj, mobj.x, newY_only, mapData)) {
      mobj.momx = 0;
      mobj.momy = 0;
    }
  }
}
