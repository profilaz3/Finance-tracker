import { describe, expect, it } from 'vitest';
import { AppState } from '../types';
import { sanitizeLoadedState } from '../utils/loadedStateSanitizer';

const createState = (): AppState => ({
  transactions: [
    {
      id: 'tx-1',
      date: '2026-04-05T00:00:00.000Z',
      amount: 42,
      currency: 'EUR',
      categoryId: 'cat-1',
      accountId: 'acc-1',
      type: 'expense',
      note: null as unknown as string | undefined,
      personId: null as unknown as string | undefined,
      receiptData: null as unknown as AppState['transactions'][number]['receiptData'],
      fees: null as unknown as number | undefined,
      eventId: null as unknown as string | undefined,
      splitDetails: {
        totalAmount: 42,
        myPortion: 21,
        splitMethod: 'equal',
        shares: [{ personId: 'p-1', amount: 21, percentage: null as unknown as number | undefined, isPaid: null as unknown as boolean | undefined }],
      },
    },
  ],
  categories: [{ id: 'cat-1', name: 'Food', type: 'expense', subcategories: [], color: '#000', icon: null as unknown as string | undefined }],
  accounts: [{ id: 'acc-1', name: 'Cash', type: 'cash', currency: 'EUR', color: '#111', icon: null as unknown as string | undefined, initialBalance: null as unknown as number | undefined, order: null as unknown as number | undefined }],
  people: [{ id: 'p-1', name: 'A', color: '#fff', defaultCurrency: 'EUR', balances: { EUR: 5 } as AppState['people'][number]['balances'], avatar: null as unknown as string | undefined }],
  userProfile: { id: 'me', name: 'Me', color: '#fff', defaultCurrency: 'EUR', balances: { EUR: 10 } as AppState['people'][number]['balances'], avatar: null as unknown as string | undefined },
  baseCurrency: 'EUR',
  rates: { base: 'EUR', date: '2026-04-05', rates: { EUR: 1, USD: 1.08, RSD: 117 } },
  templates: [{ id: 'tpl-1', name: 'T', currency: 'EUR', categoryId: 'cat-1', accountId: 'acc-1', type: 'expense', amount: null as unknown as number | undefined, note: null as unknown as string | undefined, subcategory: null as unknown as string | undefined, usageCount: 0, lastUsed: null as unknown as string | undefined }],
  recurringTransactions: [{ id: 'rec-1', name: 'Rent', amount: 100, currency: 'EUR', categoryId: 'cat-1', accountId: 'acc-1', type: 'expense', frequency: 'monthly', startDate: '2026-04-05', nextDue: '2026-04-05', isActive: true, note: null as unknown as string | undefined, subcategory: null as unknown as string | undefined, endDate: null as unknown as string | undefined, lastGenerated: null as unknown as string | undefined }],
  theme: 'neon',
  language: 'en',
  events: [{ id: 'evt-1', name: 'Trip', personIds: [], status: 'active', description: null as unknown as string | undefined, startDate: null as unknown as string | undefined, endDate: null as unknown as string | undefined, sharedEmails: null as unknown as string[] | undefined, icon: null as unknown as string | undefined, color: null as unknown as string | undefined, imageUrl: null as unknown as string | undefined, userId: null as unknown as string | undefined }],
  sharedExpenses: [{ id: 'se-1', eventId: 'evt-1', name: 'Lunch', amount: 10, currency: 'EUR', paidBy: 'p-1', sharedWith: ['p-1'], splitType: null as unknown as 'equal' | 'exact' | undefined, splitDetails: null as unknown as Record<string, number> | undefined, date: '2026-04-05', category: null as unknown as string | undefined }],
  isGuest: false,
});

describe('sanitizeLoadedState', () => {
  it('converts persisted null optionals into undefined values', () => {
    const sanitized = sanitizeLoadedState(createState());

    expect(sanitized.transactions[0].note).toBeUndefined();
    expect(sanitized.transactions[0].personId).toBeUndefined();
    expect(sanitized.transactions[0].receiptData).toBeUndefined();
    expect(sanitized.transactions[0].splitDetails?.shares[0].percentage).toBeUndefined();
    expect(sanitized.categories[0].icon).toBeUndefined();
    expect(sanitized.accounts[0].icon).toBeUndefined();
    expect(sanitized.people[0].avatar).toBeUndefined();
    expect(sanitized.people[0].balances).toEqual({ EUR: 5, USD: 0, RSD: 0 });
    expect(sanitized.userProfile?.avatar).toBeUndefined();
    expect(sanitized.userProfile?.balances).toEqual({ EUR: 10, USD: 0, RSD: 0 });
    expect(sanitized.templates[0].lastUsed).toBeUndefined();
    expect(sanitized.recurringTransactions[0].lastGenerated).toBeUndefined();
    expect(sanitized.events[0].description).toBeUndefined();
    expect(sanitized.sharedExpenses[0].category).toBeUndefined();
  });
});
