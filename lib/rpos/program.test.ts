import { describe, it, expect } from 'vitest';
import { RPOS_PROGRAM, competenciesAtLeast } from './program';
import { rollupCompetencies } from './competency';
import { makeEvidence, makePoorRun, makeStoredRun } from './rpos.fixture';
import type { LearnerEvidence, ProgramRequirement } from './types';

function evaluate(requirementId: string, evidence: LearnerEvidence) {
  const all: ProgramRequirement[] = RPOS_PROGRAM.stages.flatMap((stage) => [...stage.requirements]);
  const requirement = all.find((r) => r.id === requirementId);
  if (!requirement) throw new Error(`no such requirement: ${requirementId}`);
  return requirement.evaluate({ evidence, competencies: rollupCompetencies(evidence.runs) });
}

describe('RPOS program definition', () => {
  it('has unique stage ids and at least one requirement per stage', () => {
    const ids = RPOS_PROGRAM.stages.map((stage) => stage.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(RPOS_PROGRAM.stages.every((stage) => stage.requirements.length > 0)).toBe(true);
  });

  it('gives every requirement a unique id within its stage', () => {
    for (const stage of RPOS_PROGRAM.stages) {
      const ids = stage.requirements.map((requirement) => requirement.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('reads the Truck Check requirement off recorded start-of-shift evidence', () => {
    expect(evaluate('truck_check_complete', makeEvidence({ hasCompletedTruckCheck: false, truckCheckAttempts: 0 }))).toEqual({
      met: false,
      detail: 'No completed Truck Check on record.',
    });
    const met = evaluate('truck_check_complete', makeEvidence({ hasCompletedTruckCheck: true, truckCheckAttempts: 3 }));
    expect(met.met).toBe(true);
    expect(met.detail).toContain('3');
  });

  it('counts only clean passing runs toward the field-ready requirement', () => {
    const mixed = makeEvidence({ runs: [makeStoredRun(), makeStoredRun(makePoorRun())] });
    const outcome = evaluate('clean_passing_runs', mixed);
    expect(outcome.met).toBe(false);
    expect(outcome.detail).toContain('1 of 2');
  });

  it('names the competencies still short of proficient rather than only failing', () => {
    const outcome = evaluate('all_competencies_proficient', makeEvidence({ runs: [makeStoredRun(makePoorRun())] }));
    expect(outcome.met).toBe(false);
    expect(outcome.detail).toMatch(/Scene safety|Windshield assessment|Crew leadership/);
  });

  it('reports competency requirements honestly when no run has exercised them', () => {
    const outcome = evaluate('scene_competencies_proficient', makeEvidence({ runs: [] }));
    expect(outcome).toEqual({ met: false, detail: 'No recorded runs have exercised these competencies yet.' });
  });

  it('passes the scene competency gate on a run that ran a safe scene', () => {
    expect(evaluate('scene_competencies_proficient', makeEvidence({ runs: [makeStoredRun()] })).met).toBe(true);
  });

  it('fails, rather than silently passes, a requirement naming an untracked competency', () => {
    const evidence = makeEvidence({ runs: [makeStoredRun()] });
    const outcome = competenciesAtLeast('x', 'x', ['not_a_real_competency'], 'proficient').evaluate({
      evidence,
      competencies: rollupCompetencies(evidence.runs),
    });
    expect(outcome).toEqual({
      met: false,
      detail: 'This requirement names competencies the program does not track.',
    });
  });
});
