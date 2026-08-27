import { ProgramRoster } from '@/components/Program/ProgramRoster';
import { AdminHeader } from '@/components/AdminHeader/AdminHeader';
import { verifySession } from '@/lib/auth/dal';

/**
 * The RPOS program roster. Administrator-only, like every other view that
 * exposes scored performance — there is no learner-facing program page, and
 * adding one would put derived scores in front of learners.
 */
export default async function AdminProgramPage() {
  const session = await verifySession('/admin/program');
  return (
    <>
      <AdminHeader username={session.username} />
      <ProgramRoster />
    </>
  );
}
