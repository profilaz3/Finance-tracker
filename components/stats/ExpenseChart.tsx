import React, { useMemo, useState } from 'react';
import { m } from 'motion/react';
import { TRANSLATIONS } from '../../constants';
import { convertAmount } from '../../services/currencyService';
import { Account, Currency, ExchangeRates, Transaction } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { getCountedExpenseAmount, getCountedIncomeAmount, isCountedExpense } from '../../domain/money';
import {
  ChartColors,
  ChartDataItem,
  ComparisonTimeFrame,
  CHART_CARD,
  ChartEmpty,
  ChartHead,
  ChartToggle,
  TrendTimeFrame,
  formatCompactNumber,
  getCutoffDate,
  getGroupKey,
  formatLabel,
  isTransfer,
} from './types';
import { GroupedBarChart, LineAreaChart, StackedSignedBarChart } from './lightCharts';
import { ChartLegend } from './types';
import { formatPercent } from '../../utils/locale';

interface ExpenseChartProps {
  transactions: Transaction[];
  accounts: Account[];
  baseCurrency: Currency;
  rates: ExchangeRates;
  language: 'en' | 'sr';
  chartColors: ChartColors;
  tooltipStyle: React.CSSProperties;
  tooltipItemStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
  axisProps: Record<string, unknown>;
  now: Date;
}

export const ExpenseChart: React.FC<ExpenseChartProps> = ({
  transactions,
  accounts,
  baseCurrency,
  rates,
  language,
  chartColors,
  now,
}) => {
  const [trendTimeFrame, setTrendTimeFrame] = useState<TrendTimeFrame>('weekly');
  const [comparisonTimeFrame, setComparisonTimeFrame] = useState<ComparisonTimeFrame>('monthly');
  const [savingsTimeFrame, setSavingsTimeFrame] = useState<ComparisonTimeFrame>('monthly');
  const [accountCashflowTimeFrame, setAccountCashflowTimeFrame] = useState<ComparisonTimeFrame>('monthly');

  const t = TRANSLATIONS[language];
  const savingsTarget = 20;

  const trendData = useMemo(() => {
    const cutoff = getCutoffDate(trendTimeFrame, now);
    const grouped: Record<string, ChartDataItem & { sortDate: number }> = {};

    transactions
      .filter((transaction) => new Date(transaction.date) >= cutoff)
      .forEach((transaction) => {
        if (!isCountedExpense(transaction)) {
          return;
        }

        const key = getGroupKey(transaction.date, trendTimeFrame);
        const amount = getCountedExpenseAmount(transaction, baseCurrency, rates);

        if (!grouped[key]) {
          grouped[key] = { date: key, expense: 0, sortDate: new Date(transaction.date).getTime() };
        }

        grouped[key].expense = Number(grouped[key].expense ?? 0) + amount;
      });

    return Object.values(grouped)
      .sort((left, right) => left.sortDate - right.sortDate)
      .map((item) => ({ ...item, label: formatLabel(item.date, trendTimeFrame, language) }));
  }, [transactions, trendTimeFrame, baseCurrency, rates, language, now]);

  const comparisonData = useMemo(() => {
    const cutoff = getCutoffDate(comparisonTimeFrame, now);
    const grouped: Record<string, ChartDataItem> = {};

    transactions
      .filter((transaction) => new Date(transaction.date) >= cutoff)
      .forEach((transaction) => {
        const key = getGroupKey(transaction.date, comparisonTimeFrame);
        const income = getCountedIncomeAmount(transaction, baseCurrency, rates);
        const expense = getCountedExpenseAmount(transaction, baseCurrency, rates);
        if (income === 0 && expense === 0) {
          return;
        }

        if (!grouped[key]) {
          grouped[key] = { date: key, income: 0, expense: 0 };
        }

        grouped[key].income = Number(grouped[key].income ?? 0) + income;
        grouped[key].expense = Number(grouped[key].expense ?? 0) + expense;
      });

    return Object.values(grouped)
      .sort((left, right) => (left.date > right.date ? 1 : -1))
      .map((item) => ({ ...item, label: formatLabel(item.date, comparisonTimeFrame, language) }));
  }, [transactions, comparisonTimeFrame, baseCurrency, rates, language, now]);

  const savingsRateData = useMemo(() => {
    const cutoff = getCutoffDate(savingsTimeFrame, now);
    const grouped: Record<string, { date: string; income: number; expense: number }> = {};

    transactions
      .filter((transaction) => new Date(transaction.date) >= cutoff)
      .forEach((transaction) => {
        const income = getCountedIncomeAmount(transaction, baseCurrency, rates);
        const expense = getCountedExpenseAmount(transaction, baseCurrency, rates);
        if (income === 0 && expense === 0) {
          return;
        }

        const key = getGroupKey(transaction.date, savingsTimeFrame);

        if (!grouped[key]) {
          grouped[key] = { date: key, income: 0, expense: 0 };
        }

        grouped[key].income += income;
        grouped[key].expense += expense;
      });

    return Object.values(grouped)
      .sort((left, right) => (left.date > right.date ? 1 : -1))
      .map((item) => {
        const rate = item.income > 0 ? ((item.income - item.expense) / item.income) * 100 : 0;
        return { ...item, rate, label: formatLabel(item.date, savingsTimeFrame, language) };
      });
  }, [transactions, savingsTimeFrame, baseCurrency, rates, language, now]);

  const accountCashflowData = useMemo(() => {
    const cutoff = getCutoffDate(accountCashflowTimeFrame, now);
    const totals = new Map<string, { name: string; inflow: number; outflow: number; color: string; order: number }>();

    accounts.forEach((account) => {
      totals.set(account.id, {
        name: account.name,
        inflow: 0,
        outflow: 0,
        color: account.color,
        order: account.order || 0,
      });
    });

    transactions
      .filter((transaction) => new Date(transaction.date) >= cutoff)
      .forEach((transaction) => {
        if (isTransfer(transaction)) {
          return;
        }

        const target = totals.get(transaction.accountId);
        if (!target) {
          return;
        }

        const amount = convertAmount(transaction.amount, transaction.currency, baseCurrency, rates);
        const feeAmount = transaction.fees ? convertAmount(transaction.fees, 'USD', baseCurrency, rates) : 0;

        if (transaction.type === 'income') {
          target.inflow += amount;
          target.outflow += feeAmount;
        } else {
          target.outflow += amount + feeAmount;
        }
      });

    return Array.from(totals.values())
      .sort((left, right) => left.order - right.order)
      .map((item) => ({
        name: item.name,
        inflow: item.inflow,
        outflow: -item.outflow,
        color: item.color,
      }));
  }, [transactions, accounts, accountCashflowTimeFrame, baseCurrency, rates, now]);

  return (
    <>
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={CHART_CARD}
      >
        <ChartHead title={t.spendingTrend}>
          <ChartToggle
            ariaLabel={t.timePeriod}
            value={trendTimeFrame}
            onChange={setTrendTimeFrame}
            options={(['daily', 'weekly', 'monthly'] as const).map(timeFrame => ({ value: timeFrame, label: t[timeFrame] }))}
          />
        </ChartHead>
        <div className="h-[240px] w-full sm:h-[300px]">
          <LineAreaChart
            rows={trendData}
            labelKey="label"
            valueKey="expense"
            stroke={chartColors.expense}
            fill={chartColors.expense}
            yTickFormatter={formatCompactNumber}
            valueFormatter={(value) => formatCurrency(value, baseCurrency)}
          />
        </div>
      </m.div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={CHART_CARD}
        >
          <ChartHead title={t.incomeVsExpense}>
          <ChartToggle
            ariaLabel={t.timePeriod}
            value={comparisonTimeFrame}
            onChange={setComparisonTimeFrame}
            options={(['weekly', 'monthly', 'quarterly', 'yearly'] as const).map(timeFrame => ({ value: timeFrame, label: t[timeFrame] }))}
          />
        </ChartHead>
          <div className="h-[240px] w-full sm:h-[300px]">
            <GroupedBarChart
              rows={comparisonData}
              labelKey="label"
              series={[
                { key: 'income', label: t.income, color: chartColors.income },
                { key: 'expense', label: t.expense, color: chartColors.expense },
              ]}
              yTickFormatter={formatCompactNumber}
              valueFormatter={(value) => formatCurrency(value, baseCurrency)}
            />
          </div>
          <ChartLegend
            items={[
              { label: t.income, color: chartColors.income, gradient: `linear-gradient(180deg, ${chartColors.income} 0%, ${chartColors.incomeSoft} 100%)` },
              { label: t.expense, color: chartColors.expense, gradient: `linear-gradient(180deg, ${chartColors.expense} 0%, ${chartColors.expenseSoft} 100%)` },
            ]}
          />
        </m.div>

        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className={CHART_CARD}
        >
          <ChartHead title={t.savingsRate} subtitle={`${t.savingsTarget}: ${savingsTarget}%`}>
          <ChartToggle
            ariaLabel={t.timePeriod}
            value={savingsTimeFrame}
            onChange={setSavingsTimeFrame}
            options={(['monthly', 'quarterly', 'yearly'] as const).map(timeFrame => ({ value: timeFrame, label: t[timeFrame] }))}
          />
        </ChartHead>
          <div className="h-[240px] w-full sm:h-[300px]">
            {savingsRateData.length > 0 ? (
              <LineAreaChart
                rows={savingsRateData}
                labelKey="label"
                valueKey="rate"
                stroke={chartColors.accent}
                fill={chartColors.accent}
                yTickFormatter={(value) => formatPercent(value)}
                valueFormatter={(value) => formatPercent(value, 1)}
                referenceLine={{ value: savingsTarget, color: chartColors.gridStrong, dashed: true }}
              />
            ) : (
              <ChartEmpty>{t.noData}</ChartEmpty>
            )}
          </div>
        </m.div>

        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`${CHART_CARD} lg:col-span-2`}
        >
          <ChartHead title={t.cashflowByAccount}>
          <ChartToggle
            ariaLabel={t.timePeriod}
            value={accountCashflowTimeFrame}
            onChange={setAccountCashflowTimeFrame}
            options={(['monthly', 'quarterly', 'yearly'] as const).map(timeFrame => ({ value: timeFrame, label: t[timeFrame] }))}
          />
        </ChartHead>
          <div className="w-full">
            {accountCashflowData.length > 0 ? (
              <>
                <div className="h-[240px] w-full sm:h-[300px]">
                  <StackedSignedBarChart
                    rows={accountCashflowData}
                    labelKey="name"
                    series={[
                      { key: 'inflow', label: t.income, color: chartColors.income },
                      { key: 'outflow', label: t.expense, color: chartColors.expense },
                    ]}
                    yTickFormatter={formatCompactNumber}
                    valueFormatter={(value) => `${value >= 0 ? '+' : '-'}${formatCurrency(Math.abs(value), baseCurrency)}`}
                  />
                </div>
                <ChartLegend
                  items={[
                    { label: t.income, color: chartColors.income, gradient: `linear-gradient(180deg, ${chartColors.income} 0%, ${chartColors.incomeSoft} 100%)` },
                    { label: t.expense, color: chartColors.expense, gradient: `linear-gradient(180deg, ${chartColors.expense} 0%, ${chartColors.expenseSoft} 100%)` },
                  ]}
                />
              </>
            ) : (
              <ChartEmpty>{t.noData}</ChartEmpty>
            )}
          </div>
        </m.div>
      </div>
    </>
  );
};
