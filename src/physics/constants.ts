/**
 * Physics constants
 * Based on linuxdoom-1.10/p_local.h and p_mobj.c
 */

import { FRACUNIT } from '../core/fixed';

// Player constants
export const VIEWHEIGHT = 41 * FRACUNIT; // View height above floor (41 units)
export const MAXMOVE = 30 * FRACUNIT; // Max movement per frame (30 units)
export const MAXBOB = 0x100000; // Max view bobbing (16 pixels)

// Physics constants
export const GRAVITY = FRACUNIT; // Gravity acceleration (1.0 per tick)
export const FRICTION = 0xe800; // Friction multiplier
export const STOPSPEED = 0x1000; // Speed below which object stops

// Player dimensions
export const PLAYERRADIUS = 16 * FRACUNIT; // Player collision radius (16 units)
export const PLAYERHEIGHT = 56 * FRACUNIT; // Player height (56 units)

// Step heights
export const MAXSTEPHEIGHT = 24 * FRACUNIT; // Max height player can step up (24 units)
export const MAXDROPOFF = 24 * FRACUNIT; // Max height player can drop (24 units)

// Movement speeds (multiplied by cmd value)
export const FORWARDMOVE_SPEED = 2048; // Forward/backward speed multiplier
export const SIDEMOVE_SPEED = 2048; // Strafe speed multiplier
