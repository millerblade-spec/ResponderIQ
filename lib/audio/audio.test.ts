import { describe, it, expect } from 'vitest';
import { AUDIO_MANIFEST, audioAsset, AUDIO_CHANNELS, PLACEHOLDER_NOTE } from './manifest';
import { AudioController, DEFAULT_AUDIO_STATE, type AudioSink, type PlaybackHandle } from './controller';
import { isGated } from './gating';
import { scheduleEngineArrivalAudio } from './sequence';
import { syncDistractionAudio, dynamicsVolume } from './dynamicsAudio';
import { MissionClock, type TimeSource } from '@/lib/engine/missionClock';

/** A sink that records every call — no browser audio device needed. */
function recordingSink() {
  const played: { assetId: string; loop: boolean; volume: number }[] = [];
  const stopped: string[] = [];
  const volumes: { assetId: string; volume: number }[] = [];
  let key = 0;
  const handles = new Map<number, string>();
  const sink: AudioSink = {
    play(assetId, opts) {
      const h: PlaybackHandle = { key: key++, assetId };
      handles.set(h.key, assetId);
      played.push({ assetId, ...opts });
      return h;
    },
    stop(h) {
      stopped.push(h.assetId);
    },
    setVolume(h, volume) {
      volumes.push({ assetId: handles.get(h.key) ?? '?', volume });
    },
  };
  return { sink, played, stopped, volumes };
}

const OPEN_GATE = { clinicalComplete: () => true, equipmentInUse: () => true };

class ManualTimeSource implements TimeSource {
  private t = 0;
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

describe('audio manifest (§ Step 11)', () => {
  it('every entry is a clearly-marked placeholder with channel, caption, and source', () => {
    for (const a of Object.values(AUDIO_MANIFEST)) {
      expect(a.replacementStatus).toBe('placeholder');
      expect(a.licensingStatus).toBe('placeholder');
      expect(a.notes).toMatch(/placeholder/i);
      expect(AUDIO_CHANNELS).toContain(a.channel);
      expect(a.caption.length).toBeGreaterThan(0);
    }
    expect(PLACEHOLDER_NOTE).toMatch(/replace with approved/i);
  });

  it('the dispatch alert lasts three seconds', () => {
    expect(audioAsset('dispatch_alert')?.durationMs).toBe(3000);
  });

  it('every event used by the arrival sequence exists in the manifest', () => {
    for (const ev of ['siren_approach', 'siren_wind_down', 'air_brakes', 'engine_idle', 'ron_engine_here', 'fire_officer_offer']) {
      expect(audioAsset(ev)).toBeDefined();
    }
  });
});

describe('audio controller — volume, mute, captions, dedupe, cleanup', () => {
  it('applies master and channel volume', () => {
    const { sink, played } = recordingSink();
    const c = new AudioController(sink, { ...DEFAULT_AUDIO_STATE, master: 0.5, channels: { ...DEFAULT_AUDIO_STATE.channels, dispatch_radio: 0.5 } }, OPEN_GATE);
    c.play('dispatch_alert'); // defaultVolume 0.8 * 0.5 master * 0.5 channel = 0.2
    expect(played[0].volume).toBeCloseTo(0.2, 5);
  });

  it('mute silences playback', () => {
    const { sink, played } = recordingSink();
    const c = new AudioController(sink, { ...DEFAULT_AUDIO_STATE, muted: true }, OPEN_GATE);
    c.play('radio_squelch');
    expect(played[0].volume).toBe(0);
  });

  it('emits a caption with the source when audio plays, and can be turned off', () => {
    const { sink } = recordingSink();
    const c = new AudioController(sink, DEFAULT_AUDIO_STATE, OPEN_GATE);
    c.play('ron_engine_here');
    expect(c.captions().at(-1)).toMatchObject({ source: 'Partner Ron', text: /Engine’s here/ });
    c.setCaptions(false);
    c.play('radio_squelch');
    expect(c.captions().at(-1)?.source).toBe('Partner Ron'); // no new caption added
  });

  it('does not replay a one-shot with the same onceKey (dedupes rerenders)', () => {
    const { sink, played } = recordingSink();
    const c = new AudioController(sink, DEFAULT_AUDIO_STATE, OPEN_GATE);
    c.play('mic_click', { onceKey: 'k1' });
    c.play('mic_click', { onceKey: 'k1' });
    expect(played.filter((p) => p.assetId === 'mic_click')).toHaveLength(1);
  });

  it('starts a loop once and stops it cleanly; cleanup stops everything', () => {
    const { sink, played, stopped } = recordingSink();
    const c = new AudioController(sink, DEFAULT_AUDIO_STATE, OPEN_GATE);
    c.play('rain');
    c.play('rain'); // already looping — no restart
    expect(played.filter((p) => p.assetId === 'rain')).toHaveLength(1);
    c.play('traffic');
    c.cleanup();
    expect(stopped).toContain('rain');
    expect(stopped).toContain('traffic');
  });

  it('reduces nonessential audio in Reduced Sensory Mode but preserves critical cues', () => {
    const { sink, played } = recordingSink();
    const c = new AudioController(sink, { ...DEFAULT_AUDIO_STATE, reducedSensory: true, channels: { ...DEFAULT_AUDIO_STATE.channels, scene_patient: 1, emergency_warning: 1 } }, OPEN_GATE);
    c.play('rain'); // nonessential -> reduced
    c.play('siren_approach'); // essential -> preserved
    const rain = played.find((p) => p.assetId === 'rain')!;
    const siren = played.find((p) => p.assetId === 'siren_approach')!;
    expect(rain.volume).toBeLessThan(0.8 * 0.3); // clearly lowered
    expect(siren.volume).toBeCloseTo(0.8 * 0.7, 5); // master 0.8 * base 0.7, not reduced
  });
});

describe('audio clinical gating (§ Step 11)', () => {
  it('blocks monitor/ECG/12-lead/suction audio until their condition is met', () => {
    expect(isGated(audioAsset('ecg_tone')!, { clinicalComplete: () => false, equipmentInUse: () => false })).toBe(true);
    expect(isGated(audioAsset('ecg_tone')!, { clinicalComplete: (id) => id === 'apply_monitor', equipmentInUse: () => false })).toBe(false);
    expect(isGated(audioAsset('twelve_lead_tone')!, { clinicalComplete: (id) => id === 'apply_monitor', equipmentInUse: () => false })).toBe(true); // needs 12-lead
    expect(isGated(audioAsset('suction')!, { clinicalComplete: () => true, equipmentInUse: (id) => id === 'portable_suction' })).toBe(false);
    expect(isGated(audioAsset('suction')!, { clinicalComplete: () => true, equipmentInUse: () => false })).toBe(true);
  });

  it('the controller refuses gated playback (no sound, no caption)', () => {
    const { sink, played } = recordingSink();
    const c = new AudioController(sink, DEFAULT_AUDIO_STATE, { clinicalComplete: () => false, equipmentInUse: () => false });
    expect(c.play('ecg_tone')).toBeNull();
    expect(played).toHaveLength(0);
    expect(c.captions()).toHaveLength(0);
    // After the monitor is applied, it plays.
    c.setGatingContext({ clinicalComplete: (id) => id === 'apply_monitor', equipmentInUse: () => false });
    expect(c.play('ecg_tone')).not.toBeNull();
  });
});

describe('fire arrival audio sequence (§11)', () => {
  it('plays in the approved order with air brakes before engine idle and the officer 5s after Ron', () => {
    const { sink, played } = recordingSink();
    const c = new AudioController(sink, DEFAULT_AUDIO_STATE, OPEN_GATE);
    const source = new ManualTimeSource();
    const clock = new MissionClock(source);
    clock.start();
    scheduleEngineArrivalAudio(c, clock, 'e1', 5);
    // Drive the clock forward.
    for (let s = 0; s <= 10; s++) {
      source.advance(1000);
      clock.tick();
    }
    const order = played.map((p) => p.assetId);
    expect(order.slice(0, 6)).toEqual(['siren_approach', 'siren_wind_down', 'air_brakes', 'engine_idle', 'ron_engine_here', 'fire_officer_offer']);
    expect(order.indexOf('air_brakes')).toBeLessThan(order.indexOf('engine_idle'));
    expect(order.indexOf('ron_engine_here')).toBeLessThan(order.indexOf('fire_officer_offer'));
  });

  it('does not double-play the sequence if scheduled twice with the same key', () => {
    const { sink, played } = recordingSink();
    const c = new AudioController(sink, DEFAULT_AUDIO_STATE, OPEN_GATE);
    const source = new ManualTimeSource();
    const clock = new MissionClock(source);
    clock.start();
    scheduleEngineArrivalAudio(c, clock, 'e1');
    scheduleEngineArrivalAudio(c, clock, 'e1'); // same key -> deduped
    expect(played.filter((p) => p.assetId === 'siren_approach')).toHaveLength(1);
  });
});

describe('scene dynamics audio (§20 integration)', () => {
  it('escalates louder with the stage and stops when managed or resolved', () => {
    const { sink, volumes, stopped } = recordingSink();
    const c = new AudioController(sink, DEFAULT_AUDIO_STATE, OPEN_GATE);
    syncDistractionAudio(c, { type: 'television', stageIndex: 0, resolved: false, managed: false }, 3);
    syncDistractionAudio(c, { type: 'television', stageIndex: 3, resolved: false, managed: false }, 3);
    // The louder stage re-applied a higher volume.
    expect(volumes.at(-1)!.volume).toBeGreaterThan(0);
    expect(dynamicsVolume(3, 3)).toBeGreaterThan(dynamicsVolume(0, 3));
    // Managing it stops the audio.
    syncDistractionAudio(c, { type: 'television', stageIndex: 3, resolved: false, managed: true }, 3);
    expect(stopped).toContain('television');
  });
});
