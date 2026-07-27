import { z } from 'zod';

/**
 * The full operational-run payload (§ Step 10 persistence). This is what a
 * completed run serializes to and what the database stores as JSONB. It keeps
 * learner reflection, simulator feedback, administrator-facing facts, and
 * critical safety events as distinct parts of the model, and it never contains
 * a precomputed score — administrator scoring is always derived from these raw
 * facts at read time (operationalScoring.ts), so no score can leak to the
 * learner through the serialized data.
 */

const responseValue = z.union([z.string().max(4000), z.number().finite()]);
const responses = z.record(z.string().min(1).max(80), responseValue);

const timeMetricsSchema = z
  .object({
    totalSeconds: z.number().int().min(0).max(86_400),
    timeBeforePatientContactSeconds: z.number().int().min(0).max(86_400).nullable(),
    timeToHazardRecognitionSeconds: z.number().int().min(0).max(86_400).nullable(),
    timeToStageSeconds: z.number().int().min(0).max(86_400).nullable(),
    timeToClearanceSeconds: z.number().int().min(0).max(86_400).nullable(),
    timeToAssignPersonnelSeconds: z.number().int().min(0).max(86_400).nullable(),
    timeToInitialAssessmentSeconds: z.number().int().min(0).max(86_400).nullable(),
    equipmentRetrievalDelaySeconds: z.number().int().min(0).max(86_400),
    timeWithUnresolvedDistractionsSeconds: z.number().int().min(0).max(86_400),
    timeToDispositionSeconds: z.number().int().min(0).max(86_400).nullable(),
  })
  .strict();

const criticalEventSchema = z
  .object({
    id: z.string().min(1).max(80),
    whatHappened: z.string().min(1).max(500),
    atSecond: z.number().int().min(0).max(86_400),
  })
  .strict();

export const operationalRunSchema = z
  .object({
    evaluationId: z.string().uuid(),
    scenarioId: z.string().min(1).max(100),
    learner: z.object({ name: z.string().min(1).max(200), badgeId: z.string().min(1).max(100) }).strict(),
    difficulty: z.string().min(1).max(40),
    timeMetrics: timeMetricsSchema,
    differential: z
      .object({
        initial: z.array(z.string().max(80)).max(50),
        revisions: z
          .array(z.object({ atSecond: z.number().int().min(0), order: z.array(z.string().max(80)).max(50) }).strict())
          .max(200),
        workingImpression: z.string().max(80).nullable(),
      })
      .strict(),
    equipment: z
      .object({
        selected: z.array(z.string().max(80)).max(50),
        retrievals: z
          .array(
            z
              .object({
                equipmentId: z.string().max(80),
                requestedAtSecond: z.number().int().min(0),
                deliveredAtSecond: z.number().int().min(0).nullable(),
                canceled: z.boolean(),
              })
              .strict(),
          )
          .max(100),
      })
      .strict(),
    sceneSafety: z
      .object({
        windshieldReviewed: z.boolean(),
        dispatchStaging: z.boolean(),
        staged: z.boolean(),
        clearedToEnter: z.boolean(),
        sceneLightChoice: z.string().max(80).nullable(),
        ballisticChoice: z.string().max(80).nullable(),
      })
      .strict(),
    crew: z
      .object({
        assignments: z
          .array(
            z
              .object({
                responderId: z.string().max(80),
                taskId: z.string().max(80),
                status: z.string().max(40),
                startedAtSecond: z.number().int().min(0),
                completedAtSecond: z.number().int().min(0).nullable(),
              })
              .strict(),
          )
          .max(500),
      })
      .strict(),
    dynamics: z
      .object({
        issues: z
          .array(
            z
              .object({
                id: z.string().max(80),
                type: z.string().max(80),
                maxStageReached: z.number().int().min(0).max(20),
                resolved: z.boolean(),
                recognized: z.boolean(),
                firstActionAtSecond: z.number().int().min(0).nullable(),
              })
              .strict(),
          )
          .max(100),
      })
      .strict(),
    clinical: z
      .object({
        actionsPerformed: z
          .array(
            z
              .object({
                id: z.string().max(80),
                responderId: z.string().max(80),
                startedAtSecond: z.number().int().min(0),
                completedAtSecond: z.number().int().min(0).nullable(),
              })
              .strict(),
          )
          .max(200),
        findingsObtained: z.array(z.string().max(80)).max(200),
        reassessments: z.number().int().min(0).max(100),
        deteriorationOccurred: z.boolean(),
        deteriorationRecognized: z.boolean(),
      })
      .strict(),
    criticalEvents: z.array(criticalEventSchema).max(50),
    reflection: responses,
    feedback: responses,
  })
  .strict();

export type OperationalRun = z.infer<typeof operationalRunSchema>;
