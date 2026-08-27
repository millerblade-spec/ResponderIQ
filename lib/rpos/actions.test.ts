import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSessionMock = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('@/lib/auth/dal', () => ({ getSession: () => getSessionMock() }));
vi.mock('@/lib/db/rposEnrollments', () => ({
  enrollLearner: vi.fn(),
  getEnrollment: vi.fn(),
  updateEnrollment: vi.fn(),
}));
vi.mock('@/lib/db/operationalRuns', () => ({ listAllLearnerRuns: vi.fn() }));
vi.mock('@/lib/db/rposMissBoard', () => ({ listMissBoard: vi.fn() }));

import { advanceResponder, enrollResponder } from './actions';
import { enrollLearner, getEnrollment, updateEnrollment } from '@/lib/db/rposEnrollments';
import { listAllLearnerRuns } from '@/lib/db/operationalRuns';
import { listMissBoard } from '@/lib/db/rposMissBoard';
import { makeStoredRun } from './rpos.fixture';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const enrollment = {
  badgeId: 'B-1234',
  learnerName: 'Alex Medic',
  certification: 'paramedic' as const,
  level: 3 as const,
  personalityMode: 1 as const,
  enrolledAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Five clean BLS-01 runs score 98 and band BLUE, which is what eligibility needs. */
function fiveCleanRuns() {
  return [1, 2, 3, 4, 5].map((day) =>
    makeStoredRun({}, { createdAt: new Date(Date.UTC(2026, 0, day)).toISOString() }),
  );
}

describe('enrollResponder action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ username: 'trainer' });
  });

  it('refuses without an admin session, before touching the database', async () => {
    getSessionMock.mockResolvedValue(null);
    const result = await enrollResponder({}, formData({ learnerName: 'Alex', badgeId: 'B-1', certification: 'emt' }));
    expect(result.error).toMatch(/sign in/i);
    expect(enrollLearner).not.toHaveBeenCalled();
  });

  it('will not enroll without a patch — scope and grading follow it', async () => {
    const result = await enrollResponder({}, formData({ learnerName: 'Alex Medic', badgeId: 'B-1234' }));
    expect(result.error).toBeDefined();
    expect(enrollLearner).not.toHaveBeenCalled();
  });

  it('rejects a patch that is not EMT or Paramedic', async () => {
    const result = await enrollResponder(
      {},
      formData({ learnerName: 'Alex Medic', badgeId: 'B-1234', certification: 'ccp' }),
    );
    expect(result.error).toBeDefined();
    expect(enrollLearner).not.toHaveBeenCalled();
  });

  it('enrolls with trimmed values at level 1', async () => {
    vi.mocked(enrollLearner).mockResolvedValue({ status: 'enrolled', enrollment: { ...enrollment, level: 1 } });
    const result = await enrollResponder(
      {},
      formData({ learnerName: '  Alex Medic ', badgeId: ' B-1234 ', certification: 'emt' }),
    );
    expect(enrollLearner).toHaveBeenCalledWith(
      expect.objectContaining({ badgeId: 'B-1234', learnerName: 'Alex Medic', certification: 'emt' }),
    );
    expect(result.message).toMatch(/level 1/);
  });

  it('keeps the real database error server-side', async () => {
    vi.mocked(enrollLearner).mockRejectedValue(new Error('super secret detail'));
    const result = await enrollResponder(
      {},
      formData({ learnerName: 'Alex Medic', badgeId: 'B-1234', certification: 'emt' }),
    );
    expect(result.error).toBe('Something went wrong enrolling that responder. Please try again.');
    expect(result.error).not.toContain('super secret');
  });
});

describe('advanceResponder action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ username: 'trainer' });
    vi.mocked(getEnrollment).mockResolvedValue(enrollment);
    vi.mocked(listMissBoard).mockResolvedValue([]);
  });

  it('refuses without an admin session', async () => {
    getSessionMock.mockResolvedValue(null);
    const result = await advanceResponder({}, formData({ badgeId: 'B-1234', level: '4' }));
    expect(result.error).toMatch(/sign in/i);
    expect(updateEnrollment).not.toHaveBeenCalled();
  });

  it('re-checks the advancement rule server-side and refuses when it is not met', async () => {
    vi.mocked(listAllLearnerRuns).mockResolvedValue(fiveCleanRuns().slice(0, 2));
    const result = await advanceResponder({}, formData({ badgeId: 'B-1234', level: '4' }));
    expect(result.error).toMatch(/not eligible/i);
    expect(updateEnrollment).not.toHaveBeenCalled();
  });

  it('refuses while a critical Miss Board item is unresolved, even on a clean streak', async () => {
    vi.mocked(listAllLearnerRuns).mockResolvedValue(fiveCleanRuns());
    vi.mocked(listMissBoard).mockResolvedValue([
      {
        id: 'case-1:scene_safety',
        category: 'safety',
        subject: 'Scene safety',
        detail: 'Entered before clearance.',
        critical: true,
        sourceCaseId: 'case-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
        resolvedByCaseId: null,
      },
    ]);
    const result = await advanceResponder({}, formData({ badgeId: 'B-1234', level: '4' }));
    expect(result.error).toMatch(/not eligible/i);
    expect(updateEnrollment).not.toHaveBeenCalled();
  });

  it('advances an eligible responder one level', async () => {
    vi.mocked(listAllLearnerRuns).mockResolvedValue(fiveCleanRuns());
    vi.mocked(updateEnrollment).mockResolvedValue({ ...enrollment, level: 4 });
    const result = await advanceResponder({}, formData({ badgeId: 'B-1234', level: '4' }));
    expect(updateEnrollment).toHaveBeenCalledWith('B-1234', { level: 4 });
    expect(result.message).toMatch(/advanced to level 4/);
  });

  it('refuses to skip levels', async () => {
    vi.mocked(listAllLearnerRuns).mockResolvedValue(fiveCleanRuns());
    const result = await advanceResponder({}, formData({ badgeId: 'B-1234', level: '6' }));
    expect(result.error).toMatch(/one level at a time/i);
    expect(updateEnrollment).not.toHaveBeenCalled();
  });

  it('refuses for a responder who is not on the program', async () => {
    vi.mocked(getEnrollment).mockResolvedValue(null);
    const result = await advanceResponder({}, formData({ badgeId: 'B-nobody', level: '2' }));
    expect(result.error).toMatch(/not on the program/i);
  });

  it('will not advance past level 6', async () => {
    vi.mocked(getEnrollment).mockResolvedValue({ ...enrollment, level: 6 });
    vi.mocked(listAllLearnerRuns).mockResolvedValue(fiveCleanRuns());
    const result = await advanceResponder({}, formData({ badgeId: 'B-1234', level: '7' }));
    expect(result.error).toBeDefined();
    expect(updateEnrollment).not.toHaveBeenCalled();
  });

  it('keeps the real database error server-side', async () => {
    vi.mocked(listAllLearnerRuns).mockRejectedValue(new Error('super secret detail'));
    const result = await advanceResponder({}, formData({ badgeId: 'B-1234', level: '4' }));
    expect(result.error).toBe('Something went wrong advancing that responder. Please try again.');
    expect(result.error).not.toContain('super secret');
  });
});
