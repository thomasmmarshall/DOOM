# DOOM · Three.js · TypeScript

A **DOOM-style engine in the browser**: not a port line-by-line, but a **gradual rebuild** inspired by id’s original DOOM source. It loads **real IWAD data**—levels, textures, flats, palette—through a proper **WAD pipeline**, and draws everything with **Three.js** while the simulation runs in **TypeScript**.

The goal is the same game *under the hood* (fixed math, tic timing, movement, BSP visibility, etc.) with a **modern WebGL renderer** instead of the classic software renderer.

## Status

Core loop and mechanics are in place and **playable**; the project is still **rough in places**—expect bugs and incomplete features. For linuxdoom parity status and subsystem mapping, see **[AUTHENTICITY.md](AUTHENTICITY.md)**.

## How it’s built

Development has been **heavily AI-assisted**: **Claude Code** and **Cursor** for exploration and refactors; **Cursor Composer** (especially the fast model) has been standout for iterating quickly on TypeScript and renderer work. The architecture and tradeoffs are still grounded in the **original DOOM code** and community references—the LLMs accelerate implementation; they don’t replace reading the source.

**Stack:** Vite · TypeScript · Three.js · Vitest · shareware `DOOM.WAD` in `public/` (replace with your own IWAD as needed).

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). For controls and behavior, see **[QUICKSTART.md](QUICKSTART.md)**.

```bash
npm test          # Vitest
npm run build     # production build
```

## Repo layout (high level)

```
src/
  core/       fixed-point, angles, ticker
  wad/        WAD parse & lumps
  level/      map data, BSP, blockmap
  graphics/   patches, flats, palette
  renderer/   Three.js geometry, materials, culling
  game/       thinkers, mobjs, player
  physics/    movement, collision
  input/      keyboard & mouse
  …           ai, weapons, sectors, audio, ui (various stages)
```

## Technical notes

- **Coordinates:** DOOM `(x, y, z)` with z up maps to Three.js roughly as `(x, z, -y)` (y up in the browser).
- **Simulation:** Deterministic-style stepping (35 Hz tic, fixed-point style math where it matters for DOOM fidelity).
- **Assets:** Standard DOOM WAD lumps (vertices, linedefs, sectors, BSP, PLAYPAL, patches, flats, etc.).

## License

Based on **id Software’s DOOM source** ([DOOM Source Code License](https://github.com/id-Software/DOOM)). Original game Copyright © 1993–1996 id Software, Inc. This repository is an **educational / hobby** Three.js implementation—ensure you have rights to any WAD files you use.

## References

- [id-Software/DOOM](https://github.com/id-Software/DOOM) — original C source  
- [three.js docs](https://threejs.org/docs/)  
- [Doom Wiki](https://doomwiki.org/) — formats and behavior  
