/**
 * Player movement physics
 * Based on linuxdoom-1.10/p_user.c and p_mobj.c
 */

import type { Mobj } from '../game/mobj';
import type { TicCmd } from '../input';
import type { Fixed, Angle } from '../core';
import { FixedMul, FRACUNIT } from '../core/fixed';
import { FineSine, FineCosine, ANGLETOFINESHIFT, ANG90 } from '../core/tables';
import {
  VIEWHEIGHT,
  MAXBOB,
  GRAVITY,
  FRICTION,
  STOPSPEED,
  FORWARDMOVE_SPEED,
  SIDEMOVE_SPEED,
} from './constants';

/**
 * Apply thrust to mobj in given direction
 * Based on P_Thrust from p_user.c
 */
export function applyThrust(mobj: Mobj, angle: Angle, move: Fixed): void {
  const fineAngle = angle >> ANGLETOFINESHIFT;

  mobj.momx += FixedMul(move, FineCosine(angle));
  mobj.momy += FixedMul(move, FineSine(angle));
}

/**
 * Move player based on input command
 * Based on P_MovePlayer from p_user.c
 */
export function movePlayer(mobj: Mobj, cmd: TicCmd): void {
  // Update angle (angleturn is in BAM units already, don't shift)
  // DOOM shifts by 16 because ticcmd stores a smaller value
  // We're passing larger values, so reduce the shift
  mobj.angle = (mobj.angle + (cmd.angleturn << 16)) >>> 0; // Keep as unsigned 32-bit

  // Check if on ground
  const onground = mobj.z <= mobj.floorz;

  // Forward/backward movement
  if (cmd.forwardmove && onground) {
    applyThrust(mobj, mobj.angle, cmd.forwardmove * FORWARDMOVE_SPEED);
  }

  // Strafe movement
  if (cmd.sidemove && onground) {
    applyThrust(mobj, mobj.angle - ANG90, cmd.sidemove * SIDEMOVE_SPEED);
  }
}

/**
 * Apply friction to X/Y momentum
 * Based on P_XYMovement from p_mobj.c
 */
export function applyFriction(mobj: Mobj): void {
  // If no momentum, nothing to do
  if (mobj.momx === 0 && mobj.momy === 0) {
    return;
  }

  // Check if on ground
  const onground = mobj.z <= mobj.floorz;

  if (onground) {
    // Apply friction
    mobj.momx = FixedMul(mobj.momx, FRICTION);
    mobj.momy = FixedMul(mobj.momy, FRICTION);

    // Stop if below threshold
    if (Math.abs(mobj.momx) < STOPSPEED) {
      mobj.momx = 0;
    }
    if (Math.abs(mobj.momy) < STOPSPEED) {
      mobj.momy = 0;
    }
  }
}

/**
 * Apply gravity to Z momentum
 */
export function applyGravity(mobj: Mobj): void {
  // Don't apply gravity if flag is set
  if (mobj.flags & 0x200 /* MF_NOGRAVITY */) {
    return;
  }

  // Don't apply gravity if on ground
  if (mobj.z <= mobj.floorz) {
    mobj.momz = 0;
    return;
  }

  // Apply gravity
  mobj.momz -= GRAVITY;
}

/**
 * Apply Z momentum (vertical movement)
 * Based on P_ZMovement from p_mobj.c
 */
export function applyZMomentum(mobj: Mobj): void {
  // Apply Z movement
  mobj.z += mobj.momz;

  // Clamp to floor/ceiling
  if (mobj.z < mobj.floorz) {
    mobj.z = mobj.floorz;
    mobj.momz = 0;
  }

  if (mobj.z + mobj.height > mobj.ceilingz) {
    mobj.z = mobj.ceilingz - mobj.height;
    mobj.momz = 0;
  }
}

/**
 * Calculate view bobbing
 * Based on P_CalcHeight from p_user.c
 */
export function calculateViewBob(mobj: Mobj): Fixed {
  if (!mobj.player) return 0;

  // Calculate bob from momentum
  let bob = FixedMul(mobj.momx, mobj.momx) + FixedMul(mobj.momy, mobj.momy);
  bob >>= 2;

  if (bob > MAXBOB) {
    bob = MAXBOB;
  }

  mobj.player.bob = bob;

  // For now, return simple bob value
  // TODO: Add sine wave bobbing based on leveltime
  return bob >> 1;
}

/**
 * Calculate player view height with bobbing
 */
export function calculateViewZ(mobj: Mobj): Fixed {
  if (!mobj.player) return mobj.z + VIEWHEIGHT;

  const bob = calculateViewBob(mobj);
  let viewz = mobj.z + mobj.player.viewheight + bob;

  // Clamp to ceiling
  if (viewz > mobj.ceilingz - 4 * FRACUNIT) {
    viewz = mobj.ceilingz - 4 * FRACUNIT;
  }

  return viewz;
}
