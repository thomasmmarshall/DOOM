/**
 * Sprite Renderer
 * Manages billboard sprites for enemies, items, and decorations
 * Based on linuxdoom-1.10/r_things.c
 */

import * as THREE from 'three';
import type { Mobj } from '../game/mobj';
import { MobjFlags } from '../game/mobj';
import { SpriteLoader } from '../graphics/SpriteLoader';
import type { WADReader } from '../wad';
import { doomAngleToThreeRadians, doomToThree, FixedToFloat } from '../core';
import {
  applyDoomIndexedMaterial,
  type DoomPaletteResources,
  updateDoomIndexedMaterialLight,
} from './doomLighting';

export interface SpriteObject {
  mobj: Mobj;
  sprite: THREE.Sprite;
  currentFrame: string;
  lightLevel: number;
}

export class SpriteRenderer {
  private scene: THREE.Scene;
  private spriteLoader: SpriteLoader;
  private spriteObjects: Map<Mobj, SpriteObject>;
  private paletteResources: DoomPaletteResources;

  constructor(scene: THREE.Scene, wad: WADReader, paletteResources: DoomPaletteResources) {
    this.scene = scene;
    this.spriteLoader = new SpriteLoader(wad);
    this.spriteObjects = new Map();
    this.paletteResources = paletteResources;
  }

  /**
   * Add a sprite to the scene for a map object
   * @param mobj - Map object to create sprite for
   * @param spriteName - Base sprite name (e.g., "TROO" for imp)
   * @param frame - Frame letter (e.g., "A")
   * @param rotation - Rotation index 0-7, or 0 for no rotation
   * @returns SpriteObject or null if failed
   */
  addSprite(mobj: Mobj, spriteName: string, frame: string, rotation: number = 0): SpriteObject | null {
    const fullName = `${spriteName}${frame}${rotation}`;
    const spriteFrame = this.spriteLoader.getSpriteFrame(spriteName, frame, rotation);
    if (!spriteFrame) {
      console.warn(`Failed to load sprite: ${fullName}`);
      return null;
    }

    // Create sprite material with transparency
    const material = new THREE.SpriteMaterial({
      map: spriteFrame.texture,
      transparent: true,
      alphaTest: 0.5, // Discard pixels below this alpha
      depthWrite: true,
    });
    applyDoomIndexedMaterial(material, {
      paletteResources: this.paletteResources,
      lightLevel: 255,
      useDistanceLighting: true,
      distanceScale: 48,
      fullBright: false,
      spectre: (mobj.flags & MobjFlags.SHADOW) !== 0,
    });

    // Create sprite
    const sprite = new THREE.Sprite(material);
    this.applySpriteFrame(sprite, spriteFrame);

    // Position sprite at mobj position
    this.updateSpritePosition(sprite, mobj);

    // Add to scene
    this.scene.add(sprite);

    const spriteObject: SpriteObject = {
      mobj,
      sprite,
      currentFrame: fullName,
      lightLevel: 255,
    };

    this.spriteObjects.set(mobj, spriteObject);
    return spriteObject;
  }

  /**
   * Update sprite position from mobj
   */
  private updateSpritePosition(sprite: THREE.Sprite, mobj: Mobj): void {
    const x = FixedToFloat(mobj.x);
    const y = FixedToFloat(mobj.y);
    const z = FixedToFloat(mobj.z);

    const pos = doomToThree(x, y, z);
    sprite.position.copy(pos);
  }

  /**
   * Update all sprite positions and rotations
   * Call this each frame
   */
  update(cameraX: number, cameraY: number, _cameraPosition?: THREE.Vector3): void {
    const sorted = [...this.spriteObjects.values()].sort((a, b) => {
      const ax = FixedToFloat(a.mobj.x);
      const ay = FixedToFloat(a.mobj.y);
      const bx = FixedToFloat(b.mobj.x);
      const by = FixedToFloat(b.mobj.y);
      const da = Math.max(Math.abs(ax - cameraX), Math.abs(ay - cameraY));
      const db = Math.max(Math.abs(bx - cameraX), Math.abs(by - cameraY));
      return db - da;
    });

    let order = 20000;
    for (const spriteObj of sorted) {
      this.updateSpritePosition(spriteObj.sprite, spriteObj.mobj);

      const spriteName = spriteObj.mobj.sprite ?? spriteObj.currentFrame.slice(0, 4);
      const frame = spriteObj.mobj.frame ?? 'A';
      const rotation = this.selectRotation(spriteObj.mobj, cameraX, cameraY);
      this.updateSpriteFrame(spriteObj.mobj, spriteName, frame, rotation);

      spriteObj.sprite.visible = !spriteObj.mobj.removed;
      spriteObj.sprite.renderOrder = order--;
    }
  }

  /**
   * Update a sprite's frame
   * @param mobj - Map object
   * @param spriteName - Base sprite name
   * @param frame - Frame letter
   * @param rotation - Rotation index
   */
  updateSpriteFrame(mobj: Mobj, spriteName: string, frame: string, rotation: number = 0): void {
    const spriteObj = this.spriteObjects.get(mobj);
    if (!spriteObj) return;

    const fullName = `${spriteName}${frame}${rotation}`;
    if (spriteObj.currentFrame === fullName) {
      return; // Already showing this frame
    }

    const spriteFrame = this.spriteLoader.getSpriteFrame(spriteName, frame, rotation);
    if (!spriteFrame) return;

    // Update material map
    const material = spriteObj.sprite.material as THREE.SpriteMaterial;
    material.map = spriteFrame.texture;
    material.needsUpdate = true;
    this.applySpriteFrame(spriteObj.sprite, spriteFrame);

    spriteObj.currentFrame = fullName;
  }

  /**
   * Remove a sprite from the scene
   */
  removeSprite(mobj: Mobj): void {
    const spriteObj = this.spriteObjects.get(mobj);
    if (!spriteObj) return;

    this.scene.remove(spriteObj.sprite);
    spriteObj.sprite.material.dispose();

    this.spriteObjects.delete(mobj);
  }

  /**
   * Apply lighting to sprite based on sector light level
   * @param mobj - Map object
   * @param lightLevel - Sector light level (0-255)
   */
  applySectorLighting(mobj: Mobj, lightLevel: number): void {
    const spriteObj = this.spriteObjects.get(mobj);
    if (!spriteObj) return;

    const material = spriteObj.sprite.material as THREE.SpriteMaterial;
    updateDoomIndexedMaterialLight(material, lightLevel);
    spriteObj.lightLevel = lightLevel;
  }

  /**
   * Get sprite object for an mobj
   */
  getSprite(mobj: Mobj): SpriteObject | null {
    return this.spriteObjects.get(mobj) || null;
  }

  hasSprite(mobj: Mobj): boolean {
    return this.spriteObjects.has(mobj);
  }

  getMobjs(): Mobj[] {
    return [...this.spriteObjects.keys()];
  }

  /**
   * Dispose all sprites
   */
  dispose(): void {
    for (const spriteObj of this.spriteObjects.values()) {
      this.scene.remove(spriteObj.sprite);
      spriteObj.sprite.material.dispose();
    }
    this.spriteObjects.clear();
    this.spriteLoader.clearCache();
  }

  private applySpriteFrame(sprite: THREE.Sprite, spriteFrame: {
    width: number;
    height: number;
    leftoffset: number;
    topoffset: number;
  }): void {
    const centerX = spriteFrame.width === 0 ? 0.5 : spriteFrame.leftoffset / spriteFrame.width;
    const centerY = spriteFrame.height === 0 ? 0 : 1 - (spriteFrame.topoffset / spriteFrame.height);

    sprite.scale.set(spriteFrame.width, spriteFrame.height, 1);
    sprite.center.set(
      THREE.MathUtils.clamp(centerX, 0, 1),
      THREE.MathUtils.clamp(centerY, 0, 1)
    );
  }

  private selectRotation(mobj: Mobj, cameraX: number, cameraY: number): number {
    const actorX = FixedToFloat(mobj.x);
    const actorY = FixedToFloat(mobj.y);
    const actorAngle = doomAngleToThreeRadians(mobj.angle);
    const angleToViewer = Math.atan2(cameraY - actorY, cameraX - actorX);
    const relativeAngle = (angleToViewer - actorAngle + (Math.PI * 2)) % (Math.PI * 2);
    const octant = Math.round(relativeAngle / (Math.PI / 4)) % 8;

    return octant + 1;
  }
}
