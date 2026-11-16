import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { guardBackend } from './e2eGuard.mjs';
import { assertNoConsoleIssues, trackConsoleIssues } from './e2eConsole.mjs';

const SHARE_REGRESSION_URL = process.env.SHARE_REGRESSION_URL ?? 'http://127.0.0.1:3000';
const SHARE_REGRESSION_EMAIL = process.env.SHARE_REGRESSION_EMAIL;
const SHARE_REGRESSION_PASSWORD = process.env.SHARE_REGRESSION_PASSWORD;
const SHARE_REGRESSION_EVENT = process.env.SHARE_REGRESSION_EVENT ?? 'Bergamo';
const SHARE_REGRESSION_INVITE = process.env.SHARE_REGRESSION_INVITE
  ?? `share-regression-${Date.now()}@example.com`;
const SHARE_REGRESSION_HEADED = process.env.SHARE_REGRESSION_HEADED === '1';

if (!SHARE_REGRESSION_EMAIL || !SHARE_REGRESSION_PASSWORD) {
  console.error('Missing SHARE_REGRESSION_EMAIL or SHARE_REGRESSION_PASSWORD.');
  process.exit(1);
}

const screenshotDir = 'output/playwright';

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const shareDialogName = /^share event$|^podeli događaj$/i;

const signInIfNeeded = async (page) => {
  const signInButton = page.getByRole('button', { name: /sign in|prijavi/i });

  if (!(await signInButton.isVisible().catch(() => false))) {
    return;
  }

  await page.locator('input[type="email"]').fill(SHARE_REGRESSION_EMAIL);
  await page.locator('input[type="password"]').fill(SHARE_REGRESSION_PASSWORD);
  await signInButton.click();
  await page.waitForLoadState('networkidle');
};

const navigateToEvents = async (page) => {
  const eventsHeading = page.getByRole('heading', { name: /^shared$|^zajedničko$/i, level: 1 });

  if (await eventsHeading.isVisible().catch(() => false)) {
    return;
  }

  await page
    .getByRole('navigation', { name: /main navigation|glavna navigacija/i })
    .getByRole('button', { name: /^shared$|^zajedničko$/i })
    .click();
  await eventsHeading.waitFor({ timeout: 15000 });
};

const openEvent = async (page) => {
  await navigateToEvents(page);
  // Event cards are buttons; their title is part of the button name, not a heading.
  const eventCard = page.getByRole('button', { name: new RegExp(escapeRegExp(SHARE_REGRESSION_EVENT)) }).first();
  await eventCard.waitFor({ timeout: 15000 });
  await eventCard.click();
  await page.getByRole('heading', { name: SHARE_REGRESSION_EVENT, exact: true }).waitFor({ timeout: 15000 });
};

const openShareDialog = async (page) => {
  await page.getByRole('button', { name: /^event actions$|^akcije događaja$/i }).click();
  const shareAction = page.getByRole('menu', { name: /^event actions$|^akcije događaja$/i })
    .getByRole('menuitem', { name: shareDialogName });
  if (!(await shareAction.isVisible().catch(() => false))) {
    throw new Error(
      `"Event actions" for "${SHARE_REGRESSION_EVENT}" has no "Share event" item. Only the event owner can share; ` +
        `${SHARE_REGRESSION_EMAIL} should own this event.`,
    );
  }
  await shareAction.click();
  const dialog = page.getByRole('dialog', { name: shareDialogName });
  await dialog.waitFor({ timeout: 10000 });
  return dialog;
};

const stopSharingButton = dialog => dialog.getByRole('button', {
  name: new RegExp(`^(?:stop sharing with|prestani da deliš sa) ${escapeRegExp(SHARE_REGRESSION_INVITE)}$`, 'i'),
});

const shareEvent = async (page) => {
  const dialog = await openShareDialog(page);
  await dialog.getByRole('textbox', { name: /email address|imejl adresa/i }).fill(SHARE_REGRESSION_INVITE);
  await dialog.getByRole('button', { name: /^share$|^podeli$/i }).click();
  // Success is confirmed inside the sheet ("Shared with <email>. They'll see ...").
  await dialog.getByRole('status').filter({ hasText: SHARE_REGRESSION_INVITE }).waitFor({ timeout: 15000 });
  // The guest is listed in the sheet (the event screen no longer shows guest avatars).
  await stopSharingButton(dialog).waitFor({ timeout: 15000 });
  return dialog;
};

// Cleanup: stop sharing with the throwaway invite so runs do not pile guests onto the event.
const unshareInvite = async (page, dialog) => {
  await stopSharingButton(dialog).click();
  await stopSharingButton(dialog).waitFor({ state: 'detached', timeout: 15000 });
  await dialog.getByRole('button', { name: /^close$|^zatvori$/i }).click();
  await dialog.waitFor({ state: 'detached', timeout: 10000 });
};

const browser = await chromium.launch({ headless: !SHARE_REGRESSION_HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await guardBackend(context);
const page = await context.newPage();
const consoleIssues = trackConsoleIssues(page);

try {
  await mkdir(screenshotDir, { recursive: true });
  await page.goto(SHARE_REGRESSION_URL, { waitUntil: 'networkidle' });
  await signInIfNeeded(page);
  await openEvent(page);
  const shareDialog = await shareEvent(page);
  await unshareInvite(page, shareDialog);
  assertNoConsoleIssues(consoleIssues);
  await page.screenshot({ path: `${screenshotDir}/share-event-regression-success.png`, fullPage: true });
  console.log(`Share regression passed for "${SHARE_REGRESSION_EVENT}" with ${SHARE_REGRESSION_INVITE}.`);
} catch (error) {
  await page.screenshot({ path: `${screenshotDir}/share-event-regression-failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
