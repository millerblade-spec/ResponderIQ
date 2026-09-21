/**
 * Advancement.
 *
 * Prompt #1 states the rule in one place, and this module implements exactly
 * that and nothing more:
 *
 *   5 consecutive BLUE cases
 *   + no critical errors
 *   + no unresolved critical Miss Board items
 *   + level requirements complete
 *
 * Two clarifications the prompts force, which this module makes explicit:
 * - "Critical errors may block mastery regardless of numeric score." So a
 *   98-scoring case that carried a critical error or a failed hard stop does
 *   not extend a BLUE streak — it breaks it. Otherwise the sentence would mean
 *   nothing.
 * - A challenge-mode case (the learner voluntarily took a harder scenario) is
 *   graded at their CURRENT level and is never penalized, so it counts toward
 *   the streak on exactly the same terms as any other case.
 */
import { REQUIRED_CONSECUTIVE_BLUE, isMasteryBand } from './grading';
import { levelDefinition, levelTitleFor, nextLevelAfter } from './levels';
import { failedHardStops } from './hardStops';
import { openCriticalMisses, openMisses } from './missBoard';
import type {
  AdvancementBlocker,
  BandName,
  CaseRecord,
  LearnerEvidence,
  LevelRequirement,
  LevelStanding,
} from './types';

/** A case counts as mastery only if it is BLUE AND carried no critical error and no hard-stop failure. */
export function countsAsMastery(caseRecord: CaseRecord): boolean {
  return (
    isMasteryBand(caseRecord.band) &&
    caseRecord.criticalErrors.length === 0 &&
    failedHardStops(caseRecord.hardStops).length === 0
  );
}

/** Consecutive mastery cases ending at the most recent one. Any non-mastery case resets it to zero. */
export function consecutiveMastery(casesOldestFirst: readonly CaseRecord[]): number {
  let streak = 0;
  for (let index = casesOldestFirst.length - 1; index >= 0; index -= 1) {
    if (!countsAsMastery(casesOldestFirst[index])) break;
    streak += 1;
  }
  return streak;
}

function bandCounts(cases: readonly CaseRecord[]): Readonly<Record<BandName, number>> {
  const counts: Record<BandName, number> = { blue: 0, green: 0, yellow: 0, red: 0 };
  for (const caseRecord of cases) counts[caseRecord.band] += 1;
  return counts;
}

/**
 * The level's own requirements. Only Level 1 states a scenario count, so only
 * Level 1 gets a count requirement — the others report honestly that the
 * prompts set no minimum rather than inventing one.
 */
function levelRequirementsFor(evidence: LearnerEvidence, casesAtLevel: readonly CaseRecord[]): readonly LevelRequirement[] {
  const definition = levelDefinition(evidence.level);
  const requirements: LevelRequirement[] = [];

  if (definition.minimumScenarios != null) {
    const met = casesAtLevel.length >= definition.minimumScenarios;
    requirements.push({
      id: 'meaningful_scenarios',
      label: `Complete about ${definition.minimumScenarios} meaningful scenarios at this level`,
      met,
      detail: `${casesAtLevel.length} of ${definition.minimumScenarios} recorded at level ${evidence.level}.`,
    });
  } else {
    requirements.push({
      id: 'meaningful_scenarios',
      label: 'Work the level until the mastery streak holds',
      met: true,
      detail: `${casesAtLevel.length} case(s) recorded at level ${evidence.level}; the program sets no minimum count for this level.`,
    });
  }

  return requirements;
}

function blockersFor(
  evidence: LearnerEvidence,
  casesAtLevel: readonly CaseRecord[],
  streak: number,
  requirements: readonly LevelRequirement[],
): readonly AdvancementBlocker[] {
  const blockers: AdvancementBlocker[] = [];

  if (streak < REQUIRED_CONSECUTIVE_BLUE) {
    blockers.push({
      kind: 'consecutive_blue',
      summary: `${streak} of ${REQUIRED_CONSECUTIVE_BLUE} consecutive BLUE cases`,
      detail:
        streak === 0
          ? 'The mastery streak is at zero — the most recent case was not a clean BLUE.'
          : `${REQUIRED_CONSECUTIVE_BLUE - streak} more consecutive BLUE case(s) needed.`,
    });
  }

  // Critical errors on the most recent case: an open concern, not history.
  const latest = casesAtLevel[casesAtLevel.length - 1] ?? evidence.cases[evidence.cases.length - 1];
  if (latest && latest.criticalErrors.length > 0) {
    blockers.push({
      kind: 'critical_error',
      summary: `${latest.criticalErrors.length} critical error(s) on the most recent case`,
      detail: latest.criticalErrors.join(' '),
    });
  }

  if (latest) {
    for (const failure of failedHardStops(latest.hardStops)) {
      blockers.push({
        kind: 'hard_stop',
        summary: `${failure.title} was not completed in full`,
        detail: `Missed: ${failure.missedItems.map((item) => item.label).join('; ')}.`,
      });
    }
  }

  const criticalMisses = openCriticalMisses(evidence.missBoard);
  if (criticalMisses.length > 0) {
    blockers.push({
      kind: 'unresolved_critical_miss',
      summary: `${criticalMisses.length} unresolved critical Miss Board item(s)`,
      detail: criticalMisses.map((entry) => entry.subject).join(', '),
    });
  }

  for (const requirement of requirements.filter((candidate) => !candidate.met)) {
    blockers.push({ kind: 'level_requirements', summary: requirement.label, detail: requirement.detail });
  }

  return blockers;
}

/** The one next thing this learner needs, taken from the first blocker in the order the prompts state them. */
function nextActionFor(blockers: readonly AdvancementBlocker[], level: number): string {
  const priority: AdvancementBlocker['kind'][] = [
    'hard_stop',
    'critical_error',
    'unresolved_critical_miss',
    'level_requirements',
    'consecutive_blue',
  ];
  for (const kind of priority) {
    const blocker = blockers.find((candidate) => candidate.kind === kind);
    if (blocker) return `${blocker.summary}. ${blocker.detail}`;
  }
  return `Level ${level} is complete — eligible to advance.`;
}

/** Evaluates one learner's standing at their current level. */
export function evaluateStanding(evidence: LearnerEvidence): LevelStanding {
  const definition = levelDefinition(evidence.level);
  const casesAtLevel = evidence.cases.filter((caseRecord) => caseRecord.level === evidence.level);
  const streak = consecutiveMastery(casesAtLevel);
  const requirements = levelRequirementsFor(evidence, casesAtLevel);
  const blockers = blockersFor(evidence, casesAtLevel, streak, requirements);
  const latest = casesAtLevel[casesAtLevel.length - 1];

  return {
    learner: evidence.learner,
    certification: evidence.certification,
    level: evidence.level,
    levelTitle: levelTitleFor(evidence.level, evidence.certification),
    levelCallSign: definition.callSign,
    coaching: definition.coaching,
    personalityMode: evidence.personalityMode,
    consecutiveBlue: streak,
    requiredConsecutiveBlue: REQUIRED_CONSECUTIVE_BLUE,
    casesAtLevel: casesAtLevel.length,
    bandCounts: bandCounts(casesAtLevel),
    levelRequirements: requirements,
    blockers,
    eligibleToAdvance: blockers.length === 0,
    nextLevel: nextLevelAfter(evidence.level),
    openMisses: openMisses(evidence.missBoard),
    hardStopFailures: latest ? failedHardStops(latest.hardStops) : [],
    nextAction: nextActionFor(blockers, evidence.level),
  };
}
