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

/**
 * Gametics between chase steps (`A_Chase` → `P_Move`). In linuxdoom, actions run on RUN
 * state entry, each RUN frame has its own `tics` (see info.c S_*_RUN1…8); this is the
 * common value per species so we do not P_Move at full 35 Hz.
 */
export const CHASE_FRAME_TICS: Record<number, number> = {
  3004: 4, // MT_POSSESSED S_POSS_RUN*
  9: 3, // MT_SHOTGUY S_SPOS_RUN*
  3001: 3, // MT_TROOP S_TROO_RUN*
  3002: 2, // MT_SERGEANT S_SARG_RUN*
  3003: 3, // MT_BRUISER S_BOSS_RUN*
  3005: 3, // MT_HEAD S_HEAD_RUN1 (loop)
  3006: 6, // MT_SKULL S_SKULL_RUN*
  66: 2, // MT_UNDEAD (revenant) S_SKEL_RUN*
  67: 4, // MT_FATSO S_FATT_RUN*
  68: 3, // MT_BABY S_BSPI_RUN*
  69: 3, // MT_KNIGHT S_BOS2_RUN*
  64: 2, // MT_VILE S_VILE_RUN*
  71: 3, // MT_PAIN S_PAIN_RUN*
  16: 3, // MT_CYBORG S_CYBER_RUN* (first A_Chase-style step cadence)
  7: 3, // MT_SPID S_SPID_RUN* (mostly 3; Metal frames omit chase)
};

export function getChaseFrameTics(thingType: number): number {
  return CHASE_FRAME_TICS[thingType] ?? 4;
}

/** mobjinfo.reactiontime; almost all monsters use 8 in vanilla. */
export const MONSTER_REACTIONTIME: Record<number, number> = {};

export function getMonsterReactionTime(thingType: number): number {
  return MONSTER_REACTIONTIME[thingType] ?? 8;
}
