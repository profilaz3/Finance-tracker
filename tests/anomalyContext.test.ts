import { describe, expect, it } from 'vitest';
import { anomalySignature, buildAnomalyContexts, samePlace, type AnomalyPeriod } from '../domain/anomalyContext';
import { normalizeMerchant } from '../domain/merchantMemory';
import { collectAllowedNumbers, ungroundedNumbers } from '../domain/letterGrounding';
import type { AnalyticsAnomaly } from '../utils/analyticsSelectors';
import type { Category, Event, ExchangeRates, RecurringTransaction, Transaction } from '../types';

const rates: ExchangeRates = { base: 'EUR', date: '2026-11-01', rates: { EUR: 1, USD: 1.1, RSD: 117 } } as ExchangeRates;
const categories: Category[] = [
  { id: 'eat', name: 'Restaurants', type: 'expense', subcategories: [], color: '#E0662A' },
  { id: 'tech', name: 'Electronics', type: 'expense', subcategories: [], color: '#333' },
  { id: 'subs', name: 'Subscriptions', type: 'expense', subcategories: [], color: '#555' },
];

let seq = 0;
const tx = (date: string, amount: number, categoryId: string, note: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`, date, amount, currency: 'EUR', categoryId, accountId: 'a', type: 'expense', note, ...extra,
});

const laptop = tx('2026-10-20', 900, 'tech', 'Gigatron');
const transactions: Transaction[] = [
  tx('2026-09-15', 30, 'eat', 'Pizzeria Napoli'),
  tx('2026-10-09', 45, 'eat', 'Pizzeria Napoli'),
  tx('2026-10-17', 55, 'eat', 'Pizzeria Napoli'),
  tx('2026-10-21', 80, 'eat', 'Sushi Bar', { eventId: 'trip' }),
  tx('2026-10-11', 12, 'subs', 'Netflix', { fees: 2, currency: 'USD' }),
  laptop,
];
const events: Event[] = [{ id: 'trip', name: 'Bergamo', personIds: [], status: 'completed', startDate: '2026-10-19', endDate: '2026-10-22' }];
const recurring: RecurringTransaction[] = [{
  id: 'r1', name: 'Netflix', amount: 12, currency: 'USD', categoryId: 'subs', accountId: 'a', type: 'expense',
  frequency: 'monthly', startDate: '2026-01-11', nextDue: '2026-11-11', isActive: true,
}];

const period: AnomalyPeriod = {
  currentStart: new Date(2026, 9, 1),
  currentEnd: new Date(2026, 9, 31, 23, 59, 59, 999),
  previousStart: new Date(2026, 8, 1),
  previousEnd: new Date(2026, 8, 30, 23, 59, 59, 999),
  currentKey: '2026-10',
};

const anomalies: AnalyticsAnomaly[] = [
  { id: 'category-spike:eat', kind: 'category-spike', categoryId: 'eat', categoryName: 'Restaurants', amount: 150, percentage: 500 },
  { id: `large-transaction:${laptop.id}`, kind: 'large-transaction', categoryId: 'tech', categoryName: 'Electronics', amount: 900, percentage: 82.4 },
  { id: 'high-fees', kind: 'high-fees', amount: 1.82, percentage: 3.1 },
];

const contexts = buildAnomalyContexts(anomalies, period, {
  transactions, categories, events, recurringTransactions: recurring, baseCurrency: 'EUR', rates, language: 'en',
});

type Facts = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('buildAnomalyContexts', () => {
  it('explains a category spike with merchants, purchases and overlapping events', () => {
    const spike = contexts[0].facts as Facts;
    expect(spike.category).toBe('Restaurants');
    expect(spike.increase).toBe('€150');
    expect(spike.purchasesThisPeriod).toBe(3);
    expect(spike.purchasesPreviousPeriod).toBe(1);
    // Ranked by growth: the new Sushi Bar (+80) before the usual pizzeria (+70).
    expect(spike.merchants[0]).toMatchObject({ name: 'Sushi Bar', thisPeriod: '€80.00', newThisPeriod: true });
    expect(spike.merchants[1]).toMatchObject({ name: 'Pizzeria Napoli', thisPeriod: '€100', previousPeriod: '€30.00', purchases: 2 });
    expect(spike.largestPurchases[0]).toMatchObject({ name: 'Sushi Bar', amount: '€80.00', event: 'Bergamo', newMerchant: true });
    expect(spike.events).toEqual([{ name: 'Bergamo', spentInCategory: '€80.00' }]);
  });

  it('describes a large single expense, flagged new and not recurring', () => {
    const large = contexts[1].facts as Facts;
    expect(large.amount).toBe('€900');
    expect(large.purchase).toMatchObject({ name: 'Gigatron', date: '20 October', recurring: false, newMerchant: true });
    expect(large.earlierPurchasesAtSamePlace).toBe(0);
    expect(large.eventsInPeriod).toEqual(['Bergamo']);
  });

  it('summarizes fees and other-currency payments', () => {
    const fees = contexts[2].facts as Facts;
    expect(fees.paymentsWithFees).toBe(1);
    expect(fees.paymentsInOtherCurrencies).toBe(1);
    expect(fees.largestFees[0]).toMatchObject({ name: 'Netflix', currency: 'USD' });
  });

  it('keeps every number in the context groundable', () => {
    const allowed = collectAllowedNumbers(contexts[0].facts);
    expect(ungroundedNumbers('Two dinners at Pizzeria Napoli (€100) and €80.00 at Sushi Bar during Bergamo.', allowed)).toEqual([]);
  });

  it('marks purchases that match a recurring rule', () => {
    const subs = buildAnomalyContexts(
      [{ id: 'category-spike:subs', kind: 'category-spike', categoryId: 'subs', categoryName: 'Subscriptions', amount: 60, percentage: 100 }],
      period,
      { transactions, categories, recurringTransactions: recurring, baseCurrency: 'EUR', rates, language: 'en' },
    )[0].facts as Facts;
    expect(subs.largestPurchases[0].recurring).toBe(true);
    expect(subs.recurringRulesInCategory).toBe(1);
  });
});

describe('anomalySignature', () => {
  it('is stable for small changes and changes with language, period or new anomalies', () => {
    const base = anomalySignature(anomalies, '2026-10', 'en');
    expect(anomalySignature(anomalies.map(a => (a.id === 'category-spike:eat' ? { ...a, amount: 151 } : a)), '2026-10', 'en')).toBe(base);
    expect(anomalySignature(anomalies, '2026-10', 'sr')).not.toBe(base);
    expect(anomalySignature(anomalies, '2026-09', 'en')).not.toBe(base);
    expect(anomalySignature(anomalies.slice(1), '2026-10', 'en')).not.toBe(base);
    expect(anomalySignature(anomalies.map(a => (a.id === 'category-spike:eat' ? { ...a, amount: 400 } : a)), '2026-10', 'en')).not.toBe(base);
  });
});

describe('samePlace', () => {
  it('matches the same shop under a different label, not unrelated shops', () => {
    expect(samePlace(normalizeMerchant('NETFLIX.COM 8821'), normalizeMerchant('Netflix'))).toBe(true);
    expect(samePlace(normalizeMerchant('MAXI DOO 042'), normalizeMerchant('Maxi'))).toBe(true);
    expect(samePlace(normalizeMerchant('Pizzeria Napoli'), normalizeMerchant('Sushi Bar'))).toBe(false);
    expect(samePlace('', 'x')).toBe(false);
  });
});
