'use client';

import type { EquipmentItem } from '@/lib/opsim/equipment';
import styles from './OperationalSim.module.css';

interface EquipmentPanelProps {
  readonly catalog: readonly EquipmentItem[];
  readonly selected: readonly string[];
  readonly onToggle: (id: string) => void;
  readonly onConfirm: () => void;
}

export const RON_EQUIPMENT_PROMPT =
  'Based on what you’re thinking, what equipment do you want to take in?';

/**
 * Equipment-selection interface (§9). Opens 3 seconds after the differential
 * ends, led by Ron's question. Every approved option is a keyboard-operable
 * toggle. Whatever is selected becomes immediately available on scene; the
 * rest stays on Medic 3 and later needs the 45s retrieval.
 */
export function EquipmentPanel({ catalog, selected, onToggle, onConfirm }: EquipmentPanelProps) {
  return (
    <div className={styles.overlay}>
      <div role="dialog" aria-modal="true" aria-labelledby="equipment-title" className={styles.modal}>
        <div className={styles.ron}>
          <span className={styles.ronName}>Partner Ron:</span>
          <span id="equipment-title">“{RON_EQUIPMENT_PROMPT}”</span>
        </div>

        <p className={styles.instruction}>
          Anything you bring is available immediately. Anything you leave stays on Medic 3 and takes time to
          retrieve later.
        </p>

        <div className={styles.choiceGrid} role="group" aria-label="Equipment options">
          {catalog.map((item) => {
            const isSelected = selected.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={styles.choice}
                aria-pressed={isSelected}
                onClick={() => onToggle(item.id)}
              >
                <span className={styles.choiceCheck} aria-hidden="true">
                  {isSelected ? '✓' : ''}
                </span>
                {item.label}
              </button>
            );
          })}
        </div>

        <div className={styles.modalFooter}>
          <span className={styles.selectionCount}>{selected.length} selected</span>
          <button type="button" className={styles.primaryButton} onClick={onConfirm}>
            Bring these in
          </button>
        </div>
      </div>
    </div>
  );
}
