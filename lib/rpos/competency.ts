/**
 * Competency rollup: many runs → where a responder stands on each behavioral
 * category (RPOS).
 *
 * Thresholds are not new magic numbers. Proficiency is the approved
 * administrator passing score and mastery is the floor of the top grading
 * band, both read from DEFAULT_SIMULATOR_CONFIG — so a spec change to the
 * standard moves the program with it instead of leaving two standards.
 *
 * The level is deliberately recency-weighted: a learner who scored 100 once
 * and 40 on their last two runs is developing, not mastered. Best and average
 * are still reported, so the training officer can see the difference between
 * "never could" and "could, and has stopped".
 */
import { DEFAULT_SIMULATOR_CONFIG } from '@/lib/engine/config';
import type { CompetencyLevel, CompetencyRollup, RunEvidence } from './types';

/** The behavioral categories the program tracks, in the order they are scored. */
export const RPOS_COMPETENCIES: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'dispatch_preparation', label: 'Dispatch preparation' },
  { key: 'differential_development', label: 'Differential development' },
  { key: 'equipment_preparation', label: 'Equipment preparation' },
  { key: 'windshield_assessment', label: 'Windshield assessment' },
  { key: 'scene_safety', label: 'Scene safety' },
  { key: 'crew_leadership', label: 'Crew leadership' },
  { key: 'resource_management', label: 'Resource management' },
  { key: 'scene_dynamics', label: 'Scene Dynamics' },
  { key: 'patient_assessment', label: 'Patient assessment' },
  { key: 'clinical_reasoning', label: 'Clinical reasoning' },
  { key: 'reassessment', label: 'Reassessment' },
  { key: 'time_management', label: 'Time management' },
];

/** Percent at or above which a competency counts as proficient (the passing standard, §28). */
export const PROFICIENT_PERCENT = DEFAULT_SIMULATOR_CONFIG.scoring.passingScore;

/** Percent at or above which a competency counts as mastered (floor of the top grading band, §28). */
export const MASTERY_PERCENT = Math.max(...DEFAULT_SIMULATOR_CONFIG.scoring.gradingBands.map((band) => band.min));

const LEVEL_ORDER: readonly CompetencyLevel[] = ['not_started', 'developing', 'proficient', 'mastered'];

/** True when `level` is at least `minimum` on the not_started → mastered ladder. */
export function isAtLeast(level: CompetencyLevel, minimum: CompetencyLevel): boolean {
  return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(minimum);
}

function levelFor(latestPercent: number, bestPercent: number): CompetencyLevel {
  if (latestPercent >= MASTERY_PERCENT && bestPercent >= MASTERY_PERCENT) return 'mastered';
  if (latestPercent >= PROFICIENT_PERCENT) return 'proficient';
  return 'developing';
}

/**
 * Rolls a learner's runs (oldest first) up into one entry per tracked
 * competency. Categories the runs never scored come back as not_started
 * rather than being dropped, so the program always shows the full picture.
 */
export function rollupCompetencies(runsOldestFirst: readonly RunEvidence[]): readonly CompetencyRollup[] {
  return RPOS_COMPETENCIES.map(({ key, label }) => {
    const percents = runsOldestFirst
      .map((run) => run.categories.find((category) => category.key === key)?.percent)
      .filter((percent): percent is number => percent != null);

    if (percents.length === 0) {
      return { key, label, attempts: 0, latestPercent: null, bestPercent: null, averagePercent: null, level: 'not_started' as const };
    }

    const latestPercent = percents[percents.length - 1];
    const bestPercent = Math.max(...percents);
    const averagePercent = Math.round(percents.reduce((sum, percent) => sum + percent, 0) / percents.length);
    return { key, label, attempts: percents.length, latestPercent, bestPercent, averagePercent, level: levelFor(latestPercent, bestPercent) };
  });
}

/** Looks one competency up in a rollup. Returns undefined for a key the program does not track. */
export function findCompetency(
  competencies: readonly CompetencyRollup[],
  key: string,
): CompetencyRollup | undefined {
  return competencies.find((competency) => competency.key === key);
}
