'use client';

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { LOCAL_ADMIN_REVIEW_STORAGE_KEY } from '@/components/SimulatorPlayer/SimulatorPlayer';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  resolveTheme,
  saveSettings,
} from '@/lib/settings/storage';
import type { AppSettings, LightingMode, ThemePreference } from '@/lib/settings/types';
import styles from './Settings.module.css';

interface SettingsSnapshot {
  readonly settings: AppSettings;
  readonly hasLocalReviewData: boolean;
}

function subscribeToStorage(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getServerSnapshot(): SettingsSnapshot {
  return { settings: DEFAULT_SETTINGS, hasLocalReviewData: false };
}

/**
 * Settings and local-data controls. Both localStorage-backed, so this
 * uses the same useSyncExternalStore pattern as AdminReview for a safe
 * initial read (no server/client mismatch, no setState-in-effect).
 *
 * Only two controls exist because only two things are actually real
 * right now: reduced motion has something to affect (Button's hover
 * transition, globals.css's own reduced-motion rule), and local review
 * data is a real, already-existing localStorage entry. Nothing here
 * pretends to control a system (theming, audio) that doesn't exist yet.
 */
export function Settings() {
  const cacheRef = useRef<{ raw: string; parsed: SettingsSnapshot } | null>(null);
  const getSnapshot = useCallback((): SettingsSnapshot => {
    const rawSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '';
    const hasLocalReviewData = window.localStorage.getItem(LOCAL_ADMIN_REVIEW_STORAGE_KEY) !== null;
    const raw = `${rawSettings}|${hasLocalReviewData}`;
    if (cacheRef.current?.raw === raw) return cacheRef.current.parsed;
    const parsed: SettingsSnapshot = { settings: loadSettings(), hasLocalReviewData };
    cacheRef.current = { raw, parsed };
    return parsed;
  }, []);

  const stored = useSyncExternalStore(subscribeToStorage, getSnapshot, getServerSnapshot);

  // Local-tab overrides: the browser's `storage` event never fires in the
  // same tab that made the change, so a save made here wouldn't otherwise
  // be reflected until another tab's event arrives (or never, if there is
  // no other tab). These give immediate feedback for actions taken here.
  const [reducedMotionOverride, setReducedMotionOverride] = useState<boolean | null>(null);
  const [themeOverride, setThemeOverride] = useState<ThemePreference | null>(null);
  const [lightingOverride, setLightingOverride] = useState<LightingMode | null>(null);
  const [justCleared, setJustCleared] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const reducedMotion = reducedMotionOverride ?? stored.settings.reducedMotion;
  const theme = themeOverride ?? stored.settings.theme;
  const lightingMode = lightingOverride ?? stored.settings.lightingMode;
  const hasLocalReviewData = justCleared ? false : stored.hasLocalReviewData;

  function handleReducedMotionChange(next: boolean) {
    setReducedMotionOverride(next);
    saveSettings({ ...stored.settings, reducedMotion: next });
    document.documentElement.dataset.reducedMotion = next ? 'true' : 'false';
  }

  function handleThemeChange(next: ThemePreference) {
    setThemeOverride(next);
    saveSettings({ ...stored.settings, theme: next });
    document.documentElement.dataset.theme = resolveTheme(next);
  }

  function handleLightingChange(next: LightingMode) {
    setLightingOverride(next);
    saveSettings({ ...stored.settings, lightingMode: next });
    document.documentElement.dataset.lighting = next;
  }

  function handleClearLocalReviewData() {
    try {
      window.localStorage.removeItem(LOCAL_ADMIN_REVIEW_STORAGE_KEY);
    } catch {
      // Storage can fail (private browsing). Nothing further to do here.
    }
    setConfirmingClear(false);
    setJustCleared(true);
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.heading}>Settings</h1>

        <section className={styles.section}>
          <h2 className={styles.subheading}>Appearance</h2>
          <label className={styles.selectRow}>
            <span className={styles.toggleLabel}>Theme</span>
            <select
              className={styles.select}
              value={theme}
              aria-label="Theme"
              onChange={(e) => handleThemeChange(e.target.value as ThemePreference)}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className={styles.selectRow}>
            <span className={styles.toggleLabel}>Emergency lighting</span>
            <select
              className={styles.select}
              value={lightingMode}
              aria-label="Emergency lighting"
              onChange={(e) => handleLightingChange(e.target.value as LightingMode)}
            >
              <option value="standard">Standard Emergency Lighting</option>
              <option value="reduced">Reduced Flashing Mode</option>
            </select>
          </label>
          <p className={styles.toggleHint}>
            Reduced Flashing Mode preserves all status information using steady lights, labels, icons, or
            pulsing borders. See Instructions for the full flashing-light warning.
          </p>
        </section>

        <section className={styles.section}>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => handleReducedMotionChange(e.target.checked)}
            />
            <span>
              <span className={styles.toggleLabel}>Reduce motion</span>
              <span className={styles.toggleHint}>
                Forces the same reduced-motion behavior this app already applies when your system requests
                it, regardless of your system setting.
              </span>
            </span>
          </label>
        </section>

        <section className={styles.section}>
          <h2 className={styles.subheading}>Local review data</h2>
          <p className={styles.hint}>
            {hasLocalReviewData
              ? 'This browser has a completed BLS-01 playthrough saved locally for review.'
              : 'No completed playthrough is currently saved in this browser.'}
          </p>
          {!confirmingClear && (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={!hasLocalReviewData}
              onClick={() => setConfirmingClear(true)}
            >
              Clear local review data
            </button>
          )}
          {confirmingClear && (
            <div className={styles.confirmRow}>
              <span>This can&apos;t be undone. Clear it?</span>
              <button type="button" className={styles.dangerButton} onClick={handleClearLocalReviewData}>
                Yes, clear it
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => setConfirmingClear(false)}>
                Cancel
              </button>
            </div>
          )}
          {justCleared && <p className={styles.confirmation}>Cleared.</p>}
        </section>

        <Link href="/dashboard" className={styles.backLink}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
