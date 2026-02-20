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
import { doomToThree, doomAngleToThree } from './core';

class DoomGame {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private infoElement: HTMLElement;
  private levelRenderer?: LevelRenderer;

  constructor() {
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

      const mapData = MapParser.parseMap(mapName, mapLumps, wad);
      console.log(`Parsed ${mapName}`);

      // Create level renderer
      this.updateInfo(`Building ${mapName} geometry...`);
      this.levelRenderer = new LevelRenderer(this.scene, wad, rgbaPalette, mapData);

      // Add sky
      this.levelRenderer.addSky(wad, rgbaPalette);

      // Build level geometry
      this.levelRenderer.buildLevel();

      // Position camera at player start
      const playerStart = this.levelRenderer.getPlayerStart();
      if (playerStart) {
        const cameraPos = doomToThree(playerStart.x, playerStart.y, playerStart.z);
        this.camera.position.copy(cameraPos);

        // Look in the direction of player start angle
        const angle = doomAngleToThree(playerStart.angle);
        const lookTarget = cameraPos.clone();
        lookTarget.x += Math.cos(angle) * 100;
        lookTarget.z += Math.sin(angle) * 100;
        this.controls.target.copy(lookTarget);
        this.controls.update();

        console.log(`Camera positioned at player start: ${cameraPos.x}, ${cameraPos.y}, ${cameraPos.z}`);
      } else {
        // Default camera position
        this.camera.position.set(0, 100, 0);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
      }

      this.updateInfo(`${mapName} loaded! Use mouse to look around, scroll to zoom.`);
      console.log('Level rendering complete');
    } catch (error) {
      console.error('Error initializing game:', error);
      this.updateInfo(`Error: ${error}`);
    }
  }

  public start(): void {
    this.animate();
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    // Update controls
    this.controls.update();

    // Render scene
    this.renderer.render(this.scene, this.camera);
  };
}

// Initialize the game when DOM is ready
const game = new DoomGame();
game.start();
game.init();
