import { notFound } from 'next/navigation';
import { OperationalSim } from '@/components/OperationalSim/OperationalSim';

interface ScenarioPageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ level?: string }>;
}

/**
 * The operational simulator experience (§7–§9 and onward). The earlier
 * turn-based SimulatorPlayer remains in the codebase (and its tests still run);
 * this route now runs the real-time operational sequence.
 */
export default async function ScenarioPage({ params, searchParams }: ScenarioPageProps) {
  const { id } = await params;
  const { level } = await searchParams;

  if (id !== 'bls-01') {
    notFound();
  }

  return <OperationalSim scenarioId={id} level={level === 'advanced' ? 'advanced' : 'orientation'} />;
}
