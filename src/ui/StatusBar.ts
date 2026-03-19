/**
 * Status Bar (HUD) Renderer
 * Displays health, armor, ammo, and other player stats
 * Based on linuxdoom-1.10/st_stuff.c
 */

import type { WADReader } from '../wad';
import { PatchDecoder } from '../graphics';

/** Original st_stuff.c: 5 pain levels */
const ST_NUMPAINFACES = 5;

/**
 * Player stats for HUD display
 */
export interface PlayerStats {
  health: number;
  armor: number;
  ammo: number;
  maxAmmo: number;
  keys: {
    blueCard: boolean;
    yellowCard: boolean;
    redCard: boolean;
    blueSkull: boolean;
    yellowSkull: boolean;
    redSkull: boolean;
  };
  weapons: boolean[]; // Index corresponds to weapon number
  currentWeapon: number;
  face?: number; // Deprecated: computed from health if not provided
  message?: string;
}

export class StatusBar {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wad: WADReader;
  private palette: Uint8ClampedArray;
  private numberPatches: HTMLCanvasElement[] = [];
  private statusBarPatch?: HTMLCanvasElement;
  private facePatches: Map<number, HTMLCanvasElement> = new Map(); // pain level 0-4 + dead
  private keyPatches: HTMLCanvasElement[] = []; // STKEYS0-5
  private initialized: boolean = false;

  constructor(wad: WADReader, palette: Uint8ClampedArray, parent?: HTMLElement) {
    this.wad = wad;
    this.palette = palette;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 32;
    this.canvas.style.flex = '0 0 auto';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '16%';
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.imageRendering = 'crisp-edges';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '1000';

    this.updateCanvasScale();
    window.addEventListener('resize', () => this.updateCanvasScale());

    this.ctx = this.canvas.getContext('2d')!;

    (parent ?? document.body).appendChild(this.canvas);
  }

  /**
   * Update canvas scale to match window size
   */
  private updateCanvasScale(): void {
    // Status bar size is controlled by flex parent; keep pixel ratio
    this.canvas.style.width = '100%';
    this.canvas.style.height = '16%';
  }

  /**
   * Initialize HUD graphics
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    const statusBarData = this.wad.readLump('STBAR');
    if (statusBarData) {
      const decoded = PatchDecoder.decodePatch(statusBarData, this.palette);
      this.statusBarPatch = document.createElement('canvas');
      this.statusBarPatch.width = decoded.width;
      this.statusBarPatch.height = decoded.height;
      const ctx = this.statusBarPatch.getContext('2d')!;
      const imageData = ctx.createImageData(decoded.width, decoded.height);
      imageData.data.set(decoded.pixels);
      ctx.putImageData(imageData, 0, 0);
    }

    // Load number font (STTNUM0-9)
    for (let i = 0; i <= 9; i++) {
      const lumpName = `STTNUM${i}`;
      const lumpData = this.wad.readLump(lumpName);

      if (lumpData) {
        try {
          const decoded = PatchDecoder.decodePatch(lumpData, this.palette);

          const canvas = document.createElement('canvas');
          canvas.width = decoded.width;
          canvas.height = decoded.height;

          const ctx = canvas.getContext('2d')!;
          const imageData = ctx.createImageData(decoded.width, decoded.height);
          imageData.data.set(decoded.pixels);
          ctx.putImageData(imageData, 0, 0);

          this.numberPatches[i] = canvas;
        } catch (error) {
          console.warn(`Failed to load number patch ${lumpName}:`, error);
        }
      }
    }

    // Face patches: STFST00 (80-100%), STFST10 (60-79%), STFST20 (40-59%), STFST30 (20-39%), STFST40 (1-19%), STFDEAD0 (dead)
    const faceNames = ['STFST00', 'STFST10', 'STFST20', 'STFST30', 'STFST40', 'STFDEAD0'];
    for (let i = 0; i < faceNames.length; i++) {
      const lumpData = this.wad.readLump(faceNames[i]);
      if (!lumpData) continue;
      try {
        const decoded = PatchDecoder.decodePatch(lumpData, this.palette);
        const canvas = document.createElement('canvas');
        canvas.width = decoded.width;
        canvas.height = decoded.height;
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.createImageData(decoded.width, decoded.height);
        imageData.data.set(decoded.pixels);
        ctx.putImageData(imageData, 0, 0);
        this.facePatches.set(i, canvas);
      } catch (error) {
        console.warn(`Failed to load face patch ${faceNames[i]}:`, error);
      }
    }

    // Key patches: STKEYS0-5 (blue/yellow/red card, blue/yellow/red skull)
    for (let i = 0; i <= 5; i++) {
      const lumpData = this.wad.readLump(`STKEYS${i}`);
      if (!lumpData) continue;
      try {
        const decoded = PatchDecoder.decodePatch(lumpData, this.palette);
        const canvas = document.createElement('canvas');
        canvas.width = decoded.width;
        canvas.height = decoded.height;
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.createImageData(decoded.width, decoded.height);
        imageData.data.set(decoded.pixels);
        ctx.putImageData(imageData, 0, 0);
        this.keyPatches[i] = canvas;
      } catch (error) {
        console.warn(`Failed to load key patch STKEYS${i}:`, error);
      }
    }

    this.initialized = true;
    console.log('StatusBar initialized');
  }

  /**
   * Draw a number at position
   */
  private drawNumber(num: number, x: number, y: number, digits: number = 3, color: string = 'white'): void {
    const numStr = num.toString().padStart(digits, '0').substring(0, digits);

    let offsetX = x;
    for (let i = 0; i < numStr.length; i++) {
      const digit = parseInt(numStr[i]);
      const patch = this.numberPatches[digit];

      if (patch) {
        this.ctx.drawImage(patch, offsetX, y);
        offsetX += patch.width;
      } else {
        // Fallback to canvas text
        this.ctx.fillStyle = color;
        this.ctx.font = 'bold 12px monospace';
        this.ctx.fillText(numStr[i], offsetX, y + 12);
        offsetX += 8;
      }
    }
  }

  private drawNumberRightAligned(num: number, rightX: number, y: number, digits: number = 3): void {
    const text = num.toString().padStart(digits, '0').substring(0, digits);
    const widths = text.split('').map((char) => this.numberPatches[parseInt(char)]?.width ?? 8);
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    this.drawNumber(num, rightX - totalWidth, y, digits);
  }

  /**
   * Render status bar
   */
  render(stats: PlayerStats): void {
    if (!this.initialized) {
      console.warn('StatusBar not initialized');
      return;
    }

    // Clear canvas
    this.ctx.fillStyle = '#2b2b2b'; // Dark gray background
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.statusBarPatch) {
      this.ctx.drawImage(this.statusBarPatch, 0, 0);
    } else {
      this.ctx.fillStyle = '#666';
      this.ctx.fillRect(0, 0, 320, 32);
    }

    // Original: ST_AMMOY=ST_HEALTHY=ST_ARMORY=171 -> bar-relative Y = 3 (32px bar starts at screen 168)
    this.drawNumberRightAligned(Math.max(0, stats.ammo), 43, 3, 3);
    this.drawNumberRightAligned(Math.max(0, stats.health), 95, 3, 3);
    this.drawNumberRightAligned(Math.max(0, stats.armor), 221, 3, 3);

    // Face: ST_FACESX=143, ST_FACESY=168 -> bar (143, 0)
    const health = Math.min(100, Math.max(0, stats.health));
    const faceIndex = health <= 0 ? 5 : Math.min(4, Math.floor(((100 - health) * ST_NUMPAINFACES) / 101));
    const face = this.facePatches.get(faceIndex) ?? this.facePatches.get(0);
    if (face) {
      this.ctx.drawImage(face, 143, 0);
    }

    // Keys: ST_KEY0X=239, ST_KEY1X=239, ST_KEY2X=239; ST_KEY0Y=171, ST_KEY1Y=181, ST_KEY2Y=191 (relative to 32px bar: 3, 13, 23)
    const keySlots = [
      stats.keys.blueCard ? 0 : stats.keys.blueSkull ? 3 : -1,
      stats.keys.yellowCard ? 1 : stats.keys.yellowSkull ? 4 : -1,
      stats.keys.redCard ? 2 : stats.keys.redSkull ? 5 : -1,
    ];
    const keyX = 239;
    const keyY = [3, 13, 23];
    for (let i = 0; i < 3; i++) {
      const idx = keySlots[i];
      if (idx >= 0 && this.keyPatches[idx]) {
        this.ctx.drawImage(this.keyPatches[idx], keyX, keyY[i]);
      }
    }

    if (stats.message) {
      this.ctx.fillStyle = '#ffd54a';
      this.ctx.font = '8px monospace';
      this.ctx.fillText(stats.message, 110, 29);
    }
  }

  /**
   * Show or hide status bar
   */
  setVisible(visible: boolean): void {
    this.canvas.style.display = visible ? 'block' : 'none';
  }

  /**
   * Cleanup
   */
  dispose(): void {
    document.body.removeChild(this.canvas);
  }
}
