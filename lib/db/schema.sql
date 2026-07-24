-- ResponderIQ persistence schema.
--
-- Design choices, explained:
-- - review_records is keyed by evaluation_id (a client-generated UUID,
--   stable across retries of the same completion), not by scenario_id.
--   This changed from an earlier one-row-per-scenario design once a
--   "newest records first" admin list became a real requirement --
--   that only makes sense if completed runs accumulate as history
--   rather than each overwriting the last. The UNIQUE/PRIMARY KEY
--   constraint is what actually enforces retry-safety at the database
--   level: a second INSERT with the same evaluation_id fails, and the
--   application layer (lib/db/reviewRecords.ts) turns that failure
--   into an idempotent "already saved" result rather than an error.
-- - scenario_id is a plain text column, not a foreign key into a
--   scenarios table, because no such table exists -- there is exactly
--   one real scenario (bls-01) and the app has no scenario registry.
--   Free-text now, normalize later only if a second scenario needs it.
-- - password_hash stores a self-describing string (scrypt params + salt
--   + hash, see lib/auth/password.ts) so the hashing parameters can be
--   upgraded later without a schema migration.

CREATE TABLE IF NOT EXISTS admin_users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_records (
  evaluation_id UUID PRIMARY KEY,
  scenario_id   TEXT NOT NULL,
  state         JSONB NOT NULL,
  saved_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_records_scenario_saved_at_idx
  ON review_records (scenario_id, saved_at DESC);
