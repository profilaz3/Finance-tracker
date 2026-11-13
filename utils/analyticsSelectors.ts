import type { Category, Currency, ExchangeRates, RecurringTransaction, Transaction } from '../types';
import { convertAmount } from '../services/currencyService';
import { calculateNextDueDate } from './recurringUtils';
import {
  getCountedFee,
  getExpensePrincipal,
  isCountedExpense,
  isCountedIncome,
  isTransferTransaction,
  NON_EARNING_INCOME_CATEGORY_IDS,
  REPAYMENT_CATEGORY_IDS,
} from '../domain/money';

export type AnalyticsPeriod = 'month' | 'quarter' | 'year';
export type AnalyticsForecastConfidence = 'low' | 'normal';
export type AnalyticsAnomalyKind = 'category-spike' | 'large-transaction' | 'high-fees';
export type AnalyticsDeltaDirection = 'up' | 'down' | 'flat';
export type AnalyticsLocalSummaryStatus = 'positive' | 'negative' | 'flat';

export interface AnalyticsSelectorInput {
  transactions: Transaction[];
  categories: Category[];
  recurringTransactions: RecurringTransaction[];
  rates: ExchangeRates;
  baseCurrency: Currency;
  period: AnalyticsPeriod;
  now: Date;
}

export interface AnalyticsPeriodRange {
  period: AnalyticsPeriod;
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
  remainingStart: Date;
  currentKey: string;
  previousKey: string;
  elapsedDays: number;
  totalDays: number;
  elapsedRatio: number;
}

export interface AnalyticsMoneyTotals {
  income: number;
  expense: number;
  fees: number;
  net: number;
  savingsRate: number | null;
  transactionCount: number;
}

export interface AnalyticsDelta {
  absolute: number;
  percentage: number | null;
  direction: AnalyticsDeltaDirection;
}

export interface AnalyticsCategorySummary {
  categoryId: string;
  name: string;
  color: string;
  amount: number;
  previousAmount: number;
  delta: AnalyticsDelta;
  shareOfExpense: number;
  transactionCount: number;
}

export interface AnalyticsAnomaly {
  id: string;
  kind: AnalyticsAnomalyKind;
  categoryId?: string;
  categoryName?: string;
  amount: number;
  percentage?: number;
}

export interface AnalyticsForecast {
  projectedIncome: number;
  projectedExpense: number;
  projectedNet: number;
  recurringIncomeImpact: number;
  recurringExpenseImpact: number;
  recurringImpact: number;
  confidence: AnalyticsForecastConfidence;
  reason: string;
}

export interface AnalyticsStudioSummary {
  period: AnalyticsPeriodRange;
  totals: {
    current: AnalyticsMoneyTotals;
    previous: AnalyticsMoneyTotals;
  };
  deltas: Record<'income' | 'expense' | 'fees' | 'net' | 'savingsRate', AnalyticsDelta>;
  categories: AnalyticsCategorySummary[];
  anomalies: AnalyticsAnomaly[];
  forecast: AnalyticsForecast;
  localSummary: {
    periodLabel: string;
    status: AnalyticsLocalSummaryStatus;
    facts: { key: 'income' | 'expense' | 'projectedNet'; value: number }[];
  };
}

interface RangeCategoryData {
  amount: number;
  transactionCount: number;
}

interface RangeAnalytics {
  totals: AnalyticsMoneyTotals;
  categoryAmounts: Map<string, RangeCategoryData>;
  countedTransactions: Transaction[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const round = (value: number): number => Number(value.toFixed(2));

const startOfUtcDay = (date: Date): Date => (
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
);

const endOfUtcDay = (date: Date): Date => (
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999))
);

const addUtcDays = (date: Date, days: number): Date => (
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
);

const addUtcMonths = (date: Date, months: number): Date => (
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()))
);

const endOfUtcMonth = (year: number, month: number): Date => (
  new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
);

const getDaysInclusive = (start: Date, end: Date): number => (
  Math.floor((startOfUtcDay(end).getTime() - startOfUtcDay(start).getTime()) / MS_PER_DAY) + 1
);

const formatMonthKey = (date: Date): string => {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}`;
};

const formatQuarterKey = (date: Date): string => (
  `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`
);

const formatYearKey = (date: Date): string => String(date.getUTCFullYear());

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
);

const buildPeriodRange = (
  period: AnalyticsPeriod,
  currentStart: Date,
  currentEnd: Date,
  previousStart: Date,
  previousEnd: Date,
  currentKey: string,
  previousKey: string,
  now: Date,
): AnalyticsPeriodRange => {
  const totalDays = getDaysInclusive(currentStart, currentEnd);
  const elapsedEnd = new Date(Math.min(endOfUtcDay(now).getTime(), currentEnd.getTime()));
  const elapsedDays = clamp(getDaysInclusive(currentStart, elapsedEnd), 0, totalDays);
  const remainingStart = addUtcDays(startOfUtcDay(now), 1);

  return {
    period,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    remainingStart,
    currentKey,
    previousKey,
    elapsedDays,
    totalDays,
    elapsedRatio: elapsedDays / totalDays,
  };
};

export const resolveAnalyticsPeriod = (period: AnalyticsPeriod, now: Date): AnalyticsPeriodRange => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  if (period === 'month') {
    const currentStart = new Date(Date.UTC(year, month, 1));
    const currentEnd = endOfUtcMonth(year, month);
    const previousStart = addUtcMonths(currentStart, -1);
    const previousEnd = endOfUtcMonth(previousStart.getUTCFullYear(), previousStart.getUTCMonth());

    return buildPeriodRange(
      period,
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      formatMonthKey(currentStart),
      formatMonthKey(previousStart),
      now,
    );
  }

  if (period === 'quarter') {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    const currentStart = new Date(Date.UTC(year, quarterStartMonth, 1));
    const currentEnd = endOfUtcMonth(year, quarterStartMonth + 2);
    const previousStart = addUtcMonths(currentStart, -3);
    const previousEnd = endOfUtcDay(addUtcDays(currentStart, -1));

    return buildPeriodRange(
      period,
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      formatQuarterKey(currentStart),
      formatQuarterKey(previousStart),
      now,
    );
  }

  const currentStart = new Date(Date.UTC(year, 0, 1));
  const currentEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const previousStart = new Date(Date.UTC(year - 1, 0, 1));
  const previousEnd = new Date(Date.UTC(year - 1, 11, 31, 23, 59, 59, 999));

  return buildPeriodRange(
    period,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    formatYearKey(currentStart),
    formatYearKey(previousStart),
    now,
  );
};

const isInRange = (dateValue: string, start: Date, end: Date): boolean => {
  const time = new Date(dateValue).getTime();
  return time >= start.getTime() && time <= end.getTime();
};

const isTransfer = isTransferTransaction;

const isExcludedRecurringIncome = (categoryId: string): boolean => (
  NON_EARNING_INCOME_CATEGORY_IDS.has(categoryId) || REPAYMENT_CATEGORY_IDS.has(categoryId)
);

const convertToBase = (
  amount: number,
  currency: Currency,
  baseCurrency: Currency,
  rates: ExchangeRates,
): number => convertAmount(amount, currency, baseCurrency, rates);

const getTransactionExpenseAmount = (
  transaction: Transaction,
  baseCurrency: Currency,
  rates: ExchangeRates,
): number => getExpensePrincipal(transaction, baseCurrency, rates);

const getTransactionFees = (
  transaction: Transaction,
  baseCurrency: Currency,
  rates: ExchangeRates,
): number => getCountedFee(transaction, baseCurrency, rates);

const calculateDelta = (current: number, previous: number): AnalyticsDelta => {
  const absolute = round(current - previous);

  return {
    absolute,
    percentage: previous === 0 ? null : round((absolute / Math.abs(previous)) * 100),
    direction: absolute === 0 ? 'flat' : absolute > 0 ? 'up' : 'down',
  };
};

const calculateNullableDelta = (current: number | null, previous: number | null): AnalyticsDelta => {
  if (current === null || previous === null) {
    return {
      absolute: 0,
      percentage: null,
      direction: 'flat',
    };
  }

  return calculateDelta(current, previous);
};

const calculateTotals = (
  income: number,
  expense: number,
  fees: number,
  transactionCount: number,
): AnalyticsMoneyTotals => {
  const roundedIncome = round(income);
  const roundedExpense = round(expense);
  const net = round(roundedIncome - roundedExpense);

  return {
    income: roundedIncome,
    expense: roundedExpense,
    fees: round(fees),
    net,
    savingsRate: roundedIncome === 0 ? null : round((net / roundedIncome) * 100),
    transactionCount,
  };
};

const analyzeRange = (
  transactions: Transaction[],
  start: Date,
  end: Date,
  baseCurrency: Currency,
  rates: ExchangeRates,
): RangeAnalytics => {
  let income = 0;
  let expense = 0;
  let fees = 0;
  let transactionCount = 0;
  const categoryAmounts = new Map<string, RangeCategoryData>();
  const countedTransactions: Transaction[] = [];

  transactions
    .filter(transaction => isInRange(transaction.date, start, end))
    .forEach(transaction => {
      const transactionFees = getTransactionFees(transaction, baseCurrency, rates);

      if (!isCountedExpense(transaction)) {
        // Fees are a real cost even on transfers, repayments and income.
        expense += transactionFees;
        fees += transactionFees;

        if (!isCountedIncome(transaction)) {
          return;
        }

        income += convertToBase(transaction.amount, transaction.currency, baseCurrency, rates);
        transactionCount += 1;
        countedTransactions.push(transaction);
        return;
      }

      const amount = getTransactionExpenseAmount(transaction, baseCurrency, rates);
      const categoryData = categoryAmounts.get(transaction.categoryId) ?? { amount: 0, transactionCount: 0 };

      categoryData.amount += amount;
      categoryData.transactionCount += 1;
      categoryAmounts.set(transaction.categoryId, categoryData);
      expense += amount + transactionFees;
      fees += transactionFees;
      transactionCount += 1;
      countedTransactions.push(transaction);
    });

  return {
    totals: calculateTotals(income, expense, fees, transactionCount),
    categoryAmounts,
    countedTransactions,
  };
};

const buildCategorySummaries = (
  categories: Category[],
  current: RangeAnalytics,
  previous: RangeAnalytics,
): AnalyticsCategorySummary[] => {
  const categoryById = new Map(categories.map(category => [category.id, category]));

  return [...current.categoryAmounts.entries()]
    .map(([categoryId, data]) => {
      const category = categoryById.get(categoryId);
      const previousData = previous.categoryAmounts.get(categoryId);
      const amount = round(data.amount);
      const previousAmount = round(previousData?.amount ?? 0);

      return {
        categoryId,
        name: category?.name ?? categoryId,
        color: category?.color ?? '#888888',
        amount,
        previousAmount,
        delta: calculateDelta(amount, previousAmount),
        shareOfExpense: current.totals.expense === 0 ? 0 : round((amount / current.totals.expense) * 100),
        transactionCount: data.transactionCount,
      };
    })
    .sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name));
};

const buildAnomalies = (
  categories: AnalyticsCategorySummary[],
  current: RangeAnalytics,
  baseCurrency: Currency,
  rates: ExchangeRates,
): AnalyticsAnomaly[] => {
  const anomalies: AnalyticsAnomaly[] = [];
  const categoryNameById = new Map(categories.map(category => [category.categoryId, category.name]));

  categories.forEach(category => {
    const increase = category.amount - category.previousAmount;
    const increasePercentage = category.previousAmount > 0
      ? (increase / category.previousAmount) * 100
      : 0;

    if (category.previousAmount > 0 && increase >= 50 && increasePercentage >= 50) {
      anomalies.push({
        id: `category-spike:${category.categoryId}`,
        kind: 'category-spike',
        categoryId: category.categoryId,
        categoryName: category.name,
        amount: round(increase),
        percentage: round(increasePercentage),
      });
    }
  });

  current.countedTransactions
    .filter(transaction => transaction.type === 'expense' && !isTransfer(transaction))
    .forEach(transaction => {
      const amount = getTransactionExpenseAmount(transaction, baseCurrency, rates);
      if (amount >= 100 && current.totals.expense > 0 && amount / current.totals.expense >= 0.4) {
        anomalies.push({
          id: `large-transaction:${transaction.id}`,
          kind: 'large-transaction',
          categoryId: transaction.categoryId,
          categoryName: categoryNameById.get(transaction.categoryId),
          amount: round(amount),
          percentage: round((amount / current.totals.expense) * 100),
        });
      }
    });

  if (current.totals.fees >= 5 && current.totals.expense > 0 && current.totals.fees / current.totals.expense >= 0.03) {
    anomalies.push({
      id: 'high-fees',
      kind: 'high-fees',
      amount: current.totals.fees,
      percentage: round((current.totals.fees / current.totals.expense) * 100),
    });
  }

  return anomalies;
};

const parseDateOnlyUtc = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateOnlyUtc = (date: Date): string => date.toISOString().split('T')[0];

const countRecurringOccurrencesInRemainingPeriod = (
  recurring: RecurringTransaction,
  remainingStart: Date,
  currentEnd: Date,
): number => {
  if (!recurring.isActive || isTransfer(recurring)) return 0;

  let occurrenceEnd = currentEnd;
  if (recurring.endDate) {
    const endDate = new Date(`${recurring.endDate}T23:59:59.999Z`);
    if (endDate.getTime() < remainingStart.getTime()) return 0;
    occurrenceEnd = new Date(Math.min(occurrenceEnd.getTime(), endDate.getTime()));
  }

  let nextDue = recurring.nextDue;
  let due = parseDateOnlyUtc(nextDue);
  const remainingStartDay = startOfUtcDay(remainingStart);

  while (due.getTime() < remainingStartDay.getTime()) {
    nextDue = calculateNextDueDate(nextDue, recurring.frequency);
    due = parseDateOnlyUtc(nextDue);
  }

  let occurrences = 0;
  while (due.getTime() <= occurrenceEnd.getTime()) {
    occurrences += 1;
    nextDue = calculateNextDueDate(formatDateOnlyUtc(due), recurring.frequency);
    due = parseDateOnlyUtc(nextDue);
  }

  return occurrences;
};

const buildForecast = (
  recurringTransactions: RecurringTransaction[],
  period: AnalyticsPeriodRange,
  current: RangeAnalytics,
  baseCurrency: Currency,
  rates: ExchangeRates,
): AnalyticsForecast => {
  let recurringIncomeImpact = 0;
  let recurringExpenseImpact = 0;

  recurringTransactions
    .forEach(recurring => {
      const occurrences = countRecurringOccurrencesInRemainingPeriod(recurring, period.remainingStart, period.currentEnd);
      if (occurrences === 0) return;

      const amount = convertToBase(recurring.amount, recurring.currency, baseCurrency, rates);
      if (recurring.type === 'income' && !isExcludedRecurringIncome(recurring.categoryId)) {
        recurringIncomeImpact += amount * occurrences;
      } else if (recurring.type === 'expense' && !REPAYMENT_CATEGORY_IDS.has(recurring.categoryId)) {
        recurringExpenseImpact += amount * occurrences;
      }
    });

  const paceRatio = period.elapsedRatio > 0 ? period.elapsedRatio : 1;
  const projectedIncome = round(current.totals.income / paceRatio + recurringIncomeImpact);
  const projectedExpense = round(current.totals.expense / paceRatio + recurringExpenseImpact);
  const recurringImpact = round(recurringIncomeImpact - recurringExpenseImpact);
  const confidence: AnalyticsForecastConfidence = current.totals.transactionCount < 3 || period.elapsedRatio < 0.15
    ? 'low'
    : 'normal';

  return {
    projectedIncome,
    projectedExpense,
    projectedNet: round(projectedIncome - projectedExpense),
    recurringIncomeImpact: round(recurringIncomeImpact),
    recurringExpenseImpact: round(recurringExpenseImpact),
    recurringImpact,
    confidence,
    reason: confidence === 'low'
      ? 'Limited current-period activity.'
      : 'Based on current pace and remaining recurring transactions.',
  };
};

const getPeriodLabel = (period: AnalyticsPeriodRange): string => {
  if (period.period === 'month') {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(period.currentStart);
  }

  return period.currentKey;
};

const getStatus = (net: number): AnalyticsLocalSummaryStatus => {
  if (net > 0) return 'positive';
  if (net < 0) return 'negative';
  return 'flat';
};

export const buildAnalyticsStudioSummary = ({
  transactions,
  categories,
  recurringTransactions,
  rates,
  baseCurrency,
  period,
  now,
}: AnalyticsSelectorInput): AnalyticsStudioSummary => {
  const periodRange = resolveAnalyticsPeriod(period, now);
  const current = analyzeRange(transactions, periodRange.currentStart, periodRange.currentEnd, baseCurrency, rates);
  const previous = analyzeRange(transactions, periodRange.previousStart, periodRange.previousEnd, baseCurrency, rates);
  const categorySummaries = buildCategorySummaries(categories, current, previous);
  const forecast = buildForecast(recurringTransactions, periodRange, current, baseCurrency, rates);

  return {
    period: periodRange,
    totals: {
      current: current.totals,
      previous: previous.totals,
    },
    deltas: {
      income: calculateDelta(current.totals.income, previous.totals.income),
      expense: calculateDelta(current.totals.expense, previous.totals.expense),
      fees: calculateDelta(current.totals.fees, previous.totals.fees),
      net: calculateDelta(current.totals.net, previous.totals.net),
      savingsRate: calculateNullableDelta(current.totals.savingsRate, previous.totals.savingsRate),
    },
    categories: categorySummaries,
    anomalies: buildAnomalies(categorySummaries, current, baseCurrency, rates),
    forecast,
    localSummary: {
      periodLabel: getPeriodLabel(periodRange),
      status: getStatus(current.totals.net),
      facts: [
        { key: 'income', value: current.totals.income },
        { key: 'expense', value: current.totals.expense },
        { key: 'projectedNet', value: forecast.projectedNet },
      ],
    },
  };
};
