/**
 * Interactive Playwright captures for the operational sequence (§7–§9).
 * Run against a PRODUCTION server (no dev overlay) with the app already built:
 *   npx next start -p 3100
 *   BASE_URL=http://localhost:3100 node scripts/screenshots-opsim.mjs
 *
 * The mission clock runs in real time, so this script actually waits for the
 * 3-second tone, the differential window, and Ron's 3-second equipment pause.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const OUT = 'docs/screenshots';
const SCENARIO = `${BASE}/scenarios/bls-01`;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function open({ colorScheme = 'dark', reduced = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    colorScheme,
  });
  if (reduced) {
    await context.addInitScript(() => {
      localStorage.setItem(
        'responderiq:local-settings',
        JSON.stringify({ reducedMotion: false, theme: 'system', lightingMode: 'reduced' }),
      );
    });
  }
  const page = await context.newPage();
  return { context, page };
}

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

async function selectChoices(page, n) {
  const group = page.getByRole('group', { name: /differential choices/i });
  const buttons = group.getByRole('button');
  for (let i = 0; i < n; i++) await buttons.nth(i).click();
}

// 1. Code 3 dispatch — capture during the responding/tone window (before the popup).
{
  const { context, page } = await open();
  await page.goto(SCENARIO, { waitUntil: 'domcontentloaded' });
  await page.getByText('CODE 3 · RESPONDING').waitFor();
  await shot(page, 'opsim-code3-dispatch');
  await context.close();
}

// 2. Reduced Flashing Mode — steady beacons + preserved label, captured in the tone window.
{
  const { context, page } = await open({ reduced: true });
  await page.goto(SCENARIO, { waitUntil: 'domcontentloaded' });
  await page.getByText(/reduced flashing mode/i).waitFor();
  await shot(page, 'opsim-reduced-flashing');
  await context.close();
}

// 3. Orientation differential challenge (15s window).
{
  const { context, page } = await open();
  await page.goto(SCENARIO);
  await page.getByRole('dialog', { name: /what are you preparing for/i }).waitFor();
  await shot(page, 'opsim-differential-orientation');
  await context.close();
}

// 4. Higher-level differential challenge (10s window).
{
  const { context, page } = await open();
  await page.goto(`${SCENARIO}?level=advanced`);
  await page.getByRole('dialog', { name: /what are you preparing for/i }).waitFor();
  await shot(page, 'opsim-differential-advanced');
  await context.close();
}

// 5. Ranked differentials — six selected, top four ranked, extras considered.
{
  const { context, page } = await open();
  await page.goto(SCENARIO);
  await page.getByRole('dialog', { name: /what are you preparing for/i }).waitFor();
  await selectChoices(page, 6);
  await page.getByText('considered').first().waitFor();
  await shot(page, 'opsim-differential-ranked');
  await context.close();
}

// 6. Equipment-selection popup — select four, lock in, wait Ron's 3s prompt.
{
  const { context, page } = await open();
  await page.goto(SCENARIO);
  await page.getByRole('dialog', { name: /what are you preparing for/i }).waitFor();
  await selectChoices(page, 4);
  await page.getByRole('button', { name: /lock in/i }).click();
  await page.getByText(/what equipment do you want to take in/i).waitFor({ timeout: 8000 });
  await shot(page, 'opsim-equipment');
  await context.close();
}

// 7. ON SCENE state — after locking in, in the 3s window before equipment opens.
{
  const { context, page } = await open();
  await page.goto(SCENARIO);
  await page.getByRole('dialog', { name: /what are you preparing for/i }).waitFor();
  await selectChoices(page, 4);
  await page.getByRole('button', { name: /lock in/i }).click();
  await page.getByText('ON SCENE', { exact: true }).waitFor();
  await shot(page, 'opsim-on-scene');
  await context.close();
}

await browser.close();
console.log('operational screenshots captured');
