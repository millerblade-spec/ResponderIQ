/**
 * Turns stored records into the evidence the program reasons about.
 *
 * This is the only place RPOS touches run scoring, and it goes through
 * computeOperationalScore() rather than re-deriving anything — the program
 * and the administrator run review must never be able to disagree about how
 * a run scored. Pure: callers fetch, this transforms.
 */
import { computeOperationalScore } from '@/lib/review/operationalScoring';
import type { StoredOperationalRun } from '@/lib/db/operationalRuns';
import type { LearnerEvidence, RunEvidence } from './types';

/** Distills one stored run into program evidence, scoring it at read time. */
export function toRunEvidence(stored: StoredOperationalRun): RunEvidence {
  const score = computeOperationalScore(stored.run);
  return {
    evaluationId: stored.evaluationId,
    scenarioId: stored.run.scenarioId,
    attemptNumber: stored.attemptNumber,
    createdAt: stored.createdAt,
    score: score.score,
    passed: score.passed,
    criticalConcerns: score.criticalConcerns,
    categories: score.categories.map((category) => ({
      key: category.key,
      label: category.label,
      // Percent, not raw points: category maxima can differ, and every
      // program threshold is expressed on a 0–100 scale.
      percent: category.max === 0 ? 0 : Math.round((category.points / category.max) * 100),
    })),
  };
}

export interface LearnerEvidenceInput {
  readonly learner: { readonly name: string; readonly badgeId: string };
  readonly truckCheck: { readonly hasCompletedTruckCheck: boolean; readonly attemptCount: number };
  /** Stored runs in any order; sorted oldest first here so the rollup's recency rule is reliable. */
  readonly runs: readonly StoredOperationalRun[];
}

export function buildLearnerEvidence(input: LearnerEvidenceInput): LearnerEvidence {
  const runs = [...input.runs]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(toRunEvidence);
  return { learner: input.learner, truckCheck: input.truckCheck, runs };
}
