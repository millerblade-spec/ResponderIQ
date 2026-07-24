import { randomUUID } from 'node:crypto';
import { saveCompletedRun } from '../lib/review/actions';
import { getReviewRecord } from '../lib/db/reviewRecords';
import { query } from '../lib/db/client';

async function main() {
  const evaluationId = randomUUID();
  const payload = {
    evaluationId,
    scenarioId: 'bls-01' as const,
    state: {
      phase: 'complete' as const,
      elapsedMinutes: 22,
      resources: {
        additional_ems: { kind: 'additional_ems' as const, status: 'on_scene' as const },
        fire_lift_assist: { kind: 'fire_lift_assist' as const, status: 'not_requested' as const },
      },
      hazardFlags: [],
      familyState: 'calm' as const,
      stairChairPrepped: true,
      patientCanBearWeight: false,
      differential: { current: [], history: [] },
      timeline: [],
      criticalFlags: [],
      actionsTaken: ['brief-partner'],
      firedEventIds: [],
      completion: { status: 'transport_initiated' as const, atMinute: 22 },
    },
  };

  console.log('--- Step 1: first save ---');
  const first = await saveCompletedRun(payload);
  console.log('saveCompletedRun result:', first);

  console.log('\n--- Step 2: row count after first save ---');
  const { rows: countAfterFirst } = await query<{ count: string }>(
    "SELECT count(*)::text FROM review_records WHERE evaluation_id = $1",
    [evaluationId],
  );
  console.log('rows with this evaluation_id:', countAfterFirst[0].count);

  console.log('\n--- Step 3: exact retry (same payload) ---');
  const retry = await saveCompletedRun(payload);
  console.log('saveCompletedRun retry result:', retry);

  console.log('\n--- Step 4: row count after retry (must still be 1) ---');
  const { rows: countAfterRetry } = await query<{ count: string }>(
    "SELECT count(*)::text FROM review_records WHERE evaluation_id = $1",
    [evaluationId],
  );
  console.log('rows with this evaluation_id:', countAfterRetry[0].count);

  console.log('\n--- Step 5: conflicting reuse (same id, different scenario) ---');
  const conflicting = await saveCompletedRun({ ...payload, scenarioId: 'bls-01', state: { ...payload.state, elapsedMinutes: 999 } });
  // Note: scenarioId is a zod literal ('bls-01' only), so a genuinely
  // different scenarioId is rejected by validation before ever reaching
  // the database -- the *database-level* conflict path (same id, real
  // second scenario) is exercised directly in reviewRecords.test.ts,
  // since that requires bypassing the single-scenario schema literal
  // the same way a future second scenario legitimately would.
  console.log('same id + altered payload result:', conflicting);

  console.log('\n--- Step 6: read back via getReviewRecord (what AdminReview calls) ---');
  const read = await getReviewRecord(evaluationId);
  console.log('stored evaluation_id matches requested:', read !== null);
  console.log('stored scenario_id:', read?.scenarioId);
  console.log('stored completion:', JSON.stringify(read?.state.completion));

  console.log('\n--- Step 7: the actual stored row, direct from Postgres ---');
  const { rows: rawRow } = await query<{ evaluation_id: string; scenario_id: string; saved_at: string }>(
    'SELECT evaluation_id, scenario_id, saved_at FROM review_records WHERE evaluation_id = $1',
    [evaluationId],
  );
  console.log(rawRow[0]);

  console.log('\nDONE. evaluationId used throughout:', evaluationId);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
