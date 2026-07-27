import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Settings } from './Settings';
import { SETTINGS_STORAGE_KEY } from '@/lib/settings/storage';
import { LOCAL_ADMIN_REVIEW_STORAGE_KEY } from '@/components/SimulatorPlayer/SimulatorPlayer';

describe('Settings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    delete document.documentElement.dataset.reducedMotion;
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.lighting;
  });

  it('renders reduced motion unchecked by default', () => {
    render(<Settings />);
    expect(screen.getByRole('checkbox', { name: /reduce motion/i })).not.toBeChecked();
  });

  it('renders reduced motion checked when already stored', () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ reducedMotion: true }));
    render(<Settings />);
    expect(screen.getByRole('checkbox', { name: /reduce motion/i })).toBeChecked();
  });

  it('saves and applies reduced motion immediately when toggled on', () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole('checkbox', { name: /reduce motion/i }));

    expect(screen.getByRole('checkbox', { name: /reduce motion/i })).toBeChecked();
    expect(document.documentElement.dataset.reducedMotion).toBe('true');
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '')).toMatchObject({
      reducedMotion: true,
      theme: 'system',
      lightingMode: 'standard',
    });
  });

  it('changes theme to dark, persists it, and applies it to the document immediately', () => {
    render(<Settings />);
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '')).toMatchObject({
      reducedMotion: false,
      theme: 'dark',
      lightingMode: 'standard',
    });
  });

  it('changes emergency lighting to Reduced Flashing Mode and persists it', () => {
    render(<Settings />);
    fireEvent.change(screen.getByLabelText('Emergency lighting'), { target: { value: 'reduced' } });

    expect(document.documentElement.dataset.lighting).toBe('reduced');
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '')).toMatchObject({
      reducedMotion: false,
      theme: 'system',
      lightingMode: 'reduced',
    });
  });

  it('reflects an already-stored theme and lighting preference', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ reducedMotion: false, theme: 'light', lightingMode: 'reduced' }),
    );
    render(<Settings />);
    expect(screen.getByLabelText('Theme')).toHaveValue('light');
    expect(screen.getByLabelText('Emergency lighting')).toHaveValue('reduced');
  });

  it('shows no local review data and a disabled clear button when none is saved', () => {
    render(<Settings />);
    expect(screen.getByText(/no completed playthrough is currently saved/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear local review data/i })).toBeDisabled();
  });

  it('shows saved local review data and an enabled clear button when present', () => {
    window.localStorage.setItem(LOCAL_ADMIN_REVIEW_STORAGE_KEY, JSON.stringify({ phase: 'complete' }));
    render(<Settings />);
    expect(screen.getByText(/has a completed bls-01 playthrough saved locally/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear local review data/i })).toBeEnabled();
  });

  it('requires confirmation before clearing, and cancel leaves the data intact', () => {
    window.localStorage.setItem(LOCAL_ADMIN_REVIEW_STORAGE_KEY, JSON.stringify({ phase: 'complete' }));
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: /clear local review data/i }));
    expect(screen.getByText(/can't be undone/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(window.localStorage.getItem(LOCAL_ADMIN_REVIEW_STORAGE_KEY)).not.toBeNull();
    expect(screen.queryByText(/cleared\./i)).not.toBeInTheDocument();
  });

  it('clears local review data after explicit confirmation', () => {
    window.localStorage.setItem(LOCAL_ADMIN_REVIEW_STORAGE_KEY, JSON.stringify({ phase: 'complete' }));
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: /clear local review data/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, clear it/i }));

    expect(window.localStorage.getItem(LOCAL_ADMIN_REVIEW_STORAGE_KEY)).toBeNull();
    expect(screen.getByText(/cleared\./i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear local review data/i })).toBeDisabled();
  });

  it('links back to the dashboard', () => {
    render(<Settings />);
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', '/dashboard');
  });
});
