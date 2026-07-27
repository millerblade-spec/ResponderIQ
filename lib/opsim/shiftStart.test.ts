import { describe, it, expect } from 'vitest';
import { initialShiftPhase, phaseAfterQuiz, RON_LINES } from './shiftStart';

describe('shift-start flow logic (§4)', () => {
  it('first shift starts at the mandatory Truck Check (no way to reach the quiz first)', () => {
    expect(initialShiftPhase(true)).toBe('truck_check');
  });

  it('later shifts start at the Yes/No choice', () => {
    expect(initialShiftPhase(false)).toBe('choice');
  });

  it('a passed challenge (5/5) proceeds; a failed one forces the Truck Check', () => {
    expect(phaseAfterQuiz({ total: 5, correct: 5, passed: true, missedSubjects: [] })).toBe('quiz_pass');
    expect(phaseAfterQuiz({ total: 5, correct: 4, passed: false, missedSubjects: ['x'] })).toBe('quiz_fail');
  });

  it('uses the approved Ron wording', () => {
    expect(RON_LINES.firstShift).toMatch(/check out the truck/i);
    expect(RON_LINES.completion).toBe('Medic 3 is ready to roll! Let’s get available!');
    expect(RON_LINES.quizFail).toMatch(/walk through the truck/i);
  });
});
