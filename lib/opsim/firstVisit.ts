/**
 * Per-user (not per-session) tracking of whether a learner has ever reached the
 * differential page before (§8 first-visit timer). Keyed by learner id in
 * localStorage so it survives across sessions on the same device; when storage
 * is unavailable we err toward "first visit" — the generous timer — rather than
 * shortchanging a genuine first-timer.
 */

const keyFor = (learnerId: string) => `riq:differential-visited:${learnerId}`;

export function hasVisitedDifferential(learnerId: string): boolean {
  try {
    return window.localStorage.getItem(keyFor(learnerId)) !== null;
  } catch {
    return false;
  }
}

export function markDifferentialVisited(learnerId: string): void {
  try {
    window.localStorage.setItem(keyFor(learnerId), new Date().toISOString());
  } catch {
    // Storage unavailable — the learner just gets the generous timer again.
  }
}
