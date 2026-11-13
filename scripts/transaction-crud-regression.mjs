import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { guardBackend } from './e2eGuard.mjs';

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
const consoleIssues = [];

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

const openTransactions = async (page) => {
  const heading = page.getByRole('heading', { name: /transactions|transakcije/i }).first();
  if (await isVisible(heading)) {
    return;
  }

  await page.getByText(/transactions|transakcije/i).first().click();
  await heading.waitFor({ timeout: 15000 });
};

const openAddTransactionModal = async (page) => {
  const amountInput = page.locator('#edit-tx-amount');
  if (await isVisible(amountInput)) {
    return;
  }

  await page.getByRole('button', { name: /open transaction actions|otvori akcije transakcija/i }).click();
  const addTransactionAction = page.locator('button[aria-label="Add a transaction"], button[aria-label="Add transaction"], button[aria-label="Dodaj transakciju"]').first();
  await addTransactionAction.click();
  await amountInput.waitFor({ timeout: 15000 });

  const addHeading = page.getByRole('heading', { name: /new transaction|add transaction|add a transaction|nova transakcija|dodaj transakciju/i }).first();
  await addHeading.waitFor({ timeout: 15000 });

  const deleteButton = page.getByRole('button', { name: /^delete$|^obrisi$|^obriši$/i }).first();
  if (await isVisible(deleteButton)) {
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

  const moreOptionsButton = page.getByRole('button', { name: /more options/i });
  if (await isVisible(moreOptionsButton)) {
    await moreOptionsButton.click();
  }

  await page.locator('#edit-tx-note').fill(note);
};

const searchTransactions = async (page, value) => {
  const searchInput = page.getByPlaceholder(/search transactions|pretrazi transakcije/i);
  await searchInput.fill(value);
};

const getTransactionRow = (page, label) =>
  page
    .getByText(label, { exact: false })
    .first()
    .locator('xpath=ancestor::div[contains(@class,"group relative")][1]');

const longPress = async (page, locator) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Could not resolve target bounding box for long press.');
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(850);
  await page.mouse.up();
};

const createTransaction = async (page) => {
  await openAddTransactionModal(page);
  await fillTransactionForm(page, { amount: 123.45, note: transactionLabel });
  await saveTransaction(page);
  await searchTransactions(page, transactionLabel);
  await page.getByText(transactionLabel, { exact: false }).first().waitFor({ timeout: 15000 });
};

const editTransaction = async (page) => {
  const row = getTransactionRow(page, transactionLabel);
  await page.waitForTimeout(1000);
  await longPress(page, row);
  await page.getByRole('button', { name: /^edit$|^izmeni$/i }).click();
  await page.getByRole('heading', { name: /edit transaction|izmeni transakciju/i }).first().waitFor({ timeout: 15000 });
  await fillTransactionForm(page, { amount: 222, note: updatedTransactionLabel });
  await saveTransaction(page);
  await searchTransactions(page, updatedTransactionLabel);
  await page.getByText(updatedTransactionLabel, { exact: false }).first().waitFor({ timeout: 15000 });
};

const deleteTransaction = async (page) => {
  const row = getTransactionRow(page, updatedTransactionLabel);
  await page.waitForTimeout(1000);
  await longPress(page, row);
  await page.getByRole('button', { name: /^delete$|^obrisi$|^obriši$/i }).click();
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

page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    consoleIssues.push(`${message.type()}: ${message.text()}`);
  }
});

try {
  await mkdir(screenshotDir, { recursive: true });
  await page.goto(TRANSACTION_REGRESSION_URL, { waitUntil: 'networkidle' });
  await signInIfNeeded(page);
  await openTransactions(page);
  await createTransaction(page);
  await editTransaction(page);
  await deleteTransaction(page);

  if (consoleIssues.length > 0) {
    throw new Error(`Console issues detected: ${consoleIssues.join(' | ')}`);
  }

  await page.screenshot({ path: successScreenshotPath, fullPage: true });
  console.log('Transaction CRUD regression passed.');
} catch (error) {
  await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
