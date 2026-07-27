import { DEFAULT_SIMULATOR_CONFIG, type SimulatorConfig } from '@/lib/engine/config';
import type { DifficultyLevel } from './types';

/**
 * The differential countdown length (§8): 15 seconds at Orientation, 10 seconds
 * at every level above it. Read from the approved typed config, never hard-coded.
 */
export function differentialTimerSeconds(
  level: DifficultyLevel,
  config: SimulatorConfig = DEFAULT_SIMULATOR_CONFIG,
): number {
  return level === 'orientation'
    ? config.timing.differentialTimerSecondsOrientation
    : config.timing.differentialTimerSecondsAboveOrientation;
}
