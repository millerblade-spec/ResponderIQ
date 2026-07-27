'use client';

import { useEffect, useRef, useState } from 'react';
import type { MissionClock } from '@/lib/engine/missionClock';
import { useAudioOptional } from '@/components/Audio/AudioProvider';
import { scheduleEngineArrivalAudio } from '@/lib/audio/sequence';
import type { Apparatus } from '@/lib/opsim/crew';
import type { DifficultyName } from '@/lib/opsim/dynamics';
import type { SceneConfig } from '@/lib/opsim/scene';
import type { ClinicalModel } from '@/lib/opsim/clinical';
import type { DifferentialChoice } from '@/lib/opsim/types';
import type { ScenarioDistraction } from '@/lib/scenarios/bls-01.dispatch';
import type { SceneSafetyState } from '@/lib/opsim/sceneMachine';
import type { DynamicsState } from '@/lib/opsim/dynamicsMachine';
import type { ClinicalState } from '@/lib/opsim/clinicalMachine';
import { buildRunFacts } from '@/lib/opsim/captureRun';
import type { RunFacts } from '@/components/RunComplete/RunComplete';
import { useCrew } from './useCrew';
import { CrewOps } from './CrewOps';
import { SceneSafety } from './SceneSafety';
import { SceneDynamics } from './SceneDynamics';
import { ClinicalPanel } from './ClinicalPanel';
import opStyles from './OperationalSim.module.css';

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
}

/**
 * On-scene operations over ONE shared crew model (§19, §20). Owns the crew
 * controller and the clinical unlock, captures the live sub-states, and lets
 * the learner complete the run — assembling the full run facts for persistence.
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
}: OnSceneOpsProps) {
  const controller = useCrew(engines, equipmentOnScene, clock);
  const audioController = useAudioOptional()?.controller;
  const [clinicalUnlocked, setClinicalUnlocked] = useState(false);
  const sceneRef = useRef<SceneSafetyState | undefined>(undefined);
  const dynamicsRef = useRef<DynamicsState | undefined>(undefined);
  const clinicalRef = useRef<ClinicalState | undefined>(undefined);
  const arrivalAudioRef = useRef(false);

  // Fire-engine arrival audio sequence, on the shared clock, played once (§11).
  // (Clinical audio gating is owned by ClinicalPanel, which has the live state.)
  // Capture the scheduled ids so they are cancelled on unmount, like every other
  // scheduling site — the helper returns them for exactly this reason.
  useEffect(() => {
    if (!controller.ronArrived || arrivalAudioRef.current || !audioController) return;
    arrivalAudioRef.current = true;
    const ids = scheduleEngineArrivalAudio(audioController, clock, 'engine');
    return () => ids.forEach((id) => clock.cancel(id));
  }, [controller.ronArrived, audioController, clock]);

  function complete() {
    const evaluationId =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000';
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
  }

  return (
    <>
      <SceneSafety
        config={scene}
        clock={clock}
        onClinicalUnlockChange={setClinicalUnlocked}
        onStateChange={(s) => {
          sceneRef.current = s;
        }}
      />
      <SceneDynamics
        controller={controller}
        clock={clock}
        difficulty={difficulty}
        distractions={distractions}
        onStateChange={(s) => {
          dynamicsRef.current = s;
        }}
      />
      <ClinicalPanel
        controller={controller}
        clock={clock}
        unlocked={clinicalUnlocked}
        model={clinicalModel}
        initialDifferential={initialDifferential}
        differentialChoices={differentialChoices}
        onStateChange={(s) => {
          clinicalRef.current = s;
        }}
      />
      <CrewOps controller={controller} clock={clock} />

      <section className={opStyles.panel} aria-label="Complete run">
        <h2 className={opStyles.panelTitle}>Disposition</h2>
        <p className={opStyles.instruction}>
          When you have made your transport or disposition decision, complete the run to reflect and debrief.
        </p>
        <button type="button" className={opStyles.primaryButton} onClick={complete}>
          Transport &amp; complete run
        </button>
      </section>
    </>
  );
}
