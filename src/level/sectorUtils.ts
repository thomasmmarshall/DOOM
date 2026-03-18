import type { MapData } from './types';

export function findSectorAtPoint(x: number, y: number, mapData: MapData): number {
  for (let sectorIdx = 0; sectorIdx < mapData.sectors.length; sectorIdx++) {
    const sectorLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

    for (let i = 0; i < mapData.linedefs.length; i++) {
      const linedef = mapData.linedefs[i];
      const frontSide = linedef.sidenum[0];
      const backSide = linedef.sidenum[1];

      if (frontSide !== -1 && mapData.sidedefs[frontSide].sector === sectorIdx) {
        const v1 = mapData.vertexes[linedef.v1];
        const v2 = mapData.vertexes[linedef.v2];
        sectorLines.push({ x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y });
      } else if (backSide !== -1 && mapData.sidedefs[backSide].sector === sectorIdx) {
        const v1 = mapData.vertexes[linedef.v1];
        const v2 = mapData.vertexes[linedef.v2];
        sectorLines.push({ x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y });
      }
    }

    if (sectorLines.length === 0) {
      continue;
    }

    let inside = false;
    for (const line of sectorLines) {
      if ((line.y1 > y) !== (line.y2 > y)) {
        const intersectX = (line.x2 - line.x1) * (y - line.y1) / (line.y2 - line.y1) + line.x1;
        if (x < intersectX) {
          inside = !inside;
        }
      }
    }

    if (inside) {
      return sectorIdx;
    }
  }

  return -1;
}
