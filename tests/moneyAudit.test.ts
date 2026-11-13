import { describe, expect, it } from 'vitest';
import { INITIAL_CATEGORIES } from '../constants';
import { buildSettlementDraft } from '../domain/people';
import { buildAnalyticsStudioSummary } from '../utils/analyticsSelectors';
import { calculateTotalExpense, calculateTotalIncome } from '../utils/financialSelectors';
import { calculateIPaidSplitSubmission } from '../utils/splitExpenseCalculator';
import type { AppState, ExchangeRates, Person, Transaction } from '../types';

// Regression tests for the money-logic audit (inverted proof tests).

const rates: ExchangeRates = { base: 'EUR', date: '2026-01-01', rates: { EUR: 1, USD: 1, RSD: 117 } };

const stateWith = (transactions: Transaction[], baseCurrency: AppState['baseCurrency'] = 'EUR'): AppState => ({
  transactions,
  accounts: [],
  categories: INITIAL_CATEGORIES,
  people: [],
  events: [],
  sharedExpenses: [],
  templates: [],
  recurringTransactions: [],
  rates,
  baseCurrency,
  theme: 'graphite',
  language: 'en',
});

type SplitInput = Parameters<typeof calculateIPaidSplitSubmission>[0];

describe('H5 settle-up uses repayment categories', () => {
  it('records settlements as debt/loan repayments instead of Salary/Food', () => {
    const person: Person = { id: 'p', name: 'P', color: '', defaultCurrency: 'EUR', balances: { EUR: 50, USD: 0, RSD: -1000 } };
    const s1 = buildSettlementDraft({ createId: () => 'x', person, currency: 'EUR', categories: INITIAL_CATEGORIES, defaultAccountId: 'acc1' });
    const s2 = buildSettlementDraft({ createId: () => 'y', person, currency: 'RSD', categories: INITIAL_CATEGORIES, defaultAccountId: 'acc1' });

    expect(s1!.transaction).toMatchObject({ type: 'income', categoryId: 'debt-repayment' });
    expect(s2!.transaction).toMatchObject({ type: 'expense', categoryId: 'loan-repayment' });
  });

  it('excludes repayments from income and expense totals', () => {
    const transactions: Transaction[] = [
      { id: 'in', date: '2026-11-05T10:00:00.000Z', amount: 50, currency: 'EUR', categoryId: 'debt-repayment', accountId: 'a', type: 'income', personId: 'p' },
      { id: 'out', date: '2026-11-05T10:00:00.000Z', amount: 30, currency: 'EUR', categoryId: 'loan-repayment', accountId: 'a', type: 'expense', personId: 'p' },
    ];

    expect(calculateTotalIncome(stateWith(transactions))).toBe(0);
    expect(calculateTotalExpense(stateWith(transactions))).toBe(0);

    const studio = buildAnalyticsStudioSummary({
      transactions,
      categories: INITIAL_CATEGORIES,
      recurringTransactions: [],
      rates,
      baseCurrency: 'EUR',
      period: 'month',
      now: new Date('2026-11-13T12:00:00Z'),
    });
    expect(studio.totals.current.income).toBe(0);
    expect(studio.totals.current.expense).toBe(0);
  });
});

describe('M10 fees are counted once', () => {
  it('counts a split fee once on the dashboard and in analytics', () => {
    const r = calculateIPaidSplitSubmission({
      amount: '90', fees: '10', currency: 'USD', categoryId: 'c1', accountId: 'acc1', note: '',
      transactionDate: '2026-11-05T10:00:00.000Z', splitMethod: 'equal',
      shares: [{ personId: 'a', amount: 0, isIncluded: true }], rates, language: 'en',
    } as unknown as SplitInput);
    const tx = { ...r.transaction!, id: 't' } as Transaction;

    const total = calculateTotalExpense(stateWith([tx], 'USD'));
    const studio = buildAnalyticsStudioSummary({
      transactions: [tx], categories: INITIAL_CATEGORIES, recurringTransactions: [], rates,
      baseCurrency: 'USD', period: 'month', now: new Date('2026-11-13T12:00:00Z'),
    });

    expect(total).toBe(50);
    expect(studio.totals.current.expense).toBe(50);
  });
});
