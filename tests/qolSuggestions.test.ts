import { describe, expect, it } from 'vitest';
import type { Account, Category, Transaction, TransactionTemplate } from '../types';
import {
  getBatchDeleteSafetySummary,
  getCommonTransactionFilters,
  getRepeatLastCandidate,
  selectDashboardTemplates,
  detectDuplicateTransactionGroups,
  UNCATEGORIZED_FILTER,
} from '../utils/qolSuggestions';

const categories: Category[] = [
  { id: 'food', name: 'Food', type: 'expense', subcategories: [], color: '#111111' },
  { id: 'salary', name: 'Salary', type: 'income', subcategories: [], color: '#222222' },
];

const accounts: Account[] = [
  { id: 'cash', name: 'Cash', type: 'cash', currency: 'RSD', color: '#111111' },
  { id: 'bank', name: 'Bank', type: 'bank', currency: 'EUR', color: '#222222' },
];

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx',
  date: '2026-05-10T10:00:00.000Z',
  amount: 1200,
  currency: 'RSD',
  categoryId: 'food',
  accountId: 'cash',
  type: 'expense',
  note: 'Lunch',
  ...overrides,
});

describe('QOL suggestions', () => {
  it('selects dashboard templates by usage, last used date, and name with a fixed limit', () => {
    const templates: TransactionTemplate[] = [
      { id: 'rare', name: 'Rare', amount: 1, currency: 'RSD', categoryId: 'food', accountId: 'cash', type: 'expense', usageCount: 1 },
      { id: 'newer', name: 'Newer', amount: 1, currency: 'RSD', categoryId: 'food', accountId: 'cash', type: 'expense', usageCount: 4, lastUsed: '2026-05-08T10:00:00.000Z' },
      { id: 'older', name: 'Older', amount: 1, currency: 'RSD', categoryId: 'food', accountId: 'cash', type: 'expense', usageCount: 4, lastUsed: '2026-05-01T10:00:00.000Z' },
      { id: 'alpha', name: 'Alpha', amount: 1, currency: 'RSD', categoryId: 'food', accountId: 'cash', type: 'expense', usageCount: 4 },
    ];

    expect(selectDashboardTemplates(templates, 3).map(template => template.id)).toEqual(['newer', 'older', 'alpha']);
  });

  it('selects the newest repeatable normal transaction and excludes risky transaction shapes', () => {
    const candidate = tx({ id: 'candidate', date: '2026-05-11T10:00:00.000Z' });
    const transactions = [
      tx({ id: 'split', date: '2026-05-12T10:00:00.000Z', splitDetails: { totalAmount: 1200, myPortion: 600, shares: [], splitMethod: 'equal' } }),
      tx({ id: 'person', date: '2026-05-12T09:00:00.000Z', personId: 'ana' }),
      tx({ id: 'transfer', date: '2026-05-12T08:00:00.000Z', categoryId: 'internal-transfer' }),
      candidate,
    ];

    expect(getRepeatLastCandidate(transactions)?.id).toBe('candidate');
  });

  it('builds common filters with deterministic date ranges and the uncategorized sentinel', () => {
    const filters = getCommonTransactionFilters('en', new Date('2026-05-11T12:00:00.000Z'));

    expect(filters.map(filter => filter.id)).toEqual(['thisMonth', 'expenses', 'income', 'uncategorized']);
    expect(filters[0].patch).toMatchObject({
      filterDateFrom: '2026-05-01',
      filterDateTo: '2026-05-31',
      showDateFilter: true,
    });
    expect(filters[3].patch).toMatchObject({ filterCategory: UNCATEGORIZED_FILTER });
  });

  it('detects conservative duplicate groups without grouping unrelated transactions', () => {
    const groups = detectDuplicateTransactionGroups([
      tx({ id: 'a', date: '2026-05-10T10:00:00.000Z', amount: 1200 }),
      tx({ id: 'b', date: '2026-05-11T09:00:00.000Z', amount: 1200 }),
      tx({ id: 'different-account', date: '2026-05-11T09:00:00.000Z', amount: 1200, accountId: 'bank' }),
      tx({ id: 'different-amount', date: '2026-05-11T09:00:00.000Z', amount: 1300 }),
    ], categories);

    expect(groups).toHaveLength(1);
    expect(groups[0].transactions.map(transaction => transaction.id)).toEqual(['a', 'b']);
  });

  it('does not group different non-empty category ids when category metadata is missing', () => {
    const groups = detectDuplicateTransactionGroups([
      tx({ id: 'known-category', date: '2026-05-10T10:00:00.000Z', categoryId: 'food' }),
      tx({ id: 'unknown-category', date: '2026-05-10T11:00:00.000Z', categoryId: 'deleted-category' }),
      tx({ id: 'another-unknown-category', date: '2026-05-10T12:00:00.000Z', categoryId: 'archived-category' }),
    ], categories);

    expect(groups).toHaveLength(0);
  });

  it('does not return overlapping duplicate groups for chained matches', () => {
    const groups = detectDuplicateTransactionGroups([
      tx({ id: 'a', date: '2026-05-10T00:00:00.000Z' }),
      tx({ id: 'b', date: '2026-05-10T23:00:00.000Z' }),
      tx({ id: 'c', date: '2026-05-11T22:00:00.000Z' }),
    ], categories);
    const groupedIds = groups.flatMap(group => group.transactions.map(transaction => transaction.id));

    expect(new Set(groupedIds).size).toBe(groupedIds.length);
  });

  it('summarizes batch-delete safety by selected ids', () => {
    const summary = getBatchDeleteSafetySummary([
      tx({ id: 'safe' }),
      tx({ id: 'split', splitDetails: { totalAmount: 1200, myPortion: 600, shares: [], splitMethod: 'equal' } }),
    ], ['safe', 'split', 'missing']);

    expect(summary).toEqual({
      count: 2,
      safeToUndoCount: 1,
      unsafeCount: 1,
      canUndoAll: false,
      selectedTransactions: expect.arrayContaining([
        expect.objectContaining({ id: 'safe' }),
        expect.objectContaining({ id: 'split' }),
      ]),
    });
  });
});
