# Software renderer path (pixel-exact option)

If Three.js/WebGL must match the DOS column buffer, add a **second raster path** driven by the same simulation:

1. **Port** `r_main.c`, `r_bsp.c`, `r_segs.c`, `r_plane.c`, `r_things.c`, `r_draw.c`, `v_video.c` to TypeScript or WASM (fixed 320×200 RGBA or 8-bit indexed + PLAYPAL blit).
2. **Feed** the same `vertexes` / `nodes` / `subsectors` / `segs` the game already parses; reuse `P_*` simulation from TS or share state at tick boundaries.
3. **Display** the framebuffer as a single `THREE.DataTexture` fullscreen quad (or 2D canvas), with integer scale and `NearestFilter`.
4. **Validate** against `.lmp` demo hashes or per-frame buffer dumps vs Chocolate Doom.

Three.js remains useful for menus, browser input, and asset loading; the 3D scene graph can be disabled when this mode is active.
