/**
 * Packaging → descent → transport decision data for BLS-01 (fixes #12–#16).
 * Typed data only; the pure state machine lives in transportMachine.ts and the
 * component (TransportOps) schedules timing on the shared mission clock.
 *
 * Governing principle: every choice is judged against ONE goal — did it move
 * the patient safely from the scene to the hospital. A reasonable
 * field-improvised equivalent counts as correct (a sheet tied around the hips
 * IS a pelvic binder here).
 */

export interface DescentDeviceOption {
  readonly id: string;
  readonly label: string;
  /** Equipment-catalog id this device maps to (drives the 45s walk-back when off scene). */
  readonly equipmentId: string;
  /** A stair chair only works for a patient who can sit. */
  readonly requiresSitting: boolean;
  /** Rigid full-length device — must come OFF before transport (fix #15). */
  readonly rigid: boolean;
}

/** The descent-device choice is driven by assessed injuries, not a fixed script (fix #12). */
export const DESCENT_DEVICE_OPTIONS: readonly DescentDeviceOption[] = [
  { id: 'stair_chair', label: 'Stair chair', equipmentId: 'stair_chair', requiresSitting: true, rigid: false },
  { id: 'backboard', label: 'Backboard', equipmentId: 'backboard', requiresSitting: false, rigid: true },
  { id: 'scoop_stretcher', label: 'Scoop stretcher', equipmentId: 'scoop_stretcher', requiresSitting: false, rigid: true },
];

export function descentDevice(id: string): DescentDeviceOption | undefined {
  return DESCENT_DEVICE_OPTIONS.find((d) => d.id === id);
}

export interface PelvicSupportOption {
  readonly id: string;
  readonly label: string;
  /** Catalog id when the option uses truck equipment; the improvised sheet needs none. */
  readonly equipmentId?: string;
}

/**
 * Pelvic support for a SUSPECTED pelvic fracture (fix #12). The improvised
 * sheet is treated as exactly as correct as the manufactured binder — the goal
 * is a stabilized pelvis, not a specific product. Skipping it is also sound
 * when not clinically indicated.
 */
export const PELVIC_SUPPORT_OPTIONS: readonly PelvicSupportOption[] = [
  { id: 'pelvic_binder', label: 'Apply the pelvic binder', equipmentId: 'pelvic_binder' },
  { id: 'improvised_sheet', label: 'Tie a sheet around his hips (improvised binder)' },
  { id: 'none', label: 'No pelvic support — not indicated' },
];

/**
 * *** OPEN QUESTION — NOT YET RESOLVED. CONFIRM WITH RON BEFORE FINALIZING. ***
 *
 * This patient cannot tolerate a seated position, and a stair chair requires
 * sitting. Whether that makes the stair chair the WRONG choice for the actual
 * descent (bringing/prepping one early can still be a reasonable early move)
 * is deliberately NOT decided here. Until Ron confirms, everything downstream
 * (debrief, any scoring) must treat a stair-chair descent choice NEUTRALLY —
 * ask about the reasoning, record the answer, judge nothing.
 *
 * When Ron rules, flip this to 'wrong_for_descent' or 'acceptable' and wire the
 * corresponding debrief/scoring copy.
 */
export const STAIR_CHAIR_DESCENT_RULING: 'unresolved' | 'wrong_for_descent' | 'acceptable' = 'unresolved';

export interface PainManagementOption {
  readonly id: 'give' | 'withhold';
  readonly label: string;
}

/**
 * Pain-management ending for THIS difficulty tier (fix #16): the patient
 * complains of pain and the choice is strictly binary — give pain medicine or
 * don't. No dosage/route detail at this tier. This decision ends the scenario.
 *
 * Higher-tier hook: replace PAIN_MANAGEMENT_OPTIONS (and extend the recorded
 * decision) with dosage/route steps for a future tier — the machine records an
 * option id, so richer option sets slot in without structural change.
 */
export const PAIN_MANAGEMENT_OPTIONS: readonly PainManagementOption[] = [
  { id: 'give', label: 'Give pain medicine' },
  { id: 'withhold', label: 'Don’t give pain medicine' },
];

export const RON_TRANSPORT_LINES = {
  deviceChoice:
    'How do you want to package him for the stairs, partner? Your call — go off what you found.',
  pelvicChoice:
    'Anything for that hip and pelvis before we lift? Binder’s on the truck — or a sheet works if you want to improvise.',
  secured: 'He’s secured. Fire’s got the corners — let’s take it slow on the stairs.',
  stretcher: 'Alright, stretcher’s right here. Let’s get him over.',
  pain: 'He’s hurting. What do you want to do about pain before we roll?',
} as const;

export const TRANSPORT_NARRATIVE = {
  securing: 'The crew straps him in and pads the pressure points. He stays as flat as he needs to be.',
  descent:
    'Fire takes the head and foot ends, you and your partner control the middle — one flight at a time, calling steps.',
  alsWorkup:
    'Downstairs, the paramedic runs a full set of vitals and gets the cardiac monitor on while you set up the stretcher.',
  boardRemovalWhy:
    'A backboard is an extrication tool, not a transport mattress — riding on one causes pressure injury and pain and can worsen breathing. Off before transport.',
} as const;
