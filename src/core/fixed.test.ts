import { describe, it, expect } from 'vitest';
import {
  FRACUNIT,
  IntToFixed,
  FixedToInt,
  FixedToFloat,
  FloatToFixed,
  FixedMul,
  FixedDiv,
  FixedAbs,
} from './fixed';

describe('Fixed-point math', () => {
  it('should convert integers to fixed-point', () => {
    expect(IntToFixed(0)).toBe(0);
    expect(IntToFixed(1)).toBe(FRACUNIT);
    expect(IntToFixed(10)).toBe(10 * FRACUNIT);
    expect(IntToFixed(-5)).toBe(-5 * FRACUNIT);
  });

  it('should convert fixed-point to integers', () => {
    expect(FixedToInt(0)).toBe(0);
    expect(FixedToInt(FRACUNIT)).toBe(1);
    expect(FixedToInt(10 * FRACUNIT)).toBe(10);
    expect(FixedToInt(-5 * FRACUNIT)).toBe(-5);
  });

  it('should convert fixed-point to float', () => {
    expect(FixedToFloat(FRACUNIT)).toBe(1.0);
    expect(FixedToFloat(FRACUNIT / 2)).toBeCloseTo(0.5, 4);
    expect(FixedToFloat(FRACUNIT * 3)).toBe(3.0);
  });

  it('should convert float to fixed-point', () => {
    expect(FloatToFixed(1.0)).toBe(FRACUNIT);
    expect(FloatToFixed(0.5)).toBe(FRACUNIT / 2);
    expect(FloatToFixed(3.0)).toBe(FRACUNIT * 3);
  });

  it('should multiply fixed-point numbers', () => {
    const a = IntToFixed(3);
    const b = IntToFixed(4);
    const result = FixedMul(a, b);
    expect(FixedToInt(result)).toBe(12);
  });

  it('should multiply fractional fixed-point numbers', () => {
    const a = FloatToFixed(1.5);
    const b = FloatToFixed(2.0);
    const result = FixedMul(a, b);
    expect(FixedToFloat(result)).toBeCloseTo(3.0, 4);
  });

  it('should divide fixed-point numbers', () => {
    const a = IntToFixed(12);
    const b = IntToFixed(3);
    const result = FixedDiv(a, b);
    expect(FixedToInt(result)).toBe(4);
  });

  it('should divide fractional fixed-point numbers', () => {
    const a = FloatToFixed(5.0);
    const b = FloatToFixed(2.0);
    const result = FixedDiv(a, b);
    expect(FixedToFloat(result)).toBeCloseTo(2.5, 4);
  });

  it('should handle fixed-point absolute value', () => {
    expect(FixedAbs(IntToFixed(5))).toBe(IntToFixed(5));
    expect(FixedAbs(IntToFixed(-5))).toBe(IntToFixed(5));
    expect(FixedAbs(0)).toBe(0);
  });
});
