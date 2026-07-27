/**
 * Clinical-information audio gating (§ Step 11), in typed logic — not merely UI
 * visibility. A gated asset must not play until its condition is satisfied, so
 * sound can never reveal a finding the learner hasn't obtained.
 */
import type { AudioAsset } from './manifest';

export interface GatingContext {
  /** Whether a clinical action (e.g. apply_monitor, obtain_12_lead) has completed. */
  readonly clinicalComplete: (actionId: string) => boolean;
  /** Whether a piece of equipment is on scene AND in use (e.g. portable_suction). */
  readonly equipmentInUse: (equipmentId: string) => boolean;
}

/** Returns true if playback should be REJECTED because its gate isn't satisfied. */
export function isGated(assetOrGate: AudioAsset, ctx: GatingContext): boolean {
  const gate = assetOrGate.gate;
  switch (gate.kind) {
    case 'none':
      return false;
    case 'clinical_action':
      return !ctx.clinicalComplete(gate.actionId);
    case 'equipment':
      return !ctx.equipmentInUse(gate.equipmentId);
  }
}

/** A context that gates everything — the safe default before anything is obtained. */
export const CLOSED_GATE: GatingContext = {
  clinicalComplete: () => false,
  equipmentInUse: () => false,
};
