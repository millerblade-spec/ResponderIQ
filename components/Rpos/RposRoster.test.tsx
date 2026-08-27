import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// lib/rpos/load.ts is server-only (it reads the database). These server
// components are rendered directly, the same way the other admin view tests
// do it, so the marker module is stubbed exactly as lib/auth/dal.test.ts does.
vi.mock('server-only', () => ({}));

import { RposRoster } from './RposRoster';
import { RposDetail } from './RposDetail';
import { query, resetPoolForTests } from '@/lib/db/client';
import { saveOperationalRun } from '@/lib/db/operationalRuns';
import { enrollLearner } from '@/lib/db/rposEnrollments';
import { makeRun } from '@/lib/review/operationalRun.fixture';
import { makePoorRun } from '@/lib/rpos/rpos.fixture';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://responderiq:localdevonly@localhost:5432/responderiq_test';

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${(seq += 1).toString().padStart(12, '0')}`;

const learner = { name: 'Dana Rivera', badgeId: 'B-77' };

async function recordRun(overrides = {}) {
  await saveOperationalRun(makeRun({ ...overrides, evaluationId: uuid(), learner }));
}

describe('RPOS views (integration, real database)', () => {
  beforeAll(() => vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL));
  afterAll(() => {
    vi.unstubAllEnvs();
    resetPoolForTests();
  });
  beforeEach(async () => {
    await query('TRUNCATE operational_runs');
    await query('TRUNCATE rpos_enrollments');
    await query('TRUNCATE rpos_miss_board');
  });

  it('shows an empty roster honestly rather than inventing responders', async () => {
    render(await RposRoster());
    expect(screen.getByText(/No responders are enrolled yet/i)).toBeInTheDocument();
    expect(screen.getByText(/RPOS — EMS Clinical Simulation Trainer/)).toBeInTheDocument();
  });

  it('lists an enrolled responder at level 1 with their patch and next action', async () => {
    await enrollLearner({ badgeId: learner.badgeId, learnerName: learner.name, certification: 'emt' });
    render(await RposRoster());
    expect(screen.getByText(/Dana Rivera/)).toBeInTheDocument();
    // 'EMT' also appears in the enroll form's patch selector, so scope to the row.
    expect(screen.getByRole('link', { name: /Dana Rivera/ })).toHaveTextContent('EMT');
    expect(screen.getByText(/Level 1 — Orientation & Evaluation/)).toBeInTheDocument();
    expect(screen.getByText(/BLUE 0\/5/)).toBeInTheDocument();
  });

  it('builds the streak on the roster as clean cases accumulate', async () => {
    await enrollLearner({ badgeId: learner.badgeId, learnerName: learner.name, certification: 'paramedic' });
    await recordRun();
    await recordRun();
    render(await RposRoster());
    expect(screen.getByText(/BLUE 2\/5/)).toBeInTheDocument();
    expect(screen.getByText(/2 case\(s\)/)).toBeInTheDocument();
  });

  it('shows one responder’s full standing, and syncs their Miss Board from real cases', async () => {
    await enrollLearner({ badgeId: learner.badgeId, learnerName: learner.name, certification: 'paramedic' });
    await recordRun(makePoorRun());
    render(await RposDetail({ badgeId: learner.badgeId }));

    expect(screen.getByLabelText('Current level')).toHaveTextContent('1 — Orientation & Evaluation');
    // The poor run's scene-safety failure is on the board as a critical item.
    expect(screen.getAllByRole('row', { name: /Scene safety/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('alert')).toHaveTextContent(/Blocking advancement/i);
  });

  it('clears a Miss Board entry once a later case retests the subject cleanly', async () => {
    await enrollLearner({ badgeId: learner.badgeId, learnerName: learner.name, certification: 'paramedic' });
    await recordRun(makePoorRun());
    await recordRun(); // a clean run exercises the same categories again
    render(await RposDetail({ badgeId: learner.badgeId }));
    expect(screen.getByText(/Nothing open on the Miss Board/i)).toBeInTheDocument();
  });

  it('reads a responder who has cases but was never enrolled', async () => {
    await saveOperationalRun(makeRun({ evaluationId: uuid(), learner: { name: 'Walk On', badgeId: 'B-88' } }));
    render(await RposDetail({ badgeId: 'B-88' }));
    expect(screen.getByText('Walk On')).toBeInTheDocument();
  });

  it('says plainly when a badge has no responder and no cases', async () => {
    render(await RposDetail({ badgeId: 'B-nobody' }));
    expect(screen.getByText(/No responder on the program matches badge B-nobody/i)).toBeInTheDocument();
  });
});
