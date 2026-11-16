import clsx from 'clsx';
import React, { useMemo, useState } from 'react';
import { TRANSLATIONS } from '../../constants';
import { localizeCategoryName } from '../../utils/systemText';
import { buildAnalyticsStudioSummary, type AnalyticsPeriod } from '../../utils/analyticsSelectors';
import type { StatsProps } from './types';
import { barsAverage, compareSameDays, spendingBars } from '../../domain/periodCompare';
import type { HomeHeaderTone, View } from '../../types';
import { AnalyticsHero } from './AnalyticsHero';
import { CompareCard } from './CompareCard';
import { CategoryDrilldownPanel } from './CategoryDrilldownPanel';
import { AnomalyPanel } from './AnomalyPanel';
import { CashFlowForecastPanel } from './CashFlowForecastPanel';
import { ANALYTICS_STUDIO_LABELS } from './analyticsStudioLabels';
import { ANALYTICS_STRINGS } from './analyticsStrings';

export interface AnalyticsStudioOverviewProps {
  transactions: StatsProps['transactions'];
  categories: StatsProps['categories'];
  recurringTransactions: StatsProps['recurringTransactions'];
  rates: StatsProps['rates'];
  baseCurrency: StatsProps['baseCurrency'];
  language: StatsProps['language'];
  events?: StatsProps['events'];
  tone: HomeHeaderTone;
  onNavigate?: (view: View) => void;
  /** The deeper sections, on the sheet under the comparison. */
  children?: React.ReactNode;
}

export const AnalyticsStudioOverview: React.FC<AnalyticsStudioOverviewProps> = ({
  transactions,
  categories,
  recurringTransactions,
  rates,
  baseCurrency,
  language,
  events,
  tone,
  onNavigate,
  children,
}) => {
  const t = TRANSLATIONS[language];
  const s = ANALYTICS_STRINGS[language];
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

  // The last four periods for the header bars, and the same days of the last period for the card.
  const bars = useMemo(
    () => spendingBars(transactions, analyticsPeriod, now, baseCurrency, rates),
    [transactions, analyticsPeriod, now, baseCurrency, rates]
  );
  const comparison = useMemo(
    () => compareSameDays(transactions, events ?? [], analyticsPeriod, now, baseCurrency, rates),
    [transactions, events, analyticsPeriod, now, baseCurrency, rates]
  );

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

  // Only with something to compare against: a new user starts with the header alone.
  const compareCard = comparison.before > 0 ? (
    <CompareCard
      comparison={comparison}
      period={analyticsPeriod}
      categories={categories}
      events={events ?? []}
      currency={baseCurrency}
      language={language}
      s={s}
    />
  ) : null;

  return (
    <>
      {/* Wide windows: the comparison sits beside the header instead of under it. */}
      <div className={clsx(compareCard && 'min-[1180px]:grid min-[1180px]:grid-cols-2 min-[1180px]:items-start min-[1180px]:gap-4')}>
        <AnalyticsHero
          tone={tone}
          title={t.navInsights}
          periodLabel={t.timePeriod}
          period={analyticsPeriod}
          onPeriodChange={setAnalyticsPeriod}
          onNavigate={onNavigate}
          summary={studioSummary}
          bars={bars}
          average={barsAverage(bars)}
          currency={baseCurrency}
          language={language}
          s={s}
        />
        {compareCard && <div className="hidden min-[1180px]:block">{compareCard}</div>}
      </div>

      <div className="screen-sheet flex flex-col gap-3 sm:gap-4">
        {compareCard && <div className="min-[1180px]:hidden">{compareCard}</div>}

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

        {children}
      </div>
    </>
  );
};
