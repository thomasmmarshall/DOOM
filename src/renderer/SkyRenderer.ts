/**
 * Sky Renderer
 * Creates skybox from DOOM sky texture
 * The sky follows the camera position so it always appears as a distant backdrop
 */

import * as THREE from 'three';

export class SkyRenderer {
  private mesh: THREE.Mesh | null = null;

  /**
   * Create sky cylinder from DOOM sky texture
   */
  createSky(
    material: THREE.MeshBasicMaterial,
    skyName: string = 'SKY1'
  ): THREE.Mesh | null {
    try {
      if (material.map) {
        material.map.wrapS = THREE.RepeatWrapping;
        material.map.wrapT = THREE.ClampToEdgeWrapping;
        material.map.needsUpdate = true;
      }

      // Use a sphere instead of an open cylinder so the player can never
      // see the top edge of the sky volume when looking up.
      const skyRadius = 4000;
      const geometry = new THREE.SphereGeometry(
        skyRadius,
        64,
        32
      );

      // Modify UVs for proper sky texture mapping
      // DOOM sky textures tile 4x horizontally around 360 degrees
      const uvAttribute = geometry.getAttribute('uv');
      for (let i = 0; i < uvAttribute.count; i++) {
        let u = uvAttribute.getX(i);
        const v = THREE.MathUtils.clamp(uvAttribute.getY(i), 0.08, 0.92);
        u = (1 - u) * 4; // Flip and tile 4x around cylinder
        uvAttribute.setX(i, u);
        uvAttribute.setY(i, v);
      }
      uvAttribute.needsUpdate = true;

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
