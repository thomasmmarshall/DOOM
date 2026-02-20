/**
 * DOOM Flat Loader
 * Flats are 64x64 uncompressed textures used for floors and ceilings
 * Based on linuxdoom-1.10/r_data.c
 */

export class FlatLoader {
  static readonly FLAT_WIDTH = 64;
  static readonly FLAT_HEIGHT = 64;
  static readonly FLAT_SIZE = 64 * 64; // 4096 bytes

  /**
   * Decode flat to RGBA using palette
   * Flats are simple: just 4096 bytes of palette indices in row-major order
   */
  static decodeFlat(data: ArrayBuffer, palette: Uint8ClampedArray): Uint8ClampedArray {
    if (data.byteLength !== this.FLAT_SIZE) {
      throw new Error(
        `Invalid flat size: expected ${this.FLAT_SIZE}, got ${data.byteLength}`
      );
    }

    const indexed = new Uint8Array(data);
    const rgba = new Uint8ClampedArray(this.FLAT_SIZE * 4);

    for (let i = 0; i < this.FLAT_SIZE; i++) {
      const paletteIndex = indexed[i];
      const srcOffset = paletteIndex * 4;
      const dstOffset = i * 4;

      rgba[dstOffset] = palette[srcOffset]; // R
      rgba[dstOffset + 1] = palette[srcOffset + 1]; // G
      rgba[dstOffset + 2] = palette[srcOffset + 2]; // B
      rgba[dstOffset + 3] = palette[srcOffset + 3]; // A
    }

    return rgba;
  }

  /**
   * Create a Canvas from flat data
   */
  static flatToCanvas(data: ArrayBuffer, palette: Uint8ClampedArray): HTMLCanvasElement {
    const rgba = this.decodeFlat(data, palette);

    const canvas = document.createElement('canvas');
    canvas.width = this.FLAT_WIDTH;
    canvas.height = this.FLAT_HEIGHT;

    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(this.FLAT_WIDTH, this.FLAT_HEIGHT);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);

    // Removed debug pixel checking - some DOOM flats are legitimately very dark/black

    return canvas;
  }
}
