'use client';

import type { SimulatorConfig } from '@/lib/engine/config';
import type { DifferentialChoice, DifferentialState } from '@/lib/opsim/types';
import styles from './OperationalSim.module.css';

interface DifferentialModalProps {
  readonly choices: readonly DifferentialChoice[];
  readonly differential: DifferentialState;
  readonly config: SimulatorConfig;
  readonly remainingSeconds: number;
  readonly canFinalize: boolean;
  readonly onToggle: (id: string) => void;
  readonly onReorder: (id: string, direction: 'up' | 'down') => void;
  readonly onFinalize: () => void;
}

/**
 * WHAT ARE YOU PREPARING FOR? (§8). Selection and priority ordering are fully
 * keyboard-operable: each choice is a real toggle button, and priority is set
 * with Move-up/Move-down buttons (the keyboard equivalent of dragging). No
 * correctness, score, or grade is ever shown.
 */
export function DifferentialModal({
  choices,
  differential,
  config,
  remainingSeconds,
  canFinalize,
  onToggle,
  onReorder,
  onFinalize,
}: DifferentialModalProps) {
  const labelFor = (id: string) => choices.find((c) => c.id === id)?.label ?? id;
  const rankedCount = config.differential.rankedCount;
  const minimum = config.differential.minimumSelections;

  return (
    <div className={styles.overlay}>
      <div role="dialog" aria-modal="true" aria-labelledby="differential-title" className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 id="differential-title" className={styles.modalTitle}>
            WHAT ARE YOU PREPARING FOR?
          </h2>
          <span
            className={`${styles.countdown} ${remainingSeconds <= 5 ? styles.urgent : ''}`}
            role="timer"
            aria-live="off"
            aria-label={`${remainingSeconds} seconds remaining`}
          >
            {remainingSeconds}s
          </span>
        </div>

        <p className={styles.instruction}>
          Select the conditions you are considering based only on the dispatch information.
        </p>

        <div className={styles.choiceGrid} role="group" aria-label="Differential choices">
          {choices.map((choice) => {
            const selected = differential.selected.includes(choice.id);
            return (
              <button
                key={choice.id}
                type="button"
                className={styles.choice}
                aria-pressed={selected}
                onClick={() => onToggle(choice.id)}
              >
                <span className={styles.choiceCheck} aria-hidden="true">
                  {selected ? '✓' : ''}
                </span>
                {choice.label}
              </button>
            );
          })}
        </div>

        <p className={styles.selectionCount}>
          {differential.selected.length} selected{' '}
          <span className={styles.hint}>(minimum {minimum})</span>
        </p>

        {differential.ranking.length > 0 && (
          <div>
            <p className={styles.instruction}>
              Priority order — the top {rankedCount} are ranked; the rest stay considered. Use the arrows (or
              drag) to reorder.
            </p>
            <ol className={styles.rankList} aria-label="Priority order">
              {differential.ranking.map((id, index) => {
                const considered = index >= rankedCount;
                return (
                  <li
                    key={id}
                    className={`${styles.rankRow} ${considered ? styles.considered : ''}`}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dragged = e.dataTransfer.getData('text/plain');
                      if (!dragged || dragged === id) return;
                      const from = differential.ranking.indexOf(dragged);
                      const to = differential.ranking.indexOf(id);
                      onReorder(dragged, from < to ? 'down' : 'up');
                    }}
                  >
                    <span className={styles.rankNumber} aria-hidden="true">
                      {considered ? '·' : index + 1}
                    </span>
                    <span className={styles.rankLabel}>{labelFor(id)}</span>
                    {considered && <span className={styles.consideredTag}>considered</span>}
                    <span className={styles.rankButtons}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Move ${labelFor(id)} up`}
                        disabled={index === 0}
                        onClick={() => onReorder(id, 'up')}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Move ${labelFor(id)} down`}
                        disabled={index === differential.ranking.length - 1}
                        onClick={() => onReorder(id, 'down')}
                      >
                        ↓
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <div className={styles.modalFooter}>
          <span className={styles.hint}>
            The mission clock keeps running. When the timer ends, your selections and order are saved as-is.
          </span>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canFinalize}
            onClick={onFinalize}
          >
            Lock in &amp; respond
          </button>
        </div>
      </div>
    </div>
  );
}
