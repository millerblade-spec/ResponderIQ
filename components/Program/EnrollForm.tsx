'use client';

import { useActionState } from 'react';
import { enrollResponder, type EnrollFormState } from '@/lib/rpos/actions';
import styles from './Program.module.css';

const initialState: EnrollFormState = {};

/**
 * Adds a responder to the RPOS roster. Same useActionState form pattern as
 * LoginForm; the action re-checks the admin session server-side rather than
 * trusting that only an admin page renders this.
 */
export function EnrollForm() {
  const [state, formAction, pending] = useActionState(enrollResponder, initialState);

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="learner-name">
          Responder name
        </label>
        <input className={styles.input} id="learner-name" name="learnerName" type="text" autoComplete="off" />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="badge-id">
          Badge / employee ID
        </label>
        <input className={styles.input} id="badge-id" name="badgeId" type="text" autoComplete="off" />
      </div>
      <button type="submit" disabled={pending} className={styles.button}>
        {pending ? 'Enrolling…' : 'Enroll'}
      </button>
      {state.message && (
        <p className={styles.formMessage} role="status">
          {state.message}
        </p>
      )}
      {state.error && (
        <p className={styles.formError} role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
