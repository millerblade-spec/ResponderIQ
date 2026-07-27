'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { AudioController, type CaptionEvent } from '@/lib/audio/controller';
import { createWebAudioSink } from '@/lib/audio/webAudioSink';
import type { AudioChannel } from '@/lib/audio/manifest';
import { loadSettings, saveSettings, DEFAULT_AUDIO_SETTINGS } from '@/lib/settings/storage';
import type { AudioSettings } from '@/lib/settings/types';

interface AudioContextValue {
  readonly controller: AudioController;
  readonly captions: readonly CaptionEvent[];
  readonly settings: AudioSettings;
  readonly setMaster: (v: number) => void;
  readonly setChannel: (ch: AudioChannel, v: number) => void;
  readonly setMuted: (v: boolean) => void;
  readonly setReducedSensory: (v: boolean) => void;
  readonly setCaptionsOn: (v: boolean) => void;
}

const Ctx = createContext<AudioContextValue | null>(null);

function readAudioSettings(): AudioSettings {
  try {
    return loadSettings().audio;
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

/**
 * Provides the single AudioController for the subtree (§ Step 11). Seeds it from
 * the persisted settings, streams captions to state for the HUD, and cleans up
 * all audio on unmount / route change. Settings changes update the controller
 * AND persist through the existing settings store.
 */
export function AudioProvider({ children }: { readonly children: React.ReactNode }) {
  const [{ controller, sink }] = useState(() => {
    const s = createWebAudioSink();
    return { controller: new AudioController(s, readAudioSettings()), sink: s };
  });
  const [settings, setSettings] = useState<AudioSettings>(() => controller.getState());
  // Captions live in the controller (an external store). useSyncExternalStore
  // reads them WITHOUT setState-in-effect, and re-reads the snapshot after
  // subscribing — so a caption emitted between render and effect (the dispatch
  // alert, played by a child effect) is still picked up.
  const captions = useSyncExternalStore(
    controller.subscribeCaptions,
    controller.getCaptionsSnapshot,
    controller.getCaptionsSnapshot,
  );

  useEffect(() => {
    // Stop all audio and release the AudioContext on unmount / route change.
    return () => {
      controller.cleanup();
      sink.close();
    };
  }, [controller, sink]);

  function persist(next: AudioSettings) {
    setSettings(next);
    try {
      const current = loadSettings();
      saveSettings({ ...current, audio: next });
    } catch {
      /* storage may be unavailable */
    }
  }

  const value: AudioContextValue = {
    controller,
    captions,
    settings,
    setMaster: (v) => {
      controller.setMasterVolume(v);
      persist({ ...settings, master: v });
    },
    setChannel: (ch, v) => {
      controller.setChannelVolume(ch, v);
      persist({ ...settings, channels: { ...settings.channels, [ch]: v } });
    },
    setMuted: (v) => {
      controller.setMute(v);
      persist({ ...settings, muted: v });
    },
    setReducedSensory: (v) => {
      controller.setReducedSensory(v);
      persist({ ...settings, reducedSensory: v });
    },
    setCaptionsOn: (v) => {
      controller.setCaptions(v);
      persist({ ...settings, captionsOn: v });
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAudio(): AudioContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAudio must be used within an AudioProvider');
  return v;
}

/** Optional variant that returns null outside a provider (for components that may render without audio). */
export function useAudioOptional(): AudioContextValue | null {
  return useContext(Ctx);
}
