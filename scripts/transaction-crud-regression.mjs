import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { guardBackend } from './e2eGuard.mjs';
import { assertNoConsoleIssues, isEdgeFunctionResponse, trackConsoleIssues } from './e2eConsole.mjs';

const TRANSACTION_REGRESSION_URL = process.env.TRANSACTION_REGRESSION_URL ?? 'http://127.0.0.1:3000';
const TRANSACTION_REGRESSION_EMAIL = process.env.TRANSACTION_REGRESSION_EMAIL;
const TRANSACTION_REGRESSION_PASSWORD = process.env.TRANSACTION_REGRESSION_PASSWORD;
const TRANSACTION_REGRESSION_HEADED = process.env.TRANSACTION_REGRESSION_HEADED === '1';

if (!TRANSACTION_REGRESSION_EMAIL || !TRANSACTION_REGRESSION_PASSWORD) {
  console.error('Missing TRANSACTION_REGRESSION_EMAIL or TRANSACTION_REGRESSION_PASSWORD.');
  process.exit(1);
}

const screenshotDir = 'output/playwright';
const successScreenshotPath = `${screenshotDir}/transaction-crud-regression-success.png`;
const failureScreenshotPath = `${screenshotDir}/transaction-crud-regression-failure.png`;
const transactionLabel = `CRUD Regression ${Date.now()}`;
const updatedTransactionLabel = `${transactionLabel} Updated`;

const isVisible = async (locator) => locator.isVisible().catch(() => false);

const signInIfNeeded = async (page) => {
  const signInButton = page.getByRole('button', { name: /sign in|prijavi/i });
  if (!(await isVisible(signInButton))) {
    return;
  }

  await page.locator('input[type="email"]').fill(TRANSACTION_REGRESSION_EMAIL);
  await page.locator('input[type="password"]').fill(TRANSACTION_REGRESSION_PASSWORD);
  await signInButton.click();
  await page.waitForLoadState('networkidle');
};

const deleteLabel = /^delete$|^obrisi$|^obriši$/i;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const openTransactions = async (page) => {
  const heading = page.getByRole('heading', { name: /^(activity|aktivnost|transactions|transakcije)$/i }).first();
  if (await isVisible(heading)) {
    return;
  }

  // Entries are listed on the Activity screen.
  await page
    .getByRole('navigation', { name: /main navigation|glavna navigacija/i })
    .getByRole('button', { name: /^activity$|^aktivnost$/i })
    .click();
  await heading.waitFor({ timeout: 15000 });
};

const openAddTransactionModal = async (page) => {
  const amountInput = page.locator('#edit-tx-amount');
  if (await isVisible(amountInput)) {
    return;
  }

  // "Add entry" opens the New entry sheet; its Expense tile opens the transaction form.
  await page.getByRole('button', { name: /^add entry$|^dodaj unos$/i }).first().click();
  const newEntrySheet = page.getByRole('dialog', { name: /^new entry$|^novi unos$/i });
  await newEntrySheet.waitFor({ timeout: 15000 });
  await newEntrySheet.getByRole('button', { name: /^expense\b|^trošak\b/i }).click();
  await amountInput.waitFor({ timeout: 15000 });

  const addDialog = page.getByRole('dialog', { name: /^new expense$|^novi trošak$/i });
  await addDialog.getByRole('heading', { name: /^new expense$|^novi trošak$/i }).waitFor({ timeout: 15000 });

  const deleteActions = addDialog.getByRole('button', { name: deleteLabel }).or(addDialog.getByRole('menuitem', { name: deleteLabel }));
  if (await isVisible(deleteActions.first())) {
    throw new Error('New transaction modal exposed delete action.');
  }
};

const saveTransaction = async (page) => {
  // "Save expense" on a new entry, "Save changes" on an edit.
  await page.getByRole('button', { name: /^save (expense|changes)$|^sa[cč]uvaj (trošak|izmene)$/i }).click();
  await page.waitForLoadState('networkidle');
};

const fillTransactionForm = async (page, { amount, note }) => {
  await page.waitForTimeout(700);
  await page.locator('#edit-tx-amount').click();
  await page.locator('#edit-tx-amount').fill(String(amount));

  // The note sits right under the amount (not under More options).
  await page.locator('#edit-tx-note').fill(note);
};

const searchTransactions = async (page, value) => {
  const searchInput = page.getByPlaceholder(/^(search|pretraga)$|search transactions|pretra[zž]i transakcije/i).first();
  await searchInput.fill(value);
};

// The row's main button is named after the note first ("<note> <category> · <wallet> <amount> <date>").
const getTransactionRowButton = (page, label) =>
  page.getByRole('button', { name: new RegExp(`^${escapeRegExp(label)}\\b`) });

const getTransactionRow = (page, label) =>
  page.locator('[data-transaction-row]').filter({ has: getTransactionRowButton(page, label) });

const createTransaction = async (page) => {
  await openAddTransactionModal(page);
  await fillTransactionForm(page, { amount: 123.45, note: transactionLabel });
  await saveTransaction(page);
  await searchTransactions(page, transactionLabel);
  await page.getByText(transactionLabel, { exact: false }).first().waitFor({ timeout: 15000 });
};

// Entry details: a pop-up card, or on wide windows the Activity side pane (a region named by the entry).
const getDetails = (page, name) => page.getByRole('dialog', { name }).or(page.getByRole('region', { name }));

const editTransaction = async (page) => {
  await page.waitForTimeout(1000);
  // Tapping a row opens the entry's details; its Edit button opens the form on top.
  await getTransactionRowButton(page, transactionLabel).first().click();
  const details = getDetails(page, transactionLabel);
  await details.waitFor({ timeout: 15000 });
  await details.getByRole('button', { name: /^edit$|^izmeni$/i }).click();
  await page.getByRole('heading', { name: /^edit expense$|^izmeni trošak$/i }).first().waitFor({ timeout: 15000 });
  await fillTransactionForm(page, { amount: 222, note: updatedTransactionLabel });
  await saveTransaction(page);
  // The details card (or pane) stays open and shows the saved entry.
  const updatedDetails = getDetails(page, updatedTransactionLabel);
  await updatedDetails.waitFor({ timeout: 15000 });
  // Escape goes to the form until its exit animation has finished.
  await page.getByRole('heading', { name: /^edit expense$|^izmeni trošak$/i }).waitFor({ state: 'detached', timeout: 15000 });
  await page.keyboard.press('Escape');
  await updatedDetails.waitFor({ state: 'detached', timeout: 15000 });
  await searchTransactions(page, updatedTransactionLabel);
  await page.getByText(updatedTransactionLabel, { exact: false }).first().waitFor({ timeout: 15000 });
};

const deleteTransaction = async (page) => {
  const row = getTransactionRow(page, updatedTransactionLabel).first();
  await page.waitForTimeout(1000);
  await row.getByRole('button', { name: /^more actions$|^više opcija$/i }).click();
  await page.getByRole('menu', { name: /^more actions$|^više opcija$/i }).getByRole('menuitem', { name: deleteLabel }).click();
  await page.getByText(/transaction deleted|transakcija obrisano|transakcija obrisana/i).waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);

  const remainingRows = await getTransactionRow(page, updatedTransactionLabel).count();
  if (remainingRows > 0 && (await isVisible(getTransactionRow(page, updatedTransactionLabel).first()))) {
    throw new Error('Transaction row still visible after delete.');
  }
};

// A failed run deletes what it created (either name) so test entries do not pile up in the account.
const removeLeftovers = async (page) => {
  for (const label of [updatedTransactionLabel, transactionLabel]) {
    try {
      await page.keyboard.press('Escape').catch(() => {});
      await searchTransactions(page, label);
      const row = getTransactionRow(page, label).first();
      if (!(await row.isVisible({ timeout: 3000 }).catch(() => false))) continue;
      await row.getByRole('button', { name: /^more actions$|^više opcija$/i }).click({ timeout: 5000 });
      await page.getByRole('menu', { name: /^more actions$|^više opcija$/i }).getByRole('menuitem', { name: deleteLabel }).click({ timeout: 5000 });
      await page.waitForTimeout(800);
      console.error(`Removed the test entry "${label}" left by the failed run.`);
    } catch (cleanupError) {
      console.error(`Could not remove the test entry "${label}": ${cleanupError.message.split('\n')[0]}`);
    }
  }
};

const browser = await chromium.launch({ headless: !TRANSACTION_REGRESSION_HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await guardBackend(context);
const page = await context.newPage();

// Name the URL behind HTTP errors so console failures are traceable.
page.on('response', async (response) => {
  if (response.status() >= 400 && !isEdgeFunctionResponse(response)) {
    // The body says why (an expired or not-yet-valid token reads differently from a missing grant).
    const body = (await response.text().catch(() => '')).slice(0, 200);
    console.error(`HTTP ${response.status()} ${response.request().method()} ${response.url()} ${body}`);
  }
});

const consoleIssues = trackConsoleIssues(page);

try {
  await mkdir(screenshotDir, { recursive: true });
  await page.goto(TRANSACTION_REGRESSION_URL, { waitUntil: 'networkidle' });
  await signInIfNeeded(page);
  await openTransactions(page);
  await createTransaction(page);
  await editTransaction(page);
  await deleteTransaction(page);

  assertNoConsoleIssues(consoleIssues);

  await page.screenshot({ path: successScreenshotPath, fullPage: true });
  console.log('Transaction CRUD regression passed.');
} catch (error) {
  await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  await removeLeftovers(page);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
