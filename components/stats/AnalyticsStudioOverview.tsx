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
}

export const AnalyticsStudioOverview: React.FC<AnalyticsStudioOverviewProps> = ({
  transactions,
  categories,
  recurringTransactions,
  rates,
  baseCurrency,
  language,
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
        title={t.analyticsStudio}
        description={t.analyticsStudioDesc}
        period={analyticsPeriod}
        periodRange={studioSummary.period}
        labels={{ month: t.periodMonth, quarter: t.periodQuarter, year: t.periodYear }}
        onPeriodChange={setAnalyticsPeriod}
      />

      <AnalyticsKpiGrid
        summary={studioSummary}
        baseCurrency={baseCurrency}
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

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)] gap-4 sm:gap-6">
        <CategoryDrilldownPanel
          categories={studioSummary.categories}
          selectedCategoryId={focusedCategoryId}
          baseCurrency={baseCurrency}
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
        <div className="space-y-4 sm:space-y-6 min-w-0">
          <CashFlowForecastPanel
            forecast={studioSummary.forecast}
            baseCurrency={baseCurrency}
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
            labels={{
              observations: t.observations,
              noObservations: t.noObservations,
              anomalyTitles: localLabels.anomalyTitles,
              categorySpikeDetail: localLabels.categorySpikeDetail,
              largeTransactionDetail: localLabels.largeTransactionDetail,
              highFeesDetail: localLabels.highFeesDetail,
            }}
          />
        </div>
      </div>

      <AnalyticsSummaryPanel
        summary={studioSummary}
        baseCurrency={baseCurrency}
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
