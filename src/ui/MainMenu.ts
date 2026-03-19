/**
 * Main Menu
 * Matches original DOOM menu flow: New Game -> Episode -> Skill -> Load E1M1
 * Based on linuxdoom-1.10/m_menu.c
 */

import type { WADReader } from '../wad';
import { PatchDecoder } from '../graphics';

const LINEHEIGHT = 16;
const SKULLXOFF = -32;

export type MenuScreen = 'main' | 'episode' | 'skill';

export interface MainMenuCallbacks {
  onStartGame: (episode: number, skill: number) => void;
  onMenuSound?: () => void;
}

export class MainMenu {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wad: WADReader;
  private palette: Uint8ClampedArray;
  private callbacks: MainMenuCallbacks;
  private screen: MenuScreen = 'main';
  private itemOn: number = 0;
  private skullFrame: number = 0;
  private skullCounter: number = 0;
  private titlePatch?: HTMLCanvasElement;
  private patches: Map<string, HTMLCanvasElement> = new Map();
  private selectedEpisode: number = 0;

  constructor(
    wad: WADReader,
    palette: Uint8ClampedArray,
    callbacks: MainMenuCallbacks
  ) {
    this.wad = wad;
    this.palette = palette;
    this.callbacks = callbacks;

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

    window.addEventListener('keydown', this.handleKey);
    this.canvas.addEventListener('click', this.handleClick);
  }

  async init(): Promise<void> {
    // TITLEPIC background
    let data = this.wad.readLump('TITLEPIC');
    if (!data) data = this.wad.readLump('TITLE');
    if (data) {
      const decoded = PatchDecoder.decodePatch(data, this.palette);
      this.titlePatch = this.createPatchCanvas(decoded);
    }

    // Load menu patches
    const mainItems = ['M_DOOM', 'M_NGAME', 'M_OPTION', 'M_LOADG', 'M_SAVEG', 'M_RDTHIS', 'M_QUITG'];
    const episodeItems = ['M_EPISOD', 'M_EPI1', 'M_EPI2', 'M_EPI3'];
    const skillItems = ['M_NEWG', 'M_SKILL', 'M_JKILL', 'M_ROUGH', 'M_HURT', 'M_ULTRA', 'M_NMARE'];
    const skullItems = ['M_SKULL1', 'M_SKULL2'];

    for (const name of [...mainItems, ...episodeItems, ...skillItems, ...skullItems]) {
      const lumpData = this.wad.readLump(name);
      if (lumpData) {
        try {
          const decoded = PatchDecoder.decodePatch(lumpData, this.palette);
          this.patches.set(name, this.createPatchCanvas(decoded));
        } catch {
          // Skip missing patches
        }
      }
    }
  }

  private createPatchCanvas(decoded: { width: number; height: number; pixels: Uint8ClampedArray }): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = decoded.width;
    c.height = decoded.height;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(decoded.width, decoded.height);
    img.data.set(decoded.pixels);
    ctx.putImageData(img, 0, 0);
    return c;
  }

  show(): void {
    document.body.appendChild(this.canvas);
    this.updateCanvasScale();
    window.addEventListener('resize', () => this.updateCanvasScale());
    this.screen = 'main';
    this.itemOn = 0;
    this.skullFrame = 0;
    this.skullCounter = 8;
  }

  hide(): void {
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    window.removeEventListener('keydown', this.handleKey);
    this.canvas.removeEventListener('click', this.handleClick);
  }

  private updateCanvasScale(): void {
    const windowAspect = window.innerWidth / window.innerHeight;
    const targetAspect = 4 / 3;
    const gameWidth = windowAspect > targetAspect ? window.innerHeight * targetAspect : window.innerWidth;
    const scale = gameWidth / 320;
    this.canvas.style.width = `${320 * scale}px`;
    this.canvas.style.height = `${200 * scale}px`;
  }

  private handleKey = (e: KeyboardEvent): void => {
    if (this.screen === 'main') {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        this.itemOn = Math.min(5, this.itemOn + 1);
        this.callbacks.onMenuSound?.();
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        this.itemOn = Math.max(0, this.itemOn - 1);
        this.callbacks.onMenuSound?.();
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.activateMainItem(this.itemOn);
      }
    } else if (this.screen === 'episode') {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        this.itemOn = Math.min(2, this.itemOn + 1);
        this.callbacks.onMenuSound?.();
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        this.itemOn = Math.max(0, this.itemOn - 1);
        this.callbacks.onMenuSound?.();
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.selectedEpisode = this.itemOn;
        this.screen = 'skill';
        this.itemOn = 2; // Hurt Me Plenty default
        this.callbacks.onMenuSound?.();
      } else if (e.code === 'Escape') {
        this.screen = 'main';
        this.itemOn = 0;
      }
    } else if (this.screen === 'skill') {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        this.itemOn = Math.min(4, this.itemOn + 1);
        this.callbacks.onMenuSound?.();
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        this.itemOn = Math.max(0, this.itemOn - 1);
        this.callbacks.onMenuSound?.();
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.callbacks.onStartGame(this.selectedEpisode + 1, this.itemOn + 1);
      } else if (e.code === 'Escape') {
        this.screen = 'episode';
        this.itemOn = 0;
      }
    }
  };

  private handleClick = (e: MouseEvent): void => {
    // Approximate click to item based on y position
    const rect = this.canvas.getBoundingClientRect();
    const scaleY = rect.height / 200;
    const clickY = e.clientY - rect.top;

    if (this.screen === 'main') {
      const baseY = 64 * scaleY;
      const item = Math.floor((clickY - baseY) / (LINEHEIGHT * scaleY));
      if (item >= 0 && item <= 5) {
        this.itemOn = item;
        this.activateMainItem(item);
      }
    } else if (this.screen === 'episode') {
      const baseY = 63 * scaleY;
      const item = Math.floor((clickY - baseY) / (LINEHEIGHT * scaleY));
      if (item >= 0 && item <= 2) {
        this.itemOn = item;
        this.selectedEpisode = item;
        this.screen = 'skill';
        this.itemOn = 2;
        this.callbacks.onMenuSound?.();
      }
    } else if (this.screen === 'skill') {
      const baseY = 63 * scaleY;
      const item = Math.floor((clickY - baseY) / (LINEHEIGHT * scaleY));
      if (item >= 0 && item <= 4) {
        this.itemOn = item;
        this.callbacks.onStartGame(this.selectedEpisode + 1, item + 1);
      }
    }
  };

  private activateMainItem(index: number): void {
    switch (index) {
      case 0: // New Game
        this.screen = 'episode';
        this.itemOn = 0;
        this.callbacks.onMenuSound?.();
        break;
      case 1: // Options - stub
        this.callbacks.onMenuSound?.();
        break;
      case 2: // Load Game - stub
      case 3: // Save Game - stub
        this.callbacks.onMenuSound?.();
        break;
      case 4: // Read This - stub
        this.callbacks.onMenuSound?.();
        break;
      case 5: // Quit
        window.close();
        break;
    }
  }

  render(): void {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, 320, 200);

    // TITLEPIC background
    if (this.titlePatch) {
      const x = (320 - this.titlePatch.width) / 2;
      const y = (200 - this.titlePatch.height) / 2;
      this.ctx.drawImage(this.titlePatch, x, y);
    }

    // Skull animation
    this.skullCounter--;
    if (this.skullCounter <= 0) {
      this.skullFrame ^= 1;
      this.skullCounter = 8;
    }

    const skullName = this.skullFrame === 0 ? 'M_SKULL1' : 'M_SKULL2';
    const skullPatch = this.patches.get(skullName);

    if (this.screen === 'main') {
      const doomPatch = this.patches.get('M_DOOM');
      if (doomPatch) this.ctx.drawImage(doomPatch, 94, 2);

      const items = ['M_NGAME', 'M_OPTION', 'M_LOADG', 'M_SAVEG', 'M_RDTHIS', 'M_QUITG'];
      let y = 64;
      for (let i = 0; i < items.length; i++) {
        const patch = this.patches.get(items[i]);
        if (patch) this.ctx.drawImage(patch, 97, y);
        y += LINEHEIGHT;
      }
      if (skullPatch) this.ctx.drawImage(skullPatch, 97 + SKULLXOFF, 64 - 5 + this.itemOn * LINEHEIGHT);
    } else if (this.screen === 'episode') {
      const epPatch = this.patches.get('M_EPISOD');
      if (epPatch) this.ctx.drawImage(epPatch, 54, 38);

      const items = ['M_EPI1', 'M_EPI2', 'M_EPI3'];
      let y = 63;
      for (let i = 0; i < items.length; i++) {
        const patch = this.patches.get(items[i]);
        if (patch) this.ctx.drawImage(patch, 48, y);
        y += LINEHEIGHT;
      }
      if (skullPatch) this.ctx.drawImage(skullPatch, 48 + SKULLXOFF, 63 - 5 + this.itemOn * LINEHEIGHT);
    } else if (this.screen === 'skill') {
      const newgPatch = this.patches.get('M_NEWG');
      const skillPatch = this.patches.get('M_SKILL');
      if (newgPatch) this.ctx.drawImage(newgPatch, 96, 14);
      if (skillPatch) this.ctx.drawImage(skillPatch, 54, 38);

      const items = ['M_JKILL', 'M_ROUGH', 'M_HURT', 'M_ULTRA', 'M_NMARE'];
      let y = 63;
      for (let i = 0; i < items.length; i++) {
        const patch = this.patches.get(items[i]);
        if (patch) this.ctx.drawImage(patch, 48, y);
        y += LINEHEIGHT;
      }
      if (skullPatch) this.ctx.drawImage(skullPatch, 48 + SKULLXOFF, 63 - 5 + this.itemOn * LINEHEIGHT);
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
