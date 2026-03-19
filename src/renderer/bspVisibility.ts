/**
 * Simplified R_CheckBBox (linuxdoom-1.10/r_bsp.c) for WebGL culling.
 * Uses ~90° horizontal FOV like vanilla SCREENWIDTH scaling.
 */

import { pointToAngleBam } from '../core/coordinates';

const HALF_FOV_RAD = Math.PI / 4 + 0.12;

function normalizeRad(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * bbox order from WAD / MapParser: [BOXTOP, BOXBOTTOM, BOXLEFT, BOXRIGHT]
 * (linuxdoom m_bbox.h indices 0..3).
 */
export function checkBBoxMightBeVisible(
  viewX: number,
  viewY: number,
  viewAngleBam: number,
  bbox: readonly [number, number, number, number]
): boolean {
  const top = bbox[0];
  const bottom = bbox[1];
  const left = bbox[2];
  const right = bbox[3];

  if (viewX >= left && viewX <= right && viewY >= bottom && viewY <= top) {
    return true;
  }

  const viewRad = ((viewAngleBam >>> 0) * 2 * Math.PI) / 0x100000000;
  const corners: [number, number][] = [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ];

  let minA = Infinity;
  let maxA = -Infinity;

  for (const [cx, cy] of corners) {
    const ang = pointToAngleBam(viewX, viewY, cx, cy);
    const rad = ((ang >>> 0) * 2 * Math.PI) / 0x100000000;
    const rel = normalizeRad(rad - viewRad);
    minA = Math.min(minA, rel);
    maxA = Math.max(maxA, rel);
  }

  if (maxA - minA >= Math.PI - 0.02) {
    return true;
  }

  return !(maxA < -HALF_FOV_RAD || minA > HALF_FOV_RAD);
}
