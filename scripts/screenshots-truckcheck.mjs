/**
 * Playwright captures for the Truck Check / quiz slice (§4–§5).
 * Run against a production server started with ALLOW_DEMO_SHIFT=1 (so the
 * later-shift path is reachable without a database):
 *   ALLOW_DEMO_SHIFT=1 npx next start -p 3200
 *   BASE_URL=http://localhost:3200 node scripts/screenshots-truckcheck.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3200';
const OUT = 'docs/screenshots';
const FIRST = `${BASE}/scenarios/bls-01`;
const LATER = `${BASE}/scenarios/bls-01?shift=later`;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function open() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  return { context, page: await context.newPage() };
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

// First-shift mandatory Truck Check + full MICU equipment view (same page).
{
  const { context, page } = await open();
  await page.goto(FIRST);
  await page.getByRole('heading', { name: 'Truck Check' }).waitFor();
  await shot(page, 'truckcheck-first-shift');
  await context.close();
}

// Each detailed bag / monitor contents.
for (const [name, file] of [
  ['Airway Bag', 'truckcheck-airway'],
  ['ALS Bag', 'truckcheck-als'],
  ['Trauma Bag', 'truckcheck-trauma'],
  ['Cardiac Monitor', 'truckcheck-monitor'],
]) {
  const { context, page } = await open();
  await page.goto(FIRST);
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await page.getByRole('dialog', { name }).waitFor();
  await shot(page, file);
  await context.close();
}

// Later-shift Yes/No choice.
{
  const { context, page } = await open();
  await page.goto(LATER);
  await page.getByRole('button', { name: /no — quiz me/i }).waitFor();
  await shot(page, 'truckcheck-later-choice');
  await context.close();
}

// Five-question challenge.
{
  const { context, page } = await open();
  await page.goto(LATER);
  await page.getByRole('button', { name: /no — quiz me/i }).click();
  await page.getByRole('button', { name: /submit answers/i }).waitFor();
  await shot(page, 'truckcheck-quiz');
  await context.close();
}

// Correct answers for the fixed bank order (a real learner sees a random five;
// the demo server serves the bank order deterministically for a clean capture).
const CORRECT = {
  io_location: 'als_bag',
  tourniquets: 'trauma_bag',
  airway_suction: 'no',
  broselow: 'als_bag',
  narcotics: 'belt',
  pacing: 'cardiac_monitor',
  chest_seals: 'trauma_bag',
  oxygen: 'airway_bag',
  etco2: 'cardiac_monitor',
  iv_fluids: 'als_bag',
  supraglottic: 'airway_bag',
  cardioversion: 'cardiac_monitor',
  pelvic_binder: 'separate',
  ballistic: 'crew',
  hemorrhage: 'trauma_bag',
};

async function answerQuiz(page, makeWrong = false) {
  const fieldsets = page.locator('fieldset');
  const count = await fieldsets.count();
  for (let i = 0; i < count; i++) {
    const legend = (await fieldsets.nth(i).locator('legend').textContent()) ?? '';
    const radios = fieldsets.nth(i).locator('input[type=radio]');
    const n = await radios.count();
    // Find this question's id from any radio's name.
    const qid = await radios.first().getAttribute('name');
    let correct = CORRECT[qid];
    if (makeWrong && i === 0) {
      // Pick any option that isn't the correct one.
      for (let r = 0; r < n; r++) {
        const val = await radios.nth(r).getAttribute('value');
        if (val !== correct) {
          correct = val;
          break;
        }
      }
    }
    await fieldsets.nth(i).locator(`input[value="${correct}"]`).check();
    void legend;
  }
}

// Passed challenge (5/5 -> pass message).
{
  const { context, page } = await open();
  await page.goto(LATER);
  await page.getByRole('button', { name: /no — quiz me/i }).click();
  await answerQuiz(page, false);
  await page.getByRole('button', { name: /submit answers/i }).click();
  await page.getByText(/you know your truck/i).waitFor();
  await shot(page, 'truckcheck-quiz-passed');
  await context.close();
}

// Forced Truck Check after an unsuccessful challenge.
{
  const { context, page } = await open();
  await page.goto(LATER);
  await page.getByRole('button', { name: /no — quiz me/i }).click();
  await answerQuiz(page, true);
  await page.getByRole('button', { name: /submit answers/i }).click();
  await page.getByText(/walk through the truck before we take a call/i).waitFor();
  await shot(page, 'truckcheck-quiz-failed');
  await context.close();
}

await browser.close();
console.log('truck-check screenshots captured');
