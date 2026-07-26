/**
 * Playwright captures for the clinical workflow (§19). Production server with
 * ALLOW_DEMO_SHIFT=1:
 *   ALLOW_DEMO_SHIFT=1 npx next start -p 3700
 *   BASE_URL=http://localhost:3700 node scripts/screenshots-clinical.mjs
 * Clinical tasks take ~60s of real time, so this waits them out.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3700';
const OUT = 'docs/screenshots';

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

const context = await browser.newContext({
  viewport: { width: 1280, height: 1600 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
const page = await context.newPage();
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

// Reach 'ready'.
await page.goto(`${BASE}/scenarios/bls-01`);
await page.getByRole('button', { name: /medic 3 is ready — go available/i }).click();
await page.getByRole('button', { name: 'Go available', exact: true }).click();
await page.getByRole('dialog', { name: /what are you preparing for/i }).waitFor({ timeout: 10000 });
const group = page.getByRole('group', { name: /differential choices/i });
for (let i = 0; i < 4; i++) await group.getByRole('button').nth(i).click();
await page.getByRole('button', { name: /lock in/i }).click();
await page.getByText(/what equipment do you want to take in/i).waitFor({ timeout: 10000 });
await page.getByRole('button', { name: /bring these in/i }).click();
await page.getByRole('region', { name: /clinical assessment/i }).waitFor({ timeout: 10000 });

// 1. Clinical locked before patient contact.
await shot('clinical-locked');

// Work through scene safety to patient contact.
await page.getByRole('button', { name: 'Safe to Enter', exact: true }).click();
await page.getByRole('button', { name: /exit medic 3/i }).click();
await page.getByRole('button', { name: /establish patient contact/i }).click();
await page.getByRole('button', { name: /obtain vital signs/i }).waitFor();

// 2. Unlocked sections (monitor shows Equipment Required — still on Medic 3).
await shot('clinical-unlocked');

// Wait for fire personnel on scene so we can parallelize assessments.
await page.waitForTimeout(6000);

async function assign(verb, responder) {
  await page.getByRole('button', { name: verb }).first().click();
  const picker = page.getByLabel('Choose who performs this');
  await picker.getByRole('button', { name: responder, exact: true }).click();
}

await assign(/obtain vital signs/i, 'Partner Ron');
await assign(/interview the patient/i, 'Engine 4 FF 1');
await assign(/examine extremities/i, 'Engine 4 FF 2');

// 3. Assessments in progress.
await shot('clinical-in-progress');

// 4. Results available (wait out the 60s tasks).
await page.getByText('148/88').waitFor({ timeout: 75000 });
await shot('clinical-results');

// 5. Revise the working differential (reorder + set a working impression).
await page.getByRole('button', { name: /Move Hip or pelvic fracture up/i }).click();
await page.getByRole('button', { name: /Set Hip or pelvic fracture as working impression/i }).click();
await shot('clinical-differential');

await browser.close();
console.log('clinical screenshots captured');
