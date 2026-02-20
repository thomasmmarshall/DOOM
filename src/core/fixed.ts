/**
 * Fixed-point arithmetic (16.16 format)
 * Based on linuxdoom-1.10/m_fixed.c and m_fixed.h
 *
 * DOOM uses 32-bit integers as 16.16 fixed-point numbers:
 * - Upper 16 bits: integer part
 * - Lower 16 bits: fractional part
 * - 1.0 = 65536 (FRACUNIT)
 */

export const FRACBITS = 16;
export const FRACUNIT = 1 << FRACBITS; // 65536

export type Fixed = number; // 32-bit signed integer

/**
 * Convert integer to fixed-point
 */
export function IntToFixed(x: number): Fixed {
  return (x << FRACBITS) | 0;
}

/**
 * Convert fixed-point to integer (truncate)
 */
export function FixedToInt(x: Fixed): number {
  return x >> FRACBITS;
}

/**
 * Convert fixed-point to float
 */
export function FixedToFloat(x: Fixed): number {
  return x / FRACUNIT;
}

/**
 * Convert float to fixed-point
 */
export function FloatToFixed(x: number): Fixed {
  return ((x * FRACUNIT) | 0);
}

/**
 * Fixed-point multiplication
 * Based on FixedMul from m_fixed.c
 */
export function FixedMul(a: Fixed, b: Fixed): Fixed {
  // Use JavaScript's automatic 53-bit precision for intermediate result
  // then shift and clamp to 32-bit signed integer
  const result = ((a * b) / FRACUNIT) | 0;
  return result;
}

/**
 * Fixed-point division
 * Based on FixedDiv from m_fixed.c
 */
export function FixedDiv(a: Fixed, b: Fixed): Fixed {
  // Check for overflow
  const absA = Math.abs(a) >> 14;
  const absB = Math.abs(b);

  if (absA >= absB) {
    // Would overflow - return max/min int
    return (a ^ b) < 0 ? -2147483648 : 2147483647;
  }

  return FixedDiv2(a, b);
}

/**
 * Fixed-point division (internal)
 */
export function FixedDiv2(a: Fixed, b: Fixed): Fixed {
  if (b === 0) {
    throw new Error('FixedDiv: divide by zero');
  }

  // Shift a left by 16 bits, then divide by b
  const result = ((a * FRACUNIT) / b) | 0;

  return result;
}

/**
 * Fixed-point absolute value
 */
export function FixedAbs(x: Fixed): Fixed {
  return x < 0 ? -x : x;
}

/**
 * Fixed-point floor
 */
export function FixedFloor(x: Fixed): Fixed {
  return x & 0xFFFF0000;
}

/**
 * Fixed-point ceiling
 */
export function FixedCeil(x: Fixed): Fixed {
  const frac = x & 0xFFFF;
  return frac === 0 ? x : (x & 0xFFFF0000) + FRACUNIT;
}
