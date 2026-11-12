import { describe, expect, it } from 'vitest';
import {
  calculateDashboardDebtSummary,
  getActiveDashboardPeople,
  getDashboardWalletSummaries,
} from '../utils/dashboardSummarySelectors';
import type { Account, Currency, Person } from '../types';

const accounts: Account[] = [
  { id: 'bank', name: 'Bank', type: 'bank', currency: 'EUR', color: '#111', order: 2 },
  { id: 'cash', name: 'Cash', type: 'cash', currency: 'EUR', color: '#222', order: 1 },
  { id: 'travel', name: 'Travel', type: 'digital', currency: 'USD', color: '#333' },
];

const people: Person[] = [
  {
    id: 'ana',
    name: 'Ana',
    color: '#111',
    defaultCurrency: 'EUR',
    balances: { EUR: 20, USD: -5, RSD: 0 },
  },
  {
    id: 'boris',
    name: 'Boris',
    color: '#222',
    defaultCurrency: 'EUR',
    balances: { EUR: -10, USD: 0, RSD: 240 },
  },
  {
    id: 'cora',
    name: 'Cora',
    color: '#333',
    defaultCurrency: 'EUR',
    balances: { EUR: 0, USD: 0, RSD: 0 },
  },
];

describe('dashboard summary selectors', () => {
  it('builds ordered wallet summaries with computed balances', () => {
    const balances: Record<string, number> = { bank: 300, cash: 120, travel: 80 };

    expect(
      getDashboardWalletSummaries(accounts, account => balances[account.id] ?? 0),
    ).toEqual([
      { account: accounts[1], balance: 120 },
      { account: accounts[0], balance: 300 },
      { account: accounts[2], balance: 80 },
    ]);
  });

  it('filters people down to active dashboard balances only', () => {
    expect(getActiveDashboardPeople(people)).toEqual([people[0], people[1]]);
  });

  it('calculates owed-to-me and i-owe totals in the base currency', () => {
    expect(
      calculateDashboardDebtSummary({
        people,
        baseCurrency: 'EUR',
        rates: { EUR: 1, USD: 2, RSD: 120 } satisfies Record<Currency, number>,
      }),
    ).toEqual({
      totalOwedToMe: 22,
      totalIOwe: 12.5,
    });
  });
});
