/**
 * Playwright captures for the scene-safety slice (§15–§19).
 * Requires a production server started with ALLOW_DEMO_SHIFT=1 (so the security
 * scene variant is reachable):
 *   ALLOW_DEMO_SHIFT=1 npx next start -p 3300
 *   BASE_URL=http://localhost:3300 node scripts/screenshots-scene.mjs
 *
 * The mission clock is real time, so this walks the actual flow: Truck Check ->
 * dispatch tone (3s) -> differential -> equipment (3s) -> scene safety, and for
 * the security scene it waits out the 15s + 10s police sequence.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3300';
const OUT = 'docs/screenshots';

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function open() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  return { context, page: await context.newPage() };
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

/** Walks Truck Check -> dispatch -> differential -> equipment, landing on scene safety. */
async function reachScene(page, url) {
  await page.goto(url);
  await page.getByRole('button', { name: /medic 3 is ready — go available/i }).click();
  await page.getByRole('button', { name: 'Go available', exact: true }).click();
  await page.getByRole('dialog', { name: /what are you preparing for/i }).waitFor({ timeout: 10000 });
  const group = page.getByRole('group', { name: /differential choices/i });
  for (let i = 0; i < 4; i++) await group.getByRole('button').nth(i).click();
  await page.getByRole('button', { name: /lock in/i }).click();
  await page.getByText(/what equipment do you want to take in/i).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /bring these in/i }).click();
}

// Normal scene: windshield assessment (factors + scene-lights prompt + clinical lock).
{
  const { context, page } = await open();
  await reachScene(page, `${BASE}/scenarios/bls-01`);
  await page.getByText(/are we safe to enter/i).waitFor({ timeout: 10000 });
  await shot(page, 'scene-windshield');

  // Scene lights on -> reveals hidden hazards.
  await page.getByRole('button', { name: /turn scene lights on/i }).click();
  await page.getByText(/standing water/i).waitFor();
  await shot(page, 'scene-lights-revealed');
  await context.close();
}

// Normal scene: safe to enter -> exit -> patient contact (clinical unlocked).
{
  const { context, page } = await open();
  await reachScene(page, `${BASE}/scenarios/bls-01`);
  await page.getByRole('button', { name: 'Safe to Enter', exact: true }).click();
  await page.getByRole('button', { name: /exit medic 3/i }).click();
  await page.getByRole('button', { name: /establish patient contact/i }).click();
  await page.getByText(/clinical assessment is now available/i).waitFor();
  await shot(page, 'scene-patient-contact');
  await context.close();
}

// Security scene: staging + police timeline + ballistic PPE prompt.
{
  const { context, page } = await open();
  await reachScene(page, `${BASE}/scenarios/bls-01?scene=security`);
  await page.getByText(/this is a shooting scene/i).waitFor({ timeout: 10000 });
  await shot(page, 'scene-staging-ballistic');

  // Police arrive (15s) then secure (10s) -> cleared to enter.
  await page.getByText(/clear to enter/i).waitFor({ timeout: 40000 });
  await shot(page, 'scene-cleared');
  await context.close();
}

await browser.close();
console.log('scene-safety screenshots captured');
