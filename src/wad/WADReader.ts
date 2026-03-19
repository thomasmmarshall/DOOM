/**
 * WAD File Reader
 * Based on linuxdoom-1.10/w_wad.c
 *
 * Reads DOOM WAD files and provides access to lumps.
 */

import type { WadInfo, LumpInfo } from './types';

/**
 * Sort map lump names in playable order (E1M1…E1M9, E2M1…, then MAP01…).
 * Plain string sort breaks ordering for multi-digit mission numbers (e.g. E1M2 vs E1M10).
 */
export function compareDoomMapNames(a: string, b: string): number {
  const ua = a.toUpperCase();
  const ub = b.toUpperCase();

  const ea = /^E(\d+)M(\d+)$/.exec(ua);
  const eb = /^E(\d+)M(\d+)$/.exec(ub);
  if (ea && eb) {
    const epDiff = parseInt(ea[1], 10) - parseInt(eb[1], 10);
    if (epDiff !== 0) return epDiff;
    return parseInt(ea[2], 10) - parseInt(eb[2], 10);
  }

  const ma = /^MAP(\d+)$/.exec(ua);
  const mb = /^MAP(\d+)$/.exec(ub);
  if (ma && mb) {
    return parseInt(ma[1], 10) - parseInt(mb[1], 10);
  }

  return ua.localeCompare(ub);
}

export class WADReader {
  private buffer: ArrayBuffer;
  private view: DataView;
  private header: WadInfo;
  private lumps: Map<string, LumpInfo>;
  private lumpArray: LumpInfo[];

  constructor(arrayBuffer: ArrayBuffer) {
    this.buffer = arrayBuffer;
    this.view = new DataView(arrayBuffer);
    this.lumps = new Map();
    this.lumpArray = [];

    // Parse WAD file
    this.header = this.parseHeader();
    this.parseLumpDirectory();
  }

  /**
   * Parse WAD header (12 bytes)
   */
  private parseHeader(): WadInfo {
    // Read identification (4 bytes)
    const idBytes = new Uint8Array(this.buffer, 0, 4);
    const identification = String.fromCharCode(...idBytes);

    if (identification !== 'IWAD' && identification !== 'PWAD') {
      throw new Error(`Invalid WAD file: expected IWAD or PWAD, got ${identification}`);
    }

    // Read numlumps (4 bytes, little-endian int32)
    const numlumps = this.view.getInt32(4, true);

    // Read infotableofs (4 bytes, little-endian int32)
    const infotableofs = this.view.getInt32(8, true);

    console.log(`WAD Type: ${identification}`);
    console.log(`Lumps: ${numlumps}`);
    console.log(`Directory offset: ${infotableofs}`);

    return { identification, numlumps, infotableofs };
  }

  /**
   * Parse lump directory
   * Each entry is 16 bytes:
   * - filepos (4 bytes, int32)
   * - size (4 bytes, int32)
   * - name (8 bytes, char[8])
   */
  private parseLumpDirectory(): void {
    let offset = this.header.infotableofs;

    for (let i = 0; i < this.header.numlumps; i++) {
      // Read filepos
      const filepos = this.view.getInt32(offset, true);
      offset += 4;

      // Read size
      const size = this.view.getInt32(offset, true);
      offset += 4;

      // Read name (8 bytes, null-terminated or space-padded)
      const nameBytes = new Uint8Array(this.buffer, offset, 8);
      let name = '';
      for (let j = 0; j < 8; j++) {
        if (nameBytes[j] === 0) break;
        name += String.fromCharCode(nameBytes[j]);
      }
      name = name.trim().toUpperCase();
      offset += 8;

      const lumpInfo: LumpInfo = {
        filepos,
        size,
        name,
      };

      this.lumpArray.push(lumpInfo);

      // Store in map (later entries with same name override earlier ones)
      this.lumps.set(name, lumpInfo);
    }

    console.log(`Parsed ${this.lumpArray.length} lumps`);
  }

  /**
   * Get lump by name
   */
  public getLump(name: string): LumpInfo | undefined {
    return this.lumps.get(name.toUpperCase());
  }

  /**
   * Get lump by index
   */
  public getLumpByIndex(index: number): LumpInfo | undefined {
    return this.lumpArray[index];
  }

  /**
   * Read lump data
   */
  public readLump(name: string): ArrayBuffer | undefined {
    const lump = this.getLump(name);
    if (!lump) {
      console.warn(`Lump not found: ${name}`);
      return undefined;
    }

    return this.readLumpData(lump);
  }

  /**
   * Read lump data by lump info
   */
  public readLumpData(lump: LumpInfo): ArrayBuffer {
    // Return cached data if available
    if (lump.data) {
      return lump.data;
    }

    // Read from buffer
    lump.data = this.buffer.slice(lump.filepos, lump.filepos + lump.size);
    return lump.data;
  }

  /**
   * Check if lump exists
   */
  public hasLump(name: string): boolean {
    return this.lumps.has(name.toUpperCase());
  }

  /**
   * Get all lump names
   */
  public getLumpNames(): string[] {
    return Array.from(this.lumps.keys());
  }

  /**
   * Get WAD info
   */
  public getInfo(): WadInfo {
    return this.header;
  }

  /**
   * Get complete lump directory
   */
  public getDirectory(): LumpInfo[] {
    return this.lumpArray;
  }

  /**
   * Find map marker lump (E1M1, E1M2, MAP01, etc.)
   * Scans the directory in order (lumpArray). The name→lump map drops earlier lumps when
   * names repeat, so we must not rely on this.lumps.keys() or we'd miss valid maps.
   */
  public findMapLumps(): string[] {
    const seen = new Set<string>();
    const mapNames: string[] = [];

    for (const lump of this.lumpArray) {
      const name = lump.name;
      const isEpisode = /^E\d+M\d+$/.test(name);
      const isDoom2 = /^MAP\d\d$/.test(name);
      if ((isEpisode || isDoom2) && !seen.has(name)) {
        seen.add(name);
        mapNames.push(name);
      }
    }

    return mapNames.sort(compareDoomMapNames);
  }

  /**
   * Get lumps for a specific map
   * Returns the 11 lumps that make up a map (in order):
   * 1. Label (ExMx or MAPxx)
   * 2. THINGS
   * 3. LINEDEFS
   * 4. SIDEDEFS
   * 5. VERTEXES
   * 6. SEGS
   * 7. SSECTORS
   * 8. NODES
   * 9. SECTORS
   * 10. REJECT
   * 11. BLOCKMAP
   */
  public getMapLumps(mapName: string): LumpInfo[] | undefined {
    const upperName = mapName.toUpperCase();
    const mapIndex = this.lumpArray.findIndex(lump => lump.name === upperName);

    if (mapIndex === -1) {
      return undefined;
    }

    // Return the marker lump + next 10 lumps
    return this.lumpArray.slice(mapIndex, mapIndex + 11);
  }
}
