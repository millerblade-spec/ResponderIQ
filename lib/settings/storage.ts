import type { AppSettings, AudioSettings, LightingMode, ThemePreference } from './types';

/** Local-browser-only storage key. Never sent anywhere; only readable in this same browser. */
export const SETTINGS_STORAGE_KEY = 'responderiq:local-settings';

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 0.8,
  channels: { partner_ron: 1, dispatch_radio: 1, emergency_warning: 1, scene_patient: 0.8, medical_equipment: 1 },
  muted: false,
  reducedSensory: false,
  captionsOn: true,
};

export const DEFAULT_SETTINGS: AppSettings = {
  reducedMotion: false,
  theme: 'system',
  lightingMode: 'standard',
  audio: DEFAULT_AUDIO_SETTINGS,
};

const THEME_VALUES: readonly ThemePreference[] = ['system', 'light', 'dark'];
const LIGHTING_VALUES: readonly LightingMode[] = ['standard', 'reduced'];

const clamp01 = (v: unknown, fallback: number): number => (typeof v === 'number' && v >= 0 && v <= 1 ? v : fallback);

function parseAudio(raw: unknown): AudioSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_AUDIO_SETTINGS;
  const a = raw as Partial<AudioSettings>;
  const ch = (typeof a.channels === 'object' && a.channels !== null ? a.channels : {}) as Partial<AudioSettings['channels']>;
  const d = DEFAULT_AUDIO_SETTINGS;
  return {
    master: clamp01(a.master, d.master),
    channels: {
      partner_ron: clamp01(ch.partner_ron, d.channels.partner_ron),
      dispatch_radio: clamp01(ch.dispatch_radio, d.channels.dispatch_radio),
      emergency_warning: clamp01(ch.emergency_warning, d.channels.emergency_warning),
      scene_patient: clamp01(ch.scene_patient, d.channels.scene_patient),
      medical_equipment: clamp01(ch.medical_equipment, d.channels.medical_equipment),
    },
    muted: typeof a.muted === 'boolean' ? a.muted : d.muted,
    reducedSensory: typeof a.reducedSensory === 'boolean' ? a.reducedSensory : d.reducedSensory,
    captionsOn: typeof a.captionsOn === 'boolean' ? a.captionsOn : d.captionsOn,
  };
}

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
      audio: parseAudio(parsed.audio),
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
