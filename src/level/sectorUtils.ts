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
 * Sector at map point — vanilla uses BSP (subsector), not polygon tests on linedefs.
 */
export function findSectorAtPoint(x: number, y: number, mapData: MapData): number {
  const ss = findSubsectorAtPoint(x, y, mapData);
  if (ss < 0 || ss >= mapData.subsectors.length) {
    return -1;
  }
  return sectorFromSubsector(ss, mapData);
}
