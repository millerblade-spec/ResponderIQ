import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

/**
 * Applies lib/db/schema.sql. Every statement uses CREATE TABLE IF NOT
 * EXISTS, so running this more than once against the same database is
 * safe -- it will not error or duplicate anything.
 *
 * Usage: DATABASE_URL=postgres://... npx tsx scripts/migrate.ts
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exitCode = 1;
    return;
  }

  const schemaPath = path.join(__dirname, '..', 'lib', 'db', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');

  const pool = new Pool({ connectionString });
  try {
    await pool.query(schema);
    console.log('Migration applied.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
