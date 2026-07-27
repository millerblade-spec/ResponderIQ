/**
 * Responsive / narrow-screen captures (375px mobile) to back the Step-12
 * responsive review. BASE_URL=http://localhost:3900 node scripts/screenshots-responsive.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3900';
const OUT = 'docs/screenshots';
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

const pages = [
  ['/', 'mobile-home'],
  ['/dashboard', 'mobile-dashboard'],
  ['/instructions', 'mobile-instructions'],
  ['/settings', 'mobile-settings'],
];
for (const [path, name] of pages) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  await context.close();
  console.log(`captured ${name}`);
}
await browser.close();
console.log('responsive screenshots captured');
