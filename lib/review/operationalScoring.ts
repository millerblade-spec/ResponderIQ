/**
 * Administrator-only scoring for an operational run (§ Step 10). Derived from
 * the raw run facts at read time — the payload never carries a score, so no
 * score can leak to the learner. A high total NEVER erases a critical safety
 * concern: concerns are tracked and surfaced independently of the number.
 */
import { DEFAULT_SIMULATOR_CONFIG, gradeFor, type GradingBand } from '@/lib/engine/config';
import type { OperationalRun } from './operationalRun';

export interface CategoryScore {
  readonly key: string;
  readonly label: string;
  readonly points: number;
  readonly max: number;
  readonly note: string;
}

export interface OperationalScore {
  readonly score: number;
  readonly band?: GradingBand;
  readonly passed: boolean;
  readonly categories: readonly CategoryScore[];
  readonly criticalConcerns: readonly string[];
}

const PASSING = DEFAULT_SIMULATOR_CONFIG.scoring.passingScore;
const BENCHMARK_SECONDS = DEFAULT_SIMULATOR_CONFIG.scoring.timeBenchmarkMinutes * 60;

function cat(key: string, label: string, points: number, max: number, note: string): CategoryScore {
  return { key, label, points, max, note };
}

/** Computes the administrator score, category performance, and critical concerns. */
export function computeOperationalScore(run: OperationalRun): OperationalScore {
  const clinicalDone = new Set(run.clinical.actionsPerformed.filter((a) => a.completedAtSecond != null).map((a) => a.id));
  const categories: CategoryScore[] = [];

  const min4 = run.differential.initial.length >= DEFAULT_SIMULATOR_CONFIG.differential.minimumSelections;
  categories.push(cat('dispatch_preparation', 'Dispatch preparation', min4 ? 10 : 5, 10, min4 ? 'Selected a full set of differentials from dispatch.' : 'Fewer than the minimum differentials were selected.'));
  categories.push(cat('differential_development', 'Differential development', run.differential.revisions.length > 0 ? 10 : 6, 10, run.differential.revisions.length > 0 ? 'Revised the differential as findings came in.' : 'Differential was not revised after new findings.'));
  const retrievalDelay = run.timeMetrics.equipmentRetrievalDelaySeconds;
  categories.push(cat('equipment_preparation', 'Equipment preparation', retrievalDelay === 0 ? 10 : retrievalDelay <= 45 ? 7 : 4, 10, retrievalDelay === 0 ? 'Brought what was needed — no retrieval delay.' : `Lost ${retrievalDelay}s retrieving equipment left on Medic 3.`));
  categories.push(cat('windshield_assessment', 'Windshield assessment', run.sceneSafety.windshieldReviewed ? 10 : 0, 10, run.sceneSafety.windshieldReviewed ? 'Completed a windshield assessment before entering.' : 'No windshield assessment was completed.'));
  const safeEntry = !run.sceneSafety.dispatchStaging || run.sceneSafety.clearedToEnter;
  categories.push(cat('scene_safety', 'Scene safety', safeEntry ? 10 : 0, 10, safeEntry ? 'Entered only when it was safe or cleared.' : 'Entered before clearance on a staging order.'));
  const assigned = run.crew.assignments.length;
  categories.push(cat('crew_leadership', 'Crew leadership', assigned >= 3 ? 10 : assigned > 0 ? 7 : 3, 10, assigned > 0 ? `Directed ${assigned} task assignment(s).` : 'Personnel were left awaiting assignment.'));
  categories.push(cat('resource_management', 'Resource management', retrievalDelay <= 45 ? 9 : 5, 10, 'Judged by retrieval delays and how personnel were used.'));
  const dynResolved = run.dynamics.issues.filter((i) => i.resolved).length;
  const dynTotal = run.dynamics.issues.length;
  categories.push(cat('scene_dynamics', 'Scene Dynamics', dynTotal === 0 ? 8 : Math.round((dynResolved / dynTotal) * 10), 10, dynTotal === 0 ? 'No major distractions arose.' : `Resolved ${dynResolved} of ${dynTotal} distractions.`));
  const assessed = ['initial_assessment', 'obtain_vitals', 'interview'].filter((a) => clinicalDone.has(a)).length;
  categories.push(cat('patient_assessment', 'Patient assessment', Math.round((assessed / 3) * 10), 10, `Completed ${assessed} of the core assessments (initial, vitals, interview).`));
  categories.push(cat('clinical_reasoning', 'Clinical reasoning', run.differential.workingImpression ? 10 : 6, 10, run.differential.workingImpression ? 'Committed to a working impression.' : 'No working impression was selected.'));
  const reassessOk = run.clinical.reassessments > 0 || !run.clinical.deteriorationOccurred;
  categories.push(cat('reassessment', 'Reassessment', reassessOk ? 10 : 2, 10, run.clinical.deteriorationOccurred && run.clinical.reassessments === 0 ? 'Patient deteriorated but was never reassessed.' : 'Reassessment was appropriate.'));
  const underBenchmark = run.timeMetrics.totalSeconds <= BENCHMARK_SECONDS;
  const distractionTime = run.timeMetrics.timeWithUnresolvedDistractionsSeconds;
  categories.push(cat('time_management', 'Time management', underBenchmark && distractionTime < 60 ? 10 : underBenchmark ? 7 : 5, 10, underBenchmark ? 'Completed within the current 15-minute benchmark.' : 'Exceeded the current 15-minute benchmark.'));

  const totalPoints = categories.reduce((s, c) => s + c.points, 0);
  const totalMax = categories.reduce((s, c) => s + c.max, 0);
  const score = Math.round((totalPoints / totalMax) * 100);

  const criticalConcerns: string[] = [...run.criticalEvents.map((e) => e.whatHappened)];
  if (run.sceneSafety.dispatchStaging && !run.sceneSafety.clearedToEnter && clinicalDone.size > 0) {
    criticalConcerns.push('Entered a scene under a staging order before it was cleared.');
  }
  if (!run.sceneSafety.windshieldReviewed && clinicalDone.size > 0) {
    criticalConcerns.push('Made patient contact without completing a windshield assessment.');
  }
  if (run.clinical.deteriorationOccurred && run.clinical.reassessments === 0) {
    criticalConcerns.push('Patient deteriorated and was never reassessed.');
  }

  return { score, band: gradeFor(score), passed: score >= PASSING, categories, criticalConcerns };
}

export interface AttemptProgress {
  readonly attempts: number;
  readonly scores: readonly number[];
  readonly improvement: number | null;
  readonly trend: 'improving' | 'declining' | 'steady' | 'n/a';
}

/** Progress across attempts, oldest → newest (§ Step 10). */
export function computeProgress(scoresOldestFirst: readonly number[]): AttemptProgress {
  if (scoresOldestFirst.length === 0) return { attempts: 0, scores: [], improvement: null, trend: 'n/a' };
  const improvement = scoresOldestFirst.length > 1 ? scoresOldestFirst[scoresOldestFirst.length - 1] - scoresOldestFirst[0] : null;
  const trend = improvement == null ? 'n/a' : improvement > 0 ? 'improving' : improvement < 0 ? 'declining' : 'steady';
  return { attempts: scoresOldestFirst.length, scores: scoresOldestFirst, improvement, trend };
}
