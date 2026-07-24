import { logout } from '@/app/admin/login/actions';
import styles from './AdminHeader.module.css';

interface AdminHeaderProps {
  readonly username: string;
}

export function AdminHeader({ username }: AdminHeaderProps) {
  return (
    <form action={logout} className={styles.bar}>
      <span className={styles.signedInAs}>Signed in as {username}</span>
      <button type="submit" className={styles.signOutButton}>
        Sign out
      </button>
    </form>
  );
}
