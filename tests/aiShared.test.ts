import { describe, expect, it } from 'vitest';
import {
  extractJsonObject,
  validateParsedReceipt,
  validateParsedTransaction,
} from '../utils/aiShared';

describe('extractJsonObject', () => {
  it('returns the parsed object when JSON is wrapped in extra text', () => {
    const parsed = extractJsonObject('Sure, here you go: {"amount":20,"currency":"EUR"}');

    expect(parsed).toEqual({ amount: 20, currency: 'EUR' });
  });

  it('returns null when no JSON object exists', () => {
    expect(extractJsonObject('no structured data')).toBeNull();
  });
});

describe('validateParsedTransaction', () => {
  it('accepts a valid parsed transaction payload', () => {
    const parsed = validateParsedTransaction({
      amount: 20,
      currency: 'EUR',
      categoryName: 'Food',
      type: 'expense',
      note: 'Lunch',
      date: '2026-04-05',
      accountName: 'Cash',
      fees: 0.5,
    });

    expect(parsed).toEqual({
      amount: 20,
      currency: 'EUR',
      categoryName: 'Food',
      type: 'expense',
      note: 'Lunch',
      date: '2026-04-05',
      accountName: 'Cash',
      fees: 0.5,
    });
  });

  it('rejects an invalid currency', () => {
    expect(
      validateParsedTransaction({
        amount: 20,
        currency: 'GBP',
        categoryName: 'Food',
        type: 'expense',
        note: 'Lunch',
        date: '2026-04-05',
      }),
    ).toBeNull();
  });
});

describe('validateParsedReceipt', () => {
  it('normalizes receipt items and keeps receipt totals', () => {
    const parsed = validateParsedReceipt({
      amount: 12.5,
      currency: 'USD',
      categoryName: 'Groceries',
      note: 'Store',
      date: '2026-04-05',
      receiptData: {
        total: 12.5,
        merchant: 'Store',
        items: [
          { name: 'Apple', price: 2.5, quantity: 2 },
          { name: 'Bread' },
        ],
      },
    });

    expect(parsed).toEqual({
      amount: 12.5,
      currency: 'USD',
      categoryName: 'Groceries',
      type: 'expense',
      note: 'Store',
      date: '2026-04-05',
      receiptData: {
        total: 12.5,
        merchant: 'Store',
        items: [
          { name: 'Apple', price: 2.5, quantity: 2 },
          { name: 'Bread', price: 0, quantity: 1 },
        ],
      },
    });
  });

  it('rejects malformed receipt payloads', () => {
    expect(
      validateParsedReceipt({
        amount: 12.5,
        currency: 'USD',
        categoryName: 'Groceries',
        note: 'Store',
        date: '2026-04-05',
      }),
    ).toBeNull();
  });
});
