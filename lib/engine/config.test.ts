import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SIMULATOR_CONFIG,
  resolveConfig,
  gradeFor,
} from './config';

/**
 * These tests LOCK the approved fixed values from the specification (§29).
 * If any of these fails, someone changed an approved timer or threshold —
 * that requires an explicit spec change, not a code edit.
 */
describe('DEFAULT_SIMULATOR_CONFIG — approved fixed values (§29)', () => {
  const t = DEFAULT_SIMULATOR_CONFIG.timing;

  it('dispatch tone is 3 seconds', () => expect(t.dispatchToneSeconds).toBe(3));
  it('differential timer is 15 seconds at Orientation', () =>
    expect(t.differentialTimerSecondsOrientation).toBe(15));
  it('differential timer is 10 seconds above Orientation', () =>
    expect(t.differentialTimerSecondsAboveOrientation).toBe(10));
  it('equipment prompt delay is 3 seconds', () => expect(t.equipmentPromptDelaySeconds).toBe(3));
  it('fire officer question delay is 5 seconds after engine arrival', () =>
    expect(t.fireOfficerQuestionDelaySeconds).toBe(5));
  it('police arrive 15 seconds after staging', () => expect(t.policeArrivalSeconds).toBe(15));
  it('police secure the scene 10 seconds after arriving', () =>
    expect(t.policeSceneSecurementSeconds).toBe(10));
  it('unselected equipment retrieval is 45 seconds', () => expect(t.equipmentRetrievalSeconds).toBe(45));
  it('first distraction escalation is 10 seconds', () =>
    expect(t.firstDistractionEscalationSeconds).toBe(10));
  it('further distraction escalation is every 5 seconds', () =>
    expect(t.furtherDistractionEscalationSeconds).toBe(5));

  it('differential list is exactly 15 choices with a minimum of 4 selected and top 4 ranked (§8)', () => {
    expect(DEFAULT_SIMULATOR_CONFIG.differential.choiceCount).toBe(15);
    expect(DEFAULT_SIMULATOR_CONFIG.differential.minimumSelections).toBe(4);
    expect(DEFAULT_SIMULATOR_CONFIG.differential.rankedCount).toBe(4);
  });

  it('Ron makes at most 3 critical prompts (§6)', () =>
    expect(DEFAULT_SIMULATOR_CONFIG.ron.maxCriticalPrompts).toBe(3));

  it('time-management benchmark is 15 minutes (§26)', () =>
    expect(DEFAULT_SIMULATOR_CONFIG.scoring.timeBenchmarkMinutes).toBe(15));

  it('administrator passing score is 75 (§28)', () =>
    expect(DEFAULT_SIMULATOR_CONFIG.scoring.passingScore).toBe(75));
});

describe('grading bands (§28)', () => {
  it('are non-overlapping and contiguous from 0 to 100', () => {
    const bands = [...DEFAULT_SIMULATOR_CONFIG.scoring.gradingBands].sort((a, b) => a.min - b.min);
    expect(bands[0].min).toBe(0);
    expect(bands[bands.length - 1].max).toBe(100);
    for (let i = 1; i < bands.length; i++) {
      // Each band starts exactly one above the previous band's max — no gaps, no overlaps.
      expect(bands[i].min).toBe(bands[i - 1].max + 1);
    }
  });

  it('maps representative scores to the right band', () => {
    expect(gradeFor(95)?.label).toBe('Exceptional performance');
    expect(gradeFor(85)?.label).toBe('Competent performance with learning opportunities');
    expect(gradeFor(77)?.label).toBe('Meets minimum standard; additional practice recommended');
    expect(gradeFor(74)?.label).toBe('Does not yet meet the performance standard');
    expect(gradeFor(75)?.label).toBe('Meets minimum standard; additional practice recommended');
  });
});

describe('resolveConfig', () => {
  it('returns the approved defaults untouched when given no overrides', () => {
    expect(resolveConfig()).toEqual(DEFAULT_SIMULATOR_CONFIG);
  });

  it('applies a scenario override without mutating unrelated approved values', () => {
    const resolved = resolveConfig({ timing: { equipmentRetrievalSeconds: 60 } });
    expect(resolved.timing.equipmentRetrievalSeconds).toBe(60);
    // Everything else stays at the approved value.
    expect(resolved.timing.dispatchToneSeconds).toBe(3);
    expect(resolved.scoring.passingScore).toBe(75);
    expect(DEFAULT_SIMULATOR_CONFIG.timing.equipmentRetrievalSeconds).toBe(45);
  });
});
