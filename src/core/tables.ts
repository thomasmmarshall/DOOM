/**
 * Trigonometry lookup tables
 * Based on linuxdoom-1.10/tables.c and tables.h
 *
 * DOOM uses Binary Angle Measurement (BAM) and lookup tables for fast trig.
 */

import { Fixed, FloatToFixed, FRACUNIT } from './fixed';

// Constants from tables.h
export const FINEANGLES = 8192;
export const FINEMASK = FINEANGLES - 1;
export const ANGLETOFINESHIFT = 19;

// Binary Angle Measurement (BAM) constants
// Full circle = 0x100000000 (32-bit unsigned overflow)
export const ANG45 = 0x20000000;
export const ANG90 = 0x40000000;
export const ANG180 = 0x80000000;
export const ANG270 = 0xc0000000;

export type Angle = number; // 32-bit unsigned integer

// Sine lookup table (10240 entries)
export const finesine: Fixed[] = new Array((5 * FINEANGLES) / 4);

// Cosine is just sine shifted by 90 degrees (FINEANGLES/4)
export const finecosine: Fixed[] = finesine.slice(FINEANGLES / 4);

// Tangent lookup table (4096 entries)
export const finetangent: Fixed[] = new Array(FINEANGLES / 2);

/**
 * Initialize trigonometry tables
 * Called once at startup
 */
export function initTables(): void {
  const PI = Math.PI;

  // Generate sine table
  for (let i = 0; i < (5 * FINEANGLES) / 4; i++) {
    const angle = (i * 2 * PI) / FINEANGLES;
    finesine[i] = FloatToFixed(Math.sin(angle));
  }

  // Generate tangent table
  for (let i = 0; i < FINEANGLES / 2; i++) {
    const angle = (i * 2 * PI) / FINEANGLES;
    finetangent[i] = FloatToFixed(Math.tan(angle));
  }

  console.log('Trigonometry tables initialized');
}

/**
 * Get sine from angle using lookup table
 */
export function FineSine(angle: number): Fixed {
  const index = (angle >> ANGLETOFINESHIFT) & FINEMASK;
  return finesine[index];
}

/**
 * Get cosine from angle using lookup table
 */
export function FineCosine(angle: number): Fixed {
  const index = ((angle >> ANGLETOFINESHIFT) + FINEANGLES / 4) & FINEMASK;
  return finesine[index];
}

/**
 * Get tangent from angle using lookup table
 */
export function FineTangent(angle: number): Fixed {
  const index = (angle >> ANGLETOFINESHIFT) & (FINEANGLES / 2 - 1);
  return finetangent[index];
}

/**
 * Convert degrees to BAM angle
 */
export function DegreesToAngle(degrees: number): Angle {
  // Full circle (360 degrees) = 0x100000000
  // Use modulo to keep in range
  return ((degrees * 0x100000000) / 360) >>> 0;
}

/**
 * Convert BAM angle to degrees
 */
export function AngleToDegrees(angle: Angle): number {
  return ((angle >>> 0) * 360) / 0x100000000;
}

/**
 * Convert radians to BAM angle
 */
export function RadiansToAngle(radians: number): Angle {
  return ((radians * 0x100000000) / (2 * Math.PI)) >>> 0;
}

/**
 * Convert BAM angle to radians
 */
export function AngleToRadians(angle: Angle): number {
  return ((angle >>> 0) * 2 * Math.PI) / 0x100000000;
}
