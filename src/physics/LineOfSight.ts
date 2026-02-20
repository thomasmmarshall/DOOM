/**
 * Line of Sight Checking
 * Determines if one entity can see another
 * Based on linuxdoom-1.10/p_sight.c
 */

import type { Mobj } from '../game/mobj';
import type { MapData } from '../level/types';
import { FixedToFloat } from '../core/fixed';
import { ML_TWOSIDED, ML_BLOCKING } from '../level/types';

/**
 * Check if there's line of sight between two mobjs
 * Uses simplified raycasting through map linedefs
 * @param source - Source mobj (e.g., enemy)
 * @param target - Target mobj (e.g., player)
 * @param mapData - Map data for line checking
 * @returns true if target is visible from source
 */
export function checkLineOfSight(
  source: Mobj,
  target: Mobj,
  mapData: MapData
): boolean {
  // Convert to float for easier calculation
  const x1 = FixedToFloat(source.x);
  const y1 = FixedToFloat(source.y);
  const z1 = FixedToFloat(source.z);

  const x2 = FixedToFloat(target.x);
  const y2 = FixedToFloat(target.y);
  const z2 = FixedToFloat(target.z);

  // Check if any solid linedef blocks the sight line
  for (const linedef of mapData.linedefs) {
    const v1 = mapData.vertexes[linedef.v1];
    const v2 = mapData.vertexes[linedef.v2];

    // Skip two-sided linedefs (they don't block sight)
    const twoSided = (linedef.flags & ML_TWOSIDED) !== 0;
    const blocking = (linedef.flags & ML_BLOCKING) !== 0;

    // One-sided walls always block sight
    if (!twoSided || blocking) {
      // Check if sight line intersects this linedef
      if (lineIntersectsLine(x1, y1, x2, y2, v1.x, v1.y, v2.x, v2.y)) {
        // Check height - can we see over/under the wall?
        const frontSide = linedef.sidenum[0];
        if (frontSide !== -1) {
          const sector = mapData.sectors[mapData.sidedefs[frontSide].sector];

          // Simple height check - if target is within floor/ceiling range
          if (z1 >= sector.floorheight && z1 <= sector.ceilingheight &&
              z2 >= sector.floorheight && z2 <= sector.ceilingheight) {
            return false; // Blocked by wall
          }
        }
      }
    }
  }

  return true; // Line of sight is clear
}

/**
 * Check if line segment (x1,y1)-(x2,y2) intersects line segment (x3,y3)-(x4,y4)
 */
function lineIntersectsLine(
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  x4: number, y4: number
): boolean {
  // Calculate determinants
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  if (Math.abs(denom) < 0.0001) {
    return false; // Parallel lines
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  // Check if intersection point is within both line segments
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Get distance between two mobjs (2D only)
 */
export function getDistance2D(mobj1: Mobj, mobj2: Mobj): number {
  const dx = FixedToFloat(mobj1.x - mobj2.x);
  const dy = FixedToFloat(mobj1.y - mobj2.y);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get 3D distance between two mobjs
 */
export function getDistance3D(mobj1: Mobj, mobj2: Mobj): number {
  const dx = FixedToFloat(mobj1.x - mobj2.x);
  const dy = FixedToFloat(mobj1.y - mobj2.y);
  const dz = FixedToFloat(mobj1.z - mobj2.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
