import React, { useMemo, useState } from 'react';
import { TRANSLATIONS } from '../../constants';
import { buildAnalyticsStudioSummary, type AnalyticsPeriod } from '../../utils/analyticsSelectors';
import type { StatsProps } from './types';
import { AnalyticsStudioHeader } from './AnalyticsStudioHeader';
import { AnalyticsKpiGrid } from './AnalyticsKpiGrid';
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

  const categoryLookup = useMemo(
    () => new Map(categories.map(category => [category.id, category])),
    [categories]
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
        labels={{
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
          categories={studioSummary.categories}
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
