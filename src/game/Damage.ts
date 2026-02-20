/**
 * Damage System
 * Handles damage application, pain/death states, and kill tracking
 * Based on linuxdoom-1.10/p_inter.c
 */

import type { Mobj } from './mobj';
import { MobjFlags } from './mobj';

/**
 * Damage flags
 */
export enum DamageFlags {
  NO_ARMOR = 0x1,      // Ignore armor
  ALWAYS_GIB = 0x2,    // Always telefrag/crush
  TELEFRAG = 0x4,      // Instant kill
}

/**
 * Damage result
 */
export interface DamageResult {
  damageDealt: number;
  killed: boolean;
  overkill: number; // How much damage beyond death
}

/**
 * Apply damage to an actor
 */
export function damageActor(
  target: Mobj,
  damage: number,
  attacker?: Mobj,
  flags: number = 0
): DamageResult {
  // Can't damage things that aren't shootable
  if (!(target.flags & MobjFlags.SHOOTABLE)) {
    return { damageDealt: 0, killed: false, overkill: 0 };
  }

  // Already dead/corpse
  if (target.health <= 0) {
    return { damageDealt: 0, killed: false, overkill: 0 };
  }

  // Telefrag always kills
  if (flags & DamageFlags.TELEFRAG) {
    target.health = -target.height;
    killActor(target, attacker);
    return { damageDealt: damage, killed: true, overkill: damage };
  }

  // Apply armor (if target is player and has armor)
  let actualDamage = damage;
  if (!(flags & DamageFlags.NO_ARMOR) && target.player) {
    // TODO: Implement armor absorption when we add armor to player state
    // For now, no armor reduction
  }

  // Apply damage
  target.health -= actualDamage;

  // Check if killed
  if (target.health <= 0) {
    const overkill = -target.health;
    killActor(target, attacker);
    return { damageDealt: actualDamage, killed: true, overkill };
  }

  // Not killed - enter pain state
  // TODO: Implement pain state when we have full state system
  // For now, just set a flag
  if (target.health > 0) {
    target.flags |= MobjFlags.JUSTHIT;

    // Pain sound would play here
    console.log(`${target.type} took ${actualDamage} damage (${target.health} HP remaining)`);
  }

  return { damageDealt: actualDamage, killed: false, overkill: 0 };
}

/**
 * Kill an actor
 */
function killActor(target: Mobj, attacker?: Mobj): void {
  // Award kill to attacker if it's the player
  if (attacker?.player && target.flags & MobjFlags.COUNTKILL) {
    // TODO: Increment kill counter when we have stats tracking
    console.log(`Player killed ${target.type}!`);
  }

  // Remove shootable flag
  target.flags &= ~MobjFlags.SHOOTABLE;

  // Add corpse flag
  target.flags |= MobjFlags.CORPSE;

  // Stop any movement
  target.momx = 0;
  target.momy = 0;
  target.momz = 0;

  // TODO: Enter death state animation
  // TODO: Play death sound
  // For now just log
  console.log(`${target.type} died!`);

  // Player death
  if (target.player) {
    // TODO: Implement player death state
    console.log('Player died! Game over (respawn not implemented yet)');
  }
}

/**
 * Calculate random damage in a range
 * DOOM uses ((rand() % 8) + 1) * damage for most weapons
 */
export function randomDamage(base: number, multiplier: number = 1): number {
  const random = Math.floor(Math.random() * 8) + 1;
  return random * base * multiplier;
}

/**
 * Damage for specific weapon types
 */
export const WeaponDamage = {
  // Hitscan weapons
  PISTOL: () => randomDamage(5),
  SHOTGUN_PELLET: () => randomDamage(5), // Shotgun fires 7 pellets
  CHAINGUN: () => randomDamage(5),

  // Melee
  FIST: () => randomDamage(2, 5), // 2 * ((rand % 8) + 1) * 5
  CHAINSAW: () => randomDamage(2, 5),
  BERSERK_FIST: () => randomDamage(2, 50), // Berserk pack multiplies by 10

  // Projectile weapons
  ROCKET: 20,      // Plus splash damage
  PLASMA: 5,       // Plus splash
  BFG_RAY: 100,    // BFG ray damage
  BFG_SPLASH: 15,  // BFG splash per target hit

  // Enemy attacks
  IMP_FIREBALL: 8,
  DEMON_BITE: () => randomDamage(4, 3),
  CACODEMON_FIREBALL: () => randomDamage(5),
  BARON_FIREBALL: () => randomDamage(8),
};

/**
 * Apply splash damage to all actors in radius
 */
export function splashDamage(
  source: Mobj,
  damage: number,
  radius: number,
  attacker?: Mobj,
  allActors: Mobj[] = []
): void {
  const sourceX = source.x;
  const sourceY = source.y;
  const sourceZ = source.z;

  for (const target of allActors) {
    // Don't damage self or attacker
    if (target === source || target === attacker) continue;

    // Can't damage non-shootable things
    if (!(target.flags & MobjFlags.SHOOTABLE)) continue;

    // Calculate distance
    const dx = target.x - sourceX;
    const dy = target.y - sourceY;
    const dz = target.z - sourceZ;
    const dist = Math.sqrt(
      (dx * dx + dy * dy + dz * dz) / (65536 * 65536)
    ); // Convert from fixed-point

    if (dist > radius) continue;

    // Damage falls off with distance
    const falloff = 1 - (dist / radius);
    const actualDamage = Math.floor(damage * falloff);

    if (actualDamage > 0) {
      damageActor(target, actualDamage, attacker);
    }
  }
}
