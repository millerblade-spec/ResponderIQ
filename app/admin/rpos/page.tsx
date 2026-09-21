import { RposRoster } from '@/components/Rpos/RposRoster';
import { AdminHeader } from '@/components/AdminHeader/AdminHeader';
import { verifySession } from '@/lib/auth/dal';

/**
 * The RPOS roster. Administrator-only, like every other view that exposes
 * grading — there is no learner-facing standing page, and adding one would put
 * band history and the Miss Board in front of learners.
 */
export default async function AdminRposPage() {
  const session = await verifySession('/admin/rpos');
  return (
    <>
      <AdminHeader username={session.username} />
      <RposRoster />
    </>
  );
}
