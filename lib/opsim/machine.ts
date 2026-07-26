/**
 * Pure, typed state transitions for the dispatch → equipment sequence (§7–§9).
 *
 * Every function takes a state and returns a new state — no timers, no React,
 * no side effects. The orchestrator (components/OperationalSim) schedules WHEN
 * these fire via the mission clock; this module decides only WHAT each
 * transition does. That split is what makes the whole sequence unit-testable.
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
    equipment: {
      promptShown: false,
      open: false,
      selected: [],
      confirmed: false,
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
    stage: 'awaiting_equipment',
    differential: {
      ...state.differential,
      open: false,
      finalized: true,
      finalizedByTimeout: opts.timeout,
    },
  };
}

/** Medic 3 arrives: beacons stop, status becomes ON SCENE (§7). */
export function arriveOnScene(state: OpSimState): OpSimState {
  if (state.responseStatus === 'on_scene') return state;
  return { ...state, responseStatus: 'on_scene' };
}

/** Ron's equipment question fires 3s after the differential ends, opening the selector (§9). */
export function showEquipmentPrompt(state: OpSimState): OpSimState {
  if (state.stage !== 'awaiting_equipment') return state;
  return {
    ...state,
    stage: 'equipment',
    equipment: { ...state.equipment, promptShown: true, open: true },
  };
}

/** Toggles a piece of equipment in/out of what the learner brings in. */
export function toggleEquipment(state: OpSimState, id: string): OpSimState {
  if (state.stage !== 'equipment' || state.equipment.confirmed) return state;
  const selected = state.equipment.selected.includes(id)
    ? state.equipment.selected.filter((x) => x !== id)
    : [...state.equipment.selected, id];
  return { ...state, equipment: { ...state.equipment, selected } };
}

/** Confirms the equipment choice; selected items are now immediately available on scene (§9). */
export function confirmEquipment(state: OpSimState): OpSimState {
  if (state.stage !== 'equipment') return state;
  return {
    ...state,
    stage: 'ready',
    equipment: { ...state.equipment, confirmed: true, open: false },
  };
}

/**
 * What is available on scene vs still on Medic 3 after equipment is confirmed.
 * Unselected items stay on the truck and later require the approved 45s
 * retrieval (§9) — the metadata is established here; the personnel-fetch
 * workflow itself is built in the crew-assignment slice.
 */
export function equipmentAvailability(
  state: OpSimState,
  catalog: readonly EquipmentItem[],
  config: SimulatorConfig = DEFAULT_SIMULATOR_CONFIG,
): EquipmentAvailability {
  const onScene = catalog.filter((e) => state.equipment.selected.includes(e.id)).map((e) => e.id);
  const onMedic3 = catalog.filter((e) => !state.equipment.selected.includes(e.id)).map((e) => e.id);
  return { onScene, onMedic3, retrievalSeconds: config.timing.equipmentRetrievalSeconds };
}

/** The ranked top priorities — the first `rankedCount` of the ordered selection (§8). */
export function rankedTop(
  state: OpSimState,
  config: SimulatorConfig = DEFAULT_SIMULATOR_CONFIG,
): readonly string[] {
  return state.differential.ranking.slice(0, config.differential.rankedCount);
}
