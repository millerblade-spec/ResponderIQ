import { ProgramDetail } from '@/components/Program/ProgramDetail';
import { AdminHeader } from '@/components/AdminHeader/AdminHeader';
import { verifySession } from '@/lib/auth/dal';

interface AdminProgramLearnerPageProps {
  readonly params: Promise<{ badgeId: string }>;
}

/** One responder's RPOS standing. Gated by verifySession(). */
export default async function AdminProgramLearnerPage({ params }: AdminProgramLearnerPageProps) {
  const { badgeId } = await params;
  const decoded = decodeURIComponent(badgeId);
  const session = await verifySession(`/admin/program/${badgeId}`);
  return (
    <>
      <AdminHeader username={session.username} />
      <ProgramDetail badgeId={decoded} />
    </>
  );
}
