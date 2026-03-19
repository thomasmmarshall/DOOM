# Authenticity vs linuxdoom-1.10

Normative reference: bundled [`linuxdoom-1.10/`](linuxdoom-1.10/). Simulation targets vanilla behavior; the Three.js rasterizer cannot match software pixels without a separate `r_*` framebuffer path (see end).

## Module map

| linuxdoom C | TypeScript (primary) | Parity |
|-------------|------------------------|--------|
| `m_random.c` | [`src/core/random.ts`](src/core/random.ts) | Verified (LUT + split M/P streams) |
| `m_fixed.c` | [`src/core/fixed.ts`](src/core/fixed.ts) | Approximated (JS integer math) |
| `tables.c` | [`src/core/tables.ts`](src/core/tables.ts) | Approximated / tested angles |
| `d_main.c`, `g_game.c` | [`src/main.ts`](src/main.ts), [`src/core/ticker.ts`](src/core/ticker.ts) | Partial (35 Hz default; see ticker) |
| `p_user.c`, `p_mobj.c` | [`src/physics/movement.ts`](src/physics/movement.ts) | Partial |
| `p_map.c`, `p_maputl.c` | [`src/physics/collision.ts`](src/physics/collision.ts) | Partial |
| `p_sight.c` | [`src/physics/LineOfSight.ts`](src/physics/LineOfSight.ts) | Partial |
| `p_inter.c`, `p_spec.c`, `p_switch.c` | [`src/game/`](src/game/), triggers | Partial |
| `p_enemy.c`, `info.c` | [`src/ai/EnemyStates.ts`](src/ai/EnemyStates.ts), [`src/game/mobjinfoMotion.ts`](src/game/mobjinfoMotion.ts) | Partial (speeds / attacks tightened) |
| `p_pspr.c` | [`src/weapons/`](src/weapons/) | Partial |
| `p_doors.c`, `p_plats.c`, `p_ceilng.c`, `p_floor.c`, `p_lights.c` | doors / platforms / sectors | Partial |
| `p_saveg.c` | (if present under `src/`) | Partial / missing |
| `r_bsp.c`, `r_main.c`, `r_segs.c`, `r_plane.c`, `r_things.c` | [`src/renderer/BSPRenderer.ts`](src/renderer/BSPRenderer.ts), [`LevelRenderer.ts`](src/renderer/LevelRenderer.ts), etc. | Three.js replacement (not column renderer) |
| `s_sound.c`, `i_sound.c` | [`src/audio/SoundManager.ts`](src/audio/SoundManager.ts) | Partial |
| `st_stuff.c`, `st_lib.c` | UI / HUD modules | Partial |
| `w_wad.c` | [`src/wad/WADReader.ts`](src/wad/WADReader.ts) | Partial |

## Tests

- RNG golden sequence: [`src/core/random.test.ts`](src/core/random.test.ts)
- Fixed-point spot checks: [`src/core/fixed.test.ts`](src/core/fixed.test.ts)

## Audio / input / UI

- SFX: [`src/audio/SoundManager.ts`](src/audio/SoundManager.ts) — up to **8** concurrent voices (approx. hardware mix), optional **2D pan + distance** (`SoundSpatial`) from `s_sound.c` clipping distance.
- Input: [`src/input/InputManager.ts`](src/input/InputManager.ts) — `vanillaDoom` (default **true**); only non-vanilla ticcmd flags use **Q** for `Button.JUMP` when `vanillaDoom === false`.
- Status HUD: [`src/ui/StatusBar.ts`](src/ui/StatusBar.ts) / `stFace` track linuxdoom cues; episode **finale** (`f_finale.c`) is not ported.

## Pixel-exact video (optional future)

For literal DOS framebuffer parity, port `r_main.c`–`r_things.c` and `v_video.c` (e.g. WASM/TS), output 320×200 RGBA, and use Three.js or canvas as a blit surface only. See **[docs/SOFTWARE_RENDERER_PLAN.md](docs/SOFTWARE_RENDERER_PLAN.md)** for a concrete work breakdown.
