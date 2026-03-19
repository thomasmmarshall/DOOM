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
});
