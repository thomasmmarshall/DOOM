/**
 * WAD file format types
 * Based on linuxdoom-1.10/w_wad.h
 */

/**
 * WAD file header
 * Total size: 12 bytes
 */
export interface WadInfo {
  /** 'IWAD' or 'PWAD' */
  identification: string;
  /** Number of lumps in the directory */
  numlumps: number;
  /** Byte offset to lump directory */
  infotableofs: number;
}

/**
 * Lump directory entry
 * Total size: 16 bytes
 */
export interface FileLump {
  /** Byte position in file */
  filepos: number;
  /** Size in bytes */
  size: number;
  /** ASCII name, up to 8 characters */
  name: string;
}

/**
 * Lump info with data
 */
export interface LumpInfo extends FileLump {
  /** Cached lump data */
  data?: ArrayBuffer;
}
