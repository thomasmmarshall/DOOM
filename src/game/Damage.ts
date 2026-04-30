/**
 * Damage System
 * Handles damage application, pain/death states, and kill tracking
 * Based on linuxdoom-1.10/p_inter.c
 */

import type { Mobj } from './mobj';
import { MobjFlags } from './mobj';
import { pRandom } from '../core';
import { FixedToFloat } from '../core/fixed';

let onPlayerCountedKill: (() => void) | undefined;

/** Optional hook for level intermission stats (COUNTKILL monsters only). */
export function setPlayerCountedKillHook(fn: (() => void) | undefined): void {
  onPlayerCountedKill = fn;
}

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

  // Apply armor: vanilla P_DamageMobj formula:
  // saved = armortype * damage / 3  (integer division)
  let actualDamage = damage;
  if (!(flags & DamageFlags.NO_ARMOR) && target.player) {
    if (target.player.armor > 0 && target.player.armorType > 0) {
      let saved = Math.floor(target.player.armorType * actualDamage / 3);
      if (saved > target.player.armor) {
        saved = target.player.armor;
      }
      target.player.armor -= saved;
      actualDamage -= saved;
      if (target.player.armor <= 0) {
        target.player.armorType = 0;
      }
    }
  }

  // Apply damage
  target.health -= actualDamage;

  if (target.player && attacker && attacker !== target) {
    target.player.damageAttacker = attacker;
  }

  // Check if killed
  if (target.health <= 0) {
    const overkill = -target.health;
    killActor(target, attacker);
    return { damageDealt: actualDamage, killed: true, overkill };
  }

  // Infighting: if a non-player damages a monster, the monster retargets.
  // Vanilla: target->target = source; target->threshold = BASETHRESHOLD (100 tics).
  if (!target.player && attacker && attacker !== target &&
      !(target.flags & MobjFlags.SKULLFLY)) {
    target.infightTarget = attacker;
    target.threshold = 100; // BASETHRESHOLD
  }

  // Pain state — vanilla P_DamageMobj uses painchance from mobjinfo.
  if (target.health > 0) {
    const painChance = target.painChance ?? 128;
    if (pRandom() < painChance) {
      target.flags |= MobjFlags.JUSTHIT;
    }
    if (target.player) {
      target.player.damageCount = Math.min(100, target.player.damageCount + actualDamage);
    }
  }

  return { damageDealt: actualDamage, killed: false, overkill: 0 };
}

const DEATH_FRAMES: Record<number, string> = {
  2035: 'B',
  3001: 'M',
  3002: 'N',
  3004: 'L',
  9: 'L',
};

function getDeathFrame(type: number): string {
  return DEATH_FRAMES[type] ?? 'L';
}

/**
 * Kill an actor
 */
function killActor(target: Mobj, attacker?: Mobj): void {
  if (attacker?.player && (target.flags & MobjFlags.COUNTKILL)) {
    onPlayerCountedKill?.();
  }

  // Remove shootable flag
  target.flags &= ~MobjFlags.SHOOTABLE;
  // Corpses don't block movement (vanilla: A_Fall / P_KillMobj for player)
  target.flags &= ~MobjFlags.SOLID;

  target.flags |= MobjFlags.CORPSE;
  target.frame = getDeathFrame(target.type);

  target.momx = 0;
  target.momy = 0;
  target.momz = 0;

  // Player death
  if (target.player) {
    target.player.message = 'You died!';
    target.player.damageCount = 100;
  }
}

/**
 * Calculate random damage in a range
 * DOOM uses ((rand() % 8) + 1) * damage for most weapons
 */
export function randomDamage(base: number, multiplier: number = 1): number {
  const random = (pRandom() % 8) + 1;
  return random * base * multiplier;
}

/**
 * Damage for specific weapon types
 */
/** Pistol / chaingun / shotgun pellet: `5 * (P_Random % 3 + 1)` (linuxdoom p_pspr.c). */
export function gunshotPelletDamage(): number {
  return 5 * ((pRandom() % 3) + 1);
}

/** Fist / berserk fist: `(P_Random % 10 + 1) << 1`, ×10 if berserk. */
export function punchDamage(berserk: boolean): number {
  let d = (pRandom() % 10 + 1) << 1;
  if (berserk) d *= 10;
  return d;
}

/** Chainsaw: `2 * (P_Random % 10 + 1)`. */
export function chainsawDamage(): number {
  return 2 * (pRandom() % 10 + 1);
}

export const WeaponDamage = {
  PISTOL: () => gunshotPelletDamage(),
  SHOTGUN_PELLET: () => gunshotPelletDamage(),
  CHAINGUN: () => gunshotPelletDamage(),

  FIST: (berserk?: boolean) => punchDamage(!!berserk),
  CHAINSAW: () => chainsawDamage(),
  BERSERK_FIST: (b: boolean) => punchDamage(b),

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
  const sourceX = FixedToFloat(source.x);
  const sourceY = FixedToFloat(source.y);
  const sourceZ = FixedToFloat(source.z);

  for (const target of allActors) {
    if (target === source || target === attacker) continue;
    if (!(target.flags & MobjFlags.SHOOTABLE)) continue;

    const dx = FixedToFloat(target.x) - sourceX;
    const dy = FixedToFloat(target.y) - sourceY;
    const dz = FixedToFloat(target.z) - sourceZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > radius) continue;

    const falloff = 1 - dist / radius;
    const actualDamage = Math.floor(damage * falloff);

    if (actualDamage > 0) {
      damageActor(target, actualDamage, attacker);
    }
  }
}
