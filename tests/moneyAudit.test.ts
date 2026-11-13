import { describe, expect, it } from 'vitest';
import { INITIAL_CATEGORIES } from '../constants';
import { calculateBalanceOffset, getEffectivePersonBalances, selectPeopleWithBalances } from '../domain/balances';
import { buildSettlementDraft } from '../domain/people';
import { buildAnalyticsStudioSummary } from '../utils/analyticsSelectors';
import { calculateTotalExpense, calculateTotalIncome } from '../utils/financialSelectors';
import { calculateIPaidSplitSubmission, recalculateSplitShares } from '../utils/splitExpenseCalculator';
import { getGroupKey, getMonthKey } from '../components/stats/types';
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

describe('M9 equal splits in integer cents', () => {
  const split = (amount: string) => {
    const r = calculateIPaidSplitSubmission({
      amount, fees: '', currency: 'EUR', categoryId: 'c1', accountId: 'acc1', note: '',
      transactionDate: '2026-01-01', splitMethod: 'equal',
      shares: ['a', 'b'].map(id => ({ personId: id, amount: 0, isIncluded: true })), rates, language: 'en',
    } as unknown as SplitInput);
    const details = r.transaction!.splitDetails!;
    const cents = Math.round(details.myPortion * 100) + details.shares.reduce((sum, s) => sum + Math.round(s.amount * 100), 0);
    return { details, cents };
  };

  it('sums exactly to the total and distributes the remainder', () => {
    const r1 = split('100');
    expect(r1.cents).toBe(10000);
    expect([r1.details.myPortion, ...r1.details.shares.map(s => s.amount)]).toEqual([33.34, 33.33, 33.33]);

    const r2 = split('100.01');
    expect(r2.cents).toBe(10001);
    expect([r2.details.myPortion, ...r2.details.shares.map(s => s.amount)]).toEqual([33.34, 33.34, 33.33]);
  });

  it('keeps the live preview (recalculateSplitShares) consistent with the submission', () => {
    const shares = recalculateSplitShares(
      ['a', 'b'].map(id => ({ personId: id, amount: 0, isIncluded: true })),
      'equal',
      100.01,
    );
    expect(shares.map(s => s.amount)).toEqual([33.34, 33.33]);
  });
});

describe('M8 split currency change', () => {
  it('reverses the old-currency shares and applies the new ones', () => {
    const old = {
      id: 't1', currency: 'EUR',
      splitDetails: { totalAmount: 100, myPortion: 50, splitMethod: 'equal', shares: [{ personId: 'a', amount: 50 }] },
    } as unknown as Transaction;
    const r = calculateIPaidSplitSubmission({
      amount: '11700', fees: '', currency: 'RSD', categoryId: 'c1', accountId: 'acc1', note: '',
      transactionDate: '2026-01-01', splitMethod: 'equal', shares: [{ personId: 'a', amount: 0, isIncluded: true }],
      rates, transaction: old, language: 'en',
    } as unknown as SplitInput);

    expect(r.balanceUpdates).toEqual(expect.arrayContaining([
      { personId: 'a', currency: 'EUR', delta: -50 },
      { personId: 'a', currency: 'RSD', delta: 5850 },
    ]));
    expect(r.balanceUpdates).toHaveLength(2);
  });
});

describe('H4 derived person balances', () => {
  const person: Person = { id: 'p', name: 'P', color: '', defaultCurrency: 'EUR', balances: { EUR: 5, USD: 0, RSD: 0 } };
  const transactions: Transaction[] = [
    { id: 'lend', date: '2026-11-01', amount: 40, currency: 'EUR', categoryId: 'c1', accountId: 'a', type: 'expense', personId: 'p' },
    { id: 'back', date: '2026-11-02', amount: 15.1, currency: 'EUR', categoryId: 'debt-repayment', accountId: 'a', type: 'income', personId: 'p' },
    {
      id: 'split', date: '2026-11-03', amount: 0.3, currency: 'USD', categoryId: 'c1', accountId: 'a', type: 'expense',
      splitDetails: { totalAmount: 0.3, myPortion: 0.1, splitMethod: 'equal', shares: [{ personId: 'p', amount: 0.1 }, { personId: 'q', amount: 0.1 }] },
    },
  ];

  it('adds transaction effects to the stored manual offsets', () => {
    const [withBalances] = selectPeopleWithBalances([person], transactions);
    expect(withBalances.balances).toEqual({ EUR: 29.9, USD: 0.1, RSD: 0 });
  });

  it('computes the offset needed for a manual balance correction', () => {
    expect(calculateBalanceOffset(person, transactions, 'EUR', 0)).toBe(-24.9);
    expect(getEffectivePersonBalances({ ...person, balances: { EUR: -24.9, USD: 0, RSD: 0 } }, transactions).EUR).toBe(0);
  });
});

describe('M11 analytics periods use local time', () => {
  it('counts a purchase at local 00:30 on the 1st in the new month', () => {
    const tx: Transaction = {
      id: 'early', date: new Date(2026, 10, 1, 0, 30).toISOString(), amount: 100, currency: 'EUR',
      categoryId: 'c1', accountId: 'a', type: 'expense',
    };
    const studio = buildAnalyticsStudioSummary({
      transactions: [tx], categories: INITIAL_CATEGORIES, recurringTransactions: [], rates,
      baseCurrency: 'EUR', period: 'month', now: new Date(2026, 10, 13, 12),
    });
    expect(studio.totals.current.expense).toBe(100);
    expect(studio.totals.previous.expense).toBe(0);
  });

  it('buckets chart months by local calendar month', () => {
    expect(getMonthKey(new Date(2026, 10, 1, 0, 30))).toBe('2026-11');
    expect(getGroupKey(new Date(2026, 10, 1, 0, 30).toISOString(), 'daily')).toBe('2026-11-01');
  });
});
