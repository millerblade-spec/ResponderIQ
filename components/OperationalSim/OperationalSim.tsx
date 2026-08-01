'use client';

import { useEffect, useMemo, useState, useRef, useSyncExternalStore } from 'react';
import { DEFAULT_SIMULATOR_CONFIG, type SimulatorConfig } from '@/lib/engine/config';
import { MissionClock, startTicking, systemTimeSource } from '@/lib/engine/missionClock';
import { differentialTimerSeconds } from '@/lib/opsim/difficulty';
import { hasVisitedDifferential, markDifferentialVisited } from '@/lib/opsim/firstVisit';
import {
  bls01Dispatch,
  bls01Differentials,
  bls01Scene,
  bls01Distractions,
  bls01DynamicsDifficulty,
  bls01ParkingOptions,
  bls01FireArrivalDelaySeconds,
  type ScenarioDistraction,
} from '@/lib/scenarios/bls-01.dispatch';
import type { SceneConfig } from '@/lib/opsim/scene';
import type { DifficultyName } from '@/lib/opsim/dynamics';
import { bls01Clinical } from '@/lib/opsim/clinical';
import type { ClinicalModel } from '@/lib/opsim/clinical';
import { fireResponseFor, type CallType } from '@/lib/opsim/crew';
import { PROVISIONAL_LEARNER_ID } from '@/lib/opsim/constants';
import { OnSceneOps } from './OnSceneOps';
import { RunComplete, type RunFacts } from '@/components/RunComplete/RunComplete';
import { useAudioOptional } from '@/components/Audio/AudioProvider';
import { AudioHud } from '@/components/Audio/AudioHud';
import {
  createInitialOpSimState,
  completeTone,
  toggleDifferentialSelection,
  reorderRanking,
  canFinalizeDifferential,
  finalizeDifferential,
  arriveOnScene,
  chooseParking,
  rankedTop,
} from '@/lib/opsim/machine';
import type { DifferentialChoice, DispatchInfo, DifficultyLevel, ParkingOption } from '@/lib/opsim/types';
import { loadSettings } from '@/lib/settings/storage';
import type { LightingMode } from '@/lib/settings/types';
import { DifferentialModal } from './DifferentialModal';
import styles from './OperationalSim.module.css';

function subscribeToStorage(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

interface OperationalSimProps {
  readonly scenarioId?: string;
  readonly level?: DifficultyLevel;
  /** Per-user first-visit tracking for the differential timer (§8) is keyed by this. */
  readonly learnerId?: string;
  readonly dispatch?: DispatchInfo;
  readonly choices?: readonly DifferentialChoice[];
  readonly parkingOptions?: readonly ParkingOption[];
  readonly scene?: SceneConfig;
  readonly callType?: CallType;
  readonly distractions?: readonly ScenarioDistraction[];
  readonly dynamicsDifficulty?: DifficultyName;
  readonly clinicalModel?: ClinicalModel;
  /** Seconds after on-scene before fire arrives; 0 = with the medics (fix #8 hook). */
  readonly fireArrivalDelaySeconds?: number;
  /** Injectable for tests; defaults to a real system-clock-backed MissionClock. */
  readonly clock?: MissionClock;
  /** Whether to drive the clock from a real interval. Tests pass false and tick manually. */
  readonly ticking?: boolean;
  /** Overrides the stored lighting preference (tests / explicit control). */
  readonly lightingMode?: LightingMode;
  readonly config?: SimulatorConfig;
}

/**
 * Orchestrates the dispatch → Code 3 → differential → arrival → parking
 * sequence (§7–§9). All timing runs through ONE injected mission clock; there
 * are no ad-hoc setTimeouts. Locking the differential in early does NOT arrive
 * early — the moment the differential timer ends, the unit is ON SCENE
 * (beacons off) and the parking question opens. Equipment selection now
 * happens inside the scene-safety flow, when the crew steps out of the unit.
 */
export function OperationalSim({
  scenarioId = 'bls-01',
  level = 'orientation',
  learnerId = PROVISIONAL_LEARNER_ID,
  dispatch = bls01Dispatch,
  choices = bls01Differentials,
  parkingOptions = bls01ParkingOptions,
  scene = bls01Scene,
  callType = 'ems',
  distractions = bls01Distractions,
  dynamicsDifficulty = bls01DynamicsDifficulty,
  clinicalModel = bls01Clinical,
  fireArrivalDelaySeconds = bls01FireArrivalDelaySeconds,
  clock,
  ticking = true,
  lightingMode,
  config = DEFAULT_SIMULATOR_CONFIG,
}: OperationalSimProps) {
  const [activeClock] = useState(() => clock ?? new MissionClock(systemTimeSource));
  const [state, setState] = useState(() => createInitialOpSimState(scenarioId, level));
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [completedFacts, setCompletedFacts] = useState<RunFacts | null>(null);
  // The very first time this learner EVER reaches the differential page gets
  // the longer timer (§8). Read once at mount, per-user (not per-session).
  const [isFirstVisit] = useState(() => !hasVisitedDifferential(learnerId));
  const audioController = useAudioOptional()?.controller;

  const scheduledRef = useRef<number[]>([]);

  // The 3-second dispatch alert, played once when the console mounts (§7, §11).
  useEffect(() => {
    audioController?.play('dispatch_alert', { onceKey: 'dispatch-alert' });
  }, [audioController]);

  const timerSeconds = differentialTimerSeconds(level, config, isFirstVisit);
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

  // Start the mission clock with the dispatch tone. The tone opens the
  // differential; the deadline finalizes whatever is selected AND puts the
  // unit ON SCENE that same moment (fix #2) — arrival is pinned to the timer,
  // never to an early lock-in. Cleaned up on unmount.
  useEffect(() => {
    activeClock.start();
    const toneId = activeClock.at(toneSeconds, () => {
      setState(completeTone);
      markDifferentialVisited(learnerId);
    });
    const deadlineId = activeClock.at(toneSeconds + timerSeconds, () =>
      setState((s) => arriveOnScene(finalizeDifferential(s, { timeout: true }, config))),
    );
    scheduledRef.current.push(toneId, deadlineId);
    return () => {
      scheduledRef.current.forEach((id) => activeClock.cancel(id));
      scheduledRef.current = [];
    };
  }, [activeClock, toneSeconds, timerSeconds, config, learnerId]);

  // Drive the clock from a single real interval (also updates the visible clock).
  useEffect(() => {
    if (!ticking) return;
    return startTicking(activeClock, 200, () => setDisplaySeconds(activeClock.elapsedSeconds()));
  }, [activeClock, ticking]);

  const remaining = Math.max(0, toneSeconds + timerSeconds - displaySeconds);
  const responding = state.responseStatus === 'responding';

  // The run is complete — hand off to reflection, feedback, and the debrief.
  if (completedFacts) {
    return <RunComplete facts={completedFacts} />;
  }

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

        <AudioHud />

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

        {/* Parking (fix #3): asked on arrival, never derived automatically. */}
        {state.stage === 'parking' && (
          <section className={styles.panel} aria-label="Where do we park">
            <div className={styles.ron}>
              <span className={styles.ronName}>Partner Ron:</span>
              <span>“We’re here. Where do you want me to put the truck?”</span>
            </div>
            <div className={styles.choiceGrid} role="group" aria-label="Parking options">
              {parkingOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={styles.choice}
                  onClick={() => setState((s) => chooseParking(s, opt.id))}
                >
                  <span>
                    <strong>{opt.label}</strong>
                    <br />
                    <span className={styles.hint}>{opt.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {state.stage === 'ready' && (
          <section className={styles.panel} aria-label="On-scene summary">
            <h2 className={styles.panelTitle}>On scene</h2>
            <p className={styles.instruction}>
              Preparing for (top {config.differential.rankedCount}):{' '}
              {rankedTop(state, config)
                .map((id) => choices.find((c) => c.id === id)?.label ?? id)
                .join(' · ') || '—'}
            </p>
            <p className={styles.instruction}>
              Parked: {parkingOptions.find((p) => p.id === state.parking.choice)?.label ?? '—'}
            </p>
          </section>
        )}

        {state.stage === 'ready' && (
          <OnSceneOps
            engines={engines}
            clock={activeClock}
            difficulty={dynamicsDifficulty}
            distractions={distractions}
            scene={scene}
            clinicalModel={clinicalModel}
            initialDifferential={state.differential.ranking}
            differentialChoices={choices}
            scenarioId={scenarioId}
            runDifficulty={level}
            parkingChoice={state.parking.choice}
            fireArrivalDelaySeconds={fireArrivalDelaySeconds}
            onComplete={setCompletedFacts}
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
