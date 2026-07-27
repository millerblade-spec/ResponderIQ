'use client';

import { useAudioOptional } from './AudioProvider';
import styles from './AudioHud.module.css';

/**
 * Compact in-simulator audio controls + live captions (§ Step 11). Only the
 * essentials appear here (mute, captions, Reduced Sensory Mode); the detailed
 * per-channel mixer lives in Settings. Renders nothing outside an AudioProvider.
 */
export function AudioHud() {
  const audio = useAudioOptional();
  if (!audio) return null;
  const { settings, captions, setMuted, setCaptionsOn, setReducedSensory } = audio;

  return (
    <div>
      <div className={styles.hud} role="group" aria-label="Audio controls">
        <button
          type="button"
          className={`${styles.chip} ${settings.muted ? styles.warn : ''}`}
          aria-pressed={settings.muted}
          onClick={() => setMuted(!settings.muted)}
        >
          {settings.muted ? '🔇 Muted' : '🔊 Sound on'}
        </button>
        <button
          type="button"
          className={`${styles.chip} ${settings.captionsOn ? styles.on : ''}`}
          aria-pressed={settings.captionsOn}
          onClick={() => setCaptionsOn(!settings.captionsOn)}
        >
          CC {settings.captionsOn ? 'on' : 'off'}
        </button>
        <button
          type="button"
          className={`${styles.chip} ${settings.reducedSensory ? styles.on : ''}`}
          aria-pressed={settings.reducedSensory}
          onClick={() => setReducedSensory(!settings.reducedSensory)}
        >
          Reduced sensory {settings.reducedSensory ? 'on' : 'off'}
        </button>
      </div>

      {settings.captionsOn && (
        <div className={styles.captions} aria-label="Captions" aria-live="polite">
          {captions.length === 0 ? (
            <span className={styles.empty}>Captions will appear here as audio plays.</span>
          ) : (
            captions.map((c) => (
              <div key={c.seq} className={styles.caption}>
                <span className={styles.captionSource}>{c.source}</span>
                <span>{c.text}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
