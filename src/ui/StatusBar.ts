/**
 * Status Bar (HUD) Renderer
 * Displays health, armor, ammo, and other player stats
 * Based on linuxdoom-1.10/st_stuff.c
 */

import type { WADReader } from '../wad';
import { PatchDecoder } from '../graphics';
import type { Mobj } from '../game/mobj';
import { buildStFaceLumpNames, StFaceWidgetState, ST_DEADFACE, type StFaceInput } from './stFace';

/**
 * Player stats for HUD display
 * Matches original DOOM st_stuff.c layout: main ammo, health, arms (weapon grid), armor, 4 ammo types.
 */
export interface PlayerStats {
  health: number;
  armor: number;
  /** Null = ready weapon uses no ammo (do not draw digits). */
  ammo: number | null;
  /** Per-type ammo for right-side display: bullets, shells, rockets, cells (indices 0-3) */
  ammoCounts: [number, number, number, number];
  maxAmmoCounts: [number, number, number, number];
  keys: {
    blueCard: boolean;
    yellowCard: boolean;
    redCard: boolean;
    blueSkull: boolean;
    yellowSkull: boolean;
    redSkull: boolean;
  };
  weapons: boolean[];
  currentWeapon: number;
  message?: string;
  faceContext?: Omit<StFaceInput, 'health' | 'healthPrevTick' | 'playerMo'> & {
    healthPrevTick: number;
    playerMo: Mobj;
  };
}

export class StatusBar {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wad: WADReader;
  private palette: Uint8ClampedArray;
  private numberPatches: HTMLCanvasElement[] = [];
  private statusBarPatch?: HTMLCanvasElement;
  private facePatches: HTMLCanvasElement[] = [];
  private faceBackPatch: HTMLCanvasElement | null = null;
  private faceWidget = new StFaceWidgetState();
  private keyPatches: HTMLCanvasElement[] = []; // STKEYS0-5
  private armsBgPatch: HTMLCanvasElement | null = null; // STARMS single-player arms background
  private armsGray: HTMLCanvasElement[] = [];
  private armsYellow: HTMLCanvasElement[] = [];
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
  private static readonly ST_MAXAMMO0X = 314;

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

    const faceBackData = this.wad.readLump('STFB0');
    if (faceBackData) {
      try {
        const decoded = PatchDecoder.decodePatch(faceBackData, this.palette);
        const canvas = document.createElement('canvas');
        canvas.width = decoded.width;
        canvas.height = decoded.height;
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.createImageData(decoded.width, decoded.height);
        imageData.data.set(decoded.pixels);
        ctx.putImageData(imageData, 0, 0);
        this.faceBackPatch = canvas;
      } catch {
        console.warn('Failed to load STFB0');
      }
    }

    for (const name of buildStFaceLumpNames()) {
      const lumpData = this.wad.readLump(name);
      if (!lumpData) {
        this.facePatches.push(document.createElement('canvas'));
        continue;
      }
      try {
        const decoded = PatchDecoder.decodePatch(lumpData, this.palette);
        const canvas = document.createElement('canvas');
        canvas.width = decoded.width;
        canvas.height = decoded.height;
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.createImageData(decoded.width, decoded.height);
        imageData.data.set(decoded.pixels);
        ctx.putImageData(imageData, 0, 0);
        this.facePatches.push(canvas);
      } catch {
        console.warn(`Failed face ${name}`);
        this.facePatches.push(document.createElement('canvas'));
      }
    }

    for (let n = 2; n <= 7; n++) {
      const gray = this.wad.readLump(`STGNUM${n}`);
      if (gray) {
        try {
          const decoded = PatchDecoder.decodePatch(gray, this.palette);
          const canvas = document.createElement('canvas');
          canvas.width = decoded.width;
          canvas.height = decoded.height;
          const ctx = canvas.getContext('2d')!;
          const imageData = ctx.createImageData(decoded.width, decoded.height);
          imageData.data.set(decoded.pixels);
          ctx.putImageData(imageData, 0, 0);
          this.armsGray.push(canvas);
        } catch {
          this.armsGray.push(document.createElement('canvas'));
        }
      } else {
        this.armsGray.push(document.createElement('canvas'));
      }

      const yellow = this.wad.readLump(`STYSNUM${n}`);
      if (yellow) {
        try {
          const decoded = PatchDecoder.decodePatch(yellow, this.palette);
          const canvas = document.createElement('canvas');
          canvas.width = decoded.width;
          canvas.height = decoded.height;
          const ctx = canvas.getContext('2d')!;
          const imageData = ctx.createImageData(decoded.width, decoded.height);
          imageData.data.set(decoded.pixels);
          ctx.putImageData(imageData, 0, 0);
          this.armsYellow.push(canvas);
        } catch {
          this.armsYellow.push(document.createElement('canvas'));
        }
      } else {
        this.armsYellow.push(document.createElement('canvas'));
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

    if (stats.ammo !== null) {
      this.drawNumberRightAligned(Math.max(0, stats.ammo), StatusBar.ST_AMMOX + 24, 3, 3);
    }
    this.drawNumberRightAligned(Math.max(0, stats.health), StatusBar.ST_HEALTHX + 24, 3, 3);
    this.drawNumberRightAligned(Math.max(0, stats.armor), StatusBar.ST_ARMORX + 24, 3, 3);

    if (this.armsBgPatch) {
      this.ctx.drawImage(this.armsBgPatch, StatusBar.ST_ARMSBGX, 0);
    }

    for (let i = 0; i < 6; i++) {
      const x = StatusBar.ST_ARMSX + (i % 3) * StatusBar.ST_ARMSXSPACE;
      const y = StatusBar.ST_ARMSY + Math.floor(i / 3) * StatusBar.ST_ARMSYSPACE;
      const gray = this.armsGray[i];
      const yellow = this.armsYellow[i];
      if (gray?.width) {
        this.ctx.drawImage(gray, x - gray.width, y + 3);
      }
      if (stats.weapons[i + 1] && yellow?.width) {
        this.ctx.drawImage(yellow, x - yellow.width, y + 3);
      }
    }

    if (this.faceBackPatch?.width) {
      this.ctx.drawImage(this.faceBackPatch, 143, 0);
    }
    let faceIdx = 0;
    const fc = stats.faceContext;
    if (fc && this.facePatches.length) {
      faceIdx = this.faceWidget.tick({
        health: stats.health,
        healthPrevTick: fc.healthPrevTick,
        damageCount: fc.damageCount,
        bonusCount: fc.bonusCount,
        weaponJustPicked: fc.weaponJustPicked,
        attackHeld: fc.attackHeld,
        invulnTics: fc.invulnTics,
        angleBam: fc.angleBam,
        playerX: fc.playerX,
        playerY: fc.playerY,
        playerMo: fc.playerMo,
        damageAttacker: fc.damageAttacker,
      });
    } else if (this.facePatches.length > 0) {
      faceIdx = stats.health <= 0 ? ST_DEADFACE : 0;
    }
    const face = this.facePatches[faceIdx];
    if (face?.width) {
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

    this.drawNumberRightAligned(stats.maxAmmoCounts[0], StatusBar.ST_MAXAMMO0X + 24, StatusBar.ST_AMMO0Y, 3);
    this.drawNumberRightAligned(stats.maxAmmoCounts[1], StatusBar.ST_MAXAMMO0X + 24, StatusBar.ST_AMMO1Y, 3);
    this.drawNumberRightAligned(stats.maxAmmoCounts[2], StatusBar.ST_MAXAMMO0X + 24, StatusBar.ST_AMMO2Y, 3);
    this.drawNumberRightAligned(stats.maxAmmoCounts[3], StatusBar.ST_MAXAMMO0X + 24, StatusBar.ST_AMMO3Y, 3);

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
