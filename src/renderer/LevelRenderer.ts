/**
 * Level Renderer
 * Main renderer that builds and displays a complete DOOM level
 */

import * as THREE from 'three';
import type { MapData } from '../level/types';
import type { WADReader } from '../wad';
import { WallBuilder } from './WallBuilder';
import { SectorBuilder } from './SectorBuilder';
import { TextureManager } from './TextureManager';
import { SkyRenderer } from './SkyRenderer';

export class LevelRenderer {
  private scene: THREE.Scene;
  private textureManager: TextureManager;
  private mapData: MapData;

  constructor(
    scene: THREE.Scene,
    wad: WADReader,
    palette: Uint8ClampedArray,
    mapData: MapData
  ) {
    this.scene = scene;
    this.textureManager = new TextureManager(wad, palette);
    this.mapData = mapData;
  }

  /**
   * Build and add all level geometry to the scene
   */
  buildLevel(): void {
    console.log('Building level geometry...');

    // Build walls
    const walls = WallBuilder.buildWalls(this.mapData);
    console.log(`Built ${walls.length} wall segments`);

    for (const wall of walls) {
      const material = this.textureManager.createWallMaterial(
        wall.textureName,
        wall.lightLevel,
        false
      );

      const mesh = new THREE.Mesh(wall.geometry, material);
      this.scene.add(mesh);
    }

    // Build sectors (floors and ceilings)
    const sectors = SectorBuilder.buildSectors(this.mapData);
    console.log(`Built ${sectors.length} sectors`);

    for (const sector of sectors) {
      // Floor
      if (sector.floorGeometry && sector.floorTexture !== 'F_SKY1') {
        const floorMaterial = this.textureManager.createFlatMaterial(
          sector.floorTexture,
          sector.lightLevel
        );
        const floorMesh = new THREE.Mesh(sector.floorGeometry, floorMaterial);
        this.scene.add(floorMesh);
      }

      // Ceiling
      if (sector.ceilingGeometry && sector.ceilingTexture !== 'F_SKY1') {
        const ceilingMaterial = this.textureManager.createFlatMaterial(
          sector.ceilingTexture,
          sector.lightLevel
        );
        const ceilingMesh = new THREE.Mesh(sector.ceilingGeometry, ceilingMaterial);
        this.scene.add(ceilingMesh);
      }
    }

    console.log('Level geometry complete');
  }

  /**
   * Add sky to scene
   */
  addSky(wad: WADReader, palette: Uint8ClampedArray): void {
    const sky = SkyRenderer.createSky(wad, palette, 'SKY1');
    if (sky) {
      this.scene.add(sky);
      console.log('Sky added');
    }
  }

  /**
   * Find which sector contains a given point (x, y)
   * Uses a simple approach: check all linedefs and build sector boundaries
   */
  private findSectorAtPoint(x: number, y: number): number | null {
    // Try each sector to see if point is inside
    for (let sectorIdx = 0; sectorIdx < this.mapData.sectors.length; sectorIdx++) {
      // Find all linedefs that reference this sector
      const sectorLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

      for (let i = 0; i < this.mapData.linedefs.length; i++) {
        const linedef = this.mapData.linedefs[i];
        const frontSide = linedef.sidenum[0];
        const backSide = linedef.sidenum[1];

        // Check if this linedef's front or back side references our sector
        if (frontSide !== -1 && this.mapData.sidedefs[frontSide].sector === sectorIdx) {
          const v1 = this.mapData.vertexes[linedef.v1];
          const v2 = this.mapData.vertexes[linedef.v2];
          sectorLines.push({ x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y });
        } else if (backSide !== -1 && this.mapData.sidedefs[backSide].sector === sectorIdx) {
          const v1 = this.mapData.vertexes[linedef.v1];
          const v2 = this.mapData.vertexes[linedef.v2];
          sectorLines.push({ x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y });
        }
      }

      // Point-in-polygon test using ray casting algorithm
      if (sectorLines.length > 0) {
        let inside = false;
        for (const line of sectorLines) {
          // Ray casting: count intersections with a ray going right from point
          if ((line.y1 > y) !== (line.y2 > y)) {
            const intersectX = (line.x2 - line.x1) * (y - line.y1) / (line.y2 - line.y1) + line.x1;
            if (x < intersectX) {
              inside = !inside;
            }
          }
        }

        if (inside) {
          return sectorIdx;
        }
      }
    }

    return null;
  }

  /**
   * Find player start position
   */
  getPlayerStart(): { x: number; y: number; z: number; angle: number; floorz: number; ceilingz: number } | null {
    // Player 1 start is thing type 1
    const playerThing = this.mapData.things.find(thing => thing.type === 1);

    if (!playerThing) {
      console.warn('Player start not found');
      return null;
    }

    // Find the sector the player is in to get floor height
    const sectorIdx = this.findSectorAtPoint(playerThing.x, playerThing.y);

    let floorHeight = 0; // Default floor height
    let ceilingHeight = 128; // Default ceiling height
    if (sectorIdx !== null) {
      const sector = this.mapData.sectors[sectorIdx];
      floorHeight = sector.floorheight;
      ceilingHeight = sector.ceilingheight;
      console.log(`Player start found in sector ${sectorIdx}, floor height: ${floorHeight}, ceiling height: ${ceilingHeight}`);
    } else {
      console.warn(`Could not determine sector for player start at (${playerThing.x}, ${playerThing.y}), using defaults`);
    }

    // Player spawns at floor height
    // The z coordinate returned is the floor position
    return {
      x: playerThing.x,
      y: playerThing.y,
      z: floorHeight,
      angle: playerThing.angle,
      floorz: floorHeight,
      ceilingz: ceilingHeight,
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.textureManager.clearCache();
  }
}
