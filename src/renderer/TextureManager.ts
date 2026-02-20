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
  private flatNames: Set<string>;

  constructor(wad: WADReader, palette: Uint8ClampedArray) {
    this.wad = wad;
    this.palette = palette;
    this.textureCache = new Map();
    this.flatCache = new Map();
    this.textureComposer = new TextureComposer(wad);
    this.flatNames = new Set();
  }

  /**
   * Initialize texture system (must be called before use)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Initialize texture composer
    await this.textureComposer.init();

    // Build flat directory from F_START to F_END markers
    this.buildFlatDirectory();

    this.initialized = true;
    console.log('TextureManager initialized');
    console.log(`Loaded ${this.flatNames.size} flats`);
  }

  /**
   * Build directory of flat names from F_START to F_END
   */
  private buildFlatDirectory(): void {
    const directory = this.wad.getDirectory();
    let inFlats = false;

    for (const lump of directory) {
      if (lump.name === 'F_START' || lump.name === 'FF_START') {
        inFlats = true;
        continue;
      }
      if (lump.name === 'F_END' || lump.name === 'FF_END') {
        inFlats = false;
        continue;
      }

      if (inFlats && lump.size === 4096) { // Flats are always 4096 bytes
        this.flatNames.add(lump.name.toUpperCase());
      }
    }
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
    if (!name || name === '-') {
      console.warn(`Invalid flat name: "${name}"`);
      return this.createMissingFlat('INVALID');
    }

    const upperName = name.toUpperCase();

    // Check cache
    if (this.flatCache.has(upperName)) {
      return this.flatCache.get(upperName)!;
    }

    if (!this.initialized) {
      console.warn('TextureManager not initialized! Call init() first.');
      return this.createMissingFlat('NOTINIT');
    }

    // Check if this flat exists in our directory
    if (!this.flatNames.has(upperName)) {
      console.warn(`Flat not in directory: ${name}`);
      return this.createMissingFlat(upperName);
    }

    // Try to load flat
    const flatData = this.wad.readLump(upperName);
    if (!flatData) {
      console.warn(`Flat not found in WAD: ${name}`);
      return this.createMissingFlat(upperName);
    }

    try {
      const canvas = FlatLoader.flatToCanvas(flatData, this.palette);
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.needsUpdate = true; // Ensure THREE.js knows to upload the texture

      this.flatCache.set(upperName, texture);
      return texture;
    } catch (error) {
      console.warn(`Failed to decode flat ${name}:`, error);
      return this.createMissingFlat(upperName);
    }
  }

  /**
   * Create a placeholder flat for missing flats
   */
  private createMissingFlat(name: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const ctx = canvas.getContext('2d')!;

    // Create a checkerboard pattern
    ctx.fillStyle = '#808080'; // Gray
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#404040'; // Darker gray
    for (let y = 0; y < 64; y += 8) {
      for (let x = 0; x < 64; x += 8) {
        if ((x + y) % 16 === 0) {
          ctx.fillRect(x, y, 8, 8);
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    this.flatCache.set(name, texture);
    return texture;
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
    let texture = this.getFlat(flatName);

    // Convert DOOM light level (0-255) to brightness multiplier
    // Use /255 for more accurate brightness, with a minimum floor
    const brightness = Math.max(0.2, Math.min(1.0, lightLevel / 255));

    if (!texture) {
      console.warn(`No texture for flat "${flatName}"`);
      // Create a material with visible color instead of black
      return new THREE.MeshBasicMaterial({
        color: 0xFF00FF,
        side: THREE.DoubleSide,
      });
    }

    // Check if texture appears to be all black by examining the source canvas
    const canvas = (texture.image as HTMLCanvasElement);
    if (canvas && canvas.getContext) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, Math.min(64, canvas.width), Math.min(64, canvas.height));
        let hasColor = false;
        let nonTransparentPixels = 0;
        let totalBrightness = 0;

        for (let i = 0; i < imageData.data.length; i += 4) {
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];
          const a = imageData.data[i + 3];

          // Skip fully transparent pixels
          if (a === 0) continue;

          nonTransparentPixels++;
          totalBrightness += r + g + b;

          // Check if any pixel has RGB values > 10 (to account for very dark but not pure black)
          if (r > 10 || g > 10 || b > 10) {
            hasColor = true;
          }
        }

        const avgBrightness = nonTransparentPixels > 0 ? totalBrightness / (nonTransparentPixels * 3) : 0;

        if (!hasColor && nonTransparentPixels > 100) {
          console.warn(`Flat "${flatName}" is all black (avg brightness: ${avgBrightness.toFixed(1)}) - replacing with placeholder`);
          texture = this.createMissingFlat(flatName + '_BLACK');
        } else if (avgBrightness < 5 && nonTransparentPixels > 100) {
          console.warn(`Flat "${flatName}" is very dark (avg brightness: ${avgBrightness.toFixed(1)}) but allowing it`);
        }
      }
    }

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
