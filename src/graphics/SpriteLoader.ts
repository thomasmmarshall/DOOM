/**
 * DOOM Sprite Loader
 * Sprites use the same patch format as textures
 * Based on linuxdoom-1.10/r_things.c
 */

import * as THREE from 'three';
import type { WADReader } from '../wad';
import { PatchDecoder } from './PatchDecoder';

export class SpriteLoader {
  private wad: WADReader;
  private palette: Uint8ClampedArray;
  private spriteCache: Map<string, THREE.CanvasTexture>;

  constructor(wad: WADReader, palette: Uint8ClampedArray) {
    this.wad = wad;
    this.palette = palette;
    this.spriteCache = new Map();
  }

  /**
   * Load a sprite by name
   * Sprite names are 4 characters + frame letter + rotation number
   * Example: TROOA0 = Imp, frame A, rotation 0
   * @param name - Sprite lump name
   * @returns THREE.CanvasTexture or null if not found
   */
  loadSprite(name: string): THREE.CanvasTexture | null {
    if (!name || name === '-') return null;

    // Check cache
    if (this.spriteCache.has(name)) {
      return this.spriteCache.get(name)!;
    }

    // Load sprite patch data
    const spriteData = this.wad.readLump(name);
    if (!spriteData) {
      console.warn(`Sprite not found: ${name}`);
      return null;
    }

    try {
      // Decode sprite using patch decoder
      const decoded = PatchDecoder.decodePatch(spriteData, this.palette);
      const canvas = PatchDecoder.patchToCanvas(decoded);

      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;

      // Sprites need transparency
      texture.format = THREE.RGBAFormat;

      this.spriteCache.set(name, texture);
      return texture;
    } catch (error) {
      console.warn(`Failed to decode sprite ${name}:`, error);
      return null;
    }
  }

  /**
   * Get sprite dimensions
   * @param name - Sprite lump name
   * @returns Width and height, or null if not found
   */
  getSpriteDimensions(name: string): { width: number; height: number } | null {
    const spriteData = this.wad.readLump(name);
    if (!spriteData) return null;

    try {
      const decoded = PatchDecoder.decodePatch(spriteData, this.palette);
      return {
        width: decoded.width,
        height: decoded.height,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Clear sprite cache
   */
  clearCache(): void {
    for (const texture of this.spriteCache.values()) {
      texture.dispose();
    }
    this.spriteCache.clear();
  }
}
