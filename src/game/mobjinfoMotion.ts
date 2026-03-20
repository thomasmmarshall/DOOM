/**
 * mobjinfo.speed / reactiontime from linuxdoom-1.10/info.c (per-thing chase tuning).
 */

import { FRACUNIT } from '../core/fixed';

/** linuxdoom-1.10/p_enemy.c P_Move — speed is multiplied by these per movedir. */
export const CHASE_XSPEED: readonly number[] = [
  FRACUNIT,
  47000,
  0,
  -47000,
  -FRACUNIT,
  -47000,
  0,
  47000,
];
export const CHASE_YSPEED: readonly number[] = [
  0,
  47000,
  FRACUNIT,
  47000,
  0,
  -47000,
  -FRACUNIT,
  -47000,
];

/** Editor thing type → mobjinfo.speed (same integer as vanilla). */
export const MONSTER_CHASE_SPEED: Record<number, number> = {
  3004: 8, // MT_POSSESSED
  9: 8, // MT_SHOTGUY
  3001: 8, // MT_TROOP
  3002: 10, // MT_SERGEANT (demon)
  3003: 8, // MT_BRUISER
  3005: 8, // MT_HEAD (cacodemon)
  3006: 8, // MT_SKULL
  66: 10, // MT_UNDEAD
  67: 8, // MT_FATSO
  68: 12, // MT_BABY (arachnotron)
  69: 8, // MT_KNIGHT
  64: 15, // MT_VILE
  71: 8, // MT_PAIN
  16: 16, // MT_CYBORG
  7: 12, // MT_SPIDER
};

export function getMonsterChaseSpeed(thingType: number): number {
  return MONSTER_CHASE_SPEED[thingType] ?? 8;
}

/** mobjinfo.reactiontime; almost all monsters use 8 in vanilla. */
export const MONSTER_REACTIONTIME: Record<number, number> = {};

export function getMonsterReactionTime(thingType: number): number {
  return MONSTER_REACTIONTIME[thingType] ?? 8;
}
