/**
 * Pure, typed state transitions for the dispatch → arrival sequence (§7–§9).
 *
 * Every function takes a state and returns a new state — no timers, no React,
 * no side effects. The orchestrator (components/OperationalSim) schedules WHEN
 * these fire via the mission clock; this module decides only WHAT each
 * transition does. That split is what makes the whole sequence unit-testable.
 *
 * Sequence: dispatch tone → differential (locking in early does NOT arrive
 * early; the unit stays Code 3 until the timer ends) → the moment the timer
 * ends, ON SCENE with beacons off → parking prompt → ready (on-scene ops).
 * Equipment selection now happens later, inside the scene-safety flow
 * (sceneMachine.ts), when the crew actually steps out of the unit.
 */
import { DEFAULT_SIMULATOR_CONFIG, type SimulatorConfig } from '@/lib/engine/config';
import type { EquipmentItem } from './equipment';
import type { DifficultyLevel, EquipmentAvailability, OpSimState } from './types';

export function createInitialOpSimState(scenarioId: string, level: DifficultyLevel): OpSimState {
  return {
    scenarioId,
    level,
    stage: 'dispatch',
    toneComplete: false,
    // Code 3 en route from the moment of dispatch; beacons run until arrival.
    responseStatus: 'responding',
    differential: {
      open: false,
      selected: [],
      ranking: [],
      finalized: false,
      finalizedByTimeout: false,
    },
    parking: {
      open: false,
    },
  };
}

/** The 3-second dispatch tone finished: reveal is complete and the differential opens (§8). */
export function completeTone(state: OpSimState): OpSimState {
  if (state.toneComplete) return state;
  return {
    ...state,
    toneComplete: true,
    stage: 'differential',
    differential: { ...state.differential, open: true },
  };
}

/** Toggles a differential in/out of the learner's selection while the challenge is open. */
export function toggleDifferentialSelection(state: OpSimState, id: string): OpSimState {
  if (state.stage !== 'differential' || state.differential.finalized) return state;
  const isSelected = state.differential.selected.includes(id);
  const selected = isSelected
    ? state.differential.selected.filter((x) => x !== id)
    : [...state.differential.selected, id];
  const ranking = isSelected
    ? state.differential.ranking.filter((x) => x !== id)
    : [...state.differential.ranking, id];
  return { ...state, differential: { ...state.differential, selected, ranking } };
}

/**
 * Moves a selected differential up or down in priority order — the keyboard
 * equivalent of dragging it (§8, accessibility). No-op at the ends.
 */
export function reorderRanking(state: OpSimState, id: string, direction: 'up' | 'down'): OpSimState {
  if (state.stage !== 'differential' || state.differential.finalized) return state;
  const ranking = [...state.differential.ranking];
  const i = ranking.indexOf(id);
  if (i === -1) return state;
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= ranking.length) return state;
  [ranking[i], ranking[j]] = [ranking[j], ranking[i]];
  return { ...state, differential: { ...state.differential, ranking } };
}

/** At least the minimum selections are required before the learner can finalize by choice (§8). */
export function canFinalizeDifferential(
  state: OpSimState,
  config: SimulatorConfig = DEFAULT_SIMULATOR_CONFIG,
): boolean {
  return state.differential.selected.length >= config.differential.minimumSelections;
}

/**
 * Ends the differential challenge. Manual finalize requires the minimum
 * selections; a timeout finalize saves whatever the learner has so far —
 * partial work is preserved, and correctness is never revealed (§8).
 * Locking in early keeps the unit responding; arrival is pinned to the timer.
 */
export function finalizeDifferential(
  state: OpSimState,
  opts: { timeout: boolean },
  config: SimulatorConfig = DEFAULT_SIMULATOR_CONFIG,
): OpSimState {
  if (state.stage !== 'differential' || state.differential.finalized) return state;
  if (!opts.timeout && !canFinalizeDifferential(state, config)) return state;
  return {
    ...state,
    differential: {
      ...state.differential,
      open: false,
      finalized: true,
      finalizedByTimeout: opts.timeout,
    },
  };
}

/**
 * The differential timer ends: Medic 3 is ON SCENE that same moment — beacons
 * off — and the parking question opens (where do we park, relative to the
 * building?). The windshield view follows the learner's answer; it is never
 * derived silently.
 */
export function arriveOnScene(state: OpSimState): OpSimState {
  if (state.responseStatus === 'on_scene') return state;
  return {
    ...state,
    responseStatus: 'on_scene',
    stage: 'parking',
    parking: { ...state.parking, open: true },
  };
}

/** Records where the learner parked; on-scene operations (windshield first) begin. */
export function chooseParking(state: OpSimState, optionId: string): OpSimState {
  if (state.stage !== 'parking' || state.parking.choice !== undefined) return state;
  return {
    ...state,
    stage: 'ready',
    parking: { open: false, choice: optionId },
  };
}

/**
 * What is available on scene vs still on Medic 3 after equipment is chosen
 * (in the scene-safety flow). Unselected items stay on the truck and later
 * cost the 45s walk-back (§9) — a realistic consequence, not a penalty.
 */
export function equipmentAvailability(
  selected: readonly string[],
  catalog: readonly EquipmentItem[],
  config: SimulatorConfig = DEFAULT_SIMULATOR_CONFIG,
): EquipmentAvailability {
  const onScene = catalog.filter((e) => selected.includes(e.id)).map((e) => e.id);
  const onMedic3 = catalog.filter((e) => !selected.includes(e.id)).map((e) => e.id);
  return { onScene, onMedic3, retrievalSeconds: config.timing.equipmentRetrievalSeconds };
}

/** The ranked top priorities — the first `rankedCount` of the ordered selection (§8). */
export function rankedTop(
  state: OpSimState,
  config: SimulatorConfig = DEFAULT_SIMULATOR_CONFIG,
): readonly string[] {
  return state.differential.ranking.slice(0, config.differential.rankedCount);
}
