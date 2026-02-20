/**
 * Thing Spawner
 * Spawns map objects from THINGS lump
 * Based on linuxdoom-1.10/p_mobj.c
 */

import type { MapThing, MapData } from '../level/types';
import type { Mobj } from './mobj';
import { IntToFixed, DegreesToAngle } from '../core';
import { getThingInfo } from './thinginfo';

export interface SpawnedThing {
  thing: MapThing;
  mobj: Mobj;
  spriteName: string;
  frame: string;
}

export class ThingSpawner {
  private spawnedThings: SpawnedThing[];

  constructor() {
    this.spawnedThings = [];
  }

  /**
   * Spawn all things from map data
   * @param mapData - Map data containing THINGS lump
   * @returns Array of spawned things (excluding player starts)
   */
  spawnThings(mapData: MapData): SpawnedThing[] {
    this.spawnedThings = [];

    for (const thing of mapData.things) {
      // Skip player starts (types 1-4)
      if (thing.type >= 1 && thing.type <= 4) {
        continue;
      }

      const spawned = this.spawnThing(thing);
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
  private spawnThing(thing: MapThing): SpawnedThing | null {
    const info = getThingInfo(thing.type);
    if (!info) {
      // Unknown thing type - skip silently (many thing types not yet implemented)
      return null;
    }

    // Create map object
    const mobj: Mobj = {
      x: IntToFixed(thing.x),
      y: IntToFixed(thing.y),
      z: 0, // Will be set to floor height
      angle: DegreesToAngle(thing.angle),
      momx: 0,
      momy: 0,
      momz: 0,
      radius: info.radius,
      height: info.height,
      floorz: 0,
      ceilingz: 0,
      flags: info.flags,
      health: 100,
      type: info.type,
    };

    // Default sprite frame is 'A' with rotation 0
    const spriteName = info.spriteName;
    const frame = 'A';

    return {
      thing,
      mobj,
      spriteName,
      frame,
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
