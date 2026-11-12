import { describe, expect, it } from 'vitest';
import { calculateEventPersonTotals } from '../utils/eventSummarySelectors';
import type { Currency, ExchangeRates, Person, SharedExpense } from '../types';

const people: Person[] = [
  { id: 'person-a', name: 'Ana', color: '#111', defaultCurrency: 'EUR', balances: { EUR: 0, USD: 0, RSD: 0 } },
  { id: 'person-b', name: 'Boris', color: '#222', defaultCurrency: 'EUR', balances: { EUR: 0, USD: 0, RSD: 0 } },
];

const rates: ExchangeRates = {
  base: 'EUR',
  date: '2026-04-06',
  rates: { EUR: 1, USD: 2, RSD: 120 },
};

describe('event summary selectors', () => {
  it('calculates per-person paid and owed totals across equal and exact splits', () => {
    const expenses: SharedExpense[] = [
      {
        id: 'expense-equal',
        eventId: 'event-1',
        name: 'Dinner',
        amount: 100,
        currency: 'EUR',
        paidBy: 'person-a',
        sharedWith: ['person-a', 'person-b'],
        splitType: 'equal',
        date: '2026-04-06',
      },
      {
        id: 'expense-exact',
        eventId: 'event-1',
        name: 'Taxi',
        amount: 600,
        currency: 'RSD',
        paidBy: 'person-b',
        sharedWith: ['person-a', 'person-b'],
        splitType: 'exact',
        splitDetails: {
          'person-a': 300,
          'person-b': 300,
        },
        date: '2026-04-06',
      },
    ];

    expect(calculateEventPersonTotals({
      people,
      expenses,
      summaryCurrency: 'EUR',
      rates: rates.rates,
    })).toEqual([
      { personId: 'person-a', totalPaid: 100, totalOwed: 52.5 },
      { personId: 'person-b', totalPaid: 5, totalOwed: 52.5 },
    ]);
  });

  it('returns zero totals for people not included in any expense shares', () => {
    const summaryCurrency: Currency = 'EUR';
    const expenses: SharedExpense[] = [
      {
        id: 'expense-1',
        eventId: 'event-1',
        name: 'Solo',
        amount: 40,
        currency: 'EUR',
        paidBy: 'person-a',
        sharedWith: ['person-a'],
        splitType: 'equal',
        date: '2026-04-06',
      },
    ];

    expect(calculateEventPersonTotals({
      people,
      expenses,
      summaryCurrency,
      rates: rates.rates,
    })[1]).toEqual({
      personId: 'person-b',
      totalPaid: 0,
      totalOwed: 0,
    });
  });
});
