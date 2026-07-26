/**
 * Pure, typed clinical-workflow state machine (§19). Findings are revealed only
 * when the obtaining action COMPLETES; equipment and the scene-safety clinical
 * lock gate what can even be started. No timers, no React — the panel schedules
 * completion on the shared mission clock.
 */
import { clinicalAction, type ClinicalModel, type VitalSet } from './clinical';
import { equipmentLabel } from './equipment';

export type ClinicalActionStatus = 'not_started' | 'in_progress' | 'complete';

export interface ClinicalActionState {
  readonly status: ClinicalActionStatus;
  readonly assignedResponderId?: string;
  readonly startedAtSecond?: number;
  readonly etaSecond?: number;
}

export interface WorkingDifferential {
  readonly order: readonly string[];
  readonly lessLikely: readonly string[];
  readonly removed: readonly string[];
  readonly added: readonly string[];
  readonly impression?: string;
}

export interface DifferentialRevision {
  readonly atSecond: number;
  readonly order: readonly string[];
  readonly impression?: string;
}

export interface ClinicalState {
  readonly actions: Readonly<Record<string, ClinicalActionState>>;
  readonly deteriorated: boolean;
  readonly reassessCount: number;
  readonly differential: WorkingDifferential;
  readonly revisions: readonly DifferentialRevision[];
}

export function createClinicalState(initialDifferential: readonly string[]): ClinicalState {
  return {
    actions: {},
    deteriorated: false,
    reassessCount: 0,
    differential: { order: [...initialDifferential], lessLikely: [], removed: [], added: [], impression: undefined },
    revisions: [],
  };
}

function statusOf(state: ClinicalState, actionId: string): ClinicalActionStatus {
  return state.actions[actionId]?.status ?? 'not_started';
}

export function isComplete(state: ClinicalState, actionId: string): boolean {
  return statusOf(state, actionId) === 'complete';
}

export interface PerformEligibility {
  readonly ok: boolean;
  readonly reason?: string;
}

/** Whether a clinical action can be started right now, and if not, a clear explanation (§19). */
export function canPerform(
  state: ClinicalState,
  actionId: string,
  ctx: { unlocked: boolean; equipmentOnScene: readonly string[] },
): PerformEligibility {
  const def = clinicalAction(actionId);
  if (!def) return { ok: false, reason: 'Unknown action.' };
  if (!ctx.unlocked) return { ok: false, reason: 'Clinical actions are locked until you have patient contact.' };
  if (statusOf(state, actionId) !== 'not_started') return { ok: false, reason: 'Already in progress or done.' };
  if (def.requiredEquipmentId && !ctx.equipmentOnScene.includes(def.requiredEquipmentId)) {
    return { ok: false, reason: `${equipmentLabel(def.requiredEquipmentId)} is still on Medic 3.` };
  }
  if (def.requiresActionId && !isComplete(state, def.requiresActionId)) {
    const dep = clinicalAction(def.requiresActionId);
    return { ok: false, reason: `${dep?.label ?? def.requiresActionId} must be completed first.` };
  }
  return { ok: true };
}

export function startAction(
  state: ClinicalState,
  actionId: string,
  responderId: string,
  atSecond: number,
  durationSeconds: number,
): ClinicalState {
  return {
    ...state,
    actions: {
      ...state.actions,
      [actionId]: {
        status: 'in_progress',
        assignedResponderId: responderId,
        startedAtSecond: atSecond,
        etaSecond: atSecond + durationSeconds,
      },
    },
  };
}

/** The obtaining task finished — findings for this action become visible (§19). */
export function completeAction(state: ClinicalState, actionId: string): ClinicalState {
  const cur = state.actions[actionId];
  if (!cur || cur.status !== 'in_progress') return state;
  const reassessCount = actionId === 'reassess' ? state.reassessCount + 1 : state.reassessCount;
  return { ...state, reassessCount, actions: { ...state.actions, [actionId]: { ...cur, status: 'complete' } } };
}

/** Cancels an in-progress action; no partial findings are revealed (§19). */
export function cancelAction(state: ClinicalState, actionId: string): ClinicalState {
  const cur = state.actions[actionId];
  if (!cur || cur.status !== 'in_progress') return state;
  return { ...state, actions: { ...state.actions, [actionId]: { status: 'not_started' } } };
}

/** Scenario-driven deterioration. Sets internal state; it is only *seen* via reassessment (§ deterioration). */
export function applyDeterioration(state: ClinicalState): ClinicalState {
  if (state.deteriorated) return state;
  return { ...state, deteriorated: true };
}

/** Vitals as first obtained. */
export function obtainedVitals(model: ClinicalModel): VitalSet {
  return model.vitals;
}

/** Current vitals shown by reassessment — worse if the patient has deteriorated. */
export function reassessmentVitals(state: ClinicalState, model: ClinicalModel): VitalSet {
  return state.deteriorated ? model.vitalsDeteriorated : model.vitals;
}

/** Whether reassessment would show a change from the initial picture. */
export function reassessmentChanged(state: ClinicalState): boolean {
  return state.deteriorated;
}

// ---- Working differential revision (§ clinical reasoning) ----

function recordRevision(state: ClinicalState, diff: WorkingDifferential, atSecond: number): ClinicalState {
  return {
    ...state,
    differential: diff,
    revisions: [...state.revisions, { atSecond, order: diff.order, impression: diff.impression }],
  };
}

export function reorderDifferential(state: ClinicalState, id: string, direction: 'up' | 'down', atSecond: number): ClinicalState {
  const order = [...state.differential.order];
  const i = order.indexOf(id);
  if (i === -1) return state;
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= order.length) return state;
  [order[i], order[j]] = [order[j], order[i]];
  return recordRevision(state, { ...state.differential, order }, atSecond);
}

export function addDifferential(state: ClinicalState, id: string, atSecond: number): ClinicalState {
  if (state.differential.order.includes(id)) return state;
  return recordRevision(
    state,
    { ...state.differential, order: [...state.differential.order, id], added: [...state.differential.added, id] },
    atSecond,
  );
}

export function removeDifferential(state: ClinicalState, id: string, atSecond: number): ClinicalState {
  if (!state.differential.order.includes(id)) return state;
  return recordRevision(
    state,
    {
      ...state.differential,
      order: state.differential.order.filter((x) => x !== id),
      removed: [...state.differential.removed, id],
      impression: state.differential.impression === id ? undefined : state.differential.impression,
    },
    atSecond,
  );
}

export function markLessLikely(state: ClinicalState, id: string, atSecond: number): ClinicalState {
  if (state.differential.lessLikely.includes(id)) return state;
  return recordRevision(state, { ...state.differential, lessLikely: [...state.differential.lessLikely, id] }, atSecond);
}

export function setWorkingImpression(state: ClinicalState, id: string, atSecond: number): ClinicalState {
  return recordRevision(state, { ...state.differential, impression: id }, atSecond);
}
