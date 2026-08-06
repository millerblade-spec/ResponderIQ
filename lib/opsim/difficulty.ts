import { DEFAULT_SIMULATOR_CONFIG, type SimulatorConfig } from '@/lib/engine/config';
import type { DifficultyLevel } from './types';

/**
 * The differential countdown length (§8): 20 seconds at Orientation, 10 seconds
 * at every level above it. A learner's genuine first time ever reaching the
 * differential page (per-user, see firstVisit.ts) gets 25 seconds instead.
 * Read from the approved typed config, never hard-coded.
 */
export function differentialTimerSeconds(
  level: DifficultyLevel,
  config: SimulatorConfig = DEFAULT_SIMULATOR_CONFIG,
  isFirstVisit = false,
): number {
  if (isFirstVisit) return config.timing.differentialTimerSecondsFirstVisit;
  return level === 'orientation'
    ? config.timing.differentialTimerSecondsOrientation
    : config.timing.differentialTimerSecondsAboveOrientation;
}
