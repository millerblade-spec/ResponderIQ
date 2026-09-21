/**
 * RPOS — the six-level EMS Clinical Simulation Trainer program.
 *
 * Source of truth: the two master prompts (EMS_Master_Prompt_1_Levels_1-3 and
 * EMS_Master_Prompt_2_Levels_4-6), mirrored in docs/rpos/SPEC.md. Every
 * threshold, band, category, and rule in this module comes from those prompts
 * — nothing here is invented, and where the prompts are silent this module
 * says so rather than filling the gap.
 *
 * Three rules from the prompts shape the whole model:
 * - The CURRENT Fort Worth Regional EMS System protocols are the clinical
 *   authority. This module never encodes clinical content; it encodes the
 *   program that sits around it.
 * - MAX BVM and DSI are 100% hard stops at every level, for every learner.
 *   No partial credit, no assumed steps, and a good outcome never erases a
 *   missed mandatory element.
 * - A critical error may block mastery regardless of the numeric score.
 */

/** "What patch are we training today?" Scope and grading follow certification. */
export type Certification = 'emt' | 'paramedic';

/** The six levels. Numbers are the program's own; the names are the prompts'. */
export type LevelNumber = 1 | 2 | 3 | 4 | 5 | 6;

/** How much the trainer rescues the learner at a given level (Prompt #1, ASSESSMENT COACHING). */
export type CoachingPosture =
  | 'active_coaching' // Level 1
  | 'broad_prompts' // Level 2
  | 'learner_owns_assessment' // Level 3 — limited prompting
  | 'very_little_rescue' // Level 4
  | 'training_wheels_off'; // Levels 5 and 6

/** Ron's delivery register. Changes delivery only — never protocol, grading, physiology, safety, scope, or difficulty. */
export type PersonalityMode = 0 | 1 | 2;

/** The grading bands, by name. BLUE is mastery; RED is significant expectations missed. */
export type BandName = 'blue' | 'green' | 'yellow' | 'red';

export interface GradingBand {
  readonly name: BandName;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  /** True only for BLUE — a mastery case, the currency of advancement. */
  readonly mastery: boolean;
}

/** The Miss Board's categories, exactly as the prompts enumerate them. */
export type MissCategory =
  | 'assessment'
  | 'protocol'
  | 'medication_dose'
  | 'clinical_reasoning'
  | 'safety'
  | 'operations';

/**
 * A Miss Board entry. `subject` is what to retest later using a different
 * presentation; `critical` marks the ones that block advancement while
 * unresolved.
 */
export interface MissBoardEntry {
  readonly id: string;
  readonly category: MissCategory;
  readonly subject: string;
  readonly detail: string;
  readonly critical: boolean;
  readonly sourceCaseId: string;
  readonly createdAt: string;
  /** Set when a later case exercised the same subject cleanly. */
  readonly resolvedAt: string | null;
  readonly resolvedByCaseId: string | null;
}

/** The two 100% checklists. Identified by id so a case can report on them without restating the checklist. */
export type HardStopId = 'max_bvm' | 'dsi';

export interface HardStopItem {
  readonly id: string;
  readonly label: string;
  /** "as applicable" in the prompts — an item that only applies in some presentations. */
  readonly conditional: boolean;
}

export interface HardStopChecklist {
  readonly id: HardStopId;
  readonly title: string;
  readonly source: string;
  readonly items: readonly HardStopItem[];
}

/** How one hard stop went in one case. Missing anything mandatory fails the whole checklist — there is no partial credit. */
export interface HardStopOutcome {
  readonly id: HardStopId;
  /** False when the case never called for this checklist at all. */
  readonly required: boolean;
  readonly completedItemIds: readonly string[];
  /** Items the presentation did not call for, so they are not counted against the learner. */
  readonly notApplicableItemIds: readonly string[];
}

export interface HardStopResult {
  readonly id: HardStopId;
  readonly title: string;
  readonly required: boolean;
  readonly passed: boolean;
  readonly missedItems: readonly { readonly id: string; readonly label: string }[];
}

/** One graded scenario. The unit the whole program counts in. */
export interface CaseRecord {
  readonly caseId: string;
  readonly certification: Certification;
  readonly level: LevelNumber;
  readonly score: number;
  readonly band: BandName;
  /** Critical errors may block mastery regardless of the numeric score. */
  readonly criticalErrors: readonly string[];
  readonly hardStops: readonly HardStopResult[];
  readonly misses: readonly Omit<MissBoardEntry, 'resolvedAt' | 'resolvedByCaseId'>[];
  /**
   * True when the learner accepted the optional harder case. Graded at their
   * CURRENT level, and never penalized for voluntarily stretching.
   */
  readonly challengeMode: boolean;
  readonly createdAt: string;
}

/** Everything the program needs about one learner. */
export interface LearnerEvidence {
  readonly learner: { readonly name: string; readonly badgeId: string };
  readonly certification: Certification;
  readonly level: LevelNumber;
  readonly personalityMode: PersonalityMode;
  /** Oldest first — "5 consecutive BLUE" only means something in order. */
  readonly cases: readonly CaseRecord[];
  readonly missBoard: readonly MissBoardEntry[];
}

/** One reason a learner cannot advance yet. */
export interface AdvancementBlocker {
  readonly kind:
    | 'consecutive_blue'
    | 'critical_error'
    | 'unresolved_critical_miss'
    | 'level_requirements'
    | 'hard_stop';
  readonly summary: string;
  readonly detail: string;
}

export interface LevelRequirement {
  readonly id: string;
  readonly label: string;
  readonly met: boolean;
  readonly detail: string;
}

export interface LevelStanding {
  readonly learner: { readonly name: string; readonly badgeId: string };
  readonly certification: Certification;
  readonly level: LevelNumber;
  readonly levelTitle: string;
  readonly levelCallSign: string | null;
  readonly coaching: CoachingPosture;
  readonly personalityMode: PersonalityMode;

  /** Consecutive BLUE cases ending at the most recent case — the advancement currency. */
  readonly consecutiveBlue: number;
  readonly requiredConsecutiveBlue: number;

  readonly casesAtLevel: number;
  readonly bandCounts: Readonly<Record<BandName, number>>;

  readonly levelRequirements: readonly LevelRequirement[];
  readonly blockers: readonly AdvancementBlocker[];
  readonly eligibleToAdvance: boolean;
  readonly nextLevel: LevelNumber | null;

  /** Unresolved Miss Board entries, criticals first. */
  readonly openMisses: readonly MissBoardEntry[];
  /** Hard-stop failures on the most recent case — never averaged away. */
  readonly hardStopFailures: readonly HardStopResult[];
  /** The single next thing this learner needs. */
  readonly nextAction: string;
}
