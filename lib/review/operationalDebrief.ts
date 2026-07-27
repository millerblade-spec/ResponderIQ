/**
 * Learner-facing debrief (§25) and time-management review (§26). Section-by-
 * section coaching built from the learner's ACTUAL run — never a number, grade,
 * percentage, pass/fail, ranking, or star. The administrator score
 * (operationalScoring.ts) is a separate concern and is never surfaced here.
 */
import { DEFAULT_SIMULATOR_CONFIG } from '@/lib/engine/config';
import { computeOperationalScore } from './operationalScoring';
import type { OperationalRun } from './operationalRun';

export interface DebriefSection {
  readonly key: string;
  readonly label: string;
  readonly coaching: string;
}

export interface LearnerDebrief {
  readonly sections: readonly DebriefSection[];
  readonly criticalNotes: readonly string[];
}

/** Section coaching from the run facts. Reuses the category notes but exposes NO points/score. */
export function buildLearnerDebrief(run: OperationalRun): LearnerDebrief {
  const scored = computeOperationalScore(run);
  return {
    sections: scored.categories.map((c) => ({ key: c.key, label: c.label, coaching: c.note })),
    // Safety is coached plainly, without a grade — the number stays administrator-only.
    criticalNotes: scored.criticalConcerns,
  };
}

export interface TimeManagementReview {
  readonly totalSeconds: number;
  readonly totalFormatted: string;
  readonly benchmarkMinutes: number;
  readonly overBenchmark: boolean;
  readonly lines: readonly string[];
}

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m} minute${m === 1 ? '' : 's'}, ${s} second${s === 1 ? '' : 's'}`;
}

/**
 * Time-management review against the current 15-minute benchmark (§26). Finishing
 * under the benchmark is NOT automatically praised — the review reports the
 * actual time and the specific delays.
 */
export function buildTimeManagement(run: OperationalRun): TimeManagementReview {
  const benchmarkMinutes = DEFAULT_SIMULATOR_CONFIG.scoring.timeBenchmarkMinutes;
  const t = run.timeMetrics;
  const overBenchmark = t.totalSeconds > benchmarkMinutes * 60;
  const lines: string[] = [`Scenario time: ${fmt(t.totalSeconds)}.`];

  if (overBenchmark) {
    lines.push(
      `This exceeded the current ${benchmarkMinutes}-minute training benchmark. Review where unresolved distractions, delayed delegation, equipment retrieval, or decision-making increased the total time.`,
    );
  }
  if (t.timeBeforePatientContactSeconds != null) {
    lines.push(`Time before patient contact: ${fmt(t.timeBeforePatientContactSeconds)}.`);
  }
  if (t.equipmentRetrievalDelaySeconds > 0) {
    lines.push(`Equipment retrieval added ${t.equipmentRetrievalDelaySeconds}s — consider how your differential should guide what you bring in.`);
  }
  if (t.timeWithUnresolvedDistractionsSeconds > 0) {
    lines.push(`${t.timeWithUnresolvedDistractionsSeconds}s were spent with unresolved distractions.`);
  }
  return { totalSeconds: t.totalSeconds, totalFormatted: fmt(t.totalSeconds), benchmarkMinutes, overBenchmark, lines };
}
