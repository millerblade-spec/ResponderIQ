import { describe, it, expect, beforeEach } from 'vitest';
import { hasVisitedDifferential, markDifferentialVisited } from './firstVisit';

beforeEach(() => window.localStorage.clear());

describe('per-user first-visit tracking for the differential page (§8, fix #1)', () => {
  it('a learner who has never visited reads as not visited', () => {
    expect(hasVisitedDifferential('learner-a')).toBe(false);
  });

  it('marking a visit persists per learner, not per session', () => {
    markDifferentialVisited('learner-a');
    expect(hasVisitedDifferential('learner-a')).toBe(true);
    // A different learner on the same device still gets their own first visit.
    expect(hasVisitedDifferential('learner-b')).toBe(false);
  });

  it('marking twice is harmless', () => {
    markDifferentialVisited('learner-a');
    markDifferentialVisited('learner-a');
    expect(hasVisitedDifferential('learner-a')).toBe(true);
  });
});
