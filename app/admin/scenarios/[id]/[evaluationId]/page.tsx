import { notFound } from 'next/navigation';
import { AdminReview } from '@/components/AdminReview/AdminReview';
import { AdminHeader } from '@/components/AdminHeader/AdminHeader';
import { verifySession } from '@/lib/auth/dal';

interface AdminReviewPageProps {
  readonly params: Promise<{ id: string; evaluationId: string }>;
}

export default async function AdminReviewPage({ params }: AdminReviewPageProps) {
  const { id, evaluationId } = await params;
  const session = await verifySession(`/admin/scenarios/${id}/${evaluationId}`);

  if (id !== 'bls-01') {
    notFound();
  }

  return (
    <>
      <AdminHeader username={session.username} />
      <AdminReview evaluationId={evaluationId} />
    </>
  );
}
