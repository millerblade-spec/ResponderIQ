/**
 * MAX BVM and DSI — the two 100% hard stops.
 *
 * The prompts are emphatic and this module is deliberately literal about it:
 * never assume an omitted step, never fill in missing equipment, never pretend
 * positioning or monitoring or the timer happened, never let experience
 * replace a mandatory step, and never let a good outcome erase a miss. There
 * is no partial credit here and no scoring — a checklist either passed in
 * full or it did not.
 *
 * The checklist items are the ones the prompts enumerate, which the prompts in
 * turn draw from the CURRENT Fort Worth Regional EMS System protocols. Fort
 * Worth is the authority: if a loaded protocol revision changes an element,
 * this list follows it rather than the other way round. Items marked
 * conditional are the prompts' own "as applicable" — they count only when the
 * presentation calls for them.
 */
import type { HardStopChecklist, HardStopOutcome, HardStopResult } from './types';

const FORT_WORTH = 'Current Fort Worth Regional EMS System protocol';

export const MAX_BVM_CHECKLIST: HardStopChecklist = {
  id: 'max_bvm',
  title: 'Max BVM',
  source: FORT_WORTH,
  items: [
    // Fort Worth's definition of Max BVM itself.
    { id: 'two_npas', label: 'Two NPAs', conditional: false },
    { id: 'opa', label: 'OPA', conditional: false },
    { id: 'hfnc', label: 'HFNC', conditional: false },
    { id: 'high_flow_bvm_oxygen', label: 'High-flow BVM oxygen', conditional: false },
    // Assisted mask ventilation, enforced as applicable.
    { id: 'position_for_patency', label: 'Position for patency', conditional: false },
    { id: 'etsn_or_neutral', label: 'ETSN positioning, or neutral when trauma requires it', conditional: false },
    { id: 'hob_30', label: 'HOB 30° for non-cardiac-arrest invasive-airway preparation', conditional: true },
    { id: 'mask_seal', label: 'Strong mask seal', conditional: false },
    { id: 'two_rescuer', label: 'Preferred two-rescuer technique', conditional: true },
    { id: 'grip', label: 'Thenar grip or E-C clamp', conditional: false },
    { id: 'bag_squeeze', label: 'Appropriate bag squeeze', conditional: false },
    { id: 'etco2_waveform', label: '4-phase EtCO2 waveform with every breath when equipped/required', conditional: true },
    { id: 'monitoring', label: 'SpO2 / EtCO2 monitoring', conditional: false },
    { id: 'oxygen_flow', label: 'Appropriate oxygen flow', conditional: false },
    { id: 'avoid_excess', label: 'Avoid excessive rate, pressure, or tidal volume', conditional: false },
  ],
};

export const DSI_CHECKLIST: HardStopChecklist = {
  id: 'dsi',
  title: 'DSI',
  source: FORT_WORTH,
  items: [
    { id: 'begin_preparation', label: 'Begin invasive-airway preparation', conditional: false },
    { id: 'bp_q2', label: 'BP cycling every 2 minutes', conditional: false },
    { id: 'ecg', label: 'ECG', conditional: false },
    { id: 'etco2', label: 'EtCO2', conditional: false },
    { id: 'spo2_opposite_arm', label: 'SpO2 on the arm opposite the BP cuff', conditional: false },
    { id: 'airway_evaluation', label: 'Airway evaluation', conditional: false },
    { id: 'cric_landmarks', label: 'Cricothyroid landmarks identified / palpated', conditional: false },
    { id: 'push_dose_epi', label: 'Push-dose epinephrine readily available', conditional: false },
    { id: 'address_hypotension', label: 'Hypotension addressed via Circulatory Support', conditional: true },
    { id: 'ketamine', label: 'Ketamine 2 mg/kg IV/IO, max 200 mg; repeat PRN x1', conditional: false },
    { id: 'positioning', label: 'ETSN positioning, HOB 30° non-arrest, neutral for suspected trauma', conditional: false },
    { id: 'shoulder_ramping', label: 'Shoulder ramping considered for obesity', conditional: true },
    { id: 'nc_flush', label: 'NC to flush rate', conditional: false },
    { id: 'preoxygenation', label: 'Preoxygenation / denitrogenation', conditional: false },
    { id: 'peep', label: 'PEEP ≥5 mmHg, titrated to maximal SpO2 when respirations are inadequate', conditional: false },
    { id: 'oxygenation_timer', label: 'Full uninterrupted 3-minute countdown at SpO2 ≥94%, reset if it drops', conditional: false },
    { id: 'intubation_checklist', label: 'Complete Fort Worth intubation checklist, kit dump and equipment actually present', conditional: false },
    { id: 'rocuronium', label: 'Rocuronium 1.5 mg/kg IV/IO once, max 150 mg', conditional: false },
    { id: 'paralysis_countdown', label: 'Full 90-second paralysis countdown', conditional: false },
    { id: 'confirm_sbp', label: 'Affirmatively confirm SBP ≥100 before intubation', conditional: false },
    { id: 'confirm_spo2', label: 'Affirmatively confirm SpO2 ≥94% continuously for at least 3 minutes', conditional: false },
    { id: 'attempt_discipline', label: 'Max 2 intubation attempts per patient, aborting below SpO2 94%', conditional: false },
    { id: 'confirm_ett', label: '4-phase EtCO2 ≥5 mmHg within 5 breaths, two-clinician visualization as required', conditional: false },
    { id: 'post_airway', label: 'Post-airway sedation/analgesia, HOB ≥30° absent spinal injury, EtCO2 reconfirmation, DOPES on deterioration', conditional: false },
  ],
};

export const HARD_STOPS: readonly HardStopChecklist[] = [MAX_BVM_CHECKLIST, DSI_CHECKLIST];

export function hardStopChecklist(id: HardStopChecklist['id']): HardStopChecklist {
  const found = HARD_STOPS.find((checklist) => checklist.id === id);
  if (!found) throw new Error(`no such hard stop: ${id}`);
  return found;
}

/**
 * Evaluates one hard stop for one case. A checklist passes only when every
 * item that applied was actually performed. Items the learner did not report
 * are missed, not assumed — an unreported step is exactly the thing the
 * prompts forbid crediting.
 *
 * A conditional item can be excluded by the presentation via
 * notApplicableItemIds; a mandatory item can never be excluded that way, so no
 * amount of "it didn't really apply" can quietly retire a required step.
 */
export function evaluateHardStop(outcome: HardStopOutcome): HardStopResult {
  const checklist = hardStopChecklist(outcome.id);
  if (!outcome.required) {
    return { id: checklist.id, title: checklist.title, required: false, passed: true, missedItems: [] };
  }

  const completed = new Set(outcome.completedItemIds);
  const excused = new Set(outcome.notApplicableItemIds);
  const missedItems = checklist.items
    .filter((item) => !completed.has(item.id))
    .filter((item) => !(item.conditional && excused.has(item.id)))
    .map((item) => ({ id: item.id, label: item.label }));

  return {
    id: checklist.id,
    title: checklist.title,
    required: true,
    passed: missedItems.length === 0,
    missedItems,
  };
}

export function evaluateHardStops(outcomes: readonly HardStopOutcome[]): readonly HardStopResult[] {
  return outcomes.map(evaluateHardStop);
}

/** Hard-stop failures in a case. Used to block mastery no matter the score. */
export function failedHardStops(results: readonly HardStopResult[]): readonly HardStopResult[] {
  return results.filter((result) => result.required && !result.passed);
}
