import type { OperationalRun } from './operationalRun';

/** A complete, valid operational-run payload for tests. Override any part. */
export function makeRun(overrides: Partial<OperationalRun> = {}): OperationalRun {
  const base: OperationalRun = {
    evaluationId: '00000000-0000-4000-8000-000000000001',
    scenarioId: 'bls-01',
    learner: { name: 'Alex Medic', badgeId: 'B-1234' },
    difficulty: 'orientation',
    timeMetrics: {
      totalSeconds: 580,
      timeBeforePatientContactSeconds: 120,
      timeToHazardRecognitionSeconds: 20,
      timeToStageSeconds: null,
      timeToClearanceSeconds: null,
      timeToAssignPersonnelSeconds: 90,
      timeToInitialAssessmentSeconds: 150,
      equipmentRetrievalDelaySeconds: 0,
      timeWithUnresolvedDistractionsSeconds: 15,
      timeToDispositionSeconds: 560,
    },
    differential: {
      initial: ['mechanical_fall', 'syncope_cardiac', 'hip_fracture', 'stroke'],
      revisions: [{ atSecond: 200, order: ['syncope_cardiac', 'mechanical_fall', 'hip_fracture', 'stroke'] }],
      workingImpression: 'syncope_cardiac',
    },
    equipment: { selected: ['als_bag', 'cardiac_monitor', 'stretcher'], retrievals: [] },
    sceneSafety: {
      windshieldReviewed: true,
      dispatchStaging: false,
      staged: false,
      clearedToEnter: true,
      sceneLightChoice: 'scene_lights_on',
      ballisticChoice: null,
    },
    crew: {
      assignments: [
        { responderId: 'partner_ron', taskId: 'obtain_vitals', status: 'complete', startedAtSecond: 130, completedAtSecond: 190 },
        { responderId: 'engine_4_ff1', taskId: 'interview_patient', status: 'complete', startedAtSecond: 140, completedAtSecond: 200 },
        { responderId: 'engine_4_ff2', taskId: 'manage_family', status: 'complete', startedAtSecond: 150, completedAtSecond: 210 },
      ],
    },
    dynamics: {
      issues: [{ id: 'family', type: 'family', maxStageReached: 2, resolved: true, recognized: true, firstActionAtSecond: 160 }],
    },
    clinical: {
      actionsPerformed: [
        { id: 'initial_assessment', responderId: 'lead_medic', startedAtSecond: 122, completedAtSecond: 150 },
        { id: 'obtain_vitals', responderId: 'partner_ron', startedAtSecond: 130, completedAtSecond: 190 },
        { id: 'interview', responderId: 'engine_4_ff1', startedAtSecond: 140, completedAtSecond: 200 },
      ],
      findingsObtained: ['initial_assessment', 'obtain_vitals', 'interview'],
      reassessments: 1,
      deteriorationOccurred: false,
      deteriorationRecognized: false,
    },
    criticalEvents: [],
    reflection: { managed: 4, went_well: 'Kept the family calm', patient_impression: 'Syncope from a-fib' },
    feedback: { liked_using: 5, would_use_again: 'yes' },
  };
  return { ...base, ...overrides };
}
