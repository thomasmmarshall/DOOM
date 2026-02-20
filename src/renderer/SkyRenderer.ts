/**
 * Sky Renderer
 * Creates skybox from DOOM sky texture
 * The sky follows the camera position so it always appears as a distant backdrop
 */

import * as THREE from 'three';
import type { WADReader } from '../wad';
import { PatchDecoder } from '../graphics';

export class SkyRenderer {
  private mesh: THREE.Mesh | null = null;

  /**
   * Create sky cylinder from DOOM sky texture
   */
  createSky(
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

      console.log(`Sky texture ${skyName} decoded: ${canvas.width}x${canvas.height}`);

      // Create texture
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;
      texture.colorSpace = THREE.SRGBColorSpace;

      // Create sky cylinder - large enough to always be in background
      // but will follow camera position
      const skyRadius = 4000;
      const skyHeight = 2000;

      const geometry = new THREE.CylinderGeometry(
        skyRadius,
        skyRadius,
        skyHeight,
        64,
        1,
        true // openEnded
      );

      // Modify UVs for proper sky texture mapping
      // DOOM sky textures tile 4x horizontally around 360 degrees
      const uvAttribute = geometry.getAttribute('uv');
      for (let i = 0; i < uvAttribute.count; i++) {
        let u = uvAttribute.getX(i);
        u = (1 - u) * 4; // Flip and tile 4x around cylinder
        uvAttribute.setX(i, u);
      }
      uvAttribute.needsUpdate = true;

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      });

      this.mesh = new THREE.Mesh(geometry, material);
      this.mesh.renderOrder = -1000;
      this.mesh.frustumCulled = false;

      console.log(`Sky cylinder created successfully`);

      return this.mesh;
    } catch (error) {
      console.error(`Failed to create sky ${skyName}:`, error);
      return null;
    }
  }

  /**
   * Update sky position to follow camera
   * Call this every frame from the render loop
   */
  update(cameraPosition: THREE.Vector3): void {
    if (this.mesh) {
      // Sky follows camera horizontally (X, Z) but stays at fixed Y
      this.mesh.position.x = cameraPosition.x;
      this.mesh.position.z = cameraPosition.z;
      this.mesh.position.y = cameraPosition.y; // Center vertically on camera
    }
  }
}
