import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { guardBackend } from './e2eGuard.mjs';

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
const deleteRecurringLabel = 'Delete recurring';
const consoleIssues = [];

const isVisible = async locator => locator.isVisible().catch(() => false);
const waitForSyncWindow = async page => page.waitForTimeout(2600);

const waitForRecurringRowCount = async (page, expectedCount) => {
  await page.waitForFunction(
    ({ prefix, count }) => {
      const titles = Array.from(document.querySelectorAll('p.font-medium'));
      return titles.filter(element => element.textContent?.includes(prefix)).length >= count;
    },
    { prefix: recurringPrefix, count: expectedCount },
    { timeout: 15000 },
  );
};

const waitForRowPausedState = async (page, rowIndex, shouldBePaused) => {
  await page.waitForFunction(
    ({ prefix, index, paused }) => {
      const titles = Array.from(document.querySelectorAll('p.font-medium'));
      const matchingTitles = titles.filter(element => element.textContent?.includes(prefix));
      const title = matchingTitles[index];
      const row = title?.closest('div.bg-surface-container-low');
      return row ? row.className.includes('opacity-50') === paused : false;
    },
    { prefix: recurringPrefix, index: rowIndex, paused: shouldBePaused },
    { timeout: 15000 },
  );
};

const clickRowAction = async (page, rowIndex, buttonIndex) => {
  await page.evaluate(
    ({ prefix, recurringIndex, buttonActionIndex }) => {
      const titles = Array.from(document.querySelectorAll('p.font-medium'));
      const matchingTitles = titles.filter(element => element.textContent?.includes(prefix));
      const title = matchingTitles[recurringIndex];
      const row = title?.closest('div.bg-surface-container-low');
      if (!(row instanceof HTMLDivElement)) {
        throw new Error(`Could not resolve recurring row at index ${recurringIndex}.`);
      }

      const buttons = Array.from(row.querySelectorAll('button'));
      const button = buttons[buttonActionIndex];
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error(`Could not resolve recurring action button at index ${buttonActionIndex}.`);
      }

      button.click();
    },
    { prefix: recurringPrefix, recurringIndex: rowIndex, buttonActionIndex: buttonIndex },
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
  const settingsHeading = page.getByRole('heading', { name: /settings|podešavanja|podesavanja/i }).first();
  if (!(await isVisible(settingsHeading))) {
    await page.locator('aside button, nav button').filter({ hasText: /settings|podešavanja|podesavanja/i }).first().click();
    await settingsHeading.waitFor({ timeout: 15000 });
  }

  const recurringTab = page.getByRole('button', { name: /recurring|ponavljaju/i }).first();
  await recurringTab.click();
  await page.getByRole('heading', { name: /recurring|ponavljaju/i }).first().waitFor({ timeout: 15000 });
};

const createRecurring = async page => {
  await page.waitForTimeout(2500);
  const existingRows = await page.evaluate(prefix => (
    Array.from(document.querySelectorAll('p.font-medium')).filter(element => element.textContent?.includes(prefix)).length
  ), recurringPrefix);

  await page.getByRole('button', { name: /add recurring transaction|dodaj ponavljajuću transakciju|dodaj ponavljajucu transakciju/i }).click();
  await page.getByPlaceholder(/name|ime/i).fill(recurringName);
  await page.getByPlaceholder(/amount|iznos/i).fill('19.5');
  await page.getByRole('button', { name: /^add$|^dodaj$/i }).click();
  await waitForRecurringRowCount(page, existingRows + 1);
  await waitForSyncWindow(page);

  return existingRows;
};

const toggleRecurring = async (page, rowIndex, _expectedLabel, nextLabel) => {
  await clickRowAction(page, rowIndex, 0);
  await waitForRowPausedState(page, rowIndex, nextLabel === 'Resume recurring');
  await waitForSyncWindow(page);
};

const deleteRecurring = async (page, rowIndex, expectedCountAfterDelete) => {
  await clickRowAction(page, rowIndex, 1);
  await waitForSyncWindow(page);

  const remainingRowCount = await page.evaluate(prefix => (
    Array.from(document.querySelectorAll('p.font-medium')).filter(element => element.textContent?.includes(prefix)).length
  ), recurringPrefix);
  if (remainingRowCount !== expectedCountAfterDelete) {
    throw new Error(`Expected ${expectedCountAfterDelete} recurring regression rows after delete, got ${remainingRowCount}.`);
  }

  const remainingRow = await page.evaluate(recurringLabel => {
    const titles = Array.from(document.querySelectorAll('p.font-medium'));
    const title = titles.find(element => element.textContent?.includes(recurringLabel));
    const row = title?.closest('div.bg-surface-container-low');
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

page.on('console', message => {
  if (message.type() === 'error' || message.type() === 'warning') {
    consoleIssues.push(`${message.type()}: ${message.text()}`);
  }
});

try {
  await mkdir(screenshotDir, { recursive: true });
  await page.goto(RECURRING_REGRESSION_URL, { waitUntil: 'networkidle' });
  await signInIfNeeded(page);
  await openRecurringSettings(page);
  const createdRowIndex = await createRecurring(page);
  await toggleRecurring(page, createdRowIndex, 'Pause recurring', 'Resume recurring');
  await toggleRecurring(page, createdRowIndex, 'Resume recurring', 'Pause recurring');
  await deleteRecurring(page, createdRowIndex, createdRowIndex);
  await page.reload({ waitUntil: 'networkidle' });
  await openRecurringSettings(page);
  await page.waitForTimeout(2500);

  const remainingRows = await page.evaluate(prefix => (
    Array.from(document.querySelectorAll('p.font-medium')).filter(element => element.textContent?.includes(prefix)).length
  ), recurringPrefix);
  if (remainingRows !== createdRowIndex) {
    throw new Error(`Recurring regression row count changed after reload. Expected ${createdRowIndex}, got ${remainingRows}.`);
  }

  if (consoleIssues.length > 0) {
    throw new Error(`Console issues detected: ${consoleIssues.join(' | ')}`);
  }

  await page.screenshot({ path: successScreenshotPath, fullPage: true });
  console.log('Recurring regression passed.');
} catch (error) {
  await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
