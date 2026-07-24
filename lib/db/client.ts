import { Pool } from 'pg';

let pool: Pool | null = null;

/**
 * Returns the shared connection pool, creating it on first use. Lazy
 * (not created at module load) so importing this file doesn't require
 * DATABASE_URL to be set -- only actually querying does.
 */
function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. This is required for any real database read or write; there is no fallback.',
    );
  }
  pool = new Pool({ connectionString });
  return pool;
}

/** Runs a parameterized query against the pool. Always use placeholders ($1, $2, ...) -- never string-concatenate values into SQL. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: ReadonlyArray<unknown> = [],
): Promise<{ readonly rows: readonly T[] }> {
  const result = await getPool().query(text, params as unknown[]);
  return { rows: result.rows as T[] };
}

/** For tests only: forces a fresh pool on next use, so tests against different databases (or a torn-down one) don't share a stale connection. */
export function resetPoolForTests(): void {
  pool = null;
}
