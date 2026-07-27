import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RunComplete, type RunFacts } from './RunComplete';
import { makeRun } from '@/lib/review/operationalRun.fixture';

function facts(overrides: Partial<RunFacts> = {}): RunFacts {
  const { learner, reflection, feedback, ...rest } = makeRun();
  void learner;
  void reflection;
  void feedback;
  return { ...rest, ...overrides };
}

function renderFlow(f: RunFacts = facts()) {
  const saveRun = vi.fn().mockResolvedValue({ status: 'saved', evaluationId: f.evaluationId, attemptNumber: 1 });
  render(<RunComplete facts={f} saveRun={saveRun} />);
  return { saveRun };
}

function signIn() {
  fireEvent.change(screen.getByLabelText(/learner name/i), { target: { value: 'Alex Medic' } });
  fireEvent.change(screen.getByLabelText(/badge or employee id/i), { target: { value: 'B-1234' } });
  fireEvent.click(screen.getByRole('button', { name: /continue to reflection/i }));
}

function answerRequiredReflection() {
  fireEvent.change(screen.getByLabelText(/what do you believe went well/i), { target: { value: 'Kept the family calm.' } });
  fireEvent.change(screen.getByLabelText(/what did you believe was happening with the patient/i), { target: { value: 'Syncope from a-fib.' } });
}

describe('RunComplete — agency sign-in & sequence (§23, §24, §27)', () => {
  it('requires a learner name and badge/employee id before continuing', () => {
    renderFlow();
    const cont = screen.getByRole('button', { name: /continue to reflection/i });
    expect(cont).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/learner name/i), { target: { value: 'Alex' } });
    expect(cont).toBeDisabled(); // badge still missing
    fireEvent.change(screen.getByLabelText(/badge or employee id/i), { target: { value: 'B-1' } });
    expect(cont).toBeEnabled();
  });

  it('asks for reflection BEFORE feedback, and gates on the required reflection', () => {
    renderFlow();
    signIn();
    expect(screen.getByRole('heading', { name: /your reflection/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /feedback on responderiq/i })).toBeNull();

    const toFeedback = screen.getByRole('button', { name: /continue to feedback/i });
    expect(toFeedback).toBeDisabled();
    answerRequiredReflection();
    expect(toFeedback).toBeEnabled();
    fireEvent.click(toFeedback);
    expect(screen.getByRole('heading', { name: /feedback on responderiq/i })).toBeInTheDocument();
  });
});

describe('RunComplete — debrief (§25, §26)', () => {
  it('persists the run with reflection and feedback, then shows a debrief with NO score', async () => {
    const { saveRun } = renderFlow();
    signIn();
    answerRequiredReflection();
    fireEvent.click(screen.getByRole('button', { name: /continue to feedback/i }));
    fireEvent.change(screen.getByLabelText(/what did you like about this scenario/i), { target: { value: 'Realistic.' } });
    fireEvent.click(screen.getByRole('button', { name: /submit & see debrief/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /^debrief$/i })).toBeInTheDocument());

    // The saved payload carries the reflection + feedback.
    expect(saveRun).toHaveBeenCalledOnce();
    const payload = saveRun.mock.calls[0][0] as { reflection: Record<string, unknown>; feedback: Record<string, unknown> };
    expect(payload.reflection.went_well).toMatch(/family/i);
    expect(payload.feedback.liked).toMatch(/realistic/i);

    // No learner-visible score / grade / pass-fail.
    const main = screen.getByRole('main');
    expect(main.textContent ?? '').not.toMatch(/\bscore\b|percentage|pass\/fail|\bgrade\b|\/100\b/i);
    // But it does give section coaching from the run.
    expect(screen.getAllByText('Time management').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Scenario time:/i)).toBeInTheDocument();
  });

  it('uses actual run facts — names the retrieval delay when equipment was left behind', async () => {
    renderFlow(facts({ timeMetrics: { ...facts().timeMetrics, equipmentRetrievalDelaySeconds: 45 } }));
    signIn();
    answerRequiredReflection();
    fireEvent.click(screen.getByRole('button', { name: /continue to feedback/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit & see debrief/i }));
    await waitFor(() => expect(screen.getByText(/45s retrieving equipment/i)).toBeInTheDocument());
  });
});
