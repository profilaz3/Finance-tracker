import { describe, expect, it } from 'vitest';
import {
  SETTLEMENT_CATEGORY,
  buildSettlementExpense,
  isSettlementExpense,
  netBalancesByCurrency,
  planBalances,
  planSettlement,
  simplifyDebts,
  spendingExpenses,
} from '../domain/settle';
import { buildSettlementDraft } from '../domain/people';
import type { Currency, EventDebt, ExchangeRates, Person, SharedExpense } from '../types';

let seq = 0;
const expense = (overrides: Partial<SharedExpense>): SharedExpense => ({
  id: `e${++seq}`,
  eventId: 'ev',
  name: 'Dinner',
  amount: 100,
  currency: 'EUR',
  paidBy: 'a',
  sharedWith: ['a', 'b'],
  date: '2026-11-01T00:00:00.000Z',
  ...overrides,
});

const rates: ExchangeRates = { base: 'EUR', date: '2026-11-01', rates: { EUR: 1, USD: 1, RSD: 100 } };

const balancesAfter = (expenses: SharedExpense[], currency: Currency) =>
  netBalancesByCurrency(expenses).get(currency) ?? new Map<string, number>();

const sumCents = (balances: Map<string, number>) => [...balances.values()].reduce((sum, cents) => sum + cents, 0);

let id = 0;
const createId = () => `s${++id}`;

/** Records every suggested payment and returns the expenses with the settlements added. */
const payAll = (expenses: SharedExpense[], debts: EventDebt[]) => [
  ...expenses,
  ...debts.map(debt => buildSettlementExpense({ createId, eventId: 'ev', debt, name: 'Settlement' })!),
];

describe('netBalancesByCurrency', () => {
  it('balances always sum to zero', () => {
    const expenses = [
      expense({ amount: 100, paidBy: 'a', sharedWith: ['a', 'b', 'c'] }),
      expense({ amount: 33.33, paidBy: 'b', sharedWith: ['a', 'b', 'c', 'd'] }),
      expense({ amount: 50, paidBy: 'c', sharedWith: ['a', 'd'], splitType: 'exact', splitDetails: { a: 20, d: 30 } }),
    ];
    expect(sumCents(balancesAfter(expenses, 'EUR'))).toBe(0);
  });
});

describe('simplifyDebts', () => {
  it('needs at most n - 1 payments and clears everyone', () => {
    const balances = new Map([['a', 6000], ['b', -1000], ['c', -2000], ['d', -3000]]);
    const debts = simplifyDebts(balances, 'EUR');
    expect(debts.length).toBeLessThanOrEqual(3);
    expect(debts).toEqual([
      { from: 'd', to: 'a', amount: 30, currency: 'EUR' },
      { from: 'c', to: 'a', amount: 20, currency: 'EUR' },
      { from: 'b', to: 'a', amount: 10, currency: 'EUR' },
    ]);
  });

  it('collapses a chain into a single payment', () => {
    // a lent b 10, b lent c 10: c pays a directly.
    const expenses = [
      expense({ amount: 10, paidBy: 'a', sharedWith: ['b'], splitType: 'exact', splitDetails: { b: 10 } }),
      expense({ amount: 10, paidBy: 'b', sharedWith: ['c'], splitType: 'exact', splitDetails: { c: 10 } }),
    ];
    expect(planSettlement(expenses)).toEqual([{ from: 'c', to: 'a', amount: 10, currency: 'EUR' }]);
  });

  it('settles RSD in whole dinars and ignores sub-dinar leftovers', () => {
    const debts = simplifyDebts(new Map([['a', 15060], ['b', -15040], ['c', -20]]), 'RSD');
    expect(debts).toEqual([{ from: 'b', to: 'a', amount: 150, currency: 'RSD' }]);
    expect(simplifyDebts(new Map([['a', 60], ['b', -60]]), 'RSD')).toEqual([]);
  });

  it('keeps cents for other currencies', () => {
    expect(simplifyDebts(new Map([['a', 1], ['b', -1]]), 'EUR')).toEqual([{ from: 'b', to: 'a', amount: 0.01, currency: 'EUR' }]);
  });
});

describe('planSettlement', () => {
  it('settles each currency separately without rates', () => {
    const expenses = [
      expense({ amount: 100, currency: 'EUR', paidBy: 'a', sharedWith: ['a', 'b'] }),
      expense({ amount: 1000, currency: 'RSD', paidBy: 'b', sharedWith: ['a', 'b'] }),
    ];
    expect(planSettlement(expenses)).toEqual([
      { from: 'b', to: 'a', amount: 50, currency: 'EUR' },
      { from: 'a', to: 'b', amount: 500, currency: 'RSD' },
    ]);
  });

  it('nets currencies into one when given a currency and rates', () => {
    const expenses = [
      expense({ amount: 100, currency: 'EUR', paidBy: 'a', sharedWith: ['a', 'b'] }),
      expense({ amount: 1000, currency: 'RSD', paidBy: 'b', sharedWith: ['a', 'b'] }),
    ];
    // b owes 50 EUR, a owes 500 RSD = 5 EUR: b pays 45 EUR.
    expect(planSettlement(expenses, { currency: 'EUR', rates })).toEqual([{ from: 'b', to: 'a', amount: 45, currency: 'EUR' }]);
  });

  it('is empty once every suggested payment is recorded', () => {
    const expenses = [
      expense({ amount: 120, paidBy: 'a', sharedWith: ['a', 'b', 'c'] }),
      expense({ amount: 45.5, paidBy: 'c', sharedWith: ['a', 'b', 'c'] }),
      expense({ amount: 3001, currency: 'RSD', paidBy: 'b', sharedWith: ['a', 'b', 'c'] }),
    ];
    const perCurrency = planSettlement(expenses);
    expect(perCurrency.length).toBeGreaterThan(0);
    expect(planSettlement(payAll(expenses, perCurrency))).toEqual([]);

    const netted = planSettlement(expenses, { currency: 'RSD', rates });
    expect(planSettlement(payAll(expenses, netted), { currency: 'RSD', rates })).toEqual([]);
  });

  it('a partial payment shrinks the debt without flipping it', () => {
    const expenses = [expense({ amount: 100, paidBy: 'a', sharedWith: ['a', 'b'] })];
    const [debt] = planSettlement(expenses);
    const partial = buildSettlementExpense({ createId, eventId: 'ev', debt, name: 'Settlement', amount: 20 })!;
    expect(planSettlement([...expenses, partial])).toEqual([{ from: 'b', to: 'a', amount: 30, currency: 'EUR' }]);
  });

  it('is a no-op for an already settled event', () => {
    expect(planSettlement([])).toEqual([]);
    expect(planSettlement([expense({ amount: 40, paidBy: 'a', sharedWith: ['a'] })])).toEqual([]);
  });
});

describe('settlement expenses', () => {
  it('are marked and kept out of spending', () => {
    const real = expense({});
    const settlement = buildSettlementExpense({
      createId,
      eventId: 'ev',
      debt: { from: 'b', to: 'a', amount: 50, currency: 'EUR' },
      name: 'Settlement',
      nowIso: '2026-11-02T00:00:00.000Z',
    })!;
    expect(settlement).toMatchObject({
      paidBy: 'b',
      sharedWith: ['a'],
      splitType: 'exact',
      splitDetails: { a: 50 },
      amount: 50,
      category: SETTLEMENT_CATEGORY,
      date: '2026-11-02T00:00:00.000Z',
    });
    expect(isSettlementExpense(settlement)).toBe(true);
    expect(isSettlementExpense(real)).toBe(false);
    expect(spendingExpenses([real, settlement])).toEqual([real]);
  });

  it('rejects empty or self payments', () => {
    const debt: EventDebt = { from: 'b', to: 'a', amount: 50, currency: 'EUR' };
    expect(buildSettlementExpense({ createId, eventId: 'ev', debt, name: 'S', amount: 0 })).toBeNull();
    expect(buildSettlementExpense({ createId, eventId: 'ev', debt: { ...debt, to: 'b' }, name: 'S' })).toBeNull();
  });
});

describe('person settlements', () => {
  const person = (balance: number): Person => ({
    id: 'p1',
    name: 'Alex',
    color: '#000',
    defaultCurrency: 'EUR',
    balances: { EUR: balance, USD: 0, RSD: 0 },
  });
  const draft = (balance: number, settleAmount?: number) => buildSettlementDraft({
    createId,
    person: person(balance),
    currency: 'EUR',
    categories: [],
    defaultAccountId: 'acc',
    settleAmount,
    nowIso: '2026-11-02T00:00:00.000Z',
  });

  it('records the full balance as one repayment', () => {
    const result = draft(40)!;
    expect(result.isPartial).toBe(false);
    expect(result.transaction).toMatchObject({ amount: 40, type: 'income', personId: 'p1' });
    expect(result.updatedPerson.balances.EUR).toBe(0);
  });

  it('records a partial repayment', () => {
    const result = draft(-40, 15)!;
    expect(result.isPartial).toBe(true);
    expect(result.transaction).toMatchObject({ amount: 15, type: 'expense' });
    expect(result.updatedPerson.balances.EUR).toBe(-25);
  });

  it('refuses amounts that are zero, negative or larger than the balance', () => {
    expect(draft(40, 0)).toBeNull();
    expect(draft(40, -5)).toBeNull();
    expect(draft(40, 40.01)).toBeNull();
    expect(draft(0)).toBeNull();
  });
});

describe('planBalances', () => {
  it('matches the plan exactly, so per-person totals and payments never differ by a unit', () => {
    // 1,000 RSD for three: equal shares are 333.33, so the payer is owed 666.67 on paper,
    // but the plan pays whole dinars (333 + 333). Per-person totals must show 666, not 667.
    const expenses = [expense({ amount: 1000, currency: 'RSD', paidBy: 'a', sharedWith: ['a', 'b', 'c'] })];
    const debts = planSettlement(expenses, { currency: 'RSD', rates });
    const balances = planBalances(debts);
    const paid = debts.filter(debt => debt.to === 'a').reduce((sum, debt) => sum + debt.amount, 0);
    expect(balances.get('a')).toBe(paid);
    expect(balances.get('a')).toBe(666);
    expect(balances.get('b')).toBe(-333);
    expect(balances.get('c')).toBe(-333);
  });

  it('nets several payments per person and leaves even people out', () => {
    const balances = planBalances([
      { from: 'b', to: 'a', amount: 10.1, currency: 'EUR' },
      { from: 'c', to: 'a', amount: 5.2, currency: 'EUR' },
      { from: 'c', to: 'd', amount: 1, currency: 'EUR' },
    ]);
    expect(balances.get('a')).toBe(15.3);
    expect(balances.get('c')).toBe(-6.2);
    expect(balances.has('e')).toBe(false);
    expect([...balances.values()].reduce((sum, value) => sum + Math.round(value * 100), 0)).toBe(0);
  });
});
