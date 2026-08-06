/**
 * AI Ron's conversational debrief for BLS-01 — pure logic, no React, no audio.
 *
 * Ron is a very experienced partner: casual, warm, never clinical or formal.
 * He asks about the SPECIFIC choices the learner actually made in THIS run
 * (built from the recorded run facts), listens to the transcribed answer, and
 * evaluates it point by point against the documented correct reasoning for
 * this scenario — never against exact wording. Per the governing principle, a
 * reasonable field-improvised equivalent counts as correct (a sheet tied
 * around the hips IS a pelvic binder).
 *
 * Whatever this conversation produces IS the detailed record (see
 * ronDebriefSchema in lib/review/operationalRun.ts). There is deliberately NO
 * hidden numeric score behind it; an institutional/educator view would surface
 * this same record later.
 *
 * v1 evaluation is concept matching: each question carries reasoning points
 * with generous accept-phrase sets. The evaluator is a single function
 * (evaluateAnswer) so a model-backed evaluator can replace it later without
 * touching question generation or the record shape.
 */
import type { OperationalRun } from '@/lib/review/operationalRun';
import { STAIR_CHAIR_DESCENT_RULING } from '@/lib/opsim/transport';

/** The run facts the debrief reads — everything except identity/reflection/feedback. */
export type DebriefRunFacts = Omit<OperationalRun, 'learner' | 'reflection' | 'feedback' | 'ronDebrief'>;

export interface ReasoningPoint {
  readonly id: string;
  /** The documented correct reasoning, in plain words (stored in the record). */
  readonly label: string;
  /** Concept phrases — ANY hit (case-insensitive substring) marks the point addressed. */
  readonly accept: readonly string[];
}

export interface RonQuestion {
  readonly id: string;
  /** Ron's spoken line — casual, specific to what actually happened. */
  readonly ronLine: string;
  /** What in the run triggered this question (for the record / educator view). */
  readonly becauseOf: string;
  readonly points: readonly ReasoningPoint[];
  /**
   * A neutral question is asked and recorded but NOT judged — used for the
   * stair-chair descent choice while STAIR_CHAIR_DESCENT_RULING is
   * 'unresolved' (open question — confirm with Ron before wiring scoring).
   */
  readonly neutral?: boolean;
  /** Ron's replies by outcome. Neutral questions always use `neutralReply`. */
  readonly soundReply: string;
  readonly partialReply: string;
  readonly unclearReply: string;
  readonly neutralReply?: string;
}

export type Verdict = 'sound' | 'partial' | 'unclear';

export interface AssessedPoint {
  readonly id: string;
  readonly label: string;
  readonly addressed: boolean;
}

export interface AnswerAssessment {
  readonly verdict: Verdict;
  readonly points: readonly AssessedPoint[];
}

export interface RonDebriefEntry {
  readonly questionId: string;
  readonly ronLine: string;
  readonly answerTranscript: string;
  readonly inputMode: 'voice' | 'typed';
  readonly assessment: AnswerAssessment;
  readonly ronReply: string;
}

export interface RonDebriefRecord {
  readonly entries: readonly RonDebriefEntry[];
  readonly closingLine: string;
  readonly allSound: boolean;
}

const MAX_QUESTIONS = 6;

const point = (id: string, label: string, accept: readonly string[]): ReasoningPoint => ({ id, label, accept });

/**
 * Builds Ron's questions from what the learner actually did in THIS run —
 * never generic. Order runs from scene management down to the ending decision;
 * capped so the conversation stays a conversation.
 */
export function buildRonQuestions(run: DebriefRunFacts): readonly RonQuestion[] {
  const questions: RonQuestion[] = [];
  const t = run.transport;
  const dynamicsIssue = (type: string) => run.dynamics.issues.find((i) => i.type === type);

  // Scene lights on a dark scene (fix #5 — the right call was yes).
  if (run.sceneSafety.sceneLightChoice && run.sceneSafety.sceneLightChoice !== 'scene_lights_on') {
    questions.push({
      id: 'scene_lights',
      ronLine:
        'It was full dark when we pulled up and we worked the front of that building without scene lights. Walk me through that call.',
      becauseOf: `Scene-light choice was "${run.sceneSafety.sceneLightChoice}" on a dark scene.`,
      points: [
        point('visibility', 'Darkness hid ground hazards and made the approach harder to read', [
          'see', 'visib', 'dark', 'light', 'hazard', 'trip', 'footing', 'hidden',
        ]),
        point('crew_safety', 'Lighting the scene protects the crew and the carry-out, not just the walk-in', [
          'safe', 'crew', 'carry', 'stretcher', 'protect', 'stairs', 'load',
        ]),
      ],
      soundReply: 'Okay — you saw the risk, you just weighed it differently. Next time flip ’em on; it’s free.',
      partialReply: 'Part of it, yeah. The other half is the carry-out — we come back down loaded, in the dark.',
      unclearReply: 'Here’s my take: it costs nothing and we can suddenly see the potholes. Lights on when it’s dark.',
    });
  }

  // Parking trade-off (fix #3) — only probed when the truck blocked the street.
  if (run.parking?.choice === 'front_entrance') {
    questions.push({
      id: 'parking',
      ronLine:
        'You had me drop the truck right on the front door and we blocked the whole street. What was the trade you were making there?',
      becauseOf: 'Parked directly in front of the entrance, blocking the narrow street.',
      points: [
        point('short_carry', 'Shortest carry to the door for a stairs patient', ['carry', 'close', 'short', 'stairs', 'distance', 'quick']),
        point('egress', 'Recognized the cost: blocked lane and a boxed-in exit path', ['block', 'street', 'exit', 'egress', 'traffic', 'leave', 'out']),
      ],
      soundReply: 'That’s a real trade and you made it with your eyes open. I’ll take that.',
      partialReply: 'Half the trade. Short carry, sure — but we also boxed our own exit. Keep both in the picture.',
      unclearReply: 'Think of it as two costs: how far we carry him, and how fast we can leave. Weigh both next time.',
    });
  }

  // The TV (fix #11) — a real scene-control action, and he left it blaring.
  const tv = dynamicsIssue('television');
  if (tv && !tv.resolved) {
    questions.push({
      id: 'television',
      ronLine: 'Why’d you leave that TV blaring the whole time we were trying to talk to him?',
      becauseOf: 'The television distraction was never resolved.',
      points: [
        point('scene_control', 'Controlling the environment is part of running the scene', ['control', 'environment', 'scene', 'quiet', 'turn', 'down', 'off']),
        point('communication', 'The noise was costing the interview — he couldn’t hear the questions', ['hear', 'interview', 'question', 'communic', 'listen', 'talk']),
      ],
      soundReply: 'Right — you knew it. It’s a ten-second fix that buys back the whole interview. Grab it early.',
      partialReply: 'Sort of. The real cost was the interview — he was missing half your questions.',
      unclearReply: 'It’s his TV, but it’s our scene. Ask for it down — that’s scene control, same as anything else.',
    });
  }

  // Disorderly family (fix #11): ask-calm first, police is the escalation.
  const family = dynamicsIssue('family');
  if (family && !family.resolved && family.maxStageReached >= 3) {
    questions.push({
      id: 'family',
      ronLine:
        'The son was coming apart on us and it never really got handled. How do you want to play that one next time?',
      becauseOf: `Family distraction escalated to stage ${family.maxStageReached + 1} unresolved.`,
      points: [
        point('ask_calm_first', 'First move: ask them to calm down / give them a job or an explanation', ['calm', 'ask', 'explain', 'talk', 'reassure', 'job']),
        point('escalate_police', 'If they won’t comply, the escalation is police — not a fight', ['police', 'law', 'escalat', 'officer', 'remove']),
        point('control_not_fight', 'We’re not there to fight — we’re there to control the environment', ['fight', 'control', 'environment', 'de-escalat', 'deescalat']),
      ],
      soundReply: 'That’s exactly it. We’re not there to fight anybody — we’re there to control the environment.',
      partialReply: 'Good start. Remember the ladder: ask them to calm down, and if they won’t, that’s a police call. We don’t fight.',
      unclearReply: 'Simple ladder: ask them to calm down first. If they won’t, call PD. We’re not there to fight — we’re there to control the environment.',
    });
  }

  // Delegated calming (fix #11): someone other than the lead should own it.
  const calmed = run.crew.assignments.some((a) => a.taskId === 'calm_patient_explain');
  if (!calmed) {
    questions.push({
      id: 'calm_delegation',
      ronLine:
        'Nobody ever really sat with him and told him what was happening — he just got worked on. Whose job should that have been?',
      becauseOf: 'No crew member was assigned to calm the patient and explain.',
      points: [
        point('delegate', 'Delegate it — a partner, fire, anyone with a free set of hands', ['you', 'ron', 'partner', 'fire', 'delegate', 'someone', 'assign', 'crew']),
        point('not_lead', 'Not the lead — the lead’s hands stay on the assessment', ['not me', 'lead', 'assess', 'my hands', 'while i', 'i assess', 'i work']),
      ],
      soundReply: 'Yep — hand it off. Your hands stay on the assessment, his nerves get handled anyway.',
      partialReply: 'Close. The key is it’s NOT you — you’re assessing. Everyone else is a candidate.',
      unclearReply: 'Give it away. A scared patient fights everything; a talked-to patient helps you. Anyone but you can do it.',
    });
  }

  // Equipment walk-backs (§9, fix #6): consequence, not penalty — but worth a think.
  const walkBacks =
    run.equipment.retrievals.length + (t?.deviceNeededRetrieval ? 1 : 0) + (t?.pelvicNeededRetrieval ? 1 : 0);
  if (walkBacks > 0) {
    questions.push({
      id: 'walk_backs',
      ronLine: `We sent somebody back to the truck ${walkBacks === 1 ? 'once' : `${walkBacks} times`} tonight. Dispatch told us stairs from the jump — what do you grab first next run?`,
      becauseOf: `${walkBacks} equipment walk-back(s) to Medic 3.`,
      points: [
        point('differential_drives_gear', 'The dispatch picture (fall + stairs) should drive the first load', ['stairs', 'fall', 'dispatch', 'walkup', 'carry', 'ahead', 'anticipate', 'first']),
        point('name_the_gear', 'Names the movement gear: stair chair / backboard / scoop', ['stair chair', 'chair', 'backboard', 'board', 'scoop', 'stretcher', 'binder', 'monitor']),
      ],
      soundReply: 'There you go. Third-floor fall — the movement problem is the call. Pack for it walking in.',
      partialReply: 'Getting there. Say it out loud next time at the truck: “fall, stairs — what moves him?”',
      unclearReply: 'The trick is the dispatch already told us the hard part: stairs. Grab what moves him on the first trip.',
    });
  }

  // Pelvic support (fix #12): sheet == binder; skipping is fine IF reasoned from the exam.
  if (t?.pelvicSupport === 'none') {
    questions.push({
      id: 'pelvic_skip',
      ronLine: 'Why’d you skip the pelvic binder?',
      becauseOf: 'No pelvic support was used.',
      points: [
        point('exam_based', 'Grounded in the assessment: pelvis without gross instability / binder not clearly indicated', [
          'stable', 'instab', 'exam', 'assess', 'indicated', 'no deformity', 'compression', 'tender', 'hip not pelvis', 'not indicated',
        ]),
      ],
      soundReply: 'Fair — that’s an assessment answer, and that’s the only kind I take. Not every hip needs a binder.',
      partialReply: 'Okay, but tie it to the exam for me. Binder’s for the suspected pelvic fracture — did the pelvis tell you that or not?',
      unclearReply: 'The binder question is really an exam question. If the pelvis is suspicious, wrap it — a sheet works fine. If it’s not, skip it and say why.',
    });
  } else if (t?.pelvicSupport === 'improvised_sheet') {
    questions.push({
      id: 'pelvic_sheet',
      ronLine: 'You tied a sheet around his hips instead of running for the binder. Talk me through it.',
      becauseOf: 'Improvised sheet used for pelvic support.',
      points: [
        point('equivalent', 'A sheet does the same job — circumferential stabilization; improvising is correct', ['same', 'stabiliz', 'wrap', 'pressure', 'works', 'improvis', 'equivalent', 'binder']),
        point('time', 'Saved the walk-back to the truck', ['time', 'faster', 'truck', 'walk', 'right there', 'on hand', 'quicker']),
      ],
      soundReply: 'Textbook street medicine. A sheet IS a binder if you tie it right — and you didn’t burn a trip to the truck.',
      partialReply: 'It’s the right move — just know why: same circumferential squeeze as the binder, zero walk-back.',
      unclearReply: 'For the record, that was right: a sheet does the binder’s job. Own it as a real technique, not a shortcut.',
    });
  }

  // Stair-chair descent — OPEN QUESTION, deliberately neutral until Ron rules.
  if (t?.device === 'stair_chair' && STAIR_CHAIR_DESCENT_RULING === 'unresolved') {
    questions.push({
      id: 'stair_chair_descent',
      neutral: true,
      ronLine:
        'You took him down on the stair chair. When we tried to sit him up earlier he couldn’t take it — walk me through your read there.',
      becauseOf: 'Stair chair chosen for the descent; the patient could not tolerate sitting. Ruling pending — recorded, not judged.',
      points: [
        point('sitting_tolerance', 'Engages with the sitting-tolerance problem', ['sit', 'seated', 'upright', 'position', 'pain', 'tolerate']),
        point('alternatives', 'Weighs the alternatives (scoop/backboard) for a narrow stairwell', ['scoop', 'backboard', 'board', 'flat', 'narrow', 'stairwell', 'alternative']),
      ],
      soundReply: '',
      partialReply: '',
      unclearReply: '',
      neutralReply:
        'I hear you. Honestly? I want to kick that exact question around with the med director before I tell you it was right or wrong. Good instinct bringing the chair up early either way.',
    });
  }

  // Backboard left on for transport (fix #15) — removal was the scored-correct action.
  if (t && t.rigidDeviceRemovedBeforeTransport === false) {
    questions.push({
      id: 'board_left_on',
      ronLine: 'We ran him all the way in still strapped to the board. What does a long ride on a board do to a guy like him?',
      becauseOf: 'Rigid device left under the patient for transport.',
      points: [
        point('harm', 'Boards cause pressure injury and pain, and can restrict breathing', ['pressure', 'sore', 'pain', 'breath', 'harm', 'injur', 'skin']),
        point('extrication_tool', 'A board is an extrication tool, not a transport mattress — off before transport', ['extricat', 'tool', 'remove', 'off', 'transfer', 'mattress', 'stretcher']),
      ],
      soundReply: 'Exactly — so next run the board comes off at the stretcher, every time.',
      partialReply: 'Partly. Big picture: the board’s job ended at the bottom of the stairs. It comes off before we roll.',
      unclearReply: 'Boards get people out of buildings — they don’t ride to the ER. It hurts them and it doesn’t protect anything. Off at the stretcher.',
    });
  }

  // Descent without fire hands (fix #13).
  if (t && t.fireAssistCount === 0) {
    questions.push({
      id: 'no_fire_assist',
      ronLine: 'We muscled him down those stairs by ourselves with a whole engine crew standing in the yard. Why not use them?',
      becauseOf: 'Descent performed with zero fire personnel assisting.',
      points: [
        point('use_crew', 'Available crew (fire) exists exactly for this — use them', ['fire', 'crew', 'help', 'hands', 'assign', 'use them', 'lift']),
        point('safety', 'Short-handed carries on stairs risk the patient and the crew', ['drop', 'safe', 'risk', 'injur', 'back', 'fall']),
      ],
      soundReply: 'Right. They want the work — all you have to do is say the word.',
      partialReply: 'And the other half: a two-person stair carry is how patients get dropped and backs get blown out.',
      unclearReply: 'Those folks stand around until you give them a job — that’s the system working, not shyness. Put them on the corners.',
    });
  }

  // The ending decision (fix #16) — binary at this tier; either answer can be
  // sound WITH reasoning. Always asked: it's the decision that ended the run.
  if (t && t.painMedicationGiven !== null) {
    questions.push({
      id: 'pain_decision',
      ronLine: t.painMedicationGiven
        ? 'Last one. You gave him something for the pain before we rolled — why?'
        : 'Last one. He was hurting and you held off on pain meds — why?',
      becauseOf: `Pain medication ${t.painMedicationGiven ? 'given' : 'withheld'} at the end of the run.`,
      points: [
        point('reasoned', 'A reason tied to the patient in front of you (comfort, ride, vitals, scope, protocol)', [
          'pain', 'comfort', 'ride', 'moving', 'vital', 'pressure', 'protocol', 'scope', 'als', 'medic', 'hurt', 'humane', 'allerg',
        ]),
      ],
      soundReply: 'Good. Either answer can be right on this one — what I care about is that you had a reason, and you did.',
      partialReply: 'Okay. Just make sure the reason lives with THIS patient — his pain, his pressure, our protocols.',
      unclearReply: 'No freebies on the last one — give or hold, you need a why. His pain, his vitals, our protocols: pick your reason from those.',
    });
  }

  if (questions.length === 0) {
    // Nothing to pick at — the run was clean. One open reflection, then the drink.
    questions.push({
      id: 'clean_run',
      ronLine: 'Honestly? I’ve got nothing to pick at. Anything YOU would do differently?',
      becauseOf: 'No debrief-worthy findings in the recorded run.',
      points: [],
      soundReply: 'That’s the right instinct — the good ones always find something.',
      partialReply: 'Fair enough.',
      unclearReply: 'Fair enough.',
    });
  }

  return questions.slice(0, MAX_QUESTIONS);
}

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

/**
 * Evaluates a transcribed answer against the question's documented reasoning
 * points — concept coverage, never exact wording. Known risk (test after
 * build, do not pre-solve): browser voice-to-text may mangle EMS-specific
 * terms ("scoop stretcher", "pelvic binder") more than ordinary words; the
 * accept sets deliberately include ordinary-word synonyms to soften that.
 */
export function evaluateAnswer(question: RonQuestion, transcript: string): AnswerAssessment {
  const text = normalize(transcript);
  const points: AssessedPoint[] = question.points.map((p) => ({
    id: p.id,
    label: p.label,
    addressed: p.accept.some((phrase) => text.includes(phrase.toLowerCase())),
  }));
  if (text.trim().length === 0) return { verdict: 'unclear', points };
  if (points.length === 0) return { verdict: 'sound', points };
  const hit = points.filter((p) => p.addressed).length;
  const verdict: Verdict = hit === points.length ? 'sound' : hit > 0 ? 'partial' : 'unclear';
  return { verdict, points };
}

/** Ron's reply to an assessed answer. Neutral questions always get the neutral reply. */
export function ronReplyFor(question: RonQuestion, assessment: AnswerAssessment): string {
  if (question.neutral) return question.neutralReply ?? 'Fair enough.';
  switch (assessment.verdict) {
    case 'sound':
      return question.soundReply;
    case 'partial':
      return question.partialReply;
    default:
      return question.unclearReply;
  }
}

/**
 * The closing. All-sound runs get the warm send-off — no pass/fail language,
 * ever. Neutral (unjudged) questions don't count against the learner.
 */
export function buildClosing(entries: readonly RonDebriefEntry[], questions: readonly RonQuestion[]): {
  closingLine: string;
  allSound: boolean;
} {
  const judged = entries.filter((e) => !questions.find((q) => q.id === e.questionId)?.neutral);
  const allSound = judged.every((e) => e.assessment.verdict === 'sound');
  return {
    allSound,
    closingLine: allSound
      ? 'Man, you did everything right out there. Rig’s clean, paperwork can wait — let’s go grab a drink.'
      : 'Good run tonight. Couple things to chew on for next time — but that’s every call, partner. Come on, first round’s on me.',
  };
}
