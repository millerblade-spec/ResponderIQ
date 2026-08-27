/**
 * The RPOS program definition — six stages, in order, each gated by
 * requirements that only recorded evidence can satisfy.
 *
 * The stages are built around what the simulator actually records today
 * (Truck Check attempts and BLS-01 operational runs), not around a
 * hypothetical scenario catalog. Every requirement is a function of the
 * evidence, so adding a scenario later means more runs flowing into the same
 * gates rather than a rewrite. Scope discipline matches lib/engine: model
 * what exists, generalize when a second thing needs it.
 *
 * Ordering rationale: readiness before response, scene discipline before
 * patient care, and command competency last — a responder who cannot yet run
 * a safe scene should not be certified on how well they delegated on it.
 */
import { findCompetency, isAtLeast } from './competency';
import type { CompetencyLevel, Program, ProgramRequirement, RequirementContext } from './types';

const LEVEL_LABEL: Readonly<Record<CompetencyLevel, string>> = {
  not_started: 'not started',
  developing: 'developing',
  proficient: 'proficient',
  mastered: 'mastered',
};

/**
 * A requirement that every named competency has reached at least `minimum`.
 * Exported so a stage's gate can be evaluated directly in tests, including
 * the misconfiguration case where a key names a competency the program does
 * not track.
 */
export function competenciesAtLeast(
  id: string,
  label: string,
  keys: readonly string[],
  minimum: CompetencyLevel,
): ProgramRequirement {
  return {
    id,
    label,
    evaluate: ({ competencies }: RequirementContext) => {
      const tracked = keys.map((key) => findCompetency(competencies, key)).filter((c) => c != null);
      const short = tracked.filter((competency) => !isAtLeast(competency.level, minimum));
      if (tracked.length === 0) {
        // Only reachable if a stage names a competency this program version
        // does not track — a misconfiguration, reported as unmet rather than
        // silently passing a gate nothing can satisfy.
        return { met: false, detail: 'This requirement names competencies the program does not track.' };
      }
      if (tracked.every((competency) => competency.attempts === 0)) {
        return { met: false, detail: 'No recorded runs have exercised these competencies yet.' };
      }
      if (short.length === 0) {
        return { met: true, detail: `All ${tracked.length} at ${LEVEL_LABEL[minimum]} or better on the most recent run.` };
      }
      return {
        met: false,
        detail: `Still below ${LEVEL_LABEL[minimum]}: ${short.map((c) => `${c.label} (${LEVEL_LABEL[c.level]})`).join(', ')}.`,
      };
    },
  };
}

const truckCheckComplete: ProgramRequirement = {
  id: 'truck_check_complete',
  label: 'Complete a full Truck Check / Unit Check-Off',
  evaluate: ({ evidence }) =>
    evidence.truckCheck.hasCompletedTruckCheck
      ? { met: true, detail: `Completed — ${evidence.truckCheck.attemptCount} start-of-shift record(s).` }
      : { met: false, detail: 'No completed Truck Check on record.' },
};

const firstRunRecorded: ProgramRequirement = {
  id: 'first_run_recorded',
  label: 'Complete one operational run start to finish',
  evaluate: ({ evidence }) =>
    evidence.runs.length > 0
      ? { met: true, detail: `${evidence.runs.length} completed run(s) on record.` }
      : { met: false, detail: 'No completed runs on record.' },
};

const latestRunClean: ProgramRequirement = {
  id: 'latest_run_no_concerns',
  label: 'Most recent run carries no critical safety concern',
  evaluate: ({ evidence }) => {
    const latest = evidence.runs[evidence.runs.length - 1];
    if (!latest) return { met: false, detail: 'No completed runs on record.' };
    return latest.criticalConcerns.length === 0
      ? { met: true, detail: 'Most recent run recorded no critical safety concern.' }
      : { met: false, detail: `Most recent run recorded ${latest.criticalConcerns.length} critical safety concern(s).` };
  },
};

/** Repeatable performance at the standard: N passing runs, each with no critical concern. */
function cleanPassingRuns(count: number): ProgramRequirement {
  return {
    id: 'clean_passing_runs',
    label: `Record ${count} runs at the passing standard with no critical safety concern`,
    evaluate: ({ evidence }) => {
      const clean = evidence.runs.filter((run) => run.passed && run.criticalConcerns.length === 0);
      return clean.length >= count
        ? { met: true, detail: `${clean.length} of ${evidence.runs.length} recorded run(s) passed clean.` }
        : { met: false, detail: `${clean.length} of ${count} clean passing run(s) so far.` };
    },
  };
}

const allCompetenciesProficient: ProgramRequirement = {
  id: 'all_competencies_proficient',
  label: 'Every tracked competency at proficient or better',
  evaluate: ({ competencies }) => {
    const short = competencies.filter((competency) => !isAtLeast(competency.level, 'proficient'));
    return short.length === 0
      ? { met: true, detail: `All ${competencies.length} competencies at proficient or better.` }
      : { met: false, detail: `${short.length} still below proficient: ${short.map((c) => c.label).join(', ')}.` };
  },
};

export const RPOS_PROGRAM: Program = {
  id: 'rpos-01',
  version: 1,
  title: 'RPOS — Responder Performance Operating System',
  summary:
    'The development path a responder works through in ResponderIQ. Each stage unlocks only on recorded evidence: Truck Checks and completed operational runs, scored the same way the administrator run review scores them.',
  stages: [
    {
      id: 'shift_readiness',
      title: 'Shift Readiness',
      purpose: 'Knows the truck before taking a call. Nothing downstream is meaningful if the equipment story is unknown.',
      requirements: [truckCheckComplete],
    },
    {
      id: 'first_response',
      title: 'First Response',
      purpose: 'Has run a call end to end — dispatch through disposition — at least once.',
      requirements: [firstRunRecorded],
    },
    {
      id: 'scene_discipline',
      title: 'Scene Discipline',
      purpose: 'Runs a safe scene: windshield assessment, staging discipline, and no critical safety concern on the latest call.',
      requirements: [
        latestRunClean,
        competenciesAtLeast(
          'scene_competencies_proficient',
          'Scene safety and windshield assessment at proficient',
          ['windshield_assessment', 'scene_safety'],
          'proficient',
        ),
      ],
    },
    {
      id: 'patient_care',
      title: 'Patient Care',
      purpose: 'Assesses, reasons to a working impression, and reassesses when the patient changes.',
      requirements: [
        competenciesAtLeast(
          'clinical_competencies_proficient',
          'Assessment, clinical reasoning, and reassessment at proficient',
          ['patient_assessment', 'clinical_reasoning', 'reassessment'],
          'proficient',
        ),
      ],
    },
    {
      id: 'command_competency',
      title: 'Command & Resource Competency',
      purpose: 'Directs the people and equipment on scene, manages distractions, and works inside the time benchmark.',
      requirements: [
        competenciesAtLeast(
          'command_competencies_proficient',
          'Crew leadership, resource management, Scene Dynamics, and time management at proficient',
          ['crew_leadership', 'resource_management', 'scene_dynamics', 'time_management'],
          'proficient',
        ),
      ],
    },
    {
      id: 'field_ready',
      title: 'Field Ready',
      purpose: 'Performs at the standard repeatably — not once — with every competency proficient and no critical safety concern.',
      requirements: [cleanPassingRuns(2), allCompetenciesProficient],
    },
  ],
};
