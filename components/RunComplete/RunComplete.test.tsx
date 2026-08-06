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

describe('RunComplete — legacy debrief for non-BLS-01 scenarios (§25, §26)', () => {
  // BLS-01 now uses the AI Ron conversational debrief; other scenarios keep
  // the section-coaching debrief until they get their own rebuild.
  const legacy = (overrides: Partial<RunFacts> = {}) => facts({ scenarioId: 'bls-99', ...overrides });

  it('persists the run with reflection and feedback, then shows a debrief with NO score', async () => {
    const { saveRun } = renderFlow(legacy());
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
    renderFlow(legacy({ timeMetrics: { ...facts().timeMetrics, equipmentRetrievalDelaySeconds: 45 } }));
    signIn();
    answerRequiredReflection();
    fireEvent.click(screen.getByRole('button', { name: /continue to feedback/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit & see debrief/i }));
    await waitFor(() => expect(screen.getByText(/45s retrieving equipment/i)).toBeInTheDocument());
  });
});

describe('RunComplete — AI Ron conversational debrief for BLS-01', () => {
  async function throughRonConversation() {
    signIn();
    answerRequiredReflection();
    fireEvent.click(screen.getByRole('button', { name: /continue to feedback/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit & see debrief/i }));
    await waitFor(() => expect(screen.getByText(/tailboard talk/i)).toBeInTheDocument());
    // Answer every question Ron asks (jsdom has no speech — typed fallback).
    while (screen.queryByRole('button', { name: /that’s my answer/i })) {
      fireEvent.change(screen.getByLabelText(/your answer/i), {
        target: { value: 'I should hand that to Ron or the fire crew while I keep assessing the patient.' },
      });
      fireEvent.click(screen.getByRole('button', { name: /that’s my answer/i }));
    }
  }

  it('replaces the old debrief screen with the Ron conversation, asks about THIS run, and never shows a score', async () => {
    renderFlow();
    await throughRonConversation();
    // The fixture run never delegated calming — Ron asks about that specific choice.
    expect(screen.getByText(/nobody ever really sat with him/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^debrief$/i })).toBeNull();
    const main = screen.getByRole('main');
    expect(main.textContent ?? '').not.toMatch(/\bscore\b|percentage|pass\/fail|\bgrade\b|\/100\b/i);
  });

  it('saves the conversation record with the run in one write, then closes warm', async () => {
    const { saveRun } = renderFlow();
    await throughRonConversation();
    fireEvent.click(screen.getByRole('button', { name: /clear the call/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /call cleared/i })).toBeInTheDocument());

    expect(saveRun).toHaveBeenCalledOnce();
    const payload = saveRun.mock.calls[0][0] as {
      ronDebrief?: { entries: readonly { answerTranscript: string; assessment: { verdict: string } }[]; closingLine: string };
    };
    expect(payload.ronDebrief).toBeDefined();
    expect(payload.ronDebrief!.entries.length).toBeGreaterThan(0);
    expect(payload.ronDebrief!.entries[0].answerTranscript).toMatch(/fire crew/i);
    expect(payload.ronDebrief!.closingLine.length).toBeGreaterThan(0);
  });
});
