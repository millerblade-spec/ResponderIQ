/**
 * Typed, single-source configuration for every fixed timer and threshold
 * the approved specification pins down.
 *
 * These values are deliberately centralized so no component ever hard-codes
 * a "3 seconds" or a "45 seconds" inline. The structure is scenario-overridable
 * (see `resolveConfig`) so a future scenario can tune a value, but the DEFAULTS
 * here are the approved current values and must not drift. Each field carries
 * the spec section it comes from.
 *
 * All durations are in SECONDS unless the field name says otherwise — the
 * simulator runs on a real-time, second-granularity clock.
 */

/** Fixed timing values, in seconds unless noted. Spec §29 "required current values". */
export interface SimulatorTiming {
  /** §7 Three-second dispatch alert tone; the mission clock starts when it begins. */
  readonly dispatchToneSeconds: number;
  /** §8 Differential countdown at Orientation level. */
  readonly differentialTimerSecondsOrientation: number;
  /** §8 Differential countdown at every level above Orientation. */
  readonly differentialTimerSecondsAboveOrientation: number;
  /** §9 Delay after the differential process before Ron asks the equipment question. */
  readonly equipmentPromptDelaySeconds: number;
  /** §11 Delay after an engine arrives before the fire officer approaches and asks to help. */
  readonly fireOfficerQuestionDelaySeconds: number;
  /** §16 Police arrive this long after the learner stages for a security threat. */
  readonly policeArrivalSeconds: number;
  /** §16 Police secure the scene this long after arriving. */
  readonly policeSceneSecurementSeconds: number;
  /** §9 An unselected piece of equipment takes this long to physically retrieve. */
  readonly equipmentRetrievalSeconds: number;
  /** §20 A distraction begins worsening this long after it starts if unaddressed. */
  readonly firstDistractionEscalationSeconds: number;
  /** §20 After the first escalation, a distraction worsens again on this interval until managed or at its ceiling. */
  readonly furtherDistractionEscalationSeconds: number;
}

/** §8 Differential-selection constraints. */
export interface DifferentialConstraints {
  /** Exactly this many differential choices are displayed. */
  readonly choiceCount: number;
  /** The learner must select at least this many. */
  readonly minimumSelections: number;
  /** The top selections that must be ranked in priority order. */
  readonly rankedCount: number;
}

/** §6 Partner Ron's prompting discipline. */
export interface RonPromptConfig {
  /** Ron may prompt on a single critical unresolved decision at most this many times. */
  readonly maxCriticalPrompts: number;
}

/** §26/§28 Benchmarks and administrator scoring thresholds. */
export interface ScoringConfig {
  /** §26 Current time-management benchmark, in minutes. */
  readonly timeBenchmarkMinutes: number;
  /** §28 Administrator passing score. */
  readonly passingScore: number;
  /** §28 Non-overlapping grading bands. Administrator-only; never learner-facing. */
  readonly gradingBands: readonly GradingBand[];
}

export interface GradingBand {
  readonly min: number;
  readonly max: number;
  readonly label: string;
}

export interface SimulatorConfig {
  readonly timing: SimulatorTiming;
  readonly differential: DifferentialConstraints;
  readonly ron: RonPromptConfig;
  readonly scoring: ScoringConfig;
}

/**
 * The approved current configuration. Do not change these values without an
 * explicit spec change — config.test.ts locks every one of them.
 */
export const DEFAULT_SIMULATOR_CONFIG: SimulatorConfig = {
  timing: {
    dispatchToneSeconds: 3,
    differentialTimerSecondsOrientation: 15,
    differentialTimerSecondsAboveOrientation: 10,
    equipmentPromptDelaySeconds: 3,
    fireOfficerQuestionDelaySeconds: 5,
    policeArrivalSeconds: 15,
    policeSceneSecurementSeconds: 10,
    equipmentRetrievalSeconds: 45,
    firstDistractionEscalationSeconds: 10,
    furtherDistractionEscalationSeconds: 5,
  },
  differential: {
    choiceCount: 15,
    minimumSelections: 4,
    rankedCount: 4,
  },
  ron: {
    maxCriticalPrompts: 3,
  },
  scoring: {
    timeBenchmarkMinutes: 15,
    passingScore: 75,
    // §28: non-overlapping bands. A high total must never erase a critical
    // safety failure — that is tracked separately from these bands.
    gradingBands: [
      { min: 90, max: 100, label: 'Exceptional performance' },
      { min: 80, max: 89, label: 'Competent performance with learning opportunities' },
      { min: 75, max: 79, label: 'Meets minimum standard; additional practice recommended' },
      { min: 0, max: 74, label: 'Does not yet meet the performance standard' },
    ],
  },
};

/** Deep-merges a scenario's partial overrides onto the approved defaults. */
export function resolveConfig(overrides?: DeepPartial<SimulatorConfig>): SimulatorConfig {
  if (!overrides) return DEFAULT_SIMULATOR_CONFIG;
  return {
    timing: { ...DEFAULT_SIMULATOR_CONFIG.timing, ...overrides.timing },
    differential: { ...DEFAULT_SIMULATOR_CONFIG.differential, ...overrides.differential },
    ron: { ...DEFAULT_SIMULATOR_CONFIG.ron, ...overrides.ron },
    scoring: {
      ...DEFAULT_SIMULATOR_CONFIG.scoring,
      ...overrides.scoring,
      gradingBands: overrides.scoring?.gradingBands ?? DEFAULT_SIMULATOR_CONFIG.scoring.gradingBands,
    },
  };
}

/** Returns the grading band a raw score falls into, or undefined if out of range. Administrator-only. */
export function gradeFor(score: number, config: SimulatorConfig = DEFAULT_SIMULATOR_CONFIG): GradingBand | undefined {
  return config.scoring.gradingBands.find((band) => score >= band.min && score <= band.max);
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly (infer U)[]
    ? readonly U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};
