import { describe, it, expect } from 'vitest';
import {
  TREATMENT_CATALOG,
  TREATMENT_CATEGORY_ORDER,
  treatmentDef,
  treatmentsByCategory,
  OXYGEN_DEVICE_OPTIONS,
  oxygenDevice,
  defaultPeep,
  IV_METHOD_OPTIONS,
  ivMethod,
  EZ_IO_SITE_OPTIONS,
  painProtocolFor,
  type TreatmentModel,
} from './treatment';

describe('treatment catalog', () => {
  it('every treatment id is unique', () => {
    const ids = TREATMENT_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every treatment belongs to a category in TREATMENT_CATEGORY_ORDER', () => {
    for (const t of TREATMENT_CATALOG) {
      expect(TREATMENT_CATEGORY_ORDER).toContain(t.category);
    }
  });

  it('treatmentDef looks up a known id and returns undefined for an unknown one', () => {
    expect(treatmentDef('oxygen')?.label).toBe('Oxygen / Respiratory Support');
    expect(treatmentDef('not_real')).toBeUndefined();
  });

  it('treatmentsByCategory groups correctly and respects an enabled-ids restriction', () => {
    const cardiac = treatmentsByCategory('cardiac');
    expect(cardiac.map((t) => t.id)).toEqual(['aed']);

    const restricted = treatmentsByCategory('circulation', ['iv_fluids']);
    expect(restricted.map((t) => t.id)).toEqual(['iv_fluids']);
  });

  it('paramedic-scope circulation/pain drugs are gated; oxygen and AED stay EMT-scope', () => {
    expect(treatmentDef('norepinephrine')?.scope).toBe('paramedic');
    expect(treatmentDef('fentanyl')?.scope).toBe('paramedic');
    expect(treatmentDef('oxygen')?.scope).toBe('emt');
    expect(treatmentDef('aed')?.scope).toBe('emt');
  });
});

describe('oxygen device options (§5)', () => {
  it('Nasal Cannula defaults to 4 L/min within a 1-6 L/min range', () => {
    const nc = oxygenDevice('nasal_cannula');
    expect(nc?.flow).toEqual({ defaultLpm: 4, minLpm: 1, maxLpm: 6 });
  });

  it('Non-Rebreather defaults to 15 L/min within a 10-15 L/min range', () => {
    const nrb = oxygenDevice('non_rebreather');
    expect(nrb?.flow).toEqual({ defaultLpm: 15, minLpm: 10, maxLpm: 15 });
  });

  it('Ventilator is present in the option list but marked unavailable (§5: future update)', () => {
    const vent = oxygenDevice('ventilator');
    expect(vent?.available).toBe(false);
  });

  it('BVM/CPAP/BiPAP have no adjustable flow rate in v1', () => {
    expect(oxygenDevice('bvm')?.flow).toBeUndefined();
    expect(oxygenDevice('cpap')?.flow).toBeUndefined();
    expect(oxygenDevice('bipap')?.flow).toBeUndefined();
  });

  it('defaultPeep is 0 in cardiac arrest and 5 otherwise (§5)', () => {
    expect(defaultPeep(true)).toBe(0);
    expect(defaultPeep(false)).toBe(5);
  });

  it('offers exactly the six delivery devices named in the spec', () => {
    expect(OXYGEN_DEVICE_OPTIONS.map((d) => d.id).sort()).toEqual(
      ['bipap', 'bvm', 'cpap', 'nasal_cannula', 'non_rebreather', 'ventilator'].sort(),
    );
  });
});

describe('IV / IO access options (§6)', () => {
  it('Peripheral IV needs no site; EZ-IO does', () => {
    expect(ivMethod('peripheral_iv')?.needsSite).toBe(false);
    expect(ivMethod('ez_io')?.needsSite).toBe(true);
  });

  it('EZ-IO offers Proximal Tibia and Humerus', () => {
    expect(EZ_IO_SITE_OPTIONS.map((s) => s.id)).toEqual(['proximal_tibia', 'humerus']);
  });

  it('every IV method option resolves through the catalog', () => {
    for (const m of IV_METHOD_OPTIONS) {
      expect(ivMethod(m.id)).toBe(m);
    }
  });
});

describe('pain protocol lookup (§8)', () => {
  const model: TreatmentModel = {
    reassessment: {
      airway: { text: 'Patent.', source: 'exam' },
      breathing: { text: 'Unlabored.', source: 'exam' },
      circulation: { text: 'Strong radial pulses.', source: 'exam' },
      mentalStatus: { text: 'Alert and oriented.', source: 'exam' },
      pain: { text: '4/10.', source: 'patient' },
      vitals: { text: 'HR 92, RR 18, BP 132/84, SpO2 97%.', source: 'device' },
    },
    painProtocols: [
      { treatmentId: 'fentanyl', recommendedDose: '1 mcg/kg IV/IN, per protocol.' },
      { treatmentId: 'ketamine', recommendedDose: '0.2 mg/kg IV, per protocol.' },
    ],
    aedShockAdvised: true,
    patientInArrest: false,
  };

  it('finds the protocol dose text for a known treatment id', () => {
    expect(painProtocolFor(model, 'fentanyl')?.recommendedDose).toContain('mcg/kg');
  });

  it('returns undefined for a treatment with no protocol entry', () => {
    expect(painProtocolFor(model, 'oxygen')).toBeUndefined();
  });
});
