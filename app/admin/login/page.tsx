import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/dal';
import { LoginForm } from '@/components/LoginForm/LoginForm';
import styles from './login.module.css';

interface AdminLoginPageProps {
  readonly searchParams: Promise<{ readonly next?: string }>;
}

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  // Already signed in? Don't show the login form again -- go straight
  // to where they were headed (or the default admin page).
  const session = await getSession();
  const { next } = await searchParams;

  if (session) {
    redirect(next && next.startsWith('/admin/') ? next : '/admin/scenarios/bls-01');
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.heading}>Admin sign in</h1>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
