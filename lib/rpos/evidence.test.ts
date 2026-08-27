import { describe, it, expect } from 'vitest';
import { buildLearnerEvidence, toRunEvidence } from './evidence';
import { computeOperationalScore } from '@/lib/review/operationalScoring';
import { makeStoredRun, makePoorRun } from './rpos.fixture';

describe('RPOS evidence', () => {
  it('scores a run through the administrator scoring path, not a second one', () => {
    const stored = makeStoredRun();
    const evidence = toRunEvidence(stored);
    const score = computeOperationalScore(stored.run);
    expect(evidence.score).toBe(score.score);
    expect(evidence.passed).toBe(score.passed);
    expect(evidence.criticalConcerns).toEqual(score.criticalConcerns);
    expect(evidence.categories).toHaveLength(score.categories.length);
  });

  it('converts category points to a percent of that category’s maximum', () => {
    const stored = makeStoredRun();
    const evidence = toRunEvidence(stored);
    const windshield = computeOperationalScore(stored.run).categories.find((c) => c.key === 'windshield_assessment');
    expect(windshield).toBeDefined();
    expect(evidence.categories.find((c) => c.key === 'windshield_assessment')?.percent).toBe(
      Math.round((windshield!.points / windshield!.max) * 100),
    );
  });

  it('carries critical safety concerns through instead of folding them into the score', () => {
    const evidence = toRunEvidence(makeStoredRun(makePoorRun()));
    expect(evidence.criticalConcerns.length).toBeGreaterThan(0);
  });

  it('sorts runs oldest first regardless of the order they were fetched in', () => {
    const older = makeStoredRun({}, { createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeStoredRun({}, { createdAt: '2026-03-01T00:00:00.000Z' });
    const evidence = buildLearnerEvidence({
      learner: { name: 'Alex Medic', badgeId: 'B-1234' },
      truckCheck: { hasCompletedTruckCheck: true, attemptCount: 1 },
      runs: [newer, older],
    });
    expect(evidence.runs.map((run) => run.createdAt)).toEqual([older.createdAt, newer.createdAt]);
  });
});
