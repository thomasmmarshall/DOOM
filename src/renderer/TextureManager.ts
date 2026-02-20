/**
 * Texture Manager
 * Loads and caches DOOM textures/flats as three.js textures
 */

import * as THREE from 'three';
import type { WADReader } from '../wad';
import { PatchDecoder, FlatLoader, TextureComposer } from '../graphics';
import type { DecodedPatch } from '../graphics';

export class TextureManager {
  private wad: WADReader;
  private palette: Uint8ClampedArray;
  private textureCache: Map<string, THREE.CanvasTexture>;
  private flatCache: Map<string, THREE.CanvasTexture>;
  private textureComposer: TextureComposer;
  private initialized: boolean = false;

  constructor(wad: WADReader, palette: Uint8ClampedArray) {
    this.wad = wad;
    this.palette = palette;
    this.textureCache = new Map();
    this.flatCache = new Map();
    this.textureComposer = new TextureComposer(wad);
  }

  /**
   * Initialize texture system (must be called before use)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    await this.textureComposer.init();
    this.initialized = true;
    console.log('TextureManager initialized');
  }

  /**
   * Get or load a wall texture
   */
  getTexture(name: string): THREE.CanvasTexture | null {
    if (!name || name === '-') return null;

    const upperName = name.toUpperCase();

    // Check cache
    if (this.textureCache.has(upperName)) {
      return this.textureCache.get(upperName)!;
    }

    if (!this.initialized) {
      console.warn('TextureManager not initialized! Call init() first.');
      return null;
    }

    let decoded: DecodedPatch | null = null;

    // First, try composite texture (TEXTURE1/TEXTURE2)
    if (this.textureComposer.hasTexture(upperName)) {
      decoded = this.textureComposer.composeTexture(upperName, this.palette);
    }

    // If not found, try loading as a simple patch
    if (!decoded) {
      const patchData = this.wad.readLump(upperName);
      if (patchData) {
        try {
          decoded = PatchDecoder.decodePatch(patchData, this.palette);
        } catch (error) {
          console.warn(`Failed to decode patch ${upperName}:`, error);
        }
      }
    }

    if (!decoded) {
      console.warn(`Texture not found: ${name}`);
      return this.createMissingTexture(upperName);
    }

    // Create canvas and texture
    const canvas = this.patchToCanvas(decoded);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    this.textureCache.set(upperName, texture);
    return texture;
  }

  /**
   * Create a canvas from decoded patch
   */
  private patchToCanvas(patch: DecodedPatch): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = patch.width;
    canvas.height = patch.height;

    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(patch.width, patch.height);
    imageData.data.set(patch.pixels);
    ctx.putImageData(imageData, 0, 0);

    return canvas;
  }

  /**
   * Create a placeholder texture for missing textures
   */
  private createMissingTexture(name: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FF00FF'; // Magenta for missing textures
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#000000';
    ctx.font = '10px monospace';
    ctx.fillText('MISSING', 4, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    this.textureCache.set(name, texture);
    return texture;
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
    // Use /255 for more accurate brightness, with a minimum floor
    const brightness = Math.max(0.2, Math.min(1.0, lightLevel / 255));

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: new THREE.Color(brightness, brightness, brightness),
      transparent: transparent,
      side: THREE.DoubleSide, // Render both sides for better visibility
      depthWrite: !transparent,
    });

    return material;
  }

  /**
   * Create material for a flat (floor/ceiling) with light level
   */
  createFlatMaterial(flatName: string, lightLevel: number): THREE.MeshBasicMaterial {
    const texture = this.getFlat(flatName);

    // Convert DOOM light level (0-255) to brightness multiplier
    // Use /255 for more accurate brightness, with a minimum floor
    const brightness = Math.max(0.2, Math.min(1.0, lightLevel / 255));

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: new THREE.Color(brightness, brightness, brightness),
      side: THREE.DoubleSide, // Render both sides
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
