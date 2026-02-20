# Session Handoff - DOOM three.js Project

## Current State (as of latest commit)

### What's Working ✅
- WAD file parsing (DOOM shareware included in `public/DOOM.WAD`)
- Map data parsing (E1M1 loads successfully)
- Static level geometry rendering (walls, floors, ceilings, sky)
- Texture system (patches and flats decode and render)
- 35 Hz game ticker (deterministic physics)
- Fixed-point math library
- Player movement with WASD controls
- Mouse look (smooth rotation)
- Wall collision detection with sliding
- First-person camera

### Critical Issues 🔴

1. **Map looks bad** - Rendering quality is poor
   - Textures may be misaligned or wrong size
   - UV mapping likely incorrect
   - Lighting too dark or inconsistent
   - Possible geometry issues

2. **Player spawns in wrong location** - Currently spawns on top of/above map
   - Not using sector floor height (hardcoded to 56)
   - Need to find which sector contains player start
   - Should spawn at sector floor height, not arbitrary height

### How to Run

```bash
cd /Users/thomasmarshall/Repos/DOOM
npm install
npm run dev
```

**Controls**:
- Press **F** to enter first-person mode
- Press **P** to start physics/movement
- **WASD** to move
- **Mouse** to look around
- **ESC** to release mouse lock

### Repository Structure

```
/Users/thomasmarshall/Repos/DOOM/
├── src/
│   ├── core/          # Fixed-point math, angles, ticker
│   ├── wad/           # WAD parser
│   ├── level/         # Map data structures & parsers
│   ├── graphics/      # Texture/sprite decoders
│   ├── renderer/      # three.js geometry builders
│   ├── physics/       # Movement, collision
│   ├── game/          # Mobj structures
│   └── input/         # Keyboard/mouse handling
├── public/
│   └── DOOM.WAD      # Shareware DOOM data file (4MB)
└── linuxdoom-1.10/   # Original C source for reference
```

### Key Files to Check

**For spawn issue**:
- `src/renderer/LevelRenderer.ts` - getPlayerStart() method (line ~115)
- `src/main.ts` - Player creation (line ~100)

**For rendering issues**:
- `src/renderer/WallBuilder.ts` - Wall geometry and UV mapping
- `src/renderer/SectorBuilder.ts` - Floor/ceiling geometry
- `src/renderer/TextureManager.ts` - Material creation and lighting

### Detailed Issues & Solutions

See `CURRENT_ISSUES.md` for comprehensive breakdown of:
- What's wrong
- Why it's wrong
- How to fix it
- Files to modify
- Testing checklist

### Master Plan

Complete implementation plan at:
`/Users/thomasmarshall/.claude/plans/ticklish-wobbling-crane.md`

Current phase: **Phase 3.5** - Fix rendering and spawn issues

Next phases:
- Phase 4: BSP visibility culling
- Phase 5: Sprite rendering (enemies, items)
- Phase 6: AI and combat
- Phase 7: Doors and sector effects
- Phase 8: Audio

### Recent Commits

```
0f61a7f - Add missing doomAngleToThreeRadians function
b2f2d70 - Fix camera rotation - looking around now works properly
35eefd7 - Fix controls and add collision detection
badc5b5 - Add quick start guide and update README
0141c11 - Add shareware DOOM WAD file (Episode 1)
db5334f - Phase 3: Player Movement & Physics (Basic)
8d009bb - Phase 2: Core Game Loop & Math
219cc12 - Phase 1: Static Geometry Rendering
3988846 - Phase 0: Foundation & Data Pipeline
```

### Quick Wins for Next Session

1. **Fix player spawn** (30 min):
   - Find sector at player start position
   - Use sector floor height for spawn Z
   - Easy fix in LevelRenderer.ts

2. **Improve texture rendering** (1-2 hours):
   - Get actual texture dimensions from decoded patches
   - Normalize UV coordinates properly
   - Test with a few textures first

3. **Brighten lighting** (15 min):
   - Adjust light level conversion in TextureManager
   - Try /255 instead of /200
   - Add gamma correction if needed

### Debug Tips

- Check browser console (F12) for errors
- Player position logged every second when physics active
- WAD parsing logs show lump counts
- All map data logged on parse

### Testing E1M1

**Expected player start**:
- Should be in the starting room (hangar entrance)
- On the floor, not floating
- Facing into the hangar
- Surrounded by textured walls

If you see a mess of geometry or spawn in void:
→ Check `CURRENT_ISSUES.md` for detailed fixes

### Contact/Context

This is a DOOM (1993) to three.js port following the original implementation plan. All game logic ports from `linuxdoom-1.10/` C source code. Goal is pixel-perfect DOOM recreation using modern WebGL.

Good luck! 🎮
