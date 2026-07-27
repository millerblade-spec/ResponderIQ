import Link from 'next/link';
import { listOperationalRuns } from '@/lib/db/operationalRuns';
import styles from './AdminOperational.module.css';

const LIST_LIMIT = 25;

interface AdminOperationalListProps {
  readonly scenarioId: string;
}

/** Administrator learner list for operational runs, newest first (DB-backed). */
export async function AdminOperationalList({ scenarioId }: AdminOperationalListProps) {
  let runs;
  try {
    runs = await listOperationalRuns(scenarioId, LIST_LIMIT);
  } catch (error) {
    console.error('Failed to load operational runs:', error);
    return (
      <div className={styles.wrap}>
        <p className={styles.error}>Something went wrong loading the run list. Please try again.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.heading}>Operational runs — {scenarioId}</h1>
      {runs.length === 0 && <p className={styles.empty}>No operational runs recorded yet.</p>}
      <ul className={styles.list}>
        {runs.map((r) => (
          <li key={r.evaluationId}>
            <Link href={`/admin/runs/${r.evaluationId}`} className={styles.row}>
              <span className={styles.rowMain}>
                {r.learnerName} <span className={styles.rowMeta}>· {r.badgeId}</span>
              </span>
              <span className={styles.rowMeta}>
                {r.difficulty} · attempt {r.attemptNumber} · {new Date(r.createdAt).toLocaleString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
