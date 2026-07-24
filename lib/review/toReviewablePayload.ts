import type { SceneState } from '@/lib/engine/types';
import type { ReviewableSceneState } from './schema';

/**
 * Builds exactly the subset of a live SceneState that's meant to be
 * persisted for review -- everything except `dynamicEvents` (which can
 * hold function-valued scheduling callbacks that were never meant to
 * be serialized, and has no bearing on reviewing a finished run).
 *
 * Deliberately an explicit allowlist rather than "spread everything
 * except X": if SceneState gains a new field later, it has to be
 * added here on purpose to reach persistence, rather than silently
 * being included (or silently missing) by default.
 */
export function toReviewablePayload(state: SceneState): ReviewableSceneState {
  return {
    phase: state.phase,
    elapsedMinutes: state.elapsedMinutes,
    pendingAcknowledgmentEventId: state.pendingAcknowledgmentEventId,
    resources: state.resources,
    hazardFlags: state.hazardFlags,
    ambulancePosition: state.ambulancePosition,
    familyState: state.familyState,
    stairChairPrepped: state.stairChairPrepped,
    patientCanBearWeight: state.patientCanBearWeight,
    differential: state.differential,
    timeline: state.timeline,
    criticalFlags: state.criticalFlags,
    actionsTaken: state.actionsTaken,
    firedEventIds: state.firedEventIds,
    completion: state.completion,
  };
}
