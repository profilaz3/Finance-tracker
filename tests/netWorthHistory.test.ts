import { describe, expect, it } from 'vitest';
import { netWorthAtMonthEnd } from '../domain/netWorthHistory';
import { calculateTotalBalance } from '../utils/financialSelectors';
import type { Account, AppState, ExchangeRates, Transaction } from '../types';

const rates: ExchangeRates = { base: 'EUR', date: '2026-11-01', rates: { EUR: 1, USD: 1.1, RSD: 117 } };
const accounts = [
  { id: 'a', name: 'Cash', currency: 'EUR', initialBalance: 1000 },
  { id: 'b', name: 'Card', currency: 'RSD', initialBalance: 11700 },
] as Account[];

const tx = (id: string, date: string, amount: number, type: Transaction['type'] = 'expense', currency: Transaction['currency'] = 'EUR'): Transaction => ({
  id, date, amount, currency, categoryId: 'c', accountId: 'a', type,
});

const transactions: Transaction[] = [
  tx('1', '2026-09-15', 200, 'income'),
  tx('2', '2026-09-30T23:30:00', 50),
  tx('3', '2026-10-01', 100),
  tx('4', '2026-10-31', 2340, 'expense', 'RSD'),
  tx('5', '2026-11-05', 300, 'income'),
  tx('6', 'not a date', 999),
];

const state = { transactions, accounts, baseCurrency: 'EUR', rates } as Pick<AppState, 'transactions' | 'accounts' | 'baseCurrency' | 'rates'>;

describe('netWorthAtMonthEnd', () => {
  it('counts opening balances and entries up to the last day of the month', () => {
    // 1000 + 100 (11700 RSD) + 200 - 50
    expect(netWorthAtMonthEnd(state, { year: 2026, month: 8 })).toBe(1250);
    // ... - 100 - 20 (2340 RSD)
    expect(netWorthAtMonthEnd(state, { year: 2026, month: 9 })).toBe(1130);
  });

  it('is the opening balance before any entry', () => {
    expect(netWorthAtMonthEnd(state, { year: 2025, month: 11 })).toBe(1100);
  });

  it('matches the live total once every dated entry is included', () => {
    const dated = { ...state, transactions: transactions.filter(t => t.id !== '6') };
    expect(netWorthAtMonthEnd(dated, { year: 2026, month: 11 })).toBeCloseTo(calculateTotalBalance(dated as AppState), 2);
  });
});
