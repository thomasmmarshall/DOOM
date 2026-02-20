/**
 * Sector (Floor/Ceiling) Geometry Builder
 * Converts DOOM sectors into three.js floor and ceiling meshes
 * Based on linuxdoom-1.10/r_plane.c
 */

import * as THREE from 'three';
import type { MapData, MapVertex } from '../level/types';
import { doomToThree } from '../core';

export interface SectorGeometry {
  floorGeometry?: THREE.BufferGeometry;
  ceilingGeometry?: THREE.BufferGeometry;
  floorTexture: string;
  ceilingTexture: string;
  lightLevel: number;
}

export class SectorBuilder {
  /**
   * Build all sector geometries (floors and ceilings)
   * Uses subsectors from BSP tree for proper triangulation
   */
  static buildSectors(mapData: MapData): SectorGeometry[] {
    const sectors: SectorGeometry[] = [];

    // First, map subsectors to their sectors
    const subsectorToSector = this.mapSubsectorsToSectors(mapData);

    // Group subsectors by sector
    const sectorSubsectors = new Map<number, number[]>();
    for (let i = 0; i < mapData.subsectors.length; i++) {
      const sectorIdx = subsectorToSector[i];
      if (sectorIdx >= 0) {
        if (!sectorSubsectors.has(sectorIdx)) {
          sectorSubsectors.set(sectorIdx, []);
        }
        sectorSubsectors.get(sectorIdx)!.push(i);
      }
    }

    // Build geometry for each sector using its subsectors
    for (let i = 0; i < mapData.sectors.length; i++) {
      const sector = mapData.sectors[i];
      const subsectors = sectorSubsectors.get(i) || [];

      if (subsectors.length === 0) {
        console.warn(`Sector ${i} has no subsectors`);
        sectors.push({
          floorTexture: sector.floorpic,
          ceilingTexture: sector.ceilingpic,
          lightLevel: sector.lightlevel,
        });
        continue;
      }

      // Collect all vertices from subsectors
      const vertices: MapVertex[] = [];
      for (const subsectorIdx of subsectors) {
        const subsector = mapData.subsectors[subsectorIdx];
        for (let j = 0; j < subsector.numsegs; j++) {
          const seg = mapData.segs[subsector.firstseg + j];
          vertices.push(mapData.vertexes[seg.v1]);
        }
      }

      if (vertices.length < 3) {
        console.warn(`Sector ${i} has insufficient vertices`);
        sectors.push({
          floorTexture: sector.floorpic,
          ceilingTexture: sector.ceilingpic,
          lightLevel: sector.lightlevel,
        });
        continue;
      }

      // Create floor and ceiling geometry
      const floorGeometry = this.createFlatGeometryFromSubsectors(
        mapData,
        subsectors,
        sector.floorheight,
        false
      );

      const ceilingGeometry = this.createFlatGeometryFromSubsectors(
        mapData,
        subsectors,
        sector.ceilingheight,
        true
      );

      sectors.push({
        floorGeometry,
        ceilingGeometry,
        floorTexture: sector.floorpic,
        ceilingTexture: sector.ceilingpic,
        lightLevel: sector.lightlevel,
      });
    }

    return sectors;
  }

  /**
   * Map each subsector to its sector index
   */
  private static mapSubsectorsToSectors(mapData: MapData): number[] {
    const result: number[] = new Array(mapData.subsectors.length).fill(-1);

    for (let i = 0; i < mapData.subsectors.length; i++) {
      const subsector = mapData.subsectors[i];
      if (subsector.numsegs === 0) continue;

      const firstSeg = mapData.segs[subsector.firstseg];
      if (firstSeg.linedef === -1 || firstSeg.linedef === 0xFFFF) {
        continue; // No linedef (miniseg)
      }

      const linedef = mapData.linedefs[firstSeg.linedef];
      const sidenum = linedef.sidenum[firstSeg.side];

      if (sidenum !== -1 && sidenum !== 0xFFFF) {
        const sidedef = mapData.sidedefs[sidenum];
        result[i] = sidedef.sector;
      }
    }

    return result;
  }

  /**
   * Create geometry from subsectors (convex polygons from BSP)
   */
  private static createFlatGeometryFromSubsectors(
    mapData: MapData,
    subsectors: number[],
    height: number,
    faceDown: boolean
  ): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];

    const normal = faceDown
      ? new THREE.Vector3(0, -1, 0)
      : new THREE.Vector3(0, 1, 0);

    // Process each subsector (each is a convex polygon)
    for (const subsectorIdx of subsectors) {
      const subsector = mapData.subsectors[subsectorIdx];
      const verts: MapVertex[] = [];

      // Collect vertices for this subsector
      for (let i = 0; i < subsector.numsegs; i++) {
        const seg = mapData.segs[subsector.firstseg + i];
        verts.push(mapData.vertexes[seg.v1]);
      }

      if (verts.length < 3) continue;

      // Fan triangulation for convex polygon (subsectors are always convex)
      for (let i = 1; i < verts.length - 1; i++) {
        const v0 = verts[0];
        const v1 = verts[i];
        const v2 = verts[i + 1];

        const p0 = doomToThree(v0.x, v0.y, height);
        const p1 = doomToThree(v1.x, v1.y, height);
        const p2 = doomToThree(v2.x, v2.y, height);

        if (faceDown) {
          positions.push(p0.x, p0.y, p0.z);
          positions.push(p2.x, p2.y, p2.z);
          positions.push(p1.x, p1.y, p1.z);

          uvs.push(v0.x / 64, v0.y / 64);
          uvs.push(v2.x / 64, v2.y / 64);
          uvs.push(v1.x / 64, v1.y / 64);
        } else {
          positions.push(p0.x, p0.y, p0.z);
          positions.push(p1.x, p1.y, p1.z);
          positions.push(p2.x, p2.y, p2.z);

          uvs.push(v0.x / 64, v0.y / 64);
          uvs.push(v1.x / 64, v1.y / 64);
          uvs.push(v2.x / 64, v2.y / 64);
        }

        normals.push(normal.x, normal.y, normal.z);
        normals.push(normal.x, normal.y, normal.z);
        normals.push(normal.x, normal.y, normal.z);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

    return geometry;
  }

}
