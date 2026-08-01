import { describe, it, expect } from 'vitest';
import {
  buildRonQuestions,
  evaluateAnswer,
  ronReplyFor,
  buildClosing,
  type DebriefRunFacts,
  type RonDebriefEntry,
} from './ronDebrief';
import { makeRun } from '@/lib/review/operationalRun.fixture';

/** A clean-ish run with the rebuild's new fields, overridable per test. */
function facts(overrides: Partial<DebriefRunFacts> = {}): DebriefRunFacts {
  const { learner, reflection, feedback, ...rest } = makeRun();
  void learner;
  void reflection;
  void feedback;
  return {
    ...rest,
    parking: { choice: 'across_street' },
    floorArrival: { lightingNoted: true, doorNoted: true },
    transport: {
      device: 'scoop_stretcher',
      deviceNeededRetrieval: false,
      pelvicSupport: 'pelvic_binder',
      pelvicNeededRetrieval: false,
      fireAssistCount: 3,
      alsWorkupDone: true,
      rigidDeviceRemovedBeforeTransport: true,
      painMedicationGiven: true,
      events: [],
    },
    crew: {
      assignments: [
        ...makeRun().crew.assignments,
        { responderId: 'engine_4_ff3', taskId: 'calm_patient_explain', status: 'complete', startedAtSecond: 125, completedAtSecond: 170 },
      ],
    },
    dynamics: {
      issues: [
        { id: 'family', type: 'family', maxStageReached: 1, resolved: true, recognized: true, firstActionAtSecond: 160 },
        { id: 'television', type: 'television', maxStageReached: 1, resolved: true, recognized: true, firstActionAtSecond: 170 },
      ],
    },
    ...overrides,
  };
}

describe('AI Ron — question generation is specific to the run', () => {
  it('asks about the skipped pelvic binder when support was skipped', () => {
    const t = facts().transport!;
    const qs = buildRonQuestions(facts({ transport: { ...t, pelvicSupport: 'none' } }));
    const q = qs.find((x) => x.id === 'pelvic_skip');
    expect(q).toBeDefined();
    expect(q!.ronLine).toMatch(/skip the pelvic binder/i);
  });

  it('asks about the blaring TV only when it was left unresolved', () => {
    const withTv = facts({
      dynamics: {
        issues: [{ id: 'television', type: 'television', maxStageReached: 3, resolved: false, recognized: false, firstActionAtSecond: null }],
      },
    });
    expect(buildRonQuestions(withTv).some((q) => q.id === 'television')).toBe(true);
    expect(buildRonQuestions(facts()).some((q) => q.id === 'television')).toBe(false);
  });

  it('asks about the board only when the patient rode in on it', () => {
    const t = facts().transport!;
    const left = facts({ transport: { ...t, device: 'backboard', rigidDeviceRemovedBeforeTransport: false } });
    expect(buildRonQuestions(left).some((q) => q.id === 'board_left_on')).toBe(true);
    expect(buildRonQuestions(facts()).some((q) => q.id === 'board_left_on')).toBe(false);
  });

  it('asks a NEUTRAL stair-chair question while the descent ruling is unresolved', () => {
    const t = facts().transport!;
    const qs = buildRonQuestions(facts({ transport: { ...t, device: 'stair_chair', rigidDeviceRemovedBeforeTransport: null } }));
    const q = qs.find((x) => x.id === 'stair_chair_descent');
    expect(q).toBeDefined();
    expect(q!.neutral).toBe(true);
    // Neutral questions never judge — the reply is the same regardless of verdict.
    const reply = ronReplyFor(q!, evaluateAnswer(q!, 'because I felt like it'));
    expect(reply).toBe(q!.neutralReply);
  });

  it('always closes on the pain decision, phrased to match what the learner chose', () => {
    const gave = buildRonQuestions(facts()).find((q) => q.id === 'pain_decision');
    expect(gave!.ronLine).toMatch(/gave him something/i);
    const t = facts().transport!;
    const held = buildRonQuestions(facts({ transport: { ...t, painMedicationGiven: false } })).find(
      (q) => q.id === 'pain_decision',
    );
    expect(held!.ronLine).toMatch(/held off/i);
  });

  it('a clean run gets the single open reflection question, not silence', () => {
    const qs = buildRonQuestions(facts());
    // Clean apart from the always-asked pain question.
    expect(qs.map((q) => q.id)).toEqual(['pain_decision']);
  });
});

describe('AI Ron — answers are judged on reasoning, not wording', () => {
  const pelvicQuestion = () => {
    const t = facts().transport!;
    return buildRonQuestions(facts({ transport: { ...t, pelvicSupport: 'none' } })).find((q) => q.id === 'pelvic_skip')!;
  };

  it('accepts assessment-grounded reasoning in plain words', () => {
    const q = pelvicQuestion();
    const a = evaluateAnswer(q, 'his pelvis felt stable when I checked it so I did not think it was indicated');
    expect(a.verdict).toBe('sound');
  });

  it('marks an answer with no documented reasoning as unclear', () => {
    const q = pelvicQuestion();
    expect(evaluateAnswer(q, 'I forgot about it honestly').verdict).toBe('unclear');
    expect(evaluateAnswer(q, '').verdict).toBe('unclear');
  });

  it('grades partial coverage as partial and replies accordingly', () => {
    const withoutLights = facts({
      sceneSafety: { ...facts().sceneSafety, sceneLightChoice: 'handheld_lighting' },
    });
    const q = buildRonQuestions(withoutLights).find((x) => x.id === 'scene_lights')!;
    const a = evaluateAnswer(q, 'I figured we could see well enough to walk in');
    expect(a.verdict).toBe('partial'); // visibility engaged; the carry-out half missed
    expect(ronReplyFor(q, a)).toBe(q.partialReply);
  });

  it('records each reasoning point with its addressed flag — the record IS the evaluation', () => {
    const q = pelvicQuestion();
    const a = evaluateAnswer(q, 'the exam was benign');
    expect(a.points).toHaveLength(q.points.length);
    for (const p of a.points) {
      expect(typeof p.addressed).toBe('boolean');
      expect(p.label.length).toBeGreaterThan(0);
    }
  });
});

describe('AI Ron — closing tone', () => {
  const entry = (questionId: string, verdict: 'sound' | 'partial' | 'unclear'): RonDebriefEntry => ({
    questionId,
    ronLine: 'q',
    answerTranscript: 'a',
    inputMode: 'typed',
    assessment: { verdict, points: [] },
    ronReply: 'r',
  });

  it('an all-sound run gets the warm "grab a drink" close, never pass/fail language', () => {
    const qs = buildRonQuestions(facts());
    const { closingLine, allSound } = buildClosing([entry('pain_decision', 'sound')], qs);
    expect(allSound).toBe(true);
    expect(closingLine).toMatch(/grab a drink/i);
    expect(closingLine).not.toMatch(/pass|fail|score|grade/i);
  });

  it('a mixed run still closes warm, and neutral questions never count against the learner', () => {
    const t = facts().transport!;
    const qs = buildRonQuestions(facts({ transport: { ...t, device: 'stair_chair', rigidDeviceRemovedBeforeTransport: null } }));
    const entries = [entry('stair_chair_descent', 'unclear'), entry('pain_decision', 'sound')];
    const { allSound } = buildClosing(entries, qs);
    expect(allSound).toBe(true); // the neutral stair-chair answer is recorded, not judged

    const mixed = buildClosing([entry('pain_decision', 'partial')], qs);
    expect(mixed.allSound).toBe(false);
    expect(mixed.closingLine).not.toMatch(/pass|fail|score|grade/i);
  });
});
