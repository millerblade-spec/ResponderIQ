/**
 * Playwright captures for the audio framework (§ Step 11). Production server:
 *   ALLOW_DEMO_SHIFT=1 npx next start -p 3900
 *   BASE_URL=http://localhost:3900 node scripts/screenshots-audio.mjs
 * Captions appear even if the browser suspends the AudioContext (no gesture),
 * because captions are emitted by the controller independent of actual sound.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3900';
const OUT = 'docs/screenshots';

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function open() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  return { context, page: await context.newPage() };
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

// 1. Audio settings (detailed mixer).
{
  const { context, page } = await open();
  await page.goto(`${BASE}/settings`);
  await page.getByRole('heading', { name: 'Audio' }).waitFor();
  await shot(page, 'audio-settings');
  await context.close();
}

// Reach the operational console (compact controls + captions).
{
  const { context, page } = await open();
  await page.goto(`${BASE}/scenarios/bls-01?dyn=advanced`);
  await page.getByRole('button', { name: /medic 3 is ready — go available/i }).click();
  await page.getByRole('button', { name: 'Go available', exact: true }).click();
  await page.getByRole('dialog', { name: /what are you preparing for/i }).waitFor({ timeout: 10000 });
  const group = page.getByRole('group', { name: /differential choices/i });
  for (let i = 0; i < 4; i++) await group.getByRole('button').nth(i).click();
  await page.getByRole('button', { name: /lock in/i }).click();
  await page.getByText(/what equipment do you want to take in/i).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /bring these in/i }).click();

  // 2. Compact controls + dispatch caption.
  await page.getByRole('group', { name: /audio controls/i }).waitFor({ timeout: 10000 });
  await page.getByText('Dispatch alert tone').first().waitFor({ timeout: 10000 });
  await shot(page, 'audio-hud-captions');

  // 3. Fire-engine arrival caption sequence + Ron.
  await page.getByText(/Engine’s here—here they come!/i).first().waitFor({ timeout: 20000 });
  await shot(page, 'audio-arrival-captions');

  // 4. Reduced Sensory Mode enabled.
  await page.getByRole('button', { name: /reduced sensory off/i }).click();
  await page.getByRole('button', { name: /reduced sensory on/i }).waitFor();
  await shot(page, 'audio-reduced-sensory');
  await context.close();
}

await browser.close();
console.log('audio screenshots captured');
