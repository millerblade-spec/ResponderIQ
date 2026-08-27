import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// lib/rpos/load.ts is server-only (it reads the database). The test renders
// these server components directly, the same way the other admin view tests
// do, so the marker module is stubbed exactly as lib/auth/dal.test.ts does.
vi.mock('server-only', () => ({}));

import { ProgramRoster } from './ProgramRoster';
import { ProgramDetail } from './ProgramDetail';
import { query, resetPoolForTests } from '@/lib/db/client';
import { saveOperationalRun } from '@/lib/db/operationalRuns';
import { recordTruckCheckAttempt } from '@/lib/db/truckCheckAttempts';
import { enrollLearner } from '@/lib/db/programEnrollments';
import { RPOS_PROGRAM } from '@/lib/rpos/program';
import { makeRun } from '@/lib/review/operationalRun.fixture';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://responderiq:localdevonly@localhost:5432/responderiq_test';

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${(seq += 1).toString().padStart(12, '0')}`;

async function completeTruckCheck(learnerId: string) {
  await recordTruckCheckAttempt({
    learnerId,
    scenarioId: 'bls-01',
    outcome: 'truck_check',
    mandatory: true,
    forcedCheck: false,
  });
}

describe('RPOS program views (integration, real database)', () => {
  beforeAll(() => vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL));
  afterAll(() => {
    vi.unstubAllEnvs();
    resetPoolForTests();
  });
  beforeEach(async () => {
    await query('TRUNCATE operational_runs');
    await query('TRUNCATE truck_check_attempts');
    await query('TRUNCATE program_enrollments');
  });

  it('shows an empty roster honestly rather than inventing responders', async () => {
    render(await ProgramRoster());
    expect(screen.getByText(/No responders are enrolled yet/i)).toBeInTheDocument();
    expect(screen.getByText(RPOS_PROGRAM.title)).toBeInTheDocument();
  });

  it('lists an enrolled responder with the next action derived from their real evidence', async () => {
    await enrollLearner({ programId: RPOS_PROGRAM.id, learnerName: 'Dana Rivera', badgeId: 'B-77' });
    render(await ProgramRoster());
    expect(screen.getByText(/Dana Rivera/)).toBeInTheDocument();
    // No Truck Check on record yet, so that is the next action.
    expect(screen.getByText(/Shift Readiness: complete a full truck check/i)).toBeInTheDocument();
  });

  it('advances a responder’s roster standing as real evidence accumulates', async () => {
    await enrollLearner({ programId: RPOS_PROGRAM.id, learnerName: 'Dana Rivera', badgeId: 'B-77' });
    await completeTruckCheck('B-77');
    await saveOperationalRun(makeRun({ evaluationId: uuid(), learner: { name: 'Dana Rivera', badgeId: 'B-77' } }));
    render(await ProgramRoster());
    expect(screen.getByText(/1 run\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/In progress/)).toBeInTheDocument();
  });

  it('reaches field ready on the roster after two clean passing runs', async () => {
    await enrollLearner({ programId: RPOS_PROGRAM.id, learnerName: 'Dana Rivera', badgeId: 'B-77' });
    await completeTruckCheck('B-77');
    await saveOperationalRun(makeRun({ evaluationId: uuid(), learner: { name: 'Dana Rivera', badgeId: 'B-77' } }));
    await saveOperationalRun(makeRun({ evaluationId: uuid(), learner: { name: 'Dana Rivera', badgeId: 'B-77' } }));
    render(await ProgramRoster());
    expect(screen.getByText(/Field ready/)).toBeInTheDocument();
  });

  it('shows one responder’s full standing from their badge id', async () => {
    await enrollLearner({ programId: RPOS_PROGRAM.id, learnerName: 'Dana Rivera', badgeId: 'B-77' });
    await completeTruckCheck('B-77');
    await saveOperationalRun(makeRun({ evaluationId: uuid(), learner: { name: 'Dana Rivera', badgeId: 'B-77' } }));
    render(await ProgramDetail({ badgeId: 'B-77' }));
    expect(screen.getByLabelText('Program standing')).toHaveTextContent('In progress');
    expect(screen.getByText('Competencies')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Scene safety/i })).toBeInTheDocument();
  });

  it('reads a responder who has runs but was never enrolled', async () => {
    await saveOperationalRun(makeRun({ evaluationId: uuid(), learner: { name: 'Walk On', badgeId: 'B-88' } }));
    render(await ProgramDetail({ badgeId: 'B-88' }));
    // The name comes from the run they signed, since there is no roster entry.
    expect(screen.getByText('Walk On')).toBeInTheDocument();
  });

  it('says plainly when a badge has no responder and no runs', async () => {
    render(await ProgramDetail({ badgeId: 'B-nobody' }));
    expect(screen.getByText(/No responder on the program matches badge B-nobody/i)).toBeInTheDocument();
  });
});
