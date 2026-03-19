/**
 * View border (reduced screen size only)
 * Matches linuxdoom-1.10/r_draw.c R_FillBackScreen and patch placement.
 *
 * When scaledviewwidth == 320, vanilla returns immediately — no border.
 */

import type { WADReader } from '../wad';
import { PatchDecoder } from '../graphics';
import { FlatLoader } from '../graphics/FlatLoader';

const SCREENWIDTH = 320;
const SBARHEIGHT = 32;
/** R_FillBackScreen fills y in [0, SCREENHEIGHT - SBARHEIGHT) */
const VIEW_AREA_HEIGHT = 200 - SBARHEIGHT;
const BORDER = 8;

type BrdrPatch = { canvas: HTMLCanvasElement; leftoffset: number; topoffset: number };

export class BorderFrame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wad: WADReader;
  private palette: Uint8ClampedArray;
  private patches: Map<string, BrdrPatch> = new Map();
  private flatTile: HTMLCanvasElement | null = null;
  private initialized = false;
  /** r_draw: scaledviewwidth — interior 3D width in framebuffer pixels. */
  private scaledViewWidth = SCREENWIDTH;
  /** r_draw: viewheight — interior 3D height. */
  private viewHeight = VIEW_AREA_HEIGHT;

  constructor(wad: WADReader, palette: Uint8ClampedArray) {
    this.wad = wad;
    this.palette = palette;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 168;
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '500';

    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * Game viewport size (same units as vanilla `scaledviewwidth` / `viewheight`).
   * Full-screen DOOM uses 320 × 168 above the status bar → no border drawn.
   */
  setViewportGameSize(scaledViewWidth: number, viewHeight: number): void {
    this.scaledViewWidth = scaledViewWidth;
    this.viewHeight = viewHeight;
    this.render();
  }

  resize(viewWidth: number, viewHeight: number): void {
    if (viewWidth <= 0 || viewHeight <= 0) return;
    this.canvas.style.width = `${viewWidth}px`;
    this.canvas.style.height = `${viewHeight}px`;
    this.render();
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    const borderFlatName = this.wad.hasLump('MAP01') ? 'GRNROCK' : 'FLOOR7_2';
    const flatData = this.wad.readLump(borderFlatName);
    if (flatData && flatData.byteLength === FlatLoader.FLAT_SIZE) {
      this.flatTile = FlatLoader.flatToCanvas(flatData, this.palette);
    }

    const names = ['BRDR_T', 'BRDR_B', 'BRDR_L', 'BRDR_R', 'BRDR_TL', 'BRDR_TR', 'BRDR_BL', 'BRDR_BR'];
    for (const name of names) {
      const data = this.wad.readLump(name);
      if (!data) continue;
      try {
        const decoded = PatchDecoder.decodePatch(data, this.palette);
        const canvas = PatchDecoder.patchToCanvas(decoded);
        this.patches.set(name, {
          canvas,
          leftoffset: decoded.leftoffset,
          topoffset: decoded.topoffset,
        });
      } catch {
        console.warn(`BorderFrame: failed ${name}`);
      }
    }

    this.initialized = true;
    this.render();
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  private drawPatch(patch: BrdrPatch | undefined, x: number, y: number): void {
    if (!patch?.canvas.width) return;
    this.ctx.drawImage(patch.canvas, x - patch.leftoffset, y - patch.topoffset);
  }

  /**
   * R_FillBackScreen — buffer is 320 × (200 − 32). Patches use screen coords; V_DrawPatch anchors apply.
   */
  render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.scaledViewWidth === SCREENWIDTH) {
      this.canvas.style.display = 'none';
      return;
    }

    this.canvas.style.display = 'block';

    const t = this.patches.get('BRDR_T');
    const b = this.patches.get('BRDR_B');
    const l = this.patches.get('BRDR_L');
    const r = this.patches.get('BRDR_R');
    const tl = this.patches.get('BRDR_TL');
    const tr = this.patches.get('BRDR_TR');
    const bl = this.patches.get('BRDR_BL');
    const br = this.patches.get('BRDR_BR');

    if (!this.flatTile || !t || !b || !l || !r || !tl || !tr || !bl || !br) {
      return;
    }

    const viewwindowx = (SCREENWIDTH - this.scaledViewWidth) >> 1;
    const viewwindowy = (VIEW_AREA_HEIGHT - this.viewHeight) >> 1;
    const vw = this.scaledViewWidth;
    const vh = this.viewHeight;

    // R_FillBackScreen: each framebuffer row repeats one 64-wide row of the flat at (y&63).
    for (let y = 0; y < VIEW_AREA_HEIGHT; y++) {
      const fy = y & 63;
      for (let x = 0; x < SCREENWIDTH; x += 64) {
        this.ctx.drawImage(this.flatTile, 0, fy, 64, 1, x, y, 64, 1);
      }
    }

    for (let x = 0; x < vw; x += BORDER) {
      this.drawPatch(t, viewwindowx + x, viewwindowy - BORDER);
      this.drawPatch(b, viewwindowx + x, viewwindowy + vh);
    }
    for (let y = 0; y < vh; y += BORDER) {
      this.drawPatch(l, viewwindowx - BORDER, viewwindowy + y);
      this.drawPatch(r, viewwindowx + vw, viewwindowy + y);
    }

    this.drawPatch(tl, viewwindowx - BORDER, viewwindowy - BORDER);
    this.drawPatch(tr, viewwindowx + vw, viewwindowy - BORDER);
    this.drawPatch(bl, viewwindowx - BORDER, viewwindowy + vh);
    this.drawPatch(br, viewwindowx + vw, viewwindowy + vh);
  }
}
