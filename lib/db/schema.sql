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

-- Start-of-shift Truck Check / Unit Check-Off and five-question challenge
-- attempts (spec section 4). Keyed by learner_id (the agency learner identity
-- from the sign-in slice; a provisional id is used until that lands). Each row
-- is one start-of-shift event: a completed Truck Check or a quiz attempt.
-- `detail` holds the questions presented, the answers selected, and the missed
-- subjects for a quiz, so "frequently missed" can be derived without a schema
-- change. Nothing here is a foreign key, matching the existing free-text
-- scenario_id approach.
CREATE TABLE IF NOT EXISTS truck_check_attempts (
  id           BIGSERIAL PRIMARY KEY,
  learner_id   TEXT NOT NULL,
  scenario_id  TEXT NOT NULL,
  outcome      TEXT NOT NULL,               -- 'truck_check' | 'quiz'
  mandatory    BOOLEAN NOT NULL DEFAULT false,
  forced_check BOOLEAN NOT NULL DEFAULT false,
  quiz_correct INTEGER,                      -- null unless outcome = 'quiz'
  quiz_total   INTEGER,
  passed       BOOLEAN,
  detail       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS truck_check_attempts_learner_idx
  ON truck_check_attempts (learner_id, created_at DESC);

-- Completed operational runs (Step 10). Extends the existing review system
-- rather than adding a second persistence path: keyed by a client evaluation_id
-- for retry-safety (same as review_records), storing the full validated run
-- payload (differentials, equipment, scene safety, crew, dynamics, clinical,
-- reassessments, time metrics, reflection, feedback, critical events) as JSONB.
-- The administrator score is never stored — it is derived from the payload at
-- read time, so no score can leak to the learner. Legacy review_records are
-- untouched and remain readable.
CREATE TABLE IF NOT EXISTS operational_runs (
  evaluation_id  UUID PRIMARY KEY,
  scenario_id    TEXT NOT NULL,
  learner_name   TEXT NOT NULL,
  badge_id       TEXT NOT NULL,
  difficulty     TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  payload        JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operational_runs_learner_idx
  ON operational_runs (badge_id, scenario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS operational_runs_scenario_idx
  ON operational_runs (scenario_id, created_at DESC);

-- RPOS enrollments. RPOS is the six-level EMS Clinical Simulation Trainer
-- program (see docs/rpos/SPEC.md). The program itself -- the levels, the
-- grading bands, the advancement rule, the Miss Board categories, and the
-- MAX BVM / DSI checklists -- lives in code (lib/rpos), not in the database:
-- it is a specification, versioned with the app, and a stored copy could
-- drift from the one the grading actually uses.
--
-- What IS stored is the roster: who is on the program, which patch they are
-- being graded as, and which level they are working. Certification and level
-- are stored rather than derived because they are decisions a training officer
-- makes ("What patch are we training today?" / advancing a learner), not facts
-- computed from case history.
--
-- No standing, band, streak, or eligibility is stored. All of it is derived at
-- read time from operational_runs and rpos_miss_board, for the same reason
-- operational scores are never stored: nothing derived can go stale or leak.
--
-- badge_id is the join key to operational_runs.badge_id and
-- truck_check_attempts.learner_id -- free text, like every other identity
-- column here, because there is no learners table to reference.
CREATE TABLE IF NOT EXISTS rpos_enrollments (
  id               BIGSERIAL PRIMARY KEY,
  badge_id         TEXT NOT NULL UNIQUE,
  learner_name     TEXT NOT NULL,
  certification    TEXT NOT NULL,              -- 'emt' | 'paramedic'; scope and grading follow it
  level            INTEGER NOT NULL DEFAULT 1, -- 1..6
  personality_mode INTEGER NOT NULL DEFAULT 1, -- 0 clinical | 1 coach | 2 Ron Mode; delivery only
  enrolled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rpos_enrollments_enrolled_at_idx
  ON rpos_enrollments (enrolled_at DESC);

-- The Miss Board: assessment, protocol, medication/dose, clinical reasoning,
-- safety, and operations misses, retested later using different presentations.
--
-- This is the one derived-looking thing that IS stored, and deliberately: an
-- entry's whole point is that it outlives the case that created it and stays
-- open until a LATER case exercises the same subject cleanly. Resolution is
-- therefore a fact about history (which case cleared it, and when), not
-- something recomputable from the current state.
--
-- `critical` marks the entries that block advancement while unresolved.
-- `subject` is what a later case must retest -- the subject, not the scenario,
-- since the retest must be a different presentation.
CREATE TABLE IF NOT EXISTS rpos_miss_board (
  id                 TEXT PRIMARY KEY,          -- '<case id>:<subject key>', so re-recording one case is idempotent
  badge_id           TEXT NOT NULL,
  category           TEXT NOT NULL,             -- one of the six Miss Board categories
  subject            TEXT NOT NULL,
  detail             TEXT NOT NULL DEFAULT '',
  critical           BOOLEAN NOT NULL DEFAULT false,
  source_case_id     TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at        TIMESTAMPTZ,
  resolved_by_case_id TEXT
);

CREATE INDEX IF NOT EXISTS rpos_miss_board_open_idx
  ON rpos_miss_board (badge_id, resolved_at, critical DESC, created_at);
