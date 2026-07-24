import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { SceneState } from '@/lib/engine/types';

function alreadyCompleteState(): SceneState {
  return {
    phase: 'complete',
    elapsedMinutes: 14,
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
    completion: { status: 'transport_initiated', atMinute: 14 },
  };
}

const saveCompletedRunMock = vi.fn();

vi.mock('@/lib/scenarios/bls-01', () => ({
  bls01: {
    id: 'bls-01',
    title: 'Mock scenario',
    dispatchSummary: 'Mock dispatch',
    buildInitialState: alreadyCompleteState,
    actions: [],
    events: [],
    isComplete: (state: SceneState) => state.phase === 'complete',
    relevantBehavioralTags: [],
  },
  getSceneNarrative: () => 'Mock narrative',
}));

vi.mock('@/lib/review/actions', () => ({
  saveCompletedRun: (...args: unknown[]) => saveCompletedRunMock(...args),
}));

describe('SimulatorPlayer save integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
    saveCompletedRunMock.mockReset();
  });

  it('automatically attempts a save once the run is fully closed, with a stable UUID evaluationId', async () => {
    saveCompletedRunMock.mockResolvedValue({ status: 'saved', evaluationId: 'whatever' });
    const { SimulatorPlayer } = await import('./SimulatorPlayer');

    await act(async () => {
      render(<SimulatorPlayer />);
    });

    await waitFor(() => expect(saveCompletedRunMock).toHaveBeenCalledTimes(1));
    const [payload] = saveCompletedRunMock.mock.calls[0];
    expect(payload.scenarioId).toBe('bls-01');
    expect(payload.evaluationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(payload.state.completion).toEqual({ status: 'transport_initiated', atMinute: 14 });
  });

  it('never sends dynamicEvents in the save payload', async () => {
    saveCompletedRunMock.mockResolvedValue({ status: 'saved', evaluationId: 'whatever' });
    const { SimulatorPlayer } = await import('./SimulatorPlayer');

    await act(async () => {
      render(<SimulatorPlayer />);
    });

    await waitFor(() => expect(saveCompletedRunMock).toHaveBeenCalled());
    const [payload] = saveCompletedRunMock.mock.calls[0];
    expect(payload.state).not.toHaveProperty('dynamicEvents');
  });

  it('shows "Results saved." after a successful save, and never mentions a score', async () => {
    saveCompletedRunMock.mockResolvedValue({ status: 'saved', evaluationId: 'whatever' });
    const { SimulatorPlayer } = await import('./SimulatorPlayer');

    const { container } = render(<SimulatorPlayer />);
    await waitFor(() => expect(screen.getByText('Results saved.')).toBeInTheDocument());
    expect(container.textContent ?? '').not.toMatch(/\bscore\b/i);
  });

  it('treats already_saved the same as saved (this is what makes a retry look successful, not alarming)', async () => {
    saveCompletedRunMock.mockResolvedValue({ status: 'already_saved', evaluationId: 'whatever' });
    const { SimulatorPlayer } = await import('./SimulatorPlayer');

    render(<SimulatorPlayer />);
    await waitFor(() => expect(screen.getByText('Results saved.')).toBeInTheDocument());
  });

  it('shows an honest not-saved state with a retry option when the save fails, and never claims it saved', async () => {
    saveCompletedRunMock.mockResolvedValue({ status: 'persistence_error' });
    const { SimulatorPlayer } = await import('./SimulatorPlayer');

    render(<SimulatorPlayer />);
    await waitFor(() => expect(screen.getByText(/were not saved/i)).toBeInTheDocument());
    expect(screen.queryByText('Results saved.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry save/i })).toBeInTheDocument();
  });

  it('retrying reuses the exact same evaluationId (this is the actual idempotency contract)', async () => {
    saveCompletedRunMock.mockResolvedValueOnce({ status: 'persistence_error' });
    const { SimulatorPlayer } = await import('./SimulatorPlayer');

    render(<SimulatorPlayer />);
    await waitFor(() => expect(screen.getByRole('button', { name: /retry save/i })).toBeInTheDocument());

    saveCompletedRunMock.mockResolvedValueOnce({ status: 'saved', evaluationId: 'whatever' });
    fireEvent.click(screen.getByRole('button', { name: /retry save/i }));

    await waitFor(() => expect(saveCompletedRunMock).toHaveBeenCalledTimes(2));
    const firstEvaluationId = saveCompletedRunMock.mock.calls[0][0].evaluationId;
    const secondEvaluationId = saveCompletedRunMock.mock.calls[1][0].evaluationId;
    expect(secondEvaluationId).toBe(firstEvaluationId);
  });

  it('disables the retry button while a retry is in flight, to prevent a double-click duplicate attempt', async () => {
    saveCompletedRunMock.mockResolvedValueOnce({ status: 'persistence_error' });
    const { SimulatorPlayer } = await import('./SimulatorPlayer');

    render(<SimulatorPlayer />);
    await waitFor(() => expect(screen.getByRole('button', { name: /retry save/i })).toBeInTheDocument());

    let resolveRetry: (value: { status: string; evaluationId?: string }) => void = () => {};
    saveCompletedRunMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRetry = resolve;
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /retry save/i }));

    await waitFor(() => expect(screen.getByText(/saving your results/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /retry save/i })).not.toBeInTheDocument();

    await act(async () => {
      resolveRetry({ status: 'saved', evaluationId: 'whatever' });
    });
  });

  it('still keeps a same-browser local recovery copy alongside the real save', async () => {
    saveCompletedRunMock.mockResolvedValue({ status: 'saved', evaluationId: 'whatever' });
    const { SimulatorPlayer } = await import('./SimulatorPlayer');
    const { LOCAL_ADMIN_REVIEW_STORAGE_KEY } = await import('./SimulatorPlayer');

    render(<SimulatorPlayer />);
    await waitFor(() => expect(window.localStorage.getItem(LOCAL_ADMIN_REVIEW_STORAGE_KEY)).not.toBeNull());
  });
});
