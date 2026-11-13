import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { guardBackend } from './e2eGuard.mjs';

const EVENT_SUMMARY_REGRESSION_URL = process.env.EVENT_SUMMARY_REGRESSION_URL ?? 'http://127.0.0.1:3000';
const EVENT_SUMMARY_REGRESSION_EMAIL = process.env.EVENT_SUMMARY_REGRESSION_EMAIL;
const EVENT_SUMMARY_REGRESSION_PASSWORD = process.env.EVENT_SUMMARY_REGRESSION_PASSWORD;
const EVENT_SUMMARY_REGRESSION_EVENT = process.env.EVENT_SUMMARY_REGRESSION_EVENT ?? 'Bergamo';
const EVENT_SUMMARY_REGRESSION_HEADED = process.env.EVENT_SUMMARY_REGRESSION_HEADED === '1';

if (!EVENT_SUMMARY_REGRESSION_EMAIL || !EVENT_SUMMARY_REGRESSION_PASSWORD) {
  console.error('Missing EVENT_SUMMARY_REGRESSION_EMAIL or EVENT_SUMMARY_REGRESSION_PASSWORD.');
  process.exit(1);
}

const screenshotDir = 'output/playwright';
const successScreenshotPath = `${screenshotDir}/event-summary-regression-success.png`;
const failureScreenshotPath = `${screenshotDir}/event-summary-regression-failure.png`;
const consoleIssues = [];

const isVisible = async locator => locator.isVisible().catch(() => false);

const signInIfNeeded = async page => {
  const signInButton = page.getByRole('button', { name: /sign in|prijavi/i });
  if (!(await isVisible(signInButton))) {
    return;
  }

  await page.locator('input[type="email"]').fill(EVENT_SUMMARY_REGRESSION_EMAIL);
  await page.locator('input[type="password"]').fill(EVENT_SUMMARY_REGRESSION_PASSWORD);
  await signInButton.click();
  await page.waitForLoadState('networkidle');
};

const openEventSummary = async page => {
  const eventsHeading = page.getByRole('heading', { name: /events/i }).first();
  if (!(await isVisible(eventsHeading))) {
    await page.getByText(/events/i).first().click();
    await eventsHeading.waitFor({ timeout: 15000 });
  }

  const eventHeading = page.getByRole('heading', { name: EVENT_SUMMARY_REGRESSION_EVENT, exact: true }).first();
  await eventHeading.waitFor({ timeout: 15000 });
  await eventHeading.click();
  await page.getByRole('heading', { name: EVENT_SUMMARY_REGRESSION_EVENT, exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Summary', exact: true }).click();
  await page.getByText('Spending Breakdown', { exact: true }).waitFor({ timeout: 15000 });
};

const verifySummary = async page => {
  await page.getByText('Individual Stats', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('By Category', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('Settlement', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('Display Currency', { exact: true }).waitFor({ timeout: 15000 });

  const cardCount = await page.locator('text=Paid').count();
  if (cardCount < 1) {
    throw new Error(`Expected at least one event summary person card, found ${cardCount}.`);
  }

  const svgCount = await page.locator('svg').count();
  if (svgCount < 3) {
    throw new Error(`Expected event summary charts/icons to render SVG output, found ${svgCount}.`);
  }

  const usdButton = page.getByRole('button', { name: 'USD', exact: true }).first();
  await usdButton.click();
  await page.waitForTimeout(300);
  const usdClass = (await usdButton.getAttribute('class')) ?? '';
  if (!usdClass.includes('bg-primary')) {
    throw new Error('Summary currency toggle did not activate USD.');
  }

  if (consoleIssues.length > 0) {
    throw new Error(`Console issues detected: ${consoleIssues.join(' | ')}`);
  }
};

const browser = await chromium.launch({ headless: !EVENT_SUMMARY_REGRESSION_HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await guardBackend(context);
const page = await context.newPage();

page.on('console', message => {
  if (message.type() === 'error' || message.type() === 'warning') {
    consoleIssues.push(`${message.type()}: ${message.text()}`);
  }
});

try {
  await mkdir(screenshotDir, { recursive: true });
  await page.goto(EVENT_SUMMARY_REGRESSION_URL, { waitUntil: 'networkidle' });
  await signInIfNeeded(page);
  await openEventSummary(page);
  await verifySummary(page);
  await page.screenshot({ path: successScreenshotPath, fullPage: true });
  console.log(`Event summary regression passed for "${EVENT_SUMMARY_REGRESSION_EVENT}".`);
} catch (error) {
  await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
