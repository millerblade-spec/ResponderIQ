import { hashPassword } from '../lib/auth/password';
import { findAdminByUsername, createAdminUser, updateAdminPassword } from '../lib/db/adminUsers';

/**
 * Creates or resets the one admin account. Safe to re-run: if the
 * username already exists, this updates its password instead of
 * failing -- useful both for first setup and for resetting a
 * forgotten password later.
 *
 * Usage:
 *   DATABASE_URL=postgres://... ADMIN_USERNAME=ron ADMIN_PASSWORD=... npx tsx scripts/seed-admin.ts
 *
 * Never hardcode credentials here or print the password back out.
 */
async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error('Set both ADMIN_USERNAME and ADMIN_PASSWORD.');
    process.exitCode = 1;
    return;
  }
  if (password.length < 12) {
    console.error('ADMIN_PASSWORD must be at least 12 characters.');
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  const existing = await findAdminByUsername(username);

  if (existing) {
    await updateAdminPassword(username, passwordHash);
    console.log(`Password updated for existing admin user "${username}".`);
  } else {
    await createAdminUser(username, passwordHash);
    console.log(`Admin user "${username}" created.`);
  }
}

main().catch((error: unknown) => {
  console.error('Seeding failed:', error);
  process.exitCode = 1;
});
