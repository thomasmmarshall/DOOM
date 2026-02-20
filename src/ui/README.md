# UI Module

User interface components for DOOM three.js port.

## Components

### StatusBar ✅ (Phase 8)
Heads-up display (HUD) that shows player stats at the bottom of the screen.

**Features:**
- Health display (red numbers)
- Armor display (green numbers)
- Ammo count (yellow numbers)
- Current weapon indicator
- Key indicators (blue, yellow, red)
- Face indicator (placeholder for now)

**Usage:**
```typescript
const statusBar = new StatusBar(wad, palette);
await statusBar.init();

// Update every game tick
const stats: PlayerStats = {
  health: 100,
  armor: 0,
  ammo: 50,
  maxAmmo: 200,
  keys: { blueCard: false, yellowCard: false, ... },
  weapons: [true, true, false, false, false, false, false],
  currentWeapon: 1,
  face: 0,
};
statusBar.render(stats);
```

## Planned Components

- **Automap** (Phase 12): 2D overhead map view with line colors, player position, and zoom/pan controls
- **MenuSystem** (Phase 13): Title screen, episode/skill selection, save/load menus
- **Intermission** (Phase 13): End-of-level statistics screen with kills/items/secrets percentages
