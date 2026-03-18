# Tick Order Audit: DOOM vs This Port

Comparison of core gameplay tick order between linuxdoom-1.10 and this codebase.

## DOOM Original (p_tick.c, g_game.c)

```
G_Ticker (per tic):
  1. Build ticcmd for each player (G_BuildTiccmd)
  2. P_Ticker:
     a. P_PlayerThink (each player) - adds momentum, use, weapon change; does NOT move
     b. P_RunThinkers - ALL mobjs (player + monsters): P_XYMovement, P_ZMovement, state machine
     c. P_UpdateSpecials - doors, platforms, animated textures/flats
     d. P_RespawnSpecials - item respawn (deathmatch)
     e. leveltime++
  3. ST_Ticker, AM_Ticker, HU_Ticker (UI)
```

**Key:** Player mobj is in the thinker list. P_PlayerThink adds momentum; P_MobjThinker (via P_RunThinkers) applies it. Player typically runs first (spawned first).

## This Port (main.ts gameTick)

```
1. tickCount++, levelTime++                    ← leveltime: we increment at START
2. Build ticcmd
3. Use button → tryUseAction
4. Attack button → firePlayerWeapon
5. movePlayer (add momentum + angle)
6. applyFriction
7. applyGravity
8. applyCollision
9. applyZMomentum
10. Item pickups
11. cleanupRemovedMobjs
12. Walk triggers
13. runThinkers (enemies only - player NOT in list)
14. Doors, platforms update
15. Weapon state update
16. updateSectorSpecials
17. Player counters (bonusCount, message, powerups)
18. HUD render
```

## Alignments

| Aspect | DOOM | Ours | Status |
|--------|------|------|--------|
| Tick rate | 35 Hz | 35 Hz | ✓ |
| Player think before mobjs | ✓ | ✓ | ✓ |
| Thinkers run (monsters) | ✓ | ✓ | ✓ |
| Doors/platforms after thinkers | ✓ | ✓ | ✓ |
| Sector specials (lights, damage) | P_UpdateSpecials | updateSectorSpecials | ✓ |
| leveltime for animations | Used in P_UpdateSpecials | Used in updateSectorSpecials | ⚠ See below |

## Misalignments

### 1. leveltime increment timing
- **DOOM:** `leveltime++` at END of P_Ticker (after P_UpdateSpecials)
- **Ours:** `levelTime++` at START of gameTick
- **Impact:** Sector specials (nukage damage, light blink) use levelTime. We're 1 tick ahead.
- **Fix:** Move levelTime++ to end of tick.

### 2. Player not in thinker list
- **DOOM:** Player mobj is a thinker; P_XYMovement/P_ZMovement run during P_RunThinkers
- **Ours:** Player processed separately before runThinkers
- **Impact:** Order is equivalent (player always moves before enemies). No fix needed.

### 3. P_RespawnSpecials
- **DOOM:** Item respawn in deathmatch
- **Ours:** Not implemented
- **Impact:** Deathmatch-only; single-player unaffected.

### 4. P_UpdateSpecials scope
- **DOOM:** Animated flats, animated textures, scroll effects, level timer
- **Ours:** Sector lights, nukage damage, secret detection, scroll (line 48)
- **Impact:** We cover the main gameplay-affecting specials. Some animation may differ.
