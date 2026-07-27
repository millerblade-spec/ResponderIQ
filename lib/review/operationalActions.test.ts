import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/operationalRuns', () => ({ saveOperationalRun: vi.fn() }));

import { saveCompletedOperationalRun } from './operationalActions';
import { saveOperationalRun } from '@/lib/db/operationalRuns';
import { makeRun } from './operationalRun.fixture';

describe('saveCompletedOperationalRun (§ Step 10)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an invalid payload before touching the database', async () => {
    const result = await saveCompletedOperationalRun({ scenarioId: 'bls-01' });
    expect(result.status).toBe('validation_error');
    expect(saveOperationalRun).not.toHaveBeenCalled();
  });

  it('persists a valid run and returns the attempt number', async () => {
    vi.mocked(saveOperationalRun).mockResolvedValue({ status: 'saved', attemptNumber: 2 });
    const result = await saveCompletedOperationalRun(makeRun());
    expect(result).toMatchObject({ status: 'saved', attemptNumber: 2 });
  });

  it('returns an honest persistence_error when the database throws', async () => {
    vi.mocked(saveOperationalRun).mockRejectedValue(new Error('super secret detail'));
    const result = await saveCompletedOperationalRun(makeRun());
    expect(result).toEqual({ status: 'persistence_error' });
  });
});
