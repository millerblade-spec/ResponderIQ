import { z } from 'zod';

/**
 * Validates a Truck Check / quiz attempt before it is trusted for persistence
 * (§4). .strict() rejects any unexpected field. A quiz outcome must carry quiz
 * detail; a truck_check outcome must not.
 */
export const truckCheckAttemptSchema = z
  .object({
    learnerId: z.string().min(1).max(200),
    scenarioId: z.string().min(1).max(100),
    outcome: z.enum(['truck_check', 'quiz']),
    mandatory: z.boolean(),
    forcedCheck: z.boolean(),
    quiz: z
      .object({
        correct: z.number().int().min(0).max(50),
        total: z.number().int().min(1).max(50),
        passed: z.boolean(),
        questionIds: z.array(z.string().min(1).max(100)).max(50),
        answers: z.record(z.string().min(1).max(100), z.string().min(1).max(100)),
        missedSubjects: z.array(z.string().min(1).max(100)).max(50),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => (v.outcome === 'quiz' ? v.quiz !== undefined : v.quiz === undefined), {
    message: 'A quiz outcome must include quiz detail; a truck_check outcome must not.',
  });

export type TruckCheckAttemptPayload = z.infer<typeof truckCheckAttemptSchema>;
