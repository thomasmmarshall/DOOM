/**
 * Thing Spawner
 * Spawns map objects from THINGS lump
 * Based on linuxdoom-1.10/p_mobj.c
 */

import type { MapThing, MapData } from '../level/types';
import type { Mobj } from './mobj';
import { IntToFixed, DegreesToAngle } from '../core';
import { getThingInfo } from './thinginfo';
import { findSectorAtPoint, MTF_AMBUSH, MTF_HARD } from '../level';
import { MobjFlags } from './mobj';

export interface SpawnedThing {
  thing: MapThing;
  mobj: Mobj;
  spriteName: string;
  frame: string;
  rotation: number;
  sectorIndex: number;
  lightLevel: number;
}

/** Skill level bit for filtering (MTF_HARD = skill 3 / medium) */
const SKILL_BIT = MTF_HARD;

export class ThingSpawner {
  private spawnedThings: SpawnedThing[];

  constructor() {
    this.spawnedThings = [];
  }

  /**
   * Spawn all things from map data
   * Matches DOOM skill filtering: p_mobj.c P_SpawnMapThing
   * @param mapData - Map data containing THINGS lump
   * @returns Array of spawned things (excluding player starts)
   */
  spawnThings(mapData: MapData): SpawnedThing[] {
    this.spawnedThings = [];

    const skillBit = SKILL_BIT;

    for (const thing of mapData.things) {
      // Skip deathmatch starts (type 11)
      if (thing.type === 11) continue;

      // Skip player starts (types 1-4) - handled separately
      if (thing.type >= 1 && thing.type <= 4) continue;

      // Skill filtering: thing must have our skill bit set (options 0 = all skills)
      const opts = thing.options & 15;
      if (opts !== 0 && (thing.options & skillBit) === 0) continue;

      // Skip multiplayer-only things in single player
      if ((thing.options & 16) !== 0) continue;

      const spawned = this.spawnThing(thing, mapData);
      if (spawned) {
        this.spawnedThings.push(spawned);
      }
    }

    console.log(`Spawned ${this.spawnedThings.length} things`);
    return this.spawnedThings;
  }

  /**
   * Spawn a single thing
   * @param thing - Map thing data
   * @returns SpawnedThing or null if type not recognized
   */
  private spawnThing(thing: MapThing, mapData: MapData): SpawnedThing | null {
    const info = getThingInfo(thing.type);
    if (!info) {
      // Unknown thing type - skip silently (many thing types not yet implemented)
      return null;
    }

    const sectorIndex = findSectorAtPoint(thing.x, thing.y, mapData);
    const sector = sectorIndex >= 0 ? mapData.sectors[sectorIndex] : null;
    const floorHeight = sector?.floorheight ?? 0;
    const ceilingHeight = sector?.ceilingheight ?? 128;
    const spawnOnCeiling = (info.flags & MobjFlags.SPAWNCEILING) !== 0;
    const z = spawnOnCeiling ? ceilingHeight - (info.height >> 16) : floorHeight;
    const flags = (thing.options & MTF_AMBUSH) !== 0
      ? (info.flags | MobjFlags.AMBUSH)
      : info.flags;

    // Create map object
    const mobj: Mobj = {
      x: IntToFixed(thing.x),
      y: IntToFixed(thing.y),
      z: IntToFixed(z),
      angle: DegreesToAngle(thing.angle),
      momx: 0,
      momy: 0,
      momz: 0,
      radius: info.radius,
      height: info.height,
      floorz: IntToFixed(floorHeight),
      ceilingz: IntToFixed(ceilingHeight),
      flags,
      health: info.health,
      type: info.type,
      sectorIndex: sectorIndex >= 0 ? sectorIndex : undefined,
      sprite: info.spriteName,
      frame: info.frame ?? 'A',
      rotation: info.rotation ?? 0,
      countsTowardKill: info.countsTowardKill,
      countsTowardItem: info.countsTowardItem,
      painChance: info.painChance,
    };

    const spriteName = info.spriteName;
    const frame = info.frame ?? 'A';
    const rotation = info.rotation ?? 0;

    return {
      thing,
      mobj,
      spriteName,
      frame,
      rotation,
      sectorIndex,
      lightLevel: sector?.lightlevel ?? 160,
    };
  }

  /**
   * Get all spawned things
   */
  getSpawnedThings(): SpawnedThing[] {
    return this.spawnedThings;
  }

  /**
   * Get spawned things by category
   */
  getThingsByCategory(category: string): SpawnedThing[] {
    return this.spawnedThings.filter(spawned => {
      const info = getThingInfo(spawned.thing.type);
      return info?.category === category;
    });
  }
}
