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

export interface AppSettings {
  /** Forces the same reduced-motion CSS the app already applies when the OS requests it (globals.css), regardless of OS setting. */
  readonly reducedMotion: boolean;
  /** §2 Light/dark/system theme preference. */
  readonly theme: ThemePreference;
  /** §3 Standard Emergency Lighting vs Reduced Flashing Mode. */
  readonly lightingMode: LightingMode;
}
