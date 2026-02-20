/**
 * Texture Composer
 * Parses TEXTURE1/TEXTURE2 and composes wall textures from patches
 * Based on linuxdoom-1.10/r_data.c
 */

import type { WADReader } from '../wad';
import type { MapTexture, TexturePatch, DecodedPatch } from './types';
import { PatchDecoder } from './PatchDecoder';

export class TextureComposer {
  private wad: WADReader;
  private patchNames: string[];
  private textures: Map<string, MapTexture>;

  constructor(wad: WADReader) {
    this.wad = wad;
    this.patchNames = [];
    this.textures = new Map();
  }

  /**
   * Initialize texture system by parsing PNAMES and TEXTURE1/TEXTURE2
   */
  async init(): Promise<void> {
    console.log('Initializing texture system...');

    // Parse PNAMES
    this.parsePNames();
    console.log(`Loaded ${this.patchNames.length} patch names`);

    // Parse TEXTURE1
    const texture1Data = this.wad.readLump('TEXTURE1');
    if (texture1Data) {
      this.parseTextureList(texture1Data);
    }

    // Parse TEXTURE2 (if exists - DOOM2 only)
    const texture2Data = this.wad.readLump('TEXTURE2');
    if (texture2Data) {
      this.parseTextureList(texture2Data);
    }

    console.log(`Loaded ${this.textures.size} texture definitions`);
  }

  /**
   * Parse PNAMES lump (patch name directory)
   */
  private parsePNames(): void {
    const data = this.wad.readLump('PNAMES');
    if (!data) {
      console.error('PNAMES lump not found!');
      return;
    }

    const view = new DataView(data);
    const bytes = new Uint8Array(data);

    // First 4 bytes = number of patches
    const numPatches = view.getInt32(0, true);

    // Each patch name is 8 bytes
    for (let i = 0; i < numPatches; i++) {
      const offset = 4 + (i * 8);
      const name = this.readString(bytes, offset, 8);
      this.patchNames.push(name);
    }
  }

  /**
   * Parse TEXTURE1 or TEXTURE2 lump
   */
  private parseTextureList(data: ArrayBuffer): void {
    const view = new DataView(data);
    const bytes = new Uint8Array(data);

    // First 4 bytes = number of textures
    const numTextures = view.getInt32(0, true);

    // Next numTextures * 4 bytes = offsets to texture definitions
    const offsets: number[] = [];
    for (let i = 0; i < numTextures; i++) {
      offsets.push(view.getInt32(4 + (i * 4), true));
    }

    // Parse each texture definition
    for (const offset of offsets) {
      const texture = this.parseTexture(bytes, view, offset);
      this.textures.set(texture.name, texture);
    }
  }

  /**
   * Parse a single texture definition
   */
  private parseTexture(bytes: Uint8Array, view: DataView, offset: number): MapTexture {
    // Texture header
    const name = this.readString(bytes, offset, 8);
    const masked = view.getInt32(offset + 8, true) !== 0;
    const width = view.getInt16(offset + 12, true);
    const height = view.getInt16(offset + 14, true);
    // Skip columndirectory (obsolete in DOOM)
    const patchcount = view.getInt16(offset + 20, true);

    // Parse patches
    const patches: TexturePatch[] = [];
    let patchOffset = offset + 22;

    for (let i = 0; i < patchcount; i++) {
      patches.push({
        originx: view.getInt16(patchOffset, true),
        originy: view.getInt16(patchOffset + 2, true),
        patch: view.getInt16(patchOffset + 4, true),
        stepdir: view.getInt16(patchOffset + 6, true),
        colormap: view.getInt16(patchOffset + 8, true),
      });
      patchOffset += 10;
    }

    return {
      name,
      masked,
      width,
      height,
      patchcount,
      patches,
    };
  }

  /**
   * Compose a texture from its patch definitions
   */
  composeTexture(name: string, palette: Uint8ClampedArray): DecodedPatch | null {
    const textureDef = this.textures.get(name.toUpperCase());
    if (!textureDef) {
      return null;
    }

    // Create blank RGBA buffer
    const pixels = new Uint8ClampedArray(textureDef.width * textureDef.height * 4);

    // Initialize all pixels to transparent
    for (let i = 3; i < pixels.length; i += 4) {
      pixels[i] = 0; // Alpha = 0 (transparent)
    }

    // Composite each patch onto the texture
    for (const patchRef of textureDef.patches) {
      // Get patch name from PNAMES
      if (patchRef.patch < 0 || patchRef.patch >= this.patchNames.length) {
        console.warn(`Invalid patch index ${patchRef.patch} in texture ${name}`);
        continue;
      }

      const patchName = this.patchNames[patchRef.patch];
      const patchData = this.wad.readLump(patchName);

      if (!patchData) {
        console.warn(`Patch ${patchName} not found for texture ${name}`);
        continue;
      }

      try {
        // Decode patch
        const patch = PatchDecoder.decodePatch(patchData, palette);

        // Composite patch onto texture at specified origin
        this.compositePatch(pixels, textureDef.width, textureDef.height, patch, patchRef.originx, patchRef.originy);
      } catch (error) {
        console.warn(`Failed to decode patch ${patchName}:`, error);
      }
    }

    return {
      width: textureDef.width,
      height: textureDef.height,
      leftoffset: 0,
      topoffset: 0,
      pixels,
    };
  }

  /**
   * Composite a patch onto a texture buffer
   */
  private compositePatch(
    destPixels: Uint8ClampedArray,
    destWidth: number,
    destHeight: number,
    patch: DecodedPatch,
    originX: number,
    originY: number
  ): void {
    for (let y = 0; y < patch.height; y++) {
      for (let x = 0; x < patch.width; x++) {
        const destX = originX + x;
        const destY = originY + y;

        // Skip if out of bounds
        if (destX < 0 || destX >= destWidth || destY < 0 || destY >= destHeight) {
          continue;
        }

        const srcOffset = (y * patch.width + x) * 4;
        const destOffset = (destY * destWidth + destX) * 4;

        // Get source pixel
        const alpha = patch.pixels[srcOffset + 3];

        // Only copy non-transparent pixels
        if (alpha > 0) {
          destPixels[destOffset] = patch.pixels[srcOffset];     // R
          destPixels[destOffset + 1] = patch.pixels[srcOffset + 1]; // G
          destPixels[destOffset + 2] = patch.pixels[srcOffset + 2]; // B
          destPixels[destOffset + 3] = alpha;                        // A
        }
      }
    }
  }

  /**
   * Get texture definition
   */
  getTexture(name: string): MapTexture | null {
    return this.textures.get(name.toUpperCase()) || null;
  }

  /**
   * Check if texture exists
   */
  hasTexture(name: string): boolean {
    return this.textures.has(name.toUpperCase());
  }

  /**
   * Helper: Read a null-terminated or space-padded string
   */
  private readString(bytes: Uint8Array, offset: number, length: number): string {
    let str = '';
    for (let i = 0; i < length; i++) {
      const byte = bytes[offset + i];
      if (byte === 0) break;
      str += String.fromCharCode(byte);
    }
    return str.trim().toUpperCase();
  }
}
