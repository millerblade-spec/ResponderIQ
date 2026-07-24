import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { render, screen } from '@testing-library/react';
import { AdminReview } from './AdminReview';
import { query, resetPoolForTests } from '@/lib/db/client';
import { saveReviewRecord } from '@/lib/db/reviewRecords';
import type { ReviewableSceneState } from '@/lib/review/schema';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://responderiq:localdevonly@localhost:5432/responderiq_test';

const richState: ReviewableSceneState = {
  phase: 'complete',
  elapsedMinutes: 14,
  resources: {
    additional_ems: {
      kind: 'additional_ems',
      status: 'on_scene',
      requestedAtMinute: 2,
      etaMinutes: 8,
      arrivesAtMinute: 10,
    },
    fire_lift_assist: { kind: 'fire_lift_assist', status: 'not_requested' },
  },
  hazardFlags: [],
  familyState: 'calm',
  stairChairPrepped: true,
  patientCanBearWeight: false,
  differential: {
    current: ['possible_medical_event_caused_fall'],
    history: [{ atMinute: 5, reads: ['unclear_needs_more_info'], reason: 'Awaiting further assessment' }],
  },
  timeline: [
    {
      atMinute: 0,
      kind: 'action',
      label: 'Brief your partner on the plan before you roll',
      availableActionIds: ['brief-partner', 'roll-immediately'],
      chosenActionId: 'brief-partner',
      observations: [
        {
          category: 'communication',
          severity: 'positive',
          tag: 'crew_resource_management',
          note: 'Learner briefed partner before rolling.',
          learnerNarrative: 'You briefed your partner before responding, setting up a coordinated approach.',
          atMinute: 0,
        },
      ],
    },
  ],
  criticalFlags: [
    {
      id: 'unsafe-lift',
      whatHappened: 'The patient was lifted without the stair chair prepped.',
      whyDangerous: 'This risks a fall injury to both the patient and crew.',
      consequence: 'The patient was jarred during the lift.',
      saferAlternative: 'Prep the stair chair before attempting to move the patient.',
      acknowledged: true,
      atMinute: 6,
    },
  ],
  actionsTaken: ['brief-partner'],
  firedEventIds: [],
  completion: { status: 'transport_initiated', atMinute: 14 },
};

describe('AdminReview (integration, real database)', () => {
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

  it('always shows the database-backed disclaimer', async () => {
    render(await AdminReview({ evaluationId: randomUUID() }));
    expect(screen.getByText(/administrator review/i)).toBeInTheDocument();
    expect(screen.getByText(/backed by the database/i)).toBeInTheDocument();
  });

  it('shows a clean message for an id with no saved record', async () => {
    render(await AdminReview({ evaluationId: randomUUID() }));
    expect(screen.getByText(/no review record found for this id/i)).toBeInTheDocument();
  });

  it('rejects a malformed (non-UUID) id without ever querying the database', async () => {
    render(await AdminReview({ evaluationId: 'not-a-real-uuid' }));
    expect(screen.getByText(/this review id isn't valid/i)).toBeInTheDocument();
  });

  it('renders a real saved record in full, including the critical flag', async () => {
    const evaluationId = randomUUID();
    await saveReviewRecord(evaluationId, 'bls-01', richState);

    render(await AdminReview({ evaluationId }));
    expect(screen.getByText(/status: transport_initiated at minute 14/i)).toBeInTheDocument();
    expect(screen.getByText(/the patient was lifted without the stair chair prepped/i)).toBeInTheDocument();
    expect(screen.getByText(/acknowledged by learner: yes/i)).toBeInTheDocument();
  });

  it('renders the hidden category scoring table and behavioral tags for a real record', async () => {
    const evaluationId = randomUUID();
    await saveReviewRecord(evaluationId, 'bls-01', richState);

    render(await AdminReview({ evaluationId }));
    expect(screen.getByText('communication')).toBeInTheDocument();
    expect(screen.getByText(/demonstrated:/i)).toBeInTheDocument();
  });

  it('renders the real differential history for a saved record', async () => {
    const evaluationId = randomUUID();
    await saveReviewRecord(evaluationId, 'bls-01', richState);

    render(await AdminReview({ evaluationId }));
    expect(screen.getByText(/awaiting further assessment/i)).toBeInTheDocument();
  });

  it('renders real resource request/ETA/arrival data for a saved record', async () => {
    const evaluationId = randomUUID();
    await saveReviewRecord(evaluationId, 'bls-01', richState);

    render(await AdminReview({ evaluationId }));
    expect(screen.getByText(/requested at minute 2, eta 8 min, arrival minute 10/i)).toBeInTheDocument();
  });

  it('renders the full timeline for a saved record', async () => {
    const evaluationId = randomUUID();
    await saveReviewRecord(evaluationId, 'bls-01', richState);

    render(await AdminReview({ evaluationId }));
    expect(screen.getByText('Brief your partner on the plan before you roll')).toBeInTheDocument();
    expect(screen.getByText(/also available: roll-immediately/i)).toBeInTheDocument();
  });

  it('does not expose raw database error detail when the database call fails', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/reviewRecords', () => ({
      getReviewRecord: vi.fn().mockRejectedValue(new Error('connection terminated: super secret detail')),
    }));

    const { AdminReview: FreshAdminReview } = await import('./AdminReview');
    const { container } = render(await FreshAdminReview({ evaluationId: randomUUID() }));

    expect(container.textContent).toMatch(/something went wrong loading this review/i);
    expect(container.textContent).not.toMatch(/secret/i);
    vi.doUnmock('@/lib/db/reviewRecords');
  });

  it('survives a fresh module context (simulating a separate request), proving this is not tied to any in-memory state', async () => {
    const evaluationId = randomUUID();
    await saveReviewRecord(evaluationId, 'bls-01', richState);

    vi.resetModules();
    const { AdminReview: FreshAdminReview } = await import('./AdminReview');
    render(await FreshAdminReview({ evaluationId }));

    expect(screen.getByText(/status: transport_initiated at minute 14/i)).toBeInTheDocument();
  });
});
