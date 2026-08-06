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
import type { TransportState } from '@/lib/opsim/transportMachine';
import { buildRunFacts } from '@/lib/opsim/captureRun';
import type { RunFacts } from '@/components/RunComplete/RunComplete';
import { useCrew } from './useCrew';
import { CrewOps } from './CrewOps';
import { SceneSafety } from './SceneSafety';
import { SceneDynamics } from './SceneDynamics';
import { ClinicalPanel } from './ClinicalPanel';
import { TransportOps } from './TransportOps';

interface OnSceneOpsProps {
  readonly engines: readonly Apparatus[];
  readonly clock: MissionClock;
  readonly difficulty: DifficultyName;
  readonly distractions: readonly ScenarioDistraction[];
  readonly scene: SceneConfig;
  readonly clinicalModel: ClinicalModel;
  readonly initialDifferential: readonly string[];
  readonly differentialChoices: readonly DifferentialChoice[];
  readonly scenarioId: string;
  readonly runDifficulty: string;
  /** Where the learner parked (fix #3) — recorded into the run facts. */
  readonly parkingChoice?: string;
  /**
   * Seconds after on-scene before fire arrives. 0 at this base difficulty —
   * fire pulls up WITH the medics (fix #8). A future higher-difficulty variant
   * raises this to 15–30 without touching anything else.
   */
  readonly fireArrivalDelaySeconds?: number;
  readonly onComplete: (facts: RunFacts) => void;
}

/**
 * On-scene operations over ONE shared crew model (§19, §20). Owns the crew
 * controller and the clinical unlock, captures the live sub-states, and hands
 * off to the debrief when the transport sequence ends (the pain decision,
 * fix #16). Equipment arrives from the scene-safety flow's "what do you want
 * to bring in?" moment (§9), and scene distractions (the TV, the family) start
 * at patient contact — they live inside the apartment, not on the street.
 */
export function OnSceneOps({
  engines,
  clock,
  difficulty,
  distractions,
  scene,
  clinicalModel,
  initialDifferential,
  differentialChoices,
  scenarioId,
  runDifficulty,
  parkingChoice,
  fireArrivalDelaySeconds = 0,
  onComplete,
}: OnSceneOpsProps) {
  const controller = useCrew(engines, [], clock, fireArrivalDelaySeconds);
  const audioController = useAudioOptional()?.controller;
  const [clinicalUnlocked, setClinicalUnlocked] = useState(false);
  const [equipmentSelected, setEquipmentSelected] = useState<readonly string[]>([]);
  const sceneRef = useRef<SceneSafetyState | undefined>(undefined);
  const dynamicsRef = useRef<DynamicsState | undefined>(undefined);
  const clinicalRef = useRef<ClinicalState | undefined>(undefined);
  const transportRef = useRef<TransportState | undefined>(undefined);
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

  function complete(transport: TransportState) {
    transportRef.current = transport;
    const evaluationId =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000';
    onComplete(
      buildRunFacts({
        evaluationId,
        scenarioId,
        difficulty: runDifficulty,
        totalSeconds: clock.elapsedSeconds(),
        initialDifferential,
        equipmentSelected,
        parkingChoice,
        crew: controller.crew,
        scene: sceneRef.current,
        dynamics: dynamicsRef.current,
        clinical: clinicalRef.current,
        transport,
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
        onEquipmentConfirmed={(ids) => {
          setEquipmentSelected(ids);
          controller.deliverEquipment(ids);
        }}
      />
      <SceneDynamics
        controller={controller}
        clock={clock}
        difficulty={difficulty}
        distractions={distractions}
        active={clinicalUnlocked}
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

      <TransportOps
        controller={controller}
        clock={clock}
        unlocked={clinicalUnlocked}
        model={clinicalModel}
        onStateChange={(s) => {
          transportRef.current = s;
        }}
        onRunComplete={complete}
      />
    </>
  );
}
