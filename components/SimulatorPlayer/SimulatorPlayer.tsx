'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { bls01, getSceneNarrative } from '@/lib/scenarios/bls-01';
import { applyAction, acknowledge, getAvailableActions } from '@/lib/engine/reducer';
import { acknowledgeCriticalFlag, allCriticalFlagsAcknowledged } from '@/lib/engine/scoring';
import { buildDebrief } from '@/lib/engine/debrief';
import { saveCompletedRun } from '@/lib/review/actions';
import { toReviewablePayload } from '@/lib/review/toReviewablePayload';
import type { SceneState } from '@/lib/engine/types';
import styles from './SimulatorPlayer.module.css';

/** Local-browser-only storage key. Never sent anywhere; only readable in this same browser. */
export const LOCAL_ADMIN_REVIEW_STORAGE_KEY = 'responderiq:local-admin-review:bls-01';

const RESOURCE_LABELS = {
  additional_ems: 'Additional EMS unit',
  fire_lift_assist: 'Fire department (lift assist)',
} as const;

export function SimulatorPlayer() {
  const [state, setState] = useState<SceneState>(() => bls01.buildInitialState());
  const [saveResult, setSaveResult] = useState<'unset' | 'success' | 'failure'>('unset');
  const [isPending, startTransition] = useTransition();

  const missionComplete = bls01.isComplete(state);
  const fullyClosed = missionComplete && allCriticalFlagsAcknowledged(state);

  // Generated exactly once -- the render where fullyClosed first becomes
  // true is the same render this memo recomputes on, and it never
  // recomputes again afterward since fullyClosed doesn't revert to
  // false. This is what makes a retry reuse the same id rather than
  // creating a new database row per attempt.
  const evaluationId = useMemo(() => (fullyClosed ? crypto.randomUUID() : null), [fullyClosed]);

  const runSave = useCallback(
    (id: string, currentState: SceneState) => {
      startTransition(async () => {
        try {
          const result = await saveCompletedRun({
            evaluationId: id,
            scenarioId: bls01.id,
            state: toReviewablePayload(currentState),
          });
          setSaveResult(result.status === 'saved' || result.status === 'already_saved' ? 'success' : 'failure');
        } catch {
          setSaveResult('failure');
        }
      });
    },
    [startTransition],
  );

  // Once the mission is fully closed (complete and every critical flag
  // acknowledged): keep a same-browser local recovery copy (unchanged
  // from before) and make the first real save attempt. state is a
  // genuine dependency here, but in practice it stops changing once
  // fullyClosed is true (no further setState calls touch it from this
  // point on), so this does not re-fire on every render.
  useEffect(() => {
    if (!fullyClosed || !evaluationId) return;
    try {
      window.localStorage.setItem(LOCAL_ADMIN_REVIEW_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage can fail (private browsing, quota). The learner experience doesn't depend on it.
    }
    runSave(evaluationId, state);
  }, [fullyClosed, evaluationId, state, runSave]);

  function handleRetry() {
    if (evaluationId) runSave(evaluationId, state);
  }

  if (missionComplete) {
    const unacknowledged = state.criticalFlags.filter((flag) => !flag.acknowledged);
    if (unacknowledged.length > 0) {
      const flag = unacknowledged[0];
      return (
        <main className={styles.wrap}>
          <div className={styles.criticalCard}>
            <h1 className={styles.criticalHeading}>Critical safety flag</h1>
            <p><strong>What happened:</strong> {flag.whatHappened}</p>
            <p><strong>Why it was dangerous:</strong> {flag.whyDangerous}</p>
            <p><strong>What resulted:</strong> {flag.consequence}</p>
            <p><strong>Safer alternative:</strong> {flag.saferAlternative}</p>
            <button
              className={styles.primaryButton}
              onClick={() => setState((prev) => acknowledgeCriticalFlag(prev, flag.id))}
            >
              I understand
            </button>
          </div>
        </main>
      );
    }

    const debrief = buildDebrief(state);
    return (
      <main className={styles.wrap}>
        <div className={styles.card}>
          <h1>Mission debrief</h1>
          <p className={styles.headline}>{debrief.headline}</p>
          {debrief.strengths.length > 0 && (
            <>
              <h2>What went well</h2>
              <ul>
                {debrief.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </>
          )}
          {debrief.missedOpportunities.length > 0 && (
            <>
              <h2>Worth reflecting on</h2>
              <ul>
                {debrief.missedOpportunities.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </>
          )}
          {isPending && <p className={styles.saveStatus}>Saving your results\u2026</p>}
          {!isPending && saveResult === 'success' && <p className={styles.saveStatus}>Results saved.</p>}
          {!isPending && saveResult === 'failure' && (
            <div className={styles.saveStatus}>
              <p>Your results were not saved. You can try again.</p>
              <button className={styles.primaryButton} onClick={handleRetry}>
                Retry save
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  if (state.pendingAcknowledgmentEventId) {
    const event = bls01.events.find((e) => e.id === state.pendingAcknowledgmentEventId);
    return (
      <main className={styles.wrap}>
        <div className={styles.interruptionCard}>
          <h2>{event?.label}</h2>
          <p>{event?.detail}</p>
          <button className={styles.primaryButton} onClick={() => setState((prev) => acknowledge(prev, bls01))}>
            Continue
          </button>
        </div>
      </main>
    );
  }

  const available = getAvailableActions(state, bls01);

  return (
    <main className={styles.wrap}>
      <div className={styles.hud}>
        <span className={styles.hudItem}>Elapsed: {state.elapsedMinutes} min</span>
        {(Object.keys(state.resources) as (keyof typeof RESOURCE_LABELS)[])
          .filter((kind) => state.resources[kind].status !== 'not_requested')
          .map((kind) => (
            <span key={kind} className={styles.hudItem}>
              {RESOURCE_LABELS[kind]}: {state.resources[kind].status.replace('_', ' ')}
            </span>
          ))}
      </div>
      {state.hazardFlags.length > 0 && (
        <div className={styles.hazards}>
          {state.hazardFlags.map((flag, i) => <div key={i} className={styles.hazardItem}>{flag}</div>)}
        </div>
      )}
      <p className={styles.narrative}>{getSceneNarrative(state)}</p>
      <div className={styles.actions}>
        {available.map((action) => (
          <button
            key={action.id}
            className={styles.actionButton}
            onClick={() => setState((prev) => applyAction(prev, bls01, action.id))}
          >
            {action.label}
          </button>
        ))}
      </div>
    </main>
  );
}
