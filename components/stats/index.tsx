import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { lazyWithReload } from '../../utils/lazyWithReload';
import { resolveHomeHeader } from '../../domain/homeHeader';
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

const AnalyticsStudioOverviewSection = lazyWithReload(async () => {
  const module = await import('./AnalyticsStudioOverview');
  return { default: module.AnalyticsStudioOverview };
});

const ExpenseChartSection = lazyWithReload(async () => {
  const module = await import('./ExpenseChart');
  return { default: module.ExpenseChart };
});

const IncomeChartSection = lazyWithReload(async () => {
  const module = await import('./IncomeChart');
  return { default: module.IncomeChart };
});

const CategoryBreakdownSection = lazyWithReload(async () => {
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
    className={`paper-tile animate-pulse p-4 sm:p-5 ${className ?? ''}`}
    aria-hidden="true"
  >
    <div className="mb-4 h-5 w-36 rounded-full bg-chip" />
    <div className="h-56 rounded-[18px] bg-chip" />
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
    <div ref={sentinelRef} className="flex min-w-0 flex-col gap-3 sm:gap-4">
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
  totalExpense,
  events,
  homeHeader,
  onNavigate,
}) => {
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
    <div className="mx-auto max-w-[920px] pb-28">
      <Suspense fallback={<StatsPanelFallback />}>
        <AnalyticsStudioOverviewSection
          transactions={transactions}
          categories={categories}
          recurringTransactions={recurringTransactions}
          rates={rates}
          baseCurrency={baseCurrency}
          language={language}
          events={events}
          tone={resolveHomeHeader(homeHeader).tone}
          onNavigate={onNavigate}
        >
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
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
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
        </AnalyticsStudioOverviewSection>
      </Suspense>
    </div>
  );
};
