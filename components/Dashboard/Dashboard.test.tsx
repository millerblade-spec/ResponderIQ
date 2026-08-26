import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import { bls01 } from '@/lib/scenarios/bls-01';
import { LOCAL_ADMIN_REVIEW_STORAGE_KEY } from '@/components/SimulatorPlayer/SimulatorPlayer';
import type { SceneState } from '@/lib/engine/types';

function stateWithCompletion(completion: SceneState['completion']): SceneState {
  return {
    phase: 'complete',
    elapsedMinutes: completion?.atMinute ?? 0,
    resources: {
      additional_ems: { kind: 'additional_ems', status: 'not_requested' },
      fire_lift_assist: { kind: 'fire_lift_assist', status: 'not_requested' },
    },
    hazardFlags: [],
    familyState: 'calm',
    stairChairPrepped: false,
    patientCanBearWeight: true,
    differential: { current: [], history: [] },
    timeline: [],
    criticalFlags: [],
    actionsTaken: [],
    firedEventIds: [],
    dynamicEvents: [],
    completion,
  };
}

describe('Dashboard', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows the real scenario title and dispatch summary', () => {
    render(<Dashboard />);
    expect(screen.getByText(bls01.title)).toBeInTheDocument();
    expect(screen.getByText(bls01.dispatchSummary)).toBeInTheDocument();
  });

  it('shows "Not yet attempted" when no local playthrough is saved', () => {
    render(<Dashboard />);
    expect(screen.getByText('Not yet attempted')).toBeInTheDocument();
  });

  it('shows real completion status and minute for a transport-initiated playthrough', () => {
    const state = stateWithCompletion({ status: 'transport_initiated', atMinute: 14 });
    window.localStorage.setItem(LOCAL_ADMIN_REVIEW_STORAGE_KEY, JSON.stringify(state));
    render(<Dashboard />);
    expect(screen.getByText(/completed.*transport initiated at minute 14/i)).toBeInTheDocument();
  });

  it('shows real completion status and minute for an unsafe-extrication playthrough', () => {
    const state = stateWithCompletion({ status: 'unsafe_extrication_completed', atMinute: 9 });
    window.localStorage.setItem(LOCAL_ADMIN_REVIEW_STORAGE_KEY, JSON.stringify(state));
    render(<Dashboard />);
    expect(screen.getByText(/completed.*unsafe extrication completed at minute 9/i)).toBeInTheDocument();
  });

  it('falls back to "Not yet attempted" for unparseable saved data rather than throwing', () => {
    window.localStorage.setItem(LOCAL_ADMIN_REVIEW_STORAGE_KEY, '{not valid json');
    render(<Dashboard />);
    expect(screen.getByText('Not yet attempted')).toBeInTheDocument();
  });

  it('links to the scenario and to settings', () => {
    render(<Dashboard />);
    expect(screen.getByRole('link', { name: new RegExp(bls01.title) })).toHaveAttribute(
      'href',
      `/scenarios/${bls01.id}`,
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('links to the Paramedic Book', () => {
    render(<Dashboard />);
    expect(screen.getByRole('link', { name: 'Paramedic Book' })).toHaveAttribute('href', '/book');
  });

  it('never shows a score, percentage, or points anywhere on the dashboard', () => {
    const state = stateWithCompletion({ status: 'transport_initiated', atMinute: 14 });
    window.localStorage.setItem(LOCAL_ADMIN_REVIEW_STORAGE_KEY, JSON.stringify(state));
    const { container } = render(<Dashboard />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bscore\b/i);
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/\bpoints?\b/i);
  });
});
