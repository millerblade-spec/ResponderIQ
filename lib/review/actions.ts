'use server';

import { saveReviewRequestSchema } from './schema';
import { saveReviewRecord } from '@/lib/db/reviewRecords';

export type SaveReviewResult =
  | { readonly status: 'saved'; readonly evaluationId: string }
  | { readonly status: 'already_saved'; readonly evaluationId: string }
  | { readonly status: 'validation_error'; readonly message: string }
  | { readonly status: 'persistence_error' };

/**
 * The single server-side save boundary for a completed run. Called
 * directly from SimulatorPlayer (a Client Component) via startTransition
 * -- not bound to a <form>, since a scenario completion isn't a form
 * submission.
 *
 * Trust boundary: the client supplies the raw play-by-play state
 * (timeline of real actions/observations, as recorded by the reducer
 * during actual play) and its own evaluationId for retry-safety. It
 * does not supply, and this never accepts, any precomputed score or
 * grade -- computeHiddenSummary/buildDebrief always derive that from
 * the raw state at *read* time (see AdminReview), from functions the
 * client has no path to influence.
 */
export async function saveCompletedRun(payload: unknown): Promise<SaveReviewResult> {
  const parsed = saveReviewRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 'validation_error', message: 'The submitted result could not be validated.' };
  }

  const { evaluationId, scenarioId, state } = parsed.data;

  try {
    const outcome = await saveReviewRecord(evaluationId, scenarioId, state);

    if (outcome.status === 'conflict') {
      // Same evaluationId reused for a different scenario -- an invalid
      // request, not a database failure, so it's a validation_error
      // rather than something a client should treat as retry-safe.
      return { status: 'validation_error', message: 'This evaluation id is already in use for a different run.' };
    }

    return { status: outcome.status, evaluationId };
  } catch (error) {
    // Real cause stays server-side only -- never forwarded to the caller.
    console.error('Failed to save review record:', error);
    return { status: 'persistence_error' };
  }
}
