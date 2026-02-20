/**
 * DOOM Map Parser
 * Parses map lumps into structured data
 * Based on linuxdoom-1.10/p_setup.c
 */

import type {
  MapData,
  MapVertex,
  MapLineDef,
  MapSideDef,
  MapSector,
  MapThing,
  MapSeg,
  MapSubSector,
  MapNode,
} from './types';
import { NF_SUBSECTOR } from './types';
import type { LumpInfo } from '../wad';

export class MapParser {
  /**
   * Parse VERTEXES lump
   * Each vertex is 4 bytes: x (short), y (short)
   */
  static parseVertexes(data: ArrayBuffer): MapVertex[] {
    const view = new DataView(data);
    const count = data.byteLength / 4;
    const vertexes: MapVertex[] = [];

    for (let i = 0; i < count; i++) {
      const offset = i * 4;
      vertexes.push({
        x: view.getInt16(offset, true),
        y: view.getInt16(offset + 2, true),
      });
    }

    return vertexes;
  }

  /**
   * Parse LINEDEFS lump
   * Each linedef is 14 bytes
   */
  static parseLineDefs(data: ArrayBuffer): MapLineDef[] {
    const view = new DataView(data);
    const count = data.byteLength / 14;
    const linedefs: MapLineDef[] = [];

    for (let i = 0; i < count; i++) {
      const offset = i * 14;
      linedefs.push({
        v1: view.getInt16(offset, true),
        v2: view.getInt16(offset + 2, true),
        flags: view.getInt16(offset + 4, true),
        special: view.getInt16(offset + 6, true),
        tag: view.getInt16(offset + 8, true),
        sidenum: [
          view.getInt16(offset + 10, true),
          view.getInt16(offset + 12, true),
        ],
      });
    }

    return linedefs;
  }

  /**
   * Parse SIDEDEFS lump
   * Each sidedef is 30 bytes
   */
  static parseSideDefs(data: ArrayBuffer): MapSideDef[] {
    const view = new DataView(data);
    const bytes = new Uint8Array(data);
    const count = data.byteLength / 30;
    const sidedefs: MapSideDef[] = [];

    for (let i = 0; i < count; i++) {
      const offset = i * 30;

      sidedefs.push({
        textureoffset: view.getInt16(offset, true),
        rowoffset: view.getInt16(offset + 2, true),
        toptexture: this.readString(bytes, offset + 4, 8),
        bottomtexture: this.readString(bytes, offset + 12, 8),
        midtexture: this.readString(bytes, offset + 20, 8),
        sector: view.getInt16(offset + 28, true),
      });
    }

    return sidedefs;
  }

  /**
   * Parse SECTORS lump
   * Each sector is 26 bytes
   */
  static parseSectors(data: ArrayBuffer): MapSector[] {
    const view = new DataView(data);
    const bytes = new Uint8Array(data);
    const count = data.byteLength / 26;
    const sectors: MapSector[] = [];

    for (let i = 0; i < count; i++) {
      const offset = i * 26;

      sectors.push({
        floorheight: view.getInt16(offset, true),
        ceilingheight: view.getInt16(offset + 2, true),
        floorpic: this.readString(bytes, offset + 4, 8),
        ceilingpic: this.readString(bytes, offset + 12, 8),
        lightlevel: view.getInt16(offset + 20, true),
        special: view.getInt16(offset + 22, true),
        tag: view.getInt16(offset + 24, true),
      });
    }

    return sectors;
  }

  /**
   * Parse THINGS lump
   * Each thing is 10 bytes
   */
  static parseThings(data: ArrayBuffer): MapThing[] {
    const view = new DataView(data);
    const count = data.byteLength / 10;
    const things: MapThing[] = [];

    for (let i = 0; i < count; i++) {
      const offset = i * 10;

      things.push({
        x: view.getInt16(offset, true),
        y: view.getInt16(offset + 2, true),
        angle: view.getInt16(offset + 4, true),
        type: view.getInt16(offset + 6, true),
        options: view.getInt16(offset + 8, true),
      });
    }

    return things;
  }

  /**
   * Parse SEGS lump
   * Each seg is 12 bytes
   */
  static parseSegs(data: ArrayBuffer): MapSeg[] {
    const view = new DataView(data);
    const count = data.byteLength / 12;
    const segs: MapSeg[] = [];

    for (let i = 0; i < count; i++) {
      const offset = i * 12;

      segs.push({
        v1: view.getInt16(offset, true),
        v2: view.getInt16(offset + 2, true),
        angle: view.getInt16(offset + 4, true),
        linedef: view.getInt16(offset + 6, true),
        side: view.getInt16(offset + 8, true),
        offset: view.getInt16(offset + 10, true),
      });
    }

    return segs;
  }

  /**
   * Parse SSECTORS (subsectors) lump
   * Each subsector is 4 bytes
   */
  static parseSubSectors(data: ArrayBuffer): MapSubSector[] {
    const view = new DataView(data);
    const count = data.byteLength / 4;
    const subsectors: MapSubSector[] = [];

    for (let i = 0; i < count; i++) {
      const offset = i * 4;

      subsectors.push({
        numsegs: view.getInt16(offset, true),
        firstseg: view.getInt16(offset + 2, true),
      });
    }

    return subsectors;
  }

  /**
   * Parse NODES lump
   * Each node is 28 bytes
   */
  static parseNodes(data: ArrayBuffer): MapNode[] {
    const view = new DataView(data);
    const count = data.byteLength / 28;
    const nodes: MapNode[] = [];

    for (let i = 0; i < count; i++) {
      const offset = i * 28;

      nodes.push({
        x: view.getInt16(offset, true),
        y: view.getInt16(offset + 2, true),
        dx: view.getInt16(offset + 4, true),
        dy: view.getInt16(offset + 6, true),
        bbox: [
          [
            view.getInt16(offset + 8, true),
            view.getInt16(offset + 10, true),
            view.getInt16(offset + 12, true),
            view.getInt16(offset + 14, true),
          ],
          [
            view.getInt16(offset + 16, true),
            view.getInt16(offset + 18, true),
            view.getInt16(offset + 20, true),
            view.getInt16(offset + 22, true),
          ],
        ],
        children: [
          view.getUint16(offset + 24, true),
          view.getUint16(offset + 26, true),
        ],
      });
    }

    return nodes;
  }

  /**
   * Parse BLOCKMAP lump
   * Block map is a grid for fast collision detection
   */
  static parseBlockmap(data: ArrayBuffer): Uint16Array {
    return new Uint16Array(data);
  }

  /**
   * Parse REJECT lump
   * Reject table for sector visibility optimization
   */
  static parseReject(data: ArrayBuffer): Uint8Array {
    return new Uint8Array(data);
  }

  /**
   * Helper: Read a null-terminated or space-padded string
   */
  private static readString(bytes: Uint8Array, offset: number, length: number): string {
    let str = '';
    for (let i = 0; i < length; i++) {
      const byte = bytes[offset + i];
      if (byte === 0) break;
      str += String.fromCharCode(byte);
    }
    return str.trim().toUpperCase();
  }

  /**
   * Parse all map lumps
   */
  static parseMap(mapName: string, lumps: LumpInfo[], wadReader: any): MapData {
    // lumps array should be:
    // [0] = marker (ExMx or MAPxx)
    // [1] = THINGS
    // [2] = LINEDEFS
    // [3] = SIDEDEFS
    // [4] = VERTEXES
    // [5] = SEGS
    // [6] = SSECTORS
    // [7] = NODES
    // [8] = SECTORS
    // [9] = REJECT
    // [10] = BLOCKMAP

    const mapData: MapData = {
      name: mapName,
      vertexes: [],
      linedefs: [],
      sidedefs: [],
      sectors: [],
      things: [],
      segs: [],
      subsectors: [],
      nodes: [],
    };

    // Parse each lump
    const thingsData = wadReader.readLumpData(lumps[1]);
    mapData.things = this.parseThings(thingsData);

    const linedefsData = wadReader.readLumpData(lumps[2]);
    mapData.linedefs = this.parseLineDefs(linedefsData);

    const sidedefsData = wadReader.readLumpData(lumps[3]);
    mapData.sidedefs = this.parseSideDefs(sidedefsData);

    const vertexesData = wadReader.readLumpData(lumps[4]);
    mapData.vertexes = this.parseVertexes(vertexesData);

    const segsData = wadReader.readLumpData(lumps[5]);
    mapData.segs = this.parseSegs(segsData);

    const subsectorsData = wadReader.readLumpData(lumps[6]);
    mapData.subsectors = this.parseSubSectors(subsectorsData);

    const nodesData = wadReader.readLumpData(lumps[7]);
    mapData.nodes = this.parseNodes(nodesData);

    const sectorsData = wadReader.readLumpData(lumps[8]);
    mapData.sectors = this.parseSectors(sectorsData);

    if (lumps[9] && lumps[9].size > 0) {
      const rejectData = wadReader.readLumpData(lumps[9]);
      mapData.reject = this.parseReject(rejectData);
    }

    if (lumps[10] && lumps[10].size > 0) {
      const blockmapData = wadReader.readLumpData(lumps[10]);
      mapData.blockmap = this.parseBlockmap(blockmapData);
    }

    console.log(`Parsed map ${mapName}:`);
    console.log(`  Vertices: ${mapData.vertexes.length}`);
    console.log(`  LineDefs: ${mapData.linedefs.length}`);
    console.log(`  SideDefs: ${mapData.sidedefs.length}`);
    console.log(`  Sectors: ${mapData.sectors.length}`);
    console.log(`  Things: ${mapData.things.length}`);
    console.log(`  Segs: ${mapData.segs.length}`);
    console.log(`  Subsectors: ${mapData.subsectors.length}`);
    console.log(`  Nodes: ${mapData.nodes.length}`);

    return mapData;
  }
}
