import { describe, expect, it } from 'vitest';
import type { Person, Transaction } from '../types';
import { suggestSplitPeople } from '../domain/splitSuggestions';

const person = (id: string, name: string): Person => ({
  id,
  name,
  color: '#123456',
  defaultCurrency: 'RSD',
  balances: { EUR: 0, USD: 0, RSD: 0 },
});

const people = [person('me', 'Nina'), person('ana', 'Ana'), person('jelena', 'Jelena'), person('marko', 'Marko'), person('luka', 'Luka'), person('zoran', 'Zoran')];
const now = new Date('2026-11-15T12:00:00.000Z');

const split = (id: string, date: string, ...personIds: string[]): Transaction => ({
  id,
  date,
  amount: 3000,
  currency: 'RSD',
  categoryId: 'food',
  accountId: 'bank',
  type: 'expense',
  splitDetails: {
    totalAmount: 3000,
    myPortion: 1000,
    splitMethod: 'equal',
    shares: personIds.map(personId => ({ personId, amount: 1000 })),
  },
});

const ids = (list: Person[]) => list.map(item => item.id);

describe('suggestSplitPeople', () => {
  it('ranks people by how often and how recently they were on your split bills', () => {
    const transactions = [
      split('1', '2026-11-10T10:00:00.000Z', 'jelena', 'marko'),
      split('2', '2026-11-01T10:00:00.000Z', 'jelena'),
      split('3', '2026-11-12T10:00:00.000Z', 'marko', 'ana'),
      split('4', '2026-11-14T10:00:00.000Z', 'marko'),
    ];
    expect(ids(suggestSplitPeople({ transactions, people, selfId: 'me', now, limit: 3 }))).toEqual(['marko', 'jelena', 'ana']);
  });

  it('lets a few recent bills outrank many old ones', () => {
    const old = Array.from({ length: 3 }, (_, index) => split(`old-${index}`, '2025-08-01T10:00:00.000Z', 'luka'));
    const transactions = [...old, split('new-1', '2026-11-13T10:00:00.000Z', 'ana'), split('new-2', '2026-11-14T10:00:00.000Z', 'ana')];
    expect(ids(suggestSplitPeople({ transactions, people, selfId: 'me', now, limit: 2 }))).toEqual(['ana', 'luka']);
  });

  it('counts an expense paid for one person, but not a repayment', () => {
    const paidFor: Transaction = { ...split('5', '2026-11-14T10:00:00.000Z'), splitDetails: undefined, personId: 'zoran' };
    const repayment: Transaction = { ...paidFor, id: '6', type: 'income', personId: 'luka' };
    expect(ids(suggestSplitPeople({ transactions: [repayment, paidFor], people, selfId: 'me', now, limit: 1 }))).toEqual(['zoran']);
  });

  it('puts the event people first and never suggests yourself', () => {
    const transactions = [split('1', '2026-11-14T10:00:00.000Z', 'me', 'ana')];
    const result = suggestSplitPeople({ transactions, people, selfId: 'me', eventPersonIds: ['me', 'zoran', 'gone'], now, limit: 3 });
    expect(ids(result)).toEqual(['zoran', 'ana', 'jelena']);
  });

  it('falls back to names when there is no history, and skips unknown or broken entries', () => {
    const broken = { ...split('x', 'not a date', 'marko'), id: 'x' };
    const unknown = split('y', '2026-11-14T10:00:00.000Z', 'ghost');
    expect(ids(suggestSplitPeople({ transactions: [broken, unknown], people, selfId: 'me', now }))).toEqual(['ana', 'jelena', 'luka', 'marko']);
    expect(suggestSplitPeople({ transactions: [], people: [], now })).toEqual([]);
  });
});
