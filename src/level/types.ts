/**
 * Map data structures
 * Based on linuxdoom-1.10/doomdata.h
 */

/**
 * Vertex (point in 2D space)
 * Size: 4 bytes
 */
export interface MapVertex {
  x: number; // short (16-bit signed)
  y: number; // short (16-bit signed)
}

/**
 * SideDef - defines visual appearance of a wall
 * Size: 30 bytes
 */
export interface MapSideDef {
  textureoffset: number; // short
  rowoffset: number; // short
  toptexture: string; // char[8]
  bottomtexture: string; // char[8]
  midtexture: string; // char[8]
  sector: number; // short - sector reference
}

/**
 * LineDef - wall definition
 * Size: 14 bytes
 */
export interface MapLineDef {
  v1: number; // short - vertex 1 index
  v2: number; // short - vertex 2 index
  flags: number; // short - line flags
  special: number; // short - special type
  tag: number; // short - sector tag
  sidenum: [number, number]; // short[2] - front/back sidedef indices (-1 if none)
}

// LineDef flags
export const ML_BLOCKING = 1; // Solid, blocks player/enemies
export const ML_BLOCKMONSTERS = 2; // Blocks monsters only
export const ML_TWOSIDED = 4; // Backside will not be present if not two sided
export const ML_DONTPEGTOP = 8; // Upper texture unpegged
export const ML_DONTPEGBOTTOM = 16; // Lower texture unpegged
export const ML_SECRET = 32; // Don't show as two-sided on automap
export const ML_SOUNDBLOCK = 64; // Don't let sound cross
export const ML_DONTDRAW = 128; // Don't draw on automap
export const ML_MAPPED = 256; // Already seen (drawn in automap)

/**
 * Sector - floor/ceiling area definition
 * Size: 26 bytes
 */
export interface MapSector {
  floorheight: number; // short
  ceilingheight: number; // short
  floorpic: string; // char[8] - flat name
  ceilingpic: string; // char[8] - flat name
  lightlevel: number; // short (0-255)
  special: number; // short - sector special type
  tag: number; // short - tag for triggers
}

/**
 * Thing - entity spawn position
 * Size: 10 bytes
 */
export interface MapThing {
  x: number; // short
  y: number; // short
  angle: number; // short (degrees, 0=east, 90=north)
  type: number; // short - thing type
  options: number; // short - spawn flags
}

// Thing spawn flags
export const MTF_EASY = 1; // Spawn in easy difficulty
export const MTF_MEDIUM = 2; // Spawn in medium difficulty
export const MTF_HARD = 4; // Spawn in hard difficulty
export const MTF_AMBUSH = 8; // Deaf enemy (ambush)
export const MTF_MULTIPLAYER = 16; // Multiplayer only

/**
 * Seg - line segment from BSP splitting
 * Size: 12 bytes
 */
export interface MapSeg {
  v1: number; // short - start vertex
  v2: number; // short - end vertex
  angle: number; // short - angle (BAM >> 16)
  linedef: number; // short - linedef reference
  side: number; // short - 0=front, 1=back
  offset: number; // short - distance along linedef
}

/**
 * SubSector - convex region from BSP
 * Size: 4 bytes
 */
export interface MapSubSector {
  numsegs: number; // short - number of segs
  firstseg: number; // short - first seg index
}

/**
 * BSP Node
 * Size: 28 bytes
 */
export interface MapNode {
  x: number; // short - partition line start x
  y: number; // short - partition line start y
  dx: number; // short - partition line delta x
  dy: number; // short - partition line delta y
  bbox: [[number, number, number, number], [number, number, number, number]]; // short[2][4] - bounding boxes for children
  children: [number, number]; // unsigned short[2] - child node/subsector indices
}

// Node child flag - if set, it's a subsector index
export const NF_SUBSECTOR = 0x8000;

/**
 * Complete map data
 */
export interface MapData {
  name: string;
  vertexes: MapVertex[];
  linedefs: MapLineDef[];
  sidedefs: MapSideDef[];
  sectors: MapSector[];
  things: MapThing[];
  segs: MapSeg[];
  subsectors: MapSubSector[];
  nodes: MapNode[];
  blockmap?: Uint16Array;
  reject?: Uint8Array;
}
