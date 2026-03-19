/**
 * Collision detection with floor/ceiling height tracking
 * Prevents walking through walls and handles step height
 */

import type { Mobj } from '../game/mobj';
import { MobjFlags } from '../game/mobj';
import type { MapData } from '../level/types';
import { findSectorAtPoint } from '../level';
import type { Fixed } from '../core';
import { FixedToFloat, FloatToFixed } from '../core/fixed';
import { ML_BLOCKING, ML_TWOSIDED } from '../level/types';
import { MAXSTEPHEIGHT } from './constants';

// Maximum step height in DOOM units
const MAX_STEP_HEIGHT = FixedToFloat(MAXSTEPHEIGHT);

/** Squared distance from (px,py) to the closest point on segment (x1,y1)-(x2,y2). */
function distancePointToSegmentSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const lx = x2 - x1;
  const ly = y2 - y1;
  const lenSq = lx * lx + ly * ly;
  if (lenSq === 0) {
    const dx = px - x1;
    const dy = py - y1;
    return dx * dx + dy * dy;
  }
  let t = ((px - x1) * lx + (py - y1) * ly) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * lx;
  const cy = y1 + t * ly;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

/**
 * If already penetrating geometry, still allow moves that move *out* (or tangent), so the player
 * cannot get permanently stuck inside a wall or inside another SOLID mobj.
 */
const UNSTUCK_EPS_SQ = 1e-4;

interface LineOpening {
  openTop: number;
  openBottom: number;
}

function getLineOpening(linedef: MapData['linedefs'][number], mapData: MapData): LineOpening | null {
  const frontSide = linedef.sidenum[0];
  const backSide = linedef.sidenum[1];
  if (frontSide === -1 || backSide === -1) {
    return null;
  }

  const frontSector = mapData.sectors[mapData.sidedefs[frontSide].sector];
  const backSector = mapData.sectors[mapData.sidedefs[backSide].sector];
  if (!frontSector || !backSector) {
    return null;
  }

  return {
    openTop: Math.min(frontSector.ceilingheight, backSector.ceilingheight),
    openBottom: Math.max(frontSector.floorheight, backSector.floorheight),
  };
}

function canFitThroughLine(mobj: Mobj, linedef: MapData['linedefs'][number], mapData: MapData): boolean {
  const opening = getLineOpening(linedef, mapData);
  if (!opening) {
    return false;
  }

  const currentZ = FixedToFloat(mobj.z);
  const thingHeight = FixedToFloat(mobj.height);

  if (opening.openTop - opening.openBottom < thingHeight) {
    return false;
  }

  if (opening.openTop - currentZ < thingHeight) {
    return false;
  }

  if (opening.openBottom - currentZ > MAX_STEP_HEIGHT) {
    return false;
  }

  return true;
}

function wallSegmentBlocksMove(
  oldX: number,
  oldY: number,
  newX: number,
  newY: number,
  radius: number,
  linedef: MapData['linedefs'][number],
  mapData: MapData
): boolean {
  const v1 = mapData.vertexes[linedef.v1];
  const v2 = mapData.vertexes[linedef.v2];
  const radiusSq = radius * radius;
  const newDistSq = distancePointToSegmentSq(newX, newY, v1.x, v1.y, v2.x, v2.y);
  const oldDistSq = distancePointToSegmentSq(oldX, oldY, v1.x, v1.y, v2.x, v2.y);

  const penetratingNew = newDistSq < radiusSq;
  if (!penetratingNew) {
    return false;
  }

  const penetratingOld = oldDistSq < radiusSq;
  if (!penetratingOld) {
    return true; // entering solid from a valid position — block
  }
  // Already overlapping: only block if pushing further into the wall
  if (newDistSq < oldDistSq - UNSTUCK_EPS_SQ) {
    return true;
  }
  return false;
}

/**
 * Check if new position collides with walls
 * Returns true if movement is allowed, false if blocked
 */
export function checkWallCollision(mobj: Mobj, newX: Fixed, newY: Fixed, mapData: MapData): boolean {
  if (mobj.flags & MobjFlags.NOCLIP) {
    return true;
  }

  const x = FixedToFloat(newX);
  const y = FixedToFloat(newY);
  const oldX = FixedToFloat(mobj.x);
  const oldY = FixedToFloat(mobj.y);
  const radius = FixedToFloat(mobj.radius);

  for (const linedef of mapData.linedefs) {
    const blocking = (linedef.flags & ML_BLOCKING) !== 0;
    const twoSided = (linedef.flags & ML_TWOSIDED) !== 0;

    if (!twoSided || blocking) {
      if (wallSegmentBlocksMove(oldX, oldY, x, y, radius, linedef, mapData)) {
        return false;
      }
    } else {
      if (canFitThroughLine(mobj, linedef, mapData)) {
        continue;
      }
      if (wallSegmentBlocksMove(oldX, oldY, x, y, radius, linedef, mapData)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Check if new position collides with any SOLID mobj (barrels, pillars, etc.)
 * Returns true if no mobj collision, false if blocked.
 */
function checkMobjCollision(mobj: Mobj, newX: Fixed, newY: Fixed, otherMobjs: Mobj[]): boolean {
  if (mobj.flags & MobjFlags.NOCLIP) {
    return true;
  }

  const x = FixedToFloat(newX);
  const y = FixedToFloat(newY);
  const oldX = FixedToFloat(mobj.x);
  const oldY = FixedToFloat(mobj.y);
  const radius = FixedToFloat(mobj.radius);

  for (const other of otherMobjs) {
    if (other === mobj || other.removed) continue;
    if (!(other.flags & MobjFlags.SOLID)) continue;

    const ox = FixedToFloat(other.x);
    const oy = FixedToFloat(other.y);
    const orad = FixedToFloat(other.radius);
    const minDist = radius + orad;
    const minDistSq = minDist * minDist;

    const dxNew = x - ox;
    const dyNew = y - oy;
    const distSqNew = dxNew * dxNew + dyNew * dyNew;
    if (distSqNew >= minDistSq) {
      continue;
    }

    const dxOld = oldX - ox;
    const dyOld = oldY - oy;
    const distSqOld = dxOld * dxOld + dyOld * dyOld;
    if (distSqOld >= minDistSq) {
      return false;
    }
    if (distSqNew < distSqOld - UNSTUCK_EPS_SQ) {
      return false;
    }
  }
  return true;
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
    mobj.sectorIndex = sectorIdx;
  }
}

/**
 * Apply collision detection to movement
 * Modifies mobj position based on collision with walls and SOLID mobjs (barrels, etc.)
 * @param otherMobjs - Optional list of all mobjs for mobj-vs-mobj collision; when omitted only walls are checked.
 */
export function applyCollision(mobj: Mobj, mapData: MapData, otherMobjs: Mobj[] = []): void {
  const newX = mobj.x + mobj.momx;
  const newY = mobj.y + mobj.momy;

  const wallOk = checkWallCollision(mobj, newX, newY, mapData);
  const mobjOk = checkMobjCollision(mobj, newX, newY, otherMobjs);

  if (wallOk && mobjOk) {
    mobj.x = newX;
    mobj.y = newY;
    updateFloorCeiling(mobj, mapData);

    const newFloorHeight = FixedToFloat(mobj.floorz);
    const currentZ = FixedToFloat(mobj.z);
    const stepHeight = newFloorHeight - currentZ;

    if (stepHeight > 0 && stepHeight <= MAX_STEP_HEIGHT) {
      mobj.z = mobj.floorz;
    } else if (stepHeight > MAX_STEP_HEIGHT) {
      mobj.x -= mobj.momx;
      mobj.y -= mobj.momy;
      mobj.momx = 0;
      mobj.momy = 0;
      updateFloorCeiling(mobj, mapData);
      return;
    }
  } else {
    const newX_only = mobj.x + mobj.momx;
    const newY_only = mobj.y + mobj.momy;
    let moved = false;
    if (checkWallCollision(mobj, newX_only, mobj.y, mapData) && checkMobjCollision(mobj, newX_only, mobj.y, otherMobjs)) {
      mobj.x = newX_only;
      updateFloorCeiling(mobj, mapData);
      moved = true;
    }
    if (checkWallCollision(mobj, mobj.x, newY_only, mapData) && checkMobjCollision(mobj, mobj.x, newY_only, otherMobjs)) {
      mobj.y = newY_only;
      updateFloorCeiling(mobj, mapData);
      moved = true;
    }
    if (!moved) {
      mobj.momx = 0;
      mobj.momy = 0;
    }
  }
}
