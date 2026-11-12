import { describe, expect, it } from 'vitest';
import {
  addAccountToCollection,
  buildPerson,
  buildSettlementDraft,
  buildUserProfile,
  removeAccountFromCollection,
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
      categoryId: 'income-1',
      type: 'income',
      personId: 'person-1',
      subcategory: 'Settlement',
      note: 'Partial settlement (RSD)',
    });
    expect(settlement?.updatedPerson.balances.RSD).toBe(40);
    expect(settlement?.isPartial).toBe(true);
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
