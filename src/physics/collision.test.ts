import { describe, expect, it } from 'vitest';
import { FixedToFloat, IntToFixed } from '../core/fixed';
import { createPlayerMobj, MobjFlags, type Mobj } from '../game/mobj';
import { ML_TWOSIDED, type MapData, type MapSideDef } from '../level/types';
import { applyCollision } from './collision';
import { applyZMomentum } from './movement';

function makeSide(sector: number): MapSideDef {
  return {
    textureoffset: 0,
    rowoffset: 0,
    toptexture: '-',
    bottomtexture: '-',
    midtexture: '-',
    sector,
  };
}

function createDoorwayMap(doorCeilingHeight: number): MapData {
  return {
    name: 'TEST',
    vertexes: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 64 },
      { x: 0, y: 64 },
      { x: 128, y: 0 },
      { x: 128, y: 64 },
    ],
    linedefs: [
      { v1: 0, v2: 1, flags: 0, special: 0, tag: 0, sidenum: [0, -1] },
      { v1: 1, v2: 2, flags: ML_TWOSIDED, special: 0, tag: 0, sidenum: [1, 2] },
      { v1: 2, v2: 3, flags: 0, special: 0, tag: 0, sidenum: [3, -1] },
      { v1: 3, v2: 0, flags: 0, special: 0, tag: 0, sidenum: [4, -1] },
      { v1: 1, v2: 4, flags: 0, special: 0, tag: 0, sidenum: [5, -1] },
      { v1: 4, v2: 5, flags: 0, special: 0, tag: 0, sidenum: [6, -1] },
      { v1: 5, v2: 2, flags: 0, special: 0, tag: 0, sidenum: [7, -1] },
    ],
    sidedefs: [
      makeSide(0),
      makeSide(0),
      makeSide(1),
      makeSide(0),
      makeSide(0),
      makeSide(1),
      makeSide(1),
      makeSide(1),
    ],
    sectors: [
      { floorheight: 0, ceilingheight: 128, floorpic: 'FLOOR', ceilingpic: 'CEIL', lightlevel: 160, special: 0, tag: 0 },
      { floorheight: 0, ceilingheight: doorCeilingHeight, floorpic: 'FLOOR', ceilingpic: 'CEIL', lightlevel: 160, special: 0, tag: 0 },
    ],
    things: [],
    segs: [],
    subsectors: [],
    nodes: [],
  };
}

describe('door collision', () => {
  it('blocks movement into a doorway that is too short for the player', () => {
    const mapData = createDoorwayMap(32);
    const player = createPlayerMobj(IntToFixed(48), IntToFixed(32), IntToFixed(0), 0);
    player.floorz = IntToFixed(0);
    player.ceilingz = IntToFixed(128);
    player.momx = IntToFixed(20);

    applyCollision(player, mapData);

    expect(player.x).toBe(IntToFixed(48));
    expect(player.sectorIndex).not.toBe(1);
  });

  it('allows movement through a doorway with enough vertical clearance', () => {
    const mapData = createDoorwayMap(128);
    const player = createPlayerMobj(IntToFixed(48), IntToFixed(32), IntToFixed(0), 0);
    player.floorz = IntToFixed(0);
    player.ceilingz = IntToFixed(128);
    player.momx = IntToFixed(20);

    applyCollision(player, mapData);

    expect(player.x).toBe(IntToFixed(68));
    expect(player.sectorIndex).toBe(1);
  });

  it('never clamps the player below the floor when ceiling space is invalid', () => {
    const player = createPlayerMobj(IntToFixed(0), IntToFixed(0), IntToFixed(0), 0);
    player.floorz = IntToFixed(0);
    player.ceilingz = IntToFixed(32);
    player.momz = 0;

    applyZMomentum(player);

    expect(player.z).toBe(IntToFixed(0));
  });
});

describe('overlap recovery (unstick)', () => {
  it('allows sliding out when already overlapping a SOLID mobj', () => {
    const mapData = createDoorwayMap(128);
    const player = createPlayerMobj(IntToFixed(48), IntToFixed(32), IntToFixed(0), 0);
    player.floorz = IntToFixed(0);
    player.ceilingz = IntToFixed(128);

    const barrel: Mobj = {
      x: IntToFixed(40),
      y: IntToFixed(32),
      z: IntToFixed(0),
      angle: 0,
      momx: 0,
      momy: 0,
      momz: 0,
      radius: 16 << 16,
      height: 42 << 16,
      floorz: IntToFixed(0),
      ceilingz: IntToFixed(128),
      flags: MobjFlags.SOLID,
      health: 10,
      type: 9999,
      removed: false,
    };

    // Overlapping (center dist 8 < 32); +x increases separation from barrel — must not soft-lock
    player.momx = IntToFixed(10);
    applyCollision(player, mapData, [barrel]);
    expect(FixedToFloat(player.x)).toBeGreaterThan(48);
  });
});
