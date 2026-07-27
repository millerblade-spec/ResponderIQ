import { describe, it, expect } from 'vitest';
import { computeOperationalScore, computeProgress } from './operationalScoring';
import { makeRun } from './operationalRun.fixture';

describe('operational scoring (§28)', () => {
  it('produces a 0–100 administrator score with a band and pass/fail at 75', () => {
    const s = computeOperationalScore(makeRun());
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
    expect(s.band).toBeDefined();
    expect(s.passed).toBe(s.score >= 75);
  });

  it('scores category performance without overlap in the config bands', () => {
    const s = computeOperationalScore(makeRun());
    expect(s.categories.length).toBe(12);
    for (const c of s.categories) expect(c.points).toBeLessThanOrEqual(c.max);
  });

  it('surfaces a critical safety concern even when the numeric score passes', () => {
    // A strong run, but the crew entered a staging-ordered scene before clearance.
    const run = makeRun({
      sceneSafety: { windshieldReviewed: true, dispatchStaging: true, staged: true, clearedToEnter: false, sceneLightChoice: null, ballisticChoice: null },
    });
    const s = computeOperationalScore(run);
    expect(s.criticalConcerns.length).toBeGreaterThanOrEqual(1);
    expect(s.criticalConcerns.join(' ')).toMatch(/before it was cleared/i);
    // Even if the number were passing, the concern is still recorded separately.
    expect(s.criticalConcerns.length).toBeGreaterThan(0);
  });

  it('flags a deterioration that was never reassessed as a critical concern', () => {
    const run = makeRun({
      clinical: { ...makeRun().clinical, reassessments: 0, deteriorationOccurred: true },
    });
    expect(computeOperationalScore(run).criticalConcerns.join(' ')).toMatch(/never reassessed/i);
  });
});

describe('progress across attempts (§ Step 10)', () => {
  it('reports improvement oldest → newest', () => {
    expect(computeProgress([70, 78, 85])).toMatchObject({ attempts: 3, improvement: 15, trend: 'improving' });
    expect(computeProgress([90, 80])).toMatchObject({ improvement: -10, trend: 'declining' });
    expect(computeProgress([80])).toMatchObject({ attempts: 1, improvement: null, trend: 'n/a' });
  });
});
