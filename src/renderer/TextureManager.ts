/**
 * Texture Manager
 * Loads and caches DOOM textures/flats as three.js textures
 */

import * as THREE from 'three';
import type { WADReader } from '../wad';
import { PaletteLoader, PatchDecoder, FlatLoader } from '../graphics';

export class TextureManager {
  private wad: WADReader;
  private palette: Uint8ClampedArray;
  private textureCache: Map<string, THREE.CanvasTexture>;
  private flatCache: Map<string, THREE.CanvasTexture>;

  constructor(wad: WADReader, palette: Uint8ClampedArray) {
    this.wad = wad;
    this.palette = palette;
    this.textureCache = new Map();
    this.flatCache = new Map();
  }

  /**
   * Get or load a wall/sprite texture
   */
  getTexture(name: string): THREE.CanvasTexture | null {
    if (!name || name === '-') return null;

    // Check cache
    if (this.textureCache.has(name)) {
      return this.textureCache.get(name)!;
    }

    // Try to load as patch
    const patchData = this.wad.readLump(name);
    if (patchData) {
      try {
        const decoded = PatchDecoder.decodePatch(patchData, this.palette);
        const canvas = PatchDecoder.patchToCanvas(decoded);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;

        this.textureCache.set(name, texture);
        return texture;
      } catch (error) {
        console.warn(`Failed to decode patch ${name}:`, error);
        return null;
      }
    }

    console.warn(`Texture not found: ${name}`);
    return null;
  }

  /**
   * Get or load a flat (floor/ceiling) texture
   */
  getFlat(name: string): THREE.CanvasTexture | null {
    if (!name || name === '-') return null;

    // Check cache
    if (this.flatCache.has(name)) {
      return this.flatCache.get(name)!;
    }

    // Try to load flat
    const flatData = this.wad.readLump(name);
    if (flatData) {
      try {
        const canvas = FlatLoader.flatToCanvas(flatData, this.palette);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;

        this.flatCache.set(name, texture);
        return texture;
      } catch (error) {
        console.warn(`Failed to decode flat ${name}:`, error);
        return null;
      }
    }

    console.warn(`Flat not found: ${name}`);
    return null;
  }

  /**
   * Create material for a wall with light level
   */
  createWallMaterial(textureName: string, lightLevel: number, transparent: boolean = false): THREE.MeshBasicMaterial {
    const texture = this.getTexture(textureName);

    // Convert DOOM light level (0-255) to brightness multiplier
    const brightness = lightLevel / 255;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: new THREE.Color(brightness, brightness, brightness),
      transparent: transparent,
      side: THREE.FrontSide,
    });

    return material;
  }

  /**
   * Create material for a flat (floor/ceiling) with light level
   */
  createFlatMaterial(flatName: string, lightLevel: number): THREE.MeshBasicMaterial {
    const texture = this.getFlat(flatName);

    // Convert DOOM light level (0-255) to brightness multiplier
    const brightness = lightLevel / 255;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: new THREE.Color(brightness, brightness, brightness),
      side: THREE.FrontSide,
    });

    return material;
  }

  /**
   * Create a default material (for missing textures)
   */
  createDefaultMaterial(color: number = 0xff00ff): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      wireframe: false,
    });
  }

  /**
   * Clear all texture caches
   */
  clearCache(): void {
    // Dispose textures
    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    for (const texture of this.flatCache.values()) {
      texture.dispose();
    }

    this.textureCache.clear();
    this.flatCache.clear();
  }
}
