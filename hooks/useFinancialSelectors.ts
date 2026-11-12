import { useMemo } from 'react';
import { calculateAccountBalance, calculateTotalBalance, calculateTotalExpense, calculateTotalIncome } from '../utils/financialSelectors';
import { AppState } from '../types';

export function useFinancialSelectors(state: AppState) {
  const totalBalance = useMemo(
    () => calculateTotalBalance(state),
    [state]
  );

  const totalExpense = useMemo(
    () => calculateTotalExpense(state),
    [state]
  );

  const totalIncome = useMemo(
    () => calculateTotalIncome(state),
    [state]
  );

  const getAccountBalance = (account: AppState['accounts'][number]) =>
    calculateAccountBalance(state, account);

  return {
    totalBalance,
    totalExpense,
    totalIncome,
    getAccountBalance,
  };
}
