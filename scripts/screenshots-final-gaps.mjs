/**
 * Final Step-12 gap captures. Production server with ALLOW_DEMO_SHIFT=1:
 *   ALLOW_DEMO_SHIFT=1 npx next start -p 3900
 *   BASE_URL=http://localhost:3900 node scripts/screenshots-final-gaps.mjs
 * Covers: police arrival (security scene), cardiac monitor applied, 12-lead
 * completed, interview w/ source labels, focused exam, and reassessment with
 * deterioration (deterioration fires at 240 mission-seconds, so this runs long).
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3900';
const OUT = 'docs/screenshots';
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function open(colorScheme = 'dark') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 }, deviceScaleFactor: 2, colorScheme });
  return { context, page: await context.newPage() };
}

async function reachEquipment(page, query = '') {
  await page.goto(`${BASE}/scenarios/bls-01${query}`);
  await page.getByRole('button', { name: /medic 3 is ready — go available/i }).click();
  await page.getByRole('button', { name: 'Go available', exact: true }).click();
  await page.getByRole('dialog', { name: /what are you preparing for/i }).waitFor({ timeout: 10000 });
  const group = page.getByRole('group', { name: /differential choices/i });
  for (let i = 0; i < 4; i++) await group.getByRole('button').nth(i).click();
  await page.getByRole('button', { name: /lock in/i }).click();
  await page.getByRole('dialog', { name: /what equipment do you want to take in/i }).waitFor({ timeout: 10000 });
}

// ---- Police arrival (security scene) ----
{
  const { context, page } = await open();
  await reachEquipment(page, '?scene=security');
  await page.getByRole('button', { name: /bring these in/i }).click();
  // Security scene dispatches with a staging order, so it opens already staged
  // for law enforcement. Police arrive 15s after staging.
  await page.getByRole('heading', { name: /staged for law enforcement/i }).waitFor({ timeout: 15000 });
  await page.getByText(/police on scene/i).waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${OUT}/scene-police-arrival.png`, fullPage: true });
  await context.close();
  console.log('captured scene-police-arrival');
}

// ---- Clinical: monitor applied, 12-lead, interview, exam, reassessment ----
{
  const { context, page } = await open();
  await reachEquipment(page);
  // Bring in the cardiac monitor + ALS bag so monitor/12-lead/glucose are available.
  await page.getByRole('button', { name: 'Cardiac Monitor', exact: true }).click();
  await page.getByRole('button', { name: 'ALS Bag', exact: true }).click();
  await page.getByRole('button', { name: /bring these in/i }).click();
  await page.getByRole('button', { name: 'Safe to Enter', exact: true }).click();
  await page.getByRole('button', { name: /exit medic 3/i }).click();
  await page.getByRole('button', { name: /establish patient contact/i }).click();
  await page.getByRole('region', { name: /clinical assessment/i }).waitFor({ timeout: 10000 });

  // Let fire personnel arrive so tasks can run in parallel.
  await page.waitForTimeout(7000);
  async function assign(verb, responder) {
    await page.getByRole('button', { name: verb }).first().click();
    const picker = page.getByLabel('Choose who performs this');
    await picker.getByRole('button', { name: responder, exact: true }).click();
  }
  await assign(/perform initial assessment/i, 'Partner Ron');
  await page.waitForTimeout(1000);
  await assign(/interview the patient/i, 'Engine 4 FF 1');
  await assign(/examine extremities/i, 'Engine 4 FF 2');
  await assign(/apply cardiac monitor/i, 'Engine 4 FF 3');

  // Interview + exam (60s) complete → source-labelled findings.
  await page.getByText(/Reported by patient|Patient interview/i).first().waitFor({ timeout: 80000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/clinical-interview-exam.png`, fullPage: true });
  console.log('captured clinical-interview-exam');

  // Monitor applied → Results Available on Cardiac Monitoring; then 12-lead.
  await page.getByText('Results Available').first().waitFor({ timeout: 80000 });
  await page.screenshot({ path: `${OUT}/clinical-monitor-applied.png`, fullPage: true });
  console.log('captured clinical-monitor-applied');

  await assign(/obtain 12-lead ecg/i, 'Partner Ron');
  await page.waitForTimeout(62000);
  await page.screenshot({ path: `${OUT}/clinical-12-lead.png`, fullPage: true });
  console.log('captured clinical-12-lead');

  // Reassessment: deterioration fires at 240 mission-seconds. Wait it out, then reassess.
  await page.waitForTimeout(190000);
  await assign(/reassess the patient/i, 'Partner Ron');
  await page.waitForTimeout(62000);
  await page.getByText(/deterioration|reassess/i).first().waitFor({ timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/clinical-reassessment.png`, fullPage: true });
  console.log('captured clinical-reassessment');
  await context.close();
}

await browser.close();
console.log('final-gaps screenshots captured');
