import { AdminOperationalList } from '@/components/AdminOperational/AdminOperationalList';
import { AdminHeader } from '@/components/AdminHeader/AdminHeader';
import { verifySession } from '@/lib/auth/dal';

/** Administrator list of operational runs. Gated by verifySession(). */
export default async function AdminRunsPage() {
  const session = await verifySession('/admin/runs');
  return (
    <>
      <AdminHeader username={session.username} />
      <AdminOperationalList scenarioId="bls-01" />
    </>
  );
}
