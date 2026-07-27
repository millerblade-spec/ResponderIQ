import { describe, it, expect } from 'vitest';
import { buildLearnerDebrief, buildTimeManagement } from './operationalDebrief';
import { makeRun } from './operationalRun.fixture';

describe('learner debrief (§25)', () => {
  it('gives section-by-section coaching from the actual run, with no score', () => {
    const d = buildLearnerDebrief(makeRun());
    expect(d.sections.length).toBe(12);
    const serialized = JSON.stringify(d);
    // No numeric score / grade / percentage leaks into the learner-facing data.
    expect(serialized).not.toMatch(/"score"|"points"|"max"|percentage|pass\/fail/i);
  });

  it('uses real facts — e.g. it names the retrieval delay when equipment was left behind', () => {
    const run = makeRun({
      timeMetrics: { ...makeRun().timeMetrics, equipmentRetrievalDelaySeconds: 45 },
    });
    const d = buildLearnerDebrief(run);
    expect(JSON.stringify(d)).toMatch(/45s retrieving equipment/i);
  });
});

describe('time management review (§26)', () => {
  it('does not auto-praise a run finished under the benchmark', () => {
    const r = buildTimeManagement(makeRun({ timeMetrics: { ...makeRun().timeMetrics, totalSeconds: 500 } }));
    expect(r.overBenchmark).toBe(false);
    expect(r.lines.join(' ')).not.toMatch(/good time management|well managed/i);
    expect(r.lines[0]).toMatch(/Scenario time:/);
  });

  it('flags exceeding the 15-minute benchmark', () => {
    const r = buildTimeManagement(makeRun({ timeMetrics: { ...makeRun().timeMetrics, totalSeconds: 1000 } }));
    expect(r.overBenchmark).toBe(true);
    expect(r.lines.join(' ')).toMatch(/exceeded the current 15-minute/i);
  });
});
