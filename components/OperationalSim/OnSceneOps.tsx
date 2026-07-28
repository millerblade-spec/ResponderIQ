'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MissionClock } from '@/lib/engine/missionClock';
import { useAudioOptional } from '@/components/Audio/AudioProvider';
import { scheduleEngineArrivalAudio } from '@/lib/audio/sequence';
import type { Apparatus } from '@/lib/opsim/crew';
import { RESOURCE_OPTIONS } from '@/lib/opsim/crew';
import { EQUIPMENT_CATALOG, equipmentLabel } from '@/lib/opsim/equipment';
import type { DifficultyName } from '@/lib/opsim/dynamics';
import type { SceneConfig } from '@/lib/opsim/scene';
import type { ClinicalModel } from '@/lib/opsim/clinical';
import type { DifferentialChoice } from '@/lib/opsim/types';
import type { ScenarioDistraction } from '@/lib/scenarios/bls-01.dispatch';
import type { SceneSafetyState } from '@/lib/opsim/sceneMachine';
import { preContactStatus, isClearedToEnter } from '@/lib/opsim/sceneMachine';
import type { DynamicsState } from '@/lib/opsim/dynamicsMachine';
import type { ClinicalState } from '@/lib/opsim/clinicalMachine';
import { buildRunFacts } from '@/lib/opsim/captureRun';
import type { RunFacts } from '@/components/RunComplete/RunComplete';
import { useCrew } from './useCrew';
import { CrewOps } from './CrewOps';
import { SceneSafety } from './SceneSafety';
import { SceneDynamics } from './SceneDynamics';
import { ClinicalPanel } from './ClinicalPanel';
import { SceneView } from './SceneView';
import {
  progressSteps,
  immediatePriorities,
  retrievalItems,
  timelineEvents,
  sceneStageLabel,
  type LiveConsoleState,
} from './consoleData';
import styles from './Console.module.css';

interface OnSceneOpsProps {
  readonly engines: readonly Apparatus[];
  readonly equipmentOnScene: readonly string[];
  readonly clock: MissionClock;
  readonly difficulty: DifficultyName;
  readonly distractions: readonly ScenarioDistraction[];
  readonly scene: SceneConfig;
  readonly clinicalModel: ClinicalModel;
  readonly initialDifferential: readonly string[];
  readonly differentialChoices: readonly DifferentialChoice[];
  readonly scenarioId: string;
  readonly runDifficulty: string;
  readonly onComplete: (facts: RunFacts) => void;
  /** A live tick value from the parent, so time-based readouts refresh each second. */
  readonly now?: number;
  /** Lets the persistent top bar's "End Scenario" invoke the same completion path. */
  readonly endRef?: React.MutableRefObject<(() => void) | null>;
}

type Tab = 'scene' | 'dynamics' | 'patient' | 'crew' | 'timeline' | 'progress' | 'equipment';

const CENTER_TABS: { id: Tab; label: string }[] = [
  { id: 'scene', label: 'Scene View' },
  { id: 'dynamics', label: 'Scene Dynamics' },
  { id: 'patient', label: 'Patient Assessment' },
  { id: 'crew', label: 'Crew Operations' },
  { id: 'timeline', label: 'Timeline' },
];
const MOBILE_TABS: { id: Tab; label: string }[] = [
  { id: 'progress', label: 'Progress' },
  { id: 'equipment', label: 'Equipment' },
];

function fmt(total: number): string {
  const m = Math.floor(Math.max(0, total) / 60);
  const s = Math.max(0, total) % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * On-scene operations, presented as a command console over ONE shared crew model
 * (§19, §20). Owns the crew controller and clinical unlock, mirrors each panel's
 * live state up (for the console's status/priorities/scene-view rails and for run
 * capture), and lets the learner complete the run. All four interactive panels
 * stay mounted at all times — tabs toggle visibility only — so mission-clock
 * scheduling inside them is never torn down.
 */
export function OnSceneOps({
  engines,
  equipmentOnScene,
  clock,
  difficulty,
  distractions,
  scene,
  clinicalModel,
  initialDifferential,
  differentialChoices,
  scenarioId,
  runDifficulty,
  onComplete,
  now,
  endRef,
}: OnSceneOpsProps) {
  const controller = useCrew(engines, equipmentOnScene, clock);
  const audioController = useAudioOptional()?.controller;
  const [clinicalUnlocked, setClinicalUnlocked] = useState(false);
  const [tab, setTab] = useState<Tab>('scene');

  // Live mirrors of each sub-machine's state, kept in React state so the console
  // rails re-render. Refs preserve the exact value read at completion capture.
  const [sceneState, setSceneState] = useState<SceneSafetyState | undefined>(undefined);
  const [dynamicsState, setDynamicsState] = useState<DynamicsState | undefined>(undefined);
  const [clinicalState, setClinicalState] = useState<ClinicalState | undefined>(undefined);
  const sceneRef = useRef<SceneSafetyState | undefined>(undefined);
  const dynamicsRef = useRef<DynamicsState | undefined>(undefined);
  const clinicalRef = useRef<ClinicalState | undefined>(undefined);
  const arrivalAudioRef = useRef(false);

  const handleScene = useCallback((s: SceneSafetyState) => {
    sceneRef.current = s;
    setSceneState(s);
  }, []);
  const handleDynamics = useCallback((s: DynamicsState) => {
    dynamicsRef.current = s;
    setDynamicsState(s);
  }, []);
  const handleClinical = useCallback((s: ClinicalState) => {
    clinicalRef.current = s;
    setClinicalState(s);
  }, []);

  // Fire-engine arrival audio sequence, on the shared clock, played once (§11).
  useEffect(() => {
    if (!controller.ronArrived || arrivalAudioRef.current || !audioController) return;
    arrivalAudioRef.current = true;
    const ids = scheduleEngineArrivalAudio(audioController, clock, 'engine');
    return () => ids.forEach((id) => clock.cancel(id));
  }, [controller.ronArrived, audioController, clock]);

  const complete = useCallback(() => {
    const evaluationId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : '00000000-0000-4000-8000-000000000000';
    onComplete(
      buildRunFacts({
        evaluationId,
        scenarioId,
        difficulty: runDifficulty,
        totalSeconds: clock.elapsedSeconds(),
        initialDifferential,
        equipmentSelected: equipmentOnScene,
        crew: controller.crew,
        scene: sceneRef.current,
        dynamics: dynamicsRef.current,
        clinical: clinicalRef.current,
      }),
    );
  }, [onComplete, scenarioId, runDifficulty, clock, initialDifferential, equipmentOnScene, controller.crew]);

  // Register the completion handler so the top bar's End Scenario can call it.
  useEffect(() => {
    if (endRef) endRef.current = complete;
    return () => {
      if (endRef) endRef.current = null;
    };
  }, [endRef, complete]);

  const nowSeconds = now ?? clock.elapsedSeconds();
  const live: LiveConsoleState = {
    scene: sceneState,
    crew: controller.crew,
    dynamics: dynamicsState,
    clinical: clinicalState,
    ronArrived: controller.ronArrived,
    equipmentOnScene,
    now: nowSeconds,
  };

  const steps = progressSteps(live);
  const priorities = immediatePriorities(live);
  const retrievals = retrievalItems(controller.crew, nowSeconds);
  const timeline = timelineEvents(live);
  const statusRows = sceneState ? preContactStatus(sceneState) : {};
  const onSceneEquipment = controller.crew.equipmentOnScene;
  const stillOnTruck = EQUIPMENT_CATALOG.filter((e) => !onSceneEquipment.includes(e.id));
  const arrivedEngines = Object.values(controller.crew.apparatus).filter((a) => a.arrived);
  const requestedResources = controller.crew.resourceRequests;

  return (
    <div className={styles.grid} data-tab={tab}>
      {/* ---- Left rail: progress + scene status ---- */}
      <div className={styles.colLeft} aria-label="Run status">
        <section className={styles.miniPanel} aria-label="Scenario progress">
          <div className={styles.miniTitle}>Scenario progress</div>
          <ol className={styles.progressList}>
            {steps.map((s) => (
              <li key={s.id} className={styles.progressItem}>
                <span
                  className={`${styles.dot} ${s.state === 'done' ? styles.dotDone : s.state === 'active' ? styles.dotActive : styles.dotPending}`}
                  aria-hidden="true"
                />
                <span className={s.state === 'done' ? styles.progressDone : s.state === 'active' ? styles.progressActive : ''}>
                  {s.label}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.miniPanel} aria-label="Scene status">
          <div className={styles.miniTitle}>Scene status</div>
          <div className={styles.kvRows}>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Stage</span>
              <span className={styles.kvVal}>{sceneStageLabel(sceneState)}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Entry</span>
              <span className={`${styles.kvVal} ${sceneState && isClearedToEnter(sceneState) ? styles.kvSafe : styles.kvCritical}`}>
                {sceneState && isClearedToEnter(sceneState) ? 'Cleared' : 'Not cleared'}
              </span>
            </div>
            {Object.entries(statusRows).map(([k, v]) => (
              <div key={k} className={styles.kvRow}>
                <span className={styles.kvKey}>{k}</span>
                <span className={styles.kvVal}>{v}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ---- Center workspace ---- */}
      <div className={styles.colCenter}>
        <div className={styles.tabBar} role="tablist" aria-label="Operational workspace">
          {[...CENTER_TABS, ...MOBILE_TABS].map((t) => {
            const isMobileOnly = MOBILE_TABS.some((m) => m.id === t.id);
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''} ${isMobileOnly ? styles.tabMobileOnly : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className={styles.workspace}>
          <div className={styles.tabPane} role="tabpanel" hidden={tab !== 'scene'}>
            <SceneView sceneConfig={scene} sceneState={sceneState} crew={controller.crew} dynamics={dynamicsState} />
            <SceneSafety
              config={scene}
              clock={clock}
              onClinicalUnlockChange={setClinicalUnlocked}
              onStateChange={handleScene}
            />
          </div>

          <div className={styles.tabPane} role="tabpanel" hidden={tab !== 'dynamics'}>
            <SceneDynamics
              controller={controller}
              clock={clock}
              difficulty={difficulty}
              distractions={distractions}
              onStateChange={handleDynamics}
            />
          </div>

          <div className={styles.tabPane} role="tabpanel" hidden={tab !== 'patient'}>
            <ClinicalPanel
              controller={controller}
              clock={clock}
              unlocked={clinicalUnlocked}
              model={clinicalModel}
              initialDifferential={initialDifferential}
              differentialChoices={differentialChoices}
              onStateChange={handleClinical}
            />
          </div>

          <div className={styles.tabPane} role="tabpanel" hidden={tab !== 'crew'}>
            <CrewOps controller={controller} clock={clock} />
          </div>

          <div className={styles.tabPane} role="tabpanel" hidden={tab !== 'timeline'}>
            <section className={styles.miniPanel} aria-label="Operational timeline">
              <div className={styles.miniTitle}>Timeline</div>
              {timeline.length === 0 ? (
                <p className={styles.timelineEmpty}>No logged events yet.</p>
              ) : (
                <div className={styles.timeline}>
                  {timeline.map((e, i) => (
                    <div key={`${e.atSecond}-${i}`} className={styles.timeRow}>
                      <span className={styles.timeAt}>{fmt(e.atSecond)}</span>
                      <span className={styles.timeLabel}>{e.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* ---- Right rail: priorities + equipment + communications ---- */}
      <div className={styles.colRight} aria-label="Priorities and resources">
        <section className={styles.miniPanel} aria-label="Immediate priorities">
          <div className={styles.miniTitle}>Immediate priorities</div>
          {priorities.length === 0 ? (
            <p className={styles.prioritiesEmpty}>Nothing urgent right now.</p>
          ) : (
            <div className={styles.priorities}>
              {priorities.map((p) => (
                <div
                  key={p.id}
                  className={`${styles.priority} ${p.tone === 'critical' ? styles.tCritical : p.tone === 'behavioral' ? styles.tBehavioral : p.tone === 'pending' ? styles.tPending : p.tone === 'caution' ? styles.tCaution : styles.tInfo}`}
                >
                  {p.label}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.miniPanel} aria-label="Equipment">
          <div className={styles.miniTitle}>Equipment</div>
          <div className={styles.tagRow} role="group" aria-label="Equipment on scene">
            {onSceneEquipment.length === 0 ? (
              <span className={styles.prioritiesEmpty}>Nothing on scene yet.</span>
            ) : (
              onSceneEquipment.map((id) => (
                <span key={id} className={styles.tag}>
                  {equipmentLabel(id)}
                </span>
              ))
            )}
          </div>
          {retrievals.length > 0 && (
            <div style={{ marginTop: '0.6rem' }}>
              {retrievals.map((r, i) => (
                <div key={i} className={styles.retrRow}>
                  <span>
                    {r.responderName}: {r.label}
                  </span>
                  <span className={styles.retrEta}>{r.remainingSeconds != null ? fmt(r.remainingSeconds) : '…'}</span>
                </div>
              ))}
            </div>
          )}
          {stillOnTruck.length > 0 && (
            <div style={{ marginTop: '0.6rem' }}>
              <span className={styles.kvKey} style={{ display: 'block', fontSize: '0.72rem', marginBottom: '0.3rem' }}>
                Still on Medic 3
              </span>
              <div className={styles.tagRow} role="group" aria-label="Still on Medic 3">
                {stillOnTruck.map((e) => (
                  <span key={e.id} className={`${styles.tag} ${styles.tagMuted}`}>
                    {e.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className={styles.miniPanel} aria-label="Communications">
          <div className={styles.miniTitle}>Communications</div>
          <div className={styles.commList}>
            {controller.ronArrived ? (
              <p className={styles.commRow}>
                <span className={styles.commWho}>Partner Ron:</span> “{controller.ronArrivalLine}”
              </p>
            ) : (
              <p className={`${styles.commRow} ${styles.commMuted}`}>Partner Ron — standing by.</p>
            )}
            {controller.officerPrompts.length > 0 && (
              <p className={styles.commRow}>
                <span className={styles.commWho}>Fire Officer:</span> “{controller.officerOfferLine}”
              </p>
            )}
            <p className={`${styles.commRow} ${styles.commMuted}`}>Radio &amp; captions: use the audio controls in the top bar.</p>
          </div>
        </section>
      </div>

      {/* ---- Bottom operational strip ---- */}
      <div className={styles.bottomStrip}>
        <div className={styles.stripSections}>
          <section className={styles.miniPanel} aria-label="Apparatus">
            <div className={styles.miniTitle}>Apparatus</div>
            {arrivedEngines.length === 0 ? (
              <p className={styles.prioritiesEmpty}>No apparatus on scene.</p>
            ) : (
              <div className={styles.kvRows}>
                {arrivedEngines.map((e) => (
                  <div key={e.id} className={styles.kvRow}>
                    <span className={styles.kvKey}>{e.name}</span>
                    <span className={styles.kvVal}>{e.cleared ? 'Cleared from call' : 'On scene'}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.miniPanel} aria-label="Additional resources">
            <div className={styles.miniTitle}>Additional resources</div>
            {requestedResources.length === 0 ? (
              <p className={styles.prioritiesEmpty}>None requested. Request via Crew Operations.</p>
            ) : (
              <div className={styles.tagRow}>
                {requestedResources.map((id) => (
                  <span key={id} className={styles.tag}>
                    {RESOURCE_OPTIONS.find((r) => r.id === id)?.label ?? id} ✓
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className={styles.miniPanel} aria-label="Reference">
            <div className={styles.miniTitle}>Reference — status colors</div>
            <div className={styles.kvRows}>
              <div className={styles.kvRow}>
                <span className={styles.kvKey}>Red</span>
                <span className={styles.kvVal}>Critical / hazard</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvKey}>Purple</span>
                <span className={styles.kvVal}>Scene dynamics</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvKey}>Yellow / orange</span>
                <span className={styles.kvVal}>Pending / caution</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvKey}>Green</span>
                <span className={styles.kvVal}>Safe / complete</span>
              </div>
            </div>
          </section>

          <section className={styles.miniPanel} aria-label="Disposition">
            <div className={styles.miniTitle}>Disposition</div>
            <p className={styles.prioritiesEmpty} style={{ marginBottom: '0.6rem' }}>
              When your transport or disposition decision is made, complete the run to debrief.
            </p>
            <button type="button" className={styles.endButton} onClick={complete}>
              Transport &amp; complete run
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
