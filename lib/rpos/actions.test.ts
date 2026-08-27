import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSessionMock = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('@/lib/auth/dal', () => ({ getSession: () => getSessionMock() }));
vi.mock('@/lib/db/programEnrollments', () => ({ enrollLearner: vi.fn() }));

import { enrollResponder } from './actions';
import { enrollLearner } from '@/lib/db/programEnrollments';
import { RPOS_PROGRAM } from './program';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const enrolled = {
  status: 'enrolled' as const,
  enrollment: { programId: RPOS_PROGRAM.id, learnerName: 'Alex Medic', badgeId: 'B-1234', enrolledAt: '2026-01-01T00:00:00.000Z' },
};

describe('enrollResponder action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ username: 'trainer' });
  });

  it('refuses without an admin session, before touching the database', async () => {
    getSessionMock.mockResolvedValue(null);
    const result = await enrollResponder({}, formData({ learnerName: 'Alex Medic', badgeId: 'B-1234' }));
    expect(result.error).toMatch(/sign in/i);
    expect(enrollLearner).not.toHaveBeenCalled();
  });

  it('rejects a blank name or badge before touching the database', async () => {
    const result = await enrollResponder({}, formData({ learnerName: '   ', badgeId: 'B-1234' }));
    expect(result.error).toBeDefined();
    expect(enrollLearner).not.toHaveBeenCalled();
  });

  it('enrolls onto the RPOS program with trimmed values', async () => {
    vi.mocked(enrollLearner).mockResolvedValue(enrolled);
    const result = await enrollResponder({}, formData({ learnerName: '  Alex Medic ', badgeId: ' B-1234 ' }));
    expect(enrollLearner).toHaveBeenCalledWith({
      programId: RPOS_PROGRAM.id,
      learnerName: 'Alex Medic',
      badgeId: 'B-1234',
    });
    expect(result.message).toMatch(/on the program/);
  });

  it('reports an existing enrollment as a message, not an error', async () => {
    vi.mocked(enrollLearner).mockResolvedValue({ ...enrolled, status: 'already_enrolled' });
    const result = await enrollResponder({}, formData({ learnerName: 'Alex Medic', badgeId: 'B-1234' }));
    expect(result.error).toBeUndefined();
    expect(result.message).toMatch(/already on the program/);
  });

  it('keeps the real database error server-side', async () => {
    vi.mocked(enrollLearner).mockRejectedValue(new Error('super secret detail'));
    const result = await enrollResponder({}, formData({ learnerName: 'Alex Medic', badgeId: 'B-1234' }));
    expect(result.error).toBe('Something went wrong enrolling that responder. Please try again.');
    expect(result.error).not.toContain('super secret');
  });
});
