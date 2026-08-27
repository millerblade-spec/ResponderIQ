/**
 * RPOS grading: the bands and the Level 1 weighting, straight from Prompt #1.
 *
 * These are NOT the simulator's own scoring bands in lib/engine/config.ts.
 * That configuration grades one BLS-01 run on a 75-to-pass scale; RPOS grades
 * a training case on a 90-to-not-be-RED scale where only 98+ counts as
 * mastery. Two different standards for two different questions — deliberately
 * kept apart so neither drifts into the other.
 */
import type { BandName, GradingBand, LevelNumber } from './types';

/** BLUE 98–100, GREEN 95–97, YELLOW 90–94, RED below 90. Non-overlapping, exhaustive over 0–100. */
export const RPOS_BANDS: readonly GradingBand[] = [
  { name: 'blue', label: 'Mastery', min: 98, max: 100, mastery: true },
  { name: 'green', label: 'Strong', min: 95, max: 97, mastery: false },
  { name: 'yellow', label: 'Improvement / clarification needed', min: 90, max: 94, mastery: false },
  { name: 'red', label: 'Significant expectations missed', min: 0, max: 89, mastery: false },
];

/** Consecutive BLUE cases required for normal advancement. */
export const REQUIRED_CONSECUTIVE_BLUE = 5;

export function bandFor(score: number): GradingBand {
  const clamped = Math.max(0, Math.min(100, score));
  const band = RPOS_BANDS.find((candidate) => clamped >= candidate.min && clamped <= candidate.max);
  if (!band) throw new Error(`no RPOS band covers score ${score}`);
  return band;
}

export function bandByName(name: BandName): GradingBand {
  const band = RPOS_BANDS.find((candidate) => candidate.name === name);
  if (!band) throw new Error(`no such RPOS band: ${name}`);
  return band;
}

/** True for BLUE only. A mastery case still does not count if a critical error or hard-stop failure rode along. */
export function isMasteryBand(name: BandName): boolean {
  return bandByName(name).mastery;
}

/** YELLOW and RED get a focused debrief (Prompt #1, POST-SCENARIO FEEDBACK). */
export function requiresFocusedDebrief(name: BandName): boolean {
  return name === 'yellow' || name === 'red';
}

export interface GradingWeight {
  readonly key: string;
  readonly label: string;
  readonly percent: number;
}

/**
 * Level 1's stated weighting. The prompts give weights for Level 1 only, so
 * this returns null for every other level rather than inventing a curve —
 * callers show "no stated weighting" instead of a fabricated one.
 */
const LEVEL_1_WEIGHTS: readonly GradingWeight[] = [
  { key: 'assessment', label: 'Assessment', percent: 45 },
  { key: 'protocol_treatment', label: 'Protocol / treatment', percent: 20 },
  { key: 'recognition_reasoning', label: 'Recognition / reasoning', percent: 15 },
  { key: 'reassessment', label: 'Reassessment', percent: 10 },
  { key: 'safety', label: 'Safety', percent: 5 },
  { key: 'communication_operations', label: 'Communication / operations', percent: 5 },
];

export function gradingWeightsFor(level: LevelNumber): readonly GradingWeight[] | null {
  return level === 1 ? LEVEL_1_WEIGHTS : null;
}
