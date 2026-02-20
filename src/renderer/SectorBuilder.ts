/**
 * Sector (Floor/Ceiling) Geometry Builder
 * Converts DOOM sectors into three.js floor and ceiling meshes
 * Based on linuxdoom-1.10/r_plane.c
 */

import * as THREE from 'three';
import type { MapData, MapSector, MapLineDef, MapVertex } from '../level/types';
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
   */
  static buildSectors(mapData: MapData): SectorGeometry[] {
    const sectors: SectorGeometry[] = [];

    for (let i = 0; i < mapData.sectors.length; i++) {
      const sector = mapData.sectors[i];

      // Get all linedefs that reference this sector
      const sectorLines = this.getSectorLineDefs(mapData, i);

      // Build vertex list for this sector
      const vertices = this.getSectorVertices(mapData, sectorLines);

      if (vertices.length < 3) {
        console.warn(`Sector ${i} has insufficient vertices`);
        continue;
      }

      // Create floor geometry
      const floorGeometry = this.createFlatGeometry(
        vertices,
        sector.floorheight,
        false // floor faces up
      );

      // Create ceiling geometry
      const ceilingGeometry = this.createFlatGeometry(
        vertices,
        sector.ceilingheight,
        true // ceiling faces down
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
   * Get all linedefs that reference a sector
   */
  private static getSectorLineDefs(mapData: MapData, sectorIndex: number): MapLineDef[] {
    const lines: MapLineDef[] = [];

    for (const linedef of mapData.linedefs) {
      const frontSide = mapData.sidedefs[linedef.sidenum[0]];
      if (frontSide.sector === sectorIndex) {
        lines.push(linedef);
      }

      if (linedef.sidenum[1] !== -1) {
        const backSide = mapData.sidedefs[linedef.sidenum[1]];
        if (backSide.sector === sectorIndex) {
          lines.push(linedef);
        }
      }
    }

    return lines;
  }

  /**
   * Get ordered vertices for a sector
   * This is a simplified version - for complex sectors, we'd need proper polygon triangulation
   */
  private static getSectorVertices(mapData: MapData, lines: MapLineDef[]): MapVertex[] {
    if (lines.length === 0) return [];

    const vertices: MapVertex[] = [];
    const usedVertexIndices = new Set<number>();

    // Simple approach: collect all unique vertices from lines
    for (const line of lines) {
      if (!usedVertexIndices.has(line.v1)) {
        vertices.push(mapData.vertexes[line.v1]);
        usedVertexIndices.add(line.v1);
      }
      if (!usedVertexIndices.has(line.v2)) {
        vertices.push(mapData.vertexes[line.v2]);
        usedVertexIndices.add(line.v2);
      }
    }

    // Sort vertices by angle from centroid for proper polygon ordering
    if (vertices.length > 2) {
      const centroid = this.calculateCentroid(vertices);
      vertices.sort((a, b) => {
        const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
        const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
        return angleA - angleB;
      });
    }

    return vertices;
  }

  /**
   * Calculate centroid of vertices
   */
  private static calculateCentroid(vertices: MapVertex[]): { x: number; y: number } {
    let x = 0, y = 0;
    for (const v of vertices) {
      x += v.x;
      y += v.y;
    }
    return { x: x / vertices.length, y: y / vertices.length };
  }

  /**
   * Create flat (floor/ceiling) geometry from vertices
   */
  private static createFlatGeometry(
    vertices: MapVertex[],
    height: number,
    faceDown: boolean
  ): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();

    // Triangulate using fan triangulation from first vertex
    const triangleCount = vertices.length - 2;
    const positions: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];

    const normal = faceDown
      ? new THREE.Vector3(0, -1, 0) // ceiling faces down
      : new THREE.Vector3(0, 1, 0);  // floor faces up

    for (let i = 0; i < triangleCount; i++) {
      const v0 = vertices[0];
      const v1 = vertices[i + 1];
      const v2 = vertices[i + 2];

      // Convert to three.js coordinates
      const p0 = doomToThree(v0.x, v0.y, height);
      const p1 = doomToThree(v1.x, v1.y, height);
      const p2 = doomToThree(v2.x, v2.y, height);

      if (faceDown) {
        // Reverse winding for ceiling
        positions.push(p0.x, p0.y, p0.z);
        positions.push(p2.x, p2.y, p2.z);
        positions.push(p1.x, p1.y, p1.z);
      } else {
        positions.push(p0.x, p0.y, p0.z);
        positions.push(p1.x, p1.y, p1.z);
        positions.push(p2.x, p2.y, p2.z);
      }

      // UV coordinates (flats are 64x64 and tile)
      // Use DOOM coordinates for tiling
      uvs.push(v0.x / 64, v0.y / 64);
      if (faceDown) {
        uvs.push(v2.x / 64, v2.y / 64);
        uvs.push(v1.x / 64, v1.y / 64);
      } else {
        uvs.push(v1.x / 64, v1.y / 64);
        uvs.push(v2.x / 64, v2.y / 64);
      }

      // Normals
      normals.push(normal.x, normal.y, normal.z);
      normals.push(normal.x, normal.y, normal.z);
      normals.push(normal.x, normal.y, normal.z);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

    return geometry;
  }
}
