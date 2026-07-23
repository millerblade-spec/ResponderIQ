import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken, type SessionPayload } from './session';

export const SESSION_COOKIE_NAME = 'responderiq_session';

/**
 * Reads and verifies the session cookie without redirecting. Use this
 * where "is there a session?" is the actual question (e.g. the login
 * page itself, to skip showing the form to someone already signed in)
 * -- verifySession() below is for pages that require one.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return cookie ? verifySessionToken(cookie) : null;
});

/**
 * The gate for every admin-only page. Redirects to /admin/login if
 * there's no valid session, preserving the page's own path as ?next=
 * so a successful login lands back where the visitor was headed
 * instead of always the same hardcoded destination.
 *
 * intendedPath should be the calling page's own literal route (e.g.
 * '/admin/scenarios/bls-01') -- passed in explicitly rather than
 * introspected, so this doesn't depend on any particular way of
 * reading the current request path.
 */
export async function verifySession(intendedPath: string): Promise<{ readonly username: string }> {
  const payload = await getSession();

  if (!payload) {
    redirect(`/admin/login?next=${encodeURIComponent(intendedPath)}`);
    // redirect() always throws in real Next.js, so this line never runs
    // there. It exists so this function's return type stays honest (and
    // so a test that stubs redirect() as a no-op fails loudly here
    // instead of falling through to payload.username on a null payload).
    throw new Error('unreachable: redirect() should have thrown');
  }

  return { username: payload.username };
}
