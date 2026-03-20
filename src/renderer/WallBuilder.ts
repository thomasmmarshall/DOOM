/**
 * Wall Geometry Builder
 * Converts DOOM LineDefs/SideDefs into three.js wall meshes
 * Based on linuxdoom-1.10/r_segs.c
 */

import * as THREE from 'three';
import type { MapData } from '../level/types';
import { ML_TWOSIDED, ML_DONTPEGTOP, ML_DONTPEGBOTTOM } from '../level/types';
import { doomToThree } from '../core';
import { isSkyFlat } from './doomLighting';

export interface WallSegment {
  geometry: THREE.BufferGeometry;
  materialIndex: number; // Index for texture lookup
  textureName: string;
  lightLevel: number;
  lineIndex: number;
  sideDefIndex: number;
  textureOffsetX: number;
  textureOffsetY: number;
  bottomAligned: boolean;
  masked: boolean;
  worldWidth: number;
  worldHeight: number;
  lineDx: number;
  lineDy: number;
}

export class WallBuilder {
  /**
   * Build all wall geometries from map data
   */
  static buildWalls(mapData: MapData): WallSegment[] {
    const walls: WallSegment[] = [];
    for (let i = 0; i < mapData.linedefs.length; i++) {
      walls.push(...this.buildWallsForLine(mapData, i));
    }
    return walls;
  }

  /**
   * Build wall segments for a single linedef (used when a sector height changes).
   */
  static buildWallsForLine(mapData: MapData, lineIndex: number): WallSegment[] {
    const walls: WallSegment[] = [];
    if (lineIndex < 0 || lineIndex >= mapData.linedefs.length) {
      return walls;
    }

    const linedef = mapData.linedefs[lineIndex];
    const v1 = mapData.vertexes[linedef.v1];
    const v2 = mapData.vertexes[linedef.v2];
    const frontSide = mapData.sidedefs[linedef.sidenum[0]];
    const frontSector = mapData.sectors[frontSide.sector];

    const twoSided = (linedef.flags & ML_TWOSIDED) !== 0;
    const backSide =
      twoSided && linedef.sidenum[1] !== -1 ? mapData.sidedefs[linedef.sidenum[1]] : null;
    const backSector = backSide ? mapData.sectors[backSide.sector] : null;

    if (!twoSided || !backSector) {
      if (frontSide.midtexture !== '-') {
        const bottomAligned = (linedef.flags & ML_DONTPEGBOTTOM) !== 0;
        walls.push(
          this.createWall(
            lineIndex,
            linedef.sidenum[0],
            v1.x,
            v1.y,
            v2.x,
            v2.y,
            frontSector.floorheight,
            frontSector.ceilingheight,
            frontSide.midtexture,
            frontSector.lightlevel,
            frontSide.textureoffset,
            frontSide.rowoffset,
            bottomAligned
          )
        );
      }
    } else {
      const bothSkyCeilings =
        isSkyFlat(frontSector.ceilingpic) && isSkyFlat(backSector.ceilingpic);

      // Upper (front side): neighbor ceiling lower than this sector's.
      if (
        !bothSkyCeilings &&
        backSector.ceilingheight < frontSector.ceilingheight &&
        frontSide.toptexture !== '-'
      ) {
        const unpegTop = (linedef.flags & ML_DONTPEGTOP) !== 0;
        walls.push(
          this.createWall(
            lineIndex,
            linedef.sidenum[0],
            v1.x,
            v1.y,
            v2.x,
            v2.y,
            backSector.ceilingheight,
            frontSector.ceilingheight,
            frontSide.toptexture,
            frontSector.lightlevel,
            frontSide.textureoffset,
            frontSide.rowoffset,
            unpegTop
          )
        );
      }

      // Upper (back side): opposite gap — seen from sector sidenum[1].
      if (
        backSide &&
        !bothSkyCeilings &&
        frontSector.ceilingheight < backSector.ceilingheight &&
        backSide.toptexture !== '-'
      ) {
        const unpegTop = (linedef.flags & ML_DONTPEGTOP) !== 0;
        walls.push(
          this.createWall(
            lineIndex,
            linedef.sidenum[1],
            v2.x,
            v2.y,
            v1.x,
            v1.y,
            frontSector.ceilingheight,
            backSector.ceilingheight,
            backSide.toptexture,
            backSector.lightlevel,
            backSide.textureoffset,
            backSide.rowoffset,
            unpegTop
          )
        );
      }

      if (backSector.floorheight > frontSector.floorheight && frontSide.bottomtexture !== '-') {
        const unpegBottom = (linedef.flags & ML_DONTPEGBOTTOM) !== 0;
        walls.push(
          this.createWall(
            lineIndex,
            linedef.sidenum[0],
            v1.x,
            v1.y,
            v2.x,
            v2.y,
            frontSector.floorheight,
            backSector.floorheight,
            frontSide.bottomtexture,
            frontSector.lightlevel,
            frontSide.textureoffset,
            frontSide.rowoffset,
            unpegBottom
          )
        );
      }

      if (
        backSide &&
        frontSector.floorheight > backSector.floorheight &&
        backSide.bottomtexture !== '-'
      ) {
        const unpegBottom = (linedef.flags & ML_DONTPEGBOTTOM) !== 0;
        walls.push(
          this.createWall(
            lineIndex,
            linedef.sidenum[1],
            v2.x,
            v2.y,
            v1.x,
            v1.y,
            backSector.floorheight,
            frontSector.floorheight,
            backSide.bottomtexture,
            backSector.lightlevel,
            backSide.textureoffset,
            backSide.rowoffset,
            unpegBottom
          )
        );
      }

      if (frontSide.midtexture !== '-') {
        // Masked midtexture (switches, grates): clip to portal opening and peg like
        // R_RenderMaskedSegRange (linuxdoom r_segs.c).
        const bottomOpen = Math.max(frontSector.floorheight, backSector.floorheight);
        const topOpen = Math.min(frontSector.ceilingheight, backSector.ceilingheight);
        const pegBottom = (linedef.flags & ML_DONTPEGBOTTOM) !== 0;
        if (topOpen > bottomOpen) {
          walls.push(
            this.createWall(
              lineIndex,
              linedef.sidenum[0],
              v1.x,
              v1.y,
              v2.x,
              v2.y,
              bottomOpen,
              topOpen,
              frontSide.midtexture,
              frontSector.lightlevel,
              frontSide.textureoffset,
              frontSide.rowoffset,
              pegBottom,
              true
            )
          );
        }
      }
    }

    return walls;
  }

  /**
   * Create a single wall segment
   */
  private static createWall(
    lineIndex: number,
    sideDefIndex: number,
    x1: number, y1: number,
    x2: number, y2: number,
    bottomZ: number, topZ: number,
    textureName: string,
    lightLevel: number,
    textureOffsetX: number = 0,
    textureOffsetY: number = 0,
    bottomAligned: boolean = false,
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

    const uvs = new Float32Array([
      // Triangle 1
      0, 1,
      1, 1,
      1, 0,
      // Triangle 2
      0, 1,
      1, 0,
      0, 0,
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
      lineIndex,
      sideDefIndex,
      textureOffsetX,
      textureOffsetY,
      bottomAligned,
      masked,
      worldWidth: width,
      worldHeight: height,
      lineDx: dx,
      lineDy: dy,
    };
  }
}
