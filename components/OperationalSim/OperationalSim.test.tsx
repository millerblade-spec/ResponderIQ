import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { OperationalSim } from './OperationalSim';
import { MissionClock, type TimeSource } from '@/lib/engine/missionClock';
import { bls01Differentials } from '@/lib/scenarios/bls-01.dispatch';
import { markDifferentialVisited } from '@/lib/opsim/firstVisit';
import { PROVISIONAL_LEARNER_ID } from '@/lib/opsim/constants';

class ManualTimeSource implements TimeSource {
  private t = 0;
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

/**
 * Renders with an injected, manually-driven clock (no real timers). By default
 * the learner is marked as having visited before, so tests exercise the NORMAL
 * 20s timer; first-visit tests clear that mark themselves.
 */
function renderSim(props: Partial<Parameters<typeof OperationalSim>[0]> = {}, opts: { firstVisit?: boolean } = {}) {
  if (!opts.firstVisit) markDifferentialVisited(PROVISIONAL_LEARNER_ID);
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

/** Locks in the differential with four selections, immediately (does not wait for the timer). */
function lockInEarly(advance: (s: number) => void) {
  advance(3);
  const buttons = within(diffGroup()).getAllByRole('button');
  [0, 1, 2, 3].forEach((i) => fireEvent.click(buttons[i]));
  fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
}

/**
 * Drives a run from mount through arrival, parking, the windshield, and out
 * of the unit to the equipment stage (§9) — the console's Scene tab, where
 * equipment selection now lives (it is no longer a top-level prompt that
 * fires a fixed delay after the differential).
 */
function toEquipmentStage(advance: (s: number) => void) {
  lockInEarly(advance);
  advance(20); // differential deadline; arrival is pinned to it regardless of the early lock-in
  fireEvent.click(screen.getByRole('button', { name: /across the street/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Safe to Enter' }));
  fireEvent.click(screen.getByRole('button', { name: 'Exit Medic 3' }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('OperationalSim — dispatch & Code 3 (§7)', () => {
  it('starts the mission clock the instant it mounts (dispatch alert)', () => {
    const { clock } = renderSim();
    expect(clock.running).toBe(true);
  });

  it('shows Medic 3 and the dispatch tone note before the tone completes', () => {
    renderSim();
    expect(screen.getByText('Medic 3')).toBeInTheDocument();
    expect(screen.getByText(/Channel: EMS 2/)).toBeInTheDocument();
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

  it('keeps the mission clock running and visible while the challenge is open (never pauses)', () => {
    const { advance, clock } = renderSim();
    toDifferential(advance);
    advance(4);
    expect(clock.elapsedSeconds()).toBe(7);
    // Still open and counting — the clock did not pause for the popup, and the
    // running mission clock stays rendered throughout (fix #7).
    expect(screen.getByRole('dialog', { name: /what are you preparing for/i })).toBeInTheDocument();
    expect(screen.getByText('Mission clock')).toBeInTheDocument();
  });

  it('never shows a score, grade, percentage, or points', () => {
    const { advance, container } = renderSim();
    toDifferential(advance);
    const buttons = within(diffGroup()).getAllByRole('button');
    [0, 1, 2, 3].forEach((i) => fireEvent.click(buttons[i]));
    expect(container.textContent ?? '').not.toMatch(/score|grade|percentage|\bpoints\b|pass\/fail/i);
  });
});

describe('OperationalSim — timers time out and save partial work (§8, fix #1)', () => {
  it('Orientation times out at 20 seconds after the differential opens (tone 3s + 20s)', () => {
    const { advance } = renderSim({ level: 'orientation' });
    advance(3); // opens at t=3
    advance(19); // t=22, still open
    expect(screen.getByRole('dialog', { name: /what are you preparing for/i })).toBeInTheDocument();
    advance(1); // t=23 -> timeout
    expect(screen.queryByRole('dialog', { name: /what are you preparing for/i })).toBeNull();
  });

  it('a learner’s very first visit to the differential page gets 25 seconds (tone 3s + 25s)', () => {
    const { advance } = renderSim({ level: 'orientation' }, { firstVisit: true });
    advance(3); // opens at t=3
    advance(24); // t=27, still open — longer than the normal 20s window
    expect(screen.getByRole('dialog', { name: /what are you preparing for/i })).toBeInTheDocument();
    advance(1); // t=28 -> timeout
    expect(screen.queryByRole('dialog', { name: /what are you preparing for/i })).toBeNull();
  });

  it('the first visit is tracked per-user: the second run is back to the normal window', () => {
    const first = renderSim({ level: 'orientation' }, { firstVisit: true });
    first.advance(3); // the tone marks the visit
    first.unmount();
    const { advance } = renderSim({ level: 'orientation' }, { firstVisit: true }); // no re-clear — storage persists
    advance(3);
    advance(20); // t=23 -> normal 20s timeout applies
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
    advance(20); // timeout at t=23
    expect(screen.queryByRole('dialog', { name: /what are you preparing for/i })).toBeNull();
    expect(screen.getByText('ON SCENE')).toBeInTheDocument(); // arrived, did not get stuck
  });
});

describe('OperationalSim — arrival & parking (fixes #2, #3)', () => {
  it('locking in early keeps the unit RESPONDING — arrival waits for the timer', () => {
    const { advance } = renderSim();
    lockInEarly(advance);
    expect(screen.queryByRole('dialog', { name: /what are you preparing for/i })).toBeNull();
    expect(screen.getByText('RESPONDING · CODE 3')).toBeInTheDocument();
    expect(screen.queryByText('ON SCENE')).toBeNull();
  });

  it('the moment the timer ends: beacons off, ON SCENE, and the parking question opens', () => {
    const { advance } = renderSim();
    lockInEarly(advance);
    advance(20); // deadline at t=23
    expect(screen.queryByRole('status', { name: /responding code 3/i })).toBeNull();
    expect(screen.getByText('ON SCENE')).toBeInTheDocument();
    expect(screen.getByText(/where do you want me to put the truck/i)).toBeInTheDocument();
  });

  it('choosing a parking spot records it (shown in the console) and begins on-scene operations at the windshield', () => {
    const { advance } = renderSim();
    lockInEarly(advance);
    advance(20);
    fireEvent.click(screen.getByRole('button', { name: /across the street/i }));

    const sceneStatus = screen.getByRole('region', { name: /scene status/i });
    expect(within(sceneStatus).getByText(/across the street/i)).toBeInTheDocument();
    // On-scene ops open at the windshield assessment; equipment comes later,
    // when the crew steps out of the unit (fix #6) — not as a fixed-delay
    // top-level prompt.
    expect(screen.getByRole('heading', { name: /windshield assessment/i })).toBeInTheDocument();
    expect(screen.queryByText(/what do you want to bring in/i)).toBeNull();
  });
});

describe('OperationalSim — command console (on-scene)', () => {
  it('presents the console workspace tabs, including a dedicated Transport tab', () => {
    const { advance } = renderSim();
    lockInEarly(advance);
    advance(20);
    fireEvent.click(screen.getByRole('button', { name: /across the street/i }));

    const tabs = screen.getByRole('tablist', { name: /operational workspace/i });
    ['Scene View', 'Scene Dynamics', 'Patient Assessment', 'Packaging & Transport', 'Crew Operations', 'Timeline'].forEach(
      (label) => {
        expect(within(tabs).getByRole('tab', { name: label })).toBeInTheDocument();
      },
    );
  });

  it('lists Packaging & transport in the scenario progress rail', () => {
    const { advance } = renderSim();
    lockInEarly(advance);
    advance(20);
    fireEvent.click(screen.getByRole('button', { name: /across the street/i }));
    const progress = screen.getByRole('region', { name: /scenario progress/i });
    expect(within(progress).getByText(/packaging & transport/i)).toBeInTheDocument();
  });

  it('the Transport tab stays locked until patient contact is established', () => {
    const { advance } = renderSim();
    toEquipmentStage(advance);
    fireEvent.click(screen.getByRole('tab', { name: 'Packaging & Transport' }));
    expect(screen.getByText(/locked until you have patient contact/i)).toBeInTheDocument();
  });

  it('equipment selection happens inside the scene flow (§9): selected gear appears on scene, the rest stays on Medic 3', () => {
    const { advance } = renderSim();
    toEquipmentStage(advance);

    const group = screen.getByRole('group', { name: /equipment options/i });
    fireEvent.click(within(group).getByRole('button', { name: /als bag/i }));
    fireEvent.click(screen.getByRole('button', { name: /bring these in/i }));

    const onSceneEquip = screen.getByRole('group', { name: /equipment on scene/i });
    expect(within(onSceneEquip).getByText('ALS Bag')).toBeInTheDocument();
    expect(within(onSceneEquip).queryByText('Portable Suction')).toBeNull(); // not brought in
    const onTruck = screen.getByRole('group', { name: /still on medic 3/i });
    expect(within(onTruck).getByText('Portable Suction')).toBeInTheDocument(); // still on Medic 3
  });

  it('has no top-level equipment modal firing on a fixed delay after the differential (superseded by §9)', () => {
    const { advance } = renderSim();
    lockInEarly(advance);
    advance(20);
    fireEvent.click(screen.getByRole('button', { name: /across the street/i }));
    // The old flow opened an equipment prompt 3 seconds after arrival, before
    // the windshield/staging/exit sequence existed. That prompt must not
    // reappear here, however long we wait, without going through the scene
    // flow first.
    advance(10);
    expect(screen.queryByRole('group', { name: /equipment options/i })).toBeNull();
  });

  it('has no manual "End Scenario" control — the run can only complete via the transport pain-management decision (fix #16)', () => {
    const { advance } = renderSim();
    toEquipmentStage(advance);
    expect(screen.queryByRole('button', { name: /end scenario/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /complete run/i })).toBeNull();
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
