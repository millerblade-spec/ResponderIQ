/**
 * Maps Scene Dynamics distraction state to audio (§ Step 11). Escalation audio
 * follows the EXISTING dynamics stages — no second timer system. Louder as a
 * distraction escalates; stopped when it is managed or resolved.
 */
import type { AudioController } from './controller';

/** The looping/one-shot audio event a distraction type drives, if any. */
export function dynamicsAudioEvent(type: string): string | null {
  switch (type) {
    case 'television':
      return 'television';
    case 'crowd':
      return 'crowd';
    case 'traffic':
      return 'traffic';
    case 'animal':
      return 'animal';
    case 'family':
      return 'family_interrupt';
    default:
      return null;
  }
}

/** Volume for a distraction at a given stage — grows toward its max stage. */
export function dynamicsVolume(stageIndex: number, maxStageIndex: number): number {
  if (maxStageIndex <= 0) return 0.4;
  const t = Math.min(1, stageIndex / maxStageIndex);
  return 0.3 + t * 0.6; // 0.3 → 0.9 across the progression
}

/**
 * Syncs a distraction's audio to its current state: louder as it escalates,
 * stopped when managed or resolved. Uses the controller's per-loop volume, so
 * managed/resolved distractions reduce or stop their related audio.
 */
export function syncDistractionAudio(
  controller: AudioController,
  issue: { type: string; stageIndex: number; resolved: boolean; managed: boolean },
  maxStageIndex: number,
): void {
  const event = dynamicsAudioEvent(issue.type);
  if (!event) return;
  if (issue.resolved || issue.managed) {
    controller.stop(event);
    return;
  }
  controller.play(event, { volume: dynamicsVolume(issue.stageIndex, maxStageIndex) });
}
