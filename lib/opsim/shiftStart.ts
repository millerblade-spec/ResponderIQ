/**
 * Start-of-shift flow logic and Partner Ron's approved lines (§4).
 * Kept as typed data/helpers so the wording is single-sourced and the phase
 * decisions are testable outside the components.
 */
import type { QuizAttemptResult } from './quiz';

export type ShiftStartPhase =
  | 'choice' // later shift: "Do you want to check out the truck?"
  | 'truck_check' // full Truck Check in progress (mandatory, chosen, or forced)
  | 'quiz' // five-question challenge
  | 'quiz_pass' // 5/5 message
  | 'quiz_fail' // <5 message, before the forced Truck Check
  | 'complete'; // ready to go available -> operational sim

export const RON_LINES = {
  firstShift: 'Before we go in service, let’s check out the truck.',
  laterShiftQuestion: 'Do you want to check out the truck?',
  completion: 'Medic 3 is ready to roll! Let’s get available!',
  quizPass: 'Nice. You know your truck. Medic 3 is ready to roll! Let’s get available!',
  quizFail: 'We missed a couple. Let’s walk through the truck before we take a call.',
} as const;

/** First shift is a mandatory Truck Check; later shifts start at the Yes/No choice (§4). */
export function initialShiftPhase(isFirstShift: boolean): ShiftStartPhase {
  return isFirstShift ? 'truck_check' : 'choice';
}

/** 5/5 proceeds; 4/5 or lower forces the full Truck Check (§4). */
export function phaseAfterQuiz(result: QuizAttemptResult): ShiftStartPhase {
  return result.passed ? 'quiz_pass' : 'quiz_fail';
}

/** How a completed start-of-shift step is recorded for persistence (§4). */
export type ShiftStartOutcome =
  | { readonly kind: 'truck_check'; readonly mandatory: boolean }
  | { readonly kind: 'quiz'; readonly result: QuizAttemptResult };
