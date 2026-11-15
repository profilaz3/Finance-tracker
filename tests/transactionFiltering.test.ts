import { beforeAll, describe, expect, it } from 'vitest';
import type { Account, Category, Transaction } from '../types';
import { UNCATEGORIZED_FILTER } from '../utils/qolSuggestions';

process.env.TZ = 'Europe/Belgrade';

let filterTransactions: typeof import('../utils/transactionFilters').filterTransactions;
let groupTransactionsByDay: typeof import('../utils/transactionFilters').groupTransactionsByDay;

beforeAll(async () => {
  ({ filterTransactions, groupTransactionsByDay } = await import('../utils/transactionFilters'));
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

  it('groups entries by local day under Today, Yesterday and weekday labels', () => {
    const now = new Date('2026-11-15T12:00:00.000Z');
    const grouped = groupTransactionsByDay(
      [
        { ...transactions[0], id: 'today-a', date: '2026-11-15T08:00:00.000Z' },
        { ...transactions[0], id: 'friday', date: '2026-11-13' },
        { ...transactions[1], id: 'today-b', date: '2026-11-15T07:00:00.000Z' },
        { ...transactions[0], id: 'yesterday', date: '2026-11-14T22:30:00.000Z' },
        { ...transactions[0], id: 'last-year', date: '2025-12-31' },
      ],
      'en',
      now
    );

    expect(grouped.map(group => group.key)).toEqual(['2026-11-15', '2026-11-14', '2026-11-13', '2025-12-31']);
    expect(grouped.map(group => group.label)).toEqual(['Today', 'Yesterday', 'Friday', 'Wednesday']);
    expect(grouped[0].transactions.map(tx => tx.id)).toEqual(['today-a', 'today-b']);
    expect(grouped[1].detail).toBe('Sat 14 Nov');
    expect(grouped[2].detail).toBe('13 Nov');
    expect(grouped[3].detail).toBe('31 Dec 2025');
  });

  it('puts a late-evening UTC timestamp on the local day', () => {
    // 23:30 UTC on 14 Nov is 00:30 on 15 Nov in Belgrade.
    const grouped = groupTransactionsByDay(
      [{ ...transactions[0], id: 'late', date: '2026-11-14T23:30:00.000Z' }],
      'en',
      new Date('2026-11-15T12:00:00.000Z')
    );
    expect(grouped[0].key).toBe('2026-11-15');
    expect(grouped[0].label).toBe('Today');
  });

  it('counts days by calendar across DST and capitalizes Serbian weekdays', () => {
    const grouped = groupTransactionsByDay(
      [
        { ...transactions[0], id: 'before-dst', date: '2026-03-28T10:00:00.000Z' },
        { ...transactions[0], id: 'after-dst', date: '2026-03-29T10:00:00.000Z' },
      ],
      'sr',
      new Date('2026-03-30T10:00:00.000Z')
    );
    expect(grouped.map(group => group.key)).toEqual(['2026-03-29', '2026-03-28']);
    expect(grouped[0].label).toBe('Juče');
    expect(grouped[1].label).toBe('Subota');
  });

  it('keeps entries with an unreadable date in one group at the end', () => {
    const grouped = groupTransactionsByDay(
      [
        { ...transactions[0], id: 'broken', date: 'not a date' },
        { ...transactions[0], id: 'fine', date: '2026-11-15' },
      ],
      'en',
      new Date('2026-11-15T12:00:00.000Z')
    );
    expect(grouped.map(group => group.key)).toEqual(['2026-11-15', 'unknown']);
    expect(grouped[1].label).toBe('');
  });
});

describe('transaction search', () => {
  const people = [
    { id: 'p-ana', name: 'Ana Đorđević', color: '#000000', defaultCurrency: 'RSD' as const, balances: { EUR: 0, USD: 0, RSD: 0 } },
  ];
  const searchCategories: Category[] = [
    ...categories,
    { id: 'internal-transfer', name: 'Internal Transfer', type: 'income', subcategories: [], color: '#000000' },
  ];
  const pool: Transaction[] = [
    { ...transactions[0], id: 's-1', amount: 1450, note: 'Čevapi u Čačku' },
    { ...transactions[0], id: 's-2', amount: 32.4, note: 'Lunch', personId: 'p-ana' },
    {
      ...transactions[0], id: 's-3', amount: 990, note: '',
      receiptData: { merchant: 'Maxi Delhaize', items: [], total: 990 } as unknown as Transaction['receiptData'],
    },
    { ...transactions[1], id: 's-4', amount: 50, categoryId: 'internal-transfer', note: 'Transfer from Cash' },
  ];
  const search = (searchQuery: string) => filterTransactions({
    transactions: pool,
    categories: searchCategories,
    accounts,
    filterType: 'all',
    filterAccount: 'all',
    filterDateFrom: '',
    filterDateTo: '',
    searchQuery,
    people,
  }).map(tx => tx.id);

  it('ignores case, spaces around the query and diacritics', () => {
    expect(search('  cevapi ')).toEqual(['s-1']);
    expect(search('ČAČKU')).toEqual(['s-1']);
    expect(search('cevapi cacku')).toEqual(['s-1']);
  });

  it('finds an amount as it is shown, in either number format', () => {
    expect(search('1450')).toEqual(['s-1']);
    expect(search('1,450')).toEqual(['s-1']);
    expect(search('1.450')).toEqual(['s-1']);
    expect(search('1.450,00')).toEqual(['s-1']);
    expect(search('32,40')).toEqual(['s-2']);
    expect(search('32.4')).toEqual(['s-2']);
  });

  it('finds entries by person, by receipt merchant and by translated system text', () => {
    expect(search('dorde')).toEqual(['s-2']);
    expect(search('djordjevic')).toEqual(['s-2']);
    expect(search('maxi')).toEqual(['s-3']);
    expect(search('prenos izmedu')).toEqual(['s-4']);
    expect(search('transfer between wallets')).toEqual(['s-4']);
  });
});
