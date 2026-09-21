/**
 * RPOS view capture. These views are entirely database-derived, so unlike the
 * other admin captures this script signs in with a real admin account and
 * shoots the populated roster and one responder's level standing.
 *
 *   DATABASE_URL=... SESSION_SECRET=... npm run build && npm start -- -p 3900
 *   BASE_URL=http://localhost:3900 ADMIN_USERNAME=... ADMIN_PASSWORD=... \
 *     RPOS_BADGE=B-1234 node scripts/screenshots-rpos.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3900';
const USERNAME = process.env.ADMIN_USERNAME;
const PASSWORD = process.env.ADMIN_PASSWORD;
const BADGE = process.env.RPOS_BADGE;
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

  await page.goto(`${BASE}/admin/login?next=%2Fadmin%2Frpos`);
  await page.fill('#username', USERNAME);
  await page.fill('#password', PASSWORD);
  await Promise.all([page.waitForURL('**/admin/rpos'), page.click('button[type="submit"]')]);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/rpos-roster-${scheme}.png`, fullPage: true });
  console.log(`captured rpos-roster-${scheme}`);

  if (BADGE) {
    await page.goto(`${BASE}/admin/rpos/${encodeURIComponent(BADGE)}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUT}/rpos-standing-${scheme}.png`, fullPage: true });
    console.log(`captured rpos-standing-${scheme}`);
  }

  await context.close();
}

await browser.close();
console.log('RPOS screenshots captured');
