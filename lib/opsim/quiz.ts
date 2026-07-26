/**
 * Truck-knowledge question bank and quiz logic (§4). Answers use equipment
 * names and locations already established in the truck inventory. Exactly five
 * questions are asked; per-question correctness is NEVER revealed to the
 * learner and no percentage/score is shown — scoring is back-end only.
 */

export interface QuizOption {
  readonly id: string;
  readonly label: string;
}

export interface QuizQuestion {
  readonly id: string;
  /** Category used only for back-end "frequently missed" tracking. */
  readonly subject: string;
  readonly prompt: string;
  readonly options: readonly QuizOption[];
  readonly correctOptionId: string;
}

const LOC = {
  als: { id: 'als_bag', label: 'ALS Bag' },
  airway: { id: 'airway_bag', label: 'Airway Bag' },
  trauma: { id: 'trauma_bag', label: 'Trauma Bag' },
  monitor: { id: 'cardiac_monitor', label: 'Cardiac Monitor' },
  belt: { id: 'belt', label: "On the medic’s belt" },
  separate: { id: 'separate', label: 'Carried separately' },
  crew: { id: 'crew', label: 'On Medic 3, for both crew members' },
} as const;

const bagChoices = [LOC.als, LOC.airway, LOC.trauma, LOC.monitor];

export const QUESTION_BANK: readonly QuizQuestion[] = [
  { id: 'io_location', subject: 'als_bag', prompt: 'Where is the IO equipment?', options: bagChoices, correctOptionId: 'als_bag' },
  { id: 'tourniquets', subject: 'trauma_bag', prompt: 'Which bag contains tourniquets?', options: bagChoices, correctOptionId: 'trauma_bag' },
  {
    id: 'airway_suction',
    subject: 'airway_bag',
    prompt: 'Does the Airway Bag contain portable suction?',
    options: [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
    correctOptionId: 'no',
  },
  { id: 'broselow', subject: 'als_bag', prompt: 'Where is the Broselow tape?', options: bagChoices, correctOptionId: 'als_bag' },
  {
    id: 'narcotics',
    subject: 'narcotics',
    prompt: 'Where are narcotics carried?',
    options: [LOC.als, LOC.belt, LOC.trauma, LOC.monitor],
    correctOptionId: 'belt',
  },
  { id: 'pacing', subject: 'cardiac_monitor', prompt: 'Which equipment provides pacing?', options: bagChoices, correctOptionId: 'cardiac_monitor' },
  { id: 'chest_seals', subject: 'trauma_bag', prompt: 'Where are chest seals?', options: bagChoices, correctOptionId: 'trauma_bag' },
  { id: 'oxygen', subject: 'airway_bag', prompt: 'Which bag contains the portable oxygen cylinder?', options: bagChoices, correctOptionId: 'airway_bag' },
  { id: 'etco2', subject: 'cardiac_monitor', prompt: 'Which equipment measures EtCO₂?', options: bagChoices, correctOptionId: 'cardiac_monitor' },
  { id: 'iv_fluids', subject: 'als_bag', prompt: 'Where are IV fluids?', options: bagChoices, correctOptionId: 'als_bag' },
  { id: 'supraglottic', subject: 'airway_bag', prompt: 'Which bag contains supraglottic airways?', options: bagChoices, correctOptionId: 'airway_bag' },
  { id: 'cardioversion', subject: 'cardiac_monitor', prompt: 'Which equipment performs synchronized cardioversion?', options: bagChoices, correctOptionId: 'cardiac_monitor' },
  {
    id: 'pelvic_binder',
    subject: 'pelvic_binder',
    prompt: 'Where is the pelvic binder?',
    options: [LOC.trauma, LOC.separate, LOC.als, LOC.airway],
    correctOptionId: 'separate',
  },
  {
    id: 'ballistic',
    subject: 'ballistic',
    prompt: 'Where are ballistic vests and helmets?',
    options: [LOC.crew, LOC.trauma, LOC.als, LOC.separate],
    correctOptionId: 'crew',
  },
  { id: 'hemorrhage', subject: 'trauma_bag', prompt: 'Which bag contains hemorrhage-control supplies?', options: bagChoices, correctOptionId: 'trauma_bag' },
];

/** Exactly how many questions the five-question challenge asks (§4). */
export const QUIZ_QUESTION_COUNT = 5;

/**
 * Selects the five questions for a challenge. `rng` is injectable so tests are
 * deterministic; the app uses Math.random. Never returns duplicates.
 */
export function selectQuizQuestions(
  bank: readonly QuizQuestion[] = QUESTION_BANK,
  count: number = QUIZ_QUESTION_COUNT,
  rng: () => number = Math.random,
): readonly QuizQuestion[] {
  const pool = [...bank];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export interface QuizAttemptResult {
  readonly total: number;
  readonly correct: number;
  /** 5/5 is required to proceed into service (§4). */
  readonly passed: boolean;
  /** Back-end only: subjects the learner missed, for adaptive tracking. */
  readonly missedSubjects: readonly string[];
}

/** Scores an attempt. Back-end only — never surfaced per-question to the learner. */
export function scoreQuizAttempt(
  questions: readonly QuizQuestion[],
  answers: Readonly<Record<string, string>>,
): QuizAttemptResult {
  let correct = 0;
  const missedSubjects: string[] = [];
  for (const q of questions) {
    if (answers[q.id] === q.correctOptionId) correct += 1;
    else missedSubjects.push(q.subject);
  }
  return { total: questions.length, correct, passed: correct === questions.length, missedSubjects };
}
