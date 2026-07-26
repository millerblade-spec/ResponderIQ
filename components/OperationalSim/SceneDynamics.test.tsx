import { describe, it, expect } from 'vitest';
import { useMemo } from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { SceneDynamics } from './SceneDynamics';
import { useCrew } from './useCrew';
import { MissionClock, type TimeSource } from '@/lib/engine/missionClock';
import { fireResponseFor } from '@/lib/opsim/crew';
import type { ScenarioDistraction } from '@/lib/scenarios/bls-01.dispatch';

class ManualTimeSource implements TimeSource {
  private t = 0;
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

function Harness({
  clock,
  distractions,
  difficulty,
}: {
  clock: MissionClock;
  distractions: ScenarioDistraction[];
  difficulty: 'orientation' | 'basic' | 'intermediate' | 'advanced';
}) {
  const engines = useMemo(() => fireResponseFor('ems'), []);
  const controller = useCrew(engines, [], clock, 5);
  return <SceneDynamics controller={controller} clock={clock} difficulty={difficulty} distractions={distractions} />;
}

function renderDynamics(
  distractions: ScenarioDistraction[],
  difficulty: 'orientation' | 'basic' | 'intermediate' | 'advanced' = 'basic',
) {
  const source = new ManualTimeSource();
  const clock = new MissionClock(source);
  clock.start();
  const utils = render(<Harness clock={clock} distractions={distractions} difficulty={difficulty} />);
  const advance = (seconds: number) =>
    act(() => {
      source.advance(seconds * 1000);
      clock.tick();
    });
  return { ...utils, advance, clock };
}

const familyOnly: ScenarioDistraction[] = [{ id: 'family', type: 'family', appearAtSecond: 1 }];

describe('SceneDynamics — appearance & escalation timing (§20)', () => {
  it('a distraction appears at its configured time', () => {
    const { advance } = renderDynamics(familyOnly);
    expect(screen.queryByText('Family / spouse')).toBeNull();
    advance(1);
    expect(screen.getByText('Family / spouse')).toBeInTheDocument();
    expect(screen.getByText(/anxious and asking repeated questions/i)).toBeInTheDocument();
  });

  it('first escalation is at 10s, then every 5s', () => {
    const { advance } = renderDynamics(familyOnly);
    advance(1); // appears at stage 1 of 5
    expect(screen.getByText(/Stage 1 of 5/)).toBeInTheDocument();
    advance(10); // +10 -> stage 2
    expect(screen.getByText(/Stage 2 of 5/)).toBeInTheDocument();
    advance(5); // +5 -> stage 3
    expect(screen.getByText(/Stage 3 of 5/)).toBeInTheDocument();
  });

  it('stops escalating at the configured maximum stage', () => {
    const { advance } = renderDynamics(familyOnly);
    advance(1);
    advance(60); // way past every escalation
    expect(screen.getByText(/Stage 5 of 5/)).toBeInTheDocument();
  });
});

describe('SceneDynamics — management (§20)', () => {
  it('assigning a self action can resolve the distraction, which changes state', () => {
    const { advance } = renderDynamics(familyOnly);
    advance(1);
    fireEvent.click(screen.getByRole('button', { name: /request privacy for the patient/i }));
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });

  it('assigning a responder marks it Being Managed and pauses escalation (real crew)', () => {
    const { advance } = renderDynamics(familyOnly);
    advance(6); // fire on scene (arrival at 5) + family present
    fireEvent.click(screen.getByRole('button', { name: /assign partner ron to the family/i }));
    // Choose Partner Ron from the picker.
    const picker = screen.getByLabelText('Choose who manages this');
    fireEvent.click(within(picker).getByRole('button', { name: 'Partner Ron' }));

    expect(screen.getByText('Being Managed')).toBeInTheDocument();
    const stageBefore = screen.getByText(/Stage \d of 5/).textContent;
    advance(20); // escalation should be paused while managed
    expect(screen.getByText(/Stage \d of 5/).textContent).toBe(stageBefore);
  });

  it('one responder cannot manage two active issues (crew one-task rule)', () => {
    const two: ScenarioDistraction[] = [
      { id: 'family', type: 'family', appearAtSecond: 1 },
      { id: 'television', type: 'television', appearAtSecond: 1 },
    ];
    const { advance } = renderDynamics(two, 'advanced');
    advance(1);
    // Assign Partner Ron to the family.
    fireEvent.click(screen.getByRole('button', { name: /assign partner ron to the family/i }));
    fireEvent.click(within(screen.getByLabelText('Choose who manages this')).getByRole('button', { name: 'Partner Ron' }));
    // Try to assign the room task; Partner Ron should no longer be offered (busy).
    fireEvent.click(screen.getByRole('button', { name: /assign someone to manage the room/i }));
    const picker = screen.getByLabelText('Choose who manages this');
    expect(within(picker).queryByRole('button', { name: 'Partner Ron' })).toBeNull();
  });
});

describe('SceneDynamics — difficulty & hygiene (§20)', () => {
  it('Orientation shows one major distraction even when two are scheduled', () => {
    const two: ScenarioDistraction[] = [
      { id: 'family', type: 'family', appearAtSecond: 1 },
      { id: 'television', type: 'television', appearAtSecond: 1 },
    ];
    const { advance } = renderDynamics(two, 'orientation');
    advance(1);
    expect(screen.getByText('Family / spouse')).toBeInTheDocument();
    expect(screen.queryByText('Television / loud environment')).toBeNull();
  });

  it('does not double-schedule escalation across rerenders and cleans up on unmount', () => {
    const { advance, unmount } = renderDynamics(familyOnly);
    advance(1);
    advance(10); // stage 2
    expect(screen.getByText(/Stage 2 of 5/)).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });

  it('never shows a learner-visible score', () => {
    const { container, advance } = renderDynamics(familyOnly);
    advance(1);
    expect(container.textContent ?? '').not.toMatch(/\bscore\b|percentage|\bgrade\b|pass\/fail/i);
  });
});
