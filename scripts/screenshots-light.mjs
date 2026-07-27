/**
 * Light-mode static-page captures against the PRODUCTION server (next start), so
 * no dev indicator badge appears. BASE_URL=http://localhost:3900 node scripts/screenshots-light.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3900';
const OUT = 'docs/screenshots';
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

const pages = [
  ['/', 'home-light'],
  ['/instructions', 'instructions-light'],
  ['/settings', 'settings-light'],
];
for (const [path, name] of pages) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  await context.close();
  console.log(`captured ${name}`);
}
await browser.close();
console.log('light screenshots captured');
