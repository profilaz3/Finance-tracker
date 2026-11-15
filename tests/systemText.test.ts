import { describe, expect, it } from 'vitest';
import { localizeCategoryName, localizeSubcategory, localizeTransactionNote } from '../utils/systemText';

describe('system text localization', () => {
  it('translates built-in category names unless renamed', () => {
    expect(localizeCategoryName({ id: 'debt-repayment', name: 'Incoming' }, 'sr')).toBe('Vraćeno meni');
    expect(localizeCategoryName({ id: 'internal-transfer', name: 'Internal Transfer' }, 'en')).toBe('Transfer between wallets');
    expect(localizeCategoryName({ id: 'debt-repayment', name: 'Dugovi' }, 'sr')).toBe('Dugovi');
    expect(localizeCategoryName({ id: 'c1', name: 'Food' }, 'sr')).toBe('Food');
  });

  it('translates generated notes and leaves typed notes alone', () => {
    expect(localizeTransactionNote('Settled RSD balance', 'sr')).toBe('Izmireno stanje u RSD');
    expect(localizeTransactionNote('Partial settlement (EUR)', 'sr')).toBe('Delimično izmirenje (EUR)');
    expect(localizeTransactionNote('Transfer from Bank', 'sr')).toBe('Prenos sa: Bank');
    expect(localizeTransactionNote('Settled RSD balance', 'en')).toBe('Settled RSD balance');
    expect(localizeTransactionNote('Dinner with Sam', 'sr')).toBe('Dinner with Sam');
    expect(localizeTransactionNote(undefined, 'sr')).toBeUndefined();
  });

  it('translates generated subcategories', () => {
    expect(localizeSubcategory('Partial Payment', 'sr')).toBe('Delimična uplata');
    expect(localizeSubcategory('Groceries', 'sr')).toBe('Groceries');
  });
});
