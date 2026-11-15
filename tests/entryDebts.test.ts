import { describe, expect, it } from 'vitest';
import { entryDebts } from '../domain/entryDebts';
import { getEffectivePersonBalances } from '../domain/balances';
import type { Currency, Person, Transaction } from '../types';

const person = (id: string, balances: Partial<Record<Currency, number>> = {}): Person => ({
  id,
  name: id,
  color: '#6366F1',
  defaultCurrency: 'RSD',
  balances: { EUR: 0, USD: 0, RSD: 0, ...balances },
});

let seq = 0;
const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: `t${(seq += 1)}`,
  amount: 0,
  currency: 'RSD',
  type: 'expense',
  categoryId: 'food',
  accountId: 'cash',
  date: '2026-11-01T12:00:00.000Z',
  ...overrides,
});

const split = (date: string, mine: number, shares: Record<string, number>, overrides: Partial<Transaction> = {}): Transaction => {
  const total = mine + Object.values(shares).reduce((sum, value) => sum + value, 0);
  return tx({
    date,
    amount: mine,
    splitDetails: {
      totalAmount: total,
      myPortion: mine,
      splitMethod: 'exact',
      shares: Object.entries(shares).map(([personId, amount]) => ({ personId, amount, isPaid: false })),
    },
    ...overrides,
  });
};

/** A repayment: they paid me back (income linked to the person). */
const repayment = (personId: string, amount: number, date = '2026-11-20T12:00:00.000Z', currency: Currency = 'RSD') =>
  tx({ type: 'income', personId, amount, date, currency, categoryId: 'repayment' });

describe('entryDebts', () => {
  const people = [person('alex'), person('sam')];

  it('shows every share as owed until someone pays back', () => {
    const pizza = split('2026-11-14T20:00:00.000Z', 1500, { alex: 1500, sam: 1500 });
    expect(entryDebts(pizza, [pizza], people)).toEqual([
      { personId: 'alex', amount: 1500, outstanding: 1500, state: 'owed' },
      { personId: 'sam', amount: 1500, outstanding: 1500, state: 'owed' },
    ]);
  });

  it('applies repayments to the oldest debt first', () => {
    const lunch = split('2026-11-02T12:00:00.000Z', 1000, { alex: 1000 });
    const pizza = split('2026-11-14T20:00:00.000Z', 1500, { alex: 1500, sam: 1500 });
    const all = [pizza, lunch, repayment('alex', 1200), repayment('sam', 1500)];

    expect(entryDebts(lunch, all, people)).toEqual([{ personId: 'alex', amount: 1000, outstanding: 0, state: 'paid' }]);
    expect(entryDebts(pizza, all, people)).toEqual([
      { personId: 'alex', amount: 1500, outstanding: 1300, state: 'partial' },
      { personId: 'sam', amount: 1500, outstanding: 0, state: 'paid' },
    ]);
  });

  it('counts a repayment made before the bill (they paid ahead)', () => {
    const pizza = split('2026-11-14T20:00:00.000Z', 1500, { alex: 1500 });
    expect(entryDebts(pizza, [repayment('alex', 2000, '2026-11-01T09:00:00.000Z'), pizza], people)[0]).toMatchObject({
      outstanding: 0,
      state: 'paid',
    });
  });

  it('ignores repayments in another currency', () => {
    const pizza = split('2026-11-14T20:00:00.000Z', 1500, { alex: 1500 });
    const all = [pizza, repayment('alex', 50, '2026-11-20T12:00:00.000Z', 'EUR')];
    expect(entryDebts(pizza, all, people)[0]).toMatchObject({ outstanding: 1500, state: 'owed' });
  });

  it('treats manual balances as credits or as the oldest debt', () => {
    const pizza = split('2026-11-14T20:00:00.000Z', 1500, { alex: 1500 });
    // They covered 600 for me earlier (stored as a negative offset): that pays part of this bill.
    expect(entryDebts(pizza, [pizza], [person('alex', { RSD: -600 })])[0]).toMatchObject({ outstanding: 900, state: 'partial' });
    // An old 1000 they owed before any entry is paid off first.
    const all = [pizza, repayment('alex', 1200)];
    expect(entryDebts(pizza, all, [person('alex', { RSD: 1000 })])[0]).toMatchObject({ outstanding: 1300, state: 'partial' });
  });

  it('covers an expense paid for one person', () => {
    const lent = tx({ type: 'expense', personId: 'alex', amount: 800, date: '2026-11-10T10:00:00.000Z' });
    expect(entryDebts(lent, [lent], people)).toEqual([{ personId: 'alex', amount: 800, outstanding: 800, state: 'owed' }]);
    expect(entryDebts(lent, [lent, repayment('alex', 800)], people)[0].state).toBe('paid');
  });

  it('never asks for more than the balance allows', () => {
    const a = split('2026-11-02T12:00:00.000Z', 100, { alex: 333.33 });
    const b = split('2026-11-05T12:00:00.000Z', 100, { alex: 333.33 });
    const c = split('2026-11-09T12:00:00.000Z', 100, { alex: 333.34 });
    const all = [a, b, c, repayment('alex', 500.01)];
    const open = [a, b, c].reduce((sum, entry) => sum + entryDebts(entry, all, people)[0].outstanding, 0);
    expect(Math.round(open * 100) / 100).toBe(getEffectivePersonBalances(people[0], all).RSD);
  });

  it('returns nothing for entries nobody owes on', () => {
    expect(entryDebts(tx({ amount: 500 }), [], people)).toEqual([]);
    expect(entryDebts(repayment('alex', 500), [], people)).toEqual([]);
  });
});
