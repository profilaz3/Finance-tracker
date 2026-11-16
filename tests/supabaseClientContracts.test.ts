import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  mapAccountRow,
  mapEventRow,
  mapRecurringTransactionRow,
  mapSettingsRow,
  mapSharedExpenseRow,
  mapTransactionRow,
} from '../services/supabaseMappers';

describe('supabase client contracts', () => {
  it('reuses a global singleton client to avoid duplicate GoTrue instances during HMR', () => {
    const supabaseService = readFileSync('services/supabaseService.ts', 'utf8');

    expect(supabaseService).toContain('__financeSupabaseClient__');
    expect(supabaseService).toContain('globalThis as typeof globalThis');
  });
});

describe('supabase row mappers', () => {
  it('maps transaction snake_case columns to the transaction domain shape', () => {
    const row = {
      id: 'txn-1',
      date: '2026-05-01',
      amount: 42,
      currency: 'USD',
      category_id: 'cat-1',
      account_id: 'acct-1',
      person_id: 'person-1',
      subcategory: 'Coffee',
      note: 'Morning coffee',
      type: 'expense',
      receipt_data: {
        items: [{ name: 'Latte', price: 4.2, quantity: 1 }],
        total: 4.2,
        merchant: 'Cafe',
      },
      fees: 0.5,
      split_details: {
        totalAmount: 42,
        myPortion: 21,
        shares: [{ personId: 'person-1', amount: 21 }],
        splitMethod: 'equal',
      },
      event_id: 'event-1',
    };

    expect(mapTransactionRow(row)).toMatchObject({
      id: 'txn-1',
      categoryId: 'cat-1',
      accountId: 'acct-1',
      personId: 'person-1',
      receiptData: row.receipt_data,
      splitDetails: row.split_details,
      eventId: 'event-1',
    });
  });

  it('maps account snake_case columns to the account domain shape', () => {
    expect(mapAccountRow({
      id: 'acct-1',
      name: 'Checking',
      type: 'bank',
      currency: 'EUR',
      color: '#123456',
      initial_balance: 100,
      icon: 'Wallet',
      order_index: 2,
    })).toMatchObject({
      id: 'acct-1',
      initialBalance: 100,
      order: 2,
    });
  });

  it('maps event snake_case columns to the event domain shape', () => {
    expect(mapEventRow({
      id: 'event-1',
      user_id: 'owner-1',
      name: 'Trip',
      description: 'Weekend',
      start_date: '2026-05-10',
      end_date: '2026-05-12',
      person_ids: ['person-1'],
      shared_emails: ['friend@example.com'],
      icon: 'Plane',
      color: '#abcdef',
      image_url: 'https://example.com/photo.jpg',
      status: 'active',
    })).toMatchObject({
      id: 'event-1',
      userId: 'owner-1',
      startDate: '2026-05-10',
      endDate: '2026-05-12',
      personIds: ['person-1'],
      sharedEmails: ['friend@example.com'],
      imageUrl: 'https://example.com/photo.jpg',
    });
  });

  it('maps shared expense snake_case columns to the shared expense domain shape', () => {
    expect(mapSharedExpenseRow({
      id: 'shared-1',
      event_id: 'event-1',
      name: 'Dinner',
      amount: 120,
      currency: 'RSD',
      paid_by: 'person-1',
      shared_with: ['person-1', 'person-2'],
      date: '2026-05-11',
      split_type: 'exact',
      split_details: { 'person-1': 60, 'person-2': 60 },
      category: 'Food',
    })).toMatchObject({
      id: 'shared-1',
      eventId: 'event-1',
      paidBy: 'person-1',
      sharedWith: ['person-1', 'person-2'],
      splitType: 'exact',
      splitDetails: { 'person-1': 60, 'person-2': 60 },
      category: 'Food',
    });
  });

  it('maps recurring transaction snake_case columns to the recurring domain shape', () => {
    expect(mapRecurringTransactionRow({
      id: 'recurring-1',
      name: 'Rent',
      amount: 900,
      currency: 'USD',
      category_id: 'cat-1',
      account_id: 'acct-1',
      type: 'expense',
      note: 'Monthly rent',
      subcategory: 'Housing',
      frequency: 'monthly',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      last_generated: '2026-05-01',
      next_due: '2026-06-01',
      is_active: true,
    })).toEqual({
      id: 'recurring-1',
      name: 'Rent',
      amount: 900,
      currency: 'USD',
      categoryId: 'cat-1',
      accountId: 'acct-1',
      type: 'expense',
      note: 'Monthly rent',
      subcategory: 'Housing',
      frequency: 'monthly',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      lastGenerated: '2026-05-01',
      nextDue: '2026-06-01',
      isActive: true,
    });
  });

  it('maps settings rows to app preferences and user profile defaults', () => {
    expect(mapSettingsRow({
      base_currency: 'EUR',
      theme: 'harbor',
      language: 'sr',
      user_profile: {
        id: 'profile-1',
        name: 'Owner',
        avatar: 'avatar.png',
        color: '#000000',
        defaultCurrency: 'EUR',
        balances: { EUR: 10, USD: 0, RSD: 0 },
      },
    }, 'user-1')).toEqual({
      baseCurrency: 'EUR',
      language: 'sr',
      userProfile: {
        id: 'profile-1',
        name: 'Owner',
        avatar: 'avatar.png',
        color: '#000000',
        defaultCurrency: 'EUR',
        balances: { EUR: 10, USD: 0, RSD: 0 },
      },
    });
  });

  it('keeps app defaults when a settings row has not been created yet', () => {
    expect(mapSettingsRow(null, 'user-1')).toEqual({
      baseCurrency: 'RSD',
      language: 'en',
      userProfile: undefined,
    });
  });

  it('ignores the retired settings.theme column', () => {
    const mapped = mapSettingsRow({ theme: 'oled' }, 'user-1');
    expect(mapped).not.toHaveProperty('theme');
    expect(mapped).toMatchObject({ baseCurrency: 'RSD', language: 'en' });
  });
});
