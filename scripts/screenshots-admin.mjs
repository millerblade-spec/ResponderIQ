/**
 * Admin sign-in capture. The populated admin views (learner list, attempt
 * history, score bands, critical concern, timeline, clinical record, progress)
 * require PostgreSQL + a seeded admin session and are verified by the CI
 * integration tests (AdminOperationalDetail/AdminReview *.test.tsx) rather than
 * a local screenshot, since local runs have no database.
 *   BASE_URL=http://localhost:3900 node scripts/screenshots-admin.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3900';
const OUT = 'docs/screenshots';
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const scheme of ['dark', 'light']) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme });
  const page = await context.newPage();
  // Unauthenticated /admin/runs redirects to the admin sign-in.
  await page.goto(`${BASE}/admin/runs`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/admin-login-${scheme}.png`, fullPage: true });
  await context.close();
  console.log(`captured admin-login-${scheme}`);
}
await browser.close();
console.log('admin screenshots captured');
