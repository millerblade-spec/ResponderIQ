import Link from 'next/link';
import { loadLearnerProgram } from '@/lib/rpos/load';
import { ProgramStanding } from './ProgramStanding';
import styles from './Program.module.css';

interface ProgramDetailProps {
  readonly badgeId: string;
}

/**
 * One responder's RPOS standing. An unknown badge is a clean message rather
 * than a 404: a training officer typing a badge that has no evidence yet
 * should be told exactly that.
 */
export async function ProgramDetail({ badgeId }: ProgramDetailProps) {
  let state;
  try {
    state = await loadLearnerProgram(badgeId);
  } catch (error) {
    console.error('Failed to load the program state:', error);
    return (
      <div className={styles.wrap}>
        <p className={styles.error}>Something went wrong loading this responder’s program. Please try again.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <Link href="/admin/program" className={styles.backLink}>
        ← Program roster
      </Link>
      {state ? (
        <ProgramStanding state={state} />
      ) : (
        <p className={styles.empty}>
          No responder on the program matches badge {badgeId}, and no runs have been recorded under it.
        </p>
      )}
    </div>
  );
}
