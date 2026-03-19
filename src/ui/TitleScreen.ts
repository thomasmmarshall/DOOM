/**
 * Title Screen
 * Shows TITLEPIC splash on first load, matching original DOOM flow
 * Based on linuxdoom-1.10/d_main.c D_PageDrawer, GS_DEMOSCREEN
 * pagetic=170 tics, key/mouse -> main menu, timeout -> menu (demo skipped for scope)
 */

import type { WADReader } from '../wad';
import { PatchDecoder } from '../graphics';

const PAGETIC = 170; // Original DOOM: 170 tics at 35 Hz
const TICRATE = 35;

export class TitleScreen {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wad: WADReader;
  private palette: Uint8ClampedArray;
  private titlePatch?: HTMLCanvasElement;
  private onShowMenu: () => void;
  private onShow?: () => void;
  private pagetic: number = PAGETIC;
  private lastTickTime: number = 0;
  private dismissed: boolean = false;

  constructor(
    wad: WADReader,
    palette: Uint8ClampedArray,
    onShowMenu: () => void,
    onShow?: () => void
  ) {
    this.wad = wad;
    this.palette = palette;
    this.onShowMenu = onShowMenu;
    this.onShow = onShow;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 200;
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '50%';
    this.canvas.style.transform = 'translateX(-50%)';
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.imageRendering = 'crisp-edges';
    this.canvas.style.pointerEvents = 'auto';
    this.canvas.style.cursor = 'pointer';
    this.canvas.style.zIndex = '2000';

    this.ctx = this.canvas.getContext('2d')!;

    const handleInput = () => {
      if (this.dismissed) return;
      this.dismissed = true;
      this.canvas.removeEventListener('click', handleInput);
      window.removeEventListener('keydown', handleKey);
      this.onShowMenu();
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyR' || e.code === 'Escape') return;
      handleInput();
    };

    this.canvas.addEventListener('click', handleInput);
    window.addEventListener('keydown', handleKey);
  }

  async init(): Promise<void> {
    let data = this.wad.readLump('TITLEPIC');
    if (!data) {
      data = this.wad.readLump('TITLE');
    }
    if (!data) {
      console.warn('TITLEPIC or TITLE not found');
      return;
    }

    const decoded = PatchDecoder.decodePatch(data, this.palette);
    this.titlePatch = document.createElement('canvas');
    this.titlePatch.width = decoded.width;
    this.titlePatch.height = decoded.height;
    const ctx = this.titlePatch.getContext('2d')!;
    const imageData = ctx.createImageData(decoded.width, decoded.height);
    imageData.data.set(decoded.pixels);
    ctx.putImageData(imageData, 0, 0);
  }

  show(): void {
    document.body.appendChild(this.canvas);
    this.updateCanvasScale();
    window.addEventListener('resize', () => this.updateCanvasScale());
    this.pagetic = PAGETIC;
    this.lastTickTime = performance.now();
    this.dismissed = false;
    this.onShow?.();
  }

  private updateCanvasScale(): void {
    const windowAspect = window.innerWidth / window.innerHeight;
    const targetAspect = 4 / 3;
    let gameWidth: number;
    if (windowAspect > targetAspect) {
      gameWidth = window.innerHeight * targetAspect;
    } else {
      gameWidth = window.innerWidth;
    }
    const scale = gameWidth / 320;
    this.canvas.style.width = `${320 * scale}px`;
    this.canvas.style.height = `${200 * scale}px`;
  }

  render(): void {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, 320, 200);

    if (this.titlePatch) {
      const x = (320 - this.titlePatch.width) / 2;
      const y = (200 - this.titlePatch.height) / 2;
      this.ctx.drawImage(this.titlePatch, x, y);
    }

    // Auto-advance: 170 tics at 35 Hz (original D_PageTicker)
    const now = performance.now();
    const elapsed = (now - this.lastTickTime) / 1000;
    const ticsElapsed = Math.floor(elapsed * TICRATE);
    if (ticsElapsed > 0) {
      this.pagetic -= ticsElapsed;
      this.lastTickTime = now;
      if (this.pagetic <= 0 && !this.dismissed) {
        this.dismissed = true;
        this.onShowMenu();
        return;
      }
    }
  }

  hide(): void {
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }

  startRenderLoop(): void {
    const loop = () => {
      this.render();
      if (document.body.contains(this.canvas)) {
        requestAnimationFrame(loop);
      }
    };
    requestAnimationFrame(loop);
  }
}
