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
 * Matches original DOOM st_stuff.c layout: main ammo, health, arms (weapon grid), armor, 4 ammo types.
 */
export interface PlayerStats {
  health: number;
  armor: number;
  ammo: number;
  maxAmmo: number;
  /** Per-type ammo for right-side display: bullets, shells, rockets, cells (indices 0-3) */
  ammoCounts: [number, number, number, number];
  keys: {
    blueCard: boolean;
    yellowCard: boolean;
    redCard: boolean;
    blueSkull: boolean;
    yellowSkull: boolean;
    redSkull: boolean;
  };
  weapons: boolean[]; // Index 0=fist, 1=pistol, ... 7=BFG; arms show 2-7 (keys 1-6 in widget)
  currentWeapon: number;
  face?: number;
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
  private armsBgPatch: HTMLCanvasElement | null = null; // STARMS single-player arms background
  private initialized: boolean = false;

  // Original st_stuff.c coordinates (Y relative to bar top 0)
  private static readonly ST_AMMOX = 44;
  private static readonly ST_HEALTHX = 90;
  private static readonly ST_ARMORX = 221;
  private static readonly ST_ARMSBGX = 104;
  private static readonly ST_ARMSX = 111;
  private static readonly ST_ARMSY = 4;
  private static readonly ST_ARMSXSPACE = 12;
  private static readonly ST_ARMSYSPACE = 10;
  private static readonly ST_AMMO0X = 288;
  private static readonly ST_AMMO0Y = 5;
  private static readonly ST_AMMO1Y = 11;
  private static readonly ST_AMMO2Y = 23;
  private static readonly ST_AMMO3Y = 17;

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

    // Arms background (ARMS area in single-player; in deathmatch this is FRAG)
    const armsBgData = this.wad.readLump('STARMS');
    if (armsBgData) {
      try {
        const decoded = PatchDecoder.decodePatch(armsBgData, this.palette);
        const canvas = document.createElement('canvas');
        canvas.width = decoded.width;
        canvas.height = decoded.height;
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.createImageData(decoded.width, decoded.height);
        imageData.data.set(decoded.pixels);
        ctx.putImageData(imageData, 0, 0);
        this.armsBgPatch = canvas;
      } catch (error) {
        console.warn('Failed to load STARMS:', error);
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

    // Ready-weapon ammo (left), health, armor - original st_stuff positions
    this.drawNumberRightAligned(Math.max(0, stats.ammo), StatusBar.ST_AMMOX + 24, 3, 3);
    this.drawNumberRightAligned(Math.max(0, stats.health), StatusBar.ST_HEALTHX + 24, 3, 3);
    this.drawNumberRightAligned(Math.max(0, stats.armor), StatusBar.ST_ARMORX + 24, 3, 3);

    // Arms background (ARMS area; in deathmatch DOOM draws FRAG here instead)
    if (this.armsBgPatch) {
      this.ctx.drawImage(this.armsBgPatch, StatusBar.ST_ARMSBGX, 0);
    }

    // Weapon slots 2-7 (keys 2-7): draw digit when weapon owned, 6 positions in 2 rows
    for (let i = 0; i < 6; i++) {
      if (stats.weapons[i + 1]) {
        const digit = i + 2; // key 2 through 7
        const x = StatusBar.ST_ARMSX + (i % 3) * StatusBar.ST_ARMSXSPACE;
        const y = StatusBar.ST_ARMSY + Math.floor(i / 3) * StatusBar.ST_ARMSYSPACE;
        this.drawNumber(digit, x, y, 1);
      }
    }

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

    // Four ammo types (bullets, shells, rockets, cells) - right side
    this.drawNumberRightAligned(Math.max(0, stats.ammoCounts[0]), StatusBar.ST_AMMO0X + 24, StatusBar.ST_AMMO0Y, 3);
    this.drawNumberRightAligned(Math.max(0, stats.ammoCounts[1]), StatusBar.ST_AMMO0X + 24, StatusBar.ST_AMMO1Y, 3);
    this.drawNumberRightAligned(Math.max(0, stats.ammoCounts[2]), StatusBar.ST_AMMO0X + 24, StatusBar.ST_AMMO2Y, 3);
    this.drawNumberRightAligned(Math.max(0, stats.ammoCounts[3]), StatusBar.ST_AMMO0X + 24, StatusBar.ST_AMMO3Y, 3);

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
