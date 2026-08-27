import { describe, it, expect } from 'vitest';
import {
  MASTERY_PERCENT,
  PROFICIENT_PERCENT,
  RPOS_COMPETENCIES,
  findCompetency,
  isAtLeast,
  rollupCompetencies,
} from './competency';
import { DEFAULT_SIMULATOR_CONFIG } from '@/lib/engine/config';
import { computeOperationalScore } from '@/lib/review/operationalScoring';
import { makeRun } from '@/lib/review/operationalRun.fixture';
import type { RunEvidence } from './types';

function run(percentsByKey: Record<string, number>, createdAt = '2026-01-01T00:00:00.000Z'): RunEvidence {
  return {
    evaluationId: `eval-${createdAt}`,
    scenarioId: 'bls-01',
    attemptNumber: 1,
    createdAt,
    score: 80,
    passed: true,
    criticalConcerns: [],
    categories: Object.entries(percentsByKey).map(([key, percent]) => ({ key, label: key, percent })),
  };
}

describe('RPOS competency rollup', () => {
  it('tracks exactly the categories the administrator scoring produces', () => {
    const scored = computeOperationalScore(makeRun()).categories;
    expect(RPOS_COMPETENCIES.map((c) => c.key)).toEqual(scored.map((c) => c.key));
    expect(RPOS_COMPETENCIES.map((c) => c.label)).toEqual(scored.map((c) => c.label));
  });

  it('takes its thresholds from the approved scoring config, not new numbers', () => {
    expect(PROFICIENT_PERCENT).toBe(DEFAULT_SIMULATOR_CONFIG.scoring.passingScore);
    expect(MASTERY_PERCENT).toBe(Math.max(...DEFAULT_SIMULATOR_CONFIG.scoring.gradingBands.map((b) => b.min)));
  });

  it('reports every tracked competency as not_started when there are no runs', () => {
    const rollup = rollupCompetencies([]);
    expect(rollup).toHaveLength(RPOS_COMPETENCIES.length);
    expect(rollup.every((c) => c.level === 'not_started' && c.attempts === 0)).toBe(true);
    expect(rollup.every((c) => c.latestPercent === null && c.bestPercent === null)).toBe(true);
  });

  it('levels on the most recent run, not the best one', () => {
    const rollup = rollupCompetencies([
      run({ scene_safety: 100 }, '2026-01-01T00:00:00.000Z'),
      run({ scene_safety: 40 }, '2026-02-01T00:00:00.000Z'),
    ]);
    const sceneSafety = findCompetency(rollup, 'scene_safety');
    expect(sceneSafety?.level).toBe('developing');
    expect(sceneSafety?.bestPercent).toBe(100);
    expect(sceneSafety?.latestPercent).toBe(40);
    expect(sceneSafety?.averagePercent).toBe(70);
    expect(sceneSafety?.attempts).toBe(2);
  });

  it('calls the passing standard proficient and the top band mastered', () => {
    const proficient = rollupCompetencies([run({ scene_safety: PROFICIENT_PERCENT })]);
    const belowProficient = rollupCompetencies([run({ scene_safety: PROFICIENT_PERCENT - 1 })]);
    const mastered = rollupCompetencies([run({ scene_safety: MASTERY_PERCENT })]);
    expect(findCompetency(proficient, 'scene_safety')?.level).toBe('proficient');
    expect(findCompetency(belowProficient, 'scene_safety')?.level).toBe('developing');
    expect(findCompetency(mastered, 'scene_safety')?.level).toBe('mastered');
  });

  it('ignores a scored category the program does not track', () => {
    const rollup = rollupCompetencies([run({ scene_safety: 100, some_future_category: 100 })]);
    expect(findCompetency(rollup, 'some_future_category')).toBeUndefined();
    expect(rollup).toHaveLength(RPOS_COMPETENCIES.length);
  });

  it('does not call a single mastered run mastered once the latest run drops below it', () => {
    const rollup = rollupCompetencies([
      run({ scene_safety: 100 }, '2026-01-01T00:00:00.000Z'),
      run({ scene_safety: PROFICIENT_PERCENT }, '2026-02-01T00:00:00.000Z'),
    ]);
    expect(findCompetency(rollup, 'scene_safety')?.level).toBe('proficient');
  });

  it('orders levels not_started → developing → proficient → mastered', () => {
    expect(isAtLeast('mastered', 'proficient')).toBe(true);
    expect(isAtLeast('proficient', 'proficient')).toBe(true);
    expect(isAtLeast('developing', 'proficient')).toBe(false);
    expect(isAtLeast('not_started', 'developing')).toBe(false);
  });
});
