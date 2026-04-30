# AGENTS.md

## Cursor Cloud specific instructions

This is a frontend-only TypeScript/Three.js web app (DOOM engine reimplementation). No backend, database, or Docker services needed.

### Quick reference

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (port 5173) |
| Tests | `npx vitest run` |
| Type check | `npx tsc --noEmit` |
| Build | `npm run build` |

### Notes

- The `linuxdoom-1.10/`, `sndserv/`, `ipx/`, `sersrc/` directories are original id Software C reference code — not part of the build or runtime.
- The shareware `DOOM.WAD` is already in `public/` (~4 MB). The app won't start without it.
- Tests use `jsdom` environment and run headlessly — no browser needed for `vitest`.
- There is no ESLint configured; type checking via `tsc --noEmit` is the primary static analysis.
- The Vite dev server supports HMR; however, changes to core game loop modules may require a browser refresh.
