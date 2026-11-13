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

// Periods follow the user's local calendar: a purchase at 00:30 on the 1st
// belongs to the new month even when that instant is still the previous
// month in UTC.
const startOfLocalDay = (date: Date): Date => (
  new Date(date.getFullYear(), date.getMonth(), date.getDate())
);

const endOfLocalDay = (date: Date): Date => (
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
);

const addLocalDays = (date: Date, days: number): Date => (
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
);

const addLocalMonths = (date: Date, months: number): Date => (
  new Date(date.getFullYear(), date.getMonth() + months, date.getDate())
);

const endOfLocalMonth = (year: number, month: number): Date => (
  new Date(year, month + 1, 0, 23, 59, 59, 999)
);

// Rounded so DST days (23h/25h) still count as one day.
const getDaysInclusive = (start: Date, end: Date): number => (
  Math.round((startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime()) / MS_PER_DAY) + 1
);

const formatMonthKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
};

const formatQuarterKey = (date: Date): string => (
  `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`
);

const formatYearKey = (date: Date): string => String(date.getFullYear());

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
  const elapsedEnd = new Date(Math.min(endOfLocalDay(now).getTime(), currentEnd.getTime()));
  const elapsedDays = clamp(getDaysInclusive(currentStart, elapsedEnd), 0, totalDays);
  const remainingStart = addLocalDays(startOfLocalDay(now), 1);

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
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === 'month') {
    const currentStart = new Date(year, month, 1);
    const currentEnd = endOfLocalMonth(year, month);
    const previousStart = addLocalMonths(currentStart, -1);
    const previousEnd = endOfLocalMonth(previousStart.getFullYear(), previousStart.getMonth());

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
    const currentStart = new Date(year, quarterStartMonth, 1);
    const currentEnd = endOfLocalMonth(year, quarterStartMonth + 2);
    const previousStart = addLocalMonths(currentStart, -3);
    const previousEnd = endOfLocalDay(addLocalDays(currentStart, -1));

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

  const currentStart = new Date(year, 0, 1);
  const currentEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  const previousStart = new Date(year - 1, 0, 1);
  const previousEnd = new Date(year - 1, 11, 31, 23, 59, 59, 999);

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

// Recurring due dates are calendar days; compare them as local days.
const parseDateOnlyLocal = (value: string): Date => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatDateOnlyLocal = (date: Date): string => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

const countRecurringOccurrencesInRemainingPeriod = (
  recurring: RecurringTransaction,
  remainingStart: Date,
  currentEnd: Date,
): number => {
  if (!recurring.isActive || isTransfer(recurring)) return 0;

  let occurrenceEnd = currentEnd;
  if (recurring.endDate) {
    const endDate = endOfLocalDay(parseDateOnlyLocal(recurring.endDate));
    if (endDate.getTime() < remainingStart.getTime()) return 0;
    occurrenceEnd = new Date(Math.min(occurrenceEnd.getTime(), endDate.getTime()));
  }

  let nextDue = recurring.nextDue;
  let due = parseDateOnlyLocal(nextDue);
  const remainingStartDay = startOfLocalDay(remainingStart);

  while (due.getTime() < remainingStartDay.getTime()) {
    nextDue = calculateNextDueDate(nextDue, recurring.frequency, recurring.startDate);
    due = parseDateOnlyLocal(nextDue);
  }

  let occurrences = 0;
  while (due.getTime() <= occurrenceEnd.getTime()) {
    occurrences += 1;
    nextDue = calculateNextDueDate(formatDateOnlyLocal(due), recurring.frequency, recurring.startDate);
    due = parseDateOnlyLocal(nextDue);
  }

  return occurrences;
};

const AUTO_NOTE_PREFIX = '[Auto]';
const LARGE_ONE_OFF_MEDIAN_MULTIPLIER = 3;
const LARGE_ONE_OFF_SHARE = 0.25;

const getMedian = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

/**
 * Splits counted amounts into a fixed part (recurring-generated transactions
 * and large one-offs) that is NOT extrapolated, and a variable part that is.
 * Extrapolating a rent payment from day 10 of a month would triple it.
 */
const splitFixedAndVariable = (
  entries: { amount: number; isRecurring: boolean }[],
): { fixed: number; variable: number } => {
  let fixed = 0;
  const variableAmounts: number[] = [];

  entries.forEach(entry => {
    if (entry.isRecurring) {
      fixed += entry.amount;
    } else {
      variableAmounts.push(entry.amount);
    }
  });

  const variableTotal = variableAmounts.reduce((sum, amount) => sum + amount, 0);
  const median = getMedian(variableAmounts);
  let variable = 0;

  variableAmounts.forEach(amount => {
    const isLargeOneOff = variableAmounts.length > 1
      && amount > median * LARGE_ONE_OFF_MEDIAN_MULTIPLIER
      && amount >= variableTotal * LARGE_ONE_OFF_SHARE;
    if (isLargeOneOff) {
      fixed += amount;
    } else {
      variable += amount;
    }
  });

  return { fixed, variable };
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

  const activeRecurring = recurringTransactions.filter(recurring => recurring.isActive);
  const isRecurringGenerated = (transaction: Transaction): boolean => (
    (transaction.note ?? '').startsWith(AUTO_NOTE_PREFIX)
    || activeRecurring.some(recurring => (
      recurring.type === transaction.type
      && recurring.categoryId === transaction.categoryId
      && recurring.currency === transaction.currency
      && Math.abs(recurring.amount - transaction.amount) < 0.005
    ))
  );

  const expenseEntries: { amount: number; isRecurring: boolean }[] = [];
  const incomeEntries: { amount: number; isRecurring: boolean }[] = [];
  current.countedTransactions.forEach(transaction => {
    const isRecurring = isRecurringGenerated(transaction);
    if (transaction.type === 'expense') {
      expenseEntries.push({ amount: getTransactionExpenseAmount(transaction, baseCurrency, rates), isRecurring });
    } else {
      incomeEntries.push({ amount: convertToBase(transaction.amount, transaction.currency, baseCurrency, rates), isRecurring });
    }
  });

  const expenseSplit = splitFixedAndVariable(expenseEntries);
  const incomeSplit = splitFixedAndVariable(incomeEntries);
  // Fees stay in the variable part (current.totals.expense includes them).
  const variableExpense = Math.max(0, current.totals.expense - expenseSplit.fixed);
  const variableIncome = Math.max(0, current.totals.income - incomeSplit.fixed);

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

  // Only variable activity is extrapolated; recurring items still to come are
  // added from the schedule instead.
  const paceRatio = period.elapsedRatio > 0 ? period.elapsedRatio : 1;
  const projectedIncome = round(incomeSplit.fixed + variableIncome / paceRatio + recurringIncomeImpact);
  const projectedExpense = round(expenseSplit.fixed + variableExpense / paceRatio + recurringExpenseImpact);
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
      : 'Based on the pace of variable activity plus remaining scheduled recurring transactions.',
  };
};

const getPeriodLabel = (period: AnalyticsPeriodRange): string => {
  if (period.period === 'month') {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
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
