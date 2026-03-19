# DOOM Original vs Three.js – Reconciliation Plan (Updated)

Covers: **combat/hitscan**, **tick rates**, **enemy fire rate**, **HUD** (layout, gun position, muzzle flash, border).

---

## 1. Combat: Enemies Not Getting Hit (Hitscan)

**Problem**: Shots often miss; hit detection feels off.

**Current behavior** ([WeaponSystem.ts](src/weapons/WeaponSystem.ts) `performHitscan`):

- Iterates all shootable mobjs and keeps the one that is:
  - Closest
  - Within an angular cone: `angleDiff < angularSize * 2`
  - With **player eye inside enemy Z range**: `startZ >= targetZ && startZ <= targetZ + targetHeight`
- Then runs `checkLineOfSight(source, target)` for that candidate.

**Issues**:

1. **Vertical check is too strict**: We require the *player’s eye* to be inside the enemy’s Z range. Correct behavior: the *ray* (at fixed eye height) should be considered a hit if the ray passes through the enemy’s **vertical slab** (cylinder). So the condition should be: ray at height `startZ` can hit the enemy if `startZ` is in `[targetZ, targetZ + targetHeight]` — which is what we have. So the real problem is more likely (2) or (3).
2. **No wall trace**: We never trace the ray through the world. We only check LOS to the chosen target. So we might pick an enemy that is behind a wall (LOS should fail) or we might reject a valid hit. **Fix**: Trace the ray (e.g. ray-vs-linedefs or blockmap) and get the **first** hit: either a wall (max distance) or a thing. Only register a monster hit if it is **closer** than the wall hit. Use the same or a similar approach as [p_map.c P_PathTraverse / PTR_ShootTraverse](linuxdoom-1.10/p_map.c).
3. **Hit test should be ray-vs-circle**: Use proper 2D **ray–circle intersection** to decide if the ray (startX, startY, dirX, dirY) hits the disk (targetX, targetY, radius), instead of relying only on angle-diff vs angular size. Then sort by distance along the ray and respect wall intercepts.

**Concrete steps**:

- **Hitscan**:
  - Implement 2D ray–circle intersection; a hit = ray intersects circle and distance along ray is minimal among all enemies, and less than distance to any wall.
  - Add a ray-vs-map step: trace ray against linedefs (or blockmap) to get the first wall intercept distance. Only consider mobjs with distance &lt; that.
  - Keep LOS for the chosen target if desired, or rely on “first intercept” so walls block correctly.
- **Vertical**: Keep “eye height within enemy Z span” for the horizontal ray, or extend to a proper 3D ray vs cylinder if needed later.

**Files**: [src/weapons/WeaponSystem.ts](src/weapons/WeaponSystem.ts), optionally [src/physics/LineOfSight.ts](src/physics/LineOfSight.ts) or a new ray-trace module.

---

## 2. Enemies Shoot Too Quickly (Fire Rate / Reaction)

**Problem**: Enemies attack too often; not enough time to react.

**Current behavior** ([EnemyStates.ts](src/ai/EnemyStates.ts)):

- `reactiontime = 8` when first acquiring target (matches original [info.c](linuxdoom-1.10/info.c) reactiontime = 8).
- `attackCooldown`: 50 for type 9 (shotgun guy), 40 for others; decremented every tick.

**Possible issues**:

- Cooldown 40–50 ticks (~1.1–1.4 s) might still feel short if the enemy keeps re-acquiring or if there’s no “attack state” duration.
- In original DOOM, the monster enters an attack state and plays an animation; it doesn’t fire again until that state ends. We might be applying damage every tick while in ATTACK, or not holding the monster in attack state long enough.

**Fixes**:

- Ensure **attack state has a minimum duration**: e.g. when entering ATTACK, set `attackCooldown` to the full cooldown (40–50) and do **not** apply damage again until we leave ATTACK and cooldown has expired. Confirm we only call `attackPlayer` once per attack, not every tick while in ATTACK.
- Optionally **increase cooldown** slightly (e.g. 56 ticks ≈ 1.6 s for shotgun guy) so the player has more breathing room, then tune back toward original if needed.
- Cross-check [p_enemy.c](linuxdoom-1.10/p_enemy.c) A_Chase / A_FaceTarget / attack state lengths and ensure we only deal damage once per attack and that reactiontime is applied (no attack until reactiontime &lt;= 0).

**Files**: [src/ai/EnemyStates.ts](src/ai/EnemyStates.ts).

---

## 3. Tick Rates

**Problem**: “Tick rates are off” — timing feels wrong.

**Current setup** ([ticker.ts](src/core/ticker.ts)):

- Game logic at **35 Hz** (TICRATE = 35), accumulator-based, max 4 ticks per frame.

**Issues**:

- **Muzzle flash** is driven by **render frames**, not game ticks: in [WeaponRenderer.ts](src/renderer/WeaponRenderer.ts), `flashTicks` is set to 4 when entering FIRING and decremented **every call to `update()`**, which is every `animate()` frame (~60 fps). So the flash lasts ~4 render frames (~67 ms) and is effectively invisible or flickery. Original DOOM shows the flash for a few **ticks** (e.g. 2–4 ticks ≈ 57–114 ms).
- Weapon state (FIRING, fireTimer) is tick-based, but flash visibility is frame-based.

**Fixes**:

- **Flash driven by game tick**:
  - In [main.ts](src/main.ts): when `fireWeapon()` succeeds, set e.g. `weaponFlashUntilTick = this.tickCount + 4` (or use the ticker’s current tick).
  - In `animate()`, pass into the weapon renderer: `showFlash = this.weaponFlashUntilTick > this.tickCount` (or equivalent with ticker).
  - In [WeaponRenderer.ts](src/renderer/WeaponRenderer.ts): add a parameter `showFlash: boolean` to `update(weapon, playerBob, showFlash)` and show the flash mesh when `showFlash` is true; stop decrementing a per-frame `flashTicks` for visibility.
- Ensure **only one source of truth for “current tick”** (e.g. GameTicker.getCurrentTick() or DoomGame.tickCount) so flash and game logic stay in sync.
- Keep **35 Hz** for game logic; do not run weapon or enemy logic at render rate.

**Files**: [src/main.ts](src/main.ts), [src/renderer/WeaponRenderer.ts](src/renderer/WeaponRenderer.ts), [src/core/ticker.ts](src/core/ticker.ts).

---

## 4. HUD: Gun at Top, No Muzzle Flash, Borders Thin

### 4.1 Gun position (way up top)

**Cause**: In Three.js `OrthographicCamera(0, 320, 168, 0)`, **top = 168** and **bottom = 0** in world Y. So larger Y = top of screen. Current code sets `yPos = 168 - (sprite.height*0.5) + bobY`, which places the weapon near **Y = 168** → **top** of the view.

**Fix**: Bottom of view = Y = 0. Place the weapon so its **bottom** is at Y = 0:

- `yPos = sprite.height * 0.5 - bobY` (center of sprite at half height above 0).
- Optionally use patch **topoffset** so the sprite anchor matches original DOOM (handle position so the patch’s (leftoffset, topoffset) lands at screen (160, 0) for bottom-center).

**File**: [src/renderer/WeaponRenderer.ts](src/renderer/WeaponRenderer.ts).

### 4.2 No muzzle flash

- Handled in **§3** (tick-based flash). Ensure the flash mesh is visible when `showFlash` is true and that the flash texture (PISF, SHTF, CHGF, etc.) is loaded and drawn at the same position as the weapon (or slightly in front).

### 4.3 Borders extremely thin

**Cause**: Border is drawn at a fixed **8 px** while the view can be much larger (e.g. 800 px wide), so the border looks like a hairline.

**Fix** ([BorderFrame.ts](src/ui/BorderFrame.ts)):

- **Scale border thickness** with view size: e.g. `borderSizePx = Math.max(8, Math.round(8 * (viewWidth / 320)))`.
- Use this for canvas size and for tiling/corners so the border stays proportionally thick (~2.5% of width at 320).
- Scale the 8×8 WAD patches when drawing (e.g. draw into a scaled rect or offscreen canvas) so the visible border is **borderSizePx** thick.

**File**: [src/ui/BorderFrame.ts](src/ui/BorderFrame.ts).

### 4.4 HUD layout (status bar)

- Use bar-relative Y = **3** for ammo/health/armor numbers (original ST_AMMOY = 171 → 171−168 = 3).
- Face at **(143, 0)** in the 32 px bar.
- Load and use: STARMS, STTPRCNT, STYSNUM0–9, full face set, STFB0, STGNUM2–7; tall numbers for health/armor/ready ammo, short numbers for the four ammo and four max-ammo fields.
- Keep status bar internal resolution 320×32 and scale via CSS without stretching.

**File**: [src/ui/StatusBar.ts](src/ui/StatusBar.ts).

---

## 5. Implementation Order

1. **Weapon position** – Fix Y so gun is at bottom of view (Y = 0).
2. **Muzzle flash** – Drive flash from game tick; pass `showFlash` into `WeaponRenderer.update()`.
3. **Border** – Scale border thickness with view size and draw patches at scaled size.
4. **Hitscan** – Ray–circle intersection; ray-vs-map for first wall; only count monster hit if closer than wall.
5. **Enemy fire rate** – Ensure one damage event per attack and cooldown; optionally increase cooldown slightly.
6. **Status bar** – Coordinates and assets as above.

---

## 6. Level Data (unchanged)

- Confirm lump order and struct sizes match [doomdata.h](linuxdoom-1.10/doomdata.h); no changes needed if already correct.
