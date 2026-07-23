import { query } from './client';

export interface AdminUser {
  readonly id: number;
  readonly username: string;
  readonly passwordHash: string;
}

interface AdminUserRow {
  readonly id: string; // BIGSERIAL comes back as a string from pg by default
  readonly username: string;
  readonly password_hash: string;
}

function fromRow(row: AdminUserRow): AdminUser {
  return { id: Number(row.id), username: row.username, passwordHash: row.password_hash };
}

export async function findAdminByUsername(username: string): Promise<AdminUser | null> {
  const { rows } = await query<AdminUserRow>(
    'SELECT id, username, password_hash FROM admin_users WHERE username = $1',
    [username],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

/** Throws if the username is already taken (relies on the UNIQUE constraint) -- callers should check findAdminByUsername first if they want a friendlier error. */
export async function createAdminUser(username: string, passwordHash: string): Promise<AdminUser> {
  const { rows } = await query<AdminUserRow>(
    'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2) RETURNING id, username, password_hash',
    [username, passwordHash],
  );
  return fromRow(rows[0]);
}

export async function updateAdminPassword(username: string, passwordHash: string): Promise<void> {
  await query('UPDATE admin_users SET password_hash = $1 WHERE username = $2', [passwordHash, username]);
}
