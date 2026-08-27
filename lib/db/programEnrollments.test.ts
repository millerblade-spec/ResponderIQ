import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { query, resetPoolForTests } from './client';
import { enrollLearner, getEnrollment, listEnrollments } from './programEnrollments';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://responderiq:localdevonly@localhost:5432/responderiq_test';

describe('program_enrollments (integration, real database)', () => {
  beforeAll(() => vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL));
  afterAll(() => {
    vi.unstubAllEnvs();
    resetPoolForTests();
  });
  beforeEach(async () => {
    await query('TRUNCATE program_enrollments');
  });

  it('enrolls a responder and reads them back', async () => {
    const outcome = await enrollLearner({ programId: 'rpos-01', learnerName: 'Alex Medic', badgeId: 'B-1234' });
    expect(outcome.status).toBe('enrolled');
    const stored = await getEnrollment('rpos-01', 'B-1234');
    expect(stored?.learnerName).toBe('Alex Medic');
    expect(stored?.programId).toBe('rpos-01');
  });

  it('is idempotent — re-enrolling the same badge does not duplicate the roster entry', async () => {
    await enrollLearner({ programId: 'rpos-01', learnerName: 'Alex Medic', badgeId: 'B-1234' });
    const retry = await enrollLearner({ programId: 'rpos-01', learnerName: 'Alex M.', badgeId: 'B-1234' });
    expect(retry.status).toBe('already_enrolled');
    // The original name is what stays on the roster; the retry does not rename anyone.
    expect(retry.enrollment.learnerName).toBe('Alex Medic');
    expect(await listEnrollments('rpos-01', 25)).toHaveLength(1);
  });

  it('keeps the same badge separate across different programs', async () => {
    await enrollLearner({ programId: 'rpos-01', learnerName: 'Alex Medic', badgeId: 'B-1234' });
    const other = await enrollLearner({ programId: 'rpos-02', learnerName: 'Alex Medic', badgeId: 'B-1234' });
    expect(other.status).toBe('enrolled');
    expect(await listEnrollments('rpos-01', 25)).toHaveLength(1);
    expect(await listEnrollments('rpos-02', 25)).toHaveLength(1);
  });

  it('lists a program’s roster newest first and respects the limit', async () => {
    await enrollLearner({ programId: 'rpos-01', learnerName: 'First In', badgeId: 'B-1' });
    await enrollLearner({ programId: 'rpos-01', learnerName: 'Second In', badgeId: 'B-2' });
    await enrollLearner({ programId: 'rpos-01', learnerName: 'Third In', badgeId: 'B-3' });
    const roster = await listEnrollments('rpos-01', 2);
    expect(roster.map((entry) => entry.learnerName)).toEqual(['Third In', 'Second In']);
  });

  it('returns null for a badge that is not on the program', async () => {
    expect(await getEnrollment('rpos-01', 'B-nobody')).toBeNull();
  });
});
