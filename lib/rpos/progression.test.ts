import { describe, it, expect } from 'vitest';
import { evaluateProgram } from './progression';
import { RPOS_PROGRAM } from './program';
import { makeEvidence, makePoorRun, makeStoredRun } from './rpos.fixture';
import type { ProgramState } from './types';

function stage(state: ProgramState, id: string) {
  const found = state.stages.find((s) => s.id === id);
  if (!found) throw new Error(`no such stage: ${id}`);
  return found;
}

describe('RPOS progression', () => {
  it('starts a responder with nothing recorded at not_started, first stage available', () => {
    const state = evaluateProgram(makeEvidence({ hasCompletedTruckCheck: false, truckCheckAttempts: 0 }));
    expect(state.status).toBe('not_started');
    expect(stage(state, 'shift_readiness').status).toBe('available');
    expect(state.nextAction).toMatch(/Shift Readiness/);
    expect(state.stagesComplete).toBe(0);
    expect(state.stageCount).toBe(RPOS_PROGRAM.stages.length);
  });

  it('locks later stages behind an unmet gate, but still reports what is met inside them', () => {
    // Runs recorded, but no Truck Check: stage one is the gate.
    const state = evaluateProgram(
      makeEvidence({ hasCompletedTruckCheck: false, truckCheckAttempts: 0, runs: [makeStoredRun()] }),
    );
    expect(stage(state, 'shift_readiness').status).toBe('available');
    expect(stage(state, 'first_response').status).toBe('locked');
    // The evidence is not hidden just because the stage is locked.
    expect(stage(state, 'first_response').requirements[0].met).toBe(true);
    expect(state.status).toBe('in_progress');
  });

  it('opens the next stage once the previous one is complete', () => {
    const state = evaluateProgram(makeEvidence({ runs: [] }));
    expect(stage(state, 'shift_readiness').status).toBe('complete');
    expect(stage(state, 'first_response').status).toBe('available');
    expect(state.nextAction).toMatch(/First Response/);
  });

  it('marks a stage in_progress when only some of its requirements are met', () => {
    // Clean run: no critical concern (first requirement met), but the poor
    // scene competencies below keep the stage's second requirement unmet.
    const state = evaluateProgram(
      makeEvidence({
        runs: [
          makeStoredRun(),
          makeStoredRun({
            sceneSafety: {
              windshieldReviewed: false,
              dispatchStaging: false,
              staged: false,
              clearedToEnter: true,
              sceneLightChoice: null,
              ballisticChoice: null,
            },
            clinical: {
              actionsPerformed: [],
              findingsObtained: [],
              reassessments: 0,
              deteriorationOccurred: false,
              deteriorationRecognized: false,
            },
          }),
        ],
      }),
    );
    const discipline = stage(state, 'scene_discipline');
    expect(discipline.status).toBe('in_progress');
    expect(discipline.requirements.find((r) => r.id === 'latest_run_no_concerns')?.met).toBe(true);
    expect(discipline.requirements.find((r) => r.id === 'scene_competencies_proficient')?.met).toBe(false);
  });

  it('surfaces a critical safety concern from the most recent run and blocks scene discipline', () => {
    const state = evaluateProgram(makeEvidence({ runs: [makeStoredRun(makePoorRun())] }));
    expect(state.openConcerns.length).toBeGreaterThan(0);
    expect(stage(state, 'scene_discipline').requirements.find((r) => r.id === 'latest_run_no_concerns')?.met).toBe(
      false,
    );
    expect(state.status).toBe('in_progress');
  });

  it('does not average a critical concern away behind good runs', () => {
    const state = evaluateProgram(
      makeEvidence({
        runs: [
          makeStoredRun({}, { createdAt: '2026-01-01T00:00:00.000Z' }),
          makeStoredRun({}, { createdAt: '2026-02-01T00:00:00.000Z' }),
          makeStoredRun(makePoorRun(), { createdAt: '2026-03-01T00:00:00.000Z' }),
        ],
      }),
    );
    expect(state.openConcerns.length).toBeGreaterThan(0);
    expect(state.status).not.toBe('field_ready');
  });

  it('reaches field_ready only on repeated clean passing runs with every competency proficient', () => {
    const one = evaluateProgram(makeEvidence({ runs: [makeStoredRun()] }));
    expect(one.status).toBe('in_progress');
    expect(stage(one, 'field_ready').requirements.find((r) => r.id === 'clean_passing_runs')?.met).toBe(false);

    const two = evaluateProgram(makeEvidence({ runs: [makeStoredRun(), makeStoredRun()] }));
    expect(two.status).toBe('field_ready');
    expect(two.stagesComplete).toBe(two.stageCount);
    expect(two.nextAction).toMatch(/Program complete/);
  });

  it('names the earliest unmet requirement as the next action', () => {
    const state = evaluateProgram(
      makeEvidence({ hasCompletedTruckCheck: false, truckCheckAttempts: 0, runs: [makeStoredRun(), makeStoredRun()] }),
    );
    expect(state.nextAction).toMatch(/Shift Readiness: complete a full truck check/i);
  });

  it('carries the learner identity and program identity through unchanged', () => {
    const state = evaluateProgram(makeEvidence({ name: 'Dana Rivera', badgeId: 'B-9' }));
    expect(state.learner).toEqual({ name: 'Dana Rivera', badgeId: 'B-9' });
    expect(state.programId).toBe(RPOS_PROGRAM.id);
    expect(state.programVersion).toBe(RPOS_PROGRAM.version);
    expect(state.programTitle).toBe(RPOS_PROGRAM.title);
  });
});
