import { describe, expect, it } from 'vitest';
import {
  archiveList,
  buildLetterAggregates,
  hasEnoughForLetter,
  letterArchiveKey,
  letterMonthFor,
  monthId,
  nextAttempt,
  nextLetterReminderAt,
  parseLetterArchive,
  parseMonthId,
  pickSubscriptionToCheck,
  shouldAutoGenerate,
  toLetterFacts,
  withLetter,
  MAX_ARCHIVED_LETTERS,
  RETRY_AFTER_MS,
  type LetterInputs,
  type StoredLetter,
} from '../domain/monthlyLetter';
import { collectAllowedNumbers, ungroundedNumbers } from '../domain/letterGrounding';
import { normalizeMerchant } from '../domain/merchantMemory';
import { detectSubscriptions } from '../domain/subscriptions';
import type { Category, ExchangeRates, Transaction } from '../types';

const rates: ExchangeRates = { base: 'EUR', date: '2026-11-01', rates: { EUR: 1, USD: 1.1, RSD: 117 } };
const categories: Category[] = [
  { id: 'food', name: 'Groceries', type: 'expense', subcategories: [], color: '#2E9E6A' },
  { id: 'eat', name: 'Restaurants', type: 'expense', subcategories: [], color: '#E0662A' },
  { id: 'rent', name: 'Rent', type: 'expense', subcategories: [], color: '#6D5BD0' },
  { id: 'tech', name: 'Electronics', type: 'expense', subcategories: [], color: '#333' },
  { id: 'salary', name: 'Salary', type: 'income', subcategories: [], color: '#08784A' },
];

let seq = 0;
const tx = (date: string, amount: number, categoryId: string, note?: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`,
  date,
  amount,
  currency: 'EUR',
  categoryId,
  accountId: 'a',
  type: categoryId === 'salary' ? 'income' : 'expense',
  ...(note ? { note } : {}),
  ...extra,
});

const transactions: Transaction[] = [
  // August
  tx('2026-08-01', 500, 'rent'), tx('2026-08-03', 60, 'food', 'Maxi'), tx('2026-08-10', 40, 'food', 'Maxi'), tx('2026-08-25', 2000, 'salary'),
  // September
  tx('2026-09-01', 500, 'rent'), tx('2026-09-04', 80, 'food', 'Maxi'), tx('2026-09-12', 70, 'food', 'Maxi'),
  tx('2026-09-15', 30, 'eat', 'Pizzeria Napoli'), tx('2026-09-25', 2000, 'salary'),
  // October: restaurants up, one new laptop, a trip
  tx('2026-10-01', 500, 'rent'), tx('2026-10-05', 90, 'food', 'Maxi'), tx('2026-10-14', 60, 'food', 'Maxi'),
  tx('2026-10-09', 45, 'eat', 'Pizzeria Napoli'), tx('2026-10-17', 55, 'eat', 'Pizzeria Napoli'), tx('2026-10-21', 80, 'eat', 'Sushi Bar', { eventId: 'trip' }),
  tx('2026-10-20', 900, 'tech', 'Gigatron laptop'),
  tx('2026-10-25', 2100, 'salary'),
  // A transfer never counts.
  tx('2026-10-26', 300, 'internal-transfer', 'Transfer: savings'),
];

const state: LetterInputs = {
  transactions,
  categories,
  baseCurrency: 'EUR',
  rates: rates as unknown as LetterInputs['rates'],
  budget: { monthly: 1500, categoryLimits: { eat: 150, food: 300 } },
  events: [
    { id: 'trip', name: 'Bergamo', personIds: [], status: 'completed', startDate: '2026-10-19', endDate: '2026-10-22' },
    { id: 'old', name: 'Summer', personIds: [], status: 'completed', startDate: '2026-07-01', endDate: '2026-07-10' },
  ],
  recurringTransactions: [],
};

const october = { year: 2026, month: 9 };

describe('month helpers', () => {
  it('writes about the previous calendar month, across the year boundary', () => {
    expect(monthId(letterMonthFor(new Date(2026, 10, 1, 0, 5)))).toBe('2026-10');
    expect(monthId(letterMonthFor(new Date(2026, 10, 30, 23, 59)))).toBe('2026-10');
    expect(monthId(letterMonthFor(new Date(2027, 0, 1)))).toBe('2026-12');
    expect(parseMonthId('2026-12')).toEqual({ year: 2026, month: 11 });
    expect(parseMonthId('2026-13')).toBeNull();
    expect(parseMonthId('nope')).toBeNull();
  });

  it('schedules the reminder for 9:00 on the next 1st', () => {
    const at = nextLetterReminderAt(new Date(2026, 11, 31, 22, 0));
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours()]).toEqual([2027, 0, 1, 9]);
  });
});

describe('buildLetterAggregates', () => {
  const aggregates = buildLetterAggregates(state, october);

  it('totals the month exactly, without transfers', () => {
    expect(aggregates.month).toBe('2026-10');
    expect(aggregates.spent).toBe(500 + 90 + 60 + 45 + 55 + 80 + 900);
    expect(aggregates.income).toBe(2100);
    expect(aggregates.net).toBe(2100 - 1730);
    expect(aggregates.previousSpent).toBe(680);
    expect(aggregates.transactionCount).toBe(8);
    expect(hasEnoughForLetter(aggregates)).toBe(true);
  });

  it('compares with the previous month and the average of the months before', () => {
    expect(aggregates.spentChangePct).toBe(Math.round(((1730 - 680) / 680) * 100));
    // July had no entries, so the average covers August and September only.
    expect(aggregates.averageMonths).toBe(2);
    expect(aggregates.averageSpent).toBe((600 + 680) / 2);
    expect(aggregates.spentVsAveragePct).toBe(Math.round(((1730 - 640) / 640) * 100));
  });

  it('picks up to three movers from different categories, biggest swing first', () => {
    expect(aggregates.movers.length).toBeLessThanOrEqual(3);
    expect(aggregates.movers[0]).toMatchObject({ kind: 'category', name: 'Electronics', amount: 900, previous: 0, changePct: null });
    const categoriesSeen = aggregates.movers.map(mover => mover.name);
    expect(new Set(categoriesSeen).size).toBe(categoriesSeen.length);
    expect(aggregates.movers.some(mover => mover.name === 'Restaurants' || mover.name === 'Pizzeria Napoli')).toBe(true);
  });

  it('flags a large new purchase as a one-off but not a regular shop', () => {
    expect(aggregates.oneOffs).toEqual([{ name: 'Gigatron laptop', category: 'Electronics', amount: 900, date: '2026-10-20' }]);
  });

  it('reports the budget outcome and categories over their limit', () => {
    expect(aggregates.budget).toMatchObject({ limit: 1500, spent: 1730, difference: -230, categoriesWithin: 1 });
    expect(aggregates.budget?.categoriesOver).toEqual([{ name: 'Restaurants', limit: 150, spent: 180, over: 30 }]);
  });

  it('lists events of the month with their spending', () => {
    expect(aggregates.events).toEqual([{ name: 'Bergamo', spent: 80, count: 1, start: '2026-10-19', end: '2026-10-22' }]);
  });

  it('needs a few entries before a letter makes sense', () => {
    expect(hasEnoughForLetter(buildLetterAggregates(state, { year: 2026, month: 6 }))).toBe(false);
  });
});

describe('toLetterFacts', () => {
  const aggregates = buildLetterAggregates(state, october);

  it('formats every figure in the app language and keeps them groundable', () => {
    const en = toLetterFacts(aggregates, 'en');
    expect(en.month).toBe('October 2026');
    expect(en.spent).toBe('€1,730');
    expect(en.budget).toMatchObject({ result: 'over budget', by: '€230' });
    const allowed = collectAllowedNumbers(en);
    expect(ungroundedNumbers('You spent €1,730 in October 2026, 154% more than September.', allowed)).toEqual([]);
    expect(ungroundedNumbers('You spent €1,800.', allowed)).toEqual(['1,800']);

    const sr = toLetterFacts(aggregates, 'sr');
    expect(String(sr.month).toLowerCase()).toContain('oktobar');
    expect(String(sr.spent)).toMatch(/1\.730/);
    expect(ungroundedNumbers(`Potrošio si ${sr.spent}.`, collectAllowedNumbers(sr))).toEqual([]);
  });
});

describe('pickSubscriptionToCheck', () => {
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const streaming = months.map(month => tx(`${month}-05`, 9.99, 'eat', 'Streamly'));
  const gym = months.slice(2).map((month, index) => tx(`${month}-12`, index < 3 ? 30 : 36, 'eat', 'City Gym'));
  const withSubs = (extra: Transaction[]): LetterInputs => ({ ...state, transactions: [...transactions, ...extra] });

  it('prefers a price that went up this month', () => {
    const note = pickSubscriptionToCheck(withSubs([...streaming, ...gym]), october);
    expect(note).toMatchObject({ name: 'City Gym', amount: 36, cadence: 'monthly', priceRise: { from: 30, to: 36 } });
  });

  it('otherwise picks the longest-running one, with display names and dismissals', () => {
    const note = pickSubscriptionToCheck(withSubs(streaming), october, { names: { [normalizeMerchant('Streamly')]: 'Streamly Plus' } });
    expect(note).toMatchObject({ name: 'Streamly Plus', amount: 9.99, since: '2026-05-05', charges: 6 });
    expect(note?.priceRise).toBeUndefined();
    const facts = toLetterFacts(buildLetterAggregates(state, october, { subscription: note }), 'en');
    expect(facts.subscriptionToCheck).toMatchObject({ name: 'Streamly Plus', amount: '€9.99', billed: 'monthly', chargingSince: 'May 2026' });
    const id = detectSubscriptions(withSubs(streaming).transactions)[0].id;
    expect(pickSubscriptionToCheck(withSubs(streaming), october, { dismissed: [id] })).toBeNull();
  });

  it('ignores patterns that did not charge in the letter month', () => {
    expect(pickSubscriptionToCheck(withSubs(streaming.slice(0, 4)), october)).toBeNull();
  });
});

describe('letter archive', () => {
  const letter = (month: string): StoredLetter => ({
    month,
    language: 'en',
    title: `Letter ${month}`,
    sections: [{ heading: 'Hi', body: 'Body.' }],
    generatedAt: 1,
    stats: { currency: 'EUR', spent: 1, previousSpent: 1, spentChangePct: 0, income: 0, budgetLimit: null },
  });

  it('keys by user and workspace', () => {
    expect(letterArchiveKey('p', 'u1', null)).toBe('p:letters:u1:personal');
    expect(letterArchiveKey('p', 'u1', 'team-9')).toBe('p:letters:u1:team-9');
  });

  it('drops malformed entries and caps the archive, newest first', () => {
    const parsed = parseLetterArchive({ '2026-10': letter('2026-10'), '2026-09': { month: '2026-09' }, bad: letter('2026-08') });
    expect(Object.keys(parsed)).toEqual(['2026-10']);
    let archive = {};
    for (let index = 0; index < MAX_ARCHIVED_LETTERS + 3; index += 1) {
      archive = withLetter(archive, letter(monthId({ year: 2024, month: index })));
    }
    const list = archiveList(archive);
    expect(list).toHaveLength(MAX_ARCHIVED_LETTERS);
    expect(list[0].month > list[list.length - 1].month).toBe(true);
  });

  it('writes once per month, retrying failures with a back-off', () => {
    const now = new Date(2026, 10, 1, 9, 0);
    expect(shouldAutoGenerate(now, {}, null)).toBe(true);
    expect(shouldAutoGenerate(now, { '2026-10': letter('2026-10') }, null)).toBe(false);
    const first = nextAttempt(now, null);
    expect(first).toEqual({ month: '2026-10', count: 1, lastAt: now.getTime() });
    expect(shouldAutoGenerate(new Date(now.getTime() + 60_000), {}, first)).toBe(false);
    expect(shouldAutoGenerate(new Date(now.getTime() + RETRY_AFTER_MS), {}, first)).toBe(true);
    const third = nextAttempt(now, nextAttempt(now, first));
    expect(third.count).toBe(3);
    expect(shouldAutoGenerate(new Date(now.getTime() + RETRY_AFTER_MS * 2), {}, third)).toBe(false);
    // A new month starts over.
    expect(shouldAutoGenerate(new Date(2026, 11, 1), {}, third)).toBe(true);
  });
});
