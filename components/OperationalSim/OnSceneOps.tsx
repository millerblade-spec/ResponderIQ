'use client';

import type { MissionClock } from '@/lib/engine/missionClock';
import type { Apparatus } from '@/lib/opsim/crew';
import type { DifficultyName } from '@/lib/opsim/dynamics';
import type { ScenarioDistraction } from '@/lib/scenarios/bls-01.dispatch';
import { useCrew } from './useCrew';
import { CrewOps } from './CrewOps';
import { SceneDynamics } from './SceneDynamics';

interface OnSceneOpsProps {
  readonly engines: readonly Apparatus[];
  readonly equipmentOnScene: readonly string[];
  readonly clock: MissionClock;
  readonly difficulty: DifficultyName;
  readonly distractions: readonly ScenarioDistraction[];
}

/**
 * On-scene operations: Scene Dynamics and crew assignments over ONE shared crew
 * model (§20 — no fake personnel model). Owns the crew controller so both
 * panels assign the same people.
 */
export function OnSceneOps({ engines, equipmentOnScene, clock, difficulty, distractions }: OnSceneOpsProps) {
  const controller = useCrew(engines, equipmentOnScene, clock);
  return (
    <>
      <SceneDynamics controller={controller} clock={clock} difficulty={difficulty} distractions={distractions} />
      <CrewOps controller={controller} clock={clock} />
    </>
  );
}
