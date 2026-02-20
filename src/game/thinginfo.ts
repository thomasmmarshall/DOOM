/**
 * Thing Type Information
 * Defines properties and sprites for all DOOM things
 * Based on linuxdoom-1.10/info.c
 */

import type { Fixed } from '../core';

/**
 * Thing type enumeration
 */
export enum ThingType {
  // Player
  PLAYER = 1,

  // Weapons
  SHOTGUN = 2001,
  CHAINGUN = 2002,
  ROCKET_LAUNCHER = 2003,
  PLASMA_GUN = 2004,
  CHAINSAW = 2005,
  BFG9000 = 2006,

  // Ammo
  CLIP = 2007,
  SHELLS = 2008,
  ROCKET = 2010,
  CELL = 2047,
  AMMO_BOX = 2048,
  SHELL_BOX = 2049,
  ROCKET_BOX = 2046,
  CELL_PACK = 17,

  // Health/Armor
  STIMPACK = 2011,
  MEDIKIT = 2012,
  ARMOR_BONUS = 2015,
  GREEN_ARMOR = 2018,
  BLUE_ARMOR = 2019,
  HEALTH_BONUS = 2014,

  // Powerups
  INVULNERABILITY = 2022,
  BERSERK = 2023,
  INVISIBILITY = 2024,
  RADIATION_SUIT = 2025,
  COMPUTER_MAP = 2026,
  LIGHT_AMP_GOGGLES = 2045,

  // Keys
  BLUE_KEYCARD = 5,
  YELLOW_KEYCARD = 6,
  RED_KEYCARD = 13,
  BLUE_SKULL_KEY = 40,
  YELLOW_SKULL_KEY = 39,
  RED_SKULL_KEY = 38,

  // Monsters
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

  // Decorations
  BARREL = 2035,
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

/**
 * Thing information structure
 */
export interface ThingInfo {
  type: ThingType;
  spriteName: string; // 4-character sprite name
  radius: Fixed;
  height: Fixed;
  flags: number;
  category: 'monster' | 'weapon' | 'ammo' | 'health' | 'powerup' | 'key' | 'decoration' | 'player';
}

/**
 * Thing info database
 * Maps thing type to properties
 */
export const THING_INFO: Map<number, ThingInfo> = new Map([
  // Player
  [ThingType.PLAYER, {
    type: ThingType.PLAYER,
    spriteName: 'PLAY',
    radius: 16 << 16,
    height: 56 << 16,
    flags: 0,
    category: 'player',
  }],

  // Weapons
  [ThingType.SHOTGUN, {
    type: ThingType.SHOTGUN,
    spriteName: 'SHOT',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    category: 'weapon',
  }],
  [ThingType.CHAINGUN, {
    type: ThingType.CHAINGUN,
    spriteName: 'MGUN',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    category: 'weapon',
  }],

  // Ammo
  [ThingType.CLIP, {
    type: ThingType.CLIP,
    spriteName: 'CLIP',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    category: 'ammo',
  }],
  [ThingType.SHELLS, {
    type: ThingType.SHELLS,
    spriteName: 'SHEL',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    category: 'ammo',
  }],

  // Health
  [ThingType.STIMPACK, {
    type: ThingType.STIMPACK,
    spriteName: 'STIM',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    category: 'health',
  }],
  [ThingType.MEDIKIT, {
    type: ThingType.MEDIKIT,
    spriteName: 'MEDI',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    category: 'health',
  }],

  // Armor
  [ThingType.GREEN_ARMOR, {
    type: ThingType.GREEN_ARMOR,
    spriteName: 'ARM1',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    category: 'health',
  }],
  [ThingType.BLUE_ARMOR, {
    type: ThingType.BLUE_ARMOR,
    spriteName: 'ARM2',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    category: 'health',
  }],

  // Keys
  [ThingType.BLUE_KEYCARD, {
    type: ThingType.BLUE_KEYCARD,
    spriteName: 'BKEY',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    category: 'key',
  }],
  [ThingType.YELLOW_KEYCARD, {
    type: ThingType.YELLOW_KEYCARD,
    spriteName: 'YKEY',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    category: 'key',
  }],
  [ThingType.RED_KEYCARD, {
    type: ThingType.RED_KEYCARD,
    spriteName: 'RKEY',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    category: 'key',
  }],

  // Monsters
  [ThingType.IMP, {
    type: ThingType.IMP,
    spriteName: 'TROO',
    radius: 20 << 16,
    height: 56 << 16,
    flags: 0,
    category: 'monster',
  }],
  [ThingType.ZOMBIE, {
    type: ThingType.ZOMBIE,
    spriteName: 'POSS',
    radius: 20 << 16,
    height: 56 << 16,
    flags: 0,
    category: 'monster',
  }],
  [ThingType.SHOTGUN_GUY, {
    type: ThingType.SHOTGUN_GUY,
    spriteName: 'SPOS',
    radius: 20 << 16,
    height: 56 << 16,
    flags: 0,
    category: 'monster',
  }],
  [ThingType.DEMON, {
    type: ThingType.DEMON,
    spriteName: 'SARG',
    radius: 30 << 16,
    height: 56 << 16,
    flags: 0,
    category: 'monster',
  }],
  [ThingType.BARON, {
    type: ThingType.BARON,
    spriteName: 'BOSS',
    radius: 24 << 16,
    height: 64 << 16,
    flags: 0,
    category: 'monster',
  }],

  // Decorations
  [ThingType.BARREL, {
    type: ThingType.BARREL,
    spriteName: 'BAR1',
    radius: 10 << 16,
    height: 42 << 16,
    flags: 0,
    category: 'decoration',
  }],
  [ThingType.FLOOR_LAMP, {
    type: ThingType.FLOOR_LAMP,
    spriteName: 'COLU',
    radius: 16 << 16,
    height: 16 << 16,
    flags: 0,
    category: 'decoration',
  }],
  [ThingType.TALL_GREEN_PILLAR, {
    type: ThingType.TALL_GREEN_PILLAR,
    spriteName: 'COL1',
    radius: 16 << 16,
    height: 16 << 16,
    flags: 0,
    category: 'decoration',
  }],
  [ThingType.SHORT_GREEN_PILLAR, {
    type: ThingType.SHORT_GREEN_PILLAR,
    spriteName: 'COL2',
    radius: 16 << 16,
    height: 16 << 16,
    flags: 0,
    category: 'decoration',
  }],
]);

/**
 * Get thing info by type
 */
export function getThingInfo(type: number): ThingInfo | null {
  return THING_INFO.get(type) || null;
}
