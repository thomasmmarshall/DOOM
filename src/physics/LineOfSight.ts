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
const EYE_HEIGHT = 40; // DOOM uses ~40 units for sight (view height)

export function checkLineOfSight(
  source: Mobj,
  target: Mobj,
  mapData: MapData
): boolean {
  const x1 = FixedToFloat(source.x);
  const y1 = FixedToFloat(source.y);
  const z1 = FixedToFloat(source.z) + EYE_HEIGHT;

  const x2 = FixedToFloat(target.x);
  const y2 = FixedToFloat(target.y);
  const z2 = FixedToFloat(target.z) + EYE_HEIGHT;

  const zMin = Math.min(z1, z2);
  const zMax = Math.max(z1, z2);

  for (const linedef of mapData.linedefs) {
    const v1 = mapData.vertexes[linedef.v1];
    const v2 = mapData.vertexes[linedef.v2];

    if (!lineIntersectsLine(x1, y1, x2, y2, v1.x, v1.y, v2.x, v2.y)) {
      continue;
    }

    const twoSided = (linedef.flags & ML_TWOSIDED) !== 0;
    const blocking = (linedef.flags & ML_BLOCKING) !== 0;
    const frontSide = linedef.sidenum[0];
    const backSide = linedef.sidenum[1];

    if (frontSide === -1) continue;

    const frontSector = mapData.sectors[mapData.sidedefs[frontSide].sector];
    const frontFloor = frontSector.floorheight;
    const frontCeiling = frontSector.ceilingheight;

    let openingBottom: number;
    let openingTop: number;

    if (!twoSided || backSide === -1) {
      // One-sided: wall extends from floor to ceiling
      openingBottom = frontFloor;
      openingTop = frontCeiling;
      // No opening - solid wall blocks if height overlaps sight
      if (openingTop > zMin && openingBottom < zMax) {
        return false;
      }
      continue;
    }

    if (blocking) {
      // Blocking two-sided: treat as solid
      openingBottom = frontFloor;
      openingTop = frontCeiling;
      if (openingTop > zMin && openingBottom < zMax) {
        return false;
      }
      continue;
    }

    // Two-sided non-blocking: opening is the passable gap
    const backSector = mapData.sectors[mapData.sidedefs[backSide].sector];
    openingBottom = Math.max(frontFloor, backSector.floorheight);
    openingTop = Math.min(frontCeiling, backSector.ceilingheight);

    if (openingTop <= openingBottom) {
      return false; // No opening - solid
    }
    if (openingTop <= zMin || openingBottom >= zMax) {
      return false; // Sight line doesn't pass through opening
    }
  }

  return true;
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
