import { describe, it, expect } from 'vitest';
import { bls01Dispatch, bls01Differentials } from './bls-01.dispatch';
import { DEFAULT_SIMULATOR_CONFIG } from '@/lib/engine/config';

describe('BLS-01 dispatch data (§7, §8)', () => {
  it('is Medic 3 on EMS 2, responding Code 3', () => {
    expect(bls01Dispatch.unit).toBe('Medic 3');
    expect(bls01Dispatch.radioChannel).toBe('EMS 2');
    expect(bls01Dispatch.responseMode).toBe('code_3');
  });

  it('offers exactly 15 differential choices', () => {
    expect(bls01Differentials).toHaveLength(15);
    expect(bls01Differentials).toHaveLength(DEFAULT_SIMULATOR_CONFIG.differential.choiceCount);
  });

  it('has unique ids and non-empty labels for every choice', () => {
    const ids = new Set(bls01Differentials.map((d) => d.id));
    expect(ids.size).toBe(15);
    for (const d of bls01Differentials) {
      expect(d.label.trim().length).toBeGreaterThan(0);
    }
  });
});
