import { z } from 'zod';

/**
 * Validates a submitted completed-run state before it's trusted for
 * persistence. .strict() on every object means any field the client
 * sends that isn't listed here is a validation failure, not silently
 * ignored -- this is what actually enforces "reject unexpected fields."
 * .readonly() everywhere matches SceneState's own deeply-readonly
 * convention, so the inferred type needs no casting to be assigned
 * from a real SceneState (see toReviewablePayload.ts).
 *
 * Deliberately excludes SceneState's `dynamicEvents` field: it can
 * hold function-valued EventDefinition objects (apply/observe/trigger
 * callbacks) that cannot survive JSON serialization, and it has no
 * bearing on reviewing a run that has already finished -- it's live
 * gameplay scheduling state, not history. SimulatorPlayer's save
 * payload omits it entirely rather than relying on JSON.stringify to
 * silently drop it.
 */

const resourceInstanceSchema = z
  .object({
    kind: z.enum(['additional_ems', 'fire_lift_assist']),
    status: z.enum(['not_requested', 'en_route', 'on_scene', 'canceled']),
    requestedAtMinute: z.number().finite().optional(),
    etaMinutes: z.number().finite().optional(),
    arrivesAtMinute: z.number().finite().optional(),
  })
  .strict()
  .readonly();

const scoringObservationSchema = z
  .object({
    category: z.enum([
      'scene_safety',
      'situational_awareness',
      'resource_management',
      'timing',
      'communication',
      'prioritization',
      'adaptability',
      'differential_accuracy',
      'mission_completion',
    ]),
    severity: z.enum(['critical', 'notable', 'minor', 'positive']),
    tag: z
      .enum([
        'scene_safety',
        'situational_awareness',
        'communication',
        'leadership',
        'differential_thinking',
        'crew_resource_management',
        'emotional_intelligence',
        'professionalism',
        'bias_recognition',
        'patient_advocacy',
      ])
      .optional(),
    note: z.string().max(2000),
    learnerNarrative: z.string().max(2000).optional(),
    atMinute: z.number().finite(),
  })
  .strict()
  .readonly();

const timelineEntrySchema = z
  .object({
    atMinute: z.number().finite(),
    kind: z.enum(['action', 'event', 'acknowledgment', 'differential_update', 'phase_change', 'completion']),
    label: z.string().max(500),
    detail: z.string().max(2000).optional(),
    availableActionIds: z.array(z.string().max(200)).max(50).readonly().optional(),
    chosenActionId: z.string().max(200).optional(),
    observations: z.array(scoringObservationSchema).max(50).readonly().optional(),
  })
  .strict()
  .readonly();

const criticalFlagSchema = z
  .object({
    id: z.string().max(200),
    whatHappened: z.string().max(2000),
    whyDangerous: z.string().max(2000),
    consequence: z.string().max(2000),
    saferAlternative: z.string().max(2000),
    acknowledged: z.boolean(),
    atMinute: z.number().finite(),
  })
  .strict()
  .readonly();

const differentialReadSchema = z.enum([
  'mechanical_fall_only',
  'possible_medical_event_caused_fall',
  'unclear_needs_more_info',
  'unsafe_scene',
  'resource_need_extraction',
]);

const differentialHistoryEntrySchema = z
  .object({
    atMinute: z.number().finite(),
    reads: z.array(differentialReadSchema).max(20).readonly(),
    reason: z.string().max(2000).optional(),
  })
  .strict()
  .readonly();

export const reviewableSceneStateSchema = z
  .object({
    phase: z.enum(['dispatch', 'en_route', 'arrival', 'assessment', 'complication', 'resolution', 'complete']),
    elapsedMinutes: z.number().finite().min(0).max(24 * 60), // one day is already an absurd upper bound for a call
    pendingAcknowledgmentEventId: z.string().max(200).optional(),
    resources: z
      .object({
        additional_ems: resourceInstanceSchema,
        fire_lift_assist: resourceInstanceSchema,
      })
      .strict()
      .readonly(),
    hazardFlags: z.array(z.string().max(200)).max(50).readonly(),
    ambulancePosition: z.enum(['blocking_lane', 'clear_spot']).optional(),
    familyState: z.enum(['calm', 'agitated']),
    stairChairPrepped: z.boolean(),
    patientCanBearWeight: z.boolean(),
    differential: z
      .object({
        current: z.array(differentialReadSchema).max(20).readonly(),
        history: z.array(differentialHistoryEntrySchema).max(200).readonly(),
      })
      .strict()
      .readonly(),
    timeline: z.array(timelineEntrySchema).max(500).readonly(),
    criticalFlags: z.array(criticalFlagSchema).max(50).readonly(),
    actionsTaken: z.array(z.string().max(200)).max(500).readonly(),
    firedEventIds: z.array(z.string().max(200)).max(200).readonly(),
    completion: z
      .object({
        status: z.enum(['transport_initiated', 'unsafe_extrication_completed']),
        atMinute: z.number().finite(),
      })
      .strict()
      .readonly()
      .optional(),
  })
  .strict()
  .readonly();

export type ReviewableSceneState = z.infer<typeof reviewableSceneStateSchema>;

/** The full payload a save request must provide. scenarioId and evaluationId are the identity; state is the reviewable subset above. */
export const saveReviewRequestSchema = z
  .object({
    evaluationId: z.string().uuid(),
    scenarioId: z.literal('bls-01'), // the only real scenario id that exists right now
    state: reviewableSceneStateSchema,
  })
  .strict()
  .readonly();

export type SaveReviewRequest = z.infer<typeof saveReviewRequestSchema>;
