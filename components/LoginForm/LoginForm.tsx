'use client';

import { useActionState } from 'react';
import { login, type LoginState } from '@/app/admin/login/actions';
import styles from './LoginForm.module.css';

const initialState: LoginState = {};

interface LoginFormProps {
  readonly next?: string;
}

export function LoginForm({ next }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className={styles.form}>
      {next && <input type="hidden" name="next" value={next} />}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="username">
          Username
        </label>
        <input className={styles.input} id="username" name="username" type="text" autoComplete="username" />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="password">
          Password
        </label>
        <input
          className={styles.input}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
        />
      </div>
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={styles.button}>
        {pending ? 'Signing in\u2026' : 'Sign in'}
      </button>
    </form>
  );
}
