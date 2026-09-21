import Link from 'next/link';
import { logout } from '@/app/admin/login/actions';
import styles from './AdminHeader.module.css';

interface AdminHeaderProps {
  readonly username: string;
}

/**
 * The bar every administrator page shares. It carries the navigation between
 * the two administrator views that exist — the run list (one call at a time)
 * and the RPOS program (one responder across levels) — because they answer
 * different questions about the same data and a training officer moves
 * between them constantly.
 */
export function AdminHeader({ username }: AdminHeaderProps) {
  return (
    <div className={styles.bar}>
      <nav className={styles.nav}>
        <Link href="/admin/runs" className={styles.navLink}>
          Runs
        </Link>
        <Link href="/admin/rpos" className={styles.navLink}>
          RPOS
        </Link>
      </nav>
      <form action={logout} className={styles.signOutForm}>
        <span className={styles.signedInAs}>Signed in as {username}</span>
        <button type="submit" className={styles.signOutButton}>
          Sign out
        </button>
      </form>
    </div>
  );
}
