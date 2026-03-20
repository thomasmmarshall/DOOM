# DOOM WAD File

This directory contains the DOOM game data file (WAD = "Where's All the Data").

## Current WAD

**DOOM.WAD** - DOOM Shareware v1.9 (4.0 MB)
- Contains Episode 1: Knee-Deep in the Dead (9 levels: E1M1 - E1M9)
- Includes all textures, sprites, sounds, and music for the shareware episode
- Legally free to distribute

## What is a WAD?

WAD files are archive files used by DOOM and DOOM II to store game data:
- **Maps**: Level geometry, things, BSP trees
- **Graphics**: Textures, sprites, patches, flats
- **Audio**: Sound effects and music
- **Other**: Text screens, palettes, colormaps

## Title splash / menu backdrop

`assets/doom-threejs-titlepic.png` — 320×200 branding (chunky DOOM-style **Doom** + purple **ThreeJS**). If this file is present, it replaces the IWAD `TITLEPIC` on the splash and main menu, and the vanilla `M_DOOM` patch is not drawn on top.

Regenerate from the repo with Pillow installed: `npm run generate:titlepic` (or `python3 scripts/generate-doom-threejs-titlepic.py`).

## Other WADs

You can use other WAD files:
- **DOOM.WAD** (registered) - Full DOOM with all 4 episodes (10+ MB)
- **DOOM2.WAD** - DOOM II: Hell on Earth (14+ MB)
- **PLUTONIA.WAD** / **TNT.WAD** - Final DOOM episodes
- **FreeDoom WADs** - Free software replacement

Just place your WAD file here and update the path in `src/main.ts` if the filename is different.

## Source

Shareware DOOM downloaded from: https://distro.ibiblio.org/slitaz/sources/packages/d/doom1.wad
