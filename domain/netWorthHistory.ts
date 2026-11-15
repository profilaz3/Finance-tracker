import type { AppState } from '../types';
import { calculateTotalBalance } from '../utils/financialSelectors';
import { parseLocalDate, type MonthKey } from './home';

type NetWorthInputs = Pick<AppState, 'transactions' | 'accounts' | 'baseCurrency' | 'rates'>;

/**
 * Net worth at the end of a month: every wallet's opening balance plus all entries dated on or
 * before the month's last day, converted like the live total (today's rates). Entries without a
 * readable date are left out. Wallets added later still count their opening balance, the same as
 * the live total does.
 */
export function netWorthAtMonthEnd(state: NetWorthInputs, key: MonthKey): number {
  const nextMonth = new Date(key.year, key.month + 1, 1).getTime();
  const transactions = state.transactions.filter(transaction => {
    const time = parseLocalDate(transaction.date).getTime();
    return !Number.isNaN(time) && time < nextMonth;
  });
  const total = calculateTotalBalance({ ...state, transactions } as AppState);
  return Math.round(total * 100) / 100;
}
