# Current Issues & Next Steps

## Critical Issues to Fix

### 1. Map Rendering Quality
**Problem**: The map looks bad/incorrect
- Textures may be misaligned or distorted
- UV mapping might be incorrect
- Wall/floor geometry may have gaps or z-fighting
- Lighting appears too dark or inconsistent
- Sky rendering may be incorrect

**Potential Causes**:
- Texture offset calculations in WallBuilder may be wrong
- UV coordinates not properly normalized to texture size
- Sector triangulation creating bad geometry
- Light level calculations too aggressive
- Missing or incorrectly parsed texture data

**Priority**: HIGH

### 2. Player Spawn Position
**Problem**: Player spawns in wrong location (on top of map?)
- Should spawn at thing type 1 (player start) position
- Currently spawning at incorrect height or location
- May be coordinate conversion issue
- May be sector floor height not properly detected

**Current Implementation** (src/renderer/LevelRenderer.ts):
```typescript
getPlayerStart(): { x: number; y: number; z: number; angle: number } | null {
  const playerThing = this.mapData.things.find(thing => thing.type === 1);
  if (!playerThing) return null;
  const defaultHeight = 56; // DOOM player view height
  return {
    x: playerThing.x,
    y: playerThing.y,
    z: defaultHeight, // ← PROBLEM: Not using actual sector floor height!
    angle: playerThing.angle,
  };
}
```

**What Should Happen**:
1. Find player thing (type 1)
2. Determine which sector the player is in
3. Get that sector's floor height
4. Spawn player at floor height (z = floorheight)
5. Add view height offset for camera (41 units above floor)

**Priority**: HIGH

## Implementation Plan

### Phase 3.5: Fix Rendering & Spawn Issues

#### Task 1: Fix Player Spawn Position
1. Implement point-in-polygon test to find which sector contains player start
2. Get sector floor height at player position
3. Set player z = sector floor height
4. Update `mobj.floorz` and `mobj.ceilingz` from sector data
5. Test: Player should spawn on floor, not floating

**Files to modify**:
- `src/renderer/LevelRenderer.ts` - Fix getPlayerStart()
- `src/level/MapParser.ts` - Add helper to find sector at point
- `src/main.ts` - Use proper floor height when creating player

#### Task 2: Fix Texture Rendering
1. **Wall textures**:
   - Verify texture size is used for UV normalization
   - Check texture offset calculations (textureoffset, rowoffset)
   - Verify pegging flags (ML_DONTPEGTOP, ML_DONTPEGBOTTOM)
   - Fix UV coordinates to use actual texture dimensions

2. **Floor/ceiling textures**:
   - Verify 64x64 flat tiling is correct
   - Check UV calculation in sector triangulation
   - Ensure proper texture wrapping

3. **Lighting**:
   - Review light level conversion (currently /200)
   - Test with different brightness values
   - May need to use COLORMAP instead of simple brightness

4. **Sky**:
   - Verify sky texture loads correctly
   - Check sky sphere orientation
   - Ensure sky doesn't clip with geometry

**Files to modify**:
- `src/renderer/WallBuilder.ts` - Fix UV calculations
- `src/renderer/SectorBuilder.ts` - Fix flat UV calculations
- `src/renderer/TextureManager.ts` - Proper texture size handling
- `src/graphics/PatchDecoder.ts` - Verify texture decoding

#### Task 3: Improve Geometry Quality
1. **Sector triangulation**:
   - Current implementation uses simple fan triangulation
   - May create bad geometry for concave sectors
   - Consider using proper ear clipping or Delaunay triangulation

2. **Wall rendering**:
   - Ensure normals face correct direction
   - Check for duplicate/overlapping geometry
   - Verify two-sided wall rendering (upper/middle/lower)

3. **Z-fighting prevention**:
   - Add small offset between floor/ceiling if at same height
   - Ensure proper depth testing

**Files to modify**:
- `src/renderer/SectorBuilder.ts` - Better triangulation
- `src/renderer/WallBuilder.ts` - Geometry cleanup

## Testing Checklist

Once fixes are applied, verify:

- [ ] Player spawns on floor at correct height
- [ ] Player can walk around without falling through floor
- [ ] Textures are sharp and correctly aligned
- [ ] Walls have proper textures (not stretched/distorted)
- [ ] Floors and ceilings tile correctly
- [ ] Lighting looks reasonable (not too dark)
- [ ] Sky renders correctly and doesn't clip
- [ ] No gaps or z-fighting in geometry
- [ ] Movement feels natural at proper height
- [ ] Camera view height is correct (41 units above floor)

## Known Good Reference Values (E1M1)

**Player Start (Thing Type 1)**:
- Position: varies by map
- Should be inside a valid sector
- Floor height at start: typically 0 or specific sector height

**View Heights**:
- Player height: 56 units
- View height: 41 units above floor
- Step height: 24 units max
- Ceiling clearance: Player can't enter if ceiling < floor + 56

## Next Phase After Fixes

Once rendering and spawn are fixed, continue with original plan:

**Phase 4: BSP Rendering & Visibility**
- Use BSP tree for frustum culling
- Only render visible subsectors
- Implement REJECT lump for sector visibility
- Performance optimization

**Phase 5: Sprites & Billboards**
- Render enemies, items, decorations
- Billboard sprites always face camera
- 8-rotation sprite selection
- Animation state machines
- Depth sorting

See main plan in `/Users/thomasmarshall/.claude/plans/ticklish-wobbling-crane.md` for complete roadmap.
