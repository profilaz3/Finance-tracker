import React, { useMemo } from 'react';
import { m } from 'motion/react';
import { TRANSLATIONS } from '../../constants';
import { convertAmount } from '../../services/currencyService';
import { Category, Currency, ExchangeRates, Transaction } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { getExpensePrincipal, isCountedExpense } from '../../domain/money';
import {
  CategoryTimeFrame,
  ChartColors,
  CHART_CARD,
  ChartEmpty,
  ChartHead,
  ChartToggle,
  VolatilityDataItem,
  getCutoffDate,
  getMonthKey,
  getMonthRange,
} from './types';
import { DonutChart, HorizontalBarChart } from './lightCharts';
import { formatPercent } from '../../utils/locale';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { money } from '../home/parts';

interface CategoryBreakdownProps {
  transactions: Transaction[];
  categories: Category[];
  baseCurrency: Currency;
  rates: ExchangeRates;
  language: 'en' | 'sr';
  chartColors: ChartColors;
  tooltipStyle: React.CSSProperties;
  tooltipItemStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
  axisProps: Record<string, unknown>;
  now: Date;
  categoryTimeFrame: CategoryTimeFrame;
  onCategoryTimeFrameChange: (timeFrame: CategoryTimeFrame) => void;
}

export const CategoryBreakdown: React.FC<CategoryBreakdownProps> = ({
  transactions,
  categories,
  baseCurrency,
  rates,
  language,
  chartColors,
  now,
  categoryTimeFrame,
  onCategoryTimeFrameChange,
}) => {
  const t = TRANSLATIONS[language];
  const categoryById = useMemo(() => new Map(categories.map(category => [category.id, category])), [categories]);

  const categoryData = useMemo(() => {
    const cutoff = getCutoffDate(categoryTimeFrame, now);
    const totals: Record<string, number> = {};

    transactions
      .filter((transaction) => new Date(transaction.date) >= cutoff && isCountedExpense(transaction))
      .forEach((transaction) => {
        const amount = getExpensePrincipal(transaction, baseCurrency, rates);
        totals[transaction.categoryId] = (totals[transaction.categoryId] || 0) + amount;
      });

    return Object.entries(totals)
      .map(([id, value]) => ({
        id,
        name: categories.find((category) => category.id === id)?.name || t.unknown,
        value,
        color: categories.find((category) => category.id === id)?.color || 'rgb(var(--md-sys-color-on-surface-variant) / 0.6)',
      }))
      .sort((left, right) => right.value - left.value);
  }, [transactions, categoryTimeFrame, baseCurrency, rates, categories, now]);

  const categoryTotal = useMemo(() => categoryData.reduce((sum, item) => sum + item.value, 0), [categoryData]);

  const volatilityData = useMemo(() => {
    const monthsBack = 12;
    const endDate = new Date();
    const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - (monthsBack - 1), 1);
    const monthKeys = getMonthRange(startDate, endDate);
    const monthIndex = new Map(monthKeys.map((key, index) => [key, index]));
    const totalsByCategory: Record<string, number[]> = {};

    categories.forEach((category) => {
      totalsByCategory[category.id] = Array(monthKeys.length).fill(0);
    });

    transactions.forEach((transaction) => {
      if (!isCountedExpense(transaction)) {
        return;
      }

      const index = monthIndex.get(getMonthKey(new Date(transaction.date)));
      if (index === undefined) {
        return;
      }

      const amount = getExpensePrincipal(transaction, baseCurrency, rates);

      if (!totalsByCategory[transaction.categoryId]) {
        totalsByCategory[transaction.categoryId] = Array(monthKeys.length).fill(0);
      }

      totalsByCategory[transaction.categoryId][index] += amount;
    });

    return Object.entries(totalsByCategory)
      .map(([id, values]) => {
        const total = values.reduce((sum, value) => sum + value, 0);
        if (total === 0) {
          return null;
        }

        const mean = total / values.length;
        const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        const category = categories.find((item) => item.id === id);

        return {
          id,
          name: category?.name || t.unknown,
          value: stdDev,
          color: category?.color || chartColors.axisSoft,
        };
      })
      .filter((item): item is VolatilityDataItem => item !== null)
      .sort((left, right) => right.value - left.value);
  }, [transactions, categories, baseCurrency, rates, chartColors.axisSoft]);

  return (
    <>
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className={CHART_CARD}
      >
        <ChartHead title={t.categoryBreakdown}>
          <ChartToggle
            ariaLabel={t.timePeriod}
            value={categoryTimeFrame}
            onChange={onCategoryTimeFrameChange}
            options={(['weekly', 'monthly', 'yearly'] as const).map(timeFrame => ({ value: timeFrame, label: t[timeFrame] }))}
          />
        </ChartHead>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <DonutChart
            rows={categoryData.map((item) => ({ label: item.name, value: item.value, color: item.color }))}
            centerLabel={
              categoryData.length > 0 ? (
                <div className="text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">{t.total}</p>
                  <p className="text-[18px] font-bold tabular-nums tracking-[-0.3px] sm:text-xl">
                    {money(categoryTotal, baseCurrency, language)}
                  </p>
                </div>
              ) : null
            }
          />
          <div className="w-full md:pl-4">
            <div className="space-y-3.5">
              {categoryData.map((item) => {
                const percent = categoryTotal > 0 ? (item.value / categoryTotal) * 100 : 0;
                return (
                  <div key={item.id} className="flex items-center gap-3">
                    <CategoryGlyph category={categoryById.get(item.id) ?? { name: item.name, color: item.color }} size={36} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-[15px] font-semibold">{item.name}</span>
                        <span className="flex-none text-[14px] font-semibold tabular-nums">{money(item.value, baseCurrency, language)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-chip">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${percent}%`, minWidth: percent > 0 ? '6px' : '0px', backgroundColor: item.color }}
                          />
                        </div>
                        <span className="w-11 text-right text-[12px] tabular-nums text-faint">{formatPercent(percent)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {categoryData.length === 0 ? (
                <ChartEmpty>{t.noData}</ChartEmpty>
              ) : null}
            </div>
          </div>
        </div>
      </m.div>

      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className={CHART_CARD}
      >
        <ChartHead title={t.categoryVolatility} />
        {volatilityData.length > 0 ? (
          <HorizontalBarChart
            rows={volatilityData.map((item) => ({
              id: item.id,
              label: item.name,
              value: item.value,
              color: item.color,
            }))}
            valueFormatter={(value) => money(value, baseCurrency, language)}
          />
        ) : (
          <ChartEmpty>{t.noData}</ChartEmpty>
        )}
      </m.div>
    </>
  );
};

interface PaidForOthersProps {
  transactions: Transaction[];
  categories: Category[];
  baseCurrency: Currency;
  rates: ExchangeRates;
  language: 'en' | 'sr';
  now: Date;
  categoryTimeFrame: CategoryTimeFrame;
  onCategoryTimeFrameChange: (timeFrame: CategoryTimeFrame) => void;
}

export const PaidForOthers: React.FC<PaidForOthersProps> = ({
  transactions,
  categories,
  baseCurrency,
  rates,
  language,
  now,
  categoryTimeFrame,
  onCategoryTimeFrameChange,
}) => {
  const t = TRANSLATIONS[language];

  const paidForOthersData = useMemo(() => {
    const cutoff = getCutoffDate(categoryTimeFrame, now);
    const totals: Record<string, number> = {};
    let totalAdvanced = 0;

    transactions
      .filter((transaction) => new Date(transaction.date) >= cutoff && transaction.type === 'expense' && transaction.splitDetails)
      .forEach((transaction) => {
        if (!transaction.splitDetails) {
          return;
        }

        const advancedAmount = transaction.splitDetails.totalAmount - transaction.splitDetails.myPortion;
        if (advancedAmount <= 0) {
          return;
        }

        const amount = convertAmount(advancedAmount, transaction.currency, baseCurrency, rates);
        totals[transaction.categoryId] = (totals[transaction.categoryId] || 0) + amount;
        totalAdvanced += amount;
      });

    const data = Object.entries(totals)
      .map(([id, value]) => ({
        id,
        name: categories.find((category) => category.id === id)?.name || t.unknown,
        value,
        color: categories.find((category) => category.id === id)?.color || 'rgb(var(--md-sys-color-on-surface-variant) / 0.6)',
      }))
      .sort((left, right) => right.value - left.value);

    return { data, total: totalAdvanced };
  }, [transactions, categoryTimeFrame, baseCurrency, rates, categories, now]);

  if (paidForOthersData.data.length === 0) {
    return null;
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className={`${CHART_CARD} lg:col-span-2`}
    >
      <ChartHead title={t.paidForOthers} subtitle={`${t.totalLabel} ${formatCurrency(paidForOthersData.total, baseCurrency)}`}>
          <ChartToggle
            ariaLabel={t.timePeriod}
            value={categoryTimeFrame}
            onChange={onCategoryTimeFrameChange}
            options={(['weekly', 'monthly', 'yearly'] as const).map(timeFrame => ({ value: timeFrame, label: t[timeFrame] }))}
          />
        </ChartHead>
      <div className="space-y-3.5">
        {paidForOthersData.data.map((item, index) => {
          const percentage = paidForOthersData.total > 0 ? (item.value / paidForOthersData.total) * 100 : 0;
          return (
            <div key={item.id} className="flex items-center gap-3">
              <CategoryGlyph category={categories.find(category => category.id === item.id) ?? { name: item.name, color: item.color }} size={36} />
              <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[15px] font-semibold">{item.name}</span>
                <span className="flex-none text-[14px] font-semibold tabular-nums">{money(item.value, baseCurrency, language)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-chip">
                <m.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              </div>
              </div>
            </div>
          );
        })}
      </div>
    </m.div>
  );
};
