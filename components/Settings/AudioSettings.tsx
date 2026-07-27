'use client';

import { useState } from 'react';
import { AUDIO_CHANNELS, CHANNEL_LABELS, type AudioChannel } from '@/lib/audio/manifest';
import { DEFAULT_AUDIO_SETTINGS, loadSettings, saveSettings } from '@/lib/settings/storage';
import type { AudioSettings as AudioSettingsType } from '@/lib/settings/types';
import styles from './Settings.module.css';

/** Detailed audio mixer (§ Step 11). Lives in Settings; the sim shows only compact controls. */
export function AudioSettings() {
  const [audio, setAudio] = useState<AudioSettingsType>(() =>
    typeof window === 'undefined' ? DEFAULT_AUDIO_SETTINGS : loadSettings().audio,
  );

  function update(next: AudioSettingsType) {
    setAudio(next);
    try {
      saveSettings({ ...loadSettings(), audio: next });
    } catch {
      /* storage may be unavailable */
    }
  }

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <section className={styles.section}>
      <h2 className={styles.subheading}>Audio</h2>

      <label className={styles.selectRow}>
        <span className={styles.toggleLabel}>Master volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          aria-label="Master volume"
          value={audio.master}
          onChange={(e) => update({ ...audio, master: Number(e.target.value) })}
        />
        <span className={styles.hint}>{pct(audio.master)}</span>
      </label>

      {AUDIO_CHANNELS.map((ch: AudioChannel) => (
        <label key={ch} className={styles.selectRow}>
          <span className={styles.toggleLabel}>{CHANNEL_LABELS[ch]}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            aria-label={`${CHANNEL_LABELS[ch]} volume`}
            value={audio.channels[ch]}
            onChange={(e) => update({ ...audio, channels: { ...audio.channels, [ch]: Number(e.target.value) } })}
          />
          <span className={styles.hint}>{pct(audio.channels[ch])}</span>
        </label>
      ))}

      <label className={styles.toggleRow}>
        <input type="checkbox" checked={audio.captionsOn} onChange={(e) => update({ ...audio, captionsOn: e.target.checked })} />
        <span>
          <span className={styles.toggleLabel}>Captions</span>
          <span className={styles.toggleHint}>Show captions identifying the source (Dispatch, Partner Ron, Monitor…) as audio plays.</span>
        </span>
      </label>

      <label className={styles.toggleRow}>
        <input type="checkbox" checked={audio.reducedSensory} onChange={(e) => update({ ...audio, reducedSensory: e.target.checked })} />
        <span>
          <span className={styles.toggleLabel}>Reduced Sensory Mode</span>
          <span className={styles.toggleHint}>Lowers nonessential environmental audio and overlapping voices while preserving safety-critical cues. Not the same as mute.</span>
        </span>
      </label>

      <label className={styles.toggleRow}>
        <input type="checkbox" checked={audio.muted} onChange={(e) => update({ ...audio, muted: e.target.checked })} />
        <span>
          <span className={styles.toggleLabel}>Mute all</span>
          <span className={styles.toggleHint}>Silences all audio; captions still appear if enabled.</span>
        </span>
      </label>
    </section>
  );
}
