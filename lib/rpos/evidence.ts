/**
 * The bridge from what this app records today to what RPOS counts.
 *
 * The simulator records BLS-01 operational runs. RPOS counts graded cases.
 * They are not the same thing, and this module is where the difference is
 * stated openly rather than papered over:
 *
 * - The run score comes from computeOperationalScore() — the one scoring path,
 *   never a second derivation — and is then banded on the RPOS scale.
 *   A BLS-01 run graded 96 is a GREEN case; it is not "passing" in RPOS terms
 *   just because 96 clears the simulator's own 75-point bar.
 * - The run's critical concerns become the case's critical errors.
 * - Category shortfalls become Miss Board entries, mapped onto the six
 *   categories the prompts name.
 * - MAX BVM and DSI are reported as NOT REQUIRED for a BLS-01 run, because
 *   BLS-01 contains no invasive-airway sequence to perform. That is honest:
 *   the hard stops are not silently marked passed, they simply did not arise.
 *   A scenario that does contain them supplies real HardStopOutcomes instead.
 * - PROTOCOL and MEDICATION/DOSE misses have no source in the current engine —
 *   BLS-01 does not model doses or protocol selection. Those two categories
 *   stay empty until scenarios run against the loaded Fort Worth protocols.
 *   Empty because unmeasured, never because clean.
 */
import { computeOperationalScore } from '@/lib/review/operationalScoring';
import type { StoredOperationalRun } from '@/lib/db/operationalRuns';
import { bandFor } from './grading';
import { evaluateHardStops } from './hardStops';
import type {
  CaseRecord,
  Certification,
  HardStopOutcome,
  LearnerEvidence,
  LevelNumber,
  MissBoardEntry,
  MissCategory,
  PersonalityMode,
} from './types';

/**
 * Which Miss Board category each BLS-01 scoring category rolls into.
 * `protocol` and `medication_dose` are absent by design — see the note above.
 */
const CATEGORY_TO_MISS: Readonly<Record<string, MissCategory>> = {
  dispatch_preparation: 'assessment',
  differential_development: 'clinical_reasoning',
  equipment_preparation: 'operations',
  windshield_assessment: 'safety',
  scene_safety: 'safety',
  crew_leadership: 'operations',
  resource_management: 'operations',
  scene_dynamics: 'operations',
  patient_assessment: 'assessment',
  clinical_reasoning: 'clinical_reasoning',
  reassessment: 'assessment',
  time_management: 'operations',
};

/**
 * A category scoring below this share of its maximum goes on the Miss Board.
 * Set at the RPOS YELLOW floor: the point below which the program itself says
 * improvement or clarification is needed.
 */
const MISS_THRESHOLD_PERCENT = 90;

/** Safety misses are critical — they are the ones that block advancement while open. */
const CRITICAL_MISS_CATEGORIES: readonly MissCategory[] = ['safety'];

/** BLS-01 runs contain no invasive-airway sequence, so neither hard stop is required by them. */
const BLS01_HARD_STOPS: readonly HardStopOutcome[] = [
  { id: 'max_bvm', required: false, completedItemIds: [], notApplicableItemIds: [] },
  { id: 'dsi', required: false, completedItemIds: [], notApplicableItemIds: [] },
];

export interface RunToCaseOptions {
  readonly certification: Certification;
  readonly level: LevelNumber;
  /** Supplied by scenarios that actually run a hard stop; BLS-01 runs use the not-required default. */
  readonly hardStops?: readonly HardStopOutcome[];
  readonly challengeMode?: boolean;
}

/** Turns one stored BLS-01 run into an RPOS case. */
export function runToCase(stored: StoredOperationalRun, options: RunToCaseOptions): CaseRecord {
  const scored = computeOperationalScore(stored.run);
  const band = bandFor(scored.score);

  const misses = scored.categories
    .filter((category) => category.max > 0 && (category.points / category.max) * 100 < MISS_THRESHOLD_PERCENT)
    .map((category) => {
      const missCategory = CATEGORY_TO_MISS[category.key] ?? 'assessment';
      return {
        id: `${stored.evaluationId}:${category.key}`,
        category: missCategory,
        subject: category.label,
        detail: category.note,
        critical: CRITICAL_MISS_CATEGORIES.includes(missCategory),
        sourceCaseId: stored.evaluationId,
        createdAt: stored.createdAt,
      };
    });

  return {
    caseId: stored.evaluationId,
    certification: options.certification,
    level: options.level,
    score: scored.score,
    band: band.name,
    criticalErrors: scored.criticalConcerns,
    hardStops: evaluateHardStops(options.hardStops ?? BLS01_HARD_STOPS),
    misses,
    challengeMode: options.challengeMode ?? false,
    createdAt: stored.createdAt,
  };
}

/** The subjects a run put in front of the learner — every category it scored. Feeds Miss Board retesting. */
export function subjectsExercisedBy(stored: StoredOperationalRun): readonly string[] {
  return computeOperationalScore(stored.run).categories.map((category) => category.label);
}

export interface LearnerEvidenceInput {
  readonly learner: { readonly name: string; readonly badgeId: string };
  readonly certification: Certification;
  readonly level: LevelNumber;
  readonly personalityMode: PersonalityMode;
  /** Stored runs in any order; sorted oldest first here, since the mastery streak depends on order. */
  readonly runs: readonly StoredOperationalRun[];
  readonly missBoard: readonly MissBoardEntry[];
}

export function buildLearnerEvidence(input: LearnerEvidenceInput): LearnerEvidence {
  const cases = [...input.runs]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((run) => runToCase(run, { certification: input.certification, level: input.level }));

  return {
    learner: input.learner,
    certification: input.certification,
    level: input.level,
    personalityMode: input.personalityMode,
    cases,
    missBoard: input.missBoard,
  };
}
