'use client';

import { useState } from 'react';
import {
  REFLECTION_QUESTIONS,
  FEEDBACK_QUESTIONS,
  reflectionComplete,
  type ReflectionQuestion,
  type ReflectionResponses,
} from '@/lib/opsim/reflection';
import { buildLearnerDebrief, buildTimeManagement } from '@/lib/review/operationalDebrief';
import { saveCompletedOperationalRun, type SaveOperationalRunResult } from '@/lib/review/operationalActions';
import type { OperationalRun } from '@/lib/review/operationalRun';
import { RonDebrief } from '@/components/RonDebrief/RonDebrief';
import type { RonDebriefRecord } from '@/lib/debrief/ronDebrief';
import styles from './RunComplete.module.css';

/** The run facts captured from the live scenario (everything except identity, reflection, feedback). */
export type RunFacts = Omit<OperationalRun, 'learner' | 'reflection' | 'feedback'>;

type Phase = 'signin' | 'reflection' | 'feedback' | 'ron_debrief' | 'saving' | 'debrief' | 'closing';

interface RunCompleteProps {
  readonly facts: RunFacts;
  readonly saveRun?: (payload: unknown) => Promise<SaveOperationalRunResult>;
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: ReflectionQuestion;
  value: string | number | undefined;
  onChange: (v: string | number) => void;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={`q-${question.id}`}>
        {question.prompt}
        {question.type === 'required_text' && <span className={styles.required}> *</span>}
      </label>
      {question.type === 'scale' && (
        <div className={styles.scale} role="group" aria-label={question.prompt}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`${styles.scaleButton} ${value === n ? styles.selected : ''}`}
              aria-pressed={value === n}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ))}
        </div>
      )}
      {question.type === 'yesno' && (
        <div className={styles.yesno} role="group" aria-label={question.prompt}>
          {['Yes', 'No'].map((opt) => (
            <button
              key={opt}
              type="button"
              className={`${styles.scaleButton} ${value === opt.toLowerCase() ? styles.selected : ''}`}
              style={{ width: 'auto', padding: '0 0.9rem' }}
              aria-pressed={value === opt.toLowerCase()}
              onClick={() => onChange(opt.toLowerCase())}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      {question.type === 'select' && (
        <select id={`q-${question.id}`} className={styles.select} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {question.options?.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )}
      {(question.type === 'text' || question.type === 'required_text') && (
        <textarea id={`q-${question.id}`} className={styles.textarea} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

/**
 * End-of-scenario flow (§23–§27): agency sign-in (name + badge/employee id),
 * then learner reflection FIRST, then simulator feedback. For BLS-01 the old
 * debrief screen is replaced by the AI Ron conversational debrief — the
 * conversation itself (questions about this run's actual choices, transcribed
 * answers, point-by-point assessments) IS the record, saved with the run. The
 * learner never sees a numeric score, band, or pass/fail anywhere.
 */
export function RunComplete({ facts, saveRun = saveCompletedOperationalRun }: RunCompleteProps) {
  const [phase, setPhase] = useState<Phase>('signin');
  const [name, setName] = useState('');
  const [badgeId, setBadgeId] = useState('');
  const [reflection, setReflection] = useState<Record<string, string | number>>({});
  const [feedback, setFeedback] = useState<Record<string, string | number>>({});
  const [payload, setPayload] = useState<OperationalRun | null>(null);
  const [saveResult, setSaveResult] = useState<SaveOperationalRunResult | null>(null);
  const [closingLine, setClosingLine] = useState<string | null>(null);

  const ronDebriefEnabled = facts.scenarioId === 'bls-01';

  async function submit() {
    if (ronDebriefEnabled) {
      // The Ron conversation happens BEFORE the save so its record persists
      // with the run in a single write.
      setPhase('ron_debrief');
      return;
    }
    const full: OperationalRun = {
      ...facts,
      learner: { name: name.trim(), badgeId: badgeId.trim() },
      reflection: reflection as ReflectionResponses,
      feedback: feedback as ReflectionResponses,
    };
    setPayload(full);
    setPhase('saving');
    const result = await saveRun(full);
    setSaveResult(result);
    setPhase('debrief');
  }

  async function finishRonDebrief(record: RonDebriefRecord) {
    const full: OperationalRun = {
      ...facts,
      learner: { name: name.trim(), badgeId: badgeId.trim() },
      reflection: reflection as ReflectionResponses,
      feedback: feedback as ReflectionResponses,
      ronDebrief: {
        entries: record.entries.map((e) => ({
          questionId: e.questionId,
          ronLine: e.ronLine,
          answerTranscript: e.answerTranscript,
          inputMode: e.inputMode,
          assessment: {
            verdict: e.assessment.verdict,
            points: e.assessment.points.map((p) => ({ id: p.id, label: p.label, addressed: p.addressed })),
          },
          ronReply: e.ronReply,
        })),
        closingLine: record.closingLine,
        allSound: record.allSound,
      },
    };
    setPayload(full);
    setClosingLine(record.closingLine);
    setPhase('saving');
    const result = await saveRun(full);
    setSaveResult(result);
    setPhase('closing');
  }

  if (phase === 'signin') {
    const ready = name.trim().length > 0 && badgeId.trim().length > 0;
    return (
      <main>
        <div className={styles.wrap}>
          <div className={styles.card}>
            <h1 className={styles.title}>Agency sign-in</h1>
            <p className={styles.subtitle}>Required for agency runs — your reflection and results are recorded under this identity.</p>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="learner-name">Learner name <span className={styles.required}>*</span></label>
              <input id="learner-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="badge-id">Badge or employee ID <span className={styles.required}>*</span></label>
              <input id="badge-id" className={styles.input} value={badgeId} onChange={(e) => setBadgeId(e.target.value)} />
            </div>
            <button type="button" className={styles.primary} disabled={!ready} onClick={() => setPhase('reflection')}>
              Continue to reflection
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (phase === 'reflection') {
    return (
      <main>
        <div className={styles.wrap}>
          <div className={styles.card}>
            <h1 className={styles.title}>Your reflection</h1>
            <p className={styles.subtitle}>Before we share any coaching — how do you think the call went?</p>
            {REFLECTION_QUESTIONS.map((q) => (
              <QuestionField key={q.id} question={q} value={reflection[q.id]} onChange={(v) => setReflection((r) => ({ ...r, [q.id]: v }))} />
            ))}
            <button type="button" className={styles.primary} disabled={!reflectionComplete(reflection)} onClick={() => setPhase('feedback')}>
              Continue to feedback
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (phase === 'feedback') {
    return (
      <main>
        <div className={styles.wrap}>
          <div className={styles.card}>
            <h1 className={styles.title}>Feedback on ResponderIQ</h1>
            <p className={styles.subtitle}>Now tell us about the simulator itself.</p>
            {FEEDBACK_QUESTIONS.map((q) => (
              <QuestionField key={q.id} question={q} value={feedback[q.id]} onChange={(v) => setFeedback((f) => ({ ...f, [q.id]: v }))} />
            ))}
            <button type="button" className={styles.primary} onClick={submit}>
              Submit &amp; see debrief
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (phase === 'ron_debrief') {
    return (
      <main>
        <div className={styles.wrap}>
          <div className={styles.card}>
            <RonDebrief facts={facts} onFinish={finishRonDebrief} />
          </div>
        </div>
      </main>
    );
  }

  if (phase === 'saving') {
    return (
      <main>
        <div className={styles.wrap}>
          <div className={styles.card}>
            <p className={styles.subtitle}>Saving your run…</p>
          </div>
        </div>
      </main>
    );
  }

  // The BLS-01 close-out after the Ron conversation — no scores, no labels.
  if (phase === 'closing') {
    return (
      <main>
        <div className={styles.wrap}>
          <div className={styles.card}>
            <h1 className={styles.title}>Call cleared</h1>
            {closingLine && <p className={styles.subtitle}>Ron: “{closingLine}”</p>}
            {saveResult?.status === 'persistence_error' && (
              <p className={styles.subtitle}>
                (Your run could not be saved to the agency record — the conversation above was still your
                debrief.)
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Debrief — no score, ever.
  const debrief = payload ? buildLearnerDebrief(payload) : null;
  const time = payload ? buildTimeManagement(payload) : null;
  return (
    <main>
      <div className={styles.wrap}>
        <div className={styles.card}>
          <h1 className={styles.title}>Debrief</h1>
          <p className={styles.subtitle}>Coaching from your actual run. No scores — just what to build on next.</p>
          {saveResult?.status === 'persistence_error' && <p className={styles.subtitle}>(Your run could not be saved to the agency record, but here is your debrief.)</p>}

          {debrief?.criticalNotes.map((note, i) => (
            <div key={i} className={styles.critical}>Safety focus: {note}</div>
          ))}

          {debrief?.sections.map((s) => (
            <div key={s.key} className={styles.debriefSection}>
              <div className={styles.debriefLabel}>{s.label}</div>
              <div className={styles.debriefCoaching}>{s.coaching}</div>
            </div>
          ))}

          {time && (
            <div className={styles.debriefSection}>
              <div className={styles.debriefLabel}>Time management</div>
              <div className={styles.timeLines}>
                {time.lines.map((l, i) => (
                  <span key={i}>{l}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
