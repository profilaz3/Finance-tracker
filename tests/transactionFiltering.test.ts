import { beforeAll, describe, expect, it } from 'vitest';
import type { Account, Category, Transaction } from '../types';
import { UNCATEGORIZED_FILTER } from '../utils/qolSuggestions';

process.env.TZ = 'Europe/Belgrade';

let filterTransactions: typeof import('../utils/transactionFilters').filterTransactions;
let getDateGroupLabel: typeof import('../utils/transactionFilters').getDateGroupLabel;
let groupTransactionsByDate: typeof import('../utils/transactionFilters').groupTransactionsByDate;

beforeAll(async () => {
  ({ filterTransactions, getDateGroupLabel, groupTransactionsByDate } = await import('../utils/transactionFilters'));
});

const categories: Category[] = [
  { id: 'food', name: 'Food', type: 'expense', subcategories: [], color: '#000000' },
  { id: 'salary', name: 'Salary', type: 'income', subcategories: [], color: '#ffffff' },
];

const accounts: Account[] = [
  { id: 'cash', name: 'Cash', type: 'cash', currency: 'RSD', color: '#000000' },
  { id: 'bank', name: 'Bank', type: 'bank', currency: 'EUR', color: '#ffffff' },
];

const transactions: Transaction[] = [
  {
    id: 'tx-1',
    date: '2026-04-05T09:00:00.000Z',
    amount: 1250,
    currency: 'RSD',
    categoryId: 'food',
    accountId: 'cash',
    type: 'expense',
    note: 'Morning coffee',
  },
  {
    id: 'tx-2',
    date: '2026-04-04T09:00:00.000Z',
    amount: 2000,
    currency: 'EUR',
    categoryId: 'salary',
    accountId: 'bank',
    type: 'income',
    note: 'April salary',
  },
];

describe('transaction filtering', () => {
  it('filters by type, account, date range, and search query', () => {
    const filtered = filterTransactions({
      transactions,
      categories,
      accounts,
      filterType: 'expense',
      filterAccount: 'cash',
      filterCategory: 'all',
      filterDateFrom: '2026-04-05',
      filterDateTo: '2026-04-05T23:59:59.999Z',
      searchQuery: 'coffee',
    });

    expect(filtered.map(tx => tx.id)).toEqual(['tx-1']);
  });

  it('sorts newest transactions first before grouping', () => {
    const filtered = filterTransactions({
      transactions,
      categories,
      accounts,
      filterType: 'all',
      filterAccount: 'all',
      filterCategory: 'all',
      filterDateFrom: '',
      filterDateTo: '',
      searchQuery: '',
    });

    expect(filtered.map(tx => tx.id)).toEqual(['tx-1', 'tx-2']);
  });

  it('defaults omitted category filter to all categories', () => {
    const filtered = filterTransactions({
      transactions,
      categories,
      accounts,
      filterType: 'all',
      filterAccount: 'all',
      filterDateFrom: '',
      filterDateTo: '',
      searchQuery: '',
    });

    expect(filtered.map(tx => tx.id)).toEqual(['tx-1', 'tx-2']);
  });

  it('filters transactions by explicit category id', () => {
    const filtered = filterTransactions({
      transactions,
      categories,
      accounts,
      filterType: 'all',
      filterAccount: 'all',
      filterCategory: 'food',
      filterDateFrom: '',
      filterDateTo: '',
      searchQuery: '',
    });

    expect(filtered.map(tx => tx.id)).toEqual(['tx-1']);
  });

  it('treats a date-only end filter as the end of that local day', () => {
    const filtered = filterTransactions({
      transactions: [
        {
          ...transactions[0],
          id: 'local-day-early',
          date: '2026-04-04T22:00:00.000Z',
          note: 'Start of April 5 local day',
        },
        {
          ...transactions[0],
          id: 'local-day-late',
          date: '2026-04-05T20:30:00.000Z',
          note: 'Late April 5 local day',
        },
        {
          ...transactions[0],
          id: 'next-local-day',
          date: '2026-04-05T22:00:00.000Z',
          note: 'Start of April 6 local day',
        },
      ],
      categories,
      accounts,
      filterType: 'all',
      filterAccount: 'all',
      filterCategory: 'all',
      filterDateFrom: '',
      filterDateTo: '2026-04-05',
      searchQuery: '',
    });

    expect(filtered.map(tx => tx.id)).toEqual(['local-day-late', 'local-day-early']);
  });

  it('filters uncategorized transactions by missing or unknown category', () => {
    const filtered = filterTransactions({
      transactions: [
        { ...transactions[0], id: 'known', categoryId: 'food' },
        { ...transactions[0], id: 'missing', categoryId: '' },
        { ...transactions[0], id: 'unknown', categoryId: 'deleted-category' },
      ],
      categories,
      accounts,
      filterType: 'all',
      filterAccount: 'all',
      filterCategory: UNCATEGORIZED_FILTER,
      filterDateFrom: '',
      filterDateTo: '',
      searchQuery: '',
    });

    expect(filtered.map(transaction => transaction.id)).toEqual(['missing', 'unknown']);
  });

  it('groups transactions under localized relative labels', () => {
    const grouped = groupTransactionsByDate(
      [
        { ...transactions[0], date: '2026-04-05T08:00:00.000Z' },
        { ...transactions[1], id: 'tx-3', date: '2026-04-05T07:00:00.000Z' },
      ],
      'en',
      new Date('2026-04-05T12:00:00.000Z')
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0].label).toBe('Today');
    expect(grouped[0].transactions.map(tx => tx.id)).toEqual(['tx-1', 'tx-3']);
  });

  it('groups by local calendar-day distance across DST', () => {
    expect(getDateGroupLabel(
      new Date('2026-03-29T10:00:00.000Z'),
      'en',
      new Date('2026-04-05T10:00:00.000Z')
    )).toBe('Last Week');
  });

  it('builds month labels for older transactions', () => {
    expect(getDateGroupLabel(new Date('2025-11-02T12:00:00.000Z'), 'en', new Date('2026-04-05T12:00:00.000Z'))).toBe('November 2025');
  });
});
