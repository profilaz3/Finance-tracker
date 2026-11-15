import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { guardBackend } from './e2eGuard.mjs';
import { assertNoConsoleIssues, trackConsoleIssues } from './e2eConsole.mjs';

const CLEANUP_RECURRING_URL = process.env.CLEANUP_RECURRING_URL ?? 'http://127.0.0.1:3000';
const CLEANUP_RECURRING_EMAIL = process.env.CLEANUP_RECURRING_EMAIL;
const CLEANUP_RECURRING_PASSWORD = process.env.CLEANUP_RECURRING_PASSWORD;
const CLEANUP_RECURRING_HEADED = process.env.CLEANUP_RECURRING_HEADED === '1';
const recurringPrefixes = ['Recurring Regression ', 'Debug Recurring '];

if (!CLEANUP_RECURRING_EMAIL || !CLEANUP_RECURRING_PASSWORD) {
  console.error('Missing CLEANUP_RECURRING_EMAIL or CLEANUP_RECURRING_PASSWORD.');
  process.exit(1);
}

const screenshotDir = 'output/playwright';
const successScreenshotPath = `${screenshotDir}/cleanup-recurring-regressions-success.png`;
const failureScreenshotPath = `${screenshotDir}/cleanup-recurring-regressions-failure.png`;

const isVisible = async locator => locator.isVisible().catch(() => false);
const waitForSyncWindow = async page => page.waitForTimeout(2600);

const signInIfNeeded = async page => {
  const signInButton = page.getByRole('button', { name: /sign in|prijavi/i });
  if (!(await isVisible(signInButton))) {
    return;
  }

  await page.locator('input[type="email"]').fill(CLEANUP_RECURRING_EMAIL);
  await page.locator('input[type="password"]').fill(CLEANUP_RECURRING_PASSWORD);
  await signInButton.click();
  await page.waitForLoadState('networkidle');
};

const openRecurringSettings = async page => {
  const settingsHeading = page.getByRole('heading', { name: /^settings$|^podešavanja$/i, level: 1 });
  if (!(await isVisible(settingsHeading))) {
    await page.getByRole('complementary').getByRole('button', { name: /^settings$|^podešavanja$/i }).click();
    await settingsHeading.waitFor({ timeout: 15000 });
  }

  await page
    .getByRole('navigation', { name: /^settings$|^podešavanja$/i })
    .getByRole('button', { name: /recurring|ponavljaju/i })
    .click();
  await page.waitForTimeout(2500);
};

const getRegressionCount = async page => page.evaluate(prefixes => {
  const titles = Array.from(document.querySelectorAll('[data-recurring-title]')).map(element => element.textContent || '');
  return titles.filter(title => prefixes.some(prefix => title.includes(prefix))).length;
}, recurringPrefixes);

const deleteFirstRegressionRow = async page => {
  const deleted = await page.evaluate(prefixes => {
    const titles = Array.from(document.querySelectorAll('[data-recurring-title]'));
    const title = titles.find(element => prefixes.some(prefix => element.textContent?.includes(prefix)));
    const row = title?.closest('[data-recurring-row]');
    if (!(row instanceof HTMLDivElement)) {
      return false;
    }

    // The row itself is an edit button; delete is the marked action.
    const deleteButton = row.querySelector('button[data-recurring-action="delete"]');
    if (!(deleteButton instanceof HTMLButtonElement)) {
      return false;
    }

    deleteButton.click();
    return true;
  }, recurringPrefixes);

  if (!deleted) {
    return false;
  }

  await waitForSyncWindow(page);
  return true;
};

const browser = await chromium.launch({ headless: !CLEANUP_RECURRING_HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await guardBackend(context);
const page = await context.newPage();

const consoleIssues = trackConsoleIssues(page);

try {
  await mkdir(screenshotDir, { recursive: true });
  await page.goto(CLEANUP_RECURRING_URL, { waitUntil: 'networkidle' });
  await signInIfNeeded(page);
  await openRecurringSettings(page);

  let count = await getRegressionCount(page);
  while (count > 0) {
    const deleted = await deleteFirstRegressionRow(page);
    if (!deleted) {
      throw new Error('Could not resolve a recurring regression row to delete.');
    }
    count = await getRegressionCount(page);
  }

  await page.reload({ waitUntil: 'networkidle' });
  await openRecurringSettings(page);
  const remaining = await getRegressionCount(page);
  if (remaining !== 0) {
    throw new Error(`Expected 0 recurring regression rows after cleanup, got ${remaining}.`);
  }

  assertNoConsoleIssues(consoleIssues);

  await page.screenshot({ path: successScreenshotPath, fullPage: true });
  console.log('Recurring cleanup passed.');
} catch (error) {
  await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
