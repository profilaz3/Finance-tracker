import { describe, expect, it } from 'vitest';
import type { RecurringTransaction, Transaction } from '../types';
import {
  detectSubscriptions,
  priceIncreaseKey,
  recurringFromSubscription,
  subscriptionTotals,
} from '../domain/subscriptions';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const DAY = 86_400_000;

let seq = 0;
const tx = (note: string, date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${(seq += 1)}`,
  date: `${date}T10:00:00.000Z`,
  amount,
  currency: 'EUR',
  categoryId: 'subs',
  accountId: 'card',
  type: 'expense',
  note,
  ...extra,
});

/** Monthly charges on roughly the given day, drifting a little like real card charges do. */
const monthly = (note: string, months: string[], day: number, amounts: number | number[], drift = [0, 1, -1, 2, 0, -2, 1, 0, 3, -1, 0, 1]) =>
  months.map((month, i) => {
    const d = Math.min(28, Math.max(1, day + drift[i % drift.length]));
    const amount = Array.isArray(amounts) ? amounts[i] : amounts;
    return tx(note, `${month}-${String(d).padStart(2, '0')}`, amount);
  });

const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];

describe('detectSubscriptions cadence', () => {
  it('finds a monthly charge with day drift and different spellings', () => {
    const history = monthly('NETFLIX.COM 8821', MONTHS, 5, 12.99).map((t, i) => (i % 2 ? { ...t, note: 'Netflix' } : t));
    const [item] = detectSubscriptions(history, [], { now: NOW });
    expect(item).toBeDefined();
    expect(item.key).toBe('netfliks');
    expect(item.cadence).toBe('monthly');
    expect(item.count).toBe(8);
    expect(item.status).toBe('active');
    expect(item.nextDate).toBe('2026-12-05');
    expect(item.monthlyCost).toBeCloseTo(12.99, 2);
    expect(item.yearlyCost).toBeCloseTo(155.88, 2);
    expect(item.confidence).toBeGreaterThan(0.8);
    expect(item.priceIncrease).toBeUndefined();
  });

  it('tolerates one skipped month', () => {
    const history = monthly('Spotify', MONTHS.filter(m => m !== '2026-07'), 12, 10.99);
    const [item] = detectSubscriptions(history, [], { now: NOW });
    expect(item?.cadence).toBe('monthly');
    expect(item?.count).toBe(7);
  });

  it('finds a yearly charge from two payments', () => {
    const history = [tx('Namecheap domain renewal', '2025-03-02', 15), tx('NAMECHEAP.COM', '2026-03-04', 15)];
    const [item] = detectSubscriptions(history, [], { now: NOW });
    expect(item?.cadence).toBe('yearly');
    expect(item?.nextDate).toBe('2027-03-04');
    expect(item?.monthlyCost).toBeCloseTo(1.25, 2);
  });

  it('finds a weekly charge', () => {
    const history = Array.from({ length: 8 }, (_, i) => tx('Kids football club', new Date(NOW - (i * 7 + 2) * DAY).toISOString().slice(0, 10), 1500, { currency: 'RSD' }));
    const [item] = detectSubscriptions(history, [], { now: NOW });
    expect(item?.cadence).toBe('weekly');
    expect(item?.monthlyCost).toBeCloseTo(1500 * 4.348, 0);
  });

  it('rejects irregular spending at the same shop', () => {
    const history = ['2026-09-01', '2026-09-03', '2026-09-19', '2026-10-02', '2026-10-27', '2026-11-04'].map((d, i) =>
      tx('Maxi', d, [23.4, 8.1, 54.0, 12.9, 31.7, 9.99][i]),
    );
    expect(detectSubscriptions(history, [], { now: NOW })).toEqual([]);
  });

  it('rejects weekly shopping with varying amounts', () => {
    const amounts = [2350, 1890, 2410, 2350, 2600, 2280, 2350, 2050];
    const history = amounts.map((amount, i) => tx('Maxi', new Date(NOW - (i * 7 + 1) * DAY).toISOString().slice(0, 10), amount, { currency: 'RSD' }));
    expect(detectSubscriptions(history, [], { now: NOW })).toEqual([]);
  });

  it('rejects a café visited every few days even when some visits line up monthly', () => {
    // Newest visit 30 days after the one before, so the latest gap looks monthly.
    const history = [0, ...Array.from({ length: 50 }, (_, i) => 30 + i * 3)].map(days =>
      tx('Kafeterija', new Date(NOW - (days + 1) * DAY).toISOString().slice(0, 10), 250, { currency: 'RSD' }),
    );
    expect(detectSubscriptions(history, [], { now: NOW })).toEqual([]);
  });

  it('keeps a subscription with one extra purchase at the same merchant', () => {
    const history = [...monthly('Apple', MONTHS, 15, 2.99), tx('Apple', '2026-09-02', 2.99)];
    expect(detectSubscriptions(history, [], { now: NOW })[0]?.cadence).toBe('monthly');
  });

  it('rejects regular visits with very different amounts', () => {
    const history = monthly('Restoran Dva jelena', MONTHS, 10, [20, 85, 34, 120, 15, 60, 44, 99]);
    expect(detectSubscriptions(history, [], { now: NOW })).toEqual([]);
  });

  it('ignores transfers, income and recurring-generated charges', () => {
    const generated = monthly('Gym', MONTHS, 1, 30).map(t => ({ ...t, id: `rec:r1:${t.date.slice(0, 10)}` }));
    const income = monthly('Salary ACME', MONTHS, 1, 2000).map(t => ({ ...t, type: 'income' as const }));
    const transfers = monthly('Savings', MONTHS, 1, 100).map(t => ({ ...t, transferId: 'x' }));
    expect(detectSubscriptions([...generated, ...income, ...transfers], [], { now: NOW })).toEqual([]);
  });
});

describe('detectSubscriptions price changes and status', () => {
  it('reports a recent price increase against the stable earlier price', () => {
    const history = monthly('Netflix', MONTHS, 5, [11.99, 11.99, 11.99, 11.99, 11.99, 11.99, 13.49, 13.49]);
    const [item] = detectSubscriptions(history, [], { now: NOW });
    expect(item.priceIncrease).toMatchObject({ from: 11.99, to: 13.49, date: '2026-10-06' });
    expect(item.priceIncrease!.pct).toBeCloseTo(0.125, 3);
    expect(item.amount).toBe(13.49);
    expect(priceIncreaseKey(item)).toBe('netfliks|EUR@2026-10-06:13.49');
  });

  it('ignores small changes (rounding, a few cents)', () => {
    const history = monthly('Telenor', MONTHS, 20, [19.99, 19.99, 19.99, 19.99, 19.99, 19.99, 19.99, 20.19]);
    expect(detectSubscriptions(history, [], { now: NOW })[0]?.priceIncrease).toBeUndefined();
  });

  it('ignores an old increase', () => {
    const history = monthly('Netflix', MONTHS, 5, [9.99, 9.99, 12.99, 12.99, 12.99, 12.99, 12.99, 12.99]);
    expect(detectSubscriptions(history, [], { now: NOW })[0]?.priceIncrease).toBeUndefined();
  });

  it('marks a subscription that missed two cycles as stopped', () => {
    const history = monthly('HBO Max', ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'], 3, 7.99);
    const [item] = detectSubscriptions(history, [], { now: NOW });
    expect(item?.status).toBe('stopped');
    expect(item?.priceIncrease).toBeUndefined();
  });

  it('sorts active before stopped and totals only active', () => {
    const history = [
      ...monthly('HBO Max', ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06'], 3, 7.99),
      ...monthly('Spotify', MONTHS, 12, 10.99),
      ...monthly('Gym Fit', MONTHS, 1, 35),
    ];
    const items = detectSubscriptions(history, [], { now: NOW });
    expect(items.map(item => item.key)).toEqual(['gym fit', 'spotify', 'hbo maks']);
    const totals = subscriptionTotals(items, amount => amount);
    expect(totals.count).toBe(2);
    expect(totals.monthly).toBeCloseTo(45.99, 2);
  });
});

describe('detectSubscriptions exclusions', () => {
  const rule = (name: string, amount: number, extra: Partial<RecurringTransaction> = {}): RecurringTransaction => ({
    id: 'r1',
    name,
    amount,
    currency: 'EUR',
    categoryId: 'subs',
    accountId: 'card',
    type: 'expense',
    frequency: 'monthly',
    startDate: '2026-01-05',
    nextDue: '2026-12-05',
    isActive: true,
    ...extra,
  });

  it('skips charges already covered by a recurring rule', () => {
    const history = monthly('NETFLIX.COM', MONTHS, 5, 12.99);
    expect(detectSubscriptions(history, [rule('Netflix', 12.99)], { now: NOW })).toEqual([]);
  });

  it('keeps it when the rule is for a different amount or currency', () => {
    const history = monthly('Netflix', MONTHS, 5, 12.99);
    expect(detectSubscriptions(history, [rule('Netflix', 40)], { now: NOW })).toHaveLength(1);
    expect(detectSubscriptions(history, [rule('Netflix', 12.99, { currency: 'RSD' })], { now: NOW })).toHaveLength(1);
  });

  it('skips dismissed ids', () => {
    const history = monthly('Netflix', MONTHS, 5, 12.99);
    expect(detectSubscriptions(history, [], { now: NOW, dismissed: ['netfliks|EUR'] })).toEqual([]);
  });
});

describe('recurringFromSubscription', () => {
  it('builds a rule that starts at the next charge', () => {
    const [item] = detectSubscriptions(monthly('Spotify', MONTHS, 12, 10.99), [], { now: NOW });
    const draft = recurringFromSubscription(item, 'Spotify', () => 'new-id');
    expect(draft).toMatchObject({
      id: 'new-id',
      name: 'Spotify',
      amount: 10.99,
      currency: 'EUR',
      frequency: 'monthly',
      startDate: item.nextDate,
      nextDue: item.nextDate,
      isActive: true,
      type: 'expense',
    });
    // The new rule now covers the pattern.
    expect(detectSubscriptions(monthly('Spotify', MONTHS, 12, 10.99), [draft!], { now: NOW })).toEqual([]);
  });

  it('has no rule for quarterly charges', () => {
    const history = ['2026-02-10', '2026-05-11', '2026-08-10', '2026-11-09'].map(d => tx('Insurance Generali', d, 90));
    const [item] = detectSubscriptions(history, [], { now: NOW });
    expect(item?.cadence).toBe('quarterly');
    expect(recurringFromSubscription(item, 'Generali', () => 'x')).toBeUndefined();
  });
});
