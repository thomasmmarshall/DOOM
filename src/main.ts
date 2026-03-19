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
import { doomToThree, doomAngleToThreeRadians, initTables, GameTicker, TICRATE, IntToFixed, FixedToFloat, DegreesToAngle, FloatToFixed } from './core';
import { InputManager, Button } from './input';
import { createPlayerMobj, type Mobj, MobjFlags, ThinkerManager, TriggerSystem, ThingSpawner } from './game';
import { movePlayer, applyFriction, applyGravity, applyZMomentum, calculateViewZ, applyCollision } from './physics';
import type { MapData } from './level';
import { DoorManager, PlatformManager } from './sectors';
import { StatusBar, TitleScreen, BorderFrame, MainMenu, type PlayerStats } from './ui';
import { createPlayerWeapon, updateWeapon, fireWeapon, WeaponType, performHitscan, WEAPON_INFO, switchPlayerWeapon, canPlayerUseWeapon, consumeWeaponAmmo } from './weapons/WeaponSystem';
import { damageActor, WeaponDamage } from './game/Damage';
import { tryPickupItem, checkItemCollision } from './game/Pickups';
import { updateMonster } from './ai';
import { MusicPlayer, SoundManager } from './audio';

const DOOM_DISPLAY_ASPECT = 4 / 3;
const DOOM_INTERNAL_WIDTH = 320;
const DOOM_VIEW_HEIGHT = 168;  // 3D view area; status bar 32px below
const DOOM_HORIZONTAL_FOV = 73.74;

function horizontalToVerticalFov(horizontalFov: number, aspect: number): number {
  const horizontalRadians = THREE.MathUtils.degToRad(horizontalFov);
  const verticalRadians = 2 * Math.atan(Math.tan(horizontalRadians / 2) / aspect);
  return THREE.MathUtils.radToDeg(verticalRadians);
}

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
  private useOrbitControls: boolean = false;
  private mapData?: MapData;
  private thinkerManager: ThinkerManager;
  private doorManager?: DoorManager;
  private platformManager?: PlatformManager;
  private triggerSystem?: TriggerSystem;
  private weaponRenderer?: WeaponRenderer;
  private statusBar?: StatusBar;
  private soundManager?: SoundManager;
  private musicPlayer?: MusicPlayer;
  private previousButtons: number = 0;
  private visitedSecretSectors: Set<number> = new Set();
  private noiseOrigin?: { x: number; y: number };
  private sectorBaseLightLevels: number[] = [];
  private levelTime: number = 0;
  private playerDied: boolean = false;
  private gameContainer?: HTMLElement;
  private viewContainer?: HTMLElement;

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

    // DOOM view is 320x168; status bar 320x32 below.
    const viewAspect = DOOM_INTERNAL_WIDTH / DOOM_VIEW_HEIGHT;
    this.camera = new THREE.PerspectiveCamera(
      horizontalToVerticalFov(DOOM_HORIZONTAL_FOV, viewAspect),
      viewAspect,
      1,
      10000
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.imageRendering = 'pixelated';
    this.renderer.domElement.style.imageRendering = 'crisp-edges';

    this.gameContainer = document.createElement('div');
    this.gameContainer.id = 'game-container';
    this.gameContainer.style.cssText = 'position:absolute; display:flex; flex-direction:column; align-items:stretch;';
    document.body.appendChild(this.gameContainer);

    this.viewContainer = document.createElement('div');
    this.viewContainer.style.cssText = 'position:relative; flex:0 0 84%; width:100%; overflow:visible;';
    this.gameContainer.appendChild(this.viewContainer);
    this.viewContainer.appendChild(this.renderer.domElement);

    this.updateRendererSize();

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
    this.renderer.domElement.addEventListener('pointerdown', () => {
      void this.musicPlayer?.activate();
      // Request pointer lock on click (required when starting in first-person - browser needs user gesture)
      if (!this.useOrbitControls && this.playerMobj && !document.pointerLockElement) {
        this.inputManager.requestPointerLock();
      }
    });

    // Update info
    this.updateInfo('DOOM three.js - Loading...');
  }

  /**
   * Update renderer size maintaining 4:3 aspect ratio
   */
  private updateRendererSize(): void {
    const windowAspect = window.innerWidth / window.innerHeight;
    const targetAspect = DOOM_DISPLAY_ASPECT;

    let displayWidth: number;
    let displayHeight: number;

    if (windowAspect > targetAspect) {
      // Window is wider - pillarbox (black bars on sides)
      displayHeight = window.innerHeight;
      displayWidth = displayHeight * targetAspect;
    } else {
      // Window is taller - letterbox (black bars on top/bottom)
      displayWidth = window.innerWidth;
      displayHeight = displayWidth / targetAspect;
    }

    this.renderer.setSize(DOOM_INTERNAL_WIDTH, DOOM_VIEW_HEIGHT, false);
    const container = document.getElementById('game-container');
    if (container) {
      container.style.width = `${displayWidth}px`;
      container.style.height = `${displayHeight}px`;
      container.style.left = `${(window.innerWidth - displayWidth) / 2}px`;
      container.style.top = `${(window.innerHeight - displayHeight) / 2}px`;
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
    }
  }

  private onResize(): void {
    this.updateRendererSize();
    this.camera.aspect = DOOM_INTERNAL_WIDTH / DOOM_VIEW_HEIGHT;
    this.camera.updateProjectionMatrix();
  }

  private updateInfo(text: string): void {
    this.infoElement.textContent = text;
  }

  private addWorldMobj(mobj: Mobj, thinker?: (mobj: Mobj) => void): void {
    this.thinkerManager.addThinker(mobj, thinker ?? (() => {}));
  }

  private spawnPuff(x: number, y: number, z: number): void {
    const puffFrames = ['A', 'B', 'C', 'D'];
    const puff: Mobj = {
      x: FloatToFixed(x),
      y: FloatToFixed(y),
      z: FloatToFixed(z),
      angle: 0,
      momx: 0,
      momy: 0,
      momz: IntToFixed(1),
      radius: IntToFixed(16),
      height: IntToFixed(16),
      floorz: FloatToFixed(z),
      ceilingz: FloatToFixed(z + 64),
      flags: 0,
      health: 1,
      type: 0,
      sprite: 'PUFF',
      frame: 'A',
      rotation: 0,
    };
    let tics = 16;
    this.addWorldMobj(puff, () => {
      tics--;
      puff.frame = puffFrames[Math.max(0, 4 - Math.ceil(tics / 4))] ?? 'D';
      puff.z += puff.momz;
      if (tics <= 0) puff.removed = true;
    });
  }

  private playDeathSound(type: number): void {
    const sound =
      type === 3001 ? 'impDeath' :
      type === 3002 ? 'demonDeath' :
      type === 9 ? 'shotgunGuyDeath' :
      type === 3004 ? 'zombieDeath' :
      'monsterDeath';
    this.soundManager?.play(sound, 0.5);
  }

  private handlePlayerDeath(): void {
    if (this.playerDied || !this.playerMobj?.player) {
      return;
    }

    this.playerDied = true;
    this.playerMobj.momx = 0;
    this.playerMobj.momy = 0;
    this.playerMobj.momz = 0;
    this.previousButtons = 0;
    this.ticker?.stop();
    this.controls.enabled = false;
    this.infoElement.style.display = 'block';
    this.updateInfo('You died. Press R to restart.');

    if (document.pointerLockElement) {
      void document.exitPointerLock();
    }
  }

  private spawnMapThings(skill: number = 3): void {
    if (!this.mapData) {
      return;
    }

    const spawner = new ThingSpawner();
    const spawnedThings = spawner.spawnThings(this.mapData, skill);

    for (const spawned of spawnedThings) {
      const thinker = spawned.mobj.countsTowardKill
        ? (mobj: Mobj) => {
            if (this.playerMobj && this.mapData) {
              updateMonster(mobj, this.playerMobj, this.mapData, this.noiseOrigin);
            }
          }
        : undefined;
      this.addWorldMobj(spawned.mobj, thinker);
    }

    this.levelRenderer?.syncWorldMobjs(this.thinkerManager.getAllMobjs());
  }

  private cleanupRemovedMobjs(): void {
    const mobjs = this.thinkerManager.getAllMobjs();
    for (const mobj of mobjs) {
      if (mobj.removed) {
        this.thinkerManager.removeThinkerByMobj(mobj);
      }
    }
  }

  private getCurrentAmmo(): number {
    if (!this.playerMobj?.player?.weapon || !this.playerMobj.player) {
      return 0;
    }

    const weaponInfo = WEAPON_INFO.get(this.playerMobj.player.weapon.currentWeapon);
    if (!weaponInfo?.ammoType) {
      return 0;
    }

    return this.playerMobj.player.ammo[weaponInfo.ammoType];
  }

  private getCurrentMaxAmmo(): number {
    if (!this.playerMobj?.player?.weapon || !this.playerMobj.player) {
      return 0;
    }

    const weaponInfo = WEAPON_INFO.get(this.playerMobj.player.weapon.currentWeapon);
    if (!weaponInfo?.ammoType) {
      return 0;
    }

    return this.playerMobj.player.maxAmmo[weaponInfo.ammoType];
  }

  private updateSectorSpecials(): void {
    if (!this.playerMobj?.player || !this.mapData) {
      return;
    }

    const sectorIndex = this.playerMobj.sectorIndex;
    if (typeof sectorIndex === 'number') {
      const sector = this.mapData.sectors[sectorIndex];
      if (this.playerMobj.z <= this.playerMobj.floorz) {
        if (sector.special === 7 && (this.levelTime & 0x1f) === 0 && !this.playerMobj.player.powerups.radsuit) {
          damageActor(this.playerMobj, 5);
          this.soundManager?.play('playerPain', 0.35);
        }

        if (sector.special === 9 && !this.visitedSecretSectors.has(sectorIndex)) {
          this.visitedSecretSectors.add(sectorIndex);
          this.playerMobj.player.message = 'A secret is revealed!';
          this.playerMobj.player.bonusCount = 10;
        }
      }
    }

    for (let i = 0; i < this.mapData.sectors.length; i++) {
      const base = this.sectorBaseLightLevels[i] ?? this.mapData.sectors[i].lightlevel;
      const sector = this.mapData.sectors[i];
      let nextLight = base;

      switch (sector.special) {
        case 1:
          nextLight = (this.levelTime % 16) < 2 ? Math.max(32, base - 96) : base;
          break;
        case 8:
          nextLight = (this.levelTime % 64) < 32 ? base : Math.max(32, base - 48);
          break;
        case 12:
          nextLight = (this.levelTime % 16) < 8 ? Math.max(32, base - 64) : base;
          break;
      }

      if (sector.lightlevel !== nextLight) {
        sector.lightlevel = nextLight;
        this.levelRenderer?.updateSectorLight(i, nextLight);
      }
    }

    for (const line of this.mapData.linedefs) {
      if (line.special === 48 && line.sidenum[0] !== -1) {
        this.mapData.sidedefs[line.sidenum[0]].textureoffset += 1;
      }
    }

    this.levelRenderer?.updateAnimatedWallOffsets();
  }

  public async init(): Promise<void> {
    try {
      this.updateInfo('Loading WAD file...');

      const wad = await loadWAD('/DOOM.WAD');
      console.log('WAD loaded successfully');

      const playpalData = wad.readLump('PLAYPAL');
      if (!playpalData) throw new Error('PLAYPAL not found');
      const palette = PaletteLoader.loadPalette(playpalData);
      const colormapData = wad.readLump('COLORMAP');
      if (!colormapData) throw new Error('COLORMAP not found');
      const colormap = PaletteLoader.loadColormap(colormapData);
      const rgbaPalette = PaletteLoader.paletteToRGBA(palette, 255);

      // Create audio for menu/splash (before level load)
      this.soundManager = new SoundManager(wad);
      this.musicPlayer = new MusicPlayer(wad);

      const titleScreen = new TitleScreen(
        wad,
        rgbaPalette,
        () => {
          titleScreen.hide();
          this.showMainMenu(wad, palette, colormap, rgbaPalette);
        },
        () => {
          this.musicPlayer?.prepareIntroMusic();
          void this.musicPlayer?.activate();
        }
      );
      await titleScreen.init();
      titleScreen.show();
      titleScreen.startRenderLoop();
      this.updateInfo('');
    } catch (error) {
      console.error('Error initializing game:', error);
      this.updateInfo(`Error: ${error}`);
    }
  }

  private showMainMenu(
    wad: Awaited<ReturnType<typeof loadWAD>>,
    palette: Uint8Array,
    colormap: Uint8Array,
    rgbaPalette: Uint8ClampedArray
  ): void {
    const mainMenu = new MainMenu(wad, rgbaPalette, {
      onStartGame: (episode: number, skill: number) => {
        mainMenu.hide();
        this.musicPlayer?.stop();
        const mapName = `E${episode}M1`;
        void this.loadLevel(wad, palette, colormap, rgbaPalette, mapName, skill);
      },
      onMenuSound: () => this.soundManager?.play('switch', 0.3),
    });
    mainMenu.init().then(() => {
      mainMenu.show();
      mainMenu.startRenderLoop();
    });
  }

  private async loadLevel(
    wad: Awaited<ReturnType<typeof loadWAD>>,
    palette: Uint8Array,
    colormap: Uint8Array,
    rgbaPalette: Uint8ClampedArray,
    mapName: string,
    skill: number = 3
  ): Promise<void> {
    try {
      const mapLumps = wad.getMapLumps(mapName);
      if (!mapLumps) {
        throw new Error(`Map ${mapName} not found`);
      }

      this.updateInfo(`Parsing ${mapName}...`);

      this.mapData = MapParser.parseMap(mapName, mapLumps, wad);
      console.log(`Parsed ${mapName}`);

      // Create level renderer (need this first for callbacks)
      this.updateInfo(`Building ${mapName} geometry...`);
      this.levelRenderer = new LevelRenderer(this.scene, wad, palette, colormap, this.mapData);

      // Create weapon renderer and HUD
      this.weaponRenderer = new WeaponRenderer(wad, rgbaPalette);
      this.statusBar = new StatusBar(wad, rgbaPalette, this.gameContainer);
      const borderFrame = new BorderFrame(wad, rgbaPalette);
      await borderFrame.init();
      if (this.viewContainer) {
        const borderCanvas = borderFrame.getCanvas();
        borderCanvas.style.position = 'absolute';
        borderCanvas.style.left = '-8px';
        borderCanvas.style.top = '-8px';
        this.viewContainer.appendChild(borderCanvas);
        borderFrame.render();
      }
      // soundManager and musicPlayer created in init()
      await this.statusBar.init();
      this.sectorBaseLightLevels = this.mapData.sectors.map((sector) => sector.lightlevel);
      this.musicPlayer?.prepareMapMusic(mapName);

      // Initialize sector managers with renderer callbacks
      this.doorManager = new DoorManager(
        this.mapData,
        (sectorIndex, oldHeight, newHeight) => this.levelRenderer?.updateSectorCeiling(sectorIndex, oldHeight, newHeight)
      );
      this.platformManager = new PlatformManager(
        this.mapData,
        (sectorIndex, oldHeight, newHeight) => this.levelRenderer?.updateSectorFloor(sectorIndex, oldHeight, newHeight)
      );
      this.triggerSystem = new TriggerSystem(this.mapData, this.doorManager, this.platformManager);

      // Continue with level building

      // Add sky
      this.levelRenderer.addSky();

      // Build level geometry (async - loads textures)
      await this.levelRenderer.buildLevel();
      this.spawnMapThings(skill);

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

      this.updateInfo(`${mapName} - WASD to move, mouse to look, SPACE to use, 1-7 weapons, CTRL to fire.`);
      this.infoElement.style.display = 'none';
      console.log('Level rendering complete');

      // Set up ticker and start immediately
      this.ticker = new GameTicker((tick) => this.gameTick(tick));
      this.ticker.start();

      // Start in first-person mode with pointer lock
      this.controls.enabled = false;
      if (this.playerMobj) {
        this.inputManager.requestPointerLock();
      }

      // Add key listeners
      window.addEventListener('keydown', (e) => {
        void this.musicPlayer?.activate();

        if (this.playerDied) {
          if (e.code === 'KeyR') {
            window.location.reload();
          }
          return;
        }

        if (e.code === 'KeyF') {
          this.useOrbitControls = !this.useOrbitControls;
          this.controls.enabled = this.useOrbitControls;
          if (!this.useOrbitControls && this.playerMobj) {
            this.inputManager.requestPointerLock();
            this.infoElement.style.display = 'none';
          }
          console.log(`${this.useOrbitControls ? 'Orbit controls' : 'First-person mode'} enabled`);
        } else if (e.code.startsWith('Digit') && this.playerMobj?.player?.weapon) {
          // Weapon switching (1-7)
          const digit = parseInt(e.code.substring(5));
          if (digit >= 1 && digit <= 7) {
            const weaponType = digit - 1; // Convert to WeaponType enum (0-6)
            if (switchPlayerWeapon(this.playerMobj, weaponType)) {
              console.log(`Switching to weapon ${digit}`);
            }
          }
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
    if (this.playerMobj.health <= 0) {
      this.handlePlayerDeath();
      return;
    }

    // Save old position for walk trigger detection
    const oldX = FixedToFloat(this.playerMobj.x);
    const oldY = FixedToFloat(this.playerMobj.y);

    // Get input for this tick
    const cmd = this.inputManager.buildTicCmd();

    if ((cmd.buttons & Button.USE) && !(this.previousButtons & Button.USE) && this.triggerSystem) {
      this.tryUseAction();
    }

    if ((cmd.buttons & Button.ATTACK) && !(this.previousButtons & Button.ATTACK)) {
      this.firePlayerWeapon();
    }

    this.previousButtons = cmd.buttons;

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
        const result = tryPickupItem(item, this.playerMobj);
        if (result.success) {
          this.soundManager?.play('pickup', 0.35);
        }
      }
    }

    this.cleanupRemovedMobjs();

    // Check for walk triggers (lines crossed by player movement)
    if (this.triggerSystem) {
      this.triggerSystem.checkWalkTriggers(this.playerMobj, oldX, oldY);
    }

    // Save player health before enemies act (for damage feedback)
    const healthBeforeThinkers = this.playerMobj.health;

    // Run all thinkers (enemies, projectiles, etc.)
    this.thinkerManager.runThinkers();
    this.noiseOrigin = undefined;

    // Play pain sound when player takes damage from enemies
    if (
      this.playerMobj.health > 0 &&
      this.playerMobj.health < healthBeforeThinkers
    ) {
      this.soundManager?.play('playerPain', 0.5);
    }

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

    this.updateSectorSpecials();

    if (this.playerMobj.health <= 0) {
      this.handlePlayerDeath();
    }

    if (this.playerMobj.player) {
      if (this.playerMobj.player.bonusCount > 0) {
        this.playerMobj.player.bonusCount--;
      } else if (this.playerMobj.player.message) {
        this.playerMobj.player.message = '';
      }

      for (const [powerup, duration] of Object.entries(this.playerMobj.player.powerups)) {
        if (duration > 0) {
          this.playerMobj.player.powerups[powerup] = duration - 1;
        }
      }
    }

    this.levelTime++; // Match DOOM: increment at end of tick (p_tick.c)

    this.levelRenderer?.syncWorldMobjs(this.thinkerManager.getAllMobjs());

    // Update HUD
    if (this.statusBar && this.playerMobj.player) {
      const stats: PlayerStats = {
        health: this.playerMobj.health,
        armor: this.playerMobj.player.armor,
        ammo: this.getCurrentAmmo(),
        maxAmmo: this.getCurrentMaxAmmo(),
        keys: this.playerMobj.player.keys,
        weapons: this.playerMobj.player.weapons,
        currentWeapon: this.playerMobj.player.weapon?.currentWeapon || 0,
        message: this.playerMobj.player.message,
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
    if (!this.playerMobj?.player?.weapon || !this.mapData) return;

    const weapon = this.playerMobj.player.weapon;
    if (!canPlayerUseWeapon(this.playerMobj, weapon.currentWeapon)) {
      return;
    }
    const success = fireWeapon(weapon, this.playerMobj);

    if (success) {
      this.noiseOrigin = {
        x: FixedToFloat(this.playerMobj.x),
        y: FixedToFloat(this.playerMobj.y),
      };
      if (weapon.currentWeapon === WeaponType.SHOTGUN) {
        this.soundManager?.play('shotgun', 0.45);
      } else if (weapon.currentWeapon === WeaponType.CHAINGUN) {
        this.soundManager?.play('chaingun', 0.35);
      } else if (weapon.currentWeapon === WeaponType.ROCKET_LAUNCHER) {
        this.soundManager?.play('rocket', 0.45);
      } else {
        this.soundManager?.play('pistol', 0.35);
      }

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
        const result = performHitscan(this.playerMobj, fireAngle, damage, 0, allMobjs, this.mapData);

        if (result?.hit && result.target) {
          const dmg = damageActor(result.target, result.damage, this.playerMobj);
          if (dmg.killed) this.playDeathSound(result.target.type);
          this.spawnPuff(result.hitPoint.x, result.hitPoint.y, result.hitPoint.z);
        } else if (result && !result.hit) {
          this.spawnPuff(result.hitPoint.x, result.hitPoint.y, result.hitPoint.z);
        }
        consumeWeaponAmmo(this.playerMobj, weapon.currentWeapon);
      } else if (weapon.currentWeapon === WeaponType.SHOTGUN) {
        // Shotgun fires 7 pellets
        let hits = 0;
        for (let i = 0; i < 7; i++) {
          const damage = WeaponDamage.SHOTGUN_PELLET();
          const spread = 0.1; // Some spread for shotgun
          const result = performHitscan(this.playerMobj, fireAngle, damage, spread, allMobjs, this.mapData);

          if (result?.hit && result.target) {
            const dmg = damageActor(result.target, result.damage, this.playerMobj);
            if (dmg.killed) this.playDeathSound(result.target.type);
            hits++;
            this.spawnPuff(result.hitPoint.x, result.hitPoint.y, result.hitPoint.z);
          }
        }

        if (hits > 0) {
          console.log(`Shotgun hit with ${hits}/7 pellets!`);
        }
        consumeWeaponAmmo(this.playerMobj, weapon.currentWeapon);
      } else if (weapon.currentWeapon === WeaponType.CHAINGUN) {
        const damage = WeaponDamage.CHAINGUN();
        const result = performHitscan(this.playerMobj, fireAngle, damage, 0.02, allMobjs, this.mapData);

        if (result?.hit && result.target) {
          const dmg = damageActor(result.target, result.damage, this.playerMobj);
          if (dmg.killed) this.playDeathSound(result.target.type);
          this.spawnPuff(result.hitPoint.x, result.hitPoint.y, result.hitPoint.z);
        } else if (result && !result.hit) {
          this.spawnPuff(result.hitPoint.x, result.hitPoint.y, result.hitPoint.z);
        }
        consumeWeaponAmmo(this.playerMobj, weapon.currentWeapon);
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
          const dmg = damageActor(closestTarget, damage, this.playerMobj);
          if (dmg.killed) this.playDeathSound(closestTarget.type);
        }
      } else if (weapon.currentWeapon === WeaponType.ROCKET_LAUNCHER) {
        const damage = WeaponDamage.ROCKET;
        const result = performHitscan(this.playerMobj, fireAngle, damage, 0, allMobjs, this.mapData);
        if (result?.hit && result.target) {
          const dmg = damageActor(result.target, result.damage, this.playerMobj);
          if (dmg.killed) this.playDeathSound(result.target.type);
          this.spawnPuff(result.hitPoint.x, result.hitPoint.y, result.hitPoint.z);
        } else if (result && !result.hit) {
          this.spawnPuff(result.hitPoint.x, result.hitPoint.y, result.hitPoint.z);
        }
        consumeWeaponAmmo(this.playerMobj, weapon.currentWeapon);
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
      const special = this.mapData.linedefs[nearestLine].special;
      const success = this.triggerSystem.useLine(this.playerMobj, nearestLine);
      if (success) {
        console.log(`Activated line ${nearestLine} (special ${special})`);
        this.soundManager?.play('switch', 0.3);
        if (special === 1) {
          this.soundManager?.play('doorOpen', 0.35);
        } else if (special === 11) {
          this.updateInfo('E1M1 complete. Exit switch activated.');
          this.ticker?.stop();
        }
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

    // Look direction from player angle (BAM to radians)
    // DOOM coordinates: angle 0 = East, 90° = North
    const angleRad = doomAngleToThreeRadians(this.playerMobj.angle);

    // In DOOM/three.js conversion: X stays X, Y becomes -Z
    const lookTarget = pos.clone();
    lookTarget.x += Math.cos(angleRad) * 100;
    lookTarget.z -= Math.sin(angleRad) * 100;

    if (this.useOrbitControls) {
      // Keep the orbit camera anchored near the player instead of whatever
      // position OrbitControls happened to initialize with.
      const orbitOffset = new THREE.Vector3(
        -Math.cos(angleRad) * 160,
        96,
        Math.sin(angleRad) * 160
      );
      this.camera.position.copy(pos.clone().add(orbitOffset));
      this.controls.target.copy(pos);
      this.controls.update();
    } else {
      // First-person mode
      this.camera.position.copy(pos);
      this.camera.lookAt(lookTarget);
    }
  }

  public start(): void {
    this.animate();
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    // Update camera to follow player in both first-person and orbit modes.
    if (this.playerMobj) {
      this.updateCamera();
    }

    // Update BSP visibility based on player/camera position
    if (this.levelRenderer && this.playerMobj) {
      const x = FixedToFloat(this.playerMobj.x);
      const y = FixedToFloat(this.playerMobj.y);
      this.levelRenderer.updateVisibility(x, y, this.camera.position);
      // Update sky to follow camera
      this.levelRenderer.updateSky(this.camera.position);
    }

    // Update weapon every frame (not just in game tick)
    if (this.weaponRenderer && this.playerMobj?.player?.weapon && !this.playerDied) {
      const bob = FixedToFloat(this.playerMobj.player.bob);
      this.weaponRenderer.update(this.playerMobj.player.weapon, bob);
    }

    // Render scene
    this.renderer.render(this.scene, this.camera);

    // Render weapon overlay (in first-person mode only)
    if (!this.useOrbitControls && this.weaponRenderer && !this.playerDied) {
      this.weaponRenderer.render(this.renderer);
    }
  };
}

// Initialize the game when DOM is ready
const game = new DoomGame();
game.start();
game.init();
