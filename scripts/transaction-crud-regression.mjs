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
  const heading = page.getByRole('heading', { name: /^transactions$|^transakcije$/i }).first();
  if (await isVisible(heading)) {
    return;
  }

  // Transactions are the List tab of Activity.
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
  await page.getByRole('button', { name: /^save$|^sacuvaj$|^sačuvaj$/i }).click();
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
  const searchInput = page.getByPlaceholder(/search transactions|pretrazi transakcije/i);
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

const editTransaction = async (page) => {
  await page.waitForTimeout(1000);
  // Tapping a row opens the entry's details; its Edit button opens the form on top.
  await getTransactionRowButton(page, transactionLabel).first().click();
  const details = page.getByRole('dialog', { name: transactionLabel });
  await details.waitFor({ timeout: 15000 });
  await details.getByRole('button', { name: /^edit$|^izmeni$/i }).click();
  await page.getByRole('heading', { name: /^edit expense$|^izmeni trošak$/i }).first().waitFor({ timeout: 15000 });
  await fillTransactionForm(page, { amount: 222, note: updatedTransactionLabel });
  await saveTransaction(page);
  // The details sheet stays open and shows the saved entry.
  const updatedDetails = page.getByRole('dialog', { name: updatedTransactionLabel });
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

const browser = await chromium.launch({ headless: !TRANSACTION_REGRESSION_HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await guardBackend(context);
const page = await context.newPage();

// Name the URL behind HTTP errors so console failures are traceable.
page.on('response', (response) => {
  if (response.status() >= 400 && !isEdgeFunctionResponse(response)) {
    console.error(`HTTP ${response.status()} ${response.request().method()} ${response.url()}`);
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
  throw error;
} finally {
  await context.close();
  await browser.close();
}
