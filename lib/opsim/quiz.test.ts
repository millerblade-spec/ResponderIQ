import { describe, it, expect } from 'vitest';
import { QUESTION_BANK, selectQuizQuestions, scoreQuizAttempt, QUIZ_QUESTION_COUNT } from './quiz';

/** A deterministic RNG cycling through fixed values, for repeatable selection. */
function seededRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('truck quiz bank (§4)', () => {
  it('has a larger bank than the five that get asked', () => {
    expect(QUESTION_BANK.length).toBeGreaterThan(QUIZ_QUESTION_COUNT);
  });

  it('every question has a correct option that exists among its options', () => {
    for (const q of QUESTION_BANK) {
      expect(q.options.find((o) => o.id === q.correctOptionId)).toBeDefined();
      expect(q.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('selects exactly five questions, all drawn from the bank, with no duplicates', () => {
    const picked = selectQuizQuestions(QUESTION_BANK, 5, seededRng([0.1, 0.9, 0.3, 0.7, 0.5, 0.2]));
    expect(picked).toHaveLength(5);
    expect(new Set(picked.map((q) => q.id)).size).toBe(5);
    for (const q of picked) expect(QUESTION_BANK.find((b) => b.id === q.id)).toBeDefined();
  });

  it('scores 5/5 as passed', () => {
    const questions = selectQuizQuestions(QUESTION_BANK, 5, seededRng([0.4]));
    const answers = Object.fromEntries(questions.map((q) => [q.id, q.correctOptionId]));
    const result = scoreQuizAttempt(questions, answers);
    expect(result).toMatchObject({ total: 5, correct: 5, passed: true });
    expect(result.missedSubjects).toEqual([]);
  });

  it('scores 4/5 as NOT passed and records the missed subject', () => {
    const questions = selectQuizQuestions(QUESTION_BANK, 5, seededRng([0.4]));
    const answers = Object.fromEntries(questions.map((q) => [q.id, q.correctOptionId]));
    // Break exactly one answer.
    answers[questions[0].id] = '__wrong__';
    const result = scoreQuizAttempt(questions, answers);
    expect(result).toMatchObject({ total: 5, correct: 4, passed: false });
    expect(result.missedSubjects).toEqual([questions[0].subject]);
  });
});
