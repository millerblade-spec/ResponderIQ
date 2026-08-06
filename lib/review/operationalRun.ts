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

/** Where the learner parked relative to the building (BLS-01 fix #3). */
const parkingSchema = z.object({ choice: z.string().max(80).nullable() }).strict();

/** The quick read on the patient's floor before entering (BLS-01 fix #10). */
const floorArrivalSchema = z.object({ lightingNoted: z.boolean(), doorNoted: z.boolean() }).strict();

/** Packaging → descent → transfer → pain decision (BLS-01 fixes #12–#16). */
const transportSchema = z
  .object({
    device: z.string().max(80).nullable(),
    deviceNeededRetrieval: z.boolean(),
    pelvicSupport: z.string().max(80).nullable(),
    pelvicNeededRetrieval: z.boolean(),
    fireAssistCount: z.number().int().min(0).max(20),
    alsWorkupDone: z.boolean(),
    rigidDeviceRemovedBeforeTransport: z.boolean().nullable(),
    painMedicationGiven: z.boolean().nullable(),
    events: z
      .array(z.object({ id: z.string().max(80), atSecond: z.number().int().min(0).max(86_400) }).strict())
      .max(100),
  })
  .strict();

/** A single treatment action's recorded outcome (Treatment Engine v1, §1-§9). */
const treatmentActionDetailSchema = z.union([
  z
    .object({
      kind: z.literal('oxygen'),
      deviceId: z.string().max(80),
      flowRateLpm: z.number().finite().optional(),
      peep: z.union([z.literal(0), z.literal(5), z.literal(8)]).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('iv_access'),
      method: z.enum(['peripheral_iv', 'ez_io']),
      site: z.string().max(80).optional(),
      success: z.boolean(),
    })
    .strict(),
  z.object({ kind: z.literal('infusion'), rate: z.number().finite() }).strict(),
  z.object({ kind: z.literal('pain_med') }).strict(),
]);

const treatmentActionSchema = z
  .object({
    id: z.string().max(80),
    status: z.enum(['not_started', 'in_progress', 'complete']),
    completedAtSecond: z.number().int().min(0).max(86_400).nullable(),
    detail: treatmentActionDetailSchema.nullable(),
  })
  .strict();

const aedCycleSchema = z
  .object({
    shockAdvised: z.boolean(),
    shocked: z.boolean(),
    atSecond: z.number().int().min(0).max(86_400),
  })
  .strict();

const aedStateSchema = z
  .object({
    stage: z.enum(['idle', 'analyzing', 'shock_advised', 'no_shock_advised', 'charging', 'shock_delivered', 'cpr']),
    cycles: z.array(aedCycleSchema).max(50),
    stageStartedAtSecond: z.number().int().min(0).max(86_400).nullable(),
    cprStartedAtSecond: z.number().int().min(0).max(86_400).nullable(),
  })
  .strict();

/** Treatment Engine v1 (§1-§10): treatments recorded, per-skill scope overrides, the AED cycle, and reassessment count. */
const treatmentSchema = z
  .object({
    actionsPerformed: z.array(treatmentActionSchema).max(100),
    /** Treatment ids an EMT-tier learner was authorized to perform off-scope, per skill (§4). */
    scopeOverrides: z.array(z.string().max(80)).max(50),
    aed: aedStateSchema.nullable(),
    reassessCount: z.number().int().min(0).max(100),
    lastReassessedAtSecond: z.number().int().min(0).max(86_400).nullable(),
    events: z.array(z.object({ id: z.string().max(80), atSecond: z.number().int().min(0).max(86_400) }).strict()).max(200),
  })
  .strict();

/**
 * The AI Ron conversational debrief record. This conversation IS the detailed
 * record of the run's evaluation — the questions Ron asked about the learner's
 * actual choices, the learner's transcribed answers, and the point-by-point
 * assessment of each. There is no hidden numeric score behind it. An
 * institutional/educator view would surface exactly this structure later.
 */
const ronDebriefSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            questionId: z.string().max(80),
            ronLine: z.string().max(600),
            answerTranscript: z.string().max(4000),
            inputMode: z.enum(['voice', 'typed']),
            assessment: z
              .object({
                verdict: z.enum(['sound', 'partial', 'unclear']),
                points: z
                  .array(
                    z
                      .object({
                        id: z.string().max(80),
                        label: z.string().max(300),
                        addressed: z.boolean(),
                      })
                      .strict(),
                  )
                  .max(20),
              })
              .strict(),
            ronReply: z.string().max(600),
          })
          .strict(),
      )
      .max(30),
    closingLine: z.string().max(600),
    allSound: z.boolean(),
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
    // Optional so pre-rebuild payloads (and other scenarios) stay valid.
    parking: parkingSchema.optional(),
    floorArrival: floorArrivalSchema.optional(),
    transport: transportSchema.optional(),
    ronDebrief: ronDebriefSchema.optional(),
    treatment: treatmentSchema.optional(),
    reflection: responses,
    feedback: responses,
  })
  .strict();

export type OperationalRun = z.infer<typeof operationalRunSchema>;
