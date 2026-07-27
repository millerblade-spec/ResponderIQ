/**
 * Playwright captures for the run-completion flow (§23–§26). Production server:
 *   ALLOW_DEMO_SHIFT=1 npx next start -p 3800
 *   BASE_URL=http://localhost:3800 node scripts/screenshots-complete.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3800';
const OUT = 'docs/screenshots';

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await context.newPage();
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

// Reach 'ready' and complete the run.
await page.goto(`${BASE}/scenarios/bls-01`);
await page.getByRole('button', { name: /medic 3 is ready — go available/i }).click();
await page.getByRole('button', { name: 'Go available', exact: true }).click();
await page.getByRole('dialog', { name: /what are you preparing for/i }).waitFor({ timeout: 10000 });
const group = page.getByRole('group', { name: /differential choices/i });
for (let i = 0; i < 4; i++) await group.getByRole('button').nth(i).click();
await page.getByRole('button', { name: /lock in/i }).click();
await page.getByText(/what equipment do you want to take in/i).waitFor({ timeout: 10000 });
await page.getByRole('button', { name: /bring these in/i }).click();
await page.getByRole('button', { name: /transport & complete run/i }).waitFor({ timeout: 10000 });
await page.getByRole('button', { name: /transport & complete run/i }).click();

// 1. Agency sign-in.
await page.getByRole('heading', { name: /agency sign-in/i }).waitFor();
await shot('complete-signin');
await page.getByLabel(/learner name/i).fill('Alex Medic');
await page.getByLabel(/badge or employee id/i).fill('B-1234');
await page.getByRole('button', { name: /continue to reflection/i }).click();

// 2. Learner reflection.
await page.getByRole('heading', { name: /your reflection/i }).waitFor();
await shot('complete-reflection');
await page.getByLabel(/what do you believe went well/i).fill('Kept the family calm and delegated early.');
await page.getByLabel(/what did you believe was happening with the patient/i).fill('Syncope from atrial fibrillation.');
await page.getByRole('button', { name: /continue to feedback/i }).click();

// 3. Simulator feedback.
await page.getByRole('heading', { name: /feedback on responderiq/i }).waitFor();
await shot('complete-feedback');
await page.getByLabel(/what did you like about this scenario/i).fill('Felt realistic.');
await page.getByRole('button', { name: /submit & see debrief/i }).click();

// 4. Learner debrief (+ time management).
await page.getByRole('heading', { name: /^debrief$/i }).waitFor({ timeout: 10000 });
await shot('complete-debrief');

await browser.close();
console.log('run-completion screenshots captured');
