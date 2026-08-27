import { describe, it, expect } from 'vitest';
import { buildLearnerEvidence, runToCase, subjectsExercisedBy } from './evidence';
import { computeOperationalScore } from '@/lib/review/operationalScoring';
import { bandFor } from './grading';
import { at, makePoorRun, makeStoredRun } from './rpos.fixture';

const options = { certification: 'paramedic' as const, level: 1 as const };

describe('BLS-01 run → RPOS case', () => {
  it('scores through the administrator scoring path, then bands it on the RPOS scale', () => {
    const stored = makeStoredRun();
    const scored = computeOperationalScore(stored.run);
    const caseRecord = runToCase(stored, options);
    expect(caseRecord.score).toBe(scored.score);
    expect(caseRecord.band).toBe(bandFor(scored.score).name);
    expect(caseRecord.criticalErrors).toEqual(scored.criticalConcerns);
  });

  it('reports both hard stops as NOT REQUIRED for a BLS-01 run, rather than passed', () => {
    const caseRecord = runToCase(makeStoredRun(), options);
    expect(caseRecord.hardStops.map((stop) => stop.id).sort()).toEqual(['dsi', 'max_bvm']);
    // Not required is not the same claim as "the learner completed the checklist".
    expect(caseRecord.hardStops.every((stop) => stop.required === false)).toBe(true);
    expect(caseRecord.hardStops.every((stop) => stop.missedItems.length === 0)).toBe(true);
  });

  it('accepts real hard-stop outcomes from a scenario that actually runs one', () => {
    const caseRecord = runToCase(makeStoredRun(), {
      ...options,
      hardStops: [{ id: 'dsi', required: true, completedItemIds: ['ecg'], notApplicableItemIds: [] }],
    });
    const dsi = caseRecord.hardStops.find((stop) => stop.id === 'dsi');
    expect(dsi?.required).toBe(true);
    expect(dsi?.passed).toBe(false);
  });

  it('puts a weak category on the Miss Board and marks safety misses critical', () => {
    const caseRecord = runToCase(makeStoredRun(makePoorRun()), options);
    const subjects = caseRecord.misses.map((miss) => miss.subject);
    expect(subjects).toContain('Scene safety');
    const sceneSafety = caseRecord.misses.find((miss) => miss.subject === 'Scene safety');
    expect(sceneSafety?.category).toBe('safety');
    expect(sceneSafety?.critical).toBe(true);
  });

  it('records no protocol or medication/dose misses, because BLS-01 measures neither', () => {
    const caseRecord = runToCase(makeStoredRun(makePoorRun()), options);
    const categories = caseRecord.misses.map((miss) => miss.category);
    // Empty because unmeasured — not because the learner was clean on them.
    expect(categories).not.toContain('protocol');
    expect(categories).not.toContain('medication_dose');
  });

  it('gives each miss a stable id, so re-processing a case never duplicates the board', () => {
    const stored = makeStoredRun(makePoorRun());
    const first = runToCase(stored, options).misses.map((miss) => miss.id);
    const second = runToCase(stored, options).misses.map((miss) => miss.id);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });

  it('lists every category a run exercised, for Miss Board retesting', () => {
    const stored = makeStoredRun();
    const subjects = subjectsExercisedBy(stored);
    expect(subjects).toContain('Scene safety');
    expect(subjects).toHaveLength(computeOperationalScore(stored.run).categories.length);
  });

  it('orders cases oldest first regardless of the order they were fetched in', () => {
    const older = makeStoredRun({}, { createdAt: at(2) });
    const newer = makeStoredRun({}, { createdAt: at(9) });
    const evidence = buildLearnerEvidence({
      learner: { name: 'Alex Medic', badgeId: 'B-1234' },
      certification: 'paramedic',
      level: 1,
      personalityMode: 1,
      runs: [newer, older],
      missBoard: [],
    });
    expect(evidence.cases.map((c) => c.createdAt)).toEqual([older.createdAt, newer.createdAt]);
  });

  it('stamps every case with the learner’s patch and level', () => {
    const evidence = buildLearnerEvidence({
      learner: { name: 'Dana Rivera', badgeId: 'B-9' },
      certification: 'emt',
      level: 4,
      personalityMode: 0,
      runs: [makeStoredRun()],
      missBoard: [],
    });
    expect(evidence.cases[0].certification).toBe('emt');
    expect(evidence.cases[0].level).toBe(4);
  });
});
