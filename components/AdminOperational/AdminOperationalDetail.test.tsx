import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminOperationalDetail } from './AdminOperationalDetail';
import { query, resetPoolForTests } from '@/lib/db/client';
import { saveOperationalRun } from '@/lib/db/operationalRuns';
import { makeRun } from '@/lib/review/operationalRun.fixture';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://responderiq:localdevonly@localhost:5432/responderiq_test';

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${(seq += 1).toString().padStart(12, '0')}`;

describe('AdminOperationalDetail (integration, real database) (§27, §28)', () => {
  beforeAll(() => vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL));
  afterAll(() => {
    vi.unstubAllEnvs();
    resetPoolForTests();
  });
  beforeEach(async () => {
    await query('TRUNCATE operational_runs');
  });

  it('shows the numerical administrator score, band, category performance, timeline, reflection and feedback', async () => {
    const run = makeRun({ evaluationId: uuid() });
    await saveOperationalRun(run);
    render(await AdminOperationalDetail({ evaluationId: run.evaluationId }));

    // The administrator sees a numeric score (the learner never does).
    expect(screen.getByLabelText('Administrator score').textContent).toMatch(/^\d+$/);
    expect(screen.getByText('Category performance')).toBeInTheDocument();
    expect(screen.getByText(/Operational timeline/i)).toBeInTheDocument();
    // Reflection + feedback persisted and shown.
    expect(screen.getByText(/Kept the family calm/i)).toBeInTheDocument();
    expect(screen.getByText(/Learner reflection/i)).toBeInTheDocument();
    expect(screen.getByText(/Simulator feedback/i)).toBeInTheDocument();
  });

  it('records a Critical Safety Concern even when the score would otherwise pass', async () => {
    const run = makeRun({
      evaluationId: uuid(),
      sceneSafety: { windshieldReviewed: true, dispatchStaging: true, staged: true, clearedToEnter: false, sceneLightChoice: null, ballisticChoice: null },
    });
    await saveOperationalRun(run);
    render(await AdminOperationalDetail({ evaluationId: run.evaluationId }));
    expect(screen.getByText(/Critical Safety Concern Recorded/i)).toBeInTheDocument();
  });

  it('shows a clean message for an unknown run id', async () => {
    render(await AdminOperationalDetail({ evaluationId: uuid() }));
    expect(screen.getByText(/no run found for this id/i)).toBeInTheDocument();
  });
});
