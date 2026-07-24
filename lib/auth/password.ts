import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// scrypt cost parameters. N must be a power of two. These are Node's
// own documented defaults for scrypt's cost/blockSize/parallelization
// trio, tuned for an interactive login (not a high-throughput API).
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

/**
 * Hashes a password for storage. The stored string embeds the cost
 * parameters and salt (`scrypt:N:r:p:saltHex:hashHex`) so a future
 * change to SCRYPT_N/R/P doesn't invalidate passwords hashed today --
 * verifyPassword reads the parameters back out of the stored string
 * rather than assuming today's constants.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a password against a stored hash produced by hashPassword.
 * Returns false (never throws) for a malformed stored value, so a
 * corrupt or unexpected row can never be treated as "no password set."
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = scryptSync(password, salt, expected.length, { N: n, r, p });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
