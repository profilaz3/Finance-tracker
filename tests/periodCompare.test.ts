import { describe, expect, it } from 'vitest';
import { barsAverage, compareSameDays, spendingBars, spentBetween } from '../domain/periodCompare';
import { buildAnalyticsStudioSummary } from '../utils/analyticsSelectors';
import type { Event, ExchangeRates, Transaction } from '../types';

const rates: ExchangeRates = { base: 'EUR', date: '2026-11-01', rates: { EUR: 1, USD: 1, RSD: 100 } };
const now = new Date(2026, 10, 15, 18);

let seq = 0;
const tx = (date: Date, amount: number, overrides: Partial<Transaction> = {}): Transaction => ({
  id: `t${(seq += 1)}`,
  amount,
  currency: 'RSD',
  type: 'expense',
  categoryId: 'food',
  accountId: 'cash',
  date: date.toISOString(),
  ...overrides,
});

const kopaonik: Event = { id: 'kop', name: 'Kopaonik', personIds: [], status: 'completed' };

const transactions: Transaction[] = [
  tx(new Date(2026, 7, 10, 12), 9000),
  tx(new Date(2026, 8, 3, 12), 12000, { categoryId: 'transport', note: 'Taxi' }),
  tx(new Date(2026, 9, 2, 12), 3000, { note: 'Lunch' }),
  tx(new Date(2026, 9, 9, 12), 30000, { eventId: 'kop', categoryId: 'travel', note: 'Ski pass' }),
  // After the 15th: outside "the same days".
  tx(new Date(2026, 9, 20, 12), 50000, { categoryId: 'rent' }),
  tx(new Date(2026, 10, 3, 12), 5000, { note: 'Dinner out' }),
  tx(new Date(2026, 10, 4, 12), 2500, { note: 'Benu pharmacy', categoryId: 'health' }),
  tx(new Date(2026, 10, 6, 12), 800, { categoryId: 'internal-transfer' }),
  tx(new Date(2026, 10, 7, 12), 1000, { type: 'income', categoryId: 'salary' }),
];

describe('spendingBars', () => {
  it('lists the last four months, oldest first, with the current one so far', () => {
    const bars = spendingBars(transactions, 'month', now, 'RSD', rates);
    expect(bars.map(bar => [bar.start.getMonth(), bar.amount, bar.current])).toEqual([
      [7, 9000, false],
      [8, 12000, false],
      [9, 83000, false],
      [10, spentBetween(transactions, new Date(2026, 10, 1), new Date(2026, 10, 30, 23, 59, 59, 999), 'RSD', rates), true],
    ]);
    expect(barsAverage(bars)).toBeCloseTo((9000 + 12000 + 83000) / 3, 2);
  });

  it('counts spending the way the analytics totals do', () => {
    const bars = spendingBars(transactions, 'month', now, 'RSD', rates);
    const summary = buildAnalyticsStudioSummary({
      transactions, categories: [], recurringTransactions: [], rates, baseCurrency: 'RSD', period: 'month', now,
    });
    expect(bars[bars.length - 1].amount).toBe(summary.totals.current.expense);
  });

  it('drops empty periods at the start', () => {
    const bars = spendingBars([tx(new Date(2026, 9, 2, 12), 100)], 'month', now, 'RSD', rates);
    expect(bars.map(bar => bar.start.getMonth())).toEqual([9, 10]);
    expect(barsAverage(bars)).toBe(100);
    expect(barsAverage(spendingBars([], 'month', now, 'RSD', rates))).toBeNull();
  });

  it('steps by quarters and years', () => {
    expect(spendingBars(transactions, 'quarter', now, 'RSD', rates).map(bar => bar.start.getMonth())).toEqual([6, 9]);
    expect(spendingBars(transactions, 'year', now, 'RSD', rates).map(bar => bar.start.getFullYear())).toEqual([2026]);
  });
});

describe('compareSameDays', () => {
  const comparison = compareSameDays(transactions, [kopaonik], 'month', now, 'RSD', rates);

  it('compares 1 to 15 Nov with 1 to 15 Oct', () => {
    expect(comparison.start).toEqual(new Date(2026, 9, 1));
    expect(comparison.end.getMonth()).toBe(9);
    expect(comparison.end.getDate()).toBe(15);
    expect(comparison.before).toBe(33000);
    expect(comparison.now).toBe(7500);
  });

  it('groups event entries under the event and says what was behind each change', () => {
    expect(comparison.movers.map(mover => [mover.key, mover.delta, mover.notes])).toEqual([
      ['event:kop', -30000, ['Ski pass']],
      ['cat:health', 2500, ['Benu pharmacy']],
      ['cat:food', 2000, ['Dinner out']],
    ]);
    expect(comparison.movers[0]).toMatchObject({ kind: 'event', id: 'kop', now: 0, before: 30000 });
  });

  it('stops a longer month at the last day of the shorter one', () => {
    const end = compareSameDays([], [], 'month', new Date(2026, 2, 31, 9), 'RSD', rates).end;
    expect([end.getMonth(), end.getDate()]).toEqual([1, 28]);
  });
});
