'use client';

import { useState } from 'react';
import {
  BAG_CONTENTS,
  BALLISTIC_WARNING,
  DETAILED_EQUIPMENT_IDS,
  OTHER_EQUIPMENT,
  type DetailedEquipmentId,
} from '@/lib/opsim/truckInventory';
import opStyles from '@/components/OperationalSim/OperationalSim.module.css';
import styles from './ShiftStart.module.css';

interface TruckCheckProps {
  readonly introLine: string;
  readonly onComplete: () => void;
}

/**
 * The full Truck Check / Unit Check-Off (§4, §5). "Truck Check" is the primary
 * label; "Unit Check-Off" is shown as secondary wording. The four detailed
 * items open a contents view; everything else is clearly listed. The ballistic
 * warning is always visible.
 */
export function TruckCheck({ introLine, onComplete }: TruckCheckProps) {
  const [openId, setOpenId] = useState<DetailedEquipmentId | null>(null);
  const open = openId ? BAG_CONTENTS[openId] : null;

  return (
    <div className={styles.wrap}>
      <div className={opStyles.ron}>
        <span className={opStyles.ronName}>Partner Ron:</span>
        <span>“{introLine}”</span>
      </div>

      <div className={styles.header}>
        <h1 className={styles.title}>Truck Check</h1>
        <span className={styles.subtitle}>(Unit Check-Off) — Medic 3</span>
      </div>

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Bags &amp; monitor — open for contents</h2>
        <div className={styles.detailedGrid}>
          {DETAILED_EQUIPMENT_IDS.map((id) => (
            <button key={id} type="button" className={styles.detailedButton} onClick={() => setOpenId(id)}>
              {BAG_CONTENTS[id].title}
              <span className={styles.chev} aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>

        <h2 className={styles.sectionTitle}>Other equipment on Medic 3</h2>
        <div className={styles.otherGrid}>
          {OTHER_EQUIPMENT.map((item) => (
            <div key={item.id} className={styles.otherItem}>
              {item.label}
              {item.note && <span className={styles.otherNote}>{item.note}</span>}
            </div>
          ))}
        </div>
      </section>

      <div className={styles.warning} role="note">
        <span className={styles.warningIcon} aria-hidden="true">
          ▲
        </span>
        {BALLISTIC_WARNING}
      </div>

      <button type="button" className={opStyles.primaryButton} onClick={onComplete}>
        Medic 3 is ready — go available
      </button>

      {open && (
        <div className={opStyles.overlay} onClick={() => setOpenId(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contents-title"
            className={opStyles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={opStyles.modalHeader}>
              <h2 id="contents-title" className={opStyles.modalTitle}>
                {open.title}
              </h2>
              <button
                type="button"
                className={opStyles.iconButton}
                aria-label="Close contents"
                onClick={() => setOpenId(null)}
              >
                ✕
              </button>
            </div>
            <ul className={styles.contentsList}>
              {open.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {open.note && <p className={styles.contentsNote}>{open.note}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
