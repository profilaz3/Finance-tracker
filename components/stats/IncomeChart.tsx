import React, { useMemo, useState } from 'react';
import { m } from 'motion/react';
import { TRANSLATIONS } from '../../constants';
import { convertAmount } from '../../services/currencyService';
import { Account, Currency, ExchangeRates, Transaction } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import {
  ChartColors,
  ChartLegend,
  NetWorthTimeFrame,
  ToggleButton,
  formatCompactNumber,
  getAlignedStartDate,
  getCutoffDate,
  getGroupKey,
  getTimeBuckets,
} from './types';
import { StackedAreaLineChart } from './lightCharts';

interface IncomeChartProps {
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

export const IncomeChart: React.FC<IncomeChartProps> = ({
  transactions,
  accounts,
  baseCurrency,
  rates,
  language,
  chartColors,
  now,
}) => {
  const [netWorthTimeFrame, setNetWorthTimeFrame] = useState<NetWorthTimeFrame>('monthly');
  const t = TRANSLATIONS[language];

  const netWorthData = useMemo(() => {
    const cutoff = getCutoffDate(netWorthTimeFrame, now);
    const startDate = getAlignedStartDate(netWorthTimeFrame, cutoff);
    const endDate = new Date();
    const buckets = getTimeBuckets(netWorthTimeFrame, startDate, endDate, language);
    const bucketIndex = new Map(buckets.map((bucket, index) => [bucket.key, index]));
    const cashDeltas = Array(buckets.length).fill(0);
    const debtDeltas = Array(buckets.length).fill(0);

    let cashBalance = accounts.reduce((sum, account) => {
      return sum + convertAmount(account.initialBalance || 0, account.currency, baseCurrency, rates);
    }, 0);
    let debtBalance = 0;

    transactions.forEach((transaction) => {
      const transactionDate = new Date(transaction.date);
      const amount = convertAmount(transaction.amount, transaction.currency, baseCurrency, rates);
      const feeAmount = transaction.fees ? convertAmount(transaction.fees, 'USD', baseCurrency, rates) : 0;
      const cashDelta = transaction.type === 'income' ? amount - feeAmount : -amount - feeAmount;

      let debtDelta = 0;
      if (transaction.personId) {
        debtDelta += transaction.type === 'expense' ? amount : -amount;
      }
      if (transaction.splitDetails?.shares) {
        transaction.splitDetails.shares.forEach((share) => {
          debtDelta += convertAmount(share.amount, transaction.currency, baseCurrency, rates);
        });
      }

      if (transactionDate < startDate) {
        cashBalance += cashDelta;
        debtBalance += debtDelta;
        return;
      }

      const index = bucketIndex.get(getGroupKey(transaction.date, netWorthTimeFrame));
      if (index === undefined) {
        return;
      }

      cashDeltas[index] += cashDelta;
      debtDeltas[index] += debtDelta;
    });

    let runningCash = cashBalance;
    let runningDebt = debtBalance;

    return buckets.map((bucket, index) => {
      runningCash += cashDeltas[index];
      runningDebt += debtDeltas[index];

      return {
        date: bucket.key,
        label: bucket.label,
        cash: runningCash,
        receivables: Math.max(runningDebt, 0),
        payables: Math.min(runningDebt, 0),
        netWorth: runningCash + runningDebt,
      };
    });
  }, [transactions, accounts, netWorthTimeFrame, baseCurrency, rates, language, now]);

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="bg-surface-container-low p-6 rounded-xl shadow-elevation-1 lg:col-span-2"
    >
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h3 className="text-lg font-medium text-on-surface">{t.netWorthTrend}</h3>
        <div className="bg-surface-container rounded-full p-1 flex gap-1">
          {(['weekly', 'monthly', 'quarterly'] as const).map((timeFrame) => (
            <ToggleButton
              key={timeFrame}
              active={netWorthTimeFrame === timeFrame}
              onClick={() => setNetWorthTimeFrame(timeFrame)}
              label={t[timeFrame]}
            />
          ))}
        </div>
      </div>
      <div className="h-[320px] w-full">
        {netWorthData.length > 0 ? (
          <StackedAreaLineChart
            rows={netWorthData}
            labelKey="label"
            areaKeys={[
              { key: 'cash', label: t.cash, color: chartColors.income },
              { key: 'receivables', label: t.receivables, color: chartColors.accent },
              { key: 'payables', label: t.payables, color: chartColors.expense },
            ]}
            lineKey="netWorth"
            lineLabel={t.totalNetWorth}
            lineColor={chartColors.netLine}
            yTickFormatter={formatCompactNumber}
            valueFormatter={(value) => formatCurrency(value, baseCurrency)}
          />
        ) : (
          <p className="text-on-surface-variant text-center italic mt-10">{t.noData}</p>
        )}
      </div>
      {netWorthData.length > 0 ? (
        <ChartLegend
          items={[
            { label: t.cash, color: chartColors.income, gradient: `linear-gradient(180deg, ${chartColors.income} 0%, ${chartColors.incomeSoft} 100%)` },
            { label: t.receivables, color: chartColors.accent, gradient: `linear-gradient(180deg, ${chartColors.accent} 0%, ${chartColors.accentSoft} 100%)` },
            { label: t.payables, color: chartColors.expense, gradient: `linear-gradient(180deg, ${chartColors.expense} 0%, ${chartColors.expenseSoft} 100%)` },
            { label: t.totalNetWorth, color: chartColors.netLine, line: true },
          ]}
        />
      ) : null}
    </m.div>
  );
};
