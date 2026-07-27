import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS, DEFAULT_AUDIO_SETTINGS, SETTINGS_STORAGE_KEY, loadSettings, saveSettings, resolveTheme } from './storage';

describe('settings storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('defaults to system theme and standard lighting', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('system');
    expect(DEFAULT_SETTINGS.lightingMode).toBe('standard');
  });

  it('round-trips a fully-specified saved value', () => {
    const value = { reducedMotion: true, theme: 'dark', lightingMode: 'reduced', audio: DEFAULT_AUDIO_SETTINGS } as const;
    saveSettings(value);
    expect(loadSettings()).toEqual(value);
  });

  it('persists audio settings (channels, captions, reduced sensory, mute) — no parallel store', () => {
    const audio = { ...DEFAULT_AUDIO_SETTINGS, master: 0.5, muted: true, reducedSensory: true, captionsOn: false };
    saveSettings({ reducedMotion: false, theme: 'system', lightingMode: 'standard', audio });
    expect(loadSettings().audio).toEqual(audio);
  });

  it('falls back to defaults on corrupt JSON rather than throwing', () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, '{not valid json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to the default for a field with the wrong type instead of trusting it', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ reducedMotion: 'yes', theme: 'purple', lightingMode: 7 }),
    );
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('validates each field independently — a bad theme does not discard a good reducedMotion', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ reducedMotion: true, theme: 'not-a-theme' }),
    );
    expect(loadSettings()).toEqual({ reducedMotion: true, theme: 'system', lightingMode: 'standard', audio: DEFAULT_AUDIO_SETTINGS });
  });

  it('ignores unknown extra fields without throwing', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ reducedMotion: true, somethingFromAFutureVersion: 'x' }),
    );
    expect(loadSettings()).toEqual({ reducedMotion: true, theme: 'system', lightingMode: 'standard', audio: DEFAULT_AUDIO_SETTINGS });
  });
});

describe('resolveTheme', () => {
  it('passes an explicit light or dark preference through unchanged', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('resolves system to a concrete light or dark value', () => {
    expect(['light', 'dark']).toContain(resolveTheme('system'));
  });
});
