/**
 * Coordinate system conversion
 *
 * DOOM coordinate system:
 * - X: East (right)
 * - Y: North (forward)
 * - Z: Up
 *
 * three.js coordinate system:
 * - X: Right
 * - Y: Up
 * - Z: Forward (toward camera is negative)
 *
 * Conversion: DOOM (x, y, z) → three.js (x, z, -y)
 */

import * as THREE from 'three';

/**
 * Convert DOOM coordinates to three.js
 */
export function doomToThree(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, z, -y);
}

/**
 * Convert DOOM 2D point to three.js Vector3 (with z=0)
 */
export function doomToThree2D(x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(x, 0, -y);
}

/**
 * Convert three.js coordinates back to DOOM
 */
export function threeToDoom(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return { x, y: -z, z: y };
}

/**
 * Convert DOOM angle (degrees) to three.js angle (radians)
 * DOOM: 0=East, 90=North, 180=West, 270=South
 * three.js: radians, standard mathematical convention
 */
export function doomAngleToThree(degrees: number): number {
  // DOOM angles: 0=East (right), 90=North (forward)
  // three.js: 0=East (right), π/2=North (forward in -Z)
  // Need to convert and negate Y (which becomes -Z in three.js)
  return THREE.MathUtils.degToRad(90 - degrees);
}

/**
 * Create a Vector2 from DOOM coordinates (for 2D calculations)
 */
export function doomToVector2(x: number, y: number): THREE.Vector2 {
  return new THREE.Vector2(x, y);
}
