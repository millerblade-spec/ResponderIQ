/**
 * Fire-engine arrival audio sequence (§11), scheduled on the shared mission
 * clock — no second timer system, and one-shot cues are de-duped so a rerender
 * can't replay them. Returns the scheduled ids so the caller can cancel on
 * cleanup.
 */
import type { MissionClock } from '@/lib/engine/missionClock';
import type { AudioController } from './controller';

/** The approved order, with second offsets from the moment the sequence starts. */
export const ENGINE_ARRIVAL_SEQUENCE: readonly { readonly event: string; readonly atOffsetSeconds: number }[] = [
  { event: 'siren_approach', atOffsetSeconds: 0 },
  { event: 'siren_wind_down', atOffsetSeconds: 2 },
  { event: 'air_brakes', atOffsetSeconds: 3 },
  { event: 'engine_idle', atOffsetSeconds: 4 },
  { event: 'ron_engine_here', atOffsetSeconds: 4 },
];

/**
 * Plays the arrival sequence in order, then the fire officer's offer
 * `officerDelaySeconds` after Ron's line (§11).
 */
export function scheduleEngineArrivalAudio(
  controller: AudioController,
  clock: MissionClock,
  keyPrefix: string,
  officerDelaySeconds = 5,
): readonly number[] {
  const ids: number[] = [];
  const ronOffset = ENGINE_ARRIVAL_SEQUENCE.find((s) => s.event === 'ron_engine_here')?.atOffsetSeconds ?? 4;

  for (const step of ENGINE_ARRIVAL_SEQUENCE) {
    const key = `${keyPrefix}:${step.event}`;
    if (step.atOffsetSeconds === 0) {
      controller.play(step.event, { onceKey: key });
    } else {
      ids.push(clock.after(step.atOffsetSeconds, () => controller.play(step.event, { onceKey: key })));
    }
  }
  ids.push(
    clock.after(ronOffset + officerDelaySeconds, () =>
      controller.play('fire_officer_offer', { onceKey: `${keyPrefix}:officer` }),
    ),
  );
  return ids;
}
