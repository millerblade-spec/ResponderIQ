/**
 * Pure, typed state transitions for scene safety and the clinical-information
 * lock (§15–§19). No timers or React — the operational orchestrator schedules
 * the police 15s/10s sequence via the mission clock and calls these.
 *
 * The whole point of this module is the gate: clinical actions and findings
 * stay locked until the windshield assessment is done, the scene is safe to
 * enter (declared safe or cleared by police), the crew has exited the unit, and
 * patient contact is established (§19).
 */
import type { SceneConfig, SceneLightChoice, BallisticPpeChoice } from './scene';

export type SceneSafetyStage =
  | 'windshield' // reviewing what's visible from the unit; not safe to move yet
  | 'staging' // staged (ordered or by choice); waiting for it to be safe/cleared
  | 'safe_to_enter' // declared safe or cleared — may exit the unit
  | 'exited' // out of the unit, approaching
  | 'patient_contact'; // at the patient — clinical actions unlock here

export type AbcdUnknown = 'unknown' | 'assessed';

export interface SceneSafetyState {
  readonly stage: SceneSafetyStage;
  readonly windshieldReviewed: boolean;
  readonly staging: {
    readonly staged: boolean;
    readonly policeArrived: boolean;
    readonly sceneSecured: boolean;
    readonly clearedToEnter: boolean;
  };
  readonly sceneLights: {
    readonly promptRequired: boolean;
    readonly promptShown: boolean;
    readonly choice?: SceneLightChoice;
    readonly on: boolean;
  };
  readonly ballistic: {
    readonly promptRequired: boolean;
    readonly promptShown: boolean;
    readonly choice?: BallisticPpeChoice;
  };
  readonly weather: {
    readonly promptRequired: boolean;
    readonly geared: boolean;
  };
  /** Extra factors that became visible after scene lights came on (§17). */
  readonly revealedFactorIds: readonly string[];
  readonly patientContact: 'not_established' | 'established';
}

export function createSceneSafetyState(config: SceneConfig): SceneSafetyState {
  return {
    // Dispatch-ordered staging means you begin staged and cannot enter until cleared (§16).
    stage: config.dispatchStaging ? 'staging' : 'windshield',
    windshieldReviewed: false,
    staging: {
      staged: config.dispatchStaging,
      policeArrived: false,
      sceneSecured: false,
      clearedToEnter: false,
    },
    sceneLights: {
      promptRequired: config.lowVisibility || config.nearRoadway,
      promptShown: false,
      on: false,
    },
    ballistic: {
      promptRequired: config.securityThreat,
      promptShown: false,
    },
    weather: {
      promptRequired: config.weatherRequiresGear,
      geared: false,
    },
    revealedFactorIds: [],
    patientContact: 'not_established',
  };
}

/** Whether the crew may safely enter: either declared safe, or police cleared the scene (§16). */
export function isClearedToEnter(state: SceneSafetyState): boolean {
  return state.stage === 'safe_to_enter' || state.stage === 'exited' || state.stage === 'patient_contact';
}

/**
 * The clinical lock (§19). Clinical actions/findings are available ONLY after
 * the windshield is reviewed, the scene is safe to enter, the crew has exited,
 * and patient contact is established.
 */
export function clinicalUnlocked(state: SceneSafetyState): boolean {
  return (
    state.windshieldReviewed &&
    state.stage === 'patient_contact' &&
    state.patientContact === 'established'
  );
}

export function markWindshieldReviewed(state: SceneSafetyState): SceneSafetyState {
  return { ...state, windshieldReviewed: true };
}

/** Learner declares the scene safe to enter — only allowed when not under a staging hold (§16). */
export function declareSafeToEnter(state: SceneSafetyState, config: SceneConfig): SceneSafetyState {
  if (config.dispatchStaging && !state.staging.clearedToEnter) return state; // cannot self-clear a staging order
  if (state.stage !== 'windshield') return state;
  return { ...state, windshieldReviewed: true, stage: 'safe_to_enter' };
}

/** "Not Safe to Enter — Stage" — the learner stages on their own read of the scene (§16). */
export function stageForSafety(state: SceneSafetyState): SceneSafetyState {
  if (state.stage !== 'windshield') return state;
  return {
    ...state,
    windshieldReviewed: true,
    stage: 'staging',
    staging: { ...state.staging, staged: true },
  };
}

/** Police arrive (scheduled 15s after staging on a security scene, §16). */
export function policeArrive(state: SceneSafetyState): SceneSafetyState {
  if (!state.staging.staged || state.staging.policeArrived) return state;
  return { ...state, staging: { ...state.staging, policeArrived: true } };
}

/** Police secure the scene (10s after arriving) and advise "clear to enter" (§16). */
export function policeSecureScene(state: SceneSafetyState): SceneSafetyState {
  if (!state.staging.policeArrived || state.staging.sceneSecured) return state;
  return {
    ...state,
    stage: 'safe_to_enter',
    staging: { ...state.staging, sceneSecured: true, clearedToEnter: true },
  };
}

export function showSceneLightPrompt(state: SceneSafetyState): SceneSafetyState {
  if (!state.sceneLights.promptRequired) return state;
  return { ...state, sceneLights: { ...state.sceneLights, promptShown: true } };
}

/** Records the learner's scene-light choice; turning them on reveals any light-revealed factors (§17). */
export function chooseSceneLight(
  state: SceneSafetyState,
  choice: SceneLightChoice,
  config: SceneConfig,
): SceneSafetyState {
  const on = choice === 'scene_lights_on';
  return {
    ...state,
    sceneLights: { ...state.sceneLights, promptShown: true, choice, on },
    revealedFactorIds: on ? [...(config.lightRevealedFactorIds ?? [])] : state.revealedFactorIds,
  };
}

export function showBallisticPrompt(state: SceneSafetyState): SceneSafetyState {
  if (!state.ballistic.promptRequired) return state;
  return { ...state, ballistic: { ...state.ballistic, promptShown: true } };
}

export function chooseBallistic(state: SceneSafetyState, choice: BallisticPpeChoice): SceneSafetyState {
  return { ...state, ballistic: { ...state.ballistic, promptShown: true, choice } };
}

export function donWeatherGear(state: SceneSafetyState): SceneSafetyState {
  return { ...state, weather: { ...state.weather, geared: true } };
}

/**
 * Enter after staging on the learner's own read (§16): allowed only when there
 * was no dispatch staging order, or once police have cleared the scene.
 */
export function enterAfterStaging(state: SceneSafetyState, config: SceneConfig): SceneSafetyState {
  if (state.stage !== 'staging') return state;
  if (config.dispatchStaging && !state.staging.clearedToEnter) return state;
  return { ...state, stage: 'safe_to_enter' };
}

/** Exit the unit — only once it is safe to enter (§19). */
export function exitUnit(state: SceneSafetyState): SceneSafetyState {
  if (!isClearedToEnter(state) || state.stage !== 'safe_to_enter') return state;
  return { ...state, stage: 'exited' };
}

/** Establish patient contact — only after exiting the unit. Unlocks clinical actions (§19). */
export function establishPatientContact(state: SceneSafetyState): SceneSafetyState {
  if (state.stage !== 'exited') return state;
  return { ...state, stage: 'patient_contact', patientContact: 'established' };
}

/** The pre-contact ABC/consciousness readout — all Unknown until patient contact (§19). */
export function preContactStatus(state: SceneSafetyState): Record<string, string> {
  const known = clinicalUnlocked(state);
  return {
    'Patient contact': state.patientContact === 'established' ? 'Established' : 'Not established',
    Consciousness: known ? 'Assess now' : 'Unknown',
    Airway: known ? 'Assess now' : 'Unknown',
    Breathing: known ? 'Assess now' : 'Unknown',
    Circulation: known ? 'Assess now' : 'Unknown',
  };
}
