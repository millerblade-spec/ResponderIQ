import Link from 'next/link';
import { loadRoster } from '@/lib/rpos/load';
import { EnrollForm } from './EnrollForm';
import styles from './Rpos.module.css';

const CERTIFICATION_LABEL = { emt: 'EMT', paramedic: 'Paramedic' } as const;

/**
 * The RPOS roster: every enrolled responder, their level, and how close they
 * are to advancing — all derived from recorded cases at read time.
 *
 * Degrades to a plain message rather than an error page if the read fails,
 * the same handling the run list uses.
 */
export async function RposRoster() {
  let roster;
  try {
    roster = await loadRoster();
  } catch (error) {
    console.error('Failed to load the RPOS roster:', error);
    return (
      <div className={styles.wrap}>
        <p className={styles.error}>Something went wrong loading the RPOS roster. Please try again.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.heading}>RPOS — EMS Clinical Simulation Trainer</h1>
      <p className={styles.summary}>
        Six levels, from Orientation through CCP Rescue Mode, graded against the current Fort Worth Regional EMS
        System protocols. Advancement takes five consecutive BLUE cases with no critical errors, no unresolved
        critical Miss Board items, and the level’s requirements complete.
      </p>

      <EnrollForm />

      {roster.length === 0 && <p className={styles.empty}>No responders are enrolled yet.</p>}
      <ul className={styles.list}>
        {roster.map(({ enrollment, standing, caseCount, lastCaseAt }) => (
          <li key={enrollment.badgeId}>
            <Link href={`/admin/rpos/${encodeURIComponent(enrollment.badgeId)}`} className={styles.row}>
              <span className={styles.rowMain}>
                {enrollment.learnerName}{' '}
                <span className={styles.rowMeta}>
                  · {enrollment.badgeId} · {CERTIFICATION_LABEL[enrollment.certification]}
                </span>
                <br />
                <span className={styles.rowMeta}>{standing.nextAction}</span>
              </span>
              <span className={styles.rowMeta}>
                Level {standing.level} — {standing.levelTitle}
                <br />
                BLUE {standing.consecutiveBlue}/{standing.requiredConsecutiveBlue} · {caseCount} case(s)
                {standing.openMisses.length > 0 ? ` · ${standing.openMisses.length} open miss(es)` : ''}
                {lastCaseAt ? ` · last ${new Date(lastCaseAt).toLocaleDateString()}` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
