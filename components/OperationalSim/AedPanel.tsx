'use client';

import { useEffect, useRef } from 'react';
import type { MissionClock } from '@/lib/engine/missionClock';
import type { AedState } from '@/lib/opsim/treatmentMachine';
import type { TreatmentModel } from '@/lib/opsim/treatment';
import opStyles from './OperationalSim.module.css';
import styles from './TreatmentPanel.module.css';

const ANALYZE_SECONDS = 10;
const CHARGE_SECONDS = 5;

interface AedPanelProps {
  readonly aed: AedState | undefined;
  readonly model: TreatmentModel;
  readonly clock: MissionClock;
  /** A live tick value from the parent so the countdown/CPR timer refresh each second. */
  readonly now: number;
  readonly onBeginAnalysis: () => void;
  readonly onResolveAnalysis: (shockAdvised: boolean) => void;
  readonly onBeginCharge: () => void;
  readonly onDeliverShock: () => void;
  readonly onBeginCpr: () => void;
  readonly onReanalyze: () => void;
}

function fmt(total: number): string {
  const m = Math.floor(Math.max(0, total) / 60);
  const s = Math.max(0, total) % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * The AED analyze → shock/no-shock → charge → deliver → CPR cycle (§9).
 * Shockability is read from the scenario's TreatmentModel via
 * `onResolveAnalysis` — this component never decides it. Each step after the
 * learner's own action (Analyze, Charge, Resume CPR) auto-advances on the
 * shared mission clock; "Reanalyze Rhythm" during CPR loops back to
 * Analyzing, so repeated cycles need no special handling here — the
 * underlying reducer already supports them.
 */
export function AedPanel({
  aed,
  model,
  clock,
  now,
  onBeginAnalysis,
  onResolveAnalysis,
  onBeginCharge,
  onDeliverShock,
  onBeginCpr,
  onReanalyze,
}: AedPanelProps) {
  const scheduledRef = useRef<number[]>([]);
  const analyzingHandledRef = useRef(false);
  const chargingHandledRef = useRef(false);

  const stage = aed?.stage ?? 'idle';

  // Auto-resolve the 10s analysis exactly once per analyzing-stage entry.
  useEffect(() => {
    if (stage !== 'analyzing') {
      analyzingHandledRef.current = false;
      return;
    }
    if (analyzingHandledRef.current) return;
    analyzingHandledRef.current = true;
    const id = clock.after(ANALYZE_SECONDS, () => onResolveAnalysis(model.aedShockAdvised));
    scheduledRef.current.push(id);
  }, [stage, clock, model, onResolveAnalysis]);

  // Auto-deliver the shock exactly once per charging-stage entry.
  useEffect(() => {
    if (stage !== 'charging') {
      chargingHandledRef.current = false;
      return;
    }
    if (chargingHandledRef.current) return;
    chargingHandledRef.current = true;
    const id = clock.after(CHARGE_SECONDS, onDeliverShock);
    scheduledRef.current.push(id);
  }, [stage, clock, onDeliverShock]);

  useEffect(() => {
    const scheduled = scheduledRef.current;
    return () => scheduled.forEach((id) => clock.cancel(id));
  }, [clock]);

  const cprElapsed = aed?.cprStartedAtSecond != null ? now - aed.cprStartedAtSecond : 0;
  const cycleCount = aed?.cycles.length ?? 0;
  const analyzeRemaining = stage === 'analyzing' && aed?.stageStartedAtSecond != null
    ? Math.max(0, ANALYZE_SECONDS - (now - aed.stageStartedAtSecond))
    : 0;
  const chargeRemaining = stage === 'charging' && aed?.stageStartedAtSecond != null
    ? Math.max(0, CHARGE_SECONDS - (now - aed.stageStartedAtSecond))
    : 0;

  return (
    <div className={styles.subFlow} aria-label="AED">
      {cycleCount > 0 && (
        <p className={opStyles.hint}>
          {cycleCount} cycle{cycleCount === 1 ? '' : 's'} recorded so far.
        </p>
      )}

      {stage === 'idle' && (
        <button type="button" className={opStyles.primaryButton} onClick={onBeginAnalysis}>
          Analyze Rhythm
        </button>
      )}

      {stage === 'analyzing' && (
        <div className={styles.aedStatusRow}>
          <p className={styles.aedStatus} role="status">
            Analyzing…
          </p>
          <span
            className={`${opStyles.countdown} ${analyzeRemaining <= 3 ? opStyles.urgent : ''}`}
            role="timer"
            aria-live="off"
            aria-label={`${analyzeRemaining} seconds remaining`}
          >
            {analyzeRemaining}s
          </span>
        </div>
      )}

      {stage === 'shock_advised' && (
        <>
          <p className={`${styles.aedStatus} ${styles.aedShock}`} role="status">
            Shock Advised
          </p>
          <button type="button" className={opStyles.primaryButton} onClick={onBeginCharge}>
            Charge
          </button>
        </>
      )}

      {stage === 'charging' && (
        <div className={styles.aedStatusRow}>
          <p className={styles.aedStatus} role="status">
            Charging…
          </p>
          <span
            className={`${opStyles.countdown} ${opStyles.urgent}`}
            role="timer"
            aria-live="off"
            aria-label={`${chargeRemaining} seconds remaining`}
          >
            {chargeRemaining}s
          </span>
        </div>
      )}

      {stage === 'shock_delivered' && (
        <>
          <p className={`${styles.aedStatus} ${styles.aedShock}`} role="status">
            Shock Delivered
          </p>
          <button type="button" className={opStyles.primaryButton} onClick={onBeginCpr}>
            Resume CPR
          </button>
        </>
      )}

      {stage === 'no_shock_advised' && (
        <>
          <p className={styles.aedStatus} role="status">
            No Shock Advised
          </p>
          <button type="button" className={opStyles.primaryButton} onClick={onBeginCpr}>
            Resume CPR
          </button>
        </>
      )}

      {stage === 'cpr' && (
        <>
          <div
            className={styles.cprTimer}
            role="timer"
            aria-live="off"
            aria-label={`CPR in progress, ${fmt(cprElapsed)} elapsed`}
          >
            CPR — {fmt(cprElapsed)}
          </div>
          <button type="button" className={opStyles.primaryButton} onClick={onReanalyze}>
            Reanalyze Rhythm
          </button>
        </>
      )}
    </div>
  );
}
