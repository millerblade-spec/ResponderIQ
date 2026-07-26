import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Run test FILES one at a time. The database integration suites
    // (lib/db/*, lib/review/*, components/Admin*) all share one Postgres
    // database and clean their tables in beforeEach; running files in
    // parallel workers lets one file's TRUNCATE/inserts race another file's
    // assertions against the same `review_records` table (intermittent
    // "expected 0 to be 1" style failures). Serial files make the shared-DB
    // suites deterministic. Tests within a file still run in order; this does
    // not change the database architecture, only test isolation.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
