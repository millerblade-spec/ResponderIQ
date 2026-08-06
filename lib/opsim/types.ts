/**
 * Types for the real-time operational simulator sequence (§7–§9): dispatch,
 * Code 3 response, the differential challenge, and equipment selection.
 *
 * This is a separate, typed state model layered on top of the existing
 * deterministic engine — it does not replace it. All transitions are pure
 * functions in machine.ts; timing is driven by lib/engine/missionClock.
 */

/** Orientation vs any level above it — drives the differential countdown length (§8). */
export type DifficultyLevel = 'orientation' | 'advanced';

/** Code 3 responding (beacons flashing) vs arrived on scene (§7). */
export type ResponseStatus = 'responding' | 'on_scene';

export type OpSimStage =
  | 'dispatch' // 3s tone playing / dispatch info shown; mission clock running
  | 'differential' // WHAT ARE YOU PREPARING FOR? open (or locked in, still en route)
  | 'parking' // ON SCENE the moment the differential timer ends — where do we park?
  | 'ready'; // parked — on-scene operations begin (windshield first)

export interface DispatchInfo {
  readonly unit: string; // always "Medic 3" (§5, §7)
  readonly radioChannel: string; // always "EMS 2" (§7)
  readonly responseMode: 'code_3' | 'code_2';
  readonly callType: string;
  readonly location: string;
  readonly narrative: string;
}

export interface DifferentialChoice {
  readonly id: string;
  readonly label: string;
}

export interface DifferentialState {
  readonly open: boolean;
  /** Ids the learner has selected, in selection order. */
  readonly selected: readonly string[];
  /** Selected ids arranged in priority order; the first `rankedCount` are the ranked top four (§8). */
  readonly ranking: readonly string[];
  readonly finalized: boolean;
  /** True if finalized because the timer expired rather than by the learner confirming. */
  readonly finalizedByTimeout: boolean;
}

export interface EquipmentState {
  /** True once Ron has asked "what do you want to bring in?" (§9). */
  readonly promptShown: boolean;
  readonly open: boolean;
  /** Ids the learner chose to bring in — immediately available on scene (§9). */
  readonly selected: readonly string[];
  readonly confirmed: boolean;
}

/** A parking option relative to the apartment building (asked on arrival, not derived). */
export interface ParkingOption {
  readonly id: string;
  readonly label: string;
  /** What the spot trades off — shown to the learner before choosing. */
  readonly detail: string;
}

export interface ParkingState {
  readonly open: boolean;
  readonly choice?: string;
}

export interface OpSimState {
  readonly scenarioId: string;
  readonly level: DifficultyLevel;
  readonly stage: OpSimStage;
  readonly toneComplete: boolean;
  readonly responseStatus: ResponseStatus;
  readonly differential: DifferentialState;
  readonly parking: ParkingState;
}

/** After equipment is confirmed: what is on scene vs still on Medic 3 (needing the 45s retrieval, §9). */
export interface EquipmentAvailability {
  readonly onScene: readonly string[];
  readonly onMedic3: readonly string[];
  /** Seconds to physically retrieve any single unselected item later (§9, §29). */
  readonly retrievalSeconds: number;
}
