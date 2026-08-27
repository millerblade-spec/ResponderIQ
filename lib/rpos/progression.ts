/**
 * Evaluates a learner's evidence against the program: stage statuses, the
 * competency rollup, and the one next action a training officer should give.
 *
 * Requirements are always evaluated, even for a locked stage. A learner can
 * satisfy a later stage's requirements before an earlier gate opens (running
 * calls without ever completing a Truck Check, say), and hiding that would
 * make the program look like it lost the evidence. The gate still holds — the
 * stage reads locked — but what is and isn't met stays visible.
 */
import { rollupCompetencies } from './competency';
import { RPOS_PROGRAM } from './program';
import type {
  LearnerEvidence,
  Program,
  ProgramState,
  ProgramStatus,
  RequirementResult,
  StageState,
  StageStatus,
} from './types';

/**
 * The gate wins. A stage whose requirements are already satisfied still reads
 * locked while an earlier stage is open — otherwise a responder who never
 * completed a Truck Check could show four complete stages, and the ordering
 * the program exists to enforce would be decoration. What is met inside the
 * locked stage stays visible; it just doesn't count yet.
 */
function statusFor(allMet: boolean, anyMet: boolean, previousComplete: boolean): StageStatus {
  if (!previousComplete) return 'locked';
  if (allMet) return 'complete';
  return anyMet ? 'in_progress' : 'available';
}

function overallStatus(stages: readonly StageState[]): ProgramStatus {
  if (stages.every((stage) => stage.status === 'complete')) return 'field_ready';
  const anyProgress = stages.some((stage) => stage.requirements.some((requirement) => requirement.met));
  return anyProgress ? 'in_progress' : 'not_started';
}

/**
 * The next action: the first unmet requirement of the earliest stage that is
 * not complete. Locked stages are included in that walk — the earliest
 * incomplete stage is by definition the one whose gate is open or is the gate
 * itself, so this always names the thing standing between the responder and
 * the next stage rather than something further down the path.
 */
function nextActionFor(stages: readonly StageState[]): string {
  for (const stage of stages) {
    if (stage.status === 'complete') continue;
    const unmet = stage.requirements.find((requirement) => !requirement.met);
    if (unmet) return `${stage.title}: ${unmet.label.toLowerCase()}.`;
  }
  return 'Program complete — every stage is satisfied on current evidence.';
}

/** Evaluates one learner's evidence against a program (RPOS by default). */
export function evaluateProgram(evidence: LearnerEvidence, program: Program = RPOS_PROGRAM): ProgramState {
  const competencies = rollupCompetencies(evidence.runs);
  const context = { evidence, competencies };

  const stages: StageState[] = [];
  let previousComplete = true; // the first stage is never locked
  for (const stage of program.stages) {
    const requirements: RequirementResult[] = stage.requirements.map((requirement) => {
      const outcome = requirement.evaluate(context);
      return { id: requirement.id, label: requirement.label, met: outcome.met, detail: outcome.detail };
    });
    const allMet = requirements.every((requirement) => requirement.met);
    const anyMet = requirements.some((requirement) => requirement.met);
    stages.push({
      id: stage.id,
      title: stage.title,
      purpose: stage.purpose,
      status: statusFor(allMet, anyMet, previousComplete),
      requirements,
    });
    // Only a stage that actually reads complete opens the next one — a locked
    // stage with every requirement met does not chain past its own gate.
    previousComplete = previousComplete && allMet;
  }

  const latest = evidence.runs[evidence.runs.length - 1];
  return {
    programId: program.id,
    programVersion: program.version,
    programTitle: program.title,
    learner: evidence.learner,
    status: overallStatus(stages),
    stages,
    competencies,
    nextAction: nextActionFor(stages),
    openConcerns: latest ? [...new Set(latest.criticalConcerns)] : [],
    stagesComplete: stages.filter((stage) => stage.status === 'complete').length,
    stageCount: stages.length,
  };
}
