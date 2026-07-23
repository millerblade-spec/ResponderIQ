import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSessionToken, verifySessionToken } from './session';

const REAL_SECRET = 'a-real-secret-that-is-long-enough';

describe('session tokens', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', REAL_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('round-trips a valid token', () => {
    const token = createSessionToken('ron');
    const payload = verifySessionToken(token);
    expect(payload?.username).toBe('ron');
  });

  it('rejects a token signed with a different secret', () => {
    const token = createSessionToken('ron');
    vi.stubEnv('SESSION_SECRET', 'a-completely-different-secret!!');
    expect(verifySessionToken(token)).toBeNull();
  });

  it('rejects a token with a tampered payload (username swapped without re-signing)', () => {
    const token = createSessionToken('ron');
    const [payloadB64, signature] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const tamperedPayload = Buffer.from(JSON.stringify({ ...payload, username: 'attacker' }), 'utf8').toString(
      'base64url',
    );
    expect(verifySessionToken(`${tamperedPayload}.${signature}`)).toBeNull();
  });

  it('rejects malformed tokens without throwing', () => {
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('not-a-token-at-all')).toBeNull();
    expect(verifySessionToken('one.two.three')).toBeNull();
    expect(verifySessionToken('..')).toBeNull();
  });

  it('rejects a token older than 7 days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = createSessionToken('ron');

    vi.setSystemTime(new Date('2026-01-07T23:00:00Z')); // just under 7 days
    expect(verifySessionToken(token)?.username).toBe('ron');

    vi.setSystemTime(new Date('2026-01-08T01:00:00Z')); // just over 7 days
    expect(verifySessionToken(token)).toBeNull();
  });

  it('fails closed when SESSION_SECRET is missing: refuses to create a token', () => {
    vi.stubEnv('SESSION_SECRET', '');
    expect(() => createSessionToken('ron')).toThrow(/SESSION_SECRET/);
  });

  it('fails closed when SESSION_SECRET is missing: verification returns null, never throws', () => {
    const token = createSessionToken('ron');
    vi.stubEnv('SESSION_SECRET', '');
    expect(verifySessionToken(token)).toBeNull();
  });

  it('fails closed when SESSION_SECRET is too short', () => {
    vi.stubEnv('SESSION_SECRET', 'short');
    expect(() => createSessionToken('ron')).toThrow(/SESSION_SECRET/);
  });
});
