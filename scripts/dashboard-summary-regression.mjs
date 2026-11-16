import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { guardBackend } from './e2eGuard.mjs';
import { assertNoConsoleIssues, trackConsoleIssues } from './e2eConsole.mjs';

const DASHBOARD_SUMMARY_REGRESSION_URL = process.env.DASHBOARD_SUMMARY_REGRESSION_URL ?? 'http://127.0.0.1:3000';
const DASHBOARD_SUMMARY_REGRESSION_EMAIL = process.env.DASHBOARD_SUMMARY_REGRESSION_EMAIL;
const DASHBOARD_SUMMARY_REGRESSION_PASSWORD = process.env.DASHBOARD_SUMMARY_REGRESSION_PASSWORD;
const DASHBOARD_SUMMARY_REGRESSION_HEADED = process.env.DASHBOARD_SUMMARY_REGRESSION_HEADED === '1';

if (!DASHBOARD_SUMMARY_REGRESSION_EMAIL || !DASHBOARD_SUMMARY_REGRESSION_PASSWORD) {
  console.error('Missing DASHBOARD_SUMMARY_REGRESSION_EMAIL or DASHBOARD_SUMMARY_REGRESSION_PASSWORD.');
  process.exit(1);
}

const screenshotDir = 'output/playwright';
const successScreenshotPath = `${screenshotDir}/dashboard-summary-regression-success.png`;
const failureScreenshotPath = `${screenshotDir}/dashboard-summary-regression-failure.png`;
// Home (the old Dashboard) tiles and the People view use these labels. Home is recognised by its
// Wallets block, which a new account's default layout has (it has no Net worth block).
const walletsHeadingName = /^wallets$|^novčanici$/i;
const debtLabel = /owes you|you owe|duguje ti|duguješ/i;
const settledLabel = /all settled up|sve izmireno/i;
// "+€42.50", "-RSD 1,200.00": a balance with its sign in front of the currency.
// People cards say who owes whom in words; the amount is a plain number (base currency) or carries its symbol.
const openAmount = /\d/;

const isVisible = async locator => locator.isVisible().catch(() => false);

const signInIfNeeded = async page => {
  const signInButton = page.getByRole('button', { name: /sign in|prijavi/i });
  if (!(await isVisible(signInButton))) {
    return;
  }

  await page.locator('input[type="email"]').fill(DASHBOARD_SUMMARY_REGRESSION_EMAIL);
  await page.locator('input[type="password"]').fill(DASHBOARD_SUMMARY_REGRESSION_PASSWORD);
  await signInButton.click();
  await page.waitForLoadState('networkidle');
};

const openDashboard = async page => {
  const walletsHeading = page.getByRole('main').getByRole('heading', { name: walletsHeadingName, level: 3 });
  if (!(await isVisible(walletsHeading))) {
    await page
      .getByRole('navigation', { name: /main navigation|glavna navigacija/i })
      .getByRole('button', { name: /^home$|^početna$/i })
      .click();
    await walletsHeading.waitFor({ timeout: 15000 });
  }
};

const waitForDashboardHydration = async page => {
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    const hasDashboard = /Wallets|Novčanici/i.test(text);
    const hasWalletAmounts = /\b(?:USD|EUR|RSD)\s*-?\d/.test(text);

    return hasDashboard && hasWalletAmounts;
  }, { timeout: 15000 });
};

const verifyDashboardWallets = async page => {
  // The Wallets tile: a header (title + total in the base currency) and one entry per wallet,
  // each amount in the wallet's own currency (symbol or code, depending on the tile style).
  const walletsHeading = page.getByRole('main').getByRole('heading', { name: /^wallets$|^novčanici$/i, level: 3 });
  await walletsHeading.waitFor({ timeout: 10000 });

  const walletCurrencies = await walletsHeading.evaluate(heading => {
    const header = heading.parentElement;
    const tile = header?.parentElement;
    const walletText = Array.from(tile?.children ?? [])
      .filter(child => child !== header)
      .map(child => child.innerText)
      .join('\n');
    const symbols = { '€': 'EUR', '$': 'USD' };
    const tokens = walletText.match(/\b(?:USD|EUR|RSD)\b|€|\$/g) ?? [];
    return [...new Set(tokens.map(token => symbols[token] ?? token))];
  });

  if (walletCurrencies.length < 2) {
    throw new Error(`Expected dashboard wallets in at least two currencies, found ${walletCurrencies.length} (${walletCurrencies.join(', ')}).`);
  }
};

const verifyDebtSummaries = async page => {
  const peopleTile = page.getByRole('main').getByRole('button', { name: /^people\b|^ljudi\b/i }).first();
  await peopleTile.waitFor({ timeout: 10000 });
  const summary = (await peopleTile.textContent()) ?? '';

  if (settledLabel.test(summary)) {
    return;
  }

  if (!debtLabel.test(summary) || !/\d/.test(summary)) {
    throw new Error(`Expected the dashboard People tile to show a net balance, got "${summary}".`);
  }

  // The tile opens People, where every open balance shows with "Owes you" or "You owe".
  await peopleTile.click();
  await page.getByRole('heading', { name: /^people$|^ljudi$/i, level: 1 }).waitFor({ timeout: 10000 });
  const debtCards = page
    .getByRole('main')
    .getByRole('button')
    .filter({ hasText: debtLabel })
    .filter({ hasText: openAmount });
  await debtCards.first().waitFor({ timeout: 10000 });

  const openBalances = await debtCards.count();
  if (openBalances < 1) {
    throw new Error(`Expected people debt cards to show open balances, found ${openBalances}.`);
  }
};

const browser = await chromium.launch({ headless: !DASHBOARD_SUMMARY_REGRESSION_HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await guardBackend(context);
const page = await context.newPage();

const consoleIssues = trackConsoleIssues(page);

try {
  await mkdir(screenshotDir, { recursive: true });
  await page.goto(DASHBOARD_SUMMARY_REGRESSION_URL, { waitUntil: 'networkidle' });
  await signInIfNeeded(page);
  await openDashboard(page);
  await waitForDashboardHydration(page);
  await verifyDashboardWallets(page);
  await verifyDebtSummaries(page);

  assertNoConsoleIssues(consoleIssues);

  await page.screenshot({ path: successScreenshotPath, fullPage: true });
  console.log('Dashboard summary regression passed.');
} catch (error) {
  await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
