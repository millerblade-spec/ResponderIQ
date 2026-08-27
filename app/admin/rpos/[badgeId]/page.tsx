import { RposDetail } from '@/components/Rpos/RposDetail';
import { AdminHeader } from '@/components/AdminHeader/AdminHeader';
import { verifySession } from '@/lib/auth/dal';

interface AdminRposLearnerPageProps {
  readonly params: Promise<{ badgeId: string }>;
}

/** One responder's RPOS standing. Gated by verifySession(). */
export default async function AdminRposLearnerPage({ params }: AdminRposLearnerPageProps) {
  const { badgeId } = await params;
  const decoded = decodeURIComponent(badgeId);
  const session = await verifySession(`/admin/rpos/${badgeId}`);
  return (
    <>
      <AdminHeader username={session.username} />
      <RposDetail badgeId={decoded} />
    </>
  );
}
