import { RADIO_CHANNEL, UNIT_CALLSIGN } from '@/lib/opsim/constants';
import type { DifferentialChoice, DispatchInfo } from '@/lib/opsim/types';
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
 * The normal BLS-01 scene (§15–§17): a dusk fall near a roadway. Low visibility
 * plus the roadway motivate the scene-lights prompt; no staging/security. Scene
 * lights reveal a couple of otherwise-hidden ground hazards.
 */
export const bls01Scene: SceneConfig = {
  dispatchStaging: false,
  securityThreat: false,
  lowVisibility: true,
  nearRoadway: true,
  weatherRequiresGear: false,
  presentFactorIds: ['dusk', 'unsafe_shoulder', 'heavy_traffic', 'bystanders_surrounding_the_patient'],
  lightRevealedFactorIds: ['standing_water', 'potholes'],
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
