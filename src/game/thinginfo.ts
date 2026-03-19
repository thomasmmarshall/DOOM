/**
 * Thing definitions from linuxdoom-1.10 mobjinfo (via thinginfo.generated.ts).
 * Regenerate: `npm run generate:thinginfo`
 */

import type { Fixed } from '../core';
import { MobjFlags } from './mobj';
import { GENERATED_THING_INFO_ROWS } from './thinginfo.generated';

/** Editor / map thing type numbers (doomednum). Subset of names for callers. */
export enum ThingType {
  PLAYER = 1,
  SHOTGUN = 2001,
  CHAINGUN = 2002,
  ROCKET_LAUNCHER = 2003,
  PLASMA_GUN = 2004,
  CHAINSAW = 2005,
  BFG9000 = 2006,
  CLIP = 2007,
  SHELLS = 2008,
  ROCKET = 2010,
  CELL = 2047,
  AMMO_BOX = 2048,
  SHELL_BOX = 2049,
  ROCKET_BOX = 2046,
  CELL_PACK = 17,
  STIMPACK = 2011,
  MEDIKIT = 2012,
  ARMOR_BONUS = 2015,
  GREEN_ARMOR = 2018,
  BLUE_ARMOR = 2019,
  HEALTH_BONUS = 2014,
  INVULNERABILITY = 2022,
  BERSERK = 2023,
  INVISIBILITY = 2024,
  RADIATION_SUIT = 2025,
  COMPUTER_MAP = 2026,
  LIGHT_AMP_GOGGLES = 2045,
  BLUE_KEYCARD = 5,
  YELLOW_KEYCARD = 6,
  RED_KEYCARD = 13,
  BLUE_SKULL_KEY = 40,
  YELLOW_SKULL_KEY = 39,
  RED_SKULL_KEY = 38,
  IMP = 3001,
  DEMON = 3002,
  BARON = 3003,
  ZOMBIE = 3004,
  CACODEMON = 3005,
  LOST_SOUL = 3006,
  SHOTGUN_GUY = 9,
  REVENANT = 66,
  MANCUBUS = 67,
  ARACHNOTRON = 68,
  HELL_KNIGHT = 69,
  ARCH_VILE = 64,
  PAIN_ELEMENTAL = 71,
  COMMANDER_KEEN = 72,
  CYBERDEMON = 16,
  SPIDER_MASTERMIND = 7,
  BARREL = 2035,
  SUPERSHOTGUN = 82,
  TALL_TECHNO_PILLAR = 48,
  TALL_GREEN_PILLAR = 30,
  TALL_RED_PILLAR = 32,
  SHORT_GREEN_PILLAR = 31,
  SHORT_RED_PILLAR = 33,
  CANDLE = 34,
  CANDELABRA = 35,
  TALL_BLUE_TORCH = 44,
  TALL_GREEN_TORCH = 45,
  TALL_RED_TORCH = 46,
  SHORT_BLUE_TORCH = 55,
  SHORT_GREEN_TORCH = 56,
  SHORT_RED_TORCH = 57,
  FLOOR_LAMP = 2028,
  HANGING_VICTIM_TWITCHING = 63,
  HANGING_VICTIM_ARMS_OUT = 59,
  HANGING_VICTIM_ONE_LEGGED = 61,
  HANGING_PAIR_OF_LEGS = 62,
  HANGING_LEG = 60,
  DEAD_PLAYER = 15,
  DEAD_TROOPER = 18,
  DEAD_SERGEANT = 19,
  DEAD_IMP = 20,
  DEAD_DEMON = 21,
  DEAD_CACODEMON = 22,
}

export interface ThingInfo {
  type: number;
  spriteName: string;
  frame: string;
  rotation: number;
  radius: Fixed;
  height: Fixed;
  flags: number;
  health: number;
  painChance?: number;
  countsTowardKill?: boolean;
  countsTowardItem?: boolean;
  category: 'monster' | 'weapon' | 'ammo' | 'health' | 'powerup' | 'key' | 'decoration' | 'player';
  /** Original MT_* name from info.c (debug) */
  mobjName?: string;
}

function buildThingInfoMap(): Map<number, ThingInfo> {
  const m = new Map<number, ThingInfo>();
  for (const row of GENERATED_THING_INFO_ROWS) {
    const entry: ThingInfo = {
      type: row.type,
      spriteName: row.spriteName,
      frame: row.frame,
      rotation: row.rotation,
      radius: row.radius,
      height: row.height,
      flags: row.flags,
      health: row.health,
      category: row.category,
    };
    if (row.painChance !== 0) entry.painChance = row.painChance;
    if (row.countsTowardKill) entry.countsTowardKill = true;
    if (row.countsTowardItem) entry.countsTowardItem = true;
    entry.mobjName = row.mobjName;
    m.set(row.type, entry);
  }

  m.set(ThingType.PLAYER, {
    type: ThingType.PLAYER,
    spriteName: 'PLAY',
    frame: 'A',
    rotation: 0,
    radius: 16 << 16,
    height: 56 << 16,
    flags: MobjFlags.SOLID | MobjFlags.SHOOTABLE | MobjFlags.DROPOFF | MobjFlags.PICKUP | MobjFlags.NOTDMATCH,
    health: 100,
    category: 'player',
    mobjName: 'PLAYER',
  });

  return m;
}

export const THING_INFO: Map<number, ThingInfo> = buildThingInfoMap();

export function getThingInfo(type: number): ThingInfo | null {
  return THING_INFO.get(type) ?? null;
}
