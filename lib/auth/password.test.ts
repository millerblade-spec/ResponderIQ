import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies a correct password against its own hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('produces a different hash each time (random salt), even for the same password', async () => {
    const hashA = await hashPassword('same password');
    const hashB = await hashPassword('same password');
    expect(hashA).not.toBe(hashB);
    expect(await verifyPassword('same password', hashA)).toBe(true);
    expect(await verifyPassword('same password', hashB)).toBe(true);
  });

  it('never throws and returns false for a malformed stored value', async () => {
    await expect(verifyPassword('anything', 'not-a-real-hash')).resolves.toBe(false);
    await expect(verifyPassword('anything', '')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'scrypt:16384:8:1:onlyfiveparts')).resolves.toBe(false);
  });

  it('rejects a value using a different scheme name', async () => {
    await expect(verifyPassword('anything', 'bcrypt:10:somehash')).resolves.toBe(false);
  });

  it('is case-sensitive and whitespace-sensitive', async () => {
    const hash = await hashPassword('Password1');
    expect(await verifyPassword('password1', hash)).toBe(false);
    expect(await verifyPassword('Password1 ', hash)).toBe(false);
  });
});
