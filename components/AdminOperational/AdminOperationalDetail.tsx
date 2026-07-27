import { getOperationalRun, listLearnerAttempts } from '@/lib/db/operationalRuns';
import { computeOperationalScore, computeProgress } from '@/lib/review/operationalScoring';
import { taskDef } from '@/lib/opsim/crew';
import { clinicalAction } from '@/lib/opsim/clinical';
import { bls01Differentials } from '@/lib/scenarios/bls-01.dispatch';
import styles from './AdminOperational.module.css';

interface AdminOperationalDetailProps {
  readonly evaluationId: string;
}

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const diffLabel = (id: string) => bls01Differentials.find((d) => d.id === id)?.label ?? id;

/**
 * Administrator run detail (§27, §28): the numeric score and band, pass/fail,
 * category performance, critical safety concerns (always shown, never erased by
 * a passing score), the operational timeline, clinical findings, reflection,
 * feedback, and progress across attempts.
 */
export async function AdminOperationalDetail({ evaluationId }: AdminOperationalDetailProps) {
  let stored;
  try {
    stored = await getOperationalRun(evaluationId);
  } catch (error) {
    console.error('Failed to load operational run:', error);
    return <div className={styles.wrap}><p className={styles.error}>Something went wrong loading this run.</p></div>;
  }
  if (!stored) return <div className={styles.wrap}><p className={styles.empty}>No run found for this id.</p></div>;

  const run = stored.run;
  const score = computeOperationalScore(run);

  let attempts: readonly { run: typeof run }[] = [];
  try {
    attempts = await listLearnerAttempts(run.learner.badgeId, run.scenarioId);
  } catch {
    attempts = [];
  }
  const progress = computeProgress(attempts.map((a) => computeOperationalScore(a.run).score));

  return (
    <div className={styles.wrap}>
      <h1 className={styles.heading}>{run.learner.name} — {run.scenarioId}</h1>

      <div className={styles.meta}>
        <div className={styles.metaItem}><span className={styles.metaLabel}>Badge / employee ID</span>{run.learner.badgeId}</div>
        <div className={styles.metaItem}><span className={styles.metaLabel}>Difficulty</span>{run.difficulty}</div>
        <div className={styles.metaItem}><span className={styles.metaLabel}>Attempt</span>#{stored.attemptNumber}</div>
        <div className={styles.metaItem}><span className={styles.metaLabel}>Completion time</span>{fmt(run.timeMetrics.totalSeconds)}</div>
      </div>

      <div className={styles.scoreBox}>
        <span className={styles.scoreNumber} aria-label="Administrator score">{score.score}</span>
        <span>/ 100</span>
        <span className={styles.scoreBand}>{score.band?.label}</span>
        <span className={score.passed ? styles.pass : styles.fail}>{score.passed ? 'PASS' : 'DOES NOT MEET STANDARD'}</span>
      </div>

      {score.criticalConcerns.length > 0 && (
        <div className={styles.critical}>
          Critical Safety Concern Recorded
          <ul className={styles.criticalList}>
            {score.criticalConcerns.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Category performance</div>
        {score.categories.map((c) => (
          <div key={c.key} className={styles.catRow}>
            <span>{c.label} <span className={styles.rowMeta}>— {c.note}</span></span>
            <span className={styles.catPoints}>{c.points}/{c.max}</span>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Progress across attempts</div>
        <p className={styles.progress}>
          {progress.attempts} attempt(s); scores {progress.scores.join(' → ')}.{' '}
          {progress.improvement != null ? `Change from first: ${progress.improvement > 0 ? '+' : ''}${progress.improvement} (${progress.trend}).` : 'First attempt.'}
        </p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Operational timeline — crew</div>
        {run.crew.assignments.length === 0 && <p className={styles.rowMeta}>No task assignments recorded.</p>}
        {run.crew.assignments.map((a, i) => (
          <div key={i} className={styles.kv}>
            <span className={styles.kvKey}>{a.responderId}: </span>
            {taskDef(a.taskId)?.label ?? a.taskId} — {a.status} (started {fmt(a.startedAtSecond)}{a.completedAtSecond != null ? `, done ${fmt(a.completedAtSecond)}` : ''})
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Clinical findings obtained</div>
        {run.clinical.findingsObtained.length === 0 && <p className={styles.rowMeta}>None obtained.</p>}
        {run.clinical.findingsObtained.map((id) => (
          <div key={id} className={styles.kv}>{clinicalAction(id)?.label ?? id}</div>
        ))}
        <div className={styles.kv}>
          <span className={styles.kvKey}>Reassessments:</span> {run.clinical.reassessments}
          {run.clinical.deteriorationOccurred && ` · deterioration ${run.clinical.deteriorationRecognized ? 'recognized' : 'MISSED'}`}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Working differential</div>
        <div className={styles.kv}>Initial: {run.differential.initial.map(diffLabel).join(' · ') || '—'}</div>
        <div className={styles.kv}>Revisions recorded: {run.differential.revisions.length}</div>
        <div className={styles.kv}>Final working impression: {run.differential.workingImpression ? diffLabel(run.differential.workingImpression) : '—'}</div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Learner reflection</div>
        {Object.entries(run.reflection).map(([k, v]) => (
          <div key={k} className={styles.kv}><span className={styles.kvKey}>{k}:</span> {String(v)}</div>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Simulator feedback</div>
        {Object.entries(run.feedback).map(([k, v]) => (
          <div key={k} className={styles.kv}><span className={styles.kvKey}>{k}:</span> {String(v)}</div>
        ))}
      </div>
    </div>
  );
}
