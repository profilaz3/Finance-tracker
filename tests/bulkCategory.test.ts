import { describe, expect, it } from 'vitest';
import type { Category, Transaction } from '../types';
import { canTakeCategory, recategorizableKinds, recategorize, undoRecategorize } from '../domain/bulkCategory';

const tx = (id: string, patch: Partial<Transaction> = {}): Transaction => ({
  id,
  amount: 100,
  currency: 'RSD',
  type: 'expense',
  categoryId: 'food',
  accountId: 'cash',
  date: '2026-11-10T12:00:00.000Z',
  note: id,
  ...patch,
} as Transaction);

const cat = (id: string, type: Category['type'] = 'expense'): Category => ({ id, name: id, type, subcategories: [], color: '#000' });

describe('recategorize', () => {
  const list = [
    tx('a'),
    tx('b', { subcategory: 'Lunch' }),
    tx('c', { categoryId: 'transport' }),
    tx('salary', { type: 'income', categoryId: 'salary' }),
    tx('move', { categoryId: 'internal-transfer' }),
    tx('repay', { categoryId: 'loan-repayment', personId: 'p1' }),
    tx('other'),
  ];
  const selected = new Set(['a', 'b', 'c', 'salary', 'move', 'repay']);

  it('moves the selected expenses, drops old subcategories and counts what it skips', () => {
    const { rows, skipped, previous } = recategorize(list, selected, cat('transport'));
    expect(rows.map(row => [row.id, row.categoryId, row.subcategory])).toEqual([
      ['a', 'transport', undefined],
      ['b', 'transport', undefined],
    ]);
    // c is already there; salary is income; move is a transfer; repay is a repayment.
    expect(skipped).toBe(3);
    expect(previous.get('b')).toEqual({ categoryId: 'food', subcategory: 'Lunch' });
    expect(rows.some(row => row.id === 'other')).toBe(false);
  });

  it('never moves entries into an app category', () => {
    expect(canTakeCategory(tx('a'), cat('internal-transfer'))).toBe(false);
    expect(canTakeCategory(tx('a'), cat('loan-repayment'))).toBe(false);
  });

  it('only matches the same kind', () => {
    expect(recategorize(list, selected, cat('bonus', 'income')).rows.map(row => row.id)).toEqual(['salary']);
  });

  it('undo restores entries still in the new category and leaves edited ones alone', () => {
    const { rows, previous } = recategorize(list, selected, cat('transport'));
    const after = list.map(item => rows.find(row => row.id === item.id) ?? item);
    // b was changed again since.
    const edited = after.map(item => (item.id === 'b' ? { ...item, categoryId: 'health' } : item));
    const undone = undoRecategorize(edited, previous, 'transport');
    expect(undone.map(row => [row.id, row.categoryId, row.subcategory])).toEqual([['a', 'food', undefined]]);
  });

  it('lists the kinds the selection can change', () => {
    expect([...recategorizableKinds(list, selected)].sort()).toEqual(['expense', 'income']);
    expect([...recategorizableKinds(list, new Set(['move', 'repay']))]).toEqual([]);
  });
});
