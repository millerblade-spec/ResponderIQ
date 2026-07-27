import { AdminOperationalDetail } from '@/components/AdminOperational/AdminOperationalDetail';
import { AdminHeader } from '@/components/AdminHeader/AdminHeader';
import { verifySession } from '@/lib/auth/dal';

interface AdminRunPageProps {
  readonly params: Promise<{ id: string }>;
}

/** Administrator detail for one operational run. Gated by verifySession(). */
export default async function AdminRunPage({ params }: AdminRunPageProps) {
  const { id } = await params;
  const session = await verifySession(`/admin/runs/${id}`);
  return (
    <>
      <AdminHeader username={session.username} />
      <AdminOperationalDetail evaluationId={id} />
    </>
  );
}
