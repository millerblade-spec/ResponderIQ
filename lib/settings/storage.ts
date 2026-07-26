import type { AppSettings, LightingMode, ThemePreference } from './types';

/** Local-browser-only storage key. Never sent anywhere; only readable in this same browser. */
export const SETTINGS_STORAGE_KEY = 'responderiq:local-settings';

export const DEFAULT_SETTINGS: AppSettings = {
  reducedMotion: false,
  theme: 'system',
  lightingMode: 'standard',
};

const THEME_VALUES: readonly ThemePreference[] = ['system', 'light', 'dark'];
const LIGHTING_VALUES: readonly LightingMode[] = ['standard', 'reduced'];

/**
 * Reads stored settings, falling back to defaults on missing or
 * corrupt data. Never throws — settings are a convenience layer, not
 * something that should be able to break the app. Each field is validated
 * independently, so an unknown value in one never discards the others.
 */
export function loadSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      reducedMotion:
        typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
      theme:
        typeof parsed.theme === 'string' && THEME_VALUES.includes(parsed.theme)
          ? parsed.theme
          : DEFAULT_SETTINGS.theme,
      lightingMode:
        typeof parsed.lightingMode === 'string' && LIGHTING_VALUES.includes(parsed.lightingMode)
          ? parsed.lightingMode
          : DEFAULT_SETTINGS.lightingMode,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can fail (private browsing, quota). Settings simply won't persist across reloads.
  }
}

/** Resolves a theme preference to the concrete mode to apply, consulting the OS only for 'system'. */
export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  const prefersLight =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches;
  return prefersLight ? 'light' : 'dark';
}
