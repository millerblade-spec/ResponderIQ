/**
 * RPOS program view capture. Unlike the other admin captures, these views are
 * entirely database-derived, so this script signs in with a real admin account
 * and shoots the populated roster and one responder's standing.
 *
 *   DATABASE_URL=... SESSION_SECRET=... npm run build && npm start -- -p 3900
 *   BASE_URL=http://localhost:3900 ADMIN_USERNAME=... ADMIN_PASSWORD=... \
 *     PROGRAM_BADGE=B-1234 node scripts/screenshots-program.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3900';
const USERNAME = process.env.ADMIN_USERNAME;
const PASSWORD = process.env.ADMIN_PASSWORD;
const BADGE = process.env.PROGRAM_BADGE;
const OUT = 'docs/screenshots';

if (!USERNAME || !PASSWORD) {
  console.error('Set ADMIN_USERNAME and ADMIN_PASSWORD to an account created by npm run db:seed-admin.');
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const scheme of ['dark', 'light']) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2, colorScheme: scheme });
  const page = await context.newPage();

  await page.goto(`${BASE}/admin/login?next=%2Fadmin%2Fprogram`);
  await page.fill('#username', USERNAME);
  await page.fill('#password', PASSWORD);
  await Promise.all([page.waitForURL('**/admin/program'), page.click('button[type="submit"]')]);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/program-roster-${scheme}.png`, fullPage: true });
  console.log(`captured program-roster-${scheme}`);

  if (BADGE) {
    await page.goto(`${BASE}/admin/program/${encodeURIComponent(BADGE)}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUT}/program-standing-${scheme}.png`, fullPage: true });
    console.log(`captured program-standing-${scheme}`);
  }

  await context.close();
}

await browser.close();
console.log('program screenshots captured');
