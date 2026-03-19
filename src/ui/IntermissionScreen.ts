/**
 * End-of-level intermission (stats + entering next level)
 * Uses DOOM1 WIMAP* / WIF / WIENTER patches when available.
 */

import type { WADReader } from '../wad';
import { PatchDecoder } from '../graphics';

export interface IntermissionStats {
  kills: number;
  maxKills: number;
  items: number;
  maxItems: number;
  secrets: number;
  maxSecrets: number;
  timeTics: number;
}

function doomMapBackgroundLump(mapName: string): string | null {
  const m = mapName.match(/^E(\d)M\d$/i);
  if (!m) return null;
  const ep = parseInt(m[1], 10) - 1;
  return `WIMAP${ep}`;
}

function formatPct(part: number, total: number): string {
  if (total <= 0) return '100%';
  return `${Math.floor((100 * part) / total)}%`;
}

function ticsToString(tics: number): string {
  const t = Math.max(0, Math.floor(tics));
  const s = Math.floor(t / 35);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}:${rs.toString().padStart(2, '0')}`;
}

export class IntermissionScreen {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wad: WADReader;
  private palette: Uint8ClampedArray;
  private finishedMap: string;
  private nextMap: string | null;
  private stats: IntermissionStats;
  private onContinue: () => void;
  private bg?: HTMLCanvasElement;

  constructor(
    wad: WADReader,
    palette: Uint8ClampedArray,
    opts: {
      finishedMap: string;
      nextMap: string | null;
      stats: IntermissionStats;
      onContinue: () => void;
    }
  ) {
    this.wad = wad;
    this.palette = palette;
    this.finishedMap = opts.finishedMap;
    this.nextMap = opts.nextMap;
    this.stats = opts.stats;
    this.onContinue = opts.onContinue;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 200;
    this.canvas.style.cssText =
      'position:absolute;top:0;left:50%;transform:translateX(-50%);image-rendering:pixelated;image-rendering:crisp-edges;z-index:2500;cursor:pointer;';
    this.ctx = this.canvas.getContext('2d')!;

    const lump = doomMapBackgroundLump(opts.finishedMap);
    if (lump) {
      const data = this.wad.readLump(lump);
      if (data) {
        try {
          const decoded = PatchDecoder.decodePatch(data, this.palette);
          this.bg = document.createElement('canvas');
          this.bg.width = decoded.width;
          this.bg.height = decoded.height;
          const b = this.bg.getContext('2d')!;
          const img = b.createImageData(decoded.width, decoded.height);
          img.data.set(decoded.pixels);
          b.putImageData(img, 0, 0);
        } catch {
          this.bg = undefined;
        }
      }
    }
  }

  private patchCanvas(name: string): HTMLCanvasElement | undefined {
    const data = this.wad.readLump(name);
    if (!data) return undefined;
    try {
      const decoded = PatchDecoder.decodePatch(data, this.palette);
      const c = document.createElement('canvas');
      c.width = decoded.width;
      c.height = decoded.height;
      const x = c.getContext('2d')!;
      const img = x.createImageData(decoded.width, decoded.height);
      img.data.set(decoded.pixels);
      x.putImageData(img, 0, 0);
      return c;
    } catch {
      return undefined;
    }
  }

  private draw(): void {
    const { ctx } = this;
    ctx.imageSmoothingEnabled = false;

    if (this.bg) {
      ctx.drawImage(this.bg, 0, 0, 320, 200);
    } else {
      ctx.fillStyle = '#380808';
      ctx.fillRect(0, 0, 320, 200);
    }

    const wif = this.patchCanvas('WIF');
    if (wif) ctx.drawImage(wif, Math.floor(160 - wif.width / 2), 4);

    ctx.fillStyle = '#c8b090';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.finishedMap.toUpperCase(), 160, 40);

    const y0 = 58;
    ctx.textAlign = 'left';
    ctx.font = '10px monospace';
    const killP = formatPct(this.stats.kills, this.stats.maxKills);
    const itemP = formatPct(this.stats.items, this.stats.maxItems);
    const secP = formatPct(this.stats.secrets, this.stats.maxSecrets);
    ctx.fillText(`KILLS: ${this.stats.kills} / ${this.stats.maxKills} (${killP})`, 24, y0);
    ctx.fillText(`ITEMS: ${this.stats.items} / ${this.stats.maxItems} (${itemP})`, 24, y0 + 14);
    ctx.fillText(`SECRET: ${this.stats.secrets} / ${this.stats.maxSecrets} (${secP})`, 24, y0 + 28);
    ctx.fillText(`TIME: ${ticsToString(this.stats.timeTics)}`, 24, y0 + 42);

    if (this.nextMap) {
      const wienter = this.patchCanvas('WIENTER');
      let y = 138;
      if (wienter) {
        ctx.drawImage(wienter, 24, y);
        y += wienter.height + 6;
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e8d8b8';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(this.nextMap.toUpperCase(), 160, wienter ? y + 4 : y);
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e8d8b8';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('END OF EPISODE', 160, 150);
    }

    ctx.fillStyle = '#887058';
    ctx.font = '9px monospace';
    ctx.fillText('Press ENTER or click to continue', 160, 192);
  }

  private updateScale(): void {
    const targetAspect = 4 / 3;
    const windowAspect = window.innerWidth / window.innerHeight;
    let displayWidth: number;
    let displayHeight: number;
    if (windowAspect > targetAspect) {
      displayHeight = window.innerHeight;
      displayWidth = displayHeight * targetAspect;
    } else {
      displayWidth = window.innerWidth;
      displayHeight = displayWidth / targetAspect;
    }
    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;
  }

  show(): void {
    this.draw();
    document.body.appendChild(this.canvas);
    this.updateScale();
    window.addEventListener('resize', this.updateScale);

    const done = (): void => {
      window.removeEventListener('resize', this.updateScale);
      window.removeEventListener('keydown', onKey);
      this.canvas.removeEventListener('click', done);
      if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
      this.onContinue();
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        done();
      }
    };

    window.addEventListener('keydown', onKey);
    this.canvas.addEventListener('click', done);
  }
}
