import { audioAsset } from './manifest';
import type { AudioSink, PlaybackHandle } from './controller';

/**
 * Browser AudioSink backed by the Web Audio API, producing ONLY synthesized
 * placeholder sound (tones / filtered noise) — never a third-party asset.
 * 'silence' assets make no sound (captioned instead). Safe to construct in any
 * environment; it lazily creates the AudioContext on first real playback.
 */
export function createWebAudioSink(): AudioSink & { close: () => void } {
  let ctx: AudioContext | null = null;
  const nodes = new Map<number, { osc?: OscillatorNode; src?: AudioBufferSourceNode; gain: GainNode }>();
  let key = 0;

  function context(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    return ctx;
  }

  function noiseBuffer(c: AudioContext): AudioBuffer {
    const buf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (i % 97) / 97 - 0.5; // deterministic pseudo-noise, no Math.random
    return buf;
  }

  return {
    play(assetId, opts): PlaybackHandle {
      const handle: PlaybackHandle = { key: key++, assetId };
      const a = audioAsset(assetId);
      const c = context();
      if (!a || !c || a.generator === 'silence' || opts.volume <= 0) return handle; // captioned-only / muted
      const gain = c.createGain();
      gain.gain.value = Math.min(1, opts.volume) * 0.2; // keep placeholder tones gentle
      gain.connect(c.destination);
      if (a.generator === 'tone') {
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = a.channel === 'emergency_warning' ? 660 : a.channel === 'medical_equipment' ? 880 : 440;
        osc.connect(gain);
        osc.start();
        if (!opts.loop && a.durationMs) osc.stop(c.currentTime + a.durationMs / 1000);
        nodes.set(handle.key, { osc, gain });
      } else {
        const src = c.createBufferSource();
        src.buffer = noiseBuffer(c);
        src.loop = opts.loop;
        src.connect(gain);
        src.start();
        if (!opts.loop && a.durationMs) src.stop(c.currentTime + a.durationMs / 1000);
        nodes.set(handle.key, { src, gain });
      }
      return handle;
    },
    stop(handle) {
      const n = nodes.get(handle.key);
      if (!n) return;
      try {
        n.osc?.stop();
        n.src?.stop();
      } catch {
        // already stopped
      }
      n.gain.disconnect();
      nodes.delete(handle.key);
    },
    setVolume(handle, volume) {
      const n = nodes.get(handle.key);
      if (n) n.gain.gain.value = Math.min(1, volume) * 0.2;
    },
    close() {
      for (const n of nodes.values()) {
        try {
          n.osc?.stop();
          n.src?.stop();
        } catch {
          /* noop */
        }
      }
      nodes.clear();
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
