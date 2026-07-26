import { describe, it, expect } from 'vitest';
import { useMemo } from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { CrewOps } from './CrewOps';
import { useCrew } from './useCrew';
import { MissionClock, type TimeSource } from '@/lib/engine/missionClock';
import { fireResponseFor } from '@/lib/opsim/crew';

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
  equipmentOnScene,
  callType,
}: {
  clock: MissionClock;
  equipmentOnScene: string[];
  callType: 'ems' | 'mvc_two_vehicle';
}) {
  const engines = useMemo(() => fireResponseFor(callType), [callType]);
  const controller = useCrew(engines, equipmentOnScene, clock, 5);
  return <CrewOps controller={controller} clock={clock} />;
}

function renderCrew(equipmentOnScene: string[] = [], callType: 'ems' | 'mvc_two_vehicle' = 'ems') {
  const source = new ManualTimeSource();
  const clock = new MissionClock(source);
  clock.start();
  const utils = render(<Harness clock={clock} equipmentOnScene={equipmentOnScene} callType={callType} />);
  const advance = (seconds: number) =>
    act(() => {
      source.advance(seconds * 1000);
      clock.tick();
    });
  return { ...utils, advance, clock, source };
}

function assignVia(name: RegExp, taskLabel: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Assign ${name.source}`, 'i') }));
  const palette = screen.getByLabelText('Task palette');
  fireEvent.click(within(palette).getByRole('button', { name: taskLabel }));
}

describe('CrewOps — arrival & personnel (§11, §12)', () => {
  it('the crew starts Awaiting Assignment and fire arrives after the delay + 5s officer prompt', () => {
    const { advance } = renderCrew();
    expect(screen.getAllByText('Awaiting Assignment').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/engine’s here/i)).toBeNull();

    advance(5);
    expect(screen.getByText(/engine’s here/i)).toBeInTheDocument();
    expect(screen.queryByText(/what can we do to help/i)).toBeNull();

    advance(5);
    expect(screen.getByText(/what can we do to help/i)).toBeInTheDocument();
  });

  it('assigning a task moves the responder to Task in Progress', () => {
    renderCrew();
    assignVia(/Partner Ron/, 'Obtain vital signs');
    expect(screen.getByText('Task in Progress')).toBeInTheDocument();
    expect(screen.getByText(/Obtain vital signs —/)).toBeInTheDocument();
  });

  it('does not create duplicate arrivals across rerenders', () => {
    const { advance, rerender, clock } = renderCrew();
    advance(5);
    rerender(<Harness clock={clock} equipmentOnScene={[]} callType="ems" />);
    advance(5);
    expect(screen.getAllByText(/Engine 4 — On Scene/).length).toBe(1);
  });
});

describe('CrewOps — equipment retrieval (§9)', () => {
  it('shows a 45-second retrieval and delivers the equipment only on completion', () => {
    const { advance } = renderCrew([]);
    advance(5);
    assignVia(/Engine 4 FF 1/, 'Bring Portable Suction');
    expect(screen.getByText(/Retrieving Portable Suction/i)).toBeInTheDocument();
    expect(screen.getByText('0:45')).toBeInTheDocument();

    advance(45);
    expect(screen.getAllByText('Task Complete').length).toBeGreaterThanOrEqual(1);
  });
});

describe('CrewOps — Clear Engine from Call (§14)', () => {
  it('blocks clearing while a member has an active task and explains why', () => {
    const { advance } = renderCrew();
    advance(5);
    assignVia(/Engine 4 FF 1/, 'Obtain vital signs');
    fireEvent.click(screen.getByRole('button', { name: /clear engine from call/i }));
    expect(screen.getByText(/cannot be cleared while/i)).toBeInTheDocument();
  });

  it('never shows a learner-visible score anywhere in the crew UI', () => {
    const { container, advance } = renderCrew();
    advance(5);
    expect(container.textContent ?? '').not.toMatch(/\bscore\b|percentage|\bgrade\b|pass\/fail/i);
  });
});
