/**
 * BLS-01's Treatment Engine data (Treatment Engine v1). Kept separate from
 * bls-01.dispatch.ts, which is already large. This is the FIRST consumer of
 * the engine, not a special case of it — a future scenario supplies its own
 * TreatmentConfig/TreatmentModel and reuses the same TreatmentPanel/AedPanel
 * code unchanged.
 */
import type { TreatmentConfig, TreatmentModel } from '@/lib/opsim/treatment';

/**
 * BLS-01 is a Basic scenario: the learner is EMT-tier, so every
 * Paramedic-scope treatment (IV/IO access, fluids/blood/pressors, Fentanyl,
 * Ketamine) prompts the Scope-of-Practice override once per skill (§4). All
 * nine catalog treatments are available — BLS-01 doesn't restrict the list.
 */
export const bls01TreatmentConfig: TreatmentConfig = {
  learnerScope: 'emt',
};

/**
 * Reassessment content mirrors the patient's baseline picture from
 * bls-01.dispatch's clinical model (an older adult, alert, on anticoagulation,
 * hip/pelvic pain) — reworded for the Treatment tab's broader six-field
 * snapshot rather than duplicating clinical.ts's vitals-only reassessment.
 */
export const bls01TreatmentModel: TreatmentModel = {
  reassessment: {
    airway: { text: 'Patent — still speaking in full sentences.', source: 'exam' },
    breathing: { text: 'Slightly increased effort, no distress.', source: 'exam' },
    circulation: { text: 'Skin pale and cool; radial pulses present.', source: 'exam' },
    mentalStatus: { text: 'Alert and oriented, appropriate answers.', source: 'exam' },
    pain: { text: '3/10, right hip — unchanged since last check.', source: 'patient' },
    vitals: { text: 'HR 96 irregular, RR 20, BP 148/88, SpO₂ 94% on room air.', source: 'device' },
  },
  painProtocols: [
    { treatmentId: 'fentanyl', recommendedDose: '1 mcg/kg slow IV/IN, per regional protocol.' },
    { treatmentId: 'ketamine', recommendedDose: '0.2–0.3 mg/kg IV, per regional protocol.' },
  ],
  // BLS-01's patient is alert and breathing on his own — never in arrest, so
  // the AED path (if the learner opens it) has nothing to shock.
  aedShockAdvised: false,
  patientInArrest: false,
};
