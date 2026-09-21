import { makeRun } from '@/lib/review/operationalRun.fixture';
import type { StoredOperationalRun } from '@/lib/db/operationalRuns';
import type { OperationalRun } from '@/lib/review/operationalRun';
import type {
  CaseRecord,
  Certification,
  HardStopResult,
  LearnerEvidence,
  LevelNumber,
  MissBoardEntry,
  MissCategory,
  PersonalityMode,
} from './types';

/** Test fixtures for RPOS. Cases are built directly so band and streak rules can be exercised without a scenario. */

let sequence = 0;
const nextId = () => `case-${(sequence += 1).toString().padStart(4, '0')}`;

/** A day-spaced timestamp, so "oldest first" ordering is unambiguous in tests. */
export function at(dayOfMonth: number): string {
  return new Date(Date.UTC(2026, 0, dayOfMonth)).toISOString();
}

export function makeCase(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    caseId: nextId(),
    certification: 'paramedic',
    level: 1,
    score: 99,
    band: 'blue',
    criticalErrors: [],
    hardStops: [
      { id: 'max_bvm', title: 'Max BVM', required: false, passed: true, missedItems: [] },
      { id: 'dsi', title: 'DSI', required: false, passed: true, missedItems: [] },
    ],
    misses: [],
    challengeMode: false,
    createdAt: at(1),
    ...overrides,
  };
}

/** N clean BLUE cases in order, one per day. */
export function blueRun(count: number, overrides: Partial<CaseRecord> = {}): CaseRecord[] {
  return Array.from({ length: count }, (_, index) => makeCase({ ...overrides, createdAt: at(index + 1) }));
}

export function failedHardStop(id: 'max_bvm' | 'dsi', missed: string[]): HardStopResult {
  return {
    id,
    title: id === 'dsi' ? 'DSI' : 'Max BVM',
    required: true,
    passed: false,
    missedItems: missed.map((label) => ({ id: label, label })),
  };
}

export function makeMiss(overrides: Partial<MissBoardEntry> = {}): MissBoardEntry {
  return {
    id: `miss-${(sequence += 1).toString().padStart(4, '0')}`,
    category: 'assessment' as MissCategory,
    subject: 'Patient assessment',
    detail: 'Core assessments incomplete.',
    critical: false,
    sourceCaseId: 'case-0001',
    createdAt: at(1),
    resolvedAt: null,
    resolvedByCaseId: null,
    ...overrides,
  };
}

export interface EvidenceOptions {
  readonly name?: string;
  readonly badgeId?: string;
  readonly certification?: Certification;
  readonly level?: LevelNumber;
  readonly personalityMode?: PersonalityMode;
  readonly cases?: readonly CaseRecord[];
  readonly missBoard?: readonly MissBoardEntry[];
}

export function makeEvidence(options: EvidenceOptions = {}): LearnerEvidence {
  return {
    learner: { name: options.name ?? 'Alex Medic', badgeId: options.badgeId ?? 'B-1234' },
    certification: options.certification ?? 'paramedic',
    level: options.level ?? 1,
    personalityMode: options.personalityMode ?? 1,
    cases: options.cases ?? [],
    missBoard: options.missBoard ?? [],
  };
}

/** A stored BLS-01 run, for the engine→case bridge tests. */
export function makeStoredRun(
  overrides: Partial<OperationalRun> = {},
  meta: { readonly createdAt?: string } = {},
): StoredOperationalRun {
  sequence += 1;
  const evaluationId = `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
  return {
    evaluationId,
    attemptNumber: sequence,
    run: makeRun({ ...overrides, evaluationId }),
    createdAt: meta.createdAt ?? at(Math.min(28, sequence)),
  };
}

/** A run that fails most of what BLS-01 scores, including scene safety. */
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
      issues: [
        { id: 'family', type: 'family', maxStageReached: 3, resolved: false, recognized: false, firstActionAtSecond: null },
      ],
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
