/**
 * The central audio controller (§ Step 11). All playback goes through here —
 * components never touch raw audio. It applies channel/master volume, mute,
 * Reduced Sensory Mode, clinical gating, one-shot de-duplication, captions, and
 * cleanup. It is fully testable without a browser: the actual sound comes from
 * an injected AudioSink, which tests replace with a recorder.
 */
import { audioAsset, type AudioChannel, type CaptionSource } from './manifest';
import { isGated, CLOSED_GATE, type GatingContext } from './gating';

export interface PlaybackHandle {
  readonly key: number;
  readonly assetId: string;
}

export interface AudioSink {
  play(assetId: string, opts: { loop: boolean; volume: number }): PlaybackHandle;
  stop(handle: PlaybackHandle): void;
  setVolume?(handle: PlaybackHandle, volume: number): void;
}

export interface CaptionEvent {
  readonly assetId: string;
  readonly source: CaptionSource;
  readonly text: string;
  readonly seq: number;
}

/** Stable empty snapshot so useSyncExternalStore has a constant server/initial reference. */
const EMPTY_CAPTIONS: readonly CaptionEvent[] = [];
/** How many recent captions the HUD snapshot exposes. */
const CAPTION_SNAPSHOT_SIZE = 6;

export interface AudioSettingsState {
  master: number;
  channels: Record<AudioChannel, number>;
  muted: boolean;
  reducedSensory: boolean;
  captionsOn: boolean;
}

export const DEFAULT_AUDIO_STATE: AudioSettingsState = {
  master: 0.8,
  channels: { partner_ron: 1, dispatch_radio: 1, emergency_warning: 1, scene_patient: 0.8, medical_equipment: 1 },
  muted: false,
  reducedSensory: false,
  captionsOn: true,
};

/** Reduced Sensory Mode lowers (does NOT remove) nonessential audio. */
const REDUCED_SENSORY_NONESSENTIAL_FACTOR = 0.35;

export interface PlayOptions {
  /** A key that makes this a play-once cue — repeats with the same key are ignored (dedupes rerenders). */
  readonly onceKey?: string;
  /** Overrides the asset default volume (0..1). */
  readonly volume?: number;
}

export class AudioController {
  private state: AudioSettingsState;
  private gate: GatingContext;
  private active = new Map<string, PlaybackHandle>(); // assetId -> handle (loops + current oneshots)
  private playedOnce = new Set<string>();
  private captionLog: CaptionEvent[] = [];
  private captionSeq = 0;
  private captionListeners = new Set<(c: CaptionEvent) => void>();
  /** Cached recent-captions slice — a fresh reference only when a caption is added. */
  private captionSnapshot: readonly CaptionEvent[] = EMPTY_CAPTIONS;
  private snapshotListeners = new Set<() => void>();

  constructor(private readonly sink: AudioSink, state: AudioSettingsState = DEFAULT_AUDIO_STATE, gate: GatingContext = CLOSED_GATE) {
    this.state = { ...state, channels: { ...state.channels } };
    this.gate = gate;
  }

  setGatingContext(gate: GatingContext) {
    this.gate = gate;
  }

  /** Effective 0..1 volume for an asset, after channel/master/mute/reduced-sensory. */
  effectiveVolume(channel: AudioChannel, base: number, essential: boolean): number {
    if (this.state.muted) return 0;
    const reduced = this.state.reducedSensory && !essential ? REDUCED_SENSORY_NONESSENTIAL_FACTOR : 1;
    return this.state.master * (this.state.channels[channel] ?? 1) * base * reduced;
  }

  /** Plays an audio event. Returns null if it was gated, deduped, or already looping. */
  play(assetId: string, opts: PlayOptions = {}): PlaybackHandle | null {
    const a = audioAsset(assetId);
    if (!a) return null;
    if (isGated(a, this.gate)) return null; // clinical gating — reject in logic
    if (opts.onceKey) {
      if (this.playedOnce.has(opts.onceKey)) return null; // dedupe rerenders
      this.playedOnce.add(opts.onceKey);
    }
    if (a.looping && this.active.has(assetId)) {
      // Already looping — don't restart, but honor a new volume (escalation raises it).
      const existing = this.active.get(assetId)!;
      if (opts.volume != null && this.sink.setVolume) {
        this.sink.setVolume(existing, this.effectiveVolume(a.channel, opts.volume, a.essential));
      }
      return existing;
    }

    const volume = this.effectiveVolume(a.channel, opts.volume ?? a.defaultVolume, a.essential);
    const handle = this.sink.play(assetId, { loop: a.looping, volume });
    this.active.set(assetId, handle);
    this.emitCaption({ assetId, source: a.captionSource, text: a.caption, seq: this.captionSeq++ });
    return handle;
  }

  stop(assetId: string) {
    const h = this.active.get(assetId);
    if (h) {
      this.sink.stop(h);
      this.active.delete(assetId);
    }
  }

  /** Re-applies volumes to all active loops (e.g. after a channel/master/reduced-sensory change). */
  private reapplyVolumes() {
    if (!this.sink.setVolume) return;
    for (const [assetId, handle] of this.active) {
      const a = audioAsset(assetId);
      if (a) this.sink.setVolume(handle, this.effectiveVolume(a.channel, a.defaultVolume, a.essential));
    }
  }

  setMasterVolume(v: number) {
    this.state.master = v;
    this.reapplyVolumes();
  }
  setChannelVolume(ch: AudioChannel, v: number) {
    this.state.channels[ch] = v;
    this.reapplyVolumes();
  }
  setMute(muted: boolean) {
    this.state.muted = muted;
    this.reapplyVolumes();
  }
  setReducedSensory(on: boolean) {
    this.state.reducedSensory = on;
    this.reapplyVolumes();
  }
  setCaptions(on: boolean) {
    this.state.captionsOn = on;
  }
  getState(): AudioSettingsState {
    return { ...this.state, channels: { ...this.state.channels } };
  }

  private emitCaption(c: CaptionEvent) {
    if (!this.state.captionsOn) return;
    this.captionLog.push(c);
    if (this.captionLog.length > 50) this.captionLog.shift();
    this.captionSnapshot = this.captionLog.slice(-CAPTION_SNAPSHOT_SIZE);
    for (const l of this.captionListeners) l(c);
    for (const l of this.snapshotListeners) l();
  }
  captions(): readonly CaptionEvent[] {
    return this.captionLog;
  }
  onCaption(cb: (c: CaptionEvent) => void): () => void {
    this.captionListeners.add(cb);
    return () => this.captionListeners.delete(cb);
  }

  // useSyncExternalStore adapters (bound so they can be passed by reference).
  // getCaptionsSnapshot returns a STABLE reference between caption emissions,
  // and subscribeCaptions notifies on every new caption — including any emitted
  // between render and effect (e.g. the dispatch alert), which the store re-reads.
  readonly subscribeCaptions = (cb: () => void): (() => void) => {
    this.snapshotListeners.add(cb);
    return () => this.snapshotListeners.delete(cb);
  };
  readonly getCaptionsSnapshot = (): readonly CaptionEvent[] => this.captionSnapshot;

  /** Stops all active audio and clears listeners — call on unmount / route change. */
  cleanup() {
    for (const handle of this.active.values()) this.sink.stop(handle);
    this.active.clear();
    this.captionListeners.clear();
    this.snapshotListeners.clear();
  }
}
