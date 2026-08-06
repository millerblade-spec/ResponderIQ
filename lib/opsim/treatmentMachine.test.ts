import { describe, it, expect } from 'vitest';
import {
  createTreatmentState,
  recordTreatment,
  authorizeScope,
  scopeCleared,
  reassessPatient,
  treatmentStatus,
  treatmentDetail,
  beginAnalysis,
  resolveAnalysis,
  beginCharge,
  deliverShock,
  beginCpr,
  reanalyze,
} from './treatmentMachine';
import type { TreatmentConfig } from './treatment';

const emtConfig: TreatmentConfig = { learnerScope: 'emt' };
const paramedicConfig: TreatmentConfig = { learnerScope: 'paramedic' };

describe('treatmentMachine — recordTreatment', () => {
  it('records a completed treatment with its detail and an event', () => {
    const s = recordTreatment(createTreatmentState(), 'oxygen', { kind: 'oxygen', deviceId: 'nasal_cannula', flowRateLpm: 4 }, 10);
    expect(treatmentStatus(s, 'oxygen')).toBe('complete');
    expect(treatmentDetail(s, 'oxygen')).toEqual({ kind: 'oxygen', deviceId: 'nasal_cannula', flowRateLpm: 4 });
    expect(s.events).toEqual([{ id: 'treatment:oxygen', atSecond: 10 }]);
  });

  it('an untouched treatment reports not_started', () => {
    expect(treatmentStatus(createTreatmentState(), 'iv_fluids')).toBe('not_started');
  });

  it('recording a second treatment does not disturb the first', () => {
    let s = recordTreatment(createTreatmentState(), 'oxygen', { kind: 'oxygen', deviceId: 'bvm' }, 5);
    s = recordTreatment(s, 'iv_fluids', { kind: 'infusion', rate: 125 }, 20);
    expect(treatmentStatus(s, 'oxygen')).toBe('complete');
    expect(treatmentStatus(s, 'iv_fluids')).toBe('complete');
    expect(s.events).toHaveLength(2);
  });
});

describe('treatmentMachine — scope of practice (§4)', () => {
  it('an EMT-scope treatment is always cleared, no authorization needed', () => {
    expect(scopeCleared(createTreatmentState(), emtConfig, 'oxygen')).toBe(true);
  });

  it('a Paramedic-scope treatment is blocked for an EMT-tier learner until authorized', () => {
    expect(scopeCleared(createTreatmentState(), emtConfig, 'iv_access')).toBe(false);
    const s = authorizeScope(createTreatmentState(), 'iv_access', 30);
    expect(scopeCleared(s, emtConfig, 'iv_access')).toBe(true);
  });

  it('authorization is per-skill: unlocking IV access does not unlock Norepinephrine', () => {
    const s = authorizeScope(createTreatmentState(), 'iv_access', 30);
    expect(scopeCleared(s, emtConfig, 'norepinephrine')).toBe(false);
  });

  it('a Paramedic-scope treatment never needs the prompt for a paramedic-tier learner', () => {
    expect(scopeCleared(createTreatmentState(), paramedicConfig, 'norepinephrine')).toBe(true);
  });

  it('authorizeScope is idempotent — a second call does not add a duplicate event', () => {
    let s = authorizeScope(createTreatmentState(), 'iv_access', 30);
    s = authorizeScope(s, 'iv_access', 45);
    expect(s.events).toHaveLength(1);
  });

  it('an unknown treatment id is never cleared', () => {
    expect(scopeCleared(createTreatmentState(), paramedicConfig, 'not_a_real_treatment')).toBe(false);
  });
});

describe('treatmentMachine — Reassess Patient (§2)', () => {
  it('increments the count and timestamps each press', () => {
    let s = reassessPatient(createTreatmentState(), 40);
    expect(s.reassessCount).toBe(1);
    expect(s.lastReassessedAtSecond).toBe(40);
    s = reassessPatient(s, 90);
    expect(s.reassessCount).toBe(2);
    expect(s.lastReassessedAtSecond).toBe(90);
  });
});

describe('treatmentMachine — AED cycle (§9)', () => {
  it('walks a full shock-advised cycle: analyzing -> shock advised -> charging -> shock delivered -> CPR', () => {
    let s = beginAnalysis(createTreatmentState(), 0);
    expect(s.aed?.stage).toBe('analyzing');

    s = resolveAnalysis(s, true, 10);
    expect(s.aed?.stage).toBe('shock_advised');

    s = beginCharge(s, 11);
    expect(s.aed?.stage).toBe('charging');

    s = deliverShock(s, 16);
    expect(s.aed?.stage).toBe('shock_delivered');
    expect(s.aed?.cycles).toEqual([{ shockAdvised: true, shocked: true, atSecond: 16 }]);

    s = beginCpr(s, 16);
    expect(s.aed?.stage).toBe('cpr');
    expect(s.aed?.cprStartedAtSecond).toBe(16);
  });

  it('a no-shock-advised cycle skips charging and goes straight to CPR, recording an unshocked cycle', () => {
    let s = beginAnalysis(createTreatmentState(), 0);
    s = resolveAnalysis(s, false, 10);
    expect(s.aed?.stage).toBe('no_shock_advised');

    s = beginCpr(s, 10);
    expect(s.aed?.stage).toBe('cpr');
    expect(s.aed?.cycles).toEqual([{ shockAdvised: false, shocked: false, atSecond: 10 }]);
  });

  it('supports repeated cycles: reanalyzing from CPR starts a fresh analysis and accumulates cycle history', () => {
    let s = beginAnalysis(createTreatmentState(), 0);
    s = resolveAnalysis(s, false, 10);
    s = beginCpr(s, 10);
    expect(s.aed?.cycles).toHaveLength(1);

    s = reanalyze(s, 130);
    expect(s.aed?.stage).toBe('analyzing');

    s = resolveAnalysis(s, true, 140);
    s = beginCharge(s, 141);
    s = deliverShock(s, 146);
    s = beginCpr(s, 146);
    expect(s.aed?.cycles).toHaveLength(2);
    expect(s.aed?.cycles[1]).toEqual({ shockAdvised: true, shocked: true, atSecond: 146 });
  });

  it('each transition self-guards: calling out of stage is a safe no-op', () => {
    const fresh = createTreatmentState();
    expect(resolveAnalysis(fresh, true, 5)).toBe(fresh); // no aed yet
    expect(beginCharge(fresh, 5)).toBe(fresh);
    expect(deliverShock(fresh, 5)).toBe(fresh);
    expect(beginCpr(fresh, 5)).toBe(fresh);

    const analyzing = beginAnalysis(fresh, 0);
    expect(beginCharge(analyzing, 1)).toBe(analyzing); // can't charge before shock is advised
    expect(deliverShock(analyzing, 1)).toBe(analyzing);
    expect(beginCpr(analyzing, 1)).toBe(analyzing);
  });

  it('cannot begin a second analysis while one is already in progress', () => {
    const analyzing = beginAnalysis(createTreatmentState(), 0);
    expect(beginAnalysis(analyzing, 1)).toBe(analyzing);
  });
});
