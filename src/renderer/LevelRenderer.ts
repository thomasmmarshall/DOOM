/**
 * Level Renderer
 * Main renderer that builds and displays a complete DOOM level
 */

import * as THREE from 'three';
import type { MapData } from '../level/types';
import { findSectorAtPoint } from '../level';
import type { WADReader } from '../wad';
import { WallBuilder } from './WallBuilder';
import { SectorBuilder } from './SectorBuilder';
import { TextureManager } from './TextureManager';
import { SkyRenderer } from './SkyRenderer';
import { BSPRenderer } from './BSPRenderer';
import { SpriteRenderer } from './SpriteRenderer';
import type { Mobj } from '../game';

export class LevelRenderer {
  private scene: THREE.Scene;
  private textureManager: TextureManager;
  private mapData: MapData;
  private bspRenderer: BSPRenderer;
  private sectorMeshes: Map<number, THREE.Mesh[]>; // sector index -> meshes
  private wallMeshes: THREE.Mesh[];
  private wallMeshInfo: Array<{ mesh: THREE.Mesh; lineIndex: number; sideDefIndex: number; lightLevel: number }>;
  private useBSPCulling: boolean = true;
  private spriteRenderer: SpriteRenderer;
  private skyRenderer: SkyRenderer;

  constructor(
    scene: THREE.Scene,
    wad: WADReader,
    palette: Uint8ClampedArray,
    mapData: MapData
  ) {
    this.scene = scene;
    this.textureManager = new TextureManager(wad, palette);
    this.mapData = mapData;
    this.bspRenderer = new BSPRenderer(mapData);
    this.sectorMeshes = new Map();
    this.wallMeshes = [];
    this.wallMeshInfo = [];
    this.spriteRenderer = new SpriteRenderer(scene, wad, palette);
    this.skyRenderer = new SkyRenderer();
  }

  /**
   * Build and add all level geometry to the scene
   */
  async buildLevel(): Promise<void> {
    console.log('Building level geometry...');

    // Initialize texture system first
    await this.textureManager.init();

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
      mesh.frustumCulled = false; // We'll handle culling with BSP
      this.scene.add(mesh);
      this.wallMeshes.push(mesh);
      this.wallMeshInfo.push({
        mesh,
        lineIndex: wall.lineIndex,
        sideDefIndex: wall.sideDefIndex,
        lightLevel: wall.lightLevel,
      });
    }

    // Build sectors (floors and ceilings)
    const sectors = SectorBuilder.buildSectors(this.mapData);
    console.log(`Built ${sectors.length} sectors`);

    for (let i = 0; i < sectors.length; i++) {
      const sector = sectors[i];
      const meshes: THREE.Mesh[] = [];

      // Floor
      if (sector.floorGeometry && sector.floorTexture !== 'F_SKY1') {
        const floorMaterial = this.textureManager.createFlatMaterial(
          sector.floorTexture,
          sector.lightLevel
        );
        const floorMesh = new THREE.Mesh(sector.floorGeometry, floorMaterial);
        floorMesh.frustumCulled = false; // We'll handle culling with BSP
        this.scene.add(floorMesh);
        meshes.push(floorMesh);
      }

      // Ceiling
      if (sector.ceilingGeometry && sector.ceilingTexture !== 'F_SKY1') {
        const ceilingMaterial = this.textureManager.createFlatMaterial(
          sector.ceilingTexture,
          sector.lightLevel
        );
        const ceilingMesh = new THREE.Mesh(sector.ceilingGeometry, ceilingMaterial);
        ceilingMesh.frustumCulled = false; // We'll handle culling with BSP
        this.scene.add(ceilingMesh);
        meshes.push(ceilingMesh);
      }

      if (meshes.length > 0) {
        this.sectorMeshes.set(i, meshes);
      }
    }

    console.log('Level geometry complete');
    console.log(`BSP culling: ${this.useBSPCulling ? 'enabled' : 'disabled'}`);
  }

  /**
   * Add sky to scene
   */
  addSky(wad: WADReader, palette: Uint8ClampedArray): void {
    const sky = this.skyRenderer.createSky(wad, palette, 'SKY1');
    if (sky) {
      this.scene.add(sky);
      console.log('Sky added');
    }
  }

  /**
   * Update sky position to follow camera
   */
  updateSky(cameraPosition: THREE.Vector3): void {
    this.skyRenderer.update(cameraPosition);
  }

  /**
   * Update geometry visibility based on BSP tree and camera position
   * Call this each frame from the main render loop
   * @param cameraX - Camera X position in DOOM coordinates
   * @param cameraY - Camera Y position in DOOM coordinates
   * @param cameraPosition - three.js camera position for sprite billboarding
   */
  updateVisibility(cameraX: number, cameraY: number, cameraPosition?: THREE.Vector3): void {
    if (!this.useBSPCulling) {
      // BSP culling disabled - show everything
      return;
    }

    // Get visible subsectors from BSP traversal
    const visibleSubsectors = this.bspRenderer.getVisibleSubsectors(cameraX, cameraY);

    // Build set of visible sectors
    const visibleSectors = new Set<number>();
    for (const subsectorIdx of visibleSubsectors) {
      const sectorIdx = this.bspRenderer.getSubsectorSector(subsectorIdx);
      if (sectorIdx >= 0) {
        visibleSectors.add(sectorIdx);
      }
    }

    // Update sector mesh visibility
    for (const [sectorIdx, meshes] of this.sectorMeshes.entries()) {
      const visible = visibleSectors.has(sectorIdx);
      for (const mesh of meshes) {
        mesh.visible = visible;
      }
    }

    // For now, keep all walls visible
    // In a more advanced implementation, we'd track which walls belong to which subsectors

    // Update sprite positions
    if (cameraPosition) {
      this.spriteRenderer.update(cameraPosition);
    }
  }

  /**
   * Enable or disable BSP culling
   */
  setBSPCulling(enabled: boolean): void {
    this.useBSPCulling = enabled;

    if (!enabled) {
      // Show all geometry
      for (const meshes of this.sectorMeshes.values()) {
        for (const mesh of meshes) {
          mesh.visible = true;
        }
      }
      for (const mesh of this.wallMeshes) {
        mesh.visible = true;
      }
    }
  }

  /**
   * Find which sector contains a given point (x, y)
   * Uses a simple approach: check all linedefs and build sector boundaries
   */
  getPlayerStart(): { x: number; y: number; z: number; angle: number; floorz: number; ceilingz: number } | null {
    // Player 1 start is thing type 1
    const playerThing = this.mapData.things.find(thing => thing.type === 1);

    if (!playerThing) {
      console.warn('Player start not found');
      return null;
    }

    // Find the sector the player is in to get floor height
    const sectorIdx = findSectorAtPoint(playerThing.x, playerThing.y, this.mapData);

    let floorHeight = 0; // Default floor height
    let ceilingHeight = 128; // Default ceiling height
    if (sectorIdx >= 0) {
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
   * Get sprite renderer for external access
   */
  getSpriteRenderer(): SpriteRenderer {
    return this.spriteRenderer;
  }

  updateSectorLight(sectorIndex: number, lightLevel: number): void {
    const meshes = this.sectorMeshes.get(sectorIndex);
    if (meshes) {
      const brightness = Math.max(0.25, Math.min(1.0, lightLevel / 255));
      for (const mesh of meshes) {
        const material = mesh.material as THREE.MeshBasicMaterial;
        material.color.setRGB(brightness, brightness, brightness);
      }
    }

    for (const info of this.wallMeshInfo) {
      const line = this.mapData.linedefs[info.lineIndex];
      const sideDef = this.mapData.sidedefs[info.sideDefIndex];
      if (!line || !sideDef) {
        continue;
      }

      const frontSector = this.mapData.sidedefs[line.sidenum[0]]?.sector;
      const backSector = line.sidenum[1] !== -1 ? this.mapData.sidedefs[line.sidenum[1]]?.sector : undefined;
      if (frontSector !== sectorIndex && backSector !== sectorIndex) {
        continue;
      }

      const brightness = Math.max(0.25, Math.min(1.0, lightLevel / 255));
      const material = info.mesh.material as THREE.MeshBasicMaterial;
      material.color.setRGB(brightness, brightness, brightness);
    }
  }

  updateAnimatedWallOffsets(): void {
    for (const info of this.wallMeshInfo) {
      const material = info.mesh.material as THREE.MeshBasicMaterial;
      if (!material.map) {
        continue;
      }

      const sidedef = this.mapData.sidedefs[info.sideDefIndex];
      material.map.offset.x = sidedef.textureoffset / 64;
      material.map.offset.y = -sidedef.rowoffset / 64;
    }
  }

  syncWorldMobjs(mobjs: Mobj[]): void {
    const activeMobjs = new Set<Mobj>();

    for (const mobj of mobjs) {
      if (!mobj.sprite || mobj.removed) {
        continue;
      }

      activeMobjs.add(mobj);

      if (!this.spriteRenderer.hasSprite(mobj)) {
        this.spriteRenderer.addSprite(
          mobj,
          mobj.sprite,
          mobj.frame ?? 'A',
          mobj.rotation ?? 0
        );
      }

      if (typeof mobj.sectorIndex === 'number' && this.mapData.sectors[mobj.sectorIndex]) {
        this.spriteRenderer.applySectorLighting(mobj, this.mapData.sectors[mobj.sectorIndex].lightlevel);
      }
    }

    for (const renderedMobj of this.spriteRenderer.getMobjs()) {
      if (!activeMobjs.has(renderedMobj) || renderedMobj.removed) {
        this.spriteRenderer.removeSprite(renderedMobj);
      }
    }
  }

  /**
   * Update sector ceiling height in real-time
   * Called when doors open/close
   */
  updateSectorCeiling(sectorIndex: number, oldHeight: number, newHeight: number): void {
    const meshes = this.sectorMeshes.get(sectorIndex);
    if (!meshes) return;

    // Find the ceiling mesh (usually the second mesh)
    for (const mesh of meshes) {
      const geometry = mesh.geometry;
      const positionAttribute = geometry.getAttribute('position');

      if (!positionAttribute) continue;

      // Check if this is a ceiling (meshes with Y > floor are ceilings)
      // We need to check the first vertex to determine if it's floor or ceiling
      const firstY = positionAttribute.getY(0);
      // If this mesh's Y is close to the old ceiling height, it's the ceiling mesh
      if (Math.abs(firstY - oldHeight) < 1) {
        // Update all Y coordinates to the new height
        for (let i = 0; i < positionAttribute.count; i++) {
          positionAttribute.setY(i, newHeight);
        }

        positionAttribute.needsUpdate = true;
        geometry.computeBoundingSphere();

        // Update the mapData to reflect the change
        this.mapData.sectors[sectorIndex].ceilingheight = newHeight;
        break;
      }
    }
  }

  /**
   * Update sector floor height in real-time
   * Called when platforms move
   */
  updateSectorFloor(sectorIndex: number, oldHeight: number, newHeight: number): void {
    const meshes = this.sectorMeshes.get(sectorIndex);
    if (!meshes) return;

    // Find the floor mesh (usually the first mesh)
    for (const mesh of meshes) {
      const geometry = mesh.geometry;
      const positionAttribute = geometry.getAttribute('position');

      if (!positionAttribute) continue;

      // Check if this is a floor (meshes with Y ≈ floor height)
      const firstY = positionAttribute.getY(0);
      // If this mesh's Y is close to the old floor height, it's the floor mesh
      if (Math.abs(firstY - oldHeight) < 1) {
        // Update all Y coordinates to the new height
        for (let i = 0; i < positionAttribute.count; i++) {
          positionAttribute.setY(i, newHeight);
        }

        positionAttribute.needsUpdate = true;
        geometry.computeBoundingSphere();

        // Update the mapData to reflect the change
        this.mapData.sectors[sectorIndex].floorheight = newHeight;
        break;
      }
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.textureManager.clearCache();
    this.spriteRenderer.dispose();
  }
}
