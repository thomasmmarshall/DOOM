/**
 * Status Bar (HUD) Renderer
 * Displays health, armor, ammo, and other player stats
 * Based on linuxdoom-1.10/st_stuff.c
 */

import type { WADReader } from '../wad';
import { PatchDecoder } from '../graphics';

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
  face: number; // Face state (0-42, different expressions)
}

export class StatusBar {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wad: WADReader;
  private palette: Uint8ClampedArray;
  private numberPatches: HTMLCanvasElement[] = [];
  private initialized: boolean = false;

  constructor(wad: WADReader, palette: Uint8ClampedArray) {
    this.wad = wad;
    this.palette = palette;

    // Create overlay canvas for HUD
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 32; // Status bar height
    this.canvas.style.position = 'absolute';
    this.canvas.style.bottom = '0';
    this.canvas.style.left = '50%';
    this.canvas.style.transform = 'translateX(-50%)';
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.imageRendering = 'crisp-edges';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '1000';

    // Scale canvas to window size while maintaining pixel art
    this.updateCanvasScale();
    window.addEventListener('resize', () => this.updateCanvasScale());

    this.ctx = this.canvas.getContext('2d')!;

    // Add to document
    document.body.appendChild(this.canvas);
  }

  /**
   * Update canvas scale to match window size
   */
  private updateCanvasScale(): void {
    // Calculate scale based on 4:3 aspect ratio window
    const windowAspect = window.innerWidth / window.innerHeight;
    const targetAspect = 4 / 3;

    let gameWidth: number;
    if (windowAspect > targetAspect) {
      // Pillarboxed
      gameWidth = window.innerHeight * targetAspect;
    } else {
      // Letterboxed
      gameWidth = window.innerWidth;
    }

    const scale = gameWidth / 320;
    this.canvas.style.width = `${320 * scale}px`;
    this.canvas.style.height = `${32 * scale}px`;
  }

  /**
   * Initialize HUD graphics
   */
  async init(): Promise<void> {
    if (this.initialized) return;

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

    // Draw DOOM-style background (simple for now)
    this.ctx.fillStyle = '#666';
    this.ctx.fillRect(0, 0, 320, 32);

    // Health (left side)
    this.ctx.fillStyle = '#ff0000'; // Red for health label
    this.ctx.font = 'bold 10px monospace';
    this.ctx.fillText('HEALTH', 10, 12);
    this.drawNumber(Math.max(0, stats.health), 10, 16, 3);

    // Armor (left-center)
    this.ctx.fillStyle = '#00ff00'; // Green for armor label
    this.ctx.fillText('ARMOR', 70, 12);
    this.drawNumber(Math.max(0, stats.armor), 70, 16, 3);

    // Ammo (right side)
    this.ctx.fillStyle = '#ffff00'; // Yellow for ammo label
    this.ctx.fillText('AMMO', 230, 12);
    this.drawNumber(Math.max(0, stats.ammo), 230, 16, 3);

    // Face (center) - placeholder for now
    this.ctx.fillStyle = '#888';
    this.ctx.fillRect(145, 4, 30, 24);
    this.ctx.fillStyle = '#000';
    this.ctx.font = '16px monospace';
    this.ctx.fillText(':)', 150, 20);

    // Weapon indicator (bottom left)
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '8px monospace';
    this.ctx.fillText(`WPN: ${stats.currentWeapon + 1}`, 10, 30);

    // Keys indicator (bottom right) - simple colored squares for now
    let keyX = 260;
    if (stats.keys.blueCard || stats.keys.blueSkull) {
      this.ctx.fillStyle = '#0000ff';
      this.ctx.fillRect(keyX, 22, 6, 6);
      keyX += 8;
    }
    if (stats.keys.yellowCard || stats.keys.yellowSkull) {
      this.ctx.fillStyle = '#ffff00';
      this.ctx.fillRect(keyX, 22, 6, 6);
      keyX += 8;
    }
    if (stats.keys.redCard || stats.keys.redSkull) {
      this.ctx.fillStyle = '#ff0000';
      this.ctx.fillRect(keyX, 22, 6, 6);
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
