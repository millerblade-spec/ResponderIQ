'use client';

import { useState } from 'react';
import { AudioProvider } from '@/components/Audio/AudioProvider';
import { ShiftStart } from './ShiftStart';
import { OperationalSim } from '@/components/OperationalSim/OperationalSim';
import {
  bls01Scene,
  bls01SecurityScene,
  bls01Distractions,
  bls01AdvancedDistractions,
  bls01DynamicsDifficulty,
} from '@/lib/scenarios/bls-01.dispatch';
import type { DifficultyLevel } from '@/lib/opsim/types';

interface ScenarioRunnerProps {
  readonly scenarioId: string;
  readonly level: DifficultyLevel;
  readonly isFirstShift: boolean;
  readonly learnerId: string;
  /** 'security' selects the staging/weapons-threat variant (demo/screenshots). */
  readonly sceneVariant?: 'normal' | 'security';
  /** Fire response type — 'mvc_two_vehicle' brings two engines (demo/screenshots). */
  readonly callType?: 'ems' | 'mvc_two_vehicle';
  /** 'advanced' presents several simultaneous distractions (demo/screenshots). */
  readonly dynamicsVariant?: 'normal' | 'advanced';
}

/**
 * Runs a scenario shift: the start-of-shift Truck Check / quiz first (§4), then
 * the operational simulator once the learner goes available (§7+).
 */
export function ScenarioRunner({
  scenarioId,
  level,
  isFirstShift,
  learnerId,
  sceneVariant = 'normal',
  callType = 'ems',
  dynamicsVariant = 'normal',
}: ScenarioRunnerProps) {
  const [available, setAvailable] = useState(false);

  if (!available) {
    return (
      <ShiftStart
        isFirstShift={isFirstShift}
        scenarioId={scenarioId}
        learnerId={learnerId}
        onProceed={() => setAvailable(true)}
      />
    );
  }

  const scene = sceneVariant === 'security' ? bls01SecurityScene : bls01Scene;
  const advanced = dynamicsVariant === 'advanced';
  return (
    <AudioProvider>
      <OperationalSim
        scenarioId={scenarioId}
        level={level}
        learnerId={learnerId}
        scene={scene}
        callType={callType}
        distractions={advanced ? bls01AdvancedDistractions : bls01Distractions}
        dynamicsDifficulty={advanced ? 'advanced' : bls01DynamicsDifficulty}
      />
    </AudioProvider>
  );
}
