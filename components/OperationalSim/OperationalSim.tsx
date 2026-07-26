'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_SIMULATOR_CONFIG, type SimulatorConfig } from '@/lib/engine/config';
import { MissionClock, startTicking, systemTimeSource } from '@/lib/engine/missionClock';
import { EQUIPMENT_CATALOG, equipmentLabel } from '@/lib/opsim/equipment';
import { differentialTimerSeconds } from '@/lib/opsim/difficulty';
import {
  bls01Dispatch,
  bls01Differentials,
  bls01Scene,
  bls01Distractions,
  bls01DynamicsDifficulty,
  type ScenarioDistraction,
} from '@/lib/scenarios/bls-01.dispatch';
import type { SceneConfig } from '@/lib/opsim/scene';
import type { DifficultyName } from '@/lib/opsim/dynamics';
import { fireResponseFor, type CallType } from '@/lib/opsim/crew';
import { SceneSafety } from './SceneSafety';
import { OnSceneOps } from './OnSceneOps';
import {
  createInitialOpSimState,
  completeTone,
  toggleDifferentialSelection,
  reorderRanking,
  canFinalizeDifferential,
  finalizeDifferential,
  arriveOnScene,
  showEquipmentPrompt,
  toggleEquipment,
  confirmEquipment,
  rankedTop,
} from '@/lib/opsim/machine';
import type { DifferentialChoice, DispatchInfo, DifficultyLevel } from '@/lib/opsim/types';
import { loadSettings } from '@/lib/settings/storage';
import type { LightingMode } from '@/lib/settings/types';
import { DifferentialModal } from './DifferentialModal';
import { EquipmentPanel } from './EquipmentPanel';
import styles from './OperationalSim.module.css';

function subscribeToStorage(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

interface OperationalSimProps {
  readonly scenarioId?: string;
  readonly level?: DifficultyLevel;
  readonly dispatch?: DispatchInfo;
  readonly choices?: readonly DifferentialChoice[];
  readonly scene?: SceneConfig;
  readonly callType?: CallType;
  readonly distractions?: readonly ScenarioDistraction[];
  readonly dynamicsDifficulty?: DifficultyName;
  /** Injectable for tests; defaults to a real system-clock-backed MissionClock. */
  readonly clock?: MissionClock;
  /** Whether to drive the clock from a real interval. Tests pass false and tick manually. */
  readonly ticking?: boolean;
  /** Overrides the stored lighting preference (tests / explicit control). */
  readonly lightingMode?: LightingMode;
  readonly config?: SimulatorConfig;
}

/**
 * Orchestrates the dispatch → Code 3 → differential → equipment sequence
 * (§7–§9). All timing runs through ONE injected mission clock; there are no
 * ad-hoc setTimeouts. Scheduling happens in mount-scoped effects that clean up
 * on unmount, and each scheduled transition is idempotent in the machine, so
 * rerenders never double-fire or leak timers. State lives in one typed
 * OpSimState; the pure transitions live in lib/opsim/machine.
 */
export function OperationalSim({
  scenarioId = 'bls-01',
  level = 'orientation',
  dispatch = bls01Dispatch,
  choices = bls01Differentials,
  scene = bls01Scene,
  callType = 'ems',
  distractions = bls01Distractions,
  dynamicsDifficulty = bls01DynamicsDifficulty,
  clock,
  ticking = true,
  lightingMode,
  config = DEFAULT_SIMULATOR_CONFIG,
}: OperationalSimProps) {
  const [activeClock] = useState(() => clock ?? new MissionClock(systemTimeSource));
  const [state, setState] = useState(() => createInitialOpSimState(scenarioId, level));
  const [displaySeconds, setDisplaySeconds] = useState(0);

  const scheduledRef = useRef<number[]>([]);
  const finalizeHandledRef = useRef(false);

  const timerSeconds = differentialTimerSeconds(level, config);
  const toneSeconds = config.timing.dispatchToneSeconds;
  // Stable across renders so CrewOps's scheduling effect doesn't re-run each tick.
  const engines = useMemo(() => fireResponseFor(callType), [callType]);

  // Reduced Flashing Mode (§3): explicit prop wins, otherwise the stored
  // setting, read via the same external-store pattern used elsewhere so there
  // is no hydration mismatch and no setState-in-effect.
  const storedReducedFlashing = useSyncExternalStore(
    subscribeToStorage,
    () => loadSettings().lightingMode === 'reduced',
    () => false,
  );
  const reducedFlashing = lightingMode !== undefined ? lightingMode === 'reduced' : storedReducedFlashing;

  // Start the mission clock with the dispatch tone and schedule the tone
  // completion and the differential deadline. Cleaned up on unmount.
  useEffect(() => {
    activeClock.start();
    const toneId = activeClock.at(toneSeconds, () => setState(completeTone));
    const deadlineId = activeClock.at(toneSeconds + timerSeconds, () =>
      setState((s) => finalizeDifferential(s, { timeout: true }, config)),
    );
    scheduledRef.current.push(toneId, deadlineId);
    return () => {
      scheduledRef.current.forEach((id) => activeClock.cancel(id));
      scheduledRef.current = [];
    };
  }, [activeClock, toneSeconds, timerSeconds, config]);

  // Drive the clock from a single real interval (also updates the visible clock).
  useEffect(() => {
    if (!ticking) return;
    return startTicking(activeClock, 200, () => setDisplaySeconds(activeClock.elapsedSeconds()));
  }, [activeClock, ticking]);

  // When the differential ends (by choice or timeout): arrive on scene, then
  // open the equipment prompt 3 seconds later. Guarded to run exactly once.
  useEffect(() => {
    if (!state.differential.finalized || finalizeHandledRef.current) return;
    finalizeHandledRef.current = true;
    setState(arriveOnScene);
    const id = activeClock.after(config.timing.equipmentPromptDelaySeconds, () =>
      setState(showEquipmentPrompt),
    );
    scheduledRef.current.push(id);
  }, [state.differential.finalized, activeClock, config]);

  const remaining = Math.max(0, toneSeconds + timerSeconds - displaySeconds);
  const responding = state.responseStatus === 'responding';

  return (
    <main>
      <div className={styles.wrap}>
        <div className={styles.statusBar}>
          <span className={styles.unit}>{dispatch.unit}</span>
          <span className={styles.radio}>Radio: {dispatch.radioChannel}</span>
          {responding ? (
            <span className={`${styles.statusBadge} ${styles.responding}`}>
              <span className={styles.badgeIcon} aria-hidden="true">
                ▲
              </span>
              <span>RESPONDING · CODE 3</span>
            </span>
          ) : (
            <span className={`${styles.statusBadge} ${styles.onScene}`}>
              <span className={styles.badgeIcon} aria-hidden="true">
                ✓
              </span>
              <span>ON SCENE</span>
            </span>
          )}
          <span className={styles.clock}>
            <span className={styles.clockLabel}>Mission clock</span>
            {formatSeconds(displaySeconds)}
          </span>
        </div>

        {responding && dispatch.responseMode === 'code_3' && (
          <div
            className={`${styles.beacons} ${reducedFlashing ? styles.reduced : ''}`}
            role="status"
            aria-label="Responding Code 3"
          >
            <span className={styles.beaconLights} aria-hidden="true">
              <span className={`${styles.beacon} ${styles.flash1}`} />
              <span className={`${styles.beacon} ${styles.flash2}`} />
            </span>
            <span className={styles.beaconLabel}>CODE 3 · RESPONDING</span>
            <span className={styles.beaconMode}>
              {reducedFlashing ? 'Reduced Flashing Mode' : 'Standard Emergency Lighting'}
            </span>
          </div>
        )}

        <section className={styles.panel} aria-labelledby="dispatch-title">
          <h1 id="dispatch-title" className={styles.panelTitle}>
            Dispatch — {dispatch.callType}
          </h1>
          <div className={styles.dispatchMeta}>
            <span>Unit: {dispatch.unit}</span>
            <span>Channel: {dispatch.radioChannel}</span>
            <span>Response: Code 3</span>
            <span>{dispatch.location}</span>
          </div>
          <p className={styles.dispatchNarrative}>{dispatch.narrative}</p>
          {!state.toneComplete && <p className={styles.toneNote}>▶ Dispatch alert tone…</p>}
        </section>

        {state.stage === 'ready' && (
          <section className={styles.panel} aria-label="On-scene summary">
            <h2 className={styles.panelTitle}>On scene</h2>
            <p className={styles.instruction}>
              Preparing for (top {config.differential.rankedCount}):{' '}
              {rankedTop(state, config)
                .map((id) => choices.find((c) => c.id === id)?.label ?? id)
                .join(' · ') || '—'}
            </p>
            <p className={styles.instruction}>Equipment on scene:</p>
            <div className={styles.summary}>
              {state.equipment.selected.length === 0 ? (
                <span className={styles.hint}>Nothing brought in — everything is still on Medic 3.</span>
              ) : (
                state.equipment.selected.map((id) => (
                  <span key={id} className={styles.summaryTag}>
                    {equipmentLabel(id)}
                  </span>
                ))
              )}
            </div>
          </section>
        )}

        {state.stage === 'ready' && <SceneSafety config={scene} clock={activeClock} />}
        {state.stage === 'ready' && (
          <OnSceneOps
            engines={engines}
            equipmentOnScene={state.equipment.selected}
            clock={activeClock}
            difficulty={dynamicsDifficulty}
            distractions={distractions}
          />
        )}
      </div>

      {state.differential.open && (
        <DifferentialModal
          choices={choices}
          differential={state.differential}
          config={config}
          remainingSeconds={remaining}
          canFinalize={canFinalizeDifferential(state, config)}
          onToggle={(id) => setState((s) => toggleDifferentialSelection(s, id))}
          onReorder={(id, dir) => setState((s) => reorderRanking(s, id, dir))}
          onFinalize={() => setState((s) => finalizeDifferential(s, { timeout: false }, config))}
        />
      )}

      {state.equipment.open && (
        <EquipmentPanel
          catalog={EQUIPMENT_CATALOG}
          selected={state.equipment.selected}
          onToggle={(id) => setState((s) => toggleEquipment(s, id))}
          onConfirm={() => setState((s) => confirmEquipment(s))}
        />
      )}
    </main>
  );
}

function formatSeconds(total: number): string {
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const ss = (total % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
