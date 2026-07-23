import { notFound } from 'next/navigation';
import { AdminReviewList } from '@/components/AdminReviewList/AdminReviewList';
import { AdminHeader } from '@/components/AdminHeader/AdminHeader';
import { verifySession } from '@/lib/auth/dal';

interface AdminScenarioPageProps {
  readonly params: Promise<{ id: string }>;
}

/**
 * Lists completed runs for a scenario, newest first, from Postgres.
 * Gated by verifySession() -- see lib/auth/dal.ts.
 */
export default async function AdminScenarioPage({ params }: AdminScenarioPageProps) {
  const { id } = await params;
  const session = await verifySession(`/admin/scenarios/${id}`);

  if (id !== 'bls-01') {
    notFound();
  }

  return (
    <>
      <AdminHeader username={session.username} />
      <AdminReviewList scenarioId={id} />
    </>
  );
}
