import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { guardBackend } from './e2eGuard.mjs';
import { assertNoConsoleIssues, trackConsoleIssues } from './e2eConsole.mjs';

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
  const eventsHeading = page.getByRole('heading', { name: /^shared$|^zajedničko$/i, level: 1 });
  if (!(await isVisible(eventsHeading))) {
    await page
      .getByRole('navigation', { name: /main navigation|glavna navigacija/i })
      .getByRole('button', { name: /^shared$|^zajedničko$/i })
      .click();
    await eventsHeading.waitFor({ timeout: 15000 });
  }

  // Event cards are buttons; their title is part of the button name, not a heading.
  const eventCard = page.getByRole('button', { name: new RegExp(EVENT_SUMMARY_REGRESSION_EVENT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();
  await eventCard.waitFor({ timeout: 15000 });
  await eventCard.click();
  await page.getByRole('heading', { name: EVENT_SUMMARY_REGRESSION_EVENT, exact: true }).waitFor({ timeout: 15000 });
  // The summary is on the event screen itself: paid vs share, settle up and categories, no tabs.
  await page.getByRole('heading', { name: 'Paid vs share', exact: true }).waitFor({ timeout: 15000 });
};

const verifySummary = async page => {
  await page.getByRole('heading', { name: 'Settle up', exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole('heading', { name: 'By category', exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole('heading', { name: 'Expenses', exact: true }).waitFor({ timeout: 15000 });

  // One row per person who paid or has a share, each saying what they paid.
  const paidRows = await page.locator('section[aria-labelledby="event-paid-title"] li').count();
  if (paidRows < 1) {
    throw new Error(`Expected at least one paid vs share row, found ${paidRows}.`);
  }

  const svgCount = await page.locator('svg').count();
  if (svgCount < 3) {
    throw new Error(`Expected event summary icons to render SVG output, found ${svgCount}.`);
  }

  // Display currency lives on the header ("Show amounts in").
  const currency = page.getByRole('combobox', { name: 'Show amounts in', exact: true });
  await currency.selectOption('USD');
  await page.waitForTimeout(300);
  if ((await currency.inputValue()) !== 'USD') {
    throw new Error('Summary currency did not switch to USD.');
  }
  const tiles = await page.locator('section.screen-hero dd').allInnerTexts();
  if (!tiles.some(text => text.includes('$'))) {
    throw new Error(`Header sums did not switch to USD: ${tiles.join(' | ')}`);
  }

  assertNoConsoleIssues(consoleIssues);
};

const browser = await chromium.launch({ headless: !EVENT_SUMMARY_REGRESSION_HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await guardBackend(context);
const page = await context.newPage();

const consoleIssues = trackConsoleIssues(page);

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
