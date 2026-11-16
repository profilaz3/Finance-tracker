import { describe, expect, it } from 'vitest';
import {
  categoryAverages,
  raiseSuggestion,
  ringSegments,
  roundLimitUp,
  unlimitedCategories,
  withCategoryLimit,
} from '../domain/budgetView';
import type { Category, ExchangeRates, Transaction } from '../types';

const rates: ExchangeRates = { base: 'EUR', date: '2026-11-01', rates: { EUR: 1, USD: 1, RSD: 100 } };
const now = new Date(2026, 10, 15, 18);

const categories: Category[] = [
  { id: 'food', name: 'Food', type: 'expense', color: '#f00', icon: 'utensils' },
  { id: 'transport', name: 'Transport', type: 'expense', color: '#00f', icon: 'car' },
  { id: 'salary', name: 'Salary', type: 'income', color: '#0f0', icon: 'wallet' },
] as Category[];

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

describe('ringSegments', () => {
  it('draws spending up to today plain and the rest as ahead', () => {
    expect(ringSegments(0.88, 0.5)).toEqual({ onPace: 0.5, ahead: 0.38, today: 0.5 });
  });

  it('has nothing ahead while spending is behind the calendar', () => {
    expect(ringSegments(0.3, 0.5)).toEqual({ onPace: 0.3, ahead: 0, today: 0.5 });
  });

  it('stops at a full ring when over the limit', () => {
    const segments = ringSegments(1.4, 0.6);
    expect(segments.onPace + segments.ahead).toBe(1);
  });
});

describe('roundLimitUp', () => {
  it('rounds up to a step of about half a percent', () => {
    expect(roundLimitUp(19213)).toBe(19500);
    expect(roundLimitUp(11723)).toBe(12000);
    expect(roundLimitUp(19500)).toBe(19500);
    expect(roundLimitUp(482)).toBe(485);
    expect(roundLimitUp(48.2)).toBe(49);
    expect(roundLimitUp(0)).toBe(0);
  });
});

describe('categoryAverages', () => {
  it('averages full months only, skipping months before the first entry', () => {
    const state = {
      transactions: [
        tx(new Date(2026, 8, 5, 12), 20000, { categoryId: 'transport' }),
        tx(new Date(2026, 9, 5, 12), 24000, { categoryId: 'transport' }),
        tx(new Date(2026, 9, 6, 12), 3000),
        // This month and income do not count.
        tx(new Date(2026, 10, 2, 12), 90000, { categoryId: 'transport' }),
        tx(new Date(2026, 9, 1, 12), 185000, { type: 'income', categoryId: 'salary' }),
      ],
      categories,
      baseCurrency: 'RSD' as const,
      rates,
    };
    const averages = categoryAverages(state, now);
    expect(averages.months).toBe(2);
    expect(averages.byCategory.get('transport')).toBe(22000);
    expect(averages.byCategory.get('food')).toBe(1500);
  });
});

describe('raiseSuggestion', () => {
  it('suggests a round limit above the usual month', () => {
    expect(raiseSuggestion(16000, { average: 19213, months: 3 })).toEqual({ limit: 19500, average: 19213, months: 3 });
  });

  it('suggests nothing when the usual month fits or there is no history', () => {
    expect(raiseSuggestion(20000, { average: 19213, months: 3 })).toBeUndefined();
    expect(raiseSuggestion(16000, { average: 0, months: 0 })).toBeUndefined();
    expect(raiseSuggestion(16000, undefined)).toBeUndefined();
  });
});

describe('unlimitedCategories', () => {
  const byCategory = [
    { categoryId: 'housing', name: 'Housing', color: '#0ff', amount: 61200 },
    { categoryId: 'food', name: 'Food', color: '#f00', amount: 39680 },
    { categoryId: 'health', name: 'Health', color: '#f0f', amount: 8705 },
    { categoryId: 'gone', name: 'Gone', color: '#999', amount: 500 },
  ];
  const allowed = new Set(['housing', 'food', 'health']);

  it('lists the biggest categories without a limit', () => {
    const budget = { monthly: 160000, categoryLimits: { food: 48000 } };
    expect(unlimitedCategories(byCategory, budget, allowed).map(entry => entry.categoryId)).toEqual(['housing', 'health']);
  });

  it('leaves out categories this workspace does not show', () => {
    const budget = { monthly: 0, categoryLimits: { housing: 1, food: 1, health: 1 } };
    expect(unlimitedCategories(byCategory, budget, allowed)).toEqual([]);
  });
});

describe('withCategoryLimit', () => {
  it('sets, replaces and removes one limit', () => {
    const budget = { monthly: 160000, categoryLimits: { food: 48000 } };
    expect(withCategoryLimit(budget, 'transport', 19500)).toEqual({ monthly: 160000, categoryLimits: { food: 48000, transport: 19500 } });
    expect(withCategoryLimit(budget, 'food', 0)).toEqual({ monthly: 160000, categoryLimits: {} });
    expect(withCategoryLimit(null, 'food', 5000)).toEqual({ monthly: 0, categoryLimits: { food: 5000 } });
    expect(budget.categoryLimits).toEqual({ food: 48000 });
  });
});
