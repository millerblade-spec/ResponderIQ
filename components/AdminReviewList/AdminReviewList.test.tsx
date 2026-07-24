import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { render, screen } from '@testing-library/react';
import { AdminReviewList } from './AdminReviewList';
import { query, resetPoolForTests } from '@/lib/db/client';
import { saveReviewRecord } from '@/lib/db/reviewRecords';
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

describe('AdminReviewList (integration, real database)', () => {
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

  it('shows a clear empty state when nothing has been saved', async () => {
    render(await AdminReviewList({ scenarioId: 'bls-01' }));
    expect(screen.getByText(/no completed runs yet/i)).toBeInTheDocument();
  });

  it('lists saved runs newest first', async () => {
    const first = randomUUID();
    const second = randomUUID();
    await saveReviewRecord(first, 'bls-01', makeState(1));
    await saveReviewRecord(second, 'bls-01', makeState(2));

    render(await AdminReviewList({ scenarioId: 'bls-01' }));
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', `/admin/scenarios/bls-01/${second}`);
    expect(links[1]).toHaveAttribute('href', `/admin/scenarios/bls-01/${first}`);
  });

  it('only shows runs for the requested scenario', async () => {
    await saveReviewRecord(randomUUID(), 'bls-01', makeState(1));
    await saveReviewRecord(randomUUID(), 'bls-02', makeState(2));

    render(await AdminReviewList({ scenarioId: 'bls-01' }));
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('does not expose raw database error detail when the list query fails', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/reviewRecords', () => ({
      listReviewRecords: vi.fn().mockRejectedValue(new Error('connection terminated: super secret detail')),
    }));

    const { AdminReviewList: FreshList } = await import('./AdminReviewList');
    const { container } = render(await FreshList({ scenarioId: 'bls-01' }));

    expect(container.textContent).toMatch(/something went wrong loading the review list/i);
    expect(container.textContent).not.toMatch(/secret/i);
    vi.doUnmock('@/lib/db/reviewRecords');
  });
});
