import { describe, expect, it } from 'vitest';
import type { MapData } from '../level/types';
import { DoorManager } from './DoorSystem';

function createDoorTestMap(): MapData {
  return {
    name: 'TEST',
    vertexes: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
    ],
    linedefs: [
      { v1: 0, v2: 1, flags: 4, special: 0, tag: 0, sidenum: [0, 1] },
    ],
    sidedefs: [
      { textureoffset: 0, rowoffset: 0, toptexture: '-', bottomtexture: '-', midtexture: '-', sector: 0 },
      { textureoffset: 0, rowoffset: 0, toptexture: '-', bottomtexture: '-', midtexture: '-', sector: 1 },
    ],
    sectors: [
      { floorheight: 0, ceilingheight: 128, floorpic: 'FLOOR', ceilingpic: 'CEIL', lightlevel: 160, special: 0, tag: 0 },
      { floorheight: 0, ceilingheight: 0, floorpic: 'FLOOR', ceilingpic: 'CEIL', lightlevel: 160, special: 0, tag: 0 },
    ],
    things: [],
    segs: [],
    subsectors: [],
    nodes: [],
  };
}

describe('DoorManager', () => {
  it('raises a door sector after activation', () => {
    const mapData = createDoorTestMap();
    const doorManager = new DoorManager(mapData);

    expect(doorManager.activateDoor(1)).toBe(true);

    doorManager.updateDoors();

    expect(mapData.sectors[1].ceilingheight).toBe(2);
  });
});
