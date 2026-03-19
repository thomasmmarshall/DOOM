/**
 * Blockmap spatial traversal for line traces (linuxdoom P_PathTraverse / intercepts).
 * Coordinates are map units (same as WAD vertices / mobj positions).
 */

import type { Mobj } from '../game/mobj';
import { MobjFlags } from '../game/mobj';
import { FixedToFloat } from '../core/fixed';
import type { MapData } from './types';

export const MAP_BLOCK_UNITS = 128;

/** BLOCKMAP lump: orgX, orgY, width, height, then width*height offsets into lump for line lists. */
export interface BlockmapView {
  lump: Uint16Array;
  orgX: number;
  orgY: number;
  width: number;
  height: number;
}

export function getBlockmapView(blockmap: Uint16Array | undefined): BlockmapView | undefined {
  if (!blockmap || blockmap.length < 4) return undefined;
  return {
    lump: blockmap,
    orgX: blockmap[0],
    orgY: blockmap[1],
    width: blockmap[2],
    height: blockmap[3],
  };
}

export function linedefIndicesInBlock(bm: BlockmapView, bx: number, by: number, out: number[]): void {
  if (bx < 0 || by < 0 || bx >= bm.width || by >= bm.height) return;
  const gridIdx = by * bm.width + bx;
  let o = bm.lump[4 + gridIdx];
  const cap = bm.lump.length;
  for (;;) {
    if (o >= cap) break;
    const v = bm.lump[o];
    if (v === 0xffff) break;
    out.push(v);
    o++;
  }
}

/**
 * Visit each map block intersected by segment (x0,y0)→(x1,y1) (Amanatides & Woo-style DDA).
 */
export function forEachBlockOnSegment(
  orgX: number,
  orgY: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  visit: (bx: number, by: number) => void
): void {
  const C = MAP_BLOCK_UNITS;
  const dirX = x1 - x0;
  const dirY = y1 - y0;
  if (Math.hypot(dirX, dirY) < 1e-9) {
    visit(Math.floor((x0 - orgX) / C), Math.floor((y0 - orgY) / C));
    return;
  }

  const nudge = (v: number, o: number): number => {
    const r = v - o;
    const k = r / C;
    return Math.abs(k - Math.round(k)) < 1e-9 ? v + 0.001 : v;
  };
  const sx = nudge(x0, orgX);
  const sy = nudge(y0, orgY);

  let bx = Math.floor((sx - orgX) / C);
  let by = Math.floor((sy - orgY) / C);

  const stepX = dirX >= 0 ? 1 : -1;
  const stepY = dirY >= 0 ? 1 : -1;

  const nextXBoundary = dirX >= 0 ? (bx + 1) * C + orgX : bx * C + orgX;
  const nextYBoundary = dirY >= 0 ? (by + 1) * C + orgY : by * C + orgY;

  let tMaxX = dirX !== 0 ? (nextXBoundary - sx) / dirX : Number.POSITIVE_INFINITY;
  let tMaxY = dirY !== 0 ? (nextYBoundary - sy) / dirY : Number.POSITIVE_INFINITY;

  const tDeltaX = dirX !== 0 ? C / Math.abs(dirX) : Number.POSITIVE_INFINITY;
  const tDeltaY = dirY !== 0 ? C / Math.abs(dirY) : Number.POSITIVE_INFINITY;

  const maxT = 1;
  const bxEnd = Math.floor((x1 - orgX) / C);
  const byEnd = Math.floor((y1 - orgY) / C);
  const guardMax = Math.abs(bxEnd - bx) + Math.abs(byEnd - by) + 48;
  let guard = 0;

  visit(bx, by);
  while ((tMaxX <= maxT || tMaxY <= maxT) && guard++ < guardMax) {
    if (tMaxX < tMaxY) {
      tMaxX += tDeltaX;
      bx += stepX;
    } else {
      tMaxY += tDeltaY;
      by += stepY;
    }
    visit(bx, by);
  }
}

export function segmentLineIntersectFrac(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  vx1: number,
  vy1: number,
  vx2: number,
  vy2: number
): number | undefined {
  const dx = ex - sx;
  const dy = ey - sy;
  const segDx = vx2 - vx1;
  const segDy = vy2 - vy1;
  const denom = dx * segDy - dy * segDx;
  if (Math.abs(denom) < 1e-10) return undefined;
  const t = ((vx1 - sx) * segDy - (vy1 - sy) * segDx) / denom;
  const u = ((sx - vx1) * dy - (sy - vy1) * dx) / -denom;
  if (t < 0 || u < 0 || u > 1) return undefined;
  return t;
}

export function lineOpening(
  mapData: MapData,
  lineIndex: number
): { openBottom: number; openTop: number } | null {
  const line = mapData.linedefs[lineIndex];
  if (line.sidenum[1] === -1) return null;
  const front = mapData.sectors[mapData.sidedefs[line.sidenum[0]].sector];
  const back = mapData.sectors[mapData.sidedefs[line.sidenum[1]].sector];
  const openTop = front.ceilingheight < back.ceilingheight ? front.ceilingheight : back.ceilingheight;
  const openBottom = front.floorheight > back.floorheight ? front.floorheight : back.floorheight;
  if (openTop <= openBottom) return null;
  return { openBottom, openTop };
}

function pointOnLineSide(px: number, py: number, lx0: number, ly0: number, lx1: number, ly1: number): number {
  const n = (lx1 - lx0) * (py - ly0) - (ly1 - ly0) * (px - lx0);
  return n < 0 ? 0 : n > 0 ? 1 : 0;
}

function pointOnDivlineSide(px: number, py: number, lx: number, ly: number, ldx: number, ldy: number): number {
  const n = ldx * (py - ly) - ldy * (px - lx);
  return n < 0 ? 0 : n > 0 ? 1 : 0;
}

/** PIT_AddLineIntercepts — t ∈ [0,1] along shot segment, or undefined if not crossed. */
export function linedefTraceCrossingT(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  mapData: MapData,
  lineIndex: number
): number | undefined {
  const line = mapData.linedefs[lineIndex];
  const v1 = mapData.vertexes[line.v1];
  const v2 = mapData.vertexes[line.v2];
  const vx1 = v1.x;
  const vy1 = v1.y;
  const vx2 = v2.x;
  const vy2 = v2.y;

  const tdx = ex - sx;
  const tdy = ey - sy;
  const bigTrace = Math.abs(tdx) > 16 || Math.abs(tdy) > 16;
  let s1: number;
  let s2: number;
  if (bigTrace) {
    s1 = pointOnDivlineSide(vx1, vy1, sx, sy, tdx, tdy);
    s2 = pointOnDivlineSide(vx2, vy2, sx, sy, tdx, tdy);
  } else {
    s1 = pointOnLineSide(sx, sy, vx1, vy1, vx2, vy2);
    s2 = pointOnLineSide(ex, ey, vx1, vy1, vx2, vy2);
  }
  if (s1 === s2) return undefined;
  return segmentLineIntersectFrac(sx, sy, ex, ey, vx1, vy1, vx2, vy2);
}

/**
 * PIT_AddThingIntercepts — crossing with thing bbox diagonal (FixedMul(trace.dx,trace.dy)>0 in id).
 */
export function thingTraceCrossingT(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  tx: number,
  ty: number,
  radius: number
): number | undefined {
  const tdx = ex - sx;
  const tdy = ey - sy;
  const tracePositive = tdx * tdy > 0;
  let x1: number;
  let y1: number;
  let x2: number;
  let y2: number;
  if (tracePositive) {
    x1 = tx - radius;
    y1 = ty + radius;
    x2 = tx + radius;
    y2 = ty - radius;
  } else {
    x1 = tx - radius;
    y1 = ty - radius;
    x2 = tx + radius;
    y2 = ty + radius;
  }
  const s1 = pointOnDivlineSide(x1, y1, sx, sy, tdx, tdy);
  const s2 = pointOnDivlineSide(x2, y2, sx, sy, tdx, tdy);
  if (s1 === s2) return undefined;
  return segmentLineIntersectFrac(sx, sy, ex, ey, x1, y1, x2, y2);
}

export type TraceIntercept =
  | { kind: 'line'; lineIndex: number; t: number }
  | { kind: 'thing'; thing: Mobj; t: number };

const lineScratch: number[] = [];

/**
 * Collect line + thing intercepts (sorted by t along segment).
 * Uses BLOCKMAP when present; otherwise scans all linedefs.
 */
export function collectShootIntercepts(
  mapData: MapData,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  source: Mobj | undefined,
  things: Mobj[],
  blockmap: BlockmapView | undefined
): TraceIntercept[] {
  const out: TraceIntercept[] = [];
  const lineSeen = new Set<number>();
  const maxLine = mapData.linedefs.length;

  const tryLine = (li: number) => {
    if (li < 0 || li >= maxLine || lineSeen.has(li)) return;
    const t = linedefTraceCrossingT(sx, sy, ex, ey, mapData, li);
    if (t === undefined || t < 0 || t > 1) return;
    lineSeen.add(li);
    out.push({ kind: 'line', lineIndex: li, t });
  };

  if (blockmap) {
    forEachBlockOnSegment(blockmap.orgX, blockmap.orgY, sx, sy, ex, ey, (bx, by) => {
      lineScratch.length = 0;
      linedefIndicesInBlock(blockmap, bx, by, lineScratch);
      for (const li of lineScratch) tryLine(li);
    });
  } else {
    for (let li = 0; li < maxLine; li++) tryLine(li);
  }

  for (const th of things) {
    if (source !== undefined && th === source) continue;
    if (!(th.flags & MobjFlags.SHOOTABLE)) continue;
    if (th.health <= 0) continue;
    const tx = FixedToFloat(th.x);
    const ty = FixedToFloat(th.y);
    const tr = FixedToFloat(th.radius);
    const t = thingTraceCrossingT(sx, sy, ex, ey, tx, ty, tr);
    if (t === undefined || t < 0 || t > 1) continue;
    out.push({ kind: 'thing', thing: th, t });
  }

  out.sort((a, b) => a.t - b.t);
  return out;
}
