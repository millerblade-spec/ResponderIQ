import { describe, it, expect } from 'vitest';
import {
  BAG_CONTENTS,
  DETAILED_EQUIPMENT_IDS,
  OTHER_EQUIPMENT,
  NARCOTICS_NOTE,
  BALLISTIC_WARNING,
  isDetailed,
} from './truckInventory';
import { EQUIPMENT_CATALOG } from './equipment';

describe('Medic 3 truck inventory (§5)', () => {
  it('has exactly four detailed items: ALS, Airway, Trauma, Cardiac Monitor', () => {
    expect([...DETAILED_EQUIPMENT_IDS].sort()).toEqual(
      ['airway_bag', 'als_bag', 'cardiac_monitor', 'trauma_bag'].sort(),
    );
  });

  it('ALS Bag contains the expected items including Broselow tape and IV fluids', () => {
    const als = BAG_CONTENTS.als_bag;
    expect(als.items).toEqual(
      expect.arrayContaining(['IO supplies', 'IV fluids', 'Broselow tape', 'Glucometer', 'ALS medications']),
    );
  });

  it('carries narcotics on the medic’s belt — not in the ALS Bag, and not called "controlled medications"', () => {
    const als = BAG_CONTENTS.als_bag;
    expect(als.note).toBe(NARCOTICS_NOTE);
    expect(NARCOTICS_NOTE).toMatch(/on the medic’s belt/i);
    expect(als.items.join(' ')).not.toMatch(/narcotic/i);
    expect(als.note).not.toMatch(/controlled medications/i);
  });

  it('Airway Bag holds the oxygen cylinder and supraglottic airways but explicitly NOT portable suction', () => {
    const airway = BAG_CONTENTS.airway_bag;
    expect(airway.items).toEqual(
      expect.arrayContaining(['Full portable oxygen cylinder', 'Supraglottic airways']),
    );
    expect(airway.items.join(' ')).not.toMatch(/suction/i);
    expect(airway.note).toBe('Portable suction is not stored in the Airway Bag.');
  });

  it('Trauma Bag includes tourniquets and hemorrhage-control supplies; the pelvic binder is separate', () => {
    const trauma = BAG_CONTENTS.trauma_bag;
    expect(trauma.items).toEqual(
      expect.arrayContaining(['Tourniquets', 'Hemorrhage-control supplies', 'Chest seals']),
    );
    expect(trauma.items.join(' ')).not.toMatch(/pelvic/i);
    expect(trauma.note).toBe('The pelvic binder is carried separately.');
  });

  it('Cardiac Monitor lists the expected capabilities and accessories', () => {
    const mon = BAG_CONTENTS.cardiac_monitor;
    expect(mon.items).toEqual(
      expect.arrayContaining([
        '12-lead ECG',
        'External pacing',
        'Synchronized cardioversion',
        'End-tidal CO₂',
        'Defibrillation/pacing pads',
      ]),
    );
  });

  it('shows ballistic vests and helmets for both crew members, with the ballistic warning', () => {
    const vests = OTHER_EQUIPMENT.find((e) => e.id === 'ballistic_vests');
    const helmets = OTHER_EQUIPMENT.find((e) => e.id === 'ballistic_helmets');
    expect(vests?.note).toContain(BALLISTIC_WARNING);
    expect(vests?.note).toMatch(/both crew members/i);
    expect(helmets?.note).toContain(BALLISTIC_WARNING);
  });

  it('lists the pelvic binder among other equipment (carried separately, not in the Trauma Bag)', () => {
    expect(OTHER_EQUIPMENT.find((e) => e.id === 'pelvic_binder')).toBeDefined();
  });

  it('other-equipment view never duplicates the four detailed bags (one source of truth)', () => {
    for (const item of OTHER_EQUIPMENT) {
      expect(isDetailed(item.id)).toBe(false);
    }
    // Every non-detailed catalog item is represented, so nothing is lost.
    const catalogOther = EQUIPMENT_CATALOG.filter((e) => !isDetailed(e.id)).map((e) => e.id);
    for (const id of catalogOther) {
      expect(OTHER_EQUIPMENT.find((e) => e.id === id)).toBeDefined();
    }
  });
});
