'use client';

import { useState } from 'react';
import type { QuizQuestion } from '@/lib/opsim/quiz';
import opStyles from '@/components/OperationalSim/OperationalSim.module.css';
import styles from './ShiftStart.module.css';

interface QuizChallengeProps {
  readonly questions: readonly QuizQuestion[];
  readonly onSubmit: (answers: Record<string, string>) => void;
}

/**
 * The five-question challenge (§4). All five are shown; the learner picks one
 * option per question. Per-question correctness is NEVER indicated and no
 * score/percentage is shown — the result is decided after submitting.
 */
export function QuizChallenge({ questions, onSubmit }: QuizChallengeProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const allAnswered = questions.every((q) => answers[q.id]);

  return (
    <div className={styles.wrap}>
      <div className={opStyles.ron}>
        <span className={opStyles.ronName}>Partner Ron:</span>
        <span>“Alright — five quick questions. Let’s see what you know.”</span>
      </div>

      <div className={styles.header}>
        <h1 className={styles.title}>Quiz Me</h1>
        <span className={styles.subtitle}>Five questions · Medic 3</span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (allAnswered) onSubmit(answers);
        }}
      >
        {questions.map((q, i) => (
          <fieldset key={q.id} className={styles.question}>
            <legend className={styles.questionPrompt}>
              {i + 1}. {q.prompt}
            </legend>
            <div className={styles.options}>
              {q.options.map((opt) => (
                <label key={opt.id} className={styles.optionRow}>
                  <input
                    type="radio"
                    name={q.id}
                    value={opt.id}
                    checked={answers[q.id] === opt.id}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <button type="submit" className={opStyles.primaryButton} disabled={!allAnswered}>
          Submit answers
        </button>
      </form>
    </div>
  );
}
