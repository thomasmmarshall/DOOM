/**
 * DOOM three.js - Main Entry Point
 *
 * This is the entry point for the DOOM three.js port.
 * Initializes the renderer, loads WAD files, and starts the game loop.
 */

import * as THREE from 'three';
import { runPhase0Demo } from './demo';

class DoomGame {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private infoElement: HTMLElement;

  constructor() {
    // Initialize three.js scene
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75, // FOV - DOOM's FOV is about 73.74 degrees
      window.innerWidth / window.innerHeight,
      0.1,
      10000
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(this.renderer.domElement);

    // Get info element
    this.infoElement = document.getElementById('info')!;

    // Set up basic scene
    this.setupScene();

    // Handle window resize
    window.addEventListener('resize', () => this.onResize());

    // Update info
    this.updateInfo('DOOM three.js initialized. Phase 0: Ready to load WAD files.');
  }

  private setupScene(): void {
    // Add basic lighting for testing
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(ambientLight);

    // Position camera
    this.camera.position.set(0, 56, 0); // 56 units = DOOM player height
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
      // Run Phase 0 demo - load and parse WAD
      this.updateInfo('Phase 0: Loading WAD file...');
      await runPhase0Demo('/DOOM.WAD');
      this.updateInfo('Phase 0 Complete! Check console for details.');
    } catch (error) {
      console.error('Error loading WAD:', error);
      this.updateInfo(`Error: ${error}`);
    }
  }

  public start(): void {
    this.animate();
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  }
}

// Initialize the game when DOM is ready
const game = new DoomGame();
game.start();
game.init();
