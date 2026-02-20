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
   * Find player start position
   */
  getPlayerStart(): { x: number; y: number; z: number; angle: number } | null {
    // Player 1 start is thing type 1
    const playerThing = this.mapData.things.find(thing => thing.type === 1);

    if (!playerThing) {
      console.warn('Player start not found');
      return null;
    }

    // Find the sector the player is in to get floor height
    // For now, use a default height
    const defaultHeight = 56; // DOOM player view height

    return {
      x: playerThing.x,
      y: playerThing.y,
      z: defaultHeight,
      angle: playerThing.angle,
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.textureManager.clearCache();
  }
}
