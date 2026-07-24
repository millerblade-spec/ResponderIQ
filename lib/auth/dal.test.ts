import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getCookie = vi.fn();
const redirectSpy = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: getCookie }),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirectSpy(path),
}));

describe('DAL: getSession (non-redirecting)', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'a-real-secret-that-is-long-enough');
    getCookie.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the payload for a valid session, without redirecting', async () => {
    const { createSessionToken } = await import('./session');
    const { getSession } = await import('./dal');

    getCookie.mockReturnValue({ value: createSessionToken('ron') });
    const session = await getSession();
    expect(session?.username).toBe('ron');
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('returns null for no cookie, without redirecting', async () => {
    const { getSession } = await import('./dal');
    getCookie.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('returns null for an invalid cookie, without redirecting', async () => {
    const { getSession } = await import('./dal');
    getCookie.mockReturnValue({ value: 'garbage' });
    expect(await getSession()).toBeNull();
    expect(redirectSpy).not.toHaveBeenCalled();
  });
});

describe('DAL: verifySession (redirecting gate)', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'a-real-secret-that-is-long-enough');
    getCookie.mockReset();
    redirectSpy.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the username for a valid session cookie', async () => {
    const { createSessionToken } = await import('./session');
    const { verifySession, SESSION_COOKIE_NAME } = await import('./dal');

    getCookie.mockReturnValue({ value: createSessionToken('ron') });
    const session = await verifySession('/admin/scenarios/bls-01');
    expect(session.username).toBe('ron');
    expect(getCookie).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('redirects to /admin/login with the intended path preserved when there is no cookie', async () => {
    const { verifySession } = await import('./dal');
    getCookie.mockReturnValue(undefined);
    redirectSpy.mockImplementation(() => {
      throw new Error('REDIRECT');
    });

    await expect(verifySession('/admin/scenarios/bls-01')).rejects.toThrow('REDIRECT');
    expect(redirectSpy).toHaveBeenCalledWith('/admin/login?next=%2Fadmin%2Fscenarios%2Fbls-01');
  });

  it('redirects to /admin/login for an invalid/tampered cookie value', async () => {
    const { verifySession } = await import('./dal');
    getCookie.mockReturnValue({ value: 'not-a-real-token' });
    redirectSpy.mockImplementation(() => {
      throw new Error('REDIRECT');
    });

    await expect(verifySession('/admin/scenarios/bls-01')).rejects.toThrow('REDIRECT');
    expect(redirectSpy).toHaveBeenCalledWith(expect.stringContaining('/admin/login'));
  });

  it('redirects to /admin/login for an expired session', async () => {
    const { createSessionToken } = await import('./session');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = createSessionToken('ron');
    vi.setSystemTime(new Date('2026-01-09T00:00:00Z')); // 8 days later

    const { verifySession } = await import('./dal');
    getCookie.mockReturnValue({ value: token });
    redirectSpy.mockImplementation(() => {
      throw new Error('REDIRECT');
    });

    await expect(verifySession('/admin/scenarios/bls-01')).rejects.toThrow('REDIRECT');
    expect(redirectSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
