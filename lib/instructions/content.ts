import type { LightingMode } from '@/lib/settings/types';

/**
 * Approved content for the Instructions and General Information area (§3).
 * Kept as typed data (not inline JSX) so it is testable and single-sourced.
 * Wording matches the specification's color legend exactly.
 */

export type LegendKey = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

export interface LegendEntry {
  readonly key: LegendKey;
  /** Human color name — a non-color text label so color is never the only signal (§3). */
  readonly name: string;
  /** CSS variable holding the swatch color for this meaning. */
  readonly cssVar: string;
  /** A glyph shown alongside the swatch, so meaning survives without color. */
  readonly icon: string;
  /** The approved meaning text. */
  readonly meaning: string;
}

/** §3 color legend, in the approved order. */
export const COLOR_LEGEND: readonly LegendEntry[] = [
  {
    key: 'red',
    name: 'Red',
    cssVar: '--status-critical',
    icon: '■',
    meaning: 'Emergency response, immediate threat, or critical warning',
  },
  {
    key: 'orange',
    name: 'Orange',
    cssVar: '--status-caution',
    icon: '▲',
    meaning: 'Caution or developing problem',
  },
  {
    key: 'yellow',
    name: 'Yellow',
    cssVar: '--status-pending',
    icon: '●',
    meaning: 'Pending task, operational concern, or decision required',
  },
  {
    key: 'green',
    name: 'Green',
    cssVar: '--status-safe',
    icon: '✓',
    meaning: 'Safe, available, confirmed, or completed',
  },
  {
    key: 'blue',
    name: 'Blue',
    cssVar: '--status-info',
    icon: 'ℹ',
    meaning: 'Routine information, assessment, and standard actions',
  },
  {
    key: 'purple',
    name: 'Purple',
    cssVar: '--status-behavioral',
    icon: '◆',
    meaning: 'Behavioral issues, family, bystanders, and scene dynamics',
  },
];

/** §3 flashing-light warning — the visual effects the simulator contains. */
export const FLASHING_EFFECTS: readonly string[] = [
  'Flashing emergency beacons',
  'Changing visual alerts',
  'Emergency-scene lighting',
  'Fire, police, ambulance, roadway, and hazard-light effects',
];

export const FLASHING_WARNING_SUMMARY =
  'These effects simulate the visual pressure and distractions found on real emergency scenes.';

export interface LightingModeInfo {
  readonly key: LightingMode;
  readonly name: string;
  readonly description: string;
}

/** §3 the two lighting presentations offered to the learner. */
export const LIGHTING_MODES: readonly LightingModeInfo[] = [
  {
    key: 'standard',
    name: 'Standard Emergency Lighting',
    description:
      'Full emergency-scene lighting: flashing beacons, changing alerts, and roadway and hazard-light effects.',
  },
  {
    key: 'reduced',
    name: 'Reduced Flashing Mode',
    description:
      'Preserves all status information using steady lights, labels, icons, or pulsing borders instead of flashing.',
  },
];
