import { query } from './client';

/**
 * Persistence for start-of-shift Truck Check / quiz attempts (§4). DB-backed,
 * following the same pattern as reviewRecords — never localStorage. Keyed by
 * learnerId (agency learner identity; provisional until the sign-in slice).
 */

export interface TruckCheckAttemptInput {
  readonly learnerId: string;
  readonly scenarioId: string;
  readonly outcome: 'truck_check' | 'quiz';
  readonly mandatory: boolean;
  readonly forcedCheck: boolean;
  /** Present only for a quiz attempt. */
  readonly quiz?: {
    readonly correct: number;
    readonly total: number;
    readonly passed: boolean;
    readonly questionIds: readonly string[];
    readonly answers: Readonly<Record<string, string>>;
    readonly missedSubjects: readonly string[];
  };
}

export interface TruckCheckStatus {
  /** True once the learner has completed at least one full Truck Check — later shifts then offer the choice. */
  readonly hasCompletedTruckCheck: boolean;
  readonly attemptCount: number;
}

export async function recordTruckCheckAttempt(input: TruckCheckAttemptInput): Promise<{ id: string }> {
  const detail = input.quiz
    ? {
        questionIds: input.quiz.questionIds,
        answers: input.quiz.answers,
        missedSubjects: input.quiz.missedSubjects,
      }
    : {};
  const { rows } = await query<{ id: string }>(
    `INSERT INTO truck_check_attempts
       (learner_id, scenario_id, outcome, mandatory, forced_check, quiz_correct, quiz_total, passed, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.learnerId,
      input.scenarioId,
      input.outcome,
      input.mandatory,
      input.forcedCheck,
      input.quiz?.correct ?? null,
      input.quiz?.total ?? null,
      input.quiz?.passed ?? null,
      JSON.stringify(detail),
    ],
  );
  return { id: String(rows[0].id) };
}

export async function getTruckCheckStatus(learnerId: string): Promise<TruckCheckStatus> {
  const { rows } = await query<{ total: string; completed_checks: string }>(
    `SELECT
        count(*) AS total,
        count(*) FILTER (WHERE outcome = 'truck_check') AS completed_checks
     FROM truck_check_attempts
     WHERE learner_id = $1`,
    [learnerId],
  );
  const row = rows[0];
  return {
    hasCompletedTruckCheck: Number(row?.completed_checks ?? 0) > 0,
    attemptCount: Number(row?.total ?? 0),
  };
}

export interface MissedSubjectCount {
  readonly subject: string;
  readonly count: number;
}

/** Aggregates the learner's frequently-missed subjects across quiz attempts (§4 adaptive tracking). */
export async function listFrequentlyMissedSubjects(
  learnerId: string,
  limit: number,
): Promise<readonly MissedSubjectCount[]> {
  const { rows } = await query<{ subject: string; count: string }>(
    `SELECT subject, count(*) AS count
     FROM truck_check_attempts,
          jsonb_array_elements_text(detail->'missedSubjects') AS subject
     WHERE learner_id = $1 AND outcome = 'quiz'
     GROUP BY subject
     ORDER BY count(*) DESC, subject ASC
     LIMIT $2`,
    [learnerId, limit],
  );
  return rows.map((r) => ({ subject: r.subject, count: Number(r.count) }));
}
