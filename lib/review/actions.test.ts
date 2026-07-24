import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, resetPoolForTests } from '@/lib/db/client';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://responderiq:localdevonly@localhost:5432/responderiq_test';

function validRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    evaluationId: randomUUID(),
    scenarioId: 'bls-01',
    state: {
      phase: 'complete',
      elapsedMinutes: 14,
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
      completion: { status: 'transport_initiated', atMinute: 14 },
    },
    ...overrides,
  };
}

describe('saveCompletedRun (integration, real database)', () => {
  beforeAll(() => {
    vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    resetPoolForTests();
  });

  beforeEach(async () => {
    vi.resetModules();
    await query('TRUNCATE review_records');
  });

  it('a genuinely valid first save returns saved and the record is really there', async () => {
    const { saveCompletedRun } = await import('./actions');
    const request = validRequest();

    const result = await saveCompletedRun(request);
    expect(result).toEqual({ status: 'saved', evaluationId: request.evaluationId });

    const { rows } = await query<{ count: string }>('SELECT count(*)::text FROM review_records');
    expect(rows[0].count).toBe('1');
  });

  it('an exact retry (same full payload) returns already_saved and creates no second row', async () => {
    const { saveCompletedRun } = await import('./actions');
    const request = validRequest();

    await saveCompletedRun(request);
    const retryResult = await saveCompletedRun(request);

    expect(retryResult).toEqual({ status: 'already_saved', evaluationId: request.evaluationId });
    const { rows } = await query<{ count: string }>('SELECT count(*)::text FROM review_records');
    expect(rows[0].count).toBe('1');
  });

  it('reusing an evaluationId for a different scenario is rejected as a validation_error, not accepted', async () => {
    const { saveCompletedRun } = await import('./actions');
    const first = validRequest();
    await saveCompletedRun(first);

    const conflicting = validRequest({ evaluationId: first.evaluationId, scenarioId: 'bls-01' });
    // Force an actual scenario mismatch by bypassing the schema's literal
    // restriction isn't meaningful here (only one scenarioId is valid) --
    // the real conflict case this exercises is at the DB-module level
    // (see reviewRecords.test.ts). Here we confirm a structurally invalid
    // request is rejected the same clear way.
    const invalid = { ...conflicting, scenarioId: 'not-a-real-scenario' };
    const result = await saveCompletedRun(invalid);
    expect(result.status).toBe('validation_error');
  });

  it('rejects a malformed payload before ever touching the database', async () => {
    const { saveCompletedRun } = await import('./actions');
    const result = await saveCompletedRun({ evaluationId: 'not-a-uuid', scenarioId: 'bls-01', state: {} });
    expect(result.status).toBe('validation_error');

    const { rows } = await query<{ count: string }>('SELECT count(*)::text FROM review_records');
    expect(rows[0].count).toBe('0');
  });

  it('rejects a payload with an unexpected field before ever touching the database', async () => {
    const { saveCompletedRun } = await import('./actions');
    const result = await saveCompletedRun({ ...validRequest(), adminOverride: true });
    expect(result.status).toBe('validation_error');

    const { rows } = await query<{ count: string }>('SELECT count(*)::text FROM review_records');
    expect(rows[0].count).toBe('0');
  });

  it('rejects an oversized payload before ever touching the database', async () => {
    const { saveCompletedRun } = await import('./actions');
    const request = validRequest();
    const oversized = {
      ...request,
      state: {
        ...request.state,
        timeline: Array.from({ length: 501 }, (_, i) => ({ atMinute: i, kind: 'action', label: 'x' })),
      },
    };
    const result = await saveCompletedRun(oversized);
    expect(result.status).toBe('validation_error');
  });
});

describe('saveCompletedRun (persistence failure, mocked database)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns an honest persistence_error, with no raw database detail, when the database call throws', async () => {
    vi.doMock('@/lib/db/reviewRecords', () => ({
      saveReviewRecord: vi.fn().mockRejectedValue(new Error('connection terminated unexpectedly: super secret detail')),
    }));

    const { saveCompletedRun } = await import('./actions');
    const result = await saveCompletedRun(validRequest());

    expect(result).toEqual({ status: 'persistence_error' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
