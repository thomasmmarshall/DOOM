#!/usr/bin/env python3
"""Generate public/assets/doom-threejs-titlepic.png (320x200, chunky DOOM-style title)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "doom-threejs-titlepic.png"
SCALE = 3
W, H = 320 * SCALE, 200 * SCALE


def find_heavy_font() -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Black.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ]
    for p in candidates:
        try:
            return ImageFont.truetype(p, 56 * SCALE)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_outline(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font, fill, outline: str, width: int) -> None:
    x, y = xy
    for dx in range(-width, width + 1):
        for dy in range(-width, width + 1):
            if dx == 0 and dy == 0:
                continue
            draw.text((x + dx, y + dy), text, font=font, fill=outline)
    draw.text((x, y), text, font=font, fill=fill)


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        # DOOM-ish: dark lower hellscape, fiery rim upper
        r = int(28 + t * 110)
        g = int(4 + t * 40)
        b = int(12 + t * 28)
        for x in range(W):
            px[x, y] = (r, g, b)

    draw = ImageDraw.Draw(img)
    # Simple horizon silhouette
    for y in range(int(H * 0.55), H):
        fog = int(18 + (y / H) * 40)
        draw.line([(0, y), (W, y)], fill=(fog // 3, 0, fog // 5))

    font = find_heavy_font()
    line1 = "Doom"
    line2 = "ThreeJS"

    # Measure wrapped block
    bbox1 = draw.textbbox((0, 0), line1, font=font)
    bbox2 = draw.textbbox((0, 0), line2, font=font)
    lw1 = bbox1[2] - bbox1[0]
    lh1 = bbox1[3] - bbox1[1]
    lw2 = bbox2[2] - bbox2[0]

    cx = W // 2
    y0 = int(H * 0.12)
    # Doom red: metallic-ish base
    doom_red = (0xD4, 0x20, 0x20)
    doom_hi = (0xFF, 0x88, 0x88)
    purple = (0xA0, 0x50, 0xFF)
    purple_hi = (0xD0, 0xB0, 0xFF)

    x1 = cx - lw1 // 2
    draw_outline(draw, (x1, y0), line1, font, doom_red, "#080000", 4 * SCALE // 3)
    draw.text((x1, y0 - 2 * SCALE), line1, font=font, fill=doom_hi)

    y2 = y0 + lh1 + 8 * SCALE
    x2 = cx - lw2 // 2
    draw_outline(draw, (x2, y2), line2, font, purple, "#120018", 4 * SCALE // 3)
    draw.text((x2, y2 - 2 * SCALE), line2, font=font, fill=purple_hi)

    out = img.resize((320, 200), Image.Resampling.NEAREST)
    out.save(OUT, "PNG")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
