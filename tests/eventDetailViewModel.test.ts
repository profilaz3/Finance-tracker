import { describe, expect, it } from 'vitest';
import { buildEventDetailViewModel } from '../components/event-detail/useEventDetailViewModel';
import type { AppState, Event } from '../types';

const event: Event = {
  id: 'event-1',
  name: 'Trip',
  personIds: ['person-1', 'me'],
  status: 'active',
};

const baseState: AppState = {
  transactions: [
    {
      id: 'tx-split',
      date: '2026-04-06T10:00:00.000Z',
      amount: 90,
      currency: 'EUR',
      categoryId: 'food',
      accountId: 'cash',
      type: 'expense',
      note: 'Lunch',
      eventId: 'event-1',
      splitDetails: {
        totalAmount: 90,
        myPortion: 30,
        splitMethod: 'equal',
        shares: [{ personId: 'person-1', amount: 60 }],
      },
    },
    {
      id: 'tx-personal',
      date: '2026-04-05T09:00:00.000Z',
      amount: 40,
      currency: 'EUR',
      categoryId: 'transport',
      accountId: 'cash',
      type: 'expense',
      note: 'Taxi',
      eventId: 'event-1',
    },
  ],
  categories: [
    { id: 'food', name: 'Food', type: 'expense', subcategories: [], color: '#111' },
    { id: 'transport', name: 'Transport', type: 'expense', subcategories: [], color: '#222' },
  ],
  accounts: [],
  people: [
    { id: 'person-1', name: 'Ana', color: '#111', defaultCurrency: 'EUR', balances: { EUR: 0, USD: 0, RSD: 0 } },
  ],
  userProfile: { id: 'me', name: 'Me', color: '#000', defaultCurrency: 'EUR', balances: { EUR: 0, USD: 0, RSD: 0 } },
  baseCurrency: 'EUR',
  rates: { base: 'EUR', date: '2026-04-06', rates: { EUR: 1, USD: 2, RSD: 120 } },
  templates: [],
  recurringTransactions: [],
  language: 'en',
  events: [event],
  sharedExpenses: [
    {
      id: 'shared-1',
      eventId: 'event-1',
      name: 'Dinner',
      amount: 50,
      currency: 'EUR',
      paidBy: 'person-1',
      sharedWith: ['me', 'person-1'],
      date: '2026-04-07T12:00:00.000Z',
      splitType: 'equal',
      category: 'Food',
    },
  ],
};

describe('event detail view model', () => {
  it('builds unified event expenses, participants, and summary expenses in one place', () => {
    const viewModel = buildEventDetailViewModel({ event, state: baseState });

    expect(viewModel.eventPeople.map(person => person.id)).toEqual(['person-1', 'me']);
    expect(viewModel.eventSharedExpenses.map(expense => expense.id)).toEqual(['shared-1']);
    expect(viewModel.linkedTransactions.map(transaction => transaction.id)).toEqual(['tx-split', 'tx-personal']);
    expect(viewModel.transactionsAsSharedExpenses).toEqual([
      {
        id: 'tx-split',
        eventId: 'event-1',
        name: 'Lunch',
        amount: 90,
        currency: 'EUR',
        paidBy: 'me',
        sharedWith: ['me', 'person-1'],
        date: '2026-04-06T10:00:00.000Z',
        splitType: 'exact',
        splitDetails: { me: 30, 'person-1': 60 },
        category: 'Food',
      },
      {
        id: 'tx-personal',
        eventId: 'event-1',
        name: 'Taxi',
        amount: 40,
        currency: 'EUR',
        paidBy: 'me',
        sharedWith: ['me'],
        date: '2026-04-05T09:00:00.000Z',
        splitType: 'equal',
        category: 'Transport',
      },
    ]);
    expect(viewModel.allExpensesForSummary.map(expense => expense.id)).toEqual(['shared-1', 'tx-split', 'tx-personal']);
    expect(viewModel.unifiedExpenses.map(expense => `${expense.type}:${expense.data.id}`)).toEqual([
      'sharedExpense:shared-1',
      'transaction:tx-split',
      'transaction:tx-personal',
    ]);
  });
});
