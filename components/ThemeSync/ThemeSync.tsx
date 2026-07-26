'use client';

import { useEffect } from 'react';
import { loadSettings, resolveTheme } from '@/lib/settings/storage';

/**
 * Applies the stored theme (§2) and lighting mode (§3) to <html> on first
 * load of any page, via `data-theme` (matched by globals.css) and
 * `data-lighting` (read by the simulator's beacon/alert components in later
 * phases). Renders nothing.
 *
 * A blocking inline script in the root layout already sets these before first
 * paint to avoid a flash; this component re-applies after hydration and keeps
 * 'system' correct if the OS scheme changes while the app is open. The
 * Settings page applies changes immediately on toggle itself, since
 * layout-level components don't remount on client-side navigation.
 */
export function ThemeSync() {
  useEffect(() => {
    const settings = loadSettings();
    const root = document.documentElement;
    root.dataset.theme = resolveTheme(settings.theme);
    root.dataset.lighting = settings.lightingMode;

    if (settings.theme !== 'system' || typeof window.matchMedia !== 'function') return;

    // Follow live OS changes only while the preference is 'system'.
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      if (loadSettings().theme === 'system') root.dataset.theme = media.matches ? 'light' : 'dark';
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return null;
}
