import { describe, expect, it } from 'vitest';
import { openSince, personLedger, personStats } from '../domain/personLedger';
import { getEffectivePersonBalances } from '../domain/balances';
import { DEBT_REPAYMENT_CATEGORY_ID, LOAN_REPAYMENT_CATEGORY_ID } from '../domain/money';
import type { Currency, ExchangeRates, Person, Transaction } from '../types';

const rates: ExchangeRates = { base: 'EUR', date: '2026-11-01', rates: { EUR: 1, USD: 1, RSD: 100 } };

const person = (balances: Partial<Record<Currency, number>> = {}): Person => ({
  id: 'ana',
  name: 'Ana',
  color: '#EC4899',
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

const bill = (date: string, total: number, share: number, note: string): Transaction => tx({
  date,
  note,
  amount: total - share,
  splitDetails: { totalAmount: total, myPortion: total - share, splitMethod: 'equal', shares: [{ personId: 'ana', amount: share }] },
});

/** The person as the app shows them: stored offsets plus every entry's effect. */
const effective = (stored: Person, transactions: Transaction[]): Person => ({
  ...stored,
  balances: getEffectivePersonBalances(stored, transactions),
});

describe('personLedger', () => {
  const concert = bill('2026-10-24T18:00:00.000Z', 4000, 2000, 'Concert');
  const lunch = bill('2026-11-02T12:00:00.000Z', 4000, 2000, 'Lunch');
  const repaid = tx({ date: '2026-11-09T09:00:00.000Z', type: 'income', amount: 1500, personId: 'ana', categoryId: DEBT_REPAYMENT_CATEGORY_ID });
  const transactions = [lunch, repaid, concert, tx({ amount: 900, note: 'Groceries' })];
  const ana = effective(person(), transactions);

  it('lists what moved the balance, newest first, with the balance after each entry', () => {
    const ledger = personLedger(ana, transactions);
    expect(ana.balances.RSD).toBe(2500);
    expect(ledger.rows.map(row => [row.kind, row.delta, row.balance])).toEqual([
      ['repaid', -1500, 2500],
      ['share', 2000, 4000],
      ['share', 2000, 2000],
    ]);
    expect(ledger.offsets).toEqual([]);
  });

  it('says since when it is open and sums what was lent', () => {
    const ledger = personLedger(ana, transactions);
    expect(openSince(ledger, 'RSD', 2500)).toBe(concert.date);
    const stats = personStats(ledger, 'RSD', rates);
    expect(stats.lastRepayment?.transaction.id).toBe(repaid.id);
    expect(stats.bills.map(row => row.transaction.note)).toEqual(['Lunch', 'Concert']);
    expect(stats.lent).toBe(4000);
    expect(stats.lentSince).toBe(concert.date);
  });

  it('restarts "since" after the balance was settled', () => {
    const settled = tx({ date: '2026-11-03T09:00:00.000Z', type: 'income', amount: 4000, personId: 'ana', categoryId: DEBT_REPAYMENT_CATEGORY_ID });
    const later = bill('2026-11-05T12:00:00.000Z', 1000, 500, 'Coffee');
    const all = [concert, lunch, settled, later];
    const ledger = personLedger(effective(person(), all), all);
    expect(openSince(ledger, 'RSD', 500)).toBe(later.date);
  });

  it('keeps a balance with no entry behind it as its own line, without a date', () => {
    const stored = person({ RSD: 1000 });
    const ledger = personLedger(effective(stored, [concert]), [concert]);
    expect(ledger.offsets).toEqual([['RSD', 1000]]);
    expect(ledger.rows[0].balance).toBe(3000);
    expect(openSince(ledger, 'RSD', 3000)).toBeNull();
  });

  it('tells lending, borrowing and paying back apart', () => {
    const lent = tx({ amount: 30, currency: 'EUR', personId: 'ana', note: 'Taxi' });
    const borrowed = tx({ type: 'income', amount: 50, currency: 'EUR', personId: 'ana', note: 'Cash' });
    const paidBack = tx({ amount: 20, currency: 'EUR', personId: 'ana', categoryId: LOAN_REPAYMENT_CATEGORY_ID });
    const all = [lent, borrowed, paidBack];
    const ledger = personLedger(effective(person(), all), all);
    expect(Object.fromEntries(ledger.rows.map(row => [row.transaction.id, row.kind]))).toEqual({
      [lent.id]: 'lent',
      [borrowed.id]: 'borrowed',
      [paidBack.id]: 'paidBack',
    });
    // I owe them: −50 + 30 + 20 = 0 after everything.
    expect(openSince(ledger, 'EUR', 0)).toBeNull();
  });
});
