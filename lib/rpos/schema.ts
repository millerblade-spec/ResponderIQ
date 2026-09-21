import { z } from 'zod';

/**
 * Validation boundary for RPOS roster changes. Bounds match the columns the
 * values land in and the identity columns they join against
 * (operational_runs.learner_name / badge_id), so a value that validates here
 * can always be stored and can always be matched to a case.
 */

/** "What patch are we training today?" — scope and grading follow this. */
export const certificationSchema = z.enum(['emt', 'paramedic']);

/** The six levels. */
export const levelSchema = z.coerce.number().int().min(1).max(6);

/** 0 clinical, 1 coach, 2 Ron Mode. Delivery only. */
export const personalityModeSchema = z.coerce.number().int().min(0).max(2);

export const enrollmentInputSchema = z
  .object({
    learnerName: z.string().trim().min(1).max(200),
    badgeId: z.string().trim().min(1).max(100),
    certification: certificationSchema,
    level: levelSchema.optional(),
    personalityMode: personalityModeSchema.optional(),
  })
  .strict();

export const advancementInputSchema = z
  .object({
    badgeId: z.string().trim().min(1).max(100),
    level: levelSchema,
  })
  .strict();

export type EnrollmentInput = z.infer<typeof enrollmentInputSchema>;
export type AdvancementInput = z.infer<typeof advancementInputSchema>;
