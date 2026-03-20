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

      // DOOM uses cylinder mapping: 256x128 texture, 4x horizontal tile.
      // Aspect 4*256:128 = 8:1. Use cylinder for correct horizon mapping.
      const skyRadius = 4000;
      const circumference = 2 * Math.PI * skyRadius;
      const skyHeight = circumference / 8;

      const geometry = new THREE.CylinderGeometry(
        skyRadius,
        skyRadius,
        skyHeight,
        64,
        1,
        true
      );

      // Tile 4x horizontally; flip V so sky is right-side up (DOOM horizon at bottom)
      const uvAttribute = geometry.getAttribute('uv');
      for (let i = 0; i < uvAttribute.count; i++) {
        uvAttribute.setX(i, (1 - uvAttribute.getX(i)) * 4);
        uvAttribute.setY(i, 1 - uvAttribute.getY(i));
      }
      uvAttribute.needsUpdate = true;

      this.mesh = new THREE.Mesh(geometry, material);
      this.mesh.renderOrder = -1000;
      this.mesh.frustumCulled = false;
      // Align cylinder seam / DOOM east–north with camera convention (r_sky angle mapping).
      this.mesh.rotation.y = Math.PI / 2;

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

  removeFromScene(scene: THREE.Scene): void {
    if (!this.mesh) return;
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    const mat = this.mesh.material;
    if (!Array.isArray(mat)) {
      const basic = mat as THREE.MeshBasicMaterial;
      basic.map?.dispose();
      basic.dispose();
    } else {
      for (const m of mat) {
        const basic = m as THREE.MeshBasicMaterial;
        basic.map?.dispose();
        basic.dispose();
      }
    }
    this.mesh = null;
  }
}
