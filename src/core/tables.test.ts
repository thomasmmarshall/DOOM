import { describe, it, expect, beforeAll } from 'vitest';
import {
  initTables,
  finesine,
  finecosine,
  finetangent,
  FINEANGLES,
  ANGLETOFINESHIFT,
  FineCosine,
  FineSine,
  FineTangent,
} from './tables';
import { FixedMul, FRACUNIT } from './fixed';

describe('Trig tables (linuxdoom finesine / finecosine)', () => {
  beforeAll(() => {
    initTables();
  });

  it('finecosine mirrors &finesine[FINEANGLES/4] after init', () => {
    for (let i = 0; i < FINEANGLES; i++) {
      expect(finecosine[i]).toBe(finesine[i + FINEANGLES / 4]);
    }
  });

  it('FineCosine matches table (p_pspr weapon bob indexing)', () => {
    const angle = (128 * 7) & (FINEANGLES - 1);
    expect(FineCosine(angle << 19)).toBe(finecosine[angle]);
    expect(FixedMul(FRACUNIT, finecosine[angle])).toBe(finecosine[angle]);
  });

  it('FineSine matches finesine for first quadrant index', () => {
    const ang = 42 & (FINEANGLES / 2 - 1);
    expect(FineSine(ang << 19)).toBe(finesine[ang]);
  });

  it('FineCosine(bam) matches finecosine[fineIndex] for all fine indices', () => {
    for (let idx = 0; idx < FINEANGLES; idx++) {
      expect(FineCosine(idx << ANGLETOFINESHIFT)).toBe(finecosine[idx]);
    }
  });
});

describe('finetangent (linuxdoom tables.c)', () => {
  it('is vanilla length and endpoints', () => {
    expect(finetangent.length).toBe(FINEANGLES / 2);
    expect(finetangent[0]).toBe(-170910304);
    expect(finetangent[4095]).toBe(170910304);
  });

  it('FineTangent indexes like vanilla (BAM >> 19)', () => {
    expect(FineTangent(0)).toBe(finetangent[0]);
    expect(FineTangent(123 << ANGLETOFINESHIFT)).toBe(finetangent[123]);
  });
});
