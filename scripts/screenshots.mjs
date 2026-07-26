/**
 * Deterministic screenshot capture via Playwright (Chromium).
 *
 * The in-app preview pane can't always composite frames, so this is the
 * reliable local method for the screenshots the spec requires (§31). Theme is
 * driven by emulating prefers-color-scheme, which the app's pre-paint bootstrap
 * resolves for the 'system' preference — no localStorage manipulation needed.
 *
 * Usage:  (dev or prod server running on BASE_URL)
 *   node scripts/screenshots.mjs
 *   BASE_URL=http://localhost:3000 node scripts/screenshots.mjs
 *
 * Add new entries to SHOTS as each screen lands, so the final report's full
 * set is produced by one command.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = 'docs/screenshots';

const SHOTS = [
  { name: 'home-dark', path: '/', scheme: 'dark' },
  { name: 'home-light', path: '/', scheme: 'light' },
  { name: 'instructions-dark', path: '/instructions', scheme: 'dark' },
  { name: 'instructions-light', path: '/instructions', scheme: 'light' },
  { name: 'dashboard-dark', path: '/dashboard', scheme: 'dark' },
  { name: 'settings-light', path: '/settings', scheme: 'light' },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      colorScheme: shot.scheme,
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(BASE + shot.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${shot.name}.png`, fullPage: true });
    console.log('captured', shot.name);
    await context.close();
  }
} finally {
  await browser.close();
}
