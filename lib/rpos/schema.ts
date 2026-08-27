import { z } from 'zod';

/**
 * Validation boundary for RPOS enrollment. Bounds match the columns the
 * values land in and the identity columns they join against
 * (operational_runs.learner_name / badge_id), so a value that validates here
 * can always be stored and can always be matched to a run.
 */
export const enrollmentInputSchema = z
  .object({
    learnerName: z.string().trim().min(1).max(200),
    badgeId: z.string().trim().min(1).max(100),
  })
  .strict();

export type EnrollmentInput = z.infer<typeof enrollmentInputSchema>;
