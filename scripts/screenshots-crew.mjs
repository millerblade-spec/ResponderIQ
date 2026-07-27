/**
 * Playwright captures for the crew slice (§10–§14). Requires a production server
 * with ALLOW_DEMO_SHIFT=1:
 *   ALLOW_DEMO_SHIFT=1 npx next start -p 3400
 *   BASE_URL=http://localhost:3400 node scripts/screenshots-crew.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3400';
const OUT = 'docs/screenshots';

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function open() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1400 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  return { context, page: await context.newPage() };
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

async function reachReady(page, url) {
  await page.goto(url);
  await page.getByRole('button', { name: /medic 3 is ready — go available/i }).click();
  await page.getByRole('button', { name: 'Go available', exact: true }).click();
  await page.getByRole('dialog', { name: /what are you preparing for/i }).waitFor({ timeout: 10000 });
  const group = page.getByRole('group', { name: /differential choices/i });
  for (let i = 0; i < 4; i++) await group.getByRole('button').nth(i).click();
  await page.getByRole('button', { name: /lock in/i }).click();
  await page.getByText(/what equipment do you want to take in/i).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /bring these in/i }).click();
  await page.getByRole('region', { name: /crew assignments/i }).waitFor({ timeout: 10000 });
}

async function assign(page, responderLabel, taskLabel) {
  await page.getByRole('button', { name: `Assign ${responderLabel}`, exact: true }).click();
  const palette = page.getByLabel('Task palette');
  await palette.getByRole('button', { name: taskLabel, exact: true }).click();
}

// ---- EMS single-engine flow ----
{
  const { context, page } = await open();
  await reachReady(page, `${BASE}/scenarios/bls-01`);

  await page.getByText(/engine’s here/i).waitFor({ timeout: 15000 });
  await shot(page, 'crew-arrival');

  await page.getByText(/what can we do to help/i).waitFor({ timeout: 15000 });
  await shot(page, 'crew-officer-prompt');
  await shot(page, 'crew-awaiting'); // roster all Awaiting Assignment

  // Assignment palette.
  await page.getByRole('button', { name: 'Assign Engine 4 FF 1', exact: true }).click();
  await page.getByLabel('Task palette').waitFor();
  await shot(page, 'crew-assign-palette');
  await page.getByLabel('Task palette').getByRole('button', { name: 'Maintain scene safety', exact: true }).click();

  // Partner Ron assigned.
  await assign(page, 'Partner Ron', 'Obtain vital signs');
  await shot(page, 'crew-ron-assigned');

  // Equipment retrieval (45s timer).
  await assign(page, 'Engine 4 FF 2', 'Bring Portable Suction');
  await page.getByText(/Retrieving Portable Suction/i).waitFor();
  await shot(page, 'crew-retrieval');

  // Reassign state.
  await page.getByRole('button', { name: "Reassign Partner Ron's task", exact: true }).click();
  await shot(page, 'crew-reassign');
  await page.getByRole('button', { name: /Assign the reassigned task to Engine 4 FF 3/i }).click();

  // Clear Engine blocked (FF1 safety role + FF2 retrieving).
  await page.getByRole('button', { name: /clear engine from call/i }).click();
  await page.getByText(/cannot be cleared while/i).waitFor();
  await shot(page, 'crew-clear-blocked');

  // Resource request.
  await page.getByRole('button', { name: /do we need more help/i }).click();
  await page.getByRole('button', { name: 'Heavy rescue', exact: true }).waitFor();
  await shot(page, 'crew-resources');

  // Cancel obligations, then clear the (last) engine with confirmation.
  await page.getByRole('button', { name: "Cancel Engine 4 FF 1's task", exact: true }).click();
  await page.getByRole('button', { name: "Cancel Engine 4 FF 2's task", exact: true }).click();
  await page.getByRole('button', { name: "Cancel Engine 4 FF 3's task", exact: true }).click();
  await page.getByRole('button', { name: /clear engine from call/i }).click(); // -> confirm
  await page.getByRole('button', { name: /clear engine 4 from the call\?/i }).click();
  await page.getByText(/Engine 4 — Cleared from Call/i).waitFor();
  await shot(page, 'crew-clear-success');
  await context.close();
}

// ---- Two-engine MVC flow ----
{
  const { context, page } = await open();
  await reachReady(page, `${BASE}/scenarios/bls-01?call=mvc`);
  await page.getByText(/engine’s here/i).waitFor({ timeout: 15000 });
  await assign(page, 'Engine 1 FF 1', 'Manage traffic');
  await assign(page, 'Engine 2 FF 1', 'Assist lifting');
  await shot(page, 'crew-mvc-assignment');
  await context.close();
}

await browser.close();
console.log('crew screenshots captured');
