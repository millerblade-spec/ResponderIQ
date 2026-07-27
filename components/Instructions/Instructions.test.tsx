import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Instructions } from './Instructions';
import { SETTINGS_STORAGE_KEY, loadSettings } from '@/lib/settings/storage';
import { COLOR_LEGEND, FLASHING_EFFECTS } from '@/lib/instructions/content';

describe('Instructions and General Information (§3)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    delete document.documentElement.dataset.lighting;
  });

  it('renders the full color legend with all six approved meanings', () => {
    render(<Instructions />);
    expect(COLOR_LEGEND).toHaveLength(6);
    for (const entry of COLOR_LEGEND) {
      expect(screen.getByText(entry.meaning)).toBeInTheDocument();
      // color name is present as a non-color text label (color is not the only signal)
      expect(screen.getByText(`${entry.name}:`)).toBeInTheDocument();
    }
  });

  it('renders the flashing-light warning and every listed effect', () => {
    render(<Instructions />);
    expect(screen.getByRole('heading', { name: /flashing-light warning/i })).toBeInTheDocument();
    for (const effect of FLASHING_EFFECTS) {
      expect(screen.getByText(effect)).toBeInTheDocument();
    }
  });

  it('offers both Standard Emergency Lighting and Reduced Flashing Mode, standard selected by default', () => {
    render(<Instructions />);
    const standard = screen.getByRole('radio', { name: /standard emergency lighting/i });
    const reduced = screen.getByRole('radio', { name: /reduced flashing mode/i });
    expect(standard).toBeChecked();
    expect(reduced).not.toBeChecked();
  });

  it('persists Reduced Flashing Mode and applies it to the document immediately', () => {
    render(<Instructions />);
    fireEvent.click(screen.getByRole('radio', { name: /reduced flashing mode/i }));

    expect(screen.getByRole('radio', { name: /reduced flashing mode/i })).toBeChecked();
    expect(document.documentElement.dataset.lighting).toBe('reduced');
    expect(loadSettings().lightingMode).toBe('reduced');
  });

  it('reflects an already-stored Reduced Flashing preference', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ reducedMotion: false, theme: 'system', lightingMode: 'reduced' }),
    );
    render(<Instructions />);
    expect(screen.getByRole('radio', { name: /reduced flashing mode/i })).toBeChecked();
  });

  it('links back to the dashboard, keeping detailed instructions outside the simulator', () => {
    render(<Instructions />);
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', '/dashboard');
  });
});
