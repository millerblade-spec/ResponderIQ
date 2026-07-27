/**
 * Pure, typed crew-resource-management state machine (§10–§14). No timers, no
 * React. The orchestrator schedules WHEN things happen (engine arrival, the 5s
 * officer prompt, task/retrieval completion) on the shared mission clock and
 * calls these transitions.
 *
 * Invariants enforced here (§ architecture "Prevent…"):
 * - one active task per responder
 * - cleared personnel can't be assigned
 * - equipment never becomes available without a completed retrieval
 * - engines can't be cleared with active obligations
 * - engine arrival is idempotent (no duplicate arrivals)
 */
import { DEFAULT_SIMULATOR_CONFIG, type SimulatorConfig } from '@/lib/engine/config';
import {
  MEDIC_CREW,
  engineResponders,
  taskDef,
  OFFICER_LINES,
  ENGINE_ARRIVAL_AUDIO,
  type Apparatus,
  type PersonnelStatus,
  type Responder,
} from './crew';

export interface Assignment {
  readonly taskId: string;
  readonly status: 'assigned' | 'in_progress' | 'complete';
  readonly startedAtSecond: number;
  readonly etaSecond?: number;
  readonly isRetrieval: boolean;
  readonly equipmentId?: string;
}

export interface ResponderRuntime extends Responder {
  readonly status: PersonnelStatus;
  readonly onScene: boolean;
  readonly assignment?: Assignment;
}

export interface ApparatusRuntime extends Apparatus {
  readonly arrived: boolean;
  readonly cleared: boolean;
  /** The roadway/safety obligation of a roadway_block engine has been transferred, so it can clear (§14). */
  readonly roadwayTransferred: boolean;
}

export interface OfficerResponse {
  readonly responderId: string;
  readonly taskId: string;
  readonly kind: 'accept' | 'safety';
  readonly line: string;
}

export interface AudioEvent {
  readonly apparatusId: string;
  readonly event: string;
  readonly atSecond: number;
}

export interface CrewState {
  readonly responders: Readonly<Record<string, ResponderRuntime>>;
  /** Stable display order. */
  readonly order: readonly string[];
  readonly apparatus: Readonly<Record<string, ApparatusRuntime>>;
  readonly equipmentOnScene: readonly string[];
  readonly resourceRequests: readonly string[];
  readonly officerResponses: readonly OfficerResponse[];
  readonly audioEvents: readonly AudioEvent[];
}

export function createCrewState(
  engines: readonly Apparatus[],
  equipmentOnScene: readonly string[],
): CrewState {
  const responders: Record<string, ResponderRuntime> = {};
  const order: string[] = [];
  for (const r of MEDIC_CREW) {
    responders[r.id] = { ...r, status: 'awaiting_assignment', onScene: true };
    order.push(r.id);
  }
  const apparatus: Record<string, ApparatusRuntime> = {};
  for (const e of engines) {
    apparatus[e.id] = { ...e, arrived: false, cleared: false, roadwayTransferred: false };
  }
  return {
    responders,
    order,
    apparatus,
    equipmentOnScene: [...equipmentOnScene],
    resourceRequests: [],
    officerResponses: [],
    audioEvents: [],
  };
}

/** An engine arrives (§11): its crew joins as Awaiting Assignment and the arrival audio sequence fires. Idempotent. */
export function engineArrives(state: CrewState, apparatusId: string, atSecond: number): CrewState {
  const eng = state.apparatus[apparatusId];
  if (!eng || eng.arrived) return state; // no duplicate arrivals
  const responders = { ...state.responders };
  const order = [...state.order];
  for (const r of engineResponders(eng)) {
    responders[r.id] = { ...r, status: 'awaiting_assignment', onScene: true };
    order.push(r.id);
  }
  return {
    ...state,
    responders,
    order,
    apparatus: { ...state.apparatus, [apparatusId]: { ...eng, arrived: true } },
    audioEvents: [
      ...state.audioEvents,
      ...ENGINE_ARRIVAL_AUDIO.map((event) => ({ apparatusId, event, atSecond })),
    ],
  };
}

function isFire(r: ResponderRuntime): boolean {
  return r.role === 'fire_officer' || r.role === 'firefighter';
}

function hasActiveTask(r: ResponderRuntime): boolean {
  return !!r.assignment && r.assignment.status !== 'complete';
}

/** Responders who can currently take a task (on scene, not cleared, not mid-task). */
export function freeResponders(state: CrewState): readonly ResponderRuntime[] {
  return state.order
    .map((id) => state.responders[id])
    .filter((r) => r.onScene && r.status !== 'cleared_from_call' && !hasActiveTask(r));
}

export interface AssignResult {
  readonly state: CrewState;
  readonly rejected?: 'busy' | 'cleared' | 'safety' | 'already_on_scene' | 'unknown_task';
}

/** Assigns a task to a responder (§12, §13). Returns a rejection reason instead of silently failing. */
export function assignTask(
  state: CrewState,
  responderId: string,
  taskId: string,
  atSecond: number,
  opts: { hazardControlled?: boolean; config?: SimulatorConfig } = {},
): AssignResult {
  const config = opts.config ?? DEFAULT_SIMULATOR_CONFIG;
  const hazardControlled = opts.hazardControlled ?? true;
  const r = state.responders[responderId];
  const def = taskDef(taskId);
  if (!r) return { state, rejected: 'unknown_task' };
  if (!def) return { state, rejected: 'unknown_task' };
  if (r.status === 'cleared_from_call') return { state, rejected: 'cleared' };
  if (hasActiveTask(r)) return { state, rejected: 'busy' };

  // Fire officer's safety response (§13): the officer won't send the crew through
  // an uncontrolled hazard.
  if (isFire(r) && def.safetyHazard && !hazardControlled) {
    return {
      state: {
        ...state,
        officerResponses: [
          ...state.officerResponses,
          { responderId, taskId, kind: 'safety', line: OFFICER_LINES.safety },
        ],
      },
      rejected: 'safety',
    };
  }

  // Equipment already on scene needs no retrieval.
  const isRetrieval = def.category === 'equipment' && !!def.equipmentId && !state.equipmentOnScene.includes(def.equipmentId);
  if (def.category === 'equipment' && def.equipmentId && state.equipmentOnScene.includes(def.equipmentId)) {
    return { state, rejected: 'already_on_scene' };
  }

  const duration = isRetrieval ? config.timing.equipmentRetrievalSeconds : def.durationSeconds;
  const assignment: Assignment = {
    taskId,
    status: 'assigned',
    startedAtSecond: atSecond,
    etaSecond: duration != null ? atSecond + duration : undefined,
    isRetrieval,
    equipmentId: def.equipmentId,
  };

  const officerResponses = isFire(r)
    ? [...state.officerResponses, { responderId, taskId, kind: 'accept' as const, line: OFFICER_LINES.accept }]
    : state.officerResponses;

  return {
    state: {
      ...state,
      responders: { ...state.responders, [responderId]: { ...r, status: 'assigned', assignment } },
      officerResponses,
    },
  };
}

/** Assigned → Task in Progress (§12). */
export function beginTask(state: CrewState, responderId: string): CrewState {
  const r = state.responders[responderId];
  if (!r?.assignment || r.assignment.status !== 'assigned') return state;
  return {
    ...state,
    responders: {
      ...state.responders,
      [responderId]: { ...r, status: 'task_in_progress', assignment: { ...r.assignment, status: 'in_progress' } },
    },
  };
}

/** Task complete (§12). A completed retrieval delivers its equipment to the scene (§9). */
export function completeTask(state: CrewState, responderId: string): CrewState {
  const r = state.responders[responderId];
  if (!r?.assignment || r.assignment.status === 'complete') return state;
  const equipmentOnScene =
    r.assignment.isRetrieval && r.assignment.equipmentId && !state.equipmentOnScene.includes(r.assignment.equipmentId)
      ? [...state.equipmentOnScene, r.assignment.equipmentId]
      : state.equipmentOnScene;
  return {
    ...state,
    equipmentOnScene,
    responders: {
      ...state.responders,
      [responderId]: { ...r, status: 'task_complete', assignment: { ...r.assignment, status: 'complete' } },
    },
  };
}

/** Cancels an active task; a canceled retrieval does NOT deliver equipment (§9, §12). */
export function cancelTask(state: CrewState, responderId: string): CrewState {
  const r = state.responders[responderId];
  if (!r?.assignment || r.assignment.status === 'complete') return state;
  return {
    ...state,
    responders: {
      ...state.responders,
      [responderId]: { ...r, status: 'awaiting_assignment', assignment: undefined },
    },
  };
}

/** Moves an active task from one responder to another free responder (§12). */
export function reassignTask(
  state: CrewState,
  fromId: string,
  toId: string,
  atSecond: number,
  opts: { hazardControlled?: boolean; config?: SimulatorConfig } = {},
): AssignResult {
  const from = state.responders[fromId];
  if (!from?.assignment || from.assignment.status === 'complete') return { state, rejected: 'busy' };
  const to = state.responders[toId];
  if (!to || hasActiveTask(to) || to.status === 'cleared_from_call') return { state, rejected: 'busy' };
  const taskId = from.assignment.taskId;
  const canceled = cancelTask(state, fromId);
  return assignTask(canceled, toId, taskId, atSecond, opts);
}

/** Marks a completed responder as ready for new work (§12 "replace a completed task"). */
export function clearCompletedTask(state: CrewState, responderId: string): CrewState {
  const r = state.responders[responderId];
  if (!r?.assignment || r.assignment.status !== 'complete') return state;
  return {
    ...state,
    responders: {
      ...state.responders,
      [responderId]: { ...r, status: 'awaiting_assignment', assignment: undefined },
    },
  };
}

/** Transfers a roadway_block engine's safety obligation so it can be cleared (§14). */
export function transferRoadway(state: CrewState, apparatusId: string): CrewState {
  const eng = state.apparatus[apparatusId];
  if (!eng) return state;
  return { ...state, apparatus: { ...state.apparatus, [apparatusId]: { ...eng, roadwayTransferred: true } } };
}

export interface ClearEligibility {
  readonly ok: boolean;
  readonly reason?: string;
}

/** Whether an engine can be cleared, and if not, exactly why (§14). */
export function canClearEngine(state: CrewState, apparatusId: string): ClearEligibility {
  const eng = state.apparatus[apparatusId];
  if (!eng) return { ok: false, reason: 'Unknown engine.' };
  if (eng.cleared) return { ok: false, reason: `${eng.name} is already cleared.` };

  for (const memberId of eng.memberIds) {
    const m = state.responders[memberId];
    if (!m) continue;
    if (m.assignment && m.assignment.status !== 'complete') {
      const label = taskDef(m.assignment.taskId)?.label ?? m.assignment.taskId;
      const verb = m.assignment.isRetrieval ? 'retrieving' : 'assigned to';
      return { ok: false, reason: `${eng.name} cannot be cleared while ${m.name} is ${verb} ${label}.` };
    }
    const obligation = m.assignment && taskDef(m.assignment.taskId)?.obligation;
    if (obligation) {
      return { ok: false, reason: `${eng.name} cannot be cleared while ${m.name} holds a ${obligation.replace('_', ' ')} role.` };
    }
  }
  if (eng.role === 'roadway_block' && !eng.roadwayTransferred) {
    return { ok: false, reason: `${eng.name} cannot be cleared while it is blocking the roadway.` };
  }
  return { ok: true };
}

/** Clears an engine once it has no active obligations (§14). Members become Cleared from Call. */
export function clearEngine(state: CrewState, apparatusId: string): CrewState {
  const eligibility = canClearEngine(state, apparatusId);
  if (!eligibility.ok) return state;
  const eng = state.apparatus[apparatusId];
  const responders = { ...state.responders };
  for (const memberId of eng.memberIds) {
    const m = responders[memberId];
    if (m) responders[memberId] = { ...m, status: 'cleared_from_call', onScene: false, assignment: undefined };
  }
  return {
    ...state,
    responders,
    apparatus: { ...state.apparatus, [apparatusId]: { ...eng, cleared: true } },
  };
}

/** True when clearing this engine would remove the last fire resource on scene (§14 — confirm). */
export function isLastFireResource(state: CrewState, apparatusId: string): boolean {
  const others = Object.values(state.apparatus).filter((a) => a.id !== apparatusId && a.arrived && !a.cleared);
  return others.length === 0;
}

export function requestResource(state: CrewState, resourceId: string): CrewState {
  if (state.resourceRequests.includes(resourceId)) return state;
  return { ...state, resourceRequests: [...state.resourceRequests, resourceId] };
}
