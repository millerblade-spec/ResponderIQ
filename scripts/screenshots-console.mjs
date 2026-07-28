/**
 * Playwright captures for the operational command-console rebuild.
 * Requires a production server with ALLOW_DEMO_SHIFT=1:
 *   ALLOW_DEMO_SHIFT=1 npx next start -p 3400
 *   BASE_URL=http://localhost:3400 node scripts/screenshots-console.mjs
 *
 * Each capture is wrapped so one failing interaction never aborts the rest.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3400';
const OUT = 'docs/screenshots';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

async function newPage({ width, height, colorScheme = 'dark' }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme });
  return { context, page: await context.newPage() };
}
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });

async function reachConsole(page, url) {
  await page.goto(url);
  await page.getByRole('button', { name: /medic 3 is ready — go available/i }).click();
  await page.getByRole('button', { name: 'Go available', exact: true }).click();
  await page.getByRole('dialog', { name: /what are you preparing for/i }).waitFor({ timeout: 12000 });
  const group = page.getByRole('group', { name: /differential choices/i });
  for (let i = 0; i < 4; i++) await group.getByRole('button').nth(i).click();
  await page.getByRole('button', { name: /lock in/i }).click();
  await page.getByText(/what equipment do you want to take in/i).waitFor({ timeout: 12000 });
  // Bring the ALS bag so the on-scene equipment list is not empty.
  await page.getByRole('button', { name: /als bag/i }).first().click();
  await page.getByRole('button', { name: /bring these in/i }).click();
  await page.getByRole('tab', { name: 'Crew Operations' }).waitFor({ timeout: 12000 });
}

const tab = (page, name) => page.getByRole('tab', { name }).click();

async function assignViaDrawer(page, responder, category, task) {
  await page.getByRole('button', { name: `Assign ${responder}`, exact: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: category, exact: true }).click();
  await drawer.getByRole('button', { name: task, exact: true }).click();
  await drawer.getByRole('button', { name: /confirm assignment/i }).click();
}

async function safe(label, fn) {
  try {
    await fn();
    console.log('  ✓', label);
  } catch (e) {
    console.log('  ✗', label, '-', String(e).split('\n')[0]);
  }
}

// ---- Desktop 1920×1080, dark: the full console + tabs + crew flow ----
await safe('desktop 1920 flow', async () => {
  const { context, page } = await newPage({ width: 1920, height: 1080 });
  await reachConsole(page, `${BASE}/scenarios/bls-01`);
  await shot(page, 'console-full-1920'); // #1 full console + #2 scene view + #14 dark 1920

  await safe('scene dynamics tab', async () => {
    await tab(page, 'Scene Dynamics');
    await shot(page, 'console-dynamics');
  });
  await safe('patient tab (locked)', async () => {
    await tab(page, 'Patient Assessment');
    await shot(page, 'console-patient-locked');
  });
  await safe('timeline tab', async () => {
    await tab(page, 'Timeline');
    await shot(page, 'console-timeline');
  });

  // Crew flow
  await safe('crew roster', async () => {
    await tab(page, 'Crew Operations');
    await page.getByText(/engine’s here/i).first().waitFor({ timeout: 15000 });
    await shot(page, 'console-crew-roster'); // #5
  });
  await safe('assignment drawer', async () => {
    await page.getByRole('button', { name: 'Assign Partner Ron', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Patient care', exact: true }).click();
    await shot(page, 'console-crew-drawer'); // #6
    await page.getByRole('dialog').getByRole('button', { name: 'Obtain vital signs', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: /confirm assignment/i }).click();
    await shot(page, 'console-ron-assigned'); // #7
  });
  await safe('equipment retrieval', async () => {
    await page.getByText(/what can we do to help/i).first().waitFor({ timeout: 15000 });
    await assignViaDrawer(page, 'Engine 4 FF 2', 'Equipment', 'Bring Portable Suction');
    await page.getByText(/Retrieving Portable Suction/i).waitFor({ timeout: 5000 });
    await shot(page, 'console-retrieval'); // #8
  });
  await safe('resource management', async () => {
    await page.getByRole('button', { name: /do we need more help/i }).click();
    await page.getByRole('button', { name: 'Heavy rescue', exact: true }).waitFor();
    await shot(page, 'console-resources'); // #10
  });

  // Scene safety progression -> patient contact -> clinical in progress
  await safe('clinical in progress', async () => {
    await tab(page, 'Scene View');
    await page.getByRole('button', { name: 'Safe to Enter', exact: true }).click();
    await page.getByRole('button', { name: 'Exit Medic 3', exact: true }).click();
    await page.getByRole('button', { name: 'Establish patient contact', exact: true }).click();
    await shot(page, 'console-scene-contact'); // scene view with contact + crew
    await tab(page, 'Patient Assessment');
    await shot(page, 'console-patient-unlocked'); // #4
    // Try to start the first available clinical action.
    const start = page.getByRole('button', { name: /initial|assessment|vital|interview/i }).first();
    await start.click({ timeout: 3000 });
    const picker = page.getByRole('button', { name: /partner ron|you \(lead|engine/i }).first();
    await picker.click({ timeout: 3000 });
    await shot(page, 'console-clinical-in-progress'); // #11
  });

  await context.close();
});

// ---- Desktop 1366×768, dark ----
await safe('desktop 1366 dark', async () => {
  const { context, page } = await newPage({ width: 1366, height: 768 });
  await reachConsole(page, `${BASE}/scenarios/bls-01`);
  await shot(page, 'console-dark-1366'); // #13
  await context.close();
});

// ---- Desktop 1920×1080, light ----
await safe('desktop light', async () => {
  const { context, page } = await newPage({ width: 1920, height: 1080, colorScheme: 'light' });
  await reachConsole(page, `${BASE}/scenarios/bls-01`);
  await shot(page, 'console-light-1920'); // #15
  await context.close();
});

// ---- Two-engine MVC (1920 dark) ----
await safe('two-engine MVC', async () => {
  const { context, page } = await newPage({ width: 1920, height: 1080 });
  await reachConsole(page, `${BASE}/scenarios/bls-01?call=mvc`);
  await tab(page, 'Crew Operations');
  await page.getByText(/engine’s here/i).first().waitFor({ timeout: 15000 });
  await assignViaDrawer(page, 'Engine 1 FF 1', 'Scene operations', 'Manage traffic');
  await assignViaDrawer(page, 'Engine 2 FF 1', 'Scene operations', 'Assist lifting');
  await shot(page, 'console-mvc'); // #9
  await context.close();
});

// ---- Mobile 390×844: Scene / Crew / Patient tabs ----
await safe('mobile tabs', async () => {
  const { context, page } = await newPage({ width: 390, height: 844 });
  await reachConsole(page, `${BASE}/scenarios/bls-01`);
  await shot(page, 'console-mobile-scene', true); // #16
  await tab(page, 'Crew Operations');
  await page.getByText(/engine’s here/i).first().waitFor({ timeout: 15000 });
  await shot(page, 'console-mobile-crew', true); // #17
  await safe('mobile patient', async () => {
    await tab(page, 'Scene View');
    await page.getByRole('button', { name: 'Safe to Enter', exact: true }).click();
    await page.getByRole('button', { name: 'Exit Medic 3', exact: true }).click();
    await page.getByRole('button', { name: 'Establish patient contact', exact: true }).click();
    await tab(page, 'Patient Assessment');
    await shot(page, 'console-mobile-patient', true); // #18
  });
  await context.close();
});

await browser.close();
console.log('console screenshots done');
