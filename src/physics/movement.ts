/**
 * Player movement physics
 * Based on linuxdoom-1.10/p_user.c and p_mobj.c
 */

import type { Mobj } from '../game/mobj';
import { MobjFlags } from '../game/mobj';
import type { TicCmd } from '../input';
import type { Fixed, Angle } from '../core';
import { FixedMul, FRACUNIT } from '../core/fixed';
import { finesine, FineSine, FineCosine, ANG90, FINEANGLES, FINEMASK } from '../core/tables';
import {
  VIEWHEIGHT,
  MAXBOB,
  MAXMOVE,
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
  mobj.momx += FixedMul(move, FineCosine(angle));
  mobj.momy += FixedMul(move, FineSine(angle));
}

/**
 * Move player based on input command
 * Based on P_MovePlayer from p_user.c
 */
export function movePlayer(mobj: Mobj, cmd: TicCmd): void {
  mobj.angle = (mobj.angle + (cmd.angleturn << 16)) >>> 0;

  const onground = mobj.z <= mobj.floorz;

  if (cmd.forwardmove && onground) {
    applyThrust(mobj, mobj.angle, cmd.forwardmove * FORWARDMOVE_SPEED);
  }

  if (cmd.sidemove && onground) {
    applyThrust(mobj, mobj.angle - ANG90, cmd.sidemove * SIDEMOVE_SPEED);
  }
}

/**
 * Clamp XY momentum to MAXMOVE (vanilla P_XYMovement does this before displacement).
 */
export function clampMomentum(mobj: Mobj): void {
  if (mobj.momx > MAXMOVE) mobj.momx = MAXMOVE;
  else if (mobj.momx < -MAXMOVE) mobj.momx = -MAXMOVE;
  if (mobj.momy > MAXMOVE) mobj.momy = MAXMOVE;
  else if (mobj.momy < -MAXMOVE) mobj.momy = -MAXMOVE;
}

/**
 * Apply friction to X/Y momentum
 * Based on P_XYMovement from p_mobj.c
 *
 * Vanilla behavior: if speed < STOPSPEED AND (not player OR no input), hard-stop.
 * Otherwise multiply by FRICTION.
 */
export function applyFriction(mobj: Mobj, cmd?: TicCmd): void {
  if (mobj.momx === 0 && mobj.momy === 0) {
    return;
  }

  const onground = mobj.z <= mobj.floorz;

  if (onground) {
    const isPlayer = !!(mobj.flags & MobjFlags.SLIDE);
    const hasInput = cmd ? (cmd.forwardmove !== 0 || cmd.sidemove !== 0) : false;

    if (Math.abs(mobj.momx) < STOPSPEED &&
        Math.abs(mobj.momy) < STOPSPEED &&
        (!isPlayer || !hasInput)) {
      mobj.momx = 0;
      mobj.momy = 0;
    } else {
      mobj.momx = FixedMul(mobj.momx, FRICTION);
      mobj.momy = FixedMul(mobj.momy, FRICTION);
    }
  }
}

/**
 * Apply gravity to Z momentum
 * Based on P_ZMovement from p_mobj.c
 *
 * Vanilla: if momz == 0 and airborne, set momz = -GRAVITY*2 (initial drop).
 * Otherwise subtract GRAVITY each tic.
 */
export function applyGravity(mobj: Mobj): void {
  if (mobj.flags & MobjFlags.NOGRAVITY) {
    return;
  }

  if (mobj.z <= mobj.floorz) {
    mobj.momz = 0;
    return;
  }

  if (mobj.momz === 0) {
    mobj.momz = -GRAVITY * 2;
  } else {
    mobj.momz -= GRAVITY;
  }
}

/**
 * Apply Z momentum (vertical movement)
 * Based on P_ZMovement from p_mobj.c
 */
export function applyZMomentum(mobj: Mobj): void {
  mobj.z += mobj.momz;

  if (mobj.z <= mobj.floorz) {
    mobj.z = mobj.floorz;

    if (mobj.momz < 0) {
      // Landing squat: vanilla sets deltaviewheight = momz >> 3
      if (mobj.player && mobj.momz < -8 * FRACUNIT) {
        mobj.player.deltaviewheight = mobj.momz >> 3;
      }
      mobj.momz = 0;
    }
  }

  if (mobj.z + mobj.height > mobj.ceilingz) {
    mobj.z = Math.max(mobj.floorz, mobj.ceilingz - mobj.height);
    if (mobj.momz > 0) {
      mobj.momz = 0;
    }
  }
}

/**
 * Calculate view bobbing and view height
 * Based on P_CalcHeight from p_user.c
 *
 * Vanilla uses finesine bob at (FINEANGLES/20 * leveltime) & FINEMASK
 */
export function calculateViewBob(mobj: Mobj, leveltime: number): Fixed {
  if (!mobj.player) return 0;

  let bob = FixedMul(mobj.momx, mobj.momx) + FixedMul(mobj.momy, mobj.momy);
  bob >>= 2;

  if (bob > MAXBOB) {
    bob = MAXBOB;
  }

  mobj.player.bob = bob;

  // Sine-wave bobbing indexed by leveltime, exactly as vanilla P_CalcHeight
  const angle = ((FINEANGLES / 20) * leveltime) & FINEMASK;
  const bobOffset = FixedMul(bob >> 1, finesine[angle]);

  return bobOffset;
}

/**
 * Update player viewheight each tic (vanilla P_CalcHeight rising/landing logic).
 */
export function updateViewHeight(mobj: Mobj): void {
  if (!mobj.player) return;

  const player = mobj.player;

  // Viewheight rises from 6*FRACUNIT on spawn to VIEWHEIGHT
  if (player.viewheight < VIEWHEIGHT) {
    player.viewheight += FRACUNIT;
    if (player.viewheight > VIEWHEIGHT) {
      player.viewheight = VIEWHEIGHT;
    }
  }

  // Apply landing squat via deltaviewheight
  if (player.deltaviewheight) {
    player.deltaviewheight += (FRACUNIT >> 2);
    if (player.deltaviewheight === 0) {
      player.deltaviewheight = 1;
    }
    player.viewheight += player.deltaviewheight;

    if (player.viewheight > VIEWHEIGHT) {
      player.viewheight = VIEWHEIGHT;
      player.deltaviewheight = 0;
    }
    if (player.viewheight < VIEWHEIGHT / 2) {
      player.viewheight = VIEWHEIGHT / 2;
      if (player.deltaviewheight <= 0) {
        player.deltaviewheight = 1;
      }
    }
  }
}

/**
 * Calculate player view height with bobbing
 */
export function calculateViewZ(mobj: Mobj, leveltime: number = 0): Fixed {
  if (!mobj.player) return mobj.z + VIEWHEIGHT;

  const bob = calculateViewBob(mobj, leveltime);
  let viewz = mobj.z + mobj.player.viewheight + bob;

  if (viewz > mobj.ceilingz - 4 * FRACUNIT) {
    viewz = mobj.ceilingz - 4 * FRACUNIT;
  }

  return viewz;
}
