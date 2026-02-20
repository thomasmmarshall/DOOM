# DOOM three.js

A modern reimplementation of DOOM (1993) using three.js and TypeScript. This project preserves DOOM's exact gameplay mechanics, deterministic behavior, and game logic while replacing the software renderer with a WebGL-based 3D engine.

## Project Status

**Current Phase**: Phase 2 - Core Game Loop & Math ✅

### Completed
- ✅ **Phase 0**: Foundation & Data Pipeline
  - TypeScript + Vite + three.js project setup
  - Module structure (core, wad, level, graphics, renderer, etc.)
  - WAD file parser (header, directory, lump lookup)
  - Map data parsers (VERTEXES, LINEDEFS, SIDEDEFS, SECTORS, THINGS, BSP data, BLOCKMAP)
  - Palette & colormap loaders (PLAYPAL, COLORMAP)
  - Patch decoder (column-based format with transparency)
  - Flat loader (64x64 floor/ceiling textures)
  - Vitest testing framework

- ✅ **Phase 1**: Static Geometry Rendering
  - Coordinate system conversion (DOOM → three.js)
  - Wall geometry builder (one-sided and two-sided walls)
  - Sector geometry builder (floors and ceilings with triangulation)
  - Texture manager (wall textures and flats)
  - Material system with light level support
  - Sky rendering
  - Level renderer
  - E1M1 fully rendered with orbit controls

- ✅ **Phase 2**: Core Game Loop & Math
  - Fixed-point arithmetic (16.16 format) with FixedMul/FixedDiv
  - Trigonometry tables (finesine, finecosine, finetangent)
  - Binary Angle Measurement (BAM) system
  - 35 Hz game ticker with deterministic timing
  - Input manager (keyboard, mouse)
  - TicCmd structure for input buffering

- ✅ **Phase 3**: Player Movement & Physics (Basic)
  - Map object (mobj) structure with physics properties
  - Player movement with thrust-based physics
  - Friction and momentum application (FRICTION = 0xe800)
  - Gravity implementation
  - View height calculation with bobbing
  - First-person camera integration
  - Movement controls (WASD + mouse)
  - Note: Collision detection deferred to Phase 3.5

### Current Issues 🔴

**Known Problems**:
1. Map rendering quality is poor (textures misaligned, too dark)
2. Player spawns at wrong height (not using sector floor height)

See `CURRENT_ISSUES.md` for detailed fixes needed.

### Next Steps
- **Phase 3.5**: Fix rendering quality and player spawn position
- Phase 4: BSP Rendering & Visibility Optimization
- Phase 5: Sprite rendering (enemies, items, decorations)

## Quick Start

**Already have the DOOM WAD included!** Just run:

```bash
npm install
npm run dev
```

Then open your browser to http://localhost:5173

See [QUICKSTART.md](QUICKSTART.md) for detailed controls and usage.

## Controls

- **F** - Toggle first-person mode
- **P** - Start physics (enable movement)
- **WASD** - Move (when physics active)
- **Mouse** - Look around
- **ESC** - Release mouse lock

## Development

### Prerequisites
- Node.js 18+
- Modern web browser

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test
```

The shareware DOOM WAD is included in `public/DOOM.WAD`. You can replace it with:
- Full DOOM.WAD (registered version)
- DOOM2.WAD (DOOM II)
- Any compatible DOOM WAD file

### Project Structure

```
src/
├── core/          # Fixed-point math, angles, game ticker
├── wad/           # WAD file parser and lump management
├── level/         # Map data structures, BSP tree, blockmap
├── graphics/      # Texture/sprite/patch decoders, palette
├── renderer/      # three.js geometry builder, materials, lighting
├── game/          # Thinker system, map objects, player state
├── physics/       # Movement, collision detection, line-of-sight
├── ai/            # Enemy AI, pathfinding, combat
├── weapons/       # Weapon systems, hitscan, projectiles
├── sectors/       # Floors, ceilings, doors, platforms, lighting
├── audio/         # Web Audio wrapper, DMX/MUS decoders
├── ui/            # HUD, menus, automap, intermission
└── input/         # Keyboard, mouse, gamepad handling
```

## Implementation Plan

This project follows a 30-week phased implementation:

1. **Phase 0** (Weeks 1-3): Foundation & Data Pipeline ✅
2. **Phase 1** (Weeks 4-6): Static Geometry Rendering
3. **Phase 2** (Weeks 7-9): Core Game Loop & Math
4. **Phase 3** (Weeks 10-12): Player Movement & Physics
5. **Phase 4** (Weeks 13-14): BSP Rendering & Visibility
6. **Phase 5** (Weeks 15-16): Sprites & Billboards
7. **Phase 6** (Weeks 17-20): AI & Combat
8. **Phase 7** (Weeks 21-23): Sectors & Special Effects
9. **Phase 8** (Weeks 24-25): Audio System
10. **Phase 9** (Weeks 26-27): UI & HUD
11. **Phase 10** (Weeks 28-30): Polish & Optimization

## Technical Details

### Core Principles
- **Preserve game logic**: Exact DOOM physics and mechanics
- **Deterministic behavior**: Fixed-point math, 35 Hz tick rate
- **Modern rendering**: three.js WebGL renderer with BSP culling

### Coordinate System
- DOOM: (x, y, z) where y is north, z is up
- three.js: (x, y, z) where y is up, z is forward
- **Mapping**: DOOM (x, y, z) → three.js (x, z, -y)

### File Formats
- **WAD**: Archive format containing all game data
- **Patches**: Column-based images with transparency
- **Flats**: 64x64 uncompressed textures
- **Maps**: Vertices, lines, sectors, things, BSP tree

## Testing

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests in watch mode
npm test -- --watch
```

## License

This project is based on the DOOM source code released by id Software under the DOOM Source Code License. The original DOOM is Copyright (C) 1993-1996 id Software, Inc.

This three.js port is for educational purposes.

## References

- [DOOM Source Code](https://github.com/id-Software/DOOM) - Original C source code
- [three.js Documentation](https://threejs.org/docs/) - 3D rendering library
- [DOOM Wiki](https://doomwiki.org/) - Comprehensive DOOM documentation
