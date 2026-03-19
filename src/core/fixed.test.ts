import { describe, it, expect } from 'vitest';
import {
  FRACUNIT,
  IntToFixed,
  FixedToInt,
  FixedMul,
  FixedDiv2,
  FixedAbs,
  FixedFloor,
  FixedCeil,
} from './fixed';

describe('fixed-point (m_fixed.c semantics)', () => {
  it('identity multiply', () => {
    expect(FixedMul(FRACUNIT, FRACUNIT)).toBe(FRACUNIT);
    expect(FixedMul(IntToFixed(3), IntToFixed(4))).toBe(IntToFixed(12));
  });

  it('division matches integer when exact', () => {
    expect(FixedDiv2(IntToFixed(12), IntToFixed(3))).toBe(IntToFixed(4));
  });

  it('truncate and floor/ceil', () => {
    const x = IntToFixed(2) + 0x8000; // 2.5
    expect(FixedToInt(x)).toBe(2);
    expect(FixedFloor(x)).toBe(IntToFixed(2));
    expect(FixedCeil(x)).toBe(IntToFixed(3));
  });

  it('abs', () => {
    expect(FixedAbs(IntToFixed(-5))).toBe(IntToFixed(5));
  });
});
