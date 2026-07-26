/**
 * Pure, typed Scene Dynamics state machine (§20). No timers, no React — the
 * component schedules escalation on the shared mission clock and calls these.
 * Escalation stops when managed, resolved, or at a distraction's configured
 * maximum stage. Everything needed for debrief/admin review is recorded here.
 */
import { DIFFICULTY_CONFIG, distractionType, type DifficultyName, type DynamicStatus } from './dynamics';

export interface DynamicActionRecord {
  readonly actionId: string;
  readonly atSecond: number;
}

export interface DynamicIssue {
  readonly id: string;
  readonly type: string;
  readonly stageIndex: number;
  readonly status: DynamicStatus;
  readonly startedAtSecond: number;
  readonly managed: boolean;
  readonly assignedResponderId?: string;
  readonly resolved: boolean;
  /** Debrief data. */
  readonly recognized: boolean;
  readonly firstActionAtSecond?: number;
  readonly maxStageReached: number;
  readonly actions: readonly DynamicActionRecord[];
}

export interface DynamicsState {
  readonly issues: Readonly<Record<string, DynamicIssue>>;
  readonly order: readonly string[];
  readonly difficulty: DifficultyName;
  /** Ron's critical-prompt count — never exceeds three (§6/§20). */
  readonly ronPromptCount: number;
}

export function createDynamicsState(difficulty: DifficultyName): DynamicsState {
  return { issues: {}, order: [], difficulty, ronPromptCount: 0 };
}

function maxStageIndexOf(type: string): number {
  return Math.max(0, (distractionType(type)?.stages.length ?? 1) - 1);
}

/** Distractions that count against the simultaneous cap (fire-awaiting never does, §20). */
function activeMajorCount(state: DynamicsState): number {
  return state.order
    .map((id) => state.issues[id])
    .filter((i) => !i.resolved && distractionType(i.type)?.isFireAwaiting !== true).length;
}

/**
 * A distraction appears (§20). Fire-awaiting appears freely; a major distraction
 * appears only if the difficulty's simultaneous cap allows it — this is what
 * makes Orientation "generally one at a time" and Advanced "several at once".
 */
export function appearDistraction(
  state: DynamicsState,
  id: string,
  type: string,
  atSecond: number,
): DynamicsState {
  if (state.issues[id]) return state;
  const isFireAwaiting = distractionType(type)?.isFireAwaiting === true;
  if (!isFireAwaiting && activeMajorCount(state) >= DIFFICULTY_CONFIG[state.difficulty].maxSimultaneous) {
    return state; // difficulty cap reached
  }
  const issue: DynamicIssue = {
    id,
    type,
    stageIndex: 0,
    status: isFireAwaiting ? 'developing' : 'developing',
    startedAtSecond: atSecond,
    managed: false,
    resolved: false,
    recognized: false,
    maxStageReached: 0,
    actions: [],
  };
  return { ...state, issues: { ...state.issues, [id]: issue }, order: [...state.order, id] };
}

/** One escalation step. No-op while managed or resolved (escalation pauses, §20). */
export function escalate(state: DynamicsState, id: string): DynamicsState {
  const issue = state.issues[id];
  if (!issue || issue.resolved || issue.managed) return state;
  const maxIndex = maxStageIndexOf(issue.type);
  if (issue.stageIndex >= maxIndex) return state; // at configured maximum — stops escalating
  const stageIndex = issue.stageIndex + 1;
  const stage = distractionType(issue.type)?.stages[stageIndex];
  const status: DynamicStatus = stage?.immediateSafetyThreat ? 'immediate_safety_threat' : 'escalating';
  return {
    ...state,
    issues: {
      ...state.issues,
      [id]: { ...issue, stageIndex, status, maxStageReached: Math.max(issue.maxStageReached, stageIndex) },
    },
  };
}

export function isAtMaxStage(state: DynamicsState, id: string): boolean {
  const issue = state.issues[id];
  return !!issue && issue.stageIndex >= maxStageIndexOf(issue.type);
}

function recordAction(issue: DynamicIssue, actionId: string, atSecond: number): DynamicIssue {
  return {
    ...issue,
    recognized: true,
    firstActionAtSecond: issue.firstActionAtSecond ?? atSecond,
    actions: [...issue.actions, { actionId, atSecond }],
  };
}

/** A self-performed action that improves the situation by one stage (resolving at stage 0). */
export function improve(state: DynamicsState, id: string, actionId: string, atSecond: number): DynamicsState {
  const issue = state.issues[id];
  if (!issue || issue.resolved) return state;
  const stageIndex = Math.max(0, issue.stageIndex - 1);
  const recorded = recordAction(issue, actionId, atSecond);
  const next: DynamicIssue =
    stageIndex === 0
      ? { ...recorded, stageIndex: 0, status: 'resolved', resolved: true }
      : { ...recorded, stageIndex, status: 'escalating' };
  return { ...state, issues: { ...state.issues, [id]: next } };
}

/** A self-performed action that directly resolves the distraction. */
export function resolveDirect(state: DynamicsState, id: string, actionId: string, atSecond: number): DynamicsState {
  const issue = state.issues[id];
  if (!issue || issue.resolved) return state;
  return {
    ...state,
    issues: { ...state.issues, [id]: { ...recordAction(issue, actionId, atSecond), status: 'resolved', resolved: true } },
  };
}

/** Assign a responder to manage the distraction: escalation pauses (§20). */
export function beginManaging(
  state: DynamicsState,
  id: string,
  responderId: string,
  actionId: string,
  atSecond: number,
): DynamicsState {
  const issue = state.issues[id];
  if (!issue || issue.resolved) return state;
  return {
    ...state,
    issues: {
      ...state.issues,
      [id]: { ...recordAction(issue, actionId, atSecond), managed: true, assignedResponderId: responderId, status: 'being_managed' },
    },
  };
}

/** The managing responder finished — the issue resolves (§20). */
export function resolveManagement(state: DynamicsState, id: string): DynamicsState {
  const issue = state.issues[id];
  if (!issue || issue.resolved) return state;
  return { ...state, issues: { ...state.issues, [id]: { ...issue, managed: false, status: 'resolved', resolved: true } } };
}

/** Management was canceled — escalation may resume (§20). */
export function cancelManaging(state: DynamicsState, id: string): DynamicsState {
  const issue = state.issues[id];
  if (!issue || issue.resolved || !issue.managed) return state;
  return {
    ...state,
    issues: { ...state.issues, [id]: { ...issue, managed: false, assignedResponderId: undefined, status: 'escalating' } },
  };
}

/** Records an acknowledgment (e.g. ignoring lawful recording) — recognized, no stage change (§20). */
export function acknowledge(state: DynamicsState, id: string, actionId: string, atSecond: number): DynamicsState {
  const issue = state.issues[id];
  if (!issue || issue.resolved) return state;
  return { ...state, issues: { ...state.issues, [id]: recordAction(issue, actionId, atSecond) } };
}

/** Ron prompts about a critical unresolved dynamic — never more than three (§6/§20). */
export function ronPrompt(state: DynamicsState): { state: DynamicsState; index: number | null } {
  if (state.ronPromptCount >= 3) return { state, index: null };
  return { state: { ...state, ronPromptCount: state.ronPromptCount + 1 }, index: state.ronPromptCount };
}

/** The consequence text for a distraction's current stage, if any (§ consequences). */
export function currentConsequence(state: DynamicsState, id: string): string | undefined {
  const issue = state.issues[id];
  if (!issue) return undefined;
  return distractionType(issue.type)?.stages[issue.stageIndex]?.consequence;
}
