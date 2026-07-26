import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { OperationalSim } from './OperationalSim';
import { MissionClock, type TimeSource } from '@/lib/engine/missionClock';
import { bls01Differentials } from '@/lib/scenarios/bls-01.dispatch';

class ManualTimeSource implements TimeSource {
  private t = 0;
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

/** Renders with an injected, manually-driven clock (no real timers). */
function renderSim(props: Partial<Parameters<typeof OperationalSim>[0]> = {}) {
  const source = new ManualTimeSource();
  const clock = new MissionClock(source);
  const utils = render(<OperationalSim clock={clock} ticking={false} {...props} />);
  const advance = (seconds: number) =>
    act(() => {
      source.advance(seconds * 1000);
      clock.tick();
    });
  return { ...utils, clock, advance };
}

const diffGroup = () => screen.getByRole('group', { name: /differential choices/i });

/** Opens the differential challenge by completing the 3s tone. */
function toDifferential(advance: (s: number) => void) {
  advance(3); // dispatch tone complete
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('OperationalSim — dispatch & Code 3 (§7)', () => {
  it('starts the mission clock the instant it mounts (dispatch alert)', () => {
    const { clock } = renderSim();
    expect(clock.running).toBe(true);
  });

  it('shows Medic 3 on EMS 2 and the dispatch tone note before the tone completes', () => {
    renderSim();
    expect(screen.getByText('Medic 3')).toBeInTheDocument();
    expect(screen.getByText(/Radio: EMS 2/)).toBeInTheDocument();
    expect(screen.getByText(/dispatch alert tone/i)).toBeInTheDocument();
  });

  it('shows Code 3 beacons with a text label while responding (Standard Emergency Lighting)', () => {
    renderSim();
    expect(screen.getByRole('status', { name: /responding code 3/i })).toBeInTheDocument();
    expect(screen.getByText(/code 3 · responding/i)).toBeInTheDocument();
    expect(screen.getByText(/standard emergency lighting/i)).toBeInTheDocument();
  });

  it('honors Reduced Flashing Mode, preserving the status label', () => {
    renderSim({ lightingMode: 'reduced' });
    expect(screen.getByText(/reduced flashing mode/i)).toBeInTheDocument();
    expect(screen.getByText(/code 3 · responding/i)).toBeInTheDocument();
  });

  it('opens the differential challenge only after the 3-second tone', () => {
    const { advance } = renderSim();
    expect(screen.queryByRole('dialog', { name: /what are you preparing for/i })).toBeNull();
    advance(3);
    expect(screen.getByRole('dialog', { name: /what are you preparing for/i })).toBeInTheDocument();
    expect(screen.queryByText(/dispatch alert tone/i)).toBeNull();
  });
});

describe('OperationalSim — differential challenge (§8)', () => {
  it('presents exactly 15 differential choices', () => {
    const { advance } = renderSim();
    toDifferential(advance);
    expect(within(diffGroup()).getAllByRole('button')).toHaveLength(15);
    expect(bls01Differentials).toHaveLength(15);
  });

  it('requires at least four selections before it can be locked in', () => {
    const { advance } = renderSim();
    toDifferential(advance);
    const lockIn = screen.getByRole('button', { name: /lock in/i });
    const buttons = within(diffGroup()).getAllByRole('button');
    expect(lockIn).toBeDisabled();
    [0, 1, 2].forEach((i) => fireEvent.click(buttons[i]));
    expect(lockIn).toBeDisabled(); // three is not enough
    fireEvent.click(buttons[3]);
    expect(lockIn).toBeEnabled(); // four unlocks it
  });

  it('allows locking in with four selections and permits more than four', () => {
    const { advance } = renderSim();
    toDifferential(advance);
    const buttons = within(diffGroup()).getAllByRole('button');
    [0, 1, 2, 3, 4].forEach((i) => fireEvent.click(buttons[i]));
    expect(screen.getByText(/5 selected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /lock in/i })).toBeEnabled();
  });

  it('ranks the top four and marks extra selections as considered', () => {
    const { advance } = renderSim();
    toDifferential(advance);
    const buttons = within(diffGroup()).getAllByRole('button');
    [0, 1, 2, 3, 4, 5].forEach((i) => fireEvent.click(buttons[i]));
    // Two selections beyond the top four are labelled "considered".
    expect(screen.getAllByText('considered')).toHaveLength(2);
  });

  it('supports keyboard reordering of priority (Move up)', () => {
    const { advance } = renderSim();
    toDifferential(advance);
    const buttons = within(diffGroup()).getAllByRole('button');
    [0, 1, 2, 3].forEach((i) => fireEvent.click(buttons[i]));

    const list = screen.getByRole('list', { name: /priority order/i });
    const before = within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    // Move the 2nd-ranked item up.
    const secondLabel = bls01Differentials[1].label;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`move ${secondLabel} up`, 'i') }));
    const after = within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(after[0]).toContain(secondLabel);
    expect(after).not.toEqual(before);
  });

  it('keeps the mission clock running while the challenge is open (never pauses)', () => {
    const { advance, clock } = renderSim();
    toDifferential(advance);
    advance(4);
    expect(clock.elapsedSeconds()).toBe(7);
    // Still open and counting — the clock did not pause for the popup.
    expect(screen.getByRole('dialog', { name: /what are you preparing for/i })).toBeInTheDocument();
  });

  it('never shows a score, grade, percentage, or points', () => {
    const { advance, container } = renderSim();
    toDifferential(advance);
    const buttons = within(diffGroup()).getAllByRole('button');
    [0, 1, 2, 3].forEach((i) => fireEvent.click(buttons[i]));
    expect(container.textContent ?? '').not.toMatch(/score|grade|percentage|\bpoints\b|pass\/fail/i);
  });
});

describe('OperationalSim — timers time out and save partial work (§8)', () => {
  it('Orientation times out at 15 seconds after the differential opens (tone 3s + 15s)', () => {
    const { advance } = renderSim({ level: 'orientation' });
    advance(3); // opens at t=3
    advance(14); // t=17, still open
    expect(screen.getByRole('dialog', { name: /what are you preparing for/i })).toBeInTheDocument();
    advance(1); // t=18 -> timeout
    expect(screen.queryByRole('dialog', { name: /what are you preparing for/i })).toBeNull();
  });

  it('Above Orientation times out at 10 seconds (tone 3s + 10s)', () => {
    const { advance } = renderSim({ level: 'advanced' });
    advance(3); // opens at t=3
    advance(9); // t=12, still open
    expect(screen.getByRole('dialog', { name: /what are you preparing for/i })).toBeInTheDocument();
    advance(1); // t=13 -> timeout
    expect(screen.queryByRole('dialog', { name: /what are you preparing for/i })).toBeNull();
  });

  it('timing out with fewer than four selections still proceeds (partial work saved)', () => {
    const { advance } = renderSim({ level: 'orientation' });
    advance(3);
    const buttons = within(diffGroup()).getAllByRole('button');
    [0, 1].forEach((i) => fireEvent.click(buttons[i])); // only two
    advance(15); // timeout at t=18
    expect(screen.queryByRole('dialog', { name: /what are you preparing for/i })).toBeNull();
    expect(screen.getByText('ON SCENE')).toBeInTheDocument(); // arrived, did not get stuck
  });
});

describe('OperationalSim — arrival & equipment (§7, §9)', () => {
  function throughDifferential(advance: (s: number) => void) {
    advance(3);
    const buttons = within(diffGroup()).getAllByRole('button');
    [0, 1, 2, 3].forEach((i) => fireEvent.click(buttons[i]));
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
  }

  it('stops the beacons and shows ON SCENE on arrival', () => {
    const { advance } = renderSim();
    throughDifferential(advance);
    expect(screen.queryByRole('status', { name: /responding code 3/i })).toBeNull();
    expect(screen.getByText('ON SCENE')).toBeInTheDocument();
  });

  it('opens Ron’s equipment question exactly three seconds after the differential ends', () => {
    const { advance } = renderSim();
    throughDifferential(advance);
    expect(screen.queryByText(/what equipment do you want to take in/i)).toBeNull();
    advance(2);
    expect(screen.queryByText(/what equipment do you want to take in/i)).toBeNull();
    advance(1); // +3s total
    expect(screen.getByText(/what equipment do you want to take in/i)).toBeInTheDocument();
  });

  it('offers every approved equipment option', () => {
    const { advance } = renderSim();
    throughDifferential(advance);
    advance(3);
    const group = screen.getByRole('group', { name: /equipment options/i });
    expect(within(group).getAllByRole('button')).toHaveLength(19);
  });

  it('selected equipment becomes immediately available on scene; unselected stays on Medic 3', () => {
    const { advance } = renderSim();
    throughDifferential(advance);
    advance(3);
    const group = screen.getByRole('group', { name: /equipment options/i });
    fireEvent.click(within(group).getByRole('button', { name: /als bag/i }));
    fireEvent.click(screen.getByRole('button', { name: /bring these in/i }));

    const summary = screen.getByRole('region', { name: /on-scene summary/i });
    expect(within(summary).getByText('ALS Bag')).toBeInTheDocument();
    expect(within(summary).queryByText('Portable Suction')).toBeNull(); // still on Medic 3
  });
});

describe('OperationalSim — timer hygiene (§ architecture)', () => {
  it('does not create duplicate intervals across rerenders', () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const { rerender } = render(<OperationalSim ticking />);
    const afterMount = setInterval.mock.calls.length;
    rerender(<OperationalSim ticking />);
    expect(setInterval.mock.calls.length).toBe(afterMount);
  });

  it('clears its interval on unmount (no leaked timers)', () => {
    const clearInterval = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = render(<OperationalSim ticking />);
    unmount();
    expect(clearInterval).toHaveBeenCalled();
  });
});
