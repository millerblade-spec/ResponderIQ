import { query } from './client';
import type { ReviewableSceneState } from '@/lib/review/schema';

export interface ReviewRecord {
  readonly evaluationId: string;
  readonly scenarioId: string;
  readonly state: ReviewableSceneState;
  readonly savedAt: string;
}

export interface ReviewRecordSummary {
  readonly evaluationId: string;
  readonly scenarioId: string;
  readonly savedAt: string;
}

interface ReviewRecordRow {
  readonly evaluation_id: string;
  readonly scenario_id: string;
  readonly state: ReviewableSceneState;
  readonly saved_at: string;
}

function fromRow(row: ReviewRecordRow): ReviewRecord {
  return { evaluationId: row.evaluation_id, scenarioId: row.scenario_id, state: row.state, savedAt: row.saved_at };
}

/** Postgres's SQLSTATE for a unique_violation -- the actual mechanism that makes save idempotent. */
const UNIQUE_VIOLATION = '23505';

export type SaveOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'already_saved' }
  | { readonly status: 'conflict' }; // same evaluationId reused for a different scenarioId

/**
 * Attempts to insert a new review record. evaluation_id's PRIMARY KEY
 * constraint is what actually guarantees this is retry-safe: a second
 * INSERT with the same evaluationId always fails at the database level
 * (23505), regardless of any race between concurrent requests -- this
 * function's job is to turn that database-level guarantee into the
 * three outcomes the caller actually needs, not to reimplement the
 * uniqueness check itself in application code (which could race).
 */
export async function saveReviewRecord(
  evaluationId: string,
  scenarioId: string,
  state: ReviewableSceneState,
): Promise<SaveOutcome> {
  try {
    await query(
      `INSERT INTO review_records (evaluation_id, scenario_id, state, saved_at)
       VALUES ($1, $2, $3, now())`,
      [evaluationId, scenarioId, JSON.stringify(state)],
    );
    return { status: 'saved' };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await getReviewRecord(evaluationId);
      // existing should always be found here (we just failed to insert
      // because a row with this id exists) -- treat a race where it
      // vanished between the failed insert and this read as a conflict
      // rather than silently reporting success for nothing.
      if (existing && existing.scenarioId === scenarioId) {
        return { status: 'already_saved' };
      }
      return { status: 'conflict' };
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

export async function getReviewRecord(evaluationId: string): Promise<ReviewRecord | null> {
  const { rows } = await query<ReviewRecordRow>(
    'SELECT evaluation_id, scenario_id, state, saved_at FROM review_records WHERE evaluation_id = $1',
    [evaluationId],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

/** Newest first, per requirement 5. limit is required (no unbounded default) so a caller can't accidentally load everything. */
export async function listReviewRecords(scenarioId: string, limit: number): Promise<readonly ReviewRecordSummary[]> {
  const { rows } = await query<Pick<ReviewRecordRow, 'evaluation_id' | 'scenario_id' | 'saved_at'>>(
    `SELECT evaluation_id, scenario_id, saved_at
     FROM review_records
     WHERE scenario_id = $1
     ORDER BY saved_at DESC
     LIMIT $2`,
    [scenarioId, limit],
  );
  return rows.map((row) => ({ evaluationId: row.evaluation_id, scenarioId: row.scenario_id, savedAt: row.saved_at }));
}

export async function clearReviewRecord(evaluationId: string): Promise<void> {
  await query('DELETE FROM review_records WHERE evaluation_id = $1', [evaluationId]);
}
