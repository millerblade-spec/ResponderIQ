import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { ShiftStart } from './ShiftStart';
import { ScenarioRunner } from './ScenarioRunner';
import { QUESTION_BANK } from '@/lib/opsim/quiz';

const FIVE = QUESTION_BANK.slice(0, 5); // io_location, tourniquets, airway_suction, broselow, narcotics

function renderShift(props: Partial<Parameters<typeof ShiftStart>[0]> = {}) {
  const saveAttempt = vi.fn().mockResolvedValue({ status: 'saved', id: '1' });
  const onProceed = vi.fn();
  const utils = render(
    <ShiftStart
      isFirstShift={props.isFirstShift ?? false}
      scenarioId="bls-01"
      learnerId="L-test"
      onProceed={onProceed}
      questions={FIVE}
      saveAttempt={saveAttempt}
      {...props}
    />,
  );
  return { ...utils, saveAttempt, onProceed };
}

function answer(container: HTMLElement, qid: string, optionId: string) {
  const input = container.querySelector<HTMLInputElement>(`input[name="${qid}"][value="${optionId}"]`);
  if (!input) throw new Error(`no option ${optionId} for ${qid}`);
  fireEvent.click(input);
}

function answerAll(container: HTMLElement, overrides: Record<string, string> = {}) {
  for (const q of FIVE) answer(container, q.id, overrides[q.id] ?? q.correctOptionId);
}

describe('ShiftStart — start-of-shift flow (§4)', () => {
  it('first shift goes straight into a mandatory Truck Check with no quiz option', () => {
    renderShift({ isFirstShift: true });
    expect(screen.getByRole('heading', { name: 'Truck Check' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /quiz me/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /begin truck check/i })).toBeNull();
  });

  it('later shift offers both Yes — Begin Truck Check and No — Quiz Me', () => {
    renderShift({ isFirstShift: false });
    expect(screen.getByRole('button', { name: /yes — begin truck check/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /no — quiz me/i })).toBeInTheDocument();
  });

  it('persists a completed Truck Check and transitions toward the operational sim', () => {
    const { saveAttempt, onProceed } = renderShift({ isFirstShift: true });
    fireEvent.click(screen.getByRole('button', { name: /go available/i }));
    expect(saveAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'truck_check', mandatory: true, learnerId: 'L-test' }),
    );
    // Completion line then proceed.
    expect(screen.getByText(/ready to roll/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /go available/i }));
    expect(onProceed).toHaveBeenCalled();
  });

  it('shows the ballistic warning and lists ballistic vests and helmets in the Truck Check', () => {
    renderShift({ isFirstShift: true });
    // Shown as a standalone banner and alongside each ballistic item.
    expect(
      screen.getAllByText(/ballistic protection does not make an unsecured scene safe/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Ballistic vests')).toBeInTheDocument();
    expect(screen.getByText('Ballistic helmets')).toBeInTheDocument();
  });

  it('opens ALS Bag contents showing Broselow tape and narcotics-on-the-belt', () => {
    renderShift({ isFirstShift: true });
    fireEvent.click(screen.getByRole('button', { name: /^ALS Bag/ }));
    const dialog = screen.getByRole('dialog', { name: 'ALS Bag' });
    expect(within(dialog).getByText('Broselow tape')).toBeInTheDocument();
    expect(within(dialog).getByText(/on the medic’s belt/i)).toBeInTheDocument();
  });

  it('asks exactly five questions from the bank, with no correctness feedback', () => {
    const { container } = renderShift({ isFirstShift: false });
    fireEvent.click(screen.getByRole('button', { name: /no — quiz me/i }));
    const fieldsets = container.querySelectorAll('fieldset');
    expect(fieldsets).toHaveLength(5);
    for (const q of FIVE) expect(screen.getByText(new RegExp(q.prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))).toBeInTheDocument();

    answer(container, FIVE[0].id, FIVE[0].correctOptionId);
    expect(container.textContent ?? '').not.toMatch(/correct|incorrect|\bscore\b|percentage/i);
  });

  it('5/5 proceeds into service (pass message, then go available)', () => {
    const { container, saveAttempt, onProceed } = renderShift({ isFirstShift: false });
    fireEvent.click(screen.getByRole('button', { name: /no — quiz me/i }));
    answerAll(container);
    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }));

    expect(saveAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'quiz', quiz: expect.objectContaining({ passed: true, correct: 5 }) }),
    );
    expect(screen.getByText(/you know your truck/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /go available/i }));
    expect(onProceed).toHaveBeenCalled();
  });

  it('4/5 or lower forces the full Truck Check', () => {
    const { container } = renderShift({ isFirstShift: false });
    fireEvent.click(screen.getByRole('button', { name: /no — quiz me/i }));
    answerAll(container, { [FIVE[0].id]: FIVE[0].options.find((o) => o.id !== FIVE[0].correctOptionId)!.id });
    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }));

    expect(screen.getByText(/walk through the truck before we take a call/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /walk through the truck/i }));
    expect(screen.getByRole('heading', { name: 'Truck Check' })).toBeInTheDocument();
  });
});

describe('ScenarioRunner — completion transitions into the operational sim (§4 → §7)', () => {
  it('runs the Truck Check first, then the dispatch sequence after going available', () => {
    render(<ScenarioRunner scenarioId="bls-01" level="orientation" isFirstShift learnerId="L-x" />);
    // Truck Check first.
    expect(screen.getByRole('heading', { name: 'Truck Check' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /go available/i })); // complete -> completion line
    fireEvent.click(screen.getByRole('button', { name: /go available/i })); // proceed
    // Operational sim is now running.
    expect(screen.getByText(/Dispatch —/i)).toBeInTheDocument();
  });
});
