import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../constants';
import { EVENT_STRINGS } from '../components/event-detail/eventStrings';

describe('build contracts', () => {
  it('uses package-path chunk rules instead of broad "react" substring matching', () => {
    const viteConfig = readFileSync('vite.config.ts', 'utf8');

    expect(viteConfig).toContain("const normalizedId = id.replace(/\\\\/g, '/')");
    expect(viteConfig).toContain('const isPackagePath = (id: string, packageName: string) =>');
    expect(viteConfig).not.toContain("id.includes('react') || id.includes('react-dom')");
    expect(viteConfig).not.toContain("return 'react-vendor'");
  });

  it('keeps react in its own vendor chunk and domMax motion features out of the shared motion chunk', () => {
    const viteConfig = readFileSync('vite.config.ts', 'utf8');
    const accountSettings = readFileSync('components/settings/AccountSettings.tsx', 'utf8');

    expect(viteConfig).toContain("name: 'react'");
    expect(viteConfig).toContain("isPackagePath(id, 'scheduler')");
    expect(viteConfig).toContain('isMotionPackage(id) && !isMotionMaxOnlyModule(id)');
    expect(accountSettings).toContain("import { Reorder } from 'motion/react-m';");
    expect(accountSettings).toContain('<LazyMotion features={loadMotionMaxFeatures}>');
  });

  it('does not force chart libraries into a manual chunk that can create circular vendor imports', () => {
    const viteConfig = readFileSync('vite.config.ts', 'utf8');

    expect(viteConfig).not.toContain("return 'charts'");
  });

  it('does not preload markdown and pdf helper chunks from index.html', () => {
    const viteConfig = readFileSync('vite.config.ts', 'utf8');

    expect(viteConfig).toContain('modulePreload: {');
    expect(viteConfig).toContain("if (context.hostType !== 'html')");
    expect(viteConfig).toContain("!dep.includes('markdown-')");
    expect(viteConfig).toContain("!dep.includes('pdf-tools-')");
    expect(viteConfig).toContain("!dep.includes('motion-')");
    expect(viteConfig).toContain("!dep.includes('icons-')");
  });

  it('splits shared animation and icon libraries into dedicated vendor chunks', () => {
    const viteConfig = readFileSync('vite.config.ts', 'utf8');

    expect(viteConfig).toContain("name: 'motion'");
    expect(viteConfig).toContain("isPackagePath(id, 'framer-motion')");
    expect(viteConfig).toContain("name: 'icons'");
    expect(viteConfig).toContain("isPackagePath(id, 'lucide-react')");
  });

  it('cleans dist before building so stale chunk files do not confuse verification', () => {
    const packageJson = readFileSync('package.json', 'utf8');

    expect(packageJson).toContain('"prebuild": "node -e');
    expect(packageJson).toContain("rmSync('dist', { recursive: true, force: true })");
  });

  it('keeps sync and offline services behind runtime loaders instead of startup imports', () => {
    const app = readFileSync('App.tsx', 'utf8');
    const authHook = readFileSync('hooks/useAuth.ts', 'utf8');
    const appStateHook = readFileSync('hooks/useAppState.ts', 'utf8');
    const aiService = readFileSync('services/aiService.ts', 'utf8');
    const syncHook = readFileSync('hooks/useSync.ts', 'utf8');
    const recurringHook = readFileSync('hooks/useRecurringHandlers.ts', 'utf8');
    const eventHook = readFileSync('hooks/useEventHandlers.ts', 'utf8');
    const syncStatus = readFileSync('components/SyncStatus.tsx', 'utf8');
    const syncManager = readFileSync('services/syncManager.ts', 'utf8');
    const offlineQueue = readFileSync('services/offlineQueue.ts', 'utf8');
    const runtimeServices = readFileSync('services/runtimeServices.ts', 'utf8');
    const authView = readFileSync('components/AuthView.tsx', 'utf8');
    const eventCreationModal = readFileSync('components/EventCreationModal.tsx', 'utf8');
    const eventDetailView = readFileSync('components/event-detail/EventDetailView.tsx', 'utf8');
    const eventHeader = readFileSync('components/event-detail/EventHeader.tsx', 'utf8');

    expect(app).not.toContain("from './services/syncManager'");
    expect(app).not.toContain("from './services/offlineQueue'");
    expect(app).not.toContain("from './services/supabaseService'");
    expect(authHook).not.toContain("from '../services/offlineQueue'");
    expect(authHook).not.toContain("from '../services/supabaseService'");
    expect(appStateHook).not.toContain("from '../services/supabaseService'");
    expect(aiService).not.toContain("from './supabaseService'");
    expect(syncHook).not.toContain("from '../services/syncManager'");
    expect(recurringHook).not.toContain("from '../services/syncManager'");
    expect(eventHook).not.toContain("from '../services/syncManager'");
    expect(eventHook).not.toContain("from '../services/supabaseService'");
    expect(syncManager).not.toContain("from './supabaseService'");
    expect(offlineQueue).not.toContain("from './supabaseService'");
    expect(authView).not.toContain("from '../services/supabaseService'");
    expect(eventCreationModal).not.toContain("from '../services/supabaseService'");
    expect(eventDetailView).not.toContain("from '../../services/supabaseService'");
    expect(eventHeader).not.toContain("from '../../services/supabaseService'");
    expect(syncStatus).not.toContain("import { offlineQueue");
    expect(runtimeServices).toContain("import('./syncManager')");
    expect(runtimeServices).toContain("import('./offlineQueue')");
    expect(runtimeServices).toContain("import('./supabaseService')");
  });

  it('keeps the root app shell on LazyMotion (domAnimation only) and free of uuid', () => {
    const app = readFileSync('App.tsx', 'utf8');
    const toast = readFileSync('components/Toast.tsx', 'utf8');
    const syncStatus = readFileSync('components/SyncStatus.tsx', 'utf8');
    const errorBoundary = readFileSync('components/ErrorBoundary.tsx', 'utf8');

    // The shell only provides LazyMotion + MotionConfig; views render `m.*` components so
    // drag/layout/projection (domMax) stays out of the shared motion chunk.
    expect(app).toContain("import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';");
    expect(app).toContain('<LazyMotion features={domAnimation}>');
    expect(app).not.toMatch(/<motion\./);
    expect(app).not.toContain('AnimatePresence');
    expect(app).not.toContain("from 'uuid'");
    expect(app).toContain('crypto.randomUUID()');
    expect(toast).not.toContain("from 'motion/react'");
    expect(syncStatus).not.toContain("from 'motion/react'");
    expect(app).not.toContain("from 'lucide-react'");
    expect(toast).not.toContain("from 'lucide-react'");
    expect(syncStatus).not.toContain("from 'lucide-react'");
    expect(errorBoundary).not.toContain("from 'lucide-react'");
  });

  it('lazy-loads heavy stats sections instead of bundling chart components into the stats shell', () => {
    const statsIndex = readFileSync('components/stats/index.tsx', 'utf8');

    expect(statsIndex).toContain("const ExpenseChartSection = lazyWithReload");
    expect(statsIndex).toContain("const IncomeChartSection = lazyWithReload");
    expect(statsIndex).toContain("const CategoryBreakdownSection = lazyWithReload");
    expect(statsIndex).toContain('const DeferredStatsSection: React.FC');
    expect(statsIndex).toContain('new IntersectionObserver');
    expect(statsIndex).toContain("import('./ExpenseChart')");
    expect(statsIndex).toContain("import('./IncomeChart')");
    expect(statsIndex).toContain("import('./CategoryBreakdown')");
    expect(statsIndex).not.toContain("import { ExpenseChart } from './ExpenseChart'");
    expect(statsIndex).not.toContain("import { IncomeChart } from './IncomeChart'");
    expect(statsIndex).not.toContain("import { CategoryBreakdown, PaidForOthers } from './CategoryBreakdown'");
  });

  it('keeps stats free of recharts so analytics do not drag the charting library runtime chunk', () => {
    const packageJson = readFileSync('package.json', 'utf8');
    const expenseChart = readFileSync('components/stats/ExpenseChart.tsx', 'utf8');
    const incomeChart = readFileSync('components/stats/IncomeChart.tsx', 'utf8');
    const categoryBreakdown = readFileSync('components/stats/CategoryBreakdown.tsx', 'utf8');

    expect(packageJson).not.toContain('"recharts"');
    expect(expenseChart).not.toContain("from 'recharts'");
    expect(incomeChart).not.toContain("from 'recharts'");
    expect(categoryBreakdown).not.toContain("from 'recharts'");
  });

  it('keeps a checked-in Playwright regression entrypoint for the event share flow', () => {
    const packageJson = readFileSync('package.json', 'utf8');
    const script = readFileSync('scripts/share-event-regression.mjs', 'utf8');

    expect(packageJson).toContain('"test:share-regression": "node scripts/share-event-regression.mjs"');
    expect(script).toContain("import { chromium } from 'playwright'");
    expect(script).toContain('SHARE_REGRESSION_EMAIL');
    expect(script).toContain('SHARE_REGRESSION_PASSWORD');
    expect(script).toContain('SHARE_REGRESSION_EVENT');
    expect(script).toContain('SHARE_REGRESSION_INVITE');
  });

  it('checks in a browser regression for the analytics page after the chart rewrite', () => {
    const packageJson = readFileSync('package.json', 'utf8');
    const script = readFileSync('scripts/analytics-regression.mjs', 'utf8');

    expect(packageJson).toContain('"test:analytics-regression": "node scripts/analytics-regression.mjs"');
    expect(script).toContain("import { chromium } from 'playwright'");
    expect(script).toContain('ANALYTICS_REGRESSION_EMAIL');
    expect(script).toContain('ANALYTICS_REGRESSION_PASSWORD');
    expect(script).toContain('Analytics');
    expect(script).toContain('output/playwright/analytics-regression-success.png');
  });

  it('checks in a browser regression for the transactions export flow', () => {
    const packageJson = readFileSync('package.json', 'utf8');
    const script = readFileSync('scripts/export-regression.mjs', 'utf8');

    expect(packageJson).toContain('"test:export-regression": "node scripts/export-regression.mjs"');
    expect(script).toContain("import { chromium } from 'playwright'");
    expect(script).toContain('EXPORT_REGRESSION_EMAIL');
    expect(script).toContain('EXPORT_REGRESSION_PASSWORD');
    expect(script).toContain('output/playwright/export-regression-success.png');
    expect(script).toContain('waitForEvent(\'download\')');
  });

  it('checks in a browser regression for transaction create, edit, and delete flow', () => {
    const packageJson = readFileSync('package.json', 'utf8');
    const script = readFileSync('scripts/transaction-crud-regression.mjs', 'utf8');
    const app = readFileSync('App.tsx', 'utf8');
    const navigation = readFileSync('components/app/AppNavigation.tsx', 'utf8');
    const addSheet = readFileSync('components/app/AddMenu.tsx', 'utf8');
    const transactionItem = readFileSync('components/TransactionItem.tsx', 'utf8');

    expect(packageJson).toContain('"test:transaction-crud-regression": "node scripts/transaction-crud-regression.mjs"');
    expect(script).toContain("import { chromium } from 'playwright'");
    expect(script).toContain('TRANSACTION_REGRESSION_EMAIL');
    expect(script).toContain('TRANSACTION_REGRESSION_PASSWORD');
    expect(script).toContain('transaction-crud-regression-success.png');
    // Create: "Add entry" -> New entry sheet -> Expense tile -> transaction form (no delete action).
    expect(script).toContain("getByRole('button', { name: /^add entry$|^dodaj unos$/i })");
    expect(script).toContain("getByRole('dialog', { name: /^new entry$|^novi unos$/i })");
    expect(script).toContain("getByRole('button', { name: /^expense\\b|^trošak\\b/i })");
    // The form's title names the kind it adds.
    expect(script).toContain("getByRole('heading', { name: /^new expense$|^novi trošak$/i })");
    expect(TRANSLATIONS.en.newExpense).toBe('New expense');
    expect(TRANSLATIONS.sr.newExpense).toBe('Novi trošak');
    expect(script).toContain('New transaction modal exposed delete action.');
    // Edit: tapping the row opens the edit modal. Delete: the row's "More actions" menu.
    expect(script).toContain("getByRole('heading', { name: /^edit expense$|^izmeni trošak$/i })");
    expect(TRANSLATIONS.en.editExpense).toBe('Edit expense');
    expect(TRANSLATIONS.sr.editExpense).toBe('Izmeni trošak');
    expect(script).toContain("getByRole('button', { name: /^more actions$|^više opcija$/i })");
    expect(script).toContain('const deleteLabel = /^delete$|^obrisi$|^obriši$/i;');
    expect(script).toContain("getByRole('menuitem', { name: deleteLabel })");
    expect(app).toContain('add: t.addEntry');
    expect(navigation).toContain('aria-label={labels.add}');
    expect(addSheet).toContain('<h2 id={titleId} className="sr-only">{t.newEntry}</h2>');
    expect(addSheet).toContain('label: t.expenseType');
    expect(transactionItem).toContain('data-transaction-row');
    expect(transactionItem).toContain('aria-label={t.moreActions}');
    expect(TRANSLATIONS.en.addEntry).toBe('Add entry');
    expect(TRANSLATIONS.sr.addEntry).toBe('Dodaj unos');
    expect(TRANSLATIONS.en.newEntry).toBe('New entry');
    expect(TRANSLATIONS.sr.newEntry).toBe('Novi unos');
    expect(TRANSLATIONS.en.expenseType).toBe('Expense');
    expect(TRANSLATIONS.sr.expenseType).toBe('Trošak');
    expect(TRANSLATIONS.en.moreActions).toBe('More actions');
    expect(TRANSLATIONS.sr.moreActions).toBe('Više opcija');
  });

  it('checks in a browser regression for account edit flow in wallet settings', () => {
    const packageJson = readFileSync('package.json', 'utf8');
    const script = readFileSync('scripts/account-edit-regression.mjs', 'utf8');

    expect(packageJson).toContain('"test:account-edit-regression": "node scripts/account-edit-regression.mjs"');
    expect(script).toContain("import { chromium } from 'playwright'");
    expect(script).toContain('ACCOUNT_EDIT_REGRESSION_EMAIL');
    expect(script).toContain('ACCOUNT_EDIT_REGRESSION_PASSWORD');
    const accountItem = readFileSync('components/AccountItem.tsx', 'utf8');
    const balanceInput = readFileSync('components/BalanceInput.tsx', 'utf8');

    expect(script).toContain('account-edit-regression-success.png');
    expect(script).toContain("/^settings$|^podešavanja$/i");
    expect(script).toContain("/^wallets\\b|^novčanici\\b/i");
    // The balance is a labelled button that opens a decimal text editor ("1.500,50" or "1500.50").
    expect(script).toContain("/^edit balance:|^izmeni stanje:/i");
    expect(script).toContain("/^current balance$|^trenutno stanje$/i");
    expect(script).toContain('formatWithDecimalComma');
    expect(accountItem).toContain('aria-label={`${t.editBalance}: ${account.name}, ');
    expect(accountItem).toContain('label={t.currentBalance}');
    expect(balanceInput).toContain('inputMode="decimal"');
    expect(TRANSLATIONS.en.editBalance).toBe('Edit balance');
    expect(TRANSLATIONS.sr.editBalance).toBe('Izmeni stanje');
    expect(TRANSLATIONS.en.currentBalance).toBe('Current balance');
    expect(TRANSLATIONS.sr.currentBalance).toBe('Trenutno stanje');
  });

  it('checks in a bundle snapshot script so chunk sizes are easy to inspect without opening the visualizer blob', () => {
    const packageJson = readFileSync('package.json', 'utf8');
    const script = readFileSync('scripts/bundle-snapshot.mjs', 'utf8');

    expect(packageJson).toContain('"bundle:snapshot": "node scripts/bundle-snapshot.mjs"');
    expect(script).toContain("console.log('Bundle snapshot')");
    expect(script).toContain("if (fileName.startsWith('motion-')) return 'motion'");
    expect(script).toContain("if (fileName.startsWith('icons-')) return 'icons'");
    expect(script).toContain("if (fileName.startsWith('supabaseService-')) return 'supabase-service'");
    expect(script).toContain("if (fileName.startsWith('pdfExport-')) return 'pdf-export'");
    expect(script).toContain("if (fileName.startsWith('html2canvas.esm-')) return 'dom-capture'");
  });

  it('checks in a bundle budget script so startup chunk regressions fail loudly', () => {
    const packageJson = readFileSync('package.json', 'utf8');
    const script = readFileSync('scripts/bundle-budget.mjs', 'utf8');

    expect(packageJson).toContain('"bundle:budget": "node scripts/bundle-budget.mjs"');
    expect(script).toContain("console.error('Bundle budget failed')");
    expect(script).toContain("console.log('Bundle budget passed')");
    expect(script).toContain("{ label: 'entry-chunk', prefix: 'index-', maxBytes: 202 * 1024, aggregate: false }");
    expect(script).toContain("{ label: 'startup-js', prefix: null, maxBytes: 522 * 1024, aggregate: false }");
    expect(script).toContain("{ label: 'react', prefix: 'react-', maxBytes: 224 * 1024, aggregate: false }");
    expect(script).toContain("const startupAssetNames = [");
    expect(script).toContain("indexHtml.matchAll(/<script[^>]+type=\"module\"");
    expect(script).toContain("indexHtml.matchAll(/<link[^>]+rel=\"modulepreload\"");
    expect(script).toContain("{ label: 'pdf-export', prefix: 'pdfExport-', maxBytes: 8 * 1024, aggregate: false }");
    expect(script).toContain("{ label: 'motion', prefix: 'motion-', maxBytes: 128 * 1024, aggregate: false }");
    expect(script).toContain("const forbiddenChunkPrefixes = ['CartesianChart-', 'pdf-tools-', 'html2canvas.esm-']");
  });

  it('lazy-loads the export modal instead of keeping it in the transactions route chunk', () => {
    const transactionsView = readFileSync('components/TransactionsView.tsx', 'utf8');

    expect(transactionsView).toContain("const ExportModal = lazyWithReload");
    expect(transactionsView).toContain("import('./ExportModal')");
    expect(transactionsView).not.toContain("import { ExportModal } from './ExportModal'");
  });

  it('keeps PDF export on native browser primitives instead of dragging jsPDF and html capture libraries', () => {
    const packageJson = readFileSync('package.json', 'utf8');
    const pdfExport = readFileSync('utils/pdfExport.ts', 'utf8');

    expect(packageJson).not.toContain('"jspdf"');
    expect(packageJson).not.toContain('"jspdf-autotable"');
    expect(pdfExport).not.toContain("import('jspdf')");
    expect(pdfExport).not.toContain("import('jspdf-autotable')");
    expect(pdfExport).toContain('window.open');
    expect(pdfExport).toContain('printWindow.print()');
  });

  it('checks in a browser regression for recurring create, toggle, and delete flow', () => {
    const packageJson = readFileSync('package.json', 'utf8');
    const script = readFileSync('scripts/recurring-regression.mjs', 'utf8');
    const dataSettings = readFileSync('components/settings/DataSettings.tsx', 'utf8');

    expect(packageJson).toContain('"test:recurring-regression": "node scripts/recurring-regression.mjs"');
    expect(script).toContain("import { chromium } from 'playwright'");
    expect(script).toContain('RECURRING_REGRESSION_EMAIL');
    expect(script).toContain('RECURRING_REGRESSION_PASSWORD');
    expect(script).toContain('recurring-regression-success.png');
    expect(script).toContain("/recurring|ponavljaju/i");
    expect(script).toContain('Pause recurring');
    expect(script).toContain('Resume recurring');
    expect(script).toContain('Delete recurring');
    expect(dataSettings).toContain('aria-label={t.addRecurringTransaction}');
    expect(dataSettings).toContain('aria-label={recurring.isActive ? t.pauseRecurring : t.resumeRecurring}');
    expect(dataSettings).toContain('aria-label={t.deleteRecurring}');
    expect(TRANSLATIONS.en.addRecurringTransaction).toBe('Add recurring transaction');
    expect(TRANSLATIONS.en.pauseRecurring).toBe('Pause recurring');
    expect(TRANSLATIONS.en.resumeRecurring).toBe('Resume recurring');
    expect(TRANSLATIONS.en.deleteRecurring).toBe('Delete recurring');
  });

  it('checks in a one-shot cleanup script for old recurring regression rows', () => {
    const packageJson = readFileSync('package.json', 'utf8');
    const script = readFileSync('scripts/cleanup-recurring-regressions.mjs', 'utf8');

    expect(packageJson).toContain('"cleanup:recurring-regressions": "node scripts/cleanup-recurring-regressions.mjs"');
    expect(script).toContain("import { chromium } from 'playwright'");
    expect(script).toContain('CLEANUP_RECURRING_EMAIL');
    expect(script).toContain('CLEANUP_RECURRING_PASSWORD');
    expect(script).toContain('Recurring Regression ');
    expect(script).toContain('Debug Recurring ');
    expect(script).toContain('cleanup-recurring-regressions-success.png');
  });

  it('checks in a browser regression for event-detail summary calculations', () => {
    const packageJson = readFileSync('package.json', 'utf8');
    const script = readFileSync('scripts/event-summary-regression.mjs', 'utf8');
    const view = readFileSync('components/event-detail/EventDetailView.tsx', 'utf8');
    const header = readFileSync('components/event-detail/EventHeader.tsx', 'utf8');

    expect(packageJson).toContain('"test:event-summary-regression": "node scripts/event-summary-regression.mjs"');
    expect(script).toContain("import { chromium } from 'playwright'");
    expect(script).toContain('EVENT_SUMMARY_REGRESSION_EMAIL');
    expect(script).toContain('EVENT_SUMMARY_REGRESSION_PASSWORD');
    expect(script).toContain('EVENT_SUMMARY_REGRESSION_EVENT');
    expect(script).toContain('event-summary-regression-success.png');
    // One screen, no tabs: paid vs share, settle up and categories, currency on the header.
    expect(script).toContain('Paid vs share');
    expect(script).toContain('Settle up');
    expect(script).toContain('Show amounts in');
    expect(view).toContain('<PaidVsShare');
    expect(view).toContain('<EventDebtSummary');
    expect(view).toContain('<EventCategories');
    expect(header).toContain('aria-label={s.showIn}');
    expect(EVENT_STRINGS.en.paidVsShare).toBe('Paid vs share');
    expect(EVENT_STRINGS.en.settleUp).toBe('Settle up');
    expect(EVENT_STRINGS.en.showIn).toBe('Show amounts in');
  });

  it('checks in a browser regression for dashboard wallet and debt summary rendering', () => {
    const packageJson = readFileSync('package.json', 'utf8');
    const script = readFileSync('scripts/dashboard-summary-regression.mjs', 'utf8');
    const homeBlocks = readFileSync('components/home/blocks.tsx', 'utf8');
    const peopleView = readFileSync('components/PeopleView.tsx', 'utf8');

    expect(packageJson).toContain('"test:dashboard-summary-regression": "node scripts/dashboard-summary-regression.mjs"');
    expect(script).toContain("import { chromium } from 'playwright'");
    expect(script).toContain('DASHBOARD_SUMMARY_REGRESSION_EMAIL');
    expect(script).toContain('DASHBOARD_SUMMARY_REGRESSION_PASSWORD');
    expect(script).toContain('dashboard-summary-regression-success.png');
    // Home (the old Dashboard): Net worth tile, Wallets tile in two or more currencies,
    // People tile net balance, then each person's open balance in People.
    expect(script).toContain('const netWorthLabel = /^net worth|^neto vrednost/i;');
    expect(script).toContain("getByRole('heading', { name: /^wallets$|^novčanici$/i, level: 3 })");
    expect(script).toContain('const debtLabel = /owes you|you owe|duguje ti|duguješ/i;');
    expect(script).toContain('Expected people debt cards to show open balances');
    expect(homeBlocks).toContain('<BlockHead title={t.block_wallets} right={money(total, currency, language)}');
    expect(homeBlocks).toContain('{net >= 0 ? t.owesYou : t.youOwe}');
    // People cards say who owes whom next to each amount; the totals use the same sums as Home.
    expect(peopleView).toContain('const status = !first ? t.settled : owesYou ? t.owesYou : s.youOweThem;');
    expect(peopleView).toContain('debtTotals(lines, baseCurrency, rates)');
    expect(TRANSLATIONS.en.block_networth).toBe('Net worth');
    expect(TRANSLATIONS.en.block_wallets).toBe('Wallets');
    expect(TRANSLATIONS.en.owesYou).toBe('Owes you');
    expect(TRANSLATIONS.en.youOwe).toBe('You owe');
  });

  it('checks in a GitHub Actions workflow that runs verify always and browser regressions against a local Supabase', () => {
    expect(existsSync('.github/workflows/ci.yml')).toBe(true);

    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

    expect(workflow).toContain('name: CI');
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('verify:');
    expect(workflow).toContain('browser-regressions:');
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npx tsc --noEmit');
    expect(workflow).toContain('npm run build');
    expect(workflow).toContain('npx playwright install --with-deps chromium');
    expect(workflow).toContain('npm run preview -- --host 127.0.0.1 --port 4173');
    // Browser regressions and RLS tests run against a throwaway local Supabase, never production.
    expect(workflow).toContain('supabase/setup-cli@v1');
    expect(workflow).toContain('supabase start');
    expect(workflow).toContain('npm run test:integration');
    expect(workflow).toContain('E2E_URL: http://127.0.0.1:4173');
    expect(workflow).toContain('EVENT_SUMMARY_REGRESSION_URL: ${{ env.E2E_URL }}');
    expect(workflow).toContain('DASHBOARD_SUMMARY_REGRESSION_URL: ${{ env.E2E_URL }}');
    expect(workflow).not.toContain('CI_E2E_PASSWORD');
    expect(workflow).toContain("hashFiles('package-lock.json')");
    expect(workflow).toContain('actions/upload-artifact');
  });
});
