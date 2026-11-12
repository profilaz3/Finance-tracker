import { describe, expect, it } from 'vitest';
import {
  createLinkedExpenseDraft,
  createRepeatTransactionDraft,
  createTransactionDraft,
  duplicateTransactionDraft,
} from '../domain/transactions';
import { INITIAL_CATEGORIES } from '../constants';
import { Transaction } from '../types';

describe('transaction domain helpers', () => {
  it('creates a default transaction draft with repayment categories for person-linked flows', () => {
    const draft = createTransactionDraft({
      createId: () => 'tx-new',
      nowIso: '2026-04-05T10:00:00.000Z',
      baseCurrency: 'RSD',
      accountId: 'acc1',
      type: 'income',
      personId: 'person-1',
    });

    expect(draft).toMatchObject({
      id: 'tx-new',
      date: '2026-04-05T10:00:00.000Z',
      amount: 0,
      currency: 'RSD',
      accountId: 'acc1',
      type: 'income',
      categoryId: 'debt-repayment',
      personId: 'person-1',
      note: '',
    });
  });

  it('creates a linked expense draft using the first expense category and active event when available', () => {
    const draft = createLinkedExpenseDraft({
      createId: () => 'tx-dashboard',
      nowIso: '2026-04-05T11:00:00.000Z',
      baseCurrency: 'EUR',
      accountId: 'acc-primary',
      categories: INITIAL_CATEGORIES,
      eventId: 'event-1',
    });

    expect(draft).toMatchObject({
      id: 'tx-dashboard',
      date: '2026-04-05T11:00:00.000Z',
      amount: 0,
      currency: 'EUR',
      accountId: 'acc-primary',
      type: 'expense',
      categoryId: 'c1',
      eventId: 'event-1',
      note: '',
    });
  });

  it('duplicates a transaction into a fresh draft and clears split details', () => {
    const original: Transaction = {
      id: 'tx-old',
      date: '2026-04-01T09:00:00.000Z',
      amount: 120,
      currency: 'USD',
      categoryId: 'c1',
      accountId: 'acc1',
      type: 'expense',
      note: 'Lunch',
      splitDetails: {
        totalAmount: 120,
        myPortion: 40,
        shares: [{ personId: 'person-1', amount: 80 }],
        splitMethod: 'exact',
      },
    };

    const duplicated = duplicateTransactionDraft(original, {
      createId: () => 'tx-copy',
      nowIso: '2026-04-05T12:00:00.000Z',
    });

    expect(duplicated).toMatchObject({
      id: 'tx-copy',
      date: '2026-04-05T12:00:00.000Z',
      amount: 120,
      currency: 'USD',
      categoryId: 'c1',
      accountId: 'acc1',
      type: 'expense',
      note: 'Lunch',
    });
    expect(duplicated.splitDetails).toBeUndefined();
  });

  it('creates a repeat draft with only safe practical transaction fields', () => {
    const draft = createRepeatTransactionDraft({
      id: 'source',
      date: '2026-05-01T08:00:00.000Z',
      amount: 1250,
      currency: 'RSD',
      categoryId: 'food',
      accountId: 'cash',
      type: 'expense',
      note: 'Lunch',
      subcategory: 'Restaurants',
      personId: 'person-1',
      eventId: 'event-1',
      fees: 4,
      receiptData: {
        merchant: 'Cafe',
        total: 1250,
        items: [{ name: 'Lunch', price: 1250, quantity: 1 }],
      },
      splitDetails: {
        totalAmount: 1250,
        myPortion: 625,
        shares: [{ personId: 'person-1', amount: 625 }],
        splitMethod: 'equal',
      },
    }, {
      createId: () => 'repeat-id',
      nowIso: '2026-05-11T12:00:00.000Z',
    });

    expect(draft).toEqual({
      id: 'repeat-id',
      date: '2026-05-11T12:00:00.000Z',
      amount: 1250,
      currency: 'RSD',
      categoryId: 'food',
      accountId: 'cash',
      type: 'expense',
      note: 'Lunch',
      subcategory: 'Restaurants',
    });
  });
});
