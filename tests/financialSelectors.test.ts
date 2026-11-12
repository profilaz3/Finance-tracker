import { describe, expect, it } from 'vitest';
import {
  calculateAccountBalance,
  calculateTotalBalance,
  calculateTotalExpense,
  calculateTotalIncome,
} from '../utils/financialSelectors';
import type { Account, AppState } from '../types';

const baseState: AppState = {
  transactions: [
    {
      id: 'tx-income',
      date: '2026-04-05T10:00:00.000Z',
      amount: 100,
      currency: 'EUR',
      categoryId: 'salary',
      accountId: 'acc-eur',
      type: 'income',
    },
    {
      id: 'tx-expense',
      date: '2026-04-05T11:00:00.000Z',
      amount: 40,
      currency: 'EUR',
      categoryId: 'food',
      accountId: 'acc-eur',
      type: 'expense',
      fees: 2,
    },
    {
      id: 'tx-split',
      date: '2026-04-05T12:00:00.000Z',
      amount: 60,
      currency: 'EUR',
      categoryId: 'trip',
      accountId: 'acc-eur',
      type: 'expense',
      splitDetails: {
        totalAmount: 60,
        myPortion: 20,
        splitMethod: 'equal',
        shares: [{ personId: 'person-1', amount: 40 }],
      },
    },
    {
      id: 'tx-transfer',
      date: '2026-04-05T13:00:00.000Z',
      amount: 10,
      currency: 'EUR',
      categoryId: 'internal-transfer',
      accountId: 'acc-eur',
      type: 'income',
    },
  ],
  accounts: [
    { id: 'acc-eur', name: 'Cash', type: 'cash', currency: 'EUR', color: '#111', initialBalance: 50 },
    { id: 'acc-usd', name: 'Dollar', type: 'bank', currency: 'USD', color: '#222', initialBalance: 10 },
  ],
  categories: [],
  people: [],
  events: [],
  sharedExpenses: [],
  templates: [],
  recurringTransactions: [],
  rates: {
    base: 'EUR',
    date: '2026-04-05',
    rates: { EUR: 1, USD: 2, RSD: 100 },
  },
  baseCurrency: 'EUR',
  theme: 'graphite',
  language: 'en',
};

describe('financial selectors', () => {
  it('calculates top-level totals with split expenses, fees, and transfers handled correctly', () => {
    expect(calculateTotalBalance(baseState)).toBe(64);
    expect(calculateTotalExpense(baseState)).toBe(61);
    expect(calculateTotalIncome(baseState)).toBe(100);
  });

  it('calculates account balances in the account currency', () => {
    const eurAccount = baseState.accounts[0];
    const usdAccount: Account = {
      id: 'acc-usd-live',
      name: 'Travel Card',
      type: 'bank',
      currency: 'USD',
      color: '#333',
      initialBalance: 5,
    };

    const stateWithUsdTx: AppState = {
      ...baseState,
      accounts: [...baseState.accounts, usdAccount],
      transactions: [
        ...baseState.transactions,
        {
          id: 'tx-usd-income',
          date: '2026-04-05T14:00:00.000Z',
          amount: 20,
          currency: 'EUR',
          categoryId: 'bonus',
          accountId: 'acc-usd-live',
          type: 'income',
          fees: 1,
        },
      ],
    };

    expect(calculateAccountBalance(baseState, eurAccount)).toBe(59);
    expect(calculateAccountBalance(stateWithUsdTx, usdAccount)).toBe(44);
  });
});
