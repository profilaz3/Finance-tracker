import { describe, expect, it } from 'vitest';
import type { Account, AppState, Category, Event, Person, Transaction } from '../types';
import { SELF, initialSplitDraft, listNames, orderSplitPeople, reconcileShares, switchPayer } from '../components/split-expense/splitDraft';
import { eventSplitPreview } from '../components/split-expense/eventPreview';

const rates = { base: 'EUR' as const, date: '2026-11-15', rates: { EUR: 1, USD: 1.25, RSD: 117 } };

const person = (id: string, name: string): Person => ({
  id,
  name,
  color: '#123456',
  defaultCurrency: 'EUR',
  balances: { EUR: 0, USD: 0, RSD: 0 },
});

const ana = person('ana', 'Ana');
const jelena = person('jelena', 'Jelena');
const marko = person('marko', 'Marko');
const people = [marko, ana, jelena];
const categories: Category[] = [
  { id: 'salary', name: 'Salary', type: 'income', subcategories: [], color: '#222' },
  { id: 'food', name: 'Food', type: 'expense', subcategories: [], color: '#111' },
];
const accounts: Account[] = [{ id: 'cash', name: 'Cash', currency: 'EUR', balance: 0, type: 'cash' } as unknown as Account];
const trip: Event = { id: 'trip', name: 'Lisbon', personIds: ['ana', 'jelena', 'me'], status: 'active' };
const now = new Date('2026-11-15T12:00:00.000Z');
const base = { people, categories, accounts, baseCurrency: 'EUR' as const, now };
const included = (draft: ReturnType<typeof initialSplitDraft>) => draft.shares.filter(share => share.isIncluded).map(share => share.personId);

const entry: Transaction = {
  id: 'tx-1',
  date: '2026-11-14T19:00:00.000Z',
  amount: 96,
  currency: 'EUR',
  categoryId: 'food',
  accountId: 'cash',
  type: 'expense',
  note: 'Dinner in Alfama',
};

describe('initial split draft', () => {
  it('starts a new split empty and even, on the first expense category and wallet', () => {
    const draft = initialSplitDraft(base);
    expect(draft).toMatchObject({ amount: undefined, currency: 'EUR', categoryId: 'food', accountId: 'cash', splitMethod: 'equal', payerId: SELF });
    expect(included(draft)).toEqual([]);
    expect(draft.date).toBe(now.toISOString());
  });

  it('puts the event people in a new split that goes into an event', () => {
    expect(included(initialSplitDraft({ ...base, event: trip }))).toEqual(['ana', 'jelena']);
  });

  it('splits an entry evenly with the people picked on its details card', () => {
    const draft = initialSplitDraft({ ...base, transaction: entry, preselect: ['marko'] });
    expect(draft).toMatchObject({ amount: 96, note: 'Dinner in Alfama', splitMethod: 'equal', payerId: SELF });
    expect(included(draft)).toEqual(['marko']);
  });

  it('loads a stored split with its method and parts', () => {
    const split: Transaction = {
      ...entry,
      splitDetails: { totalAmount: 96, myPortion: 46, splitMethod: 'exact', shares: [{ personId: 'ana', amount: 50 }] },
    };
    const draft = initialSplitDraft({ ...base, transaction: split });
    expect(draft.splitMethod).toBe('exact');
    expect(draft.shares.find(share => share.personId === 'ana')).toMatchObject({ isIncluded: true, amount: 50 });
    expect(included(draft)).toEqual(['ana']);
  });

  it('takes exact amounts and the payer from a split receipt', () => {
    const draft = initialSplitDraft({
      ...base,
      prefill: {
        amount: 30,
        currency: 'EUR',
        categoryId: 'food',
        accountId: 'cash',
        date: '2026-11-15T09:00:00.000Z',
        note: 'Market',
        payerId: 'ana',
        amounts: { self: 12, ana: 10, jelena: 8 },
      },
    });
    expect(draft).toMatchObject({ amount: 30, splitMethod: 'exact', payerId: 'ana' });
    expect(included(draft)).toEqual(['ana', 'jelena']);
    // My part is what the others leave: 30 - 10 - 8.
    expect(30 - draft.shares.reduce((sum, share) => sum + share.amount, 0)).toBe(12);
  });
});

describe('split people', () => {
  it('lists the event people first', () => {
    expect(orderSplitPeople(people, trip).map(item => item.id)).toEqual(['ana', 'jelena', 'marko']);
    expect(orderSplitPeople(people)).toBe(people);
  });

  it('gives someone added while the form is open a share, and drops someone removed', () => {
    const shares = initialSplitDraft(base).shares;
    expect(reconcileShares(shares, people)).toBe(shares);
    const luka = person('luka', 'Luka');
    const next = reconcileShares(shares, [ana, jelena, luka], added => added.name === 'Luka');
    expect(next.map(share => [share.personId, share.isIncluded])).toEqual([['ana', false], ['jelena', false], ['luka', true]]);
  });

  it('puts someone else who paid into the split, and takes them out when the payer changes back', () => {
    const shares = initialSplitDraft(base).shares;
    const toAna = switchPayer(shares, 'ana', null);
    expect(toAna.autoIncluded).toBe('ana');
    expect(toAna.shares.find(share => share.personId === 'ana')?.isIncluded).toBe(true);
    const back = switchPayer(toAna.shares, SELF, toAna.autoIncluded);
    expect(back.autoIncluded).toBeNull();
    expect(back.shares.some(share => share.isIncluded)).toBe(false);
  });

  it('leaves a payer who was already in the split there', () => {
    const shares = initialSplitDraft({ ...base, event: trip }).shares;
    const toAna = switchPayer(shares, 'ana', null);
    expect(toAna.autoIncluded).toBeNull();
    expect(switchPayer(toAna.shares, SELF, null).shares.find(share => share.personId === 'ana')?.isIncluded).toBe(true);
  });

  it('names up to three people and counts the rest', () => {
    expect(listNames(['Ana'], 'en-GB', '{names} and {count} more')).toBe('Ana');
    expect(listNames(['Ana', 'Jelena'], 'en-GB', '{names} and {count} more')).toBe('Ana and Jelena');
    expect(listNames(['Ana', 'Jelena'], 'sr-Latn-RS', '{names} i još {count}')).toBe('Ana i Jelena');
    expect(listNames(['Ana', 'Jelena', 'Marko', 'Luka', 'Mila'], 'en-GB', '{names} and {count} more')).toBe('Ana, Jelena and 3 more');
  });
});

describe('event split preview', () => {
  const event: Event = { id: 'trip', name: 'Lisbon', personIds: ['ana', 'me'], status: 'active' };
  const state = {
    transactions: [],
    categories,
    accounts,
    people: [ana],
    userProfile: person('me', 'Nina'),
    baseCurrency: 'EUR',
    rates,
    templates: [],
    recurringTransactions: [],
    language: 'en',
    events: [event],
    sharedExpenses: [
      { id: 'dinner', eventId: 'trip', name: 'Dinner', amount: 50, currency: 'EUR', paidBy: 'ana', sharedWith: ['me', 'ana'], splitType: 'equal', date: '2026-11-14T19:00:00.000Z' },
    ],
  } as unknown as AppState;

  it('shows the event as it is without a pending split', () => {
    const preview = eventSplitPreview(event, state, null);
    expect(preview?.mine).toBeCloseTo(-25);
    expect(preview?.payers.map(payer => [payer.id, payer.amount])).toEqual([['ana', 50]]);
    expect(preview?.moves).toMatchObject([{ id: 'ana', amount: -25 }]);
  });

  it('adds the split being made, as the event screen will once it is saved', () => {
    const pending: Transaction = {
      ...entry,
      id: 'split-preview',
      eventId: 'trip',
      splitDetails: { totalAmount: 96, myPortion: 48, splitMethod: 'equal', shares: [{ personId: 'ana', amount: 48 }] },
    };
    const preview = eventSplitPreview(event, state, null, pending);
    // Ana owes 48 for this dinner; I owe her 25 for hers.
    expect(preview?.mine).toBeCloseTo(23);
    expect(preview?.payers[0]).toMatchObject({ self: true, amount: 96 });
    expect(preview?.moves).toMatchObject([{ id: 'ana', amount: 23 }]);
  });
});
