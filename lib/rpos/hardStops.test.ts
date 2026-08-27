import { describe, it, expect } from 'vitest';
import { DSI_CHECKLIST, MAX_BVM_CHECKLIST, evaluateHardStop, failedHardStops, hardStopChecklist } from './hardStops';
import type { HardStopOutcome } from './types';

const allOf = (checklist: typeof MAX_BVM_CHECKLIST) => checklist.items.map((item) => item.id);

describe('MAX BVM and DSI hard stops', () => {
  it('carries Fort Worth’s definition of Max BVM: 2 NPAs, OPA, HFNC, high-flow BVM oxygen', () => {
    const ids = allOf(MAX_BVM_CHECKLIST);
    expect(ids).toEqual(expect.arrayContaining(['two_npas', 'opa', 'hfnc', 'high_flow_bvm_oxygen']));
    expect(MAX_BVM_CHECKLIST.source).toMatch(/Fort Worth/);
  });

  it('carries the DSI elements the program will not let anyone skip', () => {
    const ids = allOf(DSI_CHECKLIST);
    expect(ids).toEqual(
      expect.arrayContaining([
        'oxygenation_timer',
        'paralysis_countdown',
        'confirm_sbp',
        'confirm_spo2',
        'attempt_discipline',
        'cric_landmarks',
        'push_dose_epi',
      ]),
    );
  });

  it('passes only when every applicable item was actually performed', () => {
    const outcome: HardStopOutcome = {
      id: 'dsi',
      required: true,
      completedItemIds: allOf(DSI_CHECKLIST),
      notApplicableItemIds: [],
    };
    expect(evaluateHardStop(outcome).passed).toBe(true);
  });

  it('gives no partial credit — one missed element fails the whole checklist', () => {
    const outcome: HardStopOutcome = {
      id: 'dsi',
      required: true,
      completedItemIds: allOf(DSI_CHECKLIST).filter((id) => id !== 'paralysis_countdown'),
      notApplicableItemIds: [],
    };
    const result = evaluateHardStop(outcome);
    expect(result.passed).toBe(false);
    expect(result.missedItems.map((item) => item.id)).toEqual(['paralysis_countdown']);
  });

  it('never assumes an unreported step happened', () => {
    const result = evaluateHardStop({ id: 'max_bvm', required: true, completedItemIds: [], notApplicableItemIds: [] });
    expect(result.passed).toBe(false);
    // Everything mandatory is reported missed, not quietly credited.
    expect(result.missedItems.length).toBeGreaterThan(0);
    expect(result.missedItems.map((item) => item.id)).toContain('two_npas');
  });

  it('lets a presentation excuse a conditional item, but never a mandatory one', () => {
    const withoutConditional = evaluateHardStop({
      id: 'max_bvm',
      required: true,
      completedItemIds: allOf(MAX_BVM_CHECKLIST).filter((id) => id !== 'hob_30'),
      notApplicableItemIds: ['hob_30'],
    });
    expect(withoutConditional.passed).toBe(true);

    // 'two_npas' is mandatory — claiming it did not apply must not excuse it.
    const excusingMandatory = evaluateHardStop({
      id: 'max_bvm',
      required: true,
      completedItemIds: allOf(MAX_BVM_CHECKLIST).filter((id) => id !== 'two_npas'),
      notApplicableItemIds: ['two_npas'],
    });
    expect(excusingMandatory.passed).toBe(false);
    expect(excusingMandatory.missedItems.map((item) => item.id)).toEqual(['two_npas']);
  });

  it('reports a checklist the case never called for as not required, without pretending it passed a checklist', () => {
    const result = evaluateHardStop({ id: 'dsi', required: false, completedItemIds: [], notApplicableItemIds: [] });
    expect(result.required).toBe(false);
    expect(result.missedItems).toEqual([]);
    expect(failedHardStops([result])).toEqual([]);
  });

  it('surfaces only required failures', () => {
    const failed = evaluateHardStop({ id: 'dsi', required: true, completedItemIds: [], notApplicableItemIds: [] });
    const notRequired = evaluateHardStop({ id: 'max_bvm', required: false, completedItemIds: [], notApplicableItemIds: [] });
    expect(failedHardStops([failed, notRequired]).map((r) => r.id)).toEqual(['dsi']);
  });

  it('rejects an unknown checklist id', () => {
    // @ts-expect-error deliberately unknown
    expect(() => hardStopChecklist('cricothyrotomy')).toThrow(/no such hard stop/);
  });
});
