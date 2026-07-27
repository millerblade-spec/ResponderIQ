/**
 * Assembles a completed operational run's FACTS (everything except identity,
 * reflection, and feedback) from the live sub-machine states (§ Step 10). The
 * result is a valid payload part that RunComplete finishes with the sign-in and
 * reflection/feedback and persists through the shared review database.
 */
import { DEFAULT_SIMULATOR_CONFIG } from '@/lib/engine/config';
import type { CrewState } from './crewMachine';
import type { SceneSafetyState } from './sceneMachine';
import type { DynamicsState } from './dynamicsMachine';
import type { ClinicalState } from './clinicalMachine';
import type { RunFacts } from '@/components/RunComplete/RunComplete';

export interface CaptureArgs {
  readonly evaluationId: string;
  readonly scenarioId: string;
  readonly difficulty: string;
  readonly totalSeconds: number;
  readonly initialDifferential: readonly string[];
  readonly equipmentSelected: readonly string[];
  readonly crew: CrewState;
  readonly scene?: SceneSafetyState;
  readonly dynamics?: DynamicsState;
  readonly clinical?: ClinicalState;
}

export function buildRunFacts(args: CaptureArgs): RunFacts {
  const retrievalSeconds = DEFAULT_SIMULATOR_CONFIG.timing.equipmentRetrievalSeconds;

  const assignments = Object.values(args.crew.responders)
    .filter((r) => r.assignment)
    .map((r) => ({
      responderId: r.id,
      taskId: r.assignment!.taskId,
      status: r.assignment!.status,
      startedAtSecond: r.assignment!.startedAtSecond,
      completedAtSecond: r.assignment!.status === 'complete' ? (r.assignment!.etaSecond ?? r.assignment!.startedAtSecond) : null,
    }));

  const retrievals = Object.values(args.crew.responders)
    .filter((r) => r.assignment?.isRetrieval && r.assignment.equipmentId)
    .map((r) => ({
      equipmentId: r.assignment!.equipmentId as string,
      requestedAtSecond: r.assignment!.startedAtSecond,
      deliveredAtSecond: r.assignment!.status === 'complete' ? (r.assignment!.etaSecond ?? null) : null,
      canceled: false,
    }));
  const equipmentRetrievalDelaySeconds = retrievals.length * retrievalSeconds;

  const dynIssues = args.dynamics
    ? args.dynamics.order.map((id) => {
        const i = args.dynamics!.issues[id];
        return { id: i.id, type: i.type, maxStageReached: i.maxStageReached, resolved: i.resolved, recognized: i.recognized, firstActionAtSecond: i.firstActionAtSecond ?? null };
      })
    : [];

  const clinicalActions = args.clinical
    ? Object.entries(args.clinical.actions)
        .filter(([, a]) => a.status !== 'not_started')
        .map(([actionId, a]) => ({
          id: actionId,
          responderId: a.assignedResponderId ?? 'unknown',
          startedAtSecond: a.startedAtSecond ?? 0,
          completedAtSecond: a.status === 'complete' ? (a.etaSecond ?? null) : null,
        }))
    : [];

  return {
    evaluationId: args.evaluationId,
    scenarioId: args.scenarioId,
    difficulty: args.difficulty,
    timeMetrics: {
      totalSeconds: args.totalSeconds,
      timeBeforePatientContactSeconds: null,
      timeToHazardRecognitionSeconds: null,
      timeToStageSeconds: null,
      timeToClearanceSeconds: null,
      timeToAssignPersonnelSeconds: assignments[0]?.startedAtSecond ?? null,
      timeToInitialAssessmentSeconds: clinicalActions.find((a) => a.id === 'initial_assessment')?.startedAtSecond ?? null,
      equipmentRetrievalDelaySeconds,
      timeWithUnresolvedDistractionsSeconds: 0,
      timeToDispositionSeconds: args.totalSeconds,
    },
    differential: {
      initial: [...args.initialDifferential],
      revisions: args.clinical ? args.clinical.revisions.map((r) => ({ atSecond: r.atSecond, order: [...r.order] })) : [],
      workingImpression: args.clinical?.differential.impression ?? null,
    },
    equipment: { selected: [...args.equipmentSelected], retrievals },
    sceneSafety: {
      windshieldReviewed: args.scene?.windshieldReviewed ?? false,
      dispatchStaging: args.scene?.staging.staged === true && args.scene?.stage === 'staging',
      staged: args.scene?.staging.staged ?? false,
      clearedToEnter: args.scene?.staging.clearedToEnter ?? false,
      sceneLightChoice: args.scene?.sceneLights.choice ?? null,
      ballisticChoice: args.scene?.ballistic.choice ?? null,
    },
    crew: { assignments },
    dynamics: { issues: dynIssues },
    clinical: {
      actionsPerformed: clinicalActions,
      findingsObtained: clinicalActions.filter((a) => a.completedAtSecond != null).map((a) => a.id),
      reassessments: args.clinical?.reassessCount ?? 0,
      deteriorationOccurred: args.clinical?.deteriorated ?? false,
      deteriorationRecognized: (args.clinical?.deteriorated ?? false) && (args.clinical?.reassessCount ?? 0) > 0,
    },
    criticalEvents: [],
  };
}
