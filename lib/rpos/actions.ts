'use server';

import { refresh } from 'next/cache';
import { getSession } from '@/lib/auth/dal';
import { enrollLearner, getEnrollment, updateEnrollment } from '@/lib/db/rposEnrollments';
import { advancementInputSchema, enrollmentInputSchema } from './schema';
import { evaluateStanding } from './progression';
import { buildLearnerEvidence } from './evidence';
import { listAllLearnerRuns } from '@/lib/db/operationalRuns';
import { listMissBoard } from '@/lib/db/rposMissBoard';
import type { Certification, LevelNumber, PersonalityMode } from './types';

export interface RposFormState {
  readonly message?: string;
  readonly error?: string;
}

const SESSION_EXPIRED = 'Your session has expired. Sign in again.';

/**
 * Adds a responder to the RPOS roster.
 *
 * Gated on an admin session inside the action, not only by the page that
 * renders the form: a Server Action is its own public entry point, and the
 * roster is administrator data. Failure is reported without echoing the real
 * database error back to the browser, matching the other save boundaries.
 */
export async function enrollResponder(
  _previousState: RposFormState,
  formData: FormData,
): Promise<RposFormState> {
  if (!(await getSession())) return { error: SESSION_EXPIRED };

  const parsed = enrollmentInputSchema.safeParse({
    learnerName: formData.get('learnerName'),
    badgeId: formData.get('badgeId'),
    certification: formData.get('certification'),
  });
  if (!parsed.success) {
    return { error: 'Enter the responder’s name, badge / employee ID, and patch.' };
  }

  try {
    const outcome = await enrollLearner({
      badgeId: parsed.data.badgeId,
      learnerName: parsed.data.learnerName,
      certification: parsed.data.certification as Certification,
      level: parsed.data.level as LevelNumber | undefined,
      personalityMode: parsed.data.personalityMode as PersonalityMode | undefined,
    });
    // The roster renders on this page and is never cached (the page is dynamic
    // behind the admin session), so what needs updating is the client router's
    // copy of it, not a cache entry.
    refresh();
    return outcome.status === 'enrolled'
      ? { message: `${parsed.data.learnerName} is on the program at level ${outcome.enrollment.level}.` }
      : { message: `${outcome.enrollment.learnerName} (${parsed.data.badgeId}) is already on the program.` };
  } catch (error) {
    console.error('Failed to enroll responder:', error);
    return { error: 'Something went wrong enrolling that responder. Please try again.' };
  }
}

/**
 * Advances a responder to the next level.
 *
 * The advancement rule is re-checked here against current evidence, not just
 * in the UI that renders the button: 5 consecutive BLUE, no critical errors,
 * no unresolved critical Miss Board items, level requirements complete. A
 * request to advance someone who is not eligible is refused and says why,
 * because the whole point of the rule is that it is not a formality.
 */
export async function advanceResponder(
  _previousState: RposFormState,
  formData: FormData,
): Promise<RposFormState> {
  if (!(await getSession())) return { error: SESSION_EXPIRED };

  const parsed = advancementInputSchema.safeParse({
    badgeId: formData.get('badgeId'),
    level: formData.get('level'),
  });
  if (!parsed.success) return { error: 'That advancement request could not be read.' };

  try {
    const enrollment = await getEnrollment(parsed.data.badgeId);
    if (!enrollment) return { error: 'That responder is not on the program.' };

    const [runs, missBoard] = await Promise.all([
      listAllLearnerRuns(enrollment.badgeId),
      listMissBoard(enrollment.badgeId),
    ]);
    const standing = evaluateStanding(
      buildLearnerEvidence({
        learner: { name: enrollment.learnerName, badgeId: enrollment.badgeId },
        certification: enrollment.certification,
        level: enrollment.level,
        personalityMode: enrollment.personalityMode,
        runs,
        missBoard,
      }),
    );

    if (!standing.eligibleToAdvance) {
      return { error: `Not eligible to advance yet — ${standing.blockers[0].summary.toLowerCase()}.` };
    }
    if (standing.nextLevel == null) {
      return { error: `${enrollment.learnerName} is already at level 6, the top of the program.` };
    }
    if (parsed.data.level !== standing.nextLevel) {
      return { error: 'Advancement goes one level at a time.' };
    }

    const updated = await updateEnrollment(enrollment.badgeId, { level: standing.nextLevel });
    refresh();
    return { message: `${updated?.learnerName ?? enrollment.learnerName} advanced to level ${standing.nextLevel}.` };
  } catch (error) {
    console.error('Failed to advance responder:', error);
    return { error: 'Something went wrong advancing that responder. Please try again.' };
  }
}
