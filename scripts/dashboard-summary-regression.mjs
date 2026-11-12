import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';

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
const dashboardHeadingLabel = 'Total Net Worth';
const dashboardDebtLabels = ['Owes You', 'You Owe'];
const consoleIssues = [];

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
  const netWorthText = page.getByText(/total net worth|ukupna neto vrednost/i).first();
  if (!(await isVisible(netWorthText))) {
    await page.getByText(/dashboard/i).first().click();
    await netWorthText.waitFor({ timeout: 15000 });
  }
};

const waitForDashboardHydration = async page => {
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    const hasDashboard = /Total Net Worth|Ukupna neto vrednost/i.test(text);
    const hasWalletAmounts = /\b(?:USD|EUR|RSD)\s*-?\d/.test(text);

    return hasDashboard && hasWalletAmounts;
  }, { timeout: 15000 });
};

const verifyDashboardWallets = async page => {
  await page.getByRole('button', { name: /my wallets|wallets/i }).first().click();
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    const currencyLabels = text.match(/\b(?:USD|EUR|RSD)\b/g) ?? [];
    return currencyLabels.length >= 2;
  }, { timeout: 10000 });

  const currencyLabels = await page.locator('span, p, div').evaluateAll(nodes =>
    nodes
      .map(node => node.textContent?.trim() ?? '')
      .filter(text => /^(USD|EUR|RSD)$/.test(text))
  );

  if (currencyLabels.length < 2) {
    throw new Error(`Expected at least two wallet currency labels, found ${currencyLabels.length}.`);
  }
};

const verifyDebtSummaries = async page => {
  await page.getByRole('button', { name: /^people$/i }).first().click();
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return /No active balances|Svi dugovi su podmireni|[+-](?:RSD|EUR|USD)/.test(text);
  }, { timeout: 10000 });

  const emptyStateVisible = await page.getByText(/no active balances|svi dugovi su podmireni/i).first().isVisible().catch(() => false);
  if (emptyStateVisible) {
    return;
  }

  const signedAmounts = await page.locator('p.text-sm.font-mono.mt-1').count();
  if (signedAmounts < 1) {
    throw new Error(`Expected dashboard people debt cards to show signed balances, found ${signedAmounts}.`);
  }
};

const browser = await chromium.launch({ headless: !DASHBOARD_SUMMARY_REGRESSION_HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
const page = await context.newPage();

page.on('console', message => {
  if (message.type() === 'error' || message.type() === 'warning') {
    consoleIssues.push(`${message.type()}: ${message.text()}`);
  }
});

try {
  await mkdir(screenshotDir, { recursive: true });
  await page.goto(DASHBOARD_SUMMARY_REGRESSION_URL, { waitUntil: 'networkidle' });
  await signInIfNeeded(page);
  await openDashboard(page);
  await waitForDashboardHydration(page);
  await verifyDashboardWallets(page);
  await verifyDebtSummaries(page);

  if (consoleIssues.length > 0) {
    throw new Error(`Console issues detected: ${consoleIssues.join(' | ')}`);
  }

  await page.screenshot({ path: successScreenshotPath, fullPage: true });
  console.log('Dashboard summary regression passed.');
} catch (error) {
  await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
