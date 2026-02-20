/**
 * DOOM three.js - Main Entry Point
 *
 * This is the entry point for the DOOM three.js port.
 * Initializes the renderer, loads WAD files, and starts the game loop.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { loadWAD } from './demo';
import { MapParser } from './level';
import { PaletteLoader } from './graphics';
import { LevelRenderer, WeaponRenderer } from './renderer';
import { doomToThree, doomAngleToThree, doomAngleToThreeRadians, initTables, GameTicker, TICRATE, IntToFixed, FixedToFloat, DegreesToAngle } from './core';
import { InputManager } from './input';
import { createPlayerMobj, type Mobj, MobjFlags, ThinkerManager, TriggerSystem } from './game';
import { movePlayer, applyFriction, applyGravity, applyZMomentum, calculateViewZ, applyCollision } from './physics';
import type { MapData } from './level';
import { DoorManager, PlatformManager } from './sectors';
import { StatusBar, type PlayerStats } from './ui';
import { createPlayerWeapon, updateWeapon, fireWeapon, switchWeapon, WeaponType, performHitscan, WEAPON_INFO } from './weapons/WeaponSystem';
import { damageActor, WeaponDamage } from './game/Damage';
import { tryPickupItem, checkItemCollision } from './game/Pickups';

class DoomGame {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private infoElement: HTMLElement;
  private levelRenderer?: LevelRenderer;
  private ticker?: GameTicker;
  private inputManager: InputManager;
  private tickCount: number = 0;
  private playerMobj?: Mobj;
  private useOrbitControls: boolean = true;
  private mapData?: MapData;
  private thinkerManager: ThinkerManager;
  private doorManager?: DoorManager;
  private platformManager?: PlatformManager;
  private triggerSystem?: TriggerSystem;
  private weaponRenderer?: WeaponRenderer;
  private statusBar?: StatusBar;

  constructor() {
    // Initialize trigonometry tables
    initTables();

    // Initialize thinker manager
    this.thinkerManager = new ThinkerManager();

    // Initialize input manager
    this.inputManager = new InputManager();
    // Initialize three.js scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // DOOM's original aspect ratio was 4:3 (320x200 stretched to 4:3 CRT)
    // FOV is approximately 73.74 degrees horizontal
    this.camera = new THREE.PerspectiveCamera(
      73.74, // DOOM's horizontal FOV
      4 / 3, // 4:3 aspect ratio like original DOOM
      1,
      10000
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(1); // Pixel-perfect rendering like DOOM

    // Calculate viewport size maintaining 4:3 aspect ratio
    this.updateRendererSize();
    document.body.appendChild(this.renderer.domElement);

    // Set up orbit controls for camera navigation
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 5000;

    // Get info element
    this.infoElement = document.getElementById('info')!;

    // Handle window resize
    window.addEventListener('resize', () => this.onResize());

    // Update info
    this.updateInfo('DOOM three.js - Loading...');
  }

  /**
   * Update renderer size maintaining 4:3 aspect ratio
   */
  private updateRendererSize(): void {
    const windowAspect = window.innerWidth / window.innerHeight;
    const targetAspect = 4 / 3;

    let width, height;

    if (windowAspect > targetAspect) {
      // Window is wider - pillarbox (black bars on sides)
      height = window.innerHeight;
      width = height * targetAspect;
    } else {
      // Window is taller - letterbox (black bars on top/bottom)
      width = window.innerWidth;
      height = width / targetAspect;
    }

    this.renderer.setSize(width, height);

    // Center the canvas
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.left = `${(window.innerWidth - width) / 2}px`;
    this.renderer.domElement.style.top = `${(window.innerHeight - height) / 2}px`;
  }

  private onResize(): void {
    this.updateRendererSize();
    this.camera.updateProjectionMatrix();
  }

  private updateInfo(text: string): void {
    this.infoElement.textContent = text;
  }

  public async init(): Promise<void> {
    try {
      this.updateInfo('Loading WAD file...');

      // Load WAD
      const wad = await loadWAD('/DOOM.WAD');
      console.log('WAD loaded successfully');

      // Load palette
      const playpalData = wad.readLump('PLAYPAL');
      if (!playpalData) {
        throw new Error('PLAYPAL not found');
      }
      const palette = PaletteLoader.loadPalette(playpalData);
      const rgbaPalette = PaletteLoader.paletteToRGBA(palette, 255);

      // Find first map
      const maps = wad.findMapLumps();
      if (maps.length === 0) {
        throw new Error('No maps found in WAD');
      }

      const mapName = maps[0];
      this.updateInfo(`Parsing ${mapName}...`);

      // Parse map
      const mapLumps = wad.getMapLumps(mapName);
      if (!mapLumps) {
        throw new Error(`Map ${mapName} not found`);
      }

      this.mapData = MapParser.parseMap(mapName, mapLumps, wad);
      console.log(`Parsed ${mapName}`);

      // Create level renderer (need this first for callbacks)
      this.updateInfo(`Building ${mapName} geometry...`);
      this.levelRenderer = new LevelRenderer(this.scene, wad, rgbaPalette, this.mapData);

      // Create weapon renderer and HUD
      this.weaponRenderer = new WeaponRenderer(wad, rgbaPalette);
      this.statusBar = new StatusBar(wad, rgbaPalette);
      await this.statusBar.init();

      // Initialize sector managers with renderer callbacks
      this.doorManager = new DoorManager(
        this.mapData,
        (sectorIndex, newHeight) => this.levelRenderer?.updateSectorCeiling(sectorIndex, newHeight)
      );
      this.platformManager = new PlatformManager(
        this.mapData,
        (sectorIndex, newHeight) => this.levelRenderer?.updateSectorFloor(sectorIndex, newHeight)
      );
      this.triggerSystem = new TriggerSystem(this.mapData, this.doorManager, this.platformManager);

      // Continue with level building

      // Add sky
      this.levelRenderer.addSky(wad, rgbaPalette);

      // Build level geometry (async - loads textures)
      await this.levelRenderer.buildLevel();

      // Create player mobj at player start
      const playerStart = this.levelRenderer.getPlayerStart();
      if (playerStart) {
        const x = IntToFixed(playerStart.x);
        const y = IntToFixed(playerStart.y);
        const z = IntToFixed(playerStart.z);
        const angle = DegreesToAngle(playerStart.angle);

        this.playerMobj = createPlayerMobj(x, y, z, angle);

        // Set proper floor and ceiling heights from sector
        this.playerMobj.floorz = IntToFixed(playerStart.floorz);
        this.playerMobj.ceilingz = IntToFixed(playerStart.ceilingz);

        // Initialize player weapon
        if (this.playerMobj.player) {
          this.playerMobj.player.weapon = createPlayerWeapon();
        }

        console.log(`Player created at (${playerStart.x}, ${playerStart.y}, ${playerStart.z}) angle ${playerStart.angle}°`);
        console.log(`Floor: ${playerStart.floorz}, Ceiling: ${playerStart.ceilingz}`);

        // Position camera at player
        this.updateCamera();
      } else {
        // Default camera position
        this.camera.position.set(0, 100, 0);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
      }

      this.updateInfo(`${mapName} loaded! Press F to toggle first-person mode. WASD to move, mouse to look. Press P to start physics.`);
      console.log('Level rendering complete');

      // Set up ticker (but don't start it yet - user can press P to start)
      this.ticker = new GameTicker((tick) => this.gameTick(tick));

      // Add key listeners
      window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyP' && this.ticker) {
          this.ticker.start();
          console.log('Game ticker started');
          this.updateInfo(`${mapName} - Physics active. WASD to move, mouse to look, SPACE to use, 1-7 weapons, CTRL to fire.`);
        } else if (e.code === 'KeyF') {
          this.useOrbitControls = !this.useOrbitControls;
          this.controls.enabled = this.useOrbitControls;
          if (!this.useOrbitControls && this.playerMobj) {
            this.inputManager.requestPointerLock();
          }
          console.log(`${this.useOrbitControls ? 'Orbit controls' : 'First-person mode'} enabled`);
        } else if (e.code === 'Space' && this.playerMobj && this.triggerSystem) {
          // Use action - find nearest usable line
          this.tryUseAction();
        } else if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
          // Fire weapon
          this.firePlayerWeapon();
        } else if (e.code.startsWith('Digit') && this.playerMobj?.player?.weapon) {
          // Weapon switching (1-7)
          const digit = parseInt(e.code.substring(5));
          if (digit >= 1 && digit <= 7) {
            const weaponType = digit - 1; // Convert to WeaponType enum (0-6)
            switchWeapon(this.playerMobj.player.weapon, weaponType);
            console.log(`Switching to weapon ${digit}`);
          }
        }
      });

      // Add mouse click for weapon firing
      window.addEventListener('mousedown', (e) => {
        if (e.button === 0 && !this.useOrbitControls) {
          // Left click - fire weapon
          this.firePlayerWeapon();
        }
      });
    } catch (error) {
      console.error('Error initializing game:', error);
      this.updateInfo(`Error: ${error}`);
    }
  }

  /**
   * Game tick - runs at 35 Hz
   */
  private gameTick(tick: number): void {
    this.tickCount++;

    if (!this.playerMobj || !this.mapData) return;

    // Save old position for walk trigger detection
    const oldX = FixedToFloat(this.playerMobj.x);
    const oldY = FixedToFloat(this.playerMobj.y);

    // Get input for this tick
    const cmd = this.inputManager.buildTicCmd();

    // Apply player movement
    movePlayer(this.playerMobj, cmd);

    // Apply friction
    applyFriction(this.playerMobj);

    // Apply gravity
    applyGravity(this.playerMobj);

    // Apply XY momentum with collision detection
    applyCollision(this.playerMobj, this.mapData);

    // Apply Z momentum
    applyZMomentum(this.playerMobj);

    // Check for item pickups
    const allMobjs = this.thinkerManager.getAllMobjs();
    for (const item of allMobjs) {
      // Skip non-special items
      if (!(item.flags & MobjFlags.SPECIAL)) continue;

      // Check collision with player
      if (checkItemCollision(this.playerMobj, item)) {
        tryPickupItem(item, this.playerMobj);
      }
    }

    // Check for walk triggers (lines crossed by player movement)
    if (this.triggerSystem) {
      this.triggerSystem.checkWalkTriggers(this.playerMobj, oldX, oldY);
    }

    // Run all thinkers (enemies, projectiles, etc.)
    this.thinkerManager.runThinkers();

    // Update doors and platforms
    if (this.doorManager) {
      this.doorManager.updateDoors();
    }
    if (this.platformManager) {
      this.platformManager.updatePlatforms();
    }

    // Update player weapon state
    if (this.playerMobj.player?.weapon) {
      updateWeapon(this.playerMobj.player.weapon);
    }

    // Update HUD
    if (this.statusBar && this.playerMobj.player) {
      const stats: PlayerStats = {
        health: this.playerMobj.health,
        armor: 0, // TODO: Add armor to player state
        ammo: this.playerMobj.player.ammo?.bullets || 0,
        maxAmmo: 200,
        keys: {
          blueCard: false,
          yellowCard: false,
          redCard: false,
          blueSkull: false,
          yellowSkull: false,
          redSkull: false,
        },
        weapons: [true, true, false, false, false, false, false], // Have fist and pistol
        currentWeapon: this.playerMobj.player.weapon?.currentWeapon || 0,
        face: 0,
      };
      this.statusBar.render(stats);
    }

    // Log every second
    if (this.tickCount % TICRATE === 0) {
      const x = FixedToFloat(this.playerMobj.x);
      const y = FixedToFloat(this.playerMobj.y);
      const z = FixedToFloat(this.playerMobj.z);
      const thinkerCount = this.thinkerManager.getCount();
      console.log(`Tick ${tick}: Player at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) | Thinkers: ${thinkerCount}`);
    }
  }

  /**
   * Fire player weapon
   */
  private firePlayerWeapon(): void {
    if (!this.playerMobj?.player?.weapon) return;

    const weapon = this.playerMobj.player.weapon;
    const success = fireWeapon(weapon, this.playerMobj);

    if (success) {
      // Get all mobjs from thinker manager
      const allMobjs = this.thinkerManager.getAllMobjs();

      // Perform hitscan for applicable weapons
      const weaponInfo = WEAPON_INFO.get(weapon.currentWeapon);
      if (!weaponInfo) return;

      // Calculate firing angle (convert from DOOM angle to radians)
      const fireAngle = doomAngleToThreeRadians(this.playerMobj.angle);

      // Perform hitscan based on weapon type
      if (weapon.currentWeapon === WeaponType.PISTOL) {
        const damage = WeaponDamage.PISTOL();
        const result = performHitscan(this.playerMobj, fireAngle, damage, 0, allMobjs);

        if (result?.hit && result.target) {
          damageActor(result.target, result.damage, this.playerMobj);
          console.log(`Pistol hit for ${result.damage} damage!`);
        }

        // Consume ammo
        if (this.playerMobj.player.ammo) {
          this.playerMobj.player.ammo.bullets = Math.max(0, this.playerMobj.player.ammo.bullets - 1);
        }
      } else if (weapon.currentWeapon === WeaponType.SHOTGUN) {
        // Shotgun fires 7 pellets
        let hits = 0;
        for (let i = 0; i < 7; i++) {
          const damage = WeaponDamage.SHOTGUN_PELLET();
          const spread = 0.1; // Some spread for shotgun
          const result = performHitscan(this.playerMobj, fireAngle, damage, spread, allMobjs);

          if (result?.hit && result.target) {
            damageActor(result.target, result.damage, this.playerMobj);
            hits++;
          }
        }

        if (hits > 0) {
          console.log(`Shotgun hit with ${hits}/7 pellets!`);
        }

        // Consume ammo
        if (this.playerMobj.player.ammo) {
          this.playerMobj.player.ammo.shells = Math.max(0, (this.playerMobj.player.ammo.shells || 0) - 1);
        }
      } else if (weapon.currentWeapon === WeaponType.CHAINGUN) {
        const damage = WeaponDamage.CHAINGUN();
        const result = performHitscan(this.playerMobj, fireAngle, damage, 0.02, allMobjs);

        if (result?.hit && result.target) {
          damageActor(result.target, result.damage, this.playerMobj);
          console.log(`Chaingun hit for ${result.damage} damage!`);
        }

        // Consume ammo
        if (this.playerMobj.player.ammo) {
          this.playerMobj.player.ammo.bullets = Math.max(0, this.playerMobj.player.ammo.bullets - 1);
        }
      } else if (weapon.currentWeapon === WeaponType.FIST) {
        // Melee attack - check close range
        const meleeRange = 64; // DOOM's melee range
        const damage = WeaponDamage.FIST();

        // Find closest enemy in melee range
        let closestDist = meleeRange;
        let closestTarget: typeof allMobjs[0] | undefined;

        for (const target of allMobjs) {
          if (target === this.playerMobj) continue;
          if (!(target.flags & 0x4)) continue; // MobjFlags.SHOOTABLE
          if (target.health <= 0) continue;

          const dx = FixedToFloat(target.x - this.playerMobj.x);
          const dy = FixedToFloat(target.y - this.playerMobj.y);
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < closestDist) {
            closestDist = dist;
            closestTarget = target;
          }
        }

        if (closestTarget) {
          damageActor(closestTarget, damage, this.playerMobj);
          console.log(`Fist hit for ${damage} damage!`);
        }
      }
    }
  }

  /**
   * Try to use/activate a line (spacebar)
   */
  private tryUseAction(): void {
    if (!this.playerMobj || !this.triggerSystem || !this.mapData) return;

    const px = FixedToFloat(this.playerMobj.x);
    const py = FixedToFloat(this.playerMobj.y);

    // Find nearest usable line within range
    let nearestLine = -1;
    let nearestDist = 64; // Use range

    for (let i = 0; i < this.mapData.linedefs.length; i++) {
      const line = this.mapData.linedefs[i];
      if (line.special === 0) continue;

      const v1 = this.mapData.vertexes[line.v1];
      const v2 = this.mapData.vertexes[line.v2];

      // Calculate distance to line
      const dx = v2.x - v1.x;
      const dy = v2.y - v1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;

      // Project player position onto line
      const t = Math.max(0, Math.min(1, ((px - v1.x) * dx + (py - v1.y) * dy) / (len * len)));
      const projX = v1.x + t * dx;
      const projY = v1.y + t * dy;

      const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestLine = i;
      }
    }

    if (nearestLine >= 0) {
      const success = this.triggerSystem.useLine(this.playerMobj, nearestLine);
      if (success) {
        console.log(`Activated line ${nearestLine} (special ${this.mapData.linedefs[nearestLine].special})`);
      }
    }
  }

  /**
   * Update camera to follow player
   */
  private updateCamera(): void {
    if (!this.playerMobj) return;

    // Calculate view position with bobbing
    const viewZ = calculateViewZ(this.playerMobj);

    // Convert to three.js coordinates
    const pos = doomToThree(
      FixedToFloat(this.playerMobj.x),
      FixedToFloat(this.playerMobj.y),
      FixedToFloat(viewZ)
    );

    if (this.useOrbitControls) {
      // Orbit mode - position camera above and behind player
      this.controls.target.copy(pos);
      this.controls.update();
    } else {
      // First-person mode
      this.camera.position.copy(pos);

      // Look direction from player angle (BAM to radians)
      // DOOM coordinates: angle 0 = East, 90° = North
      // three.js: We need to point the camera direction
      const angleRad = doomAngleToThreeRadians(this.playerMobj.angle);

      // Calculate look target
      // In DOOM/three.js conversion: X stays X, Y becomes -Z
      const lookTarget = pos.clone();
      lookTarget.x += Math.cos(angleRad) * 100;
      lookTarget.z -= Math.sin(angleRad) * 100; // Note: subtract because of coordinate flip

      this.camera.lookAt(lookTarget);
    }
  }

  public start(): void {
    this.animate();
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    // Update controls (only if enabled)
    if (this.useOrbitControls) {
      this.controls.update();
    }

    // Update camera to follow player
    if (!this.useOrbitControls && this.playerMobj) {
      this.updateCamera();
    }

    // Update BSP visibility based on player/camera position
    if (this.levelRenderer && this.playerMobj) {
      const x = FixedToFloat(this.playerMobj.x);
      const y = FixedToFloat(this.playerMobj.y);
      this.levelRenderer.updateVisibility(x, y, this.camera.position);
    }

    // Update weapon every frame (not just in game tick)
    if (this.weaponRenderer && this.playerMobj?.player?.weapon) {
      const bob = FixedToFloat(this.playerMobj.player.bob);
      this.weaponRenderer.update(this.playerMobj.player.weapon, bob);
    }

    // Render scene
    this.renderer.render(this.scene, this.camera);

    // Render weapon overlay (in first-person mode only)
    if (!this.useOrbitControls && this.weaponRenderer) {
      this.weaponRenderer.render(this.renderer);
    }
  };
}

// Initialize the game when DOM is ready
const game = new DoomGame();
game.start();
game.init();
