'use client';

import { useState } from 'react';
import type { MissionClock } from '@/lib/engine/missionClock';
import type { Apparatus } from '@/lib/opsim/crew';
import type { DifficultyName } from '@/lib/opsim/dynamics';
import type { SceneConfig } from '@/lib/opsim/scene';
import type { ClinicalModel } from '@/lib/opsim/clinical';
import type { DifferentialChoice } from '@/lib/opsim/types';
import type { ScenarioDistraction } from '@/lib/scenarios/bls-01.dispatch';
import { useCrew } from './useCrew';
import { CrewOps } from './CrewOps';
import { SceneSafety } from './SceneSafety';
import { SceneDynamics } from './SceneDynamics';
import { ClinicalPanel } from './ClinicalPanel';

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
}

/**
 * On-scene operations over ONE shared crew model (§19, §20 — no fake personnel
 * model): scene safety, Scene Dynamics, the clinical workflow, and crew
 * assignments. The clinical panel gates on the scene-safety clinical lock.
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
}: OnSceneOpsProps) {
  const controller = useCrew(engines, equipmentOnScene, clock);
  const [clinicalUnlocked, setClinicalUnlocked] = useState(false);

  return (
    <>
      <SceneSafety config={scene} clock={clock} onClinicalUnlockChange={setClinicalUnlocked} />
      <SceneDynamics controller={controller} clock={clock} difficulty={difficulty} distractions={distractions} />
      <ClinicalPanel
        controller={controller}
        clock={clock}
        unlocked={clinicalUnlocked}
        model={clinicalModel}
        initialDifferential={initialDifferential}
        differentialChoices={differentialChoices}
      />
      <CrewOps controller={controller} clock={clock} />
    </>
  );
}
