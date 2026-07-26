/**
 * Medic 3 truck inventory content (§5). This EXTENDS the single equipment
 * catalog from Step 4 (lib/opsim/equipment.ts) — it does not duplicate it. The
 * catalog remains the source of truth for ids/labels; this adds the contents of
 * the four detailed bags/monitor, the "other equipment" view, and the fixed
 * operational notes.
 */
import { EQUIPMENT_CATALOG, type EquipmentItem } from './equipment';

/** The four items that open a detailed contents view (§4, §5). */
export const DETAILED_EQUIPMENT_IDS = ['als_bag', 'airway_bag', 'trauma_bag', 'cardiac_monitor'] as const;
export type DetailedEquipmentId = (typeof DETAILED_EQUIPMENT_IDS)[number];

export interface DetailedContents {
  readonly equipmentId: DetailedEquipmentId;
  readonly title: string;
  /** What the bag/monitor generally contains, or the monitor's capabilities/accessories. */
  readonly items: readonly string[];
  /** A fixed operational note shown with the contents (e.g. what is NOT in this bag). */
  readonly note?: string;
}

/** Exact operational concept for narcotics (§5): on the belt, not in the ALS bag; never "controlled medications". */
export const NARCOTICS_NOTE =
  'Narcotics are carried securely on the medic’s belt and remain under the medic’s direct control.';

/** Shown with ballistic equipment (§5, §18). */
export const BALLISTIC_WARNING = 'Ballistic protection does not make an unsecured scene safe.';

export const BAG_CONTENTS: Record<DetailedEquipmentId, DetailedContents> = {
  airway_bag: {
    equipmentId: 'airway_bag',
    title: 'Airway Bag',
    items: [
      'Full portable oxygen cylinder',
      'Adult, pediatric, and infant BVMs',
      'OPAs',
      'NPAs',
      'Supraglottic airways',
      'Intubation equipment',
      'Endotracheal tubes',
      'Laryngoscope handles and blades',
      'Bougie',
      'Nebulizer supplies',
      'CPAP supplies, if configured',
      'General airway accessories',
    ],
    note: 'Portable suction is not stored in the Airway Bag.',
  },
  als_bag: {
    equipmentId: 'als_bag',
    title: 'ALS Bag',
    items: [
      'ALS medications',
      'IV supplies',
      'IO supplies',
      'IV fluids',
      'Syringes',
      'Medication-administration supplies',
      'Glucometer',
      'Broselow tape',
      'General ALS equipment',
    ],
    note: NARCOTICS_NOTE,
  },
  trauma_bag: {
    equipmentId: 'trauma_bag',
    title: 'Trauma Bag',
    items: [
      'Tourniquets',
      'Hemorrhage-control supplies',
      'Trauma dressings',
      'Pressure dressings',
      'Chest seals',
      'Hemostatic gauze',
      'Burn supplies',
      'Trauma shears',
      'General trauma supplies',
    ],
    note: 'The pelvic binder is carried separately.',
  },
  cardiac_monitor: {
    equipmentId: 'cardiac_monitor',
    title: 'Cardiac Monitor',
    items: [
      'ECG monitoring',
      '12-lead ECG',
      'Manual defibrillation',
      'AED mode',
      'Synchronized cardioversion',
      'External pacing',
      'Pulse oximetry',
      'Noninvasive blood pressure',
      'End-tidal CO₂',
      'ECG leads',
      '12-lead cable',
      'Defibrillation/pacing pads',
      'SpO₂ sensor',
      'EtCO₂ nasal cannula',
      'EtCO₂ airway adapter',
      'Blood-pressure cuffs',
    ],
  },
};

export function isDetailed(id: string): id is DetailedEquipmentId {
  return (DETAILED_EQUIPMENT_IDS as readonly string[]).includes(id);
}

export interface OtherEquipmentItem {
  readonly id: string;
  readonly label: string;
  /** Optional note, e.g. carried for both crew members, or the ballistic warning. */
  readonly note?: string;
}

/**
 * Everything else visible on Medic 3 (§5): the catalog items that are not the
 * four detailed bags, presented with truck-check labels, plus weather gear.
 * Ballistic items carry the "for both crew members" note and the ballistic
 * warning. Built from the shared catalog so there is one source of truth.
 */
const OTHER_LABEL_OVERRIDES: Record<string, string> = {
  stretcher: 'Stretcher / cot / gurney',
  backboard: 'Long backboard',
};

const OTHER_NOTES: Record<string, string> = {
  ballistic_vests: `For both crew members. ${BALLISTIC_WARNING}`,
  ballistic_helmets: `For both crew members. ${BALLISTIC_WARNING}`,
};

export const OTHER_EQUIPMENT: readonly OtherEquipmentItem[] = [
  ...EQUIPMENT_CATALOG.filter((e: EquipmentItem) => !isDetailed(e.id)).map((e) => ({
    id: e.id,
    label: OTHER_LABEL_OVERRIDES[e.id] ?? e.label,
    note: OTHER_NOTES[e.id],
  })),
  // Weather gear is carried on Medic 3 (§18) but isn't a pre-arrival selection option, so it isn't in the catalog.
  { id: 'weather_gear', label: 'Weather gear' },
];
