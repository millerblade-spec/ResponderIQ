import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionPayload {
  readonly username: string;
  readonly issuedAt: number;
}

function base64url(input: Buffer): string {
  return input.toString('base64url');
}

function requireSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    // Fail closed: a missing or too-short secret must never silently
    // fall back to "no auth" or a guessable default -- it must be
    // impossible to create OR verify a session at all.
    throw new Error('SESSION_SECRET is not set (or is too short). Refusing to issue or verify sessions.');
  }
  return secret;
}

function sign(data: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(data).digest());
}

/** Creates a signed session token for a just-authenticated username. Throws if SESSION_SECRET is missing -- see requireSecret. */
export function createSessionToken(username: string): string {
  const secret = requireSecret();
  const payload: SessionPayload = { username, issuedAt: Date.now() };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signature = sign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a session token. Returns the payload if the signature is
 * valid AND the token hasn't expired; returns null for absolutely any
 * other case (bad format, bad signature, expired, missing secret) --
 * never throws, so a caller can treat "not logged in" and "broken
 * token" identically without a try/catch at every call site.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  let secret: string;
  try {
    secret = requireSecret();
  } catch {
    return null; // fail closed: no secret means no valid session, ever
  }

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;

  const expectedSignature = sign(payloadB64, secret);
  const actualBuf = Buffer.from(signature, 'base64url');
  const expectedBuf = Buffer.from(expectedSignature, 'base64url');
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return null;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.username !== 'string' || typeof payload.issuedAt !== 'number') return null;
  if (Date.now() - payload.issuedAt > SESSION_MAX_AGE_MS) return null;

  return payload;
}
