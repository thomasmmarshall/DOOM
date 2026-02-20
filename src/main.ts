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
import { LevelRenderer } from './renderer';
import { doomToThree, doomAngleToThree, doomAngleToThreeRadians, initTables, GameTicker, TICRATE, IntToFixed, FixedToFloat, DegreesToAngle } from './core';
import { InputManager } from './input';
import { createPlayerMobj, type Mobj } from './game';
import { movePlayer, applyFriction, applyGravity, applyZMomentum, calculateViewZ, applyCollision } from './physics';
import type { MapData } from './level';

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

  constructor() {
    // Initialize trigonometry tables
    initTables();

    // Initialize input manager
    this.inputManager = new InputManager();
    // Initialize three.js scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(
      75, // FOV - DOOM's FOV is about 73.74 degrees
      window.innerWidth / window.innerHeight,
      1,
      10000
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
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

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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

      // Create level renderer
      this.updateInfo(`Building ${mapName} geometry...`);
      this.levelRenderer = new LevelRenderer(this.scene, wad, rgbaPalette, this.mapData);

      // Add sky
      this.levelRenderer.addSky(wad, rgbaPalette);

      // Build level geometry
      this.levelRenderer.buildLevel();

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
          this.updateInfo(`${mapName} - Physics active. WASD to move, mouse to look.`);
        } else if (e.code === 'KeyF') {
          this.useOrbitControls = !this.useOrbitControls;
          this.controls.enabled = this.useOrbitControls;
          if (!this.useOrbitControls && this.playerMobj) {
            this.inputManager.requestPointerLock();
          }
          console.log(`${this.useOrbitControls ? 'Orbit controls' : 'First-person mode'} enabled`);
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

    // Log every second
    if (this.tickCount % TICRATE === 0) {
      const x = FixedToFloat(this.playerMobj.x);
      const y = FixedToFloat(this.playerMobj.y);
      const z = FixedToFloat(this.playerMobj.z);
      console.log(`Tick ${tick}: Player at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
    }

    // TODO: In later phases:
    // - Thing collision
    // - Enemy AI
    // - Weapon fire
    // - Sector effects
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

    // Render scene
    this.renderer.render(this.scene, this.camera);
  };
}

// Initialize the game when DOM is ready
const game = new DoomGame();
game.start();
game.init();
