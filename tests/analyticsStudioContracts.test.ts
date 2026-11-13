import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(path, 'utf8');

describe('analytics studio source contracts', () => {
  it('passes recurring transactions into the lazy analytics route', () => {
    const router = readSource('components/app/AppViewRouter.tsx');

    expect(router).toContain("const Stats = lazyWithReload(() => import('../Stats')");
    expect(router).toContain("currentView === 'analytics'");
    expect(router).toContain('recurringTransactions={state.recurringTransactions}');
  });

  it('includes recurring transactions in the stats prop contract', () => {
    const statsTypes = readSource('components/stats/types.tsx');

    expect(statsTypes).toContain('RecurringTransaction');
    expect(statsTypes).toContain('recurringTransactions: RecurringTransaction[];');
  });

  it('keeps the analytics route shell independent from AI markdown and reports', () => {
    const statsIndex = readSource('components/stats/index.tsx');

    expect(statsIndex).not.toContain('react-markdown');
    expect(statsIndex).not.toContain('generateInsights');
    expect(statsIndex).not.toContain('InsightsView');
  });

  it('uses mobile-safe layout classes in the new overview panels', () => {
    const kpiGrid = readSource('components/stats/AnalyticsKpiGrid.tsx');
    const categoryPanel = readSource('components/stats/CategoryDrilldownPanel.tsx');
    const anomalyPanel = readSource('components/stats/AnomalyPanel.tsx');
    const header = readSource('components/stats/AnalyticsStudioHeader.tsx');

    expect(kpiGrid).toContain('grid-cols-1');
    expect(kpiGrid).toContain('sm:grid-cols-2');
    expect(kpiGrid).toContain('xl:grid-cols-5');
    expect(categoryPanel).toContain('min-h-[44px]');
    expect(categoryPanel).not.toContain('shrink-0');
    expect(anomalyPanel).toContain('min-w-0 flex-1');
    expect(anomalyPanel).not.toContain('whitespace-nowrap');
    expect(header).toContain("(['month', 'quarter', 'year'] as const)");
  });

  it('keeps studio panel controls and forecast confidence labels safe for reuse', () => {
    const kpiGrid = readSource('components/stats/AnalyticsKpiGrid.tsx');
    const forecastPanel = readSource('components/stats/CashFlowForecastPanel.tsx');
    const categoryPanel = readSource('components/stats/CategoryDrilldownPanel.tsx');
    const header = readSource('components/stats/AnalyticsStudioHeader.tsx');

    expect(kpiGrid).toContain('lowConfidenceForecast');
    expect(kpiGrid).toContain('normalConfidenceForecast');
    expect(kpiGrid).not.toContain(': summary.forecast.confidence');
    expect(forecastPanel).toContain('lowConfidenceReason');
    expect(forecastPanel).toContain('normalConfidenceReason');
    expect(forecastPanel).not.toContain('forecast.reason');
    expect(categoryPanel).toContain('type="button"');
    expect(header).toContain('type="button"');
  });

  it('keeps anomaly selectors semantic and localizes anomaly copy in the lazy overview', () => {
    const selectors = readSource('utils/analyticsSelectors.ts');
    const overview = readSource('components/stats/AnalyticsStudioOverview.tsx');
    const labels = readSource('components/stats/analyticsStudioLabels.ts');
    const anomalyPanel = readSource('components/stats/AnomalyPanel.tsx');

    expect(selectors).toContain("kind: AnalyticsAnomalyKind");
    expect(selectors).toContain('categoryName?: string');
    expect(selectors).not.toContain('title: string');
    expect(selectors).not.toContain('detail: string');
    expect(selectors).not.toContain('Large transaction');
    expect(selectors).not.toContain('High fees');
    expect(selectors).not.toContain('spending increased');
    expect(selectors).not.toContain('is a large share of current expenses');
    expect(selectors).not.toContain('categories.find');
    expect(selectors).toContain('categoryNameById.get(transaction.categoryId)');
    expect(overview).toContain("import { ANALYTICS_STUDIO_LABELS } from './analyticsStudioLabels'");
    expect(overview).toContain('ANALYTICS_STUDIO_LABELS[language]');
    expect(overview).not.toContain('LOCAL_ANALYTICS_LABELS');
    expect(labels).toContain('ANALYTICS_STUDIO_LABELS');
    expect(overview).toContain('categorySpikeDetail');
    expect(overview).toContain('largeTransactionDetail');
    expect(overview).toContain('highFeesDetail');
    expect(anomalyPanel).toContain('labels.anomalyTitles[anomaly.kind]');
    expect(anomalyPanel).not.toContain('anomaly.title');
    expect(anomalyPanel).not.toContain('anomaly.detail');
  });

  it('uses metric-aware delta semantics and preserves null savings-rate comparisons', () => {
    const selectors = readSource('utils/analyticsSelectors.ts');
    const kpiGrid = readSource('components/stats/AnalyticsKpiGrid.tsx');
    const overview = readSource('components/stats/AnalyticsStudioOverview.tsx');
    const labels = readSource('components/stats/analyticsStudioLabels.ts');

    expect(selectors).toContain('calculateNullableDelta(current.totals.savingsRate, previous.totals.savingsRate)');
    expect(selectors).not.toContain('current.totals.savingsRate ?? 0');
    expect(kpiGrid).toContain("type AnalyticsKpiMetric = 'income' | 'expense' | 'net' | 'savingsRate'");
    expect(kpiGrid).toContain("const decreaseIsImproved = metric === 'expense'");
    expect(kpiGrid).toContain("formatDelta('expense'");
    expect(kpiGrid).toContain("formatDelta('income'");
    expect(kpiGrid).toContain("formatDelta('net'");
    expect(kpiGrid).toContain("formatDelta('savingsRate'");
    expect(overview).toContain('improved: localLabels.improved');
    expect(overview).toContain('worsened: localLabels.worsened');
    expect(labels).toContain("improved: 'Improved'");
    expect(labels).toContain("worsened: 'Worsened'");
  });

  it('surfaces selected-category period spend, previous delta, count, and share', () => {
    const categoryPanel = readSource('components/stats/CategoryDrilldownPanel.tsx');
    const overview = readSource('components/stats/AnalyticsStudioOverview.tsx');

    expect(categoryPanel).toContain('labels.periodSpend');
    expect(categoryPanel).toContain('formatCurrency(selected.amount, baseCurrency)');
    expect(categoryPanel).toContain('formatCategoryDelta(selected, labels)');
    expect(categoryPanel).toContain('selected.delta.percentage');
    expect(categoryPanel).toContain('selected.transactionCount');
    expect(categoryPanel).toContain('formatPercent(selected.shareOfExpense, 1)');
    expect(overview).toContain('periodSpend: localLabels.periodSpend');
    expect(overview).toContain('previousPeriod: localLabels.previousPeriod');
  });

  it('lazy loads the Analytics Studio overview before deferred chart sections', () => {
    const statsIndex = readSource('components/stats/index.tsx');

    expect(statsIndex).toContain("import('./AnalyticsStudioOverview')");
    expect(statsIndex).toContain('<AnalyticsStudioOverviewSection');
    expect(statsIndex.indexOf('<AnalyticsStudioOverviewSection')).toBeLessThan(statsIndex.indexOf('<DeferredStatsSection'));
    expect(statsIndex).not.toContain('buildAnalyticsStudioSummary');
    expect(statsIndex).not.toContain('type AnalyticsPeriod');
    expect(statsIndex).not.toContain("from './AnalyticsStudioHeader'");
    expect(statsIndex).not.toContain("from './AnalyticsKpiGrid'");
    expect(statsIndex).not.toContain("from './CategoryDrilldownPanel'");
    expect(statsIndex).not.toContain("from './AnomalyPanel'");
    expect(statsIndex).not.toContain("from './CashFlowForecastPanel'");
    expect(statsIndex).not.toContain("from './AnalyticsSummaryPanel'");
  });

  it('keeps Analytics Studio overview wiring in the lazy overview chunk', () => {
    const overviewPath = 'components/stats/AnalyticsStudioOverview.tsx';

    expect(existsSync(overviewPath)).toBe(true);

    const overview = existsSync(overviewPath) ? readSource(overviewPath) : '';

    expect(overview).toContain('buildAnalyticsStudioSummary');
    expect(overview).toContain('<AnalyticsStudioHeader');
    expect(overview).toContain('<AnalyticsKpiGrid');
    expect(overview).toContain('<CategoryDrilldownPanel');
    expect(overview).toContain('<CashFlowForecastPanel');
    expect(overview).toContain('<AnomalyPanel');
    expect(overview).toContain('<AnalyticsSummaryPanel');
    expect(overview).toContain('lowConfidenceForecast: t.lowConfidenceForecast');
    expect(overview).toContain('normalConfidenceForecast: t.normalConfidenceForecast');
    expect(overview).toContain('lowConfidenceReason: t.lowConfidenceReason');
    expect(overview).toContain('normalConfidenceReason: t.normalConfidenceReason');
  });

  it('does not add AI explanation controls to the v1 studio panels', () => {
    [
      'components/stats/AnalyticsStudioHeader.tsx',
      'components/stats/AnalyticsKpiGrid.tsx',
      'components/stats/CategoryDrilldownPanel.tsx',
      'components/stats/AnomalyPanel.tsx',
      'components/stats/CashFlowForecastPanel.tsx',
      'components/stats/AnalyticsSummaryPanel.tsx',
      'components/stats/AnalyticsStudioOverview.tsx',
    ].forEach(path => {
      const source = readSource(path);
      expect(source).not.toContain('generateInsights');
      expect(source).not.toContain('react-markdown');
      expect(source).not.toContain('Explain');
    });
  });
});
