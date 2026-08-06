'use client';

import { RON_TREATMENT_LINES } from '@/lib/opsim/treatment';
import styles from './OperationalSim.module.css';

interface ScopeOfPracticeModalProps {
  readonly treatmentLabel: string;
  readonly onAuthorize: () => void;
  readonly onDecline: () => void;
}

/**
 * Scope-of-Practice override prompt (§4): when an EMT-tier learner attempts a
 * Paramedic-only skill, this asks — once per skill, not once per run — whether
 * their Medical Director authorized it for this training scenario. Declining
 * simply returns to the Treatment menu; nothing is flagged as wrong and the
 * tone stays neutral throughout ("Never shame the learner").
 */
export function ScopeOfPracticeModal({ treatmentLabel, onAuthorize, onDecline }: ScopeOfPracticeModalProps) {
  return (
    <div className={styles.overlay}>
      <div role="dialog" aria-modal="true" aria-labelledby="scope-title" className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 id="scope-title" className={styles.modalTitle}>
            {RON_TREATMENT_LINES.scopeOverrideTitle}
          </h2>
        </div>

        <p className={styles.instruction}>
          <strong>{treatmentLabel}</strong> — {RON_TREATMENT_LINES.scopeOverridePrompt}
        </p>
        <p className={styles.instruction}>{RON_TREATMENT_LINES.scopeOverrideQuestion}</p>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.secondaryButton} onClick={onDecline}>
            NO — Stay in My Lane
          </button>
          <button type="button" className={styles.primaryButton} onClick={onAuthorize}>
            YES — Let’s Learn
          </button>
        </div>
      </div>
    </div>
  );
}
