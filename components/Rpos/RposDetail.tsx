import Link from 'next/link';
import { loadLearnerStanding } from '@/lib/rpos/load';
import { LevelStandingView } from './LevelStandingView';
import { AdvanceForm } from './AdvanceForm';
import styles from './Rpos.module.css';

interface RposDetailProps {
  readonly badgeId: string;
}

/**
 * One responder's RPOS standing. An unknown badge is a clean message rather
 * than a 404: a training officer typing a badge with no evidence yet should be
 * told exactly that.
 */
export async function RposDetail({ badgeId }: RposDetailProps) {
  let standing;
  try {
    standing = await loadLearnerStanding(badgeId);
  } catch (error) {
    console.error('Failed to load the RPOS standing:', error);
    return (
      <div className={styles.wrap}>
        <p className={styles.error}>Something went wrong loading this responder’s standing. Please try again.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <Link href="/admin/rpos" className={styles.backLink}>
        ← RPOS roster
      </Link>
      {standing ? (
        <>
          <LevelStandingView standing={standing} />
          {standing.nextLevel != null && (
            <>
              <h2 className={styles.sectionHeading}>Advancement</h2>
              <AdvanceForm
                badgeId={standing.learner.badgeId}
                nextLevel={standing.nextLevel}
                eligible={standing.eligibleToAdvance}
              />
            </>
          )}
        </>
      ) : (
        <p className={styles.empty}>
          No responder on the program matches badge {badgeId}, and no cases have been recorded under it.
        </p>
      )}
    </div>
  );
}
