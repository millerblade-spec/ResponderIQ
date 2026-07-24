# ResponderIQ

**Adaptive EMS training, built on real decisions.**

ResponderIQ is a browser-based simulator for emergency medical services (EMS)
training. Instead of multiple-choice quizzes, it drops a trainee into a scenario
that unfolds in simulated time: decisions cost minutes, events fire while you
deliberate, and the situation adapts to the choices you make. Afterward, the
engine scores the run across behavioral categories — scene safety, resource
management, communication, prioritization, and more — and produces a plain-language
debrief, plus a detailed review view for administrators.

The first scenario, **BLS-01 — "Second Floor, No Elevator,"** is a residential
fall where the real challenge isn't the diagnosis: it's getting the patient three
flights down safely with the crew and equipment you brought or thought to call
for. It's deliberately designed so more than one plan can succeed.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + React
- TypeScript
- [Vitest](https://vitest.dev) for unit tests

The simulation logic lives in [`lib/engine`](lib/engine) (clock, reducer, scoring,
resources, differential, debrief) and is intentionally scoped to what BLS-01
needs — a minimal reusable engine rather than a general-purpose EMS model.
Scenarios live in [`lib/scenarios`](lib/scenarios); UI lives in
[`app`](app) and [`components`](components).

## Getting started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start or connect to Postgres.** Any standard Postgres works. To run one
   locally on Ubuntu/Debian:
   ```bash
   apt-get install -y postgresql
   service postgresql start
   su postgres -c "psql -c \"CREATE USER responderiq WITH PASSWORD 'localdevonly' CREATEDB;\""
   su postgres -c "psql -c \"CREATE DATABASE responderiq OWNER responderiq;\""
   ```

3. **Copy `.env.example` to `.env.local`** and fill in `DATABASE_URL` and
   `SESSION_SECRET` (see `.env.example` for what each one does and how to
   generate a secret).

4. **Apply the schema:**
   ```bash
   npm run db:migrate
   ```
   Safe to re-run at any time -- every statement is `CREATE TABLE IF NOT EXISTS`.

5. **Create the first admin account:**
   ```bash
   ADMIN_USERNAME=youradminname ADMIN_PASSWORD=a-real-password-12-chars-plus npm run db:seed-admin
   ```
   Also safe to re-run: if the username already exists, this resets its
   password instead of failing.

6. **Start the app:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000). The admin review
   area lives under `/admin/scenarios/bls-01`, gated by the account you
   just created at `/admin/login`.

7. **Run tests:**
   ```bash
   npm test
   ```
   Tests that touch the database use `TEST_DATABASE_URL` if set, otherwise
   default to `postgres://responderiq:localdevonly@localhost:5432/responderiq_test`
   (a second database, kept separate from your dev data -- create it the
   same way as step 2, substituting the database name).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm start` | Run the production build |
| `npm test` | Run the test suite (Vitest) |
| `npm run lint` | Lint with ESLint |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run db:migrate` | Apply `lib/db/schema.sql` (safe to re-run) |
| `npm run db:seed-admin` | Create or reset the one admin account (`ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars) |

## Project layout

```
app/            Next.js routes (home, dashboard, settings, scenarios, admin)
components/     Reusable UI (Button, Card, SimulatorPlayer, AdminReview, AdminReviewList, LoginForm, Dashboard, Settings)
lib/engine/     Simulation engine — clock, reducer, scoring, debrief
lib/scenarios/  Scenario definitions (BLS-01)
lib/auth/       Password hashing, signed sessions, the DAL session check
lib/db/         Postgres connection, schema, admin_users and review_records data access
lib/review/     Save-request validation (zod) and the save Server Action
scripts/        One-off CLI scripts (db:migrate, db:seed-admin)
docs/           Design notes and archived specs
```
