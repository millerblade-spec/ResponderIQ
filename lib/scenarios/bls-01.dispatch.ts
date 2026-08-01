import { RADIO_CHANNEL, UNIT_CALLSIGN } from '@/lib/opsim/constants';
import type { DifferentialChoice, DispatchInfo, ParkingOption } from '@/lib/opsim/types';
import type { SceneConfig } from '@/lib/opsim/scene';
import type { DifficultyName } from '@/lib/opsim/dynamics';
import { bls01 } from './bls-01';

/** A Scene Dynamics distraction and when it appears (seconds after on-scene ops begin, §20). */
export interface ScenarioDistraction {
  readonly id: string;
  readonly type: string;
  readonly appearAtSecond: number;
}

/** BLS-01 dynamics: an anxious family, then a loud television. Difficulty gates how many run at once. */
export const bls01Distractions: readonly ScenarioDistraction[] = [
  { id: 'family', type: 'family', appearAtSecond: 2 },
  { id: 'television', type: 'television', appearAtSecond: 6 },
];

export const bls01DynamicsDifficulty: DifficultyName = 'basic';

/**
 * Where to park, relative to the apartment building — asked on arrival rather
 * than deriving the windshield view automatically. Each option is a real
 * logistics trade-off; none is an instant fail.
 */
export const bls01ParkingOptions: readonly ParkingOption[] = [
  {
    id: 'front_entrance',
    label: 'Right in front of the main entrance',
    detail: 'Shortest carry to the door, but the truck blocks the narrow street.',
  },
  {
    id: 'across_street',
    label: 'Across the street, nose out',
    detail: 'Short walk over, clear exit path when it’s time to load and go.',
  },
  {
    id: 'down_block',
    label: 'Down the block in the open stretch',
    detail: 'Completely out of the way — but a long carry back with a loaded stretcher.',
  },
];

/**
 * Seconds after Medic 3 goes on scene before the fire engine arrives. At this
 * base/BLS difficulty fire arrives WITH the medics (0s). A future
 * higher-difficulty variant makes the medics work short-handed first by setting
 * this to ~15–30 — adjust the value; nothing else needs to change.
 */
export const bls01FireArrivalDelaySeconds = 0;

/** Advanced variant for demonstrating several competing distractions at once. */
export const bls01AdvancedDistractions: readonly ScenarioDistraction[] = [
  { id: 'family', type: 'family', appearAtSecond: 2 },
  { id: 'television', type: 'television', appearAtSecond: 3 },
  { id: 'bystander', type: 'bystander', appearAtSecond: 4 },
  { id: 'traffic', type: 'traffic', appearAtSecond: 5 },
  { id: 'patient', type: 'patient_behavior', appearAtSecond: 6 },
];

/**
 * Operational dispatch data for BLS-01, kept in scenario data (not hard-coded
 * into the modal). The differential list is exactly 15 choices, every one
 * reasonably connected to a "residential fall, patient says he's okay,
 * third-floor walkup" dispatch (§8) — no unrelated filler.
 */
export const bls01Dispatch: DispatchInfo = {
  unit: UNIT_CALLSIGN,
  radioChannel: RADIO_CHANNEL,
  responseMode: 'code_3',
  callType: 'Residential fall',
  location: 'Third-floor walkup, no elevator',
  narrative: bls01.dispatchSummary,
};

export const bls01Differentials: readonly DifferentialChoice[] = [
  { id: 'mechanical_fall', label: 'Mechanical fall — isolated injury' },
  { id: 'hip_fracture', label: 'Hip or pelvic fracture' },
  { id: 'extremity_fracture', label: 'Extremity fracture (wrist/shoulder)' },
  { id: 'head_injury', label: 'Head injury / intracranial bleed' },
  { id: 'c_spine_injury', label: 'Cervical spine injury' },
  { id: 'syncope_cardiac', label: 'Syncope from a cardiac cause' },
  { id: 'arrhythmia', label: 'Cardiac arrhythmia' },
  { id: 'stroke', label: 'Stroke / CVA causing the fall' },
  { id: 'hypoglycemia', label: 'Hypoglycemia' },
  { id: 'orthostatic', label: 'Orthostatic hypotension / dehydration' },
  { id: 'occult_bleed', label: 'Occult internal bleeding (anticoagulated)' },
  { id: 'medication_effect', label: 'Medication effect / polypharmacy' },
  { id: 'infection_sepsis', label: 'Infection / sepsis causing weakness' },
  { id: 'long_lie', label: 'Long lie / rhabdomyolysis' },
  { id: 'intoxication', label: 'Alcohol or intoxication' },
];

/**
 * The normal BLS-01 scene (§15–§17): a nighttime residential fall at a walkup
 * apartment building. The windshield view builds the "is this scene safe"
 * judgment from concrete reads: darkness, weather, road condition (potholes —
 * poor upkeep), lawn condition and cans/litter (neglect indicators), and a
 * group of people near the entrance. Darkness motivates the scene-lights
 * prompt (the right call here is yes); lights reveal ground hazards that were
 * invisible in the dark.
 */
export const bls01Scene: SceneConfig = {
  dispatchStaging: false,
  securityThreat: false,
  lowVisibility: true,
  nearRoadway: false,
  weatherRequiresGear: false,
  presentFactorIds: [
    'night',
    'potholes',
    'unkempt_lawn',
    'cans_and_litter_in_the_yard',
    'group_of_people_near_the_entrance',
  ],
  lightRevealedFactorIds: ['standing_water', 'broken_glass'],
};

/**
 * A security-scene variant of BLS-01 (§16, §18): dispatch advised staging for
 * law enforcement and there is a credible weapons threat. Drives the staging →
 * police-clearance sequence and the ballistic-PPE prompt. Used for the
 * staging/PPE flows and screenshots.
 */
export const bls01SecurityScene: SceneConfig = {
  dispatchStaging: true,
  securityThreat: true,
  lowVisibility: true,
  nearRoadway: true,
  weatherRequiresGear: false,
  presentFactorIds: ['night', 'visible_weapons', 'aggressive_crowd', 'person_yelling_or_pacing'],
  lightRevealedFactorIds: [],
};
