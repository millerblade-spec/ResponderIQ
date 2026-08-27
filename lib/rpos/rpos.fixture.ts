import { makeRun } from '@/lib/review/operationalRun.fixture';
import type { StoredOperationalRun } from '@/lib/db/operationalRuns';
import type { OperationalRun } from '@/lib/review/operationalRun';
import { buildLearnerEvidence } from './evidence';
import type { LearnerEvidence } from './types';

/**
 * Test fixtures for the program. Built on the existing operational-run
 * fixture and put through the real evidence builder, so program tests
 * exercise the same scoring path production does rather than hand-written
 * category percentages that could drift from it.
 */

let sequence = 0;

/** A stored run wrapper around makeRun(). `createdAt` defaults to a stable, increasing timestamp. */
export function makeStoredRun(
  overrides: Partial<OperationalRun> = {},
  meta: { readonly createdAt?: string; readonly attemptNumber?: number } = {},
): StoredOperationalRun {
  sequence += 1;
  return {
    evaluationId: `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`,
    attemptNumber: meta.attemptNumber ?? sequence,
    run: makeRun({ ...overrides, evaluationId: `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}` }),
    createdAt: meta.createdAt ?? new Date(Date.UTC(2026, 0, sequence)).toISOString(),
  };
}

/**
 * A run that fails almost everything scoreable: no windshield assessment, no
 * assignments, unresolved distractions, no working impression, deterioration
 * without reassessment, slow and over the time benchmark.
 */
export function makePoorRun(): Partial<OperationalRun> {
  return {
    sceneSafety: {
      windshieldReviewed: false,
      dispatchStaging: true,
      staged: false,
      clearedToEnter: false,
      sceneLightChoice: null,
      ballisticChoice: null,
    },
    crew: { assignments: [] },
    dynamics: {
      issues: [{ id: 'family', type: 'family', maxStageReached: 3, resolved: false, recognized: false, firstActionAtSecond: null }],
    },
    differential: { initial: ['mechanical_fall'], revisions: [], workingImpression: null },
    clinical: {
      actionsPerformed: [],
      findingsObtained: [],
      reassessments: 0,
      deteriorationOccurred: true,
      deteriorationRecognized: false,
    },
    timeMetrics: {
      totalSeconds: 1_500,
      timeBeforePatientContactSeconds: 600,
      timeToHazardRecognitionSeconds: null,
      timeToStageSeconds: null,
      timeToClearanceSeconds: null,
      timeToAssignPersonnelSeconds: null,
      timeToInitialAssessmentSeconds: null,
      equipmentRetrievalDelaySeconds: 120,
      timeWithUnresolvedDistractionsSeconds: 400,
      timeToDispositionSeconds: null,
    },
  };
}

export interface EvidenceOptions {
  readonly name?: string;
  readonly badgeId?: string;
  readonly hasCompletedTruckCheck?: boolean;
  readonly truckCheckAttempts?: number;
  readonly runs?: readonly StoredOperationalRun[];
}

export function makeEvidence(options: EvidenceOptions = {}): LearnerEvidence {
  return buildLearnerEvidence({
    learner: { name: options.name ?? 'Alex Medic', badgeId: options.badgeId ?? 'B-1234' },
    truckCheck: {
      hasCompletedTruckCheck: options.hasCompletedTruckCheck ?? true,
      attemptCount: options.truckCheckAttempts ?? 1,
    },
    runs: options.runs ?? [],
  });
}
