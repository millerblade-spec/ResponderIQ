/**
 * The six RPOS levels, as the master prompts define them.
 *
 * Where the prompts state a number, it is here. Where they do not — most
 * levels have no stated scenario count — the field is null rather than a
 * plausible-looking guess, and the standing UI says "no stated minimum".
 */
import type { Certification, CoachingPosture, LevelNumber } from './types';

export interface LevelDefinition {
  readonly level: LevelNumber;
  readonly title: string;
  /** Prompt #2's own call signs: THUNDERDOME, THE JUNGLE. Null where the prompts give none. */
  readonly callSign: string | null;
  /** The question the level asks, in the prompts' words. */
  readonly question: string;
  readonly focus: string;
  readonly coaching: CoachingPosture;
  /** Prompt #1 states "normally about 10 meaningful scenarios" for Level 1 only. */
  readonly minimumScenarios: number | null;
  /** Prompt #1's Level 2 hidden mix. Never disclosed to the learner, never rigid. */
  readonly hiddenMix: { readonly straightforward: number; readonly moderate: number; readonly difficult: number } | null;
  /** What the level newly introduces. */
  readonly introduces: readonly string[];
  /** Title suffix that applies only to one certification (Level 3 EMT: "+ ALS Integration"). */
  readonly certificationTitles?: Readonly<Partial<Record<Certification, string>>>;
}

export const RPOS_LEVELS: readonly LevelDefinition[] = [
  {
    level: 1,
    title: 'Orientation & Evaluation',
    callSign: null,
    question: 'Can you find the problem?',
    focus:
      'Baseline assessment, protocol knowledge, medication knowledge, communication, confidence, reasoning, resource use, and reassessment.',
    coaching: 'active_coaching',
    minimumScenarios: 10,
    hiddenMix: null,
    introduces: [
      'Scene safety is evaluated from here on',
      'At least one meaningful "walk me through it" reasoning interaction per scenario',
      'Push back when assessment elements are missed',
    ],
  },
  {
    level: 2,
    title: 'Clinical Decision Making',
    callSign: null,
    question: 'You found it. What are you going to do about it?',
    focus: 'Treatment, transport, destination, escalation, and resource reasoning, with the memory challenge continuing.',
    coaching: 'broad_prompts',
    minimumScenarios: null,
    hiddenMix: { straightforward: 50, moderate: 30, difficult: 20 },
    introduces: ['At least one meaningful "walk me through it" reasoning interaction per scenario'],
  },
  {
    level: 3,
    title: 'Protocol Mastery',
    callSign: null,
    question: 'Can you run it from memory, without being walked through it?',
    focus:
      'Assessment → Recognition → Protocol → Treatment → Reassessment increasingly without prompting; old weaknesses come back.',
    coaching: 'learner_owns_assessment',
    minimumScenarios: null,
    hiddenMix: null,
    introduces: [
      'Deliberate unsafe scenes begin',
      'More dual-problem patients, unpredictably',
      'Behavioral cases may appear',
      'Leadership begins naturally',
    ],
    certificationTitles: { emt: 'Protocol Mastery + ALS Integration' },
  },
  {
    level: 4,
    title: 'Advanced: Increased Pressure',
    callSign: 'WELCOME TO THUNDERDOME',
    question: 'Can you still do the medicine when the pressure goes up?',
    focus:
      'Pressure, competing priorities, leadership, multiple resources, scene complexity, dual problems, dynamic safety, difficult access, changing condition, resource timing.',
    coaching: 'very_little_rescue',
    minimumScenarios: null,
    hiddenMix: null,
    introduces: [
      'Leadership and operations are graded: ownership, delegation, prioritization, crew utilization, escalation',
      'Unsafe scenes become less obvious and may evolve after contact',
      'Optional Level-5-style case on request, still graded at the current level',
    ],
  },
  {
    level: 5,
    title: 'Welcome to the Jungle',
    callSign: 'WELCOME TO THE JUNGLE',
    question: 'Can you handle it?',
    focus:
      'Cognitive load, uncertainty, multiple priorities, limited or delayed resources, geography, deterioration, multiple patients, extrication, HEMS, blood products, transport decisions.',
    coaching: 'training_wheels_off',
    minimumScenarios: null,
    hiddenMix: null,
    introduces: [
      'No routine reminders — the world reacts to what the learner actually does',
      'Multi-patient and MCI tracking; patients never disappear',
      'Remote geography and HEMS decisions, never suggested automatically',
      'Occasional genuinely straightforward case, so a zebra is never assumed',
      'Touch the vent, own the vent',
    ],
  },
  {
    level: 6,
    title: 'CCP Rescue Mode',
    callSign: null,
    question: 'The ALS crew has already done their job. What do YOU bring that they don’t have?',
    focus:
      'Responding to an ALS crew that needs help, in the CCP role, under the current Fort Worth CCP protocols. Care is already underway on arrival.',
    coaching: 'training_wheels_off',
    minimumScenarios: null,
    hiddenMix: null,
    introduces: [
      'Ventilator management as a major recurring competency, with MODE always given',
      'About half of ventilator cases develop a real patient-ventilator problem',
      'About one in five cases is an ARDS-type patient',
      'DOPES for sudden deterioration — never announced, always recognized',
      'Severe ventilated asthma can meaningfully stack',
    ],
  },
];

export function levelDefinition(level: LevelNumber): LevelDefinition {
  const found = RPOS_LEVELS.find((definition) => definition.level === level);
  if (!found) throw new Error(`RPOS has no level ${level}`);
  return found;
}

/** The level's title for a certification — Level 3 reads differently for an EMT. */
export function levelTitleFor(level: LevelNumber, certification: Certification): string {
  const definition = levelDefinition(level);
  return definition.certificationTitles?.[certification] ?? definition.title;
}

export const FIRST_LEVEL: LevelNumber = 1;
export const FINAL_LEVEL: LevelNumber = 6;

/** The level after this one, or null at the top of the program. */
export function nextLevelAfter(level: LevelNumber): LevelNumber | null {
  return level >= FINAL_LEVEL ? null : ((level + 1) as LevelNumber);
}
