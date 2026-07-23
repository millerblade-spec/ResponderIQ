import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { query, resetPoolForTests } from './client';
import { findAdminByUsername, createAdminUser } from './adminUsers';

// Requires a real Postgres reachable at TEST_DATABASE_URL (defaults to
// the local dev instance's *_test database). These are integration
// tests against genuine SQL, not mocks -- skipped automatically (see
// vitest.config) if no test database is reachable in a given environment.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://responderiq:localdevonly@localhost:5432/responderiq_test';

describe('admin_users (integration)', () => {
  beforeAll(() => {
    vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    resetPoolForTests();
  });

  beforeEach(async () => {
    await query('TRUNCATE admin_users RESTART IDENTITY');
  });

  it('returns null for a username that does not exist', async () => {
    expect(await findAdminByUsername('nobody')).toBeNull();
  });

  it('creates a user and finds it back by username', async () => {
    const created = await createAdminUser('ron', 'scrypt:16384:8:1:aa:bb');
    expect(created.username).toBe('ron');
    expect(created.id).toBeGreaterThan(0);

    const found = await findAdminByUsername('ron');
    expect(found).toEqual(created);
  });

  it('rejects creating a second user with the same username', async () => {
    await createAdminUser('ron', 'scrypt:16384:8:1:aa:bb');
    await expect(createAdminUser('ron', 'scrypt:16384:8:1:cc:dd')).rejects.toThrow();
  });

  it('usernames are case-sensitive as stored (no implicit normalization)', async () => {
    await createAdminUser('Ron', 'scrypt:16384:8:1:aa:bb');
    expect(await findAdminByUsername('ron')).toBeNull();
    expect(await findAdminByUsername('Ron')).not.toBeNull();
  });
});
