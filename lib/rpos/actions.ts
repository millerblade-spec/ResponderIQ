'use server';

import { refresh } from 'next/cache';
import { getSession } from '@/lib/auth/dal';
import { enrollLearner } from '@/lib/db/programEnrollments';
import { enrollmentInputSchema } from './schema';
import { RPOS_PROGRAM } from './program';

export interface EnrollFormState {
  readonly message?: string;
  readonly error?: string;
}

/**
 * Adds a responder to the RPOS roster.
 *
 * Gated on an admin session inside the action, not only by the page that
 * renders the form: a Server Action is its own public entry point, and the
 * roster is administrator data. Failure is reported without echoing the real
 * database error back to the browser, matching the other save boundaries.
 */
export async function enrollResponder(
  _previousState: EnrollFormState,
  formData: FormData,
): Promise<EnrollFormState> {
  if (!(await getSession())) {
    return { error: 'Your session has expired. Sign in again to enroll a responder.' };
  }

  const parsed = enrollmentInputSchema.safeParse({
    learnerName: formData.get('learnerName'),
    badgeId: formData.get('badgeId'),
  });
  if (!parsed.success) {
    return { error: 'Enter the responder’s name and badge / employee ID.' };
  }

  try {
    const outcome = await enrollLearner({
      programId: RPOS_PROGRAM.id,
      learnerName: parsed.data.learnerName,
      badgeId: parsed.data.badgeId,
    });
    // The roster is rendered on the same page as this form and is never
    // cached (the page is dynamic behind the admin session), so what needs
    // updating is the client router's copy of it, not a cache entry —
    // refresh() is the Next 16 API for exactly that.
    refresh();
    return outcome.status === 'enrolled'
      ? { message: `${parsed.data.learnerName} is on the program.` }
      : { message: `${outcome.enrollment.learnerName} (${parsed.data.badgeId}) is already on the program.` };
  } catch (error) {
    console.error('Failed to enroll responder:', error);
    return { error: 'Something went wrong enrolling that responder. Please try again.' };
  }
}
