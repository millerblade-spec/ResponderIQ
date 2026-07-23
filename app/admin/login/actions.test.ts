import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cookieSet = vi.fn();
const cookieDelete = vi.fn();
const redirectSpy = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const findAdminByUsernameMock = vi.fn();
const verifyPasswordMock = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSet, delete: cookieDelete }),
}));
vi.mock('next/navigation', () => ({
  redirect: redirectSpy,
}));
vi.mock('@/lib/db/adminUsers', () => ({
  findAdminByUsername: (...args: unknown[]) => findAdminByUsernameMock(...args),
}));
vi.mock('@/lib/auth/password', () => ({
  verifyPassword: (...args: unknown[]) => verifyPasswordMock(...args),
}));

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe('login action', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'a-real-secret-that-is-long-enough');
    cookieSet.mockReset();
    cookieDelete.mockReset();
    redirectSpy.mockClear();
    findAdminByUsernameMock.mockReset();
    verifyPasswordMock.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns an error and makes no database call for a blank username or password', async () => {
    const { login } = await import('./actions');
    const result = await login({}, formData({ username: '', password: '' }));
    expect(result.error).toBeTruthy();
    expect(findAdminByUsernameMock).not.toHaveBeenCalled();
  });

  it('returns the same generic error for an unknown username as for a wrong password', async () => {
    const { login } = await import('./actions');

    findAdminByUsernameMock.mockResolvedValueOnce(null);
    const unknownUserResult = await login({}, formData({ username: 'nobody', password: 'whatever12345' }));

    findAdminByUsernameMock.mockResolvedValueOnce({ id: 1, username: 'ron', passwordHash: 'hash' });
    verifyPasswordMock.mockResolvedValueOnce(false);
    const wrongPasswordResult = await login({}, formData({ username: 'ron', password: 'wrongpassword' }));

    expect(unknownUserResult.error).toBe(wrongPasswordResult.error);
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('sets a session cookie and redirects to the default admin page on success', async () => {
    const { login } = await import('./actions');
    findAdminByUsernameMock.mockResolvedValue({ id: 1, username: 'ron', passwordHash: 'hash' });
    verifyPasswordMock.mockResolvedValue(true);

    await expect(login({}, formData({ username: 'ron', password: 'correcthorse123' }))).rejects.toThrow('REDIRECT:');

    expect(cookieSet).toHaveBeenCalledWith(
      'responderiq_session',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );
    expect(redirectSpy).toHaveBeenCalledWith('/admin/scenarios/bls-01');
  });

  it('redirects to a valid, same-origin next path on success', async () => {
    const { login } = await import('./actions');
    findAdminByUsernameMock.mockResolvedValue({ id: 1, username: 'ron', passwordHash: 'hash' });
    verifyPasswordMock.mockResolvedValue(true);

    await expect(
      login({}, formData({ username: 'ron', password: 'correcthorse123', next: '/admin/scenarios/bls-01' })),
    ).rejects.toThrow();
    expect(redirectSpy).toHaveBeenCalledWith('/admin/scenarios/bls-01');
  });

  it('ignores an unsafe next value and falls back to the default, rather than an open redirect', async () => {
    const { login } = await import('./actions');
    findAdminByUsernameMock.mockResolvedValue({ id: 1, username: 'ron', passwordHash: 'hash' });
    verifyPasswordMock.mockResolvedValue(true);

    await expect(
      login({}, formData({ username: 'ron', password: 'correcthorse123', next: 'https://evil.example.com' })),
    ).rejects.toThrow();
    expect(redirectSpy).toHaveBeenCalledWith('/admin/scenarios/bls-01');
  });

  it('does not set a cookie or redirect anywhere admin-authenticated when credentials are wrong', async () => {
    const { login } = await import('./actions');
    findAdminByUsernameMock.mockResolvedValue(null);

    await login({}, formData({ username: 'nobody', password: 'whatever12345' }));
    expect(cookieSet).not.toHaveBeenCalled();
    expect(redirectSpy).not.toHaveBeenCalled();
  });
});

describe('logout action', () => {
  beforeEach(() => {
    cookieDelete.mockReset();
    redirectSpy.mockClear();
    vi.resetModules();
  });

  it('deletes the session cookie and redirects to the login page', async () => {
    const { logout } = await import('./actions');
    await expect(logout()).rejects.toThrow('REDIRECT:/admin/login');
    expect(cookieDelete).toHaveBeenCalledWith('responderiq_session');
  });
});
