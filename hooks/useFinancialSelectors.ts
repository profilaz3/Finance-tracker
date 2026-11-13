import { useMemo } from 'react';
import { calculateAccountBalance, calculateTotalBalance, calculateTotalExpense, calculateTotalIncome } from '../utils/financialSelectors';
import { AppState } from '../types';
import { selectPeopleWithBalances } from '../domain/balances';

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

  // Person balances are derived from transactions + stored manual offsets.
  const peopleWithBalances = useMemo(
    () => selectPeopleWithBalances(state.people, state.transactions),
    [state.people, state.transactions]
  );

  /** Read-only state for views: people carry effective balances. Never persist it. */
  const viewState = useMemo<AppState>(
    () => (peopleWithBalances === state.people ? state : { ...state, people: peopleWithBalances }),
    [peopleWithBalances, state]
  );

  return {
    peopleWithBalances,
    viewState,
    totalBalance,
    totalExpense,
    totalIncome,
    getAccountBalance,
  };
}
