/**
 * Wall Geometry Builder
 * Converts DOOM LineDefs/SideDefs into three.js wall meshes
 * Based on linuxdoom-1.10/r_segs.c
 */

import * as THREE from 'three';
import type { MapData, MapLineDef, MapSideDef, MapSector } from '../level/types';
import { ML_TWOSIDED, ML_DONTPEGTOP, ML_DONTPEGBOTTOM } from '../level/types';
import { doomToThree } from '../core';

export interface WallSegment {
  geometry: THREE.BufferGeometry;
  materialIndex: number; // Index for texture lookup
  textureName: string;
  lightLevel: number;
}

export class WallBuilder {
  /**
   * Build all wall geometries from map data
   */
  static buildWalls(mapData: MapData): WallSegment[] {
    const walls: WallSegment[] = [];

    for (let i = 0; i < mapData.linedefs.length; i++) {
      const linedef = mapData.linedefs[i];

      // Get vertices
      const v1 = mapData.vertexes[linedef.v1];
      const v2 = mapData.vertexes[linedef.v2];

      // Get front sidedef (always present)
      const frontSide = mapData.sidedefs[linedef.sidenum[0]];
      const frontSector = mapData.sectors[frontSide.sector];

      // Check if two-sided
      const twoSided = (linedef.flags & ML_TWOSIDED) !== 0;
      const backSide = twoSided && linedef.sidenum[1] !== -1
        ? mapData.sidedefs[linedef.sidenum[1]]
        : null;
      const backSector = backSide ? mapData.sectors[backSide.sector] : null;

      if (!twoSided || !backSector) {
        // One-sided wall - draw middle texture
        if (frontSide.midtexture !== '-') {
          const wall = this.createWall(
            v1.x, v1.y,
            v2.x, v2.y,
            frontSector.floorheight,
            frontSector.ceilingheight,
            frontSide.midtexture,
            frontSector.lightlevel,
            frontSide.textureoffset,
            frontSide.rowoffset,
            false // middle texture pegging
          );
          walls.push(wall);
        }
      } else {
        // Two-sided wall - draw upper, middle (if masked), and lower

        // Upper wall (if back ceiling is lower than front ceiling)
        if (backSector.ceilingheight < frontSector.ceilingheight && frontSide.toptexture !== '-') {
          const unpegTop = (linedef.flags & ML_DONTPEGTOP) !== 0;
          const wall = this.createWall(
            v1.x, v1.y,
            v2.x, v2.y,
            backSector.ceilingheight,
            frontSector.ceilingheight,
            frontSide.toptexture,
            frontSector.lightlevel,
            frontSide.textureoffset,
            frontSide.rowoffset,
            unpegTop
          );
          walls.push(wall);
        }

        // Lower wall (if back floor is higher than front floor)
        if (backSector.floorheight > frontSector.floorheight && frontSide.bottomtexture !== '-') {
          const unpegBottom = (linedef.flags & ML_DONTPEGBOTTOM) !== 0;
          const wall = this.createWall(
            v1.x, v1.y,
            v2.x, v2.y,
            frontSector.floorheight,
            backSector.floorheight,
            frontSide.bottomtexture,
            frontSector.lightlevel,
            frontSide.textureoffset,
            frontSide.rowoffset,
            unpegBottom
          );
          walls.push(wall);
        }

        // Middle texture (if present, this is for masked textures like gratings)
        if (frontSide.midtexture !== '-') {
          const wall = this.createWall(
            v1.x, v1.y,
            v2.x, v2.y,
            frontSector.floorheight,
            frontSector.ceilingheight,
            frontSide.midtexture,
            frontSector.lightlevel,
            frontSide.textureoffset,
            frontSide.rowoffset,
            false,
            true // transparent/masked
          );
          walls.push(wall);
        }
      }
    }

    return walls;
  }

  /**
   * Create a single wall segment
   */
  private static createWall(
    x1: number, y1: number,
    x2: number, y2: number,
    bottomZ: number, topZ: number,
    textureName: string,
    lightLevel: number,
    textureOffsetX: number = 0,
    textureOffsetY: number = 0,
    unpeg: boolean = false,
    masked: boolean = false
  ): WallSegment {
    // Convert DOOM coordinates to three.js
    const p1 = doomToThree(x1, y1, bottomZ);
    const p2 = doomToThree(x2, y2, bottomZ);
    const p3 = doomToThree(x2, y2, topZ);
    const p4 = doomToThree(x1, y1, topZ);

    // Create geometry
    const geometry = new THREE.BufferGeometry();

    // Vertices (two triangles for quad)
    const vertices = new Float32Array([
      // Triangle 1
      p1.x, p1.y, p1.z,
      p2.x, p2.y, p2.z,
      p3.x, p3.y, p3.z,
      // Triangle 2
      p1.x, p1.y, p1.z,
      p3.x, p3.y, p3.z,
      p4.x, p4.y, p4.z,
    ]);

    // Calculate wall dimensions
    const width = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const height = topZ - bottomZ;

    // UV coordinates
    // DOOM textures are measured in pixels
    // We'll normalize these later when we know texture size
    const u1 = textureOffsetX / 64; // Assume 64 as default for now
    const u2 = (textureOffsetX + width) / 64;
    const v1 = unpeg ? 0 : textureOffsetY / 128;
    const v2 = unpeg ? height / 128 : (textureOffsetY + height) / 128;

    const uvs = new Float32Array([
      // Triangle 1
      u1, v2,  // bottom-left
      u2, v2,  // bottom-right
      u2, v1,  // top-right
      // Triangle 2
      u1, v2,  // bottom-left
      u2, v1,  // top-right
      u1, v1,  // top-left
    ]);

    // Normals (pointing inward toward player)
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len;
    const ny = dx / len;

    // Convert normal to three.js space
    const normalThree = doomToThree(nx, ny, 0);
    normalThree.normalize();

    const normals = new Float32Array([
      // Triangle 1
      normalThree.x, normalThree.y, normalThree.z,
      normalThree.x, normalThree.y, normalThree.z,
      normalThree.x, normalThree.y, normalThree.z,
      // Triangle 2
      normalThree.x, normalThree.y, normalThree.z,
      normalThree.x, normalThree.y, normalThree.z,
      normalThree.x, normalThree.y, normalThree.z,
    ]);

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    return {
      geometry,
      materialIndex: 0,
      textureName,
      lightLevel,
    };
  }
}
