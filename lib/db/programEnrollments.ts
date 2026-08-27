import { query } from './client';

/**
 * RPOS program roster persistence. Only the roster is stored — who is on the
 * program. Stage status, competency levels, and program standing are derived
 * at read time in lib/rpos, the same discipline operational scores follow.
 *
 * Enrollment is idempotent by (program_id, badge_id): re-enrolling an existing
 * responder returns the existing row rather than failing or duplicating, so a
 * double-submitted form can never split one responder into two roster entries.
 */

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

export interface ProgramEnrollment {
  readonly programId: string;
  readonly learnerName: string;
  readonly badgeId: string;
  readonly enrolledAt: string;
}

interface EnrollmentRow {
  readonly program_id: string;
  readonly learner_name: string;
  readonly badge_id: string;
  readonly enrolled_at: string;
}

function toEnrollment(row: EnrollmentRow): ProgramEnrollment {
  return {
    programId: row.program_id,
    learnerName: row.learner_name,
    badgeId: row.badge_id,
    enrolledAt: row.enrolled_at,
  };
}

export type EnrollOutcome =
  | { readonly status: 'enrolled'; readonly enrollment: ProgramEnrollment }
  | { readonly status: 'already_enrolled'; readonly enrollment: ProgramEnrollment };

export async function enrollLearner(input: {
  readonly programId: string;
  readonly learnerName: string;
  readonly badgeId: string;
}): Promise<EnrollOutcome> {
  try {
    const { rows } = await query<EnrollmentRow>(
      `INSERT INTO program_enrollments (program_id, learner_name, badge_id)
       VALUES ($1, $2, $3)
       RETURNING program_id, learner_name, badge_id, enrolled_at`,
      [input.programId, input.learnerName, input.badgeId],
    );
    return { status: 'enrolled', enrollment: toEnrollment(rows[0]) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await getEnrollment(input.programId, input.badgeId);
      // The unique violation proves the row exists; the read back can only
      // miss it if it was deleted in between, in which case reporting the
      // attempted values is still truthful about who was enrolled.
      return {
        status: 'already_enrolled',
        enrollment:
          existing ?? {
            programId: input.programId,
            learnerName: input.learnerName,
            badgeId: input.badgeId,
            enrolledAt: new Date(0).toISOString(),
          },
      };
    }
    throw error;
  }
}

export async function getEnrollment(programId: string, badgeId: string): Promise<ProgramEnrollment | null> {
  const { rows } = await query<EnrollmentRow>(
    `SELECT program_id, learner_name, badge_id, enrolled_at
     FROM program_enrollments WHERE program_id = $1 AND badge_id = $2`,
    [programId, badgeId],
  );
  return rows[0] ? toEnrollment(rows[0]) : null;
}

/** Roster for a program, newest enrollment first. limit is required so a caller can't load everything. */
export async function listEnrollments(programId: string, limit: number): Promise<readonly ProgramEnrollment[]> {
  const { rows } = await query<EnrollmentRow>(
    `SELECT program_id, learner_name, badge_id, enrolled_at
     FROM program_enrollments WHERE program_id = $1 ORDER BY enrolled_at DESC, id DESC LIMIT $2`,
    [programId, limit],
  );
  return rows.map(toEnrollment);
}
