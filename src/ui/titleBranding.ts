/**
 * Optional 320×200 title/splash + menu backdrop. Replaces IWAD TITLEPIC when present.
 */
import type { WADReader } from '../wad';
import { PatchDecoder } from '../graphics';

export const CUSTOM_TITLEPIC_URL = '/assets/doom-threejs-titlepic.png';

export async function loadTitlePicFromCustomOrWad(
  wad: WADReader,
  palette: Uint8ClampedArray
): Promise<{ canvas: HTMLCanvasElement | undefined; isCustom: boolean }> {
  try {
    const res = await fetch(CUSTOM_TITLEPIC_URL);
    if (res.ok) {
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      return { canvas: c, isCustom: true };
    }
  } catch {
    // Fall back to WAD
  }

  let data = wad.readLump('TITLEPIC');
  if (!data) data = wad.readLump('TITLE');
  if (!data) return { canvas: undefined, isCustom: false };

  const decoded = PatchDecoder.decodePatch(data, palette);
  const c = document.createElement('canvas');
  c.width = decoded.width;
  c.height = decoded.height;
  const ctx = c.getContext('2d')!;
  const imageData = ctx.createImageData(decoded.width, decoded.height);
  imageData.data.set(decoded.pixels);
  ctx.putImageData(imageData, 0, 0);
  return { canvas: c, isCustom: false };
}
