/**
 * Pure presentation-layer selectors for the operational command console.
 *
 * These functions ONLY read the existing operational state (scene safety, crew,
 * scene dynamics, clinical) and derive small view-models for the console's
 * left/right columns (Scenario Progress, Scene Status, Immediate Priorities,
 * Equipment/Retrieval, live Timeline). They add no new domain state, dispatch no
 * actions, and change no timing/scoring/persistence — every value is computed
 * from state the simulator machines already own.
 */
import type { SceneSafetyState } from '@/lib/opsim/sceneMachine';
import { isClearedToEnter, clinicalUnlocked } from '@/lib/opsim/sceneMachine';
import type { CrewState } from '@/lib/opsim/crewMachine';
import type { DynamicsState } from '@/lib/opsim/dynamicsMachine';
import type { ClinicalState } from '@/lib/opsim/clinicalMachine';
import { STATUS_LABELS, taskDef, equipmentLabelForTask } from '@/lib/opsim/crew';
import { distractionType } from '@/lib/opsim/dynamics';

export type StepState = 'done' | 'active' | 'pending';

export interface ProgressStep {
  readonly id: string;
  readonly label: string;
  readonly state: StepState;
}

export type PriorityTone = 'critical' | 'behavioral' | 'pending' | 'caution' | 'info';

export interface Priority {
  readonly id: string;
  readonly label: string;
  readonly tone: PriorityTone;
}

export interface RetrievalItem {
  readonly responderName: string;
  readonly label: string;
  readonly remainingSeconds: number | null;
}

export interface TimelineEvent {
  readonly atSecond: number;
  readonly label: string;
  readonly tone: PriorityTone;
}

/** The aggregate of live sub-machine states the console reads. */
export interface LiveConsoleState {
  readonly scene?: SceneSafetyState;
  readonly crew: CrewState;
  readonly dynamics?: DynamicsState;
  readonly clinical?: ClinicalState;
  readonly ronArrived: boolean;
  readonly equipmentOnScene: readonly string[];
  readonly now: number;
}

function clinicalCompleteCount(clinical?: ClinicalState): number {
  if (!clinical) return 0;
  return Object.values(clinical.actions).filter((a) => a.status === 'complete').length;
}

function activeDistractions(dynamics?: DynamicsState) {
  if (!dynamics) return [];
  return dynamics.order.map((id) => dynamics.issues[id]).filter((i) => i && !i.resolved);
}

/** Fire personnel physically on scene, not cleared, waiting for a task (§12). */
function awaitingCount(crew: CrewState): number {
  return crew.order
    .map((id) => crew.responders[id])
    .filter((r) => r && r.onScene && r.status === 'awaiting_assignment').length;
}

/** Retrieval / task work currently in flight, for the Equipment column. */
export function retrievalItems(crew: CrewState, now: number): RetrievalItem[] {
  const items: RetrievalItem[] = [];
  for (const id of crew.order) {
    const r = crew.responders[id];
    const a = r?.assignment;
    if (!a || a.status === 'complete') continue;
    if (!a.isRetrieval) continue;
    const remaining = a.etaSecond != null ? Math.max(0, a.etaSecond - now) : null;
    items.push({ responderName: r.name, label: equipmentLabelForTask(a.taskId), remainingSeconds: remaining });
  }
  return items;
}

const STAGE_LABELS: Record<SceneSafetyState['stage'], string> = {
  windshield: 'Windshield assessment',
  staging: 'Staged — awaiting clearance',
  safe_to_enter: 'Safe to enter',
  exited: 'Approaching patient',
  patient_contact: 'At patient',
};

export function sceneStageLabel(scene?: SceneSafetyState): string {
  return scene ? STAGE_LABELS[scene.stage] : '—';
}

/**
 * The high-level run checklist for the Scenario Progress column. Dispatch,
 * differential, and equipment are complete by the time the on-scene console
 * renders (the console only mounts once the OpSim stage is `ready`), so those
 * three read `done`; the remaining steps derive from live scene/crew/clinical
 * state.
 */
export function progressSteps(live: LiveConsoleState): ProgressStep[] {
  const { scene, crew, clinical, ronArrived } = live;
  const safe = scene ? isClearedToEnter(scene) : false;
  const windshieldDone = scene?.windshieldReviewed ?? false;
  const clinicalUnlockedNow = scene ? clinicalUnlocked(scene) : false;
  const clinicalStarted = clinical ? Object.keys(clinical.actions).length > 0 : false;
  const clinicalDone = clinicalCompleteCount(clinical) > 0;
  const anyEngineCleared = Object.values(crew.apparatus).some((a) => a.cleared);

  const windshield: StepState = windshieldDone ? 'done' : 'active';
  const sceneSafety: StepState = safe ? 'done' : windshieldDone ? 'active' : 'pending';
  const crewOps: StepState = anyEngineCleared ? 'done' : ronArrived ? 'active' : 'pending';
  const patient: StepState = clinicalDone ? 'done' : clinicalUnlockedNow || clinicalStarted ? 'active' : 'pending';
  const disposition: StepState = clinicalDone ? 'active' : 'pending';

  return [
    { id: 'dispatch', label: 'Dispatch / Responding', state: 'done' },
    { id: 'differential', label: 'Differential challenge', state: 'done' },
    { id: 'equipment', label: 'Equipment selection', state: 'done' },
    { id: 'windshield', label: 'Windshield assessment', state: windshield },
    { id: 'scene_safety', label: 'Scene safety', state: sceneSafety },
    { id: 'crew', label: 'Crew operations', state: crewOps },
    { id: 'patient', label: 'Patient assessment', state: patient },
    { id: 'disposition', label: 'Disposition', state: disposition },
  ];
}

/**
 * The current actionable issues, most urgent first, capped at three (the console
 * shows no more than three so the learner triages rather than reads a wall).
 * Never shows scores or correctness.
 */
export function immediatePriorities(live: LiveConsoleState): Priority[] {
  const { scene, crew, dynamics, clinical } = live;
  const out: Priority[] = [];

  if (clinical?.deteriorated) {
    out.push({ id: 'deteriorating', label: 'Patient deteriorating — reassess now', tone: 'critical' });
  }
  if (scene && !isClearedToEnter(scene)) {
    out.push({ id: 'scene_unsafe', label: 'Scene not yet safe to enter', tone: 'critical' });
  }
  for (const issue of activeDistractions(dynamics)) {
    if (issue.managed) continue;
    const label = distractionType(issue.type)?.label ?? 'Scene distraction';
    out.push({
      id: `dyn_${issue.id}`,
      label: issue.stageIndex > 0 ? `${label} — escalating` : `${label} — needs attention`,
      tone: 'behavioral',
    });
  }
  const awaiting = awaitingCount(crew);
  if (awaiting > 0) {
    out.push({
      id: 'awaiting',
      label: `${awaiting} fire ${awaiting === 1 ? 'responder' : 'personnel'} awaiting assignment`,
      tone: 'caution',
    });
  }
  if (scene && clinicalUnlocked(scene) && clinicalCompleteCount(clinical) === 0) {
    out.push({ id: 'begin_assessment', label: 'Begin patient assessment', tone: 'pending' });
  }
  const retr = retrievalItems(crew, live.now);
  if (retr.length > 0) {
    out.push({ id: 'retrieval', label: `Equipment retrieval in progress (${retr.length})`, tone: 'info' });
  }

  return out.slice(0, 3);
}

/**
 * A live, read-only timeline assembled from timestamps the machines already
 * record (crew assignments, distraction actions, clinical actions). This is a
 * display convenience — the authoritative capture still happens in
 * lib/opsim/captureRun at completion.
 */
export function timelineEvents(live: LiveConsoleState): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const { crew, dynamics, clinical, scene } = live;

  for (const id of crew.order) {
    const r = crew.responders[id];
    const a = r?.assignment;
    if (!a) continue;
    const label = a.isRetrieval ? `Retrieve ${equipmentLabelForTask(a.taskId)}` : (taskDef(a.taskId)?.label ?? a.taskId);
    events.push({ atSecond: a.startedAtSecond, label: `${r.name}: ${label}`, tone: 'info' });
  }
  for (const eng of Object.values(crew.apparatus)) {
    if (eng.arrived) events.push({ atSecond: 0, label: `${eng.name} on scene`, tone: 'info' });
  }
  if (dynamics) {
    for (const id of dynamics.order) {
      const issue = dynamics.issues[id];
      if (!issue) continue;
      const label = distractionType(issue.type)?.label ?? 'Distraction';
      events.push({ atSecond: issue.startedAtSecond, label: `${label} appeared`, tone: 'behavioral' });
      if (issue.resolved && issue.firstActionAtSecond != null) {
        events.push({ atSecond: issue.firstActionAtSecond, label: `${label} resolved`, tone: 'info' });
      }
    }
  }
  if (clinical) {
    for (const [actionId, st] of Object.entries(clinical.actions)) {
      if (st.status === 'complete' && st.startedAtSecond != null) {
        events.push({ atSecond: st.startedAtSecond, label: `Clinical: ${humanizeId(actionId)}`, tone: 'info' });
      }
    }
  }
  if (scene?.patientContact === 'established') {
    events.push({ atSecond: 0, label: 'Patient contact established', tone: 'info' });
  }

  return events.sort((a, b) => a.atSecond - b.atSecond);
}

export function responderStatusLabel(status: string): string {
  return STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status;
}

function humanizeId(id: string): string {
  return id.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
