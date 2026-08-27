'use client';

import { useActionState } from 'react';
import { advanceResponder, type RposFormState } from '@/lib/rpos/actions';
import styles from './Rpos.module.css';

const initialState: RposFormState = {};

interface AdvanceFormProps {
  readonly badgeId: string;
  readonly nextLevel: number;
  readonly eligible: boolean;
}

/**
 * Advances a responder one level.
 *
 * The button is disabled when they are not eligible, but the action re-checks
 * the rule server-side regardless — the gate is the rule, not the button.
 */
export function AdvanceForm({ badgeId, nextLevel, eligible }: AdvanceFormProps) {
  const [state, formAction, pending] = useActionState(advanceResponder, initialState);

  return (
    <form action={formAction} className={styles.advanceForm}>
      <input type="hidden" name="badgeId" value={badgeId} />
      <input type="hidden" name="level" value={nextLevel} />
      <button type="submit" disabled={pending || !eligible} className={styles.button}>
        {pending ? 'Advancing…' : `Advance to level ${nextLevel}`}
      </button>
      {state.message && (
        <span className={styles.formMessage} role="status">
          {state.message}
        </span>
      )}
      {state.error && (
        <span className={styles.formError} role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
