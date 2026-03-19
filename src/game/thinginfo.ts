/**
 * Thing Type Information
 * Defines properties and sprites for all DOOM things
 * Based on linuxdoom-1.10/info.c
 */

import type { Fixed } from '../core';
import { MobjFlags } from './mobj';

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
  health: number;
  frame?: string;
  rotation?: number;
  countsTowardKill?: boolean;
  countsTowardItem?: boolean;
  painChance?: number;
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
    health: 100,
    category: 'player',
  }],

  // Weapons
  [ThingType.SHOTGUN, {
    type: ThingType.SHOTGUN,
    spriteName: 'SHOT',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'weapon',
    countsTowardItem: true,
  }],
  [ThingType.CHAINGUN, {
    type: ThingType.CHAINGUN,
    spriteName: 'MGUN',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'weapon',
    countsTowardItem: true,
  }],
  [ThingType.ROCKET_LAUNCHER, {
    type: ThingType.ROCKET_LAUNCHER,
    spriteName: 'LAUN',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'weapon',
    countsTowardItem: true,
  }],

  // Ammo
  [ThingType.CLIP, {
    type: ThingType.CLIP,
    spriteName: 'CLIP',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'ammo',
    countsTowardItem: true,
  }],
  [ThingType.SHELLS, {
    type: ThingType.SHELLS,
    spriteName: 'SHEL',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'ammo',
    countsTowardItem: true,
  }],
  [ThingType.ROCKET, {
    type: ThingType.ROCKET,
    spriteName: 'ROCK',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'ammo',
    countsTowardItem: true,
  }],
  [ThingType.AMMO_BOX, {
    type: ThingType.AMMO_BOX,
    spriteName: 'AMMO',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'ammo',
    countsTowardItem: true,
  }],
  [ThingType.SHELL_BOX, {
    type: ThingType.SHELL_BOX,
    spriteName: 'SBOX',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'ammo',
    countsTowardItem: true,
  }],
  [ThingType.ROCKET_BOX, {
    type: ThingType.ROCKET_BOX,
    spriteName: 'BROK',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'ammo',
    countsTowardItem: true,
  }],

  // Health
  [ThingType.STIMPACK, {
    type: ThingType.STIMPACK,
    spriteName: 'STIM',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'health',
    countsTowardItem: true,
  }],
  [ThingType.MEDIKIT, {
    type: ThingType.MEDIKIT,
    spriteName: 'MEDI',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'health',
    countsTowardItem: true,
  }],
  [ThingType.HEALTH_BONUS, {
    type: ThingType.HEALTH_BONUS,
    spriteName: 'BON1',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'health',
    countsTowardItem: true,
  }],
  [ThingType.ARMOR_BONUS, {
    type: ThingType.ARMOR_BONUS,
    spriteName: 'BON2',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'health',
    countsTowardItem: true,
  }],

  // Armor
  [ThingType.GREEN_ARMOR, {
    type: ThingType.GREEN_ARMOR,
    spriteName: 'ARM1',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'health',
    countsTowardItem: true,
  }],
  [ThingType.BLUE_ARMOR, {
    type: ThingType.BLUE_ARMOR,
    spriteName: 'ARM2',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'health',
    countsTowardItem: true,
  }],

  // Keys
  [ThingType.BLUE_KEYCARD, {
    type: ThingType.BLUE_KEYCARD,
    spriteName: 'BKEY',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'key',
    countsTowardItem: true,
  }],
  [ThingType.YELLOW_KEYCARD, {
    type: ThingType.YELLOW_KEYCARD,
    spriteName: 'YKEY',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'key',
    countsTowardItem: true,
  }],
  [ThingType.RED_KEYCARD, {
    type: ThingType.RED_KEYCARD,
    spriteName: 'RKEY',
    radius: 20 << 16,
    height: 16 << 16,
    flags: MobjFlags.SPECIAL | MobjFlags.COUNTITEM,
    health: 1,
    category: 'key',
    countsTowardItem: true,
  }],

  // Monsters
  [ThingType.IMP, {
    type: ThingType.IMP,
    spriteName: 'TROO',
    radius: 20 << 16,
    height: 56 << 16,
    flags: MobjFlags.SOLID | MobjFlags.SHOOTABLE | MobjFlags.COUNTKILL,
    health: 60,
    category: 'monster',
    countsTowardKill: true,
    painChance: 200,
  }],
  [ThingType.ZOMBIE, {
    type: ThingType.ZOMBIE,
    spriteName: 'POSS',
    radius: 20 << 16,
    height: 56 << 16,
    flags: MobjFlags.SOLID | MobjFlags.SHOOTABLE | MobjFlags.COUNTKILL,
    health: 20,
    category: 'monster',
    countsTowardKill: true,
    painChance: 200,
  }],
  [ThingType.SHOTGUN_GUY, {
    type: ThingType.SHOTGUN_GUY,
    spriteName: 'SPOS',
    radius: 20 << 16,
    height: 56 << 16,
    flags: MobjFlags.SOLID | MobjFlags.SHOOTABLE | MobjFlags.COUNTKILL,
    health: 30,
    category: 'monster',
    countsTowardKill: true,
    painChance: 170,
  }],
  [ThingType.DEMON, {
    type: ThingType.DEMON,
    spriteName: 'SARG',
    radius: 30 << 16,
    height: 56 << 16,
    flags: MobjFlags.SOLID | MobjFlags.SHOOTABLE | MobjFlags.COUNTKILL,
    health: 150,
    category: 'monster',
    countsTowardKill: true,
    painChance: 180,
  }],
  [ThingType.BARON, {
    type: ThingType.BARON,
    spriteName: 'BOSS',
    radius: 24 << 16,
    height: 64 << 16,
    flags: MobjFlags.SOLID | MobjFlags.SHOOTABLE | MobjFlags.COUNTKILL,
    health: 1000,
    category: 'monster',
    countsTowardKill: true,
    painChance: 50,
  }],

  // Decorations
  [ThingType.BARREL, {
    type: ThingType.BARREL,
    spriteName: 'BAR1',
    radius: 10 << 16,
    height: 42 << 16,
    flags: MobjFlags.SOLID | MobjFlags.SHOOTABLE | MobjFlags.NOBLOOD,
    health: 20,
    category: 'decoration',
    painChance: 255,
  }],
  [ThingType.FLOOR_LAMP, {
    type: ThingType.FLOOR_LAMP,
    spriteName: 'COLU',
    radius: 16 << 16,
    height: 16 << 16,
    flags: MobjFlags.SOLID,
    health: 1,
    category: 'decoration',
  }],
  [ThingType.TALL_GREEN_PILLAR, {
    type: ThingType.TALL_GREEN_PILLAR,
    spriteName: 'COL1',
    radius: 16 << 16,
    height: 16 << 16,
    flags: MobjFlags.SOLID,
    health: 1,
    category: 'decoration',
  }],
  [ThingType.SHORT_GREEN_PILLAR, {
    type: ThingType.SHORT_GREEN_PILLAR,
    spriteName: 'COL2',
    radius: 16 << 16,
    height: 16 << 16,
    flags: MobjFlags.SOLID,
    health: 1,
    category: 'decoration',
  }],
  // Dead corpses (decorations)
  [ThingType.DEAD_PLAYER, {
    type: ThingType.DEAD_PLAYER,
    spriteName: 'PLAY',
    radius: 16 << 16,
    height: 16 << 16,
    flags: 0,
    health: 1,
    category: 'decoration',
    frame: 'N',
  }],
  [ThingType.DEAD_TROOPER, {
    type: ThingType.DEAD_TROOPER,
    spriteName: 'POSS',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    health: 1,
    category: 'decoration',
    frame: 'L',
  }],
  [ThingType.DEAD_SERGEANT, {
    type: ThingType.DEAD_SERGEANT,
    spriteName: 'SPOS',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    health: 1,
    category: 'decoration',
    frame: 'L',
  }],
  [ThingType.DEAD_IMP, {
    type: ThingType.DEAD_IMP,
    spriteName: 'TROO',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    health: 1,
    category: 'decoration',
    frame: 'M',
  }],
  [ThingType.DEAD_DEMON, {
    type: ThingType.DEAD_DEMON,
    spriteName: 'SARG',
    radius: 30 << 16,
    height: 16 << 16,
    flags: 0,
    health: 1,
    category: 'decoration',
    frame: 'N',
  }],
  [ThingType.DEAD_CACODEMON, {
    type: ThingType.DEAD_CACODEMON,
    spriteName: 'HEAD',
    radius: 20 << 16,
    height: 16 << 16,
    flags: 0,
    health: 1,
    category: 'decoration',
    frame: 'L',
  }],
]);

/**
 * Get thing info by type
 */
export function getThingInfo(type: number): ThingInfo | null {
  return THING_INFO.get(type) || null;
}
