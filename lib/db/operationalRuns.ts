import { query } from './client';
import type { OperationalRun } from '@/lib/review/operationalRun';

/**
 * Persistence for completed operational runs (Step 10). Same retry-safe,
 * idempotent-by-evaluation_id approach as reviewRecords — one shared review
 * system, not a second persistence path. The administrator score is NOT stored;
 * it is derived from the payload at read time.
 */

const UNIQUE_VIOLATION = '23505';

export type SaveRunOutcome =
  | { readonly status: 'saved'; readonly attemptNumber: number }
  | { readonly status: 'already_saved'; readonly attemptNumber: number };

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

/**
 * Saves a completed run. attempt_number is computed atomically from the count of
 * prior runs for this badge + scenario, so retries (same evaluation_id) never
 * inflate the count — the unique_violation path returns the existing attempt.
 */
export async function saveOperationalRun(run: OperationalRun): Promise<SaveRunOutcome> {
  try {
    const { rows } = await query<{ attempt_number: number }>(
      `INSERT INTO operational_runs
         (evaluation_id, scenario_id, learner_name, badge_id, difficulty, attempt_number, payload)
       VALUES (
         $1, $2, $3, $4, $5,
         (SELECT count(*) + 1 FROM operational_runs WHERE badge_id = $4 AND scenario_id = $2),
         $6
       )
       RETURNING attempt_number`,
      [run.evaluationId, run.scenarioId, run.learner.name, run.learner.badgeId, run.difficulty, JSON.stringify(run)],
    );
    return { status: 'saved', attemptNumber: Number(rows[0].attempt_number) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await getOperationalRun(run.evaluationId);
      return { status: 'already_saved', attemptNumber: existing?.attemptNumber ?? 1 };
    }
    throw error;
  }
}

export interface StoredOperationalRun {
  readonly evaluationId: string;
  readonly attemptNumber: number;
  readonly run: OperationalRun;
  readonly createdAt: string;
}

interface RunRow {
  readonly evaluation_id: string;
  readonly attempt_number: number;
  readonly payload: OperationalRun;
  readonly created_at: string;
}

export async function getOperationalRun(evaluationId: string): Promise<StoredOperationalRun | null> {
  const { rows } = await query<RunRow>(
    'SELECT evaluation_id, attempt_number, payload, created_at FROM operational_runs WHERE evaluation_id = $1',
    [evaluationId],
  );
  const row = rows[0];
  return row ? { evaluationId: row.evaluation_id, attemptNumber: Number(row.attempt_number), run: row.payload, createdAt: row.created_at } : null;
}

export interface OperationalRunSummary {
  readonly evaluationId: string;
  readonly learnerName: string;
  readonly badgeId: string;
  readonly scenarioId: string;
  readonly difficulty: string;
  readonly attemptNumber: number;
  readonly createdAt: string;
}

/** Admin list: newest first. limit is required so a caller can't load everything. */
export async function listOperationalRuns(scenarioId: string, limit: number): Promise<readonly OperationalRunSummary[]> {
  const { rows } = await query<{
    evaluation_id: string;
    learner_name: string;
    badge_id: string;
    scenario_id: string;
    difficulty: string;
    attempt_number: number;
    created_at: string;
  }>(
    `SELECT evaluation_id, learner_name, badge_id, scenario_id, difficulty, attempt_number, created_at
     FROM operational_runs WHERE scenario_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [scenarioId, limit],
  );
  return rows.map((r) => ({
    evaluationId: r.evaluation_id,
    learnerName: r.learner_name,
    badgeId: r.badge_id,
    scenarioId: r.scenario_id,
    difficulty: r.difficulty,
    attemptNumber: Number(r.attempt_number),
    createdAt: r.created_at,
  }));
}

/** All of a learner's attempts for a scenario, oldest first — for progress across attempts. */
export async function listLearnerAttempts(badgeId: string, scenarioId: string): Promise<readonly StoredOperationalRun[]> {
  const { rows } = await query<RunRow>(
    `SELECT evaluation_id, attempt_number, payload, created_at
     FROM operational_runs WHERE badge_id = $1 AND scenario_id = $2 ORDER BY created_at ASC`,
    [badgeId, scenarioId],
  );
  return rows.map((r) => ({ evaluationId: r.evaluation_id, attemptNumber: Number(r.attempt_number), run: r.payload, createdAt: r.created_at }));
}
