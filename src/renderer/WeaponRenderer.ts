/**
 * Weapon Renderer
 * Renders first-person weapon sprites in screen space
 * Based on linuxdoom-1.10/r_draw.c weapon sprite rendering
 */

import * as THREE from 'three';
import type { WADReader } from '../wad';
import { PatchDecoder } from '../graphics';
import type { PlayerWeapon } from '../weapons/WeaponSystem';
import { WeaponType, WeaponState } from '../weapons/WeaponSystem';

/**
 * Weapon sprite frame info
 */
interface WeaponFrame {
  spriteName: string;
  frame: string; // A, B, C, D, etc.
}

/**
 * Cached weapon sprite with offset info
 */
interface CachedWeaponSprite {
  texture: THREE.CanvasTexture;
  width: number;
  height: number;
  leftoffset: number;
  topoffset: number;
}

/**
 * Weapon animation sequences
 */
const WEAPON_FRAMES: Map<WeaponType, WeaponFrame[]> = new Map([
  [WeaponType.FIST, [
    { spriteName: 'PUNG', frame: 'A' },
  ]],
  [WeaponType.PISTOL, [
    { spriteName: 'PISG', frame: 'A' }, // Ready
    { spriteName: 'PISG', frame: 'B' }, // Firing
    { spriteName: 'PISG', frame: 'C' }, // Firing
    { spriteName: 'PISG', frame: 'D' }, // Firing flash
  ]],
  [WeaponType.SHOTGUN, [
    { spriteName: 'SHTG', frame: 'A' }, // Ready
    { spriteName: 'SHTG', frame: 'B' }, // Firing
    { spriteName: 'SHTG', frame: 'C' }, // Firing
  ]],
  [WeaponType.CHAINGUN, [
    { spriteName: 'CHGG', frame: 'A' }, // Ready
    { spriteName: 'CHGG', frame: 'B' }, // Firing
  ]],
]);

export class WeaponRenderer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private wad: WADReader;
  private palette: Uint8ClampedArray;
  private weaponMesh?: THREE.Mesh;
  private spriteCache: Map<string, CachedWeaponSprite>;
  private currentFrame: number = 0;
  private animationTimer: number = 0;
  private bobOffset: number = 0;

  constructor(wad: WADReader, palette: Uint8ClampedArray) {
    this.wad = wad;
    this.palette = palette;
    this.spriteCache = new Map();

    // Create orthographic scene for weapon overlay
    this.scene = new THREE.Scene();

    // Camera positioned to see weapon sprite
    // Use screen coordinates (0-320 width, 0-200 height for DOOM's resolution)
    this.camera = new THREE.OrthographicCamera(
      0, 320, // left, right
      0, 200, // top, bottom
      -1, 1   // near, far
    );
    this.camera.position.z = 0;
  }

  /**
   * Load a weapon sprite from WAD
   */
  private loadWeaponSprite(spriteName: string, frame: string): CachedWeaponSprite | null {
    const fullName = `${spriteName}${frame}0`; // e.g., "PISGA0"

    // Check cache
    if (this.spriteCache.has(fullName)) {
      return this.spriteCache.get(fullName)!;
    }

    const lumpData = this.wad.readLump(fullName);
    if (!lumpData) {
      console.warn(`Weapon sprite not found: ${fullName}`);
      return null;
    }

    try {
      const decoded = PatchDecoder.decodePatch(lumpData, this.palette);

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = decoded.width;
      canvas.height = decoded.height;

      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.createImageData(decoded.width, decoded.height);
      imageData.data.set(decoded.pixels);
      ctx.putImageData(imageData, 0, 0);

      // Create texture
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.flipY = false; // Don't flip Y - DOOM patches are already correct orientation
      texture.needsUpdate = true;

      const cached: CachedWeaponSprite = {
        texture,
        width: decoded.width,
        height: decoded.height,
        leftoffset: decoded.leftoffset,
        topoffset: decoded.topoffset,
      };

      this.spriteCache.set(fullName, cached);
      return cached;
    } catch (error) {
      console.error(`Failed to load weapon sprite ${fullName}:`, error);
      return null;
    }
  }

  /**
   * Update weapon sprite based on weapon state
   */
  update(weapon: PlayerWeapon, playerBob: number = 0): void {
    const frames = WEAPON_FRAMES.get(weapon.currentWeapon);
    if (!frames || frames.length === 0) {
      console.warn(`No frames for weapon ${WeaponType[weapon.currentWeapon]}`);
      return;
    }

    // Determine which frame to show based on weapon state
    let frameIndex = 0;

    switch (weapon.state) {
      case WeaponState.READY:
        frameIndex = 0; // Ready/idle frame
        break;

      case WeaponState.FIRING:
        // Cycle through firing frames
        const firingFrames = frames.length - 1;
        frameIndex = Math.min(this.currentFrame % firingFrames + 1, frames.length - 1);
        break;

      case WeaponState.RAISING:
        frameIndex = 0;
        break;

      case WeaponState.LOWERING:
        frameIndex = 0;
        break;
    }

    // Update animation timer
    this.animationTimer++;
    if (this.animationTimer >= 4) { // Change frame every 4 tics
      this.animationTimer = 0;
      this.currentFrame++;
    }

    // Load sprite for current frame
    const frame = frames[frameIndex];
    const sprite = this.loadWeaponSprite(frame.spriteName, frame.frame);

    if (!sprite) return;

    // Update bob offset
    this.bobOffset = playerBob;

    // Create or update weapon mesh
    if (!this.weaponMesh) {
      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({
        map: sprite.texture,
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
      });

      this.weaponMesh = new THREE.Mesh(geometry, material);
      this.scene.add(this.weaponMesh);
    } else {
      // Update texture
      const material = this.weaponMesh.material as THREE.MeshBasicMaterial;
      material.map = sprite.texture;
      material.needsUpdate = true;
    }

    // Position weapon using DOOM's weapon positioning
    // DOOM weapon position: (160, 32) at the bottom center-ish
    // The offsets from the patch determine where the "anchor point" is

    // Scale the weapon (DOOM resolution is 320x200, weapons typically show at 1:1 scale)
    this.weaponMesh.scale.set(sprite.width, sprite.height, 1);

    // Position weapon at bottom center
    // X: center of screen (160) - leftoffset gives us the sprite's center point
    // Y: DOOM weapon Y position is typically 32 units from bottom (200 - 32 = 168)
    // The topoffset tells us where the sprite's anchor is vertically

    const weaponX = 160; // Center of 320-wide screen
    const weaponY = 32;  // Distance from bottom of 200-tall screen (DOOM standard)

    // Apply offsets - these position the sprite so its anchor point is at weaponX, weaponY
    // leftoffset: how far from left edge of sprite to the anchor point
    // topoffset: how far from top edge of sprite to the anchor point
    const xPos = weaponX - sprite.leftoffset + (sprite.width / 2);
    const yPos = weaponY - sprite.topoffset + (sprite.height / 2) + this.bobOffset;

    this.weaponMesh.position.set(xPos, yPos, 0);
  }

  /**
   * Render weapon overlay
   */
  render(renderer: THREE.WebGLRenderer): void {
    if (!this.weaponMesh) return;

    // Render weapon scene on top of main scene
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }

  /**
   * Get weapon scene for manual rendering
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Get weapon camera
   */
  getCamera(): THREE.OrthographicCamera {
    return this.camera;
  }

  /**
   * Clear sprite cache
   */
  clearCache(): void {
    for (const texture of this.spriteCache.values()) {
      texture.dispose();
    }
    this.spriteCache.clear();
  }
}
