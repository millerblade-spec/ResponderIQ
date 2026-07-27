import { describe, it, expect } from 'vitest';
import { operationalRunSchema } from './operationalRun';
import { makeRun } from './operationalRun.fixture';

describe('operationalRunSchema (§ Step 10)', () => {
  it('accepts a complete valid run', () => {
    expect(operationalRunSchema.safeParse(makeRun()).success).toBe(true);
  });

  it('requires a learner name and badge/employee id', () => {
    expect(operationalRunSchema.safeParse(makeRun({ learner: { name: '', badgeId: 'B-1' } })).success).toBe(false);
    expect(operationalRunSchema.safeParse(makeRun({ learner: { name: 'A', badgeId: '' } })).success).toBe(false);
  });

  it('rejects a non-UUID evaluation id', () => {
    expect(operationalRunSchema.safeParse(makeRun({ evaluationId: 'not-a-uuid' })).success).toBe(false);
  });

  it('rejects an unexpected top-level field', () => {
    expect(operationalRunSchema.safeParse({ ...makeRun(), sneaky: 1 }).success).toBe(false);
  });

  it('carries no precomputed score field (score is derived at read time)', () => {
    expect(Object.keys(makeRun())).not.toContain('score');
  });
});
