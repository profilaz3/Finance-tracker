import { describe, expect, it } from 'vitest';
import type { AppState, Event, Person } from '../types';
import { debtTotals, eventDayOf, eventMoney, personBalanceLines } from '../components/shared/sharedSummary';
import { namesList } from '../components/shared/DebtHeroTotals';
import { calculateDashboardDebtSummary } from '../utils/dashboardSummarySelectors';

process.env.TZ = 'Europe/Belgrade';

const rates = { base: 'EUR' as const, date: '2026-11-15', rates: { EUR: 1, USD: 1.25, RSD: 117 } };

const person = (id: string, name: string, balances: Partial<Person['balances']> = {}): Person => ({
  id,
  name,
  color: '#123456',
  defaultCurrency: 'RSD',
  balances: { EUR: 0, USD: 0, RSD: 0, ...balances },
});

const people = [
  person('me', 'Nina', { RSD: 999 }),
  person('ana', 'Ana', { RSD: 2340, EUR: 20 }),
  person('jelena', 'Jelena', { RSD: 1800 }),
  person('marko', 'Marko', { EUR: -30 }),
  person('luka', 'Luka'),
  person('mix', 'Mila', { EUR: 10, RSD: -2340 }),
];

describe('person balance lines', () => {
  const lines = personBalanceLines(people, 'me', 'EUR', rates);

  it('leaves yourself out and keeps the biggest balance first, in its own currency', () => {
    expect(lines.map(line => line.person.id)).toEqual(['ana', 'jelena', 'marko', 'luka', 'mix']);
    expect(lines[0].balances).toEqual([['EUR', 20], ['RSD', 2340]]);
    expect(lines[0].net).toBeCloseTo(40);
    expect(lines.find(line => line.person.id === 'luka')?.balances).toEqual([]);
  });

  it('nets mixed balances in the base currency', () => {
    const mila = lines.find(line => line.person.id === 'mix')!;
    expect(mila.balances).toEqual([['RSD', -2340], ['EUR', 10]]);
    expect(mila.net).toBeCloseTo(-10);
  });

  it('adds up both sides separately, so someone can be on both', () => {
    const totals = debtTotals(lines, 'EUR', rates);
    expect(totals.owed).toBeCloseTo(40 + 1800 / 117 + 10);
    expect(totals.owe).toBeCloseTo(30 + 20);
    expect(totals.owedBy.map(p => p.id)).toEqual(['ana', 'jelena', 'mix']);
    expect(totals.owing.map(p => p.id)).toEqual(['marko', 'mix']);
  });

  it('matches the owed number on Home', () => {
    const others = people.filter(p => p.id !== 'me');
    const home = calculateDashboardDebtSummary({ people: others, baseCurrency: 'EUR', rates: rates.rates });
    const totals = debtTotals(personBalanceLines(others, undefined, 'EUR', rates), 'EUR', rates);
    expect(totals.owed).toBeCloseTo(home.totalOwedToMe, 2);
    expect(totals.owe).toBeCloseTo(home.totalIOwe, 2);
  });
});

describe('names list', () => {
  const named = (...names: string[]) => names.map((name, index) => person(`p${index}`, name));

  it('joins up to three names the way the language does', () => {
    expect(namesList(named('Ana'), 'en')).toBe('Ana');
    expect(namesList(named('Ana', 'Jelena'), 'en')).toBe('Ana and Jelena');
    expect(namesList(named('Ana', 'Jelena', 'Marko'), 'en')).toBe('Ana, Jelena and Marko');
    expect(namesList(named('Ana', 'Jelena'), 'sr')).toBe('Ana i Jelena');
  });

  it('shortens longer lists and skips blank names', () => {
    expect(namesList(named('Ana', 'Jelena', 'Marko', 'Luka'), 'en')).toBe('Ana, Jelena and 2 more');
    expect(namesList(named('Ana', 'Jelena', 'Marko', 'Luka', 'Mila'), 'sr')).toBe('Ana, Jelena i još 3');
    expect(namesList(named(' ', ''), 'en')).toBe('');
  });
});

describe('event day of', () => {
  const trip = { startDate: '2026-11-12T00:00:00.000Z', endDate: '2026-11-17T00:00:00.000Z' };

  it('counts the days of a dated event while it is on', () => {
    expect(eventDayOf(trip, new Date(2026, 10, 12, 9))).toEqual({ day: 1, total: 6 });
    expect(eventDayOf(trip, new Date(2026, 10, 15, 23, 30))).toEqual({ day: 4, total: 6 });
    expect(eventDayOf(trip, new Date(2026, 10, 17, 22))).toEqual({ day: 6, total: 6 });
  });

  it('is null before, after, or without dates', () => {
    expect(eventDayOf(trip, new Date(2026, 10, 11, 23))).toBeNull();
    expect(eventDayOf(trip, new Date(2026, 10, 18, 0, 5))).toBeNull();
    expect(eventDayOf({ startDate: '2026-11-12' }, new Date(2026, 10, 12))).toBeNull();
    expect(eventDayOf({ startDate: 'soon', endDate: 'later' }, new Date(2026, 10, 12))).toBeNull();
  });
});

describe('event money', () => {
  const event: Event = { id: 'trip', name: 'Lisbon', personIds: ['ana', 'me'], status: 'active' };
  const state: AppState = {
    transactions: [
      {
        id: 'tx-split',
        date: '2026-11-13T10:00:00.000Z',
        amount: 90,
        currency: 'EUR',
        categoryId: 'food',
        accountId: 'cash',
        type: 'expense',
        note: 'Lunch',
        eventId: 'trip',
        splitDetails: { totalAmount: 90, myPortion: 30, splitMethod: 'equal', shares: [{ personId: 'ana', amount: 60 }] },
      },
    ],
    categories: [{ id: 'food', name: 'Food', type: 'expense', subcategories: [], color: '#111' }],
    accounts: [],
    people: [person('ana', 'Ana')],
    userProfile: person('me', 'Nina'),
    baseCurrency: 'RSD',
    rates,
    templates: [],
    recurringTransactions: [],
    language: 'en',
    events: [event],
    sharedExpenses: [
      {
        id: 'dinner',
        eventId: 'trip',
        name: 'Dinner',
        amount: 50,
        currency: 'EUR',
        paidBy: 'ana',
        sharedWith: ['me', 'ana'],
        splitType: 'equal',
        date: '2026-11-14T19:00:00.000Z',
      },
      {
        id: 'taxi',
        eventId: 'trip',
        name: 'Taxi',
        amount: 1170,
        currency: 'RSD',
        paidBy: 'me',
        sharedWith: ['me', 'ana'],
        splitType: 'equal',
        date: '2026-11-15T08:00:00.000Z',
      },
    ],
  };

  it('uses the currency most of the spending was in, with your balance in it', () => {
    const result = eventMoney(event, state, null);
    expect(result.currency).toBe('EUR');
    // 90 + 50 + 1170 RSD (10 EUR).
    expect(result.total).toBeCloseTo(150);
    // Ana owes 60 for lunch and 5 for the taxi; you owe her 25 for dinner.
    expect(result.mine).toBeCloseTo(40);
  });

  it('is empty for an event with no spending', () => {
    const empty: Event = { id: 'quiet', name: 'Quiet', personIds: ['ana', 'me'], status: 'completed' };
    expect(eventMoney(empty, { ...state, events: [empty] }, null)).toEqual({ currency: 'RSD', total: 0, mine: 0 });
  });
});
