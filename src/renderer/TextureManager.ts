/**
 * Texture Manager
 * Loads and caches DOOM textures/flats as three.js textures
 */

import * as THREE from 'three';
import type { WADReader } from '../wad';
import { PatchDecoder, FlatLoader, TextureComposer } from '../graphics';
import type { Colormap, IndexedGraphic, Palette } from '../graphics';
import {
  applyDoomIndexedMaterial,
  createDoomPaletteResources,
  type DoomPaletteResources,
} from './doomLighting';

export interface TextureInfo {
  texture: THREE.Texture;
  width: number;
  height: number;
  masked: boolean;
}

export class TextureManager {
  private wad: WADReader;
  private palette: Palette;
  private paletteResources: DoomPaletteResources;
  private textureCache: Map<string, TextureInfo>;
  private flatCache: Map<string, TextureInfo>;
  private textureComposer: TextureComposer;
  private initialized: boolean = false;
  private flatNames: Set<string>;
  private missingTextureIndex: number;
  private missingDarkIndex: number;

  constructor(wad: WADReader, palette: Palette, colormap: Colormap) {
    this.wad = wad;
    this.palette = palette;
    this.paletteResources = createDoomPaletteResources(palette, colormap);
    this.textureCache = new Map();
    this.flatCache = new Map();
    this.textureComposer = new TextureComposer(wad);
    this.flatNames = new Set();
    this.missingTextureIndex = this.findClosestPaletteIndex(255, 0, 255);
    this.missingDarkIndex = this.findClosestPaletteIndex(0, 0, 0);
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
  getTexture(name: string): THREE.Texture | null {
    return this.getTextureInfo(name)?.texture ?? null;
  }

  getTextureInfo(name: string): TextureInfo | null {
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

    let decoded: IndexedGraphic | null = null;
    let masked = false;

    // First, try composite texture (TEXTURE1/TEXTURE2)
    if (this.textureComposer.hasTexture(upperName)) {
      decoded = this.textureComposer.composeTexture(upperName);
      masked = this.textureComposer.getTexture(upperName)?.masked ?? false;
    }

    // If not found, try loading as a simple patch
    if (!decoded) {
      const patchData = this.wad.readLump(upperName);
      if (patchData) {
        try {
          decoded = PatchDecoder.decodePatchGraphic(patchData);
        } catch (error) {
          console.warn(`Failed to decode patch ${upperName}:`, error);
        }
      }
    }

    if (!decoded) {
      console.warn(`Texture not found: ${name}`);
      return this.createMissingTexture(upperName);
    }

    const info: TextureInfo = {
      texture: this.createIndexedTexture(decoded, THREE.RepeatWrapping, THREE.RepeatWrapping),
      width: decoded.width,
      height: decoded.height,
      masked,
    };

    this.textureCache.set(upperName, info);
    return info;
  }

  /**
   * Create a placeholder texture for missing textures
   */
  private createMissingTexture(name: string): TextureInfo {
    const width = 64;
    const height = 64;
    const pixels = new Uint8Array(width * height);
    const opaque = new Uint8Array(width * height).fill(255);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width) + x;
        const usePrimary = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) === 0;
        pixels[index] = usePrimary ? this.missingTextureIndex : this.missingDarkIndex;
      }
    }

    const info: TextureInfo = {
      texture: this.createIndexedTexture(
        { width, height, leftoffset: 0, topoffset: 0, pixels, opaque },
        THREE.RepeatWrapping,
        THREE.RepeatWrapping
      ),
      width,
      height,
      masked: false,
    };

    this.textureCache.set(name, info);
    return info;
  }

  /**
   * Get or load a flat (floor/ceiling) texture
   */
  getFlat(name: string): THREE.Texture | null {
    return this.getFlatInfo(name)?.texture ?? null;
  }

  getFlatInfo(name: string): TextureInfo | null {
    if (!name || name === '-') {
      console.error(`Invalid flat name: "${name}"`);
      return this.createMissingFlat('INVALID');
    }

    const upperName = name.toUpperCase();

    // Check cache
    if (this.flatCache.has(upperName)) {
      return this.flatCache.get(upperName)!;
    }

    if (!this.initialized) {
      console.error('TextureManager not initialized! Call init() first.');
      return this.createMissingFlat('NOTINIT');
    }

    // Check if this flat exists in our directory
    if (!this.flatNames.has(upperName)) {
      console.error(`Flat "${name}" not in directory (have ${this.flatNames.size} flats)`);
      return this.createMissingFlat(upperName);
    }

    // Try to load flat
    const flatData = this.wad.readLump(upperName);
    if (!flatData) {
      console.error(`Flat "${name}" not found in WAD`);
      return this.createMissingFlat(upperName);
    }

    try {
      const { pixels, opaque } = FlatLoader.decodeFlatIndexed(flatData);

      const info: TextureInfo = {
        texture: this.createIndexedTexture(
          {
            width: FlatLoader.FLAT_WIDTH,
            height: FlatLoader.FLAT_HEIGHT,
            leftoffset: 0,
            topoffset: 0,
            pixels,
            opaque,
          },
          THREE.RepeatWrapping,
          THREE.RepeatWrapping
        ),
        width: FlatLoader.FLAT_WIDTH,
        height: FlatLoader.FLAT_HEIGHT,
        masked: false,
      };

      this.flatCache.set(upperName, info);
      return info;
    } catch (error) {
      console.error(`Failed to decode flat ${name}:`, error);
      return this.createMissingFlat(upperName);
    }
  }

  /**
   * Create a placeholder flat for missing flats
   */
  private createMissingFlat(name: string): TextureInfo {
    const width = 64;
    const height = 64;
    const pixels = new Uint8Array(width * height);
    const opaque = new Uint8Array(width * height).fill(255);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width) + x;
        const usePrimary = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) === 0;
        pixels[index] = usePrimary ? this.missingDarkIndex : this.missingTextureIndex;
      }
    }

    const info: TextureInfo = {
      texture: this.createIndexedTexture(
        { width, height, leftoffset: 0, topoffset: 0, pixels, opaque },
        THREE.RepeatWrapping,
        THREE.RepeatWrapping
      ),
      width,
      height,
      masked: false,
    };

    this.flatCache.set(name, info);
    return info;
  }

  /**
   * Create material for a wall with light level
   */
  createWallMaterial(
    textureName: string,
    lightLevel: number,
    transparent: boolean = false,
    fakeContrast: number = 0
  ): THREE.MeshBasicMaterial {
    const texture = this.getTexture(textureName);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      transparent: transparent,
      alphaTest: transparent ? 0.5 : 0,
      side: THREE.DoubleSide,
      depthWrite: !transparent,
    });
    applyDoomIndexedMaterial(material, {
      paletteResources: this.paletteResources,
      lightLevel,
      fakeContrast,
      useDistanceLighting: true,
    });

    return material;
  }

  /**
   * Create material for a flat (floor/ceiling) with light level
   */
  createFlatMaterial(flatName: string, lightLevel: number): THREE.MeshBasicMaterial {
    const texture = this.getFlat(flatName);

    if (!texture) {
      console.error(`No texture for flat "${flatName}" - using magenta placeholder`);
      // Create a material with visible color instead of black
      return new THREE.MeshBasicMaterial({
        color: 0xFF00FF,
        side: THREE.DoubleSide,
      });
    }

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    applyDoomIndexedMaterial(material, {
      paletteResources: this.paletteResources,
      lightLevel,
      useDistanceLighting: true,
      distanceScale: 80,
      distanceOffset: 0,
    });

    return material;
  }

  createSkyMaterial(textureName: string): THREE.MeshBasicMaterial {
    let texture = this.getSkyTexture(textureName);
    if (!texture) {
      texture = this.createPlaceholderSkyTexture();
    }
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      color: 0xffffff,
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return material;
  }

  private createPlaceholderSkyTexture(): THREE.DataTexture {
    const w = 256;
    const h = 128;
    const rgba = new Uint8ClampedArray(w * h * 4);
    const darkBlue = this.findClosestPaletteIndex(0, 0, 80);
    const midBlue = this.findClosestPaletteIndex(40, 40, 120);
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const p = Math.floor(darkBlue + (1 - t) * (midBlue - darkBlue));
      const pi = Math.max(0, Math.min(255, p));
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        rgba[i] = this.palette[pi * 3];
        rgba[i + 1] = this.palette[pi * 3 + 1];
        rgba[i + 2] = this.palette[pi * 3 + 2];
        rgba[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(rgba, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  private skyTextureCache: Map<string, THREE.DataTexture> = new Map();

  private getSkyTexture(name: string): THREE.DataTexture | null {
    const upperName = name.toUpperCase();
    if (this.skyTextureCache.has(upperName)) {
      return this.skyTextureCache.get(upperName)!;
    }
    const indexed = this.getIndexedGraphic(name);
    if (!indexed) return null;
    const rgba = new Uint8ClampedArray(indexed.width * indexed.height * 4);
    for (let i = 0; i < indexed.pixels.length; i++) {
      const idx = indexed.pixels[i];
      const po = idx * 3;
      const ro = i * 4;
      rgba[ro] = this.palette[po];
      rgba[ro + 1] = this.palette[po + 1];
      rgba[ro + 2] = this.palette[po + 2];
      rgba[ro + 3] = indexed.opaque[i];
    }
    const tex = new THREE.DataTexture(
      rgba,
      indexed.width,
      indexed.height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    this.skyTextureCache.set(upperName, tex);
    return tex;
  }

  private getIndexedGraphic(name: string): IndexedGraphic | null {
    const upperName = name.toUpperCase();
    if (this.textureComposer.hasTexture(upperName)) {
      return this.textureComposer.composeTexture(upperName);
    }
    const patchData = this.wad.readLump(upperName);
    if (!patchData) return null;
    try {
      return PatchDecoder.decodePatchGraphic(patchData);
    } catch {
      return null;
    }
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
      texture.texture.dispose();
    }
    for (const texture of this.flatCache.values()) {
      texture.texture.dispose();
    }
    for (const texture of this.skyTextureCache.values()) {
      texture.dispose();
    }

    this.textureCache.clear();
    this.flatCache.clear();
    this.skyTextureCache.clear();
    this.paletteResources.paletteTexture.dispose();
    this.paletteResources.colormapTexture.dispose();
  }

  getPaletteResources(): DoomPaletteResources {
    return this.paletteResources;
  }

  private createIndexedTexture(
    graphic: IndexedGraphic,
    wrapS: THREE.Wrapping,
    wrapT: THREE.Wrapping
  ): THREE.DataTexture {
    const data = new Uint8Array(graphic.width * graphic.height * 4);

    for (let i = 0; i < graphic.pixels.length; i++) {
      const dstOffset = i * 4;
      data[dstOffset] = graphic.pixels[i];
      data[dstOffset + 3] = graphic.opaque[i];
    }

    const texture = new THREE.DataTexture(
      data,
      graphic.width,
      graphic.height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = wrapS;
    texture.wrapT = wrapT;
    texture.flipY = true;
    texture.needsUpdate = true;
    return texture;
  }

  private findClosestPaletteIndex(r: number, g: number, b: number): number {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < 256; i++) {
      const dr = this.palette[i * 3] - r;
      const dg = this.palette[(i * 3) + 1] - g;
      const db = this.palette[(i * 3) + 2] - b;
      const distance = (dr * dr) + (dg * dg) + (db * db);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    return bestIndex;
  }
}
