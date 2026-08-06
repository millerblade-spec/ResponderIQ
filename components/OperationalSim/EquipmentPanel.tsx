'use client';

import type { EquipmentItem } from '@/lib/opsim/equipment';
import styles from './OperationalSim.module.css';

interface EquipmentPanelProps {
  readonly catalog: readonly EquipmentItem[];
  readonly selected: readonly string[];
  readonly onToggle: (id: string) => void;
  readonly onConfirm: () => void;
  /** 'inline' renders as a plain panel (keeps the mission clock visible above); 'overlay' is the modal. */
  readonly variant?: 'overlay' | 'inline';
}

export const RON_EQUIPMENT_PROMPT = 'What do you want to bring in?';

/**
 * Equipment-selection interface (§9), asked by Ron as the crew steps out of the
 * unit. Every approved option is a keyboard-operable toggle. Whatever is
 * selected is carried in; anything left on Medic 3 that turns out to be needed
 * costs someone a ~45-second walk back to the truck — a realistic consequence
 * of packing light, not a penalty.
 */
export function EquipmentPanel({ catalog, selected, onToggle, onConfirm, variant = 'inline' }: EquipmentPanelProps) {
  const body = (
    <>
      <div className={styles.ron}>
        <span className={styles.ronName}>Partner Ron:</span>
        <span id="equipment-title">“{RON_EQUIPMENT_PROMPT}”</span>
      </div>

      <p className={styles.instruction}>
        Whatever you grab now comes in with you. Anything you leave stays on Medic 3 — if it turns out you
        need it, someone walks back to the truck for it (about 45 seconds each way there and back).
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
    </>
  );

  if (variant === 'inline') {
    return (
      <section className={styles.panel} aria-labelledby="equipment-title">
        {body}
      </section>
    );
  }
  return (
    <div className={styles.overlay}>
      <div role="dialog" aria-modal="true" aria-labelledby="equipment-title" className={styles.modal}>
        {body}
      </div>
    </div>
  );
}
