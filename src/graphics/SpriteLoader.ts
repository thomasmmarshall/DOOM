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
  private resolvedNameCache: Map<string, string | null>;

  constructor(wad: WADReader, palette: Uint8ClampedArray) {
    this.wad = wad;
    this.palette = palette;
    this.spriteCache = new Map();
    this.resolvedNameCache = new Map();
  }

  /**
   * Resolve a requested sprite name to an actual lump in the WAD.
   * Monster sprites often use combined lump names like TROOA1A5 rather than TROOA1.
   */
  private resolveSpriteName(name: string): string | null {
    const upperName = name.toUpperCase();

    if (this.resolvedNameCache.has(upperName)) {
      return this.resolvedNameCache.get(upperName)!;
    }

    if (this.wad.hasLump(upperName)) {
      this.resolvedNameCache.set(upperName, upperName);
      return upperName;
    }

    const prefixedLump = this.wad.getDirectory().find((lump) => lump.name.startsWith(upperName));
    if (prefixedLump) {
      this.resolvedNameCache.set(upperName, prefixedLump.name);
      return prefixedLump.name;
    }

    // Non-rotating sprites use A0, but many monsters only provide A1-A8 rotations.
    if (upperName.length === 6 && upperName[5] === '0') {
      const framePrefix = upperName.slice(0, 5);
      for (let rotation = 1; rotation <= 8; rotation++) {
        const rotatedName = `${framePrefix}${rotation}`;
        const resolved = this.resolveSpriteName(rotatedName);
        if (resolved) {
          this.resolvedNameCache.set(upperName, resolved);
          return resolved;
        }
      }
    }

    this.resolvedNameCache.set(upperName, null);
    return null;
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

    const resolvedName = this.resolveSpriteName(name);
    if (!resolvedName) {
      console.warn(`Sprite not found: ${name}`);
      return null;
    }

    // Check cache
    if (this.spriteCache.has(resolvedName)) {
      return this.spriteCache.get(resolvedName)!;
    }

    // Load sprite patch data
    const spriteData = this.wad.readLump(resolvedName);
    if (!spriteData) {
      console.warn(`Sprite not found: ${resolvedName}`);
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

      this.spriteCache.set(resolvedName, texture);
      return texture;
    } catch (error) {
      console.warn(`Failed to decode sprite ${resolvedName}:`, error);
      return null;
    }
  }

  /**
   * Get sprite dimensions
   * @param name - Sprite lump name
   * @returns Width and height, or null if not found
   */
  getSpriteDimensions(name: string): { width: number; height: number } | null {
    const resolvedName = this.resolveSpriteName(name);
    if (!resolvedName) return null;

    const spriteData = this.wad.readLump(resolvedName);
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
    this.resolvedNameCache.clear();
  }
}
