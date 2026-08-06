/**
 * Pure, typed state machine for packaging, the stair descent, the ALS workup,
 * the stretcher transfer, and the pain-management ending (fixes #12–#16).
 * No timers, no React — TransportOps schedules durations on the shared mission
 * clock and calls these transitions. Everything recorded here is debrief input.
 */
import { descentDevice } from './transport';

export type TransportStage =
  | 'device_choice' // pick stair chair / backboard / scoop from what you assessed (fix #12)
  | 'device_retrieval' // the chosen device is still on Medic 3 — someone is walking back (§9)
  | 'pelvic_choice' // binder, improvised sheet, or not indicated (fix #12)
  | 'pelvic_retrieval' // the binder is still on Medic 3 — same walk-back
  | 'securing' // strapping him to the chosen device (fix #13)
  | 'descending' // fire staff helping physically move him down (fix #13)
  | 'als_workup' // paramedic: full vitals, monitor, why-did-you-fall, new meds (fix #14)
  | 'stretcher_transfer' // downstairs: onto the stretcher; rigid device comes OFF (fix #15)
  | 'pain_decision' // binary give/withhold — ends the scenario at this tier (fix #16)
  | 'complete';

export interface TransportEventRecord {
  readonly id: string;
  readonly atSecond: number;
}

export interface TransportState {
  readonly stage: TransportStage;
  readonly deviceId?: string;
  /** True when the chosen device needed a walk-back to the truck first. */
  readonly deviceNeededRetrieval: boolean;
  readonly pelvicSupportId?: string;
  readonly pelvicNeededRetrieval: boolean;
  /** How many fire personnel physically helped on the stairs (fix #13). */
  readonly fireAssistCount: number;
  readonly alsWorkupDone: boolean;
  /** null until the transfer; meaningless (stays null) when no rigid device was used. */
  readonly rigidDeviceRemovedBeforeTransport: boolean | null;
  /** null until the ending decision is made. */
  readonly painMedicationGiven: boolean | null;
  readonly events: readonly TransportEventRecord[];
}

export function createTransportState(): TransportState {
  return {
    stage: 'device_choice',
    deviceNeededRetrieval: false,
    pelvicNeededRetrieval: false,
    fireAssistCount: 0,
    alsWorkupDone: false,
    rigidDeviceRemovedBeforeTransport: null,
    painMedicationGiven: null,
    events: [],
  };
}

function withEvent(state: TransportState, id: string, atSecond: number): TransportState {
  return { ...state, events: [...state.events, { id, atSecond }] };
}

/** True when a rigid full-length device (backboard/scoop) was used for the descent. */
export function rigidDeviceUsed(state: TransportState): boolean {
  return !!state.deviceId && descentDevice(state.deviceId)?.rigid === true;
}

/**
 * The learner picks the descent device off their assessment (fix #12). If it
 * was never brought in, someone walks back to the truck for it first — the
 * realistic ~45s consequence, not a penalty (§9).
 */
export function chooseDevice(
  state: TransportState,
  deviceId: string,
  opts: { onScene: boolean; atSecond: number },
): TransportState {
  if (state.stage !== 'device_choice' || !descentDevice(deviceId)) return state;
  const next: TransportState = {
    ...withEvent(state, `device:${deviceId}`, opts.atSecond),
    deviceId,
    deviceNeededRetrieval: !opts.onScene,
    stage: opts.onScene ? 'pelvic_choice' : 'device_retrieval',
  };
  return next;
}

/** The walked-back device arrives from Medic 3. */
export function deviceDelivered(state: TransportState, atSecond: number): TransportState {
  if (state.stage !== 'device_retrieval') return state;
  return { ...withEvent(state, 'device_delivered', atSecond), stage: 'pelvic_choice' };
}

/**
 * Pelvic support decision (fix #12): manufactured binder and improvised sheet
 * are equally correct; "not indicated" is also sound when the assessment
 * doesn't support a pelvic fracture. Only the manufactured binder can need a
 * walk-back — a sheet is improvised from what's at hand.
 */
export function choosePelvicSupport(
  state: TransportState,
  optionId: string,
  opts: { onScene: boolean; atSecond: number },
): TransportState {
  if (state.stage !== 'pelvic_choice') return state;
  const needsRetrieval = optionId === 'pelvic_binder' && !opts.onScene;
  return {
    ...withEvent(state, `pelvic:${optionId}`, opts.atSecond),
    pelvicSupportId: optionId,
    pelvicNeededRetrieval: needsRetrieval,
    stage: needsRetrieval ? 'pelvic_retrieval' : 'securing',
  };
}

/** The walked-back binder arrives from Medic 3. */
export function pelvicDelivered(state: TransportState, atSecond: number): TransportState {
  if (state.stage !== 'pelvic_retrieval') return state;
  return { ...withEvent(state, 'pelvic_delivered', atSecond), stage: 'securing' };
}

/** Patient strapped and padded on the chosen device (fix #13). */
export function securePatient(state: TransportState, atSecond: number): TransportState {
  if (state.stage !== 'securing') return state;
  return { ...withEvent(state, 'secured', atSecond), stage: 'descending' };
}

/**
 * The physical move down the stairs, with fire staff on the device (fix #13).
 * The machine records how many fire personnel actually helped; moving with none
 * is possible but becomes debrief material, not a hidden block.
 */
export function beginDescent(state: TransportState, fireAssistCount: number, atSecond: number): TransportState {
  if (state.stage !== 'descending') return state;
  return { ...withEvent(state, 'descent_started', atSecond), fireAssistCount };
}

export function completeDescent(state: TransportState, atSecond: number): TransportState {
  if (state.stage !== 'descending') return state;
  return { ...withEvent(state, 'descent_complete', atSecond), stage: 'als_workup' };
}

/** The paramedic's workup — vitals, monitor, why-he-fell, new medications (fix #14). */
export function completeAlsWorkup(state: TransportState, atSecond: number): TransportState {
  if (state.stage !== 'als_workup') return state;
  return { ...withEvent(state, 'als_workup', atSecond), alsWorkupDone: true, stage: 'stretcher_transfer' };
}

/**
 * The stretcher transfer (fix #15). When a rigid device (backboard/scoop) was
 * used, removing it BEFORE transport is the scored-correct action — riding to
 * the hospital on a board causes more harm than it prevents. Leaving it on is
 * allowed, recorded, and becomes debrief material.
 */
export function transferToStretcher(
  state: TransportState,
  opts: { removeRigidDevice?: boolean; atSecond: number },
): TransportState {
  if (state.stage !== 'stretcher_transfer') return state;
  const rigid = rigidDeviceUsed(state);
  return {
    ...withEvent(state, 'stretcher_transfer', opts.atSecond),
    rigidDeviceRemovedBeforeTransport: rigid ? (opts.removeRigidDevice ?? false) : null,
    stage: 'pain_decision',
  };
}

/** The binary pain decision that ends the scenario at this tier (fix #16). */
export function choosePainManagement(
  state: TransportState,
  optionId: 'give' | 'withhold',
  atSecond: number,
): TransportState {
  if (state.stage !== 'pain_decision') return state;
  return {
    ...withEvent(state, `pain:${optionId}`, atSecond),
    painMedicationGiven: optionId === 'give',
    stage: 'complete',
  };
}
