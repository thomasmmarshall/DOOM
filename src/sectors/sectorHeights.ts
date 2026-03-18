import type { MapData } from '../level/types';

function getAdjacentSectorIndices(mapData: MapData, sectorIndex: number): number[] {
  const indices = new Set<number>();

  for (const linedef of mapData.linedefs) {
    const frontSide = linedef.sidenum[0];
    const backSide = linedef.sidenum[1];
    if (frontSide === -1 || backSide === -1) {
      continue;
    }

    const frontSector = mapData.sidedefs[frontSide].sector;
    const backSector = mapData.sidedefs[backSide].sector;

    if (frontSector === sectorIndex && backSector !== sectorIndex) {
      indices.add(backSector);
    } else if (backSector === sectorIndex && frontSector !== sectorIndex) {
      indices.add(frontSector);
    }
  }

  return [...indices];
}

export function findLowestNeighborFloor(mapData: MapData, sectorIndex: number): number {
  const sector = mapData.sectors[sectorIndex];
  let height = sector.floorheight;

  for (const neighborIndex of getAdjacentSectorIndices(mapData, sectorIndex)) {
    height = Math.min(height, mapData.sectors[neighborIndex].floorheight);
  }

  return height;
}

export function findNextHighestNeighborFloor(mapData: MapData, sectorIndex: number): number {
  const sector = mapData.sectors[sectorIndex];
  const higherHeights = getAdjacentSectorIndices(mapData, sectorIndex)
    .map((index) => mapData.sectors[index].floorheight)
    .filter((height) => height > sector.floorheight)
    .sort((a, b) => a - b);

  return higherHeights[0] ?? sector.floorheight;
}

export function findLowestNeighborCeiling(mapData: MapData, sectorIndex: number): number {
  let height = Number.MAX_SAFE_INTEGER;

  for (const neighborIndex of getAdjacentSectorIndices(mapData, sectorIndex)) {
    height = Math.min(height, mapData.sectors[neighborIndex].ceilingheight);
  }

  return height === Number.MAX_SAFE_INTEGER ? mapData.sectors[sectorIndex].ceilingheight : height;
}

export function findSectorsByTag(mapData: MapData, tag: number): number[] {
  const matches: number[] = [];

  for (let i = 0; i < mapData.sectors.length; i++) {
    if (mapData.sectors[i].tag === tag) {
      matches.push(i);
    }
  }

  return matches;
}

export function findBackSectorForLine(mapData: MapData, lineIndex: number): number | null {
  const line = mapData.linedefs[lineIndex];
  if (!line || line.sidenum[1] === -1) {
    return null;
  }

  return mapData.sidedefs[line.sidenum[1]].sector;
}
