/**
 * Sector (Floor/Ceiling) Geometry Builder
 * Converts DOOM sectors into three.js floor and ceiling meshes
 * Uses earcut triangulation for robust polygon filling
 */

import * as THREE from 'three';
import type { MapData, MapVertex } from '../level/types';
import { doomToThree } from '../core';
import earcut from 'earcut';

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
   * Uses linedef boundaries and earcut triangulation
   */
  static buildSectors(mapData: MapData): SectorGeometry[] {
    const sectors: SectorGeometry[] = [];

    for (let i = 0; i < mapData.sectors.length; i++) {
      const sector = mapData.sectors[i];

      // Get the boundary polygon(s) for this sector
      const polygons = this.getSectorPolygons(mapData, i);

      if (polygons.length === 0) {
        sectors.push({
          floorTexture: sector.floorpic,
          ceilingTexture: sector.ceilingpic,
          lightLevel: sector.lightlevel,
        });
        continue;
      }

      // Create floor and ceiling geometry
      const floorGeometry = this.createFlatGeometry(
        polygons,
        sector.floorheight,
        false
      );

      const ceilingGeometry = this.createFlatGeometry(
        polygons,
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
   * Get all boundary polygons for a sector
   * A sector can have multiple polygons (outer boundary + holes)
   */
  private static getSectorPolygons(mapData: MapData, sectorIdx: number): MapVertex[][] {
    // Find all lines that border this sector
    const sectorLines: Array<{ v1: MapVertex; v2: MapVertex }> = [];

    for (const linedef of mapData.linedefs) {
      const frontSide = linedef.sidenum[0];
      const backSide = linedef.sidenum[1];

      let isFrontSector = false;
      let isBackSector = false;

      if (frontSide >= 0 && frontSide < mapData.sidedefs.length) {
        if (mapData.sidedefs[frontSide].sector === sectorIdx) {
          isFrontSector = true;
        }
      }
      if (backSide >= 0 && backSide < mapData.sidedefs.length) {
        if (mapData.sidedefs[backSide].sector === sectorIdx) {
          isBackSector = true;
        }
      }

      if (isFrontSector || isBackSector) {
        const v1 = mapData.vertexes[linedef.v1];
        const v2 = mapData.vertexes[linedef.v2];

        // Add line with correct winding for the sector
        // Front side: v1 to v2 is the sector boundary (CCW winding)
        // Back side: v2 to v1 is the sector boundary
        if (isFrontSector) {
          sectorLines.push({ v1, v2 });
        } else {
          sectorLines.push({ v1: v2, v2: v1 });
        }
      }
    }

    if (sectorLines.length < 3) {
      return [];
    }

    // Build closed loops from the lines
    const polygons = this.buildPolygonsFromLines(sectorLines);
    return polygons;
  }

  /**
   * Build closed polygons from a set of line segments
   */
  private static buildPolygonsFromLines(
    lines: Array<{ v1: MapVertex; v2: MapVertex }>
  ): MapVertex[][] {
    const polygons: MapVertex[][] = [];
    const used = new Set<number>();

    // Helper to find vertex key
    const vertexKey = (v: MapVertex) => `${v.x},${v.y}`;

    // Build adjacency map: for each vertex, which lines start there?
    const startMap = new Map<string, number[]>();
    for (let i = 0; i < lines.length; i++) {
      const key = vertexKey(lines[i].v1);
      if (!startMap.has(key)) {
        startMap.set(key, []);
      }
      startMap.get(key)!.push(i);
    }

    // Find closed loops
    for (let startIdx = 0; startIdx < lines.length; startIdx++) {
      if (used.has(startIdx)) continue;

      const polygon: MapVertex[] = [];
      let currentIdx = startIdx;
      let iterations = 0;
      const maxIterations = lines.length + 1;

      while (iterations < maxIterations) {
        if (used.has(currentIdx)) {
          // We've completed a loop or hit a dead end
          break;
        }

        used.add(currentIdx);
        const line = lines[currentIdx];
        polygon.push(line.v1);

        // Find next line that starts at v2
        const nextKey = vertexKey(line.v2);
        const candidates = startMap.get(nextKey) || [];

        let nextIdx = -1;
        for (const idx of candidates) {
          if (!used.has(idx)) {
            nextIdx = idx;
            break;
          }
        }

        if (nextIdx === -1) {
          // Check if we've closed the loop
          if (vertexKey(line.v2) === vertexKey(lines[startIdx].v1)) {
            // Loop closed
            break;
          }
          // Dead end - can't continue
          break;
        }

        currentIdx = nextIdx;
        iterations++;
      }

      if (polygon.length >= 3) {
        polygons.push(polygon);
      }
    }

    return polygons;
  }

  /**
   * Create floor/ceiling geometry using earcut triangulation
   */
  private static createFlatGeometry(
    polygons: MapVertex[][],
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

    for (const polygon of polygons) {
      if (polygon.length < 3) continue;

      // Prepare data for earcut
      // Earcut expects a flat array of coordinates [x1, y1, x2, y2, ...]
      const coords: number[] = [];
      for (const v of polygon) {
        coords.push(v.x, v.y);
      }

      // Triangulate using earcut
      const triangles = earcut(coords);

      // Create triangles
      for (let i = 0; i < triangles.length; i += 3) {
        const i0 = triangles[i];
        const i1 = triangles[i + 1];
        const i2 = triangles[i + 2];

        const v0 = polygon[i0];
        const v1 = polygon[i1];
        const v2 = polygon[i2];

        const p0 = doomToThree(v0.x, v0.y, height);
        const p1 = doomToThree(v1.x, v1.y, height);
        const p2 = doomToThree(v2.x, v2.y, height);

        if (faceDown) {
          // Reverse winding for ceiling
          positions.push(p0.x, p0.y, p0.z);
          positions.push(p2.x, p2.y, p2.z);
          positions.push(p1.x, p1.y, p1.z);

          uvs.push(v0.x / 64, v0.y / 64);
          uvs.push(v2.x / 64, v2.y / 64);
          uvs.push(v1.x / 64, v1.y / 64);
        } else {
          // Normal winding for floor
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
