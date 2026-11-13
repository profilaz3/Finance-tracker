import { describe, expect, it } from 'vitest';
import type { AppState } from '../types';
import { buildSettingsSyncPayload } from '../utils/settingsSync';

const baseState: AppState = {
  transactions: [],
  categories: [
    {
      id: 'cat-1',
      name: 'Food',
      icon: 'UtensilsCrossed',
      color: '#22c55e',
      type: 'expense',
      subcategories: [],
    },
  ],
  accounts: [],
  people: [],
  userProfile: {
    id: 'profile-1',
    name: 'Alex',
    color: '#3b82f6',
    defaultCurrency: 'EUR',
    balances: { EUR: 0, USD: 0, RSD: 0 },
  },
  baseCurrency: 'EUR',
  rates: {
    base: 'EUR',
    date: '2026-04-05',
    rates: { EUR: 1, USD: 1.08, RSD: 117 },
  },
  templates: [],
  recurringTransactions: [],
  theme: 'harbor',
  language: 'en',
  events: [],
  sharedExpenses: [],
  isGuest: false,
};

describe('buildSettingsSyncPayload', () => {
  it('includes only settings fields and omits categories', () => {
    const payload = buildSettingsSyncPayload(baseState);

    expect(payload).toEqual({
      baseCurrency: 'EUR',
      theme: 'harbor',
      language: 'en',
      userProfile: baseState.userProfile,
      prefs: { appearance: undefined, homeLayout: undefined, budget: null, payment: null },
    });
    expect(payload).not.toHaveProperty('categories');
  });

  it('keeps userProfile optional', () => {
    const payload = buildSettingsSyncPayload({
      ...baseState,
      userProfile: undefined,
    });

    expect(payload).toEqual({
      baseCurrency: 'EUR',
      theme: 'harbor',
      language: 'en',
      userProfile: undefined,
      prefs: { appearance: undefined, homeLayout: undefined, budget: null, payment: null },
    });
  });
});
