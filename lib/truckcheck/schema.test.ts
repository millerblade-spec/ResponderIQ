import { describe, it, expect } from 'vitest';
import { truckCheckAttemptSchema } from './schema';

const truckCheck = {
  learnerId: 'L-1',
  scenarioId: 'bls-01',
  outcome: 'truck_check' as const,
  mandatory: true,
  forcedCheck: false,
};

const quiz = {
  learnerId: 'L-1',
  scenarioId: 'bls-01',
  outcome: 'quiz' as const,
  mandatory: false,
  forcedCheck: false,
  quiz: {
    correct: 5,
    total: 5,
    passed: true,
    questionIds: ['io_location', 'tourniquets'],
    answers: { io_location: 'als_bag' },
    missedSubjects: [],
  },
};

describe('truckCheckAttemptSchema (§4)', () => {
  it('accepts a valid Truck Check attempt', () => {
    expect(truckCheckAttemptSchema.safeParse(truckCheck).success).toBe(true);
  });

  it('accepts a valid quiz attempt', () => {
    expect(truckCheckAttemptSchema.safeParse(quiz).success).toBe(true);
  });

  it('rejects a quiz outcome with no quiz detail', () => {
    const bad = { ...truckCheck, outcome: 'quiz' as const }; // quiz outcome, but no quiz detail
    expect(truckCheckAttemptSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a truck_check outcome that carries quiz detail', () => {
    expect(truckCheckAttemptSchema.safeParse({ ...truckCheck, quiz: quiz.quiz }).success).toBe(false);
  });

  it('rejects an unexpected field', () => {
    expect(truckCheckAttemptSchema.safeParse({ ...truckCheck, sneaky: 1 }).success).toBe(false);
  });
});
