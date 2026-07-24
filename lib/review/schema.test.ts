import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { saveReviewRequestSchema, reviewableSceneStateSchema } from './schema';

function validState() {
  return {
    phase: 'complete' as const,
    elapsedMinutes: 14,
    resources: {
      additional_ems: { kind: 'additional_ems' as const, status: 'not_requested' as const },
      fire_lift_assist: { kind: 'fire_lift_assist' as const, status: 'not_requested' as const },
    },
    hazardFlags: [],
    familyState: 'calm' as const,
    stairChairPrepped: false,
    patientCanBearWeight: true,
    differential: { current: [], history: [] },
    timeline: [],
    criticalFlags: [],
    actionsTaken: [],
    firedEventIds: [],
    completion: { status: 'transport_initiated' as const, atMinute: 14 },
  };
}

function validRequest() {
  return { evaluationId: randomUUID(), scenarioId: 'bls-01' as const, state: validState() };
}

describe('reviewableSceneStateSchema', () => {
  it('accepts a genuinely valid state', () => {
    expect(reviewableSceneStateSchema.safeParse(validState()).success).toBe(true);
  });

  it('rejects a missing required field', () => {
    const withoutPhase: Record<string, unknown> = { ...validState() };
    delete withoutPhase.phase;
    expect(reviewableSceneStateSchema.safeParse(withoutPhase).success).toBe(false);
  });

  it('rejects a field with the wrong type', () => {
    expect(reviewableSceneStateSchema.safeParse({ ...validState(), elapsedMinutes: 'fourteen' }).success).toBe(false);
  });

  it('rejects a phase value outside the known enum', () => {
    expect(reviewableSceneStateSchema.safeParse({ ...validState(), phase: 'invented_phase' }).success).toBe(false);
  });

  it('rejects an unexpected top-level field the client should never send', () => {
    const withExtra = { ...validState(), isAdmin: true };
    expect(reviewableSceneStateSchema.safeParse(withExtra).success).toBe(false);
  });

  it('rejects dynamicEvents entirely, even if the client tries to send it', () => {
    const withDynamicEvents = { ...validState(), dynamicEvents: [] };
    expect(reviewableSceneStateSchema.safeParse(withDynamicEvents).success).toBe(false);
  });

  it('rejects an unexpected field nested inside a resource entry', () => {
    const state = validState();
    const tampered = {
      ...state,
      resources: { ...state.resources, additional_ems: { ...state.resources.additional_ems, isAdminField: true } },
    };
    expect(reviewableSceneStateSchema.safeParse(tampered).success).toBe(false);
  });

  it('rejects an oversized timeline as a defense against an absurd payload', () => {
    const state = validState();
    const hugeTimeline = Array.from({ length: 501 }, (_, i) => ({
      atMinute: i,
      kind: 'action' as const,
      label: 'x',
    }));
    expect(reviewableSceneStateSchema.safeParse({ ...state, timeline: hugeTimeline }).success).toBe(false);
  });

  it('rejects an absurdly long string in a text field', () => {
    const state = validState();
    const tampered = { ...state, hazardFlags: ['x'.repeat(10_000)] };
    // hazardFlags entries have no explicit max, so this checks a field that does: criticalFlag text.
    const withHugeFlag = {
      ...state,
      criticalFlags: [
        {
          id: 'x',
          whatHappened: 'y'.repeat(5000),
          whyDangerous: 'y',
          consequence: 'y',
          saferAlternative: 'y',
          acknowledged: true,
          atMinute: 1,
        },
      ],
    };
    expect(reviewableSceneStateSchema.safeParse(withHugeFlag).success).toBe(false);
    void tampered; // documents that hazardFlags itself is unbounded in length per-entry by design (short strings expected); not asserted here
  });

  it('accepts a state with no completion (still mid-scenario) since completion is optional at the type level', () => {
    const withoutCompletion: Record<string, unknown> = { ...validState() };
    delete withoutCompletion.completion;
    expect(reviewableSceneStateSchema.safeParse(withoutCompletion).success).toBe(true);
  });
});

describe('saveReviewRequestSchema', () => {
  it('accepts a genuinely valid request', () => {
    expect(saveReviewRequestSchema.safeParse(validRequest()).success).toBe(true);
  });

  it('rejects a non-UUID evaluationId', () => {
    expect(saveReviewRequestSchema.safeParse({ ...validRequest(), evaluationId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects any scenarioId other than the one real scenario', () => {
    expect(saveReviewRequestSchema.safeParse({ ...validRequest(), scenarioId: 'bls-99' }).success).toBe(false);
  });

  it('rejects a request with an unexpected top-level field', () => {
    const withExtra = { ...validRequest(), adminOverride: true };
    expect(saveReviewRequestSchema.safeParse(withExtra).success).toBe(false);
  });
});
