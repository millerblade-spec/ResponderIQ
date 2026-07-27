import { describe, it, expect } from 'vitest';
import {
  createClinicalState,
  canPerform,
  startAction,
  completeAction,
  cancelAction,
  isComplete,
  applyDeterioration,
  reassessmentVitals,
  reassessmentChanged,
  reorderDifferential,
  addDifferential,
  removeDifferential,
  setWorkingImpression,
} from './clinicalMachine';
import { bls01Clinical, clinicalAction } from './clinical';

const UNLOCKED = { unlocked: true, equipmentOnScene: [] as string[] };
const seed = () => createClinicalState(['mechanical_fall', 'syncope_cardiac', 'hip_fracture', 'stroke']);

function perform(state: ReturnType<typeof seed>, actionId: string) {
  const dur = clinicalAction(actionId)!.durationSeconds;
  let s = startAction(state, actionId, 'partner_ron', 0, dur);
  s = completeAction(s, actionId);
  return s;
}

describe('clinical lock & availability (§19)', () => {
  it('locks all clinical actions before patient contact', () => {
    const s = seed();
    expect(canPerform(s, 'obtain_vitals', { unlocked: false, equipmentOnScene: [] }).ok).toBe(false);
    expect(canPerform(s, 'initial_assessment', { unlocked: false, equipmentOnScene: [] }).reason).toMatch(/locked/i);
  });

  it('unlocks actions once patient contact is established', () => {
    expect(canPerform(seed(), 'obtain_vitals', UNLOCKED).ok).toBe(true);
  });

  it('gates equipment-dependent actions on the equipment being on scene, with an explanation', () => {
    const s = seed();
    const noMonitor = canPerform(s, 'apply_monitor', { unlocked: true, equipmentOnScene: [] });
    expect(noMonitor.ok).toBe(false);
    expect(noMonitor.reason).toMatch(/Cardiac Monitor is still on Medic 3/i);
    expect(canPerform(s, 'apply_monitor', { unlocked: true, equipmentOnScene: ['cardiac_monitor'] }).ok).toBe(true);
  });

  it('12-lead requires the monitor to be applied first', () => {
    let s = seed();
    const ctx = { unlocked: true, equipmentOnScene: ['cardiac_monitor'] };
    expect(canPerform(s, 'obtain_12_lead', ctx).reason).toMatch(/Apply cardiac monitor must be completed/i);
    s = startAction(s, 'apply_monitor', 'ron', 0, 45);
    s = completeAction(s, 'apply_monitor');
    expect(canPerform(s, 'obtain_12_lead', ctx).ok).toBe(true);
  });

  it('glucose is unavailable without the ALS bag (glucometer) on scene', () => {
    expect(canPerform(seed(), 'check_glucose', { unlocked: true, equipmentOnScene: [] }).reason).toMatch(/ALS Bag is still on Medic 3/i);
  });
});

describe('findings hidden until obtained (§19)', () => {
  it('vitals, interview, glucose, monitor stay hidden until their task completes', () => {
    let s = seed();
    expect(isComplete(s, 'obtain_vitals')).toBe(false);
    s = startAction(s, 'obtain_vitals', 'ron', 0, 60);
    expect(isComplete(s, 'obtain_vitals')).toBe(false); // in progress, not yet revealed
    s = completeAction(s, 'obtain_vitals');
    expect(isComplete(s, 'obtain_vitals')).toBe(true);
  });

  it('a focused exam reveals only its own region', () => {
    let s = seed();
    s = perform(s, 'exam_chest');
    expect(isComplete(s, 'exam_chest')).toBe(true);
    expect(isComplete(s, 'exam_abdomen')).toBe(false); // other regions still hidden
  });

  it('a canceled action reveals nothing', () => {
    let s = seed();
    s = startAction(s, 'obtain_vitals', 'ron', 0, 60);
    s = cancelAction(s, 'obtain_vitals');
    expect(isComplete(s, 'obtain_vitals')).toBe(false);
    expect(s.actions.obtain_vitals.status).toBe('not_started');
  });

  it('every reported interview finding carries a source label', () => {
    for (const section of bls01Clinical.interview) {
      expect(['patient', 'family', 'bystander', 'dispatch']).toContain(section.finding.source);
    }
  });
});

describe('reassessment & deterioration (§19)', () => {
  it('deterioration is hidden until reassessment shows the changed vitals', () => {
    let s = seed();
    s = applyDeterioration(s);
    expect(reassessmentChanged(s)).toBe(true);
    // The worse vitals differ from the baseline set.
    expect(reassessmentVitals(s, bls01Clinical)).toEqual(bls01Clinical.vitalsDeteriorated);
    expect(reassessmentVitals(s, bls01Clinical)).not.toEqual(bls01Clinical.vitals);
  });

  it('reassessment before deterioration matches the initial picture', () => {
    expect(reassessmentVitals(seed(), bls01Clinical)).toEqual(bls01Clinical.vitals);
  });

  it('counts reassessments', () => {
    const s = perform(seed(), 'reassess');
    expect(s.reassessCount).toBe(1);
  });
});

describe('working differential revision (§ clinical reasoning)', () => {
  it('lets the learner reorder, add, remove, and set a working impression — and records revisions', () => {
    let s = seed();
    s = reorderDifferential(s, 'syncope_cardiac', 'up', 10);
    expect(s.differential.order[0]).toBe('syncope_cardiac');
    s = addDifferential(s, 'arrhythmia', 12);
    expect(s.differential.order).toContain('arrhythmia');
    s = removeDifferential(s, 'stroke', 14);
    expect(s.differential.order).not.toContain('stroke');
    s = setWorkingImpression(s, 'syncope_cardiac', 16);
    expect(s.differential.impression).toBe('syncope_cardiac');
    expect(s.revisions.length).toBe(4); // every change is recorded
  });

  it('never marks any differential as the correct answer', () => {
    const s = seed();
    expect(Object.keys(s.differential)).not.toContain('correct');
  });
});
