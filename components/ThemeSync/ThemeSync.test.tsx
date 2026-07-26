import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeSync } from './ThemeSync';
import { SETTINGS_STORAGE_KEY } from '@/lib/settings/storage';

describe('ThemeSync (§2)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.lighting;
  });

  it('applies an explicit dark theme and the stored lighting mode to <html>', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ reducedMotion: false, theme: 'dark', lightingMode: 'standard' }),
    );
    render(<ThemeSync />);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.lighting).toBe('standard');
  });

  it('applies an explicit light theme and Reduced Flashing Mode to <html>', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ reducedMotion: false, theme: 'light', lightingMode: 'reduced' }),
    );
    render(<ThemeSync />);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.lighting).toBe('reduced');
  });

  it('resolves the default (no stored settings) to a concrete light or dark theme', () => {
    render(<ThemeSync />);
    expect(['light', 'dark']).toContain(document.documentElement.dataset.theme);
    expect(document.documentElement.dataset.lighting).toBe('standard');
  });
});
