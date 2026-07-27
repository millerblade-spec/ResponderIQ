/**
 * Local, per-browser app preferences. Deliberately separate from
 * SceneState (lib/engine/types.ts) — settings are a cross-scenario,
 * cross-session concern, not part of any one scenario's state.
 *
 * Scoped to what's actually wired up right now. Extend only when a
 * real, working feature needs a new field — not ahead of one.
 */

/** §2 Light and dark modes. 'system' follows the OS; the others force a mode. */
export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * §3 Emergency-lighting presentation.
 * - 'standard': full Standard Emergency Lighting (flashing beacons, changing alerts).
 * - 'reduced':  Reduced Flashing Mode — all status is preserved with steady
 *   lights, labels, icons, or pulsing borders instead of flashing.
 */
export type LightingMode = 'standard' | 'reduced';

/** Step 11 audio preferences, persisted through this same settings store (no parallel store). */
export interface AudioSettings {
  readonly master: number;
  readonly channels: {
    readonly partner_ron: number;
    readonly dispatch_radio: number;
    readonly emergency_warning: number;
    readonly scene_patient: number;
    readonly medical_equipment: number;
  };
  readonly muted: boolean;
  readonly reducedSensory: boolean;
  readonly captionsOn: boolean;
}

export interface AppSettings {
  /** Forces the same reduced-motion CSS the app already applies when the OS requests it (globals.css), regardless of OS setting. */
  readonly reducedMotion: boolean;
  /** §2 Light/dark/system theme preference. */
  readonly theme: ThemePreference;
  /** §3 Standard Emergency Lighting vs Reduced Flashing Mode. */
  readonly lightingMode: LightingMode;
  /** Step 11 audio channels, captions, Reduced Sensory Mode, mute. */
  readonly audio: AudioSettings;
}
