import React, { useMemo, useState } from 'react';
import { TRANSLATIONS } from '../../constants';
import { localizeCategoryName } from '../../utils/systemText';
import { buildAnalyticsStudioSummary, type AnalyticsPeriod } from '../../utils/analyticsSelectors';
import type { StatsProps } from './types';
import { AnalyticsStudioHeader } from './AnalyticsStudioHeader';
import { AnalyticsKpiGrid, type AnalyticsKpiHistory } from './AnalyticsKpiGrid';
import { CategoryDrilldownPanel } from './CategoryDrilldownPanel';
import { AnomalyPanel } from './AnomalyPanel';
import { CashFlowForecastPanel } from './CashFlowForecastPanel';
import { AnalyticsSummaryPanel } from './AnalyticsSummaryPanel';
import { ANALYTICS_STUDIO_LABELS } from './analyticsStudioLabels';

export interface AnalyticsStudioOverviewProps {
  transactions: StatsProps['transactions'];
  categories: StatsProps['categories'];
  recurringTransactions: StatsProps['recurringTransactions'];
  rates: StatsProps['rates'];
  baseCurrency: StatsProps['baseCurrency'];
  language: StatsProps['language'];
  events?: StatsProps['events'];
}

export const AnalyticsStudioOverview: React.FC<AnalyticsStudioOverviewProps> = ({
  transactions,
  categories,
  recurringTransactions,
  rates,
  baseCurrency,
  language,
  events,
}) => {
  const t = TRANSLATIONS[language];
  const localLabels = ANALYTICS_STUDIO_LABELS[language];
  const now = useMemo(() => new Date(), []);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>('month');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const studioSummary = useMemo(
    () => buildAnalyticsStudioSummary({
      transactions,
      categories,
      recurringTransactions,
      rates,
      baseCurrency,
      period: analyticsPeriod,
      now,
    }),
    [transactions, categories, recurringTransactions, rates, baseCurrency, analyticsPeriod, now]
  );

  // Totals of the last six periods (current last) for the KPI sparklines.
  const kpiHistory = useMemo<AnalyticsKpiHistory>(() => {
    const step = analyticsPeriod === 'month' ? 1 : analyticsPeriod === 'quarter' ? 3 : 12;
    const history: AnalyticsKpiHistory = { income: [], expense: [], net: [], savingsRate: [] };
    for (let back = 5; back >= 0; back -= 1) {
      // Past periods are read at their last day, so each point is a whole period.
      const at = back === 0 ? now : new Date(now.getFullYear(), now.getMonth() - back * step + 1, 0, 12);
      const { totals } = back === 0
        ? studioSummary
        : buildAnalyticsStudioSummary({ transactions, categories, recurringTransactions, rates, baseCurrency, period: analyticsPeriod, now: at });
      history.income.push(totals.current.income);
      history.expense.push(totals.current.expense);
      history.net.push(totals.current.net);
      history.savingsRate.push(totals.current.savingsRate ?? 0);
    }
    return history;
  }, [transactions, categories, recurringTransactions, rates, baseCurrency, analyticsPeriod, now, studioSummary]);

  const categoryLookup = useMemo(
    () => new Map(categories.map(category => [category.id, { ...category, name: localizeCategoryName(category, language) }])),
    [categories, language]
  );

  // Built-in categories stored in English read in the app language.
  const shownCategories = useMemo(
    () => studioSummary.categories.map(category => ({
      ...category,
      name: localizeCategoryName({ id: category.categoryId, name: category.name }, language),
    })),
    [studioSummary.categories, language]
  );

  const focusedCategoryId = useMemo(() => {
    const selectedStillExists = selectedCategoryId
      ? studioSummary.categories.some(category => category.categoryId === selectedCategoryId)
      : false;

    return selectedStillExists
      ? selectedCategoryId
      : studioSummary.categories[0]?.categoryId ?? null;
  }, [selectedCategoryId, studioSummary.categories]);

  return (
    <>
      <AnalyticsStudioHeader
        period={analyticsPeriod}
        periodRange={studioSummary.period}
        labels={{ month: t.periodMonth, quarter: t.periodQuarter, year: t.periodYear }}
        ariaLabel={t.timePeriod}
        language={language}
        onPeriodChange={setAnalyticsPeriod}
      />

      <AnalyticsKpiGrid
        summary={studioSummary}
        baseCurrency={baseCurrency}
        language={language}
        history={kpiHistory}
        labels={{
          firstPeriod: t.comparisonsStartNext,
          income: t.income,
          expense: t.expense,
          net: t.net,
          savingsRate: t.savingsRate,
          projectedNet: t.projectedNet,
          vsPreviousPeriod: t.vsPreviousPeriod,
          noComparison: t.noComparison,
          lowConfidenceForecast: t.lowConfidenceForecast,
          normalConfidenceForecast: t.normalConfidenceForecast,
          improved: localLabels.improved,
          worsened: localLabels.worsened,
        }}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)] gap-3 sm:gap-4">
        <CategoryDrilldownPanel
          categories={shownCategories}
          selectedCategoryId={focusedCategoryId}
          baseCurrency={baseCurrency}
          language={language}
          categoryLookup={categoryLookup}
          labels={{
            topCategories: t.topCategories,
            selectedCategory: t.selectedCategory,
            periodSpend: localLabels.periodSpend,
            previousPeriod: localLabels.previousPeriod,
            shareOfExpenses: t.shareOfExpenses,
            transactionsCount: t.transactionsCount,
            noData: t.noData,
            noComparison: t.noComparison,
            improved: localLabels.improved,
            worsened: localLabels.worsened,
          }}
          onSelectCategory={setSelectedCategoryId}
        />
        <div className="space-y-3 sm:space-y-4 min-w-0">
          <CashFlowForecastPanel
            forecast={studioSummary.forecast}
            baseCurrency={baseCurrency}
            language={language}
            labels={{
              cashFlowForecast: t.cashFlowForecast,
              forecastEstimate: t.forecastEstimate,
              recurringImpact: t.recurringImpact,
              lowConfidenceForecast: t.lowConfidenceForecast,
              normalConfidenceForecast: t.normalConfidenceForecast,
              lowConfidenceReason: t.lowConfidenceReason,
              normalConfidenceReason: t.normalConfidenceReason,
            }}
          />
          <AnomalyPanel
            anomalies={studioSummary.anomalies}
            categories={categories}
            baseCurrency={baseCurrency}
            language={language}
            labels={{
              observations: t.observations,
              noObservations: t.noObservations,
              anomalyTitles: localLabels.anomalyTitles,
              categorySpikeDetail: localLabels.categorySpikeDetail,
              largeTransactionDetail: localLabels.largeTransactionDetail,
              highFeesDetail: localLabels.highFeesDetail,
            }}
            explain={{
              transactions,
              categories,
              recurringTransactions,
              events,
              rates,
              period: studioSummary.period,
              loadingLabel: t.anomalyWhyLoading,
            }}
          />
        </div>
      </div>

      <AnalyticsSummaryPanel
        summary={studioSummary}
        baseCurrency={baseCurrency}
        language={language}
        label={t.localSummary}
        labels={{
          income: t.income,
          expense: t.expense,
          projectedNet: t.projectedNet,
          positiveNetFlow: t.positiveNetFlow,
          negativeNetFlow: t.negativeNetFlow,
          flatNetFlow: t.flatNetFlow,
        }}
      />
    </>
  );
};
