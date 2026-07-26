'use client';

import { useState } from 'react';
import { ShiftStart } from './ShiftStart';
import { OperationalSim } from '@/components/OperationalSim/OperationalSim';
import type { DifficultyLevel } from '@/lib/opsim/types';

interface ScenarioRunnerProps {
  readonly scenarioId: string;
  readonly level: DifficultyLevel;
  readonly isFirstShift: boolean;
  readonly learnerId: string;
}

/**
 * Runs a scenario shift: the start-of-shift Truck Check / quiz first (§4), then
 * the operational simulator once the learner goes available (§7+).
 */
export function ScenarioRunner({ scenarioId, level, isFirstShift, learnerId }: ScenarioRunnerProps) {
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

  return <OperationalSim scenarioId={scenarioId} level={level} />;
}
