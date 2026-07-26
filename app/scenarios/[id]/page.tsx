import { notFound } from 'next/navigation';
import { ScenarioRunner } from '@/components/ShiftStart/ScenarioRunner';
import { getTruckCheckStatus } from '@/lib/db/truckCheckAttempts';
import { PROVISIONAL_LEARNER_ID } from '@/lib/opsim/constants';

interface ScenarioPageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ level?: string; learner?: string; shift?: string; scene?: string }>;
}

/**
 * Scenario entry: the start-of-shift Truck Check / quiz (§4), then the
 * operational sequence (§7+). "First shift" is derived from the DB-backed
 * truck-check status (never localStorage). If the database is unavailable
 * (e.g. a local demo build without DATABASE_URL), it degrades safely to a
 * mandatory first-shift Truck Check rather than failing the page.
 *
 * The learner id is provisional until the agency sign-in slice (§27).
 */
export default async function ScenarioPage({ params, searchParams }: ScenarioPageProps) {
  const { id } = await params;
  const { level, learner, shift, scene } = await searchParams;

  if (id !== 'bls-01') {
    notFound();
  }

  const learnerId = learner?.trim() || PROVISIONAL_LEARNER_ID;

  let isFirstShift = true;
  try {
    const status = await getTruckCheckStatus(learnerId);
    isFirstShift = !status.hasCompletedTruckCheck;
  } catch {
    // No database available — treat as a first shift (mandatory Truck Check).
    isFirstShift = true;
  }

  // Screenshot/demo-only affordance for exercising the later-shift path without
  // a database. Off unless ALLOW_DEMO_SHIFT=1 is set in the environment, so it
  // can never change behavior in a normal deployment.
  const demo = process.env.ALLOW_DEMO_SHIFT === '1';
  if (demo && shift === 'later') {
    isFirstShift = false;
  }
  const sceneVariant = demo && scene === 'security' ? 'security' : 'normal';

  return (
    <ScenarioRunner
      scenarioId={id}
      level={level === 'advanced' ? 'advanced' : 'orientation'}
      isFirstShift={isFirstShift}
      learnerId={learnerId}
      sceneVariant={sceneVariant}
    />
  );
}
