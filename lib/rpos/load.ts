import 'server-only';
import { listAllLearnerRuns, listRunsForBadges, type StoredOperationalRun } from '@/lib/db/operationalRuns';
import { getTruckCheckStatus, getTruckCheckStatusForLearners } from '@/lib/db/truckCheckAttempts';
import { getEnrollment, listEnrollments, type ProgramEnrollment } from '@/lib/db/programEnrollments';
import { buildLearnerEvidence } from './evidence';
import { evaluateProgram } from './progression';
import { RPOS_PROGRAM } from './program';
import type { ProgramState } from './types';

/**
 * The read path from the database to a program state. Everything below is
 * fetch-then-delegate: the reasoning lives in the pure modules beside this
 * file, so it stays testable without a database.
 *
 * Identity note: a responder is one badge id. operational_runs.badge_id and
 * truck_check_attempts.learner_id are the same identifier from two different
 * slices — that equivalence is asserted once, here, rather than assumed in
 * five places.
 */

const ROSTER_LIMIT = 50;

/** The display name for a responder: the roster name if enrolled, otherwise the one they last signed a run with. */
function resolveName(enrollment: ProgramEnrollment | null, runs: readonly StoredOperationalRun[], badgeId: string): string {
  if (enrollment) return enrollment.learnerName;
  const latest = runs[runs.length - 1];
  return latest?.run.learner.name ?? badgeId;
}

/**
 * One responder's program state. Returns null only when there is nothing to
 * show — not enrolled and no recorded runs — so an unknown badge id reads as
 * "no such responder" rather than an empty program.
 */
export async function loadLearnerProgram(badgeId: string): Promise<ProgramState | null> {
  const [enrollment, runs, truckCheck] = await Promise.all([
    getEnrollment(RPOS_PROGRAM.id, badgeId),
    listAllLearnerRuns(badgeId),
    getTruckCheckStatus(badgeId),
  ]);
  if (!enrollment && runs.length === 0) return null;

  return evaluateProgram(
    buildLearnerEvidence({ learner: { name: resolveName(enrollment, runs, badgeId), badgeId }, truckCheck, runs }),
  );
}

export interface RosterEntry {
  readonly enrollment: ProgramEnrollment;
  readonly state: ProgramState;
  readonly runCount: number;
  readonly lastRunAt: string | null;
}

/**
 * The full roster, evaluated. Three queries regardless of roster size (the
 * enrollments, then every run and Truck Check status for those badges in one
 * batch each) — the alternative, evaluating learner by learner, would put the
 * query count on the roster's size.
 */
export async function loadProgramRoster(limit: number = ROSTER_LIMIT): Promise<readonly RosterEntry[]> {
  const enrollments = await listEnrollments(RPOS_PROGRAM.id, limit);
  if (enrollments.length === 0) return [];

  const badgeIds = enrollments.map((enrollment) => enrollment.badgeId);
  const [runsByBadge, truckChecks] = await Promise.all([
    listRunsForBadges(badgeIds),
    getTruckCheckStatusForLearners(badgeIds),
  ]);

  return enrollments.map((enrollment) => {
    const runs = runsByBadge.get(enrollment.badgeId) ?? [];
    const truckCheck = truckChecks.get(enrollment.badgeId) ?? { hasCompletedTruckCheck: false, attemptCount: 0 };
    const state = evaluateProgram(
      buildLearnerEvidence({
        learner: { name: enrollment.learnerName, badgeId: enrollment.badgeId },
        truckCheck,
        runs,
      }),
    );
    return { enrollment, state, runCount: runs.length, lastRunAt: runs[runs.length - 1]?.createdAt ?? null };
  });
}
