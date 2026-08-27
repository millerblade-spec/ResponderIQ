import Link from 'next/link';
import { loadProgramRoster } from '@/lib/rpos/load';
import { RPOS_PROGRAM } from '@/lib/rpos/program';
import { EnrollForm } from './EnrollForm';
import styles from './Program.module.css';

const STATUS_LABEL = {
  not_started: 'Not started',
  in_progress: 'In progress',
  field_ready: 'Field ready',
} as const;

/**
 * The RPOS roster: every enrolled responder with their current standing,
 * evaluated from recorded evidence at read time. Database-backed, and it
 * degrades to a plain message rather than an error page if the read fails —
 * the same handling AdminOperationalList uses.
 */
export async function ProgramRoster() {
  let roster;
  try {
    roster = await loadProgramRoster();
  } catch (error) {
    console.error('Failed to load the program roster:', error);
    return (
      <div className={styles.wrap}>
        <p className={styles.error}>Something went wrong loading the program roster. Please try again.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.heading}>{RPOS_PROGRAM.title}</h1>
      <p className={styles.summary}>{RPOS_PROGRAM.summary}</p>

      <EnrollForm />

      {roster.length === 0 && <p className={styles.empty}>No responders are enrolled yet.</p>}
      <ul className={styles.list}>
        {roster.map(({ enrollment, state, runCount, lastRunAt }) => (
          <li key={enrollment.badgeId}>
            <Link href={`/admin/program/${encodeURIComponent(enrollment.badgeId)}`} className={styles.row}>
              <span className={styles.rowMain}>
                {enrollment.learnerName} <span className={styles.rowMeta}>· {enrollment.badgeId}</span>
                <br />
                <span className={styles.rowMeta}>{state.nextAction}</span>
              </span>
              <span className={styles.rowMeta}>
                {STATUS_LABEL[state.status]} · stage {state.stagesComplete}/{state.stageCount} · {runCount} run(s)
                {lastRunAt ? ` · last ${new Date(lastRunAt).toLocaleDateString()}` : ''}
                {state.openConcerns.length > 0 ? ' · critical concern' : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
