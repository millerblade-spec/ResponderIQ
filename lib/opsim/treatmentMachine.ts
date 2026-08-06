/**
 * Pure, typed Treatment Engine state machine (Treatment Engine v1). No
 * timers, no React — AedPanel/TreatmentPanel schedule durations on the
 * shared mission clock and call these transitions. Everything recorded here
 * is future debrief/run-facts input, mirroring transportMachine.ts's shape.
 */
import { treatmentDef, type TreatmentConfig } from './treatment';

export type TreatmentActionStatus = 'not_started' | 'in_progress' | 'complete';

export type TreatmentDetail =
  | { readonly kind: 'oxygen'; readonly deviceId: string; readonly flowRateLpm?: number; readonly peep?: 0 | 5 | 8 }
  | { readonly kind: 'iv_access'; readonly method: 'peripheral_iv' | 'ez_io'; readonly site?: string; readonly success: boolean }
  | { readonly kind: 'infusion'; readonly rate: number }
  | { readonly kind: 'pain_med' };

export interface TreatmentActionState {
  readonly status: TreatmentActionStatus;
  readonly completedAtSecond?: number;
  readonly detail?: TreatmentDetail;
}

export type AedStage =
  | 'idle'
  | 'analyzing'
  | 'shock_advised'
  | 'no_shock_advised'
  | 'charging'
  | 'shock_delivered'
  | 'cpr';

export interface AedCycleRecord {
  readonly shockAdvised: boolean;
  readonly shocked: boolean;
  readonly atSecond: number;
}

export interface AedState {
  readonly stage: AedStage;
  readonly cycles: readonly AedCycleRecord[];
  /** When the current analyzing/charging countdown began — drives the live countdown badge. */
  readonly stageStartedAtSecond?: number;
  readonly cprStartedAtSecond?: number;
}

export function createAedState(): AedState {
  return { stage: 'idle', cycles: [] };
}

export interface TreatmentEventRecord {
  readonly id: string;
  readonly atSecond: number;
}

export interface TreatmentState {
  readonly actions: Readonly<Record<string, TreatmentActionState>>;
  /** Per-skill training authorization once an EMT clicks "YES — Let's Learn" on a Paramedic-only skill (§4). */
  readonly scopeOverrides: Readonly<Record<string, boolean>>;
  readonly aed?: AedState;
  readonly reassessCount: number;
  readonly lastReassessedAtSecond?: number;
  readonly events: readonly TreatmentEventRecord[];
}

export function createTreatmentState(): TreatmentState {
  return { actions: {}, scopeOverrides: {}, aed: undefined, reassessCount: 0, events: [] };
}

function withEvent(state: TreatmentState, id: string, atSecond: number): TreatmentState {
  return { ...state, events: [...state.events, { id, atSecond }] };
}

export function treatmentStatus(state: TreatmentState, treatmentId: string): TreatmentActionStatus {
  return state.actions[treatmentId]?.status ?? 'not_started';
}

export function treatmentDetail(state: TreatmentState, treatmentId: string): TreatmentDetail | undefined {
  return state.actions[treatmentId]?.detail;
}

/**
 * Records a completed treatment action (§5–§8 — every v1 treatment except
 * AED is instant: "simple success model for now", no dosage math).
 */
export function recordTreatment(
  state: TreatmentState,
  treatmentId: string,
  detail: TreatmentDetail,
  atSecond: number,
): TreatmentState {
  return {
    ...withEvent(state, `treatment:${treatmentId}`, atSecond),
    actions: { ...state.actions, [treatmentId]: { status: 'complete', completedAtSecond: atSecond, detail } },
  };
}

/** Records the learner's per-skill Scope-of-Practice training authorization (§4). Idempotent, never punitive. */
export function authorizeScope(state: TreatmentState, treatmentId: string, atSecond: number): TreatmentState {
  if (state.scopeOverrides[treatmentId]) return state;
  return {
    ...withEvent(state, `scope_override:${treatmentId}`, atSecond),
    scopeOverrides: { ...state.scopeOverrides, [treatmentId]: true },
  };
}

/**
 * Whether the Scope-of-Practice prompt needs to gate this treatment right
 * now, for this learner/run. EMT-scope treatments and any treatment for a
 * paramedic-tier learner never need it; a paramedic-only treatment for an
 * EMT-tier learner needs it until that specific skill has been authorized.
 */
export function scopeCleared(state: TreatmentState, config: TreatmentConfig, treatmentId: string): boolean {
  const def = treatmentDef(treatmentId);
  if (!def) return false;
  if (def.scope === 'emt') return true;
  if (config.learnerScope === 'paramedic') return true;
  return state.scopeOverrides[treatmentId] === true;
}

/**
 * Reassess Patient (§2) — a persistent action available any time once patient
 * contact is established. Never gated on scope or equipment; the panel is
 * responsible for only rendering the button once patient contact exists.
 */
export function reassessPatient(state: TreatmentState, atSecond: number): TreatmentState {
  return {
    ...withEvent(state, 'reassess', atSecond),
    reassessCount: state.reassessCount + 1,
    lastReassessedAtSecond: atSecond,
  };
}

// ---- AED / CPR cycle (§9) ----

/** "Analyzing..." begins — a 10s countdown the panel schedules on the mission clock. Also the re-entry point for repeated cycles from CPR. */
export function beginAnalysis(state: TreatmentState, atSecond: number): TreatmentState {
  const aed = state.aed ?? createAedState();
  if (aed.stage !== 'idle' && aed.stage !== 'cpr') return state;
  return {
    ...withEvent(state, 'aed_analyzing', atSecond),
    aed: { ...aed, stage: 'analyzing', stageStartedAtSecond: atSecond },
  };
}

/**
 * The analysis resolves. `shockAdvised` is supplied by the caller from the
 * scenario's TreatmentModel — this function never decides shockability
 * itself (§9: "do not hard-code rhythm behavior. Allow scenarios to control
 * shockability").
 */
export function resolveAnalysis(state: TreatmentState, shockAdvised: boolean, atSecond: number): TreatmentState {
  if (!state.aed || state.aed.stage !== 'analyzing') return state;
  return {
    ...withEvent(state, shockAdvised ? 'aed_shock_advised' : 'aed_no_shock_advised', atSecond),
    aed: { ...state.aed, stage: shockAdvised ? 'shock_advised' : 'no_shock_advised' },
  };
}

/** "Charge" begins — a 5s countdown (§9). */
export function beginCharge(state: TreatmentState, atSecond: number): TreatmentState {
  if (!state.aed || state.aed.stage !== 'shock_advised') return state;
  return {
    ...withEvent(state, 'aed_charging', atSecond),
    aed: { ...state.aed, stage: 'charging', stageStartedAtSecond: atSecond },
  };
}

/** Shock delivered — records the cycle and moves to Shock Delivered (§9). */
export function deliverShock(state: TreatmentState, atSecond: number): TreatmentState {
  if (!state.aed || state.aed.stage !== 'charging') return state;
  const cycles = [...state.aed.cycles, { shockAdvised: true, shocked: true, atSecond }];
  return { ...withEvent(state, 'aed_shock_delivered', atSecond), aed: { ...state.aed, stage: 'shock_delivered', cycles } };
}

/**
 * CPR resumes automatically — either right after a delivered shock, or
 * directly from a No Shock Advised analysis (§9). Records a no-shock cycle
 * when entering from that path (a shock cycle was already recorded by
 * deliverShock).
 */
export function beginCpr(state: TreatmentState, atSecond: number): TreatmentState {
  if (!state.aed) return state;
  if (state.aed.stage !== 'shock_delivered' && state.aed.stage !== 'no_shock_advised') return state;
  const cycles =
    state.aed.stage === 'no_shock_advised'
      ? [...state.aed.cycles, { shockAdvised: false, shocked: false, atSecond }]
      : state.aed.cycles;
  return {
    ...withEvent(state, 'aed_cpr_started', atSecond),
    aed: { ...state.aed, stage: 'cpr', cprStartedAtSecond: atSecond, cycles },
  };
}

/**
 * "Reanalyze rhythm" from CPR loops back into another analyze/shock cycle —
 * repeated cycles fall out of beginAnalysis's own guard for free (§9: "the
 * engine should support repeated AED cycles").
 */
export function reanalyze(state: TreatmentState, atSecond: number): TreatmentState {
  return beginAnalysis(state, atSecond);
}
