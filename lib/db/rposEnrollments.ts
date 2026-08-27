import { query } from './client';
import type { Certification, LevelNumber, PersonalityMode } from '@/lib/rpos/types';

/**
 * RPOS roster persistence: who is on the program, what patch they are graded
 * as, and which level they are working. Nothing derived is stored — standing,
 * bands, and the mastery streak are computed at read time in lib/rpos.
 *
 * Enrollment is idempotent by badge id: re-enrolling an existing responder
 * returns the existing row rather than failing or duplicating, so a
 * double-submitted form can never split one responder into two roster entries.
 * It also never silently changes their certification or level — advancing a
 * learner is its own deliberate call.
 */

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

export interface RposEnrollment {
  readonly badgeId: string;
  readonly learnerName: string;
  readonly certification: Certification;
  readonly level: LevelNumber;
  readonly personalityMode: PersonalityMode;
  readonly enrolledAt: string;
  readonly updatedAt: string;
}

interface EnrollmentRow {
  readonly badge_id: string;
  readonly learner_name: string;
  readonly certification: string;
  readonly level: number;
  readonly personality_mode: number;
  readonly enrolled_at: string;
  readonly updated_at: string;
}

function toEnrollment(row: EnrollmentRow): RposEnrollment {
  return {
    badgeId: row.badge_id,
    learnerName: row.learner_name,
    certification: row.certification as Certification,
    level: Number(row.level) as LevelNumber,
    personalityMode: Number(row.personality_mode) as PersonalityMode,
    enrolledAt: row.enrolled_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'badge_id, learner_name, certification, level, personality_mode, enrolled_at, updated_at';

export type EnrollOutcome =
  | { readonly status: 'enrolled'; readonly enrollment: RposEnrollment }
  | { readonly status: 'already_enrolled'; readonly enrollment: RposEnrollment };

export async function enrollLearner(input: {
  readonly badgeId: string;
  readonly learnerName: string;
  readonly certification: Certification;
  readonly level?: LevelNumber;
  readonly personalityMode?: PersonalityMode;
}): Promise<EnrollOutcome> {
  try {
    const { rows } = await query<EnrollmentRow>(
      `INSERT INTO rpos_enrollments (badge_id, learner_name, certification, level, personality_mode)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${SELECT_COLUMNS}`,
      [input.badgeId, input.learnerName, input.certification, input.level ?? 1, input.personalityMode ?? 1],
    );
    return { status: 'enrolled', enrollment: toEnrollment(rows[0]) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await getEnrollment(input.badgeId);
      if (existing) return { status: 'already_enrolled', enrollment: existing };
    }
    throw error;
  }
}

export async function getEnrollment(badgeId: string): Promise<RposEnrollment | null> {
  const { rows } = await query<EnrollmentRow>(
    `SELECT ${SELECT_COLUMNS} FROM rpos_enrollments WHERE badge_id = $1`,
    [badgeId],
  );
  return rows[0] ? toEnrollment(rows[0]) : null;
}

/** Roster, newest enrollment first. limit is required so a caller can't load everything. */
export async function listEnrollments(limit: number): Promise<readonly RposEnrollment[]> {
  const { rows } = await query<EnrollmentRow>(
    `SELECT ${SELECT_COLUMNS} FROM rpos_enrollments ORDER BY enrolled_at DESC, id DESC LIMIT $1`,
    [limit],
  );
  return rows.map(toEnrollment);
}

/**
 * Advances a learner to a new level, or corrects their certification or
 * personality mode. Returns null for a badge that is not on the roster rather
 * than creating one — advancing someone who was never enrolled is a mistake,
 * not an enrollment.
 */
export async function updateEnrollment(
  badgeId: string,
  changes: {
    readonly level?: LevelNumber;
    readonly certification?: Certification;
    readonly personalityMode?: PersonalityMode;
  },
): Promise<RposEnrollment | null> {
  const { rows } = await query<EnrollmentRow>(
    `UPDATE rpos_enrollments
        SET level            = COALESCE($2, level),
            certification    = COALESCE($3, certification),
            personality_mode = COALESCE($4, personality_mode),
            updated_at       = now()
      WHERE badge_id = $1
      RETURNING ${SELECT_COLUMNS}`,
    [badgeId, changes.level ?? null, changes.certification ?? null, changes.personalityMode ?? null],
  );
  return rows[0] ? toEnrollment(rows[0]) : null;
}
