import { describe, it, expect } from 'vitest';
import { FINAL_LEVEL, FIRST_LEVEL, RPOS_LEVELS, levelDefinition, levelTitleFor, nextLevelAfter } from './levels';

describe('RPOS levels', () => {
  it('has six levels, numbered 1 through 6 in order', () => {
    expect(RPOS_LEVELS.map((level) => level.level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(FIRST_LEVEL).toBe(1);
    expect(FINAL_LEVEL).toBe(6);
  });

  it('carries the program’s own call signs', () => {
    expect(levelDefinition(4).callSign).toBe('WELCOME TO THUNDERDOME');
    expect(levelDefinition(5).callSign).toBe('WELCOME TO THE JUNGLE');
    // Levels the prompts give no call sign to do not get invented ones.
    expect(levelDefinition(1).callSign).toBeNull();
    expect(levelDefinition(6).callSign).toBeNull();
  });

  it('removes coaching level by level, and never restores it', () => {
    expect(RPOS_LEVELS.map((level) => level.coaching)).toEqual([
      'active_coaching',
      'broad_prompts',
      'learner_owns_assessment',
      'very_little_rescue',
      'training_wheels_off',
      'training_wheels_off',
    ]);
  });

  it('states a scenario count for Level 1 only', () => {
    expect(levelDefinition(1).minimumScenarios).toBe(10);
    for (const level of [2, 3, 4, 5, 6] as const) {
      expect(levelDefinition(level).minimumScenarios).toBeNull();
    }
  });

  it('carries Level 2’s hidden difficulty mix, which sums to 100', () => {
    const mix = levelDefinition(2).hiddenMix;
    expect(mix).toEqual({ straightforward: 50, moderate: 30, difficult: 20 });
    expect((mix?.straightforward ?? 0) + (mix?.moderate ?? 0) + (mix?.difficult ?? 0)).toBe(100);
  });

  it('titles Level 3 differently for an EMT', () => {
    expect(levelTitleFor(3, 'emt')).toBe('Protocol Mastery + ALS Integration');
    expect(levelTitleFor(3, 'paramedic')).toBe('Protocol Mastery');
    // Every other level reads the same for both patches.
    for (const level of [1, 2, 4, 5, 6] as const) {
      expect(levelTitleFor(level, 'emt')).toBe(levelTitleFor(level, 'paramedic'));
    }
  });

  it('walks one level at a time and stops at 6', () => {
    expect(nextLevelAfter(1)).toBe(2);
    expect(nextLevelAfter(5)).toBe(6);
    expect(nextLevelAfter(6)).toBeNull();
  });

  it('rejects a level that does not exist', () => {
    // @ts-expect-error deliberately out of range
    expect(() => levelDefinition(7)).toThrow(/no level 7/);
  });
});
