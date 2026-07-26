import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { query, resetPoolForTests } from './client';
import {
  recordTruckCheckAttempt,
  getTruckCheckStatus,
  listFrequentlyMissedSubjects,
} from './truckCheckAttempts';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://responderiq:localdevonly@localhost:5432/responderiq_test';

describe('truck_check_attempts (integration, real database)', () => {
  beforeAll(() => {
    vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    resetPoolForTests();
  });

  beforeEach(async () => {
    await query('TRUNCATE truck_check_attempts');
  });

  it('reports no completed check for a learner with no attempts', async () => {
    const status = await getTruckCheckStatus('nobody');
    expect(status).toEqual({ hasCompletedTruckCheck: false, attemptCount: 0 });
  });

  it('records a completed Truck Check and reflects it in the status (persistence)', async () => {
    await recordTruckCheckAttempt({
      learnerId: 'L-1',
      scenarioId: 'bls-01',
      outcome: 'truck_check',
      mandatory: true,
      forcedCheck: false,
    });
    const status = await getTruckCheckStatus('L-1');
    expect(status.hasCompletedTruckCheck).toBe(true);
    expect(status.attemptCount).toBe(1);
  });

  it('a quiz attempt counts as an attempt but is not a completed Truck Check', async () => {
    await recordTruckCheckAttempt({
      learnerId: 'L-2',
      scenarioId: 'bls-01',
      outcome: 'quiz',
      mandatory: false,
      forcedCheck: false,
      quiz: {
        correct: 5,
        total: 5,
        passed: true,
        questionIds: ['io_location'],
        answers: { io_location: 'als_bag' },
        missedSubjects: [],
      },
    });
    const status = await getTruckCheckStatus('L-2');
    expect(status).toEqual({ hasCompletedTruckCheck: false, attemptCount: 1 });
  });

  it('aggregates frequently-missed subjects across quiz attempts', async () => {
    for (const missed of [['trauma_bag', 'narcotics'], ['trauma_bag']]) {
      await recordTruckCheckAttempt({
        learnerId: 'L-3',
        scenarioId: 'bls-01',
        outcome: 'quiz',
        mandatory: false,
        forcedCheck: false,
        quiz: {
          correct: 5 - missed.length,
          total: 5,
          passed: false,
          questionIds: ['io_location'],
          answers: {},
          missedSubjects: missed,
        },
      });
    }
    const missed = await listFrequentlyMissedSubjects('L-3', 10);
    const trauma = missed.find((m) => m.subject === 'trauma_bag');
    expect(trauma?.count).toBe(2);
    expect(missed.find((m) => m.subject === 'narcotics')?.count).toBe(1);
  });

  it('keeps learners separate', async () => {
    await recordTruckCheckAttempt({
      learnerId: 'A',
      scenarioId: 'bls-01',
      outcome: 'truck_check',
      mandatory: true,
      forcedCheck: false,
    });
    expect((await getTruckCheckStatus('B')).hasCompletedTruckCheck).toBe(false);
  });
});
