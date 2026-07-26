import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database layer so these tests never need a real database — they
// verify the action's validation and error boundary, not persistence.
vi.mock('@/lib/db/truckCheckAttempts', () => ({
  recordTruckCheckAttempt: vi.fn(),
}));

import { saveTruckCheckAttempt } from './actions';
import { recordTruckCheckAttempt } from '@/lib/db/truckCheckAttempts';

const validTruckCheck = {
  learnerId: 'L-1',
  scenarioId: 'bls-01',
  outcome: 'truck_check' as const,
  mandatory: true,
  forcedCheck: false,
};

describe('saveTruckCheckAttempt (§4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a malformed payload before ever touching the database', async () => {
    const result = await saveTruckCheckAttempt({ outcome: 'quiz' }); // missing required fields
    expect(result.status).toBe('validation_error');
    expect(recordTruckCheckAttempt).not.toHaveBeenCalled();
  });

  it('persists a valid attempt and returns its id', async () => {
    vi.mocked(recordTruckCheckAttempt).mockResolvedValue({ id: '42' });
    const result = await saveTruckCheckAttempt(validTruckCheck);
    expect(result).toEqual({ status: 'saved', id: '42' });
    expect(recordTruckCheckAttempt).toHaveBeenCalledOnce();
  });

  it('returns an honest persistence_error, with no raw detail, when the database throws', async () => {
    vi.mocked(recordTruckCheckAttempt).mockRejectedValue(new Error('super secret detail'));
    const result = await saveTruckCheckAttempt(validTruckCheck);
    expect(result).toEqual({ status: 'persistence_error' });
  });
});
