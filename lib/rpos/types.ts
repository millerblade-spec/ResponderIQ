/**
 * RPOS — the Responder Performance Operating System.
 *
 * A single completed run answers "how did that call go?". RPOS answers the
 * question an agency training officer actually has: "where is this responder
 * in their development, and what is the next thing they need?" It is a
 * program layer over the runs that already exist — an ordered set of stages,
 * each gated by requirements that are satisfied only by recorded evidence
 * (Truck Checks and completed operational runs), plus a competency rollup
 * across attempts.
 *
 * Two rules this model inherits from the rest of the codebase and must not
 * break:
 * - Nothing here is stored. Every number is derived at read time from the raw
 *   run payloads, exactly like operationalScoring.ts, so no score or program
 *   standing can leak to a learner through persisted data.
 * - A high score never erases a critical safety concern. Concerns are carried
 *   through the rollup independently of the levels and gate the final stage.
 */

/** Where a learner stands on one competency, across every attempt so far. */
export type CompetencyLevel = 'not_started' | 'developing' | 'proficient' | 'mastered';

export interface CompetencyRollup {
  readonly key: string;
  readonly label: string;
  /** Number of recorded runs that exercised this competency. */
  readonly attempts: number;
  /** Percent (0–100) on the most recent run, or null with no attempts. */
  readonly latestPercent: number | null;
  /** Best percent across all attempts, or null with no attempts. */
  readonly bestPercent: number | null;
  /** Mean percent across all attempts, rounded, or null with no attempts. */
  readonly averagePercent: number | null;
  readonly level: CompetencyLevel;
}

/** One recorded run, distilled to the facts the program reasons about. */
export interface RunEvidence {
  readonly evaluationId: string;
  readonly scenarioId: string;
  readonly attemptNumber: number;
  readonly createdAt: string;
  readonly score: number;
  readonly passed: boolean;
  readonly criticalConcerns: readonly string[];
  readonly categories: readonly { readonly key: string; readonly label: string; readonly percent: number }[];
}

/** Everything the program needs about one learner. Assembled by evidence.ts. */
export interface LearnerEvidence {
  readonly learner: { readonly name: string; readonly badgeId: string };
  readonly truckCheck: { readonly hasCompletedTruckCheck: boolean; readonly attemptCount: number };
  /** Oldest first — recency matters to the rollup, so the order is part of the contract. */
  readonly runs: readonly RunEvidence[];
}

export type StageStatus = 'locked' | 'available' | 'in_progress' | 'complete';

export interface RequirementOutcome {
  readonly met: boolean;
  /** Plain-language statement of where the learner actually stands on this requirement. */
  readonly detail: string;
}

export interface RequirementContext {
  readonly evidence: LearnerEvidence;
  readonly competencies: readonly CompetencyRollup[];
}

export interface ProgramRequirement {
  readonly id: string;
  readonly label: string;
  readonly evaluate: (context: RequirementContext) => RequirementOutcome;
}

export interface ProgramStage {
  readonly id: string;
  readonly title: string;
  /** Why this stage exists, in the training officer's language. */
  readonly purpose: string;
  readonly requirements: readonly ProgramRequirement[];
}

export interface Program {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly summary: string;
  readonly stages: readonly ProgramStage[];
}

export interface RequirementResult {
  readonly id: string;
  readonly label: string;
  readonly met: boolean;
  readonly detail: string;
}

export interface StageState {
  readonly id: string;
  readonly title: string;
  readonly purpose: string;
  readonly status: StageStatus;
  readonly requirements: readonly RequirementResult[];
}

export type ProgramStatus = 'not_started' | 'in_progress' | 'field_ready';

export interface ProgramState {
  readonly programId: string;
  readonly programVersion: number;
  readonly programTitle: string;
  readonly learner: { readonly name: string; readonly badgeId: string };
  readonly status: ProgramStatus;
  readonly stages: readonly StageState[];
  readonly competencies: readonly CompetencyRollup[];
  /** The single next thing this responder needs, derived from the first unmet requirement. */
  readonly nextAction: string;
  /** Critical safety concerns from the most recent run — never averaged away. */
  readonly openConcerns: readonly string[];
  readonly stagesComplete: number;
  readonly stageCount: number;
}
