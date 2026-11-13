import { describe, expect, it } from 'vitest';
import type { AppState, Category, Transaction } from '../types';
import {
  buildAnswerRequest,
  buildAskSchema,
  buildPlanRequest,
  executeQueryPlan,
  foldName,
  sanitizeResultTable,
  sanitizeSchema,
  validateAnswerReply,
  validateHistory,
  validatePlanReply,
  validateQueryPlan,
  weekKey,
  type QueryPlan,
} from '../domain/financeQuery';

// Rates are units per EUR, like the app's ExchangeRates.
const rates = { base: 'EUR' as const, date: '2026-11-12', rates: { EUR: 1, USD: 1.1, RSD: 117 } };

const categories: Category[] = [
  { id: 'food', name: 'Food', type: 'expense', subcategories: ['Groceries', 'Restaurants'], color: '#f00' },
  { id: 'travel', name: 'Travel', type: 'expense', subcategories: [], color: '#0f0' },
  { id: 'subs', name: 'Subscriptions', type: 'expense', subcategories: [], color: '#00f' },
  { id: 'salary', name: 'Salary', type: 'income', subcategories: [], color: '#0ff' },
  { id: 'internal-transfer', name: 'Transfer', type: 'expense', subcategories: [], color: '#999' },
];

let seq = 0;
const tx = (date: string, amount: number, categoryId: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: `tx-secret-${(seq += 1)}`,
  date: `${date}T12:00:00.000Z`,
  amount,
  currency: 'RSD',
  categoryId,
  accountId: 'cash',
  type: 'expense',
  ...extra,
});

const transactions: Transaction[] = [
  // Autumn 2025: food 3000 RSD
  tx('2025-09-10', 1000, 'food', { subcategory: 'Groceries' }),
  tx('2025-10-10', 2000, 'food', { subcategory: 'Restaurants' }),
  // Autumn 2026: food 4500 RSD + 10 EUR (1170 RSD)
  tx('2026-09-05', 1500, 'food', { subcategory: 'Groceries', note: 'Maxi 12' }),
  tx('2026-10-05', 3000, 'food', { subcategory: 'Groceries', note: 'Maxi Novi Sad' }),
  tx('2026-11-01', 10, 'food', { currency: 'EUR', accountId: 'bank', subcategory: 'Restaurants', note: 'Pizza Bar' }),
  // Netflix monthly for 4 months (repeating), Spotify twice (not repeating), both on Subscriptions
  tx('2026-07-03', 1200, 'subs', { note: 'Netflix' }),
  tx('2026-08-03', 1200, 'subs', { note: 'Netflix' }),
  tx('2026-09-03', 1200, 'subs', { note: 'Netflix' }),
  tx('2026-10-03', 1200, 'subs', { note: 'Netflix' }),
  tx('2026-09-07', 600, 'subs', { note: 'Spotify' }),
  tx('2026-10-07', 600, 'subs', { note: 'Spotify' }),
  // Income and a transfer that must not count
  tx('2026-10-01', 100000, 'salary', { type: 'income', note: 'Salary' }),
  tx('2026-10-02', 50000, 'internal-transfer', { transferId: 'tr1', note: 'Transfer: Cash to Bank' }),
  // Alex: I lent 20 EUR in June, he repaid 5 EUR in June, lent 10 EUR in July
  tx('2026-06-10', 20, 'food', { currency: 'EUR', personId: 'alex', note: 'Lunch for Alex' }),
  tx('2026-06-20', 5, 'salary', { currency: 'EUR', personId: 'alex', type: 'income', note: 'Alex paid back' }),
  tx('2026-07-10', 10, 'food', { currency: 'EUR', personId: 'alex', note: 'Cinema for Alex' }),
  // A personal expense linked to the Bergamo event
  tx('2026-10-21', 12, 'food', { currency: 'EUR', eventId: 'bergamo', note: 'Gelato' }),
];

const state = {
  transactions,
  categories,
  accounts: [
    { id: 'cash', name: 'Cash', type: 'cash', currency: 'RSD', color: '#000' },
    { id: 'bank', name: 'Bank', type: 'bank', currency: 'EUR', color: '#000' },
  ],
  people: [
    { id: 'alex', name: 'Alex', color: '#000', defaultCurrency: 'EUR', balances: { EUR: 2.5, USD: 0, RSD: 0 } },
    { id: 'sam', name: 'Sam', color: '#000', defaultCurrency: 'RSD', balances: { EUR: 0, USD: 0, RSD: -1170 } },
  ],
  userProfile: { id: 'me', name: 'Nenad', color: '#000', defaultCurrency: 'EUR', balances: { EUR: 0, USD: 0, RSD: 0 } },
  baseCurrency: 'RSD',
  rates,
  events: [
    { id: 'bergamo', name: 'Bergamo', personIds: ['me', 'alex'], status: 'completed', startDate: '2026-10-20T00:00:00Z', endDate: '2026-10-24T00:00:00Z' },
    { id: 'ski', name: 'Ski trip', personIds: ['me', 'sam'], status: 'active' },
  ],
  sharedExpenses: [
    { id: 'se1', eventId: 'bergamo', name: 'Pizza', amount: 36, currency: 'EUR', paidBy: 'me', sharedWith: ['me', 'alex'], date: '2026-10-21T19:00:00Z', category: 'Food' },
    { id: 'se2', eventId: 'bergamo', name: 'Hotel', amount: 180, currency: 'EUR', paidBy: 'alex', sharedWith: ['me', 'alex'], date: '2026-10-20T15:00:00Z', category: 'Lodging' },
    { id: 'se3', eventId: 'bergamo', name: 'Dinner', amount: 60, currency: 'EUR', paidBy: 'alex', sharedWith: ['me', 'alex'], splitType: 'exact', splitDetails: { me: 40, alex: 20 }, date: '2026-10-22T19:00:00Z', category: 'food' },
    { id: 'se4', eventId: 'bergamo', name: 'Settle', amount: 50, currency: 'EUR', paidBy: 'alex', sharedWith: ['me'], date: '2026-10-25T10:00:00Z', category: '__settlement__' },
    { id: 'se5', eventId: 'ski', name: 'Pass', amount: 100, currency: 'EUR', paidBy: 'sam', sharedWith: ['me', 'sam'], date: '2026-02-02T10:00:00Z', category: 'Fun' },
  ],
  recurringTransactions: [],
  teams: [],
} as unknown as AppState;

const plan = (overrides: Record<string, unknown>): QueryPlan => {
  const result = validateQueryPlan(overrides);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const run = (overrides: Record<string, unknown>) => executeQueryPlan(state, plan(overrides), { today: '2026-11-13' });

describe('validateQueryPlan', () => {
  it('fills defaults for a minimal plan', () => {
    expect(plan({})).toEqual({
      dataset: 'transactions', type: 'expense', metric: 'sum', groupBy: 'none', categories: [], accounts: [],
      people: [], events: [], recurring: false, share: 'mine', sort: 'desc', limit: 10,
    });
    expect(plan({ groupBy: 'month' }).sort).toBe('chrono');
  });

  it('accepts flat from/to and a nested range', () => {
    expect(plan({ from: '2026-01-01', to: '2026-03-31' }).range).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(plan({ range: { from: '2026-01-01', to: '2026-01-31' } }).range).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(plan({ from: '2026-05-01' }).range).toEqual({ from: '2026-05-01', to: '2100-12-31' });
  });

  it.each([
    [null],
    ['plan'],
    [[]],
    [{ dataset: 'sql' }],
    [{ metric: 'median' }],
    [{ groupBy: 'day' }],
    [{ type: 'transfer' }],
    [{ from: '2026-02-30', to: '2026-03-01' }],
    [{ from: '26-01-01', to: '2026-03-01' }],
    [{ from: '2026-05-01', to: '2026-04-01' }],
    [{ from: '1999-01-01', to: '2026-01-01' }],
    [{ compare: { from: '2025-01-01', to: '2025-02-01' } }],
    [{ compare: 'last year', from: '2026-01-01', to: '2026-01-31' }],
    [{ limit: 0 }],
    [{ limit: 21 }],
    [{ limit: 2.5 }],
    [{ limit: '5' }],
    [{ categories: 'Food' }],
    [{ categories: [1, 2] }],
    [{ categories: Array.from({ length: 11 }, (_, i) => `c${i}`) }],
    [{ recurring: 'yes' }],
    [{ sql: 'DROP TABLE transactions' }],
    [{ merchant: { name: 'x' } }],
  ])('rejects junk %j', (input) => {
    expect(validateQueryPlan(input).ok).toBe(false);
  });

  it('trims and dedupes names and bounds their length', () => {
    const value = plan({ categories: ['  Food ', 'food', 'x'.repeat(200)], merchant: 'Net`flix\n' });
    expect(value.categories).toEqual(['Food', 'x'.repeat(60)]);
    expect(value.merchant).toBe('Net flix');
  });
});

describe('validatePlanReply / validateHistory / validateAnswerReply', () => {
  it('accepts a plan or a clarifying question and rejects anything else', () => {
    const reply = validatePlanReply({ kind: 'plan', title: 'Food in Bergamo', plan: { dataset: 'eventExpenses', events: ['Bergamo'] } });
    expect(reply.ok && reply.value.kind === 'plan' && reply.value.plan.events).toEqual(['Bergamo']);
    expect(validatePlanReply({ kind: 'clarify', question: 'Which month?' })).toEqual({ ok: true, value: { kind: 'clarify', question: 'Which month?' } });
    expect(validatePlanReply({ kind: 'clarify', question: '   ' }).ok).toBe(false);
    expect(validatePlanReply({ kind: 'sql', plan: {} }).ok).toBe(false);
    expect(validatePlanReply({ kind: 'plan', plan: { dataset: 'everything' } }).ok).toBe(false);
  });

  it('keeps the last three valid turns only', () => {
    const turns = [1, 2, 3, 4, 5].map((n) => ({ question: `q${n}`, plan: { groupBy: n === 4 ? 'bogus' : 'category' } }));
    expect(validateHistory(turns).map((turn) => turn.question)).toEqual(['q3', 'q5']);
    expect(validateHistory('nope')).toEqual([]);
  });

  it('strips markdown and long dashes from answers and defaults the chart', () => {
    expect(validateAnswerReply({ answer: '**You spent** 1,000 RSD \u2014 nice', chart: 'pie' })).toEqual({ answer: 'You spent 1,000 RSD, nice', chart: 'none' });
    expect(validateAnswerReply({ answer: 'x'.repeat(5000), chart: 'bar' })?.answer).toHaveLength(1200);
    expect(validateAnswerReply({ answer: '' })).toBeNull();
    expect(validateAnswerReply('text')).toBeNull();
  });
});

describe('executeQueryPlan: transactions', () => {
  it('sums expenses in the base currency and skips transfers and income', () => {
    const result = run({ from: '2026-10-01', to: '2026-10-31' });
    // 3000 food + 1200 Netflix + 600 Spotify + 12 EUR gelato (1404 RSD)
    expect(result.table.total).toBe(3000 + 1200 + 600 + 1404);
    expect(result.table.count).toBe(4);
    expect(result.table.currency).toBe('RSD');
  });

  it('converts foreign currency with the app rates', () => {
    const result = run({ from: '2026-11-01', to: '2026-11-30', categories: ['Food'] });
    expect(result.table.total).toBe(1170);
  });

  it('groups by category with a limit and folds the rest', () => {
    const result = run({ from: '2026-09-01', to: '2026-11-30', groupBy: 'category', limit: 1 });
    expect(result.table.rows).toEqual([{ label: 'Food', value: 1500 + 3000 + 1170 + 1404, count: 4 }]);
    expect(result.table.other).toEqual({ groups: 1, value: 1200 * 2 + 600 * 2, count: 4 });
  });

  it('compares two periods and reports the change', () => {
    const result = run({ categories: ['food'], from: '2026-09-01', to: '2026-11-30', compare: { from: '2025-09-01', to: '2025-11-30' } });
    expect(result.table.total).toBe(1500 + 3000 + 1170 + 1404);
    expect(result.table.compareTotal).toBe(3000);
    expect(result.table.changePct).toBe(135.8);
    expect(result.explain.compareMatched).toBe(2);
  });

  it('gives per-group comparison values for keyed groupings', () => {
    const result = run({ groupBy: 'category', from: '2026-09-01', to: '2026-11-30', compare: { from: '2025-09-01', to: '2025-11-30' } });
    expect(result.table.rows.find((row) => row.label === 'Food')?.compareValue).toBe(3000);
    expect(result.table.rows.find((row) => row.label === 'Subscriptions')?.compareValue).toBe(0);
  });

  it('zero-fills a monthly series and reports the per-month average', () => {
    const result = run({ groupBy: 'month', categories: ['Subscriptions'], from: '2026-07-01', to: '2026-12-31' });
    expect(result.table.rows.map((row) => [row.label, row.value])).toEqual([
      ['2026-07', 1200], ['2026-08', 1200], ['2026-09', 1800], ['2026-10', 1800], ['2026-11', 0],
    ]);
    expect(result.table.perPeriodAverage).toBe(1200);
  });

  it('groups by ISO week starting Monday', () => {
    expect(weekKey('2026-11-13')).toBe('2026-11-09');
    expect(weekKey('2026-11-09')).toBe('2026-11-09');
    expect(weekKey('2026-11-08')).toBe('2026-11-02');
  });

  it('matches subcategories, accents and merchants', () => {
    expect(run({ categories: ['groceries'] }).table.total).toBe(1000 + 1500 + 3000);
    expect(foldName('Hrana Đak ČŠ')).toBe('hrana djak cs');
    expect(run({ merchant: 'maxi' }).table.count).toBe(2);
  });

  it('keeps only repeating merchants for subscriptions', () => {
    const result = run({ recurring: true, groupBy: 'merchant', from: '2026-01-01', to: '2026-11-13' });
    expect(result.table.rows).toEqual([{ label: 'Netflix', value: 4800, count: 4 }]);
  });

  it('computes avg and count metrics', () => {
    expect(run({ categories: ['Subscriptions'], metric: 'count' }).table.total).toBe(6);
    expect(run({ categories: ['Subscriptions'], metric: 'avg' }).table.total).toBe(1000);
  });

  it('filters by person and income type', () => {
    expect(run({ people: ['alex'] }).table.total).toBe(30 * 117);
    expect(run({ type: 'income', from: '2026-10-01', to: '2026-10-31' }).table.total).toBe(100000);
    expect(run({ type: 'net', from: '2026-10-01', to: '2026-10-31' }).table.total).toBe(100000 - (3000 + 1200 + 600 + 1404));
  });

  it('reports names that matched nothing', () => {
    const result = run({ categories: ['Yachts'], people: ['Zoran'] });
    expect(result.table.unresolved).toEqual(['Yachts', 'Zoran']);
    expect(result.table.total).toBe(0);
  });
});

describe('executeQueryPlan: events', () => {
  it('sums my share of event spending, without settlements, including linked transactions', () => {
    const result = run({ dataset: 'eventExpenses', events: ['bergamo'] });
    // Pizza 36/2 + Hotel 180/2 + Dinner exact 40 + Gelato 12 = 160 EUR
    expect(result.table.total).toBe(160 * 117);
    expect(result.table.share).toBe('mine');
  });

  it('filters event spending by category name, case-insensitively', () => {
    const result = run({ dataset: 'eventExpenses', events: ['Bergamo'], categories: ['Food'] });
    // Pizza 18 + Dinner 40 + Gelato 12 = 70 EUR
    expect(result.table.total).toBe(70 * 117);
  });

  it('can report the whole group total and who paid', () => {
    const result = run({ dataset: 'eventExpenses', events: ['Bergamo'], share: 'total', groupBy: 'person' });
    expect(result.table.total).toBe((36 + 180 + 60 + 12) * 117);
    expect(result.table.rows).toEqual([
      { label: 'Alex', value: 240 * 117, count: 2 },
      { label: 'Nenad', value: 48 * 117, count: 2 },
    ]);
  });

  it('filters events by participant', () => {
    expect(run({ dataset: 'eventExpenses', people: ['Sam'] }).table.total).toBe(50 * 117);
  });
});

describe('executeQueryPlan: balances', () => {
  it('reports the balance at the end of a period plus movements inside it', () => {
    const result = run({ dataset: 'balances', people: ['Alex'], from: '2026-06-01', to: '2026-06-30' });
    // Offset 2.5 EUR + lent 20 - repaid 5 = 17.5 EUR by June 30 (July loan excluded)
    expect(result.table.rows).toEqual([{ label: 'Alex', value: 17.5 * 117, count: 2, lent: 20 * 117, repaid: 5 * 117 }]);
  });

  it('lists everyone with a balance today', () => {
    const result = run({ dataset: 'balances' });
    expect(result.table.rows.map((row) => [row.label, row.value])).toEqual([['Alex', 27.5 * 117], ['Sam', -1170]]);
  });
});

describe('payloads sent to the model', () => {
  // Repeat shops (Netflix, Spotify, Maxi) may be sent for matching; ids, dates and one-off notes never.
  const secrets = [
    ...transactions.map((item) => item.id),
    ...transactions.map((item) => item.date),
    'Lunch for Alex', 'Cinema for Alex', 'Alex paid back', 'Gelato', 'Pizza Bar',
  ];

  it('never contains transaction ids, private notes, dates or raw amounts', () => {
    const schema = buildAskSchema(state, 'en', '2026-11-13');
    const planBody = JSON.stringify(buildPlanRequest('How much on food?', schema, []));
    const execution = run({ groupBy: 'category', from: '2026-01-01', to: '2026-11-13' });
    const answerBody = JSON.stringify(buildAnswerRequest('How much on food?', 'Food', 'en', 't', execution.table));
    for (const body of [planBody, answerBody]) {
      for (const secret of secrets) expect(body).not.toContain(secret);
      expect(body).not.toContain('"amount"');
      expect(body).not.toContain('"transactions":');
    }
  });

  it('schema carries names only and is accepted by the server sanitizer', () => {
    const schema = buildAskSchema(state, 'sr', '2026-11-13');
    expect(Object.keys(schema).sort()).toEqual(['accounts', 'categories', 'currency', 'events', 'language', 'merchants', 'people', 'teams', 'today']);
    expect(schema.people).toEqual(['Alex', 'Sam']);
    expect(schema.events[0]).toEqual({ name: 'Bergamo', from: '2026-10-20', to: '2026-10-24' });
    expect(sanitizeSchema(JSON.parse(JSON.stringify(schema)))).toEqual(schema);
  });

  it('history carries questions and plans, not answers or numbers', () => {
    const turn = { question: 'Food?', plan: plan({ categories: ['Food'] }), answer: 'You spent 5,000 RSD', table: { total: 5000 } };
    const body = buildPlanRequest('And in July?', buildAskSchema(state, 'en'), [turn, turn, turn, turn]);
    expect(body.history).toHaveLength(3);
    expect(JSON.stringify(body.history)).not.toContain('5,000');
    expect(JSON.stringify(body.history)).not.toContain('5000');
  });

  it('the result sanitizer drops unknown fields and rejects oversized or malformed tables', () => {
    const table = run({ groupBy: 'category' }).table;
    const tampered = { ...table, transactions, rows: table.rows.map((row) => ({ ...row, note: 'secret' })) };
    const sanitized = sanitizeResultTable(tampered);
    expect(sanitized.ok && JSON.stringify(sanitized.value)).not.toContain('secret');
    expect(sanitized.ok && 'transactions' in sanitized.value).toBe(false);
    expect(sanitizeResultTable({ ...table, rows: Array.from({ length: 31 }, () => ({ label: 'x', value: 1, count: 1 })) }).ok).toBe(false);
    expect(sanitizeResultTable({ ...table, total: Number.NaN }).ok).toBe(false);
    expect(sanitizeResultTable({ ...table, currency: 'rsd; drop' }).ok).toBe(false);
  });
});
