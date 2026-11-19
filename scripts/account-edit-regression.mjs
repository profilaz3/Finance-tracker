import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { guardBackend } from './e2eGuard.mjs';
import { assertNoConsoleIssues, trackConsoleIssues } from './e2eConsole.mjs';

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

const isVisible = async (locator) => locator.isVisible().catch(() => false);

const parseDisplayedBalance = (text) => {
  const normalized = text.replace(/\s/g, '');
  const match = normalized.match(/\d[\d,.]*/);
  if (!match) {
    throw new Error(`Could not parse displayed balance from "${text}".`);
  }

  // The sign can sit before the currency ("-RSD 100,849.45"), so look for it anywhere before the digits.
  const negative = /[-\u2212]/.test(normalized.slice(0, match.index));
  const value = Number.parseFloat(match[0].replace(/,/g, ''));
  return negative ? -value : value;
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

const walletNameLabel = /^wallet name$|^ime novčanika$/i;

const openSettingsWallets = async (page) => {
  const settingsHeading = page.getByRole('heading', { name: /^settings$|^podešavanja$/i, level: 1 });
  if (!(await isVisible(settingsHeading))) {
    await page.getByRole('complementary').getByRole('button', { name: /^settings$|^podešavanja$/i }).click();
    await settingsHeading.waitFor({ timeout: 15000 });
  }

  await page
    .getByRole('navigation', { name: /^settings$|^podešavanja$/i })
    .getByRole('button', { name: /^wallets\b|^novčanici\b/i })
    .click();
  await page.getByRole('heading', { name: /^wallets$|^novčanici$/i, level: 2 }).waitFor({ timeout: 15000 });
};

const getFirstAccountNameInput = (page) => page.getByRole('textbox', { name: walletNameLabel }).first();

// Each wallet is a list item whose id is the wallet id.
const getRowFromNameInput = (nameInput) => nameInput.locator('xpath=ancestor::li[@id][1]');

const getAccountRowById = (page, accountId) => page.locator(`li[id="${accountId}"]`);

const getRowNameInput = (row) => row.getByRole('textbox', { name: walletNameLabel });

// The wallet actions button includes the displayed balance.
const getRowBalanceDisplay = (row) => row.getByRole('button', { name: /^wallet actions:|^radnje za novčanik:/i });

// "1.234,56": grouping dots and a decimal comma, the format the balance editor must read
// besides plain "1234.56".
const formatWithDecimalComma = (amount) => {
  const [whole, fraction] = Math.abs(amount).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${amount < 0 ? '-' : ''}${grouped},${fraction}`;
};
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

const setDisplayedBalance = async (row, amount, { decimalComma = false } = {}) => {
  const actions = getRowBalanceDisplay(row);
  if (await actions.getAttribute('aria-expanded') !== 'true') await actions.click();
  await row.getByRole('button', { name: /^correct balance$|^ispravi stanje$/i }).click();
  // Full-width editor below the row: a decimal text field labelled "Current balance".
  const balanceInput = row.getByRole('textbox', { name: /^current balance$|^trenutno stanje$/i });
  await balanceInput.waitFor({ timeout: 15000 });
  const inputMode = await balanceInput.getAttribute('inputmode');
  if (inputMode !== 'decimal') {
    throw new Error(`Expected the balance field to use a decimal keypad, got inputmode="${inputMode}".`);
  }
  await balanceInput.fill(decimalComma ? formatWithDecimalComma(amount) : amount.toFixed(2));
  await balanceInput.press('Enter');
  await balanceInput.waitFor({ state: 'detached', timeout: 15000 });
};

const browser = await chromium.launch({ headless: !ACCOUNT_EDIT_REGRESSION_HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await guardBackend(context);
const page = await context.newPage();

const consoleIssues = trackConsoleIssues(page);

// What the wallet was before the run: a failed run puts it back so the account is not left edited.
let restore = null;
const restoreWallet = async (page) => {
  if (!restore) return;
  try {
    await page.reload({ waitUntil: 'networkidle' });
    await openSettingsWallets(page);
    const row = getAccountRowById(page, restore.accountId);
    await row.waitFor({ timeout: 15000 });
    const nameInput = getRowNameInput(row);
    if ((await nameInput.inputValue()) !== restore.name) {
      await nameInput.fill(restore.name);
      await nameInput.press('Tab');
      await waitForSyncWindow();
    }
    await waitForBalanceToSettle(row);
    const shown = parseDisplayedBalance((await getRowBalanceDisplay(row).textContent()) ?? '');
    if (shown !== Number(restore.balance.toFixed(2))) {
      await setDisplayedBalance(row, restore.balance);
      await waitForSyncWindow();
    }
    console.error(`Put the wallet back to "${restore.name}" with ${restore.balance.toFixed(2)} after the failed run.`);
  } catch (restoreError) {
    console.error(`Could not put the wallet back: ${restoreError.message.split('\n')[0]}`);
  }
};

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
  restore = { accountId, name: originalName, balance: originalBalance };

  const tempName = `${originalName} QA`;
  const tempBalance = originalBalance + 7.25;

  await rowNameInput.fill(tempName);
  await rowNameInput.press('Tab');
  await waitForSyncWindow();
  const updatedName = await getRowNameInput(row).inputValue();
  if (updatedName !== tempName) {
    throw new Error(`Expected updated account name "${tempName}", got "${updatedName}".`);
  }

  await setDisplayedBalance(row, tempBalance, { decimalComma: true });
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
  restore = null;

  assertNoConsoleIssues(consoleIssues);

  await page.screenshot({ path: successScreenshotPath, fullPage: true });
  console.log('Account edit regression passed.');
} catch (error) {
  await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  await restoreWallet(page);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
