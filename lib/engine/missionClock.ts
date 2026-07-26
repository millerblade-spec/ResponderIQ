/**
 * Real-time mission clock and scheduler (§7, §29).
 *
 * The mission clock runs in real time at second granularity and, once started
 * with the dispatch tone, never pauses (§8). Everything time-driven in the
 * simulator — the 3s tone, the 15s/10s differential window, the 45s equipment
 * retrieval, the 15s+10s police sequence, distraction escalation — is scheduled
 * through THIS one abstraction, not through setTimeout calls scattered across
 * components.
 *
 * Time comes from an injected TimeSource, so tests drive it deterministically
 * (a manual source) and the app drives it from the system clock. Because a
 * single ticker calls tick(), the whole thing is trivially controllable under
 * fake timers as well. See missionClock.test.ts for both styles.
 */

/** A monotonic millisecond time source. Injectable so tests control time. */
export interface TimeSource {
  /** Current time in milliseconds. Only differences matter, not the absolute value. */
  now(): number;
}

/** The system time source used by the running app. */
export const systemTimeSource: TimeSource = {
  now: () =>
    typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(),
};

export type ScheduledId = number;

interface Scheduled {
  readonly id: ScheduledId;
  fireAtMs: number;
  readonly callback: () => void;
  /** Recurring interval in ms, if this is a repeating schedule. */
  readonly intervalMs?: number;
  canceled: boolean;
}

/** Safety cap so a zero/negative interval can never spin forever. */
const MAX_FIRES_PER_TICK = 100_000;

export class MissionClock {
  private startedAtMs: number | null = null;
  private elapsedMs = 0;
  private nextId: ScheduledId = 1;
  private scheduled: Scheduled[] = [];

  constructor(private readonly time: TimeSource) {}

  /** Starts the clock (call this when the dispatch tone begins, §7). Idempotent-safe: re-start resets. */
  start(): void {
    this.startedAtMs = this.time.now();
    this.elapsedMs = 0;
  }

  get running(): boolean {
    return this.startedAtMs !== null;
  }

  /** Whole seconds elapsed since start — the mission-clock reading shown to the learner. */
  elapsedSeconds(): number {
    return Math.floor(this.elapsedMs / 1000);
  }

  /** Raw elapsed milliseconds since start. */
  elapsedMilliseconds(): number {
    return this.elapsedMs;
  }

  /** Formats the mission clock as MM:SS. */
  formatted(): string {
    const total = this.elapsedSeconds();
    const mm = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const ss = (total % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  /** Schedules a callback to fire `delaySeconds` after the current elapsed time. */
  after(delaySeconds: number, callback: () => void): ScheduledId {
    return this.schedule(this.elapsedMs + delaySeconds * 1000, callback);
  }

  /** Schedules a callback to fire when the mission clock reaches `atSeconds` elapsed. */
  at(atSeconds: number, callback: () => void): ScheduledId {
    return this.schedule(atSeconds * 1000, callback);
  }

  /**
   * Schedules a recurring callback every `intervalSeconds`, with the first fire
   * `startAfterSeconds` from now (default: one interval). Used for distraction
   * escalation (§20: first at 10s, then every 5s).
   */
  everySeconds(
    intervalSeconds: number,
    callback: () => void,
    startAfterSeconds: number = intervalSeconds,
  ): ScheduledId {
    const id = this.nextId++;
    this.scheduled.push({
      id,
      fireAtMs: this.elapsedMs + startAfterSeconds * 1000,
      callback,
      intervalMs: Math.max(1, intervalSeconds * 1000),
      canceled: false,
    });
    return id;
  }

  /** Cancels a scheduled or recurring callback. Safe to call for an unknown/expired id. */
  cancel(id: ScheduledId): void {
    const item = this.scheduled.find((s) => s.id === id);
    if (item) item.canceled = true;
  }

  /**
   * Advances the clock to the current time from the TimeSource and fires every
   * callback that has come due, in chronological order. Recurring callbacks are
   * rescheduled and may fire more than once within a single tick if the clock
   * jumped far enough (e.g. a 5s interval advanced by 12s fires at 5 and 10).
   */
  tick(): void {
    if (this.startedAtMs === null) return;
    this.elapsedMs = this.time.now() - this.startedAtMs;

    for (let guard = 0; guard < MAX_FIRES_PER_TICK; guard++) {
      const due = this.earliestDue();
      if (!due) return;
      if (due.intervalMs) {
        due.fireAtMs += due.intervalMs;
      } else {
        due.canceled = true;
      }
      due.callback();
    }
  }

  private earliestDue(): Scheduled | undefined {
    let best: Scheduled | undefined;
    for (const s of this.scheduled) {
      if (s.canceled || s.fireAtMs > this.elapsedMs) continue;
      if (!best || s.fireAtMs < best.fireAtMs || (s.fireAtMs === best.fireAtMs && s.id < best.id)) {
        best = s;
      }
    }
    return best;
  }

  private schedule(fireAtMs: number, callback: () => void): ScheduledId {
    const id = this.nextId++;
    this.scheduled.push({ id, fireAtMs, callback, canceled: false });
    return id;
  }
}

/**
 * Drives a MissionClock from real wall-clock cadence via a single interval.
 * Returns a stop function. This is the ONLY place the app touches setInterval
 * for the mission clock — components consume the clock, they don't own timers.
 */
export function startTicking(clock: MissionClock, intervalMs = 200): () => void {
  const handle = setInterval(() => clock.tick(), intervalMs);
  return () => clearInterval(handle);
}
