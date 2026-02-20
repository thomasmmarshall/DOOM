# DOOM Three.js - Remaining Features Implementation Plan

This document outlines all remaining features needed to complete the DOOM port. Current progress: Phases 1-7 complete.

## Current Status (What Works)

✅ **Phase 1-2**: Core systems (WAD reading, fixed-point math, angle tables)
✅ **Phase 3**: Level rendering (walls, floors, ceilings, textures, sky)
✅ **Phase 4**: BSP visibility culling
✅ **Phase 5**: Sprite rendering (items, decorations)
✅ **Phase 6**: Thinker system, basic AI states, weapons framework, line-of-sight
✅ **Phase 7**: Doors, platforms, trigger system (USE/WALK activation)
✅ **Fixed**: Ceiling/floor holes (now using BSP subsectors for proper triangulation)
✅ **Fixed**: Aspect ratio (4:3 with pillarbox/letterbox)

## Known Issues to Address First

### High Priority Fixes

1. **Dynamic sector geometry updates** (Phase 7 follow-up)
   - Current issue: Door/platform height changes update the MapData but geometry vertex updates may not work correctly
   - Need to verify `updateSectorCeiling()` and `updateSectorFloor()` in LevelRenderer.ts
   - Test: Activate a door and verify ceiling mesh moves smoothly
   - Location: `src/renderer/LevelRenderer.ts:325-390`

2. **Collision with moving sectors**
   - Players should ride platforms (update player Z when standing on moving floor)
   - Players should be crushed by closing doors/ceilings
   - Location: `src/physics/collision.ts`

3. **Missing sector types**
   - Damage floors (lava, slime, etc.)
   - Secret sectors
   - Exit sectors
   - Location: Need to check sector.special field

---

## Phase 8: Weapon Rendering & HUD

**Goal**: Display first-person weapon and heads-up display

### 8.1 Weapon Sprite Rendering
- **Files to create**:
  - `src/renderer/WeaponRenderer.ts` - Renders weapon sprites in screen space
  - `src/graphics/WeaponSprites.ts` - Loads weapon sprite sequences (A-F frames)

- **Implementation**:
  - Create separate camera/scene for weapon (overlay rendering)
  - Load weapon sprites from WAD (e.g., "PISGA0", "PISGB0" for pistol frames)
  - Position weapon sprite in lower center of screen
  - Animate firing (frame sequence: A → B → C → D → A)
  - Add muzzle flash sprite
  - Bob weapon during movement (use player.bob from PlayerState)

- **Weapon sprite names**:
  - Fist: PUNCHA0-D0
  - Pistol: PISGA0-D0
  - Shotgun: SHTGA0-B0
  - Chaingun: CHGGA0-B0
  - Rocket Launcher: MISLA0-D0
  - Plasma Rifle: PLSGA0-B0
  - BFG: BFGGA0-B0

### 8.2 Status Bar (HUD)
- **Files to create**:
  - `src/ui/StatusBar.ts` - Main HUD renderer
  - `src/ui/NumberFont.ts` - Renders HUD numbers

- **Implementation**:
  - Load STBAR patch (320x32 status bar background)
  - Load number font patches (STTNUM0-9)
  - Display at bottom of screen using 2D canvas or HTML overlay
  - Show health (green numbers, max 100)
  - Show armor (blue numbers, max 200)
  - Show ammo count (yellow numbers)
  - Show face (STFST00-42, changes based on health/direction of damage)
  - Show arms (weapon ownership indicators)
  - Show keys (blue, yellow, red key indicators)

- **Status bar patches**:
  - Background: STBAR
  - Numbers: STTNUM0-9
  - Face: STFST00, STFST01, etc. (pain, evil grin, dead)
  - Arms: STARMS
  - Keys: STKEYS

### 8.3 Weapon Switching
- **Location**: Extend `src/weapons/WeaponSystem.ts`
- **Implementation**:
  - Listen for number keys (1-7) for weapon selection
  - Check if player owns weapon (track in PlayerState)
  - Check if player has ammo for weapon
  - Play weapon switch animation (lower old weapon, raise new weapon)
  - Update currentWeapon in PlayerState

### 8.4 Weapon Firing Integration
- **Location**: Integrate with existing `src/weapons/WeaponSystem.ts`
- **Implementation**:
  - Connect mouse click / ctrl key to `fireWeapon()`
  - Trigger weapon animation when firing
  - Play weapon sound effect
  - Consume ammo
  - Handle hitscan weapons (pistol, shotgun, chaingun)
  - Handle projectile weapons (rocket, plasma, BFG)

---

## Phase 9: Combat System

**Goal**: Functional combat with enemies taking/dealing damage

### 9.1 Enemy AI Completion
- **Location**: Extend `src/ai/EnemyStates.ts`
- **Current state**: State machine exists but incomplete
- **Implementation**:
  - Complete CHASE state (pathfinding, movement toward player)
  - Complete ATTACK state (different attacks per enemy type)
  - Add PAIN state (flinch when damaged)
  - Add DEATH state (death animation, become corpse)
  - Add sound triggers (sight, active, pain, death sounds)

### 9.2 Damage System
- **Files to create**:
  - `src/game/Damage.ts` - Damage calculation and application

- **Implementation**:
  - `damageActor(target: Mobj, damage: number, attacker?: Mobj)`
  - Reduce target.health
  - Trigger pain state if damage threshold met
  - Trigger death state if health <= 0
  - Award kills to player
  - Handle player death (game over screen)

### 9.3 Hitscan Weapons
- **Location**: Complete `src/weapons/WeaponSystem.ts`
- **Implementation**:
  - Use line-of-sight raycasting from `src/physics/LineOfSight.ts`
  - Find first enemy in crosshair
  - Apply damage (pistol: 5-15, shotgun: 5-15 per pellet × 7 pellets, chaingun: 5-15)
  - Trigger enemy pain/death animation
  - Show bullet puff sprite (PUFF)

### 9.4 Projectile Weapons
- **Files to create**:
  - `src/game/Projectiles.ts` - Rocket, plasma, BFG projectile thinkers

- **Implementation**:
  - Create projectile mobj when firing
  - Add to thinker list
  - Move projectile each tick
  - Check collision with walls (explode)
  - Check collision with enemies (damage + explode)
  - Spawn explosion sprite (MISL for rockets, PLSS/PLSE for plasma)

### 9.5 Enemy Attacks
- **Implementation per enemy type**:
  - Zombieman/Shotgun Guy: Hitscan attack (like player weapons)
  - Imp: Fireball projectile (TBALL sprites)
  - Demon: Melee attack (close range damage)
  - Cacodemon: Fireball projectile
  - Lost Soul: Charging attack (SKULLFLY state)
  - Baron of Hell: Green fireball projectile

---

## Phase 10: Items & Pickups

**Goal**: Functional item pickup system

### 10.1 Item Collision Detection
- **Location**: Extend `src/physics/collision.ts`
- **Implementation**:
  - Check distance between player and items each tick
  - If distance < item.radius + player.radius, trigger pickup
  - Call `pickupItem(item: Mobj, player: Mobj)`

### 10.2 Pickup Types
- **Files to create**:
  - `src/game/Pickups.ts` - Item pickup handlers

- **Implementation by type**:
  - **Health**:
    - Stimpack (+10 health, max 100)
    - Medikit (+25 health, max 100)
    - Soul Sphere (+100 health, max 200)
  - **Armor**:
    - Armor bonus (+1 armor, max 200)
    - Green armor (100 armor, 33% protection)
    - Blue armor (200 armor, 50% protection)
  - **Ammo**:
    - Clip (+10 bullets)
    - Box of bullets (+50 bullets)
    - Shells (+4 shells)
    - Box of shells (+20 shells)
    - Rocket (+1 rocket)
    - Box of rockets (+5 rockets)
    - Cell (+20 cells)
    - Cell pack (+100 cells)
  - **Weapons**:
    - Chainsaw, Shotgun, Super Shotgun, Chaingun, Rocket Launcher, Plasma Rifle, BFG
    - Each weapon gives ammo when picked up
  - **Powerups**:
    - Berserk (×10 melee damage, full health)
    - Invulnerability (30 seconds god mode)
    - Invisibility (partial invisibility, 60 seconds)
    - Rad suit (radiation protection, 60 seconds)
    - Computer map (reveals automap)
    - Light amp goggles (full brightness, 120 seconds)
  - **Keys**:
    - Blue, Yellow, Red (skull and card variants)

### 10.3 Pickup Sprites
- Remove picked-up items from scene
- Play pickup sound effect
- Show pickup message (optional)

---

## Phase 11: Audio System

**Goal**: Sound effects and music

### 11.1 Sound Effect System
- **Files to create**:
  - `src/audio/SoundManager.ts` - Sound playback system
  - `src/audio/SoundDecoder.ts` - Decode PC speaker/DMX sounds from WAD

- **Implementation**:
  - Load sound lumps from WAD (DSPISTOL, DSSHOTGN, DSPLASMA, etc.)
  - Decode DMX sound format (sample rate, length, data)
  - Use Web Audio API for playback
  - Support 3D positional audio (enemy sounds, doors, etc.)
  - Sound categories:
    - Weapon sounds (pistol, shotgun, rocket, etc.)
    - Enemy sounds (sight, active, pain, death)
    - Ambient sounds (doors, platforms, switches)
    - Player sounds (grunt, death, pickup)

### 11.2 Music System
- **Files to create**:
  - `src/audio/MusicPlayer.ts` - Music playback
  - `src/audio/MusicDecoder.ts` - Decode MUS/MIDI from WAD

- **Implementation**:
  - Load music lumps (D_E1M1, D_E1M2, etc.)
  - Convert MUS format to MIDI
  - Use Web MIDI or synthesizer library (e.g., midi.js, soundfont-player)
  - Play level music on loop
  - Implement music switching (title, intermission, victory)

---

## Phase 12: Automap

**Goal**: Overhead map display

### 12.1 Automap Renderer
- **Files to create**:
  - `src/ui/Automap.ts` - Automap rendering and controls

- **Implementation**:
  - Toggle automap with TAB key
  - Render 2D overhead view of level
  - Draw linedefs (walls) in different colors:
    - Red: One-sided walls (solid)
    - Yellow: Two-sided walls (doors, windows)
    - Brown: Secret doors (not visible until found)
    - Gray: Unseen areas (optional, based on ML_MAPPED flag)
  - Draw player as triangle indicating direction
  - Draw things (enemies, items) as different colored dots
  - Pan map with arrow keys
  - Zoom in/out with +/- keys
  - Follow mode (map centers on player)
  - Grid mode (show coordinate grid)

---

## Phase 13: Menus & UI

**Goal**: Title screen, menus, game state management

### 13.1 Menu System
- **Files to create**:
  - `src/ui/MenuSystem.ts` - Menu state machine
  - `src/ui/MenuRenderer.ts` - Render menu graphics

- **Implementation**:
  - **Title Screen**:
    - Load TITLEPIC patch
    - Animate title screen
    - Show "Press any key" prompt
  - **Main Menu**:
    - New Game
    - Options
    - Load Game
    - Save Game
    - Quit Game
  - **Episode Selection** (for DOOM 1):
    - Knee-Deep in the Dead (Episode 1)
    - The Shores of Hell (Episode 2)
    - Inferno (Episode 3)
  - **Skill Selection**:
    - I'm Too Young To Die (skill 1)
    - Hey, Not Too Rough (skill 2)
    - Hurt Me Plenty (skill 3)
    - Ultra-Violence (skill 4)
    - Nightmare! (skill 5)
  - **Options Menu**:
    - Mouse sensitivity
    - Sound volume
    - Music volume
    - Screen size
    - Detail level

### 13.2 Intermission Screen
- **Files to create**:
  - `src/ui/Intermission.ts` - Level statistics screen

- **Implementation**:
  - Show after completing a level
  - Display statistics:
    - Kills: X/Y (percentage)
    - Items: X/Y (percentage)
    - Secrets: X/Y (percentage)
    - Time: MM:SS
  - Animate statistics counting up
  - Show par time comparison
  - Press spacebar to continue to next level

---

## Phase 14: Game State & Progression

**Goal**: Proper level transitions, save/load

### 14.1 Level Exit System
- **Location**: Extend `src/game/TriggerSystem.ts`
- **Implementation**:
  - Detect exit linedef specials (11, 51, 52, etc.)
  - Trigger level exit when activated
  - Show intermission screen
  - Load next level in sequence
  - Handle secret exits (to secret levels)

### 14.2 Save/Load Game
- **Files to create**:
  - `src/save/SaveGame.ts` - Serialize/deserialize game state

- **Implementation**:
  - Save to browser localStorage or IndexedDB
  - Save data:
    - Player state (health, armor, ammo, weapons, position)
    - Current level/map name
    - Enemy states (position, health, state)
    - Item pickup states (which items collected)
    - Door/platform states
    - Triggered linedef flags
  - Load game: Restore all state and rebuild level

### 14.3 Skill Level Implementation
- **Implementation**:
  - Affect thing spawning (check MTF_EASY, MTF_MEDIUM, MTF_HARD flags)
  - Affect enemy health/damage (Nightmare mode: fast enemies, respawning)
  - Affect ammo multipliers (Easy mode: double ammo)

---

## Phase 15: Advanced Features

**Goal**: Polish and advanced DOOM features

### 15.1 Lighting Effects
- **Files to create**:
  - `src/sectors/LightingEffects.ts` - Blinking, strobing, glowing lights

- **Implementation**:
  - Sector special types for lighting:
    - Type 1: Blink random
    - Type 2: Blink 0.5 second
    - Type 3: Blink 1 second
    - Type 8: Oscillating light
    - Type 12: Strobe (synchronized)
    - Type 13: Strobe (unsynchronized)
    - Type 17: Flicker randomly
  - Update sector light level each tick
  - Update material uniforms for affected sectors

### 15.2 Teleporters
- **Location**: Extend `src/game/TriggerSystem.ts`
- **Implementation**:
  - Detect teleporter linedef specials (39, 97, etc.)
  - Find teleport destination (thing type 14)
  - Move player to destination instantly
  - Play teleport sound (DSTELEPT)
  - Spawn teleport fog sprite (TFOG)

### 15.3 Crushers & Special Ceilings
- **Files to create**:
  - `src/sectors/CeilingSystem.ts` - Crushing ceilings, raising/lowering

- **Implementation**:
  - Crusher movement (up and down repeatedly)
  - Damage actors caught between ceiling and floor
  - Stop if blocked vs. crush through

### 15.4 Scrolling Textures
- **Implementation**:
  - Detect special linedef types for scrolling
  - Animate texture UV offset each frame
  - Used for waterfalls, conveyors, etc.

### 15.5 Animated Flats & Textures
- **Files to create**:
  - `src/graphics/AnimatedTextures.ts` - Manage texture animation sequences

- **Implementation**:
  - Hardcoded animation sequences:
    - NUKAGE1 → NUKAGE2 → NUKAGE3 (toxic sludge)
    - FWATER1 → FWATER2 → FWATER3 → FWATER4 (water)
    - LAVA1 → LAVA2 → LAVA3 → LAVA4 (lava)
    - BLOOD1 → BLOOD2 → BLOOD3 (blood)
    - BLODGR1 → BLODGR2 → BLODGR3 → BLODGR4 (green blood)
  - Update texture references each tick (at specific intervals)

### 15.6 Death & Respawn
- **Implementation**:
  - Player death:
    - Play death animation/sound
    - Drop view to ground
    - Show death screen overlay (red tint)
    - Wait for respawn key
  - Respawn at player start
  - Reset health/armor
  - Keep weapons/keys (depends on game mode)

### 15.7 Cheat Codes
- **Files to create**:
  - `src/game/Cheats.ts` - Cheat code detection

- **Implementation**:
  - Detect key sequences:
    - IDDQD: God mode
    - IDKFA: Keys, ammo, weapons, armor
    - IDFA: Ammo, weapons, armor
    - IDCLIP: No-clipping mode
    - IDDT: Full automap
    - IDCHOPPERS: Chainsaw
    - IDMUS##: Change music track

---

## Phase 16: Multiplayer (Optional/Advanced)

**Goal**: Network multiplayer support

### 16.1 Network Architecture
- **Files to create**:
  - `src/network/NetGame.ts` - Network game coordinator
  - `src/network/NetProtocol.ts` - Packet serialization

- **Implementation**:
  - WebRTC peer-to-peer connections
  - Deterministic lockstep simulation (DOOM's original method)
  - Share ticmds between players
  - Synchronize RNG seeds
  - Handle player join/leave

### 16.2 Deathmatch
- Spawn points (thing type 11)
- Track kills/deaths
- Respawn players after death
- Weapon respawn (30 seconds)

### 16.3 Cooperative
- Spawn points (thing types 1-4)
- Shared progression
- Don't filter MTF_MULTIPLAYER flag on things

---

## Testing & Polish Checklist

### Core Functionality Tests
- [ ] All linedef specials working (doors, platforms, exits, teleporters)
- [ ] All sector specials working (damage, lighting, secrets)
- [ ] All weapons firing correctly
- [ ] All enemy types functioning (movement, attacks, death)
- [ ] All pickups working (health, armor, ammo, weapons, powerups, keys)
- [ ] HUD updates correctly
- [ ] Sound effects playing
- [ ] Music playing and looping
- [ ] Automap displays correctly
- [ ] Menus functional
- [ ] Save/load working
- [ ] Level transitions working

### Visual Polish
- [ ] Texture filtering (nearest neighbor for authentic pixelated look)
- [ ] Sprite billboarding working
- [ ] Weapon sprites rendering correctly
- [ ] No visual glitches (z-fighting, texture bleeding)
- [ ] Lighting atmospheric and correct
- [ ] Sky rendering properly
- [ ] Animated textures cycling

### Performance
- [ ] Maintain 60 FPS on modern hardware
- [ ] BSP culling reducing draw calls
- [ ] Efficient collision detection
- [ ] Audio not causing stutters

### Authenticity
- [ ] 4:3 aspect ratio maintained
- [ ] Original DOOM FOV (~73.74 degrees)
- [ ] Movement speed matches original
- [ ] Weapon timing matches original
- [ ] Enemy behavior matches original

---

## File Structure Overview

```
src/
├── ai/              ✅ Enemy AI (needs completion)
├── audio/           ❌ Sound effects and music (Phase 11)
├── core/            ✅ Fixed-point math, angles, tables
├── demo/            ✅ Demo playback (if needed)
├── game/            ✅ Mobjs, thinkers, thing spawning
│   ├── Damage.ts    ❌ (Phase 9)
│   ├── Pickups.ts   ❌ (Phase 10)
│   ├── Projectiles.ts ❌ (Phase 9)
│   └── Cheats.ts    ❌ (Phase 15)
├── graphics/        ✅ Textures, patches, sprites
│   └── WeaponSprites.ts ❌ (Phase 8)
│   └── AnimatedTextures.ts ❌ (Phase 15)
├── input/           ✅ Input manager
├── level/           ✅ Map parsing
├── physics/         ✅ Movement, collision, gravity
│   └── (extend for crushers, riding platforms)
├── renderer/        ✅ Level, walls, sprites, BSP
│   └── WeaponRenderer.ts ❌ (Phase 8)
├── save/            ❌ Save/load system (Phase 14)
├── sectors/         ✅ Doors, platforms
│   ├── CeilingSystem.ts ❌ (Phase 15)
│   └── LightingEffects.ts ❌ (Phase 15)
├── ui/              ❌ HUD, menus, automap (Phases 8, 12, 13)
│   ├── StatusBar.ts ❌ (Phase 8)
│   ├── Automap.ts   ❌ (Phase 12)
│   ├── MenuSystem.ts ❌ (Phase 13)
│   └── Intermission.ts ❌ (Phase 13)
├── wad/             ✅ WAD reading
└── weapons/         ✅ Weapon system (needs integration)
```

---

## Estimated Effort

- **Phase 8 (HUD & Weapons)**: 2-4 hours
- **Phase 9 (Combat)**: 3-5 hours
- **Phase 10 (Pickups)**: 1-2 hours
- **Phase 11 (Audio)**: 3-4 hours
- **Phase 12 (Automap)**: 2-3 hours
- **Phase 13 (Menus)**: 3-4 hours
- **Phase 14 (Game State)**: 2-3 hours
- **Phase 15 (Advanced)**: 4-6 hours
- **Phase 16 (Multiplayer)**: 8-12 hours (optional)

**Total for full single-player experience**: 20-30 hours
**Total with multiplayer**: 30-45 hours

---

## Quick Start for Next Session

1. **Start with Phase 8**: Weapon rendering and HUD are the most visible missing features
2. **Test fixes**: Verify doors/platforms work with the geometry update fixes
3. **Focus on gameplay**: Phases 8-10 will make the game actually playable
4. **Audio adds polish**: Phase 11 makes it feel like DOOM
5. **Menus last**: Phase 13 can wait until core gameplay is solid

---

## References

- DOOM Wiki: https://doomwiki.org/
- Linedef types: https://doomwiki.org/wiki/Linedef_type
- Sector types: https://doomwiki.org/wiki/Sector_type
- Thing types: https://doomwiki.org/wiki/Thing_types
- DOOM source code: https://github.com/id-Software/DOOM
- Sprite names: https://doomwiki.org/wiki/Sprite
- Sound effects list: https://doomwiki.org/wiki/Sound_effect
