'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { findAdminByUsername } from '@/lib/db/adminUsers';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionToken } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/dal';

export interface LoginState {
  readonly error?: string;
}

// `secure` cookies are only ever sent by the browser over HTTPS. Vercel
// sets VERCEL=1 in every environment it actually deploys to (which is
// always HTTPS); anywhere else (local `next dev`/`next start`, both
// plain HTTP) a secure cookie would silently never be sent back, which
// would look identical to "the login is broken." This keeps the cookie
// genuinely secure once deployed, without breaking local testing.
const IS_DEPLOYED = process.env.VERCEL === '1';

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = formData.get('username');
  const password = formData.get('password');

  if (typeof username !== 'string' || typeof password !== 'string' || username === '' || password === '') {
    return { error: 'Enter a username and password.' };
  }

  // Deliberately identical wording for "no such user" and "wrong password" --
  // never reveal which one it was, so a login attempt can't be used to
  // confirm whether a given username exists.
  const genericError: LoginState = { error: 'Incorrect username or password.' };

  const user = await findAdminByUsername(username);
  if (!user) return genericError;

  const passwordIsCorrect = await verifyPassword(password, user.passwordHash);
  if (!passwordIsCorrect) return genericError;

  const token = createSessionToken(user.username);
  (await cookies()).set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_DEPLOYED,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // matches session.ts's own 7-day expiry
  });

  const next = formData.get('next');
  // Only ever redirect to a same-origin admin path we recognize as our
  // own -- never to an arbitrary value from the form. A bare "/admin/"
  // prefix check also blocks "//evil.com" and "https://evil.com" style
  // values, which start with a slash but aren't a local path.
  const safeNext = typeof next === 'string' && next.startsWith('/admin/') ? next : '/admin/scenarios/bls-01';
  redirect(safeNext);
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE_NAME);
  redirect('/admin/login');
}
