import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { guardBackend } from './e2eGuard.mjs';
import { assertNoConsoleIssues, trackConsoleIssues } from './e2eConsole.mjs';

const RECURRING_REGRESSION_URL = process.env.RECURRING_REGRESSION_URL ?? 'http://127.0.0.1:3000';
const RECURRING_REGRESSION_EMAIL = process.env.RECURRING_REGRESSION_EMAIL;
const RECURRING_REGRESSION_PASSWORD = process.env.RECURRING_REGRESSION_PASSWORD;
const RECURRING_REGRESSION_HEADED = process.env.RECURRING_REGRESSION_HEADED === '1';

if (!RECURRING_REGRESSION_EMAIL || !RECURRING_REGRESSION_PASSWORD) {
  console.error('Missing RECURRING_REGRESSION_EMAIL or RECURRING_REGRESSION_PASSWORD.');
  process.exit(1);
}

const screenshotDir = 'output/playwright';
const successScreenshotPath = `${screenshotDir}/recurring-regression-success.png`;
const failureScreenshotPath = `${screenshotDir}/recurring-regression-failure.png`;
const recurringPrefix = 'Recurring Regression ';
const recurringName = `Recurring Regression ${Date.now()}`;
const pauseRecurringLabel = 'Pause recurring';
const resumeRecurringLabel = 'Resume recurring';
const deleteRecurringLabel = 'Delete recurring';

const isVisible = async locator => locator.isVisible().catch(() => false);
const waitForSyncWindow = async page => page.waitForTimeout(2600);

const waitForRecurringRowCount = async (page, expectedCount) => {
  await page.waitForFunction(
    ({ prefix, count }) => {
      const titles = Array.from(document.querySelectorAll('[data-recurring-title]'));
      return titles.filter(element => element.textContent?.includes(prefix)).length >= count;
    },
    { prefix: recurringPrefix, count: expectedCount },
    { timeout: 15000 },
  );
};

// The row whose title is exactly this run's recurring name.
const getRecurringRow = page =>
  page.locator('[data-recurring-row]').filter({
    has: page.locator('[data-recurring-title]').getByText(recurringName, { exact: true }),
  });

const waitForRowPausedState = async (page, shouldBePaused) => {
  await page.waitForFunction(
    ({ name, paused }) => {
      const title = Array.from(document.querySelectorAll('[data-recurring-title]'))
        .find(element => element.textContent?.trim() === name);
      const row = title?.closest('[data-recurring-row]');
      return row ? (row.getAttribute('data-paused') === 'true') === paused : false;
    },
    { name: recurringName, paused: shouldBePaused },
    { timeout: 15000 },
  );
};

const signInIfNeeded = async page => {
  const signInButton = page.getByRole('button', { name: /sign in|prijavi/i });
  if (!(await isVisible(signInButton))) {
    return;
  }

  await page.locator('input[type="email"]').fill(RECURRING_REGRESSION_EMAIL);
  await page.locator('input[type="password"]').fill(RECURRING_REGRESSION_PASSWORD);
  await signInButton.click();
  await page.waitForLoadState('networkidle');
};

const openRecurringSettings = async page => {
  const settingsHeading = page.getByRole('heading', { name: /^settings$|^podešavanja$/i, level: 1 });
  if (!(await isVisible(settingsHeading))) {
    await page.getByRole('complementary').getByRole('button', { name: /^settings$|^podešavanja$/i }).click();
    await settingsHeading.waitFor({ timeout: 15000 });
  }

  const recurringTab = page
    .getByRole('navigation', { name: /^settings$|^podešavanja$/i })
    .getByRole('button', { name: /recurring|ponavljaju/i });
  await recurringTab.click();
  await page.getByRole('heading', { name: /recurring|ponavljaju/i, level: 2 }).first().waitFor({ timeout: 15000 });
};

const createRecurring = async page => {
  await page.waitForTimeout(2500);
  const existingRows = await page.evaluate(prefix => (
    Array.from(document.querySelectorAll('[data-recurring-title]')).filter(element => element.textContent?.includes(prefix)).length
  ), recurringPrefix);

  await page.getByRole('button', { name: /add recurring transaction|dodaj ponavljajuću transakciju|dodaj ponavljajucu transakciju/i }).click();
  await page.getByLabel(/^name$|^ime$/i).fill(recurringName);
  await page.getByLabel(/^amount$|^iznos$/i).fill('19.5');
  // A category must be picked; the wallet is preselected.
  await page.getByLabel(/^category$|^kategorija$/i).selectOption({ index: 1 });
  await page.getByRole('button', { name: /^add$|^dodaj$/i }).click();
  await waitForRecurringRowCount(page, existingRows + 1);
  await waitForSyncWindow(page);

  return existingRows;
};

const toggleRecurring = async (page, expectedLabel, nextLabel) => {
  const row = getRecurringRow(page);
  await row.getByRole('button', { name: expectedLabel, exact: true }).click();
  await waitForRowPausedState(page, nextLabel === resumeRecurringLabel);
  await row.getByRole('button', { name: nextLabel, exact: true }).waitFor({ timeout: 15000 });
  await waitForSyncWindow(page);
};

const deleteRecurring = async (page, expectedCountAfterDelete) => {
  await getRecurringRow(page).getByRole('button', { name: deleteRecurringLabel, exact: true }).click();
  await waitForSyncWindow(page);

  const remainingRowCount = await page.evaluate(prefix => (
    Array.from(document.querySelectorAll('[data-recurring-title]')).filter(element => element.textContent?.includes(prefix)).length
  ), recurringPrefix);
  if (remainingRowCount !== expectedCountAfterDelete) {
    throw new Error(`Expected ${expectedCountAfterDelete} recurring regression rows after delete, got ${remainingRowCount}.`);
  }

  const remainingRow = await page.evaluate(recurringLabel => {
    const titles = Array.from(document.querySelectorAll('[data-recurring-title]'));
    const title = titles.find(element => element.textContent?.includes(recurringLabel));
    const row = title?.closest('[data-recurring-row]');
    return row instanceof HTMLDivElement;
  }, recurringName);
  if (remainingRow) {
    throw new Error('Recurring row still visible after delete.');
  }
};

const browser = await chromium.launch({ headless: !RECURRING_REGRESSION_HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await guardBackend(context);
const page = await context.newPage();

const consoleIssues = trackConsoleIssues(page);

try {
  await mkdir(screenshotDir, { recursive: true });
  await page.goto(RECURRING_REGRESSION_URL, { waitUntil: 'networkidle' });
  await signInIfNeeded(page);
  await openRecurringSettings(page);
  const existingRegressionRows = await createRecurring(page);
  await toggleRecurring(page, pauseRecurringLabel, resumeRecurringLabel);
  await toggleRecurring(page, resumeRecurringLabel, pauseRecurringLabel);
  await deleteRecurring(page, existingRegressionRows);
  await page.reload({ waitUntil: 'networkidle' });
  await openRecurringSettings(page);
  await page.waitForTimeout(2500);

  const remainingRows = await page.evaluate(prefix => (
    Array.from(document.querySelectorAll('[data-recurring-title]')).filter(element => element.textContent?.includes(prefix)).length
  ), recurringPrefix);
  if (remainingRows !== existingRegressionRows) {
    throw new Error(`Recurring regression row count changed after reload. Expected ${existingRegressionRows}, got ${remainingRows}.`);
  }

  assertNoConsoleIssues(consoleIssues);

  await page.screenshot({ path: successScreenshotPath, fullPage: true });
  console.log('Recurring regression passed.');
} catch (error) {
  await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
