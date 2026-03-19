/**
 * Level Renderer
 * Main renderer that builds and displays a complete DOOM level
 */

import * as THREE from 'three';
import type { MapData } from '../level/types';
import { findSectorAtPoint } from '../level';
import type { WADReader } from '../wad';
import { WallBuilder, type WallSegment } from './WallBuilder';
import { SectorBuilder } from './SectorBuilder';
import { TextureManager, type TextureInfo } from './TextureManager';
import { SkyRenderer } from './SkyRenderer';
import { BSPRenderer } from './BSPRenderer';
import { SpriteRenderer } from './SpriteRenderer';
import type { Mobj } from '../game';
import type { Colormap, Palette } from '../graphics';
import {
  getWallFakeContrast,
  isSkyFlat,
  selectSkyTexture,
  updateDoomIndexedMaterialLight,
} from './doomLighting';

interface WallMeshInfo {
  mesh: THREE.Mesh;
  lineIndex: number;
  sideDefIndex: number;
  lightLevel: number;
  textureWidth: number;
  textureHeight: number;
  baseTextureOffsetX: number;
  baseTextureOffsetY: number;
  bottomAligned: boolean;
  worldWidth: number;
  worldHeight: number;
  lineDx: number;
  lineDy: number;
}

export class LevelRenderer {
  private scene: THREE.Scene;
  private textureManager: TextureManager;
  private mapData: MapData;
  private bspRenderer: BSPRenderer;
  private sectorMeshes: Map<number, THREE.Mesh[]>; // sector index -> meshes
  private wallMeshes: THREE.Mesh[];
  private wallMeshInfo: WallMeshInfo[];
  private useBSPCulling: boolean = true;
  private spriteRenderer: SpriteRenderer;
  private skyRenderer: SkyRenderer;

  constructor(
    scene: THREE.Scene,
    wad: WADReader,
    palette: Palette,
    colormap: Colormap,
    mapData: MapData
  ) {
    this.scene = scene;
    this.textureManager = new TextureManager(wad, palette, colormap);
    this.mapData = mapData;
    this.bspRenderer = new BSPRenderer(mapData);
    this.sectorMeshes = new Map();
    this.wallMeshes = [];
    this.wallMeshInfo = [];
    this.spriteRenderer = new SpriteRenderer(scene, wad, this.textureManager.getPaletteResources());
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
      this.addWallSegment(wall);
    }

    // Build sectors (floors and ceilings)
    const sectors = SectorBuilder.buildSectors(this.mapData);
    console.log(`Built ${sectors.length} sectors`);

    for (let i = 0; i < sectors.length; i++) {
      const sector = sectors[i];
      const meshes: THREE.Mesh[] = [];

      // Floor
      if (sector.floorGeometry && !isSkyFlat(sector.floorTexture)) {
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
      if (sector.ceilingGeometry && !isSkyFlat(sector.ceilingTexture)) {
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
  addSky(): void {
    const skyName = selectSkyTexture(this.mapData.name);
    const sky = this.skyRenderer.createSky(
      this.textureManager.createSkyMaterial(skyName),
      skyName
    );
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
    this.spriteRenderer.update(cameraX, cameraY, cameraPosition);

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

  isSkyCeilingAtPoint(x: number, y: number): boolean {
    const sectorIndex = findSectorAtPoint(x, y, this.mapData);
    if (sectorIndex < 0) {
      return false;
    }

    return isSkyFlat(this.mapData.sectors[sectorIndex].ceilingpic);
  }

  updateSectorLight(sectorIndex: number, lightLevel: number): void {
    const meshes = this.sectorMeshes.get(sectorIndex);
    if (meshes) {
      for (const mesh of meshes) {
        updateDoomIndexedMaterialLight(mesh.material as THREE.Material, lightLevel);
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

      updateDoomIndexedMaterialLight(
        info.mesh.material as THREE.Material,
        lightLevel,
        getWallFakeContrast(info.lineDx, info.lineDy)
      );
    }
  }

  updateAnimatedWallOffsets(): void {
    for (const info of this.wallMeshInfo) {
      const sidedef = this.mapData.sidedefs[info.sideDefIndex];
      this.updateWallUVs(
        info.mesh.geometry,
        sidedef.textureoffset,
        sidedef.rowoffset,
        info.textureWidth,
        info.textureHeight,
        info.worldWidth,
        info.worldHeight,
        info.bottomAligned
      );
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
   * Identifies ceiling by normal (0, -1, 0) since closed doors have floor height = ceiling height.
   */
  updateSectorCeiling(sectorIndex: number, _oldHeight: number, newHeight: number): void {
    const meshes = this.sectorMeshes.get(sectorIndex);
    if (meshes) {
      for (const mesh of meshes) {
        const geometry = mesh.geometry;
        const positionAttribute = geometry.getAttribute('position');
        const normalAttribute = geometry.getAttribute('normal');

        if (!positionAttribute || !normalAttribute) continue;

        if (normalAttribute.getY(0) < 0) {
          for (let i = 0; i < positionAttribute.count; i++) {
            positionAttribute.setY(i, newHeight);
          }
          positionAttribute.needsUpdate = true;
          geometry.computeBoundingSphere();
        }
      }
    }
    this.rebuildWallsTouchingSector(sectorIndex);
  }

  /**
   * Update sector floor height in real-time
   * Called when platforms move
   * Identifies floor by normal (0, 1, 0).
   */
  updateSectorFloor(sectorIndex: number, _oldHeight: number, newHeight: number): void {
    const meshes = this.sectorMeshes.get(sectorIndex);
    if (meshes) {
      for (const mesh of meshes) {
        const geometry = mesh.geometry;
        const positionAttribute = geometry.getAttribute('position');
        const normalAttribute = geometry.getAttribute('normal');

        if (!positionAttribute || !normalAttribute) continue;

        if (normalAttribute.getY(0) > 0) {
          for (let i = 0; i < positionAttribute.count; i++) {
            positionAttribute.setY(i, newHeight);
          }
          positionAttribute.needsUpdate = true;
          geometry.computeBoundingSphere();
        }
      }
    }
    this.rebuildWallsTouchingSector(sectorIndex);
  }

  private addWallSegment(wall: WallSegment): void {
    const textureInfo = this.textureManager.getTextureInfo(wall.textureName);
    const fakeContrast = getWallFakeContrast(wall.lineDx, wall.lineDy);
    const material = this.textureManager.createWallMaterial(
      wall.textureName,
      wall.lightLevel,
      wall.masked || Boolean(textureInfo?.masked),
      fakeContrast
    );

    const mesh = new THREE.Mesh(wall.geometry, material);
    mesh.frustumCulled = false;
    this.applyWallUVs(
      wall.geometry,
      wall,
      textureInfo ?? {
        texture: material.map as THREE.Texture,
        width: 64,
        height: 64,
        masked: false,
      }
    );
    this.scene.add(mesh);
    this.wallMeshes.push(mesh);
    this.wallMeshInfo.push({
      mesh,
      lineIndex: wall.lineIndex,
      sideDefIndex: wall.sideDefIndex,
      lightLevel: wall.lightLevel,
      textureWidth: textureInfo?.width ?? 64,
      textureHeight: textureInfo?.height ?? 64,
      baseTextureOffsetX: wall.textureOffsetX,
      baseTextureOffsetY: wall.textureOffsetY,
      bottomAligned: wall.bottomAligned,
      worldWidth: wall.worldWidth,
      worldHeight: wall.worldHeight,
      lineDx: wall.lineDx,
      lineDy: wall.lineDy,
    });
  }

  /** Rebuild wall quads for every linedef that borders this sector (doors/lifts). */
  private rebuildWallsTouchingSector(sectorIndex: number): void {
    const lines = new Set<number>();
    for (let i = 0; i < this.mapData.linedefs.length; i++) {
      const line = this.mapData.linedefs[i];
      const frontSec = this.mapData.sidedefs[line.sidenum[0]].sector;
      const backSec =
        line.sidenum[1] >= 0 ? this.mapData.sidedefs[line.sidenum[1]].sector : -1;
      if (frontSec === sectorIndex || backSec === sectorIndex) {
        lines.add(i);
      }
    }

    for (const lineIdx of lines) {
      this.rebuildWallsForLine(lineIdx);
    }
  }

  private rebuildWallsForLine(lineIndex: number): void {
    const keptMeshes: THREE.Mesh[] = [];
    const keptInfo: WallMeshInfo[] = [];

    for (let i = 0; i < this.wallMeshInfo.length; i++) {
      if (this.wallMeshInfo[i].lineIndex === lineIndex) {
        const mesh = this.wallMeshes[i];
        this.scene.remove(mesh);
        mesh.geometry.dispose();
      } else {
        keptMeshes.push(this.wallMeshes[i]);
        keptInfo.push(this.wallMeshInfo[i]);
      }
    }

    this.wallMeshes = keptMeshes;
    this.wallMeshInfo = keptInfo;

    const segments = WallBuilder.buildWallsForLine(this.mapData, lineIndex);
    for (const wall of segments) {
      this.addWallSegment(wall);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.spriteRenderer.dispose();

    for (const mesh of this.wallMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (!Array.isArray(mat)) mat.dispose();
      else for (const m of mat) m.dispose();
    }
    this.wallMeshes = [];
    this.wallMeshInfo = [];

    for (const meshes of this.sectorMeshes.values()) {
      for (const mesh of meshes) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        const mat = mesh.material;
        if (!Array.isArray(mat)) mat.dispose();
        else for (const m of mat) m.dispose();
      }
    }
    this.sectorMeshes.clear();

    this.skyRenderer.removeFromScene(this.scene);
    this.textureManager.clearCache();
  }

  private applyWallUVs(
    geometry: THREE.BufferGeometry,
    wall: {
      textureOffsetX: number;
      textureOffsetY: number;
      worldWidth: number;
      worldHeight: number;
      bottomAligned: boolean;
    },
    textureInfo: TextureInfo
  ): void {
    this.updateWallUVs(
      geometry,
      wall.textureOffsetX,
      wall.textureOffsetY,
      textureInfo.width,
      textureInfo.height,
      wall.worldWidth,
      wall.worldHeight,
      wall.bottomAligned
    );
  }

  private updateWallUVs(
    geometry: THREE.BufferGeometry,
    textureOffsetX: number,
    textureOffsetY: number,
    textureWidth: number,
    textureHeight: number,
    worldWidth: number,
    worldHeight: number,
    bottomAligned: boolean
  ): void {
    const width = Math.max(1, textureWidth);
    const height = Math.max(1, textureHeight);
    const topOffset = bottomAligned
      ? textureOffsetY + (height - worldHeight)
      : textureOffsetY;

    const u1 = textureOffsetX / width;
    const u2 = (textureOffsetX + worldWidth) / width;
    const v1 = topOffset / height;
    const v2 = (topOffset + worldHeight) / height;

    const uvAttribute = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
    if (!uvAttribute) {
      return;
    }

    const uvs = [
      u1, v2,
      u2, v2,
      u2, v1,
      u1, v2,
      u2, v1,
      u1, v1,
    ];

    for (let i = 0; i < uvs.length; i += 2) {
      uvAttribute.setXY(i / 2, uvs[i], uvs[i + 1]);
    }

    uvAttribute.needsUpdate = true;
  }
}
