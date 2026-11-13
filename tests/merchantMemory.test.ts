import { describe, expect, it } from 'vitest';
import type { Category, Transaction } from '../types';
import {
  applyUsualChoice,
  buildMerchantMemory,
  findMerchant,
  merchantHints,
  merchantMemoryFor,
  normalizeMerchant,
  usualChoice,
} from '../domain/merchantMemory';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

let seq = 0;
const tx = (note: string, categoryId: string, days: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${seq += 1}`,
  date: daysAgo(days),
  amount: 100,
  currency: 'RSD',
  categoryId,
  accountId: 'cash',
  type: 'expense',
  note,
  ...extra,
});

const categories: Category[] = [
  { id: 'groceries', name: 'Groceries', type: 'expense' } as Category,
  { id: 'food', name: 'Food & Dining', type: 'expense' } as Category,
  { id: 'health', name: 'Health', type: 'expense' } as Category,
  { id: 'salary', name: 'Salary', type: 'income' } as Category,
];

describe('normalizeMerchant', () => {
  it('drops case, diacritics, digits, punctuation and legal suffixes', () => {
    expect(normalizeMerchant('MAXI 123 d.o.o.')).toBe('maksi');
    expect(normalizeMerchant('Maxi DOO Beograd')).toBe('maksi beograd');
    expect(normalizeMerchant('Ćevapdžinica Željko, filijala 7')).toBe('cevapdzinica zeljko');
    expect(normalizeMerchant('Đurđevak')).toBe('djurdjevak');
  });

  it('folds Cyrillic and spelling variants onto one key', () => {
    expect(normalizeMerchant('МАКСИ')).toBe(normalizeMerchant('Maxi'));
    expect(normalizeMerchant('Maksi')).toBe(normalizeMerchant('Maxi'));
    expect(normalizeMerchant('Lidl Srbija KD')).toBe('lidl srbija kd');
  });

  it('treats card-statement web addresses as the brand', () => {
    expect(normalizeMerchant('NETFLIX.COM 8821')).toBe(normalizeMerchant('Netflix'));
    expect(normalizeMerchant('www.wolt.com')).toBe(normalizeMerchant('Wolt'));
    expect(normalizeMerchant('Spotify.rs')).toBe(normalizeMerchant('Spotify'));
  });

  it('is empty for nothing useful', () => {
    expect(normalizeMerchant('')).toBe('');
    expect(normalizeMerchant('123 / 45')).toBe('');
    expect(normalizeMerchant(undefined)).toBe('');
  });
});

describe('merchant memory', () => {
  it('learns the usual category once the habit is clear', () => {
    const memory = buildMerchantMemory([tx('Maxi', 'groceries', 2), tx('MAXI 012', 'groceries', 30)], NOW);
    expect(usualChoice(memory, 'maxi')).toMatchObject({ categoryId: 'groceries', count: 2 });
  });

  it('needs more than one visit', () => {
    const memory = buildMerchantMemory([tx('Maxi', 'groceries', 2)], NOW);
    expect(usualChoice(memory, 'Maxi')).toBeNull();
  });

  it('weighs recent choices more than old ones', () => {
    const memory = buildMerchantMemory([
      tx('Lilly', 'groceries', 400),
      tx('Lilly', 'groceries', 380),
      tx('Lilly', 'health', 3),
      tx('Lilly', 'health', 1),
    ], NOW);
    expect(usualChoice(memory, 'Lilly')?.categoryId).toBe('health');
  });

  it('breaks a tie by the most recent use, and refuses a split habit', () => {
    const tied = buildMerchantMemory([tx('Pekara Dukat', 'groceries', 10), tx('Pekara Dukat', 'food', 10, { date: new Date(NOW - 10 * 86_400_000 + 1000).toISOString() })], NOW);
    // Equal weight: food was used last, but a 50/50 split is not a clear habit.
    expect(usualChoice(tied, 'Pekara Dukat')).toBeNull();
    expect(merchantHints(tied, categories)[0]).toMatchObject({ category: 'Food & Dining' });
  });

  it('finds a known merchant inside a longer note', () => {
    const memory = buildMerchantMemory([tx('Mama Mia', 'food', 5), tx('Mama Mia', 'food', 9)], NOW);
    expect(findMerchant(memory, 'Lunch at Mama Mia with Marko')?.key).toBe('mama mia');
    expect(usualChoice(memory, 'Lunch at Mama Mia')?.categoryId).toBe('food');
  });

  it('prefers the receipt merchant over the note and skips transfers', () => {
    const memory = buildMerchantMemory([
      tx('weekly shop', 'groceries', 1, { receiptData: { merchant: 'IDEA', items: [], total: 1 } }),
      tx('', 'groceries', 2, { receiptData: { merchant: 'Idea 44', items: [], total: 1 } }),
      tx('Move to savings', 'internal-transfer', 1),
      tx('Move to savings', 'food', 1, { transferId: 'x' }),
    ], NOW);
    expect(usualChoice(memory, 'Idea')?.categoryId).toBe('groceries');
    expect(findMerchant(memory, 'Move to savings')).toBeNull();
  });

  it('memoizes by array identity', () => {
    const list = [tx('Maxi', 'groceries', 1)];
    expect(merchantMemoryFor(list)).toBe(merchantMemoryFor(list));
    expect(merchantMemoryFor([...list])).not.toBe(merchantMemoryFor(list));
  });
});

describe('merchantHints', () => {
  const memory = buildMerchantMemory([
    tx('Maxi', 'groceries', 1), tx('Maxi', 'groceries', 2),
    tx('Lilly', 'health', 3),
    tx('Mama Mia', 'food', 4),
  ], NOW);

  it('sends only merchants mentioned in the text', () => {
    expect(merchantHints(memory, categories, { text: '1200 dinara Maksi danas' })).toEqual([{ merchant: 'Maxi', category: 'Groceries' }]);
    expect(merchantHints(memory, categories, { text: 'taxi 500' })).toEqual([]);
  });

  it('without text, sends the strongest habits first, bounded', () => {
    const hints = merchantHints(memory, categories, { limit: 2 });
    expect(hints).toHaveLength(2);
    expect(hints[0]).toEqual({ merchant: 'Maxi', category: 'Groceries' });
  });
});

describe('applyUsualChoice', () => {
  const memory = buildMerchantMemory([tx('Maxi', 'groceries', 1), tx('Maxi', 'groceries', 2)], NOW);
  const parsed = { categoryName: 'Food & Dining', type: 'expense' as const, note: 'Ručak', merchant: 'Maxi' };

  it('overrides the AI category with the habit', () => {
    expect(applyUsualChoice(parsed, memory, categories, []).categoryName).toBe('Groceries');
  });

  it('leaves results alone without a habit or with a type mismatch', () => {
    expect(applyUsualChoice({ ...parsed, merchant: 'Somewhere' , note: 'x' }, memory, categories, []).categoryName).toBe('Food & Dining');
    expect(applyUsualChoice({ ...parsed, type: 'income' }, memory, categories, []).categoryName).toBe('Food & Dining');
  });
});

describe('Serbian case endings', () => {
  const memory = buildMerchantMemory([tx('Maxi', 'groceries', 1), tx('Maxi', 'groceries', 2)], NOW);
  it('matches an inflected name in a note', () => {
    expect(usualChoice(memory, 'Ručak u Maksiju')?.categoryId).toBe('groceries');
    expect(merchantHints(memory, categories, { text: 'kupovina u Maksiju' })).toHaveLength(1);
  });
  it('does not stretch short or unrelated words', () => {
    expect(findMerchant(memory, 'maksimalno 500')).toBeNull();
  });
});
