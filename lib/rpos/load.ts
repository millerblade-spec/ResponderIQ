import 'server-only';
import { listAllLearnerRuns, listRunsForBadges } from '@/lib/db/operationalRuns';
import { getEnrollment, listEnrollments, type RposEnrollment } from '@/lib/db/rposEnrollments';
import { listMissBoard, listMissBoardsForBadges, recordMisses, resolveMisses } from '@/lib/db/rposMissBoard';
import { buildLearnerEvidence, runToCase, subjectsExercisedBy } from './evidence';
import { evaluateStanding } from './progression';
import { resolutionsFromCase } from './missBoard';
import type { LevelStanding } from './types';

/**
 * The read path from the database to a level standing. Fetch-then-delegate:
 * the reasoning lives in the pure modules beside this file, so it stays
 * testable without a database.
 *
 * Identity note: a responder is one badge id. operational_runs.badge_id,
 * truck_check_attempts.learner_id, and rpos_enrollments.badge_id are the same
 * identifier from three slices — asserted once, here.
 */

const ROSTER_LIMIT = 50;

/**
 * Brings a learner's Miss Board up to date with their recorded cases: records
 * misses from cases that have not been processed, then clears entries a later
 * case retested cleanly.
 *
 * Both steps are idempotent (insert-on-conflict-do-nothing, and resolve only
 * what is still open), so running this on every read is safe and keeps the
 * board correct without a background job. Cases are walked oldest first
 * because a case can only resolve entries that already existed when it ran.
 */
export async function syncMissBoard(badgeId: string): Promise<void> {
  const [runs, board] = await Promise.all([listAllLearnerRuns(badgeId), listMissBoard(badgeId)]);
  if (runs.length === 0) return;

  const enrollment = await getEnrollment(badgeId);
  const certification = enrollment?.certification ?? 'paramedic';
  const level = enrollment?.level ?? 1;

  let current = board;
  for (const run of runs) {
    const caseRecord = runToCase(run, { certification, level });
    const resolutions = resolutionsFromCase(current, caseRecord, subjectsExercisedBy(run));
    if (resolutions.length > 0) {
      await resolveMisses(resolutions.map((r) => ({ entryId: r.entryId, resolvedByCaseId: r.resolvedByCaseId })));
    }
    await recordMisses(
      caseRecord.misses.map((miss) => ({
        id: miss.id,
        badgeId,
        category: miss.category,
        subject: miss.subject,
        detail: miss.detail,
        critical: miss.critical,
        sourceCaseId: miss.sourceCaseId,
        createdAt: miss.createdAt,
      })),
    );
    current = await listMissBoard(badgeId);
  }
}

/**
 * One responder's standing. Returns null when there is nothing to show — not
 * enrolled and no recorded runs — so an unknown badge reads as "no such
 * responder" rather than an empty level 1.
 */
export async function loadLearnerStanding(badgeId: string): Promise<LevelStanding | null> {
  const [enrollment, runs] = await Promise.all([getEnrollment(badgeId), listAllLearnerRuns(badgeId)]);
  if (!enrollment && runs.length === 0) return null;

  await syncMissBoard(badgeId);
  const missBoard = await listMissBoard(badgeId);

  return evaluateStanding(
    buildLearnerEvidence({
      learner: { name: enrollment?.learnerName ?? runs[runs.length - 1]?.run.learner.name ?? badgeId, badgeId },
      certification: enrollment?.certification ?? 'paramedic',
      level: enrollment?.level ?? 1,
      personalityMode: enrollment?.personalityMode ?? 1,
      runs,
      missBoard,
    }),
  );
}

export interface RosterEntry {
  readonly enrollment: RposEnrollment;
  readonly standing: LevelStanding;
  readonly caseCount: number;
  readonly lastCaseAt: string | null;
}

/**
 * The full roster, evaluated. Two batched queries for the evidence regardless
 * of roster size — evaluating learner by learner would put the query count on
 * the roster's length.
 *
 * The roster does NOT sync Miss Boards: syncing writes, and a list view should
 * not write once per row. It reports the boards as they stand; opening a
 * responder syncs theirs.
 */
export async function loadRoster(limit: number = ROSTER_LIMIT): Promise<readonly RosterEntry[]> {
  const enrollments = await listEnrollments(limit);
  if (enrollments.length === 0) return [];

  const badgeIds = enrollments.map((enrollment) => enrollment.badgeId);
  const [runsByBadge, boardsByBadge] = await Promise.all([
    listRunsForBadges(badgeIds),
    listMissBoardsForBadges(badgeIds),
  ]);

  return enrollments.map((enrollment) => {
    const runs = runsByBadge.get(enrollment.badgeId) ?? [];
    const standing = evaluateStanding(
      buildLearnerEvidence({
        learner: { name: enrollment.learnerName, badgeId: enrollment.badgeId },
        certification: enrollment.certification,
        level: enrollment.level,
        personalityMode: enrollment.personalityMode,
        runs,
        missBoard: boardsByBadge.get(enrollment.badgeId) ?? [],
      }),
    );
    return {
      enrollment,
      standing,
      caseCount: runs.length,
      lastCaseAt: runs[runs.length - 1]?.createdAt ?? null,
    };
  });
}
