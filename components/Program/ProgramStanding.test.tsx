import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ProgramStanding } from './ProgramStanding';
import { evaluateProgram } from '@/lib/rpos/progression';
import { makeEvidence, makePoorRun, makeStoredRun } from '@/lib/rpos/rpos.fixture';

describe('ProgramStanding', () => {
  it('shows the responder, their standing, and how many stages are complete', () => {
    const state = evaluateProgram(makeEvidence({ name: 'Dana Rivera', badgeId: 'B-9', runs: [makeStoredRun()] }));
    render(<ProgramStanding state={state} />);
    expect(screen.getByText('Dana Rivera')).toBeInTheDocument();
    expect(screen.getByText('B-9')).toBeInTheDocument();
    expect(screen.getByLabelText('Program standing')).toHaveTextContent('In progress');
    expect(screen.getByText(`${state.stagesComplete} of ${state.stageCount}`)).toBeInTheDocument();
  });

  it('states the next action in plain language', () => {
    const state = evaluateProgram(makeEvidence({ hasCompletedTruckCheck: false, truckCheckAttempts: 0 }));
    render(<ProgramStanding state={state} />);
    expect(screen.getByText(/Shift Readiness: complete a full truck check/i)).toBeInTheDocument();
  });

  it('raises a critical safety concern as an alert, never as a number', () => {
    const state = evaluateProgram(makeEvidence({ runs: [makeStoredRun(makePoorRun())] }));
    render(<ProgramStanding state={state} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/Critical Safety Concern Recorded/i)).toBeInTheDocument();
  });

  it('shows no concern block for a clean run', () => {
    const state = evaluateProgram(makeEvidence({ runs: [makeStoredRun()] }));
    render(<ProgramStanding state={state} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('labels every stage with its status and every requirement as met or not met in text', () => {
    const state = evaluateProgram(makeEvidence({ hasCompletedTruckCheck: false, truckCheckAttempts: 0 }));
    render(<ProgramStanding state={state} />);
    expect(screen.getByText('Shift Readiness')).toBeInTheDocument();
    // Status is a word, not only a color.
    expect(screen.getAllByText('Locked').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/— not met/).length).toBeGreaterThan(0);
  });

  it('lists every tracked competency with a level, and dashes where there is no evidence', () => {
    const state = evaluateProgram(makeEvidence({ runs: [] }));
    render(<ProgramStanding state={state} />);
    expect(screen.getByRole('row', { name: /Scene safety/i })).toBeInTheDocument();
    expect(screen.getAllByText('Not started').length).toBe(state.competencies.length);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
