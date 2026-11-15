import { describe, expect, it } from 'vitest';
import {
  computeBudgetProgress,
  computeMonthSummary,
  getRatePairs,
  getRecentTransactions,
  getUpcomingRecurring,
  shiftMonth,
  topCategories,
} from '../domain/home';
import {
  addBlock,
  DEFAULT_HOME_LAYOUT,
  moveBlock,
  normalizeBlock,
  removeBlock,
  resolveHomeLayout,
  styleForSize,
  updateBlock,
} from '../domain/homeLayout';
import { parseSettingsPrefs } from '../utils/settingsPrefs';
import { buildSettingsSyncPayload } from '../utils/settingsSync';
import type { Category, ExchangeRates, HomeBlock, RecurringTransaction, Transaction } from '../types';

const rates: ExchangeRates = { base: 'EUR', date: '2026-11-01', rates: { EUR: 1, USD: 1.1, RSD: 117 } };
const categories: Category[] = [
  { id: 'food', name: 'Groceries', type: 'expense', subcategories: [], color: '#2E9E6A' },
  { id: 'rent', name: 'Rent', type: 'expense', subcategories: [], color: '#6D5BD0' },
  { id: 'salary', name: 'Salary', type: 'income', subcategories: [], color: '#08784A' },
  { id: 'internal-transfer', name: 'Internal Transfer', type: 'income', subcategories: [], color: '#999' },
];

const tx = (id: string, date: string, amount: number, categoryId: string, type: Transaction['type'] = 'expense', currency: Transaction['currency'] = 'EUR'): Transaction => ({
  id, date, amount, currency, categoryId, accountId: 'a', type,
});

const transactions: Transaction[] = [
  tx('1', '2026-11-01', 450, 'rent'),
  tx('2', '2026-11-03T10:00:00', 30, 'food'),
  tx('3', '2026-11-03', 1170, 'food', 'expense', 'RSD'),
  tx('4', '2026-11-02', 2000, 'salary', 'income'),
  tx('5', '2026-10-30', 99, 'food'),
  tx('6', '2026-11-04', 100, 'internal-transfer', 'expense'),
];

const now = new Date(2026, 10, 13, 12);
const nov = { year: 2026, month: 10 };

describe('computeMonthSummary', () => {
  const summary = computeMonthSummary({ transactions, categories, baseCurrency: 'EUR', rates }, nov, now);

  it('counts only this month, converts currencies and skips transfers', () => {
    expect(summary.spent).toBe(490);
    expect(summary.income).toBe(2000);
    expect(summary.left).toBe(1510);
  });

  it('ranks categories and buckets days', () => {
    expect(summary.byCategory.map(entry => entry.categoryId)).toEqual(['rent', 'food']);
    expect(summary.byDay[0]).toBe(450);
    expect(summary.byDay[2]).toBe(40);
    expect(summary.byDay).toHaveLength(30);
  });

  it('places today in the month', () => {
    expect(summary.todayIndex).toBe(13);
    expect(summary.monthElapsed).toBeCloseTo(13 / 30);
    const past = computeMonthSummary({ transactions, categories, baseCurrency: 'EUR', rates }, shiftMonth(nov, -1), now);
    expect(past.todayIndex).toBe(31);
    expect(past.monthElapsed).toBe(1);
  });

  it('folds small categories into Other', () => {
    expect(topCategories(summary.byCategory, 1, 'Other')).toEqual([
      expect.objectContaining({ categoryId: '__other', amount: 490 }),
    ]);
  });
});

describe('computeBudgetProgress', () => {
  it('reports left, pace and per-category overspend', () => {
    const summary = computeMonthSummary({ transactions, categories, baseCurrency: 'EUR', rates }, nov, now);
    const progress = computeBudgetProgress({ monthly: 800, categoryLimits: { food: 25, rent: 500, gone: 10 } }, summary, categories);
    expect(progress.left).toBe(310);
    expect(progress.spentRatio).toBeCloseTo(490 / 800);
    expect(progress.aheadOfPace).toBe(true);
    expect(progress.categories).toHaveLength(2);
    expect(progress.categories[0]).toMatchObject({ categoryId: 'food', over: 15, left: 0 });
    expect(progress.categories[1]).toMatchObject({ categoryId: 'rent', over: 0, left: 50 });
  });
});

describe('upcoming and recent', () => {
  const recurring = (id: string, nextDue: string, isActive = true): RecurringTransaction => ({
    id, name: id, amount: 10, currency: 'EUR', categoryId: 'food', accountId: 'a', type: 'expense',
    frequency: 'monthly', startDate: '2026-01-01', nextDue, isActive,
  });

  it('lists active recurring entries due in the next 30 days, soonest first', () => {
    const list = getUpcomingRecurring([
      recurring('late', '2027-01-20'),
      recurring('b', '2026-11-25'),
      recurring('a', '2026-11-21'),
      recurring('off', '2026-11-22', false),
      recurring('past', '2026-11-01'),
    ], now);
    expect(list.map(item => item.recurring.id)).toEqual(['a', 'b']);
  });

  it('returns the newest transactions', () => {
    expect(getRecentTransactions(transactions, 2).map(item => item.id)).toEqual(['6', '2']);
  });
});

describe('home layout', () => {
  it('adds blocks with unique ids and default style', () => {
    const { layout, block } = addBlock(DEFAULT_HOME_LAYOUT, 'daily');
    expect(block).toEqual({ id: 'daily-1', type: 'daily', style: 'bars', size: 'm' });
    expect(layout).toHaveLength(DEFAULT_HOME_LAYOUT.length + 1);
  });

  it('removes, moves and updates blocks', () => {
    const layout: HomeBlock[] = [
      { id: 'networth-0', type: 'networth', style: 'card', size: 'm' },
      { id: 'budget-0', type: 'budget', style: 'ring', size: 's' },
      { id: 'daily-0', type: 'daily', style: 'week', size: 's' },
    ];
    const removed = removeBlock(layout, 'networth-0');
    expect(removed[0].id).toBe('budget-0');
    const moved = moveBlock(layout, 0, 2);
    expect(moved.map(block => block.id)).toEqual(['budget-0', 'daily-0', 'networth-0']);
    const updated = updateBlock(layout, 'budget-0', { style: 'categories', size: 's' });
    expect(updated[1]).toMatchObject({ style: 'categories', size: 'm' });
  });

  it('leaves the budget and net worth to the header by default, with S blocks in pairs', () => {
    expect(DEFAULT_HOME_LAYOUT.map(block => block.type)).not.toContain('budget');
    expect(DEFAULT_HOME_LAYOUT.map(block => block.type)).not.toContain('networth');
    expect(DEFAULT_HOME_LAYOUT.filter(block => block.size === 's').length % 2).toBe(0);
    expect(DEFAULT_HOME_LAYOUT.every(block => normalizeBlock(block)?.style === block.style)).toBe(true);
  });

  it('switches style when a size is picked that the style does not support', () => {
    expect(styleForSize('budget', 'categories', 's')).toBe('ring');
    expect(styleForSize('budget', 'categories', 'l')).toBe('categories');
    expect(styleForSize('budget', 'ring', 'm')).toBe('bar');
  });

  it('normalizes stored layouts', () => {
    expect(normalizeBlock({ id: 'x', type: 'rates', style: 'nope', size: 'l' })).toEqual({ id: 'x', type: 'rates', style: 'compact', size: 's' });
    expect(resolveHomeLayout(undefined)).toBe(DEFAULT_HOME_LAYOUT);
    expect(resolveHomeLayout([
      { id: 'a', type: 'recent', style: 'list', size: 'm' },
      { id: 'a', type: 'recent', style: 'list', size: 'm' },
    ])).toHaveLength(1);
  });
});

describe('settings prefs', () => {
  it('round-trips through the sync payload', () => {
    const payload = buildSettingsSyncPayload({
      baseCurrency: 'EUR', language: 'en', userProfile: undefined,
      appearance: { mode: 'dark', accent: 'iris', glass: 'clear' },
      homeLayout: [{ id: 'recent-0', type: 'recent', style: 'list', size: 'm' }],
      budget: { monthly: 1800, categoryLimits: { food: 400 } },
      paymentDetails: { account: '160000000123456729', name: 'Test Person', city: 'Niš' },
    });
    // Payment details travel as `prefs.payment` and come back as `paymentDetails`.
    const { payment, ...rest } = payload.prefs ?? {};
    expect(parseSettingsPrefs(JSON.parse(JSON.stringify(payload.prefs)))).toEqual({ ...rest, paymentDetails: payment });
  });

  it('clears payment details on null and ignores a malformed value', () => {
    expect(parseSettingsPrefs({ payment: null })).toEqual({ paymentDetails: null });
    expect(parseSettingsPrefs({ payment: { account: '123', name: 'x' } })).toEqual({});
  });

  it('keeps valid parts when another part is malformed, and honours a cleared budget', () => {
    expect(parseSettingsPrefs({ appearance: { mode: 'neon' }, budget: null, homeLayout: [] })).toEqual({ budget: null, homeLayout: [] });
    expect(parseSettingsPrefs('nope')).toEqual({});
    expect(parseSettingsPrefs({})).toEqual({});
  });
});

import { readableTextOn, squarify } from '../domain/treemap';

describe('squarify', () => {
  it('covers the whole area with one rect per positive value', () => {
    const rects = squarify([470, 330, 212, 120, 90, 0, 62], 300, 150);
    expect(rects).toHaveLength(6);
    const area = rects.reduce((sum, rect) => sum + rect.w * rect.h, 0);
    expect(area).toBeCloseTo(300 * 150, 3);
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(-1e-9);
      expect(rect.y).toBeGreaterThanOrEqual(-1e-9);
      expect(rect.x + rect.w).toBeLessThanOrEqual(300 + 1e-6);
      expect(rect.y + rect.h).toBeLessThanOrEqual(150 + 1e-6);
    }
    expect(rects.map(rect => rect.index)).not.toContain(5);
  });

  it('returns nothing for empty input', () => {
    expect(squarify([], 100, 100)).toEqual([]);
    expect(squarify([0, 0], 100, 100)).toEqual([]);
  });

  it('picks readable text colors', () => {
    expect(readableTextOn('#6D5BD0')).toBe('#FFFFFF');
    expect(readableTextOn('#F4D03F')).toBe('#141414');
    expect(readableTextOn('nope')).toBe('#FFFFFF');
  });
});

describe('rate pairs', () => {
  const rates = { RSD: 1, EUR: 0.0085, USD: 0.0094 };

  it('shows one of the stronger currency in the weaker one (1 EUR = 117.65 RSD, not 0.0085)', () => {
    const pairs = getRatePairs('RSD', rates);
    expect(pairs.map(pair => `${pair.from}/${pair.to}`)).toEqual(['EUR/RSD', 'USD/RSD', 'EUR/USD']);
    expect(pairs[0].value).toBeCloseTo(117.647, 3);
    expect(pairs[1].value).toBeCloseTo(106.383, 3);
    expect(pairs[2].value).toBeCloseTo(1.1059, 4);
    expect(pairs.every(pair => pair.value >= 1)).toBe(true);
  });

  it('keeps the same direction with a euro base', () => {
    const pairs = getRatePairs('EUR', { EUR: 1, USD: 1.1059, RSD: 117.647 });
    expect(pairs.map(pair => `${pair.from}/${pair.to}`)).toEqual(['EUR/USD', 'EUR/RSD', 'USD/RSD']);
    expect(pairs[1].value).toBeCloseTo(117.647, 3);
  });

  it('leaves a missing rate at zero instead of dividing by it', () => {
    expect(getRatePairs('RSD', { RSD: 1, EUR: 0, USD: 0.0094 })[0]).toEqual({ from: 'RSD', to: 'EUR', value: 0 });
  });
});
