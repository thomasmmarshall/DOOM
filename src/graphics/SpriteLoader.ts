/**
 * DOOM Sprite Loader
 * Sprites use the same patch format as textures
 * Based on linuxdoom-1.10/r_things.c
 */

import * as THREE from 'three';
import type { WADReader } from '../wad';
import { PatchDecoder } from './PatchDecoder';

interface SpriteDirectoryEntry {
  lumpName: string;
  mirrored: boolean;
}

export interface LoadedSpriteFrame {
  texture: THREE.CanvasTexture;
  width: number;
  height: number;
  leftoffset: number;
  topoffset: number;
}

export class SpriteLoader {
  private wad: WADReader;
  private palette: Uint8ClampedArray;
  private spriteCache: Map<string, LoadedSpriteFrame>;
  private spriteDirectory: Map<string, SpriteDirectoryEntry>;

  constructor(wad: WADReader, palette: Uint8ClampedArray) {
    this.wad = wad;
    this.palette = palette;
    this.spriteCache = new Map();
    this.spriteDirectory = new Map();
    this.buildSpriteDirectory();
  }

  private buildSpriteDirectory(): void {
    const spritePattern = /^([A-Z0-9]{4})([A-Z])(0|[1-8])(?:([A-Z])(0|[1-8]))?$/;
    const directory = this.wad.getDirectory();
    let inSprites = false;

    for (const lump of directory) {
      if (lump.name === 'S_START' || lump.name === 'SS_START') {
        inSprites = true;
        continue;
      }

      if (lump.name === 'S_END' || lump.name === 'SS_END') {
        inSprites = false;
        continue;
      }

      if (!inSprites) {
        continue;
      }

      const match = lump.name.match(spritePattern);
      if (!match) {
        continue;
      }

      const [, spriteName, frameA, rotationA, frameB, rotationB] = match;
      this.spriteDirectory.set(`${spriteName}${frameA}${rotationA}`, {
        lumpName: lump.name,
        mirrored: false,
      });

      if (frameB && rotationB) {
        this.spriteDirectory.set(`${spriteName}${frameB}${rotationB}`, {
          lumpName: lump.name,
          mirrored: true,
        });
      }
    }
  }

  private parseRequest(name: string): { spriteName: string; frame: string; rotation: number } | null {
    const upperName = name.toUpperCase();
    if (upperName.length < 6) {
      return null;
    }

    return {
      spriteName: upperName.slice(0, 4),
      frame: upperName[4],
      rotation: Number.parseInt(upperName[5], 10) || 0,
    };
  }

  private resolveSpriteEntry(spriteName: string, frame: string, rotation: number): SpriteDirectoryEntry | null {
    const exactKey = `${spriteName}${frame}${rotation}`;
    const exact = this.spriteDirectory.get(exactKey);
    if (exact) {
      return exact;
    }

    const unrotated = this.spriteDirectory.get(`${spriteName}${frame}0`);
    if (unrotated) {
      return unrotated;
    }

    for (let candidate = 1; candidate <= 8; candidate++) {
      const rotated = this.spriteDirectory.get(`${spriteName}${frame}${candidate}`);
      if (rotated) {
        return rotated;
      }
    }

    return null;
  }

  private createTextureCanvas(
    source: HTMLCanvasElement,
    mirrored: boolean
  ): HTMLCanvasElement {
    if (!mirrored) {
      return source;
    }

    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;

    const ctx = canvas.getContext('2d')!;
    ctx.translate(source.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(source, 0, 0);
    return canvas;
  }

  getSpriteFrame(spriteName: string, frame: string, rotation: number): LoadedSpriteFrame | null {
    const cacheKey = `${spriteName}${frame}${rotation}`.toUpperCase();
    if (this.spriteCache.has(cacheKey)) {
      return this.spriteCache.get(cacheKey)!;
    }

    const entry = this.resolveSpriteEntry(spriteName.toUpperCase(), frame.toUpperCase(), rotation);
    if (!entry) {
      return null;
    }

    const spriteData = this.wad.readLump(entry.lumpName);
    if (!spriteData) {
      return null;
    }

    try {
      const decoded = PatchDecoder.decodePatch(spriteData, this.palette);
      const baseCanvas = PatchDecoder.patchToCanvas(decoded);
      const canvas = this.createTextureCanvas(baseCanvas, entry.mirrored);
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.format = THREE.RGBAFormat;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;

      const loaded: LoadedSpriteFrame = {
        texture,
        width: decoded.width,
        height: decoded.height,
        leftoffset: entry.mirrored ? decoded.width - decoded.leftoffset : decoded.leftoffset,
        topoffset: decoded.topoffset,
      };

      this.spriteCache.set(cacheKey, loaded);
      return loaded;
    } catch (error) {
      console.warn(`Failed to decode sprite ${entry.lumpName}:`, error);
      return null;
    }
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

    const parsed = this.parseRequest(name);
    if (!parsed) {
      return null;
    }

    return this.getSpriteFrame(parsed.spriteName, parsed.frame, parsed.rotation)?.texture ?? null;
  }

  /**
   * Get sprite dimensions
   * @param name - Sprite lump name
   * @returns Width and height, or null if not found
   */
  getSpriteDimensions(name: string): { width: number; height: number } | null {
    const parsed = this.parseRequest(name);
    if (!parsed) return null;

    const sprite = this.getSpriteFrame(parsed.spriteName, parsed.frame, parsed.rotation);
    if (!sprite) {
      return null;
    }

    return {
      width: sprite.width,
      height: sprite.height,
    };
  }

  /**
   * Clear sprite cache
   */
  clearCache(): void {
    for (const sprite of this.spriteCache.values()) {
      sprite.texture.dispose();
    }
    this.spriteCache.clear();
  }
}
