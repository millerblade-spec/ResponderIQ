'use server';

import { truckCheckAttemptSchema } from './schema';
import { recordTruckCheckAttempt } from '@/lib/db/truckCheckAttempts';

export type SaveTruckCheckResult =
  | { readonly status: 'saved'; readonly id: string }
  | { readonly status: 'validation_error'; readonly message: string }
  | { readonly status: 'persistence_error' };

/**
 * Server-side save boundary for a start-of-shift attempt (§4). Validates the
 * client payload, then persists via the database layer. The real cause of any
 * database failure stays server-side and is never forwarded to the caller.
 */
export async function saveTruckCheckAttempt(payload: unknown): Promise<SaveTruckCheckResult> {
  const parsed = truckCheckAttemptSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 'validation_error', message: 'The attempt could not be validated.' };
  }
  try {
    const { id } = await recordTruckCheckAttempt(parsed.data);
    return { status: 'saved', id };
  } catch (error) {
    console.error('Failed to save truck-check attempt:', error);
    return { status: 'persistence_error' };
  }
}
