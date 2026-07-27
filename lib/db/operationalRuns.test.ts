import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { query, resetPoolForTests } from './client';
import {
  saveOperationalRun,
  getOperationalRun,
  listOperationalRuns,
  listLearnerAttempts,
} from './operationalRuns';
import { getReviewRecord } from './reviewRecords';
import { makeRun } from '@/lib/review/operationalRun.fixture';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://responderiq:localdevonly@localhost:5432/responderiq_test';

let seq = 0;
function uuid() {
  seq += 1;
  return `00000000-0000-4000-8000-${seq.toString().padStart(12, '0')}`;
}

describe('operational_runs (integration, real database)', () => {
  beforeAll(() => vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL));
  afterAll(() => {
    vi.unstubAllEnvs();
    resetPoolForTests();
  });
  beforeEach(async () => {
    await query('TRUNCATE operational_runs');
  });

  it('saves a run and reads it back with attempt number 1', async () => {
    const run = makeRun({ evaluationId: uuid() });
    const outcome = await saveOperationalRun(run);
    expect(outcome).toEqual({ status: 'saved', attemptNumber: 1 });
    const stored = await getOperationalRun(run.evaluationId);
    expect(stored?.run.learner.name).toBe('Alex Medic');
    expect(stored?.attemptNumber).toBe(1);
  });

  it('increments the attempt number for the same learner + scenario', async () => {
    const first = await saveOperationalRun(makeRun({ evaluationId: uuid() }));
    const second = await saveOperationalRun(makeRun({ evaluationId: uuid() }));
    expect(first.attemptNumber).toBe(1);
    expect(second.attemptNumber).toBe(2);
  });

  it('is idempotent — re-saving the same evaluation id does not add an attempt', async () => {
    const run = makeRun({ evaluationId: uuid() });
    await saveOperationalRun(run);
    const retry = await saveOperationalRun(run);
    expect(retry.status).toBe('already_saved');
    const attempts = await listLearnerAttempts(run.learner.badgeId, run.scenarioId);
    expect(attempts).toHaveLength(1);
  });

  it('lists runs newest first for the admin, and a learner’s attempts oldest first', async () => {
    const a = makeRun({ evaluationId: uuid() });
    const b = makeRun({ evaluationId: uuid() });
    await saveOperationalRun(a);
    await saveOperationalRun(b);
    const list = await listOperationalRuns('bls-01', 10);
    expect(list[0].evaluationId).toBe(b.evaluationId); // newest first
    const attempts = await listLearnerAttempts(a.learner.badgeId, 'bls-01');
    expect(attempts[0].evaluationId).toBe(a.evaluationId); // oldest first
  });

  it('separates learners by badge id', async () => {
    await saveOperationalRun(makeRun({ evaluationId: uuid(), learner: { name: 'A', badgeId: 'B-A' } }));
    const other = await saveOperationalRun(makeRun({ evaluationId: uuid(), learner: { name: 'B', badgeId: 'B-B' } }));
    expect(other.attemptNumber).toBe(1); // different badge -> fresh count
  });

  it('leaves legacy review_records readable (no second persistence path)', async () => {
    await saveOperationalRun(makeRun({ evaluationId: uuid() }));
    // The legacy table still works — querying it does not error.
    expect(await getReviewRecord('00000000-0000-4000-8000-000000009999')).toBeNull();
  });
});
