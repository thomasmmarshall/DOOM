/**
 * Status Bar (HUD) Renderer
 * Displays health, armor, ammo, and other player stats
 * Digit layout matches linuxdoom-1.10/st_lib.c (STlib_drawNum) and st_stuff.c widgets.
 */

import type { WADReader } from '../wad';
import { PatchDecoder } from '../graphics';
import type { Mobj } from '../game/mobj';
import { buildStFaceLumpNames, StFaceWidgetState, ST_DEADFACE, type StFaceInput } from './stFace';

/** Decoded patch with DOOM anchor offsets (see V_DrawPatch: x -= leftoffset, y -= topoffset). */
type HudPatch = { canvas: HTMLCanvasElement; leftoffset: number; topoffset: number };

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
  /** STTNUM0-9 — tall digits (ready ammo, health, armor). */
  private tallNum: HudPatch[] = [];
  /** STYSNUM0-9 — short yellow digits (per-weapon ammo + maxammo columns). */
  private shortNum: HudPatch[] = [];
  private tallPercent: HudPatch | null = null;
  private statusBarPatch?: HudPatch;
  private facePatches: HudPatch[] = [];
  private faceBackPatch: HudPatch | null = null;
  private faceWidget = new StFaceWidgetState();
  private keyPatches: HudPatch[] = [];
  private armsBgPatch: HudPatch | null = null;
  private armsGray: HudPatch[] = [];
  private armsYellow: HudPatch[] = [];
  private initialized: boolean = false;

  private tallCellW = 0;
  private shortCellW = 0;

  // linuxdoom st_stuff.c — screen Y; local Y = screenY - ST_Y (ST_Y = SCREENHEIGHT - ST_HEIGHT = 168)
  private static readonly ST_Y = 168;
  private static readonly ST_AMMOX = 44;
  private static readonly ST_AMMOY = 171 - StatusBar.ST_Y;
  private static readonly ST_HEALTHX = 90;
  private static readonly ST_HEALTHY = 171 - StatusBar.ST_Y;
  private static readonly ST_ARMORX = 221;
  private static readonly ST_ARMORY = 171 - StatusBar.ST_Y;
  private static readonly ST_ARMSBGX = 104;
  private static readonly ST_ARMSBGY = 168 - StatusBar.ST_Y;
  private static readonly ST_ARMSX = 111;
  private static readonly ST_ARMSY = 172 - StatusBar.ST_Y;
  private static readonly ST_ARMSXSPACE = 12;
  private static readonly ST_ARMSYSPACE = 10;
  private static readonly ST_AMMO0X = 288;
  private static readonly ST_AMMO0Y = 173 - StatusBar.ST_Y;
  private static readonly ST_AMMO1Y = 179 - StatusBar.ST_Y;
  private static readonly ST_AMMO2Y = 191 - StatusBar.ST_Y;
  private static readonly ST_AMMO3Y = 185 - StatusBar.ST_Y;
  private static readonly ST_MAXAMMO0X = 314;

  constructor(wad: WADReader, palette: Uint8ClampedArray, parent?: HTMLElement) {
    this.wad = wad;
    this.palette = palette;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 32;
    this.canvas.style.flex = '0 0 auto';
    this.canvas.style.width = '100%';
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '1000';

    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;

    (parent ?? document.body).appendChild(this.canvas);
  }

  /**
   * Keep the status bar bitmap at 320×32 while CSS size matches game width (same scale as 3D view).
   */
  syncLayout(gamePixelWidth: number): void {
    const w = Math.max(1, Math.floor(gamePixelWidth));
    const h = (w * 32) / 320;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  private decodeHudPatch(lumpName: string): HudPatch | null {
    const lumpData = this.wad.readLump(lumpName);
    if (!lumpData) return null;
    try {
      const decoded = PatchDecoder.decodePatch(lumpData, this.palette);
      return {
        canvas: PatchDecoder.patchToCanvas(decoded),
        leftoffset: decoded.leftoffset,
        topoffset: decoded.topoffset,
      };
    } catch {
      console.warn(`StatusBar: failed to decode ${lumpName}`);
      return null;
    }
  }

  /**
   * Initialize HUD graphics
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    const statusBarData = this.wad.readLump('STBAR');
    if (statusBarData) {
      try {
        const decoded = PatchDecoder.decodePatch(statusBarData, this.palette);
        this.statusBarPatch = {
          canvas: PatchDecoder.patchToCanvas(decoded),
          leftoffset: decoded.leftoffset,
          topoffset: decoded.topoffset,
        };
      } catch {
        console.warn('Failed to decode STBAR');
      }
    }

    for (let i = 0; i <= 9; i++) {
      const t = this.decodeHudPatch(`STTNUM${i}`);
      if (t) this.tallNum[i] = t;
      const s = this.decodeHudPatch(`STYSNUM${i}`);
      if (s) this.shortNum[i] = s;
    }

    if (this.tallNum[0]) {
      this.tallCellW = this.tallNum[0].canvas.width;
    }
    if (this.shortNum[0]) {
      this.shortCellW = this.shortNum[0].canvas.width;
    }

    this.tallPercent = this.decodeHudPatch('STTPRCNT');

    const fb = this.decodeHudPatch('STFB0');
    if (fb) this.faceBackPatch = fb;

    for (const name of buildStFaceLumpNames()) {
      const p = this.decodeHudPatch(name);
      if (p) this.facePatches.push(p);
      else this.facePatches.push({ canvas: document.createElement('canvas'), leftoffset: 0, topoffset: 0 });
    }

    for (let n = 2; n <= 7; n++) {
      const g = this.decodeHudPatch(`STGNUM${n}`);
      this.armsGray.push(g ?? { canvas: document.createElement('canvas'), leftoffset: 0, topoffset: 0 });
      const y = this.shortNum[n];
      this.armsYellow.push(
        y
          ? { canvas: y.canvas, leftoffset: y.leftoffset, topoffset: y.topoffset }
          : { canvas: document.createElement('canvas'), leftoffset: 0, topoffset: 0 }
      );
    }

    for (let i = 0; i <= 5; i++) {
      const p = this.decodeHudPatch(`STKEYS${i}`);
      if (p) this.keyPatches[i] = p;
    }

    const armsBg = this.decodeHudPatch('STARMS');
    if (armsBg) this.armsBgPatch = armsBg;

    this.initialized = true;
    console.log('StatusBar initialized');
  }

  /** V_DrawPatch-compatible placement on the 32px-tall bar canvas. */
  private drawHudPatch(p: HudPatch | undefined, x: number, y: number): void {
    if (!p?.canvas.width) return;
    this.ctx.drawImage(p.canvas, x - p.leftoffset, y - p.topoffset);
  }

  /**
   * STlib_drawNum — n->x is the right edge of the field; fixed cell width from font[0].
   */
  private drawStNumber(
    num: number,
    rightX: number,
    y: number,
    numdigits: number,
    font: HudPatch[],
    cellW: number
  ): void {
    if (cellW <= 0 || font.length < 10) return;

    let n = Math.max(0, Math.floor(num));

    const xRight = rightX;

    if (n === 0) {
      const p = font[0];
      if (!p?.canvas.width) return;
      this.drawHudPatch(p, xRight - cellW, y);
      return;
    }

    let x = xRight;
    let nd = numdigits;
    while (n && nd > 0) {
      x -= cellW;
      const d = n % 10;
      const p = font[d];
      if (p?.canvas.width) this.drawHudPatch(p, x, y);
      n = Math.floor(n / 10);
      nd--;
    }
  }

  /** STlib_updatePercent: percent patch first, then digits (digits win on overlap). */
  private drawPercentNumber(healthOrArmor: number, rightX: number, y: number): void {
    if (this.tallPercent?.canvas.width) {
      this.drawHudPatch(this.tallPercent, rightX, y);
    }
    this.drawStNumber(healthOrArmor, rightX, y, 3, this.tallNum, this.tallCellW);
  }

  /**
   * Render status bar
   */
  render(stats: PlayerStats): void {
    if (!this.initialized) {
      console.warn('StatusBar not initialized');
      return;
    }

    this.ctx.fillStyle = '#2b2b2b';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.statusBarPatch) {
      this.drawHudPatch(this.statusBarPatch, 0, 0);
    } else {
      this.ctx.fillStyle = '#666';
      this.ctx.fillRect(0, 0, 320, 32);
    }

    // ST_drawWidgets order (linuxdoom-1.10/st_stuff.c)
    if (stats.ammo !== null) {
      this.drawStNumber(Math.max(0, stats.ammo), StatusBar.ST_AMMOX, StatusBar.ST_AMMOY, 3, this.tallNum, this.tallCellW);
    }

    this.drawStNumber(Math.max(0, stats.ammoCounts[0]), StatusBar.ST_AMMO0X, StatusBar.ST_AMMO0Y, 3, this.shortNum, this.shortCellW);
    this.drawStNumber(Math.max(0, stats.ammoCounts[1]), StatusBar.ST_AMMO0X, StatusBar.ST_AMMO1Y, 3, this.shortNum, this.shortCellW);
    this.drawStNumber(Math.max(0, stats.ammoCounts[2]), StatusBar.ST_AMMO0X, StatusBar.ST_AMMO2Y, 3, this.shortNum, this.shortCellW);
    this.drawStNumber(Math.max(0, stats.ammoCounts[3]), StatusBar.ST_AMMO0X, StatusBar.ST_AMMO3Y, 3, this.shortNum, this.shortCellW);

    this.drawStNumber(stats.maxAmmoCounts[0], StatusBar.ST_MAXAMMO0X, StatusBar.ST_AMMO0Y, 3, this.shortNum, this.shortCellW);
    this.drawStNumber(stats.maxAmmoCounts[1], StatusBar.ST_MAXAMMO0X, StatusBar.ST_AMMO1Y, 3, this.shortNum, this.shortCellW);
    this.drawStNumber(stats.maxAmmoCounts[2], StatusBar.ST_MAXAMMO0X, StatusBar.ST_AMMO2Y, 3, this.shortNum, this.shortCellW);
    this.drawStNumber(stats.maxAmmoCounts[3], StatusBar.ST_MAXAMMO0X, StatusBar.ST_AMMO3Y, 3, this.shortNum, this.shortCellW);

    this.drawPercentNumber(Math.max(0, stats.health), StatusBar.ST_HEALTHX, StatusBar.ST_HEALTHY);
    this.drawPercentNumber(Math.max(0, stats.armor), StatusBar.ST_ARMORX, StatusBar.ST_ARMORY);

    if (this.armsBgPatch) {
      this.drawHudPatch(this.armsBgPatch, StatusBar.ST_ARMSBGX, StatusBar.ST_ARMSBGY);
    }

    for (let i = 0; i < 6; i++) {
      const sx = StatusBar.ST_ARMSX + (i % 3) * StatusBar.ST_ARMSXSPACE;
      const sy = StatusBar.ST_ARMSY + Math.floor(i / 3) * StatusBar.ST_ARMSYSPACE;
      const owned = stats.weapons[i + 1];
      const patch = owned ? this.armsYellow[i] : this.armsGray[i];
      this.drawHudPatch(patch, sx, sy);
    }

    if (this.faceBackPatch?.canvas.width) {
      this.drawHudPatch(this.faceBackPatch, 143, 0);
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
    this.drawHudPatch(face, 143, 0);

    const keySlots = [
      stats.keys.blueCard ? 0 : stats.keys.blueSkull ? 3 : -1,
      stats.keys.yellowCard ? 1 : stats.keys.yellowSkull ? 4 : -1,
      stats.keys.redCard ? 2 : stats.keys.redSkull ? 5 : -1,
    ];
    const keyX = 239;
    const keyY = [3, 13, 23];
    for (let i = 0; i < 3; i++) {
      const idx = keySlots[i];
      if (idx >= 0) this.drawHudPatch(this.keyPatches[idx], keyX, keyY[i]);
    }

    if (stats.message) {
      this.ctx.fillStyle = '#ffd54a';
      this.ctx.font = '8px monospace';
      this.ctx.fillText(stats.message, 110, 29);
    }
  }

  setVisible(visible: boolean): void {
    this.canvas.style.display = visible ? 'block' : 'none';
  }

  dispose(): void {
    document.body.removeChild(this.canvas);
  }
}
