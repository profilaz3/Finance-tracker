import { mkdir, readFile } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { guardBackend } from './e2eGuard.mjs';
import { assertNoConsoleIssues, trackConsoleIssues } from './e2eConsole.mjs';

const EXPORT_REGRESSION_URL = process.env.EXPORT_REGRESSION_URL ?? 'http://127.0.0.1:3000';
const EXPORT_REGRESSION_EMAIL = process.env.EXPORT_REGRESSION_EMAIL;
const EXPORT_REGRESSION_PASSWORD = process.env.EXPORT_REGRESSION_PASSWORD;
const EXPORT_REGRESSION_HEADED = process.env.EXPORT_REGRESSION_HEADED === '1';

if (!EXPORT_REGRESSION_EMAIL || !EXPORT_REGRESSION_PASSWORD) {
  console.error('Missing EXPORT_REGRESSION_EMAIL or EXPORT_REGRESSION_PASSWORD.');
  process.exit(1);
}

const screenshotDir = 'output/playwright';
const successScreenshotPath = 'output/playwright/export-regression-success.png';
const failureScreenshotPath = 'output/playwright/export-regression-failure.png';
const csvArtifactPath = `${screenshotDir}/export-regression.csv`;
const jsonArtifactPath = `${screenshotDir}/export-regression.json`;

const isVisible = async (locator) => locator.isVisible().catch(() => false);

const signInIfNeeded = async (page) => {
  const signInButton = page.getByRole('button', { name: /sign in|prijavi/i });

  if (!(await isVisible(signInButton))) {
    return;
  }

  await page.locator('input[type="email"]').fill(EXPORT_REGRESSION_EMAIL);
  await page.locator('input[type="password"]').fill(EXPORT_REGRESSION_PASSWORD);
  await signInButton.click();
  await page.waitForLoadState('networkidle');
};

const openTransactions = async (page) => {
  const transactionsHeading = page.getByRole('heading', { name: /^activity$|^aktivnost$/i }).first();

  if (!(await isVisible(transactionsHeading))) {
    await page
      .getByRole('navigation', { name: /main navigation|glavna navigacija/i })
      .getByRole('button', { name: /^activity$|^aktivnost$/i })
      .click();
    await transactionsHeading.waitFor({ timeout: 15000 });
  }
};

// Export and the printable report sit in the Activity header's ⋯ menu (rows have their own ⋯ too).
const openHeaderMenuItem = async (page, name) => {
  await page.locator('section.screen-hero').getByRole('button', { name: /^more actions$|^više opcija$/i }).first().click();
  await page.getByRole('menuitem', { name }).click();
};

const openExportModal = async (page) => {
  await openHeaderMenuItem(page, /^export$|^izvezi$/i);
  await page.getByRole('heading', { name: /export data|izvoz podataka/i }).waitFor({ timeout: 10000 });
};

const verifyCsvExport = async (page) => {
  await openExportModal(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^export$|^izvezi$/i }).click(),
  ]);

  const suggestedFilename = download.suggestedFilename();
  if (!suggestedFilename.endsWith('.csv') || !suggestedFilename.startsWith('finance_export_')) {
    throw new Error(`Unexpected CSV filename: ${suggestedFilename}`);
  }

  await download.saveAs(csvArtifactPath);
  const csvContent = await readFile(csvArtifactPath, 'utf8');

  if (!csvContent.includes('ID,Date,Time,Type,Category')) {
    throw new Error('CSV export is missing the expected header row.');
  }
};

const verifyJsonExport = async (page) => {
  await openExportModal(page);
  await page.getByRole('button', { name: 'JSON', exact: true }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^export$|^izvezi$/i }).click(),
  ]);

  const suggestedFilename = download.suggestedFilename();
  if (!suggestedFilename.endsWith('.json') || !suggestedFilename.startsWith('finance_export_')) {
    throw new Error(`Unexpected JSON filename: ${suggestedFilename}`);
  }

  await download.saveAs(jsonArtifactPath);
  const jsonContent = await readFile(jsonArtifactPath, 'utf8');
  const parsed = JSON.parse(jsonContent);

  if (!Array.isArray(parsed.transactions) || typeof parsed.totalTransactions !== 'number') {
    throw new Error('JSON export did not contain the expected transaction payload.');
  }
};

const verifyPrintableReport = async (page) => {
  await page.evaluate(() => {
    const originalOpen = window.open.bind(window);

    window.__exportRegression = {
      html: '',
      openCalls: 0,
      printCalled: false,
      focusCalled: false,
    };

    window.open = (...args) => {
      window.__exportRegression.openCalls += 1;

      const fakeDocument = {
        readyState: 'complete',
        open() {},
        write(markup) {
          window.__exportRegression.html += String(markup);
        },
        close() {},
      };

      return {
        document: fakeDocument,
        focus() {
          window.__exportRegression.focusCalled = true;
        },
        print() {
          window.__exportRegression.printCalled = true;
        },
        addEventListener() {},
        close() {},
      };
    };

    window.__restoreExportRegressionOpen = () => {
      window.open = originalOpen;
    };
  });

  await openHeaderMenuItem(page, /^printable report$|^izveštaj za štampu$/i);
  await page.waitForFunction(() => window.__exportRegression?.printCalled === true, null, { timeout: 15000 });

  const printState = await page.evaluate(() => window.__exportRegression);
  await page.evaluate(() => window.__restoreExportRegressionOpen?.());

  if (!printState || printState.openCalls < 1) {
    throw new Error('Printable report did not call window.open.');
  }

  if (!printState.focusCalled || !printState.printCalled) {
    throw new Error('Printable report did not trigger focus + print on the opened window.');
  }

  if (!printState.html.includes('Finance Report') || !printState.html.includes('<table>')) {
    throw new Error('Printable report markup was not written to the print window.');
  }
};

const browser = await chromium.launch({ headless: !EXPORT_REGRESSION_HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await guardBackend(context);
const page = await context.newPage();

const consoleIssues = trackConsoleIssues(page);

try {
  await mkdir(screenshotDir, { recursive: true });
  await page.goto(EXPORT_REGRESSION_URL, { waitUntil: 'networkidle' });
  await signInIfNeeded(page);
  await openTransactions(page);
  await verifyCsvExport(page);
  await verifyJsonExport(page);
  await verifyPrintableReport(page);

  assertNoConsoleIssues(consoleIssues);

  await page.screenshot({ path: successScreenshotPath, fullPage: true });
  console.log('Export regression passed.');
} catch (error) {
  await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
