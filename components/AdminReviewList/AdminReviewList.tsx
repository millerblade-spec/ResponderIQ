import Link from 'next/link';
import { listReviewRecords } from '@/lib/db/reviewRecords';
import styles from './AdminReviewList.module.css';

/** Bounded on purpose -- requirement 5 explicitly says don't load unbounded rows. Not paginated: a "load more" isn't needed yet at this scale. */
const LIST_LIMIT = 20;

interface AdminReviewListProps {
  readonly scenarioId: string;
}

export async function AdminReviewList({ scenarioId }: AdminReviewListProps) {
  let records;
  try {
    records = await listReviewRecords(scenarioId, LIST_LIMIT);
  } catch (error) {
    console.error('Failed to load review list:', error);
    return (
      <div className={styles.wrap}>
        <p className={styles.error}>Something went wrong loading the review list. Please try again.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.heading}>Completed runs \u2014 {scenarioId}</h1>
      {records.length === 0 && <p className={styles.empty}>No completed runs yet.</p>}
      {records.length > 0 && (
        <ul className={styles.list}>
          {records.map((record) => (
            <li key={record.evaluationId}>
              <Link href={`/admin/scenarios/${scenarioId}/${record.evaluationId}`} className={styles.link}>
                {new Date(record.savedAt).toLocaleString()}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
