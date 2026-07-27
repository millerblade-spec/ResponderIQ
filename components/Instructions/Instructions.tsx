'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark/Wordmark';
import {
  COLOR_LEGEND,
  FLASHING_EFFECTS,
  FLASHING_WARNING_SUMMARY,
  LIGHTING_MODES,
} from '@/lib/instructions/content';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, loadSettings, saveSettings } from '@/lib/settings/storage';
import type { AppSettings, LightingMode } from '@/lib/settings/types';
import styles from './Instructions.module.css';

function subscribeToStorage(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getServerSnapshot(): AppSettings {
  return DEFAULT_SETTINGS;
}

/**
 * Instructions and General Information (§3). Explains the operational color
 * legend and the flashing-light warning, and lets the learner choose Standard
 * Emergency Lighting vs Reduced Flashing Mode BEFORE a call. This lives on its
 * own route, deliberately outside the active simulator — the full legend is
 * never kept permanently open during a call (§3, §22).
 *
 * Reads the lighting preference with the same useSyncExternalStore pattern as
 * Settings/AdminReview, with a same-tab override for immediate feedback.
 */
export function Instructions() {
  const cacheRef = useRef<{ raw: string; parsed: AppSettings } | null>(null);
  const getSnapshot = useCallback((): AppSettings => {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '';
    if (cacheRef.current?.raw === raw) return cacheRef.current.parsed;
    const parsed = loadSettings();
    cacheRef.current = { raw, parsed };
    return parsed;
  }, []);

  const stored = useSyncExternalStore(subscribeToStorage, getSnapshot, getServerSnapshot);
  const [lightingOverride, setLightingOverride] = useState<LightingMode | null>(null);
  const lightingMode = lightingOverride ?? stored.lightingMode;

  // Reflect the effective lighting mode onto <html> for the beacon/alert
  // components in later phases. Kept in an effect (not the click handler) so
  // the DOM side-effect is declarative and stays in sync with state.
  useEffect(() => {
    document.documentElement.dataset.lighting = lightingMode;
  }, [lightingMode]);

  function handleLightingChange(next: LightingMode) {
    setLightingOverride(next);
    saveSettings({ ...stored, lightingMode: next });
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Wordmark size={1.6} />
          <h1 className={styles.heading}>Instructions and General Information</h1>
        </div>

        <section className={styles.section} aria-labelledby="legend-heading">
          <h2 id="legend-heading" className={styles.subheading}>
            Color legend
          </h2>
          <p className={styles.note}>
            Color is never the only signal — every colored condition in the simulator also carries a text
            label or icon.
          </p>
          <ul className={styles.legend}>
            {COLOR_LEGEND.map((entry) => (
              <li key={entry.key} className={styles.legendRow}>
                <span
                  className={styles.swatch}
                  style={{ backgroundColor: `var(${entry.cssVar})` }}
                  aria-hidden="true"
                >
                  {entry.icon}
                </span>
                <span className={styles.legendText}>
                  <span className={styles.legendName}>{entry.name}:</span> {entry.meaning}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="flashing-heading">
          <h2 id="flashing-heading" className={styles.subheading}>
            Flashing-light warning
          </h2>
          <p className={styles.note}>ResponderIQ contains:</p>
          <ul className={styles.bullets}>
            {FLASHING_EFFECTS.map((effect) => (
              <li key={effect}>{effect}</li>
            ))}
          </ul>
          <p className={styles.note}>{FLASHING_WARNING_SUMMARY}</p>

          <fieldset className={styles.lightingFieldset}>
            <legend className={styles.legendLabel}>Emergency lighting</legend>
            {LIGHTING_MODES.map((mode) => (
              <label key={mode.key} className={styles.radioRow}>
                <input
                  type="radio"
                  name="lightingMode"
                  value={mode.key}
                  checked={lightingMode === mode.key}
                  onChange={() => handleLightingChange(mode.key)}
                />
                <span>
                  <span className={styles.radioLabel}>{mode.name}</span>
                  <span className={styles.radioHint}>{mode.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </section>

        <Link href="/dashboard" className={styles.backLink}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
