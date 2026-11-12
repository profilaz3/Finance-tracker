import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { TRANSLATIONS } from '../../constants';
import {
  StatsProps,
  CategoryTimeFrame,
  buildChartColors,
  buildTooltipStyle,
  buildTooltipItemStyle,
  buildTooltipLabelStyle,
  buildAxisProps
} from './types';
import { StatsSummary } from './StatsSummary';

const AnalyticsStudioOverviewSection = React.lazy(async () => {
  const module = await import('./AnalyticsStudioOverview');
  return { default: module.AnalyticsStudioOverview };
});

const ExpenseChartSection = React.lazy(async () => {
  const module = await import('./ExpenseChart');
  return { default: module.ExpenseChart };
});

const IncomeChartSection = React.lazy(async () => {
  const module = await import('./IncomeChart');
  return { default: module.IncomeChart };
});

const CategoryBreakdownSection = React.lazy(async () => {
  const module = await import('./CategoryBreakdown');

  const CombinedCategorySection: React.FC<{
    transactions: StatsProps['transactions'];
    categories: StatsProps['categories'];
    baseCurrency: StatsProps['baseCurrency'];
    rates: StatsProps['rates'];
    language: StatsProps['language'];
    chartColors: ReturnType<typeof buildChartColors>;
    tooltipStyle: React.CSSProperties;
    tooltipItemStyle: React.CSSProperties;
    tooltipLabelStyle: React.CSSProperties;
    axisProps: Record<string, unknown>;
    now: Date;
    categoryTimeFrame: CategoryTimeFrame;
    onCategoryTimeFrameChange: (timeFrame: CategoryTimeFrame) => void;
  }> = (props) => (
    <>
      <module.CategoryBreakdown {...props} />
      <module.PaidForOthers
        transactions={props.transactions}
        categories={props.categories}
        baseCurrency={props.baseCurrency}
        rates={props.rates}
        language={props.language}
        now={props.now}
        categoryTimeFrame={props.categoryTimeFrame}
        onCategoryTimeFrameChange={props.onCategoryTimeFrameChange}
      />
    </>
  );

  return { default: CombinedCategorySection };
});

const StatsPanelFallback: React.FC<{ className?: string }> = ({ className }) => (
  <div
    className={`animate-pulse rounded-3xl border border-outline/10 bg-surface-container-low p-6 shadow-elevation-1 ${className ?? ''}`}
    aria-hidden="true"
  >
    <div className="h-5 w-36 rounded-full bg-surface-container-high mb-4" />
    <div className="h-64 rounded-2xl bg-surface-container-highest/60" />
  </div>
);

const DeferredStatsSection: React.FC<{
  fallbackClassName?: string;
  children: React.ReactNode;
}> = ({ fallbackClassName, children }) => {
  const [shouldRender, setShouldRender] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (shouldRender) {
      return;
    }

    const node = sentinelRef.current;
    if (!node) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldRender]);

  return (
    <div ref={sentinelRef}>
      {shouldRender ? (
        <Suspense fallback={<StatsPanelFallback className={fallbackClassName} />}>
          {children}
        </Suspense>
      ) : (
        <StatsPanelFallback className={fallbackClassName} />
      )}
    </div>
  );
};

export const Stats: React.FC<StatsProps> = ({
  transactions,
  categories,
  accounts,
  recurringTransactions,
  baseCurrency,
  rates,
  language,
  totalExpense
}) => {
  const t = TRANSLATIONS[language];
  const now = useMemo(() => new Date(), []);

  // Shared category timeframe state (used by CategoryBreakdown sections 5 & 8)
  const [categoryTimeFrame, setCategoryTimeFrame] = useState<CategoryTimeFrame>('monthly');

  // Build shared chart styling objects once
  const chartColors = buildChartColors();
  const tooltipStyle = buildTooltipStyle(chartColors);
  const tooltipItemStyle = buildTooltipItemStyle();
  const tooltipLabelStyle = buildTooltipLabelStyle(chartColors);
  const axisProps = buildAxisProps(chartColors);

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <h2 className="text-2xl font-display font-medium text-on-surface">{t.analytics}</h2>
      </div>

      <Suspense fallback={<StatsPanelFallback />}>
        <AnalyticsStudioOverviewSection
          transactions={transactions}
          categories={categories}
          recurringTransactions={recurringTransactions}
          rates={rates}
          baseCurrency={baseCurrency}
          language={language}
        />
      </Suspense>

      {/* Total Fees Summary Card */}
      <StatsSummary
        transactions={transactions}
        baseCurrency={baseCurrency}
        rates={rates}
        language={language}
        totalExpense={totalExpense}
      />

      {/* Spending Trend (section 1) + Income vs Expense / Savings Rate / Cashflow by Account (sections 2-4) */}
      <DeferredStatsSection fallbackClassName="min-h-[22rem]">
        <ExpenseChartSection
          transactions={transactions}
          accounts={accounts}
          baseCurrency={baseCurrency}
          rates={rates}
          language={language}
          chartColors={chartColors}
          tooltipStyle={tooltipStyle}
          tooltipItemStyle={tooltipItemStyle}
          tooltipLabelStyle={tooltipLabelStyle}
          axisProps={axisProps}
          now={now}
        />
      </DeferredStatsSection>

      {/* Sections 5-8: Category Breakdown, Volatility, Net Worth, Paid for Others */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown (section 5) + Category Volatility (section 6) */}
        <DeferredStatsSection fallbackClassName="min-h-[34rem]">
          <CategoryBreakdownSection
            transactions={transactions}
            categories={categories}
            baseCurrency={baseCurrency}
            rates={rates}
            language={language}
            chartColors={chartColors}
            tooltipStyle={tooltipStyle}
            tooltipItemStyle={tooltipItemStyle}
            tooltipLabelStyle={tooltipLabelStyle}
            axisProps={axisProps}
            now={now}
            categoryTimeFrame={categoryTimeFrame}
            onCategoryTimeFrameChange={setCategoryTimeFrame}
          />
        </DeferredStatsSection>

        {/* Net Worth Trend (section 7) */}
        <DeferredStatsSection fallbackClassName="min-h-[22rem]">
          <IncomeChartSection
            transactions={transactions}
            accounts={accounts}
            baseCurrency={baseCurrency}
            rates={rates}
            language={language}
            chartColors={chartColors}
            tooltipStyle={tooltipStyle}
            tooltipItemStyle={tooltipItemStyle}
            tooltipLabelStyle={tooltipLabelStyle}
            axisProps={axisProps}
            now={now}
          />
        </DeferredStatsSection>
      </div>
    </div>
  );
};
