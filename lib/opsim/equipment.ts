/**
 * Medic 3 equipment catalog (§5, §9).
 *
 * Every approved equipment-selection option, as typed data. `detailed`
 * marks the four items that get an expandable contents view in the Truck
 * Check slice (ALS Bag, Airway Bag, Trauma Bag, Cardiac Monitor); it is
 * carried here so the same catalog serves both selection and check-off.
 */
export interface EquipmentItem {
  readonly id: string;
  readonly label: string;
  /** One of the four bags/monitor that gets an expandable contents view later (§5). */
  readonly detailed?: boolean;
}

export const EQUIPMENT_CATALOG: readonly EquipmentItem[] = [
  { id: 'airway_bag', label: 'Airway Bag', detailed: true },
  { id: 'als_bag', label: 'ALS Bag', detailed: true },
  { id: 'trauma_bag', label: 'Trauma Bag', detailed: true },
  { id: 'cardiac_monitor', label: 'Cardiac Monitor', detailed: true },
  { id: 'stretcher', label: 'Stretcher' },
  { id: 'stair_chair', label: 'Stair Chair' },
  { id: 'scoop_stretcher', label: 'Scoop Stretcher' },
  { id: 'portable_suction', label: 'Portable Suction' },
  { id: 'tarp', label: 'Tarp' },
  { id: 'backboard', label: 'Backboard' },
  { id: 'collar_bag', label: 'Collar Bag' },
  { id: 'sam_splint', label: 'SAM Splint' },
  { id: 'iv_pump', label: 'IV Pump' },
  { id: 'pelvic_binder', label: 'Pelvic Binder' },
  { id: 'ob_kit', label: 'OB Kit' },
  { id: 'blankets', label: 'Blankets' },
  { id: 'ppe', label: 'PPE' },
  { id: 'ballistic_vests', label: 'Ballistic vests' },
  { id: 'ballistic_helmets', label: 'Ballistic helmets' },
];

export function equipmentLabel(id: string): string {
  return EQUIPMENT_CATALOG.find((e) => e.id === id)?.label ?? id;
}
