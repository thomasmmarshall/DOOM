# Quick Start Guide

Get DOOM running in three.js in 3 steps!

## Prerequisites

- Node.js 18+ installed
- A modern web browser (Chrome, Firefox, Safari, Edge)

## Setup & Run

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev

# 3. Open in browser
# The server will tell you the URL (usually http://localhost:5173)
```

## Controls

### Initial View (Orbit Mode)
- **Mouse drag** - Rotate camera around the level
- **Scroll wheel** - Zoom in/out
- **F key** - Toggle to first-person mode

### First-Person Mode
- **F key** - Toggle back to orbit mode
- **P key** - Start physics (enables movement)
- **WASD** - Move forward/backward/strafe
- **Mouse** - Look around (auto locks pointer)
- **ESC** - Release mouse pointer

## What You'll See

The application loads **DOOM Episode 1, Mission 1 (E1M1)** - the iconic "Hangar" level.

1. **At startup**: Level loads and renders in 3D
   - Orbit camera mode active
   - All walls, floors, ceilings visible
   - Textures and lighting applied
   - Sky rendered

2. **Press F**: Enter first-person mode
   - Camera positioned at player start
   - Looking in player start direction

3. **Press P**: Physics activates
   - Game ticker starts (35 Hz)
   - Movement enabled
   - DOOM-authentic physics active

## Game Info Display

Top-left corner shows current status:
- Map name
- Controls hint
- Physics status

## Technical Details

- **Rendering**: 60 FPS (three.js WebGL)
- **Physics**: 35 Hz fixed tick rate (DOOM accurate)
- **Coordinate system**: DOOM → three.js conversion
- **Movement**: Thrust-based with friction/gravity
- **Note**: Collision detection not yet implemented (you can walk through walls)

## Troubleshooting

**"Error: PLAYPAL not found"**
- Make sure `public/DOOM.WAD` exists
- The WAD should be 4.0 MB for shareware version

**Game doesn't start**
- Check browser console (F12) for errors
- Verify Node.js version: `node --version` (should be 18+)

**Mouse doesn't lock in first-person**
- Click anywhere in the browser window first
- Some browsers require user interaction before pointer lock

**Movement doesn't work**
- Make sure you pressed **P** to start physics
- Must be in first-person mode (**F** key)

## Next Steps

Want to explore other levels? The shareware WAD includes:
- E1M1 - Hangar
- E1M2 - Nuclear Plant
- E1M3 - Toxin Refinery
- E1M4 - Command Control
- E1M5 - Phobos Lab
- E1M6 - Central Processing
- E1M7 - Computer Station
- E1M8 - Phobos Anomaly
- E1M9 - Military Base (secret)

Edit `src/main.ts` to change the map that loads (search for `mapName`).

## Have Fun!

You're playing DOOM rendered in modern WebGL with three.js while maintaining the original game's physics engine. Pretty cool, right?
