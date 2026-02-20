/**
 * PLAYPAL and COLORMAP loader
 * Based on linuxdoom-1.10/r_data.c
 */

import type { Palette, Colormap } from './types';

export class PaletteLoader {
  /**
   * Load PLAYPAL lump
   * PLAYPAL contains 14 palettes (each 768 bytes = 256 RGB triplets)
   * We typically use the first palette (index 0)
   */
  static loadPalette(data: ArrayBuffer, paletteIndex: number = 0): Palette {
    const PALETTE_SIZE = 768; // 256 colors * 3 bytes (RGB)
    const offset = paletteIndex * PALETTE_SIZE;

    if (offset + PALETTE_SIZE > data.byteLength) {
      throw new Error(`Palette index ${paletteIndex} out of bounds`);
    }

    return new Uint8Array(data, offset, PALETTE_SIZE);
  }

  /**
   * Load COLORMAP lump
   * COLORMAP contains 34 colormaps (each 256 bytes)
   * - 0-31: Normal light levels (0 = brightest, 31 = darkest)
   * - 32: Invulnerability colormap
   * - 33: Extra dark (unused in DOOM)
   */
  static loadColormap(data: ArrayBuffer): Colormap {
    return new Uint8Array(data);
  }

  /**
   * Get a specific colormap by index
   */
  static getColormap(colormaps: Colormap, index: number): Uint8Array {
    const COLORMAP_SIZE = 256;
    const offset = index * COLORMAP_SIZE;

    if (offset + COLORMAP_SIZE > colormaps.byteLength) {
      throw new Error(`Colormap index ${index} out of bounds`);
    }

    return colormaps.subarray(offset, offset + COLORMAP_SIZE);
  }

  /**
   * Convert palette to RGBA for use with Canvas/WebGL
   * @param palette - PLAYPAL palette data
   * @param lightLevel - Light level 0-255 (0 = darkest, 255 = brightest)
   * @returns RGBA palette (1024 bytes = 256 colors * 4 bytes)
   */
  static paletteToRGBA(palette: Palette, lightLevel: number = 255): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(256 * 4);

    // Calculate light multiplier (0.0 to 1.0)
    const lightMult = lightLevel / 255;

    for (let i = 0; i < 256; i++) {
      const paletteOffset = i * 3;
      const rgbaOffset = i * 4;

      rgba[rgbaOffset] = Math.floor(palette[paletteOffset] * lightMult); // R
      rgba[rgbaOffset + 1] = Math.floor(palette[paletteOffset + 1] * lightMult); // G
      rgba[rgbaOffset + 2] = Math.floor(palette[paletteOffset + 2] * lightMult); // B
      rgba[rgbaOffset + 3] = 255; // A (fully opaque)
    }

    // Make color 0 transparent (used for transparency in sprites/textures)
    rgba[3] = 0;

    return rgba;
  }
}
