import { describe, it, expect } from 'vitest';
import { toReviewablePayload } from './toReviewablePayload';
import type { SceneState } from '@/lib/engine/types';

function fullState(): SceneState {
  return {
    phase: 'complete',
    elapsedMinutes: 14,
    resources: {
      additional_ems: { kind: 'additional_ems', status: 'not_requested' },
      fire_lift_assist: { kind: 'fire_lift_assist', status: 'not_requested' },
    },
    hazardFlags: ['a hazard'],
    familyState: 'calm',
    stairChairPrepped: true,
    patientCanBearWeight: false,
    differential: { current: [], history: [] },
    timeline: [],
    criticalFlags: [],
    actionsTaken: ['some-action'],
    firedEventIds: ['some-event'],
    dynamicEvents: [
      {
        id: 'dynamic-1',
        trigger: { type: 'time', atMinute: 5 },
        label: 'x',
        detail: 'y',
        apply: (s: SceneState) => s,
      },
    ],
    completion: { status: 'transport_initiated', atMinute: 14 },
  };
}

describe('toReviewablePayload', () => {
  it('excludes dynamicEvents entirely', () => {
    const result = toReviewablePayload(fullState());
    expect(result).not.toHaveProperty('dynamicEvents');
  });

  it('preserves every other field unchanged', () => {
    const state = fullState();
    const result = toReviewablePayload(state);

    expect(result.phase).toBe('complete');
    expect(result.elapsedMinutes).toBe(14);
    expect(result.resources).toEqual(state.resources);
    expect(result.hazardFlags).toEqual(['a hazard']);
    expect(result.familyState).toBe('calm');
    expect(result.stairChairPrepped).toBe(true);
    expect(result.patientCanBearWeight).toBe(false);
    expect(result.actionsTaken).toEqual(['some-action']);
    expect(result.firedEventIds).toEqual(['some-event']);
    expect(result.completion).toEqual({ status: 'transport_initiated', atMinute: 14 });
  });

  it('produces a result that genuinely survives JSON round-tripping (no function values leak through)', () => {
    const result = toReviewablePayload(fullState());
    const roundTripped = JSON.parse(JSON.stringify(result));
    expect(roundTripped).toEqual(result);
  });
});
