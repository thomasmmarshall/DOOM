# DOOM Three.js Port - Session Handoff

**Last Updated**: 2026-02-20
**Current Status**: Phase 7 Complete + Visual Fixes Applied
**Branch**: master
**Last Commit**: 6e3b448

---

## Quick Summary

This is a DOOM (1993) to three.js port project. We're migrating the original DOOM engine to run in the browser using TypeScript and three.js for 3D rendering.

**What works now**:
- ✅ Complete WAD file reading and parsing
- ✅ Level rendering (walls, floors, ceilings with proper textures)
- ✅ BSP visibility culling
- ✅ Sprite rendering (items, decorations)
- ✅ First-person movement with collision detection
- ✅ Stair climbing and floor height tracking
- ✅ Door system (opens, waits, closes)
- ✅ Platform system (moving floors)
- ✅ Trigger activation (USE key and walk-over triggers)
- ✅ Proper aspect ratio (4:3 with pillarbox/letterbox)
- ✅ Fixed ceiling/floor holes (subsector-based geometry)

**What's missing**: See `REMAINING_FEATURES_PLAN.md` for comprehensive plan

---

## How to Run

```bash
npm install
npm run dev
```

Open browser to http://localhost:5174/ (or whatever port Vite assigns)

**Controls**:
- **P** - Start physics/game loop
- **F** - Toggle first-person mode
- **WASD** - Move
- **Mouse** - Look around (in first-person mode)
- **SPACEBAR** - Use/activate (doors, switches)

---

## Recent Changes (This Session)

### 1. Phase 7 Implementation (Commit 389082c)
Added interactive sector systems:
- **DoorSystem** (`src/sectors/DoorSystem.ts`): Complete door state machine with CLOSED/OPENING/OPEN/WAITING/CLOSING states
- **PlatformSystem** (`src/sectors/PlatformSystem.ts`): Platform movement with UP/DOWN/WAITING states
- **TriggerSystem** (`src/game/TriggerSystem.ts`): Line activation for USE (spacebar) and WALK (crossing) triggers
- Dynamic geometry updates: Sectors update their geometry when doors/platforms move
- Integration: All systems integrated into main game loop

### 2. Visual Fixes (Commit 6e3b448)
**Fixed ceiling/floor holes**:
- Problem: Fan triangulation on concave polygons created holes
- Solution: Rewrote SectorBuilder to use BSP subsectors (pre-computed convex polygons)
- Result: Perfect geometry with no missing faces

**Fixed aspect ratio**:
- Set camera to 4:3 aspect ratio (original DOOM)
- FOV set to 73.74 degrees (DOOM's horizontal FOV)
- Pillarbox/letterbox maintains aspect on any window size
- Pixel ratio = 1 for authentic pixelated look

---

## Current Issues / Known Bugs

### High Priority
1. **Dynamic sector geometry updates may not work perfectly**
   - Location: `src/renderer/LevelRenderer.ts:325-390`
   - Issue: `updateSectorCeiling()` and `updateSectorFloor()` update vertex positions, but this needs testing
   - Test: Activate a door and verify smooth ceiling movement
   - May need to rebuild geometry instead of updating vertices

2. **Collision with moving sectors incomplete**
   - Players should ride platforms (Z position should update when standing on rising floor)
   - Players should be crushed by closing ceilings
   - Location: `src/physics/collision.ts`

3. **TypeScript warnings** (21 unused variable warnings)
   - All are unused imports or variables
   - Non-blocking but should be cleaned up eventually

---

## Next Steps (Recommended)

**Option A: Immediate gameplay (most impactful)**
Start with **Phase 8** (Weapon Rendering & HUD):
1. Implement weapon sprite rendering (hands/gun at bottom of screen)
2. Create status bar (health, armor, ammo, face)
3. Connect weapon firing to visuals
4. This makes the game feel much more complete

**Option B: Fix current issues first**
1. Test and fix dynamic sector geometry updates
2. Implement collision with moving sectors (ride platforms, crushing)
3. Add sector special types (damage floors, secrets)

**Option C: Continue with combat**
Jump to **Phase 9** (Combat System):
1. Complete enemy AI (chase, attack, pain, death)
2. Implement damage system
3. Make weapons actually hurt enemies
4. Make enemies attack back

See `REMAINING_FEATURES_PLAN.md` for full roadmap.

---

## Important Files to Know

### Core Systems
- `src/main.ts` - Main game loop, initialization
- `src/wad/WADReader.ts` - WAD file reading
- `src/level/MapParser.ts` - Map data parsing
- `src/core/fixed.ts` - Fixed-point math (DOOM used 16.16 fixed-point)
- `src/core/tables.ts` - Trig tables, angle conversions

### Rendering
- `src/renderer/LevelRenderer.ts` - Main level renderer, manages all geometry
- `src/renderer/WallBuilder.ts` - Builds wall geometry from linedefs
- `src/renderer/SectorBuilder.ts` - Builds floor/ceiling from subsectors ⭐ RECENTLY REWRITTEN
- `src/renderer/TextureManager.ts` - Texture loading and composition
- `src/renderer/BSPRenderer.ts` - BSP visibility culling

### Game Logic
- `src/game/mobj.ts` - Map objects (players, enemies, items, projectiles)
- `src/game/Thinker.ts` - Entity update system (linked list of active objects)
- `src/game/TriggerSystem.ts` - Line activation (doors, switches, etc.)
- `src/physics/collision.ts` - Collision detection and response
- `src/physics/movement.ts` - Player movement

### Sectors (Interactive Level Elements)
- `src/sectors/DoorSystem.ts` - Door mechanics
- `src/sectors/PlatformSystem.ts` - Platform mechanics

---

## Architecture Notes

### Coordinate System
DOOM uses a different coordinate system than three.js:
- **DOOM**: X = East/West, Y = North/South, Z = Up/Down
- **three.js**: X = East/West, Y = Up/Down, Z = North/South
- Conversion: `(x, y, z)_doom → (x, z, -y)_threejs`
- Function: `doomToThree()` in `src/core/coordinates.ts`

### Fixed-Point Math
DOOM uses 16.16 fixed-point integers for deterministic physics:
- Format: 16 bits integer, 16 bits fractional
- Example: `1.0 = 0x10000 = 65536`
- Conversion: `IntToFixed(n) = n << 16`, `FixedToFloat(n) = n / 65536`
- Why: JavaScript uses floating-point, but we use fixed-point format in mobj positions for compatibility

### Binary Angle Measurement (BAM)
DOOM uses 32-bit unsigned integers for angles:
- `0x00000000` = 0° (East)
- `0x40000000` = 90° (North)
- `0x80000000` = 180° (West)
- `0xC0000000` = 270° (South)
- Full circle = `0xFFFFFFFF + 1 = 0x00000000`

### Game Loop
- Target: 35 Hz (35 tics per second)
- Implementation: `GameTicker` in `src/core/ticker.ts`
- Each tic: Read input → Update physics → Update thinkers → Render

### BSP Tree
DOOM pre-computes Binary Space Partition trees for:
- Fast visibility determination (back-to-front rendering)
- Collision detection optimization
- Subsectors are leaf nodes (convex polygons)
- Nodes split space recursively

---

## Common DOOM Data Structures

### MapData
```typescript
interface MapData {
  name: string;           // E.g., "E1M1"
  vertexes: MapVertex[];  // 2D points
  linedefs: MapLineDef[]; // Wall definitions
  sidedefs: MapSideDef[]; // Wall textures/offsets
  sectors: MapSector[];   // Floor/ceiling regions
  things: MapThing[];     // Entity spawn points
  segs: MapSeg[];         // Line segments from BSP
  subsectors: MapSubSector[]; // Convex regions
  nodes: MapNode[];       // BSP tree nodes
}
```

### Mobj (Map Object)
```typescript
interface Mobj {
  x, y, z: Fixed;         // Position (fixed-point)
  angle: Angle;           // Direction (BAM)
  momx, momy, momz: Fixed; // Momentum
  radius, height: Fixed;  // Collision box
  flags: number;          // MobjFlags
  health: number;
  type: number;           // Thing type
  player?: PlayerState;   // If this is a player
}
```

### Linedef Special Types (Triggers)
- `1` = DR (Door Open Wait Close, repeatable, use)
- `2` = W1 (Door Open Stay, walk-once)
- `10` = W1 (Platform Lower Wait Raise, walk-once)
- `62` = SR (Platform Lower Wait Raise, switch-repeatable)
- See: https://doomwiki.org/wiki/Linedef_type

---

## Debugging Tips

### Visual Debugging
```typescript
// In main.ts, add helpers:
const gridHelper = new THREE.GridHelper(1000, 50);
this.scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(100);
this.scene.add(axesHelper);
```

### Enable Orbit Controls
Set `this.useOrbitControls = true` in main.ts to debug geometry without FPS controls

### Check BSP Visibility
```typescript
// In LevelRenderer.updateVisibility():
console.log(`Visible subsectors: ${visibleSubsectors.size}`);
```

### Texture Loading
```typescript
// In TextureManager:
console.log(`Loaded texture: ${name}`);
```

---

## Testing Checklist for Next Session

Before implementing new features:
- [ ] Test door activation (press SPACE near door)
- [ ] Test platform activation (walk over trigger line or press switch)
- [ ] Verify ceiling moves when door opens
- [ ] Verify floor moves when platform activates
- [ ] Check for any new visual artifacts
- [ ] Verify aspect ratio is 4:3 on different window sizes
- [ ] Test stair climbing still works

---

## Resources

### DOOM Documentation
- DOOM Wiki: https://doomwiki.org/
- DOOM Source Code: https://github.com/id-Software/DOOM
- Unofficial DOOM Specs: https://www.gamers.org/dhs/helpdocs/dmsp1666.html

### three.js
- Documentation: https://threejs.org/docs/
- Examples: https://threejs.org/examples/

### Useful DOOM Tools
- SLADE3: WAD editor (for inspecting DOOM.WAD)
- Doom Builder: Level editor (to understand map structure)

---

## Git Workflow

**Current branch**: `master`

**Recent commits**:
- `6e3b448` - Fix ceiling/floor holes and aspect ratio, add comprehensive feature plan
- `389082c` - Implement Phase 7: Sector systems with doors, platforms, and triggers
- `9edfe30` - Previous work (Phase 6 completion)

**Commit message format**:
```
Short summary (50 chars or less)

Detailed explanation of changes:
- What was added
- What was fixed
- Why it was done this way

Technical details:
- File changes
- Implementation notes

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

## Questions for User

If starting a new session, consider asking:
1. "Should I continue with Phase 8 (HUD & Weapons) or fix the dynamic sector geometry issue first?"
2. "Would you like me to test the current build to verify doors/platforms work?"
3. "Should I focus on making the game playable (combat, pickups) or complete (menus, audio)?"

---

## Final Notes

This project is at a critical juncture - the foundation is solid and most infrastructure is in place. The next phases are about **making it playable** rather than building more infrastructure.

Phase 8 (Weapon rendering & HUD) is recommended next because:
- It's highly visible (instant gratification)
- It's relatively self-contained (won't break existing systems)
- It makes the game feel much more complete
- It's required before Phase 9 (combat) can be satisfying

The comprehensive plan in `REMAINING_FEATURES_PLAN.md` should guide all future work. Estimated 20-30 hours to full single-player completion.

Good luck! 🎮
