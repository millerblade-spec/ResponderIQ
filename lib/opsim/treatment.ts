/**
 * Treatment Engine catalogs and scenario-data types (Treatment Engine v1).
 *
 * This module is deliberately scenario-agnostic: BLS-01 is the first
 * consumer, but nothing here references it — see
 * lib/scenarios/bls-01.treatment.ts for the BLS-01 instance. A future ALS,
 * Critical Care, Flight, or Pediatric scenario supplies its own
 * TreatmentConfig/TreatmentModel and reuses the same engine and panel code.
 *
 * V1 scope, by design: no dosage math, no full patient-response physiology,
 * no ventilator settings, no crew-task delegation for treatments (the lead
 * medic performs these directly — the shared crew model's task queue is a
 * natural v2 hook, not built here). AED/CPR is the one timed sub-flow; every
 * other treatment records instantly ("simple success model for now").
 *
 * Two spec-level groupings worth calling out explicitly: Bag Valve Mask,
 * CPAP, BiPAP, and Ventilator are reached through ONE "Oxygen / Respiratory
 * Support" entry point's device picker, not four separate top-level cards
 * (matches the spec's own §5 framing of "Selecting Oxygen opens: Choose
 * oxygen delivery: ..."). Likewise EZ-IO is a method under "IV / IO Access"
 * (§6: "IV Access — Options: Peripheral IV, EZ-IO"), and Defibrillation/CPR
 * are stages of the single AED cycle (§9), not standalone cards.
 */
import type { SourcedFinding } from './clinical';

export type TreatmentCategory = 'airway_breathing' | 'circulation' | 'cardiac' | 'pain';

export const TREATMENT_CATEGORY_LABELS: Record<TreatmentCategory, string> = {
  airway_breathing: 'Airway & Breathing',
  circulation: 'Circulation',
  cardiac: 'Cardiac',
  pain: 'Pain',
};

export const TREATMENT_CATEGORY_ORDER: readonly TreatmentCategory[] = [
  'airway_breathing',
  'circulation',
  'cardiac',
  'pain',
];

/** Who normally performs this in the field — drives the Scope-of-Practice prompt (§4). */
export type TreatmentScope = 'emt' | 'paramedic';

/**
 * What kind of interaction this treatment needs. TreatmentPanel dispatches on
 * `kind`, never on a treatment's `id` — adding treatment #16 in a future
 * scenario means adding a catalog row, not new panel code.
 */
export type TreatmentKind =
  | 'device_select' // pick a delivery device/method from a small option list (Oxygen)
  | 'iv_access' // pick access method (+ site for EZ-IO), then a simple success/fail attempt (§6)
  | 'infusion' // a numeric rate/dose control (IV Fluids, Blood, pressors) (§7)
  | 'protocol_display' // shows the recommended protocol dose, no math (§8)
  | 'aed_cycle'; // opens the timed AED analyze/shock/CPR sub-flow (§9)

export interface TreatmentDef {
  readonly id: string;
  readonly label: string;
  readonly category: TreatmentCategory;
  readonly scope: TreatmentScope;
  readonly kind: TreatmentKind;
  /** The nearest existing crew task this maps to — reference only; v1 does not delegate treatments to crew. */
  readonly crewTaskId?: string;
}

export const TREATMENT_CATALOG: readonly TreatmentDef[] = [
  {
    id: 'oxygen',
    label: 'Oxygen / Respiratory Support',
    category: 'airway_breathing',
    scope: 'emt',
    kind: 'device_select',
    crewTaskId: 'apply_oxygen',
  },
  {
    id: 'iv_access',
    label: 'IV / IO Access',
    category: 'circulation',
    scope: 'paramedic',
    kind: 'iv_access',
    crewTaskId: 'establish_iv',
  },
  { id: 'iv_fluids', label: 'IV Fluids', category: 'circulation', scope: 'paramedic', kind: 'infusion' },
  { id: 'blood', label: 'Blood', category: 'circulation', scope: 'paramedic', kind: 'infusion' },
  {
    id: 'norepinephrine',
    label: 'Norepinephrine (Levophed)',
    category: 'circulation',
    scope: 'paramedic',
    kind: 'infusion',
  },
  { id: 'epinephrine_drip', label: 'Epinephrine Drip', category: 'circulation', scope: 'paramedic', kind: 'infusion' },
  { id: 'aed', label: 'AED', category: 'cardiac', scope: 'emt', kind: 'aed_cycle' },
  { id: 'fentanyl', label: 'Fentanyl', category: 'pain', scope: 'paramedic', kind: 'protocol_display' },
  { id: 'ketamine', label: 'Ketamine', category: 'pain', scope: 'paramedic', kind: 'protocol_display' },
];

export function treatmentDef(id: string): TreatmentDef | undefined {
  return TREATMENT_CATALOG.find((t) => t.id === id);
}

/** Treatments in a category, filtered to a scenario's enabled list when one is given. */
export function treatmentsByCategory(
  category: TreatmentCategory,
  enabledTreatmentIds?: readonly string[],
): readonly TreatmentDef[] {
  return TREATMENT_CATALOG.filter(
    (t) => t.category === category && (enabledTreatmentIds === undefined || enabledTreatmentIds.includes(t.id)),
  );
}

// ---- Oxygen device options (§5) ----

export interface OxygenDeviceOption {
  readonly id: string;
  readonly label: string;
  /** Undefined when the device has no adjustable flow rate in v1 (BVM/CPAP/BiPAP/Ventilator). */
  readonly flow?: { readonly defaultLpm: number; readonly minLpm: number; readonly maxLpm: number };
  /** False shows the "future update" placeholder instead of a settings UI (§5: Ventilator). */
  readonly available: boolean;
}

export const OXYGEN_DEVICE_OPTIONS: readonly OxygenDeviceOption[] = [
  { id: 'nasal_cannula', label: 'Nasal Cannula', flow: { defaultLpm: 4, minLpm: 1, maxLpm: 6 }, available: true },
  { id: 'non_rebreather', label: 'Non-Rebreather', flow: { defaultLpm: 15, minLpm: 10, maxLpm: 15 }, available: true },
  { id: 'bvm', label: 'Bag Valve Mask', available: true },
  { id: 'cpap', label: 'CPAP', available: true },
  { id: 'bipap', label: 'BiPAP', available: true },
  { id: 'ventilator', label: 'Ventilator', available: false },
];

export function oxygenDevice(id: string): OxygenDeviceOption | undefined {
  return OXYGEN_DEVICE_OPTIONS.find((d) => d.id === id);
}

/** BVM's PEEP selector (§5) — a fixed 3-choice set, not a free slider. */
export interface PeepOption {
  readonly id: 0 | 5 | 8;
  readonly label: string;
  readonly hint: string;
}

export const BVM_PEEP_OPTIONS: readonly PeepOption[] = [
  { id: 0, label: '0', hint: 'Default if the patient is in cardiac arrest.' },
  { id: 5, label: '5', hint: 'Default if the patient is breathing.' },
  { id: 8, label: '8', hint: 'May improve oxygenation for selected respiratory-distress patients.' },
];

/** The PEEP value Version 1's rule picks by default, given whether the patient is in arrest (§5). */
export function defaultPeep(patientInArrest: boolean): 0 | 5 {
  return patientInArrest ? 0 : 5;
}

// ---- IV / IO access (§6) ----

export interface IvMethodOption {
  readonly id: 'peripheral_iv' | 'ez_io';
  readonly label: string;
  /** EZ-IO needs a site choice; peripheral IV does not (v1). */
  readonly needsSite: boolean;
}

export const IV_METHOD_OPTIONS: readonly IvMethodOption[] = [
  { id: 'peripheral_iv', label: 'Peripheral IV', needsSite: false },
  { id: 'ez_io', label: 'EZ-IO', needsSite: true },
];

export function ivMethod(id: string): IvMethodOption | undefined {
  return IV_METHOD_OPTIONS.find((m) => m.id === id);
}

export interface IvSiteOption {
  readonly id: string;
  readonly label: string;
}

export const EZ_IO_SITE_OPTIONS: readonly IvSiteOption[] = [
  { id: 'proximal_tibia', label: 'Proximal Tibia' },
  { id: 'humerus', label: 'Humerus' },
];

// ---- Pain protocol reference text (§8) — display only, no dosage math ----

export interface PainProtocol {
  readonly treatmentId: string;
  readonly recommendedDose: string;
}

export function painProtocolFor(model: TreatmentModel, treatmentId: string): PainProtocol | undefined {
  return model.painProtocols.find((p) => p.treatmentId === treatmentId);
}

export const RON_TREATMENT_LINES = {
  scopeOverrideTitle: '⚠️ PARAMEDIC SKILL',
  scopeOverridePrompt: 'This procedure is normally performed by a Paramedic.',
  scopeOverrideQuestion: 'Did your Medical Director authorize you to perform this skill for this training scenario?',
  reassessPrompt: 'Take another look — how does he look right now?',
} as const;

/** The per-scenario extension point (§10) — mirrors SceneConfig's role for scene safety. */
export interface TreatmentConfig {
  /** The learner's own certification tier for THIS scenario. BLS-01 is 'emt'; a future ALS scenario sets 'paramedic'. */
  readonly learnerScope: TreatmentScope;
  /** Undefined = every catalog item is available. A future scenario can restrict its treatment list. */
  readonly enabledTreatmentIds?: readonly string[];
}

/** Per-scenario clinical content the Treatment Engine reads but never invents (§2, §9). */
export interface TreatmentModel {
  /** Current-condition snapshot the Reassess Patient button reveals (§2). Reuses clinical.ts's SourcedFinding convention. */
  readonly reassessment: {
    readonly airway: SourcedFinding;
    readonly breathing: SourcedFinding;
    readonly circulation: SourcedFinding;
    readonly mentalStatus: SourcedFinding;
    readonly pain: SourcedFinding;
    readonly vitals: SourcedFinding;
  };
  readonly painProtocols: readonly PainProtocol[];
  /**
   * Whether the analyzed rhythm is shockable. AedPanel reads this — it never
   * decides shockability itself (§9: "do not hard-code rhythm behavior").
   * A boolean is enough for v1; a future version can make this a function of
   * live patient state for multi-cycle variation.
   */
  readonly aedShockAdvised: boolean;
  /** Whether the patient is in cardiac arrest right now — drives BVM's default PEEP (§5). */
  readonly patientInArrest: boolean;
}
