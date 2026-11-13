import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false },
  registerPlugin: () => ({}),
}));

import { buildWidgetSnapshot } from '../utils/widgetBridge';
import type { AppState, Category, ExchangeRates, Transaction } from '../types';

const rates: ExchangeRates = { base: 'EUR', date: '2026-11-01', rates: { EUR: 1, USD: 1.1, RSD: 117 } };
const categories: Category[] = [
  { id: 'food', name: 'Groceries', type: 'expense', subcategories: [], color: '#2E9E6A' },
  { id: 'salary', name: 'Salary', type: 'income', subcategories: [], color: '#08784A' },
];
const tx = (id: string, date: string, amount: number, categoryId: string, type: Transaction['type'] = 'expense'): Transaction => ({
  id, date, amount, currency: 'EUR', categoryId, accountId: 'a', type,
});
const transactions: Transaction[] = [
  tx('1', '2026-11-02', 300, 'food'),
  tx('2', '2026-11-05', 150, 'food'),
  tx('3', '2026-11-01', 2000, 'salary', 'income'),
  tx('4', '2026-10-20', 999, 'food'),
];
const now = new Date(2026, 10, 13, 12);

const state = (overrides: Partial<AppState> = {}) => ({
  transactions,
  categories,
  baseCurrency: 'EUR' as const,
  rates,
  budget: null,
  language: 'en' as const,
  ...overrides,
});

describe('buildWidgetSnapshot', () => {
  it('shows spending and the budget left for this month only', () => {
    const snapshot = buildWidgetSnapshot(state({ budget: { monthly: 1000, categoryLimits: {} } }), now);
    expect(snapshot.signedIn).toBe(true);
    expect(snapshot.spent).toBe(450);
    expect(snapshot.budgetLeft).toBe(550);
    expect(snapshot.progress).toBe(0.45);
    expect(snapshot.overBudget).toBe(false);
    expect(snapshot.title).toBe('This month');
    expect(snapshot.secondaryLabel).toBe('Budget left');
    expect(snapshot.spentText).toMatch(/450/);
    expect(snapshot.secondaryText).toMatch(/550/);
    expect(snapshot.updatedAt).toBe(now.getTime());
  });

  it('flags spending over the budget and shows the overrun as a positive amount', () => {
    const snapshot = buildWidgetSnapshot(state({ budget: { monthly: 400, categoryLimits: {} } }), now);
    expect(snapshot.overBudget).toBe(true);
    expect(snapshot.budgetLeft).toBe(-50);
    expect(snapshot.secondaryLabel).toBe('Over budget');
    expect(snapshot.secondaryText).toMatch(/50/);
    expect(snapshot.secondaryText).not.toMatch(/-/);
    expect(snapshot.progress).toBeGreaterThan(1);
  });

  it('falls back to income without a monthly budget', () => {
    const snapshot = buildWidgetSnapshot(state({ budget: { monthly: 0, categoryLimits: { food: 100 } } }), now);
    expect(snapshot.progress).toBe(-1);
    expect(snapshot.budgetLeft).toBeNull();
    expect(snapshot.secondaryLabel).toBe('Income');
    expect(snapshot.income).toBe(2000);
  });

  it('uses the app language for labels', () => {
    const snapshot = buildWidgetSnapshot(state({ language: 'sr', budget: { monthly: 1000, categoryLimits: {} } }), now);
    expect(snapshot.title).toBe('Ovaj mesec');
    expect(snapshot.secondaryLabel).toBe('Ostalo u budžetu');
    expect(snapshot.addLabel).toBe('Dodaj trošak');
  });

  it('asks to sign in when signed out, without any amounts', () => {
    const snapshot = buildWidgetSnapshot(null, now);
    expect(snapshot.signedIn).toBe(false);
    expect(snapshot.spentText).toBe('');
    expect(snapshot.signInText).toBe('Open the app to sign in');
  });
});
