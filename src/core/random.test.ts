import { describe, it, expect, beforeEach } from 'vitest';
import { mRandom, pRandom, clearRandom } from './random';

describe('RNG (linuxdoom m_random.c)', () => {
  beforeEach(() => clearRandom());

  it('M_Random does not advance P_Random stream', () => {
    mRandom();
    mRandom();
    expect(pRandom()).toBe(8);
  });

  it('clearRandom resets both streams', () => {
    mRandom();
    pRandom();
    clearRandom();
    expect(mRandom()).toBe(8);
    expect(pRandom()).toBe(8);
  });

  /** First P_Random() values after M_ClearRandom — linuxdoom-1.10/m_random.c rndtable indexing. */
  it('P_Random golden sequence', () => {
    const expected = [
      8, 109, 220, 222, 241, 149, 107, 75, 248, 254, 140, 16, 66, 74, 21, 211,
    ];
    for (const v of expected) {
      expect(pRandom()).toBe(v);
    }
  });

  it('M_Random golden sequence', () => {
    const expected = [8, 109, 220, 222, 241, 149];
    for (const v of expected) {
      expect(mRandom()).toBe(v);
    }
  });
});
