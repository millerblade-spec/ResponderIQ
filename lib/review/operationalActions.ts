'use server';

import { operationalRunSchema } from './operationalRun';
import { saveOperationalRun } from '@/lib/db/operationalRuns';

export type SaveOperationalRunResult =
  | { readonly status: 'saved'; readonly evaluationId: string; readonly attemptNumber: number }
  | { readonly status: 'already_saved'; readonly evaluationId: string; readonly attemptNumber: number }
  | { readonly status: 'validation_error'; readonly message: string }
  | { readonly status: 'persistence_error' };

/**
 * Server-side save boundary for a completed operational run (Step 10). Validates
 * the full payload, then persists via the shared review database. The real cause
 * of any database failure stays server-side.
 */
export async function saveCompletedOperationalRun(payload: unknown): Promise<SaveOperationalRunResult> {
  const parsed = operationalRunSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 'validation_error', message: 'The operational run could not be validated.' };
  }
  try {
    const outcome = await saveOperationalRun(parsed.data);
    return { status: outcome.status, evaluationId: parsed.data.evaluationId, attemptNumber: outcome.attemptNumber };
  } catch (error) {
    console.error('Failed to save operational run:', error);
    return { status: 'persistence_error' };
  }
}
