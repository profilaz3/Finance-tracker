import { describe, expect, it } from 'vitest';
import {
  buildAnalyticsStudioSummary,
  resolveAnalyticsPeriod,
} from '../utils/analyticsSelectors';
import type { Category, ExchangeRates, RecurringTransaction, Transaction } from '../types';

const rates: ExchangeRates = {
  base: 'EUR',
  date: '2026-05-11',
  rates: { EUR: 1, USD: 2, RSD: 120 },
};

const categories: Category[] = [
  { id: 'salary', name: 'Salary', type: 'income', subcategories: [], color: '#00aa66', icon: 'wallet' },
  { id: 'food', name: 'Food', type: 'expense', subcategories: [], color: '#ff0000', icon: 'coffee' },
  { id: 'transport', name: 'Transport', type: 'expense', subcategories: [], color: '#0040ff', icon: 'car' },
  { id: 'fun', name: 'Fun', type: 'expense', subcategories: [], color: '#aa00ff', icon: 'gamepad' },
  { id: 'c8', name: 'Reimbursement', type: 'income', subcategories: [], color: '#4000ff', icon: 'refresh-cw' },
  { id: 'internal-transfer', name: 'Internal Transfer', type: 'income', subcategories: [], color: '#888888', icon: 'arrow-right-left' },
];

const transactions: Transaction[] = [
  { id: 'income-current', date: '2026-05-03T10:00:00.000Z', amount: 1000, currency: 'EUR', categoryId: 'salary', accountId: 'acc-1', type: 'income' },
  { id: 'food-current', date: '2026-05-04T10:00:00.000Z', amount: 120, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense', fees: 4 },
  {
    id: 'split-current',
    date: '2026-05-05T10:00:00.000Z',
    amount: 90,
    currency: 'EUR',
    categoryId: 'food',
    accountId: 'acc-1',
    type: 'expense',
    splitDetails: {
      totalAmount: 90,
      myPortion: 30,
      splitMethod: 'equal',
      shares: [{ personId: 'p1', amount: 60 }],
    },
  },
  { id: 'usd-current', date: '2026-05-08T10:00:00.000Z', amount: 200, currency: 'USD', categoryId: 'transport', accountId: 'acc-1', type: 'expense' },
  { id: 'transfer-current', date: '2026-05-09T10:00:00.000Z', amount: 500, currency: 'EUR', categoryId: 'internal-transfer', accountId: 'acc-1', type: 'expense' },
  { id: 'reimbursement-current', date: '2026-05-10T10:00:00.000Z', amount: 20, currency: 'EUR', categoryId: 'c8', accountId: 'acc-1', type: 'income' },
  { id: 'income-previous', date: '2026-04-03T10:00:00.000Z', amount: 900, currency: 'EUR', categoryId: 'salary', accountId: 'acc-1', type: 'income' },
  { id: 'food-previous', date: '2026-04-04T10:00:00.000Z', amount: 80, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense' },
  { id: 'fun-previous', date: '2026-04-05T10:00:00.000Z', amount: 50, currency: 'EUR', categoryId: 'fun', accountId: 'acc-1', type: 'expense' },
];

const recurringTransactions: RecurringTransaction[] = [
  { id: 'rent', name: 'Rent', amount: 70, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense', frequency: 'monthly', startDate: '2026-01-20', nextDue: '2026-05-20', isActive: true },
  { id: 'inactive', name: 'Inactive', amount: 999, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense', frequency: 'monthly', startDate: '2026-01-20', nextDue: '2026-05-21', isActive: false },
  { id: 'ended', name: 'Ended', amount: 999, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense', frequency: 'monthly', startDate: '2026-01-20', endDate: '2026-04-30', nextDue: '2026-05-22', isActive: true },
];

const now = new Date('2026-05-11T12:00:00.000Z');

const buildSummary = (period: 'month' | 'quarter' | 'year') => buildAnalyticsStudioSummary({
  transactions,
  categories,
  recurringTransactions,
  rates,
  baseCurrency: 'EUR',
  period,
  now,
});

describe('analytics selectors', () => {
  it('resolves month, quarter, and year periods with previous matching ranges', () => {
    const month = resolveAnalyticsPeriod('month', now);
    const quarter = resolveAnalyticsPeriod('quarter', now);
    const year = resolveAnalyticsPeriod('year', now);

    expect(month.currentKey).toBe('2026-05');
    expect(month.previousKey).toBe('2026-04');
    expect(month.elapsedDays).toBe(11);
    expect(month.totalDays).toBe(31);

    expect(quarter.currentKey).toBe('2026-Q2');
    expect(quarter.previousKey).toBe('2026-Q1');

    expect(year.currentKey).toBe('2026');
    expect(year.previousKey).toBe('2025');
  });

  it('computes month analytics studio summary', () => {
    const summary = buildSummary('month');

    expect(summary.totals.current.income).toBe(1000);
    expect(summary.totals.current.expense).toBe(252);
    expect(summary.totals.current.fees).toBe(2);
    expect(summary.totals.current.net).toBe(748);
    expect(summary.totals.current.savingsRate).toBe(74.8);
    expect(summary.totals.previous.expense).toBe(130);
    expect(summary.deltas.expense.absolute).toBe(122);
    expect(summary.categories[0]).toMatchObject({ categoryId: 'food', name: 'Food', amount: 150 });
    expect(summary.categories[1]).toMatchObject({ categoryId: 'transport', amount: 100 });
    expect(summary.anomalies.some(anomaly => (
      anomaly.kind === 'category-spike' && anomaly.categoryId === 'food'
    ))).toBe(true);
    expect(summary.anomalies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'category-spike',
        categoryId: 'food',
        categoryName: 'Food',
        amount: 70,
        percentage: 87.5,
      }),
    ]));
    expect(summary.forecast.recurringImpact).toBe(-70);
    expect(summary.forecast.recurringIncomeImpact).toBe(0);
    expect(summary.forecast.recurringExpenseImpact).toBe(70);
    expect(summary.forecast.confidence).toBe('normal');
    expect(summary.localSummary.periodLabel).toBe('May 2026');
    expect(summary.localSummary.status).toBe('positive');
    expect(summary.localSummary.facts[0]).toEqual({ key: 'income', value: 1000 });
  });

  it('computes quarter and year analytics studio summaries', () => {
    const quarter = buildSummary('quarter');
    const year = buildSummary('year');

    expect(quarter.period.currentKey).toBe('2026-Q2');
    expect(quarter.localSummary.periodLabel).toBe('2026-Q2');
    expect(quarter.totals.current.income).toBe(1900);
    expect(quarter.totals.current.expense).toBe(382);
    expect(quarter.categories[0]).toMatchObject({ categoryId: 'food', amount: 230 });

    expect(year.period.currentKey).toBe('2026');
    expect(year.localSummary.periodLabel).toBe('2026');
    expect(year.totals.current.net).toBe(1518);
    expect(year.forecast.confidence).toBe('normal');
  });

  it('counts non-transfer income fees in fee and expense totals only', () => {
    const summary = buildAnalyticsStudioSummary({
      transactions: [
        {
          id: 'income-with-fee',
          date: '2026-05-06T10:00:00.000Z',
          amount: 200,
          currency: 'EUR',
          categoryId: 'salary',
          accountId: 'acc-1',
          type: 'income',
          fees: 6,
        },
      ],
      categories,
      recurringTransactions: [],
      rates,
      baseCurrency: 'EUR',
      period: 'month',
      now,
    });

    expect(summary.totals.current.income).toBe(200);
    expect(summary.totals.current.fees).toBe(3);
    expect(summary.totals.current.expense).toBe(3);
    expect(summary.totals.current.net).toBe(197);
    expect(summary.categories).toEqual([]);
  });

  it('does not double-count fees already included in split expense portions', () => {
    const summary = buildAnalyticsStudioSummary({
      transactions: [
        {
          id: 'split-with-fee',
          date: '2026-05-06T10:00:00.000Z',
          amount: 90,
          currency: 'EUR',
          categoryId: 'food',
          accountId: 'acc-1',
          type: 'expense',
          fees: 20,
          splitDetails: {
            totalAmount: 100,
            myPortion: 50,
            splitMethod: 'equal',
            shares: [{ personId: 'p1', amount: 50, percentage: 50 }],
          },
        },
      ],
      categories,
      recurringTransactions: [],
      rates,
      baseCurrency: 'EUR',
      period: 'month',
      now,
    });

    expect(summary.totals.current.expense).toBe(50);
    expect(summary.totals.current.fees).toBe(5);
    expect(summary.totals.current.net).toBe(-50);
    expect(summary.totals.current.savingsRate).toBeNull();
    expect(summary.categories[0]).toMatchObject({ categoryId: 'food', amount: 45 });
  });

  it('calculates delta percentages against absolute previous values', () => {
    const summary = buildAnalyticsStudioSummary({
      transactions: [
        { id: 'current-income', date: '2026-05-06T10:00:00.000Z', amount: 50, currency: 'EUR', categoryId: 'salary', accountId: 'acc-1', type: 'income' },
        { id: 'previous-expense', date: '2026-04-06T10:00:00.000Z', amount: 100, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense' },
      ],
      categories,
      recurringTransactions: [],
      rates,
      baseCurrency: 'EUR',
      period: 'month',
      now,
    });

    expect(summary.totals.previous.net).toBe(-100);
    expect(summary.deltas.net).toEqual({ absolute: 150, percentage: 150, direction: 'up' });
  });

  it('keeps savings rate delta as no-comparison when either period has no income', () => {
    const currentNull = buildAnalyticsStudioSummary({
      transactions: [
        { id: 'current-expense', date: '2026-05-06T10:00:00.000Z', amount: 50, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense' },
        { id: 'previous-income', date: '2026-04-06T10:00:00.000Z', amount: 100, currency: 'EUR', categoryId: 'salary', accountId: 'acc-1', type: 'income' },
      ],
      categories,
      recurringTransactions: [],
      rates,
      baseCurrency: 'EUR',
      period: 'month',
      now,
    });
    const previousNull = buildAnalyticsStudioSummary({
      transactions: [
        { id: 'current-income', date: '2026-05-06T10:00:00.000Z', amount: 100, currency: 'EUR', categoryId: 'salary', accountId: 'acc-1', type: 'income' },
        { id: 'previous-expense', date: '2026-04-06T10:00:00.000Z', amount: 50, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense' },
      ],
      categories,
      recurringTransactions: [],
      rates,
      baseCurrency: 'EUR',
      period: 'month',
      now,
    });

    expect(currentNull.totals.current.savingsRate).toBeNull();
    expect(currentNull.deltas.savingsRate).toEqual({ absolute: 0, percentage: null, direction: 'flat' });
    expect(previousNull.totals.previous.savingsRate).toBeNull();
    expect(previousNull.deltas.savingsRate).toEqual({ absolute: 0, percentage: null, direction: 'flat' });
  });

  it('returns semantic anomalies without user-facing copy or raw transaction details', () => {
    const summary = buildAnalyticsStudioSummary({
      transactions: [
        { id: 'private-transaction-id', date: '2026-05-06T10:00:00.000Z', amount: 120, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense' },
      ],
      categories,
      recurringTransactions: [],
      rates,
      baseCurrency: 'EUR',
      period: 'month',
      now,
    });

    expect(summary.anomalies).toEqual([
      expect.objectContaining({
        id: 'large-transaction:private-transaction-id',
        kind: 'large-transaction',
        categoryId: 'food',
        categoryName: 'Food',
        amount: 120,
        percentage: 100,
      }),
    ]);
    expect(summary.anomalies[0]).not.toHaveProperty('title');
    expect(summary.anomalies[0]).not.toHaveProperty('detail');
  });

  it('does not count excluded fee-only income toward forecast confidence', () => {
    const summary = buildAnalyticsStudioSummary({
      transactions: [
        { id: 'expense-one', date: '2026-05-03T10:00:00.000Z', amount: 10, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense' },
        { id: 'expense-two', date: '2026-05-04T10:00:00.000Z', amount: 10, currency: 'EUR', categoryId: 'transport', accountId: 'acc-1', type: 'expense' },
        { id: 'reimbursement-fee', date: '2026-05-05T10:00:00.000Z', amount: 500, currency: 'EUR', categoryId: 'c8', accountId: 'acc-1', type: 'income', fees: 6 },
      ],
      categories,
      recurringTransactions: [],
      rates,
      baseCurrency: 'EUR',
      period: 'month',
      now,
    });

    expect(summary.totals.current.income).toBe(0);
    expect(summary.totals.current.fees).toBe(3);
    expect(summary.totals.current.expense).toBe(23);
    expect(summary.forecast.confidence).toBe('low');
  });

  it('does not create category-spike anomalies without a previous category baseline', () => {
    const summary = buildAnalyticsStudioSummary({
      transactions: [
        { id: 'new-category-current', date: '2026-05-03T10:00:00.000Z', amount: 120, currency: 'EUR', categoryId: 'fun', accountId: 'acc-1', type: 'expense' },
      ],
      categories,
      recurringTransactions: [],
      rates,
      baseCurrency: 'EUR',
      period: 'month',
      now,
    });

    expect(summary.categories[0]).toMatchObject({ categoryId: 'fun', previousAmount: 0, amount: 120 });
    expect(summary.anomalies.some(anomaly => anomaly.kind === 'category-spike')).toBe(false);
  });

  it('excludes inactive, ended, and out-of-period recurring items from forecasts', () => {
    const summary = buildAnalyticsStudioSummary({
      transactions,
      categories,
      recurringTransactions: [
        { id: 'active', name: 'Active', amount: 10, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense', frequency: 'monthly', startDate: '2026-01-01', nextDue: '2026-05-20', isActive: true },
        { id: 'inactive-edge', name: 'Inactive edge', amount: 999, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense', frequency: 'monthly', startDate: '2026-01-01', nextDue: '2026-05-20', isActive: false },
        { id: 'ended-edge', name: 'Ended edge', amount: 999, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense', frequency: 'monthly', startDate: '2026-01-01', endDate: '2026-05-11', nextDue: '2026-05-20', isActive: true },
        { id: 'after-period', name: 'After period', amount: 999, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense', frequency: 'monthly', startDate: '2026-01-01', nextDue: '2026-06-01', isActive: true },
        { id: 'before-period', name: 'Before period', amount: 999, currency: 'EUR', categoryId: 'food', accountId: 'acc-1', type: 'expense', frequency: 'yearly', startDate: '2026-01-01', nextDue: '2026-05-01', isActive: true },
      ],
      rates,
      baseCurrency: 'EUR',
      period: 'month',
      now,
    });

    expect(summary.forecast.recurringExpenseImpact).toBe(10);
    expect(summary.forecast.recurringImpact).toBe(-10);
  });

  it('forecasts all recurring occurrences through the year period end', () => {
    const summary = buildAnalyticsStudioSummary({
      transactions,
      categories,
      recurringTransactions: [
        {
          id: 'daily',
          name: 'Daily',
          amount: 1,
          currency: 'EUR',
          categoryId: 'food',
          accountId: 'acc-1',
          type: 'expense',
          frequency: 'daily',
          startDate: '2026-01-01',
          nextDue: '2026-05-12',
          isActive: true,
        },
        {
          id: 'weekly',
          name: 'Weekly',
          amount: 10,
          currency: 'EUR',
          categoryId: 'food',
          accountId: 'acc-1',
          type: 'expense',
          frequency: 'weekly',
          startDate: '2026-01-01',
          nextDue: '2026-05-12',
          isActive: true,
        },
        {
          id: 'biweekly',
          name: 'Biweekly',
          amount: 20,
          currency: 'EUR',
          categoryId: 'food',
          accountId: 'acc-1',
          type: 'expense',
          frequency: 'biweekly',
          startDate: '2026-01-01',
          nextDue: '2026-05-12',
          isActive: true,
        },
        {
          id: 'monthly',
          name: 'Monthly',
          amount: 30,
          currency: 'EUR',
          categoryId: 'food',
          accountId: 'acc-1',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2026-01-01',
          nextDue: '2026-05-12',
          isActive: true,
        },
        {
          id: 'yearly',
          name: 'Yearly',
          amount: 40,
          currency: 'EUR',
          categoryId: 'food',
          accountId: 'acc-1',
          type: 'expense',
          frequency: 'yearly',
          startDate: '2026-01-01',
          nextDue: '2026-05-12',
          isActive: true,
        },
        {
          id: 'weekly-ended',
          name: 'Weekly ended',
          amount: 10,
          currency: 'EUR',
          categoryId: 'food',
          accountId: 'acc-1',
          type: 'expense',
          frequency: 'weekly',
          startDate: '2026-01-01',
          endDate: '2026-06-02',
          nextDue: '2026-05-12',
          isActive: true,
        },
      ],
      rates,
      baseCurrency: 'EUR',
      period: 'year',
      now,
    });

    expect(summary.forecast.recurringExpenseImpact).toBe(1234);
    expect(summary.forecast.recurringIncomeImpact).toBe(0);
    expect(summary.forecast.recurringImpact).toBe(-1234);
  });
});
