/**
 * Map Object (mobj) - represents all game entities
 * Based on linuxdoom-1.10/p_mobj.h
 */

import type { Fixed, Angle } from '../core';

/**
 * Map object flags
 */
export enum MobjFlags {
  SPECIAL = 0x1, // Call P_SpecialThing when touched
  SOLID = 0x2, // Blocks movement
  SHOOTABLE = 0x4, // Can be hit by gunfire
  NOSECTOR = 0x8, // Don't use sector links
  NOBLOCKMAP = 0x10, // Don't use blockmap links
  AMBUSH = 0x20, // Not activated by sound (deaf monster)
  JUSTHIT = 0x40, // Will attack right back
  JUSTATTACKED = 0x80, // Take one step before attacking
  SPAWNCEILING = 0x100, // Hang from ceiling
  NOGRAVITY = 0x200, // Don't apply gravity
  DROPOFF = 0x400, // Can jump from high places
  PICKUP = 0x800, // Player can pick up items
  NOCLIP = 0x1000, // No collision (cheat)
  SLIDE = 0x2000, // Keep info about sliding along walls
  FLOAT = 0x4000, // Active floater (cacodemon, pain elemental)
  TELEPORT = 0x8000, // Don't cross lines on teleport
  MISSILE = 0x10000, // Projectile (rocket, plasma, etc.)
  DROPPED = 0x20000, // Dropped by demon (not level spawned)
  SHADOW = 0x40000, // Fuzzy draw (spectre, invisibility)
  NOBLOOD = 0x80000, // Don't bleed when shot
  CORPSE = 0x100000, // Don't stop halfway off step
  INFLOAT = 0x200000, // Floating to height
  COUNTKILL = 0x400000, // Count towards kill total
  COUNTITEM = 0x800000, // Count towards item total
  SKULLFLY = 0x1000000, // Skull in flight
  NOTDMATCH = 0x2000000, // Don't spawn in deathmatch
}

/**
 * Map object type (simplified for now)
 */
export enum MobjType {
  PLAYER = 1,
  // TODO: Add other types as needed
}

/**
 * Map Object structure
 * Represents players, monsters, items, projectiles, etc.
 */
export interface Mobj {
  // Position
  x: Fixed;
  y: Fixed;
  z: Fixed;

  // Orientation
  angle: Angle;

  // Physics
  momx: Fixed; // X momentum
  momy: Fixed; // Y momentum
  momz: Fixed; // Z momentum (vertical)

  // Collision
  radius: Fixed;
  height: Fixed;
  floorz: Fixed; // Floor height at current position
  ceilingz: Fixed; // Ceiling height at current position

  // State
  flags: number; // MobjFlags
  health: number;
  type: number; // Thing type number

  // Player-specific (only valid if type === PLAYER)
  player?: PlayerState;
}

/**
 * Player state (simplified for Phase 3)
 */
export interface PlayerState {
  viewheight: Fixed; // Current view height
  deltaviewheight: Fixed; // View height bobbing
  bob: Fixed; // Movement bobbing

  // Weapons, ammo, etc. - TODO in later phases
}

/**
 * Create a new player mobj
 */
export function createPlayerMobj(x: Fixed, y: Fixed, z: Fixed, angle: Angle): Mobj {
  return {
    x,
    y,
    z,
    angle,
    momx: 0,
    momy: 0,
    momz: 0,
    radius: 16 << 16, // 16 units (in fixed-point)
    height: 56 << 16, // 56 units
    floorz: z,
    ceilingz: z + (56 << 16),
    flags: MobjFlags.SOLID | MobjFlags.SHOOTABLE | MobjFlags.DROPOFF | MobjFlags.PICKUP | MobjFlags.SLIDE,
    health: 100,
    type: MobjType.PLAYER,
    player: {
      viewheight: 41 << 16, // 41 units view height
      deltaviewheight: 0,
      bob: 0,
    },
  };
}
