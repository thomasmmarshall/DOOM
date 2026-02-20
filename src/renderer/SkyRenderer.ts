/**
 * Sky Renderer
 * Creates skybox from DOOM sky texture
 */

import * as THREE from 'three';
import type { WADReader } from '../wad';
import { PatchDecoder } from '../graphics';

export class SkyRenderer {
  /**
   * Create sky sphere from DOOM sky texture
   * DOOM skies rotate based on player angle but not position
   */
  static createSky(
    wad: WADReader,
    palette: Uint8ClampedArray,
    skyName: string = 'SKY1'
  ): THREE.Mesh | null {
    const skyData = wad.readLump(skyName);
    if (!skyData) {
      console.warn(`Sky texture ${skyName} not found`);
      return null;
    }

    try {
      // Decode sky patch
      const decoded = PatchDecoder.decodePatch(skyData, palette);
      const canvas = PatchDecoder.patchToCanvas(decoded);

      // Create texture
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;

      // Create sky sphere
      // Use large radius so it's always in background
      const geometry = new THREE.SphereGeometry(5000, 32, 16);

      // Flip the geometry inside-out
      geometry.scale(-1, 1, 1);

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        depthWrite: false, // Don't write to depth buffer
      });

      const sky = new THREE.Mesh(geometry, material);

      // Sky should be rendered first
      sky.renderOrder = -1;

      return sky;
    } catch (error) {
      console.error(`Failed to create sky ${skyName}:`, error);
      return null;
    }
  }
}
