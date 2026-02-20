/**
 * Sprite Renderer
 * Manages billboard sprites for enemies, items, and decorations
 * Based on linuxdoom-1.10/r_things.c
 */

import * as THREE from 'three';
import type { Mobj } from '../game/mobj';
import { SpriteLoader } from '../graphics/SpriteLoader';
import type { WADReader } from '../wad';
import { doomToThree, FixedToFloat } from '../core';

export interface SpriteObject {
  mobj: Mobj;
  sprite: THREE.Sprite;
  currentFrame: string;
}

export class SpriteRenderer {
  private scene: THREE.Scene;
  private spriteLoader: SpriteLoader;
  private spriteObjects: Map<Mobj, SpriteObject>;

  constructor(scene: THREE.Scene, wad: WADReader, palette: Uint8ClampedArray) {
    this.scene = scene;
    this.spriteLoader = new SpriteLoader(wad, palette);
    this.spriteObjects = new Map();
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
    // Build full sprite lump name
    // Format: 4-char name + frame + rotation
    // Example: TROOA0 = Imp, frame A, rotation 0
    const fullName = `${spriteName}${frame}${rotation}`;

    const texture = this.spriteLoader.loadSprite(fullName);
    if (!texture) {
      console.warn(`Failed to load sprite: ${fullName}`);
      return null;
    }

    // Create sprite material with transparency
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.5, // Discard pixels below this alpha
      depthWrite: true,
    });

    // Create sprite
    const sprite = new THREE.Sprite(material);

    // Get sprite dimensions for proper scaling
    const dims = this.spriteLoader.getSpriteDimensions(fullName);
    if (dims) {
      // Scale sprite to match DOOM units
      sprite.scale.set(dims.width, dims.height, 1);
    }

    // Position sprite at mobj position
    this.updateSpritePosition(sprite, mobj);

    // Add to scene
    this.scene.add(sprite);

    const spriteObject: SpriteObject = {
      mobj,
      sprite,
      currentFrame: fullName,
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
  update(cameraPosition: THREE.Vector3): void {
    for (const spriteObj of this.spriteObjects.values()) {
      // Update position
      this.updateSpritePosition(spriteObj.sprite, spriteObj.mobj);

      // Sprites always face camera (billboard effect)
      // THREE.Sprite handles this automatically
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

    const texture = this.spriteLoader.loadSprite(fullName);
    if (!texture) return;

    // Update material map
    const material = spriteObj.sprite.material as THREE.SpriteMaterial;
    if (material.map) {
      material.map = texture;
      material.needsUpdate = true;
    }

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

    const brightness = Math.max(0.2, Math.min(1.0, lightLevel / 255));
    const material = spriteObj.sprite.material as THREE.SpriteMaterial;
    material.color.setRGB(brightness, brightness, brightness);
  }

  /**
   * Get sprite object for an mobj
   */
  getSprite(mobj: Mobj): SpriteObject | null {
    return this.spriteObjects.get(mobj) || null;
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
}
