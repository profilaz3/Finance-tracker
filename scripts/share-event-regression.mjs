import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { guardBackend } from './e2eGuard.mjs';

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

const formatInviteName = (email) => {
  const [localPart] = email.split('@');
  const cleaned = localPart.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    return 'Guest';
  }

  return cleaned
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const screenshotDir = 'output/playwright';
const expectedTooltip = `Invited guest: ${formatInviteName(SHARE_REGRESSION_INVITE)}`;

const signInIfNeeded = async (page) => {
  const signInButton = page.getByRole('button', { name: 'Sign In' });

  if (!(await signInButton.isVisible().catch(() => false))) {
    return;
  }

  await page.locator('input[type="email"]').fill(SHARE_REGRESSION_EMAIL);
  await page.locator('input[type="password"]').fill(SHARE_REGRESSION_PASSWORD);
  await signInButton.click();
  await page.waitForLoadState('networkidle');
};

const navigateToEvents = async (page) => {
  const eventsHeading = page.getByRole('heading', { name: 'Events', exact: true });

  if (await eventsHeading.isVisible().catch(() => false)) {
    return;
  }

  await page.getByText('Events', { exact: true }).first().click();
  await eventsHeading.waitFor({ timeout: 15000 });
};

const openEvent = async (page) => {
  await navigateToEvents(page);
  const eventHeading = page.getByRole('heading', { name: SHARE_REGRESSION_EVENT, exact: true }).first();
  await eventHeading.waitFor({ timeout: 15000 });
  await eventHeading.click();
  await page.getByRole('heading', { name: SHARE_REGRESSION_EVENT, exact: true }).waitFor({ timeout: 15000 });
};

const shareEvent = async (page) => {
  await page.getByRole('button', { name: 'Event actions' }).click();
  await page.getByRole('button', { name: 'Share Event' }).click();
  await page.getByRole('heading', { name: 'Share Event' }).waitFor({ timeout: 10000 });
  await page.locator('input[type="email"]').last().fill(SHARE_REGRESSION_INVITE);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByText('Event shared successfully!').waitFor({ timeout: 15000 });
  await page.getByTitle(expectedTooltip).waitFor({ timeout: 15000 });
};

const browser = await chromium.launch({ headless: !SHARE_REGRESSION_HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
await guardBackend(context);
const page = await context.newPage();

try {
  await mkdir(screenshotDir, { recursive: true });
  await page.goto(SHARE_REGRESSION_URL, { waitUntil: 'networkidle' });
  await signInIfNeeded(page);
  await openEvent(page);
  await shareEvent(page);
  await page.screenshot({ path: `${screenshotDir}/share-event-regression-success.png`, fullPage: true });
  console.log(`Share regression passed for "${SHARE_REGRESSION_EVENT}" with ${SHARE_REGRESSION_INVITE}.`);
} catch (error) {
  await page.screenshot({ path: `${screenshotDir}/share-event-regression-failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
