import { convertAmount } from '../services/currencyService';
import { Account, AppState } from '../types';
import { getCountedExpenseAmount, getCountedIncomeAmount } from '../domain/money';

export const calculateTotalBalance = (state: AppState): number => {
  const transactionSum = Array.isArray(state.transactions)
    ? state.transactions.reduce((accumulator, transaction) => {
        const amount = convertAmount(transaction.amount, transaction.currency, state.baseCurrency, state.rates);
        const fees = transaction.fees ? convertAmount(transaction.fees, 'USD', state.baseCurrency, state.rates) : 0;
        return transaction.type === 'income' ? accumulator + amount - fees : accumulator - amount - fees;
      }, 0)
    : 0;

  const accountSum = Array.isArray(state.accounts)
    ? state.accounts.reduce((accumulator, account) => (
        accumulator + convertAmount(account.initialBalance || 0, account.currency, state.baseCurrency, state.rates)
      ), 0)
    : 0;

  return transactionSum + accountSum;
};

/**
 * My own spending: split expenses count only my principal, fees count once
 * (my share for splits, the outgoing leg for transfers), and transfers and
 * debt repayments are excluded.
 */
export const calculateTotalExpense = (state: AppState): number => {
  if (!Array.isArray(state.transactions)) {
    return 0;
  }

  return state.transactions.reduce(
    (accumulator, transaction) => accumulator + getCountedExpenseAmount(transaction, state.baseCurrency, state.rates),
    0,
  );
};

/** Earned income: excludes transfers, debt repayments and reimbursements. */
export const calculateTotalIncome = (state: AppState): number => {
  if (!Array.isArray(state.transactions)) {
    return 0;
  }

  return state.transactions.reduce(
    (accumulator, transaction) => accumulator + getCountedIncomeAmount(transaction, state.baseCurrency, state.rates),
    0,
  );
};

export const calculateAccountBalance = (state: AppState, account: Account): number => {
  const transactionSum = Array.isArray(state.transactions)
    ? state.transactions
        .filter(transaction => transaction.accountId === account.id)
        .reduce((accumulator, transaction) => {
          const amount = convertAmount(transaction.amount, transaction.currency, account.currency, state.rates);
          const fees = transaction.fees ? convertAmount(transaction.fees, 'USD', account.currency, state.rates) : 0;
          return transaction.type === 'income' ? accumulator + amount - fees : accumulator - amount - fees;
        }, 0)
    : 0;

  return Math.round(((account.initialBalance || 0) + transactionSum) * 100) / 100;
};
