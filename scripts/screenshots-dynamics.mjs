/**
 * Playwright captures for Scene Dynamics (§20). Production server with
 * ALLOW_DEMO_SHIFT=1:
 *   ALLOW_DEMO_SHIFT=1 npx next start -p 3600
 *   BASE_URL=http://localhost:3600 node scripts/screenshots-dynamics.mjs
 * Real-time: waits out the 10s/5s escalation intervals.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3600';
const OUT = 'docs/screenshots';

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function open() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1500 },
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
  await page.getByRole('region', { name: /scene dynamics/i }).waitFor({ timeout: 10000 });
}

// One active distraction (normal difficulty).
{
  const { context, page } = await open();
  await reachReady(page, `${BASE}/scenarios/bls-01`);
  await page.getByText('Family / spouse').waitFor({ timeout: 10000 });
  await shot(page, 'dynamics-one-distraction');
  await context.close();
}

// Advanced: several simultaneous distractions, escalated.
{
  const { context, page } = await open();
  await reachReady(page, `${BASE}/scenarios/bls-01?dyn=advanced`);
  await page.getByText('Family / spouse').waitFor({ timeout: 10000 });
  await page.waitForTimeout(17000); // let the 10s + 5s escalations run
  await shot(page, 'dynamics-advanced-multiple');

  // Being Managed: assign Partner Ron to the family.
  await page.getByRole('button', { name: /assign partner ron to the family/i }).first().click();
  const picker = page.getByLabel('Choose who manages this');
  await picker.getByRole('button', { name: 'Partner Ron', exact: true }).click();
  await page.getByText('Being Managed').first().waitFor();
  await shot(page, 'dynamics-being-managed');

  // Resolve the television directly.
  await page.getByRole('button', { name: /turn television off/i }).first().click();
  await page.getByText('Resolved').first().waitFor();
  await shot(page, 'dynamics-resolved');
  await context.close();
}

// Bystander interfering (advanced, waited to top stage).
{
  const { context, page } = await open();
  await reachReady(page, `${BASE}/scenarios/bls-01?dyn=advanced`);
  await page.getByText('Bystander').waitFor({ timeout: 10000 });
  await page.waitForTimeout(22000); // bystander -> "Blocking access or interfering"
  await page.getByText(/blocking access or interfering/i).waitFor({ timeout: 10000 });
  await shot(page, 'dynamics-bystander-interfering');
  await context.close();
}

await browser.close();
console.log('scene-dynamics screenshots captured');
