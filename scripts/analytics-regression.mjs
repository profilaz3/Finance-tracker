import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { guardBackend } from './e2eGuard.mjs';

const ANALYTICS_REGRESSION_URL = process.env.ANALYTICS_REGRESSION_URL ?? 'http://127.0.0.1:3000';
const ANALYTICS_REGRESSION_EMAIL = process.env.ANALYTICS_REGRESSION_EMAIL;
const ANALYTICS_REGRESSION_PASSWORD = process.env.ANALYTICS_REGRESSION_PASSWORD;
const ANALYTICS_REGRESSION_HEADED = process.env.ANALYTICS_REGRESSION_HEADED === '1';

if (!ANALYTICS_REGRESSION_EMAIL || !ANALYTICS_REGRESSION_PASSWORD) {
  console.error('Missing ANALYTICS_REGRESSION_EMAIL or ANALYTICS_REGRESSION_PASSWORD.');
  process.exit(1);
}

const screenshotDir = 'output/playwright';
const successScreenshotPath = 'output/playwright/analytics-regression-success.png';
const failureScreenshotPath = 'output/playwright/analytics-regression-failure.png';
const consoleIssues = [];

const isVisible = async (locator) => locator.isVisible().catch(() => false);

const signInIfNeeded = async (page) => {
  const signInButton = page.getByRole('button', { name: /sign in|prijavi/i });

  if (!(await isVisible(signInButton))) {
    return;
  }

  await page.locator('input[type="email"]').fill(ANALYTICS_REGRESSION_EMAIL);
  await page.locator('input[type="password"]').fill(ANALYTICS_REGRESSION_PASSWORD);
  await signInButton.click();
  await page.waitForLoadState('networkidle');
};

const openAnalytics = async (page) => {
  const analyticsHeading = page.getByRole('heading', { name: /analytics|analitika/i }).first();

  if (!(await isVisible(analyticsHeading))) {
    await page.getByText(/analytics|analitika/i).first().click();
    await analyticsHeading.waitFor({ timeout: 15000 });
  }

  await page.waitForTimeout(400);
};

const expectHeading = async (page, pattern) => {
  const locator = page.getByRole('heading', { name: pattern }).first();
  await locator.waitFor({ timeout: 15000 });
};

const verifyAnalytics = async (page) => {
  await expectHeading(page, /spending trend|trend potrošnje/i);
  await expectHeading(page, /income vs expense|prihodi.*troškovi/i);
  await expectHeading(page, /savings rate|stopa štednje/i);

  await page.mouse.wheel(0, 1800);
  await page.waitForTimeout(500);

  await expectHeading(page, /category breakdown|pregled kategorija/i);
  await expectHeading(page, /category volatility|varijacija kategorija/i);
  await expectHeading(page, /net worth trend|trend neto vrednosti/i);

  const svgCount = await page.locator('svg').count();
  if (svgCount < 4) {
    throw new Error(`Expected analytics charts to render SVG output, found ${svgCount}.`);
  }

  if (consoleIssues.length > 0) {
    throw new Error(`Console issues detected: ${consoleIssues.join(' | ')}`);
  }
};

const browser = await chromium.launch({ headless: !ANALYTICS_REGRESSION_HEADED });
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
  await page.goto(ANALYTICS_REGRESSION_URL, { waitUntil: 'networkidle' });
  await signInIfNeeded(page);
  await openAnalytics(page);
  await verifyAnalytics(page);
  await page.screenshot({ path: successScreenshotPath, fullPage: true });
  console.log('Analytics regression passed.');
} catch (error) {
  await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
