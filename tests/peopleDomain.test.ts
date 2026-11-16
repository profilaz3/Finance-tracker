import { describe, expect, it } from 'vitest';
import {
  addAccountToCollection,
  buildPerson,
  buildSettlementDraft,
  buildUserProfile,
  netPersonBalance,
  pickSettlementAccountId,
  removeAccountFromCollection,
  splitOpenBalances,
  removePersonFromCollection,
  updatePersonBalanceInCollection,
  updatePersonInCollection,
} from '../domain/people';
import type { Account, Category, Currency, Person } from '../types';

const createBalances = (currency: Currency, amount: number): Record<Currency, number> => ({
  EUR: currency === 'EUR' ? amount : 0,
  USD: currency === 'USD' ? amount : 0,
  RSD: currency === 'RSD' ? amount : 0,
});

describe('people domain helpers', () => {
  it('builds a new person with a generated id and default-currency balance', () => {
    const person = buildPerson({
      createId: () => 'person-1',
      name: 'Mila',
      defaultCurrency: 'EUR',
      color: '#ff0000',
      avatar: 'avatar.png',
    });

    expect(person).toEqual({
      id: 'person-1',
      name: 'Mila',
      defaultCurrency: 'EUR',
      color: '#ff0000',
      avatar: 'avatar.png',
      balances: { EUR: 0 },
    });
  });

  it('updates and removes people in a collection without touching unrelated entries', () => {
    const people: Person[] = [
      { id: 'person-1', name: 'Mila', defaultCurrency: 'EUR', color: '#111', balances: createBalances('EUR', 0) },
      { id: 'person-2', name: 'Nikola', defaultCurrency: 'RSD', color: '#222', balances: createBalances('RSD', 10) },
    ];

    const updated = updatePersonInCollection(people, 'person-2', { name: 'Nina' });
    expect(updated[1].name).toBe('Nina');
    expect(updated[0].name).toBe('Mila');

    const removed = removePersonFromCollection(updated, 'person-1');
    expect(removed.map(person => person.id)).toEqual(['person-2']);
  });

  it('rounds balance updates and builds settlement drafts from person balances', () => {
    const people: Person[] = [
      { id: 'person-1', name: 'Mila', defaultCurrency: 'RSD', color: '#111', balances: createBalances('RSD', 12.345) },
    ];
    const categories: Category[] = [
      { id: 'expense-1', name: 'Outgoing', type: 'expense', subcategories: [], color: '#000' },
      { id: 'income-1', name: 'Incoming', type: 'income', subcategories: [], color: '#fff' },
    ];

    const { people: updatedPeople, updatedPerson } = updatePersonBalanceInCollection(people, 'person-1', 'RSD', 44.556);
    expect(updatedPeople[0].balances.RSD).toBe(44.56);
    expect(updatedPerson?.balances.RSD).toBe(44.56);

    const settlement = buildSettlementDraft({
      createId: () => 'tx-settle',
      nowIso: '2026-04-05T14:00:00.000Z',
      person: updatedPeople[0],
      currency: 'RSD',
      categories,
      defaultAccountId: 'acc-1',
      settleAmount: 4.56,
    });

    expect(settlement?.transaction).toMatchObject({
      id: 'tx-settle',
      date: '2026-04-05T14:00:00.000Z',
      amount: 4.56,
      currency: 'RSD',
      accountId: 'acc-1',
      categoryId: 'debt-repayment',
      type: 'income',
      personId: 'person-1',
      subcategory: 'Settlement',
      note: 'Partial settlement (RSD)',
    });
    expect(settlement?.updatedPerson.balances.RSD).toBe(40);
    expect(settlement?.isPartial).toBe(true);
    // The repayment category was missing, so the draft asks for it to be created.
    expect(settlement?.createdCategory).toMatchObject({ id: 'debt-repayment', type: 'income' });
  });

  it('records settlements under the existing repayment categories, never the first income/expense category', () => {
    const categories: Category[] = [
      { id: 'c1', name: 'Food', type: 'expense', subcategories: [], color: '#000' },
      { id: 'c4', name: 'Salary', type: 'income', subcategories: [], color: '#fff' },
      { id: 'debt-repayment', name: 'Incoming', type: 'income', subcategories: [], color: '#0f0' },
      { id: 'loan-repayment', name: 'Outgoing', type: 'expense', subcategories: [], color: '#f00' },
    ];
    const person: Person = { id: 'p', name: 'P', defaultCurrency: 'EUR', color: '#111', balances: { EUR: 25, USD: 0, RSD: -300 } };

    const incoming = buildSettlementDraft({ createId: () => 'a', person, currency: 'EUR', categories, defaultAccountId: 'acc' });
    expect(incoming?.transaction).toMatchObject({ type: 'income', categoryId: 'debt-repayment', amount: 25 });
    expect(incoming?.createdCategory).toBeNull();

    const outgoing = buildSettlementDraft({ createId: () => 'b', person, currency: 'RSD', categories, defaultAccountId: 'acc' });
    expect(outgoing?.transaction).toMatchObject({ type: 'expense', categoryId: 'loan-repayment', amount: 300 });
  });

  it('builds user profiles and account collection updates', () => {
    const profile = buildUserProfile({
      profileId: 'profile-1',
      name: 'Owner',
      defaultCurrency: 'USD',
      color: '#123456',
    });
    expect(profile).toEqual({
      id: 'profile-1',
      name: 'Owner',
      defaultCurrency: 'USD',
      color: '#123456',
      avatar: undefined,
      balances: {},
    });

    const accounts: Account[] = [
      { id: 'acc-1', name: 'Cash', type: 'cash', currency: 'RSD', color: '#111' },
    ];
    const added = addAccountToCollection(accounts, { id: 'acc-2', name: 'Bank', type: 'bank', currency: 'EUR', color: '#222' });
    expect(added.map(account => account.id)).toEqual(['acc-1', 'acc-2']);

    const removed = removeAccountFromCollection(added, 'acc-1');
    expect(removed.map(account => account.id)).toEqual(['acc-2']);
  });
});

describe('settling with a person', () => {
  const accounts: Pick<Account, 'id' | 'currency'>[] = [
    { id: 'eur-card', currency: 'EUR' },
    { id: 'rsd-cash', currency: 'RSD' },
    { id: 'rsd-bank', currency: 'RSD' },
  ];

  it('records a settlement in the first wallet of the settled currency', () => {
    expect(pickSettlementAccountId(accounts, 'RSD')).toBe('rsd-cash');
    expect(pickSettlementAccountId(accounts, 'EUR')).toBe('eur-card');
  });

  it('falls back to the first wallet when no wallet has that currency', () => {
    expect(pickSettlementAccountId(accounts, 'USD')).toBe('eur-card');
    expect(pickSettlementAccountId([], 'USD')).toBeUndefined();
  });

  it('splits open balances by direction of money', () => {
    expect(splitOpenBalances({ EUR: -24, USD: 0.001, RSD: 2000 })).toEqual({
      owedToMe: [['RSD', 2000]],
      iOwe: [['EUR', 24]],
    });
    expect(splitOpenBalances({})).toEqual({ owedToMe: [], iOwe: [] });
  });

  it('nets balances in one currency before comparing people', () => {
    const rates = { base: 'EUR' as const, date: '2026-11-01', rates: { EUR: 1, USD: 1, RSD: 100 } };
    // +2,000 RSD is worth 20 EUR, so with -24 EUR this person is a net -4 EUR, not +1,976.
    expect(netPersonBalance({ EUR: -24, RSD: 2000 }, 'EUR', rates)).toBeCloseTo(-4);
    expect(netPersonBalance({ EUR: 10, USD: 0, RSD: 0 }, 'RSD', rates)).toBeCloseTo(1000);
  });
});
