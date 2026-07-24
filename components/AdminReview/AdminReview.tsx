import { z } from 'zod';
import { bls01 } from '@/lib/scenarios/bls-01';
import { computeHiddenSummary } from '@/lib/engine/scoring';
import { buildDebrief } from '@/lib/engine/debrief';
import { getReviewRecord } from '@/lib/db/reviewRecords';
import type { ReviewableSceneState } from '@/lib/review/schema';
import type { SceneState } from '@/lib/engine/types';
import styles from './AdminReview.module.css';

const uuidSchema = z.string().uuid();

interface AdminReviewProps {
  readonly evaluationId: string;
}

/**
 * Reads one saved review record from Postgres by evaluationId. A plain
 * async Server Component, not a Client Component -- there's no reactive
 * browser API to subscribe to anymore (that was localStorage's job);
 * this is a per-request server fetch, the same as any other page data.
 */
export async function AdminReview({ evaluationId }: AdminReviewProps) {
  if (!uuidSchema.safeParse(evaluationId).success) {
    return (
      <main className={styles.wrap}>
        <Disclaimer />
        <p>This review id isn&apos;t valid.</p>
      </main>
    );
  }

  let record;
  try {
    record = await getReviewRecord(evaluationId);
  } catch (error) {
    // Real cause stays server-side only -- never forwarded to the page.
    console.error('Failed to load review record:', error);
    return (
      <main className={styles.wrap}>
        <Disclaimer />
        <p>Something went wrong loading this review. Please try again.</p>
      </main>
    );
  }

  return (
    <main className={styles.wrap}>
      <Disclaimer />
      {record === null && <p>No review record found for this id.</p>}
      {record !== null && <ReviewContent state={record.state} savedAt={record.savedAt} />}
    </main>
  );
}

function Disclaimer() {
  return (
    <div className={styles.disclaimer}>
      <h1>Administrator Review</h1>
      <p>
        Backed by the database \u2014 any signed-in administrator can see this from any browser or
        device, not just the one the run was completed on.
      </p>
    </div>
  );
}

function ReviewContent({ state, savedAt }: { readonly state: ReviewableSceneState; readonly savedAt: string }) {
  // computeHiddenSummary/buildDebrief are typed against the full, live
  // SceneState (which includes dynamicEvents), but neither actually
  // reads that field -- it's scheduling state for gameplay still in
  // progress, irrelevant to scoring a finished run. Supplying an empty
  // one here is a safe local bridge, not a change to those functions.
  const fullState: SceneState = { ...state, dynamicEvents: [] };
  const summary = computeHiddenSummary(fullState, bls01);
  const debrief = buildDebrief(fullState);

  return (
    <>
      <section className={styles.section}>
        <h2>Completion</h2>
        <p>Status: {state.completion?.status ?? 'not completed'} at minute {state.completion?.atMinute ?? '\u2014'}</p>
        <p className={styles.hint}>Saved {new Date(savedAt).toLocaleString()}</p>
      </section>

      <section className={styles.section}>
        <h2>Critical safety flags ({state.criticalFlags.length})</h2>
        {state.criticalFlags.length === 0 && <p>None.</p>}
        {state.criticalFlags.map((flag) => (
          <div key={flag.id} className={styles.flag}>
            <p><strong>At minute {flag.atMinute}:</strong> {flag.whatHappened}</p>
            <p>{flag.whyDangerous}</p>
            <p>Consequence: {flag.consequence}</p>
            <p>Safer alternative: {flag.saferAlternative}</p>
            <p>Acknowledged by learner: {flag.acknowledged ? 'yes' : 'no'}</p>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2>Hidden category scoring</h2>
        <table className={styles.table}>
          <thead>
            <tr><th>Category</th><th>Positive</th><th>Notable</th><th>Minor</th><th>Critical</th></tr>
          </thead>
          <tbody>
            {Object.entries(summary.categoryTally).map(([category, tally]) => (
              <tr key={category}>
                <td>{category.replace(/_/g, ' ')}</td>
                <td>{tally.positive}</td>
                <td>{tally.notable}</td>
                <td>{tally.minor}</td>
                <td>{tally.critical}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.section}>
        <h2>Behavioral tags</h2>
        <p>Demonstrated: {summary.behavioralTagsDemonstrated.join(', ') || 'none'}</p>
        <p>Missed (relevant to this scenario): {summary.behavioralTagsMissed.join(', ') || 'none'}</p>
      </section>

      <section className={styles.section}>
        <h2>Operational differential history</h2>
        {state.differential.history.length === 0 && <p>Never updated.</p>}
        {state.differential.history.map((entry, i) => (
          <p key={i}>At minute {entry.atMinute}: {entry.reads.join(', ')} {entry.reason && `\u2014 ${entry.reason}`}</p>
        ))}
      </section>

      <section className={styles.section}>
        <h2>Resources</h2>
        {Object.values(state.resources).map((r) => (
          <p key={r.kind}>
            {r.kind.replace(/_/g, ' ')}: {r.status.replace(/_/g, ' ')}
            {r.requestedAtMinute !== undefined && ` \u2014 requested at minute ${r.requestedAtMinute}, ETA ${r.etaMinutes} min, arrival minute ${r.arrivesAtMinute}`}
          </p>
        ))}
      </section>

      <section className={styles.section}>
        <h2>Full timeline</h2>
        <p className={styles.hint}>Every entry includes the actions actually available at that moment, not just the one chosen.</p>
        <ol className={styles.timeline}>
          {state.timeline.map((entry, i) => (
            <li key={i} className={styles.timelineEntry}>
              <span className={styles.timeStamp}>t+{entry.atMinute}m</span>
              <span className={styles.entryKind}>[{entry.kind}]</span>
              <span>{entry.label}</span>
              {entry.detail && <div className={styles.detail}>{entry.detail}</div>}
              {entry.chosenActionId && entry.availableActionIds && entry.availableActionIds.length > 1 && (
                <div className={styles.detail}>
                  Also available: {entry.availableActionIds.filter((id) => id !== entry.chosenActionId).join(', ')}
                </div>
              )}
              {entry.observations && entry.observations.length > 0 && (
                <div className={styles.observations}>
                  {entry.observations.map((o, oi) => (
                    <div key={oi}>[{o.category} / {o.severity}{o.tag ? ` / ${o.tag}` : ''}] {o.note}</div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section}>
        <h2>Evidence behind the learner debrief</h2>
        <p><strong>Headline shown to learner:</strong> {debrief.headline}</p>
        <p><strong>Strengths shown</strong> ({debrief.strengths.length}) are drawn from the positive-severity observations above that carry learner-facing text.</p>
        <p><strong>Missed opportunities shown</strong> ({debrief.missedOpportunities.length}) are drawn from the notable/minor-severity observations above that carry learner-facing text.</p>
      </section>
    </>
  );
}
