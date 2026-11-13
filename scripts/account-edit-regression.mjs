import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { guardBackend } from './e2eGuard.mjs';

const ACCOUNT_EDIT_REGRESSION_URL = process.env.ACCOUNT_EDIT_REGRESSION_URL ?? 'http://127.0.0.1:3000';
const ACCOUNT_EDIT_REGRESSION_EMAIL = process.env.ACCOUNT_EDIT_REGRESSION_EMAIL;
const ACCOUNT_EDIT_REGRESSION_PASSWORD = process.env.ACCOUNT_EDIT_REGRESSION_PASSWORD;
const ACCOUNT_EDIT_REGRESSION_HEADED = process.env.ACCOUNT_EDIT_REGRESSION_HEADED === '1';

if (!ACCOUNT_EDIT_REGRESSION_EMAIL || !ACCOUNT_EDIT_REGRESSION_PASSWORD) {
  console.error('Missing ACCOUNT_EDIT_REGRESSION_EMAIL or ACCOUNT_EDIT_REGRESSION_PASSWORD.');
  process.exit(1);
}

const screenshotDir = 'output/playwright';
const successScreenshotPath = `${screenshotDir}/account-edit-regression-success.png`;
const failureScreenshotPath = `${screenshotDir}/account-edit-regression-failure.png`;
const consoleIssues = [];

const isVisible = async (locator) => locator.isVisible().catch(() => false);

const parseDisplayedBalance = (text) => {
  const normalized = text.replace(/\s/g, '');
  const match = normalized.match(/-?\d[\d,.]*/);
  if (!match) {
    throw new Error(`Could not parse displayed balance from "${text}".`);
  }

  return Number.parseFloat(match[0].replace(/,/g, ''));
};

const signInIfNeeded = async (page) => {
  const signInButton = page.getByRole('button', { name: /sign in|prijavi/i });
  if (!(await isVisible(signInButton))) {
    return;
  }

  await page.locator('input[type="email"]').fill(ACCOUNT_EDIT_REGRESSION_EMAIL);
  await page.locator('input[type="password"]').fill(ACCOUNT_EDIT_REGRESSION_PASSWORD);
  await signInButton.click();
  await page.waitForLoadState('networkidle');
};

const openSettingsWallets = async (page) => {
  const settingsHeading = page.getByRole('heading', { name: /settings|podešavanja|podesavanja/i }).first();
  if (!(await isVisible(settingsHeading))) {
    await page.locator('aside button, nav button').filter({ hasText: /settings|podešavanja|podesavanja/i }).first().click();
    await settingsHeading.waitFor({ timeout: 15000 });
  }

  const walletsTab = page.getByRole('button', { name: /wallets|nov/i }).first();
  await walletsTab.click();
  await page.getByRole('heading', { name: /wallets|nov/i }).first().waitFor({ timeout: 15000 });
};

const getFirstAccountNameInput = (page) => page.locator('input').first();

const getRowFromNameInput = (nameInput) =>
  nameInput.locator('xpath=ancestor::*[contains(@class,"touch-none")][1]');

const getAccountRowById = (page, accountId) => page.locator(`#${accountId}`);

const getRowNameInput = (row) => row.locator('input').first();

const getRowBalanceDisplay = (row) => row.locator('span.font-mono').first();
const waitForSyncWindow = async () => page.waitForTimeout(1400);

const waitForBalanceToSettle = async (row, timeoutMs = 7000) => {
  const balanceDisplay = getRowBalanceDisplay(row);
  const deadline = Date.now() + timeoutMs;
  const initialDelayMs = 1500;
  const sampleDelayMs = 600;
  const requiredStableSamples = 3;
  const startedAt = Date.now();
  let previous = null;
  let stableSamples = 0;

  while (Date.now() < deadline) {
    const current = (await balanceDisplay.textContent()) ?? '';
    if (current && current === previous) {
      stableSamples += 1;
    } else {
      stableSamples = 1;
    }

    if (
      current &&
      stableSamples >= requiredStableSamples &&
      Date.now() - startedAt >= initialDelayMs
    ) {
      return current;
    }

    previous = current;
    await new Promise(resolve => setTimeout(resolve, sampleDelayMs));
  }

  throw new Error('Account balance did not settle before editing.');
};

const setDisplayedBalance = async (row, amount) => {
  await getRowBalanceDisplay(row).click();
  const balanceInput = row.locator('input[type="number"]').first();
  await balanceInput.waitFor({ timeout: 15000 });
  await balanceInput.fill(amount.toFixed(2));
  await balanceInput.press('Enter');
};

const browser = await chromium.launch({ headless: !ACCOUNT_EDIT_REGRESSION_HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await guardBackend(context);
const page = await context.newPage();

page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    consoleIssues.push(`${message.type()}: ${message.text()}`);
  }
});

try {
  await mkdir(screenshotDir, { recursive: true });
  await page.goto(ACCOUNT_EDIT_REGRESSION_URL, { waitUntil: 'networkidle' });
  await signInIfNeeded(page);
  await openSettingsWallets(page);

  const nameInput = getFirstAccountNameInput(page);
  await nameInput.waitFor({ timeout: 15000 });
  const initialRow = getRowFromNameInput(nameInput);
  const accountId = await initialRow.getAttribute('id');
  if (!accountId) {
    throw new Error('Could not resolve account row id.');
  }
  const row = getAccountRowById(page, accountId);
  const rowNameInput = getRowNameInput(row);
  const originalName = await rowNameInput.inputValue();
  const originalBalanceText = await waitForBalanceToSettle(row);
  const originalBalance = parseDisplayedBalance(originalBalanceText);

  const tempName = `${originalName} QA`;
  const tempBalance = originalBalance + 7.25;

  await rowNameInput.fill(tempName);
  await rowNameInput.press('Tab');
  await waitForSyncWindow();
  const updatedName = await getRowNameInput(row).inputValue();
  if (updatedName !== tempName) {
    throw new Error(`Expected updated account name "${tempName}", got "${updatedName}".`);
  }

  await setDisplayedBalance(row, tempBalance);
  await waitForSyncWindow();
  const updatedBalance = parseDisplayedBalance((await getRowBalanceDisplay(row).textContent()) ?? '');
  if (updatedBalance !== Number(tempBalance.toFixed(2))) {
    throw new Error(`Expected updated balance ${tempBalance.toFixed(2)}, got ${updatedBalance}.`);
  }

  await rowNameInput.fill(originalName);
  await rowNameInput.press('Tab');
  await waitForSyncWindow();
  await setDisplayedBalance(row, originalBalance);
  await waitForSyncWindow();

  await page.reload({ waitUntil: 'networkidle' });
  await openSettingsWallets(page);

  const refreshedRow = getAccountRowById(page, accountId);
  await refreshedRow.waitFor({ timeout: 15000 });
  await waitForBalanceToSettle(refreshedRow);
  const refreshedName = await getRowNameInput(refreshedRow).inputValue();
  const refreshedBalance = parseDisplayedBalance((await getRowBalanceDisplay(refreshedRow).textContent()) ?? '');

  if (refreshedName !== originalName) {
    throw new Error(`Account name did not revert cleanly. Expected "${originalName}", got "${refreshedName}".`);
  }

  if (refreshedBalance !== Number(originalBalance.toFixed(2))) {
    throw new Error(`Account balance did not revert cleanly. Expected ${originalBalance.toFixed(2)}, got ${refreshedBalance}.`);
  }

  if (consoleIssues.length > 0) {
    throw new Error(`Console issues detected: ${consoleIssues.join(' | ')}`);
  }

  await page.screenshot({ path: successScreenshotPath, fullPage: true });
  console.log('Account edit regression passed.');
} catch (error) {
  await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
