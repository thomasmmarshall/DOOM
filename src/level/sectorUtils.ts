import type { MapData, MapNode } from './types';
import { NF_SUBSECTOR } from './types';

/**
 * R_PointOnSide (r_main.c) — which side of a BSP partition the point lies on.
 * Map coordinates are vanilla map units (same as short vertex / thing coords).
 * Returns 0 = front, 1 = back.
 */
export function pointOnBspNode(x: number, y: number, node: MapNode): 0 | 1 {
  if (node.dx === 0) {
    if (x <= node.x) return node.dy > 0 ? 1 : 0;
    return node.dy < 0 ? 1 : 0;
  }
  if (node.dy === 0) {
    if (y <= node.y) return node.dx < 0 ? 1 : 0;
    return node.dx > 0 ? 1 : 0;
  }

  const dx = x - node.x;
  const dy = y - node.y;
  const left = node.dy * dx;
  const right = node.dx * dy;
  if (right < left) return 0;
  return 1;
}

/**
 * R_PointInSubsector (r_main.c) — BSP leaf index for (x, y).
 */
export function findSubsectorAtPoint(x: number, y: number, mapData: MapData): number {
  if (mapData.nodes.length === 0) {
    return 0;
  }

  let nodenum = mapData.nodes.length - 1;

  while ((nodenum & NF_SUBSECTOR) === 0) {
    const node = mapData.nodes[nodenum];
    const side = pointOnBspNode(x, y, node);
    nodenum = node.children[side];
  }

  return nodenum & ~NF_SUBSECTOR;
}

function sectorFromSubsector(subsectorIndex: number, mapData: MapData): number {
  const sub = mapData.subsectors[subsectorIndex];
  if (!sub || sub.numsegs === 0) {
    return -1;
  }

  const seg = mapData.segs[sub.firstseg];
  if (!seg || seg.linedef < 0 || seg.linedef >= mapData.linedefs.length) {
    return -1;
  }

  const linedef = mapData.linedefs[seg.linedef];
  const sidenum = seg.side === 0 ? linedef.sidenum[0] : linedef.sidenum[1];

  if (sidenum < 0 || sidenum >= mapData.sidedefs.length) {
    return -1;
  }

  return mapData.sidedefs[sidenum].sector;
}

/**
 * Fallback when map has no BSP / segs (unit tests, broken lumps): naive ray-cast per sector.
 * Prefer real maps with nodes+subsectors+segs — first matching sector wins (same caveats as before).
 */
function findSectorAtPointRaycast(x: number, y: number, mapData: MapData): number {
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

    if (sectorLines.length === 0) continue;

    let inside = false;
    for (const line of sectorLines) {
      if ((line.y1 > y) !== (line.y2 > y)) {
        const intersectX = (line.x2 - line.x1) * (y - line.y1) / (line.y2 - line.y1) + line.x1;
        if (x < intersectX) inside = !inside;
      }
    }

    if (inside) return sectorIdx;
  }

  return -1;
}

/**
 * Sector at (x, y): vanilla BSP when lumps are present; otherwise ray-cast fallback.
 */
export function findSectorAtPoint(x: number, y: number, mapData: MapData): number {
  const hasBsp =
    mapData.nodes.length > 0 &&
    mapData.subsectors.length > 0 &&
    mapData.segs.length > 0;

  if (hasBsp) {
    const ss = findSubsectorAtPoint(x, y, mapData);
    if (ss >= 0 && ss < mapData.subsectors.length) {
      const sec = sectorFromSubsector(ss, mapData);
      if (sec >= 0) return sec;
    }
  }

  return findSectorAtPointRaycast(x, y, mapData);
}
