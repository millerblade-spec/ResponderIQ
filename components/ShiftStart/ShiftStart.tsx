'use client';

import { useState } from 'react';
import {
  RON_LINES,
  initialShiftPhase,
  phaseAfterQuiz,
  type ShiftStartPhase,
} from '@/lib/opsim/shiftStart';
import { selectQuizQuestions, scoreQuizAttempt, type QuizQuestion } from '@/lib/opsim/quiz';
import { saveTruckCheckAttempt } from '@/lib/truckcheck/actions';
import { TruckCheck } from './TruckCheck';
import { QuizChallenge } from './QuizChallenge';
import opStyles from '@/components/OperationalSim/OperationalSim.module.css';
import styles from './ShiftStart.module.css';

interface ShiftStartProps {
  readonly isFirstShift: boolean;
  readonly scenarioId: string;
  readonly learnerId: string;
  readonly onProceed: () => void;
  /** Injectable for tests / stable selection. */
  readonly questions?: readonly QuizQuestion[];
  /** Injectable persistence boundary; defaults to the DB-backed server action. */
  readonly saveAttempt?: (payload: unknown) => Promise<unknown>;
}

/**
 * Start-of-shift orchestrator (§4). First shift is a mandatory Truck Check with
 * no path to the quiz; later shifts offer Yes (Truck Check) / No (Quiz Me).
 * A quiz result of 5/5 proceeds; anything less forces the full Truck Check.
 * Every completed step is persisted through the DB-backed server action (never
 * localStorage). Correctness/score is never shown to the learner.
 */
export function ShiftStart({
  isFirstShift,
  scenarioId,
  learnerId,
  onProceed,
  questions,
  saveAttempt = saveTruckCheckAttempt,
}: ShiftStartProps) {
  const [phase, setPhase] = useState<ShiftStartPhase>(() => initialShiftPhase(isFirstShift));
  const [forced, setForced] = useState(false);
  const [quizQuestions] = useState(() => questions ?? selectQuizQuestions());

  function record(payload: unknown) {
    // Fire-and-forget: persistence must not block or break the learner flow.
    void Promise.resolve(saveAttempt(payload)).catch(() => {});
  }

  function handleTruckComplete() {
    record({
      learnerId,
      scenarioId,
      outcome: 'truck_check',
      mandatory: isFirstShift,
      forcedCheck: forced,
    });
    setPhase('complete');
  }

  function handleQuizSubmit(answers: Record<string, string>) {
    const result = scoreQuizAttempt(quizQuestions, answers);
    record({
      learnerId,
      scenarioId,
      outcome: 'quiz',
      mandatory: false,
      forcedCheck: false,
      quiz: {
        correct: result.correct,
        total: result.total,
        passed: result.passed,
        questionIds: quizQuestions.map((q) => q.id),
        answers,
        missedSubjects: result.missedSubjects,
      },
    });
    setPhase(phaseAfterQuiz(result));
  }

  if (phase === 'truck_check') {
    return (
      <main>
        <TruckCheck
          introLine={isFirstShift ? RON_LINES.firstShift : 'Let’s walk through the truck.'}
          onComplete={handleTruckComplete}
        />
      </main>
    );
  }

  if (phase === 'quiz') {
    return (
      <main>
        <QuizChallenge questions={quizQuestions} onSubmit={handleQuizSubmit} />
      </main>
    );
  }

  return (
    <main>
      <div className={styles.wrap}>
        {phase === 'choice' && (
          <>
            <div className={opStyles.ron}>
              <span className={opStyles.ronName}>Partner Ron:</span>
              <span>“{RON_LINES.laterShiftQuestion}”</span>
            </div>
            <div className={styles.choiceRow}>
              <button type="button" className={opStyles.primaryButton} onClick={() => setPhase('truck_check')}>
                Yes — Begin Truck Check
              </button>
              <button type="button" className={opStyles.iconButton} style={{ width: 'auto', padding: '0.6rem 1.2rem' }} onClick={() => setPhase('quiz')}>
                No — Quiz Me
              </button>
            </div>
          </>
        )}

        {phase === 'quiz_pass' && (
          <>
            <p className={styles.ronLine}>
              <strong>Partner Ron:</strong> “{RON_LINES.quizPass}”
            </p>
            <button type="button" className={opStyles.primaryButton} onClick={onProceed}>
              Go available
            </button>
          </>
        )}

        {phase === 'quiz_fail' && (
          <>
            <p className={styles.ronLine}>
              <strong>Partner Ron:</strong> “{RON_LINES.quizFail}”
            </p>
            <button
              type="button"
              className={opStyles.primaryButton}
              onClick={() => {
                setForced(true);
                setPhase('truck_check');
              }}
            >
              Walk through the truck
            </button>
          </>
        )}

        {phase === 'complete' && (
          <>
            <p className={styles.ronLine}>
              <strong>Partner Ron:</strong> “{RON_LINES.completion}”
            </p>
            <button type="button" className={opStyles.primaryButton} onClick={onProceed}>
              Go available
            </button>
          </>
        )}
      </div>
    </main>
  );
}
