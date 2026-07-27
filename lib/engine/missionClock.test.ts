import { describe, it, expect, vi, afterEach } from 'vitest';
import { MissionClock, startTicking, type TimeSource } from './missionClock';
import { DEFAULT_SIMULATOR_CONFIG } from './config';

/** A fully controllable time source for deterministic tests — no real timers involved. */
class ManualTimeSource implements TimeSource {
  private t = 0;
  now(): number {
    return this.t;
  }
  advanceMs(ms: number): void {
    this.t += ms;
  }
}

/** Advances a manual source and ticks the clock, the way the real ticker would. */
function step(source: ManualTimeSource, clock: MissionClock, ms: number) {
  source.advanceMs(ms);
  clock.tick();
}

describe('MissionClock — real-time mission clock (§7, §8)', () => {
  it('does nothing until started', () => {
    const source = new ManualTimeSource();
    const clock = new MissionClock(source);
    const fired: string[] = [];
    clock.at(1, () => fired.push('one'));

    expect(clock.running).toBe(false);
    step(source, clock, 5000);
    expect(fired).toEqual([]);
    expect(clock.elapsedSeconds()).toBe(0);
  });

  it('starts with the dispatch tone and counts real elapsed seconds', () => {
    const source = new ManualTimeSource();
    const clock = new MissionClock(source);
    clock.start();
    step(source, clock, 3500);
    expect(clock.elapsedSeconds()).toBe(3);
    expect(clock.elapsedMilliseconds()).toBe(3500);
  });

  it('formats the clock as MM:SS', () => {
    const source = new ManualTimeSource();
    const clock = new MissionClock(source);
    clock.start();
    step(source, clock, 75_000);
    expect(clock.formatted()).toBe('01:15');
  });

  it('fires an at() callback when the clock reaches that absolute second', () => {
    const source = new ManualTimeSource();
    const clock = new MissionClock(source);
    clock.start();
    const fired: number[] = [];
    clock.at(3, () => fired.push(clock.elapsedSeconds()));

    step(source, clock, 2000);
    expect(fired).toEqual([]);
    step(source, clock, 1000);
    expect(fired).toEqual([3]);
  });

  it('fires an after() callback relative to the current elapsed time', () => {
    const source = new ManualTimeSource();
    const clock = new MissionClock(source);
    clock.start();
    step(source, clock, 5000);

    const fired: number[] = [];
    clock.after(2, () => fired.push(clock.elapsedSeconds())); // should fire at 7s
    step(source, clock, 1000);
    expect(fired).toEqual([]);
    step(source, clock, 1000);
    expect(fired).toEqual([7]);
  });

  it('fires multiple due callbacks in chronological order after a large jump (catch-up)', () => {
    const source = new ManualTimeSource();
    const clock = new MissionClock(source);
    clock.start();
    const order: string[] = [];
    clock.at(5, () => order.push('five'));
    clock.at(2, () => order.push('two'));
    clock.at(4, () => order.push('four'));

    step(source, clock, 10_000);
    expect(order).toEqual(['two', 'four', 'five']);
  });

  it('supports recurring escalation: first at 10s, then every 5s (§20)', () => {
    const source = new ManualTimeSource();
    const clock = new MissionClock(source);
    clock.start();
    const { firstDistractionEscalationSeconds, furtherDistractionEscalationSeconds } =
      DEFAULT_SIMULATOR_CONFIG.timing;

    const fires: number[] = [];
    clock.everySeconds(
      furtherDistractionEscalationSeconds,
      () => fires.push(clock.elapsedSeconds()),
      firstDistractionEscalationSeconds,
    );

    // Step at the real ~sub-second cadence so each fire is observed at its own
    // scheduled second (the app ticks every 200ms, not in one big jump).
    step(source, clock, 9000);
    expect(fires).toEqual([]); // nothing before 10s
    step(source, clock, 1000); // 10s -> first escalation
    step(source, clock, 5000); // 15s
    step(source, clock, 5000); // 20s
    expect(fires).toEqual([10, 15, 20]);
  });

  it('cancels a one-shot before it fires', () => {
    const source = new ManualTimeSource();
    const clock = new MissionClock(source);
    clock.start();
    const fired: string[] = [];
    const id = clock.at(3, () => fired.push('x'));
    clock.cancel(id);
    step(source, clock, 5000);
    expect(fired).toEqual([]);
  });

  it('cancels a recurring schedule so it stops escalating (resolved distraction, §20)', () => {
    const source = new ManualTimeSource();
    const clock = new MissionClock(source);
    clock.start();
    const fires: number[] = [];
    const id = clock.everySeconds(5, () => fires.push(clock.elapsedSeconds()), 5);

    step(source, clock, 5000); // 5s
    step(source, clock, 5000); // 10s
    expect(fires).toEqual([5, 10]);
    clock.cancel(id);
    step(source, clock, 20_000);
    expect(fires).toEqual([5, 10]); // no further fires after cancel
  });

  it('schedules the approved police sequence off the typed config (15s + 10s)', () => {
    const source = new ManualTimeSource();
    const clock = new MissionClock(source);
    clock.start();
    const events: string[] = [];
    const { policeArrivalSeconds, policeSceneSecurementSeconds } = DEFAULT_SIMULATOR_CONFIG.timing;

    clock.after(policeArrivalSeconds, () => {
      events.push(`arrived@${clock.elapsedSeconds()}`);
      clock.after(policeSceneSecurementSeconds, () => events.push(`secured@${clock.elapsedSeconds()}`));
    });

    step(source, clock, 15_000);
    expect(events).toEqual(['arrived@15']);
    step(source, clock, 10_000);
    expect(events).toEqual(['arrived@15', 'secured@25']);
  });
});

describe('MissionClock under fake timers (§29 "must support fake timers in tests")', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is driven by startTicking() and fires on schedule under vi fake timers', () => {
    vi.useFakeTimers();
    // Date.now() is faked by vitest fake timers, so this source advances with them.
    const clock = new MissionClock({ now: () => Date.now() });
    clock.start();

    const fired: string[] = [];
    clock.at(DEFAULT_SIMULATOR_CONFIG.timing.dispatchToneSeconds, () => fired.push('tone-done'));

    const stop = startTicking(clock, 200);
    vi.advanceTimersByTime(2000);
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(1000); // now 3s
    expect(fired).toEqual(['tone-done']);

    stop();
    vi.advanceTimersByTime(60_000);
    // After stop(), the interval is cleared; nothing new should fire.
    expect(fired).toEqual(['tone-done']);
  });
});
