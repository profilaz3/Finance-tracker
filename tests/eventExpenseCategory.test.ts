import { describe, expect, it } from 'vitest';
import { localizeEventExpenseCategory } from '../domain/eventExpenseCategory';
import { EXPENSE_CATEGORIES } from '../constants/expenseCategories';

describe('localizeEventExpenseCategory', () => {
  it('translates every stored event category name', () => {
    EXPENSE_CATEGORIES.forEach(name => {
      expect(localizeEventExpenseCategory(name, 'en')).toBeTruthy();
      expect(localizeEventExpenseCategory(name, 'sr')).toBeTruthy();
    });
    expect(localizeEventExpenseCategory('Groceries', 'sr')).toBe('Namirnice');
    expect(localizeEventExpenseCategory('Hotel', 'en')).toBe('Hotel');
  });

  it('leaves other names (user categories) and empty values alone', () => {
    expect(localizeEventExpenseCategory('Coffee', 'sr')).toBe('Coffee');
    expect(localizeEventExpenseCategory(undefined, 'sr')).toBe('');
  });
});
