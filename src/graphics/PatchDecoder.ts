/**
 * DOOM Patch Decoder
 * Decodes column-based patch format to RGBA pixels
 * Based on linuxdoom-1.10/r_data.c and r_defs.h
 */

import type { PatchHeader, Post, DecodedPatch } from './types';

export class PatchDecoder {
  /**
   * Parse patch header
   */
  static parsePatchHeader(data: ArrayBuffer): PatchHeader {
    const view = new DataView(data);

    const width = view.getInt16(0, true);
    const height = view.getInt16(2, true);
    const leftoffset = view.getInt16(4, true);
    const topoffset = view.getInt16(6, true);

    // Read column offsets (4 bytes each, width entries)
    const columnofs: number[] = [];
    for (let i = 0; i < width; i++) {
      columnofs.push(view.getInt32(8 + i * 4, true));
    }

    return {
      width,
      height,
      leftoffset,
      topoffset,
      columnofs,
    };
  }

  /**
   * Decode a single column
   * Columns are composed of posts (runs of pixels)
   * Format:
   * - topdelta (byte) - row start (255 = end marker)
   * - length (byte) - number of pixels
   * - unused (byte)
   * - pixel data (length bytes)
   * - unused (byte)
   */
  static decodeColumn(data: Uint8Array, offset: number): Post[] {
    const posts: Post[] = [];
    let pos = offset;

    while (true) {
      const topdelta = data[pos];

      // 255 = end of column
      if (topdelta === 255) {
        break;
      }

      const length = data[pos + 1];

      // Skip unused byte
      pos += 2;

      // Read pixel data (skip first padding byte)
      pos += 1;
      const pixelData = data.slice(pos, pos + length);
      pos += length;

      // Skip trailing padding byte
      pos += 1;

      posts.push({
        topdelta,
        length,
        data: pixelData,
      });
    }

    return posts;
  }

  /**
   * Decode patch to indexed color pixels
   * @returns Uint8Array where each byte is a palette index
   */
  static decodePatchIndexed(data: ArrayBuffer): {
    header: PatchHeader;
    pixels: Uint8Array;
  } {
    const header = this.parsePatchHeader(data);
    const bytes = new Uint8Array(data);

    // Initialize pixel buffer (0 = transparent)
    const pixels = new Uint8Array(header.width * header.height);

    // Decode each column
    for (let x = 0; x < header.width; x++) {
      const columnOffset = header.columnofs[x];
      const posts = this.decodeColumn(bytes, columnOffset);

      // Draw each post in the column
      for (const post of posts) {
        for (let i = 0; i < post.length; i++) {
          const y = post.topdelta + i;
          if (y >= 0 && y < header.height) {
            pixels[y * header.width + x] = post.data[i];
          }
        }
      }
    }

    return { header, pixels };
  }

  /**
   * Decode patch to RGBA using palette
   * @param data - Patch data
   * @param palette - RGBA palette (1024 bytes = 256 colors * 4 bytes)
   * @returns DecodedPatch with RGBA pixels
   */
  static decodePatch(data: ArrayBuffer, palette: Uint8ClampedArray): DecodedPatch {
    const { header, pixels } = this.decodePatchIndexed(data);

    // Convert indexed pixels to RGBA
    const rgba = new Uint8ClampedArray(header.width * header.height * 4);

    for (let i = 0; i < pixels.length; i++) {
      const paletteIndex = pixels[i];
      const srcOffset = paletteIndex * 4;
      const dstOffset = i * 4;

      rgba[dstOffset] = palette[srcOffset]; // R
      rgba[dstOffset + 1] = palette[srcOffset + 1]; // G
      rgba[dstOffset + 2] = palette[srcOffset + 2]; // B
      rgba[dstOffset + 3] = palette[srcOffset + 3]; // A
    }

    return {
      width: header.width,
      height: header.height,
      leftoffset: header.leftoffset,
      topoffset: header.topoffset,
      pixels: rgba,
    };
  }

  /**
   * Create a Canvas from a decoded patch
   */
  static patchToCanvas(patch: DecodedPatch): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = patch.width;
    canvas.height = patch.height;

    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(patch.width, patch.height);
    imageData.data.set(patch.pixels);
    ctx.putImageData(imageData, 0, 0);

    return canvas;
  }
}
