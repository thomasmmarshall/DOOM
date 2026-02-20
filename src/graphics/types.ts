/**
 * Graphics data structures
 * Based on linuxdoom-1.10/r_defs.h and r_data.c
 */

/**
 * Palette - 256 RGB colors (768 bytes total)
 */
export type Palette = Uint8Array; // 256 * 3 bytes

/**
 * Colormap - 256 light levels, each mapping 256 colors to 256 colors
 * DOOM uses 34 colormaps (32 light levels + 2 special)
 */
export type Colormap = Uint8Array; // 34 * 256 bytes

/**
 * Patch header
 * Total size: 8 bytes + (width * 4) bytes for column offsets
 */
export interface PatchHeader {
  width: number; // short
  height: number; // short
  leftoffset: number; // short
  topoffset: number; // short
  columnofs: number[]; // int[width] - offsets to column data
}

/**
 * Post - a run of pixels in a column
 */
export interface Post {
  topdelta: number; // Row start (255 = end marker)
  length: number; // Number of pixels
  data: Uint8Array; // Pixel indices into palette
}

/**
 * Column - a vertical strip of posts
 */
export interface Column {
  posts: Post[];
}

/**
 * Decoded patch data (RGBA)
 */
export interface DecodedPatch {
  width: number;
  height: number;
  leftoffset: number;
  topoffset: number;
  pixels: Uint8ClampedArray; // RGBA data
}

/**
 * Texture definition from TEXTURE1/TEXTURE2
 */
export interface MapTexture {
  name: string; // char[8]
  masked: boolean;
  width: number; // short
  height: number; // short
  patchcount: number; // short
  patches: TexturePatch[];
}

/**
 * Patch reference in a texture
 */
export interface TexturePatch {
  originx: number; // short
  originy: number; // short
  patch: number; // short - index into PNAMES
  stepdir: number; // short (unused in DOOM)
  colormap: number; // short (unused in DOOM)
}
