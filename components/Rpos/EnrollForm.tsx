'use client';

import { useActionState } from 'react';
import { enrollResponder, type RposFormState } from '@/lib/rpos/actions';
import styles from './Rpos.module.css';

const initialState: RposFormState = {};

/**
 * Puts a responder on the program. Certification is asked for up front,
 * because scope and grading follow the patch and an EMT must never be graded
 * as a Paramedic — so there is no default and no way to enroll without saying.
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
      <div className={styles.field}>
        <label className={styles.label} htmlFor="certification">
          What patch are we training?
        </label>
        <select className={styles.select} id="certification" name="certification" defaultValue="">
          <option value="" disabled>
            Choose a patch
          </option>
          <option value="emt">EMT</option>
          <option value="paramedic">Paramedic</option>
        </select>
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
