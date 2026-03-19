/**
 * Weapon Renderer
 * Renders first-person weapon sprites in screen space
 * Based on linuxdoom-1.10/r_draw.c weapon sprite rendering
 */

import * as THREE from 'three';
import type { WADReader } from '../wad';
import { PatchDecoder } from '../graphics';
import type { PlayerWeapon } from '../weapons/WeaponSystem';
import { WEAPON_INFO, WeaponType, WeaponState } from '../weapons/WeaponSystem';
import { FRACUNIT, FixedMul, FixedToInt, IntToFixed, type Fixed } from '../core/fixed';
import { finecosine, finesine, FINEANGLES, FINEMASK } from '../core/tables';

/** linuxdoom-1.10 p_pspr.c */
const WEAPONTOP = 32 * FRACUNIT;
/** r_things.c — vertical anchor inside texturemid (not the same as centery on short views). */
const BASEYCENTER = 100;

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 168;

function weaponPspriteSxSy(bob: Fixed, levelTime: number): { sx: Fixed; sy: Fixed } {
  let ang = (128 * levelTime) & FINEMASK;
  const sx = FRACUNIT + FixedMul(bob, finecosine[ang]);
  ang &= FINEANGLES / 2 - 1;
  const sy = WEAPONTOP + FixedMul(bob, finesine[ang]);
  return { sx, sy };
}

/**
 * Center of patch in weapon ortho space (origin bottom-left of 320×168, Y up),
 * matching R_DrawPSprite + R_DrawVisSprite with pspritescale = FRACUNIT (320-wide).
 */
function pspritePatchCenterPx(sx: Fixed, sy: Fixed, patch: CachedWeaponSprite): { x: number; y: number } {
  const centerx = VIEW_WIDTH / 2;
  const centery = VIEW_HEIGHT / 2;
  const xLeft = FixedToInt(
    IntToFixed(centerx) + sx - IntToFixed(160) - IntToFixed(patch.leftoffset),
  );
  const texturemid =
    IntToFixed(BASEYCENTER) + FRACUNIT / 2 - (sy - IntToFixed(patch.topoffset));
  const sprtopscreen = IntToFixed(centery) - texturemid;
  const topFromTop = sprtopscreen / FRACUNIT;
  const centerFromTop = topFromTop + patch.height / 2;
  const y = VIEW_HEIGHT - centerFromTop;
  return { x: xLeft + patch.width / 2, y };
}

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
  [WeaponType.FIST, [{ spriteName: 'PUNG', frame: 'A' }]],
  [WeaponType.PISTOL, [
    { spriteName: 'PISG', frame: 'A' },
    { spriteName: 'PISG', frame: 'B' },
    { spriteName: 'PISG', frame: 'C' },
    { spriteName: 'PISG', frame: 'D' },
  ]],
  [WeaponType.SHOTGUN, [
    { spriteName: 'SHTG', frame: 'A' },
    { spriteName: 'SHTG', frame: 'B' },
    { spriteName: 'SHTG', frame: 'C' },
    { spriteName: 'SHTG', frame: 'D' },
  ]],
  [WeaponType.CHAINGUN, [
    { spriteName: 'CHGG', frame: 'A' },
    { spriteName: 'CHGG', frame: 'B' },
  ]],
  [WeaponType.ROCKET_LAUNCHER, [
    { spriteName: 'MISG', frame: 'A' },
    { spriteName: 'MISG', frame: 'B' },
  ]],
  [WeaponType.PLASMA_RIFLE, [
    { spriteName: 'PLSG', frame: 'A' },
    { spriteName: 'PLSG', frame: 'B' },
  ]],
  [WeaponType.BFG9000, [
    { spriteName: 'BFGG', frame: 'A' },
    { spriteName: 'BFGG', frame: 'B' },
  ]],
  [WeaponType.CHAINSAW, [
    { spriteName: 'SAWG', frame: 'A' },
    { spriteName: 'SAWG', frame: 'B' },
  ]],
  [WeaponType.SUPER_SHOTGUN, [
    { spriteName: 'SHT2', frame: 'A' },
    { spriteName: 'SHT2', frame: 'B' },
    { spriteName: 'SHT2', frame: 'C' },
    { spriteName: 'SHT2', frame: 'D' },
    { spriteName: 'SHT2', frame: 'E' },
    { spriteName: 'SHT2', frame: 'F' },
    { spriteName: 'SHT2', frame: 'G' },
    { spriteName: 'SHT2', frame: 'H' },
  ]],
]);

const WEAPON_FLASH: Map<WeaponType, { spriteName: string; frame: string }> = new Map([
  [WeaponType.PISTOL, { spriteName: 'PISF', frame: 'A' }],
  [WeaponType.SHOTGUN, { spriteName: 'SHTF', frame: 'A' }],
  [WeaponType.CHAINGUN, { spriteName: 'CHGF', frame: 'A' }],
  [WeaponType.ROCKET_LAUNCHER, { spriteName: 'MISF', frame: 'A' }],
  [WeaponType.PLASMA_RIFLE, { spriteName: 'PLSF', frame: 'A' }],
  [WeaponType.BFG9000, { spriteName: 'BFGF', frame: 'A' }],
  /** S_DSGUNFLASH1: SPR_SHT2, frame 8 + fullbright (info.c). */
  [WeaponType.SUPER_SHOTGUN, { spriteName: 'SHT2', frame: 'I' }],
]);

export class WeaponRenderer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private wad: WADReader;
  private palette: Uint8ClampedArray;
  private weaponMesh?: THREE.Mesh;
  private flashMesh?: THREE.Mesh;
  private spriteCache: Map<string, CachedWeaponSprite>;

  constructor(wad: WADReader, palette: Uint8ClampedArray) {
    this.wad = wad;
    this.palette = palette;
    this.spriteCache = new Map();

    // Create orthographic scene for weapon overlay
    this.scene = new THREE.Scene();

    // View is 320x168; status bar 32px below
    this.camera = new THREE.OrthographicCamera(
      0, 320, 168, 0, -1, 1
    );
    this.camera.position.z = 1;
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
      // flipY defaults to true, which is correct for DOOM patches
      texture.colorSpace = THREE.SRGBColorSpace;
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
   * Update weapon sprite based on weapon state.
   * showFlash: from game tick (true for ~4 ticks after firing) so muzzle flash is visible.
   * bob / levelTime: same as player->bob and leveltime in linuxdoom A_WeaponReady / R_DrawPSprite.
   */
  update(
    weapon: PlayerWeapon,
    bob: Fixed,
    levelTime: number,
    showFlash: boolean = false,
  ): void {
    const frames = WEAPON_FRAMES.get(weapon.currentWeapon);
    if (!frames || frames.length === 0) {
      console.error(`No frames for weapon ${WeaponType[weapon.currentWeapon]} (type: ${weapon.currentWeapon})`);
      return;
    }


    // Determine which frame to show based on weapon state
    let frameIndex = 0;

    switch (weapon.state) {
      case WeaponState.READY:
        frameIndex = 0;
        break;

      case WeaponState.FIRING: {
        const extra = frames.length - 1;
        if (extra <= 0) {
          frameIndex = 0;
          break;
        }
        const info = WEAPON_INFO.get(weapon.currentWeapon);
        const fireDelay = Math.max(1, info?.fireDelay ?? 1);
        const elapsed = fireDelay - weapon.fireTimer;
        const bucket =
          extra <= 1
            ? 0
            : Math.min(
                Math.floor((Math.max(0, elapsed - 1) * extra) / fireDelay),
                extra - 1,
              );
        frameIndex = 1 + bucket;
        break;
      }

      case WeaponState.RAISING:
      case WeaponState.LOWERING:
        frameIndex = 0;
        break;
    }

    // Load sprite for current frame
    const frame = frames[frameIndex];
    const sprite = this.loadWeaponSprite(frame.spriteName, frame.frame);

    if (!sprite) {
      console.error(`Failed to load weapon sprite ${frame.spriteName}${frame.frame}0`);
      return;
    }

    const { sx, sy } = weaponPspriteSxSy(bob, levelTime);

    // Create or update weapon mesh
    if (!this.weaponMesh) {
      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({
        map: sprite.texture,
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });

      this.weaponMesh = new THREE.Mesh(geometry, material);
      this.weaponMesh.renderOrder = 9999;
      this.scene.add(this.weaponMesh);
    } else {
      // Update texture
      const material = this.weaponMesh.material as THREE.MeshBasicMaterial;
      material.map = sprite.texture;
      material.needsUpdate = true;
    }

    this.weaponMesh.scale.set(sprite.width, sprite.height, 1);

    const { x: xPos, y: yPos } = pspritePatchCenterPx(sx, sy, sprite);
    this.weaponMesh.position.set(xPos, yPos, 0);

    const flashVisible = showFlash && WEAPON_FLASH.has(weapon.currentWeapon);
    if (flashVisible) {
      const flashInfo = WEAPON_FLASH.get(weapon.currentWeapon)!;
      const flashSprite = this.loadWeaponSprite(flashInfo.spriteName, flashInfo.frame);
      if (flashSprite) {
        if (!this.flashMesh) {
          const geom = new THREE.PlaneGeometry(1, 1);
          const mat = new THREE.MeshBasicMaterial({
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
          });
          this.flashMesh = new THREE.Mesh(geom, mat);
          this.flashMesh.renderOrder = 10000;
          this.scene.add(this.flashMesh);
        }
        const flashMat = this.flashMesh.material as THREE.MeshBasicMaterial;
        flashMat.map = flashSprite.texture;
        flashMat.needsUpdate = true;
        this.flashMesh.scale.set(flashSprite.width, flashSprite.height, 1);
        const flashPos = pspritePatchCenterPx(sx, sy, flashSprite);
        this.flashMesh.position.set(flashPos.x, flashPos.y, 0.01);
        this.flashMesh.visible = true;
      }
    } else if (this.flashMesh) {
      this.flashMesh.visible = false;
    }
  }

  /**
   * Render weapon overlay
   */
  render(renderer: THREE.WebGLRenderer): void {
    if (!this.weaponMesh) {
      return;
    }

    // Render weapon scene on top of main scene
    renderer.autoClear = false;
    renderer.clearDepth();
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
    for (const sprite of this.spriteCache.values()) {
      sprite.texture.dispose();
    }
    this.spriteCache.clear();
  }
}
