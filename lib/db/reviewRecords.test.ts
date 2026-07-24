import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, resetPoolForTests } from './client';
import { saveReviewRecord, getReviewRecord, listReviewRecords, clearReviewRecord } from './reviewRecords';
import type { ReviewableSceneState } from '@/lib/review/schema';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://responderiq:localdevonly@localhost:5432/responderiq_test';

function makeState(atMinute: number): ReviewableSceneState {
  return {
    phase: 'complete',
    elapsedMinutes: atMinute,
    resources: {
      additional_ems: { kind: 'additional_ems', status: 'not_requested' },
      fire_lift_assist: { kind: 'fire_lift_assist', status: 'not_requested' },
    },
    hazardFlags: [],
    familyState: 'calm',
    stairChairPrepped: false,
    patientCanBearWeight: true,
    differential: { current: [], history: [] },
    timeline: [],
    criticalFlags: [],
    actionsTaken: [],
    firedEventIds: [],
    completion: { status: 'transport_initiated', atMinute },
  };
}

describe('review_records (integration)', () => {
  beforeAll(() => {
    vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    resetPoolForTests();
  });

  beforeEach(async () => {
    await query('TRUNCATE review_records');
  });

  it('returns null when nothing has been saved for an evaluation id', async () => {
    expect(await getReviewRecord(randomUUID())).toBeNull();
  });

  describe('idempotency, the actual point of this table', () => {
    it('first save returns "saved" and the row is really there', async () => {
      const evaluationId = randomUUID();
      const outcome = await saveReviewRecord(evaluationId, 'bls-01', makeState(14));

      expect(outcome).toEqual({ status: 'saved' });
      const stored = await getReviewRecord(evaluationId);
      expect(stored?.scenarioId).toBe('bls-01');
      expect(stored?.state.completion?.atMinute).toBe(14);
    });

    it('an exact retry with the same evaluationId and scenarioId returns "already_saved", not a new row', async () => {
      const evaluationId = randomUUID();
      await saveReviewRecord(evaluationId, 'bls-01', makeState(14));
      const retryOutcome = await saveReviewRecord(evaluationId, 'bls-01', makeState(14));

      expect(retryOutcome).toEqual({ status: 'already_saved' });
      const { rows } = await query<{ count: string }>('SELECT count(*)::text FROM review_records');
      expect(rows[0].count).toBe('1');
    });

    it('reusing the same evaluationId for a different scenarioId is rejected as a conflict, not silently accepted', async () => {
      const evaluationId = randomUUID();
      await saveReviewRecord(evaluationId, 'bls-01', makeState(14));
      const conflictOutcome = await saveReviewRecord(evaluationId, 'bls-02', makeState(9));

      expect(conflictOutcome).toEqual({ status: 'conflict' });
      // The original row must be completely unchanged -- a conflict must never overwrite.
      const stored = await getReviewRecord(evaluationId);
      expect(stored?.scenarioId).toBe('bls-01');
      expect(stored?.state.completion?.atMinute).toBe(14);
    });

    it('two different evaluationIds for the same scenario both persist as separate rows (this is history now, not a single slot)', async () => {
      await saveReviewRecord(randomUUID(), 'bls-01', makeState(10));
      await saveReviewRecord(randomUUID(), 'bls-01', makeState(20));

      const { rows } = await query<{ count: string }>(
        "SELECT count(*)::text FROM review_records WHERE scenario_id = 'bls-01'",
      );
      expect(rows[0].count).toBe('2');
    });
  });

  describe('listReviewRecords', () => {
    it('returns an empty list for a scenario with no saved runs', async () => {
      expect(await listReviewRecords('bls-01', 10)).toEqual([]);
    });

    it('orders newest first', async () => {
      const first = randomUUID();
      const second = randomUUID();
      const third = randomUUID();
      await saveReviewRecord(first, 'bls-01', makeState(1));
      await saveReviewRecord(second, 'bls-01', makeState(2));
      await saveReviewRecord(third, 'bls-01', makeState(3));

      const list = await listReviewRecords('bls-01', 10);
      expect(list.map((r) => r.evaluationId)).toEqual([third, second, first]);
    });

    it('respects the limit', async () => {
      for (let i = 0; i < 5; i += 1) {
        await saveReviewRecord(randomUUID(), 'bls-01', makeState(i));
      }
      expect(await listReviewRecords('bls-01', 2)).toHaveLength(2);
    });

    it('only returns records for the requested scenario', async () => {
      await saveReviewRecord(randomUUID(), 'bls-01', makeState(1));
      await saveReviewRecord(randomUUID(), 'bls-02', makeState(2));

      const list = await listReviewRecords('bls-01', 10);
      expect(list).toHaveLength(1);
      expect(list[0].scenarioId).toBe('bls-01');
    });
  });

  it('clears a saved record by evaluationId', async () => {
    const evaluationId = randomUUID();
    await saveReviewRecord(evaluationId, 'bls-01', makeState(14));
    await clearReviewRecord(evaluationId);
    expect(await getReviewRecord(evaluationId)).toBeNull();
  });
});
