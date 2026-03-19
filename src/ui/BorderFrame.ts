/**
 * Border Frame
 * Draws the classic DOOM border around the view area
 * Based on linuxdoom-1.10/r_draw.c R_FillBackScreen
 */

import type { WADReader } from '../wad';
import { PatchDecoder } from '../graphics';

const BORDER_SIZE = 8;

export class BorderFrame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wad: WADReader;
  private palette: Uint8ClampedArray;
  private patches: Map<string, HTMLCanvasElement> = new Map();
  private initialized = false;
  private viewWidth = 320;
  private viewHeight = 168;

  constructor(wad: WADReader, palette: Uint8ClampedArray) {
    this.wad = wad;
    this.palette = palette;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.viewWidth + BORDER_SIZE * 2;
    this.canvas.height = this.viewHeight + BORDER_SIZE * 2;
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '-8px';
    this.canvas.style.left = '-8px';
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.imageRendering = 'crisp-edges';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '500';

    this.ctx = this.canvas.getContext('2d')!;
  }

  /**
   * Resize border to frame a view of the given dimensions (e.g. viewContainer size).
   * Call when the view is first shown and on window resize.
   */
  resize(viewWidth: number, viewHeight: number): void {
    if (viewWidth <= 0 || viewHeight <= 0) return;
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    this.canvas.width = viewWidth + BORDER_SIZE * 2;
    this.canvas.height = viewHeight + BORDER_SIZE * 2;
    this.render();
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    const names = ['brdr_t', 'brdr_b', 'brdr_l', 'brdr_r', 'brdr_tl', 'brdr_tr', 'brdr_bl', 'brdr_br'];
    for (const name of names) {
      const data = this.wad.readLump(name);
      if (data) {
        const decoded = PatchDecoder.decodePatch(data, this.palette);
        const c = document.createElement('canvas');
        c.width = decoded.width;
        c.height = decoded.height;
        const ctx = c.getContext('2d')!;
        const img = ctx.createImageData(decoded.width, decoded.height);
        img.data.set(decoded.pixels);
        ctx.putImageData(img, 0, 0);
        this.patches.set(name, c);
      }
    }

    this.initialized = true;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const t = this.patches.get('brdr_t');
    const b = this.patches.get('brdr_b');
    const l = this.patches.get('brdr_l');
    const r = this.patches.get('brdr_r');
    const tl = this.patches.get('brdr_tl');
    const tr = this.patches.get('brdr_tr');
    const bl = this.patches.get('brdr_bl');
    const br = this.patches.get('brdr_br');

    if (!t || !b || !l || !r || !tl || !tr || !bl || !br) return;

    const w = this.viewWidth;
    const h = this.viewHeight;
    for (let x = 0; x < w; x += BORDER_SIZE) {
      this.ctx.drawImage(t, BORDER_SIZE + x, 0);
      this.ctx.drawImage(b, BORDER_SIZE + x, BORDER_SIZE + h);
    }
    for (let y = 0; y < h; y += BORDER_SIZE) {
      this.ctx.drawImage(l, 0, BORDER_SIZE + y);
      this.ctx.drawImage(r, BORDER_SIZE + w, BORDER_SIZE + y);
    }
    this.ctx.drawImage(tl, 0, 0);
    this.ctx.drawImage(tr, BORDER_SIZE + w, 0);
    this.ctx.drawImage(bl, 0, BORDER_SIZE + h);
    this.ctx.drawImage(br, BORDER_SIZE + w, BORDER_SIZE + h);
  }
}
