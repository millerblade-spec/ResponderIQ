import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { query, resetPoolForTests } from './client';
import { enrollLearner, getEnrollment, listEnrollments, updateEnrollment } from './rposEnrollments';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://responderiq:localdevonly@localhost:5432/responderiq_test';

describe('rpos_enrollments (integration, real database)', () => {
  beforeAll(() => vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL));
  afterAll(() => {
    vi.unstubAllEnvs();
    resetPoolForTests();
  });
  beforeEach(async () => {
    await query('TRUNCATE rpos_enrollments');
  });

  it('enrolls a responder at level 1 with their patch', async () => {
    const outcome = await enrollLearner({ badgeId: 'B-1234', learnerName: 'Alex Medic', certification: 'paramedic' });
    expect(outcome.status).toBe('enrolled');
    const stored = await getEnrollment('B-1234');
    expect(stored?.certification).toBe('paramedic');
    expect(stored?.level).toBe(1);
    expect(stored?.personalityMode).toBe(1);
  });

  it('is idempotent, and never silently changes an existing responder’s patch or level', async () => {
    await enrollLearner({ badgeId: 'B-1234', learnerName: 'Alex Medic', certification: 'paramedic', level: 3 });
    const retry = await enrollLearner({ badgeId: 'B-1234', learnerName: 'Alex M.', certification: 'emt' });
    expect(retry.status).toBe('already_enrolled');
    expect(retry.enrollment.certification).toBe('paramedic');
    expect(retry.enrollment.level).toBe(3);
    expect(await listEnrollments(25)).toHaveLength(1);
  });

  it('advances a responder a level and stamps the change', async () => {
    await enrollLearner({ badgeId: 'B-1234', learnerName: 'Alex Medic', certification: 'emt' });
    const updated = await updateEnrollment('B-1234', { level: 2 });
    expect(updated?.level).toBe(2);
    // Unspecified fields are left alone.
    expect(updated?.certification).toBe('emt');
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(updated!.enrolledAt).getTime());
  });

  it('returns null when asked to advance someone who is not on the roster', async () => {
    expect(await updateEnrollment('B-nobody', { level: 2 })).toBeNull();
  });

  it('changes only what it is given', async () => {
    await enrollLearner({ badgeId: 'B-1234', learnerName: 'Alex Medic', certification: 'emt', level: 2 });
    const updated = await updateEnrollment('B-1234', { personalityMode: 2 });
    expect(updated?.personalityMode).toBe(2);
    expect(updated?.level).toBe(2);
    expect(updated?.certification).toBe('emt');
  });

  it('lists the roster newest first and respects the limit', async () => {
    await enrollLearner({ badgeId: 'B-1', learnerName: 'First In', certification: 'emt' });
    await enrollLearner({ badgeId: 'B-2', learnerName: 'Second In', certification: 'emt' });
    await enrollLearner({ badgeId: 'B-3', learnerName: 'Third In', certification: 'paramedic' });
    const roster = await listEnrollments(2);
    expect(roster.map((entry) => entry.learnerName)).toEqual(['Third In', 'Second In']);
  });

  it('returns null for a badge that is not on the program', async () => {
    expect(await getEnrollment('B-nobody')).toBeNull();
  });
});
